"""
ETL Pipeline API Endpoints
Exposes Extract, Transform, Load operations
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from typing import List, Dict, Any, Optional, Tuple
import uuid
import os
import logging
import re
from datetime import datetime, date
from io import BytesIO
from app.routers.auth import get_current_user, UserDep
from app.services.etl_pipeline import ETLPipeline
from app.routers._upload_utils import save_upload_to_temp, ensure_csv_mime, ensure_excel_mime
from app.routers._async_tools import run_sync
from app.schemas.etl import StagedTxnIn
from pydantic import BaseModel
from app.database.postgresql import SessionLocal
from sqlalchemy import text

router = APIRouter()
logger = logging.getLogger(__name__)


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str
    total_records: int
    valid: int
    invalid: int
    processed: int
    failed: int


class ETLResponse(BaseModel):
    message: str
    batch_id: str
    records_staged: int


def _dispatch_or_fallback(parse_task, *, user_id: str, batch_id: str, file_name: str, path: str) -> ETLResponse:
    """
    Try Celery dispatch; if not available, fall back to threaded local parse.
    
    Returns ETLResponse with processing status.
    """
    try:
        if parse_task and hasattr(parse_task, "delay"):
            # Read file content for worker (workers currently expect bytes)
            with open(path, "rb") as f:
                file_bytes = f.read()
            
            parse_task.delay(
                user_id=str(user_id),
                source_id=str(batch_id),
                file_content=file_bytes  # Workers expect file_content: bytes
            )
            logger.info(f"Dispatched CSV/XLSX processing to worker for batch {batch_id}")
            return ETLResponse(
                message="File received. Processing in background.",
                batch_id=str(batch_id),
                records_staged=0
            )
    except Exception as e:
        logger.warning(f"Worker dispatch failed, falling back to sync processing: {e}")
        pass
    
    # Fallback: parse in-process on a thread
    try:
        # Defer heavy work to sync function
        if file_name.lower().endswith(".csv"):
            staged = _sync_parse_and_stage_csv
        else:
            staged = _sync_parse_and_stage_excel
        
        records_staged, valid, invalid = staged(user_id, batch_id, file_name, path)
        
        return ETLResponse(
            message=f"Upload processed: {valid} valid, {invalid} invalid",
            batch_id=str(batch_id),
            records_staged=records_staged,
        )
    finally:
        # Cleanup temp file on fallback completion
        try:
            os.remove(path)
        except Exception:
            pass


def _sync_parse_and_stage_csv(user_id: str, batch_id: str, file_name: str, path: str) -> Tuple[int, int, int]:
    """Synchronous CSV parsing and staging (runs in thread pool)"""
    import pandas as pd
    pipeline = ETLPipeline(user_id)
    
    try:
        df = pd.read_csv(path)
        txns = []
        
        for idx, row in df.iterrows():
            try:
                tx = StagedTxnIn(
                    amount=row.get("amount"),
                    transaction_date=row.get("date") or row.get("transaction_date"),
                    description=row.get("description") or row.get("narration"),
                    merchant=row.get("merchant"),
                    bank=row.get("bank"),
                    category=row.get("category"),
                    reference_id=row.get("reference") or row.get("reference_id"),
                    currency=row.get("currency", "INR"),
                    transaction_type=row.get("type") or row.get("transaction_type"),
                    source="csv",
                    row_number=idx + 1,
                )
                txns.append(tx.dict())
            except Exception as e:
                logger.warning(f"Skipping invalid row {idx + 1}: {e}")
                continue
        
        pipeline.stage_transactions(txns, batch_id)
        v = pipeline.validate_staged_transactions(batch_id)
        
        if v.get("valid", 0) > 0:
            pipeline.categorize_staged_transactions(batch_id)
            pipeline.load_to_production(batch_id)
        
        return len(txns), v.get("valid", 0), v.get("invalid", 0)
    except Exception as e:
        logger.exception(f"Error parsing CSV for batch {batch_id}")
        raise


def normalize_excel_df(df, bank_code: str) -> List[Dict[str, Any]]:
    """
    Bank-specific mappings: turn Excel columns into canonical fields.
    Returns list of dicts with: txn_date, amount, direction, description, ref_no
    """
    import pandas as pd
    
    # Clean columns
    df = df.rename(columns={c: str(c).strip().lower() for c in df.columns})
    cols = list(df.columns)
    logger.info(f"normalize_excel_df: bank_code={bank_code}, columns={cols}")
    
    # 🔍 Auto-detect bank if GENERIC and first cell contains bank name
    try:
        first_cell = str(df.iloc[0, 0]).lower()
    except Exception:
        first_cell = ""
    
    if bank_code.upper() == "GENERIC":
        if "hdfc" in first_cell and "bank" in first_cell:
            logger.info("Auto-detected HDFC from sheet content, overriding bank_code to HDFC")
            bank_code = "HDFC"
        elif "icici" in first_cell and "bank" in first_cell:
            logger.info("Auto-detected ICICI from sheet content, overriding bank_code to ICICI")
            bank_code = "ICICI"
        elif "state bank of india" in first_cell or "sbi" in first_cell:
            logger.info("Auto-detected SBI from sheet content, overriding bank_code to SBI")
            bank_code = "SBI"
    
    mapping: Dict[str, Dict[str, str]] = {}
    
    # EXAMPLE per-bank mappings – adjust based on actual files
    mapping["HDFC"] = {
        "date": "txn_date",
        "value date": "txn_date",
        "value_date": "txn_date",
        "withdrawal amt.": "debit",
        "withdrawal_amt": "debit",
        "deposit amt.": "credit",
        "deposit_amt": "credit",
        "narration": "description",
        "chq/ref number": "ref_no",
        "chq_ref_number": "ref_no",
        "ref": "ref_no",
    }
    
    mapping["ICICI"] = {
        "transaction date": "txn_date",
        "transaction_date": "txn_date",
        "date": "txn_date",
        "withdrawal amount (inr)": "debit",
        "withdrawal_amount": "debit",
        "deposit amount (inr)": "credit",
        "deposit_amount": "credit",
        "transaction remarks": "description",
        "transaction_remarks": "description",
        "remarks": "description",
        "cheque number": "ref_no",
        "cheque_number": "ref_no",
    }
    
    mapping["SBI"] = {
        "date": "txn_date",
        "value date": "txn_date",
        "withdrawal": "debit",
        "deposit": "credit",
        "description": "description",
        "narration": "description",
        "ref no": "ref_no",
        "ref_no": "ref_no",
    }
    
    # fallback generic
    mapping["GENERIC"] = {
        "date": "txn_date",
        "transaction_date": "txn_date",
        "amount": "amount",
        "type": "direction",
        "transaction_type": "direction",
        "description": "description",
        "narration": "description",
        "ref": "ref_no",
        "reference": "ref_no",
        "reference_id": "ref_no",
    }
    
    bank_key = bank_code.upper() if bank_code.upper() in mapping else "GENERIC"
    bank_map = mapping[bank_key]
    
    # Check required cols for a sanity check (using fuzzy matching)
    date_cols = [k for k, v in bank_map.items() if v == "txn_date"]
    desc_cols = [k for k, v in bank_map.items() if v == "description"]
    
    # Normalize column names for comparison (lowercase, strip whitespace)
    df_cols_normalized = {str(c).strip().lower(): c for c in df.columns}
    df_cols_list = list(df_cols_normalized.keys())
    
    # Fuzzy check: look for date and description keywords in any column
    has_date = (
        any("date" in col and ("value" in col or col == "date") for col in df_cols_list)
        or any(col in df_cols_list for col in date_cols)
    )
    has_desc = (
        any(any(x in col for x in ["narration", "description", "particulars", "remarks"]) for col in df_cols_list)
        or any(col in df_cols_list for col in desc_cols)
    )
    
    if not has_date or not has_desc:
        logger.error(
            f"Column mapping failed for {bank_key}. "
            f"Looking for date in {date_cols}, desc in {desc_cols}. "
            f"Available columns (normalized): {df_cols_list}"
        )
        raise ValueError(
            f"No column mapping found for bank_code={bank_code}. Available columns: {list(df.columns)}"
        )
    
    rows: List[Dict[str, Any]] = []
    
    for _, row in df.iterrows():
        rec: Dict[str, Any] = {
            "txn_date": None,
            "amount": None,
            "direction": None,
            "description": "",
            "ref_no": None,
        }
        
        # Map columns with fuzzy matching
        for col, val in row.items():
            col_norm = str(col).strip().lower()
            
            # 1) try exact mapping
            key = bank_map.get(col_norm)
            
            # 2) fuzzy mapping for typical bank patterns
            if not key:
                if bank_key == "HDFC":
                    if "date" in col_norm and ("value" in col_norm or col_norm == "date"):
                        key = "txn_date"
                    elif "narration" in col_norm or "description" in col_norm or "particulars" in col_norm:
                        key = "description"
                    elif "withdrawal" in col_norm or ("debit" in col_norm and "amount" in col_norm):
                        key = "debit"
                    elif "deposit" in col_norm or ("credit" in col_norm and "amount" in col_norm):
                        key = "credit"
                    elif "chq" in col_norm or "ref" in col_norm:
                        key = "ref_no"
                
                elif bank_key == "ICICI":
                    if "transaction date" in col_norm or col_norm == "date":
                        key = "txn_date"
                    elif "remarks" in col_norm or "description" in col_norm:
                        key = "description"
                    elif "withdrawal" in col_norm or ("debit" in col_norm and "amount" in col_norm):
                        key = "debit"
                    elif "deposit" in col_norm or ("credit" in col_norm and "amount" in col_norm):
                        key = "credit"
                    elif "cheque" in col_norm or "ref" in col_norm:
                        key = "ref_no"
                
                elif bank_key == "SBI":
                    if "date" in col_norm:
                        key = "txn_date"
                    elif "narration" in col_norm or "description" in col_norm:
                        key = "description"
                    elif "withdrawal" in col_norm or ("debit" in col_norm and "amount" in col_norm):
                        key = "debit"
                    elif "deposit" in col_norm or ("credit" in col_norm and "amount" in col_norm):
                        key = "credit"
                    elif "ref" in col_norm:
                        key = "ref_no"
            
            if not key:
                continue
            
            if key == "txn_date":
                if pd.isna(val):
                    continue
                if isinstance(val, (datetime, pd.Timestamp)):
                    rec["txn_date"] = val.date()
                else:
                    try:
                        rec["txn_date"] = pd.to_datetime(val).date()
                    except:
                        continue
            elif key in ("debit", "credit"):
                if pd.isna(val) or float(val) == 0:
                    continue
                amt = float(val)
                rec["amount"] = amt
                rec["direction"] = "debit" if key == "debit" else "credit"
            elif key == "amount":
                if pd.isna(val) or float(val) == 0:
                    continue
                rec["amount"] = abs(float(val))
            else:
                rec[key] = None if pd.isna(val) else str(val).strip()
        
        # Derive direction for generic (single amount + type column)
        if bank_key == "GENERIC" and rec["direction"] is None:
            type_val = str(row.get("type", "")).lower() if "type" in row else ""
            if type_val.startswith("d") or type_val.startswith("debit"):
                rec["direction"] = "debit"
            elif type_val.startswith("c") or type_val.startswith("credit"):
                rec["direction"] = "credit"
            elif rec["amount"]:
                # Try to infer from amount sign (if negative, likely debit)
                # But we already have abs, so check original
                orig_amt = row.get("amount")
                if orig_amt and float(orig_amt) < 0:
                    rec["direction"] = "debit"
                    rec["amount"] = abs(float(orig_amt))
                else:
                    rec["direction"] = "credit"
        
        if not rec["txn_date"] or rec["amount"] is None or not rec["direction"]:
            # skip blank / header rows
            continue
        
        rows.append(rec)
    
    return rows


def apply_categorization_rules(
    session,
    rows: List[Dict[str, Any]],
    bank_code: str
) -> List[Dict[str, Any]]:
    """Apply categorization rules from enrichment.txn_categorization_rule table"""
    if not rows:
        return []
    
    # Load rules once
    rule_rows = session.execute(text("""
        SELECT rule_id, bank_code, match_field, match_type, match_value,
               direction, primary_category, sub_category, priority
        FROM enrichment.txn_categorization_rule
        WHERE is_active = TRUE
          AND (bank_code = :bank_code OR bank_code IS NULL)
        ORDER BY priority ASC
    """), {"bank_code": bank_code}).mappings().all()
    
    rules = [dict(r) for r in rule_rows]
    
    categorized: List[Dict[str, Any]] = []
    
    for r in rows:
        primary = "uncategorized"
        sub = "uncategorized"
        
        for rule in rules:
            # direction filter
            if rule["direction"] and rule["direction"] != r["direction"]:
                continue
            
            field_name = rule["match_field"]
            haystack = (r.get(field_name) or "").lower()
            
            if not haystack:
                continue
            
            pat = (rule["match_value"] or "").lower()
            
            matched = False
            if rule["match_type"] == "contains":
                matched = pat in haystack
            elif rule["match_type"] == "startswith":
                matched = haystack.startswith(pat)
            elif rule["match_type"] == "regex":
                try:
                    if re.search(rule["match_value"], haystack, re.IGNORECASE):
                        matched = True
                except re.error:
                    matched = False
            
            if matched:
                primary = rule["primary_category"]
                sub = rule["sub_category"]
                break  # respect priority
        
        r["primary_category"] = primary
        r["sub_category"] = sub
        categorized.append(r)
    
    return categorized


def read_excel_with_auto_header(path: str, bank_code: str):
    """
    Read Excel and try to auto-detect the header row for bank statements
    (HDFC/ICICI/SBI/other) that have title rows before the actual table header.
    """
    import pandas as pd
    import logging
    
    logger = logging.getLogger(__name__)
    
    # First, naive read (header=0)
    try:
        df_default = pd.read_excel(path, engine="openpyxl")
        # If default read already gives us useful headers (has 'date' and desc col), just use it
        cols_norm = [str(c).strip().lower() for c in df_default.columns]
        if any("date" in c for c in cols_norm) and any(
            any(x in c for x in ["narration", "description", "particulars"])
            for c in cols_norm
        ):
            logger.info(f"Using default header row for {bank_code}: {cols_norm}")
            return df_default
    except Exception:
        try:
            df_default = pd.read_excel(path, engine="xlrd")
            cols_norm = [str(c).strip().lower() for c in df_default.columns]
            if any("date" in c for c in cols_norm) and any(
                any(x in c for x in ["narration", "description", "particulars"])
                for c in cols_norm
            ):
                logger.info(f"Using default header row for {bank_code}: {cols_norm}")
                return df_default
        except Exception as e:
            logger.warning(f"Default Excel read failed, falling back to header=None: {e}")
    
    # Fallback: header=None read for scanning
    try:
        df_raw = pd.read_excel(path, header=None, engine="openpyxl")
    except Exception:
        try:
            df_raw = pd.read_excel(path, header=None, engine="xlrd")
        except Exception as e:
            logger.error(f"Failed to read Excel file for header detection: {e}")
            raise ValueError(f"Failed to read Excel file. Ensure it's a valid .xlsx or .xls file: {str(e)}")
    
    max_scan = min(100, len(df_raw))
    
    def is_header_row(row_values: list) -> bool:
        texts = [str(x).strip().lower() for x in row_values if str(x).strip() not in ("", "nan")]
        if not texts:
            return False
        joined = " ".join(texts)
        
        has_date = any("date" in t for t in texts)
        has_desc = any(x in joined for x in ["narration", "description", "particulars"])
        has_money = any(
            x in joined
            for x in [
                "withdrawal",
                "deposit",
                "debit",
                "credit",
                "amount",
                "balance",
                "dr",
                "cr",
            ]
        )
        
        # Typical bank header: Date + (Narration/Description/Particulars) + some money col
        if has_date and (has_desc or has_money):
            return True
        return False
    
    header_row_idx = None
    
    # Pass 1: strict-ish detection
    for i in range(max_scan):
        row = df_raw.iloc[i].tolist()
        if is_header_row(row):
            header_row_idx = i
            logger.info(f"Detected header row {i} for {bank_code} (strict match)")
            break
    
    # Pass 2: looser rule if not found
    if header_row_idx is None:
        for i in range(max_scan):
            row = df_raw.iloc[i].tolist()
            texts = [str(x).strip().lower() for x in row if str(x).strip() not in ("", "nan")]
            if not texts:
                continue
            joined = " ".join(texts)
            if "date" in joined and any(x in joined for x in ["narration", "description", "particulars"]):
                header_row_idx = i
                logger.info(f"Detected header row {i} for {bank_code} (loose match)")
                break
    
    if header_row_idx is not None:
        try:
            df = pd.read_excel(path, header=header_row_idx, engine="openpyxl")
            return df
        except Exception:
            try:
                df = pd.read_excel(path, header=header_row_idx, engine="xlrd")
                return df
            except Exception as e:
                logger.error(f"Failed to read Excel file with header row {header_row_idx}: {e}")
                raise ValueError(f"Failed to read Excel file with detected header: {str(e)}")
    
    # As an extra fallback: if all column names are numeric, try using first non-empty row as header
    # This is mostly for weird sheets where pandas can't infer anything sensible.
    if all(isinstance(c, (int, float)) for c in df_raw.columns):
        logger.warning(
            f"Could not auto-detect header row for {bank_code}, using first non-empty row as header"
        )
        first_non_empty_idx = None
        for i in range(len(df_raw)):
            row = df_raw.iloc[i].tolist()
            if any(str(x).strip() not in ("", "nan") for x in row):
                first_non_empty_idx = i
                break
        
        if first_non_empty_idx is not None:
            header = [str(x).strip().lower() for x in df_raw.iloc[first_non_empty_idx].tolist()]
            df = df_raw.iloc[first_non_empty_idx + 1 :].copy()
            df.columns = header
            return df
    
    logger.error(f"Could not auto-detect header row for {bank_code}, using raw DataFrame")
    return df_raw


def _sync_parse_and_stage_excel(user_id: str, batch_id: str, file_name: str, path: str, bank_code: str = "GENERIC") -> Tuple[int, int, int]:
    """Synchronous Excel parsing and staging with bank-specific normalization and categorization"""
    import pandas as pd
    pipeline = ETLPipeline(user_id)
    session = SessionLocal()
    
    try:
        # Read Excel file (try openpyxl first, then xlrd for .xls)
        try:
            df = pd.read_excel(path, engine="openpyxl")
        except Exception:
            try:
                df = pd.read_excel(path, engine="xlrd")
            except Exception as e:
                logger.error(f"Failed to read Excel file: {e}")
                raise ValueError(f"Failed to read Excel file. Ensure it's a valid .xlsx or .xls file: {str(e)}")
        
        # Try bank-specific normalization, else generic row parser
        try:
            # First try auto-header detection
            df = read_excel_with_auto_header(path, bank_code)
            logger.info(f"Detected columns after auto-header detection: {list(df.columns)[:10]}")
            
            # Try normalize_excel_df
            rows = normalize_excel_df(df, bank_code)
            logger.info(f"Excel normalize produced {len(rows)} canonical rows for bank_code={bank_code}")
        except ValueError as e:
            logger.warning(
                f"normalize_excel_df failed for bank_code={bank_code}: {e}. "
                f"Falling back to generic Excel row parser."
            )
            # Re-read the file for fallback parser
            try:
                df = pd.read_excel(path, engine="openpyxl")
            except Exception:
                df = pd.read_excel(path, engine="xlrd")
            rows = parse_excel_generic_rows(df)
            logger.info(f"Generic Excel parser produced {len(rows)} canonical rows")
        
        if rows:
            logger.info(f"Sample row[0]: {rows[0]}")
        
        if not rows:
            logger.warning(f"No transactions found in Excel for batch {batch_id}")
            return 0, 0, 0
        
        # Categorize each row using rules table
        categorized_rows = apply_categorization_rules(session, rows, bank_code)
        
        # Convert to StagedTxnIn format
        txns = []
        for idx, r in enumerate(categorized_rows):
            try:
                tx = StagedTxnIn(
                    amount=r["amount"],
                    transaction_date=r["txn_date"],
                    description=r["description"],
                    merchant=None,
                    bank=bank_code,
                    category=r["primary_category"],
                    reference_id=r.get("ref_no"),
                    currency="INR",
                    transaction_type=r["direction"],
                    source="excel_upload",
                    row_number=idx + 1,
                )
                txns.append(tx.dict())
            except Exception as e:
                logger.warning(f"Skipping invalid row {idx + 1}: {e}")
                continue
        
        pipeline.stage_transactions(txns, batch_id)
        v = pipeline.validate_staged_transactions(batch_id)
        
        if v.get("valid", 0) > 0:
            pipeline.categorize_staged_transactions(batch_id)
            pipeline.load_to_production(batch_id)
        
        return len(txns), v.get("valid", 0), v.get("invalid", 0)
    except ValueError as e:
        # Let ValueError bubble up (will become 400)
        logger.error(f"Excel validation error for batch {batch_id}: {e}")
        raise
    except Exception as e:
        logger.exception(f"Error parsing Excel for batch {batch_id}")
        raise
    finally:
        session.close()


def parse_excel_generic_rows(df) -> List[Dict[str, Any]]:
    """
    Fallback Excel parser when we can't understand columns.
    
    Strategy:
      - Join all cell values in a row into a single string
      - Use the same regex pattern as PDF generic parser:
        DD/MM/YYYY  description.....  amount  DR/CR
    """
    import pandas as pd
    
    rows: List[Dict[str, Any]] = []
    
    # Normalize all cells to string and fill NaNs
    df_str = df.fillna("").astype(str)
    
    # Same pattern as parse_pdf_generic_lines
    pattern = re.compile(
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+"
        r"(?P<desc>.+?)\s+"
        r"(?P<amount>[0-9,]+\.?\d{0,2})\s+"
        r"(?P<dc>DR|CR|DEBIT|CREDIT)",
        re.IGNORECASE,
    )
    
    for _, row in df_str.iterrows():
        # Join all columns into one line like "col0 col1 col2 ..."
        line = " ".join([v.strip() for v in row.values if v and v.strip()])
        if not line:
            continue
        
        m = pattern.search(line)
        if not m:
            continue
        
        dt_raw = m.group("date")
        desc = m.group("desc").strip()
        amt_raw = m.group("amount").replace(",", "")
        dc = m.group("dc").upper()
        
        try:
            # Try DD/MM/YYYY first, then DD-MM-YYYY
            try:
                dt = datetime.strptime(dt_raw, "%d/%m/%Y").date()
            except ValueError:
                try:
                    dt = datetime.strptime(dt_raw, "%d/%m/%y").date()
                except ValueError:
                    try:
                        dt = datetime.strptime(dt_raw, "%d-%m-%Y").date()
                    except ValueError:
                        dt = datetime.strptime(dt_raw, "%d-%m-%y").date()
        except ValueError:
            continue
        
        try:
            amount = float(amt_raw)
        except ValueError:
            continue
        
        direction = "debit" if dc in ("DR", "DEBIT") else "credit"
        
        rows.append({
            "txn_date": dt,
            "amount": amount,
            "direction": direction,
            "description": desc,
            "ref_no": None,
        })
    
    return rows


def parse_pdf_generic_lines(text: str) -> List[Dict[str, Any]]:
    """
    Generic PDF line parser - extracts transactions from text lines.
    Pattern: DD/MM/YYYY  description.....  amount  DR/CR
    """
    lines = text.splitlines()
    out: List[Dict[str, Any]] = []
    
    # Pattern: DD/MM/YYYY or DD-MM-YYYY  description  amount  DR/CR
    pattern = re.compile(
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<desc>.+?)\s+(?P<amount>[0-9,]+\.?\d{0,2})\s+(?P<dc>DR|CR|DEBIT|CREDIT)",
        re.IGNORECASE,
    )
    
    for line in lines:
        m = pattern.search(line)
        if not m:
            continue
        
        dt_raw = m.group("date")
        desc = m.group("desc").strip()
        amt_raw = m.group("amount").replace(",", "")
        dc = m.group("dc").upper()
        
        try:
            # Try DD/MM/YYYY first
            try:
                dt = datetime.strptime(dt_raw, "%d/%m/%Y").date()
            except ValueError:
                try:
                    dt = datetime.strptime(dt_raw, "%d/%m/%y").date()
                except ValueError:
                    # Try DD-MM-YYYY
                    try:
                        dt = datetime.strptime(dt_raw, "%d-%m-%Y").date()
                    except ValueError:
                        dt = datetime.strptime(dt_raw, "%d-%m-%y").date()
        except ValueError:
            continue
        
        try:
            amount = float(amt_raw)
        except ValueError:
            continue
        
        direction = "debit" if dc in ("DR", "DEBIT") else "credit"
        
        out.append({
            "txn_date": dt,
            "amount": amount,
            "direction": direction,
            "description": desc,
            "ref_no": None,
        })
    
    return out


def parse_pdf_bank_text(text: str, bank: str) -> List[Dict[str, Any]]:
    """
    Bank-specific PDF parser. For now, uses generic parser.
    Can be enhanced with bank-specific table extraction or regex patterns.
    """
    if bank in ("HDFC", "ICICI", "SBI"):
        # Start with generic parser, can be enhanced with bank-specific logic
        # For example, HDFC often has: "Date   Narration   Chq/Ref  Withdrawal  Deposit  Balance"
        return parse_pdf_generic_lines(text)
    else:
        return parse_pdf_generic_lines(text)


def parse_pdf_statement(
    raw_bytes: bytes,
    bank_code: str,
    password: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Parse PDF bank statement into canonical transaction rows.
    
    Returns:
        List of dicts with: txn_date, amount, direction, description, ref_no
    """
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("pdfplumber is required for PDF parsing. Install with: pip install pdfplumber")
    
    rows: List[Dict[str, Any]] = []
    
    try:
        with pdfplumber.open(BytesIO(raw_bytes), password=password) as pdf:
            all_text_pages = [page.extract_text() or "" for page in pdf.pages]
    except Exception as e:
        # Check for password-related errors
        error_str = str(e).lower()
        error_type = type(e).__name__
        if "password" in error_str or "encrypted" in error_str or "PDFPasswordIncorrect" in error_type:
            if password:
                raise ValueError("PDF password is incorrect. Please check the password and try again.")
            else:
                raise ValueError("PDF is password protected. Please provide the password.")
        raise ValueError(f"Failed to open PDF: {str(e)}")
    
    bank = bank_code.upper()
    
    # Extract transactions from each page
    for page_text in all_text_pages:
        if bank in ("HDFC", "ICICI", "SBI"):
            rows.extend(parse_pdf_bank_text(page_text, bank))
        else:
            rows.extend(parse_pdf_generic_lines(page_text))
    
    return rows


