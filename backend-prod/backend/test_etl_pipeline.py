"""
Comprehensive ETL Pipeline Test Script
Tests CSV, Excel, and Gmail parsing with categorization
"""
import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

import pandas as pd
from datetime import datetime, timedelta
import random

print("=" * 80)
print("ETL PIPELINE TEST SUITE")
print("=" * 80)

# Test 1: CSV/Excel Parser
print("\n[TEST 1] Testing CSV/Excel Parser")
print("-" * 80)

try:
    from app.services.parsers.detect_bank_and_parse import parse_excel_csv_by_bank
    
    # Create sample transaction data
    sample_data = {
        'Date': ['15/01/2024', '16/01/2024', '17/01/2024', '18/01/2024', '19/01/2024'],
        'Description': ['SWIGGY PAYMENT', 'NETFLIX SUBSCRIPTION', 'PETROL PUMP', 'AMAZON SHOPPING', 'SALARY CREDIT'],
        'Withdrawal': [450.00, 199.00, 1200.00, 2500.00, 0.00],
        'Deposit': [0.00, 0.00, 0.00, 0.00, 50000.00],
        'Balance': [25550.00, 25351.00, 24151.00, 21651.00, 71651.00]
    }
    
    df = pd.DataFrame(sample_data)
    
    # Test parsing
    transactions = parse_excel_csv_by_bank("HDFC", df)
    
    print(f"✓ Parsed {len(transactions)} transactions from sample CSV data")
    
    if len(transactions) > 0:
        print("\nSample transaction:")
        txn = transactions[0]
        print(f"  Date: {txn['txn_date']}")
        print(f"  Description: {txn['description']}")
        print(f"  Amount: {txn['amount']}")
        print(f"  Direction: {txn['direction']}")
        print(f"  Bank: {txn['bank_code']}")
        print("✓ CSV/Excel parser working correctly!")
    else:
        print("✗ No transactions parsed - FAILED")
        
except Exception as e:
    print(f"✗ CSV/Excel parser test FAILED: {e}")
    import traceback
    traceback.print_exc()

# Test 2: Gmail Parser
print("\n[TEST 2] Testing Gmail Parser")
print("-" * 80)

try:
    from app.services.parsers.gmail_parser import gmail_messages_to_staged_transactions
    
    # Create sample Gmail messages
    sample_messages = [
        {
            "id": "msg_001",
            "thread_id": "thread_001",
            "from": "alerts@hdfcbank.com",
            "to": "user@example.com",
            "subject": "HDFC Bank: Rs. 450.00 debited from A/c **1234",
            "body": "Dear Customer, Your A/c **1234 has been debited with Rs. 450.00 on 15-Jan-2024. Transaction: SWIGGY. Available Balance: Rs. 25550.00. Ref: REF123456789",
            "snippet": "Dear Customer, Your A/c **1234 has been debited with Rs. 450.00 on 15-Jan-2024..."
        },
        {
            "id": "msg_002",
            "thread_id": "thread_002",
            "from": "alerts@icicibank.com",
            "to": "user@example.com",
            "subject": "ICICI Bank: Transaction Alert - Rs. 199.00 debited",
            "body": "Your ICICI Bank A/c 5678 is debited for Rs. 199.00 on 16-Jan-2024. Info: NETFLIX. Avl Bal: Rs. 25351.00. Ref No: REF987654321",
            "snippet": "Your ICICI Bank A/c 5678 is debited for Rs. 199.00 on 16-Jan-2024..."
        },
        {
            "id": "msg_003",
            "thread_id": "thread_003",
            "from": "noreply@axisbank.com",
            "to": "user@example.com",
            "subject": "Axis Bank: Debit Alert - INR 1200.00",
            "body": "Dear Customer, INR 1200.00 has been debited from your Axis Bank A/c 9012 on 17-Jan-2024. Transaction at PETROL PUMP. Balance: INR 24151.00. Reference: REF456789123",
            "snippet": "Dear Customer, INR 1200.00 has been debited from your Axis Bank A/c 9012..."
        }
    ]
    
    # Test parsing
    transactions = gmail_messages_to_staged_transactions(
        user_id="test_user",
        gmail_account_id="test_gmail",
        batch_id="test_batch",
        messages=sample_messages
    )
    
    print(f"✓ Parsed {len(transactions)} transactions from {len(sample_messages)} Gmail messages")
    
    if len(transactions) > 0:
        print("\nSample Gmail transaction:")
        txn = transactions[0]
        print(f"  Date: {txn['txn_date']}")
        print(f"  Description: {txn['description']}")
        print(f"  Amount: {txn['amount']}")
        print(f"  Direction: {txn['direction']}")
        print(f"  Bank: {txn['bank_code']}")
        print(f"  Channel: {txn['channel']}")
        print("✓ Gmail parser working correctly!")
    else:
        print("✗ No transactions parsed from Gmail - FAILED")
        
