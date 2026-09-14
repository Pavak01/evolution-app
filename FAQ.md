# Evolution — FAQ

See the [User Guide](USER-GUIDE.md) for a full screen-by-screen walkthrough.

## Account and sign-in

**I have 2FA enabled — how does that work in Evolution?**
After your password, you'll be asked for the 6-digit code from your authenticator app. There's no in-app screen for turning 2FA on or off yet — that's planned for a future update, and can currently only be verified at sign-in, not configured.

**I lost access to my authenticator app / my 2FA code won't work — what now?**
Contact support (see [Privacy Policy](PRIVACY-POLICY.md) for the contact email) — account recovery for 2FA has to be handled manually, since it involves verifying your identity outside the app.

**How do I delete my account?**
In-app: Settings → Delete account (type `DELETE` to confirm). Without the app installed: use the [public account deletion page](ACCOUNT-DELETION.html), which asks for your email and password to confirm it's really you. Either way, processing completes within 30 days. Full details in the [Privacy Policy](PRIVACY-POLICY.md).

## Logging expenses

**Why do I have to attach a receipt to log an expense?**
Evolution is built around capturing the receipt at the moment of the transaction, since that's the point you're least likely to lose or forget it. A receipt (photo or file) is a required field on every expense for that reason.

**What if I don't have a physical receipt — like a fuel app payment or a subscription?**
A screenshot of the payment confirmation, app receipt, or email counts as a receipt — take a photo of your screen, or use "Choose photo" to pick a saved screenshot from your photo library.

**Can I attach a PDF receipt?**
Not currently inside Expo Go, the app used for testing before Evolution's first full release — this is a sandboxing limitation specific to that testing environment on Android, not a limitation of the app itself, and is resolved once Evolution ships as a standalone build. Until then, a photo or screenshot of the PDF works as a substitute.

**What categories are available?**
Quick-pick suggestions are: fuel, travel, parking & tolls, vehicle maintenance, phone, home office, PPE, accountancy, food, and other. You can also type any category name of your own — the suggestions are shortcuts, not a fixed list.

**What's the difference between "Partially" and "Fully" reimbursed?**
Fully reimbursed means someone paid you back the entire amount — it's not a deductible cost to you, so it won't reduce your taxable profit. Partially reimbursed means only part of it was paid back; the unreimbursed remainder is what counts as your deductible expense. If nothing was reimbursed, the full amount counts.

**I made a mistake on an expense — how do I fix it?**
There's no edit button by design. Open the expense in History and **void** it with a reason, then log a fresh correct entry. This keeps a clean audit trail — nothing is silently changed after the fact, which matters if your records are ever checked by HMRC.

**What is "Auto-fill from receipt"?**
A paid upgrade, currently in preview, that reads a receipt photo and fills in the category, amount, and date automatically — you still review and can edit everything before saving. It's not purchasable yet; manual entry is always free and always works, and stays that way as the fallback even once auto-fill ships properly.

## Recording income

**Why is income recorded separately from expenses?**
Because the two things happen at genuinely different times. An expense happens the instant you pay for something; income often arrives later and covers a period (an invoice paid weeks after the work), so bundling the two into one entry would create friction and make it easy to miss expenses. Evolution treats them as two independent streams.

**Two different clients invoiced me for overlapping dates — will that double-count?**
No. Overlapping income periods are legitimate (two clients paying you for the same week is normal) and Evolution merges the overlap when calculating your "weeks logged" figure for National Insurance, so you won't be double-counted.

**Is attaching an invoice file required, like it is for expense receipts?**
No — the invoice photo on an income record is optional.

## Summary and tax figures

**How is "weeks logged" calculated?**
From the date ranges of your income invoices, not from a manual weekly checklist. If an invoice's period straddles the boundary between two tax years (5/6 April), only the days that actually fall in each year count toward that year's total.

**How accurate are the tax and National Insurance estimates?**
They're estimates based on current UK tax rules, meant to help you set aside the right amount and spot issues early — not a substitute for your actual Self Assessment filing or professional advice.

**What shows up under "Things to review"?**
Automated warnings the app generates when something about your figures looks worth a second look (for example, an unusual pattern in a category). They're prompts to check your own records, not errors.

## Data, storage, and security

**Where is my data stored?**
Your expenses, income records, receipts, and tax summaries are stored in Evolution's own database tables. See the [Privacy Policy](PRIVACY-POLICY.md) for the full breakdown.

**Are my receipt photos publicly accessible if someone gets the link?**
No. Receipts are never served from a permanent public URL — every download goes through your authenticated session plus a separate short-lived signed link that expires quickly.

**I don't have a stable internet connection at the point of sale — can I log an expense offline?**
Not yet — offline queueing is a planned improvement, not yet part of the app. For now, an internet connection is needed to save an entry.

## Export

**What formats can I export in, and what's in the file?**
CSV or JSON, for a given tax year, covering every non-voided expense and income record — useful for handing to an accountant or keeping your own backup outside the app.

**Where does the exported file go?**
It's handed to your device's share sheet, so you choose where it goes — save it, email it, or open it in another app.
