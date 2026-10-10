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
