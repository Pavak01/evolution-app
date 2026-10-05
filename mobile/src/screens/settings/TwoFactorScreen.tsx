import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Linking, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ApiError } from "../../api/client";
import { disableTwoFactor, enableTwoFactor, newBackupCodes, startTwoFactorSetup } from "../../api/twoFactor";
import { useAuth } from "../../auth/AuthContext";
import { Card, DangerAction, Field, PrimaryButton, SmallAction, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";

// Turn two-factor authentication on or off. Setup: add the key to an
// authenticator app (link on this phone, QR for another device, or type
// it), prove it with a code, then save the one-time backup codes.

type Status = { kind: "info" | "error"; text: string } | null;
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }): React.JSX.Element {
  return (
    <Card>
      <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Save your backup codes</Text>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
        If you lose your phone or authenticator app, each of these codes lets you sign in once. Keep them somewhere safe — they
        won't be shown again.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        {codes.map((c) => (
          <Text key={c} selectable style={{ width: "46%", fontSize: typography.body, fontWeight: "700", color: colors.textMain, letterSpacing: 1 }}>
            {c}
          </Text>
        ))}
      </View>
      <PrimaryButton
        label="Share / save codes"
        onPress={() => void Share.share({ message: `Evolution backup codes (each works once):\n\n${codes.join("\n")}` })}
      />
      <View style={{ height: spacing.sm }} />
      <PrimaryButton label="I've saved them" onPress={onDone} />
    </Card>
  );
}

export function TwoFactorScreen(): React.JSX.Element {
  const { user, refreshUser } = useAuth();
  const enabled = user?.two_factor_enabled ?? false;
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function run(action: () => Promise<void>, fallback: string): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (err) {
      setStatus({ kind: "error", text: errorText(err, fallback) });
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <Screen>
        <BackupCodes
          codes={backupCodes}
          onDone={() => {
            setBackupCodes(null);
            setCode("");
          }}
        />
      </Screen>
    );
  }

  if (enabled) {
    return (
      <Screen>
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Two-factor authentication is on</Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
            Signing in asks for a code from your authenticator app after your password.
          </Text>
          <Field label="Code from your authenticator app" value={code} onChange={setCode} keyboardType="number-pad" placeholder="123456" />
          {status && <StatusBanner kind={status.kind} text={status.text} />}
          <View style={{ height: spacing.sm }} />
          <PrimaryButton
            label="Make new backup codes"
            isLoading={busy}
            disabled={code.trim().length !== 6}
            onPress={() => void run(async () => setBackupCodes(await newBackupCodes(code.trim())), "Could not make new codes.")}
          />
        </Card>
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>Turn off</Text>
          <Field label="Your password" value={password} onChange={setPassword} placeholder="" />
          <Field label="Code (or a backup code)" value={code} onChange={setCode} placeholder="123456" />
          <DangerAction
            label="Turn off two-factor authentication"
            isLoading={busy}
            disabled={!password || code.trim().length < 6}
            onPress={() =>
              void run(async () => {
                await disableTwoFactor(password, code.trim());
                setPassword("");
                setCode("");
                await refreshUser();
                setStatus({ kind: "info", text: "Two-factor authentication is off." });
              }, "Could not turn it off.")
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>Two-factor authentication</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Adds a second step when signing in: a 6-digit code from an authenticator app (such as Google Authenticator or Microsoft
          Authenticator), so your password alone isn't enough.
        </Text>
        {!setup && (
          <PrimaryButton
            label="Set up"
            isLoading={busy}
            onPress={() => void run(async () => setSetup(await startTwoFactorSetup()), "Could not start setup.")}
          />
        )}
      </Card>

      {setup && (
        <>
          <Card>
            <Text style={{ fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>1. Add Evolution to your authenticator app</Text>
            <PrimaryButton
              label="Add to authenticator app on this phone"
              onPress={() =>
                void Linking.openURL(setup.otpauth_url).catch(() =>
                  setStatus({ kind: "error", text: "No authenticator app found on this phone. Install one, or use the QR code or key below." })
                )
              }
            />
            <Text style={{ color: colors.textMuted, marginVertical: spacing.sm, textAlign: "center" }}>or scan this from another device</Text>
            <View style={{ alignItems: "center", padding: spacing.md, backgroundColor: "#ffffff", borderRadius: 12 }}>
              <QRCode value={setup.otpauth_url} size={180} />
            </View>
            <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>or type this key:</Text>
            <Text selectable style={{ fontWeight: "700", color: colors.textMain, letterSpacing: 1, marginBottom: spacing.xs }}>
              {setup.secret.match(/.{1,4}/g)?.join(" ")}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <SmallAction
                label="Copy key"
                onPress={() => {
                  void Clipboard.setStringAsync(setup.secret);
                  setStatus({ kind: "info", text: "Key copied." });
                }}
              />
            </View>
          </Card>
          <Card>
            <Text style={{ fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>2. Enter the code it shows</Text>
            <Field label="6-digit code" value={code} onChange={setCode} keyboardType="number-pad" placeholder="123456" />
            {status && <StatusBanner kind={status.kind} text={status.text} />}
            <View style={{ height: spacing.sm }} />
            <PrimaryButton
              label="Turn on"
              isLoading={busy}
              disabled={code.trim().length !== 6}
              onPress={() =>
                void run(async () => {
                  const codes = await enableTwoFactor(code.trim());
                  setSetup(null);
                  await refreshUser();
                  setBackupCodes(codes);
                }, "Could not turn it on.")
              }
            />
          </Card>
        </>
      )}
      {!setup && status && <StatusBanner kind={status.kind} text={status.text} />}
    </Screen>
  );
}