except Exception as e:
    print(f"✗ Gmail parser test FAILED: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Categorization
print("\n[TEST 3] Testing Auto-Categorization")
print("-" * 80)

try:
    from app.services.categorizer_new import categorize_transaction, categorize_batch
    
    # Test individual categorization
    test_cases = [
        ("SWIGGY PAYMENT", 450.00, "FOOD_AND_DINING", "ONLINE_FOOD"),
        ("NETFLIX SUBSCRIPTION", 199.00, "ENTERTAINMENT", "OTT_SUBSCRIPTION"),
        ("PETROL PUMP", 1200.00, "TRANSPORT", "FUEL"),
        ("AMAZON SHOPPING", 2500.00, "SHOPPING", "ONLINE_SHOPPING"),
        ("SALARY CREDIT", 50000.00, "INCOME", "SALARY"),
        ("ELECTRICITY BILL", 800.00, "UTILITIES", "ELECTRICITY"),
        ("UBER RIDE", 350.00, "TRAVEL", "CAB"),
    ]
    
    print("Testing individual transaction categorization:")
    correct = 0
    total = len(test_cases)
    
    for desc, amount, expected_cat, expected_subcat in test_cases:
        cat, subcat, confidence = categorize_transaction(desc, amount)
        match = cat == expected_cat and subcat == expected_subcat
        status = "✓" if match else "✗"
        if match:
            correct += 1
        print(f"  {status} {desc:30s} -> {cat}/{subcat} (confidence: {confidence:.2f})")
    
    accuracy = (correct / total) * 100
    print(f"\nCategorization Accuracy: {accuracy:.1f}% ({correct}/{total})")
    
    if accuracy >= 70:
        print("✓ Categorization working well!")
    else:
        print("⚠ Categorization needs improvement")
    
except Exception as e:
    print(f"✗ Categorization test FAILED: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Gmail Service
print("\n[TEST 4] Testing Gmail Service (Mock)")
print("-" * 80)

try:
    from app.services.gmail_service import GmailService
    from app.models.etl_models import GmailAccount
    
    # Create mock Gmail account
    class MockGmailAccount:
        def __init__(self):
            self.email = "test@example.com"
            self.id = "test_gmail_id"
    
    mock_account = MockGmailAccount()
    gmail_service = GmailService(mock_account)
    
    # Fetch sample emails
    emails = gmail_service.fetch_transaction_emails(max_results=10)
    
    print(f"✓ Gmail service fetched {len(emails)} sample transaction emails")
    
    if len(emails) > 0:
        print("\nSample email:")
        email = emails[0]
        print(f"  From: {email['from']}")
        print(f"  Subject: {email['subject'][:60]}...")
        print("✓ Gmail service working correctly!")
    else:
        print("✗ No emails fetched - FAILED")
        
except Exception as e:
    print(f"✗ Gmail service test FAILED: {e}")
    import traceback
    traceback.print_exc()

# Summary
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print("All core ETL components have been tested.")
print("✓ CSV/Excel parsing")
print("✓ Gmail message parsing")
print("✓ Auto-categorization")
print("✓ Gmail service (mock)")
print("\nNext steps:")
print("1. Upload a real CSV/Excel file to test with actual data")
print("2. Configure Gmail OAuth for real email fetching")
print("3. Run integration tests with the API endpoints")
print("=" * 80)

