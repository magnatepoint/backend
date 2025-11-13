-- =============================================================================
-- Monytix — BudgetPilot: Periodized Budgets (Monthly, Quarterly, Custom)
-- Version: 1.0
-- Extends 009_budgetpilot_full_package.sql to support flexible periods
-- =============================================================================
BEGIN;

-- 1) Canonical periods
CREATE TABLE IF NOT EXISTS budgetpilot.budget_period (
  period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly','quarterly','custom')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  label TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start, period_end),
  CHECK (period_end >= period_start)
);

-- Function to generate period label (immutable)
CREATE OR REPLACE FUNCTION budgetpilot.generate_period_label(
  p_type TEXT, p_start DATE, p_end DATE
) RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(LEFT(p_type, 1)) || ': ' || 
         TO_CHAR(p_start, 'YYYY-MM-DD') || ' → ' || 
         TO_CHAR(p_end, 'YYYY-MM-DD');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-populate label
CREATE OR REPLACE FUNCTION budgetpilot.set_period_label()
RETURNS TRIGGER AS $$
BEGIN
  NEW.label := budgetpilot.generate_period_label(NEW.period_type, NEW.period_start, NEW.period_end);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_period_label ON budgetpilot.budget_period;
CREATE TRIGGER trg_set_period_label
  BEFORE INSERT OR UPDATE OF period_type, period_start, period_end
  ON budgetpilot.budget_period
  FOR EACH ROW
  EXECUTE FUNCTION budgetpilot.set_period_label();

-- Backfill columns for periodized model (keep month for compatibility for now)
ALTER TABLE budgetpilot.user_budget_recommendation      ADD COLUMN IF NOT EXISTS period_id UUID;
ALTER TABLE budgetpilot.user_budget_commit              ADD COLUMN IF NOT EXISTS period_id UUID;
ALTER TABLE budgetpilot.user_budget_commit_goal_alloc   ADD COLUMN IF NOT EXISTS period_id UUID;
ALTER TABLE budgetpilot.budget_user_month_aggregate     ADD COLUMN IF NOT EXISTS period_id UUID;

ALTER TABLE budgetpilot.user_budget_recommendation DROP CONSTRAINT IF EXISTS fk_ubr_period;
ALTER TABLE budgetpilot.user_budget_commit DROP CONSTRAINT IF EXISTS fk_ubc_period;
ALTER TABLE budgetpilot.user_budget_commit_goal_alloc DROP CONSTRAINT IF EXISTS fk_ubcga_period;
ALTER TABLE budgetpilot.budget_user_month_aggregate DROP CONSTRAINT IF EXISTS fk_buma_period;

ALTER TABLE budgetpilot.user_budget_recommendation
  ADD CONSTRAINT fk_ubr_period FOREIGN KEY (period_id) REFERENCES budgetpilot.budget_period(period_id) ON DELETE CASCADE;
ALTER TABLE budgetpilot.user_budget_commit
  ADD CONSTRAINT fk_ubc_period FOREIGN KEY (period_id) REFERENCES budgetpilot.budget_period(period_id) ON DELETE CASCADE;
ALTER TABLE budgetpilot.user_budget_commit_goal_alloc
  ADD CONSTRAINT fk_ubcga_period FOREIGN KEY (period_id) REFERENCES budgetpilot.budget_period(period_id) ON DELETE CASCADE;
