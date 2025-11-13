"""
SpendSense API Endpoints
Core expense tracking and analytics
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, date
from collections import defaultdict
from app.routers.auth import get_current_user, UserDep
from app.models.spendsense_models import TxnFact, TxnEnriched, TxnStaging
from app.database.postgresql import sync_engine, SessionLocal
from sqlalchemy import func, and_, text
from sqlalchemy.orm import sessionmaker
from decimal import Decimal
import json
import uuid

router = APIRouter()

def _infer_category(label: str) -> str:
    """Best-effort category inference for staging data without enrichment."""
    if not label:
        return "Uncategorized"
    t = label.lower()
    # Food & Dining
    if any(k in t for k in ["zomato", "swiggy", "dine", "restaurant", "truffles"]):
        return "Food"
    # Shopping / Ecommerce
    if any(k in t for k in ["amazon", "bigbazaar", "flipkart", "bazaar"]):
        return "Shopping"
    # Utilities / Bills
    if any(k in t for k in ["bescom", "bwssb", "jio", "electric", "water", "internet", "mobile"]):
        return "Utilities"
    # Transport / Travel
    if any(k in t for k in ["uber", "ola", "indigo", "flight", "metro", "train", "bus"]):
        return "Transport"
    # Housing / Rent
    if any(k in t for k in ["apartment", "rent", "society", "maintenance"]):
        return "Housing"
    # Investments / Savings
    if any(k in t for k in ["hdfc rd", "rd ", "recurring deposit", "hdfc mf", "index fund", "sip"]):
        return "Investments"
    # Banking / Fees / Interest (not counted in spending if credit elsewhere)
    if any(k in t for k in ["hdfc", "bank"]):
        return "Banking"
    return "Others"


@router.get("/stats")
async def get_spendsense_stats(
    period: str = Query("month", regex="^(day|week|month|year|all)$"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    user: UserDep = Depends(get_current_user)
):
    """
    Get comprehensive spending statistics
    
    Period options: day, week, month, year, all
    """
    session = SessionLocal()
    
    try:
        # Calculate date range based on period
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # For "month" period, auto-detect the month with most transactions (prefer complete months)
        if period == "month" and start_date is None:
            try:
                # Find the most recent month with substantial data (at least 10 transactions)
                month_stats = session.execute(text("""
                    SELECT 
                        date_trunc('month', txn_date)::date as month,
                        COUNT(*) as txn_count
                    FROM spendsense.txn_fact
                    WHERE user_id = :uid
                    GROUP BY date_trunc('month', txn_date)
                    HAVING COUNT(*) >= 10
                    ORDER BY month DESC
                    LIMIT 1
                """), {"uid": str(user_uuid)}).fetchone()
                
                if month_stats and month_stats[0]:
                    # Use the month with most transactions
                    month_date = month_stats[0]
                    if isinstance(month_date, datetime):
                        end_date = month_date
                    else:
                        from datetime import date
                        end_date = datetime.combine(month_date if isinstance(month_date, date) else datetime.strptime(str(month_date), '%Y-%m-%d').date(), datetime.max.time())
                    
                    start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    # Get last day of month
                    if end_date.month == 12:
                        last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                    end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                else:
                    # Fallback to most recent transaction month
                    most_recent = session.query(func.max(TxnFact.txn_date)).filter(
                        TxnFact.user_id == user_uuid
                    ).scalar()
                    if most_recent:
                        end_date = datetime.combine(most_recent, datetime.max.time())
                        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                        if end_date.month == 12:
                            last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                        else:
                            last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                        end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                    else:
                        # No transactions yet, use current month
                        end_date = datetime.utcnow()
                        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                        if end_date.month == 12:
                            last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                        else:
                            last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                        end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
            except Exception as e:
                print(f"⚠️  Error detecting month: {e}")
                # Fallback to current month if query fails
                end_date = datetime.utcnow()
                start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                if end_date.month == 12:
                    last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            # Calculate date range based on period
            end_date = end_date or datetime.utcnow()
            if start_date is None:
                if period == "day":
                    start_date = end_date - timedelta(days=1)
                elif period == "week":
                    # Current week (Monday to Sunday)
                    days_since_monday = end_date.weekday()
                    start_date = (end_date - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
                    end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
                elif period == "month":
                    # Current calendar month (1st to last day of month)
                    start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    # Get last day of month
                    if end_date.month == 12:
                        last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                    end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                elif period == "year":
                    # Current calendar year (Jan 1 to Dec 31)
                    start_date = end_date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    end_date = end_date.replace(month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
                else:  # all
                    start_date = datetime(2020, 1, 1)
        
        # Query transactions from spendsense.txn_fact - handle missing table gracefully
        try:
            
            # Query transactions from txn_fact with enriched categories
            transactions = session.query(
                TxnFact,
                TxnEnriched.category_code,
                TxnEnriched.subcategory_code
            ).outerjoin(
                TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date
            ).all()
        except Exception as e:
            # If table doesn't exist or column name mismatch, return empty results
            print(f"⚠️  Database query error (table may not exist): {str(e)}")
            transactions = []
        
        if not transactions:
            # Fallback to staging when fact table is empty
            try:
                staging = session.query(TxnStaging).filter(
                    TxnStaging.user_id == user_uuid,
                    TxnStaging.txn_date >= (start_date.date() if isinstance(start_date, datetime) else start_date),
                    TxnStaging.txn_date <= (end_date.date() if isinstance(end_date, datetime) else end_date),
                    TxnStaging.parsed_ok == True
                ).all()
                total_spending = sum(float(s.amount) for s in staging if s.direction == 'debit')
                total_income = sum(float(s.amount) for s in staging if s.direction == 'credit')
                net_flow = total_income - total_spending
                avg_txn = ((total_spending + total_income) / len(staging)) if staging else 0.0
                # No enrichment info in staging; set top_* to None
                return {
                    "period": period,
                    "total_spending": round(total_spending, 2),
                    "total_income": round(total_income, 2),
                    "net_flow": round(net_flow, 2),
                    "transaction_count": len(staging),
                    "top_category": None,
                    "top_merchant": None,
                    "avg_transaction": round(avg_txn, 2)
                }
            except Exception:
                return {
                    "period": period,
                    "total_spending": 0.0,
                    "total_income": 0.0,
                    "net_flow": 0.0,
                    "transaction_count": 0,
                    "top_category": None,
                    "top_merchant": None,
                    "avg_transaction": 0.0
                }
        
        # Calculate statistics
        # Amounts are stored as positive values, direction indicates debit/credit
        # Use Decimal for precise arithmetic to avoid floating point errors
        from decimal import Decimal
        # Exclude investments and loans from spending (they're assets/liabilities, not expenses)
        # Also exclude transfers from both spending and income
        exclude_from_spending = {'investments', 'loans', 'transfers', 'credit_cards'}
        exclude_from_income = {'transfers'}
        
        total_spending = sum(
            Decimal(str(txn.amount)) 
            for txn, cat, subcat in transactions 
            if txn.direction == 'debit' 
            and (cat is None or (cat not in exclude_from_spending and cat != 'income'))
        )
        total_income = sum(
            Decimal(str(txn.amount)) 
            for txn, cat, subcat in transactions 
            if (txn.direction == 'credit' or cat == 'income')
            and (cat is None or cat not in exclude_from_income)
        )
        # Net flow = income - spending (excludes investments, loans, transfers, credit cards)
        # This gives a clearer picture of actual cash flow
        net_flow = float(total_income - total_spending)
        
        # Top category and merchant
        category_totals = {}
        merchant_totals = {}
        
        for txn, cat, subcat in transactions:
            if cat:
                category_totals[cat] = category_totals.get(cat, 0) + float(txn.amount)
            if txn.merchant_name_norm:
                merchant_totals[txn.merchant_name_norm] = merchant_totals.get(txn.merchant_name_norm, 0) + float(txn.amount)
        
        top_category = max(category_totals, key=category_totals.get) if category_totals else None
        top_merchant = max(merchant_totals, key=merchant_totals.get) if merchant_totals else None
        
        avg_transaction = float((total_spending + total_income) / len(transactions)) if transactions else 0.0
        
        # Calculate cumulative balance (all-time net flow, excluding investments/loans)
        try:
            all_transactions = session.query(
                TxnFact,
                TxnEnriched.category_code
            ).outerjoin(
                TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
            ).filter(
                TxnFact.user_id == user_uuid
            ).all()
            
            # Exclude investments, loans, transfers, credit_cards from cumulative balance
            exclude_from_spending = {'investments', 'loans', 'transfers', 'credit_cards'}
            exclude_from_income = {'transfers'}
            
            # Use Decimal for precise arithmetic
            cumulative_income = sum(
                Decimal(str(txn.amount)) 
                for txn, cat in all_transactions 
                if txn.direction == 'credit' 
                and (cat is None or cat not in exclude_from_income)
            )
            cumulative_spending = sum(
                Decimal(str(txn.amount)) 
                for txn, cat in all_transactions 
                if txn.direction == 'debit' 
                and (cat is None or cat not in exclude_from_spending)
            )
            cumulative_balance = float(cumulative_income - cumulative_spending)
        except Exception as e:
            print(f"⚠️  Error calculating cumulative balance: {e}")
            # Fallback to monthly net flow if calculation fails
            cumulative_balance = net_flow
        
        return {
            "period": period,
            "total_spending": float(total_spending),
            "total_income": float(total_income),
            "net_flow": net_flow,
            "cumulative_balance": cumulative_balance,
            "transaction_count": len(transactions),
            "top_category": top_category,
            "top_merchant": top_merchant,
            "avg_transaction": round(avg_transaction, 2),
            "period_start": start_date.isoformat() if isinstance(start_date, datetime) else str(start_date),
            "period_end": end_date.isoformat() if isinstance(end_date, datetime) else str(end_date)
        }
    finally:
        session.close()


@router.get("/by-category")
async def get_spending_by_category(
    period: str = Query("month", regex="^(day|week|month|year|all)$"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    user: UserDep = Depends(get_current_user)
):
    """
    Get spending breakdown by category
    """
    session = SessionLocal()
    
    try:
        # Calculate date range
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # For "month" period, auto-detect the most recent month with substantial data
        if period == "month" and start_date is None:
            try:
                # Find the most recent month with substantial data (at least 10 transactions)
                month_stats = session.execute(text("""
                    SELECT 
                        date_trunc('month', txn_date)::date as month,
                        COUNT(*) as txn_count
                    FROM spendsense.txn_fact
                    WHERE user_id = :uid
                    GROUP BY date_trunc('month', txn_date)
                    HAVING COUNT(*) >= 10
                    ORDER BY month DESC
                    LIMIT 1
                """), {"uid": str(user_uuid)}).fetchone()
                
                if month_stats and month_stats[0]:
                    # Use the month with most transactions
                    month_date = month_stats[0]
                    if isinstance(month_date, datetime):
                        end_date = month_date
                    else:
                        from datetime import date
                        end_date = datetime.combine(month_date if isinstance(month_date, date) else datetime.strptime(str(month_date), '%Y-%m-%d').date(), datetime.max.time())
                    
                    start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    if end_date.month == 12:
                        last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                    end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                else:
                    # Fallback to most recent transaction month
                    most_recent = session.query(func.max(TxnFact.txn_date)).filter(
                        TxnFact.user_id == user_uuid
                    ).scalar()
                    if most_recent:
                        end_date = datetime.combine(most_recent, datetime.max.time())
                        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                        if end_date.month == 12:
                            last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                        else:
                            last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                        end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                    else:
                        end_date = datetime.utcnow()
                        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                        if end_date.month == 12:
                            last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                        else:
                            last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                        end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
            except Exception as e:
                print(f"⚠️  Error detecting month for by-category: {e}")
                end_date = datetime.utcnow()
                start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                if end_date.month == 12:
                    last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            end_date = end_date or datetime.utcnow()
            if start_date is None:
                if period == "day":
                    start_date = end_date - timedelta(days=1)
                elif period == "week":
                    days_since_monday = end_date.weekday()
                    start_date = (end_date - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
                    end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
                elif period == "month":
                    start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    if end_date.month == 12:
                        last_day = end_date.replace(year=end_date.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = end_date.replace(month=end_date.month + 1, day=1) - timedelta(days=1)
                    end_date = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
                elif period == "year":
                    start_date = end_date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    end_date = end_date.replace(month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
                else:  # all
                    start_date = datetime(2020, 1, 1)
        
        # Query from TxnFact with TxnEnriched for categories
        # Group by category code from TxnEnriched
        try:
            result = session.query(
                TxnEnriched.category_code,
                func.sum(func.abs(TxnFact.amount)).label('total'),
                func.count(TxnFact.txn_id).label('count')
            ).outerjoin(
                TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                TxnFact.direction == "debit",  # Only debits (spending)
                # Exclude income and transfers categories
                (TxnEnriched.category_code.is_(None)) | (
                    (TxnEnriched.category_code != 'transfers') &
                    (TxnEnriched.category_code != 'income')
                )
            ).group_by(
                TxnEnriched.category_code
            ).order_by(
                func.sum(func.abs(TxnFact.amount)).desc()
            ).all()
        except Exception as e:
            # If tables don't exist or query fails, return empty result
            print(f"⚠️  Database query error in by-category: {str(e)}")
            return {
                "period": period,
                "categories": [],
                "total": 0.0,
                "currency": "INR"
            }
        
        # Fallback to staging when no categories or no fact data
        if not result:
            try:
                staging_rows = session.query(TxnStaging).filter(
                    TxnStaging.user_id == user_uuid,
                    TxnStaging.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                    TxnStaging.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                    TxnStaging.direction == 'debit',
                    TxnStaging.parsed_ok == True
                ).all()

                totals = {}
                counts = {}
                for s in staging_rows:
                    cat = _infer_category(s.merchant_raw or s.description_raw or "")
                    amt = float(s.amount)
                    totals[cat] = totals.get(cat, 0.0) + amt
                    counts[cat] = counts.get(cat, 0) + 1

                total_amount = sum(totals.values())
                breakdown = []
                for cat, amt in sorted(totals.items(), key=lambda x: x[1], reverse=True):
                    percentage = (amt / total_amount * 100) if total_amount > 0 else 0
                    breakdown.append({
                        "category": cat,
                        "amount": round(amt, 2),
                        "percentage": round(percentage, 2),
                        "transaction_count": counts.get(cat, 0)
                    })

                return {
                    "period": period,
                    "categories": breakdown,
                    "total": round(total_amount, 2),
                    "currency": "INR"
                }
            except Exception as e:
                print(f"⚠️  By-category staging fallback failed: {str(e)}")
                return {
                    "period": period,
                    "categories": [],
                    "total": 0.0,
                    "currency": "INR"
                }
        
        total_amount = sum(float(row.total) for row in result)
        
        breakdown = []
        for row in result:
            percentage = (float(row.total) / total_amount * 100) if total_amount > 0 else 0
            breakdown.append({
                "category": row.category_code or "Uncategorized",
                "amount": float(row.total),
                "percentage": round(percentage, 2),
                "transaction_count": row.count
            })
        
        return {
            "period": period,
            "categories": breakdown,
            "total": float(total_amount),
            "currency": "INR"
        }
    finally:
        session.close()


@router.get("/trends")
async def get_spending_trends(
    period: str = Query("3months", regex="^(1month|3months|6months|1year)$"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get spending trends over time
    
    Returns: Monthly/weekly spending data
    """
    session = SessionLocal()
    
    try:
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days={
            "1month": 30,
            "3months": 90,
            "6months": 180,
            "1year": 365
        }.get(period, 90))
        
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Group by month from TxnFact
        try:
            result = session.query(
                func.date_trunc('month', TxnFact.txn_date).label('month'),
                func.sum(func.abs(TxnFact.amount)).label('spending')
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                TxnFact.direction == "debit"
            ).group_by(func.date_trunc('month', TxnFact.txn_date)).order_by('month').all()
        except Exception as e:
            print(f"⚠️  Database query error in trends: {str(e)}")
            return {
                "period": period,
                "trends": []
            }
        
        # Fallback to staging when no fact data
        if not result:
            try:
                staging_trend = session.query(
                    func.date_trunc('month', TxnStaging.txn_date).label('month'),
                    func.sum(func.abs(TxnStaging.amount)).label('spending')
                ).filter(
                    TxnStaging.user_id == user_uuid,
                    TxnStaging.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                    TxnStaging.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                    TxnStaging.direction == 'debit',
                    TxnStaging.parsed_ok == True
                ).group_by(func.date_trunc('month', TxnStaging.txn_date)).order_by('month').all()

                trends = []
                for row in staging_trend:
                    trends.append({
                        "period": row.month.strftime("%Y-%m"),
                        "spending": float(row.spending),
                        "date": row.month.isoformat()
                    })
                return {"period": period, "trends": trends}
            except Exception as e:
                print(f"⚠️  Trends staging fallback failed: {str(e)}")
                return {"period": period, "trends": []}
        
        trends = []
        for row in result:
            trends.append({
                "period": row.month.strftime("%Y-%m"),
                "spending": float(row.spending),
                "date": row.month.isoformat()
            })
        
        return {
            "period": period,
            "trends": trends
        }
    finally:
        session.close()


