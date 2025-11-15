#!/usr/bin/env python3
"""
Test Gmail OAuth endpoints
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test that all modules can be imported"""
    print("Testing imports...")
    
    try:
        from app.routers import gmail_oauth
        print("✅ gmail_oauth router imported successfully")
    except Exception as e:
        print(f"❌ Failed to import gmail_oauth: {e}")
        return False
    
    try:
        from app.routers import admin
        print("✅ admin router imported successfully")
    except Exception as e:
        print(f"❌ Failed to import admin: {e}")
        return False
    
    try:
        from app.models.etl_models import GmailAccount
        print("✅ GmailAccount model imported successfully")
        
        # Check if new fields exist
        from sqlalchemy import inspect
        mapper = inspect(GmailAccount)
        columns = [c.key for c in mapper.columns]
        
        required_fields = ['display_name', 'access_token', 'refresh_token', 'token_expires_at', 'last_sync_at']
        missing_fields = [f for f in required_fields if f not in columns]
        
        if missing_fields:
            print(f"⚠️  Warning: Missing fields in GmailAccount model: {missing_fields}")
            print(f"   Current fields: {columns}")
            print(f"   Note: These will be added by the database migration")
        else:
            print(f"✅ All required fields present in GmailAccount model")
        
    except Exception as e:
        print(f"❌ Failed to import GmailAccount: {e}")
        return False
    
    return True


def test_router_registration():
    """Test that routers are registered in main app"""
    print("\nTesting router registration...")
    
    try:
        from app.main import app
        
        # Get all routes
        routes = [route.path for route in app.routes]
        
        # Check for Gmail OAuth routes
        gmail_routes = [r for r in routes if '/gmail/' in r]
        if gmail_routes:
            print(f"✅ Gmail OAuth routes registered: {len(gmail_routes)} routes")
            for route in gmail_routes[:5]:  # Show first 5
                print(f"   - {route}")
        else:
            print("❌ No Gmail OAuth routes found")
            return False
        
        # Check for admin routes
        admin_routes = [r for r in routes if '/admin/' in r]
        if admin_routes:
            print(f"✅ Admin routes registered: {len(admin_routes)} routes")
            for route in admin_routes:
                print(f"   - {route}")
        else:
            print("❌ No admin routes found")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to test router registration: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_config():
    """Test Gmail OAuth configuration"""
    print("\nTesting configuration...")
    
    try:
        from config import settings
        
        if settings.gmail_client_id:
            print(f"✅ GMAIL_CLIENT_ID configured: {settings.gmail_client_id[:20]}...")
        else:
            print("⚠️  GMAIL_CLIENT_ID not configured (set in .env)")
        
        if settings.gmail_client_secret:
            print(f"✅ GMAIL_CLIENT_SECRET configured: {settings.gmail_client_secret[:10]}...")
        else:
            print("⚠️  GMAIL_CLIENT_SECRET not configured (set in .env)")
        
        if settings.gmail_redirect_uri:
            print(f"✅ GMAIL_REDIRECT_URI configured: {settings.gmail_redirect_uri}")
        else:
            print("⚠️  GMAIL_REDIRECT_URI not configured (set in .env)")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to test config: {e}")
        return False


def main():
    """Run all tests"""
    print("=" * 80)
    print("Gmail OAuth Integration Tests")
    print("=" * 80)
    
    results = []
    
    results.append(("Imports", test_imports()))
    results.append(("Router Registration", test_router_registration()))
    results.append(("Configuration", test_config()))
    
    print("\n" + "=" * 80)
    print("Test Results Summary")
    print("=" * 80)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(r[1] for r in results)
    
    if all_passed:
        print("\n🎉 All tests passed!")
        print("\nNext steps:")
        print("1. Run database migration: POST /api/admin/migrate/gmail-oauth")
        print("2. Configure Google OAuth credentials in .env")
        print("3. Restart backend server")
        print("4. Test OAuth flow in frontend")
    else:
        print("\n⚠️  Some tests failed. Please fix the issues above.")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

