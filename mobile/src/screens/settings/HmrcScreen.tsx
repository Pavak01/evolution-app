import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import {
  checkFraudHeaders,
  disconnectHmrc,
  getHmrcStatus,
  listHmrcBusinesses,
  saveNino,
  startHmrcLink,
  type HmrcBusiness,
  type HmrcStatus
} from "../../api/hmrc";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatUkDate } from "../../utils/taxYear";

// Making Tax Digital: link the user's HMRC account, add their National
// Insurance number, and show the income sources HMRC has for them. Admin-
// only while it runs against HMRC's sandbox (see SettingsScreen).
export function HmrcScreen(): React.JSX.Element {
  const [status, setStatus] = useState<HmrcStatus | null>(null);
  const [businesses, setBusinesses] = useState<HmrcBusiness[] | null>(null);
  const [nino, setNino] = useState("");
  const [busy, setBusy] = useState<"link" | "nino" | "unlink" | "check" | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [headerReport, setHeaderReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getHmrcStatus();
      setStatus(next);
      setBusinesses(null);
      if (next.connected && next.has_nino) setBusinesses(await listHmrcBusinesses());
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't reach HMRC. Please try again." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Opens HMRC's own sign-in in an in-app browser. HMRC sends the browser
  // back to our server, which redirects to this app's link with ?status=…;
  // the browser session closes itself when that link arrives.
  async function handleLink(): Promise<void> {
    setMessage(null);
    setBusy("link");
    try {
      const returnUrl = Linking.createURL("hmrc");
      const { authorize_url } = await startHmrcLink(returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authorize_url, returnUrl);
      if (result.type === "success") {
        const outcome = Linking.parse(result.url).queryParams?.status;
        if (outcome === "connected") setMessage({ kind: "info", text: "HMRC account linked." });
        else if (outcome === "denied") setMessage({ kind: "error", text: "You didn't give Evolution permission, so nothing was linked." });
        else setMessage({ kind: "error", text: "HMRC couldn't complete the link. Please try again." });
      }
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't start the HMRC sign-in." });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveNino(): Promise<void> {
    setMessage(null);
    setBusy("nino");
    try {
      await saveNino(nino);
      setNino("");
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't save that number." });
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlink(): Promise<void> {
    setBusy("unlink");
    try {
      await disconnectHmrc();
      setMessage({ kind: "info", text: "HMRC account unlinked. Evolution can no longer send anything to HMRC for you." });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleCheckHeaders(): Promise<void> {
    setBusy("check");
    try {
      const report = await checkFraudHeaders();
      const lines = [
        `Result: ${report.code ?? "unknown"}`,
        ...(report.errors ?? []).map((e) => `Error: ${e.headers.join(", ")} (${e.code})`),
        ...(report.warnings ?? []).map((w) => `Warning: ${w.headers.join(", ")}`)
      ];
      setHeaderReport(lines.join("\n"));
    } catch (error) {
      setHeaderReport(error instanceof ApiError ? error.message : "Check failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return (
      <Screen>
        {message ? <StatusBanner kind={message.kind} text={message.text} /> : <ActivityIndicator color={colors.accent} />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Making Tax Digital</Text>
      <Text style={{ color: colors.textSecondary }}>
        Link your HMRC account so Evolution can send your quarterly updates for you. You sign in on HMRC's own page;
        Evolution never sees your HMRC password.
      </Text>
      {status.environment === "sandbox" && (
        <StatusBanner kind="info" text="Test mode: this connects to HMRC's sandbox, not your real tax account. Sign in with an HMRC test user." />
      )}
      {message && <StatusBanner kind={message.kind} text={message.text} />}

      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>HMRC account</Text>
        {status.connected ? (
          <>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
              Linked{status.connected_at ? ` on ${formatUkDate(status.connected_at.slice(0, 10))}` : ""}.
            </Text>
            <DangerAction label="Unlink HMRC account" onPress={handleUnlink} isLoading={busy === "unlink"} />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>Not linked.</Text>
            <PrimaryButton label="Link HMRC account" onPress={handleLink} isLoading={busy === "link"} />
          </>
        )}
      </Card>

      {status.connected && !status.has_nino && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
            National Insurance number
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            HMRC files your updates under it. It's stored encrypted and only ever sent to HMRC.
          </Text>
          <Field label="National Insurance number" value={nino} onChange={setNino} placeholder="QQ 12 34 56 C" />
          <PrimaryButton label="Save" onPress={handleSaveNino} isLoading={busy === "nino"} disabled={nino.trim().length < 9} />
        </Card>
      )}

      {businesses && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
            Your income sources at HMRC
          </Text>
          {businesses.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>HMRC has no self-employment registered for you yet.</Text>
          ) : (
            businesses.map((b) => (
              <View key={b.businessId} style={{ paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.textMain, fontWeight: "600" }}>
                  {b.tradingName ?? (b.typeOfBusiness === "self-employment" ? "Self-employment" : b.typeOfBusiness)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: typography.small }}>
                  {[b.tradingType, b.businessId].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ))
          )}
        </Card>
      )}

      {status.environment === "sandbox" && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.xs }}>
            Developer check
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
            Sends this phone's fraud-prevention details to HMRC's checker.
          </Text>
          <PrimaryButton label="Check fraud-prevention headers" onPress={handleCheckHeaders} isLoading={busy === "check"} />
          {headerReport && <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>{headerReport}</Text>}
        </Card>
      )}
    </Screen>
  );
}
