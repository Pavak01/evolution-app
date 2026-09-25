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
-- Read/written by accountDeletion.ts and auth.routes.ts; already exists on
-- Qbit's real production users table (Qbit created it first), but was
-- missing here, so a fresh/local database would break on account deletion.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP;

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
  CONSTRAINT expenses_void_consistency CHECK (
    (voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
);

-- How much of an expense is genuinely business use (vs mixed personal/
-- business — a phone bill, home office costs) — the user's own apportionment,
-- not a category guess. Existing rows default to 100%, correctly unchanged
-- until someone actively lowers it.
ALTER TABLE evolution.expenses ADD COLUMN IF NOT EXISTS business_use_percent NUMERIC(5,2) NOT NULL DEFAULT 100
  CHECK (business_use_percent > 0 AND business_use_percent <= 100);

-- CHECK constraints can't be altered in place — replace this one to fold
-- business_use_percent into the existing formula.
ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_net_deductible_matches;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_net_deductible_matches CHECK (
  net_deductible_amount = ROUND(
    (CASE WHEN reimbursement_status = 'full' THEN 0 ELSE total_amount - reimbursed_amount END) * business_use_percent / 100,
    2
  )
);

-- Not every expense has a receipt at capture time (see the `travel`
-- capture-now/attach-proof-later flow) — expense_id stays NOT NULL on any
-- row that *does* exist, but a row existing at all is now optional.
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

-- Lets the client know whether an attached invoice file is a PDF (opens via
-- the OS share sheet) or an image (in-app viewer) — mirrors receipts.mime_type,
-- which income_invoices never had. Nullable, no backfill: existing rows just
-- have an unknown type going forward.
ALTER TABLE evolution.income_invoices ADD COLUMN IF NOT EXISTS invoice_mime_type TEXT;

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

-- Evolution-only concern, no Qbit analog — a paid-upgrade entitlement
-- (currently just OCR auto-fill on receipt capture), gated manually until
-- a real subscription purchase flow exists. `ocr_upgrade_expires_at` is
-- NULL for a manual grant (never expires) and set to the renewal boundary
-- once a real subscription source populates it.
CREATE TABLE IF NOT EXISTS evolution.entitlements (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  ocr_upgrade_active BOOLEAN NOT NULL DEFAULT FALSE,
  ocr_upgrade_source TEXT,
  ocr_upgrade_expires_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Records every time a user exports a tax year — the closest real signal
-- available (no HMRC/MTD integration exists) for "this data may have been
-- relied on for a filed return", used by POST /data-reset's safety check.
CREATE TABLE IF NOT EXISTS evolution.export_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  tax_year TEXT NOT NULL,
  exported_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_export_events_user_tax_year ON evolution.export_events(user_id, tax_year);

-- An explicit, user-confirmed "I've filed this" — stronger than the
-- passive export_events signal above. A locked tax year is archived
-- (archive_storage_path, a CSV snapshot at lock time) and POST
-- /data-reset never touches it, force included, until unlocked.
-- unlocked_at is nullable/soft rather than deleting the row on unlock,
-- mirroring voided_at elsewhere — a lock/unlock cycle stays visible.
CREATE TABLE IF NOT EXISTS evolution.filed_tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  tax_year TEXT NOT NULL,
  archive_storage_path TEXT NOT NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  unlocked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_filed_tax_years_user_tax_year ON evolution.filed_tax_years(user_id, tax_year) WHERE unlocked_at IS NULL;

-- Supports History's keyset pagination (GET /expenses cursor) — the
-- existing idx_expenses_user_occurred only covers occurred_at, not the
-- full (occurred_at, created_at, id) tiebreak chain the cursor compares against.
CREATE INDEX IF NOT EXISTS idx_expenses_user_history_cursor
  ON evolution.expenses(user_id, occurred_at DESC, created_at DESC, id DESC);

-- Optional client-supplied idempotency key: guards against a retry after a
-- lost response (e.g. a transient gateway error) creating a real duplicate.
-- Nullable and partial-indexed so requests that don't supply one behave
-- exactly as before.
ALTER TABLE evolution.expenses ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_idempotency_key
  ON evolution.expenses(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE evolution.income_invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_invoices_user_idempotency_key
  ON evolution.income_invoices(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- OCR-extracted "HH:MM" printed on the receipt, when legible — a sharper
-- duplicate-matching signal than date alone. Never required, never shown as
-- a manual-entry field.
ALTER TABLE evolution.expenses ADD COLUMN IF NOT EXISTS transaction_time TEXT;

-- SHA-256 of the receipt file content — lets duplicate-detection find the
-- exact same image reused across expenses. Indexed, not unique: duplicates
-- are meant to be found and flagged, never rejected at the DB level.
ALTER TABLE evolution.receipts ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_receipts_user_content_hash ON evolution.receipts(user_id, content_hash);

-- Persists the duplicate match found at save/attach time so it survives
-- past that one response — History can show it as a badge whenever the
-- expense is viewed later. Nullable/no cascade: expenses are never hard-
-- deleted, only voided, so the reference always resolves.
ALTER TABLE evolution.expenses ADD COLUMN IF NOT EXISTS duplicate_of_expense_id UUID REFERENCES evolution.expenses(id);
CREATE INDEX IF NOT EXISTS idx_expenses_duplicate_of ON evolution.expenses(duplicate_of_expense_id) WHERE duplicate_of_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_user_tax_year ON evolution.expenses(user_id, tax_year) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user_occurred ON evolution.expenses(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_expense ON evolution.receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON evolution.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_income_invoices_user_period ON evolution.income_invoices(user_id, period_start, period_end) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_income_invoices_user_tax_year ON evolution.income_invoices(user_id, tax_year) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_tax_year ON evolution.tax_rule_sets(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_year_version ON evolution.tax_rule_sets(tax_year, version DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rule_audit_tax_year ON evolution.tax_rule_audit_events(tax_year, performed_at DESC);

-- Reimbursement tracking is parked (see deriveExpenseAmounts in
-- validation/expenses.schema.ts) — every income model this app is actually
-- used for already includes any reimbursed cost in the invoice's full
-- total_amount, so reimbursement no longer affects reimbursed_amount or
-- net_deductible_amount, at the app layer or here. These two CHECK
-- constraints still enforced the old reimbursement-aware formula, which
-- would reject every insert the app now makes if reimbursement_status is
-- ever anything but 'none' — relaxed to match. reimbursement_status itself
-- is left alone (still stored, still dormant) so it can be revived later.
ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_consistency;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_reimbursement_consistency CHECK (reimbursed_amount = 0);

ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_net_deductible_matches;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_net_deductible_matches CHECK (
  net_deductible_amount = ROUND(total_amount * business_use_percent / 100, 2)
);
