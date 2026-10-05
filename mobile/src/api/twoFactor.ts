import { apiJson } from "./client";

export async function startTwoFactorSetup(): Promise<{ secret: string; otpauth_url: string }> {
  return apiJson("/auth/2fa/setup", { method: "POST", body: "{}" });
}

export async function enableTwoFactor(code: string): Promise<string[]> {
  return (await apiJson<{ backup_codes: string[] }>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) })).backup_codes;
}

export async function disableTwoFactor(password: string, code: string): Promise<void> {
  await apiJson("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
}

export async function newBackupCodes(code: string): Promise<string[]> {
  return (await apiJson<{ backup_codes: string[] }>("/auth/2fa/backup-codes", { method: "POST", body: JSON.stringify({ code }) })).backup_codes;
}
