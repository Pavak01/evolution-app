import { apiJson } from "./client";

export type TaxYearLockStatus = {
  locked: boolean;
  locked_at: string | null;
  archive_download_url: string | null;
};

export async function getTaxYearLockStatus(taxYear: string): Promise<TaxYearLockStatus> {
  return apiJson(`/tax-years/${taxYear}/lock-status`);
}

export async function lockTaxYear(taxYear: string): Promise<{ locked: true; locked_at: string }> {
  return apiJson(`/tax-years/${taxYear}/lock`, { method: "POST" });
}

export async function unlockTaxYear(taxYear: string): Promise<{ unlocked: true }> {
  return apiJson(`/tax-years/${taxYear}/unlock`, { method: "POST" });
}