@router.get("/kpis")
async def get_kpis(
    period: str = Query("month", regex="^(month|year)$"),
    user: UserDep = Depends(get_current_user)
):
    """Return KPI summary for dashboard. Uses materialized views if they exist,
    otherwise falls back to computing from txn_fact.
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Determine date range based on period
        end_date = datetime.utcnow().date()
        if period == "month":
            start_date = (datetime.utcnow() - timedelta(days=30)).date()
        else:  # year
            start_date = (datetime.utcnow() - timedelta(days=365)).date()
        
        # Try MV first - compute totals from the view
        try:
            view = "spendsense.mv_spendsense_dashboard_user_month"
            row = session.execute(text(
                """
                SELECT 
                    income_amt,
                    needs_amt,
                    wants_amt,
                    assets_amt,
                    month
                FROM """ + view + """
                WHERE user_id = :uid
                ORDER BY month DESC
                LIMIT 1
                """
            ), {"uid": str(user_uuid)}).fetchone()
            
            if row:
                income_amt, needs_amt, wants_amt, assets_amt, month = row
                # Exclude investments (assets_amt) and loans from spending for net flow calculation
                # Investments and loans are tracked separately (assets/liabilities)
                total_spending = float(needs_amt or 0) + float(wants_amt or 0)  # Exclude assets_amt (investments)
                total_income = float(income_amt or 0)
                # Net flow = income - operational spending (excludes investments, loans, transfers)
                net_flow = total_income - total_spending
                
                # Get transaction count from fact table for the month
                month_start = month.replace(day=1) if isinstance(month, datetime) else month
                from calendar import monthrange
                month_end = month_start.replace(day=monthrange(month_start.year, month_start.month)[1]) if isinstance(month_start, datetime) else month_start
                
                txn_count = session.execute(text("""
                    SELECT COUNT(*) 
                    FROM spendsense.txn_fact
                    WHERE user_id = :uid
                    AND txn_date >= :start
                    AND txn_date <= :end
                """), {"uid": str(user_uuid), "start": month_start, "end": month_end}).scalar() or 0
                
                return {
                    "period": period,
                    "total_spending": total_spending,
                    "total_income": total_income,
                    "net_flow": net_flow,
                    "transaction_count": txn_count
                }
        except Exception as e:
            print(f"⚠️  Materialized view query failed: {e}")

        # Fallback compute from fact table for date range
        try:
            txns = session.query(
                TxnFact,
                TxnEnriched.category_code
            ).outerjoin(
                TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date,
                TxnFact.txn_date <= end_date
            ).all()
            
            # Exclude investments, loans, transfers, credit_cards from spending
            exclude_from_spending = {'investments', 'loans', 'transfers', 'credit_cards'}
            exclude_from_income = {'transfers'}
            
            total_spending = sum(
                float(txn.amount) 
                for txn, cat in txns 
                if txn.direction == 'debit' 
                and (cat is None or (cat not in exclude_from_spending and cat != 'income'))
            )
            total_income = sum(
                float(txn.amount) 
                for txn, cat in txns 
                if (txn.direction == 'credit' or cat == 'income')
                and (cat is None or cat not in exclude_from_income)
            )
            net_flow = total_income - total_spending
            return {
                "period": period,
                "total_spending": total_spending,
                "total_income": total_income,
                "net_flow": net_flow,
                "transaction_count": len(txns)
            }
        except Exception as e:
            print(f"⚠️  Fact table query failed: {e}")
            return {
                "period": period,
                "total_spending": 0.0,
                "total_income": 0.0,
                "net_flow": 0.0,
                "transaction_count": 0
            }
    finally:
        session.close()


def _rebuild_kpis_for_user(session, user_id_str: str):
    """Helper function to rebuild KPIs for a user (can be called from ETL pipeline).
    
    Populates:
      - spendsense.kpi_type_split_monthly
      - spendsense.kpi_category_monthly
      - spendsense.kpi_recurring_merchants_monthly
      - spendsense.kpi_spending_leaks_monthly
      - (optional) spendsense.kpi_type_split_daily if table exists
    """
    import uuid as _uuid
    user_uuid = _uuid.UUID(user_id_str) if isinstance(user_id_str, str) else user_id_str

    # If no facts, exit early
    minmax = session.execute(text(
        "SELECT min(txn_date), max(txn_date) FROM spendsense.txn_fact WHERE user_id = :uid"
    ), {"uid": str(user_uuid)}).fetchone()
    if not minmax or not minmax[0]:
        return

    # ---------- Type Split Monthly ----------
    session.execute(text(
        "DELETE FROM spendsense.kpi_type_split_monthly WHERE user_id = :uid"
    ), {"uid": str(user_uuid)})

    session.execute(text(
        """
        INSERT INTO spendsense.kpi_type_split_monthly
            (user_id, month, income_amt, needs_amt, wants_amt, assets_amt, created_at)
        SELECT
            tf.user_id,
            date_trunc('month', tf.txn_date)::date AS month,
            SUM(CASE WHEN tf.direction = 'credit' THEN tf.amount ELSE 0 END) AS income_amt,
            SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'needs' THEN tf.amount ELSE 0 END) AS needs_amt,
            SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'wants' THEN tf.amount ELSE 0 END) AS wants_amt,
            SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'assets' THEN tf.amount ELSE 0 END) AS assets_amt,
            NOW()
        FROM spendsense.txn_fact tf
        LEFT JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
        LEFT JOIN spendsense.dim_category dc ON dc.category_code = te.category_code
        WHERE tf.user_id = :uid
          AND COALESCE(te.category_code,'') <> 'transfers'
        GROUP BY tf.user_id, date_trunc('month', tf.txn_date)
        """
    ), {"uid": str(user_uuid)})

    # ---------- Category Monthly ----------
    session.execute(text(
        "DELETE FROM spendsense.kpi_category_monthly WHERE user_id = :uid"
    ), {"uid": str(user_uuid)})

    session.execute(text(
        """
        INSERT INTO spendsense.kpi_category_monthly
            (user_id, month, category_code, spend_amt)
        SELECT
            tf.user_id,
            date_trunc('month', tf.txn_date)::date AS month,
            COALESCE(te.category_code, 'others') AS category_code,
            SUM(CASE WHEN tf.direction='debit' THEN tf.amount ELSE 0 END) AS spend_amt
        FROM spendsense.txn_fact tf
        LEFT JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
        WHERE tf.user_id = :uid
          AND COALESCE(te.category_code,'') <> 'transfers'
          AND COALESCE(te.category_code,'') <> 'income'  -- Exclude income from spending
        GROUP BY tf.user_id, date_trunc('month', tf.txn_date), COALESCE(te.category_code, 'others')
        """
    ), {"uid": str(user_uuid)})

    # ---------- Recurring Merchants Monthly ----------
    session.execute(text(
        "DELETE FROM spendsense.kpi_recurring_merchants_monthly WHERE user_id = :uid"
    ), {"uid": str(user_uuid)})

    session.execute(text(
        """
        INSERT INTO spendsense.kpi_recurring_merchants_monthly
            (user_id, month, merchant_name_norm, txn_count, total_amt)
        SELECT
            tf.user_id,
            date_trunc('month', tf.txn_date)::date AS month,
            tf.merchant_name_norm,
            COUNT(*) AS txn_count,
            SUM(CASE WHEN tf.direction='debit' THEN tf.amount ELSE 0 END) AS total_amt
        FROM spendsense.txn_fact tf
        WHERE tf.user_id = :uid AND tf.merchant_name_norm IS NOT NULL
        GROUP BY tf.user_id, date_trunc('month', tf.txn_date), tf.merchant_name_norm
        HAVING COUNT(*) >= 3
        """
    ), {"uid": str(user_uuid)})

    # ---------- Spending Leaks Monthly ----------
    session.execute(text(
        "DELETE FROM spendsense.kpi_spending_leaks_monthly WHERE user_id = :uid"
    ), {"uid": str(user_uuid)})

    session.execute(text(
        """
        WITH wants AS (
            SELECT
                COALESCE(te.category_code,'others') AS category_code,
                date_trunc('month', tf.txn_date)::date AS month,
                SUM(CASE WHEN tf.direction='debit' THEN tf.amount ELSE 0 END) AS spend_amt
            FROM spendsense.txn_fact tf
            LEFT JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
            LEFT JOIN spendsense.dim_category dc ON dc.category_code = te.category_code
            WHERE tf.user_id = :uid 
              AND COALESCE(te.category_code,'') <> 'transfers'
              AND COALESCE(dc.txn_type,'wants')='wants'
            GROUP BY date_trunc('month', tf.txn_date), COALESCE(te.category_code,'others')
        ), rnk AS (
            SELECT w.*, ROW_NUMBER() OVER (PARTITION BY w.month ORDER BY w.spend_amt DESC) AS rn
            FROM wants w
        )
        INSERT INTO spendsense.kpi_spending_leaks_monthly
            (user_id, month, rank, category_code, leak_amt)
        SELECT CAST(:uid AS uuid) AS user_id, r.month, r.rn AS rank, r.category_code, r.spend_amt AS leak_amt
        FROM rnk r WHERE r.rn <= 3
        """
    ), {"uid": str(user_uuid)})

    # ---------- Type Split Daily (optional) ----------
    try:
        session.execute(text(
            "DELETE FROM spendsense.kpi_type_split_daily WHERE user_id = :uid"
        ), {"uid": str(user_uuid)})

        session.execute(text(
            """
            INSERT INTO spendsense.kpi_type_split_daily
                (user_id, dt, income_amt, needs_amt, wants_amt, assets_amt, created_at)
            SELECT
                tf.user_id,
                date_trunc('day', tf.txn_date)::date AS dt,
                SUM(CASE WHEN tf.direction = 'credit' THEN tf.amount ELSE 0 END) AS income_amt,
                SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'needs' THEN tf.amount ELSE 0 END) AS needs_amt,
                SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'wants' THEN tf.amount ELSE 0 END) AS wants_amt,
                SUM(CASE WHEN tf.direction = 'debit' AND COALESCE(dc.txn_type,'wants') = 'assets' THEN tf.amount ELSE 0 END) AS assets_amt,
                NOW()
            FROM spendsense.txn_fact tf
            LEFT JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
            LEFT JOIN spendsense.dim_category dc ON dc.category_code = te.category_code
            WHERE tf.user_id = :uid
              AND COALESCE(te.category_code,'') <> 'transfers'
            GROUP BY tf.user_id, date_trunc('day', tf.txn_date)
            """
        ), {"uid": str(user_uuid)})
    except Exception:
        pass


@router.post("/kpis/rebuild")
async def rebuild_kpis(
    user: UserDep = Depends(get_current_user),
    threshold_small_txn: float = 1000.0
):
    """Rebuild 5 KPIs from txn_fact for the current user.

    Populates:
      - spendsense.kpi_type_split_monthly
      - spendsense.kpi_category_monthly
      - spendsense.kpi_recurring_merchants_monthly
      - spendsense.kpi_spending_leaks_monthly
      - (optional) spendsense.kpi_type_split_daily if table exists
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id

        # If no facts, exit early
        minmax = session.execute(text(
            "SELECT min(txn_date), max(txn_date) FROM spendsense.txn_fact WHERE user_id = :uid"
        ), {"uid": str(user_uuid)}).fetchone()
        if not minmax or not minmax[0]:
            return {"message": "No transactions in txn_fact"}
        
        # Call the helper function
        _rebuild_kpis_for_user(session, user.user_id)
        
        session.commit()
        return {"message": "KPIs rebuilt"}
    finally:
        session.close()


