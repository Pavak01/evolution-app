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
- Files and docs — collected: PDF invoices attached to income records, PDF receipts shared to Evolution from another app, and CSV earnings reports used for "Import income from CSV" (the original file is stored with each imported record). Purpose: App functionality. Optional.

**Financial info → Purchase history** (only once Phase B ships)
- Not collected yet. When Play billing via RevenueCat ships, subscription status/purchase history becomes collected (Purpose: App functionality / account management). Promo codes give free access and aren't purchases.

**App activity**
- App interactions — **not collected.** There's no analytics/telemetry SDK and no event tracking. (Crash reporting is covered separately below.)

**App info and performance** (since build 113)
- Crash logs and Diagnostics: collected, via Sentry (service provider, EU region). Purpose: App functionality (finding and fixing crashes). Not linked to the user (no user ID, email or IP sent). Automatic, not optional.
- Answer "App interactions: not collected" still holds: Sentry is configured for errors only, with no performance tracing or usage analytics.

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
- **Sentry** — crash and error reports (no personal data) are processed by Sentry, our error-monitoring provider, in the EU. A service provider, normally not "sharing" in Play's sense.
- **Resend** — the email address and a one-time code are passed to Resend solely to deliver sign-up confirmation and password-reset emails. A service provider acting on Evolution's behalf (like hosting), so normally not "sharing" in Play's sense — check Play's current help text.
- **AWS (S3-compatible storage) / Railway (hosting, Postgres)** — these run the app's own infrastructure under contract, processing data on Evolution's behalf rather than for their own independent purposes. Most privacy frameworks (and Play's own guidance) treat a processor operating under a data processing agreement differently from "sharing" with a third party — I'd list these under "how data is stored/processed" rather than the "shared with third parties" section, but this is worth double-checking against Play's current help text yourself, since the exact line can shift.

## Content rating questionnaire

This is a finance/productivity utility with no user-generated public content, no social features, no in-app purchases processing real payment yet (plans are a free trial plus free promo codes until Play billing ships), no violence/gambling/mature content of any kind. Every content-rating question outside "none of the above" should be answered **no** — this should land at the lowest available rating tier (e.g. "Everyone" / PEGI 3, depending on the rating body Play uses in your region).

## Target audience and content

- Not designed for or directed at children.
- Primary audience: self-employed UK trade plate drivers tracking expenses/income for Self Assessment.

## Store listing (updated 2026-10-07, for build 113)

**App name** (30 max): `Evolution: Receipts & Tax` (25)

**Short description** (80 max):
> Snap receipts, log income and see your UK tax estimate. Built for drivers. (75)

**Full description** (4000 max; about 2,200 here):

> Evolution keeps your self-employed records straight, as you go. Snap a receipt the moment you pay, log income when it arrives, and always know roughly what to put aside for tax.
>
> Built for trade plate drivers and other self-employed people in the UK: travel-heavy, paid per job, no fixed workplace.
>
> **Log a receipt in seconds**
> • Take a photo the moment you pay; the receipt is stored with the expense
> • Travel with no receipt yet? Save it now and attach proof later
> • Auto-fill reads the amount, date and category from the photo for you (Pro)
> • Import a pile of past receipts in one go (Pro)
> • Got a PDF receipt by email? Share it straight to Evolution
> • One tap from your home screen with the Evolution widget, or long-press the app icon
>
> **Income, your way**
> • Record each payment or invoice when it comes in
> • Attach the invoice as a photo or PDF, or share it straight from Gmail
> • Import a CSV earnings report in one go
>
> **Reimbursements that don't get forgotten**
> • Mark travel you expect to be paid back for
> • Record what was reimbursed later, and only what you actually paid counts
> • Gentle reminders until it's sorted
>
> **Know where you stand**
> • Running estimate of income tax and National Insurance for the UK tax year
> • Business-use percentage for mixed-use costs
> • Duplicate warnings, with a side-by-side compare so you can void the extra one
> • An audit trail: corrections are voided with a reason, never silently changed or deleted
> • Export shaped around HMRC's Self Assessment (SA103S) boxes, ready for you or your accountant
>
> **Works when you do**
> • No signal? Entries save on your phone and upload when you're back online
> • Email-confirmed accounts and optional two-factor authentication
>
> **Plans**
> Free while in testing.
>
> Evolution provides estimates to help you plan; it is not tax advice. You remain responsible for your tax return.
>
> Evolution is made by APLC Commodities Ltd.

**Notes before publishing:**
- The **Plans** paragraph above is the testing version. When Phase B (Play billing) is live, replace it with: "Try everything free for one month. Then choose Basic (everything you enter yourself) or Pro (adds auto-fill and receipt import). Subscriptions are managed through Google Play and can be cancelled at any time." Play rejects listings that call a paid app "free", so swap it before launch.
- Everything in the description is in build 113 (PDF receipts via sharing, compare-and-void, app-icon shortcuts). Don't use it with builds older than 113.
- **Category:** Finance. **Tags:** expense tracker, tax, self-employed, receipts.
- **Graphics:** icon `mobile/assets/store/play-store-icon-512.png`; feature graphic `mobile/assets/store/feature-graphic-1024x500.png`; phone screenshots (2 to 8, from build 113): suggested Log a receipt, History, Compare duplicates, Summary, Record income, the widget on a home screen.
- **Contact details:** email support@aplccommodities.com; privacy policy https://pavak01.github.io/evolution-app/PRIVACY-POLICY.html

## Known pending items (not blockers, worth tracking)

- iOS: blocked on Apple Developer Program enrollment (not yet done) — Android-only for now.
- **Prices (decided 2026-10-10):** Basic **£3.99/month or £39.99/year**; Pro **£5.99/month or £59.99/year**; Complete (Pro + MTD quarterly updates and the annual tax return) **£9.99/month or £99.99/year**. Yearly = two months free. Play prices include VAT (Google accounts for it); Google keeps 15% of subscriptions. Complete is sold only once HMRC approves Evolution for live MTD (2027–28 window); launch with Basic and Pro. In Play Console: one subscription per plan (basic, pro, later complete), each with a monthly and a yearly base plan.
- Plans (2026-10-04): 1-month free trial, then Basic or Pro (Pro = anything that reads a photo/PDF). Phase A shipped: trial, enforcement, Plans screen, free promo codes. **Phase B (Play billing via RevenueCat) not built** — don't advertise subscriptions as purchasable in the listing yet. When it ships: Data Safety gains purchase history (collected via Google Play/RevenueCat), and the listing should state "Free trial, then subscription". Promo codes are given away only, never sold outside Play billing (Play payments policy).
- Notifications: since build 112 the app requests the Android 13+ notification permission (reimbursement reminders, on-device only, no data leaves the phone for this).
- PDF receipts via sharing are new in build 113. Confirm one on a real device before publishing the listing.
