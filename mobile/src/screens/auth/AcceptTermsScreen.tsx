import React, { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Card, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { TermsAgreement } from "../../components/TermsAgreement";
import { colors, spacing, typography } from "../../theme/tokens";

// Shown once, after sign-in, to an account that hasn't accepted the current
// Terms of Use — accounts made before acceptance was asked for, or after a
// material change to the terms. The app is blocked until accepted.
export function AcceptTermsScreen(): React.JSX.Element {
  const { user, acceptTerms, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      await acceptTerms(user?.terms?.current_version ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Terms of Use</Text>
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Before you carry on, please read and accept our Terms of Use. They explain your free trial and plans, that Evolution
          gives estimates rather than tax advice, and how your data is handled.
        </Text>
        <TermsAgreement checked={checked} onToggle={() => setChecked((c) => !c)} />
        {error && <StatusBanner kind="error" text={error} />}
        <PrimaryButton label="Accept and continue" onPress={handleAccept} isLoading={isSubmitting} disabled={!checked} />
        <View style={{ height: spacing.sm }} />
        <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => void logout()}>
          Not now — sign out
        </Text>
      </Card>
    </Screen>
  );
}