def _sync_parse_and_stage_pdf(
    user_id: str,
    batch_id: str,
    file_name: str,
    raw_bytes: bytes,
    bank_code: str = "GENERIC",
    password: Optional[str] = None
) -> Tuple[int, int, int]:
    """Synchronous PDF parsing and staging with bank-specific parsing and categorization"""
    pipeline = ETLPipeline(user_id)
    session = SessionLocal()
    
    try:
        # Parse PDF into canonical rows
        try:
            rows = parse_pdf_statement(raw_bytes, bank_code, password)
        except ValueError as e:
            logger.error(f"Failed to parse PDF: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Failed to parse PDF: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")
        
        if not rows:
            logger.warning(f"No transactions found in PDF for batch {batch_id}")
            return 0, 0, 0
        
        # Categorize each row using rules table
        categorized_rows = apply_categorization_rules(session, rows, bank_code)
        
        # Convert to StagedTxnIn format
        txns = []
        for idx, r in enumerate(categorized_rows):
            try:
                tx = StagedTxnIn(
                    amount=r["amount"],
                    transaction_date=r["txn_date"],
                    description=r["description"],
                    merchant=None,
                    bank=bank_code,
                    category=r["primary_category"],
                    reference_id=r.get("ref_no"),
                    currency="INR",
                    transaction_type=r["direction"],
                    source="pdf_statement",
                    row_number=idx + 1,
                )
                txns.append(tx.dict())
            except Exception as e:
                logger.warning(f"Skipping invalid row {idx + 1}: {e}")
                continue
        
        pipeline.stage_transactions(txns, batch_id)
        v = pipeline.validate_staged_transactions(batch_id)
        
        if v.get("valid", 0) > 0:
            pipeline.categorize_staged_transactions(batch_id)
            pipeline.load_to_production(batch_id)
        
        return len(txns), v.get("valid", 0), v.get("invalid", 0)
    except Exception as e:
        logger.exception(f"Error parsing PDF for batch {batch_id}")
        raise
    finally:
        session.close()


