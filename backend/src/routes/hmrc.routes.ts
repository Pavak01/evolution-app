import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { hmrcBaseUrl, hmrcCredentials, hmrcEnvironment, hmrcRedirectUri, hmrcScopes } from "../hmrc/config.js";
import { exchangeAuthorizationCode, hmrcCall, hmrcRequest, HmrcApiError, HmrcNotConnectedError, validateFraudHeaders } from "../hmrc/client.js";
import { buildQuarterlyTotals, cumulativeSummaryBody } from "../hmrc/quarterly.js";
import { getTaxYearBounds } from "../incomeAggregation.js";
import { getTaxYearFromDate } from "../rulesEngine.js";
import type { FraudContext } from "../hmrc/fraudHeaders.js";
import { open, seal } from "../hmrc/secretBox.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { sendError } from "../middleware/errorHandler.js";

// Making Tax Digital for Income Tax — linking the user's HMRC account
// (OAuth through their Government Gateway sign-in) and the calls made on
// their behalf. Sandbox until production approval; see hmrc/config.ts.
export const hmrcRouter = Router();

// Where the browser is sent once HMRC's sign-in finishes: the app's own
// deep link (evolution://… in a build, exp://… in Expo Go). Nothing else.
const returnUrlPattern = /^(evolution|exp|exps):\/\/[^\s]+$/;
const ninoPattern = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/;

async function fraudContext(req: Request): Promise<FraudContext> {
  const userId = (req as AuthenticatedRequest).userId;
  const user = await db.query<{ email: string }>("SELECT email FROM public.users WHERE id = $1", [userId]);
  return { userId, email: user.rows[0]?.email ?? "" };
}

async function ninoFor(userId: string): Promise<string | null> {
  const result = await db.query<{ nino_enc: string | null }>("SELECT nino_enc FROM hmrc_connections WHERE user_id = $1", [userId]);
  const sealed = result.rows[0]?.nino_enc;
  return sealed ? open(sealed) : null;
}

function sendHmrcError(res: Response, error: unknown, action: string): Response {
  if (error instanceof HmrcNotConnectedError) {
    return res.status(409).json({ error: "Link your HMRC account first.", code: "HMRC_NOT_CONNECTED" });
  }
  if (error instanceof HmrcApiError) {
    const body = error.body as { code?: string; message?: string } | null;
    return res.status(502).json({ error: `HMRC couldn't ${action}: ${body?.message ?? `status ${error.status}`}`, hmrc_status: error.status, hmrc_code: body?.code ?? null });
  }
  return sendError(res, 500, `Failed to ${action}`, error);
}

hmrcRouter.post("/hmrc/connect", requireAuth, async (req: Request, res: Response) => {
  const parsed = z.object({ return_url: z.string().regex(returnUrlPattern) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid return_url" });

  try {
    const { clientId } = hmrcCredentials();
    const state = crypto.randomBytes(32).toString("base64url");
    await db.query("DELETE FROM hmrc_oauth_states WHERE created_at < NOW() - INTERVAL '1 hour'");
    await db.query("INSERT INTO hmrc_oauth_states (state, user_id, return_url) VALUES ($1, $2, $3)", [
      state,
      (req as AuthenticatedRequest).userId,
      parsed.data.return_url
    ]);
    const url = new URL(`${hmrcBaseUrl}/oauth/authorize`);
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId, scope: hmrcScopes, redirect_uri: hmrcRedirectUri(), state }).toString();
    return res.json({ authorize_url: url.toString(), environment: hmrcEnvironment });
  } catch (error) {
    return sendError(res, 500, "Failed to start HMRC linking", error);
  }
});

// HMRC redirects the user's browser here. No bearer token (it's a browser
// redirect): the one-time `state` identifies who started it and where to
// send them back, and expires after 10 minutes.
hmrcRouter.get("/hmrc/callback", async (req: Request, res: Response) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  let row: { user_id: string; return_url: string } | undefined;
  try {
    const found = await db.query<{ user_id: string; return_url: string }>(
      "DELETE FROM hmrc_oauth_states WHERE state = $1 AND created_at > NOW() - INTERVAL '10 minutes' RETURNING user_id, return_url",
      [state]
    );
    row = found.rows[0];
  } catch (error) {
    return sendError(res, 500, "Failed to finish HMRC linking", error);
  }
  if (!row) {
    return res.status(400).type("html").send("<p>This HMRC link has expired. Go back to Evolution and try again.</p>");
  }
  const back = (status: string) => res.redirect(302, `${row.return_url}${row.return_url.includes("?") ? "&" : "?"}status=${status}`);

  if (typeof req.query.error === "string") {
    // e.g. access_denied when the user chose not to grant access.
    return back(req.query.error === "access_denied" ? "denied" : "error");
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) return back("error");
  try {
    await exchangeAuthorizationCode(row.user_id, code);
    return back("connected");
  } catch (error) {
    console.error("HMRC code exchange failed", error);
    return back("error");
  }
});

