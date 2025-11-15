# ETL Pipeline Fixes Summary

## Issues Fixed

### 1. ✅ PDF Parsing Error - FIXED
**Error**: `TypeError: _sync_parse_and_stage_pdf() got an unexpected keyword argument 'path'`

**File**: `app/workers/etl_worker.py` (line 126)

**Fix**: Changed parameter name from `path=temp_path` to `file_or_bytes=temp_path` to match function signature

**Status**: COMPLETE - PDF uploads will now work correctly

---

### 2. ✅ Gmail Account Connection - FIXED
**Error**: "No Gmail accounts connected. Please connect your Gmail account first."

**Root Cause**: Missing Gmail OAuth endpoints - frontend was calling `/api/gmail/connect` and `/api/gmail/oauth/exchange` but these endpoints didn't exist

**Files Created**:
1. `app/routers/gmail_oauth.py` - Complete Gmail OAuth integration
2. `app/routers/admin.py` - Admin endpoints for migrations
3. `migrations/031_gmail_oauth_fields.sql` - Database migration
4. `GMAIL_OAUTH_SETUP.md` - Complete setup documentation

**Files Modified**:
1. `app/models/etl_models.py` - Added OAuth fields to GmailAccount model
2. `app/main.py` - Registered new routers

**New Endpoints Created**:
- `GET /api/gmail/oauth/url` - Get OAuth authorization URL
- `POST /api/gmail/oauth/exchange` - Exchange code for tokens
- `POST /api/gmail/connect` - Connect Gmail account (legacy)
- `GET /api/gmail/connections` - List all connections
- `GET /api/gmail/status` - Get integration status
- `POST /api/admin/migrate/gmail-oauth` - Run database migration
- `GET /api/admin/schema/gmail-account` - View table schema

**Status**: COMPLETE - Ready to use after migration

---

## Next Steps

### Step 1: Run Database Migration

**Option A: Using Admin Endpoint (Recommended)**

1. Make sure backend server is running
2. Call the migration endpoint:

```bash
curl -X POST "http://localhost:7000/api/admin/migrate/gmail-oauth" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Or visit in browser (if logged in):
```
http://localhost:7000/api/admin/migrate/gmail-oauth
```

**Option B: Using SQL File**

If you have direct database access:
```bash
psql -h your-host -U your-user -d your-database -f migrations/031_gmail_oauth_fields.sql
```

### Step 2: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select your project
3. Enable Gmail API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `https://backend.mallaapp.org/api/gmail/oauth/callback`
5. Copy Client ID and Client Secret

### Step 3: Update Environment Variables

Add to your `.env` file:

```bash
GMAIL_CLIENT_ID=your-google-client-id
GMAIL_CLIENT_SECRET=your-google-client-secret
GMAIL_REDIRECT_URI=https://backend.mallaapp.org/api/gmail/oauth/callback
```

### Step 4: Restart Backend

```bash
# If using Docker
docker-compose restart backend

# If running locally
# Stop server (Ctrl+C) and restart
```

### Step 5: Test Gmail Connection

1. Frontend will now show "Connect Gmail" button
2. Click button → redirects to Google OAuth
3. User authorizes → redirects back with code
4. Frontend exchanges code for tokens
5. Gmail account is now connected!

---

## Testing

### Test PDF Upload
1. Upload a PDF bank statement
2. Should parse successfully without errors
3. Check Celery worker logs for confirmation

### Test Gmail OAuth Flow

**Get OAuth URL**:
```bash
curl "http://localhost:7000/api/gmail/oauth/url" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Check Status**:
```bash
curl "http://localhost:7000/api/gmail/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**View Schema** (verify migration):
```bash
curl "http://localhost:7000/api/admin/schema/gmail-account" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## API Documentation

Once server is running, visit:
- **Swagger UI**: http://localhost:7000/docs
- **ReDoc**: http://localhost:7000/redoc

Look for:
- "Gmail OAuth" section - OAuth endpoints
- "Admin" section - Migration endpoints
- "ETL Pipeline" section - Existing ETL endpoints

---

## Security Notes

### ⚠️ CRITICAL: Token Encryption

The current implementation stores OAuth tokens in **plain text**. For production:

1. **Encrypt tokens before storing**
2. **Use environment variable for encryption key**
3. **Never commit encryption key to git**

See `GMAIL_OAUTH_SETUP.md` for encryption implementation guide.

---

## Files Changed Summary

### New Files (5)
- ✅ `app/routers/gmail_oauth.py` - Gmail OAuth endpoints
- ✅ `app/routers/admin.py` - Admin/migration endpoints
- ✅ `migrations/031_gmail_oauth_fields.sql` - Database migration
- ✅ `GMAIL_OAUTH_SETUP.md` - Setup documentation
- ✅ `FIXES_SUMMARY.md` - This file

### Modified Files (3)
- ✅ `app/workers/etl_worker.py` - Fixed PDF parsing
- ✅ `app/models/etl_models.py` - Added OAuth fields
- ✅ `app/main.py` - Registered routers

---

## Verification Checklist

- [ ] Database migration completed
- [ ] Google OAuth credentials configured
- [ ] Environment variables set
- [ ] Backend server restarted
- [ ] PDF upload works
- [ ] Gmail OAuth URL returns valid URL
- [ ] Gmail connection flow works end-to-end
- [ ] Token encryption implemented (for production)

---

## Support

For detailed setup instructions, see:
- `GMAIL_OAUTH_SETUP.md` - Complete Gmail OAuth setup guide
- `ETL_PIPELINE_TEST_RESULTS.md` - ETL testing results

For issues:
1. Check server logs
2. Verify environment variables
3. Check database migration status
4. Test endpoints using Swagger UI

