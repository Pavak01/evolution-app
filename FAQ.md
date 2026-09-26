# Evolution — FAQ

See the [User Guide](USER-GUIDE.md) for a full screen-by-screen walkthrough.

## Account and sign-in

**I have 2FA enabled — how does that work in Evolution?**
After your password, you'll be asked for the 6-digit code from your authenticator app. There's no in-app screen for turning 2FA on or off yet — that's planned for a future update, and can currently only be verified at sign-in, not configured.

**I lost access to my authenticator app / my 2FA code won't work — what now?**
Contact support (see [Privacy Policy](PRIVACY-POLICY.md) for the contact email) — account recovery for 2FA has to be handled manually, since it involves verifying your identity outside the app.

**How do I delete my account?**
In-app: Settings → Delete account (type `DELETE` to confirm). Without the app installed: use the [public account deletion page](ACCOUNT-DELETION.html), which asks for your email and password to confirm it's really you. Either way, processing completes within 30 days. Full details in the [Privacy Policy](PRIVACY-POLICY.md).

**Can I clear my data and start over without deleting my account?**
Yes — Settings → Reset all data (type `RESET` to confirm). It clears every expense, income record, and receipt immediately; your account and login are untouched. If any of that data is from a tax year that's both past HMRC's filing deadline and has been exported before — meaning it may have already been used for a submitted return — you'll see a warning naming that year instead of an immediate reset; it's not a hard block, so export a backup first if you want one, or confirm again to reset anyway. The one exception is a tax year you've explicitly **locked** (see below) — that's always fully protected, with no "reset anyway" option, until you unlock it. Either way, this can't be undone.

## Logging expenses

**Why do I have to attach a receipt to log an expense?**
Evolution is built around capturing the receipt at the moment of the transaction, since that's the point you're least likely to lose or forget it — and without proof, an expense isn't a valid claim. A receipt (photo or file) is required on every expense, with one exception: see the next question.

**Do I really need a receipt for every travel fare, right when I pay it?**
No — `travel` is the one category where you can save the expense with no receipt at all. A bus tap, a train ticket, or an Uber fare rarely has anything to photograph in the moment, but the proof usually does exist afterward (a bank statement, an app payment confirmation, an emailed receipt). Save the amount and date now; the entry shows up in History flagged "missing receipt" and doesn't count toward your deductible total until you open it and attach that proof once you have it. Every other category still needs a receipt at capture time, since one is genuinely available then.

**What if I don't have a physical receipt — like a fuel app payment or a subscription?**
A screenshot of the payment confirmation, app receipt, or email counts as a receipt — take a photo of your screen, or use "Choose photo" to pick a saved screenshot from your photo library.

**Can I attach a PDF receipt?**
Not currently — a photo or screenshot of the PDF works as a substitute.

**I have a company-issued fuel card — should I log that fuel as an expense?**
No. If a fuel purchase was paid for on a card the company owns, you didn't personally pay for it, so it isn't a deductible cost to you — logging it would overstate your expenses. Auto-fill will show a warning when a receipt shows clear signs of a fuel-card payment (a named scheme like Allstar or BP Plus, or "FUEL CARD"/"FLEET CARD" printed on it), but it's a best-effort signal, not exhaustive — a personal fuel card can look similar, so it's always your own call whether to include a flagged receipt.

**What categories are available?**
Quick-pick suggestions are: fuel, travel, parking & tolls, phone, home office, clothing, accountancy, food, and other. You can also type any category name of your own — the suggestions are shortcuts, not a fixed list.

**What's "Business use %" for?**
Some expenses are only partly for work — a phone bill, home office costs. It defaults to 100%; lower it and only that portion counts toward what you can deduct, instead of the whole amount.

**I made a mistake on an expense — how do I fix it?**
There's no edit button by design. Open the expense in History and **void** it with a reason, then log a fresh correct entry. This keeps a clean audit trail — nothing is silently changed after the fact, which matters if your records are ever checked by HMRC.

**Will retrying after "no connection" or an error ever log something twice?**
No. Every submission carries a one-time ID behind the scenes, so if a save actually went through and only the confirmation was lost (a dropped connection, a brief server hiccup), retrying — including an automatic retry from the offline queue — returns your original entry instead of creating a second one.

**I think I've logged the same receipt twice — does Evolution catch that?**
Usually, yes. If a new expense uses the exact same receipt photo as one you've already logged, or shares the same category, amount, and date as another (sharpened to an exact time match when a receipt's printed transaction time was read automatically), you'll see a note right after saving pointing at the earlier entry. This isn't just a one-off notice — both entries stay marked **"possible duplicate"** in History (next to "voided" or "missing receipt") until you act on it, and the expense's own detail page links straight to the other one. It never blocks the save or asks you to confirm first — open the one you don't need and void it with a reason, same as any other correction; once you do, the flag clears on its own.