hmrcRouter.get("/hmrc/status", requireAuth, async (req: Request, res: Response) => {
  const result = await db.query<{ environment: string; connected_at: string; has_nino: boolean }>(
    "SELECT environment, connected_at::text, (nino_enc IS NOT NULL) AS has_nino FROM hmrc_connections WHERE user_id = $1",
    [(req as AuthenticatedRequest).userId]
  );
  const row = result.rows[0];
  return res.json({
    connected: Boolean(row && row.environment === hmrcEnvironment),
    environment: hmrcEnvironment,
    connected_at: row?.connected_at ?? null,
    has_nino: row?.has_nino ?? false
  });
});

hmrcRouter.post("/hmrc/disconnect", requireAuth, async (req: Request, res: Response) => {
  await db.query("DELETE FROM hmrc_connections WHERE user_id = $1", [(req as AuthenticatedRequest).userId]);
  return res.json({ connected: false });
});

// The National Insurance number HMRC's MTD APIs are addressed by. HMRC's
// sign-in doesn't share it, so the user enters it once; stored encrypted.
hmrcRouter.put("/hmrc/nino", requireAuth, async (req: Request, res: Response) => {
  const nino = String(req.body?.nino ?? "").replace(/\s+/g, "").toUpperCase();
  if (!ninoPattern.test(nino)) return res.status(400).json({ error: "That doesn't look like a National Insurance number (e.g. QQ 12 34 56 C)." });
  const result = await db.query("UPDATE hmrc_connections SET nino_enc = $2, updated_at = NOW() WHERE user_id = $1", [
    (req as AuthenticatedRequest).userId,
    seal(nino)
  ]);
  if (result.rowCount === 0) return res.status(409).json({ error: "Link your HMRC account first.", code: "HMRC_NOT_CONNECTED" });
  return res.json({ has_nino: true });
});

// The user's income sources as HMRC knows them (Business Details API) —
// first proof the link works, and where the self-employment ID comes from.
hmrcRouter.get("/hmrc/businesses", requireAuth, async (req: Request, res: Response) => {
  try {
    const ctx = await fraudContext(req);
    const nino = await ninoFor(ctx.userId);
    if (!nino) return res.status(409).json({ error: "Add your National Insurance number first.", code: "HMRC_NINO_REQUIRED" });
    const body = await hmrcRequest<{ listOfBusinesses?: { typeOfBusiness: string; businessId: string }[] }>(
      req,
      ctx,
      `/individuals/business/details/${nino}/list`,
      { version: "2.0" }
    );
    // Quarterly updates go to the user's self-employment; remember it.
    const selfEmployment = body.listOfBusinesses?.find((b) => b.typeOfBusiness === "self-employment");
    if (selfEmployment) {
      await db.query("UPDATE hmrc_connections SET business_id = $2, updated_at = NOW() WHERE user_id = $1", [ctx.userId, selfEmployment.businessId]);
    }
    return res.json(body);
  } catch (error) {
    return sendHmrcError(res, error, "list your businesses");
  }
});

