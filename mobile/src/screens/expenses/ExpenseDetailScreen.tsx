import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Text, View } from "react-native";
import { attachReceipt, getExpense, voidExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner, SummaryRow } from "../../components/Controls";
import { ImageViewerModal } from "../../components/ImageViewerModal";
import { Screen } from "../../components/Screen";
import { useReceiptCapture } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ExpensesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ExpensesStackParamList, "ExpenseDetail">;

export function ExpenseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { expenseId } = route.params;
  const { captureFromCamera, downloadToLocalUri, pickFromFiles, shareLocalUri } = useReceiptCapture();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

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

  async function handleViewReceipt(): Promise<void> {
    if (!expense?.receipt_download_url) return;
    setViewerVisible(true);
    setViewerLoading(true);
    setViewerUri(null);
    const localUri = await downloadToLocalUri(expense.receipt_download_url, `${expense.category}-receipt`);
    setViewerUri(localUri);
    setViewerLoading(false);
  }

  async function handleAttachReceipt(pick: () => Promise<{ uri: string; name: string; mimeType: string } | null>): Promise<void> {
    const file = await pick();
    if (!file) return;

    setIsAttaching(true);
    setError(null);
    try {
      await attachReceipt(expenseId, file.uri, file.name, file.mimeType);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not attach the receipt.");
    } finally {
      setIsAttaching(false);
    }
  }

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
          {expense.business_use_percent !== 100 ? ` · ${expense.business_use_percent}% business use` : ""}
        </Text>
        {expense.notes && <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{expense.notes}</Text>}
        {expense.voided_at && (
          <Text style={{ color: colors.danger, marginTop: spacing.sm, fontWeight: "700" }}>
            Voided: {expense.void_reason}
          </Text>
        )}
      </Card>

      {expense.receipt_download_url ? (
        <PrimaryButton label="View receipt" onPress={handleViewReceipt} />
      ) : (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Missing receipt
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
            This travel expense isn't counted as deductible yet — attach proof (a bank statement screenshot, app
            payment confirmation, or emailed receipt) to claim it.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Take photo" onPress={() => handleAttachReceipt(captureFromCamera)} isLoading={isAttaching} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Choose photo" onPress={() => handleAttachReceipt(pickFromFiles)} isLoading={isAttaching} />
            </View>
          </View>
        </Card>
      )}
      <ImageViewerModal
        visible={viewerVisible}
        uri={viewerUri}
        isLoading={viewerLoading}
        onClose={() => setViewerVisible(false)}
        onShare={viewerUri ? () => shareLocalUri(viewerUri) : undefined}
      />

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
