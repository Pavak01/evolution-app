import { apiJson, clearToken, setToken } from "./client";

// Mirrors backend/src/entitlements.ts. Optional only because a session
// restored from before this field existed may not have it until /auth/me.
export type Access = {
  tier: "trial" | "basic" | "pro" | "none";
  trial_ends_at: string | null;
  plan_ends_at: string | null; // null with an active plan = no end
  plan_source: "manual" | "promo" | "revenuecat" | null;
  can_write: boolean;
  ocr: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  // Shows Settings → Admin; the server checks independently on every admin call.
  is_admin?: boolean;
  two_factor_enabled?: boolean;
  // Absent from older servers — treated as accepted, never as a block.
  terms?: { current_version: string; accepted: boolean };
  entitlements: { ocr_upgrade_active: boolean; access?: Access };
};

// Every sign-in step answers with one of these: signed in, 2FA needed, or
// "check your email" (no session exists until the emailed code is entered).
export type LoginResult =
  | { status: "success"; user: AuthUser }
  | { status: "two_factor_required"; challengeToken: string }
  | { status: "verify_email"; verificationToken: string; email: string; codeSent: boolean; message?: string };

type AuthStepResponse = {
  token?: string;
  user?: AuthUser;
  two_factor_required?: boolean;
  challenge_token?: string;
  email_verification_required?: boolean;
  verification_token?: string;
  email?: string;
  code_sent?: boolean;
  message?: string;
};

async function toLoginResult(result: AuthStepResponse): Promise<LoginResult> {
  if (result.email_verification_required && result.verification_token) {
    return {
      status: "verify_email",
      verificationToken: result.verification_token,
      email: result.email ?? "",
      codeSent: result.code_sent ?? true,
      message: result.message
    };
  }
  if (result.two_factor_required && result.challenge_token) {
    return { status: "two_factor_required", challengeToken: result.challenge_token };
  }
  await setToken(result.token as string);
  return { status: "success", user: result.user as AuthUser };
}

export async function register(email: string, password: string, acceptedTermsVersion: string): Promise<LoginResult> {
  return toLoginResult(
    await apiJson<AuthStepResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, accepted_terms_version: acceptedTermsVersion })
    })
  );
}

export async function acceptTerms(version: string): Promise<AuthUser> {
  return (await apiJson<{ user: AuthUser }>("/auth/accept-terms", { method: "POST", body: JSON.stringify({ version }) })).user;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return toLoginResult(await apiJson<AuthStepResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
}

export async function verifyEmail(verificationToken: string, code: string): Promise<LoginResult> {
  return toLoginResult(
    await apiJson<AuthStepResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ verification_token: verificationToken, code })
    })
  );
}

export async function resendVerification(verificationToken: string): Promise<void> {
  await apiJson("/auth/resend-verification", { method: "POST", body: JSON.stringify({ verification_token: verificationToken }) });
}

// Always the same message, whether or not the email has an account.
export async function requestPasswordReset(email: string): Promise<string> {
  const result = await apiJson<{ message: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
  return result.message;
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  await apiJson("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password: newPassword })
  });
}

export async function verifyTwoFactor(challengeToken: string, code: string): Promise<AuthUser> {
  const result = await apiJson<{ token: string; user: AuthUser }>("/auth/verify-2fa", {
    method: "POST",
    body: JSON.stringify({ challenge_token: challengeToken, code })
  });
  await setToken(result.token);
  return result.user;
}

export async function fetchMe(): Promise<AuthUser> {
  const result = await apiJson<{ user: AuthUser }>("/auth/me");
  return result.user;
}

export async function logout(): Promise<void> {
  await clearToken();
}
