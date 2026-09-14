import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { requestAccountDeletion } from "../../api/account";
import { ApiError } from "../../api/client";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../auth/AuthContext";
import { colors, spacing, typography } from "../../theme/tokens";

const DOCS_BASE_URL = "https://pavak01.github.io/evolution-app";

export function SettingsScreen(): React.JSX.Element {
  const { user, logout } = useAuth();

  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

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
          <PrimaryButton label="User guide" onPress={() => Linking.openURL(`${DOCS_BASE_URL}/USER-GUIDE.html`)} />
          <PrimaryButton label="FAQ" onPress={() => Linking.openURL(`${DOCS_BASE_URL}/FAQ.html`)} />
          <PrimaryButton label="Privacy policy" onPress={() => Linking.openURL(`${DOCS_BASE_URL}/PRIVACY-POLICY.html`)} />
        </View>
      </Card>

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
          Delete account
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          This permanently deletes your account and all your data — expenses, receipts, income records, and tax
          summaries — in both Evolution and Qbit. This cannot be undone. Processing target: within 30 days.
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