@router.post("/upload/csv", response_model=ETLResponse)
async def upload_csv_etl(
    file: UploadFile = File(...),
    user: UserDep = Depends(get_current_user)
):
    """
    Upload CSV file - Starts ETL pipeline (non-blocking)
    
    Process:
    1. Extract: Parse CSV and stage records (async worker)
    2. Transform: Validate and categorize (async worker)
    3. Load: Move to production tables (async worker)
    """
    # Stream to temp, sniff mime
    path, size, mime = await save_upload_to_temp(file)
    ensure_csv_mime(mime, file.filename)
    
    # Create upload batch
    pipeline = ETLPipeline(user.user_id)
    batch_id = pipeline.create_upload_batch(
        upload_type='csv',
        file_name=file.filename,
        file_size=size
    )
    
    logger.info(f"CSV upload batch created: {batch_id} for user {user.user_id}, size: {size}")
    
    # Try to get worker task
    try:
        from app.workers.csv_worker import parse_csv
    except Exception:
        parse_csv = None  # No worker available
    
    # Dispatch or fallback
    res = await run_sync(
        _dispatch_or_fallback,
        parse_csv,
        user_id=str(user.user_id),
        batch_id=str(batch_id),
        file_name=file.filename or "upload.csv",
        path=path
    )
    
    return res


