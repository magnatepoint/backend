"""
Celery tasks for ETL pipeline
"""
from celery import shared_task
from uuid import uuid4
from app.services.parsers.detect_bank_and_parse import detect_bank_and_parse
from app.services.parsers.gmail_parser import gmail_messages_to_staged_transactions
from app.services.categorizer_new import categorize_transaction, categorize_batch
from app.models.etl_models import ETLBatch, StagedTransaction, EmailMessageMeta, GmailAccount
from app.database.postgresql import SessionLocal
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


@shared_task(name="app.tasks.etl_tasks.parse_file_task", bind=True, max_retries=3)
def parse_file_task(self, batch_id: str, file_path: str, ext: str, user_id: str):
    """
    Parse uploaded file and stage transactions.
    
    Args:
        batch_id: ETL batch ID
        file_path: Path to uploaded file
        ext: File extension (.csv, .xlsx, .pdf)
        user_id: User ID
    """
    session: Session = SessionLocal()
    try:
        batch = session.query(ETLBatch).filter_by(batch_id=batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found")
            return
        
        # Parse file
        logger.info(f"Parsing file {file_path} for batch {batch_id}")
        records = detect_bank_and_parse(file_path, ext)
        
        batch.total_records = len(records)
        batch.valid_records = len(records)
        batch.status = "parsed"
        session.commit()
        
        # Stage transactions
        for r in records:
            tx = StagedTransaction(
                id=str(uuid4()),
                batch_id=batch_id,
                user_id=user_id,
                account_number_masked=r.get("account_number_masked"),
                bank_code=r.get("bank_code"),
                txn_date=r.get("txn_date"),
                posted_date=r.get("posted_date"),
                description=r.get("description"),
                amount=r.get("amount"),
                direction=r.get("direction"),
                balance_after=r.get("balance_after"),
                channel=r.get("channel"),
                raw_meta=r.get("raw_meta"),
            )
            session.add(tx)
        
        session.commit()
        logger.info(f"Staged {len(records)} transactions for batch {batch_id}")
        
        # Trigger categorization
        categorize_transactions_task.delay(batch_id)
        
    except Exception as e:
        logger.error(f"Error parsing file for batch {batch_id}: {e}", exc_info=True)
        if batch:
            batch.status = "failed"
            batch.error_message = str(e)
            session.commit()
        raise
    finally:
        session.close()


@shared_task(name="app.tasks.etl_tasks.categorize_transactions_task", bind=True, max_retries=3)
def categorize_transactions_task(self, batch_id: str):
    """
    Categorize all transactions in a batch.
    
    Args:
        batch_id: ETL batch ID
    """
    session: Session = SessionLocal()
    try:
        txns = session.query(StagedTransaction).filter_by(batch_id=batch_id).all()
        
        if not txns:
            logger.warning(f"No transactions found for batch {batch_id}")
            return
        
        logger.info(f"Categorizing {len(txns)} transactions for batch {batch_id}")
        
        for t in txns:
            cat, sub, conf = categorize_transaction(
                t.description or "",
                float(t.amount or 0),
                t.channel,
                t.raw_meta
            )
            t.category = cat
            t.subcategory = sub
            t.category_confidence = conf
        
        batch = session.query(ETLBatch).filter_by(batch_id=batch_id).first()
        if batch:
            batch.status = "categorized"
            batch.processed_records = len(txns)
        
        session.commit()
        logger.info(f"Categorized {len(txns)} transactions for batch {batch_id}")
        
    except Exception as e:
        logger.error(f"Error categorizing transactions for batch {batch_id}: {e}", exc_info=True)
        if batch:
            batch.status = "failed"
            batch.error_message = str(e)
            session.commit()
        raise
    finally:
        session.close()


@shared_task(name="app.tasks.etl_tasks.parse_gmail_task", bind=True, max_retries=3)
def parse_gmail_task(self, batch_id: str, gmail_account_id: str, user_id: str):
    """
    Parse Gmail messages and extract transactions.
    
    1. Fetch Gmail messages for that account (you plug in your own Gmail service).
    2. Convert to normalized staged transactions.
    3. Store EmailMessageMeta + StagedTransaction.
    4. Trigger categorization.
    
    Args:
        batch_id: ETL batch ID
        gmail_account_id: Gmail account ID
        user_id: User ID
    """
    session: Session = SessionLocal()
    try:
        batch = session.query(ETLBatch).filter_by(batch_id=batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found")
            return

        gmail_acc = (
            session.query(GmailAccount)
            .filter_by(id=gmail_account_id, user_id=user_id, is_active=True)
            .first()
        )
        if not gmail_acc:
            batch.status = "failed"
            batch.error_message = "Gmail account not found or inactive"
            session.commit()
            return

        # TODO: replace this with your real Gmail fetch
        # e.g. messages = GmailService(gmail_acc).fetch_new_transaction_emails()
        # For now, this is a stub - you'll need to implement Gmail API integration
        messages: List[Dict[str, Any]] = []  # stub
        
        logger.info(f"Fetching Gmail messages for account {gmail_account_id}, batch {batch_id}")
        # TODO: Implement actual Gmail fetching here
        # Example:
        # from app.services.gmail_service import GmailService
        # gmail_service = GmailService(gmail_acc)
        # messages = gmail_service.fetch_transaction_emails()

        # Convert to staged transactions
        records = gmail_messages_to_staged_transactions(
            user_id=user_id,
            gmail_account_id=gmail_account_id,
            batch_id=batch_id,
            messages=messages,
        )

        batch.total_records = len(records)
        batch.valid_records = len(records)

        # Store email metadata
        for msg in messages:
            em = EmailMessageMeta(
                id=str(uuid4()),
                batch_id=batch_id,
                user_id=user_id,
                gmail_account_id=gmail_account_id,
                message_id=msg.get("id"),
                thread_id=msg.get("thread_id"),
                subject=msg.get("subject"),
                from_addr=msg.get("from"),
                to_addr=msg.get("to"),
                raw_snippet=msg.get("snippet"),
                parsed=True,
            )
            session.add(em)

        # Store staged transactions
        for r in records:
            tx = StagedTransaction(
                id=str(uuid4()),
                batch_id=batch_id,
                user_id=user_id,
                account_number_masked=r.get("account_number_masked"),
                bank_code=r.get("bank_code"),
                txn_date=r.get("txn_date"),
                posted_date=r.get("posted_date"),
                description=r.get("description"),
                amount=r.get("amount"),
                direction=r.get("direction"),
                balance_after=r.get("balance_after"),
                channel=r.get("channel"),
                raw_meta=r.get("raw_meta"),
            )
            session.add(tx)

        batch.status = "parsed"
        session.commit()
        logger.info(f"Staged {len(records)} transactions from Gmail for batch {batch_id}")

        # trigger categorization
        categorize_transactions_task.delay(batch_id)

    except Exception as e:
        logger.error(f"Error parsing Gmail for batch {batch_id}: {e}", exc_info=True)
        batch = session.query(ETLBatch).filter_by(batch_id=batch_id).first()
        if batch:
            batch.status = "failed"
            batch.error_message = str(e)
            session.commit()
        raise
    finally:
        session.close()

