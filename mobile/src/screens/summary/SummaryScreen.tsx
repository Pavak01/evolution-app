import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Text, View } from "react-native";
import { getTaxSummary } from "../../api/tax";
import { ApiError } from "../../api/client";
import type { TaxSummary } from "../../api/types";
import { Card, SmallAction, SnapshotTile, StatusBanner, SummaryRow } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";

export function SummaryScreen(): React.JSX.Element {
  const [taxYear, setTaxYear] = useState(getTaxYearFromDate(new Date()));
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (year: string) => {
    setIsLoading(true);
    setError(null);
    try {
      setSummary(await getTaxSummary(year));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your tax summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(taxYear);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taxYear])
  );

  const previousTaxYear = `${Number(taxYear.slice(0, 4)) - 1}-${String(Number(taxYear.slice(0, 4)) % 100).padStart(2, "0")}`;
  const currentTaxYear = getTaxYearFromDate(new Date());

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>{taxYear} summary</Text>

      {taxYear !== previousTaxYear && (
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <SmallAction label={previousTaxYear} active={false} onPress={() => setTaxYear(previousTaxYear)} />
          <SmallAction label={currentTaxYear} active={taxYear === currentTaxYear} onPress={() => setTaxYear(currentTaxYear)} />
        </View>
      )}

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {error && <StatusBanner kind="error" text={error} />}

      {summary && !isLoading && (
        <>
          <Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
              <SnapshotTile label="Total income" value={`£${summary.total_income.toFixed(2)}`} />
              <SnapshotTile label="Total expenses" value={`£${summary.total_expenses.toFixed(2)}`} />
              <SnapshotTile label="Net profit" value={`£${summary.net_profit.toFixed(2)}`} />
              <SnapshotTile label="Weeks logged" value={String(summary.weeks_logged)} />
            </View>
            <SummaryRow label="Estimated income tax" value={summary.estimate.estimated_income_tax} />
            <SummaryRow label="NI class 2" value={summary.estimate.ni_class2} />
            <SummaryRow label="NI class 4" value={summary.estimate.ni_class4} />
            <SummaryRow label="Total to set aside" value={summary.estimate.total_to_set_aside} />
          </Card>

          {summary.warnings.length > 0 && (
            <Card>
              <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
                Things to review
              </Text>
              {summary.warnings.map((warning) => (
                <Text key={warning.code} style={{ color: warning.severity === "high" ? colors.danger : colors.textSecondary, marginBottom: spacing.xs }}>
                  • {warning.message}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