@router.get("/merchants")
async def get_top_merchants(
    limit: int = Query(10, ge=1, le=50),
    period: str = Query("month", regex="^(day|week|month|year)$"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get top merchants by spending
    """
    session = SessionLocal()
    
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days={
            "day": 1,
            "week": 7,
            "month": 30,
            "year": 365
        }.get(period, 30))
        
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Query from TxnFact using merchant_name_norm
        try:
            result = session.query(
                TxnFact.merchant_name_norm,
                func.sum(func.abs(TxnFact.amount)).label('total'),
                func.count(TxnFact.txn_id).label('count')
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                TxnFact.direction == "debit",
                TxnFact.merchant_name_norm.isnot(None)
            ).group_by(TxnFact.merchant_name_norm).order_by(func.sum(func.abs(TxnFact.amount)).desc()).limit(limit).all()
        except Exception as e:
            print(f"⚠️  Database query error in merchants: {str(e)}")
            return {
                "period": period,
                "merchants": []
            }
        
        merchants = []
        for row in result:
            merchants.append({
                "merchant": row.merchant_name_norm or "Unknown",
                "total_spending": float(row.total),
                "transaction_count": row.count
            })
        
        return {
            "period": period,
            "merchants": merchants
        }
    finally:
        session.close()


@router.get("/insights")
async def get_insights(
    user: UserDep = Depends(get_current_user)
):
    """Return spending insights calculated from actual transaction data.

    Shows top 5 categories by spending amount for the most recent month with data.
    Returns [{ type, category, change_percentage, message }].
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get the most recent month with any transactions (no minimum requirement)
        month_stats = session.execute(text("""
            SELECT 
                date_trunc('month', txn_date)::date as month,
                COUNT(*) as txn_count
            FROM spendsense.txn_fact
            WHERE user_id = :uid
            GROUP BY date_trunc('month', txn_date)
            ORDER BY month DESC
            LIMIT 1
        """), {"uid": str(user_uuid)}).fetchone()
        
        if not month_stats or not month_stats[0]:
            return {"insights": []}
        
        target_month = month_stats[0]
        from datetime import date
        month_date = target_month if isinstance(target_month, date) else datetime.strptime(str(target_month), '%Y-%m-%d').date()
        month_start = datetime.combine(month_date.replace(day=1), datetime.min.time())
        if month_date.month == 12:
            month_end = datetime.combine(date(month_date.year + 1, 1, 1) - timedelta(days=1), datetime.max.time())
        else:
            month_end = datetime.combine(date(month_date.year, month_date.month + 1, 1) - timedelta(days=1), datetime.max.time())
        
        # Get current month categories with transaction counts
        current_rows = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend'),
            func.count(TxnFact.txn_id).label('txn_count')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= month_start.date(),
            TxnFact.txn_date <= month_end.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.notin_(['income', 'transfers', 'others'])
        ).group_by(TxnEnriched.category_code).order_by(func.sum(func.abs(TxnFact.amount)).desc()).limit(5).all()

        # Get previous month for comparison
        prev_month_start = month_start - timedelta(days=32)
        prev_month_start = prev_month_start.replace(day=1)
        if prev_month_start.month == 12:
            prev_month_end = datetime.combine(date(prev_month_start.year + 1, 1, 1) - timedelta(days=1), datetime.max.time())
        else:
            prev_month_end = datetime.combine(date(prev_month_start.year, prev_month_start.month + 1, 1) - timedelta(days=1), datetime.max.time())
        
        prev_rows = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= prev_month_start.date(),
            TxnFact.txn_date <= prev_month_end.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.notin_(['income', 'transfers', 'others'])
        ).group_by(TxnEnriched.category_code).all()
        
        # Create a map of previous month spending by category
        prev_spending = {cat: float(amt) for cat, amt in prev_rows}

        insights = []
        for cat, amt, txn_count in current_rows:
            cat_name = session.execute(text("""
                SELECT category_name FROM spendsense.dim_category WHERE category_code = :cat
            """), {"cat": cat or 'others'}).scalar() or cat or 'Uncategorized'
            
            # Calculate change percentage if previous month exists
            change_percentage = 0.0
            if cat in prev_spending and prev_spending[cat] > 0:
                change_percentage = ((float(amt) - prev_spending[cat]) / prev_spending[cat]) * 100
            
            insights.append({
                "type": "top_category",
                "category": cat or 'Uncategorized',
                "change_percentage": round(change_percentage, 1),
                "message": f"{cat_name}: ₹{round(float(amt or 0)):.0f} ({txn_count} transactions)"
            })
        
        return {"insights": insights}
    except Exception as e:
        print(f"⚠️  Error calculating insights: {e}")
        return {"insights": []}
    finally:
        session.close()


