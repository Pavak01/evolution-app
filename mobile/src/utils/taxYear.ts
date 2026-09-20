// Mirrors backend/src/rulesEngine.ts getTaxYearFromDate (UK tax year, April 6
// boundary) — a small, deliberate duplication so the mobile app can default
// form fields to the current tax year without a network round trip.
export function getTaxYearFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const startsNewTaxYear = month > 4 || (month === 4 && day >= 6);
  const startYear = startsNewTaxYear ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// A UK tax year's Self Assessment return is due 31 January following its
// end (e.g. "2025-26", ending 5 April 2026, is due 31 Jan 2027), and HMRC
// allows amending a filed return up to 12 months after that deadline — so
// "2025-26" receipts remain claimable until 31 Jan 2028. Used only to warn
// (never to block a save) when a legacy-imported receipt lands in a year
// that's likely already closed.
export function isTaxYearStillClaimable(taxYear: string, asOf: Date = new Date()): boolean {
  const startYear = Number(taxYear.slice(0, 4));
  const amendmentDeadline = new Date(startYear + 3, 0, 31, 23, 59, 59);
  return asOf.getTime() <= amendmentDeadline.getTime();
}
