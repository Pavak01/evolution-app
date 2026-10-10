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
-- The readable PDF report archived alongside the CSV (null for years locked before it existed).
ALTER TABLE evolution.filed_tax_years ADD COLUMN IF NOT EXISTS archive_pdf_storage_path TEXT;
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

-- Set by the "Resubmit" flow (ExpenseDetailScreen -> CaptureExpenseScreen)
-- when a new expense corrects a voided one — mirrors duplicate_of_expense_id
-- exactly (nullable, no cascade, expenses are never hard-deleted). Unlike
-- the duplicate flag this is a permanent historical fact, not something
-- that needs to clear itself later — the original it points at stays
-- voided forever, there's no unvoid for expenses.
ALTER TABLE evolution.expenses ADD COLUMN IF NOT EXISTS resubmitted_from_expense_id UUID REFERENCES evolution.expenses(id);
CREATE INDEX IF NOT EXISTS idx_expenses_resubmitted_from ON evolution.expenses(resubmitted_from_expense_id) WHERE resubmitted_from_expense_id IS NOT NULL;

-- Reimbursement tracking revived, superseding the parked constraints above.
-- Safe now because the case it serves is a genuine separate, after-the-fact
-- payment (a firm reimbursing submitted travel items out-of-band), never
-- folded into any invoice or income record — so netting it here can't
-- double-count anything on the income side. Still never set at capture
-- time (the amount isn't known yet); only POST /expenses/:id/reimbursement
-- writes non-zero values.
ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_consistency;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_reimbursement_consistency CHECK (
  (reimbursement_status = 'none'    AND reimbursed_amount = 0) OR
  (reimbursement_status = 'partial' AND reimbursed_amount > 0 AND reimbursed_amount < total_amount) OR
  (reimbursement_status = 'full'    AND reimbursed_amount = total_amount)
);

ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_net_deductible_matches;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_net_deductible_matches CHECK (
  net_deductible_amount = ROUND(
    (CASE WHEN reimbursement_status = 'full' THEN 0 ELSE total_amount - reimbursed_amount END) * business_use_percent / 100,
    2
  )
);

-- Business share (total x business use %) less the reimbursement, floored
-- at 0: the firm pays back the business part of the cost, so it comes off
-- that share rather than the total. 'full' (reimbursed = total) always
-- floors to 0. Supersedes the (total - reimbursed) x business-use version
-- just above — identical at 100% business use, the normal case for travel.
ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_net_deductible_matches;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_net_deductible_matches CHECK (
  net_deductible_amount = GREATEST(0, ROUND(total_amount * business_use_percent / 100, 2) - reimbursed_amount)
);

-- 'awaiting': marked at capture (travel only, in the app) when a firm is
-- expected to reimburse it later but hasn't said how much yet. Counts in
-- full until the real amount is recorded — if the reimbursement never
-- arrives, the full deduction was correct all along. Stores no amount, so
-- the net_deductible CHECK above applies unchanged. Its only other effect
-- is the AWAITING_REIMBURSEMENT warning on the tax summary, so it can't be
-- forgotten.
ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_status_check;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_reimbursement_status_check
  CHECK (reimbursement_status IN ('none', 'awaiting', 'partial', 'full'));

ALTER TABLE evolution.expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_consistency;
ALTER TABLE evolution.expenses ADD CONSTRAINT expenses_reimbursement_consistency CHECK (
  (reimbursement_status IN ('none', 'awaiting') AND reimbursed_amount = 0) OR
  (reimbursement_status = 'partial' AND reimbursed_amount > 0 AND reimbursed_amount < total_amount) OR
  (reimbursement_status = 'full'    AND reimbursed_amount = total_amount)
);
CREATE INDEX IF NOT EXISTS idx_expenses_awaiting_reimbursement
  ON evolution.expenses(user_id, tax_year) WHERE reimbursement_status = 'awaiting' AND voided_at IS NULL;

-- Free trial + Basic/Pro plans (see entitlements.ts). One row per user,
-- created on first Evolution use — never derived from users.created_at,
-- since public.users is shared with Qbit's old test accounts.
--   trial_started_at: first Evolution use; the trial is 1 calendar month.
--   plan / plan_expires_at: an active plan always wins over the trial;
--     NULL expiry = no end (manual grants, no-end promo codes).
--   plan_source: 'manual' (comped), 'promo' (code), 'revenuecat' (store).
-- ocr_upgrade_* are superseded (Pro = OCR) but kept, no longer read.
ALTER TABLE evolution.entitlements ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;
ALTER TABLE evolution.entitlements ADD COLUMN IF NOT EXISTS plan TEXT CHECK (plan IN ('basic', 'pro'));
ALTER TABLE evolution.entitlements ADD COLUMN IF NOT EXISTS plan_source TEXT CHECK (plan_source IN ('manual', 'promo', 'revenuecat'));
ALTER TABLE evolution.entitlements ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP;

-- The two manual OCR grants (Roger's own accounts) become manual Pro.
UPDATE evolution.entitlements
   SET plan = 'pro', plan_source = 'manual', plan_expires_at = ocr_upgrade_expires_at, updated_at = NOW()
 WHERE ocr_upgrade_active AND ocr_upgrade_source = 'manual' AND plan IS NULL;

-- Free-access codes for testers and promotions. Given away, never sold —
-- selling access outside Play billing would break Play's payments policy.
CREATE TABLE IF NOT EXISTS evolution.promo_codes (
  code TEXT PRIMARY KEY CHECK (code = UPPER(code)),
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'pro')),
  duration_days INTEGER CHECK (duration_days > 0),   -- NULL = no end
  max_redemptions INTEGER CHECK (max_redemptions > 0), -- NULL = unlimited
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP,                               -- when the code itself stops working
  disabled_at TIMESTAMP,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evolution.promo_redemptions (
  code TEXT NOT NULL REFERENCES evolution.promo_codes(code),
  user_id UUID NOT NULL REFERENCES public.users(id),
  redeemed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code, user_id)
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON evolution.promo_redemptions(user_id);

-- Email confirmation + password reset (see emailCodes.ts). Evolution's own
-- record — Qbit's unused password_reset_* columns on the shared users
-- table are deliberately left alone.
CREATE TABLE IF NOT EXISTS evolution.email_verifications (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  verified_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6-digit codes, stored only as an HMAC. Only the newest unconsumed code
-- per (user, purpose) is honoured; 5 wrong tries kills it.
CREATE TABLE IF NOT EXISTS evolution.email_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_codes_user_purpose ON evolution.email_codes(user_id, purpose, created_at DESC);

-- Accounts that already used Evolution (only Roger's two, as of
-- 2026-10-04) count as confirmed; everyone else confirms on next sign-in.
INSERT INTO evolution.email_verifications (user_id)
SELECT user_id FROM evolution.entitlements
ON CONFLICT (user_id) DO NOTHING;

-- Who can manage promo codes from the in-app admin section. Checked by the
-- server on every admin request (routes/admin.routes.ts).
CREATE TABLE IF NOT EXISTS evolution.admin_users (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  added_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO evolution.admin_users (user_id)
SELECT id FROM public.users WHERE email IN ('roger.nichols@gmail.com', 'rogeristhekey@yandex.com')
ON CONFLICT (user_id) DO NOTHING;

-- Evidence of which Terms of Use version each account accepted, and when
-- (see src/terms.ts). Kept after account deletion as the legal record of
-- the agreement; it holds no app data.
CREATE TABLE IF NOT EXISTS evolution.terms_acceptances (
  user_id UUID NOT NULL REFERENCES public.users(id),
  version TEXT NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, version)
);

-- One-time 2FA backup codes created by Evolution's 2FA setup (HMAC-hashed,
-- like email codes). Qbit's public.two_factor_backup_codes is not used —
-- it's hashed with Qbit's own secret.
CREATE TABLE IF NOT EXISTS evolution.two_factor_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  code_hash TEXT NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_2fa_backup_codes_user ON evolution.two_factor_backup_codes(user_id);

-- Making Tax Digital: a user's link to their HMRC account (OAuth tokens and
-- National Insurance number, all encrypted with HMRC_TOKEN_ENCRYPTION_KEY),
-- and the short-lived state values that tie HMRC's sign-in redirect back to
-- the user who started it. See backend/src/hmrc/.
CREATE TABLE IF NOT EXISTS evolution.hmrc_connections (
  user_id UUID PRIMARY KEY REFERENCES public.users(id),
  environment TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  access_expires_at TIMESTAMP NOT NULL,
  scope TEXT,
  nino_enc TEXT,
  connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS evolution.hmrc_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  return_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- The self-employment the user's quarterly updates go to (from HMRC's
-- Business Details), and a permanent record of every update sent: exactly
-- what was submitted, when, and HMRC's correlation reference.
ALTER TABLE evolution.hmrc_connections ADD COLUMN IF NOT EXISTS business_id TEXT;
CREATE TABLE IF NOT EXISTS evolution.hmrc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  environment TEXT NOT NULL,
  business_id TEXT NOT NULL,
  tax_year TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payload JSONB NOT NULL,
  correlation_id TEXT,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hmrc_submissions_user ON evolution.hmrc_submissions(user_id, tax_year);

-- HMRC's tax calculation triggered after each quarterly update, and the
-- 2FA sign-ins reported in HMRC's Gov-Client-Multi-Factor header.
ALTER TABLE evolution.hmrc_submissions ADD COLUMN IF NOT EXISTS calculation_id TEXT;
CREATE TABLE IF NOT EXISTS evolution.mfa_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  method TEXT NOT NULL,
  used_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mfa_events_user ON evolution.mfa_events(user_id, used_at DESC);

-- Year end: each customer's annual tax return through MTD — their
-- eligibility answers, HMRC's final calculation, the declaration version
-- they agreed to, and when it was submitted (with HMRC's reference).
CREATE TABLE IF NOT EXISTS evolution.hmrc_year_ends (
  user_id UUID NOT NULL REFERENCES public.users(id),
  environment TEXT NOT NULL,
  tax_year TEXT NOT NULL,
  calculation_id TEXT NOT NULL,
  eligibility JSONB NOT NULL,
  declaration_version TEXT,
  submitted_at TIMESTAMP,
  correlation_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, environment, tax_year)
);
