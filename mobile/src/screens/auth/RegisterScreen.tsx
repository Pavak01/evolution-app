import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props): React.JSX.Element {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await register(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Create your account</Text>
      <Card>
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" />
        {error && <StatusBanner kind="error" text={error} />}
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Create account" onPress={handleSubmit} isLoading={isSubmitting} disabled={!email || !password} />
      </Card>
      <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => navigation.navigate("Login")}>
        Already have an account? Sign in
      </Text>
    </Screen>
  );
}
