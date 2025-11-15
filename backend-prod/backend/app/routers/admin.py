"""
Admin endpoints for database migrations and maintenance
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from app.database.postgresql import SessionLocal
from app.routers.auth import get_current_user, UserDep

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.post("/migrate/gmail-oauth")
async def run_gmail_oauth_migration(
    user: UserDep = Depends(get_current_user)
):
    """
    Run Gmail OAuth migration to add new fields to gmail_account table
    
    This is a one-time migration that adds:
    - display_name
    - access_token
    - refresh_token
    - token_expires_at
    - last_sync_at
    """
    
    migration_sql = """
    -- Add new columns to gmail_account table
    ALTER TABLE gmail_account 
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS access_token TEXT,
    ADD COLUMN IF NOT EXISTS refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;

    -- Add index on user_id and email for faster lookups
    CREATE INDEX IF NOT EXISTS idx_gmail_account_user_email ON gmail_account(user_id, email);
    """
    
    session = SessionLocal()
    try:
        # Execute migration
        session.execute(text(migration_sql))
        session.commit()
        
        # Verify columns were added
        result = session.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'gmail_account'
            ORDER BY ordinal_position
        """))
        
        columns = [{"name": row[0], "type": row[1]} for row in result]
        
        return {
            "message": "Gmail OAuth migration completed successfully",
            "status": "success",
            "columns_added": [
                "display_name",
                "access_token",
                "refresh_token",
                "token_expires_at",
                "last_sync_at"
            ],
            "current_schema": columns
        }
        
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Migration failed: {str(e)}"
        )
    finally:
        session.close()


@router.get("/schema/gmail-account")
async def get_gmail_account_schema(
    user: UserDep = Depends(get_current_user)
):
    """
    Get current schema of gmail_account table
    """
    session = SessionLocal()
    try:
        result = session.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'gmail_account'
            ORDER BY ordinal_position
        """))
        
        columns = [
            {
                "name": row[0],
                "type": row[1],
                "nullable": row[2] == "YES",
                "default": row[3]
            }
            for row in result
        ]
        
        return {
            "table": "gmail_account",
            "columns": columns
        }
        
    finally:
        session.close()

