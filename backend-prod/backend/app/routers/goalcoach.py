"""
Goal Coach API Endpoints
Provides coaching insights and goal simulation
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from datetime import datetime, date, timedelta
from app.routers.auth import get_current_user, UserDep
from app.database.postgresql import SessionLocal
from sqlalchemy import text
from pydantic import BaseModel
import uuid

router = APIRouter()


class SimulateGoalRequest(BaseModel):
    goal_id: str
    monthly_contribution: float
    as_of_date: Optional[str] = None  # YYYY-MM-DD format


@router.get("/coach")
async def get_goal_coach(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Goal Coach - Provides insights, tips, and quick actions for goals.
    Looks at budget allocations and goal progress to provide recommendations.
    """
    session = SessionLocal()
    user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
    try:
        # Default to current month
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        # Get goal progress for the month (join with goals table to get goal_name)
        goals = session.execute(text("""
            SELECT 
                gs.goal_id, g.goal_name, gs.remaining_amount, gs.months_remaining,
                gs.suggested_monthly_need, gs.on_track_flag, gs.risk_level
            FROM goalcompass.goal_compass_snapshot gs
            JOIN goal.user_goals_master g ON g.goal_id = gs.goal_id
            WHERE gs.user_id = :user_id AND gs.month = :month
            ORDER BY gs.risk_level DESC, gs.remaining_amount DESC
        """), {
            "user_id": str(user_uuid),
            "month": month
        }).mappings().all()
        
        if not goals:
            return {
                "month": month,
                "summary": "No active goals found for this month. Create goals to get personalized coaching.",
                "tips": [],
                "quick_actions": []
            }
        
        # Get budget allocations for the month
        allocations = session.execute(text("""
            SELECT 
                ga.goal_id, ga.planned_amount, gs.suggested_monthly_need
            FROM budgetpilot.user_budget_commit_goal_alloc ga
            LEFT JOIN goalcompass.goal_compass_snapshot gs 
                ON gs.user_id = ga.user_id 
                AND gs.goal_id = ga.goal_id 
                AND gs.month = ga.month
            WHERE ga.user_id = :user_id AND ga.month = :month
        """), {
            "user_id": str(user_uuid),
            "month": month
        }).mappings().all()
        
        alloc_map = {a["goal_id"]: {"planned": float(a["planned_amount"] or 0), "suggested": float(a["suggested_monthly_need"] or 0)} for a in allocations}
        
        # Analyze goals and generate insights
        high_risk_goals = [g for g in goals if g["risk_level"] == "high"]
        off_track_goals = [g for g in goals if not g["on_track_flag"]]
        
        # Generate summary
        total_goals = len(goals)
        on_track_count = sum(1 for g in goals if g["on_track_flag"])
        
        if total_goals == 0:
            summary = "No active goals found."
        elif on_track_count == total_goals:
            summary = f"Excellent! All {total_goals} goal(s) are on track. Keep up the consistent contributions."
        elif high_risk_goals:
            summary = f"You have {len(high_risk_goals)} high-risk goal(s) that need attention. Consider increasing monthly contributions or adjusting target dates."
        else:
            summary = f"You're making progress on {on_track_count} of {total_goals} goal(s). Small adjustments can help get the rest on track."
        
        # Generate tips
        tips = []
        if high_risk_goals:
            tips.append(f"Focus on {high_risk_goals[0]['goal_name']} - it's at high risk and needs immediate attention.")
        
        if off_track_goals:
            shortfall_count = len(off_track_goals)
            tips.append(f"{shortfall_count} goal(s) are behind schedule. Review your monthly allocations in BudgetPilot.")
        
        total_remaining = sum(float(g["remaining_amount"] or 0) for g in goals)
        if total_remaining > 0:
            avg_monthly = sum(float(g["suggested_monthly_need"] or 0) for g in goals) / len(goals)
            tips.append(f"Average monthly need across all goals: ₹{avg_monthly:,.0f}. Ensure your budget allocations match.")
        
        if not tips:
            tips.append("Your goals are well-balanced. Continue with your current plan.")
        
        # Generate quick actions (recommendations to boost specific goals)
        quick_actions = []
        for goal in high_risk_goals[:3]:  # Top 3 high-risk goals
            goal_id = goal["goal_id"]
            goal_name = goal["goal_name"]
            suggested = float(goal["suggested_monthly_need"] or 0)
            planned = alloc_map.get(goal_id, {}).get("planned", 0)
            
            if suggested > planned:
                recommended_extra = suggested - planned
                if recommended_extra > 100:  # Only suggest if meaningful amount
                    quick_actions.append({
                        "type": "increase_contribution",
                        "goal_id": goal_id,
                        "goal_name": goal_name,
                        "month": month,
                        "recommended_extra": round(recommended_extra, 2)
                    })
        
        return {
            "month": month,
            "summary": summary,
            "tips": tips,
            "quick_actions": quick_actions
        }
    except Exception as e:
        print(f"⚠️  Error getting goal coach: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get goal coach insights: {str(e)}")
    finally:
        session.close()


