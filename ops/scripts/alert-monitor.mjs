#!/usr/bin/env node
// Production alert monitor for evolution-backend, run every 10 minutes by
// .github/workflows/alert-monitor.yml. Ported from Qbit's 401-spike monitor
// and extended for Evolution's real risks. Emails ALERT_TO_EMAIL via Resend
// when, within the last WINDOW_MINUTES:
//   - the server fails its health check twice running (one blip is ignored)
//   - 5xx responses reach ERROR_5XX_THRESHOLD (a real bug, e.g. a failed save)
//   - failed logins reach LOGIN_401_THRESHOLD (password guessing)
//   - sign-ups reach SIGNUP_THRESHOLD (bot sign-ups spread over many IPs,
//     which the per-IP limit can't see)
//   - one IP sends FLOOD_THRESHOLD requests (a client stuck in a loop, or abuse
//     — the 2026-10-04 /auth/me loop sent ~1,800 per 10 minutes)
// The same kind of alert is not repeated within COOLDOWN_MINUTES.
//
// Local dry run (needs `railway login`; prints instead of emailing):
//   DRY_RUN=1 node ops/scripts/alert-monitor.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const env = (name, fallback = "") => (process.env[name] ?? "").trim() || fallback;
const num = (name, fallback) => Number.parseInt(env(name, String(fallback)), 10);

const BASE_URL = env("BASE_URL", "https://evolution-backend-production.up.railway.app");
const SERVICE = env("RAILWAY_SERVICE", "evolution-backend");
const ENVIRONMENT = env("RAILWAY_ENVIRONMENT", "production");
const PROJECT = env("RAILWAY_PROJECT_ID", ""); // not needed with a project token
const WINDOW_MINUTES = num("WINDOW_MINUTES", 10);
const ERROR_5XX_THRESHOLD = num("ERROR_5XX_THRESHOLD", 5);
const LOGIN_401_THRESHOLD = num("LOGIN_401_THRESHOLD", 20);
const SIGNUP_THRESHOLD = num("SIGNUP_THRESHOLD", 20);
const FLOOD_THRESHOLD = num("FLOOD_THRESHOLD", 1500);
const COOLDOWN_MINUTES = num("COOLDOWN_MINUTES", 30);
const STATE_FILE = env("ALERT_STATE_FILE", ".alert-state/monitor-state.json");
const DRY_RUN = ["1", "true", "yes"].includes(env("DRY_RUN").toLowerCase());
const FROM = env("ALERT_FROM_EMAIL", "Evolution alerts <alerts@mail.aplccommodities.com>");

