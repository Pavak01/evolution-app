# Evolution — FAQ

See the [User Guide](USER-GUIDE.md) for a full screen-by-screen walkthrough.

## Account and sign-in

**Do I need to create a new account if I already use Qbit?**
No. Evolution and Qbit share the same sign-in (email and password), so your existing Qbit credentials work immediately in Evolution.

**If I'm signed into Qbit, am I automatically signed into Evolution too?**
No. Each app keeps its own session, so you'll sign in once, separately, the first time you open Evolution — even if you're already signed into Qbit.

**I have 2FA enabled — how does that work in Evolution?**
Evolution checks the same 2FA authenticator code Qbit already set up for your account. After your password, you'll be asked for the 6-digit code from your authenticator app. There's no separate 2FA to configure in Evolution itself yet — enabling or disabling 2FA is currently only available from within Qbit. A dedicated setup screen inside Evolution is planned for a future update.

**I lost access to my authenticator app / my 2FA code won't work — what now?**
Contact support (see [Privacy Policy](PRIVACY-POLICY.md) for the contact email) — account recovery for 2FA has to be handled manually, since it involves verifying your identity outside the app.

**How do I delete my account?**
In-app: Settings → Delete account (type `DELETE` to confirm). Without the app installed: use the [public account deletion page](ACCOUNT-DELETION.html), which asks for your email and password to confirm it's really you. Either way, deletion covers both Evolution and Qbit, and completes within 30 days. Full details in the [Privacy Policy](PRIVACY-POLICY.md).

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

## Recording income

**Why is income recorded separately from expenses, unlike Qbit's weekly entry?**
Because the two things happen at genuinely different times. An expense happens the instant you pay for something; income often arrives later and covers a period (an invoice paid weeks after the work), so bundling the two into one entry created friction and made it easy to miss expenses. Evolution treats them as two independent streams.

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

**Where is my data stored, and is it shared with Qbit?**
Your sign-in (email/password) is shared with Qbit — that's it. Your expenses, income records, receipts, and tax summaries are stored separately from Qbit's data, in Evolution's own tables, even though both apps' data lives in the same underlying database infrastructure. See the [Privacy Policy](PRIVACY-POLICY.md) for the full breakdown.

**Are my receipt photos publicly accessible if someone gets the link?**
No. Receipts are never served from a permanent public URL — every download goes through your authenticated session plus a separate short-lived signed link that expires quickly.

**What happens to my old Qbit weekly entries?**
They stay in Qbit, untouched. Evolution doesn't import or migrate them — it's a fresh start for your ongoing records, going forward, using the new workflow.

**I don't have a stable internet connection at the point of sale — can I log an expense offline?**
Not yet — offline queueing is a planned improvement, not yet part of the app. For now, an internet connection is needed to save an entry.

## Export

**What formats can I export in, and what's in the file?**
CSV or JSON, for a given tax year, covering every non-voided expense and income record — useful for handing to an accountant or keeping your own backup outside the app.

**Where does the exported file go?**
It's handed to your device's share sheet, so you choose where it goes — save it, email it, or open it in another app.