@router.post("/upload/xlsx", response_model=ETLResponse)
async def upload_xlsx_etl(
    file: UploadFile = File(...),
    bank_code: str = Query("GENERIC", description="Bank code: HDFC, ICICI, SBI, or GENERIC"),
    user: UserDep = Depends(get_current_user)
):
    """
    Upload XLSX file - Starts ETL pipeline with bank-specific column mapping and rule-based categorization
    
    Process:
    1. Extract: Parse Excel with bank-specific column normalization
    2. Transform: Apply categorization rules from enrichment.txn_categorization_rule
    3. Load: Stage, validate, and load to production tables
    """
    # Stream to temp, sniff mime
    path, size, mime = await save_upload_to_temp(file)
    kind = ensure_excel_mime(mime)  # "xlsx"|"xls"
    
    # Both .xlsx and .xls are supported - pandas.read_excel handles both
    
    # Create upload batch
    pipeline = ETLPipeline(user.user_id)
    batch_id = pipeline.create_upload_batch(
        upload_type='xlsx',
        file_name=file.filename,
        file_size=size
    )
    
    logger.info(f"XLSX upload batch created: {batch_id} for user {user.user_id}, bank_code: {bank_code}, size: {size}")
    
    # Try to get worker task
    try:
        from app.workers.xls_worker import parse_xls
    except Exception:
        parse_xls = None  # No worker available
    
    # For now, use sync fallback with bank_code
    # TODO: Update worker to accept bank_code parameter
    try:
        records_staged, valid, invalid = _sync_parse_and_stage_excel(
            str(user.user_id),
            str(batch_id),
            file.filename or "upload.xlsx",
            path,
            bank_code
        )
        
        # Cleanup temp file
        try:
            os.remove(path)
        except Exception:
            pass
        
        return ETLResponse(
            message=f"Upload processed: {valid} valid, {invalid} invalid",
            batch_id=str(batch_id),
            records_staged=records_staged,
        )
    except HTTPException:
        # If lower layer raised an HTTPException, just bubble it up
        try:
            os.remove(path)
        except Exception:
            pass
        raise
    except ValueError as e:
        # Normalize to 400 for validation errors
        try:
            os.remove(path)
        except Exception:
            pass
        logger.error(f"Excel validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Everything else is a real 500
        try:
            os.remove(path)
        except Exception:
            pass
        logger.exception(f"Error processing Excel upload: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process Excel file: {str(e)}")


@router.post("/upload/pdf", response_model=ETLResponse)
async def upload_pdf_etl(
    file: UploadFile = File(...),
    bank_code: str = Form("GENERIC", description="Bank code: HDFC, ICICI, SBI, or GENERIC"),
    password: Optional[str] = Form(None, description="Password for password-protected PDFs"),
    user: UserDep = Depends(get_current_user)
):
    """
    Upload PDF bank statement - Starts ETL pipeline with bank-specific parsing and rule-based categorization
    
    Process:
    1. Extract: Parse PDF with bank-specific text extraction
    2. Transform: Apply categorization rules from enrichment.txn_categorization_rule
    3. Load: Stage, validate, and load to production tables
    
    Supports password-protected PDFs via password parameter.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    
    # Read file content
    raw_bytes = await file.read()
    
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    
    # Create upload batch
    pipeline = ETLPipeline(user.user_id)
    batch_id = pipeline.create_upload_batch(
        upload_type='pdf',
        file_name=file.filename,
        file_size=len(raw_bytes)
    )
    
    logger.info(f"PDF upload batch created: {batch_id} for user {user.user_id}, bank_code: {bank_code}, size: {len(raw_bytes)}")
    
    try:
        records_staged, valid, invalid = _sync_parse_and_stage_pdf(
            str(user.user_id),
            str(batch_id),
            file.filename or "upload.pdf",
            raw_bytes,
            bank_code,
            password
        )
        
        return ETLResponse(
            message=f"Upload processed: {valid} valid, {invalid} invalid",
            batch_id=str(batch_id),
            records_staged=records_staged,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error processing PDF upload: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF file: {str(e)}")


@router.get("/batches/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(
    batch_id: str,
    user: UserDep = Depends(get_current_user)
):
    """Get status of upload batch"""
    pipeline = ETLPipeline(user.user_id)
    status_info = pipeline.get_batch_status(batch_id)
    
    if 'error' in status_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=status_info['error']
        )
    
    return status_info


@router.post("/batches/{batch_id}/validate")
async def validate_batch(
    batch_id: str,
    user: UserDep = Depends(get_current_user)
):
    """Manually trigger validation for a batch"""
    pipeline = ETLPipeline(user.user_id)
    result = pipeline.validate_staged_transactions(batch_id)
    
    return {
        "message": "Validation completed",
        "result": result
    }


@router.post("/batches/{batch_id}/categorize")
async def categorize_batch(
    batch_id: str,
    user: UserDep = Depends(get_current_user)
):
    """Manually trigger categorization for a batch"""
    pipeline = ETLPipeline(user.user_id)
    result = pipeline.categorize_staged_transactions(batch_id)
    
    return {
        "message": "Categorization completed",
        "result": result
    }


@router.post("/batches/{batch_id}/load")
async def load_batch(
    batch_id: str,
    user: UserDep = Depends(get_current_user)
):
    """Manually trigger loading to production"""
    pipeline = ETLPipeline(user.user_id)
    result = pipeline.load_to_production(batch_id)
    
    return {
        "message": "Load completed",
        "result": result
    }


@router.get("/batches")
async def list_batches(
    skip: int = 0,
    limit: int = 20,
    user: UserDep = Depends(get_current_user)
):
    """List all upload batches for user"""
    from app.database.postgresql import SessionLocal
    from app.models.staging_models import UploadBatch
    
    # Cap limit to prevent huge pulls
    limit = min(limit, 100)
    
    session = SessionLocal()
    try:
        batches = session.query(UploadBatch).filter(
            UploadBatch.user_id == user.user_id
        ).order_by(UploadBatch.created_at.desc()).offset(skip).limit(limit).all()
        
        return {
            "batches": [
                {
                    "id": batch.id,
                    "upload_type": batch.upload_type,
                    "file_name": batch.file_name,
                    "status": batch.status,
                    "total_records": batch.total_records,
                    "processed_records": batch.processed_records,
                    "created_at": batch.created_at.isoformat() if batch.created_at else None,
                    "completed_at": batch.completed_at.isoformat() if batch.completed_at else None
                }
                for batch in batches
            ]
        }
    finally:
        session.close()


# -----------------------------------------------------------------------------
# SpendSense: Direct load from staging -> fact + enrichment (MVP)
# -----------------------------------------------------------------------------
def load_staging_for_user(user_id_str: str) -> int:
    """Core loader: move staging rows for a user into fact + enrichment.

    Returns inserted count.
    """
    from app.database.postgresql import SessionLocal
    from app.models.spendsense_models import TxnStaging, TxnFact, TxnEnriched, DimCategory
    from sqlalchemy import text
    import uuid as _uuid

    def _extract_and_categorize(description: str, merchant_raw: Optional[str], direction: str) -> tuple:
        """
        Extract merchant name and categorize using merchant_rules.
        
        Returns:
            Tuple of (merchant_name_norm, category_code, subcategory_code)
        """
        from app.services.merchant_extractor import extract_merchant_from_description, normalize_merchant_name
        from app.services.pg_rules_client import PGRulesClient
        
        # Step 1: Extract merchant name from description if merchant_raw is not provided or unclear
        merchant_name = merchant_raw
        if not merchant_name or merchant_name.lower() in ['unknown', 'nan', '']:
            # Try to extract from description (for UPI transactions)
            merchant_name = extract_merchant_from_description(description or "")
        
        # Step 2: Normalize merchant name for matching
        merchant_normalized = normalize_merchant_name(merchant_name or description or "")
        
        # Step 3: Match against merchant_rules (user-specific + global)
        # Pass both merchant and description so rules can match either field
        rule_match = PGRulesClient.match_merchant(
            merchant_name=merchant_normalized or None,
            description=description or None,
            user_id=user_id_str,
            use_cache=True
        )
        
        if rule_match:
            # Only use the match if it has a category_code
            # Rules without categories (e.g., UPI pattern matchers) shouldn't stop further matching
            category_from_rule = rule_match.get("category_code")
            if category_from_rule:
                return (
                    rule_match.get("merchant_name_norm") or merchant_normalized,
                    category_from_rule,
                    rule_match.get("subcategory_code")
                )
            # If rule matched but has no category, continue to fallback
        
        # Step 4: Fallback to keyword-based inference
        if direction == 'credit':
            # Credits should NEVER be shopping/mobile_recharge/etc
            # Priority 1: Check if it's a personal name (2-4 words, no business keywords)
            search_text = (merchant_normalized or description or "").lower()
            words = search_text.split()
            is_personal_name = (len(words) >= 2 and len(words) <= 4 and 
                               not any(word in search_text for word in ["enterprises", "services", "solutions", "technologies", "private", "limited", "hotel", "hotels", "resort", "lodge", "industries", "trading", "traders", "store", "shop", "pvt", "ltd", "inc", "corp", "corporation"]))
            
            # Common Indian personal names
            common_names = ["abhinav", "shobha", "vasantha", "vasanthakumari", "yashwanth", "yashwant", "sriram", "kumari", "kiran", "uday", "navalga", "jatavath", "shaik", "zuber", "mohammad", "mohammed", "sameer", "shakeel", "arifa", "begum", "gurajala", "josaf", "pathlavath", "ramesh", "pittala", "yadagiri", "ippalui", "krishnaiah", "sandeep", "venkata", "hanuman", "naseer", "malla", "satya", "srinivasa", "ravi", "sri", "sai", "teja", "industr"]
            
            if is_personal_name or any(name in search_text for name in common_names):
                # Personal name → transfers
                return (merchant_normalized, "transfers", "p2p_transfer")
            
            # Priority 2: Check if merchant name looks like a company
            merchant_lower = (merchant_normalized or "").lower()
            company_keywords = ["technologies", "technology", "private", "limited", "pvt", "ltd", "inc", "corporation", "corp", "industries", "clearing", "nse", "bse", "nsec"]
            if any(keyword in merchant_lower for keyword in company_keywords):
                return (merchant_normalized, "income", "salary")
            
            # Priority 3: Check if it contains business keywords (but not personal name)
            business_keywords = ["enterprises", "services", "solutions", "traders", "store", "shop"]
            if any(word in merchant_lower for word in business_keywords):
                # Could be business payment → transfers or salary_income
                # If it's a small business, likely a transfer
                return (merchant_normalized, "transfers", "p2p_personal")
            
            # Default: credits from unknown sources → transfers (not salary_income)
            # This handles cases where we can't determine if it's personal or company
            return (merchant_normalized, "transfers", "p2p_personal")
        
        # For debits, use keyword matching
        search_text = (merchant_normalized or description or "").lower()
        category = _infer_category_from_keywords(search_text)
        
        return (merchant_normalized, category, None)
    
    def _infer_category_from_keywords(text: str) -> str:
        """Infer category from keywords (fallback for debits only) - uses India-first categories"""
        if not text:
            return "shopping"  # Default fallback (closest to "others")
        
        text_lower = text.lower()
        
        # New India-first taxonomy (13 categories)
        
        # Nightlife & Eating Out
        if any(k in text_lower for k in ["zomato", "swiggy", "food delivery"]):
            return "nightlife"  # food_delivery subcategory
        if any(k in text_lower for k in ["dine", "restaurant", "truffles", "food", "meal", "pizza", "burger"]):
            return "nightlife"  # restaurant_dineout subcategory
        if any(k in text_lower for k in ["cafe", "coffee", "cup", "theory", "barista"]):
            return "nightlife"  # coffee_cafe subcategory
        if any(k in text_lower for k in ["pub", "bar", "club", "lounge", "party", "event"]):
            return "nightlife"  # pub_bar or party_event subcategory
        if any(k in text_lower for k in ["pan", "paan", "beeda", "cigarette"]):
            return "nightlife"  # pan_shop subcategory
        
        # Home & Daily Needs
        if any(k in text_lower for k in ["bigbasket", "blinkit", "zepto", "dmart", "supermarket", "grocery", "kirana", "provisions"]):
            return "home_needs"  # groceries subcategory
        if any(k in text_lower for k in ["bescom", "bwssb", "tsspdcl", "electricity", "power"]):
            return "home_needs"  # electricity_home subcategory
        if any(k in text_lower for k in ["water", "water bill"]):
            return "home_needs"  # waterbill_home subcategory
        if any(k in text_lower for k in ["lpg", "gas", "cylinder"]):
            return "home_needs"  # gas_lpg subcategory
        if any(k in text_lower for k in ["apartment", "rent", "society", "maintenance", "property", "house", "flat"]):
            return "home_needs"  # rent_home or maintenance_society subcategory
        
        # Transport & Travel
        if any(k in text_lower for k in ["uber", "ola", "rapido", "cab", "taxi", "ride"]):
            return "transport"  # cab_ride subcategory
        if any(k in text_lower for k in ["auto", "rickshaw"]):
            return "transport"  # auto_rickshaw subcategory
        if any(k in text_lower for k in ["metro", "bus", "train", "irctc", "railways"]):
            return "transport"  # bus_train subcategory
        if any(k in text_lower for k in ["indigo", "vistara", "air india", "akasa", "flight", "airline"]):
            return "transport"  # flight subcategory
        if any(k in text_lower for k in ["hotel", "hotels", "resort", "lodge", "inn", "accommodation", "taj", "oberoi", "itc", "hilton", "marriott", "hyatt", "oyo", "booking", "stay"]):
            return "transport"  # hotel_stay subcategory
        if any(k in text_lower for k in ["fuel", "petrol", "diesel"]):
            return "transport"  # fuel_petrol subcategory
        if any(k in text_lower for k in ["fastag", "toll", "nhai", "parking"]):
            return "transport"  # toll_fastag or parking subcategory
        
        # Shopping & Lifestyle
        if any(k in text_lower for k in ["amazon", "flipkart", "myntra", "ajio", "meesho"]):
            return "shopping"  # online_shopping subcategory
        if any(k in text_lower for k in ["croma", "reliance digital", "electronics", "gadget"]):
            return "shopping"  # electronics subcategory
        if any(k in text_lower for k in ["apparel", "clothing", "footwear", "shirt", "pant", "dress"]):
            return "shopping"  # apparel subcategory
        if any(k in text_lower for k in ["bazaar", "mall", "store", "shop"]):
            return "shopping"  # online_shopping subcategory (default)
        
        # Bills & Recharges
        if any(k in text_lower for k in ["jio", "airtel", "vi", "vodafone", "idea", "bsnl", "mobile", "recharge"]):
            return "bills"  # mobile_recharge subcategory
        if any(k in text_lower for k in ["broadband", "internet", "jiofiber", "act", "hathway", "bsnl ftth"]):
            return "bills"  # broadband_internet subcategory
        if any(k in text_lower for k in ["tata play", "dth", "cable", "dishtv", "sun direct"]):
            return "bills"  # dth_cable subcategory
        if any(k in text_lower for k in ["credit card", "cc payment", "card payment", "card bill"]):
            return "bills"  # credit_card_due subcategory
        
        # Health & Wellness
        if any(k in text_lower for k in ["doctor", "hospital", "clinic", "consultation"]):
            return "health"  # hospital or doctor subcategory
        if any(k in text_lower for k in ["pharmacy", "medicine", "medplus", "apollo pharmacy"]):
            return "health"  # pharmacy subcategory
        if any(k in text_lower for k in ["diagnostics", "lab", "thyrocare", "lal path"]):
            return "health"  # diagnostics subcategory
        if any(k in text_lower for k in ["fitness", "gym", "yoga"]):
            return "health"  # fitness_gym subcategory
        
        # Loans & EMI
        if any(k in text_lower for k in ["loan", "emi", "personal loan", "home loan", "car loan"]):
            return "loans"  # loan_personal or loan_home subcategory
        
        # Insurance
        if any(k in text_lower for k in ["lic", "hdfc life", "sbi life", "insurance", "life insurance"]):
            return "insurance"  # insurance_life subcategory
        
        # Banking & Savings
        if any(k in text_lower for k in ["hdfc rd", "rd ", "recurring deposit", "hdfc mf", "index fund", "sip", "mutual fund", "investment", "stocks", "shares", "ppf", "fd", "fixed deposit"]):
            return "banks"  # bank_savings subcategory
        
        # Government & Taxes
        if any(k in text_lower for k in ["income tax", "tds", "advance tax", "gst", "property tax"]):
            return "govt_tax"  # income_tax or gst subcategory
        if any(k in text_lower for k in ["traffic", "fine", "challan"]):
            return "govt_tax"  # traffic_fine subcategory
        # Travel / Hotels (but exclude if it looks like a personal name)
        # Check if it's a personal name first (2-3 words, no business keywords)
        words = text_lower.split()
        is_personal_name = (len(words) >= 2 and len(words) <= 4 and 
                           not any(word in text_lower for word in ["enterprises", "services", "solutions", "technologies", "private", "limited", "hotel", "hotels", "resort", "lodge"]))
        
        if is_personal_name:
            # Likely a personal transfer - check common names
            common_names = ["abhinav", "shobha", "vasantha", "vasanthakumari", "yashwanth", "yashwant", "sriram", "kumari", "kiran", "uday", "navalga", "jatavath", "shaik", "zuber", "mohammad", "mohammed", "sameer", "shakeel", "arifa", "begum", "gurajala", "josaf", "pathlavath", "ramesh", "pittala", "yadagiri", "ippalui", "krishnaiah", "sandeep", "venkata", "hanuman", "naseer", "malla"]
            if any(name in text_lower for name in common_names):
                return "transfers"  # Personal transfer
        
        # Travel / Hotels (only if not a personal name)
        if not is_personal_name and any(k in text_lower for k in ["hotel", "hotels", "resort", "lodge", "inn", "accommodation", "taj", "oberoi", "itc", "hilton", "marriott", "hyatt", "oyo", "booking", "stay"]):
            return "travel"
        
        # Credit card apps / payments → bills.credit_card_due
        if any(k in text_lower for k in ["cred", "american express", "amex", "credit card", "cc payment", "card payment"]):
            return "bills"  # credit_card_due subcategory
        
        # Personal transfers/UPI to individuals - check if it looks like a business
        if any(k in text_lower for k in ["upi", "imps", "neft", "rtgs"]):
            # For personal names in UPI, check if it looks like a business
            business_keywords = ["enterprises", "services", "solutions", "traders", "store", "shop", "packages", "industries", "trading", "technologies", "private", "limited", "pvt", "ltd"]
            if any(word in text_lower for word in business_keywords):
                return "shopping"  # Likely a small business
            # Check if it's a company name (contains TECHNOLOGIES, PRIVATE, LIMITED, etc.)
            company_keywords = ["technologies", "technology", "private", "limited", "pvt", "ltd"]
            if any(word in text_lower for word in company_keywords):
                # Could be salary source - but if it's a debit, it's likely a payment to company
                return "shopping"
            # Personal transfer - check if it looks like a name
            if is_personal_name:
                return "transfers"
            # Default for UPI without clear merchant → transfers
            return "transfers"
        
        return "shopping"  # Default fallback (closest to "others")

    session = SessionLocal()
    inserted = 0
    try:
        user_id = _uuid.UUID(user_id_str) if isinstance(user_id_str, str) else user_id_str
        rows = session.query(TxnStaging).filter(
            TxnStaging.user_id == user_id,
            TxnStaging.parsed_ok == True
        ).all()

        # Ensure minimal categories exist for enrichment
        def ensure_category(cat_code: str):
            if not cat_code:
                return
            exists = session.query(DimCategory).filter(DimCategory.category_code == cat_code).first()
            if exists:
                return
            # Map to a txn_type bucket (using actual category codes from database)
            txn_type_map = {
                'dining': 'wants',
                'groceries': 'needs',
                'shopping': 'wants',
                'utilities': 'needs',
                'auto_taxi': 'needs',
                'flight': 'wants',
                'train': 'needs',
                'travel': 'wants',
                'rent': 'needs',
                'investments': 'assets',
                'income': 'income',
                'savings': 'assets',
                'others': 'wants'
            }
            txn_type = txn_type_map.get(cat_code, 'wants')
            # Format category name nicely (e.g., "auto_taxi" -> "Auto Taxi")
            category_name = cat_code.replace('_', ' ').title()
            session.add(DimCategory(category_code=cat_code, category_name=category_name, txn_type=txn_type, display_order=100, active=True))
            session.flush()

        for s in rows:
            # Extract merchant name and categorize using merchant_rules
            merchant_norm, category_code, subcategory_code = _extract_and_categorize(
                description=s.description_raw or "",
                merchant_raw=s.merchant_raw,
                direction=s.direction
            )
            
            # Calculate dedupe fingerprint once
            from sqlalchemy import text
            dedupe_fp_result = session.execute(text("""
                SELECT spendsense.fn_txn_fact_fp(:u, :d, :a, :dir, :desc, :m, :acct)
            """), {
                "u": s.user_id,
                "d": s.txn_date,
                "a": s.amount,
                "dir": s.direction,
                "desc": s.description_raw or "",
                "m": merchant_norm or "",
                "acct": getattr(s, 'account_ref', None) or ""
            }).scalar()
            
            # Check if transaction already exists using fingerprint
            existing = session.execute(text("""
                SELECT txn_id FROM spendsense.txn_fact
                WHERE dedupe_fp = :fp
                LIMIT 1
            """), {"fp": dedupe_fp_result}).first()
            
            if existing:
                # Transaction already exists - skip it
                continue
            
            # Use savepoint to isolate each transaction insert
            savepoint = session.begin_nested()
            try:
                fact = TxnFact(
                    user_id=s.user_id,
                    upload_id=s.upload_id,
                    source_type='file',
                    account_ref=getattr(s, 'account_ref', None),
                    txn_external_id=s.raw_txn_id,
                    txn_date=s.txn_date,
                    description=s.description_raw,
                    amount=s.amount,
                    direction=s.direction,  # 'debit' = expense, 'credit' = income
                    currency=s.currency or 'INR',
                    merchant_name_norm=merchant_norm or None
                )
                session.add(fact)
                session.flush()
                
                # Set audit fields via SQL (keeps model thin)
                session.execute(text("""
                    UPDATE spendsense.txn_fact
                    SET ingested_via = 'file',
                        raw_source_id = :upload_id
                    WHERE txn_id = :id
                """), {
                    "upload_id": s.upload_id,
                    "id": fact.txn_id
                })
                
                # Set dedupe_fp using already computed value (avoid recomputing)
                session.execute(text("""
                    UPDATE spendsense.txn_fact
                    SET dedupe_fp = :fp
                    WHERE txn_id = :id
                """), {
                    "fp": dedupe_fp_result,
                    "id": fact.txn_id
                })

                # Ensure category exists in dim_category to satisfy FK
                if category_code:
                    ensure_category(category_code)
                else:
                    # Fallback if no category found
                    category_code = "others"
                    ensure_category(category_code)
                
                # Create enriched record with category and subcategory
                enriched = TxnEnriched(
                    txn_id=fact.txn_id,
                    category_code=category_code,
                    subcategory_code=subcategory_code,
                    rule_confidence=1.0 if subcategory_code else 0.80
                )
                session.add(enriched)
                
                # Commit this individual transaction
                savepoint.commit()
                inserted += 1
            except Exception as insert_err:
                # Rollback just this savepoint (nested transaction)
                savepoint.rollback()
                
                # Handle duplicate key violations gracefully
                from sqlalchemy.exc import IntegrityError
                error_str = str(insert_err).lower()
                
                # Check if it's a duplicate/unique constraint violation
                is_duplicate = (
                    isinstance(insert_err, IntegrityError) or
                    ('unique' in error_str or 'duplicate' in error_str or 'ux_txn_fact_dedupe_fp' in error_str or 'dedupe_fp' in error_str)
                )
                
                if is_duplicate:
                    print(f"⚠️  Skipping duplicate transaction: {s.txn_date}, {s.amount}, {s.direction}")
                    # Continue to next transaction - savepoint rollback didn't affect other inserts
                    continue
                else:
                    # Some other error - re-raise it
                    raise

        # Commit all successful inserts at once
        session.commit()
        
        # Clear cache after loading to ensure fresh rules for next batch
        try:
            from app.services.pg_rules_client import clear_cache
            clear_cache()
        except Exception:
            pass  # Cache clearing is optional

        # Refresh KPIs for the user
        try:
            from app.routers.spendsense import _rebuild_kpis_for_user
            _rebuild_kpis_for_user(session, user_id_str)
            print(f"✅ KPIs refreshed for user {user_id_str}")
        except Exception as kpi_err:
            # Don't fail the whole operation if KPI refresh fails
            print(f"⚠️  Warning: Could not refresh KPIs: {kpi_err}")
        
        # Refresh materialized views if present
        try:
            # Check if views exist before refreshing
            result = session.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_matviews 
                    WHERE schemaname = 'spendsense' 
                    AND matviewname = 'mv_spendsense_dashboard_user_month'
                )
            """))
            if result.scalar():
                try:
                    # Try CONCURRENTLY first (requires unique index)
                    session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY spendsense.mv_spendsense_dashboard_user_month"))
                except Exception:
                    # Fallback to non-concurrent if no unique index
                    session.execute(text("REFRESH MATERIALIZED VIEW spendsense.mv_spendsense_dashboard_user_month"))
            
            result = session.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_matviews 
                    WHERE schemaname = 'spendsense' 
                    AND matviewname = 'mv_spendsense_insights_user_month'
                )
            """))
            if result.scalar():
                try:
                    # Try CONCURRENTLY first (requires unique index)
                    session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY spendsense.mv_spendsense_insights_user_month"))
                except Exception:
                    # Fallback to non-concurrent if no unique index
                    session.execute(text("REFRESH MATERIALIZED VIEW spendsense.mv_spendsense_insights_user_month"))
            
            session.commit()
        except Exception as mv_err:
            session.rollback()
            # Don't fail the whole operation if materialized view refresh fails
            print(f"⚠️  Warning: Could not refresh materialized views: {mv_err}")

        return inserted
    except Exception as e:
        session.rollback()
        logger.exception(f"Error in load_staging_for_user for user {user_id_str}")
        raise
    finally:
        session.close()


@router.post("/spendsense/load/staging")
async def spendsense_load_staging_to_fact(user: UserDep = Depends(get_current_user)):
    """API endpoint: move staging rows into fact + enrichment for the current user."""
    from app.database.postgresql import SessionLocal
    from app.models.spendsense_models import TxnStaging
    import uuid as _uuid
    try:
        # Quick visibility: how many staging rows do we have for this user?
        session = SessionLocal()
        user_id = _uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        staging_count = session.query(TxnStaging).filter(TxnStaging.user_id == user_id).count()
        session.close()

        inserted = load_staging_for_user(user.user_id)
        return {"staging_count": staging_count, "inserted": inserted}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        error_str = str(e).lower()
        
        # Log full error server-side
        logger.exception(f"Load staging error for user {user.user_id}: {e}")
        
        # Provide user-safe error messages (no tracebacks)
        if 'does not exist' in error_str or 'relation' in error_str or 'schema' in error_str:
            detail = "Database schema or tables do not exist. Please ensure the database is initialized."
        elif 'foreign key' in error_str or 'foreign_key' in error_str:
            detail = "Foreign key constraint violation. This usually means a category or merchant doesn't exist."
        elif 'unique constraint' in error_str or 'duplicate key' in error_str:
            detail = "Duplicate transaction detected."
        else:
            detail = "Load failed. Please try again or contact support with the batch ID."
        
        raise HTTPException(status_code=500, detail=detail)


@router.get("/spendsense/load/status")
async def spendsense_load_status(user: UserDep = Depends(get_current_user)):
    """Debug status for ETL counts per user (staging/fact)."""
    from app.database.postgresql import SessionLocal
    from app.models.spendsense_models import TxnStaging, TxnFact
    import uuid as _uuid

    session = SessionLocal()
    try:
        user_id = _uuid.UUID(user.user_id) if isinstance(user.user_id, str) else user.user_id
        staging_count = session.query(TxnStaging).filter(TxnStaging.user_id == user_id).count()
        fact_count = session.query(TxnFact).filter(TxnFact.user_id == user_id).count()
        return {"staging": staging_count, "fact": fact_count}
    finally:
        session.close()


@router.post("/spendsense/dev/run-all")
async def spendsense_dev_run_all(request: Request):
    """Development-only: load staging -> fact for all users with parsed rows.

    This endpoint is intentionally unprotected but only runs when
    settings.environment != 'production'. Useful when auth token is
    hard to provide from external tools.
    
    Security: Requires X-Internal-Token header and environment check.
    """
    from config import settings
    
    # Environment gate
    if getattr(settings, 'environment', 'development') == 'production':
        raise HTTPException(status_code=403, detail="Not allowed in production")
    
    # Internal token check
    internal_token = request.headers.get("X-Internal-Token")
    expected_token = getattr(settings, 'internal_token', 'dev-token-change-me')
    if internal_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid internal token")
    
    # IP allowlist (optional - can be configured)
    client_ip = request.client.host if request.client else None
    allowed_ips = getattr(settings, 'dev_allowed_ips', ['127.0.0.1', '::1', 'localhost'])
    if allowed_ips and client_ip not in allowed_ips:
        logger.warning(f"Blocked dev endpoint access from {client_ip}")
        raise HTTPException(status_code=403, detail="IP not allowed")

    from app.database.postgresql import SessionLocal
    from app.models.spendsense_models import TxnStaging
    from sqlalchemy import distinct

    session = SessionLocal()
    try:
        user_ids = [row[0] for row in session.query(distinct(TxnStaging.user_id)).filter(TxnStaging.parsed_ok == True).all()]
        total_inserted = 0
        details = []
        for uid in user_ids:
            try:
                inserted = load_staging_for_user(str(uid))
                total_inserted += inserted
                details.append({"user_id": str(uid), "inserted": inserted})
            except Exception as e:
                details.append({"user_id": str(uid), "error": str(e)})
        return {"users": len(user_ids), "inserted": total_inserted, "details": details}
    finally:
        session.close()

