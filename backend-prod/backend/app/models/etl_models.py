from sqlalchemy import Column, String, Integer, JSON, Date, Numeric, Boolean, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class ETLBatch(Base):
    __tablename__ = "etl_batch"

    batch_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    source = Column(String)  # file | gmail
    status = Column(String, default="pending")
    original_filename = Column(String, nullable=True)
    total_records = Column(Integer, default=0)
    valid_records = Column(Integer, default=0)
    invalid_records = Column(Integer, default=0)
    processed_records = Column(Integer, default=0)
    failed_records = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StagedTransaction(Base):
    __tablename__ = "staged_transaction"

    id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)

    account_number_masked = Column(String)
    bank_code = Column(String)

    txn_date = Column(Date)
    posted_date = Column(Date, nullable=True)

    description = Column(Text)
    amount = Column(Numeric)
    direction = Column(String)  # DEBIT | CREDIT
    balance_after = Column(Numeric, nullable=True)

    channel = Column(String)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)
    category_confidence = Column(Numeric, nullable=True)

    raw_meta = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


# Optional: track Gmail ETL source accounts
class GmailAccount(Base):
    __tablename__ = "gmail_account"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False)
    display_name = Column(String, nullable=True)

    # OAuth credentials
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)

    # Legacy field for reference
    credentials_id = Column(String, nullable=True)
    last_history_id = Column(String, nullable=True)  # for incremental sync
    last_sync_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailMessageMeta(Base):
    __tablename__ = "email_message_meta"

    id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    gmail_account_id = Column(String, nullable=False, index=True)
    message_id = Column(String, nullable=False, index=True)  # Gmail message ID
    thread_id = Column(String, nullable=True)
    subject = Column(Text)
    from_addr = Column(String)
    to_addr = Column(String)
    sent_at = Column(DateTime, nullable=True)
    raw_headers = Column(JSON, nullable=True)
    raw_snippet = Column(Text, nullable=True)
    parsed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