@router.get("/top-categories")
async def get_top_categories(
    limit: int = Query(3, ge=1, le=10),
    period: str = Query("month", regex="^(day|week|month|year)$"),
    user: UserDep = Depends(get_current_user)
):
    """
    Get top N spending categories
    Core Objective: Visual Simplicity - Top 3 spending categories
    """
    session = SessionLocal()
    
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days={
            "day": 1,
            "week": 7,
            "month": 30,
            "year": 365
        }.get(period, 30))
        
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        try:
            result = session.query(
                TxnEnriched.category_code,
                func.sum(func.abs(TxnFact.amount)).label('total'),
                func.count(TxnFact.txn_id).label('count')
            ).join(
                TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                TxnFact.direction == "debit",  # Only debits (spending)
                TxnEnriched.category_code.isnot(None),
                # Exclude income and transfers
                TxnEnriched.category_code != 'income',
                TxnEnriched.category_code != 'transfers'
            ).group_by(TxnEnriched.category_code).order_by(func.sum(func.abs(TxnFact.amount)).desc()).limit(limit).all()
            
            categories = []
            for row in result:
                categories.append({
                    "category": row.category_code,
                    "total_spending": float(row.total),
                    "transaction_count": row.count
                })
        except Exception as e:
            print(f"⚠️  Database query error in top-categories: {str(e)}")
            categories = []
        
        return {
            "period": period,
            "categories": categories
        }
    finally:
        session.close()


