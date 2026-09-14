import { apiJson, clearToken, setToken } from "./client";

export type AuthUser = { id: string; email: string };

export async function register(email: string, password: string): Promise<AuthUser> {
  const result = await apiJson<{ token: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await setToken(result.token);
  return result.user;
}

export type LoginResult = { status: "success"; user: AuthUser } | { status: "two_factor_required"; challengeToken: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await apiJson<{ token?: string; user: AuthUser; two_factor_required?: boolean; challenge_token?: string }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) }
  );

  if (result.two_factor_required && result.challenge_token) {
    return { status: "two_factor_required", challengeToken: result.challenge_token };
  }

  await setToken(result.token as string);
  return { status: "success", user: result.user };
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
