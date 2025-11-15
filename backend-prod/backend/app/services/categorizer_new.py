"""
New Categorizer Service
Keyword-based transaction categorization
"""
import re
from typing import Tuple, List, Dict, Any


KEYWORD_MAP = {
    # Food & Dining
    "swiggy": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "zomato": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "uber eats": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "dunzo": ("FOOD_AND_DINING", "ONLINE_FOOD"),
    "restaurant": ("FOOD_AND_DINING", "RESTAURANT"),
    "cafe": ("FOOD_AND_DINING", "CAFE"),
    "food": ("FOOD_AND_DINING", "RESTAURANT"),

    # Entertainment & OTT
    "netflix": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "hotstar": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "disney+ hotstar": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "prime video": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "amazon prime": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "sonyliv": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "zee5": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "aha": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "spotify": ("ENTERTAINMENT", "MUSIC_STREAMING"),
    "youtube premium": ("ENTERTAINMENT", "OTT_SUBSCRIPTION"),
    "apple music": ("ENTERTAINMENT", "MUSIC_STREAMING"),
    "gaana": ("ENTERTAINMENT", "MUSIC_STREAMING"),

    # Travel
    "irctc": ("TRAVEL", "TRAIN"),
    "makemytrip": ("TRAVEL", "FLIGHT"),
    "goibibo": ("TRAVEL", "FLIGHT"),
    "cleartrip": ("TRAVEL", "FLIGHT"),
    "ola": ("TRAVEL", "CAB"),
    "uber": ("TRAVEL", "CAB"),
    "rapido": ("TRAVEL", "CAB"),

    # Transport & Fuel
    "petrol": ("TRANSPORT", "FUEL"),
    "diesel": ("TRANSPORT", "FUEL"),
    "fuel": ("TRANSPORT", "FUEL"),
    "gas": ("TRANSPORT", "FUEL"),

    # Shopping
    "amazon": ("SHOPPING", "ONLINE_SHOPPING"),
    "flipkart": ("SHOPPING", "ONLINE_SHOPPING"),
    "myntra": ("SHOPPING", "ONLINE_SHOPPING"),
    "ajio": ("SHOPPING", "ONLINE_SHOPPING"),
    "meesho": ("SHOPPING", "ONLINE_SHOPPING"),

    # Groceries
    "bigbasket": ("GROCERIES", "ONLINE_GROCERIES"),
    "blinkit": ("GROCERIES", "ONLINE_GROCERIES"),
    "zepto": ("GROCERIES", "ONLINE_GROCERIES"),
    "instamart": ("GROCERIES", "ONLINE_GROCERIES"),
    "dmart": ("GROCERIES", "SUPERMARKET"),

    # Utilities
    "electricity": ("UTILITIES", "ELECTRICITY"),
    "water": ("UTILITIES", "WATER"),
    "gas bill": ("UTILITIES", "GAS"),
    "broadband": ("UTILITIES", "INTERNET"),
    "internet": ("UTILITIES", "INTERNET"),
    "mobile": ("UTILITIES", "MOBILE"),
    "recharge": ("UTILITIES", "MOBILE"),

    # Transfers & Payments
    "upi": ("TRANSFER", "UPI_PAYMENT"),
    "neft": ("TRANSFER", "BANK_TRANSFER"),
    "imps": ("TRANSFER", "BANK_TRANSFER"),
    "rtgs": ("TRANSFER", "BANK_TRANSFER"),

    # Income
    "salary": ("INCOME", "SALARY"),
    "interest": ("INCOME", "INTEREST"),
    "dividend": ("INCOME", "DIVIDEND"),
    "refund": ("INCOME", "REFUND"),

    # Loans & EMI
    "emi": ("LOAN_EMI", "GENERIC_LOAN"),
    "loan a/c": ("LOAN_EMI", "GENERIC_LOAN"),
    "loan account": ("LOAN_EMI", "GENERIC_LOAN"),
    "home loan": ("LOAN_EMI", "HOME_LOAN"),
    "car loan": ("LOAN_EMI", "CAR_LOAN"),
    "personal loan": ("LOAN_EMI", "PERSONAL_LOAN"),

    # Credit Card
    "credit card payment": ("DEBT", "CREDIT_CARD_PAYMENT"),
    "credit card": ("DEBT", "CREDIT_CARD_PAYMENT"),
    "cc payment": ("DEBT", "CREDIT_CARD_PAYMENT"),

    # Insurance
    "insurance": ("INSURANCE", "GENERAL"),
    "lic": ("INSURANCE", "LIFE_INSURANCE"),
    "health insurance": ("INSURANCE", "HEALTH_INSURANCE"),

    # Investments
    "mutual fund": ("INVESTMENT", "MUTUAL_FUND"),
    "sip": ("INVESTMENT", "MUTUAL_FUND"),
    "stocks": ("INVESTMENT", "STOCKS"),
    "fd": ("INVESTMENT", "FIXED_DEPOSIT"),
}


