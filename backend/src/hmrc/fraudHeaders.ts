import type { Request } from "express";
import { serverVersion, vendorProductName } from "./config.js";

// HMRC fraud-prevention headers, a legal requirement on every MTD call.
// Connection method MOBILE_APP_VIA_SERVER: the phone collects what only it
// can know (device, screen, local IPs, timezone, OS) and sends it to us as
// Gov-Client-* headers on the request; the server adds what it observes
// (public IP and port, user, vendor details). Spec:
// developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/mobile-app-via-server/

// Forwarded unchanged from the phone (validated loosely: HMRC's test API
// is the real check, and a malformed value must reach it to be reported).
const DEVICE_HEADERS = [
  "Gov-Client-Device-ID",
  "Gov-Client-Local-IPs",
  "Gov-Client-Local-IPs-Timestamp",
  "Gov-Client-Screens",
  "Gov-Client-Window-Size",
  "Gov-Client-Timezone",
  "Gov-Client-User-Agent"
] as const;

const enc = encodeURIComponent;

let vendorPublicIp: string | null = null;
let vendorIpFetchedAt = 0;

// Our server's own public IP (Gov-Vendor-Public-IP), looked up and cached
// for an hour — Railway's outbound address can change between deploys.
async function getVendorPublicIp(): Promise<string | null> {
  if (vendorPublicIp && Date.now() - vendorIpFetchedAt < 60 * 60 * 1000) return vendorPublicIp;
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      vendorPublicIp = (await res.text()).trim();
      vendorIpFetchedAt = Date.now();
    }
  } catch {
    // Keep any older value; the header is omitted if we never got one.
  }
  return vendorPublicIp;
}

function stripIpv6Prefix(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export type FraudContext = {
  userId: string;
  email: string;
  // Set when the session was opened with a 2FA code (see the login flow).
  multiFactor?: { type: "TOTP" | "AUTH_CODE" | "OTHER"; timestamp: string; reference: string }[];
};

export async function buildFraudHeaders(req: Request, ctx: FraudContext): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "MOBILE_APP_VIA_SERVER"
  };

  for (const name of DEVICE_HEADERS) {
    const value = req.header(name);
    if (value) headers[name] = value;
  }

  // `trust proxy` (index.ts) makes req.ip the phone's address as Railway
  // saw it, not the proxy's.
  const clientIp = req.ip ? stripIpv6Prefix(req.ip) : null;
  if (clientIp) {
    headers["Gov-Client-Public-IP"] = clientIp;
    headers["Gov-Client-Public-IP-Timestamp"] = new Date().toISOString();
  }
  // Gov-Client-Public-Port: the phone's source port as seen at Railway's
  // edge. req.socket.remotePort would be the proxy's port, which HMRC treats
  // as wrong data, so it's only sent if the edge passes the real one on.
  const clientPort = Number(req.header("x-real-port") ?? req.header("x-client-port"));
  if (Number.isInteger(clientPort) && clientPort > 0 && clientPort <= 65535 && clientPort !== 80 && clientPort !== 443) {
    headers["Gov-Client-Public-Port"] = String(clientPort);
  }

  headers["Gov-Client-User-IDs"] = `evolution=${enc(ctx.userId)}&email=${enc(ctx.email)}`;
  if (ctx.multiFactor?.length) {
    headers["Gov-Client-Multi-Factor"] = ctx.multiFactor
      .map((f) => `type=${enc(f.type)}&timestamp=${enc(f.timestamp)}&unique-reference=${enc(f.reference)}`)
      .join(",");
  }

  const vendorIp = await getVendorPublicIp();
  if (vendorIp) {
    headers["Gov-Vendor-Public-IP"] = vendorIp;
    if (clientIp) headers["Gov-Vendor-Forwarded"] = `by=${enc(vendorIp)}&for=${enc(clientIp)}`;
  }
  headers["Gov-Vendor-Product-Name"] = enc(vendorProductName);
  const appVersion = req.header("x-evolution-app-version") ?? "unknown";
  headers["Gov-Vendor-Version"] = `evolution-android=${enc(appVersion)}&evolution-server=${enc(serverVersion)}`;

  return headers;
}
