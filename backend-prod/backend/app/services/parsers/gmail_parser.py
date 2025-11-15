"""
Gmail Parser for Transaction Extraction
Extracts transactions, loans, OTT subscriptions from Gmail messages
"""
import re
from datetime import datetime
from typing import List, Dict, Any, Optional


# Very simple helpers – you can replace with your real Gmail wrapper
def parse_amount(text: str) -> Optional[float]:
    """Extract amount from text (INR, Rs., ₹)"""
    m = re.search(r'(?i)(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]+)?)', text)
    if not m:
        return None
    return float(m.group(1).replace(",", ""))


def parse_date(text: str) -> Optional[datetime]:
    """Parse date from text - TODO: improve with dateparser or custom formats"""
    # Try DD-MMM-YYYY format
    m = re.search(r'(\d{1,2}[/-][A-Za-z]{3}[/-]\d{2,4})', text)
    if not m:
        # Try DD/MM/YYYY
        m = re.search(r'(\d{1,2}/\d{1,2}/\d{2,4})', text)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%d-%b-%Y")
    except ValueError:
        try:
            return datetime.strptime(m.group(1), "%d/%m/%Y")
        except ValueError:
            try:
                return datetime.strptime(m.group(1), "%d-%m-%Y")
            except ValueError:
                return None


def is_loan_email(subject: str, body: str) -> bool:
    """Check if email is about loan/EMI"""
    text = f"{subject} {body}".lower()
    return any(
        kw in text
        for kw in [
            "emi due",
            "loan payment due",
            "loan a/c",
            "loan account",
            "emi amount",
            "overdue emi",
        ]
    )


def is_credit_card_email(subject: str, body: str) -> bool:
    """Check if email is about credit card"""
    text = f"{subject} {body}".lower()
    return any(
        kw in text
        for kw in [
            "credit card statement",
            "card payment due",
            "minimum amount due",
            "total amount due",
        ]
    )


def is_ott_email(subject: str, body: str) -> bool:
    """Check if email is about OTT subscription"""
    text = f"{subject} {body}".lower()
    ott_keywords = [
        "netflix",
        "hotstar",
        "disney+ hotstar",
        "prime video",
        "sonyliv",
        "zee5",
        "aha",
        "spotify",
        "youtube premium",
    ]
    return any(kw in text for kw in ott_keywords)


def bank_code_from_text(text: str) -> str:
    """Detect bank from text content"""
    tl = text.lower()
    if "hdfc" in tl:
        return "HDFC"
    if "icici" in tl:
        return "ICICI"
    if "axis bank" in tl or "axisbank" in tl:
        return "AXIS"
    if "state bank of india" in tl or "sbi" in tl:
        return "SBI"
    return "UNKNOWN"


def extract_reference(text: str) -> Optional[str]:
    """Extract reference number from text"""
    m = re.search(r'(Ref(?:erence)?(?: No\.?)?:?\s*[A-Za-z0-9\-]+)', text, re.I)
    return m.group(1) if m else None


def extract_due_date(text: str) -> Optional[datetime]:
    """Extract due date from text"""
    m = re.search(r'(?i)due date\s*[:\-]?\s*(\d{1,2}[/-][A-Za-z]{3}[/-]\d{2,4})', text)
    if not m:
        # Try DD/MM/YYYY format
        m = re.search(r'(?i)due date\s*[:\-]?\s*(\d{1,2}/\d{1,2}/\d{2,4})', text)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%d-%b-%Y")
    except ValueError:
        try:
            return datetime.strptime(m.group(1), "%d/%m/%Y")
        except ValueError:
            return None


def gmail_messages_to_staged_transactions(
    user_id: str,
    gmail_account_id: str,
    batch_id: str,
    messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Convert Gmail messages to staged transaction format.
    
    messages: list of dicts with at least:
      - id
      - subject
      - from
      - to
      - snippet or body
    
    You can adapt to your own Gmail wrapper.
    """
    results: List[Dict[str, Any]] = []

    for msg in messages:
        subject = msg.get("subject", "")
        body = msg.get("body", "") or msg.get("snippet", "")
        combined = f"{subject}\n{body}"

        amount = parse_amount(combined)
        if amount is None:
            # skip non-monetary emails
            continue

        txn_date = parse_date(combined)

        bank_code = bank_code_from_text(combined)
        ref = extract_reference(combined)
        due_date = extract_due_date(combined)

        raw_meta = {
            "source": "gmail",
            "gmail_message_id": msg.get("id"),
            "gmail_thread_id": msg.get("thread_id"),
            "gmail_account_id": gmail_account_id,
            "subject": subject,
            "from": msg.get("from"),
            "to": msg.get("to"),
            "snippet": msg.get("snippet"),
            "type": "GENERIC",
            "reference": ref,
        }

        direction = "DEBIT"
        channel = "EMAIL"

        # classify basic type by email kind
        if is_loan_email(subject, body):
            raw_meta["type"] = "LOAN_EMI"
            raw_meta["due_date"] = due_date.isoformat() if due_date else None
            channel = "LOAN_EMI"
        elif is_credit_card_email(subject, body):
            raw_meta["type"] = "CREDIT_CARD_BILL"
            raw_meta["due_date"] = due_date.isoformat() if due_date else None
            channel = "CREDIT_CARD"
        elif is_ott_email(subject, body):
            raw_meta["type"] = "OTT_SUBSCRIPTION"
            raw_meta["next_renewal_date"] = due_date.isoformat() if due_date else None
            channel = "OTT_SUBSCRIPTION"

        results.append(
            {
                "account_number_masked": "XXXX",  # fill from regex if you can
                "bank_code": bank_code,
                "txn_date": txn_date.date() if txn_date else None,
                "posted_date": None,
                "description": subject or body[:120],
                "amount": amount,
                "direction": direction,
                "balance_after": None,
                "channel": channel,
                "raw_meta": raw_meta,
            }
        )

    return results

