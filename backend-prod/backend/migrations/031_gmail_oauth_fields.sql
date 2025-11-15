-- Migration: Add OAuth fields to gmail_account table
-- Date: 2025-11-15
-- Description: Add fields for storing Gmail OAuth tokens and user info

-- Add new columns to gmail_account table
ALTER TABLE gmail_account 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;

-- Add index on user_id and email for faster lookups
CREATE INDEX IF NOT EXISTS idx_gmail_account_user_email ON gmail_account(user_id, email);

-- Add comment
COMMENT ON TABLE gmail_account IS 'Gmail account connections with OAuth credentials';
COMMENT ON COLUMN gmail_account.display_name IS 'Display name from Google account';
COMMENT ON COLUMN gmail_account.access_token IS 'OAuth access token (should be encrypted in production)';
COMMENT ON COLUMN gmail_account.refresh_token IS 'OAuth refresh token (should be encrypted in production)';
COMMENT ON COLUMN gmail_account.token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN gmail_account.last_sync_at IS 'Last time emails were synced from this account';

