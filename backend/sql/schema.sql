CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- `users` is shared with Qbit — this app authenticates against the same
-- accounts (same emails, same password hashes), so existing users don't
-- need to re-register. This CREATE TABLE is a no-op against Qbit's real
-- production table (already exists there); it only matters for a from-
-- scratch local/dev database. The two-factor/deletion-status columns are
-- included even though Evolution doesn't manage them, because the login
-- handler checks them (see routes/auth.routes.ts) — an account with Qbit's
-- 2FA enabled must not be able to sign into Evolution without it.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_status TEXT DEFAULT 'active';

-- Everything below is Evolution-owned and lives in its own schema — kept
-- separate from `public` specifically so it can never collide with Qbit's
-- existing (differently-shaped) tables of the same name, and so retiring
-- Qbit later is a matter of dropping its `public` tables without touching
-- any of this.
CREATE SCHEMA IF NOT EXISTS evolution;

CREATE TABLE IF NOT EXISTS evolution.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  category TEXT NOT NULL,
  occurred_at DATE NOT NULL,
  tax_year TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  reimbursement_status TEXT NOT NULL DEFAULT 'none' CHECK (reimbursement_status IN ('none', 'partial', 'full')),
  reimbursed_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reimbursed_amount >= 0),
  net_deductible_amount NUMERIC(12,2) NOT NULL CHECK (net_deductible_amount >= 0),
  notes TEXT,
  voided_at TIMESTAMP,
  void_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT expenses_reimbursement_consistency CHECK (
    (reimbursement_status = 'none'    AND reimbursed_amount = 0) OR
    (reimbursement_status = 'partial' AND reimbursed_amount > 0 AND reimbursed_amount < total_amount) OR
    (reimbursement_status = 'full'    AND reimbursed_amount = total_amount)
  ),
  CONSTRAINT expenses_net_deductible_matches CHECK (
    net_deductible_amount = CASE WHEN reimbursement_status = 'full' THEN 0 ELSE total_amount - reimbursed_amount END
  ),
  CONSTRAINT expenses_void_consistency CHECK (
    (voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
);

-- v1: exactly one receipt per expense, captured together at point of sale.
CREATE TABLE IF NOT EXISTS evolution.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL UNIQUE REFERENCES evolution.expenses(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- tax_year here is derived from received_date (cash basis) and is
-- authoritative for income totals. It is NOT used for the weeks-logged NI
-- Class 2 calculation, which queries period_start/period_end directly so a
-- straddling invoice's trading period contributes only its in-year days to
-- each tax year it touches (see src/incomeAggregation.ts).
CREATE TABLE IF NOT EXISTS evolution.income_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  source TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  received_date DATE NOT NULL,
  tax_year TEXT NOT NULL,
  invoice_storage_path TEXT,
  invoice_original_filename TEXT,
  notes TEXT,
  voided_at TIMESTAMP,
  void_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT income_invoices_period_order CHECK (period_end >= period_start),
  CONSTRAINT income_invoices_file_pair CHECK (
    (invoice_storage_path IS NULL AND invoice_original_filename IS NULL) OR
    (invoice_storage_path IS NOT NULL AND invoice_original_filename IS NOT NULL)
  ),
  CONSTRAINT income_invoices_void_consistency CHECK (
    (voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
  -- Deliberately no overlap/exclusion constraint: two clients invoicing for
  -- the same calendar week is legitimate. Overlaps are deduped at read time
  -- in incomeAggregation.ts, not rejected at write time.
);

CREATE TABLE IF NOT EXISTS evolution.tax_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL DEFAULT NOW()::date,
  effective_to DATE,
  source_reference TEXT,
  notes TEXT,
  created_by TEXT,
  personal_allowance NUMERIC(12,2) NOT NULL,
  basic_rate_limit NUMERIC(12,2) NOT NULL,
  basic_rate NUMERIC(6,4) NOT NULL,
  higher_rate NUMERIC(6,4) NOT NULL,
  ni_class2_weekly NUMERIC(12,2) NOT NULL,
  ni_class4_threshold NUMERIC(12,2) NOT NULL,
  ni_class4_rate NUMERIC(6,4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evolution.tax_rule_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year TEXT NOT NULL,
  rule_set_id UUID REFERENCES evolution.tax_rule_sets(id),
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by TEXT,
  performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evolution.tax_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  tax_year TEXT NOT NULL,
  total_income NUMERIC(12,2) NOT NULL,
  total_expenses NUMERIC(12,2) NOT NULL,
  net_profit NUMERIC(12,2) NOT NULL,
  weeks_logged INTEGER NOT NULL,
  rule_set_id UUID REFERENCES evolution.tax_rule_sets(id),
  estimated_income_tax NUMERIC(12,2) NOT NULL,
  estimated_ni NUMERIC(12,2) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_tax_year ON evolution.expenses(user_id, tax_year) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user_occurred ON evolution.expenses(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_expense ON evolution.receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON evolution.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_income_invoices_user_period ON evolution.income_invoices(user_id, period_start, period_end) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_income_invoices_user_tax_year ON evolution.income_invoices(user_id, tax_year) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_tax_year ON evolution.tax_rule_sets(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_year_version ON evolution.tax_rule_sets(tax_year, version DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rule_audit_tax_year ON evolution.tax_rule_audit_events(tax_year, performed_at DESC);
