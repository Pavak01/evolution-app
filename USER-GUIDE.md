# Evolution — User Guide

Evolution is a receipt-first expense and tax app for self-employed drivers, built around a simple idea: log an expense the moment it happens, at the point of sale, with a photo — and record income separately, whenever an invoice or payment actually arrives.

This guide walks through every screen. For quick answers, see the [FAQ](FAQ.md).

## Contents

- [Signing in](#signing-in)
- [Log a receipt (Capture)](#log-a-receipt-capture)
- [Record income](#record-income)
- [Summary](#summary)
- [History](#history)
- [Export](#export)
- [Settings](#settings)

## Signing in

Sign in with your email and password, or tap **Create an account** if you're new.

If your account has two-factor authentication (2FA) turned on, after entering your password you'll be asked for the 6-digit code from your authenticator app. (2FA can be verified at sign-in, but there isn't yet an in-app screen for turning it on — that's coming in a future update.)

## Log a receipt (Capture)

This is the home screen — the action you'll use most, right after you pay for something.

1. **Take photo** (camera) or **Choose photo** (your photo library).
2. Enter a **category**. Tap one of the quick suggestions — Fuel, Travel, Parking & tolls, Vehicle maintenance, Phone, Home office, Clothing, Accountancy, Food, Other — or type your own.
3. Confirm the **date** (defaults to today) and enter the **amount**.
4. Choose **payment method**: Card or Cash.
5. Choose whether it was **reimbursed**: No, Partially, or Fully.
   - If Partially, enter how much was reimbursed — this must be less than the total.
   - A fully reimbursed expense isn't a deductible loss to you, so it won't count toward your deductions.
6. Add an optional note.
7. Tap **Save expense**.

After saving, you'll see your running total for the current tax year (net profit and how much to set aside for tax), and the form resets — ready for the next receipt. The date field is left as-is between saves, since logging several receipts from the same day back-to-back is the common case. This total always reflects your current figures — it refreshes whenever you return to this screen, not just right after a save, so voiding something in History is reflected here too.

**No signal? Still works.** If you save an expense with no internet connection, it's kept on your device and looks like it saved normally — it uploads automatically the next time you're back online, whether that's a minute later or after the app's been closed and reopened. You can see anything still waiting to upload as a **Pending uploads** section at the top of History, with a manual **Retry now** if you don't want to wait. Retrying — whether that's an automatic retry from Pending uploads or you tapping Save again after an error — never logs the same expense twice.

**Possible duplicate?** If a receipt looks like one you've already logged — the same photo reused, or a matching category, amount, and date — you'll see a note right after saving pointing at the earlier entry. It never blocks the save. Both entries then stay marked **"possible duplicate"** in History until you act on it — open either one for a link straight to the other, and void whichever one you don't need; the flag clears once you do.

**Business use %**: every expense defaults to 100% business use. If something was only partly for work (a phone bill, home office costs), tap **Change** next to "Business use" and lower the percentage — only that portion counts toward your deductible total.

**Travel is the one category that doesn't need a receipt right away.** A bus, train, or taxi fare rarely has anything to photograph in the moment — so for `travel`, you can save the expense with no photo at all. It shows up in History flagged **"missing receipt"** and doesn't count toward your deductible total or tax estimate yet — open it from History once you've got proof (a bank statement screenshot, an app payment confirmation, an emailed receipt) and tap **Attach receipt** to complete it. Every other category still needs a receipt at the point you log it.

**A note on other file types**: photo capture and photo-library selection both work reliably. Picking a PDF or a "Files" document doesn't currently work — a photo or screenshot of the PDF works as a substitute.

**Auto-fill from receipt**: a paid upgrade, currently in preview, that reads a picked receipt photo and fills in the category, amount, and date for you — still fully editable before you save. Not yet purchasable; accounts with early access see an **Auto-fill from receipt** button once a photo is added, everyone else sees a "coming soon" note in its place.

**Import past receipts**: for accounts with early access to auto-fill, a link above the capture form opens a bulk-import flow for receipts you already had before you started using Evolution — pick several photos at once, each gets auto-read, then you review and correct before importing them all. Each receipt lands in whichever tax year its own date actually falls in, which is often not the current one — after importing, you'll see the current year's running total, plus a note if some of what you just imported went to a different year instead. If a receipt's date is likely past HMRC's amendment deadline for its tax year, you'll see a warning next to it — it's not blocked, just flagged, since it's still your call whether to include it.

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

Browse everything you've logged for the current tax year, newest first. Tap any entry to see the full detail: amounts, payment method, reimbursement status, and the receipt itself (**View receipt** opens it in an in-app viewer, with an option to share it). An entry showing **"missing receipt"** is a travel expense saved without one yet — open it and tap **Attach receipt** once you have proof. An entry showing **"possible duplicate"** matched another one you've logged — open it for the full detail and a link to the other entry.

**Voiding an entry**: there's no edit-in-place. If you made a mistake, open the entry and **void** it with a reason (for example, "duplicate entry" or "wrong amount"). Voided entries stay visible for your records but no longer count toward your totals — this keeps an accurate audit trail rather than silently overwriting history, which matters for tax compliance.

## Export

Generate a file of everything logged for a given tax year, shaped around your actual Self Assessment return.

1. Enter the tax year (for example, `2026-27`).
2. Tap **Export as CSV** or **Export as JSON**.
3. The file is generated and offered through your device's share sheet — save it, email it to your accountant, or open it in another app.

The file has three parts: your totals, category totals grouped into HMRC's SA103S boxes (fuel/travel/parking/vehicle maintenance combine into "car, van and travel expenses," phone/home office into "office costs," and so on), and a full itemized list of every expense and income record for the year. A travel expense still waiting on a receipt appears in the itemized list but is excluded from the box totals and marked as not yet counted, until you attach proof. The estimated income tax/NI figures are labelled as planning estimates — useful for setting money aside, but not part of what the return itself asks for.

## Settings

- See which account you're signed in as.
- **Log out**.
- **Help** — links to this User Guide, the FAQ, and the Privacy Policy, opened in your browser.
- **Delete account** — permanently deletes your account and all your data: expenses, receipts, income records, and tax summaries. Type `DELETE` to confirm. This can't be undone, and processing completes within 30 days. See [Account deletion](ACCOUNT-DELETION.html) for the version of this you can use without the app installed, and the [Privacy Policy](PRIVACY-POLICY.md) for exactly what is removed.
