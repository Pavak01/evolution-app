# Play Console submission notes

Reference material for filling out Play Console's forms — drafted from what the app actually does (the code, `PRIVACY-POLICY.md`, `ACCOUNT-DELETION.html`), not legal advice. Review before submitting; the answers below are a factual starting point, not a substitute for your own judgment on anything genuinely ambiguous.

## Data safety form

### Does your app collect or share any of the required user data types?
**Yes.**

### Data types collected

**Personal info**
- Email address — collected. Purpose: Account management (sign-in, plus one-time codes emailed to confirm the address at sign-up and to reset a password; no marketing email). Required, not optional. Not processed ephemerally.

**Financial info**
- Other financial info — collected (the expense/income records you enter: category, amount, payment method, business use %, reimbursement status and amount reimbursed, income source, period, total). Purpose: App functionality (this is the core purpose of the app — tracking your own expenses/income for Self Assessment). Required, not optional.

**Photos**
- Photos — collected (receipt and invoice photos you attach). Purpose: App functionality. Required only for non-`travel` expense categories; optional for `travel` and for income invoices.

**Files and docs**
- Files and docs — collected: PDF invoices attached to income records, and CSV earnings reports used for "Import income from CSV" (the original file is stored with each imported record). Receipts are photos only. Purpose: App functionality. Optional.

**Financial info → Purchase history** (only once Phase B ships)
- Not collected yet. When Play billing via RevenueCat ships, subscription status/purchase history becomes collected (Purpose: App functionality / account management). Promo codes give free access and aren't purchases.

**App activity**
- App interactions — arguably collected in the loose sense of "you use the app's features," but there's no analytics/telemetry SDK, no event tracking, no crash reporting service integrated. **I'd answer "not collected" here** unless something changes — there's genuinely nothing in the codebase collecting usage analytics.

**Device or other identifiers**
- None collected. No advertising ID, no device ID tracking.

### Permissions to be ready to explain (not Data Safety questions)
- **Notifications** (Android 13+ `POST_NOTIFICATIONS`, new in the build after 110): reimbursement reminders, scheduled on the phone itself. No data leaves the phone for this, and no push service is used.
- Camera / photos: receipt and invoice capture.

### Is all of the user data collected by your app encrypted in transit?
**Yes** — all API traffic is HTTPS (Railway-hosted backend), all file storage access via S3 uses signed HTTPS URLs.

### Do you provide a way for users to request that their data be deleted?
**Yes** — in-app (Settings → Delete account) and via the public page (`ACCOUNT-DELETION.html`), both described in `PRIVACY-POLICY.md`. Link Play Console to the ACCOUNT-DELETION.html URL when asked for a data-deletion web link.

### Data sharing with third parties
This is the one place to be deliberate, not just tick "no":
- **Anthropic** — receipt photos, and invoice photos/PDFs, are sent to Anthropic's API when the user actively uses "Auto-fill from receipt", "Import past receipts" or "Auto-fill from invoice" (Pro, and the free trial). Disclose it. Purpose: App functionality. Not for advertising or marketing.
- **Resend** — the email address and a one-time code are passed to Resend solely to deliver sign-up confirmation and password-reset emails. A service provider acting on Evolution's behalf (like hosting), so normally not "sharing" in Play's sense — check Play's current help text.
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
- Plans (2026-10-04): 1-month free trial, then Basic or Pro (Pro = anything that reads a photo/PDF). Phase A shipped: trial, enforcement, Plans screen, free promo codes. **Phase B (Play billing via RevenueCat) not built** — don't advertise subscriptions as purchasable in the listing yet. When it ships: Data Safety gains purchase history (collected via Google Play/RevenueCat), and the listing should state "Free trial, then subscription". Promo codes are given away only, never sold outside Play billing (Play payments policy).
- Notifications (2026-10-03): the next build requests the Android 13+ notification permission (reimbursement reminders, on-device only, no data leaves the phone for this).
- PDF attachment just wired up this session (`3a7d2d9`) — unverified on a real device as of this build. Confirm it actually works before claiming "PDF support" anywhere in the listing or updating the FAQ.
