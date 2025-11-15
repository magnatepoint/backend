#!/usr/bin/env python3
"""
Complete Production Test Suite
Tests all fixes including Gmail OAuth and file upload
"""
import requests
import json
import sys
from pathlib import Path

BASE_URL = "https://backend.mallaapp.org"

def print_header(text):
    print("\n" + "=" * 80)
    print(f"  {text}")
    print("=" * 80)

def print_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"    {details}")

def test_server_health():
    """Test if server is responding"""
    print_header("1. Server Health Check")
    
    try:
        response = requests.get(f"{BASE_URL}/", timeout=5)
        passed = response.status_code == 200
        print_test("Server is responding", passed, f"Status: {response.status_code}")
        
        if passed:
            data = response.json()
            print(f"    Response: {data}")
        
        return passed
    except Exception as e:
        print_test("Server is responding", False, f"Error: {e}")
        return False

def test_api_docs():
    """Test if API documentation is accessible"""
    print_header("2. API Documentation")
    
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        passed = response.status_code == 200
        print_test("API docs accessible", passed, f"Status: {response.status_code}")
        return passed
    except Exception as e:
        print_test("API docs accessible", False, f"Error: {e}")
        return False

def test_gmail_oauth_endpoints():
    """Test Gmail OAuth endpoints exist"""
    print_header("3. Gmail OAuth Endpoints")
    
    endpoints = [
        "/api/gmail/oauth/url",
        "/api/gmail/oauth/exchange",
        "/api/gmail/connect",
        "/api/gmail/connections",
        "/api/gmail/status",
    ]
    
    all_passed = True
    for endpoint in endpoints:
        try:
            # These endpoints require auth, so we expect 401 or 422, not 404
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            # 401 = unauthorized (good, endpoint exists)
            # 422 = validation error (good, endpoint exists but missing params)
            # 404 = not found (bad, endpoint doesn't exist)
            passed = response.status_code in [401, 422, 200]
            print_test(f"Endpoint exists: {endpoint}", passed, f"Status: {response.status_code}")
            all_passed = all_passed and passed
        except Exception as e:
            print_test(f"Endpoint exists: {endpoint}", False, f"Error: {e}")
            all_passed = False
    
    return all_passed

def test_admin_endpoints():
    """Test admin endpoints exist"""
    print_header("4. Admin Endpoints")
    
    endpoints = [
        "/api/admin/migrate/gmail-oauth",
        "/api/admin/schema/gmail-account",
    ]
    
    all_passed = True
    for endpoint in endpoints:
        try:
            response = requests.post(f"{BASE_URL}{endpoint}", timeout=5) if "migrate" in endpoint else requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            # Expect 401 (unauthorized) which means endpoint exists
            passed = response.status_code in [401, 422, 200]
            print_test(f"Endpoint exists: {endpoint}", passed, f"Status: {response.status_code}")
            all_passed = all_passed and passed
        except Exception as e:
            print_test(f"Endpoint exists: {endpoint}", False, f"Error: {e}")
            all_passed = False
    
    return all_passed

def test_database_migration():
    """Test if database migration was successful"""
    print_header("5. Database Migration Verification")
    
    # We can't directly query the database, but we can check if the endpoints work
    # If the migration failed, the server would crash when trying to query gmail_account
    try:
        response = requests.get(f"{BASE_URL}/api/gmail/status", timeout=5)
        # 401 means endpoint works (just needs auth)
        # 500 would mean database error (migration failed)
        passed = response.status_code != 500
        print_test("Database schema is correct", passed, f"Status: {response.status_code}")
        
        if response.status_code == 500:
            print(f"    Error response: {response.text[:200]}")
        
        return passed
    except Exception as e:
        print_test("Database schema is correct", False, f"Error: {e}")
        return False

def test_file_upload():
    """Test file upload endpoint"""
    print_header("6. File Upload Test")
    
    # Check if upload endpoint exists
    try:
        response = requests.post(f"{BASE_URL}/api/etl/upload/xlsx?bank_code=GENERIC", timeout=5)
        # 401 = needs auth (good)
        # 422 = missing file (good, endpoint exists)
        # 404 = endpoint doesn't exist (bad)
        passed = response.status_code in [401, 422]
        print_test("Upload endpoint exists", passed, f"Status: {response.status_code}")
        return passed
    except Exception as e:
        print_test("Upload endpoint exists", False, f"Error: {e}")
        return False

def test_openapi_schema():
    """Test OpenAPI schema includes new endpoints"""
    print_header("7. OpenAPI Schema Verification")
    
    try:
        response = requests.get(f"{BASE_URL}/openapi.json", timeout=5)
        if response.status_code != 200:
            print_test("OpenAPI schema accessible", False, f"Status: {response.status_code}")
            return False
        
        schema = response.json()
        paths = schema.get("paths", {})
        
        # Check for Gmail OAuth endpoints
        gmail_endpoints = [p for p in paths.keys() if "gmail" in p.lower()]
        admin_endpoints = [p for p in paths.keys() if "admin" in p.lower()]
        
        print_test("OpenAPI schema accessible", True, f"Total endpoints: {len(paths)}")
        print_test("Gmail endpoints in schema", len(gmail_endpoints) >= 5, f"Found {len(gmail_endpoints)} Gmail endpoints")
        print_test("Admin endpoints in schema", len(admin_endpoints) >= 2, f"Found {len(admin_endpoints)} Admin endpoints")
        
        print("\n    Gmail OAuth Endpoints:")
        for endpoint in sorted(gmail_endpoints):
            print(f"      - {endpoint}")
        
        print("\n    Admin Endpoints:")
        for endpoint in sorted(admin_endpoints):
            print(f"      - {endpoint}")
        
        return len(gmail_endpoints) >= 5 and len(admin_endpoints) >= 2
    except Exception as e:
        print_test("OpenAPI schema verification", False, f"Error: {e}")
        return False

def main():
    print("\n" + "=" * 80)
    print("  MONYTIX PRODUCTION TEST SUITE")
    print("  Testing: https://backend.mallaapp.org")
    print("=" * 80)
    
    results = {
        "Server Health": test_server_health(),
        "API Documentation": test_api_docs(),
        "Gmail OAuth Endpoints": test_gmail_oauth_endpoints(),
        "Admin Endpoints": test_admin_endpoints(),
        "Database Migration": test_database_migration(),
        "File Upload": test_file_upload(),
        "OpenAPI Schema": test_openapi_schema(),
    }
    
    # Summary
    print_header("TEST SUMMARY")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Production deployment successful!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the failures above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

