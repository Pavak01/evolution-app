# Evolution — User Guide

Evolution is a receipt-first expense and tax app for self-employed drivers. It replaces Qbit (the weekly tax app) with a simpler idea: log an expense the moment it happens, at the point of sale, with a photo — and record income separately, whenever an invoice or payment actually arrives.

This guide walks through every screen. For quick answers, see the [FAQ](FAQ.md).

## Contents

- [Signing in](#signing-in)
- [Log a receipt (Capture)](#log-a-receipt-capture)
- [Record income](#record-income)
- [Summary](#summary)
- [History](#history)
- [Export](#export)
- [Settings](#settings)
- [Your data and Qbit](#your-data-and-qbit)

## Signing in

If you already have a Qbit account, sign in with the same email and password — no need to register again. Evolution and Qbit share one login, but keep separate sessions: signing into Evolution doesn't automatically sign you into Qbit, or vice versa.

If your account has two-factor authentication (2FA) turned on, after entering your password you'll be asked for the 6-digit code from your authenticator app. Evolution checks this the same way Qbit does — it's the same 2FA setup, not a separate one. (2FA can currently only be *turned on* from within Qbit; Evolution can verify a code but doesn't yet have its own setup screen for enabling it — that's coming in a future update.)

New to the app? Tap **Create an account** on the sign-in screen.

## Log a receipt (Capture)

This is the home screen — the action you'll use most, right after you pay for something.

1. **Take photo** (camera) or **Choose photo** (your photo library).
2. Enter a **category**. Tap one of the quick suggestions — `fuel`, `travel`, `parking_tolls`, `vehicle_maintenance`, `phone`, `home_office`, `ppe`, `accountancy`, `food`, `other` — or type your own.
3. Confirm the **date** (defaults to today) and enter the **amount**.
4. Choose **payment method**: Card or Cash.
5. Choose whether it was **reimbursed**: No, Partially, or Fully.
   - If Partially, enter how much was reimbursed — this must be less than the total.
   - A fully reimbursed expense isn't a deductible loss to you, so it won't count toward your deductions.
6. Add an optional note.
7. Tap **Save expense**.

After saving, you'll see your running total for the current tax year (net profit and how much to set aside for tax), and the form resets — ready for the next receipt. The date field is left as-is between saves, since logging several receipts from the same day back-to-back is the common case.

**A note on file types**: photo capture and photo-library selection both work reliably. Picking a PDF or a "Files" document currently does not work inside Expo Go (the testing app) due to a sandboxing limitation on Android — this is fixed once the app ships as a standalone build. In the meantime, a photo of a PDF receipt (or a screenshot of it) works fine.

## Record income

Unlike expenses, income is entered periodically — whenever a payment or invoice comes in, not at the moment you provide the service.

1. Enter **who paid you**.
2. Enter the **period** the payment covers (start and end date).
3. Enter the **total amount**.
4. Confirm the **received date** (defaults to today).
5. Optionally attach a photo of the invoice.
6. Tap **Save income**.

You'll see the updated running total for total income and net profit. Tap **View income history** to see everything you've recorded.

Income periods can overlap between different clients (two people paying you for the same week is normal) — the app deduplicates the overlap automatically when calculating your weeks-logged figure for National Insurance, so you don't need to worry about double-counting.

## Summary

Your tax-year dashboard: total income, total expenses, net profit, weeks logged, and the estimate breakdown — income tax, Class 2 NI, Class 4 NI, and the total you should set aside.

Switch between the current and previous tax year using the buttons at the top. If anything about your figures needs attention (for example, an unusually high proportion of one category), it appears under **Things to review**.

## History

Browse everything you've logged for the current tax year, newest first. Tap any entry to see the full detail: amounts, payment method, reimbursement status, and the receipt itself (**View receipt** opens it in an in-app viewer, with an option to share it).

**Voiding an entry**: there's no edit-in-place. If you made a mistake, open the entry and **void** it with a reason (for example, "duplicate entry" or "wrong amount"). Voided entries stay visible for your records but no longer count toward your totals — this keeps an accurate audit trail rather than silently overwriting history, which matters for tax compliance.

## Export

Generate a file of everything logged for a given tax year.

1. Enter the tax year (for example, `2026-27`).
2. Tap **Export as CSV** or **Export as JSON**.
3. The file is generated and offered through your device's share sheet — save it, email it to your accountant, or open it in another app.

## Settings

- See which account you're signed in as.
- **Log out**.
- **Delete account** — permanently deletes your account and all your data (expenses, receipts, income records, tax summaries) in both Evolution and Qbit. Type `DELETE` to confirm. This can't be undone, and processing completes within 30 days. See [Account deletion](ACCOUNT-DELETION.html) for the version of this you can use without the app installed, and the [Privacy Policy](PRIVACY-POLICY.md) for exactly what is and isn't removed.

## Your data and Qbit

Evolution is built to replace Qbit, by the same developer, sharing the same sign-in — but it does **not** share your expense and income records with Qbit. Each app keeps its own separate records. If you've been using Qbit, your historical weekly entries stay in Qbit; Evolution starts you fresh going forward with the new workflow. Deleting your account removes your data from both.