@router.get("/leaks")
async def detect_spending_leaks(
    threshold: float = Query(1000.0, ge=100.0),
    period: str = Query("month", regex="^(week|month|year)$"),
    user: UserDep = Depends(get_current_user)
):
    """
    Detect spending leaks (small recurring transactions that add up)
    Core Objective: Behavioral Clarity - Help users understand spending
    """
    session = SessionLocal()
    
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days={
            "week": 7,
            "month": 30,
            "year": 365
        }.get(period, 30))
        
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Find merchants with many small transactions
        try:
            result = session.query(
                TxnFact.merchant_name_norm,
                func.count(TxnFact.txn_id).label('count'),
                func.sum(func.abs(TxnFact.amount)).label('total'),
                func.avg(func.abs(TxnFact.amount)).label('avg_amount')
            ).filter(
                TxnFact.user_id == user_uuid,
                TxnFact.txn_date >= start_date.date() if isinstance(start_date, datetime) else start_date,
                TxnFact.txn_date <= end_date.date() if isinstance(end_date, datetime) else end_date,
                TxnFact.direction == "debit",
                TxnFact.merchant_name_norm.isnot(None)
            ).group_by(TxnFact.merchant_name_norm).having(
                func.count(TxnFact.txn_id) >= 3,  # At least 3 transactions
                func.avg(func.abs(TxnFact.amount)) < threshold  # But each is below threshold
            ).order_by(func.count(TxnFact.txn_id).desc()).limit(10).all()
        except Exception as e:
            print(f"⚠️  Database query error in leaks: {str(e)}")
            return {
                "period": period,
                "total_leak_amount": 0.0,
                "leaks_detected": 0,
                "leaks": []
            }
        
        leaks = []
        total_leak = 0.0
        
        for row in result:
            leak_amount = float(row.total)
            total_leak += leak_amount
            leaks.append({
                "merchant": row.merchant_name_norm or "Unknown",
                "transaction_count": row.count,
                "total_spent": leak_amount,
                "avg_transaction": round(float(row.avg_amount), 2),
                "leak_score": round(leak_amount / threshold, 2)
            })
        
        return {
            "period": period,
            "total_leak_amount": round(total_leak, 2),
            "leaks_detected": len(leaks),
            "leaks": leaks
        }
    finally:
        session.close()


@router.get("/comparing-periods")
async def compare_periods(
    user: UserDep = Depends(get_current_user)
):
    """
    Compare spending across different time periods
    """
    session = SessionLocal()
    
    try:
        now = datetime.utcnow()
        
        # Define periods
        periods = {
            "last_week": (now - timedelta(days=14), now - timedelta(days=7)),
            "this_week": (now - timedelta(days=7), now),
            "last_month": (now - timedelta(days=60), now - timedelta(days=30)),
            "this_month": (now - timedelta(days=30), now)
        }
        
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        comparison = {}
        
        try:
            for period_name, (start, end) in periods.items():
                result = session.query(
                    func.sum(func.abs(TxnFact.amount)).label('total')
                ).filter(
                    TxnFact.user_id == user_uuid,
                    TxnFact.txn_date >= start.date() if isinstance(start, datetime) else start,
                    TxnFact.txn_date < end.date() if isinstance(end, datetime) else end,
                    TxnFact.direction == "debit"
                ).scalar()
                
                comparison[period_name] = float(result) if result else 0.0
        except Exception as e:
            print(f"⚠️  Database query error in comparing-periods: {str(e)}")
            comparison = {
                "last_week": 0.0,
                "this_week": 0.0,
                "last_month": 0.0,
                "this_month": 0.0
            }
        
        # Calculate changes
        if comparison.get("last_week", 0) > 0:
            week_change = ((comparison["this_week"] - comparison["last_week"]) / comparison["last_week"]) * 100
        else:
            week_change = 0
        
        if comparison.get("last_month", 0) > 0:
            month_change = ((comparison["this_month"] - comparison["last_month"]) / comparison["last_month"]) * 100
        else:
            month_change = 0
        
        return {
            "comparison": comparison,
            "week_change_percentage": round(week_change, 2),
            "month_change_percentage": round(month_change, 2)
        }
    finally:
        session.close()


# =============================================================================
# Next-Gen Intelligence Layer Endpoints
# =============================================================================

