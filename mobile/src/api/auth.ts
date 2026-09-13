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

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await apiJson<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
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
