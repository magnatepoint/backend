#!/usr/bin/env python3
"""
Apply Gmail OAuth migration to the database
This script can be run on the server where Python and dependencies are available
"""
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    """Run the migration"""
    print("=" * 80)
    print("Gmail OAuth Database Migration")
    print("=" * 80)
    print()
    
    try:
        # Import after adding to path
        from sqlalchemy import create_engine, text
        from config import settings
        
        print(f"Connecting to database...")
        print(f"Host: {settings.postgres_url.split('@')[1].split('/')[0] if '@' in settings.postgres_url else 'localhost'}")
        print()
        
        # Create engine
        engine = create_engine(settings.postgres_url)
        
        # Read migration SQL
        migration_file = os.path.join(os.path.dirname(__file__), 'migrations', '031_gmail_oauth_fields.sql')
        
        if not os.path.exists(migration_file):
            print(f"❌ Migration file not found: {migration_file}")
            return 1
        
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        print("Running migration: 031_gmail_oauth_fields.sql")
        print()
        
        # Execute migration
        with engine.connect() as conn:
            # Execute the migration
            conn.execute(text(migration_sql))
            conn.commit()
            
            print("✅ Migration completed successfully!")
            print()
            
            # Verify columns were added
            print("Verifying migration...")
            print()
            
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'gmail_account'
                ORDER BY ordinal_position
            """))
            
            print("Current gmail_account table structure:")
            print("-" * 60)
            print(f"{'Column Name':<25} {'Data Type':<20} {'Nullable':<10}")
            print("-" * 60)
            
            for row in result:
                nullable = "YES" if row[2] == "YES" else "NO"
                print(f"{row[0]:<25} {row[1]:<20} {nullable:<10}")
            
            print("-" * 60)
            print()
            
            # Check if new columns exist
            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns 
                WHERE table_name = 'gmail_account'
                AND column_name IN ('display_name', 'access_token', 'refresh_token', 'token_expires_at', 'last_sync_at')
            """))
            
            new_columns = [row[0] for row in result]
            
            print("New columns added:")
            expected_columns = ['display_name', 'access_token', 'refresh_token', 'token_expires_at', 'last_sync_at']
            
            for col in expected_columns:
                if col in new_columns:
                    print(f"  ✅ {col}")
                else:
                    print(f"  ❌ {col} (not found)")
            
            print()
            print("=" * 80)
            print("Next Steps:")
            print("=" * 80)
            print("1. ✅ Database migration complete")
            print("2. 🔄 Restart backend server to load new routes:")
            print("     docker-compose restart backend")
            print("     OR")
            print("     systemctl restart backend")
            print("3. 🔄 Test Gmail OAuth flow in frontend")
            print("4. 🔄 Test PDF upload")
            print()
            
        engine.dispose()
        return 0
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print()
        print("This script requires SQLAlchemy and other dependencies.")
        print("Please run this script on the server where the backend is deployed.")
        print()
        print("Alternative: Use the admin endpoint after server restart:")
        print("  curl -X POST 'https://backend.mallaapp.org/api/admin/migrate/gmail-oauth' \\")
        print("    -H 'Authorization: Bearer YOUR_TOKEN'")
        print()
        return 1
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print()
        import traceback
        traceback.print_exc()
        print()
        print("Common issues:")
        print("  - Database connection failed (check credentials in .env)")
        print("  - Columns already exist (safe to ignore if migration was run before)")
        print("  - Permission denied (check database user permissions)")
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())

