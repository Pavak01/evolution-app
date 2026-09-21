import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { requestAccountDeletion } from "../../api/account";
import { ApiError } from "../../api/client";
import { resetAllData } from "../../api/dataReset";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../auth/AuthContext";
import { colors, spacing, typography } from "../../theme/tokens";

const DOCS_BASE_URL = "https://pavak01.github.io/evolution-app";

// GitHub Pages serves these with a 10-minute cache-control, and phone
// browsers cache on top of that — a query param that changes on every tap
// forces a fresh fetch instead of showing a stale page from an earlier visit.
function openDoc(path: string): void {
  Linking.openURL(`${DOCS_BASE_URL}/${path}?v=${Date.now()}`);
}

export function SettingsScreen(): React.JSX.Element {
  const { user, logout } = useAuth();

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
      await resetAllData(force);
      setResetWarning(null);
      setResetConfirmText("");
      setResetStatus({ kind: "info", text: "All your data has been cleared. Your account is still signed in." });
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
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm }}>
          Help
        </Text>
        <View style={{ gap: spacing.sm }}>
          <PrimaryButton label="User guide" onPress={() => openDoc("USER-GUIDE.html")} />
          <PrimaryButton label="FAQ" onPress={() => openDoc("FAQ.html")} />
          <PrimaryButton label="Privacy policy" onPress={() => openDoc("PRIVACY-POLICY.html")} />
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