ALTER TABLE budgetpilot.budget_user_month_aggregate
  ADD CONSTRAINT fk_buma_period FOREIGN KEY (period_id) REFERENCES budgetpilot.budget_period(period_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_period_user_dates   ON budgetpilot.budget_period(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ubr_user_period     ON budgetpilot.user_budget_recommendation(user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_ubc_user_period     ON budgetpilot.user_budget_commit(user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_ubcga_user_period   ON budgetpilot.user_budget_commit_goal_alloc(user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_buma_user_period    ON budgetpilot.budget_user_month_aggregate(user_id, period_id);

-- 2) Category-level budgets (per period)
-- Assumes major categories exist in your taxonomy table; we key by free-text for MVP.
CREATE TABLE IF NOT EXISTS budgetpilot.user_budget_category_commit (
  ubcc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_id UUID NOT NULL REFERENCES budgetpilot.budget_period(period_id) ON DELETE CASCADE,
  band TEXT NOT NULL CHECK (band IN ('needs','wants','assets')),
  category TEXT NOT NULL, -- e.g., 'Groceries', 'Transport', 'Dining Out'
  planned_pct NUMERIC(6,4) CHECK (planned_pct >= 0 AND planned_pct <= 1),
  planned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_id, band, category)
);

CREATE INDEX IF NOT EXISTS idx_ubcc_user_period ON budgetpilot.user_budget_category_commit(user_id, period_id);

-- 3) Helper: touch updated_at
CREATE OR REPLACE FUNCTION budgetpilot.touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='budget_plan_master') THEN
    DROP TRIGGER IF EXISTS trg_bpm_touch ON budgetpilot.budget_plan_master;
    CREATE TRIGGER trg_bpm_touch BEFORE UPDATE ON budgetpilot.budget_plan_master
    FOR EACH ROW EXECUTE FUNCTION budgetpilot.touch_updated_at();
  END IF;
END $$;

-- 4) Helper: create/upsert period and return id
CREATE OR REPLACE FUNCTION budgetpilot.upsert_period(
  p_user uuid, p_type text, p_start date, p_end date
) RETURNS uuid AS $$
DECLARE pid uuid;
BEGIN
  INSERT INTO budgetpilot.budget_period(user_id, period_type, period_start, period_end)
  VALUES (p_user, p_type, p_start, p_end)
  ON CONFLICT (user_id, period_type, period_start, period_end)
  DO UPDATE SET user_id=EXCLUDED.user_id
  RETURNING period_id INTO pid;
  RETURN pid;
END; $$ LANGUAGE plpgsql;

-- 5) Utility: expected income for period (avg last 3 full months × fraction)
CREATE OR REPLACE FUNCTION budgetpilot.expected_income_for_period(
  p_user uuid, p_start date, p_end date
) RETURNS NUMERIC AS $$
DECLARE avg_mo NUMERIC := 0;
DECLARE days_len INT := (p_end - p_start + 1);
DECLARE frac NUMERIC := GREATEST(1, days_len)::NUMERIC / 30.0;
BEGIN
  WITH inc AS (
    SELECT date_trunc('month', txn_date)::date AS m,
           SUM(CASE WHEN txn_type='income' AND direction='credit' THEN amount ELSE 0 END) AS amt
    FROM spendsense.vw_txn_effective
    WHERE user_id = p_user
      AND txn_date >= date_trunc('month', p_start) - INTERVAL '3 months'
      AND txn_date <  date_trunc('month', p_start)
    GROUP BY 1
  )
  SELECT COALESCE(AVG(amt),0) INTO avg_mo FROM inc;

  RETURN ROUND(avg_mo * frac, 2);
END; $$ LANGUAGE plpgsql;

