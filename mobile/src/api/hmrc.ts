import { hmrcDeviceHeaders } from "../hmrc/fraudHeaders";
import { apiJson } from "./client";

// Making Tax Digital — the user's link to their HMRC account. Every call
// carries the phone's fraud-prevention headers, since any of them can lead
// to a call to HMRC.
export type HmrcStatus = {
  connected: boolean;
  environment: "sandbox" | "production";
  connected_at: string | null;
  has_nino: boolean;
};

export type HmrcBusiness = {
  typeOfBusiness: string;
  businessId: string;
  tradingName?: string;
  tradingType?: string;
};

async function hmrcJson<T>(path: string, init?: RequestInit): Promise<T> {
  return apiJson<T>(path, { ...init, headers: { ...(await hmrcDeviceHeaders()), ...((init?.headers as Record<string, string>) ?? {}) } });
}

export function getHmrcStatus(): Promise<HmrcStatus> {
  return hmrcJson("/hmrc/status");
}

export function startHmrcLink(returnUrl: string): Promise<{ authorize_url: string }> {
  return hmrcJson("/hmrc/connect", { method: "POST", body: JSON.stringify({ return_url: returnUrl }) });
}

export function disconnectHmrc(): Promise<{ connected: false }> {
  return hmrcJson("/hmrc/disconnect", { method: "POST" });
}

export function saveNino(nino: string): Promise<{ has_nino: true }> {
  return hmrcJson("/hmrc/nino", { method: "PUT", body: JSON.stringify({ nino }) });
}

export async function listHmrcBusinesses(): Promise<HmrcBusiness[]> {
  const result = await hmrcJson<{ listOfBusinesses?: HmrcBusiness[] }>("/hmrc/businesses");
  return result.listOfBusinesses ?? [];
}

export function checkFraudHeaders(): Promise<{ code?: string; errors?: { code: string; headers: string[] }[]; warnings?: { headers: string[] }[] }> {
  return hmrcJson("/hmrc/fraud-headers/check", { method: "POST" });
}

export type HmrcObligation = {
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  receivedDate?: string;
  status: "open" | "fulfilled";
};

export type QuarterlyTotals = {
  tax_year: string;
  period_start: string;
  period_end: string;
  turnover: number;
  expenses: { carVanTravelExpenses: number; adminCosts: number; professionalFees: number; otherExpenses: number };
  total_expenses: number;
  income_count: number;
  expense_count: number;
  awaiting_receipt_count: number;
  awaiting_receipt_amount: number;
};

export type HmrcSubmission = {
  id: string;
  tax_year: string;
  period_start: string;
  period_end: string;
  correlation_id: string | null;
  submitted_at: string;
};

export async function getObligations(): Promise<HmrcObligation[]> {
  return (await hmrcJson<{ obligations: HmrcObligation[] }>("/hmrc/obligations")).obligations;
}

export function getQuarterlyPreview(periodStart: string, periodEnd: string): Promise<QuarterlyTotals> {
  return hmrcJson(`/hmrc/quarterly-preview?period_start=${periodStart}&period_end=${periodEnd}`);
}

export function sendQuarterlyUpdate(
  periodStart: string,
  periodEnd: string
): Promise<{ submitted: true; correlation_id: string | null; submitted_at: string; totals: QuarterlyTotals }> {
  return hmrcJson("/hmrc/quarterly-update", { method: "POST", body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }) });
}

export async function listSubmissions(): Promise<HmrcSubmission[]> {
  return (await hmrcJson<{ submissions: HmrcSubmission[] }>("/hmrc/submissions")).submissions;
}

export type HmrcCalculation =
  | { status: "none" | "pending" }
  | {
      status: "ready";
      tax_year: string;
      calculated_at: string | null;
      period_to: string | null;
      profit: number | null;
      income_tax: number | null;
      class2_nic: number | null;
      class4_nic: number | null;
      total_due: number | null;
      end_of_year: { estimated_income: number | null; income_tax: number | null; nics: number | null; total: number } | null;
      messages: string[];
    };

export function getHmrcCalculation(): Promise<HmrcCalculation> {
  return hmrcJson("/hmrc/calculation");
}

export type YearEndEligibility = {
  only_self_employment_income: boolean;
  no_student_loan: boolean;
  no_pension_or_gift_aid_claims: boolean;
  no_child_benefit_charge: boolean;
  uk_resident: boolean;
};

export type YearEndStatus = {
  tax_year: string;
  year_ended: boolean;
  declaration: { version: string; text: string };
  record: { calculation_id: string; declaration_version: string | null; submitted_at: string | null; correlation_id: string | null } | null;
};

export type FinalCalculation =
  | { status: "none" | "pending" }
  | (Extract<HmrcCalculation, { status: "ready" }> & { calculation_id: string | null; errors: string[] });

export function getYearEnd(taxYear: string): Promise<YearEndStatus> {
  return hmrcJson(`/hmrc/year-end?tax_year=${taxYear}`);
}

export function startFinalCalculation(taxYear: string, eligibility: YearEndEligibility): Promise<{ calculation_id: string }> {
  return hmrcJson("/hmrc/year-end/calculate", { method: "POST", body: JSON.stringify({ tax_year: taxYear, eligibility }) });
}

export function getFinalCalculation(taxYear: string): Promise<FinalCalculation> {
  return hmrcJson(`/hmrc/year-end/calculation?tax_year=${taxYear}`);
}

export function submitTaxReturn(
  taxYear: string,
  calculationId: string,
  declarationVersion: string
): Promise<{ submitted: true; submitted_at: string; correlation_id: string | null }> {
  return hmrcJson("/hmrc/year-end/submit", {
    method: "POST",
    body: JSON.stringify({ tax_year: taxYear, calculation_id: calculationId, declaration_accepted: true, declaration_version: declarationVersion })
  });
}
