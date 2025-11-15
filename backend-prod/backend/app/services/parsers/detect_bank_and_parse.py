import pandas as pd
import pdfplumber
import re
from typing import List, Dict, Any
from datetime import datetime
from app.services.categorizer_new import categorize_transaction


def detect_bank_and_parse(file_path: str, ext: str) -> List[Dict[str, Any]]:
    """
    Main universal parser entry point.
    Detect bank → call specific parser.
    """
    if ext == ".pdf":
        text = extract_pdf_text(file_path)
        bank = detect_bank_from_pdf(text)
        return parse_pdf_by_bank(bank, file_path)
    elif ext in [".csv", ".xls", ".xlsx"]:
        try:
            df = pd.read_excel(file_path) if ext != ".csv" else pd.read_csv(file_path)
        except Exception as e:
            raise Exception(f"Failed to read file: {str(e)}")
        bank = detect_bank_from_df(df)
        return parse_excel_csv_by_bank(bank, df)
    else:
        raise Exception("Unsupported file format")


# ------- PDF extract -------
def extract_pdf_text(path: str) -> str:
    """Extract text from PDF file"""
    text = ""
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
    except Exception as e:
        raise Exception(f"Failed to extract PDF text: {str(e)}")
    return text


def detect_bank_from_pdf(text: str) -> str:
    """Detect bank from PDF text content"""
    text_low = text.lower()
    if "hdfc" in text_low:
        return "HDFC"
    if "icici" in text_low:
        return "ICICI"
    if "state bank" in text_low or "sbi" in text_low:
        return "SBI"
    if "axis bank" in text_low:
        return "AXIS"
    return "UNKNOWN"


def parse_pdf_by_bank(bank: str, path: str) -> List[Dict[str, Any]]:
    """
    Parse PDF by bank-specific format.
    TODO: Add full parsing logic for each Indian bank PDF
    """
    text = extract_pdf_text(path)
    
    # Generic PDF parser - extract transactions using regex
    # Pattern: DD/MM/YYYY description amount DR/CR
    pattern = re.compile(
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<desc>.+?)\s+(?P<amount>[0-9,]+\.?\d{0,2})\s+(?P<dc>DR|CR|DEBIT|CREDIT)",
        re.IGNORECASE,
    )
    
    results = []
    for line in text.splitlines():
        match = pattern.search(line)
        if match:
            try:
                date_str = match.group("date")
                desc = match.group("desc").strip()
                amount_str = match.group("amount").replace(",", "")
                dc = match.group("dc").upper()
                
                # Parse date
                try:
                    txn_date = datetime.strptime(date_str, "%d/%m/%Y").date()
                except ValueError:
                    try:
                        txn_date = datetime.strptime(date_str, "%d-%m-%Y").date()
                    except ValueError:
                        continue
                
                amount = float(amount_str)
                direction = "DEBIT" if dc in ("DR", "DEBIT") else "CREDIT"
                
                results.append({
                    "account_number_masked": "XXXX",
                    "bank_code": bank,
                    "txn_date": txn_date,
                    "posted_date": None,
                    "description": desc,
                    "amount": amount,
                    "direction": direction,
                    "balance_after": None,
                    "channel": "PDF",
                    "raw_meta": {"source": "pdf", "bank": bank},
                })
            except Exception:
                continue
    
    return results if results else [{
        "account_number_masked": "XXXX",
        "bank_code": bank,
        "txn_date": datetime.now().date(),
        "posted_date": None,
        "description": "Sample PDF Transaction",
        "amount": 0,
        "direction": "DEBIT",
        "balance_after": None,
        "channel": "PDF",
        "raw_meta": {"source": "pdf", "bank": bank},
    }]


# ------- CSV/XLS -------
def detect_bank_from_df(df) -> str:
    """Detect bank from DataFrame columns"""
    headers = " ".join([str(c) for c in df.columns]).lower()
    if "hdfc" in headers:
        return "HDFC"
    if "icici" in headers:
        return "ICICI"
    if "sbi" in headers or "state bank" in headers:
        return "SBI"
    if "axis" in headers:
        return "AXIS"
    return "UNKNOWN"