-- 6) Generate recommendations for a period (periodized version of your §4)
CREATE OR REPLACE FUNCTION budgetpilot.generate_recommendations(
  p_user uuid, p_type text, p_start date, p_end date
) RETURNS TABLE(plan_code text, score numeric, needs_budget_pct numeric, wants_budget_pct numeric, savings_budget_pct numeric, recommendation_reason text, period_id uuid) AS $$
DECLARE pid uuid := budgetpilot.upsert_period(p_user, p_type, p_start, p_end);
BEGIN
  WITH actual AS (
    SELECT
      SUM(CASE WHEN txn_type='income' AND direction='credit' THEN amount ELSE 0 END) AS income_amt,
      SUM(CASE WHEN txn_type='wants'  AND direction='debit'  THEN amount ELSE 0 END) AS wants_amt,
      SUM(CASE WHEN txn_type='assets' AND direction='debit'  THEN amount ELSE 0 END) AS assets_amt
    FROM spendsense.vw_txn_effective
    WHERE user_id = p_user
      AND txn_date >= p_start AND txn_date <= p_end
  ),
  ratios AS (
    SELECT
      CASE WHEN income_amt > 0 THEN wants_amt  / income_amt ELSE NULL END AS wants_share,
      CASE WHEN income_amt > 0 THEN assets_amt / income_amt ELSE NULL END AS assets_share
    FROM actual
  ),
  emergency_goal AS (
    SELECT
      MAX(CASE WHEN LOWER(goal_category)='emergency' THEN 1 ELSE 0 END) AS has_emergency,
      SUM(CASE WHEN LOWER(goal_category)='emergency' THEN GREATEST(0, estimated_cost - current_savings) ELSE 0 END) AS emergency_gap
    FROM goal.user_goals_master
    WHERE user_id=p_user AND status='active'
  ),
  scores AS (
    SELECT bpm.plan_code,
           bpm.base_needs_pct, bpm.base_wants_pct, bpm.base_assets_pct,
           COALESCE(r.wants_share, 0.30) AS wants_share,
           COALESCE(r.assets_share, 0.10) AS assets_share,
           COALESCE(eg.has_emergency,0) AS has_emergency,
           COALESCE(eg.emergency_gap,0) AS emergency_gap,
           (
             0.40 * (1 - ABS(bpm.base_wants_pct - COALESCE(r.wants_share, 0.30)))
           + 0.30 * (CASE WHEN (COALESCE(r.assets_share,0.10) < 0.15 OR COALESCE(eg.emergency_gap,0) > 0)
                          THEN bpm.base_assets_pct ELSE 0.0 END)
           + 0.15 * (CASE WHEN bpm.plan_code='BAL_50_30_20' THEN 1 ELSE 0 END)
           + 0.15 * (CASE WHEN bpm.plan_code='EMERGENCY_FIRST' AND COALESCE(eg.emergency_gap,0) > 0 THEN 1 ELSE 0 END)
           )::numeric(8,3) AS score
    FROM budgetpilot.budget_plan_master bpm
    CROSS JOIN ratios r
    CROSS JOIN emergency_goal eg
    WHERE bpm.is_active = TRUE
  ),
  chosen AS (
    SELECT s.plan_code,
           s.base_needs_pct AS needs_budget_pct,
           s.base_wants_pct AS wants_budget_pct,
           s.base_assets_pct AS savings_budget_pct,
           s.score,
           CASE
             WHEN s.plan_code='EMERGENCY_FIRST' AND s.emergency_gap>0 THEN 'Emergency gap detected; increase savings to accelerate buffer.'
             WHEN s.plan_code='DEBT_FIRST' THEN 'Constrain wants and push needs to accelerate debt payoff.'
             WHEN s.plan_code='GOAL_PRIORITY' THEN 'Direct more savings toward your top priorities.'
             WHEN s.plan_code='LEAN_BASICS' THEN 'Tighten wants temporarily; keep savings momentum.'
             ELSE 'Balanced budgeting for stability.'
           END AS recommendation_reason
    FROM scores s
  )
  INSERT INTO budgetpilot.user_budget_recommendation
    (reco_id, user_id, month, plan_code, needs_budget_pct, wants_budget_pct, savings_budget_pct, score, recommendation_reason, created_at, period_id)
  SELECT gen_random_uuid(), p_user, date_trunc('month', p_start)::date, c.plan_code,
         c.needs_budget_pct, c.wants_budget_pct, c.savings_budget_pct, c.score, c.recommendation_reason, now(), pid
  FROM chosen c
  ON CONFLICT ON CONSTRAINT user_budget_recommendation_user_id_month_plan_code_key
  DO UPDATE SET
     needs_budget_pct=EXCLUDED.needs_budget_pct,
     wants_budget_pct=EXCLUDED.wants_budget_pct,
     savings_budget_pct=EXCLUDED.savings_budget_pct,
     score=EXCLUDED.score,
     recommendation_reason=EXCLUDED.recommendation_reason,
     period_id=EXCLUDED.period_id;
  
  -- Return the recommendations
  RETURN QUERY
  SELECT r.plan_code::text,
         r.score,
         r.needs_budget_pct,
         r.wants_budget_pct,
         r.savings_budget_pct,
         r.recommendation_reason,
         r.period_id
  FROM budgetpilot.user_budget_recommendation r
  WHERE r.user_id = p_user AND r.period_id = pid
  ORDER BY r.score DESC, r.plan_code ASC;
