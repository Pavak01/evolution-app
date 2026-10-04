import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { confirmPasswordReset, requestPasswordReset } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/types";
import { routeAuthResult } from "./routeAuthResult";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

// Two steps: email -> code + new password. Then signs straight in (via
// 2FA if it's on). Resetting signs out every other device.
export function ForgotPasswordScreen({ route, navigation }: Props): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  async function handleSendCode(): Promise<void> {
    setStatus(null);
    setIsSubmitting(true);
    try {
      const message = await requestPasswordReset(normalizedEmail);
      setStep("code");
      setStatus({ kind: "info", text: `${message} It expires in 15 minutes — check your spam folder if you can't see it.` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not send a code. Check your connection." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (password.length < 8) {
      setStatus({ kind: "error", text: "Your new password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setStatus({ kind: "error", text: "The two passwords don't match." });
      return;
    }
    setStatus(null);
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(normalizedEmail, code.trim(), password);
      routeAuthResult(navigation, await login(normalizedEmail, password));
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not reset your password. Check your connection." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Reset password</Text>
      <Card>
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        {step === "code" && (
          <>
            <Field label="Code from the email" value={code} onChange={setCode} keyboardType="number-pad" placeholder="123456" />
            <Field label="New password" value={password} onChange={setPassword} placeholder="At least 8 characters" />
            <Field label="New password again" value={confirm} onChange={setConfirm} placeholder="" />
          </>
        )}
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ height: spacing.sm }} />
        {step === "email" ? (
          <PrimaryButton label="Send code" onPress={handleSendCode} isLoading={isSubmitting} disabled={!normalizedEmail} />
        ) : (
          <>
            <PrimaryButton
              label="Reset password"
              onPress={handleReset}
              isLoading={isSubmitting}
              disabled={code.trim().length !== 6 || !password || !confirm}
            />
            <View style={{ height: spacing.sm }} />
            <Text style={{ color: colors.accent, textAlign: "center" }} onPress={handleSendCode}>
              Send a new code
            </Text>
          </>
        )}
      </Card>
      <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => navigation.navigate("Login")}>
        Back to sign in
      </Text>
    </Screen>
  );
}
