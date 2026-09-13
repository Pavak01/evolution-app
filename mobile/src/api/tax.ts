import { apiFetch, apiJson } from "./client";
import type { TaxSummary } from "./types";

export async function getTaxSummary(taxYear: string): Promise<TaxSummary> {
  return apiJson(`/tax-years/${taxYear}/summary`);
}

export async function fetchExportText(taxYear: string, format: "json" | "csv"): Promise<string> {
  const response = await apiFetch(`/tax-years/${taxYear}/export?format=${format}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error ?? "Export failed");
  }
  return response.text();
}