def categorize_transaction(description: str, amount: float, channel: str = None, raw_meta: Dict = None) -> Tuple[str, str, float]:
    """
    Categorize a single transaction based on description and metadata.

    Returns: (category, subcategory, confidence)
    """
    desc = (description or "").lower()

    # Check keyword map (exact matches first)
    for key, (cat, subcat) in KEYWORD_MAP.items():
        if key in desc:
            return cat, subcat, 0.9

    # Pattern-based categorization with higher specificity

    # EMI & Loans
    if any(x in desc for x in ["emi", "loan", "installment", "due"]):
        if "home" in desc or "housing" in desc:
            return "LOAN_EMI", "HOME_LOAN", 0.85
        elif "car" in desc or "vehicle" in desc:
            return "LOAN_EMI", "CAR_LOAN", 0.85
        elif "personal" in desc:
            return "LOAN_EMI", "PERSONAL_LOAN", 0.85
        else:
            return "LOAN_EMI", "GENERIC_LOAN", 0.8

    # Income patterns
    if any(x in desc for x in ["salary", "sal cr", "payroll"]):
        return "INCOME", "SALARY", 0.9
    if any(x in desc for x in ["interest", "int cr", "int credit"]):
        return "INCOME", "INTEREST", 0.85
    if "refund" in desc or "reversal" in desc:
        return "INCOME", "REFUND", 0.8

    # Utilities
    if any(x in desc for x in ["electricity", "electric bill", "power bill"]):
        return "UTILITIES", "ELECTRICITY", 0.9
    if any(x in desc for x in ["water bill", "water tax"]):
        return "UTILITIES", "WATER", 0.9
    if any(x in desc for x in ["broadband", "internet", "wifi"]):
        return "UTILITIES", "INTERNET", 0.85
    if any(x in desc for x in ["mobile", "recharge", "prepaid", "postpaid"]):
        return "UTILITIES", "MOBILE", 0.85

    # Transport
    if any(x in desc for x in ["petrol", "diesel", "fuel", "gas station"]):
        return "TRANSPORT", "FUEL", 0.9
    if any(x in desc for x in ["ola", "uber", "rapido", "cab", "taxi"]):
        return "TRAVEL", "CAB", 0.9

    # Food & Dining
    if any(x in desc for x in ["swiggy", "zomato", "uber eats", "food delivery"]):
        return "FOOD_AND_DINING", "ONLINE_FOOD", 0.9
    if any(x in desc for x in ["restaurant", "cafe", "dining", "hotel"]):
        return "FOOD_AND_DINING", "RESTAURANT", 0.75

    # Shopping
    if any(x in desc for x in ["amazon", "flipkart", "myntra", "ajio"]):
        return "SHOPPING", "ONLINE_SHOPPING", 0.9
    if any(x in desc for x in ["shopping", "mall", "store"]):
        return "SHOPPING", "RETAIL", 0.7

    # Groceries
    if any(x in desc for x in ["bigbasket", "blinkit", "zepto", "instamart", "grofers"]):
        return "GROCERIES", "ONLINE_GROCERIES", 0.9
    if any(x in desc for x in ["dmart", "reliance fresh", "more", "supermarket"]):
        return "GROCERIES", "SUPERMARKET", 0.85

    # Insurance
    if any(x in desc for x in ["insurance", "premium", "lic"]):
        return "INSURANCE", "GENERAL", 0.8

    # Investments
    if any(x in desc for x in ["mutual fund", "mf", "sip"]):
        return "INVESTMENT", "MUTUAL_FUND", 0.85
    if any(x in desc for x in ["stock", "equity", "shares"]):
        return "INVESTMENT", "STOCKS", 0.85

    # Transfers
    if any(x in desc for x in ["upi", "neft", "imps", "rtgs", "transfer"]):
        return "TRANSFER", "BANK_TRANSFER", 0.75

    # Credit Card
    if any(x in desc for x in ["credit card", "cc payment", "card payment"]):
        return "DEBT", "CREDIT_CARD_PAYMENT", 0.9

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

