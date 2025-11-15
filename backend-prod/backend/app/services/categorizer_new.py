"""
New Categorizer Service
Keyword-based transaction categorization
"""
import re
from typing import Tuple, List, Dict, Any


KEYWORD_MAP = {
    "swiggy": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "zomato": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "netflix": ("ENTERTAINMENT", "OTT"),
    "hotstar": ("ENTERTAINMENT", "OTT"),
    "irctc": ("TRAVEL", "TRAIN"),
    "petrol": ("TRANSPORT", "FUEL"),
    "upi": ("TRANSFER", "UPI_PAYMENT"),
    "amazon": ("SHOPPING", "ONLINE_SHOPPING"),
    "flipkart": ("SHOPPING", "ONLINE_SHOPPING"),
    "salary": ("INCOME", "SALARY"),
    "emi": ("LOAN_EMI", "GENERIC_LOAN"),
}


def categorize_transaction(description: str, amount: float, channel: str = None, raw_meta: Dict = None) -> Tuple[str, str, float]:
    """
    Categorize a single transaction based on description and metadata.
    
    Returns: (category, subcategory, confidence)
    """
    desc = (description or "").lower()
    
    # Check keyword map
    for key, (cat, subcat) in KEYWORD_MAP.items():
        if key in desc:
            return cat, subcat, 0.9
    
    # Check for EMI patterns
    if "emi" in desc or "due" in desc or "installment" in desc:
        return "LOAN_EMI", "GENERIC_LOAN", 0.8
    
    # Check for salary/income
    if any(x in desc for x in ["salary", "income", "credit"]):
        if amount > 0:
            return "INCOME", "SALARY", 0.7
    
    # Check for fuel
    if any(x in desc for x in ["petrol", "diesel", "fuel", "gas"]):
        return "TRANSPORT", "FUEL", 0.85
    
    # Check for food delivery
    if any(x in desc for x in ["food", "restaurant", "cafe", "dining"]):
        return "FOOD_AND_DINING", "RESTAURANT", 0.7
    
    # Fallback
    return "OTHER", "UNCATEGORIZED", 0.1


def categorize_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Categorize a batch of transactions.
    
    Args:
        records: List of transaction dictionaries
        
    Returns:
        List of transactions with category, subcategory, and confidence added
    """
    final = []
    for r in records:
        cat, sub, conf = categorize_transaction(
            r.get("description", ""),
            float(r.get("amount", 0)),
            r.get("channel"),
            r.get("raw_meta")
        )
        r["category"] = cat
        r["subcategory"] = sub
        r["category_confidence"] = conf
        final.append(r)
    return final

