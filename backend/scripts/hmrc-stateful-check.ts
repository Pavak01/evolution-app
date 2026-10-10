// HMRC sandbox "stateful" check for Making Tax Digital quarterly updates.
// HMRC's STATEFUL test scenario applies the real business rules (dates,
// order, amendments) against a test business it actually tracks, so this
// is the closest thing to live HMRC before production approval.
//
//   npm run -s hmrc-stateful -- <email of an account already linked to an HMRC sandbox test user>
//
// Creates a test self-employment (HMRC deletes it after 7 days) and an "MTD
// Mandated" status for the current tax year, then runs each case below and
// prints what HMRC said. Talks to HMRC directly (not through our routes),
// so HMRC's own rules are what's being tested.
import type { Request } from "express";
import { db } from "../src/db.js";
import { hmrcCall, HmrcApiError } from "../src/hmrc/client.js";
import { open } from "../src/hmrc/secretBox.js";
import { getTaxYearBounds } from "../src/incomeAggregation.js";
import { getTaxYearFromDate } from "../src/rulesEngine.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run -s hmrc-stateful -- <email>");
  process.exit(1);
}

// Plausible phone details for the fraud-prevention headers (the sandbox
// doesn't police them; the real ones come from the app).
const deviceHeaders: Record<string, string> = {
  "gov-client-device-id": "beec798b-b366-47fa-b1f8-92cede14a1ce",
  "gov-client-timezone": "UTC+01:00",
  "gov-client-screens": "width=1080&height=2400&scaling-factor=2.625&colour-depth=24",
  "gov-client-window-size": "width=411&height=914",
  "gov-client-user-agent": "os-family=Android&os-version=14&device-manufacturer=samsung&device-model=SM-A528B",
  "x-evolution-app-version": "stateful-check"
};
const fakeReq = { header: (name: string) => deviceHeaders[name.toLowerCase()], ip: "203.0.113.10" } as unknown as Request;

async function main(): Promise<void> {
  const user = await db.query<{ id: string; nino_enc: string | null }>(
    `SELECT u.id, c.nino_enc FROM public.users u JOIN hmrc_connections c ON c.user_id = u.id WHERE lower(u.email) = lower($1)`,
    [email]
  );
  const row = user.rows[0];
  if (!row?.nino_enc) throw new Error("That account isn't linked to HMRC with a National Insurance number yet.");
  const ctx = { userId: row.id, email };
  const nino = open(row.nino_enc);
  const taxYear = getTaxYearFromDate(new Date().toISOString().slice(0, 10));
  const { start, end } = getTaxYearBounds(taxYear);
  const call = <T>(path: string, options: Parameters<typeof hmrcCall>[3]) => hmrcCall<T>(fakeReq, ctx, path, options);

  // 1. A test business HMRC tracks, quarterly on standard (6th-to-5th) periods.
  const created = await call<{ businessId: string }>(`/individuals/self-assessment-test-support/business/${nino}`, {
    method: "POST",
    version: "1.0",
    body: {
      typeOfBusiness: "self-employment",
      tradingType: "Trade plate driving",
      tradingName: "Evolution stateful test",
      firstAccountingPeriodStartDate: start,
      firstAccountingPeriodEndDate: end,
      quarterlyTypeChoice: { quarterlyPeriodType: "standard", taxYearOfChoice: taxYear },
      accountingType: "CASH",
      commencementDate: start,
      businessAddressLineOne: "1 Test Street",
      businessAddressPostcode: "SK22 4EH",
      businessAddressCountryCode: "GB"
    }
  });
  const businessId = created.body.businessId;
  console.log(`Test business ${businessId} (deleted by HMRC after 7 days)`);

  // 2. The customer is mandated into MTD for this tax year.
  await call(`/individuals/self-assessment-test-support/itsa-status/${nino}/${taxYear}`, {
    method: "POST",
    version: "1.0",
    body: { itsaStatusDetails: [{ submittedOn: new Date().toISOString(), status: "MTD Mandated", statusReason: "Sign up - return available", businessIncome2YearsPrior: 40000 }] }
  });
  console.log(`ITSA status for ${taxYear}: MTD Mandated`);

  const update = (periodEnd: string, turnover: number, periodStart = start) =>
    call(`/individuals/business/self-employment/${nino}/${businessId}/cumulative/${taxYear}`, {
      method: "PUT",
      version: "5.0",
      testScenario: "STATEFUL",
      body: {
        periodDates: { periodStartDate: periodStart, periodEndDate: periodEnd },
        periodIncome: { turnover, other: 0 },
        periodExpenses: { carVanTravelExpenses: 171.64, adminCosts: 0, professionalFees: 0, otherExpenses: 23 }
      }
    });

  const y = Number(start.slice(0, 4));
  const cases: { name: string; expect: string; run: () => Promise<unknown> }[] = [
    { name: "Quarter 1 (to 5 July)", expect: "accepted", run: () => update(`${y}-07-05`, 1200) },
    { name: "Quarter 2 (to 5 October)", expect: "accepted", run: () => update(`${y}-10-05`, 2550.5) },
    { name: "Quarter 2 again, corrected", expect: "accepted (amendment)", run: () => update(`${y}-10-05`, 2560.5) },
    { name: "Quarter 1 after Quarter 2", expect: "refused: end date moving backwards", run: () => update(`${y}-07-05`, 1200) },
    { name: "Quarter 3 now (period not ended)", expect: "refused: too early", run: () => update(`${y + 1}-01-05`, 3000) },
    { name: "Wrong start date (1 May)", expect: "refused: start date", run: () => update(`${y}-10-05`, 2550.5, `${y}-05-01`) }
  ];

  for (const c of cases) {
    // HMRC's sandbox allows only a few requests a second per application.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const res = await c.run();
      console.log(`ACCEPTED  ${c.name}  (expected: ${c.expect})  ref ${(res as { correlationId: string | null }).correlationId ?? "-"}`);
    } catch (error) {
      if (error instanceof HmrcApiError) {
        const body = error.body as { code?: string; message?: string; errors?: { code: string }[] };
        const codes = [body?.code, ...(body?.errors ?? []).map((e) => e.code)].filter(Boolean).join(", ");
        console.log(`REFUSED   ${c.name}  (expected: ${c.expect})  ${error.status} ${codes}`);
      } else {
        throw error;
      }
    }
  }

  await call(`/individuals/self-assessment-test-support/business/${nino}/${businessId}`, { method: "DELETE", version: "1.0" }).catch(() => {});
  console.log("Test business removed.");
}

main()
  .catch((error) => {
    console.error(error instanceof HmrcApiError ? `HMRC ${error.status}: ${JSON.stringify(error.body)}` : error);
    process.exitCode = 1;
  })
  .finally(() => db.end().then(() => process.exit(process.exitCode ?? 0)));
