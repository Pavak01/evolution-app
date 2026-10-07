import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// Crash and error reporting (sentry.io). Off until EXPO_PUBLIC_SENTRY_DSN is
// set, and never in development. Deliberately sends no personal data: no
// email, no IP address, no request or response bodies — just the error,
// where in the code it happened, the screen, and device/app details.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn) && !__DEV__;

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    environment: "production",
    release: `evolution@${Constants.expoConfig?.version ?? "0"}+${Constants.expoConfig?.android?.versionCode ?? "0"}`,
    tracesSampleRate: 0, // errors only, no performance tracing
    beforeBreadcrumb(breadcrumb) {
      // Network breadcrumbs keep the URL path, never bodies or query strings
      // (a query could carry a search term).
      if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
        const url = typeof breadcrumb.data?.url === "string" ? breadcrumb.data.url.split("?")[0] : undefined;
        return { ...breadcrumb, data: { method: breadcrumb.data?.method, status_code: breadcrumb.data?.status_code, url } };
      }
      // Console messages can contain anything the code logged — drop them.
      if (breadcrumb.category === "console") return null;
      return breadcrumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      return event;
    }
  });
}

export { Sentry };
