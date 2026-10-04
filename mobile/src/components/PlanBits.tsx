import React, { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../api/client";
import { redeemPromoCode } from "../api/plans";
import { useAccess, useAuth } from "../auth/AuthContext";
import { openPlans } from "../navigation/navigationRef";
import { colors, spacing, typography } from "../theme/tokens";
import { Card, Field, PrimaryButton, StatusBanner } from "./Controls";

export const formatPlanDate = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Last 7 days of the trial only, so it never nags. Neutral styling —
// amber already means "awaiting reimbursement".
export function TrialBanner(): React.JSX.Element | null {
  const { daysLeftInTrial } = useAccess();
  if (daysLeftInTrial === null || daysLeftInTrial > 7) return null;
  return (
    <Text
      onPress={openPlans}
      style={{
        color: colors.textSecondary,
        backgroundColor: colors.accentSoft,
        padding: spacing.sm,
        borderRadius: 10,
        overflow: "hidden",
        textAlign: "center",
        fontSize: typography.small
      }}
    >
      Free trial — {daysLeftInTrial === 0 ? "ends today" : `${daysLeftInTrial} day${daysLeftInTrial === 1 ? "" : "s"} left`} ·{" "}
      <Text style={{ color: colors.accent, fontWeight: "700" }}>See plans</Text>
    </Text>
  );
}

// Shown instead of an entry form once the trial has ended with no plan.
export function PlanRequiredCard(): React.JSX.Element {
  return (
    <Card>
      <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm }}>
        Your free trial has ended
      </Text>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
        Choose a plan to keep adding records. Everything you've logged is still here to view and export.
      </Text>
      <PrimaryButton label="See plans" onPress={openPlans} />
    </Card>
  );
}

// "Auto-fill is part of Pro" — where the Auto-fill button would be for Basic.
export function ProUpsell({ what }: { what: string }): React.JSX.Element {
  return (
    <Text style={{ color: colors.textMuted, fontSize: typography.small, textAlign: "center" }} onPress={openPlans}>
      ✨ {what} is part of Pro · <Text style={{ color: colors.accent, fontWeight: "700" }}>See plans</Text>
    </Text>
  );
}

export function PromoCodeField(): React.JSX.Element {
  const { refreshUser } = useAuth();
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function handleRedeem(): Promise<void> {
    setIsRedeeming(true);
    setStatus(null);
    try {
      const result = await redeemPromoCode(code.trim());
      setStatus({ kind: "info", text: result.message });
      if (result.applied) setCode("");
      await refreshUser();
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Couldn't check that code — try again when you're online." });
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <View>
      <Field label="Have a code?" value={code} onChange={setCode} placeholder="EVO-XXXX-XXXX" />
      {status && <StatusBanner kind={status.kind} text={status.text} />}
      <View style={{ height: spacing.sm }} />
      <PrimaryButton label="Redeem code" onPress={handleRedeem} isLoading={isRedeeming} disabled={!code.trim()} />
    </View>
  );
}
