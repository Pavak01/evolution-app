# Evolution — User Guide

Evolution is a receipt-first expense and tax app for self-employed drivers, built around a simple idea: log an expense the moment it happens, at the point of sale, with a photo — and record income separately, whenever an invoice or payment actually arrives.

This guide walks through every screen. For quick answers, see the [FAQ](FAQ.md).

## Contents

- [Signing in](#signing-in)
- [Log a receipt (Capture)](#log-a-receipt-capture)
- [Record income](#record-income)
- [Summary](#summary)
- [History](#history)
  - [Recording a reimbursement](#recording-a-reimbursement)
- [Export](#export)
- [Settings](#settings)
- [Plans and free trial](#plans-and-free-trial)

## Signing in

Sign in with your email and password, or tap **Create an account** if you're new.

**Confirming your email.** When you create an account, we email you a 6-digit code. Enter it on the **Check your email** screen to finish. Your free trial starts at that moment. The code lasts 15 minutes. Can't see it? Check your spam or junk folder, or tap **Resend code** (available after a minute). Only the newest code works. If you typed the wrong email, tap **Wrong email? Start again**.

**Forgot your password?** Tap **Forgot password?** on the sign-in screen, enter your email and tap **Send code**. Then enter the code from the email and your new password (at least 8 characters) twice. You'll be signed straight in, and signed out on any other phone.

If your account has two-factor authentication (2FA) turned on, after entering your password you'll be asked for the 6-digit code from your authenticator app. (2FA can be verified at sign-in, but there isn't yet an in-app screen for turning it on — that's coming in a future update.)

## Log a receipt (Capture)

This is the home screen — the action you'll use most, right after you pay for something.

1. **Take photo** (camera) or **Choose photo** (your photo library).
2. Enter a **category**. Tap one of the quick suggestions — Fuel, Travel, Parking & tolls, Phone, Home office, Clothing, Accountancy, Food, Other — or type your own.
3. Confirm the **date** (defaults to today) and enter the **amount**.
4. Choose **payment method**: Card or Cash.
5. Add an optional note.
6. Tap **Save expense**.

After saving, you'll see your running total for the current tax year (net profit and how much to set aside for tax), and the form resets — ready for the next receipt. The date field is left as-is between saves, since logging several receipts from the same day back-to-back is the common case. This total always reflects your current figures — it refreshes whenever you return to this screen, not just right after a save, so voiding something in History is reflected here too.

**No signal? Still works.** If you save an expense with no internet connection, it's kept on your device and looks like it saved normally — it uploads automatically the next time you're back online, whether that's a minute later or after the app's been closed and reopened. You can see anything still waiting to upload as a **Pending uploads** section at the top of History, with a manual **Retry now** if you don't want to wait. Retrying — whether that's an automatic retry from Pending uploads or you tapping Save again after an error — never logs the same expense twice.

**Possible duplicate?** If a receipt looks like one you've already logged — the same photo reused, or a matching category, amount, and date — you'll see a note right after saving pointing at the earlier entry. It never blocks the save. Both entries then stay marked **"possible duplicate"** in History until you act on it — open either one for a link straight to the other, and void whichever one you don't need; the flag clears once you do.

**Business use %**: every expense defaults to 100% business use. If something was only partly for work (a phone bill, home office costs), tap **Change** next to "Business use" and lower the percentage — only that portion counts toward your deductible total.

**Travel is the one category that doesn't need a receipt right away.** A bus, train, or taxi fare rarely has anything to photograph in the moment — so for `travel`, you can save the expense with no photo at all. It shows up in History flagged **"missing receipt"** and doesn't count toward your deductible total or tax estimate yet — open it from History once you've got proof (a bank statement screenshot, an app payment confirmation, an emailed receipt) and tap **Attach receipt** to complete it. Every other category still needs a receipt at the point you log it.

**Expecting a reimbursement?** Some firms pay back part of your travel costs separately, later on — not as part of your invoice. When you log a travel expense, you'll see **Expecting reimbursement?** with **No** / **Yes**. Choose **Yes** if a firm is likely to pay some of it back. You don't need to know the amount yet. The expense is saved as **awaiting reimbursement** (shown in amber everywhere) and still counts in full for now, because if the money never arrives, it's a cost you genuinely paid. See [Recording a reimbursement](#recording-a-reimbursement) for what to do once you know the amount.

The first time you do this, the app asks whether it can send you notifications. If you allow it, you'll get a reminder at 9am, two weeks after the oldest expense still awaiting reimbursement, and then once a week until you've recorded them all. Tapping the reminder opens History showing just those expenses. Reminders stop on their own once nothing is awaiting, and you can turn them off any time in your phone's notification settings.

**Receipts that arrive as a PDF or file**: for emailed or app receipts (Uber, trains, online orders), tap **Choose a file (PDF or image)** under the photo buttons. It opens your phone's file picker, so you can pick from Downloads, Google Drive or an email attachment. PDFs and JPEG, PNG or WebP images are accepted. Auto-fill works on PDFs too. In History, a PDF receipt shows **Open receipt (PDF)**, which opens it in your phone's PDF viewer. The same option appears when attaching proof to a travel expense later.

**Auto-fill from receipt** (Pro, and included in the free trial): reads a picked receipt photo and fills in the category, amount, and date for you, still fully editable before you save. Once a photo is added you'll see an **Auto-fill from receipt** button, or on Basic a note that it's part of Pro.

**Fuel card warning**: if auto-fill spots signs of a commercial/fleet fuel card on a receipt (a named scheme like Allstar or BP Plus, or "FUEL CARD" printed on it), it shows a warning — fuel paid for on a company-owned card wasn't paid for by you, so it shouldn't be claimed as a deductible expense. This is a best-effort signal, not exhaustive, so it's always your own call whether to include a flagged receipt.

**Import past receipts** (Pro, and included in the free trial): a link above the capture form opens a bulk-import flow for receipts you already had before you started using Evolution — pick several photos at once, each gets auto-read, then you review and correct before importing them all. Each receipt lands in whichever tax year its own date actually falls in, which is often not the current one — after importing, you'll see the current year's running total, plus a note if some of what you just imported went to a different year instead. If a receipt's date is likely past HMRC's amendment deadline for its tax year, you'll see a warning next to it — it's not blocked, just flagged, since it's still your call whether to include it.

## Record income

Unlike expenses, income is entered periodically — whenever a payment or invoice comes in, not at the moment you provide the service.

1. Enter **who paid you**.
2. Enter the **period** the payment covers (start and end date).
3. Enter the **total amount**.
4. Confirm the **received date** (defaults to today).
5. Optionally attach the invoice: tap **Attach invoice**, then choose **Photo** or **PDF** from the dropdown — unlike an expense receipt, an invoice can be either, since real invoices routinely arrive as PDFs.
6. Tap **Save income**.

You'll see the updated running total for total income and net profit. Tap **View income history** to see everything you've recorded.

Income periods can overlap between different clients (two people paying you for the same week is normal) — the app deduplicates the overlap automatically when calculating your weeks-logged figure for National Insurance, so you don't need to worry about double-counting.

**Auto-fill from invoice** (Pro, and included in the free trial): reads an attached invoice (photo or PDF) and fills in who paid you, the total amount, and the received date, still fully editable before you save. It never fills in the period dates.

**Viewing an attached invoice**: from Income history, tap **View invoice** on any entry that has one. A photo opens in an in-app viewer; a PDF or CSV is handed to your device's share sheet instead, since those can't be shown in-app the same way.

**Import income from CSV**: for a report covering several invoices at once — an earnings export from a platform you work through, for example — rather than logging them one by one. Tap **Import income from CSV** below the form, pick the file, enter who paid you once (it applies to every row parsed from the file), then review the list and untick anything you don't want before importing. Each row becomes its own income record, with the original CSV attached to each one so you can always refer back to it. This expects a specific report layout (supplier, invoice date, invoice number, total) — a differently-shaped CSV won't be recognized.

## Summary

Your tax-year dashboard: total income, total expenses, net profit, weeks logged, and the estimate breakdown — income tax, Class 2 NI, Class 4 NI, and the total you should set aside.

Switch between the current and previous tax year using the buttons at the top. If anything about your figures needs attention (for example, an unusually high proportion of one category), it appears under **Things to review**. If any expenses are still awaiting reimbursement, you'll see an amber note there with how many and their total, until you record what was paid back.

## History

Browse everything you've logged for the current tax year, newest first. Tap any entry to see the full detail: amounts, payment method, and the receipt itself (**View receipt** opens it in an in-app viewer, with an option to share it). An entry showing **"missing receipt"** is a travel expense saved without one yet — open it and tap **Attach receipt** once you have proof. An entry showing **"possible duplicate"** matched another one you've logged — open it for the full detail and a link to the other entry.

An entry showing **"awaiting reimbursement"** (in amber) is one you're expecting a firm to pay some of back. Entries already recorded show **"partially reimbursed"** or **"fully reimbursed"**. To list only the ones still awaiting, open **Filters** and tap **Awaiting reimbursement**.

### Recording a reimbursement

When a firm tells you what it's paying back, open the expense from History and find the **Reimbursement** section:

- **Partially**: enter the amount reimbursed.
- **Fully**: the whole cost was paid back.
- **Not reimbursed**: the money isn't coming after all. The expense keeps counting in full.
- **Awaiting**: if you forgot to choose **Yes** when you logged it.

Tap **Update**. You'll see **Updated ✓** and go back to History. Your deductible amount is the business share of the cost minus what was paid back, never below zero. For example, £50 of travel at 100% business use with £12.50 paid back leaves £37.50 deductible.

**Voiding an entry**: there's no edit-in-place. If you made a mistake, open the entry and **void** it with a reason (for example, "duplicate entry" or "wrong amount"). Voided entries stay visible for your records but no longer count toward your totals — this keeps an accurate audit trail rather than silently overwriting history, which matters for tax compliance.

## Export

Generate a file of everything logged for a given tax year, shaped around your actual Self Assessment return.

1. Enter the tax year (for example, `2026-27`).
2. Tap **Export as CSV**.
3. The file is generated and offered through your device's share sheet — save it, email it to your accountant, or open it in another app.

The file has three parts: your totals, category totals grouped into HMRC's SA103S boxes (fuel/travel/parking combine into "car, van and travel expenses," phone/home office into "office costs," and so on), and a full itemized list of every expense and income record for the year. A travel expense still waiting on a receipt appears in the itemized list but is excluded from the box totals and marked as not yet counted, until you attach proof. The estimated income tax/NI figures are labelled as planning estimates — useful for setting money aside, but not part of what the return itself asks for.

**Once you've actually filed a Self Assessment return using a tax year's figures**, a "Filed status" card appears below Export for that year — tap **Lock this tax year**. This archives the export exactly as it looks right now (viewable any time after via **View archived copy**) and fully protects that year: Reset all data in Settings can never clear it, no matter what. **Unlock this tax year** reverses the protection if you need to — the archived copy stays regardless.

## Settings

- See which account you're signed in as.
- **Log out**.
- **Plan**: your current plan and when it ends, **See plans**, and **Have a code?** (see [Plans and free trial](#plans-and-free-trial)).
- **Help** — links to this User Guide, the FAQ, and the Privacy Policy, opened in your browser.
- **Reset all data** — clears every expense, income record, and receipt, immediately, without touching your account or login. Type `RESET` to confirm. If some of that data is from a tax year that's both past HMRC's filing deadline and has already been exported once — a sign it may have been used for a submitted return — you'll see a warning instead of an instant reset, naming the year in question; confirm again ("Reset anyway") if you want to proceed regardless. A tax year you've **locked** (see Export) is the one exception — it's always skipped, with no override, until you unlock it. This can't be undone.
- **Delete account** — permanently deletes your account and all your data: expenses, receipts, income records, and tax summaries. Type `DELETE` to confirm. This can't be undone, and processing completes within 30 days. See [Account deletion](ACCOUNT-DELETION.html) for the version of this you can use without the app installed, and the [Privacy Policy](PRIVACY-POLICY.md) for exactly what is removed.

## Plans and free trial

Every new account starts with a **free one-month trial with everything included**, from the first time you sign in to Evolution. That's time enough to see whether it's useful before deciding.

After the trial there are two plans:

| | **Basic** | **Pro** |
|---|---|---|
| Log receipts and income by hand, Summary, History, Export | ✓ | ✓ |
| Reimbursements, reminders, offline saving, duplicate checks | ✓ | ✓ |
| Import income from CSV | ✓ | ✓ |
| Auto-fill from receipt | | ✓ |
| Import past receipts | | ✓ |
| Auto-fill from invoice | | ✓ |

The simple rule: anything that reads a photo or PDF for you is Pro. A subscription is an allowable business expense.

During the last week of your trial you'll see a reminder on Log a receipt and Summary with how many days are left. Tap it, or go to **Settings → See plans**, to compare plans.

**If your trial ends without choosing a plan**, nothing is deleted or hidden. You can still view everything, export it, lock a filed tax year, reset your data or delete your account. You just can't add or change records until you choose a plan.

**Have a code?** If you've been given a code (for testing or a promotion), enter it under **Settings → Have a code?** or on the Plans screen. It unlocks the plan it's for, either for a set time or with no end date. A code never takes away a better plan you already have; if it wouldn't improve your plan, nothing changes and the code isn't used up.

Subscriptions can't be bought in the app just yet. That's coming soon.