END; $$ LANGUAGE plpgsql;

-- 7) Commit from recommendation (periodized, frozen plan)
CREATE OR REPLACE FUNCTION budgetpilot.commit_from_recommendation(
  p_user uuid, p_period_id uuid, p_plan_code text, p_notes text DEFAULT 'Committed from suggestions'
) RETURNS VOID AS $$
DECLARE income_env NUMERIC;
DECLARE alloc_assets_pct NUMERIC;
BEGIN
  -- Freeze plan
  INSERT INTO budgetpilot.user_budget_commit (user_id, month, plan_code, alloc_needs_pct, alloc_wants_pct, alloc_assets_pct, notes, committed_at, period_id)
  SELECT p_user,
         date_trunc('month', bp.period_start)::date,
         r.plan_code,
         r.needs_budget_pct, r.wants_budget_pct, r.savings_budget_pct,
         p_notes, now(), p_period_id
  FROM budgetpilot.user_budget_recommendation r
  JOIN budgetpilot.budget_period bp ON bp.period_id = p_period_id
  WHERE r.user_id=p_user AND r.period_id=p_period_id AND r.plan_code=p_plan_code
  ON CONFLICT (user_id, month) DO UPDATE
  SET plan_code=EXCLUDED.plan_code,
      alloc_needs_pct=EXCLUDED.alloc_needs_pct,
      alloc_wants_pct=EXCLUDED.alloc_wants_pct,
      alloc_assets_pct=EXCLUDED.alloc_assets_pct,
      notes=EXCLUDED.notes,
      committed_at=now(),
      period_id=EXCLUDED.period_id;

  SELECT alloc_assets_pct INTO alloc_assets_pct
  FROM budgetpilot.user_budget_commit
  WHERE user_id=p_user AND period_id=p_period_id;

  -- Estimate income envelope for this period
  SELECT budgetpilot.expected_income_for_period(p_user, bp.period_start, bp.period_end)
  INTO income_env
  FROM budgetpilot.budget_period bp
  WHERE bp.period_id=p_period_id;

  -- Goal allocations (reuse your weighting idea)
  WITH active_goals AS (
    SELECT g.user_id, g.goal_id, g.priority_rank,
           COALESCE(ua.essentiality_score,50) AS ess, COALESCE(ua.urgency_score,50) AS urg
    FROM goal.user_goals_master g
    LEFT JOIN budgetpilot.user_goal_attributes ua ON ua.user_id=g.user_id AND ua.goal_id=g.goal_id
    WHERE g.user_id=p_user AND g.status='active'
  ),
  weights AS (
    SELECT user_id, goal_id,
           ((CASE WHEN priority_rank IS NOT NULL THEN (6 - LEAST(5, GREATEST(1, priority_rank))) ELSE 3 END)
             + ess/25.0 + urg/25.0)::numeric AS raw_w
    FROM active_goals
  ),
  norm AS (
    SELECT w.user_id, w.goal_id,
           CASE WHEN SUM(w2.raw_w) OVER (PARTITION BY w.user_id) > 0
                THEN ROUND(w.raw_w / SUM(w2.raw_w) OVER (PARTITION BY w.user_id), 4)
                ELSE 0 END AS weight_pct
    FROM weights w JOIN weights w2 USING (user_id)
  )
  INSERT INTO budgetpilot.user_budget_commit_goal_alloc (user_id, month, goal_id, weight_pct, planned_amount, created_at, period_id)
  SELECT n.user_id,
         (SELECT date_trunc('month', period_start)::date FROM budgetpilot.budget_period WHERE period_id=p_period_id),
         n.goal_id, n.weight_pct,
         ROUND(COALESCE(income_env,0) * COALESCE(alloc_assets_pct,0) * n.weight_pct, 2),
         now(), p_period_id
  ON CONFLICT (user_id, month, goal_id) DO UPDATE
  SET weight_pct=EXCLUDED.weight_pct,
      planned_amount=EXCLUDED.planned_amount,
      created_at=now(),
      period_id=EXCLUDED.period_id;
