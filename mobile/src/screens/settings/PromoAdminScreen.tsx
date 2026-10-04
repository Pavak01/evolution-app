import React, { useCallback, useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { createPromoCode, disablePromoCode, listPromoCodes, type PromoCode } from "../../api/admin";
import { ApiError } from "../../api/client";
import { Card, DangerAction, DateField, Field, PrimaryButton, SmallAction, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatUkDate } from "../../utils/taxYear";

// Admin-only: create, share and disable free-access codes (testers,
// promotions). Codes are given away, never sold (Google Play policy).
// The Mac equivalent is "Create promo code.command" in the repo.

function describe(c: PromoCode): string {
  return [
    c.tier === "pro" ? "Pro" : "Basic",
    c.duration_days ? `${c.duration_days} days` : "no end",
    `used ${c.redeemed_count}${c.max_redemptions ? ` of ${c.max_redemptions}` : ""}`,
    c.usable_until ? `until ${formatUkDate(c.usable_until)}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

function shareCode(c: PromoCode): void {
  const lasts = c.duration_days ? ` for ${c.duration_days} days` : "";
  void Share.share({
    message:
      `Here's a code for Evolution ${c.tier === "pro" ? "Pro" : "Basic"}${lasts}: ${c.code}\n\n` +
      `In the app, go to Settings → Have a code?, enter it and tap Redeem code.`
  });
}

const positiveInt = (s: string): number | null | "bad" => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : "bad";
};

export function PromoAdminScreen(): React.JSX.Element {
  const [tier, setTier] = useState<"basic" | "pro">("pro");
  const [days, setDays] = useState("90");
  const [max, setMax] = useState("25");
  const [usableUntil, setUsableUntil] = useState("");
  const [note, setNote] = useState("");
  const [ownCode, setOwnCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<PromoCode | null>(null);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [showDisabled, setShowDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      setCodes(await listPromoCodes());
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not load codes." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    const d = positiveInt(days);
    const m = positiveInt(max);
    if (d === "bad" || m === "bad") {
      setStatus({ kind: "error", text: "Days and people must be whole numbers above 0, or left blank." });
      return;
    }
    setIsCreating(true);
    setStatus(null);
    setCreated(null);
    try {
      const code = await createPromoCode({
        tier,
        days: d,
        max: m,
        usable_until: usableUntil || null,
        note: note.trim() || null,
        code: ownCode.trim() || null
      });
      setCreated(code);
      setOwnCode("");
      await load();
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not create the code. Check your connection." });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDisable(code: string): Promise<void> {
    try {
      await disablePromoCode(code);
      await load();
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not disable the code." });
    }
  }

  const visible = codes.filter((c) => showDisabled || !c.disabled);

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm }}>New code</Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
          <SmallAction label="Basic" active={tier === "basic"} onPress={() => setTier("basic")} />
          <SmallAction label="Pro" active={tier === "pro"} onPress={() => setTier("pro")} />
        </View>
        <Field label="Plan lasts (days) — blank for no end" value={days} onChange={setDays} keyboardType="number-pad" placeholder="no end" />
        <Field label="How many people — blank for unlimited" value={max} onChange={setMax} keyboardType="number-pad" placeholder="unlimited" />
        <DateField label="Last day it can be used — optional" value={usableUntil} onChange={setUsableUntil} placeholder="DD/MM/YYYY" />
        <Field label="Note (just for you)" value={note} onChange={setNote} placeholder="e.g. closed test" />
        <Field label="Your own code — optional" value={ownCode} onChange={setOwnCode} placeholder="random, e.g. EVO-7K3M-Q9TD" />
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Create code" onPress={handleCreate} isLoading={isCreating} />
      </Card>

      {created && (
        <Card>
          <Text style={{ color: colors.textMuted }}>Created</Text>
          <Text selectable style={{ fontSize: typography.h2, fontWeight: "700", color: colors.textMain, letterSpacing: 1, marginVertical: spacing.xs }}>
            {created.code}
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>{describe(created)}</Text>
          <PrimaryButton label="Share this code" onPress={() => shareCode(created)} />
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain }}>Your codes</Text>
          <Text style={{ color: colors.accent }} onPress={() => setShowDisabled((v) => !v)}>
            {showDisabled ? "Hide disabled" : "Show disabled"}
          </Text>
        </View>
        {visible.length === 0 && <Text style={{ color: colors.textMuted }}>No codes yet.</Text>}
        {visible.map((c) => (
          <View key={c.code} style={{ paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, opacity: c.disabled ? 0.5 : 1 }}>
            <Text selectable style={{ fontWeight: "700", color: colors.textMain }}>
              {c.code}
              {c.disabled ? "  (disabled)" : ""}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.small }}>{describe(c)}</Text>
            {c.note && <Text style={{ color: colors.textMuted, fontSize: typography.small }}>{c.note}</Text>}
            {!c.disabled && (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <SmallAction label="Share" onPress={() => shareCode(c)} />
                <DangerAction label="Disable" onPress={() => void handleDisable(c.code)} />
              </View>
            )}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
