import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";
import { listExpenses } from "./api/expenses";
import { isAndroidExpoGo } from "./nativeSupport";
import type { Expense } from "./api/types";
import { formatGbp } from "./utils/money";

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

// Expo Go on Android (SDK 53+) throws as soon as expo-notifications is
// even loaded, which crashed the whole app on start. So the module is only
// required where it works (real builds, iOS Expo Go); in Android Expo Go
// reminders quietly do nothing. Nothing else in the app may import
// expo-notifications directly — go through this file.
export const remindersSupported = !isAndroidExpoGo;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof NotificationsModule | null = remindersSupported ? require("expo-notifications") : null;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

async function ensureChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Reimbursement reminders",
    importance: Notifications.AndroidImportance.DEFAULT
  });
}

async function hasPermission(ask: boolean): Promise<boolean> {
  if (!Notifications) return false;
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
  if (!Notifications) return;
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
export async function sendTestReimbursementReminder(): Promise<"scheduled" | "denied" | "unsupported"> {
  if (!Notifications) return "unsupported";
  if (!(await hasPermission(true))) return "denied";
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
  return "scheduled";
}

const isReminderTap = (response: NotificationsModule.NotificationResponse | null): boolean =>
  response?.notification.request.content.data?.kind === "reimbursement-reminder";

// Calls `onTap` whenever a reminder is tapped while the app is running.
export function onReminderTapped(onTap: () => void): () => void {
  if (!Notifications) return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (isReminderTap(response)) onTap();
  });
  return () => subscription.remove();
}

// True (once) if the app was opened from a cold start by tapping a reminder.
export async function consumeLaunchReminderTap(): Promise<boolean> {
  if (!Notifications) return false;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) await Notifications.clearLastNotificationResponseAsync();
  return isReminderTap(response);
}

// `askPermission`: only true straight after the user marks something as
// awaiting — the moment the prompt makes sense. Every other call just
// reschedules if permission was already given. Best-effort throughout:
// a reminder failing must never surface as an error on the screen that
// triggered it.
export async function syncReimbursementReminders({ askPermission = false } = {}): Promise<void> {
  if (!Notifications) return;
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
      `${count} expense${count === 1 ? " is" : "s are"} still awaiting reimbursement (${formatGbp(total)}). ` +
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