async function quarterlyTarget(userId: string): Promise<{ nino: string; businessId: string } | { error: string; code: string }> {
  const result = await db.query<{ nino_enc: string | null; business_id: string | null }>(
    "SELECT nino_enc, business_id FROM hmrc_connections WHERE user_id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row) return { error: "Link your HMRC account first.", code: "HMRC_NOT_CONNECTED" };
  if (!row.nino_enc) return { error: "Add your National Insurance number first.", code: "HMRC_NINO_REQUIRED" };
  if (!row.business_id) return { error: "Open Making Tax Digital once so Evolution can find your self-employment at HMRC.", code: "HMRC_BUSINESS_REQUIRED" };
  return { nino: open(row.nino_enc), businessId: row.business_id };
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

// The quarters HMRC expects for this tax year (Obligations API 3.0): each
// cumulative from 6 April, with its due date and whether it's been sent.
hmrcRouter.get("/hmrc/obligations", requireAuth, async (req: Request, res: Response) => {
  try {
    const ctx = await fraudContext(req);
    const target = await quarterlyTarget(ctx.userId);
    if ("error" in target) return res.status(409).json(target);
    const taxYear = typeof req.query.tax_year === "string" ? req.query.tax_year : getTaxYearFromDate(new Date().toISOString().slice(0, 10));
    const { start, end } = getTaxYearBounds(taxYear);
    const query = new URLSearchParams({ typeOfBusiness: "self-employment", businessId: target.businessId, fromDate: start, toDate: end });
    const body = await hmrcRequest<{ obligations?: { businessId: string; obligationDetails: unknown[] }[] }>(
      req,
      ctx,
      `/obligations/details/${target.nino}/income-and-expenditure?${query}`,
      { version: "3.0", testScenario: process.env.HMRC_SANDBOX_OBLIGATIONS_SCENARIO || undefined }
    );
    const mine = body.obligations?.find((o) => o.businessId === target.businessId) ?? body.obligations?.[0];
    return res.json({ tax_year: taxYear, business_id: target.businessId, obligations: mine?.obligationDetails ?? [] });
  } catch (error) {
    if (error instanceof HmrcApiError && error.status === 404) {
      return res.json({ business_id: null, obligations: [] });
    }
    return sendHmrcError(res, error, "load your quarterly deadlines");
  }
});

function readPeriod(source: Record<string, unknown>): { start: string; end: string } | null {
  const start = String(source.period_start ?? "");
  const end = String(source.period_end ?? "");
  if (!isoDate.test(start) || !isoDate.test(end) || end < start) return null;
  // Updates are cumulative: every period starts on the tax year's 6 April.
  if (start !== getTaxYearBounds(getTaxYearFromDate(start)).start) return null;
  return { start, end };
}

// What would be sent for a quarter, from the user's records, before sending.
hmrcRouter.get("/hmrc/quarterly-preview", requireAuth, async (req: Request, res: Response) => {
  const period = readPeriod(req.query as Record<string, unknown>);
  if (!period) return res.status(400).json({ error: "Invalid period (it must start on 6 April and stay within one tax year)." });
  try {
    return res.json(await buildQuarterlyTotals((req as AuthenticatedRequest).userId, period.start, period.end));
  } catch (error) {
    return sendError(res, 500, "Failed to work out the quarterly totals", error);
  }
});

// Sends a cumulative quarterly update to HMRC, built on the server from
// the user's records, and keeps a permanent copy of exactly what was sent.
hmrcRouter.post("/hmrc/quarterly-update", requireAuth, async (req: Request, res: Response) => {
  const period = readPeriod(req.body ?? {});
  if (!period) return res.status(400).json({ error: "Invalid period (it must start on 6 April and stay within one tax year)." });
  try {
    const ctx = await fraudContext(req);
    const target = await quarterlyTarget(ctx.userId);
    if ("error" in target) return res.status(409).json(target);
    const totals = await buildQuarterlyTotals(ctx.userId, period.start, period.end);
    const payload = cumulativeSummaryBody(totals);
    const { correlationId } = await hmrcCall<unknown>(
      req,
      ctx,
      `/individuals/business/self-employment/${target.nino}/${target.businessId}/cumulative/${totals.tax_year}`,
      { method: "PUT", version: "5.0", body: payload }
    );
    const saved = await db.query<{ id: string; submitted_at: string }>(
      `INSERT INTO hmrc_submissions (user_id, environment, business_id, tax_year, period_start, period_end, payload, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, submitted_at::text`,
      [ctx.userId, hmrcEnvironment, target.businessId, totals.tax_year, period.start, period.end, JSON.stringify(payload), correlationId]
    );
    return res.json({ submitted: true, submission_id: saved.rows[0].id, submitted_at: saved.rows[0].submitted_at, correlation_id: correlationId, totals });
  } catch (error) {
    return sendHmrcError(res, error, "accept this quarterly update");
  }
});

// Updates already sent, newest first.
hmrcRouter.get("/hmrc/submissions", requireAuth, async (req: Request, res: Response) => {
  const result = await db.query(
    `SELECT id, environment, tax_year, period_start::text, period_end::text, payload, correlation_id, submitted_at::text
     FROM hmrc_submissions WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 50`,
    [(req as AuthenticatedRequest).userId]
  );
  return res.json({ submissions: result.rows });
});

// Runs our fraud-prevention headers past HMRC's checker (sandbox).
hmrcRouter.post("/hmrc/fraud-headers/check", requireAuth, async (req: Request, res: Response) => {
  if (hmrcEnvironment !== "sandbox") return res.status(404).json({ error: "Not available" });
  try {
    return res.json(await validateFraudHeaders(req, await fraudContext(req)));
  } catch (error) {
    return sendError(res, 500, "Failed to check fraud headers", error);
  }
});
