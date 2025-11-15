#!/usr/bin/env python3
"""
Run the Gmail OAuth migration directly on Supabase
"""
import psycopg2
import sys

# Supabase connection string
DATABASE_URL = "postgresql://postgres.vwagtikpxbhjrffolrqn:zhmWcdUDlNASObG4@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"

def main():
    print("=" * 80)
    print("Running Gmail OAuth Migration on Supabase")
    print("=" * 80)
    print()
    
    try:
        # Connect to database
        print("Connecting to Supabase PostgreSQL...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("✅ Connected successfully!")
        print()
        
        # Run migration
        print("Running migration: Adding OAuth fields to gmail_account table...")
        print()
        
        migration_sql = """
        -- Add new columns for OAuth
        ALTER TABLE gmail_account 
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS access_token TEXT,
        ADD COLUMN IF NOT EXISTS refresh_token TEXT,
        ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;

        -- Add index for better query performance
        CREATE INDEX IF NOT EXISTS idx_gmail_account_user_email ON gmail_account(user_id, email);
        """
        
        cursor.execute(migration_sql)
        conn.commit()
        
        print("✅ Migration completed successfully!")
        print()
        
        # Verify columns were added
        print("Verifying migration...")
        print()
        
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'gmail_account'
            ORDER BY ordinal_position
        """)
        
        print("Current gmail_account table structure:")
        print("-" * 70)
        print(f"{'Column Name':<30} {'Data Type':<25} {'Nullable':<10}")
        print("-" * 70)
        
        for row in cursor.fetchall():
            nullable = "YES" if row[2] == "YES" else "NO"
            print(f"{row[0]:<30} {row[1]:<25} {nullable:<10}")
        
        print("-" * 70)
        print()
        
        # Check if new columns exist
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns 
            WHERE table_name = 'gmail_account'
            AND column_name IN ('display_name', 'access_token', 'refresh_token', 'token_expires_at', 'last_sync_at')
        """)
        
        new_columns = [row[0] for row in cursor.fetchall()]
        
        print("New OAuth columns added:")
        expected_columns = ['display_name', 'access_token', 'refresh_token', 'token_expires_at', 'last_sync_at']
        
        all_present = True
        for col in expected_columns:
            if col in new_columns:
                print(f"  ✅ {col}")
            else:
                print(f"  ❌ {col} (not found)")
                all_present = False
        
        print()
        
        if all_present:
            print("=" * 80)
            print("✅ SUCCESS! All OAuth columns added successfully!")
            print("=" * 80)
            print()
            print("Next steps:")
            print("1. The backend server likely crashed - you need to restart it")
            print("2. SSH to your server and restart the backend:")
            print("   docker-compose restart backend")
            print("   OR")
            print("   systemctl restart backend")
            print("   OR")
            print("   pm2 restart backend")
            print()
            print("3. After restart, test Gmail connection in the frontend")
            print()
        else:
            print("⚠️  Some columns are missing. Please check the migration.")
        
        cursor.close()
        conn.close()
        
        return 0 if all_present else 1
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        print()
        print("Common issues:")
        print("  - Connection failed (check network/firewall)")
        print("  - Columns already exist (safe to ignore)")
        print("  - Permission denied (check database user permissions)")
        print()
        return 1
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print()
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

