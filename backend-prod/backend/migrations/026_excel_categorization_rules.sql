-- ============================================================================
-- Excel Upload + Rule-Based Categorization
-- Adds categorization rules table for Excel, CSV, and other sources
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS enrichment;

CREATE TABLE IF NOT EXISTS enrichment.txn_categorization_rule (
  rule_id            SERIAL PRIMARY KEY,
  bank_code          TEXT,                 -- 'HDFC', 'ICICI', 'SBI', or NULL for generic
  match_field        TEXT NOT NULL,        -- 'description' | 'merchant' | 'ref' | 'extra'
  match_type         TEXT NOT NULL,        -- 'contains' | 'startswith' | 'regex'
  match_value        TEXT NOT NULL,        -- e.g. 'SWIGGY', 'AMAZON', 'NEFT', 'SALARY'
  direction          TEXT,                 -- 'debit' | 'credit' | NULL = any
  primary_category   TEXT NOT NULL,        -- 'groceries','loan_payments','salary','investments', etc.
  sub_category       TEXT NOT NULL,        -- subcategory code
  priority           SMALLINT NOT NULL DEFAULT 100, -- smaller = stronger
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_txn_cat_rule_active
  ON enrichment.txn_categorization_rule(is_active, bank_code, match_field);

-- Seed some common rules
INSERT INTO enrichment.txn_categorization_rule (bank_code, match_field, match_type, match_value, direction, primary_category, sub_category, priority) VALUES
-- Food delivery
(NULL, 'description', 'contains', 'SWIGGY', NULL, 'food_dining', 'food_delivery', 10),
(NULL, 'description', 'contains', 'ZOMATO', NULL, 'food_dining', 'food_delivery', 10),
(NULL, 'description', 'contains', 'UBER EATS', NULL, 'food_dining', 'food_delivery', 10),

-- E-commerce
(NULL, 'description', 'contains', 'AMAZON', NULL, 'shopping', 'online_shopping', 10),
(NULL, 'description', 'contains', 'FLIPKART', NULL, 'shopping', 'online_shopping', 10),
(NULL, 'description', 'contains', 'MYNTRA', NULL, 'shopping', 'clothing', 10),

-- EMI / Loan payments
(NULL, 'description', 'contains', 'EMI', 'debit', 'loan_payments', 'emi', 5),
(NULL, 'description', 'contains', 'LOAN', 'debit', 'loan_payments', 'loan_repayment', 5),

-- Salary
(NULL, 'description', 'contains', 'SALARY', 'credit', 'income', 'salary', 5),
(NULL, 'description', 'contains', 'SAL', 'credit', 'income', 'salary', 5),

-- Investments
(NULL, 'description', 'contains', 'MUTUAL FUND', NULL, 'investments', 'mutual_funds', 10),
(NULL, 'description', 'contains', 'SIP', NULL, 'investments', 'sip', 10),

-- Utilities
(NULL, 'description', 'contains', 'ELECTRICITY', NULL, 'utilities', 'electricity', 10),
(NULL, 'description', 'contains', 'WATER', NULL, 'utilities', 'water', 10),
(NULL, 'description', 'contains', 'GAS', NULL, 'utilities', 'gas', 10),

-- Transport
(NULL, 'description', 'contains', 'UBER', NULL, 'transport', 'taxi', 10),
(NULL, 'description', 'contains', 'OLA', NULL, 'transport', 'taxi', 10),
(NULL, 'description', 'contains', 'PETROL', NULL, 'transport', 'fuel', 10),
(NULL, 'description', 'contains', 'DIESEL', NULL, 'transport', 'fuel', 10),

-- NEFT/IMPS
(NULL, 'description', 'contains', 'NEFT', NULL, 'transfers', 'neft', 20),
(NULL, 'description', 'contains', 'IMPS', NULL, 'transfers', 'imps', 20),
(NULL, 'description', 'contains', 'UPI', NULL, 'transfers', 'upi', 20)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE enrichment.txn_categorization_rule IS 'Rule-based categorization for transactions from Excel, CSV, and other sources';
COMMENT ON COLUMN enrichment.txn_categorization_rule.bank_code IS 'Bank-specific rules (NULL = applies to all banks)';
COMMENT ON COLUMN enrichment.txn_categorization_rule.priority IS 'Lower priority = higher precedence (e.g., 5 beats 100)';

