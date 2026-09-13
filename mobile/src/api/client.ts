// Used only for its dedicated native uploadAsync (see postMultipart below) —
// a mature, native multipart implementation (OkHttp/URLSession), not the
// brand-new JS-level fetch/FormData polyfill that proved unreliable for
// local files across several different failure modes on device.
import * as LegacyFileSystem from "expo-file-system/legacy";
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

// A local file attached here went through three failed approaches in a row
// on native: RN's classic {uri,name,type} FormData convention (Expo's fetch
// polyfill rejects it — "Unsupported FormDataPart implementation"),
// fetch(uri).then(r=>r.blob()) (silently corrupted the bytes via a base64
// round trip through RN's native blob store), and reading raw bytes via
// expo-file-system's File.bytes() / legacy readAsStringAsync (both hit
// permission/IOException errors on different URI schemes). All three routed
// the file through Expo's JS-level fetch/FormData polyfill one way or
// another. This bypasses that layer entirely for the file itself: on
// native, expo-file-system's uploadAsync streams the file straight from
// disk via native code (OkHttp/URLSession) alongside the other fields as
// multipart parameters, the same mature path used for years by apps that
// predate this polyfill. Web has no such native module, so it keeps using
// the ordinary FormData+fetch path, which already works fine there.
export async function postMultipart<T>(path: string, fields: Record<string, string>, file?: MultipartFile): Promise<T> {
  if (file && !isWeb) {
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

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  if (file) {
    const blob = await fetch(file.uri).then((r) => r.blob());
    // The ambient FormData type in scope (no "DOM" lib) only declares the
    // 2-arg append signature; the 3-arg (name, blob, filename) form is
    // standard and is what Expo's FormData patch expects.
    (form.append as (name: string, value: Blob, fileName: string) => void)(file.fieldName, blob, file.name);
  }
  return apiJson<T>(path, { method: "POST", body: form });
}