@router.get("/ai/advice")
async def get_ai_spending_advice(
    user: UserDep = Depends(get_current_user)
):
    """
    Personalized Spending Coach - AI-driven insights with actionable advice
    Returns human-readable messages like "Your dining spend is up 24% MoM. Reducing Zomato orders by 2/week could save ₹1,800."
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get current month and previous month
        now = datetime.utcnow()
        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            current_month_end = datetime.combine(date(now.year + 1, 1, 1) - timedelta(days=1), datetime.max.time())
        else:
            current_month_end = datetime.combine(date(now.year, now.month + 1, 1) - timedelta(days=1), datetime.max.time())
        
        prev_month_start = (current_month_start - timedelta(days=32)).replace(day=1)
        if prev_month_start.month == 12:
            prev_month_end = datetime.combine(date(prev_month_start.year + 1, 1, 1) - timedelta(days=1), datetime.max.time())
        else:
            prev_month_end = datetime.combine(date(prev_month_start.year, prev_month_start.month + 1, 1) - timedelta(days=1), datetime.max.time())
        
        # Get category spending for both months
        current_cats = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend'),
            func.count(TxnFact.txn_id).label('count')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= current_month_start.date(),
            TxnFact.txn_date <= current_month_end.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.notin_(['income', 'transfers', 'others'])
        ).group_by(TxnEnriched.category_code).all()
        
        prev_cats = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= prev_month_start.date(),
            TxnFact.txn_date <= prev_month_end.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.notin_(['income', 'transfers', 'others'])
        ).group_by(TxnEnriched.category_code).all()
        
        prev_map = {cat: float(amt) for cat, amt in prev_cats}
        
        advice = []
        for cat, amt, txn_count in current_cats:
            cat_name = session.execute(text("""
                SELECT category_name FROM spendsense.dim_category WHERE category_code = :cat
            """), {"cat": cat or 'others'}).scalar() or cat or 'Uncategorized'
            
            curr_spend = float(amt)
            prev_spend = prev_map.get(cat, 0)
            
            if prev_spend > 0:
                pct_change = ((curr_spend - prev_spend) / prev_spend) * 100
                
                # Generate actionable advice for significant increases
                if pct_change > 20 and curr_spend > 1000:
                    # Estimate potential savings (assume 2 transactions/week reduction)
                    avg_txn = curr_spend / txn_count if txn_count > 0 else 0
                    weekly_txns = txn_count / 4.33  # Approximate weeks in month
                    potential_savings = avg_txn * 2 * 4.33  # 2 fewer txns/week
                    
                    # Get top merchant for this category
                    top_merchant = session.query(
                        TxnFact.merchant_name_norm,
                        func.count(TxnFact.txn_id).label('count')
                    ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
                        TxnFact.user_id == user_uuid,
                        TxnFact.txn_date >= current_month_start.date(),
                        TxnFact.txn_date <= current_month_end.date(),
                        TxnFact.direction == 'debit',
                        TxnEnriched.category_code == cat,
                        TxnFact.merchant_name_norm.isnot(None)
                    ).group_by(TxnFact.merchant_name_norm).order_by(func.count(TxnFact.txn_id).desc()).first()
                    
                    merchant_name = top_merchant[0] if top_merchant else "orders"
                    
                    advice.append({
                        "category": cat,
                        "category_name": cat_name,
                        "change_percentage": round(pct_change, 1),
                        "current_spend": round(curr_spend, 2),
                        "message": f"Your {cat_name.lower()} spend is up {abs(pct_change):.0f}% MoM. Reducing {merchant_name} orders by 2/week could save ₹{potential_savings:.0f}.",
                        "potential_savings": round(potential_savings, 2),
                        "severity": "high" if pct_change > 50 else "medium"
                    })
        
        return {"advice": sorted(advice, key=lambda x: abs(x["change_percentage"]), reverse=True)[:5]}
    except Exception as e:
        print(f"⚠️  Error generating AI advice: {e}")
        return {"advice": []}
    finally:
        session.close()


@router.get("/anomalies")
async def detect_anomalies(
    threshold_zscore: float = Query(2.5, ge=1.0, le=5.0),
    user: UserDep = Depends(get_current_user)
):
    """
    Expense Anomaly Detection - Flag outlier transactions using z-score or percentile
    Returns transactions that are significantly higher than usual for their category/merchant
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get last 90 days for baseline
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=90)
        
        # Calculate mean and std dev per category
        category_stats = session.query(
            TxnEnriched.category_code,
            func.avg(func.abs(TxnFact.amount)).label('mean'),
            func.stddev(func.abs(TxnFact.amount)).label('stddev')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= start_date.date(),
            TxnFact.txn_date <= end_date.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.isnot(None)
        ).group_by(TxnEnriched.category_code).all()
        
        stats_map = {cat: (float(mean), float(stddev or 0)) for cat, mean, stddev in category_stats}
        
        # Get recent transactions (last 30 days) and flag anomalies
        recent_txns = session.query(
            TxnFact.txn_id,
            TxnFact.merchant_name_norm,
            TxnFact.amount,
            TxnFact.txn_date,
            TxnEnriched.category_code
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= (end_date - timedelta(days=30)).date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.isnot(None)
        ).all()
        
        anomalies = []
        for txn_id, merchant, amount, txn_date, cat in recent_txns:
            if cat in stats_map:
                mean, stddev = stats_map[cat]
                if stddev > 0:
                    zscore = (float(amount) - mean) / stddev
                    if zscore > threshold_zscore:
                        cat_name = session.execute(text("""
                            SELECT category_name FROM spendsense.dim_category WHERE category_code = :cat
                        """), {"cat": cat}).scalar() or cat
                        
                        anomalies.append({
                            "txn_id": str(txn_id),
                            "merchant": merchant or "Unknown",
                            "amount": float(amount),
                            "date": txn_date.isoformat() if isinstance(txn_date, date) else str(txn_date),
                            "category": cat,
                            "category_name": cat_name,
                            "zscore": round(zscore, 2),
                            "message": f"Spike detected: ₹{float(amount):,.0f} at {merchant or 'Unknown'} — {zscore:.1f}× your usual {cat_name.lower()} spend."
                        })
        
        return {
            "anomalies": sorted(anomalies, key=lambda x: x["zscore"], reverse=True),
            "threshold_zscore": threshold_zscore
        }
    except Exception as e:
        print(f"⚠️  Error detecting anomalies: {e}")
        return {"anomalies": [], "threshold_zscore": threshold_zscore}
    finally:
        session.close()


@router.get("/category-trends")
async def get_category_trends(
    months: int = Query(6, ge=1, le=12),
    user: UserDep = Depends(get_current_user)
):
    """
    Category Trends Over Time - Line/stacked area chart data showing category evolution
    Returns data for 6-12 months showing trends like "Groceries ↑ +8%"
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=months * 30)
        
        # Get monthly category spending
        result = session.query(
            func.date_trunc('month', TxnFact.txn_date).label('month'),
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= start_date.date(),
            TxnFact.txn_date <= end_date.date(),
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.isnot(None),
            TxnEnriched.category_code.notin_(['income', 'transfers', 'others'])
        ).group_by(
            func.date_trunc('month', TxnFact.txn_date),
            TxnEnriched.category_code
        ).order_by('month', 'spend').all()
        
        # Organize by category
        category_data = {}
        for month, cat, spend in result:
            if cat not in category_data:
                category_data[cat] = []
            category_data[cat].append({
                "month": month.isoformat() if isinstance(month, datetime) else str(month),
                "spend": float(spend)
            })
        
        # Calculate trends (first vs last month)
        trends = []
        for cat, data in category_data.items():
            if len(data) >= 2:
                first_spend = data[0]["spend"]
                last_spend = data[-1]["spend"]
                if first_spend > 0:
                    pct_change = ((last_spend - first_spend) / first_spend) * 100
                    cat_name = session.execute(text("""
                        SELECT category_name FROM spendsense.dim_category WHERE category_code = :cat
                    """), {"cat": cat}).scalar() or cat
                    
                    trends.append({
                        "category": cat,
                        "category_name": cat_name,
                        "change_percentage": round(pct_change, 1),
                        "trend": "↑" if pct_change > 0 else "↓",
                        "data": data
                    })
        
        return {
            "period_months": months,
            "categories": sorted(trends, key=lambda x: abs(x["change_percentage"]), reverse=True)
        }
    except Exception as e:
        print(f"⚠️  Error getting category trends: {e}")
        return {"period_months": months, "categories": []}
    finally:
        session.close()


@router.get("/income-expense")
async def get_income_expense_overlay(
    months: int = Query(6, ge=1, le=12),
    user: UserDep = Depends(get_current_user)
):
    """
    Income vs Expense Overlay - Dual-axis line graph
    Returns monthly income, expenses, and net savings over time
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=months * 30)
        
        # Get monthly income and expenses
        result = session.query(
            func.date_trunc('month', TxnFact.txn_date).label('month'),
            func.sum(func.case((TxnFact.direction == 'credit', TxnFact.amount), else_=0)).label('income'),
            func.sum(func.case((TxnFact.direction == 'debit', TxnFact.amount), else_=0)).label('expenses')
        ).outerjoin(
            TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
        ).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= start_date.date(),
            TxnFact.txn_date <= end_date.date(),
            # Exclude transfers from both
            (TxnEnriched.category_code.is_(None)) | (TxnEnriched.category_code != 'transfers')
        ).group_by(func.date_trunc('month', TxnFact.txn_date)).order_by('month').all()
        
        data = []
        cumulative_savings = 0.0
        for month, income, expenses in result:
            income_amt = float(income or 0)
            expense_amt = float(expenses or 0)
            net = income_amt - expense_amt
            cumulative_savings += net
            
            data.append({
                "month": month.isoformat() if isinstance(month, datetime) else str(month),
                "income": income_amt,
                "expenses": expense_amt,
                "net_savings": net,
                "cumulative_savings": cumulative_savings
            })
        
        return {
            "period_months": months,
            "data": data
        }
    except Exception as e:
        print(f"⚠️  Error getting income-expense overlay: {e}")
        return {"period_months": months, "data": []}
    finally:
        session.close()