**What is "Auto-fill from receipt"?**
A paid upgrade, currently in preview, that reads a receipt photo and fills in the category, amount, and date automatically — you still review and can edit everything before saving. It's not purchasable yet; manual entry is always free and always works, and stays that way as the fallback even once auto-fill ships properly.

**What is "Import past receipts"?**
For accounts with early access to auto-fill: a way to bulk-add receipts you already had before you started using Evolution. Pick several photos at once from Capture's "Import past receipts" link, each one gets auto-read the same way single-receipt auto-fill does, and you review and correct every row before importing. Each receipt is attributed to its own actual date, so an old receipt from an earlier tax year lands in that year's summary, not the current one — after importing, the running total shown is for the current tax year, with a note if some of what you just imported actually landed elsewhere.

**Can I still claim a receipt from a previous tax year?**
Often, yes — a UK Self Assessment return is due 31 January following the end of its tax year, and can still be amended up to 12 months after that. So a receipt from a year that hasn't been filed yet, or is still within its amendment window, is genuinely still claimable. During Import past receipts, a receipt dated in a year that's likely past that window gets a warning (not a block) — it's still your call whether to include it.

## Recording income

**Why is income recorded separately from expenses?**
Because the two things happen at genuinely different times. An expense happens the instant you pay for something; income often arrives later and covers a period (an invoice paid weeks after the work), so bundling the two into one entry would create friction and make it easy to miss expenses. Evolution treats them as two independent streams.

**Two different clients invoiced me for overlapping dates — will that double-count?**
No. Overlapping income periods are legitimate (two clients paying you for the same week is normal) and Evolution merges the overlap when calculating your "weeks logged" figure for National Insurance, so you won't be double-counted.

**Is attaching an invoice file required, like it is for expense receipts?**
No — attaching a file to an income record is optional.

**Can I attach a PDF invoice, unlike an expense receipt?**
Yes. Real invoices routinely arrive as PDFs, unlike point-of-sale receipts, so income invoices support both — tap the attach button on Record income and choose **Photo** or **PDF** from the dropdown.

**What is "Auto-fill from invoice"?**
A paid upgrade, currently in preview, that reads an attached invoice (photo or PDF) and fills in who paid you, the total amount, and the received date automatically — you still review and can edit everything before saving. It never fills in the period dates, since most real invoices don't state an explicit period. It's not purchasable yet; manual entry is always free and always works.

**How do I view an invoice file I've attached?**
Open the record in Income history and tap **View invoice**. A photo opens in an in-app viewer; a PDF or CSV is handed to your device's share sheet instead, so you can open it in whatever app makes sense (a PDF viewer, a spreadsheet app).

**What is "Import income from CSV"?**
For a report covering several invoices at once — for example, an earnings export from a platform you work through — rather than one invoice at a time. From Record income, tap **Import income from CSV**, pick the file, enter who paid you once (it applies to every row), review the parsed list, untick anything you don't want, and import. Each row becomes its own income record, with the original file attached to each so you can always refer back to it. This currently expects a specific report layout (supplier, invoice date, invoice number, total); a differently-shaped CSV won't be recognized.

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
Yes. If there's no connection when you save, it's kept on your device and looks like it saved normally — it uploads automatically once you're back online (or you can force it with "Retry now"). Any item still waiting shows in a **Pending uploads** section at the top of History. The one thing this depends on: don't uninstall the app or clear its storage before a pending item has actually synced, or that copy is lost the same way any unsaved local data would be.

## Export

**What's in the exported file?**
A CSV file, for a given tax year. Beyond the totals, it's shaped around your actual Self Assessment return: expense categories are grouped into the same boxes HMRC's SA103S form asks for (fuel, travel, and parking all combine into "car, van and travel expenses," for example), alongside a full itemized list of every non-voided expense and income record for handing to an accountant or keeping your own backup.

**Can I fill out my Self Assessment straight from this export?**
It gets you most of the way there — the box totals map onto SA103S's actual line items — but always sanity-check against the itemized backup before copying figures over, and treat the estimated income tax/NI figures as planning numbers only; they're not part of what the form asks for.

**A travel expense doesn't have a receipt yet — does it still show up in the export?**
Yes, so nothing is silently missing from your records, but it's excluded from the box totals and clearly marked as not yet counted — the same "no proof, no claim" rule the rest of the app applies. Attach the receipt first if you want it included in this tax year's figures.

**Where does the exported file go?**
It's handed to your device's share sheet, so you choose where it goes — save it, email it, or open it in another app.

**What does "Lock this tax year" do?**
Once you've actually filed a Self Assessment return using a tax year's figures, lock it (on the Export screen, after entering that tax year). This archives a permanent copy of the export as it looked at that moment and protects the year — Reset all data can never touch a locked year's records, even if you choose "reset anyway." Unlock it later if you need to (Export screen again), which makes it resettable like any other year — the archived copy stays either way.
