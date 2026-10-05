import { Linking } from "react-native";

const DOCS_BASE_URL = "https://pavak01.github.io/evolution-app";

// Must match CURRENT_TERMS_VERSION in backend/src/terms.ts and the
// "Version:" line in TERMS-OF-USE.md. Sent with a new sign-up's tick-box;
// if it's ever stale, the server ignores it and the app asks after sign-in.
export const TERMS_VERSION = "2026-10-05";

// GitHub Pages serves these with a 10-minute cache-control, and phone
// browsers cache on top of that — a query param that changes on every tap
// forces a fresh fetch instead of showing a stale page from an earlier visit.
export function openDoc(path: "USER-GUIDE.html" | "FAQ.html" | "PRIVACY-POLICY.html" | "TERMS-OF-USE.html"): void {
  void Linking.openURL(`${DOCS_BASE_URL}/${path}?v=${Date.now()}`);
}