@router.get("/budget-deviation")
async def get_budget_deviation(
    period_id: Optional[str] = Query(None),
    user: UserDep = Depends(get_current_user)
):
    """
    Budget Integration - Show actual spend vs planned by category
    Links SpendSense ↔ BudgetPilot to show deviations
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get current period if not specified
        if not period_id:
            # Get most recent active period
            period_row = session.execute(text("""
                SELECT period_id FROM budgetpilot.budget_period
                WHERE user_id = :uid
                ORDER BY period_start DESC
                LIMIT 1
            """), {"uid": str(user_uuid)}).fetchone()
            
            if not period_row:
                return {"deviations": [], "message": "No budget period found"}
            
            period_id = str(period_row[0])
        
        period_uuid = uuid.UUID(period_id) if isinstance(period_id, str) else period_id
        
        # Get period dates
        period_info = session.execute(text("""
            SELECT period_start, period_end FROM budgetpilot.budget_period
            WHERE period_id = :pid AND user_id = :uid
        """), {"pid": str(period_uuid), "uid": str(user_uuid)}).fetchone()
        
        if not period_info:
            return {"deviations": [], "message": "Period not found"}
        
        period_start, period_end = period_info
        
        # Get planned budgets
        planned = session.execute(text("""
            SELECT band, category, planned_amount
            FROM budgetpilot.user_budget_category_commit
            WHERE user_id = :uid AND period_id = :pid
        """), {"uid": str(user_uuid), "pid": str(period_uuid)}).fetchall()
        
        # Get actual spending
        actuals = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('actual')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= period_start,
            TxnFact.txn_date <= period_end,
            TxnFact.direction == 'debit',
            TxnEnriched.category_code.isnot(None)
        ).group_by(TxnEnriched.category_code).all()
        
        actual_map = {cat: float(amt) for cat, amt in actuals}
        
        deviations = []
        for band, category, planned_amt in planned:
            actual_amt = actual_map.get(category, 0)
            variance = actual_amt - float(planned_amt or 0)
            variance_pct = (variance / float(planned_amt or 1)) * 100 if planned_amt else 0
            
            deviations.append({
                "band": band,
                "category": category,
                "planned": float(planned_amt or 0),
                "actual": actual_amt,
                "variance": variance,
                "variance_percentage": round(variance_pct, 1),
                "message": f"You spent ₹{abs(variance):,.0f} {'more' if variance > 0 else 'less'} on {category} than planned this period."
            })
        
        return {
            "period_id": period_id,
            "deviations": sorted(deviations, key=lambda x: abs(x["variance"]), reverse=True)
        }
    except Exception as e:
        print(f"⚠️  Error getting budget deviation: {e}")
        return {"deviations": [], "message": str(e)}
    finally:
        session.close()


@router.get("/goal-impact")
async def get_goal_impact(
    user: UserDep = Depends(get_current_user)
):
    """
    Goal-linked Spending - Show how spending affects financial goals
    Highlights categories tied to goals and progress tracking
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get active goals
        goals = session.execute(text("""
            SELECT goal_id, goal_name, target_amount, current_amount, target_date
            FROM goals.user_goals_master
            WHERE user_id = :uid AND status = 'active'
        """), {"uid": str(user_uuid)}).fetchall()
        
        if not goals:
            return {"goals": [], "message": "No active goals found"}
        
        # Get current month spending by category
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            month_end = datetime.combine(date(now.year + 1, 1, 1) - timedelta(days=1), datetime.max.time())
        else:
            month_end = datetime.combine(date(now.year, now.month + 1, 1) - timedelta(days=1), datetime.max.time())
        
        category_spend = session.query(
            TxnEnriched.category_code,
            func.sum(func.abs(TxnFact.amount)).label('spend')
        ).join(TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= month_start.date(),
            TxnFact.txn_date <= month_end.date(),
            TxnFact.direction == 'debit'
        ).group_by(TxnEnriched.category_code).all()
        
        spend_map = {cat: float(amt) for cat, amt in category_spend}
        
        goal_impacts = []
        for goal_id, goal_name, target, current, target_date in goals:
            # Simple heuristic: if goal is savings-related, show impact of wants spending
            # For other goals, show relevant category spending
            total_wants = sum(amt for cat, amt in spend_map.items() 
                            if cat in ['food_dining', 'entertainment', 'shopping'])
            
            progress_pct = (float(current or 0) / float(target or 1)) * 100 if target else 0
            
            goal_impacts.append({
                "goal_id": str(goal_id),
                "goal_name": goal_name,
                "target_amount": float(target or 0),
                "current_amount": float(current or 0),
                "progress_percentage": round(progress_pct, 1),
                "target_date": target_date.isoformat() if target_date else None,
                "impact_message": f"You're {progress_pct:.0f}% on track to fund your goal '{goal_name}' by {target_date.strftime('%B %Y') if target_date else 'target date'}."
            })
        
        return {"goals": goal_impacts}
    except Exception as e:
        print(f"⚠️  Error getting goal impact: {e}")
        return {"goals": [], "message": str(e)}
    finally:
        session.close()


@router.get("/cashflow-projection")
async def get_cashflow_projection(
    months_ahead: int = Query(1, ge=1, le=3),
    user: UserDep = Depends(get_current_user)
):
    """
    Cash Flow Projection - Use income trends + recurring spends to project next-month liquidity
    Returns projected balance with sparkline data
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        
        # Get last 3 months income and expenses
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=90)
        
        monthly_data = session.query(
            func.date_trunc('month', TxnFact.txn_date).label('month'),
            func.sum(func.case((TxnFact.direction == 'credit', TxnFact.amount), else_=0)).label('income'),
            func.sum(func.case((TxnFact.direction == 'debit', TxnFact.amount), else_=0)).label('expenses')
        ).outerjoin(
            TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
        ).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.txn_date >= start_date.date(),
            TxnFact.txn_date <= end_date.date(),
            (TxnEnriched.category_code.is_(None)) | (TxnEnriched.category_code != 'transfers')
        ).group_by(func.date_trunc('month', TxnFact.txn_date)).order_by('month').all()
        
        if not monthly_data:
            return {"projection": None, "message": "Insufficient data for projection"}
        
        # Calculate averages
        avg_income = sum(float(inc or 0) for _, inc, _ in monthly_data) / len(monthly_data)
        avg_expenses = sum(float(exp or 0) for _, _, exp in monthly_data) / len(monthly_data)
        
        # Get current balance (simplified: sum of all transactions)
        all_net = session.query(
            func.sum(func.case((TxnFact.direction == 'credit', TxnFact.amount), else_=-TxnFact.amount))
        ).outerjoin(
            TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
        ).filter(
            TxnFact.user_id == user_uuid,
            (TxnEnriched.category_code.is_(None)) | (TxnEnriched.category_code != 'transfers')
        ).scalar()
        
        current_balance = float(all_net or 0)
        
        # Project forward
        projections = []
        balance = current_balance
        for i in range(months_ahead):
            next_month = end_date + timedelta(days=30 * (i + 1))
            balance += (avg_income - avg_expenses)
            projections.append({
                "month": next_month.strftime("%Y-%m"),
                "projected_income": round(avg_income, 2),
                "projected_expenses": round(avg_expenses, 2),
                "projected_balance": round(balance, 2),
                "net_flow": round(avg_income - avg_expenses, 2)
            })
        
        return {
            "current_balance": round(current_balance, 2),
            "average_monthly_income": round(avg_income, 2),
            "average_monthly_expenses": round(avg_expenses, 2),
            "projections": projections
        }
    except Exception as e:
        print(f"⚠️  Error getting cashflow projection: {e}")
        return {"projection": None, "message": str(e)}
    finally:
        session.close()


@router.get("/forecast")
async def get_spending_forecast(
    months: int = Query(6, ge=3, le=18),
    user: UserDep = Depends(get_current_user)
):
    """
    Predict next-month spending per category using simple linear regression trend.
    Acts as a lightweight forecast to highlight categories likely to spike.
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=months * 30)

        rows = session.execute(text("""
            SELECT 
                date_trunc('month', tf.txn_date)::date AS month,
                COALESCE(te.category_code, 'uncategorized') AS category_code,
                SUM(CASE WHEN tf.direction = 'debit' THEN tf.amount ELSE 0 END) AS spend
            FROM spendsense.txn_fact tf
            LEFT JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
            WHERE tf.user_id = :uid
              AND tf.direction = 'debit'
              AND tf.txn_date >= :start_date
              AND tf.txn_date <= :end_date
            GROUP BY month, category_code
            ORDER BY month ASC
        """), {
            "uid": str(user_uuid),
            "start_date": start_date.date(),
            "end_date": end_date.date()
        }).fetchall()

        if not rows:
            return {
                "period": {
                    "start": start_date.date().isoformat(),
                    "end": end_date.date().isoformat(),
                    "next_month": None
                },
                "forecasts": []
            }

        # Build time series per category
        category_series: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        months_seen = sorted({row.month for row in rows})
        month_index_map = {month: idx for idx, month in enumerate(months_seen)}

        for row in rows:
            category_series[row.category_code].append({
                "month": row.month,
                "index": month_index_map[row.month],
                "spend": float(row.spend or 0)
            })

        # Fetch category names once
        category_names = session.execute(text("""
            SELECT category_code, category_name 
            FROM spendsense.dim_category
        """)).fetchall()
        category_name_map = {code: name for code, name in category_names}
        category_name_map.setdefault('uncategorized', 'Uncategorized')

        forecasts = []
        for category_code, series in category_series.items():
            if not series:
                continue
            series_sorted = sorted(series, key=lambda x: x["index"])
            ys = [point["spend"] for point in series_sorted]
            xs = list(range(len(series_sorted)))
            last_value = ys[-1]

            if len(xs) >= 2:
                x_mean = sum(xs) / len(xs)
                y_mean = sum(ys) / len(ys)
                numerator = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(len(xs)))
                denominator = sum((xs[i] - x_mean) ** 2 for i in range(len(xs))) or 1
                slope = numerator / denominator
                intercept = y_mean - slope * x_mean
                next_index = len(xs)
                forecast_value = intercept + slope * next_index
                method = "trend"
            else:
                forecast_value = ys[-1]
                method = "recent_value"

            if len(series_sorted) >= 3:
                recent_avg = sum(ys[-3:]) / min(3, len(ys))
                forecast_value = (forecast_value + recent_avg) / 2

            forecast_value = max(0.0, float(forecast_value))
            change_pct = ((forecast_value - last_value) / last_value * 100) if last_value else 0.0
            confidence = min(1.0, len(series_sorted) / 6)

            forecasts.append({
                "category": category_code,
                "category_name": category_name_map.get(category_code, category_code.title()),
                "predicted_amount": round(forecast_value, 2),
                "last_amount": round(last_value, 2),
                "change_percentage": round(change_pct, 2),
                "method": method,
                "confidence": round(confidence, 2),
                "data_points": len(series_sorted)
            })

        next_month = (end_date.replace(day=1) + timedelta(days=32)).replace(day=1).date()

        return {
            "period": {
                "start": start_date.date().isoformat(),
                "end": end_date.date().isoformat(),
                "next_month": next_month.isoformat()
            },
            "forecasts": sorted(forecasts, key=lambda x: x["predicted_amount"], reverse=True)
        }
    except Exception as e:
        print(f"⚠️  Error generating forecast: {e}")
        return {"period": None, "forecasts": []}
    finally:
        session.close()


