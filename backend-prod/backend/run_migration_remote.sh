#!/bin/bash

# Run Gmail OAuth migration on remote Supabase database
# This script connects directly to the PostgreSQL database and runs the migration

echo "=========================================="
echo "Gmail OAuth Database Migration"
echo "=========================================="
echo ""

# Database connection from .env
DB_HOST="aws-1-ap-southeast-1.pooler.supabase.com"
DB_PORT="6543"
DB_NAME="postgres"
DB_USER="postgres.vwagtikpxbhjrffolrqn"
DB_PASSWORD="zhmWcdUDlNASObG4"

# Full connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "Connecting to Supabase PostgreSQL..."
echo "Host: $DB_HOST"
echo "Database: $DB_NAME"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql command not found"
    echo ""
    echo "Please install PostgreSQL client:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    echo ""
    echo "Or use the admin endpoint instead:"
    echo "  curl -X POST 'https://backend.mallaapp.org/api/admin/migrate/gmail-oauth' \\"
    echo "    -H 'Authorization: Bearer YOUR_TOKEN'"
    exit 1
fi

echo "Running migration: 031_gmail_oauth_fields.sql"
echo ""

# Run the migration
psql "$DB_URL" -f migrations/031_gmail_oauth_fields.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    
    # Verify the migration
    echo "Verifying migration..."
    echo ""
    
    psql "$DB_URL" -c "
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'gmail_account'
        ORDER BY ordinal_position;
    "
    
    echo ""
    echo "=========================================="
    echo "Next Steps:"
    echo "=========================================="
    echo "1. ✅ Database migration complete"
    echo "2. 🔄 Restart backend server to load new routes"
    echo "3. 🔄 Test Gmail OAuth flow in frontend"
    echo "4. 🔄 Test PDF upload"
    echo ""
else
    echo ""
    echo "❌ Migration failed!"
    echo ""
    echo "Common issues:"
    echo "  - Database connection failed (check credentials)"
    echo "  - Columns already exist (safe to ignore if migration was run before)"
    echo "  - Permission denied (check database user permissions)"
    echo ""
    exit 1
fi

