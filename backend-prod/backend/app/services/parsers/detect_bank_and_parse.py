import pandas as pd
import pdfplumber
import re
from typing import List, Dict, Any
from datetime import datetime


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
    Minimal implementation — customize per bank
    """
    results = []
    
    # Try to find date, description, amount columns
    date_col = None
    desc_col = None
    amount_col = None
    
    for col in df.columns:
        col_lower = str(col).lower()
        if "date" in col_lower and date_col is None:
            date_col = col
        if any(x in col_lower for x in ["desc", "narration", "particulars", "details"]):
            desc_col = col
        if "amount" in col_lower and amount_col is None:
            amount_col = col
    
    for _, row in df.iterrows():
        try:
            # Get values
            txn_date = None
            if date_col:
                date_val = row.get(date_col)
                if pd.notna(date_val):
                    if isinstance(date_val, str):
                        try:
                            txn_date = datetime.strptime(date_val, "%d/%m/%Y").date()
                        except:
                            try:
                                txn_date = datetime.strptime(date_val, "%Y-%m-%d").date()
                            except:
                                pass
                    elif hasattr(date_val, 'date'):
                        txn_date = date_val.date()
            
            description = str(row.get(desc_col, "")) if desc_col else ""
            amount_val = row.get(amount_col, 0) if amount_col else 0
            
            # Determine direction
            amount = float(amount_val) if pd.notna(amount_val) else 0.0
            direction = "CREDIT" if amount >= 0 else "DEBIT"
            amount = abs(amount)
            
            results.append({
                "account_number_masked": "XXXX",
                "bank_code": bank,
                "txn_date": txn_date or datetime.now().date(),
                "posted_date": None,
                "description": description,
                "amount": amount,
                "direction": direction,
                "balance_after": None,
                "channel": "CSV" if bank == "CSV" else "EXCEL",
                "raw_meta": {"source": "excel_csv", "bank": bank},
            })
        except Exception as e:
            continue
    
    return results