@router.get("/merchant-metrics")
async def get_merchant_metrics(
    limit: int = Query(10, ge=3, le=50),
    lookback_months: int = Query(3, ge=1, le=12),
    user: UserDep = Depends(get_current_user)
):
    """
    Aggregated merchant metrics including totals, frequency, and trend.
    """
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id

        end_date = datetime.utcnow().date()
        start_date = (datetime.utcnow() - timedelta(days=lookback_months * 30)).date()
        prev_end_date = start_date - timedelta(days=1)
        prev_start_date = prev_end_date - timedelta(days=lookback_months * 30)

        merchant_rows = session.execute(text("""
            SELECT
                tf.merchant_name_norm AS merchant,
                SUM(CASE WHEN tf.direction = 'debit' THEN tf.amount ELSE 0 END) AS total_spend,
                COUNT(*) AS txn_count,
                AVG(CASE WHEN tf.direction = 'debit' THEN tf.amount ELSE NULL END) AS avg_ticket,
                MAX(tf.txn_date) AS last_txn,
                MIN(tf.txn_date) AS first_txn
            FROM spendsense.txn_fact tf
            WHERE tf.user_id = :uid
              AND tf.direction = 'debit'
              AND tf.merchant_name_norm IS NOT NULL
              AND tf.txn_date >= :start_date
              AND tf.txn_date <= :end_date
            GROUP BY tf.merchant_name_norm
            ORDER BY total_spend DESC
            LIMIT :limit
        """), {
            "uid": str(user_uuid),
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit
        }).fetchall()

        if not merchant_rows:
            return {
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                },
                "merchants": []
            }

        merchants = [row.merchant for row in merchant_rows if row.merchant]

        if not merchants:
            return {
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                },
                "merchants": []
            }

        merchant_category_rows = session.query(
            TxnFact.merchant_name_norm.label("merchant"),
            func.coalesce(TxnEnriched.category_code, 'uncategorized').label("category_code"),
            func.sum(func.case((TxnFact.direction == 'debit', TxnFact.amount), else_=0)).label("spend")
        ).outerjoin(
            TxnEnriched, TxnFact.txn_id == TxnEnriched.txn_id
        ).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.direction == 'debit',
            TxnFact.merchant_name_norm.in_(merchants),
            TxnFact.txn_date >= start_date,
            TxnFact.txn_date <= end_date
        ).group_by(
            TxnFact.merchant_name_norm,
            TxnEnriched.category_code
        ).all()

        prev_rows = session.query(
            TxnFact.merchant_name_norm.label("merchant"),
            func.sum(func.case((TxnFact.direction == 'debit', TxnFact.amount), else_=0)).label("total_spend")
        ).filter(
            TxnFact.user_id == user_uuid,
            TxnFact.direction == 'debit',
            TxnFact.merchant_name_norm.in_(merchants),
            TxnFact.txn_date >= prev_start_date,
            TxnFact.txn_date <= prev_end_date
        ).group_by(
            TxnFact.merchant_name_norm
        ).all()

        category_names = session.execute(text("""
            SELECT category_code, category_name 
            FROM spendsense.dim_category
        """)).fetchall()
        category_name_map = {code: name for code, name in category_names}
        category_name_map.setdefault('uncategorized', 'Uncategorized')

        category_spend_map: Dict[str, Dict[str, float]] = defaultdict(dict)
        for row in merchant_category_rows:
            category_spend_map[row.merchant][row.category_code] = float(row.spend or 0)

        prev_spend_map = {row.merchant: float(row.total_spend or 0) for row in prev_rows}

        lookback_days = max(1, (end_date - start_date).days)

        metrics = []
        for row in merchant_rows:
            merchant = row.merchant
            if not merchant:
                continue
            total_spend = float(row.total_spend or 0)
            txn_count = int(row.txn_count or 0)
            avg_ticket = float(row.avg_ticket or 0)
            last_txn = row.last_txn.isoformat() if row.last_txn else None
            first_txn = row.first_txn.isoformat() if row.first_txn else None

            category_spend = category_spend_map.get(merchant, {})
            if category_spend:
                top_category_code = max(category_spend.items(), key=lambda kv: kv[1])[0]
                top_category_name = category_name_map.get(top_category_code, top_category_code.title())
            else:
                top_category_code = 'uncategorized'
                top_category_name = 'Uncategorized'

            prev_total = prev_spend_map.get(merchant, 0.0)
            trend_change = ((total_spend - prev_total) / prev_total * 100) if prev_total else 0.0

            metrics.append({
                "merchant": merchant,
                "total_spending": round(total_spend, 2),
                "transaction_count": txn_count,
                "average_ticket": round(avg_ticket, 2),
                "daily_frequency": round(txn_count / lookback_days, 2),
                "last_transaction": last_txn,
                "first_transaction": first_txn,
                "top_category": top_category_name,
                "merchant_type": top_category_name,
                "trend_percentage": round(trend_change, 2)
            })

        return {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "previous_start": prev_start_date.isoformat(),
                "previous_end": prev_end_date.isoformat()
            },
            "merchants": metrics
        }
    except Exception as e:
        print(f"⚠️  Error getting merchant metrics: {e}")
        return {
            "period": None,
            "merchants": []
        }
    finally:
        session.close()

