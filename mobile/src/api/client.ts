import * as SecureStore from "expo-secure-store";

const runtimeApiBaseUrl = (process.env as Record<string, string | undefined>)?.EXPO_PUBLIC_API_BASE_URL;
export const API_BASE_URL = runtimeApiBaseUrl || "http://localhost:4000";

const TOKEN_KEY = "evolution_auth_token";

// Stored via expo-secure-store, not AsyncStorage — Qbit's mobile app stores
// its JWT in plain AsyncStorage despite a TODO claiming otherwise; this is
// one of the two concrete gaps Evolution deliberately fixes.
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export function setUnauthorizedListener(fn: UnauthorizedListener | null): void {
  unauthorizedListener = fn;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401) {
    await clearToken();
    unauthorizedListener?.();
  }

  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}
