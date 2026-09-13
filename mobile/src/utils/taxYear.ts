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
