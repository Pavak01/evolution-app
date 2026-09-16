// Used only for its dedicated native uploadAsync (see postMultipart below) —
// a mature, native multipart implementation (OkHttp/URLSession), not the
// brand-new JS-level fetch/FormData polyfill that proved unreliable for
// local files across several different failure modes on device.
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Must be the plain `process.env.EXPO_PUBLIC_*` form for Expo's babel plugin
// to statically inline it into production/EAS builds — a type-cast or
// optional-chained access here silently defeats that inlining, so the
// build falls back to localhost at runtime with no error (only caught by
// actually inspecting a built bundle; it works fine in dev, where Metro's
// dev server provides a live process.env instead of relying on inlining).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

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

type MultipartFile = { uri: string; name: string; type: string; fieldName: string };

// Camera captures (expo-image-picker) return a real file:// URI in the
// app's own cache — expo-file-system's native uploadAsync (OkHttp/
// URLSession) streams those straight from disk, bypassing Expo's JS-level
// fetch/FormData polyfill entirely (see the git history on this function
// for the three ways that polyfill failed on file:// uploads). But
// uploadAsync cannot handle a content:// URI at all — it tries to treat
// the URI's opaque path segment as a literal filesystem path and throws
// ("Directory for '/document/image:...' doesn't exist"). content:// is
// what expo-document-picker hands back for an arbitrary picked file;
// useReceiptCapture.ts moved off that picker entirely (to
// expo-image-picker's library picker, which returns file:// like camera
// capture does) once it became clear no available API could reliably
// read a content:// URI here — see that file for the full story. This
// branch stays for any future caller that legitimately has one.
async function uploadFileViaNativeTask<T>(path: string, fields: Record<string, string>, file: MultipartFile): Promise<T> {
  const token = await getToken();
  const result = await LegacyFileSystem.uploadAsync(`${API_BASE_URL}${path}`, file.uri, {
    httpMethod: "POST",
    uploadType: LegacyFileSystem.FileSystemUploadType.MULTIPART,
    fieldName: file.fieldName,
    mimeType: file.type,
    parameters: fields,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  let payload: unknown = {};
  try {
    payload = result.body ? JSON.parse(result.body) : {};
  } catch {
    // Non-JSON body (e.g. an HTML error page) — payload stays {}, message falls through below.
  }

  if (result.status === 401) {
    await clearToken();
    unauthorizedListener?.();
  }

  if (result.status < 200 || result.status >= 300) {
    const message = (payload as { error?: string }).error ?? `Request failed with status ${result.status}`;
    throw new ApiError(result.status, message);
  }

  return payload as T;
}

// A content:// source can't go through uploadAsync (see above). Nothing
// available in this app reliably reads content:// bytes on Android either
// (expo-file-system's readAsStringAsync explicitly rejects the scheme),
// so this path is currently only exercised on web. Kept as base64-decode
// rather than deleted since it is the one approach that was proven correct
// (byte-exact against every padding case) for whichever caller eventually
// has a working content:// reader again.
async function uploadFileViaFormData<T>(path: string, fields: Record<string, string>, file: MultipartFile): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  if (isWeb) {
    const blob = await fetch(file.uri).then((r) => r.blob());
    (form.append as (name: string, value: Blob, fileName: string) => void)(file.fieldName, blob, file.name);
  } else {
    const base64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
    const bytes = base64ToUint8Array(base64);
    const part = { name: file.name, type: file.type, bytes: async () => bytes };
    form.append(file.fieldName, part as unknown as Blob);
  }

  return apiJson<T>(path, { method: "POST", body: form });
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToUint8Array(base64: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const value = BASE64_CHARS.indexOf(base64[i]);
    if (value === -1) continue; // skip padding ('=') and whitespace
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export async function postMultipart<T>(path: string, fields: Record<string, string>, file?: MultipartFile): Promise<T> {
  if (!file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    return apiJson<T>(path, { method: "POST", body: form });
  }

  if (!isWeb && file.uri.startsWith("file://")) {
    return uploadFileViaNativeTask<T>(path, fields, file);
  }

  return uploadFileViaFormData<T>(path, fields, file);
}
