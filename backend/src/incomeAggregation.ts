export type InvoicePeriod = { period_start: string; period_end: string }; // "YYYY-MM-DD"

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// A UK tax year is 365 or 366 days; 53 is the hard ceiling for weeks logged,
// never 52 by construction.
const MAX_WEEKS_PER_TAX_YEAR = 53;

export function getTaxYearBounds(taxYear: string): { start: string; end: string } {
  const match = /^(\d{4})-\d{2}$/.exec(taxYear);
  if (!match) {
    throw new Error(`Invalid tax year ${taxYear}`);
  }

  const startYear = Number(match[1]);
  return { start: `${startYear}-04-06`, end: `${startYear + 1}-04-05` };
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = Date.UTC(...isoParts(startIso));
  const end = Date.UTC(...isoParts(endIso));
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

function addOneDay(iso: string): string {
  const [y, m, d] = isoParts(iso);
  const next = new Date(Date.UTC(y, m, d + 1));
  return next.toISOString().slice(0, 10);
}

// Qbit derives its NI Class 2 "weeksLogged" figure trivially — one
// weekly_entries row per calendar week. Evolution has no such row; income
// arrives as arbitrary-length invoice periods, so this derives an equivalent
// figure from those periods instead.
//
// Callers MUST fetch invoices by period overlap with the tax year
// (period_start <= taxYearEnd AND period_end >= taxYearStart), not by the
// `tax_year` column — filtering by that column would silently drop the
// portion of a straddling invoice that belongs to the *other* tax year.
export function computeWeeksLoggedFromInvoices(
  invoices: InvoicePeriod[],
  taxYear: string,
  asOfDate: string = new Date().toISOString().slice(0, 10)
): number {
  const { start: taxYearStart, end: taxYearEnd } = getTaxYearBounds(taxYear);
  const effectiveEnd = asOfDate < taxYearEnd ? asOfDate : taxYearEnd;

  // Clip every invoice's trading period to [taxYearStart, effectiveEnd].
  // Clipping to `effectiveEnd` (not just taxYearEnd) stops a single invoice
  // covering the whole year from instantly claiming 52-53 weeks logged
  // before those weeks have actually occurred.
  const clipped = invoices
    .map((inv) => ({
      start: inv.period_start > taxYearStart ? inv.period_start : taxYearStart,
      end: inv.period_end < effectiveEnd ? inv.period_end : effectiveEnd
    }))
    .filter((p) => p.start <= p.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  // Overlapping/duplicate periods are not rejected at write time (two
  // clients invoicing the same week is legitimate) — merge them here so the
  // flat NI Class 2 charge never double-counts a week.
  const merged: { start: string; end: string }[] = [];
  for (const period of clipped) {
    const last = merged[merged.length - 1];
    if (last && period.start <= addOneDay(last.end)) {
      if (period.end > last.end) {
        last.end = period.end;
      }
    } else {
      merged.push({ ...period });
    }
  }

  const totalDays = merged.reduce((sum, p) => sum + daysBetweenInclusive(p.start, p.end), 0);

  // Round up: a partial week of trading still counts as a full week for the
  // flat NI Class 2 charge — the conservative, over- rather than
  // under-provisioning direction.
  return Math.min(Math.ceil(totalDays / 7), MAX_WEEKS_PER_TAX_YEAR);
}