END; $$ LANGUAGE plpgsql;

-- 8) Auto-distribute category budgets inside each band using last 90 days
CREATE OR REPLACE FUNCTION budgetpilot.autofill_category_budgets(
  p_user uuid, p_period_id uuid
) RETURNS VOID AS $$
DECLARE s DATE; e DATE;
DECLARE income_env NUMERIC;
DECLARE pct_needs NUMERIC; DECLARE pct_wants NUMERIC; DECLARE pct_assets NUMERIC;
BEGIN
  SELECT period_start, period_end INTO s, e FROM budgetpilot.budget_period WHERE period_id=p_period_id;

  SELECT budgetpilot.expected_income_for_period(p_user, s, e) INTO income_env;

  SELECT alloc_needs_pct, alloc_wants_pct, alloc_assets_pct
    INTO pct_needs, pct_wants, pct_assets
  FROM budgetpilot.user_budget_commit
  WHERE user_id=p_user AND period_id=p_period_id;

  -- Shares per category within each band from last 90 days
  WITH hist AS (
    SELECT
      CASE WHEN txn_type IN ('needs','wants','assets') THEN txn_type ELSE NULL END AS band,
      COALESCE(dc.category_name, v.category_code, 'Uncategorized') AS category,
      SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END) AS amt
    FROM spendsense.vw_txn_effective v
    LEFT JOIN spendsense.dim_category dc ON dc.category_code = v.category_code
    WHERE user_id=p_user
      AND txn_date >= (s - INTERVAL '90 days') AND txn_date < s
    GROUP BY 1, COALESCE(dc.category_name, v.category_code, 'Uncategorized')
  ),
  band_env AS (
    SELECT 'needs' AS band, ROUND(income_env * COALESCE(pct_needs,0),2) AS env_amt UNION ALL
    SELECT 'wants', ROUND(income_env * COALESCE(pct_wants,0),2) UNION ALL
    SELECT 'assets', ROUND(income_env * COALESCE(pct_assets,0),2)
  ),
  shares AS (
    SELECT h.band, h.category,
           CASE WHEN SUM(h2.amt) OVER (PARTITION BY h.band) > 0
                THEN h.amt / SUM(h2.amt) OVER (PARTITION BY h.band)
                ELSE 0 END AS share
    FROM hist h JOIN hist h2 ON h2.band=h.band
  )
  INSERT INTO budgetpilot.user_budget_category_commit (user_id, period_id, band, category, planned_pct, planned_amount, created_at)
  SELECT p_user, p_period_id, s.band, s.category,
         ROUND(s.share::numeric, 4) AS planned_pct,
         ROUND(s.share * b.env_amt, 2) AS planned_amount,
         now()
  FROM shares s
  JOIN band_env b ON b.band=s.band
  ON CONFLICT (user_id, period_id, band, category) DO UPDATE
  SET planned_pct=EXCLUDED.planned_pct,
      planned_amount=EXCLUDED.planned_amount,
      created_at=now();
END; $$ LANGUAGE plpgsql;

