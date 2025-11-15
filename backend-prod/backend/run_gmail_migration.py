#!/usr/bin/env python3
"""
Run Gmail OAuth migration to add new fields to gmail_account table
"""
from sqlalchemy import create_engine, text
from config import settings

def run_migration():
    """Run the Gmail OAuth migration"""

    # Read migration SQL
    with open('migrations/031_gmail_oauth_fields.sql', 'r') as f:
        migration_sql = f.read()

    # Connect to database
    print(f"Connecting to database...")
    engine = create_engine(settings.postgres_url)

    try:
        with engine.connect() as conn:
            print("Running migration: 031_gmail_oauth_fields.sql")

            # Execute migration
            conn.execute(text(migration_sql))
            conn.commit()

            print("✅ Migration completed successfully!")

            # Verify columns were added
            result = conn.execute(text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'gmail_account'
                ORDER BY ordinal_position
            """))

            print("\nCurrent gmail_account table structure:")
            for row in result:
                print(f"  - {row[0]}: {row[1]}")

    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        engine.dispose()

if __name__ == "__main__":
    run_migration()

