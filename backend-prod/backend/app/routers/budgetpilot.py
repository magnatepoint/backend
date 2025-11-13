"""
BudgetPilot API Endpoints
Smart budgeting and financial planning engine
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.routers.auth import get_current_user, UserDep
from app.database.postgresql import SessionLocal
from sqlalchemy import text
from pydantic import BaseModel
import uuid

router = APIRouter()


class CommitRequest(BaseModel):
    month: str  # YYYY-MM-01 format
    plan_code: str
    notes: Optional[str] = None


@router.post("/generate-recommendations")
async def generate_recommendations(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Generate budget recommendations for the user
    This runs section 4 of the BudgetPilot SQL migration (Suggestion Engine)
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Default to current month if not provided
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        # Run the suggestion engine SQL (simplified version)
        # This triggers section 4 from the migration
        generate_query = text("""
            -- Simplified recommendation generation
            WITH m AS (
                SELECT date_trunc('month', CAST(:month AS DATE)) AS month
            ),
            actual AS (
                SELECT v.user_id,
                       date_trunc('month', v.txn_date) AS month,
                       SUM(CASE WHEN txn_type='income' AND direction='credit' THEN amount ELSE 0 END) AS income_amt,
                       SUM(CASE WHEN txn_type='wants' AND direction='debit' THEN amount ELSE 0 END) AS wants_amt,
                       SUM(CASE WHEN txn_type='assets' AND direction='debit' THEN amount ELSE 0 END) AS assets_amt
                FROM spendsense.vw_txn_effective v
                WHERE date_trunc('month', v.txn_date) = (SELECT month FROM m)
                  AND v.user_id = CAST(:user_id AS uuid)
                GROUP BY v.user_id, date_trunc('month', v.txn_date)
            ),
            ratios AS (
                SELECT 
                    COALESCE(a.user_id, CAST(:user_id AS uuid)) AS user_id,
                    COALESCE(a.month, CAST(:month AS DATE)) AS month,
                    COALESCE(a.income_amt, 0) AS income_amt,
                    CASE WHEN COALESCE(a.income_amt, 0) > 0 THEN a.wants_amt / a.income_amt ELSE NULL END AS wants_share,
                    CASE WHEN COALESCE(a.income_amt, 0) > 0 THEN a.assets_amt / a.income_amt ELSE NULL END AS assets_share
                FROM actual a
                UNION ALL
                SELECT 
                    CAST(:user_id AS uuid) AS user_id,
                    CAST(:month AS DATE) AS month,
                    0 AS income_amt,
                    NULL AS wants_share,
                    NULL AS assets_share
                WHERE NOT EXISTS (SELECT 1 FROM actual)
            ),
            emergency_goal AS (
                SELECT g.user_id,
                       MAX(CASE WHEN LOWER(g.goal_category) = 'emergency' THEN 1 ELSE 0 END) AS has_emergency,
                       SUM(CASE WHEN LOWER(g.goal_category) = 'emergency' THEN GREATEST(0, g.estimated_cost - g.current_savings) ELSE 0 END) AS emergency_gap
                FROM goal.user_goals_master g
                WHERE g.status='active'
                  AND g.user_id = CAST(:user_id AS uuid)
                GROUP BY g.user_id
            ),
            scores AS (
                SELECT r.user_id, r.month, bpm.plan_code,
                       bpm.base_needs_pct, bpm.base_wants_pct, bpm.base_assets_pct,
                       COALESCE(r.wants_share, 0.30) AS wants_share,
                       COALESCE(r.assets_share, 0.10) AS assets_share,
                       COALESCE(eg.has_emergency, 0) AS has_emergency,
                       COALESCE(eg.emergency_gap, 0) AS emergency_gap,
                       (
                          0.40 * (1 - ABS(bpm.base_wants_pct - COALESCE(r.wants_share, 0.30)))
                       + 0.30 * (CASE WHEN (COALESCE(r.assets_share,0.10) < 0.15 OR COALESCE(eg.emergency_gap,0) > 0)
                                      THEN (bpm.base_assets_pct) ELSE 0.0 END)
                       + 0.15 * (CASE WHEN bpm.plan_code = 'BAL_50_30_20' THEN 1 ELSE 0 END)
                       + 0.15 * (CASE WHEN bpm.plan_code = 'EMERGENCY_FIRST' AND COALESCE(eg.emergency_gap,0) > 0 THEN 1 ELSE 0 END)
                       )::numeric(8,3) AS score
                FROM (SELECT DISTINCT user_id, month, wants_share, assets_share FROM ratios) r
                CROSS JOIN budgetpilot.budget_plan_master bpm
                LEFT JOIN emergency_goal eg ON eg.user_id = r.user_id
                WHERE bpm.is_active = TRUE
            ),
            chosen AS (
                SELECT s.user_id, s.month, s.plan_code,
                       s.base_needs_pct AS needs_budget_pct,
                       s.base_wants_pct AS wants_budget_pct,
                       s.base_assets_pct AS savings_budget_pct,
                       s.score,
                       CASE
                         WHEN s.plan_code = 'EMERGENCY_FIRST' AND s.emergency_gap > 0 THEN 'Emergency gap detected; increase savings to accelerate buffer.'
                         WHEN s.plan_code = 'DEBT_FIRST' THEN 'Constrain wants and push needs to accelerate debt payoff.'
                         WHEN s.plan_code = 'GOAL_PRIORITY' THEN 'Direct more savings toward your top priorities.'
                         WHEN s.plan_code = 'LEAN_BASICS' THEN 'Tighten wants temporarily; keep savings momentum.'
                         ELSE 'Balanced budgeting for stability.'
                       END AS recommendation_reason
                FROM scores s
            )
            INSERT INTO budgetpilot.user_budget_recommendation 
                (user_id, month, plan_code, needs_budget_pct, wants_budget_pct, savings_budget_pct, score, recommendation_reason)
            SELECT c.user_id, c.month, c.plan_code, c.needs_budget_pct, c.wants_budget_pct, c.savings_budget_pct, c.score, c.recommendation_reason
            FROM chosen c
            ON CONFLICT (user_id, month, plan_code) DO UPDATE
            SET needs_budget_pct = EXCLUDED.needs_budget_pct,
                wants_budget_pct = EXCLUDED.wants_budget_pct,
                savings_budget_pct = EXCLUDED.savings_budget_pct,
                score = EXCLUDED.score,
                recommendation_reason = EXCLUDED.recommendation_reason
        """)
        
        result = session.execute(generate_query, {
            "user_id": str(user_uuid),
            "month": month
        })
        session.commit()
        
        return {
            "message": "Recommendations generated successfully",
            "month": month,
            "generated": True
        }
    except Exception as e:
        session.rollback()
        print(f"Error generating recommendations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate recommendations: {str(e)}"
        )
    finally:
        session.close()


@router.get("/recommendations")
async def get_budget_recommendations(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get top budget plan recommendations for the user
    Returns top 3 recommendations sorted by score
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Default to current month if not provided
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        # Query recommendations from budgetpilot.user_budget_recommendation
        # Join with budgetpilot.budget_plan_master for plan name
        query = text("""
            SELECT 
                r.reco_id,
                r.plan_code,
                p.name AS plan_name,
                r.needs_budget_pct,
                r.wants_budget_pct,
                r.savings_budget_pct,
                r.score,
                r.recommendation_reason
            FROM budgetpilot.user_budget_recommendation r
            JOIN budgetpilot.budget_plan_master p ON p.plan_code = r.plan_code
            WHERE r.user_id = :user_id
              AND r.month = CAST(:month AS DATE)
            ORDER BY r.score DESC
            LIMIT 3
        """)
        
        result = session.execute(query, {
            "user_id": str(user_uuid),
            "month": month
        })
        
        recommendations = []
        for row in result:
            recommendations.append({
                "reco_id": str(row.reco_id),
                "plan_code": row.plan_code,
                "plan_name": row.plan_name,
                "needs_budget_pct": float(row.needs_budget_pct),
                "wants_budget_pct": float(row.wants_budget_pct),
                "savings_budget_pct": float(row.savings_budget_pct),
                "score": float(row.score),
                "recommendation_reason": row.recommendation_reason
            })
        
        return recommendations
    except Exception as e:
        print(f"Error fetching recommendations: {str(e)}")
        # Return empty list if table doesn't exist or query fails
        return []
    finally:
        session.close()


@router.get("/commit")
async def get_budget_commit(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get current budget commitment for the user
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Default to current month if not provided
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        query = text("""
            SELECT 
                user_id,
                month,
                plan_code,
                alloc_needs_pct,
                alloc_wants_pct,
                alloc_assets_pct,
                notes,
                committed_at
            FROM budgetpilot.user_budget_commit
            WHERE user_id = :user_id
              AND month = CAST(:month AS DATE)
            LIMIT 1
        """)
        
        result = session.execute(query, {
            "user_id": str(user_uuid),
            "month": month
        })
        
        row = result.fetchone()
        if not row:
            return None
        
        return {
            "user_id": str(row.user_id),
            "month": row.month.isoformat() if row.month else month,
            "plan_code": row.plan_code,
            "alloc_needs_pct": float(row.alloc_needs_pct),
            "alloc_wants_pct": float(row.alloc_wants_pct),
            "alloc_assets_pct": float(row.alloc_assets_pct),
            "notes": row.notes,
            "committed_at": row.committed_at.isoformat() if row.committed_at else None
        }
    except Exception as e:
        print(f"Error fetching commit: {str(e)}")
        return None
    finally:
        session.close()


@router.post("/commit")
async def commit_to_plan(
    request: CommitRequest,
    user: UserDep = Depends(get_current_user)
):
    """
    Commit to a budget plan recommendation
    This will create/update user_budget_commit and expand goal allocations
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Execute the SQL from section 5 of the migration
        # First, get the recommendation
        reco_query = text("""
            SELECT 
                user_id,
                month,
                plan_code,
                needs_budget_pct,
                wants_budget_pct,
                savings_budget_pct
            FROM budgetpilot.user_budget_recommendation
            WHERE user_id = :user_id
              AND month = CAST(:month AS DATE)
              AND plan_code = :plan_code
            LIMIT 1
        """)
        
        reco_result = session.execute(reco_query, {
            "user_id": str(user_uuid),
            "month": request.month,
            "plan_code": request.plan_code
        })
        
        reco = reco_result.fetchone()
        if not reco:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Recommendation for plan {request.plan_code} not found for month {request.month}"
            )
        
        # Upsert commitment
        commit_query = text("""
            INSERT INTO budgetpilot.user_budget_commit
                (user_id, month, plan_code, alloc_needs_pct, alloc_wants_pct, alloc_assets_pct, notes, committed_at)
            VALUES
                (:user_id, CAST(:month AS DATE), :plan_code, :needs_pct, :wants_pct, :savings_pct, :notes, NOW())
            ON CONFLICT (user_id, month) DO UPDATE
            SET plan_code = EXCLUDED.plan_code,
                alloc_needs_pct = EXCLUDED.alloc_needs_pct,
                alloc_wants_pct = EXCLUDED.alloc_wants_pct,
                alloc_assets_pct = EXCLUDED.alloc_assets_pct,
                notes = EXCLUDED.notes,
                committed_at = NOW()
            RETURNING user_id, month, plan_code, alloc_needs_pct, alloc_wants_pct, alloc_assets_pct, notes, committed_at
        """)
        
        commit_result = session.execute(commit_query, {
            "user_id": str(user_uuid),
            "month": request.month,
            "plan_code": request.plan_code,
            "needs_pct": float(reco.needs_budget_pct),
            "wants_pct": float(reco.wants_budget_pct),
            "savings_pct": float(reco.savings_budget_pct),
            "notes": request.notes
        })
        
        commit_row = commit_result.fetchone()
        session.commit()
        
        if not commit_row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create commit"
            )
        
        return {
            "user_id": str(commit_row.user_id),
            "month": commit_row.month.isoformat() if commit_row.month else request.month,
            "plan_code": commit_row.plan_code,
            "alloc_needs_pct": float(commit_row.alloc_needs_pct),
            "alloc_wants_pct": float(commit_row.alloc_wants_pct),
            "alloc_assets_pct": float(commit_row.alloc_assets_pct),
            "notes": commit_row.notes,
            "committed_at": commit_row.committed_at.isoformat() if commit_row.committed_at else None
        }
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        print(f"Error committing to plan: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit to plan: {str(e)}"
        )
    finally:
        session.close()


