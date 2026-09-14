# Evolution (MVP)

For end users: see the [User Guide](USER-GUIDE.md) and [FAQ](FAQ.md). Compliance docs: [Privacy Policy](PRIVACY-POLICY.md), [Account Deletion](ACCOUNT-DELETION.html).

A receipt-first expense and tax app for self-employed drivers. Sibling app to
Qbit (the weekly tax app), sharing its purpose but inverting the workflow:
expenses are captured immediately at point of sale (photo + quick fields),
and income is recorded separately, later, as a periodic invoice.

Evolution is intended to fully replace Qbit — same Play Console / App Store
listing (`com.aplc.weeklytaxapp`), same users. It shares Qbit's production
database: the `users` table lives in `public` (shared — existing accounts
log in with their existing email/password, no re-registration), while every
table Evolution owns lives in its own `evolution` Postgres schema so it can
never collide with Qbit's differently-shaped tables of the same name. See
`backend/src/db.ts` and `backend/sql/schema.sql`. Sessions do **not** carry
over automatically — Evolution uses its own `JWT_SECRET`, so an existing
Qbit user gets one fresh login on Evolution, not an instant carry-over
mid-session. An account with Qbit's 2FA enabled is blocked from logging into
Evolution until 2FA support ships there too (`routes/auth.routes.ts`) —
this is a deliberate safety check, not a gap.

## Stack

- Mobile: React Native (Expo), `@react-navigation`
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Storage: S3-compatible object storage (receipts and invoice files)

## Folder structure

- `backend` — API, tax engine, rules engine, SQL schema/seed
- `mobile` — Expo app: Capture, Income, Summary, History, Export tabs

## Backend run

1. `cd backend`
2. `cp .env.example .env` and fill in `DATABASE_URL`, `JWT_SECRET`, and the `AWS_*` S3 variables
3. `npm install`
4. `psql "$DATABASE_URL" -f sql/schema.sql`
5. `psql "$DATABASE_URL" -f sql/seed_rules.sql`
6. `npm run dev`
7. `npm run check-env` — verifies required env vars and DB connectivity before deploying
8. `npm run smoke-test` — exercises capture → void → summary end to end against a running backend

## Mobile run

1. `cd mobile`
2. `npm install`
3. `npm start`

Set `EXPO_PUBLIC_API_BASE_URL` for device testing (use your machine's LAN IP, not `localhost`, for a physical phone).

## Implemented MVP scope

- Expense capture: receipt photo/file + category, amount, payment method (cash/card), reimbursement status (none/partial/full) — captured together in one action
- Income recording: periodic invoice (period, source, total, optional file)
- Tax + NI estimate and year summary, computed from expenses + income invoices
- Export (JSON + CSV)
- Void (soft-delete with reason) for both expenses and income invoices — no edit-in-place, preserving an audit trail

Deferred to a later milestone: 2FA, password reset, account deletion, admin rule-publishing UI, multi-receipt-per-expense, offline queueing, and the OCR auto-fill / one-tap-capture fast-follow (see the project's saved plan for details).

## API endpoints

Public:

- `POST /auth/register`, `POST /auth/login`

Protected (Bearer token):

- `POST /expenses` (multipart: receipt + fields), `GET /expenses`, `GET /expenses/:id`, `POST /expenses/:id/void`
- `GET /receipts/:receiptId/download?token=...`
- `POST /income-invoices` (multipart, file optional), `GET /income-invoices`, `GET /income-invoices/:id`, `POST /income-invoices/:id/void`, `GET /income-invoices/:id/download?token=...`
- `GET /tax-years/:taxYear/summary`, `GET /tax-years/:taxYear/rules-monitoring`, `GET /tax-years/:taxYear/export?format=json|csv`

## Notes on the tax model

- Reimbursement status is explicit (`none` / `partial` / `full`) rather than a bare numeric field — a fully reimbursed expense is not a deductible loss at all.
- Receipts are keyed directly to one expense (`receipts.expense_id`), not to a week or period.
- The NI Class 2 "weeks logged" figure is derived from income-invoice trading periods overlapping the tax year (`backend/src/incomeAggregation.ts`), not from a per-week record — a straddling invoice correctly contributes only its in-year days to each tax year it touches.
