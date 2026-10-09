// Making Tax Digital for Income Tax: which HMRC environment we talk to and
// with which credentials. Sandbox until HMRC grants production access (the
// 2027-28 market window); HMRC_ENV=production switches every call over.
export type HmrcEnvironment = "sandbox" | "production";

export const hmrcEnvironment: HmrcEnvironment = process.env.HMRC_ENV === "production" ? "production" : "sandbox";

export const hmrcBaseUrl =
  hmrcEnvironment === "production" ? "https://api.service.hmrc.gov.uk" : "https://test-api.service.hmrc.gov.uk";

// Read-only of the user's SA data plus permission to send updates.
export const hmrcScopes = "read:self-assessment write:self-assessment";

export function hmrcCredentials(): { clientId: string; clientSecret: string } {
  const prefix = hmrcEnvironment === "production" ? "HMRC_PRODUCTION" : "HMRC_SANDBOX";
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET are required for HMRC calls`);
  }
  return { clientId, clientSecret };
}

// Must exactly match one of the redirect URIs registered on the HMRC
// Developer Hub application.
export function hmrcRedirectUri(): string {
  return (
    process.env.HMRC_REDIRECT_URI?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "https://evolution-backend-production.up.railway.app/hmrc/callback"
      : "http://localhost:4000/hmrc/callback")
  );
}

// Gov-Vendor-Version / Gov-Vendor-Product-Name.
export const vendorProductName = "Evolution";
export const serverVersion = process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) || "dev";
