"""
Celery worker tasks for ETL pipeline (Excel, PDF, CSV)
"""
from celery import shared_task
from typing import Optional
from app.database.postgresql import SessionLocal
from app.routers.etl import (
    _sync_parse_and_stage_excel,
    _sync_parse_and_stage_pdf,
    _sync_parse_and_stage_csv
)
import os
import tempfile
import logging

logger = logging.getLogger(__name__)


@shared_task(name="process_excel_etl", bind=True, max_retries=3)
def process_excel_etl(
    self,
    user_id: str,
    batch_id: str,
    file_name: str,
    file_content: bytes,
    bank_code: str = "GENERIC"
):
    """
    Process Excel file (.xlsx, .xls) in background worker.
    
    Args:
        user_id: User UUID
        batch_id: Batch UUID
        file_name: Original file name
        file_content: File bytes
        bank_code: Bank code (HDFC, ICICI, SBI, GENERIC)
    
    Returns:
        dict with records_staged, valid, invalid counts
    """
    temp_path = None
    try:
        # Save file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file_name)[1]) as tmp:
            tmp.write(file_content)
            temp_path = tmp.name
        
        logger.info(f"Processing Excel ETL: batch={batch_id}, bank={bank_code}, file={file_name}")
        
        # Process Excel file
        records_staged, valid, invalid = _sync_parse_and_stage_excel(
            user_id=user_id,
            batch_id=batch_id,
            file_name=file_name,
            path=temp_path,
            bank_code=bank_code
        )
        
        logger.info(f"Excel ETL completed: batch={batch_id}, staged={records_staged}, valid={valid}, invalid={invalid}")
        
        return {
            "status": "success",
            "batch_id": batch_id,
            "records_staged": records_staged,
            "valid": valid,
            "invalid": invalid
        }
        
    except Exception as e:
        logger.error(f"Excel ETL failed for batch {batch_id}: {e}", exc_info=True)
        # Retry on transient errors
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        return {
            "status": "error",
            "batch_id": batch_id,
            "error": str(e)
        }
    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")


@shared_task(name="process_pdf_etl", bind=True, max_retries=3)
def process_pdf_etl(
    self,
    user_id: str,
    batch_id: str,
    file_name: str,
    file_content: bytes,
    bank_code: str = "GENERIC",
    password: Optional[str] = None
):
    """
    Process PDF bank statement in background worker.
    
    Args:
        user_id: User UUID
        batch_id: Batch UUID
        file_name: Original file name
        file_content: File bytes
        bank_code: Bank code (HDFC, ICICI, SBI, GENERIC)
        password: Optional PDF password
    
    Returns:
        dict with records_staged, valid, invalid counts
    """
    temp_path = None
    try:
        # Save file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(file_content)
            temp_path = tmp.name
        
        logger.info(f"Processing PDF ETL: batch={batch_id}, bank={bank_code}, file={file_name}")

        # Process PDF file
        records_staged, valid, invalid = _sync_parse_and_stage_pdf(
            user_id=user_id,
            batch_id=batch_id,
            file_name=file_name,
            file_or_bytes=temp_path,
            bank_code=bank_code,
            password=password
        )
        
        logger.info(f"PDF ETL completed: batch={batch_id}, staged={records_staged}, valid={valid}, invalid={invalid}")
        
        return {
            "status": "success",
            "batch_id": batch_id,
            "records_staged": records_staged,
            "valid": valid,
            "invalid": invalid
        }
        
    except Exception as e:
        logger.error(f"PDF ETL failed for batch {batch_id}: {e}", exc_info=True)
        # Retry on transient errors
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        return {
            "status": "error",
            "batch_id": batch_id,
            "error": str(e)
        }
    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")


@shared_task(name="process_csv_etl", bind=True, max_retries=3)
def process_csv_etl(
    self,
    user_id: str,
    batch_id: str,
    file_name: str,
    file_content: bytes
):
    """
    Process CSV file in background worker.
    
    Args:
        user_id: User UUID
        batch_id: Batch UUID
        file_name: Original file name
        file_content: File bytes
    
    Returns:
        dict with records_staged, valid, invalid counts
    """
    temp_path = None
    try:
        # Save file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            tmp.write(file_content)
            temp_path = tmp.name
        
        logger.info(f"Processing CSV ETL: batch={batch_id}, file={file_name}")
        
        # Process CSV file
        records_staged, valid, invalid = _sync_parse_and_stage_csv(
            user_id=user_id,
            batch_id=batch_id,
            file_name=file_name,
            path=temp_path
        )
        
        logger.info(f"CSV ETL completed: batch={batch_id}, staged={records_staged}, valid={valid}, invalid={invalid}")
        
        return {
            "status": "success",
            "batch_id": batch_id,
            "records_staged": records_staged,
            "valid": valid,
            "invalid": invalid
        }
        
    except Exception as e:
        logger.error(f"CSV ETL failed for batch {batch_id}: {e}", exc_info=True)
        # Retry on transient errors
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        return {
            "status": "error",
            "batch_id": batch_id,
            "error": str(e)
        }
    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")