-- 9) Aggregate (periodized) – frozen plan, only track variances
CREATE OR REPLACE FUNCTION budgetpilot.compute_period_aggregate(
  p_user uuid, p_period_id uuid
) RETURNS VOID AS $$
DECLARE s DATE; e DATE; inc NUMERIC;
DECLARE v_needs_amt NUMERIC; DECLARE v_wants_amt NUMERIC; DECLARE v_assets_amt NUMERIC;
DECLARE pctn NUMERIC; DECLARE pctw NUMERIC; DECLARE pcta NUMERIC;
BEGIN
  SELECT period_start, period_end INTO s, e FROM budgetpilot.budget_period WHERE period_id=p_period_id;

  WITH actuals AS (
    SELECT
      SUM(CASE WHEN txn_type='income' AND direction='credit' THEN amount ELSE 0 END) AS income_amt,
      SUM(CASE WHEN txn_type='needs'  AND direction='debit'  THEN amount ELSE 0 END) AS needs_amt,
      SUM(CASE WHEN txn_type='wants'  AND direction='debit'  THEN amount ELSE 0 END) AS wants_amt,
      SUM(CASE WHEN txn_type='assets' AND direction='debit'  THEN amount ELSE 0 END) AS assets_amt
    FROM spendsense.vw_txn_effective
    WHERE user_id=p_user AND txn_date >= s AND txn_date <= e
  )
  SELECT COALESCE(a.income_amt,0), COALESCE(a.needs_amt,0), COALESCE(a.wants_amt,0), COALESCE(a.assets_amt,0)
  INTO inc, v_needs_amt, v_wants_amt, v_assets_amt
  FROM actuals a;

  SELECT alloc_needs_pct, alloc_wants_pct, alloc_assets_pct
    INTO pctn, pctw, pcta
  FROM budgetpilot.user_budget_commit
  WHERE user_id=p_user AND period_id=p_period_id;

  INSERT INTO budgetpilot.budget_user_month_aggregate (
    user_id, month, income_amt,
    needs_amt, planned_needs_amt, variance_needs_amt,
    wants_amt, planned_wants_amt, variance_wants_amt,
    assets_amt, planned_assets_amt, variance_assets_amt,
    computed_at, period_id
  )
  VALUES (
    p_user, date_trunc('month', s)::date, inc,
    COALESCE(v_needs_amt,0), ROUND(inc * COALESCE(pctn,0),2), ROUND(COALESCE(v_needs_amt,0)  - ROUND(inc * COALESCE(pctn,0),2),2),
    COALESCE(v_wants_amt,0), ROUND(inc * COALESCE(pctw,0),2), ROUND(COALESCE(v_wants_amt,0)  - ROUND(inc * COALESCE(pctw,0),2),2),
    COALESCE(v_assets_amt,0),ROUND(inc * COALESCE(pcta,0),2), ROUND(COALESCE(v_assets_amt,0) - ROUND(inc * COALESCE(pcta,0),2),2),
    now(), p_period_id
  )
  ON CONFLICT (user_id, month) DO UPDATE
  SET income_amt=EXCLUDED.income_amt,
      needs_amt=EXCLUDED.needs_amt,
      planned_needs_amt=EXCLUDED.planned_needs_amt,
      variance_needs_amt=EXCLUDED.variance_needs_amt,
      wants_amt=EXCLUDED.wants_amt,
      planned_wants_amt=EXCLUDED.planned_wants_amt,
      variance_wants_amt=EXCLUDED.variance_wants_amt,
      assets_amt=EXCLUDED.assets_amt,
      planned_assets_amt=EXCLUDED.planned_assets_amt,
      variance_assets_amt=EXCLUDED.variance_assets_amt,
      computed_at=now(),
      period_id=EXCLUDED.period_id;
END; $$ LANGUAGE plpgsql;

-- 10) Overview view (periodized)
CREATE OR REPLACE VIEW budgetpilot.v_budget_overview AS
SELECT 
  bp.user_id,
  bp.period_id,
  bp.label AS period_label,
  COALESCE(buma.income_amt,0) AS income,
  COALESCE(buma.needs_amt,0)  AS needs_spent,
  COALESCE(buma.wants_amt,0)  AS wants_spent,
  COALESCE(buma.assets_amt,0) AS assets_spent,
  COALESCE(buma.planned_needs_amt,0)  AS needs_plan,
  COALESCE(buma.planned_wants_amt,0)  AS wants_plan,
  COALESCE(buma.planned_assets_amt,0) AS assets_plan,
  COALESCE(buma.variance_needs_amt,0)  AS needs_variance,
  COALESCE(buma.variance_wants_amt,0)  AS wants_variance,
  COALESCE(buma.variance_assets_amt,0) AS assets_variance,
  ubc.plan_code,
  bpm.name AS plan_name
FROM budgetpilot.budget_period bp
LEFT JOIN budgetpilot.budget_user_month_aggregate buma ON buma.period_id = bp.period_id AND buma.user_id = bp.user_id
LEFT JOIN budgetpilot.user_budget_commit ubc ON ubc.user_id=bp.user_id AND ubc.period_id=bp.period_id
LEFT JOIN budgetpilot.budget_plan_master bpm ON bpm.plan_code = ubc.plan_code;

COMMIT;

