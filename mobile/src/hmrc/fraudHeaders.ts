import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { Dimensions, PixelRatio, Platform } from "react-native";

// The phone's part of HMRC's fraud-prevention headers (Making Tax Digital,
// connection method MOBILE_APP_VIA_SERVER): what only the device knows.
// Sent on every request that leads to an HMRC call; the server adds the
// rest (backend/src/hmrc/fraudHeaders.ts). Spec:
// developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/mobile-app-via-server/

const DEVICE_ID_KEY = "evolution_hmrc_device_id";
const enc = encodeURIComponent;

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Generated once and kept (HMRC: must not expire; regenerate only if lost).
async function deviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = uuid();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return uuid();
  }
}

// "UTC+01:00" from the phone's current offset (BST in summer).
function timezone(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

// IPv6 values are percent-encoded, commas between values are not.
function encodeIp(ip: string): string {
  return ip.includes(":") ? enc(ip) : ip;
}

export async function hmrcDeviceHeaders(): Promise<Record<string, string>> {
  const screen = Dimensions.get("screen");
  const window = Dimensions.get("window");
  const scale = PixelRatio.get();
  const headers: Record<string, string> = {
    "Gov-Client-Device-ID": await deviceId(),
    "Gov-Client-Timezone": timezone(),
    // Physical pixels, as HMRC asks for the screen; the window in the
    // layout units the app actually draws with.
    "Gov-Client-Screens": `width=${Math.round(screen.width * scale)}&height=${Math.round(screen.height * scale)}&scaling-factor=${scale}&colour-depth=24`,
    "Gov-Client-Window-Size": `width=${Math.round(window.width)}&height=${Math.round(window.height)}`,
    "Gov-Client-User-Agent": [
      `os-family=${enc(Platform.OS === "ios" ? "iOS" : "Android")}`,
      `os-version=${enc(Device.osVersion ?? String(Platform.Version))}`,
      `device-manufacturer=${enc(Device.manufacturer ?? "unknown")}`,
      `device-model=${enc(Device.modelName ?? "unknown")}`
    ].join("&"),
    "X-Evolution-App-Version": `${Constants.expoConfig?.version ?? "1.0.0"}+${Constants.expoConfig?.android?.versionCode ?? "dev"}`
  };
  try {
    // Collected immediately before the request, as HMRC requires.
    const ip = await Network.getIpAddressAsync();
    if (ip && ip !== "0.0.0.0") {
      headers["Gov-Client-Local-IPs"] = encodeIp(ip);
      headers["Gov-Client-Local-IPs-Timestamp"] = new Date().toISOString();
    }
  } catch {
    // No network interface available; the header is simply omitted.
  }
  return headers;
}
