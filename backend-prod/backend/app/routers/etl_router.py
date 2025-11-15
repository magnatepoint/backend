"""
New ETL Router - Clean pipeline structure
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from uuid import uuid4
import os
import tempfile
from typing import Optional, List, Dict, Any

from celery_app import celery_app
from app.models.etl_models import ETLBatch, GmailAccount
from app.database.postgresql import SessionLocal
from app.routers.auth import get_current_user, UserDep

router = APIRouter(prefix="/api/etl", tags=["ETL"])

UPLOAD_DIR = "/tmp/etl_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload/file")
async def etl_upload_file(
    file: UploadFile = File(...),
    user: UserDep = Depends(get_current_user),
):
    """
    Upload file for ETL processing.
    Supports: CSV, XLS, XLSX, PDF
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".csv", ".xls", ".xlsx", ".pdf"]:
        raise HTTPException(status_code=400, detail="Unsupported file format. Supported: CSV, XLS, XLSX, PDF")
    
    session = SessionLocal()
    try:
        batch_id = str(uuid4())
        file_path = os.path.join(UPLOAD_DIR, f"{batch_id}{ext}")
        
        # Save uploaded file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Create batch record
        batch = ETLBatch(
            batch_id=batch_id,
            user_id=user.user_id,
            source="file",
            original_filename=file.filename,
            status="pending",
        )
        
        session.add(batch)
        session.commit()
        
        # Dispatch to Celery task
        try:
            celery_app.send_task(
                "app.tasks.etl_tasks.parse_file_task",
                args=[batch_id, file_path, ext, user.user_id],
                queue="ingest",
            )
        except Exception as e:
            # Fallback to sync processing if Celery unavailable
            from app.tasks.etl_tasks import parse_file_task
            parse_file_task(batch_id, file_path, ext, user.user_id)
        
        return {
            "message": "ETL started",
            "batch_id": batch_id,
            "status": "pending"
        }
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start ETL: {str(e)}")
    finally:
        session.close()


@router.get("/batch/{batch_id}")
async def get_batch_status(
    batch_id: str,
    user: UserDep = Depends(get_current_user),
):
    """
    Get status of ETL batch.
    """
    session = SessionLocal()
    try:
        batch = (
            session.query(ETLBatch)
            .filter_by(batch_id=batch_id, user_id=user.user_id)
            .first()
        )
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        
        return {
            "batch_id": batch.batch_id,
            "status": batch.status,
            "source": batch.source,
            "original_filename": batch.original_filename,
            "total": batch.total_records,
            "valid": batch.valid_records,
            "invalid": batch.invalid_records,
            "processed": batch.processed_records,
            "failed": batch.failed_records,
            "error_message": batch.error_message,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
        }
    finally:
        session.close()


@router.get("/batch/{batch_id}/transactions")
async def get_batch_transactions(
    batch_id: str,
    user: UserDep = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
):
    """
    Get staged transactions for a batch.
    """
    from app.models.etl_models import StagedTransaction
    
    session = SessionLocal()
    try:
        # Verify batch belongs to user
        batch = (
            session.query(ETLBatch)
            .filter_by(batch_id=batch_id, user_id=user.user_id)
            .first()
        )
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        
        # Get transactions
        txns = (
            session.query(StagedTransaction)
            .filter_by(batch_id=batch_id)
            .offset(offset)
            .limit(limit)
            .all()
        )
        
        return {
            "batch_id": batch_id,
            "transactions": [
                {
                    "id": t.id,
                    "txn_date": t.txn_date.isoformat() if t.txn_date else None,
                    "description": t.description,
                    "amount": float(t.amount) if t.amount else 0,
                    "direction": t.direction,
                    "category": t.category,
                    "subcategory": t.subcategory,
                    "category_confidence": float(t.category_confidence) if t.category_confidence else None,
                    "bank_code": t.bank_code,
                }
                for t in txns
            ],
            "total": batch.total_records,
        }
    finally:
        session.close()


# Gmail ETL Models
class GmailTriggerIn(BaseModel):
    gmail_account_id: str
    mode: str = "since_last"  # "since_last" | "full" | "date_range"
    from_date: Optional[str] = None
    to_date: Optional[str] = None


@router.post("/gmail/trigger")
async def trigger_gmail_etl(
    body: GmailTriggerIn,
    user: UserDep = Depends(get_current_user),
):
    """
    Trigger Gmail ETL for a connected Gmail account.
    
    Fetches emails and extracts transactions, loans, OTT subscriptions.
    """
    session = SessionLocal()
    try:
        gmail_acc = (
            session.query(GmailAccount)
            .filter_by(id=body.gmail_account_id, user_id=user.user_id, is_active=True)
            .first()
        )
        if not gmail_acc:
            raise HTTPException(status_code=404, detail="Gmail account not found or inactive")

        batch_id = str(uuid4())

        batch = ETLBatch(
            batch_id=batch_id,
            user_id=user.user_id,
            source="gmail",
            status="pending",
        )

        session.add(batch)
        session.commit()

        # Dispatch to Celery task
        try:
            celery_app.send_task(
                "app.tasks.etl_tasks.parse_gmail_task",
                args=[batch_id, gmail_acc.id, user.user_id],
                queue="ingest",
            )
        except Exception as e:
            # Fallback to sync processing if Celery unavailable
            from app.tasks.etl_tasks import parse_gmail_task
            parse_gmail_task(batch_id, gmail_acc.id, user.user_id)

        return {
            "message": "Gmail ETL started",
            "batch_id": batch_id,
            "status": "pending",
            "gmail_account": gmail_acc.email
        }
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start Gmail ETL: {str(e)}")
    finally:
        session.close()

