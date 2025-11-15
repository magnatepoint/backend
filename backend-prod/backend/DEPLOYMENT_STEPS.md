# Deployment Steps for Gmail OAuth Fix

## What Was Fixed

1. ✅ **PDF Parsing Error** - Fixed parameter mismatch in `app/workers/etl_worker.py`
2. ✅ **Gmail OAuth Integration** - Created complete OAuth flow with new endpoints
3. ✅ **Database Schema** - Added OAuth fields to `gmail_account` table
4. ✅ **Configuration** - Updated `.env` with correct Google OAuth credentials

## Files Changed

### New Files (7)
- `app/routers/gmail_oauth.py` - Gmail OAuth endpoints
- `app/routers/admin.py` - Admin/migration endpoints
- `migrations/031_gmail_oauth_fields.sql` - Database migration
- `GMAIL_OAUTH_SETUP.md` - Setup documentation
- `FIXES_SUMMARY.md` - Summary of fixes
- `test_server_endpoints.sh` - Server testing script
- `DEPLOYMENT_STEPS.md` - This file

### Modified Files (4)
- `app/workers/etl_worker.py` - Fixed PDF parsing
- `app/models/etl_models.py` - Added OAuth fields to GmailAccount
- `app/main.py` - Registered new routers
- `.env` - Updated Gmail OAuth credentials

## Deployment Steps

### Step 1: Commit and Push Changes

```bash
cd /Users/santosh/coding/backend/backend-prod/backend

# Check what files changed
git status

# Add all changes
git add .

# Commit
git commit -m "Fix: Gmail OAuth integration and PDF parsing error

- Add Gmail OAuth endpoints for account connection
- Fix PDF parsing parameter mismatch in ETL worker
- Add OAuth fields to gmail_account model
- Create admin endpoints for database migrations
- Update Gmail OAuth credentials in .env"

# Push to repository
git push origin main
```

### Step 2: Deploy to Server

**Option A: If using Git deployment**
```bash
# SSH into your server
ssh your-server

# Navigate to backend directory
cd /path/to/backend

# Pull latest changes
git pull origin main

# Restart the backend service
docker-compose restart backend
# OR
systemctl restart backend
# OR
pm2 restart backend
```

**Option B: If using manual deployment**
```bash
# Copy files to server
scp -r app/ your-server:/path/to/backend/
scp -r migrations/ your-server:/path/to/backend/
scp .env your-server:/path/to/backend/

# SSH and restart
ssh your-server "cd /path/to/backend && docker-compose restart backend"
```

### Step 3: Run Database Migration

**Option A: Using Admin Endpoint (After server restart)**

1. Get your authentication token from the frontend
2. Run migration:

```bash
curl -X POST 'https://backend.mallaapp.org/api/admin/migrate/gmail-oauth' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json'
```

**Option B: Direct Database Access**

If you have direct access to the PostgreSQL database:

```bash
# Using the connection string from .env
psql "postgresql://postgres.vwagtikpxbhjrffolrqn:zhmWcdUDlNASObG4@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  -f migrations/031_gmail_oauth_fields.sql
```

Or if you're on the server:

```bash
cd /path/to/backend
psql $POSTGRES_URL -f migrations/031_gmail_oauth_fields.sql
```

### Step 4: Verify Deployment

Run the test script:

```bash
./test_server_endpoints.sh
```

Expected output:
- ✅ Gmail OAuth routes found in OpenAPI spec
- ✅ Admin migration routes found in OpenAPI spec
- ✅ All endpoints return 401 (authentication required)

### Step 5: Test Gmail OAuth Flow

1. Open frontend: https://mvp.monytix.ai
2. Navigate to Gmail integration section
3. Click "Connect Gmail" button
4. Should redirect to Google OAuth
5. Authorize the app
6. Should redirect back and show "Gmail connected successfully"

### Step 6: Test PDF Upload

1. Upload a PDF bank statement
2. Should process without errors
3. Check transactions are extracted correctly

## Verification Checklist

- [ ] Code committed and pushed to repository
- [ ] Changes deployed to server
- [ ] Backend server restarted
- [ ] Database migration completed successfully
- [ ] New endpoints visible in API docs (https://backend.mallaapp.org/docs)
- [ ] Gmail OAuth flow works end-to-end
- [ ] PDF upload works without errors
- [ ] Transactions are being categorized correctly

## Rollback Plan

If something goes wrong:

1. **Revert code changes:**
```bash
git revert HEAD
git push origin main
```

2. **Rollback database migration:**
```sql
ALTER TABLE gmail_account 
DROP COLUMN IF EXISTS display_name,
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token,
DROP COLUMN IF EXISTS token_expires_at,
DROP COLUMN IF EXISTS last_sync_at;

DROP INDEX IF EXISTS idx_gmail_account_user_email;
```

3. **Restart server with previous version**

## Troubleshooting

### Issue: "Gmail OAuth routes not found"
**Solution**: Server needs to be restarted to load new routes

### Issue: "Migration failed: column already exists"
**Solution**: Migration is idempotent, this is safe to ignore

### Issue: "Gmail OAuth not configured"
**Solution**: Check that `.env` has correct values:
- GMAIL_CLIENT_ID
- GMAIL_CLIENT_SECRET
- GMAIL_REDIRECT_URI

### Issue: "Failed to exchange code"
**Solution**: 
- Verify redirect URI matches exactly in Google Cloud Console
- Check that client secret is correct
- Ensure authorization code hasn't expired

## Support

For issues or questions:
1. Check server logs: `docker logs backend` or `journalctl -u backend`
2. Check database: `SELECT * FROM gmail_account;`
3. Test endpoints: Visit https://backend.mallaapp.org/docs
4. Review documentation: `GMAIL_OAUTH_SETUP.md`

## Next Steps After Deployment

1. Monitor server logs for any errors
2. Test with real user accounts
3. Implement token encryption for production (see GMAIL_OAUTH_SETUP.md)
4. Set up token refresh logic
5. Monitor Gmail API quota usage