@router.get("/monthly-aggregate")
async def get_monthly_aggregate(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get monthly actuals vs plan aggregates
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Default to current month if not provided
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        query = text("""
            SELECT 
                user_id,
                month,
                income_amt,
                needs_amt,
                planned_needs_amt,
                variance_needs_amt,
                wants_amt,
                planned_wants_amt,
                variance_wants_amt,
                assets_amt,
                planned_assets_amt,
                variance_assets_amt
            FROM budgetpilot.budget_user_month_aggregate
            WHERE user_id = :user_id
              AND month = CAST(:month AS DATE)
            LIMIT 1
        """)
        
        result = session.execute(query, {
            "user_id": str(user_uuid),
            "month": month
        })
        
        row = result.fetchone()
        if not row:
            return None
        
        return {
            "user_id": str(row.user_id),
            "month": row.month.isoformat() if row.month else month,
            "income_amt": float(row.income_amt) if row.income_amt else 0,
            "needs_amt": float(row.needs_amt) if row.needs_amt else 0,
            "planned_needs_amt": float(row.planned_needs_amt) if row.planned_needs_amt else 0,
            "variance_needs_amt": float(row.variance_needs_amt) if row.variance_needs_amt else 0,
            "wants_amt": float(row.wants_amt) if row.wants_amt else 0,
            "planned_wants_amt": float(row.planned_wants_amt) if row.planned_wants_amt else 0,
            "variance_wants_amt": float(row.variance_wants_amt) if row.variance_wants_amt else 0,
            "assets_amt": float(row.assets_amt) if row.assets_amt else 0,
            "planned_assets_amt": float(row.planned_assets_amt) if row.planned_assets_amt else 0,
            "variance_assets_amt": float(row.variance_assets_amt) if row.variance_assets_amt else 0
        }
    except Exception as e:
        print(f"Error fetching monthly aggregate: {str(e)}")
        return None
    finally:
        session.close()


@router.get("/goal-allocations")
async def get_goal_allocations(
    month: Optional[str] = Query(None, description="Month in YYYY-MM-01 format"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get goal-level allocations for the committed budget plan
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Default to current month if not provided
        if not month:
            now = datetime.utcnow()
            month = f"{now.year}-{now.month:02d}-01"
        
        query = text("""
            SELECT 
                a.goal_id,
                g.goal_name,
                a.weight_pct,
                a.planned_amount
            FROM budgetpilot.user_budget_commit_goal_alloc a
            JOIN goal.user_goals_master g ON g.user_id = a.user_id AND g.goal_id = a.goal_id
            WHERE a.user_id = :user_id
              AND a.month = CAST(:month AS DATE)
            ORDER BY a.weight_pct DESC
        """)
        
        result = session.execute(query, {
            "user_id": str(user_uuid),
            "month": month
        })
        
        allocations = []
        for row in result:
            allocations.append({
                "goal_id": str(row.goal_id),
                "goal_name": row.goal_name,
                "weight_pct": float(row.weight_pct) if row.weight_pct else 0,
                "planned_amount": float(row.planned_amount) if row.planned_amount else 0
            })
        
        return allocations
    except Exception as e:
        print(f"Error fetching goal allocations: {str(e)}")
        # Return empty list if query fails
        return []
    finally:
        session.close()


# ============================================================================
# Periodized Budget Endpoints (from migration 030)
# ============================================================================

class PeriodUpsert(BaseModel):
    period_type: str  # 'monthly' | 'quarterly' | 'custom'
    period_start: str  # 'YYYY-MM-DD'
    period_end: str    # 'YYYY-MM-DD'


class RecommendationRequest(BaseModel):
    period_type: str
    period_start: str
    period_end: str


class PeriodCommitRequest(BaseModel):
    period_id: str
    plan_code: str
    notes: Optional[str] = "Committed from suggestions"


class PeriodOnly(BaseModel):
    period_id: str


@router.post("/periods/upsert")
async def upsert_period(
    body: PeriodUpsert,
    user: UserDep = Depends(get_current_user)
):
    """Create or update a budget period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        result = session.execute(text(
            "SELECT budgetpilot.upsert_period(:user_id, :period_type, :period_start, :period_end) AS period_id"
        ), {
            "user_id": str(user_uuid),
            "period_type": body.period_type,
            "period_start": body.period_start,
            "period_end": body.period_end
        })
        
        period_id = result.scalar()
        session.commit()
        
        return {"period_id": str(period_id)}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to upsert period: {str(e)}")
    finally:
        session.close()


@router.post("/recommendations/generate")
async def generate_recommendations_periodized(
    body: RecommendationRequest,
    user: UserDep = Depends(get_current_user)
):
    """Generate budget recommendations for a period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        result = session.execute(text("""
            SELECT plan_code, score, needs_budget_pct, wants_budget_pct, savings_budget_pct,
                   recommendation_reason, period_id
            FROM budgetpilot.generate_recommendations(:user_id, :period_type, :period_start, :period_end)
            ORDER BY score DESC, plan_code ASC
        """), {
            "user_id": str(user_uuid),
            "period_type": body.period_type,
            "period_start": body.period_start,
            "period_end": body.period_end
        })
        
        items = []
        for row in result:
            items.append({
                "plan_code": row.plan_code,
                "score": float(row.score) if row.score else 0,
                "needs_budget_pct": float(row.needs_budget_pct) if row.needs_budget_pct else 0,
                "wants_budget_pct": float(row.wants_budget_pct) if row.wants_budget_pct else 0,
                "savings_budget_pct": float(row.savings_budget_pct) if row.savings_budget_pct else 0,
                "recommendation_reason": row.recommendation_reason,
                "period_id": str(row.period_id) if row.period_id else None
            })
        
        return {"items": items}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to generate recommendations: {str(e)}")
    finally:
        session.close()


@router.post("/commit/period")
async def commit_from_recommendation_periodized(
    body: PeriodCommitRequest,
    user: UserDep = Depends(get_current_user)
):
    """Commit a budget plan from recommendations"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(body.period_id) if isinstance(body.period_id, str) else body.period_id
        
        session.execute(text(
            "SELECT budgetpilot.commit_from_recommendation(:user_id, :period_id, :plan_code, :notes)"
        ), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid),
            "plan_code": body.plan_code,
            "notes": body.notes
        })
        
        session.commit()
        return {"ok": True, "message": "Plan committed successfully"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to commit plan: {str(e)}")
    finally:
        session.close()


@router.post("/categories/autofill")
async def autofill_categories(
    body: PeriodOnly,
    user: UserDep = Depends(get_current_user)
):
    """Auto-fill category budgets based on historical spending"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(body.period_id) if isinstance(body.period_id, str) else body.period_id
        
        session.execute(text(
            "SELECT budgetpilot.autofill_category_budgets(:user_id, :period_id)"
        ), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        })
        
        session.commit()
        return {"ok": True, "message": "Category budgets autofilled successfully"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to autofill categories: {str(e)}")
    finally:
        session.close()


@router.post("/aggregate/compute")
async def compute_aggregate(
    body: PeriodOnly,
    user: UserDep = Depends(get_current_user)
):
    """Compute period aggregate (actuals vs plan)"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(body.period_id) if isinstance(body.period_id, str) else body.period_id
        
        session.execute(text(
            "SELECT budgetpilot.compute_period_aggregate(:user_id, :period_id)"
        ), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        })
        
        session.commit()
        return {"ok": True, "message": "Aggregate computed successfully"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to compute aggregate: {str(e)}")
    finally:
        session.close()


@router.get("/overview")
async def get_overview(
    period_id: str = Query(..., description="Period ID"),
    user: UserDep = Depends(get_current_user)
):
    """Get budget overview for a period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        result = session.execute(text("""
            SELECT * FROM budgetpilot.v_budget_overview 
            WHERE user_id = :user_id AND period_id = :period_id
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        }).mappings().first()
        
        if not result:
            raise HTTPException(status_code=404, detail="Overview not found")
        
        return dict(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch overview: {str(e)}")
    finally:
        session.close()


@router.get("/categories/period")
async def get_categories_period(
    period_id: str = Query(..., description="Period ID"),
    user: UserDep = Depends(get_current_user)
):
    """Get category budgets for a period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        result = session.execute(text("""
            SELECT band, category, planned_pct, planned_amount
            FROM budgetpilot.user_budget_category_commit
            WHERE user_id = :user_id AND period_id = :period_id
            ORDER BY band, category
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        })
        
        items = []
        for row in result:
            items.append({
                "band": row.band,
                "category": row.category,
                "planned_pct": float(row.planned_pct) if row.planned_pct else 0,
                "planned_amount": float(row.planned_amount) if row.planned_amount else 0
            })
        
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch categories: {str(e)}")
    finally:
        session.close()


@router.get("/trends")
async def get_trends(
    period_id: str = Query(..., description="Period ID"),
    user: UserDep = Depends(get_current_user)
):
    """Get historical trends for the last 6 periods"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        # Get current period dates
        current_period = session.execute(text("""
            SELECT period_start, period_end, period_type
            FROM budgetpilot.budget_period
            WHERE period_id = :period_id AND user_id = :user_id
        """), {
            "period_id": str(period_uuid),
            "user_id": str(user_uuid)
        }).mappings().first()
        
        if not current_period:
            return {"items": []}
        
        # Get last 6 periods (including current)
        result = session.execute(text("""
            SELECT 
                bp.period_id,
                bp.label AS period_label,
                bp.period_start,
                bp.period_end,
                COALESCE(buma.needs_amt, 0) AS needs_spent,
                COALESCE(buma.wants_amt, 0) AS wants_spent,
                COALESCE(buma.assets_amt, 0) AS assets_spent,
                COALESCE(buma.planned_needs_amt, 0) AS needs_plan,
                COALESCE(buma.planned_wants_amt, 0) AS wants_plan,
                COALESCE(buma.planned_assets_amt, 0) AS assets_plan,
                COALESCE(buma.income_amt, 0) AS income
            FROM budgetpilot.budget_period bp
            LEFT JOIN budgetpilot.budget_user_month_aggregate buma 
                ON buma.period_id = bp.period_id AND buma.user_id = bp.user_id
            WHERE bp.user_id = :user_id
              AND bp.period_type = :period_type
              AND bp.period_start <= :current_end
            ORDER BY bp.period_start DESC
            LIMIT 6
        """), {
            "user_id": str(user_uuid),
            "period_type": current_period["period_type"],
            "current_end": current_period["period_end"]
        })
        
        items = []
        for row in result:
            items.append({
                "period_id": str(row.period_id),
                "period_label": row.period_label,
                "period": row.period_label.split(": ")[1] if ": " in row.period_label else str(row.period_start),
                "needs_spent": float(row.needs_spent) if row.needs_spent else 0,
                "wants_spent": float(row.wants_spent) if row.wants_spent else 0,
                "assets_spent": float(row.assets_spent) if row.assets_spent else 0,
                "needs_plan": float(row.needs_plan) if row.needs_plan else 0,
                "wants_plan": float(row.wants_plan) if row.wants_plan else 0,
                "assets_plan": float(row.assets_plan) if row.assets_plan else 0,
                "income": float(row.income) if row.income else 0
            })
        
        return {"items": list(reversed(items))}  # Return chronological order
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch trends: {str(e)}")
    finally:
        session.close()


@router.get("/insights/explain")
async def get_insights(
    period_id: str = Query(..., description="Period ID"),
    user: UserDep = Depends(get_current_user)
):
    """Generate AI insights and explanations for the current period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        # Get current overview
        overview = session.execute(text("""
            SELECT * FROM budgetpilot.v_budget_overview
            WHERE user_id = :user_id AND period_id = :period_id
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        }).mappings().first()
        
        if not overview:
            return {"insights": []}
        
        # Get previous period for comparison
        prev_period = session.execute(text("""
            SELECT * FROM budgetpilot.v_budget_overview
            WHERE user_id = :user_id
              AND period_id != :period_id
            ORDER BY period_id DESC
            LIMIT 1
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        }).mappings().first()
        
        insights = []
        
        # Variance analysis
        if overview["needs_variance"] > 0:
            pct = (overview["needs_variance"] / overview["needs_plan"]) * 100 if overview["needs_plan"] > 0 else 0
            insights.append({
                "type": "warning",
                "icon": "⚠️",
                "title": "Needs Overspend",
                "message": f"You've exceeded your needs budget by ₹{abs(overview['needs_variance']):,.0f}",
                "value": f"+{pct:.1f}% over plan",
                "action": "Review essential expenses and consider reallocating from wants"
            })
        
        if overview["wants_variance"] > 0:
            pct = (overview["wants_variance"] / overview["wants_plan"]) * 100 if overview["wants_plan"] > 0 else 0
            insights.append({
                "type": "danger",
                "icon": "🚨",
                "title": "Wants Overspend Alert",
                "message": f"Wants spending is ₹{abs(overview['wants_variance']):,.0f} over budget",
                "value": f"+{pct:.1f}% over plan",
                "action": "Consider reducing discretionary spending this period"
            })
        elif overview["wants_variance"] < -overview["wants_plan"] * 0.1:
            insights.append({
                "type": "success",
                "icon": "✅",
                "title": "Great Wants Control",
                "message": f"You're under wants budget by ₹{abs(overview['wants_variance']):,.0f}",
                "value": "Excellent discipline!",
                "action": "Consider redirecting savings to assets"
            })
        
        # Savings analysis
        if overview["assets_variance"] < 0:
            insights.append({
                "type": "warning",
                "icon": "💰",
                "title": "Savings Below Target",
                "message": f"You're saving ₹{abs(overview['assets_variance']):,.0f} less than planned",
                "value": f"{(overview['assets_variance'] / overview['assets_plan'] * 100):.1f}% below target",
                "action": "Review spending patterns and increase savings allocation"
            })
        
        # Period comparison
        if prev_period:
            needs_change = ((overview["needs_spent"] - prev_period["needs_spent"]) / prev_period["needs_spent"] * 100) if prev_period["needs_spent"] > 0 else 0
            wants_change = ((overview["wants_spent"] - prev_period["wants_spent"]) / prev_period["wants_spent"] * 100) if prev_period["wants_spent"] > 0 else 0
            assets_change = ((overview["assets_spent"] - prev_period["assets_spent"]) / prev_period["assets_spent"] * 100) if prev_period["assets_spent"] > 0 else 0
            
            if wants_change > 10:
                insights.append({
                    "type": "warning",
                    "icon": "📈",
                    "title": "Wants Trend Up",
                    "message": f"Wants spending increased {wants_change:.1f}% vs last period",
                    "value": "Monitor this trend",
                    "action": "Consider setting stricter wants limits"
                })
        
        # Plan recommendation
        if overview["plan_name"]:
            insights.append({
                "type": "info",
                "icon": "🎯",
                "title": "Active Plan",
                "message": f"Following {overview['plan_name']} strategy",
                "value": overview["plan_code"],
                "action": "This plan is optimized for your spending patterns"
            })
        
        return {"insights": insights}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate insights: {str(e)}")
    finally:
        session.close()


@router.get("/comparison")
async def get_period_comparison(
    period_id: str = Query(..., description="Period ID"),
    user: UserDep = Depends(get_current_user)
):
    """Compare current period with previous period"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        # Get current period
        current = session.execute(text("""
            SELECT * FROM budgetpilot.v_budget_overview
            WHERE user_id = :user_id AND period_id = :period_id
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        }).mappings().first()
        
        if not current:
            return None
        
        # Get previous period
        previous = session.execute(text("""
            SELECT * FROM budgetpilot.v_budget_overview
            WHERE user_id = :user_id
              AND period_id != :period_id
            ORDER BY period_id DESC
            LIMIT 1
        """), {
            "user_id": str(user_uuid),
            "period_id": str(period_uuid)
        }).mappings().first()
        
        if not previous:
            return None
        
        # Calculate percentage changes
        needs_change = ((current["needs_spent"] - previous["needs_spent"]) / previous["needs_spent"] * 100) if previous["needs_spent"] > 0 else 0
        wants_change = ((current["wants_spent"] - previous["wants_spent"]) / previous["wants_spent"] * 100) if previous["wants_spent"] > 0 else 0
        assets_change = ((current["assets_spent"] - previous["assets_spent"]) / previous["assets_spent"] * 100) if previous["assets_spent"] > 0 else 0
        
        return {
            "needsChange": round(needs_change, 1),
            "wantsChange": round(wants_change, 1),
            "assetsChange": round(assets_change, 1),
            "periodLabel": current["period_label"],
            "previousPeriodLabel": previous["period_label"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch comparison: {str(e)}")
    finally:
        session.close()

