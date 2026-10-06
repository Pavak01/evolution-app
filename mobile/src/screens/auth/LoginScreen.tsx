import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { Brand } from "../../components/Brand";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/types";
import { routeAuthResult } from "./routeAuthResult";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      routeAuthResult(navigation, await login(email.trim().toLowerCase(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Brand />
      <Card>
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" />
        {error && <StatusBanner kind="error" text={error} />}
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Sign in" onPress={handleSubmit} isLoading={isSubmitting} disabled={!email || !password} />
        <View style={{ height: spacing.sm }} />
        <Text
          style={{ color: colors.accent, textAlign: "center" }}
          onPress={() => navigation.navigate("ForgotPassword", { email: email.trim().toLowerCase() || undefined })}
        >
          Forgot password?
        </Text>
      </Card>
      <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => navigation.navigate("Register")}>
        New here? Create an account
      </Text>
    </Screen>
  );
}
