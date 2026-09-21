# Play Console submission notes

Reference material for filling out Play Console's forms — drafted from what the app actually does (the code, `PRIVACY-POLICY.md`, `ACCOUNT-DELETION.html`), not legal advice. Review before submitting; the answers below are a factual starting point, not a substitute for your own judgment on anything genuinely ambiguous.

## Data safety form

### Does your app collect or share any of the required user data types?
**Yes.**

### Data types collected

**Personal info**
- Email address — collected. Purpose: Account management. Required, not optional. Not processed ephemerally.

**Financial info**
- Other financial info — collected (the expense/income records you enter: category, amount, payment method, reimbursement status, income source, period, total). Purpose: App functionality (this is the core purpose of the app — tracking your own expenses/income for Self Assessment). Required, not optional.

**Photos**
- Photos — collected (receipt and invoice photos you attach). Purpose: App functionality. Required only for non-`travel` expense categories; optional for `travel` and for income invoices.

**Files and docs**
- Files and docs — collected (PDF receipts/invoices, once the PDF attachment feature ships). Same purpose/requirement as Photos above.

**App activity**
- App interactions — arguably collected in the loose sense of "you use the app's features," but there's no analytics/telemetry SDK, no event tracking, no crash reporting service integrated. **I'd answer "not collected" here** unless something changes — there's genuinely nothing in the codebase collecting usage analytics.

**Device or other identifiers**
- None collected. No advertising ID, no device ID tracking.

### Is all of the user data collected by your app encrypted in transit?
**Yes** — all API traffic is HTTPS (Railway-hosted backend), all file storage access via S3 uses signed HTTPS URLs.

### Do you provide a way for users to request that their data be deleted?
**Yes** — in-app (Settings → Delete account) and via the public page (`ACCOUNT-DELETION.html`), both described in `PRIVACY-POLICY.md`. Link Play Console to the ACCOUNT-DELETION.html URL when asked for a data-deletion web link.

### Data sharing with third parties
This is the one place to be deliberate, not just tick "no":
- **Anthropic** — receipt/invoice photos are sent to Anthropic's API when you actively use "Auto-fill from receipt" or "Import past receipts" (the OCR paid upgrade). This is a real third-party data transfer and should be disclosed. Purpose: App functionality. Not for advertising or marketing.
- **AWS (S3-compatible storage) / Railway (hosting, Postgres)** — these run the app's own infrastructure under contract, processing data on Evolution's behalf rather than for their own independent purposes. Most privacy frameworks (and Play's own guidance) treat a processor operating under a data processing agreement differently from "sharing" with a third party — I'd list these under "how data is stored/processed" rather than the "shared with third parties" section, but this is worth double-checking against Play's current help text yourself, since the exact line can shift.

## Content rating questionnaire

This is a finance/productivity utility with no user-generated public content, no social features, no in-app purchases processing real payment (the OCR upgrade is currently manually gated, not a live purchase flow), no violence/gambling/mature content of any kind. Every content-rating question outside "none of the above" should be answered **no** — this should land at the lowest available rating tier (e.g. "Everyone" / PEGI 3, depending on the rating body Play uses in your region).

## Target audience and content

- Not designed for or directed at children.
- Primary audience: self-employed UK trade plate drivers tracking expenses/income for Self Assessment.

## Store listing copy (draft)

**Short description** (80 char max):
> Receipt-first expense & tax tracking for self-employed UK drivers.

**Full description** (draft — trim/adjust freely):
> Evolution is built around one idea: log a receipt the moment you pay, not at the end of the week trying to remember what it was for.
>
> • Snap a photo of a receipt the second you get it — takes seconds
> • Record income separately, whenever an invoice or payment actually arrives
> • Automatic UK tax year and National Insurance calculations as you go
> • Business-use % apportionment for mixed-use expenses (phone, home office)
> • Export shaped around HMRC's actual Self Assessment SA103S boxes — not just raw category totals
> • Works offline — a receipt logged with no signal syncs automatically once you're back online
> • Optional AI auto-fill from a receipt photo (paid upgrade)
> • Full audit trail — corrections are voided with a reason, never silently overwritten, so your records hold up if HMRC ever asks
>
> Built specifically with trade plate drivers in mind — no fixed workplace, travel-heavy, paid per job — but useful for any self-employed person who wants their books in order without the Sunday-night scramble.

**Category**: Finance (or Business/Productivity — Play only allows one primary category, use your judgement on which fits your positioning better).

## Known pending items (not blockers, worth tracking)

- iOS: blocked on Apple Developer Program enrollment (not yet done) — Android-only for now.
- OCR Phase B (real RevenueCat purchase flow) not built — the upgrade is currently manually granted per-account, so don't advertise it as self-service purchasable in the listing yet.
- PDF attachment just wired up this session (`3a7d2d9`) — unverified on a real device as of this build. Confirm it actually works before claiming "PDF support" anywhere in the listing or updating the FAQ.
