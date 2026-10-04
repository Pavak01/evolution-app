import React from "react";
import { Text, View } from "react-native";
import { useAccess } from "../../auth/AuthContext";
import { Card, PrimaryButton } from "../../components/Controls";
import { formatPlanDate, PromoCodeField } from "../../components/PlanBits";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";

// Agreed 2026-10-04: everything is in Basic except features that read a
// photo or PDF for you, which are Pro. Prices are set in Play Console
// (Phase B), so they show as "£—" until purchasing exists.
const ROWS: { label: string; basic: boolean }[] = [
  { label: "Log receipts and income by hand", basic: true },
  { label: "Summary, History and Export", basic: true },
  { label: "Reimbursements and reminders", basic: true },
  { label: "Offline saving and duplicate checks", basic: true },
  { label: "Import income from CSV", basic: true },
  { label: "Auto-fill from receipt", basic: false },
  { label: "Import past receipts", basic: false },
  { label: "Auto-fill from invoice", basic: false }
];

const TIER_NAMES = { trial: "Free trial", basic: "Basic", pro: "Pro", none: "No plan" } as const;

function currentPlanLine(access: ReturnType<typeof useAccess>): string {
  if (access.tier === "trial") {
    return access.trialEndsAt ? `Free trial, everything included, until ${formatPlanDate(access.trialEndsAt)}.` : "Free trial, everything included.";
  }
  if (access.tier === "none") return "Your free trial has ended. You can still view and export everything you've logged.";
  const name = TIER_NAMES[access.tier];
  return access.planEndsAt ? `${name}, until ${formatPlanDate(access.planEndsAt)}.` : `${name}.`;
}

export function PlansScreen(): React.JSX.Element {
  const access = useAccess();

  return (
    <Screen>
      <Card>
        <Text style={{ color: colors.textMuted }}>Your plan</Text>
        <Text style={{ color: colors.textMain, fontWeight: "700", fontSize: typography.body }}>{currentPlanLine(access)}</Text>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", marginBottom: spacing.sm }}>
          <Text style={{ flex: 1 }} />
          <Text style={{ width: 64, textAlign: "center", fontWeight: "700", color: colors.textMain }}>Basic</Text>
          <Text style={{ width: 64, textAlign: "center", fontWeight: "700", color: colors.textMain }}>Pro</Text>
        </View>
        {ROWS.map((row) => (
          <View key={row.label} style={{ flexDirection: "row", paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
            <Text style={{ flex: 1, color: colors.textSecondary }}>{row.label}</Text>
            <Text style={{ width: 64, textAlign: "center", color: row.basic ? colors.snapshotValue : colors.textMuted }}>{row.basic ? "✓" : "—"}</Text>
            <Text style={{ width: 64, textAlign: "center", color: colors.snapshotValue }}>✓</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
          <Text style={{ flex: 1, color: colors.textMuted }}>Price</Text>
          <Text style={{ width: 64, textAlign: "center", color: colors.textMuted }}>£—</Text>
          <Text style={{ width: 64, textAlign: "center", color: colors.textMuted }}>£—</Text>
        </View>
      </Card>

      <Card>
        <PrimaryButton label="Subscriptions open soon" onPress={() => undefined} disabled />
        <Text style={{ color: colors.textMuted, fontSize: typography.small, marginTop: spacing.sm, textAlign: "center" }}>
          A subscription is an allowable business expense.
        </Text>
      </Card>

      <Card>
        <PromoCodeField />
      </Card>
    </Screen>
  );
}
