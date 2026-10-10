import type { Request } from "express";
import { db } from "../db.js";
import { hmrcBaseUrl, hmrcCredentials, hmrcEnvironment, hmrcRedirectUri } from "./config.js";
import { buildFraudHeaders, type FraudContext } from "./fraudHeaders.js";
import { open, seal } from "./secretBox.js";

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string };

export class HmrcNotConnectedError extends Error {
  constructor() {
    super("HMRC account not linked");
  }
}

export class HmrcApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`HMRC responded ${status}`);
  }
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = hmrcCredentials();
  const res = await fetch(`${hmrcBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret })
  });
  const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !body.access_token || !body.refresh_token) {
    throw new HmrcApiError(res.status, body);
  }
  return body as TokenResponse;
}

async function saveTokens(userId: string, tokens: TokenResponse): Promise<void> {
  await db.query(
    `INSERT INTO hmrc_connections (user_id, environment, access_token_enc, refresh_token_enc, access_expires_at, scope, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5), $6, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       environment = EXCLUDED.environment,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       access_expires_at = EXCLUDED.access_expires_at,
       scope = EXCLUDED.scope,
       updated_at = NOW()`,
    [userId, hmrcEnvironment, seal(tokens.access_token), seal(tokens.refresh_token), tokens.expires_in, tokens.scope ?? null]
  );
}

// Called from the OAuth callback with the one-time code HMRC sent back.
export async function exchangeAuthorizationCode(userId: string, code: string): Promise<void> {
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: hmrcRedirectUri() });
  await saveTokens(userId, tokens);
}

// A valid access token, refreshed first if it expires within a minute.
// HMRC's access tokens last 4 hours, refresh tokens 18 months; a refresh
// that HMRC rejects means the user must link again.
async function accessTokenFor(userId: string): Promise<string> {
  const result = await db.query<{ access_token_enc: string; refresh_token_enc: string; fresh: boolean; environment: string }>(
    `SELECT access_token_enc, refresh_token_enc, environment,
            (access_expires_at > NOW() + INTERVAL '60 seconds') AS fresh
     FROM hmrc_connections WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row || row.environment !== hmrcEnvironment) throw new HmrcNotConnectedError();
  if (row.fresh) return open(row.access_token_enc);

  try {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(row.refresh_token_enc) });
    await saveTokens(userId, tokens);
    return tokens.access_token;
  } catch (error) {
    if (error instanceof HmrcApiError && error.status >= 400 && error.status < 500) {
      await db.query("DELETE FROM hmrc_connections WHERE user_id = $1", [userId]);
      throw new HmrcNotConnectedError();
    }
    throw error;
  }
}

// One call to an HMRC MTD API on the user's behalf, with fraud-prevention
// headers built from the phone's request that triggered it.
export async function hmrcRequest<T>(
  req: Request,
  ctx: FraudContext,
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; version: string; body?: unknown; testScenario?: string }
): Promise<T> {
  return (await hmrcCall<T>(req, ctx, path, options)).body;
}

// As hmrcRequest, plus HMRC's X-CorrelationId — the reference HMRC asks
// for if a submission ever needs looking into, so it's kept with each one.
export async function hmrcCall<T>(
  req: Request,
  ctx: FraudContext,
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; version: string; body?: unknown; testScenario?: string }
): Promise<{ body: T; correlationId: string | null }> {
  const token = await accessTokenFor(ctx.userId);
  const headers: Record<string, string> = {
    Accept: `application/vnd.hmrc.${options.version}+json`,
    Authorization: `Bearer ${token}`,
    ...(await buildFraudHeaders(req, ctx))
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  // Sandbox only: asks HMRC's stubs for a specific canned response.
  if (options.testScenario && hmrcEnvironment === "sandbox") headers["Gov-Test-Scenario"] = options.testScenario;

  const res = await fetch(`${hmrcBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HmrcApiError(res.status, body);
  return { body: body as T, correlationId: res.headers.get("x-correlationid") };
}

// HMRC's Test Fraud Prevention Headers API: checks the headers we would
// send and lists any errors/warnings. Sandbox only, application token.
export async function validateFraudHeaders(req: Request, ctx: FraudContext): Promise<unknown> {
  const { clientId, clientSecret } = hmrcCredentials();
  const tokenRes = await fetch(`${hmrcBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret })
  });
  const { access_token: appToken } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`${hmrcBaseUrl}/test/fraud-prevention-headers/validate`, {
    headers: {
      Accept: "application/vnd.hmrc.1.0+json",
      Authorization: `Bearer ${appToken}`,
      ...(await buildFraudHeaders(req, ctx))
    }
  });
  return res.json();
}