@router.post("/simulate")
async def simulate_goal(
    payload: SimulateGoalRequest,
    user: UserDep = Depends(get_current_user)
):
    """
    Simulate goal completion with a different monthly contribution.
    Returns projected completion date and time saved.
    """
    session = SessionLocal()
    user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
    try:
        # Validate goal exists and belongs to user
        goal = session.execute(text("""
            SELECT 
                g.goal_id, g.goal_name, g.estimated_cost, g.target_date, g.current_savings
            FROM goal.user_goals_master g
            WHERE g.user_id = :user_id AND g.goal_id = :goal_id AND g.status = 'active'
        """), {
            "user_id": str(user_uuid),
            "goal_id": payload.goal_id
        }).mappings().first()
        
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        
        # Get current progress
        as_of_date = payload.as_of_date or datetime.utcnow().date().isoformat()
        month = f"{datetime.utcnow().year}-{datetime.utcnow().month:02d}-01"
        
        current_snapshot = session.execute(text("""
            SELECT 
                remaining_amount, months_remaining, suggested_monthly_need
            FROM goalcompass.goal_compass_snapshot
            WHERE user_id = :user_id AND goal_id = :goal_id AND month = :month
        """), {
            "user_id": str(user_uuid),
            "goal_id": payload.goal_id,
            "month": month
        }).mappings().first()
        
        if not current_snapshot:
            # Calculate from goal directly if no snapshot
            estimated_cost = float(goal["estimated_cost"] or 0)
            current_savings = float(goal["current_savings"] or 0)
            remaining = max(0, estimated_cost - current_savings)
            months_remaining = None
            if goal["target_date"]:
                target = datetime.strptime(str(goal["target_date"]), "%Y-%m-%d").date()
                as_of = datetime.strptime(as_of_date, "%Y-%m-%d").date()
                months_remaining = max(0, int((target - as_of).days / 30))
        else:
            remaining = float(current_snapshot["remaining_amount"] or 0)
            months_remaining = current_snapshot["months_remaining"]
        
        # Simulate with new monthly contribution
        monthly_contrib = float(payload.monthly_contribution)
        if monthly_contrib <= 0:
            raise HTTPException(status_code=400, detail="Monthly contribution must be greater than 0")
        
        if remaining <= 0:
            # Goal already funded
            return {
                "goal_id": payload.goal_id,
                "goal_name": goal["goal_name"],
                "remaining_amount": 0,
                "current_months_remaining": 0,
                "simulated_months_remaining": 0,
                "acceleration_months": 0,
                "simulated_target_date": None,
                "suggested_monthly_need": 0,
                "monthly_contribution": monthly_contrib
            }
        
        # Calculate simulated months to completion
        simulated_months = max(1, int(remaining / monthly_contrib))
        
        # Calculate new target date
        as_of = datetime.strptime(as_of_date, "%Y-%m-%d").date()
        simulated_target_date = (as_of + timedelta(days=simulated_months * 30)).isoformat()
        
        # Calculate acceleration (time saved)
        acceleration_months = None
        if months_remaining is not None:
            acceleration_months = max(0, months_remaining - simulated_months)
        
        return {
            "goal_id": payload.goal_id,
            "goal_name": goal["goal_name"],
            "remaining_amount": round(remaining, 2),
            "current_months_remaining": months_remaining,
            "simulated_months_remaining": simulated_months,
            "acceleration_months": acceleration_months,
            "simulated_target_date": simulated_target_date,
            "suggested_monthly_need": float(current_snapshot["suggested_monthly_need"] or 0) if current_snapshot else 0,
            "monthly_contribution": monthly_contrib
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"⚠️  Error simulating goal: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to simulate goal: {str(e)}")
    finally:
        session.close()

