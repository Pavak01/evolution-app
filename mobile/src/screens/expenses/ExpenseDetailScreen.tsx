import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Text, View } from "react-native";
import { getExpense, voidExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner, SummaryRow } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { useReceiptCapture } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ExpensesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ExpensesStackParamList, "ExpenseDetail">;

export function ExpenseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { expenseId } = route.params;
  const { openDownload } = useReceiptCapture();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setExpense(await getExpense(expenseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this expense.");
    } finally {
      setIsLoading(false);
    }
  }, [expenseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleVoid(): Promise<void> {
    if (!voidReason.trim()) {
      setError("Enter a reason for voiding this expense.");
      return;
    }

    setIsVoiding(true);
    setError(null);
    try {
      await voidExpense(expenseId, voidReason.trim());
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not void this expense.");
    } finally {
      setIsVoiding(false);
    }
  }

  if (isLoading || !expense) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain, textTransform: "capitalize" }}>
        {expense.category}
      </Text>

      <Card>
        <SummaryRow label="Total" value={expense.total_amount} />
        <SummaryRow label="Reimbursed" value={expense.reimbursed_amount} />
        <SummaryRow label="Net deductible" value={expense.net_deductible_amount} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
          {expense.occurred_at} · {expense.payment_method} · {expense.reimbursement_status}
        </Text>
        {expense.notes && <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{expense.notes}</Text>}
        {expense.voided_at && (
          <Text style={{ color: colors.danger, marginTop: spacing.sm, fontWeight: "700" }}>
            Voided: {expense.void_reason}
          </Text>
        )}
      </Card>

      <PrimaryButton label="View receipt" onPress={() => openDownload(expense.receipt_download_url, `${expense.category}-receipt`)} />

      {!expense.voided_at && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Void this expense
          </Text>
          <Field label="Reason" value={voidReason} onChange={setVoidReason} placeholder="Duplicate entry, wrong amount..." />
          {error && <StatusBanner kind="error" text={error} />}
          <View style={{ height: spacing.sm }} />
          <DangerAction label="Void expense" onPress={handleVoid} isLoading={isVoiding} disabled={!voidReason.trim()} />
        </Card>
      )}
    </Screen>
  );
}
