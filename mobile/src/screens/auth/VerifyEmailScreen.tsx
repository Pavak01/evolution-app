import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { resendVerification } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import type { AuthStackParamList } from "../../navigation/types";
import { routeAuthResult } from "./routeAuthResult";

type Props = NativeStackScreenProps<AuthStackParamList, "VerifyEmail">;

const RESEND_COOLDOWN_SECONDS = 60; // matches the server's own cooldown

// No session exists until this code is entered — so an account (and its
// free trial) can't be created with an address the person doesn't own.
export function VerifyEmailScreen({ route, navigation }: Props): React.JSX.Element {
  const { verificationToken, email, notice } = route.params;
  const { verifyEmail } = useAuth();

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(
    notice ? { kind: "info", text: notice } : null
  );
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleVerify(): Promise<void> {
    setStatus(null);
    setIsSubmitting(true);
    try {
      routeAuthResult(navigation, await verifyEmail(verificationToken, code.trim()));
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not check that code. Check your connection." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    setStatus(null);
    setIsResending(true);
    try {
      await resendVerification(verificationToken);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStatus({ kind: "info", text: "New code sent. Only the newest code works." });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not send a new code. Check your connection." });
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Check your email</Text>
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          We've emailed a 6-digit code to <Text style={{ fontWeight: "700" }}>{email}</Text>. It expires in 15 minutes. Can't see it?
          Check your spam or junk folder.
        </Text>
        <Field label="Code" value={code} onChange={setCode} keyboardType="number-pad" placeholder="123456" />
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Confirm email" onPress={handleVerify} isLoading={isSubmitting} disabled={code.trim().length !== 6} />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          label={cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
          onPress={handleResend}
          isLoading={isResending}
          disabled={cooldown > 0}
        />
      </Card>
      <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => navigation.navigate("Register")}>
        Wrong email? Start again
      </Text>
    </Screen>
  );
}
