import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { listIncomeInvoices, voidIncomeInvoice } from "../../api/income";
import { ApiError } from "../../api/client";
import type { IncomeInvoice } from "../../api/types";
import { DangerAction, Field, SmallAction, StatusBanner } from "../../components/Controls";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";

function InvoiceRow({ invoice, onVoided }: { invoice: IncomeInvoice; onVoided: () => void }): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid(): Promise<void> {
    if (!reason.trim()) {
      setError("Enter a reason.");
      return;
    }
    setIsVoiding(true);
    setError(null);
    try {
      await voidIncomeInvoice(invoice.id, reason.trim());
      onVoided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not void this income.");
    } finally {
      setIsVoiding(false);
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.source}>{invoice.source}</Text>
        <Text style={styles.period}>
          {invoice.period_start} → {invoice.period_end}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amount}>£{invoice.total_amount.toFixed(2)}</Text>
        {invoice.voided_at ? (
          <Text style={styles.voided}>voided</Text>
        ) : (
          <SmallAction label="Void" onPress={() => setIsExpanded((v) => !v)} />
        )}
      </View>
      {isExpanded && !invoice.voided_at && (
        <View style={styles.expandWrap}>
          <Field label="Reason" value={reason} onChange={setReason} placeholder="Duplicate, wrong amount..." />
          {error && <StatusBanner kind="error" text={error} />}
          <DangerAction label="Confirm void" onPress={handleVoid} isLoading={isVoiding} disabled={!reason.trim()} />
        </View>
      )}
    </View>
  );
}

export function IncomeHistoryScreen(): React.JSX.Element {
  const [invoices, setInvoices] = useState<IncomeInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const taxYear = getTaxYearFromDate(new Date());
      setInvoices(await listIncomeInvoices({ tax_year: taxYear }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load income.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {error && (
        <View style={styles.errorWrap}>
          <StatusBanner kind="error" text={error} />
        </View>
      )}
      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No income recorded yet this tax year.</Text>}
        renderItem={({ item }) => <InvoiceRow invoice={item} onVoided={load} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  errorWrap: { padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: spacing.xxl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm
  },
  rowMain: { flexDirection: "row", justifyContent: "space-between" },
  source: { fontSize: typography.body, fontWeight: "700", color: colors.textMain },
  period: { fontSize: typography.small, color: colors.textMuted },
  rowEnd: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: typography.body, fontWeight: "700", color: colors.snapshotValue },
  voided: { fontSize: typography.micro, color: colors.danger, textTransform: "uppercase" },
  expandWrap: { marginTop: spacing.sm, gap: spacing.sm }
});