function loadState() {
  try {
    return { lastSent: {}, healthFailures: 0, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return { lastSent: {}, healthFailures: 0 };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function checkHealth() {
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(15_000) });
    return { ok: response.ok, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function fetchHttpLogs() {
  // --lines matters: without it the CLI silently caps at 500 rows, which
  // would make the flood check (1,500) impossible to trigger. 5000 is the
  // most Railway accepts — far above anything in a 10-minute window.
  const args = ["logs", "--http", "--json", "--service", SERVICE, "--environment", ENVIRONMENT, "--since", `${WINDOW_MINUTES}m`, "--lines", "5000"]; // Railway's maximum
  if (PROJECT) args.push("--project", PROJECT);
  // RAILWAY_CLI lets CI use `npx @railway/cli`; locally the installed `railway` works.
  const [cmd, ...pre] = env("RAILWAY_CLI", "railway").split(" ");
  const out = execFileSync(cmd, [...pre, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return out
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row && row.timestamp && row.path);
}

function analyse(rows) {
  const since = Date.now() - WINDOW_MINUTES * 60_000;
  const recent = rows.filter((r) => Date.parse(r.timestamp) >= since);
  const errors5xx = recent.filter((r) => r.httpStatus >= 500);
  const login401 = recent.filter((r) => r.method === "POST" && r.path === "/auth/login" && r.httpStatus === 401).length;
  const signups = recent.filter((r) => r.method === "POST" && r.path === "/auth/register" && r.httpStatus === 201).length;
  const perIp = new Map();
  for (const r of recent) perIp.set(r.srcIp, (perIp.get(r.srcIp) ?? 0) + 1);
  const [floodIp, floodCount] = [...perIp.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  const topPaths = (list) => {
    const counts = new Map();
    for (const r of list) {
      const key = `${r.method} ${r.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")} → ${r.httpStatus}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `  ${n} × ${k}`).join("\n");
  };
  return {
    total: recent.length,
    errors5xx: errors5xx.length,
    errorPaths: topPaths(errors5xx),
    login401,
    signups,
    floodIp,
    floodCount,
    floodPaths: topPaths(recent.filter((r) => r.srcIp === floodIp))
  };
}

async function sendAlert(subject, body) {
  if (DRY_RUN) {
    console.log(`[dry run] would email: ${subject}\n${body}\n`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [env("ALERT_TO_EMAIL")], subject, text: body })
  });
  if (!response.ok) throw new Error(`Resend rejected the alert (${response.status}): ${(await response.text()).slice(0, 300)}`);
  console.log(`alert sent: ${subject}`);
}

async function main() {
  if (!DRY_RUN) {
    for (const name of ["RESEND_API_KEY", "ALERT_TO_EMAIL"]) {
      if (!env(name)) throw new Error(`Missing ${name}`);
    }
  }
  const state = loadState();
  const alerts = [];
  const footer = `\n\nWindow: last ${WINDOW_MINUTES} minutes, ${new Date().toISOString()} UTC.\nRailway → evolution-backend → Logs for detail. Sent by ops/scripts/alert-monitor.mjs.`;

  const health = await checkHealth();
  state.healthFailures = health.ok ? 0 : state.healthFailures + 1;
  console.log(`health: ${health.ok ? "ok" : "FAIL"} (${health.detail}), consecutive failures ${state.healthFailures}`);
  if (state.healthFailures >= 2) {
    alerts.push(["down", "Evolution server is not responding", `${BASE_URL}/health has failed ${state.healthFailures} checks in a row (${health.detail}). The app can't reach the server.`]);
  }

  let stats = null;
  let logsError = null;
  try {
    stats = analyse(fetchHttpLogs());
  } catch (error) {
    logsError = error instanceof Error ? error.message : String(error);
    console.error("could not read Railway logs:", logsError);
  }
  if (stats) {
    console.log(JSON.stringify({ ...stats, errorPaths: undefined, floodPaths: undefined }));
    if (stats.errors5xx >= ERROR_5XX_THRESHOLD) {
      alerts.push(["5xx", `${stats.errors5xx} server errors in ${WINDOW_MINUTES} minutes`, `The server returned ${stats.errors5xx} error responses (5xx). Something is failing for users.\n\nMost common:\n${stats.errorPaths}`]);
    }
    if (stats.login401 >= LOGIN_401_THRESHOLD) {
      alerts.push(["login", `${stats.login401} failed sign-ins in ${WINDOW_MINUTES} minutes`, `${stats.login401} sign-in attempts with a wrong password. Possibly someone guessing passwords.`]);
    }
    if (stats.signups >= SIGNUP_THRESHOLD) {
      alerts.push(["signup", `${stats.signups} sign-ups in ${WINDOW_MINUTES} minutes`, `${stats.signups} new accounts were registered — unusually many. Possibly bot sign-ups (each would still need to confirm a real email before using the app).`]);
    }
    if (stats.floodCount >= FLOOD_THRESHOLD) {
      alerts.push(["flood", `${stats.floodCount} requests from one address in ${WINDOW_MINUTES} minutes`, `${stats.floodCount} requests came from ${stats.floodIp}. Usually an app stuck in a loop, otherwise abuse.\n\nMost common:\n${stats.floodPaths}`]);
    }
  }

  for (const [kind, subject, body] of alerts) {
    const last = Date.parse(state.lastSent[kind] ?? "");
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MINUTES * 60_000) {
      console.log(`suppressed (cooldown): ${subject}`);
      continue;
    }
    await sendAlert(`[Evolution] ${subject}`, body + footer);
    state.lastSent[kind] = new Date().toISOString();
  }
  saveState(state);
  if (logsError) {
    // Fail the run (GitHub shows it red and emails the repo owner) rather
    // than report "all clear" without having looked.
    throw new Error(`Railway logs unreadable, so only the health check ran: ${logsError}`);
  }
  if (alerts.length === 0) console.log("status: all clear");
}

main().catch((error) => {
  console.error("monitor_error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
