# Gmail OAuth Integration Setup

## Overview
This document explains the Gmail OAuth integration that allows users to connect their Gmail accounts to extract transaction emails automatically.

## Changes Made

### 1. Fixed PDF Parsing Error ✅
**File**: `app/workers/etl_worker.py`
- **Issue**: `_sync_parse_and_stage_pdf()` was being called with `path=` parameter instead of `file_or_bytes=`
- **Fix**: Changed parameter name from `path` to `file_or_bytes` in line 126
- **Status**: FIXED - PDF uploads will now work correctly

### 2. Created Gmail OAuth Endpoints ✅
**File**: `app/routers/gmail_oauth.py` (NEW)

Created the following endpoints:

#### GET `/api/gmail/oauth/url`
- Returns the Google OAuth URL for user authorization
- Includes user_id in state parameter for tracking

#### POST `/api/gmail/oauth/exchange`
- Exchanges OAuth authorization code for access/refresh tokens
- Fetches user info from Google (email, display name)
- Creates or updates Gmail account connection in database
- Returns connection details and token info

#### POST `/api/gmail/connect`
- Legacy endpoint for direct token connection
- Accepts access_token, email, and display_name
- Creates or updates Gmail account connection

#### GET `/api/gmail/connections`
- Lists all Gmail connections for the authenticated user
- Returns connection details, sync status, and statistics

#### GET `/api/gmail/status`
- Returns overall Gmail integration status
- Shows if any accounts are connected and active
- Returns last sync timestamp

### 3. Updated GmailAccount Model ✅
**File**: `app/models/etl_models.py`

Added new fields to `GmailAccount` table:
- `display_name` - User's display name from Google
- `access_token` - OAuth access token (should be encrypted in production)
- `refresh_token` - OAuth refresh token for token renewal
- `token_expires_at` - Timestamp when access token expires
- `last_sync_at` - Last time emails were synced

### 4. Database Migration ✅
**File**: `migrations/031_gmail_oauth_fields.sql` (NEW)

Created migration to add new columns to `gmail_account` table:
```sql
ALTER TABLE gmail_account 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;
```

### 5. Registered Router ✅
**File**: `app/main.py`

- Imported `gmail_oauth_router`
- Registered router with FastAPI app

## Setup Instructions

### 1. Run Database Migration

```bash
# Connect to your PostgreSQL database
psql -h your-host -U your-user -d your-database -f migrations/031_gmail_oauth_fields.sql
```

Or use your migration tool to apply the migration.

### 2. Configure Environment Variables

Make sure these are set in your `.env` file:

```bash
# Gmail OAuth Configuration
GMAIL_CLIENT_ID=your-google-client-id
GMAIL_CLIENT_SECRET=your-google-client-secret
GMAIL_REDIRECT_URI=https://backend.mallaapp.org/api/gmail/oauth/callback
```

### 3. Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select your project
3. Enable Gmail API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: Add your backend callback URL
   - Example: `https://backend.mallaapp.org/api/gmail/oauth/callback`
5. Copy Client ID and Client Secret to your `.env` file

### 4. Restart Backend Server

```bash
# If using Docker
docker-compose restart backend

# If running locally
# Stop the server (Ctrl+C) and restart
uvicorn app.main:app --reload
```

## Usage Flow

### Frontend Integration

1. **Get OAuth URL**:
```typescript
const response = await api.request('/api/gmail/oauth/url')
window.location.href = response.url
```

2. **Handle OAuth Callback**:
After user authorizes, Google redirects to your callback URL with a `code` parameter.

3. **Exchange Code for Tokens**:
```typescript
const response = await api.exchangeGmailCode(code)
// Response includes connection_id, email, and token info
```

4. **Check Connection Status**:
```typescript
const status = await api.gmailStatus()
// Returns: { connected: true, connection_count: 1, ... }
```

5. **List Connections**:
```typescript
const connections = await api.listGmailConnections()
// Returns array of connected Gmail accounts
```

6. **Trigger Gmail Import**:
```typescript
const accounts = await api.getGmailAccounts()
// Use account ID to trigger import via existing ETL endpoints
```

## Security Considerations

### ⚠️ IMPORTANT: Token Encryption

The current implementation stores OAuth tokens in plain text. **For production, you MUST encrypt these tokens**.

Recommended approach:
1. Use a library like `cryptography` (Python) or `crypto-js` (Node.js)
2. Encrypt tokens before storing in database
3. Decrypt tokens when needed for API calls
4. Store encryption key in environment variable (not in code)

Example encryption setup:
```python
from cryptography.fernet import Fernet

# In config.py
ENCRYPTION_KEY = os.getenv("OAUTH_ENCRYPTION_KEY")
cipher = Fernet(ENCRYPTION_KEY)

# When storing
encrypted_token = cipher.encrypt(access_token.encode()).decode()

# When retrieving
decrypted_token = cipher.decrypt(encrypted_token.encode()).decode()
```

### Token Refresh

The OAuth tokens expire after a certain time (usually 1 hour). You should implement token refresh logic:

1. Check if `token_expires_at` is in the past
2. If expired, use `refresh_token` to get new access token
3. Update `access_token` and `token_expires_at` in database

## Testing

### Test OAuth Flow Locally

1. Start backend server
2. Get OAuth URL: `GET http://localhost:7000/api/gmail/oauth/url`
3. Open URL in browser and authorize
4. Copy the `code` from callback URL
5. Exchange code: `POST http://localhost:7000/api/gmail/oauth/exchange` with `{"code": "..."}`
6. Check status: `GET http://localhost:7000/api/gmail/status`

### Test with Frontend

The frontend already has the API methods implemented in `src/lib/api.ts`:
- `connectGmail()`
- `exchangeGmailCode()`
- `listGmailConnections()`
- `gmailStatus()`

## Next Steps

1. ✅ Apply database migration
2. ✅ Configure Google OAuth credentials
3. ✅ Restart backend server
4. 🔄 Test OAuth flow
5. 🔄 Implement token encryption (CRITICAL for production)
6. 🔄 Implement token refresh logic
7. 🔄 Update frontend to use new OAuth flow
8. 🔄 Test end-to-end Gmail import

## Troubleshooting

### "Gmail OAuth not configured" Error
- Check that `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REDIRECT_URI` are set in `.env`
- Restart backend server after updating `.env`

### "Failed to exchange code" Error
- Verify redirect URI matches exactly in Google Cloud Console
- Check that authorization code hasn't expired (codes expire quickly)
- Ensure client secret is correct

### "No Gmail accounts connected" in UI
- User needs to complete OAuth flow first
- Check database: `SELECT * FROM gmail_account WHERE user_id = 'your-user-id'`
- Verify `is_active = true` for the account

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:7000/docs`
- ReDoc: `http://localhost:7000/redoc`

Look for the "Gmail OAuth" section to see all available endpoints.

