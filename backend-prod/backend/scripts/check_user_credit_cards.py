#!/usr/bin/env python3
"""
Script to check and optionally remove credit_cards transactions for a user
Usage:
    python check_user_credit_cards.py <user_id> [--delete]
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database.postgresql import SessionLocal
from sqlalchemy import text
import uuid

def check_credit_cards(user_id: str):
    """Check credit_cards transactions for a user"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        
        # Check transactions with credit_cards category
        result = session.execute(text("""
            SELECT 
                COUNT(*) as txn_count,
                SUM(amount) as total_amount,
                MIN(txn_date) as first_date,
                MAX(txn_date) as last_date
            FROM spendsense.txn_fact tf
            JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
            WHERE tf.user_id = :uid
            AND te.category_code = 'credit_cards'
        """), {"uid": str(user_uuid)}).fetchone()
        
        if result and result[0] > 0:
            print(f"📊 Found {result[0]} credit_cards transactions")
            print(f"   Total Amount: ₹{result[1] or 0:,.2f}")
            print(f"   Date Range: {result[2]} to {result[3]}")
            
            # Show sample transactions
            samples = session.execute(text("""
                SELECT 
                    tf.txn_id,
                    tf.txn_date,
                    tf.amount,
                    tf.merchant_name_norm,
                    te.category_code,
                    te.subcategory_code
                FROM spendsense.txn_fact tf
                JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
                WHERE tf.user_id = :uid
                AND te.category_code = 'credit_cards'
                ORDER BY tf.txn_date DESC
                LIMIT 5
            """), {"uid": str(user_uuid)}).fetchall()
            
            print("\n📋 Sample transactions:")
            for txn_id, txn_date, amount, merchant, cat, subcat in samples:
                print(f"   {txn_date} | {merchant or 'N/A'} | ₹{amount:,.2f} | {cat}/{subcat}")
            
            return True
        else:
            print("✅ No credit_cards transactions found for this user")
            return False
    finally:
        session.close()

def delete_credit_cards(user_id: str):
    """Delete credit_cards transactions for a user"""
    session = SessionLocal()
    try:
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        
        # First check
        count = session.execute(text("""
            SELECT COUNT(*)
            FROM spendsense.txn_fact tf
            JOIN spendsense.txn_enriched te ON te.txn_id = tf.txn_id
            WHERE tf.user_id = :uid
            AND te.category_code = 'credit_cards'
        """), {"uid": str(user_uuid)}).scalar()
        
        if count == 0:
            print("✅ No credit_cards transactions to delete")
            return
        
        print(f"⚠️  About to delete {count} credit_cards transactions")
        response = input("Are you sure? (yes/no): ")
        
        if response.lower() != 'yes':
            print("❌ Cancelled")
            return
        
        # Delete from enriched first (foreign key constraint)
        deleted_enriched = session.execute(text("""
            DELETE FROM spendsense.txn_enriched
            WHERE txn_id IN (
                SELECT tf.txn_id
                FROM spendsense.txn_fact tf
                WHERE tf.user_id = :uid
                AND EXISTS (
                    SELECT 1 FROM spendsense.txn_enriched te
                    WHERE te.txn_id = tf.txn_id
                    AND te.category_code = 'credit_cards'
                )
            )
        """), {"uid": str(user_uuid)}).rowcount
        
        # Delete from fact table
        deleted_fact = session.execute(text("""
            DELETE FROM spendsense.txn_fact
            WHERE user_id = :uid
            AND txn_id IN (
                SELECT txn_id FROM spendsense.txn_enriched
                WHERE category_code = 'credit_cards'
            )
        """), {"uid": str(user_uuid)}).rowcount
        
        session.commit()
        print(f"✅ Deleted {deleted_fact} credit_cards transactions")
        print(f"   (Removed {deleted_enriched} enriched records)")
        
    except Exception as e:
        session.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_user_credit_cards.py <user_id> [--delete]")
        sys.exit(1)
    
    user_id = sys.argv[1]
    should_delete = '--delete' in sys.argv
    
    print(f"🔍 Checking credit_cards transactions for user: {user_id}\n")
    
    has_credit_cards = check_credit_cards(user_id)
    
    if should_delete and has_credit_cards:
        print("\n🗑️  Deleting credit_cards transactions...")
        delete_credit_cards(user_id)
    elif should_delete:
        print("\n⚠️  No credit_cards transactions to delete")

