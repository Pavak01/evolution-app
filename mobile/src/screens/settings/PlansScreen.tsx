import React, { useState } from "react";
import { Text, View } from "react-native";
import { useAccess } from "../../auth/AuthContext";
import { Card, PrimaryButton, StatusBanner } from "../../components/Controls";
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

// One card per plan, so the choice itself is visible. Until Play billing
// (Phase B) exists, choosing explains that and points to a code; Phase B
// turns these same buttons into the real purchase.
function PlanChoice({
  name,
  summary,
  isCurrent,
  onChoose
}: {
  name: string;
  summary: string;
  isCurrent: boolean;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
        <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain }}>{name}</Text>
        <Text style={{ color: colors.textMuted }}>£— a month</Text>
      </View>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>{summary}</Text>
      <PrimaryButton label={isCurrent ? `${name} is your plan` : `Choose ${name}`} onPress={onChoose} disabled={isCurrent} />
    </Card>
  );
}

export function PlansScreen(): React.JSX.Element {
  const access = useAccess();
  const [chosen, setChosen] = useState<string | null>(null);

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

      {chosen && (
        <StatusBanner
          kind="info"
          text={`Subscribing to ${chosen} opens soon, through Google Play. Until then you keep everything you have now — and if you've been given a code, enter it below.`}
        />
      )}
      <PlanChoice
        name="Basic"
        summary="Everything you enter yourself: receipts, income, CSV import, reimbursements, Summary, History and Export."
        isCurrent={access.tier === "basic"}
        onChoose={() => setChosen("Basic")}
      />
      <PlanChoice
        name="Pro"
        summary="Everything in Basic, plus auto-fill from receipts and invoices, and Import past receipts."
        isCurrent={access.tier === "pro"}
        onChoose={() => setChosen("Pro")}
      />
      <Text style={{ color: colors.textMuted, fontSize: typography.small, textAlign: "center" }}>
        A subscription is an allowable business expense.
      </Text>

      <Card>
        <PromoCodeField />
      </Card>
    </Screen>
  );
}
