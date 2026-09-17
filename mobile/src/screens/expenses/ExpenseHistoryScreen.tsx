import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { listExpenses } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { PendingUploads } from "../../components/PendingUploads";
import { StatusBanner } from "../../components/Controls";
import { listPending, removePending, syncQueue, type PendingItem } from "../../offlineQueue";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";
import type { ExpensesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ExpensesStackParamList, "ExpenseHistory">;

export function ExpenseHistoryScreen({ navigation }: Props): React.JSX.Element {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const taxYear = getTaxYearFromDate(new Date());
      const [items, allPending] = await Promise.all([listExpenses({ tax_year: taxYear }), listPending()]);
      setExpenses(items);
      setPending(allPending.filter((item) => item.kind === "expense"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load expenses.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRetry = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncQueue(load);
      await load();
    } finally {
      setIsSyncing(false);
    }
  }, [load]);

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
      <PendingUploads
        items={pending}
        isSyncing={isSyncing}
        onRetry={handleRetry}
        onDelete={(localId) => {
          void removePending(localId).then(load);
        }}
      />
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No expenses logged yet this tax year.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate("ExpenseDetail", { expenseId: item.id })}>
            <View style={styles.rowMain}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.date}>{item.occurred_at}</Text>
            </View>
            <View style={styles.rowEnd}>
              <Text style={styles.amount}>£{item.total_amount.toFixed(2)}</Text>
              {item.voided_at && <Text style={styles.voided}>voided</Text>}
              {!item.voided_at && item.reimbursement_status !== "none" && (
                <Text style={styles.badge}>{item.reimbursement_status}</Text>
              )}
            </View>
          </Pressable>
        )}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md
  },
  rowMain: { gap: spacing.xs },
  category: { fontSize: typography.body, fontWeight: "700", color: colors.textMain, textTransform: "capitalize" },
  date: { fontSize: typography.small, color: colors.textMuted },
  rowEnd: { alignItems: "flex-end", gap: spacing.xs },
  amount: { fontSize: typography.body, fontWeight: "700", color: colors.snapshotValue },
  badge: { fontSize: typography.micro, color: colors.sectionHint, textTransform: "uppercase" },
  voided: { fontSize: typography.micro, color: colors.danger, textTransform: "uppercase" }
});
