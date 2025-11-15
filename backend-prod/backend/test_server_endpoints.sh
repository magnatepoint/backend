#!/bin/bash

# Test Gmail OAuth and Admin endpoints on production server
# Server: https://backend.mallaapp.org

SERVER_URL="https://backend.mallaapp.org"

echo "=========================================="
echo "Testing Gmail OAuth & Admin Endpoints"
echo "Server: $SERVER_URL"
echo "=========================================="
echo ""

# Test 1: Check if server is responding
echo "1. Testing server health..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$SERVER_URL/health" || echo "Health endpoint not available"
echo ""

# Test 2: Check OpenAPI docs
echo "2. Checking if new routes are registered..."
echo "   Fetching OpenAPI spec..."
OPENAPI=$(curl -s "$SERVER_URL/openapi.json")

if echo "$OPENAPI" | grep -q "gmail/oauth"; then
    echo "   ✅ Gmail OAuth routes found in OpenAPI spec"
else
    echo "   ❌ Gmail OAuth routes NOT found - server may need restart"
fi

if echo "$OPENAPI" | grep -q "admin/migrate"; then
    echo "   ✅ Admin migration routes found in OpenAPI spec"
else
    echo "   ❌ Admin migration routes NOT found - server may need restart"
fi
echo ""

# Test 3: Try to access Gmail OAuth URL endpoint (without auth)
echo "3. Testing Gmail OAuth URL endpoint (no auth)..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$SERVER_URL/api/gmail/oauth/url")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS" = "401" ]; then
    echo "   ✅ Endpoint exists (requires authentication)"
elif [ "$HTTP_STATUS" = "404" ]; then
    echo "   ❌ Endpoint not found (404) - server needs restart"
else
    echo "   Status: $HTTP_STATUS"
fi
echo ""

# Test 4: Check admin schema endpoint (without auth)
echo "4. Testing Admin schema endpoint (no auth)..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$SERVER_URL/api/admin/schema/gmail-account")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS" = "401" ]; then
    echo "   ✅ Endpoint exists (requires authentication)"
elif [ "$HTTP_STATUS" = "404" ]; then
    echo "   ❌ Endpoint not found (404) - server needs restart"
else
    echo "   Status: $HTTP_STATUS"
fi
echo ""

# Test 5: Check existing ETL Gmail accounts endpoint
echo "5. Testing existing ETL Gmail accounts endpoint (no auth)..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$SERVER_URL/api/etl/gmail/accounts")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS" = "401" ]; then
    echo "   ✅ Endpoint exists (requires authentication)"
elif [ "$HTTP_STATUS" = "404" ]; then
    echo "   ❌ Endpoint not found (404)"
else
    echo "   Status: $HTTP_STATUS"
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If you see '404' errors above, the server needs to be restarted to load the new routes."
echo ""
echo "To restart the server:"
echo "  1. SSH into your server"
echo "  2. Navigate to the backend directory"
echo "  3. Restart the service (e.g., 'docker-compose restart backend' or 'systemctl restart backend')"
echo ""
echo "After restart, you need to run the database migration:"
echo "  Option 1: Use the admin endpoint (requires auth token):"
echo "    curl -X POST '$SERVER_URL/api/admin/migrate/gmail-oauth' \\"
echo "      -H 'Authorization: Bearer YOUR_TOKEN'"
echo ""
echo "  Option 2: Run SQL migration directly on the database:"
echo "    psql -h your-host -U your-user -d postgres -f migrations/031_gmail_oauth_fields.sql"
echo ""
echo "After migration, test the Gmail OAuth flow:"
echo "  1. Frontend will show 'Connect Gmail' button"
echo "  2. Click button → redirects to Google OAuth"
echo "  3. User authorizes → redirects back with code"
echo "  4. Frontend exchanges code for tokens"
echo "  5. Gmail account is connected!"
echo ""

