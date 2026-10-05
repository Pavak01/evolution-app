import React, { useState } from "react";
import { Text, View } from "react-native";
import { requestAccountDeletion } from "../../api/account";
import { ApiError } from "../../api/client";
import { resetAllData } from "../../api/dataReset";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { sendTestReimbursementReminder } from "../../reimbursementReminders";
import { formatPlanDate, PromoCodeField } from "../../components/PlanBits";
import { openPlans, openPromoAdmin, openTwoFactor } from "../../navigation/navigationRef";
import { openDoc } from "../../utils/docs";
import { useAccess, useAuth } from "../../auth/AuthContext";
import { colors, spacing, typography } from "../../theme/tokens";


export function SettingsScreen(): React.JSX.Element {
  const { user, logout } = useAuth();
  const access = useAccess();
  const planSummary =
    access.tier === "trial"
      ? `Free trial, everything included${access.trialEndsAt ? `, until ${formatPlanDate(access.trialEndsAt)}` : ""}.`
      : access.tier === "none"
        ? "Free trial ended. You can still view and export everything."
        : `${access.tier === "pro" ? "Pro" : "Basic"}${access.planEndsAt ? `, until ${formatPlanDate(access.planEndsAt)}` : ""}.`;

  const [testReminderNote, setTestReminderNote] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  // Set when the backend's first check (force: false) comes back 409 —
  // a tax year in this account has both passed HMRC's filing deadline and
  // been exported before. Never a hard block: pressing "Reset anyway"
  // retries with force: true, which cannot 409 again.
  const [resetWarning, setResetWarning] = useState<string | null>(null);

  async function handleDeleteAccount(): Promise<void> {
    setStatus(null);
    setIsSubmitting(true);
    try {
      const result = await requestAccountDeletion(message.trim() || undefined);
      setStatus({ kind: "info", text: result.message });
      setTimeout(() => logout(), 2000);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Could not submit the deletion request." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(force: boolean): Promise<void> {
    setResetStatus(null);
    setIsResetting(true);
    try {
      const result = await resetAllData(force);
      setResetWarning(null);
      setResetConfirmText("");
      const skipped = result.skipped_locked_years;
      const skippedNote =
        skipped.length > 0 ? ` ${skipped.sort().join(", ")} ${skipped.length === 1 ? "was" : "were"} kept because it's locked.` : "";
      setResetStatus({ kind: "info", text: `All eligible data has been cleared. Your account is still signed in.${skippedNote}` });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setResetWarning(error.message);
      } else {
        setResetStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Could not reset your data." });
      }
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Settings</Text>

      <Card>
        <Text style={{ color: colors.textSecondary }}>Signed in as</Text>
        <Text style={{ color: colors.textMain, fontWeight: "700", fontSize: typography.body, marginBottom: spacing.md }}>
          {user?.email}
        </Text>
        <PrimaryButton label="Log out" onPress={logout} />
      </Card>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Plan</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>{planSummary}</Text>
        <PrimaryButton label="See plans" onPress={openPlans} />
        <View style={{ height: spacing.md }} />
        <PromoCodeField />
      </Card>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Two-factor authentication</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          {user?.two_factor_enabled ? "On — signing in also needs a code from your authenticator app." : "Off. Add a second step to signing in for extra security."}
        </Text>
        <PrimaryButton label={user?.two_factor_enabled ? "Manage" : "Set up"} onPress={openTwoFactor} />
      </Card>

      {user?.is_admin && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Admin</Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
            Create free-access codes for testers and promotions, and share them.
          </Text>
          <PrimaryButton label="Promo codes" onPress={openPromoAdmin} />
        </Card>
      )}

      {__DEV__ && (
        <Card>
          <Text style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
            Dev only: {testReminderNote ?? "fires a sample reimbursement reminder in 10 seconds — background the app to see it."}
          </Text>
          <PrimaryButton
            label="Send test reminder"
            onPress={() =>
              void sendTestReimbursementReminder().then((result) =>
                setTestReminderNote(
                  result === "scheduled"
                    ? "scheduled — background the app now."
                    : result === "denied"
                      ? "notifications aren't allowed for this app."
                      : "notifications can't run in Expo Go on Android — this needs a real build."
                )
              )
            }
          />
        </Card>
      )}

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm }}>
          Help
        </Text>
        <View style={{ gap: spacing.sm }}>
          <PrimaryButton label="User guide" onPress={() => openDoc("USER-GUIDE.html")} />
          <PrimaryButton label="FAQ" onPress={() => openDoc("FAQ.html")} />
          <PrimaryButton label="Privacy policy" onPress={() => openDoc("PRIVACY-POLICY.html")} />
          <PrimaryButton label="Terms of use" onPress={() => openDoc("TERMS-OF-USE.html")} />
        </View>
      </Card>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
          Reset all data
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Clears every expense, income record, and receipt — your account and login stay exactly as they are. This
          cannot be undone.
        </Text>
        <Field label='Type "RESET" to confirm' value={resetConfirmText} onChange={setResetConfirmText} placeholder="RESET" />
        {resetWarning && <StatusBanner kind="error" text={resetWarning} />}
        {resetStatus && <StatusBanner kind={resetStatus.kind} text={resetStatus.text} />}
        <View style={{ height: spacing.sm }} />
        {resetWarning ? (
          <DangerAction
            label="Reset anyway"
            sublabel="This cannot be undone"
            onPress={() => handleReset(true)}
            isLoading={isResetting}
          />
        ) : (
          <DangerAction
            label="Reset all data"
            sublabel="This cannot be undone"
            onPress={() => handleReset(false)}
            isLoading={isResetting}
            disabled={resetConfirmText.trim().toUpperCase() !== "RESET"}
          />
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
          Delete account
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          This permanently deletes your account and all your data — expenses, receipts, income records, and tax
          summaries. This cannot be undone. Processing target: within 30 days.
        </Text>
        <Field label="Reason (optional)" value={message} onChange={setMessage} placeholder="" />
        <Field label='Type "DELETE" to confirm' value={confirmText} onChange={setConfirmText} placeholder="DELETE" />
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ height: spacing.sm }} />
        <DangerAction
          label="Delete my account"
          sublabel="This cannot be undone"
          onPress={handleDeleteAccount}
          isLoading={isSubmitting}
          disabled={confirmText.trim().toUpperCase() !== "DELETE"}
        />
      </Card>
    </Screen>
  );
}
