import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text } from "react-native";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { colors, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "VerifyTwoFactor">;

export function VerifyTwoFactorScreen({ route }: Props): React.JSX.Element {
  const { challengeToken } = route.params;
  const { verifyTwoFactor } = useAuth();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyTwoFactor(challengeToken, code.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Two-factor code</Text>
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
          Enter the 6-digit code from your authenticator app.
        </Text>
        <Field label="Code" value={code} onChange={setCode} keyboardType="number-pad" placeholder="123456" />
        {error && <StatusBanner kind="error" text={error} />}
        <PrimaryButton label="Verify" onPress={handleSubmit} isLoading={isSubmitting} disabled={code.trim().length !== 6} />
      </Card>
    </Screen>
  );
}
