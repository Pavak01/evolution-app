import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const runtimeApiBaseUrl = (process.env as Record<string, string | undefined>)?.EXPO_PUBLIC_API_BASE_URL;
export const API_BASE_URL = runtimeApiBaseUrl || "http://localhost:4000";

const TOKEN_KEY = "evolution_auth_token";

// Stored via expo-secure-store, not AsyncStorage — Qbit's mobile app stores
// its JWT in plain AsyncStorage despite a TODO claiming otherwise; this is
// one of the two concrete gaps Evolution deliberately fixes. expo-secure-store
// has no web implementation at all (calling it throws, not just no-ops), so
// this falls back to localStorage on web rather than crashing on load — the
// app targets iOS/Android, but a hard crash on an unsupported platform is
// still a bug, not an acceptable gap.
const isWeb = Platform.OS === "web";

type WebStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
function getWebStorage(): WebStorage | undefined {
  return (globalThis as { localStorage?: WebStorage }).localStorage;
}

export async function getToken(): Promise<string | null> {
  if (isWeb) {
    return getWebStorage()?.getItem(TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isWeb) {
    getWebStorage()?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    getWebStorage()?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// React Native's classic FormData accepted a {uri,name,type} object for file
// parts (Qbit, on SDK 52, relies on exactly this). Expo SDK 53+ installs its
// own global fetch (expo/src/winter/fetch), which patches FormData.entries()
// and, per its own convertFormData.ts, only accepts a string, a real Blob
// (`entry instanceof Blob`), or an object with a `.bytes()` method — the old
// {uri,name,type} shape now throws "Unsupported FormDataPart implementation".
export async function appendFilePart(
  form: FormData,
  fieldName: string,
  file: { uri: string; name: string; type: string }
): Promise<void> {
  if (isWeb) {
    const blob = await fetch(file.uri).then((r) => r.blob());
    // The ambient FormData type in scope (no "DOM" lib) only declares the
    // 2-arg append signature; the 3-arg (name, blob, filename) form is
    // standard and is what Expo's FormData patch expects.
    (form.append as (name: string, value: Blob, fileName: string) => void)(fieldName, blob, file.name);
    return;
  }

  // Native: Expo's fetch()/Response.blob() round-trips the file through
  // React Native's native blob store via base64 (it logs its own warning
  // about this), which was silently corrupting camera photos — the backend's
  // magic-byte check then correctly rejected the corrupted bytes. Reading
  // bytes directly via expo-file-system's File avoids that path entirely.
  // The resulting plain object isn't a real Blob, but it satisfies exactly
  // what convertFormData.ts checks for — a name/type for headers and a
  // .bytes() method for content — per its own comment: "File or ExpoBlob
  // don't extend Blob but implement the interface."
  const bytes = await new File(file.uri).bytes();
  const part = { name: file.name, type: file.type, bytes: async () => bytes };
  form.append(fieldName, part as unknown as Blob);
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
