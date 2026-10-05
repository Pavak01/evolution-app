import { navigationRef } from "./navigation/navigationRef";

// evolution://capture?camera=1  — straight to the camera on Log a receipt
// evolution://income            — Record income
// Used by the home-screen widget and the long-press app-icon shortcuts.
// A link that arrives before the app is ready (signed out, terms screen,
// navigator not mounted) is held and applied by flushPendingDeepLink().
let pending: string | null = null;

function route(url: string): boolean {
  // Only once the main app is on screen — not while signed out or on the
  // terms screen (their navigators have no "Main" to go to).
  if (!navigationRef.isReady() || !navigationRef.getRootState()?.routeNames?.includes("Main")) return false;
  const match = url.match(/^evolution:\/\/([^?#]*)(\?[^#]*)?/);
  if (!match) return true; // not ours — drop it
  const path = match[1].replace(/\/+$/, "");
  const camera = new URLSearchParams(match[2] ?? "").get("camera") === "1";
  if (path === "capture") {
    navigationRef.navigate("Main", { screen: "Capture", params: { screen: "CaptureForm", params: { launchCamera: camera ? Date.now() : undefined } } });
  } else if (path === "income") {
    navigationRef.navigate("Main", { screen: "Income", params: { screen: "RecordIncome" } });
  }
  return true;
}

export function handleDeepLink(url: string | null | undefined): void {
  if (!url) return;
  if (!route(url)) pending = url;
}

export function flushPendingDeepLink(): void {
  if (pending && route(pending)) pending = null;
}
