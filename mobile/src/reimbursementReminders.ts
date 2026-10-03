import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { listExpenses } from "./api/expenses";
import type { Expense } from "./api/types";

// On-device reminders for expenses still "awaiting" reimbursement — no
// server push needed. The schedule is rebuilt from the server's current
// list every time it might have changed (app foreground, save, update,
// void), so it never drifts: recording the last one cancels everything.
//
// Cadence: first nudge at 09:00, 14 days after the oldest awaiting
// expense's date, then weekly on that same weekday, at most MAX_NUDGES
// ahead at a time. Anchoring to the expense date (not "now") keeps it
// idempotent — reopening the app reschedules the same moments rather than
// pushing a fresh nudge to tomorrow every time.

const CHANNEL_ID = "reimbursement-reminders";
const ID_PREFIX = "reimbursement-reminder-";
const FIRST_NUDGE_AFTER_DAYS = 14;
const NUDGE_EVERY_DAYS = 7;
const MAX_NUDGES = 4;
const NUDGE_HOUR = 9;
const MAX_PAGES = 10;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Reimbursement reminders",
    importance: Notifications.AndroidImportance.DEFAULT
  });
}

async function hasPermission(ask: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  // Android 13+ only shows the prompt once a channel exists.
  await ensureChannel();
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function listAwaiting(): Promise<Expense[]> {
  const all: Expense[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listExpenses({ reimbursement_status: "awaiting", include_voided: false, limit: 100, cursor });
    all.push(...result.expenses);
    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return all;
}

export async function cancelReimbursementReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// Pure: the upcoming nudge times for an oldest-awaiting date. Exported for clarity/testing.
export function upcomingNudges(oldestOccurredAt: string, now: Date): Date[] {
  const [y, m, d] = oldestOccurredAt.split("-").map(Number);
  const first = new Date(y, m - 1, d + FIRST_NUDGE_AFTER_DAYS, NUDGE_HOUR, 0, 0, 0);
  const nudges: Date[] = [];
  for (let k = 0; nudges.length < MAX_NUDGES && k < 520; k++) {
    const at = new Date(first.getFullYear(), first.getMonth(), first.getDate() + k * NUDGE_EVERY_DAYS, NUDGE_HOUR, 0, 0, 0);
    if (at.getTime() > now.getTime() + 60_000) nudges.push(at);
  }
  return nudges;
}

// Dev builds only (Settings) — the real cadence is days away, far too slow
// to check by hand. Same content and tap target as a real reminder.
export async function sendTestReimbursementReminder(): Promise<boolean> {
  if (!(await hasPermission(true))) return false;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: "reimbursement-test", // outside ID_PREFIX so a resync never cancels it
    content: {
      title: "Reimbursement to record? (test)",
      body: "This is what a reminder looks like. Tap it to open History filtered to what's awaiting.",
      data: { kind: "reimbursement-reminder" }
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: CHANNEL_ID }
  });
  return true;
}

// `askPermission`: only true straight after the user marks something as
// awaiting — the moment the prompt makes sense. Every other call just
// reschedules if permission was already given. Best-effort throughout:
// a reminder failing must never surface as an error on the screen that
// triggered it.
export async function syncReimbursementReminders({ askPermission = false } = {}): Promise<void> {
  try {
    const awaiting = await listAwaiting();
    await cancelReimbursementReminders();
    if (awaiting.length === 0) return;
    if (!(await hasPermission(askPermission))) return;
    await ensureChannel();

    const oldest = awaiting.reduce((a, b) => (a.occurred_at <= b.occurred_at ? a : b));
    const total = awaiting.reduce((sum, e) => sum + e.total_amount, 0);
    const count = awaiting.length;
    const body =
      `${count} expense${count === 1 ? " is" : "s are"} still awaiting reimbursement (£${total.toFixed(2)}). ` +
      `Record what's been paid back — or mark it not reimbursed — so your deductions stay right.`;

    const nudges = upcomingNudges(oldest.occurred_at, new Date());
    await Promise.all(
      nudges.map((date, i) =>
        Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${i}`,
          content: { title: "Reimbursement to record?", body, data: { kind: "reimbursement-reminder" } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID }
        })
      )
    );
  } catch (error) {
    console.warn("Could not update reimbursement reminders:", error);
  }
}
