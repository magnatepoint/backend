"""
Test CSV File Parsing
"""
import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

print("=" * 80)
print("CSV FILE PARSING TEST")
print("=" * 80)

try:
    # Import required modules
    from app.services.parsers.detect_bank_and_parse import detect_bank_and_parse
    from app.services.categorizer_new import categorize_transaction
    
    # Test CSV file
    csv_file = "sample_bank_statement.csv"
    
    if not os.path.exists(csv_file):
        print(f"✗ Sample CSV file not found: {csv_file}")
        sys.exit(1)
    
    print(f"\nParsing CSV file: {csv_file}")
    print("-" * 80)
    
    # Parse the CSV file
    transactions = detect_bank_and_parse(csv_file, ".csv")
    
    print(f"\n✓ Successfully parsed {len(transactions)} transactions from CSV file")
    
    if len(transactions) == 0:
        print("✗ No transactions found - FAILED")
        sys.exit(1)
    
    # Display first few transactions
    print("\nFirst 5 transactions:")
    print("-" * 80)
    
    for i, txn in enumerate(transactions[:5], 1):
        print(f"\nTransaction {i}:")
        print(f"  Date: {txn['txn_date']}")
        print(f"  Description: {txn['description']}")
        print(f"  Amount: Rs. {txn['amount']:.2f}")
        print(f"  Direction: {txn['direction']}")
        print(f"  Bank: {txn['bank_code']}")
        
        # Categorize the transaction
        cat, subcat, conf = categorize_transaction(
            txn['description'],
            txn['amount'],
            txn.get('channel'),
            txn.get('raw_meta')
        )
        print(f"  Category: {cat} / {subcat} (confidence: {conf:.2f})")
    
    # Summary statistics
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    total_debit = sum(txn['amount'] for txn in transactions if txn['direction'] == 'DEBIT')
    total_credit = sum(txn['amount'] for txn in transactions if txn['direction'] == 'CREDIT')
    debit_count = sum(1 for txn in transactions if txn['direction'] == 'DEBIT')
    credit_count = sum(1 for txn in transactions if txn['direction'] == 'CREDIT')
    
    print(f"Total Transactions: {len(transactions)}")
    print(f"Debit Transactions: {debit_count} (Rs. {total_debit:.2f})")
    print(f"Credit Transactions: {credit_count} (Rs. {total_credit:.2f})")
    print(f"Net: Rs. {(total_credit - total_debit):.2f}")
    
    # Test categorization on all transactions
    print("\nCategorization Results:")
    print("-" * 80)
    
    category_counts = {}
    for txn in transactions:
        cat, subcat, conf = categorize_transaction(
            txn['description'],
            txn['amount'],
            txn.get('channel'),
            txn.get('raw_meta')
        )
        
        if cat not in category_counts:
            category_counts[cat] = 0
        category_counts[cat] += 1
    
    for cat, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {cat}: {count} transactions")
    
    uncategorized = category_counts.get('OTHER', 0) + category_counts.get('UNCATEGORIZED', 0)
    categorized = len(transactions) - uncategorized
    categorization_rate = (categorized / len(transactions)) * 100
    
    print(f"\nCategorization Rate: {categorization_rate:.1f}% ({categorized}/{len(transactions)})")
    
    if categorization_rate >= 80:
        print("✓ Excellent categorization!")
    elif categorization_rate >= 60:
        print("✓ Good categorization!")
    else:
        print("⚠ Categorization needs improvement")
    
    print("\n" + "=" * 80)
    print("✓ CSV PARSING TEST PASSED!")
    print("=" * 80)
    
except Exception as e:
    print(f"\n✗ CSV parsing test FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