def parse_excel_csv_by_bank(bank: str, df) -> List[Dict[str, Any]]:
    """
    Parse Excel/CSV by bank-specific format.
    Enhanced with better column detection and error handling
    """
    import logging
    logger = logging.getLogger(__name__)

    results = []

    # Clean column names
    df.columns = [str(col).strip() for col in df.columns]

    # Try to find date, description, amount columns with fuzzy matching
    date_col = None
    desc_col = None
    amount_col = None
    debit_col = None
    credit_col = None
    balance_col = None

    for col in df.columns:
        col_lower = str(col).lower()

        # Date column detection
        if date_col is None and any(x in col_lower for x in ["date", "txn date", "transaction date", "value date"]):
            date_col = col
            logger.info(f"Detected date column: {col}")

        # Description column detection
        if desc_col is None and any(x in col_lower for x in ["desc", "narration", "particulars", "details", "remarks", "transaction"]):
            desc_col = col
            logger.info(f"Detected description column: {col}")

        # Amount columns detection
        if "withdrawal" in col_lower or ("debit" in col_lower and "amount" in col_lower):
            debit_col = col
            logger.info(f"Detected debit column: {col}")
        elif "deposit" in col_lower or ("credit" in col_lower and "amount" in col_lower):
            credit_col = col
            logger.info(f"Detected credit column: {col}")
        elif "amount" in col_lower and amount_col is None:
            amount_col = col
            logger.info(f"Detected amount column: {col}")

        # Balance column
        if "balance" in col_lower and balance_col is None:
            balance_col = col

    if not date_col or not desc_col:
        logger.warning(f"Could not detect required columns. Date: {date_col}, Desc: {desc_col}")
        logger.warning(f"Available columns: {list(df.columns)}")

    row_count = 0
    skipped_count = 0

    for idx, row in df.iterrows():
        try:
            # Parse date
            txn_date = None
            if date_col and pd.notna(row.get(date_col)):
                date_val = row.get(date_col)
                if isinstance(date_val, str):
                    # Try multiple date formats
                    for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d/%m/%y"]:
                        try:
                            txn_date = datetime.strptime(date_val.strip(), fmt).date()
                            break
                        except:
                            continue
                elif hasattr(date_val, 'date'):
                    txn_date = date_val.date()
                elif isinstance(date_val, pd.Timestamp):
                    txn_date = date_val.date()

            # Skip rows without valid date
            if not txn_date:
                skipped_count += 1
                continue

            # Parse description
            description = str(row.get(desc_col, "")).strip() if desc_col else ""
            if not description or description.lower() in ["nan", "none", ""]:
                skipped_count += 1
                continue

            # Parse amount and direction
            amount = 0.0
            direction = "DEBIT"

            if debit_col and credit_col:
                # Separate debit/credit columns
                debit_val = row.get(debit_col, 0)
                credit_val = row.get(credit_col, 0)

                if pd.notna(debit_val) and float(debit_val) > 0:
                    amount = abs(float(debit_val))
                    direction = "DEBIT"
                elif pd.notna(credit_val) and float(credit_val) > 0:
                    amount = abs(float(credit_val))
                    direction = "CREDIT"
                else:
                    skipped_count += 1
                    continue
            elif amount_col:
                # Single amount column
                amount_val = row.get(amount_col, 0)
                if pd.notna(amount_val):
                    amount = float(amount_val)
                    direction = "CREDIT" if amount >= 0 else "DEBIT"
                    amount = abs(amount)
                else:
                    skipped_count += 1
                    continue
            else:
                skipped_count += 1
                continue

            # Skip zero amount transactions
            if amount == 0:
                skipped_count += 1
                continue

            # Parse balance
            balance_after = None
            if balance_col and pd.notna(row.get(balance_col)):
                try:
                    balance_after = float(row.get(balance_col))
                except:
                    pass

            # Auto-categorize transaction
            category, subcategory, confidence = categorize_transaction(
                description=description,
                amount=amount,
                channel="EXCEL"
            )

            results.append({
                "account_number_masked": "XXXX",
                "bank_code": bank,
                "txn_date": txn_date,
                "posted_date": None,
                "description": description,
                "amount": amount,
                "direction": direction,
                "balance_after": balance_after,
                "channel": "EXCEL",
                "category": category,
                "subcategory": subcategory,
                "categorization_confidence": confidence,
                "raw_meta": {"source": "excel_csv", "bank": bank, "row_index": idx},
            })
            row_count += 1

        except Exception as e:
            logger.warning(f"Error parsing row {idx}: {e}")
            skipped_count += 1
            continue

    logger.info(f"Parsed {row_count} transactions, skipped {skipped_count} rows")
    return results

