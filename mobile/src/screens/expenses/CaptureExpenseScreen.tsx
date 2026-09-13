import React, { useState } from "react";
import { Text, View } from "react-native";
import { createExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { PaymentMethod, ReimbursementStatus, TaxSummary } from "../../api/types";
import { Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTodayIso } from "../../utils/taxYear";

const CATEGORY_SUGGESTIONS = ["fuel", "parking_tolls", "vehicle_maintenance", "phone", "home_office", "ppe", "accountancy", "food", "other"];

export function CaptureExpenseScreen(): React.JSX.Element {
  const { captureFromCamera, pickFromFiles } = useReceiptCapture();

  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(getTodayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [totalAmount, setTotalAmount] = useState("");
  const [reimbursementStatus, setReimbursementStatus] = useState<ReimbursementStatus>("none");
  const [reimbursedAmount, setReimbursedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<PickedFile | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<TaxSummary | null>(null);

  function resetForm(): void {
    setCategory("");
    setTotalAmount("");
    setReimbursementStatus("none");
    setReimbursedAmount("");
    setNotes("");
    setReceipt(null);
    // occurredAt deliberately left as-is: back-to-back captures on the same day are the common case.
  }

  function validate(): string | null {
    if (!category.trim()) return "Enter a category.";
    if (!receipt) return "Add a receipt photo or file.";
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
    if (reimbursementStatus === "partial") {
      const reimbursed = Number(reimbursedAmount);
      if (!Number.isFinite(reimbursed) || reimbursed <= 0 || reimbursed >= amount) {
        return "Enter a partial reimbursement amount less than the total.";
      }
    }
    return null;
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      setStatus({ kind: "error", text: validationError });
      return;
    }

    setStatus(null);
    setIsSubmitting(true);
    try {
      const { summary } = await createExpense({
        category: category.trim(),
        occurred_at: occurredAt,
        payment_method: paymentMethod,
        total_amount: Number(totalAmount),
        reimbursement_status: reimbursementStatus,
        reimbursed_amount: reimbursementStatus === "partial" ? Number(reimbursedAmount) : undefined,
        notes: notes.trim() || undefined,
        receiptUri: receipt!.uri,
        receiptName: receipt!.name,
        receiptType: receipt!.mimeType
      });
      setLastSummary(summary);
      setStatus({ kind: "info", text: "Expense logged." });
      resetForm();
    } catch (error) {
      console.error("Expense submit failed:", error);
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : `Could not save the expense: ${String(error)}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Log a receipt</Text>

      <Card>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Take photo" onPress={async () => setReceipt((await captureFromCamera()) ?? receipt)} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Choose file" onPress={async () => setReceipt((await pickFromFiles()) ?? receipt)} />
          </View>
        </View>
        {receipt && (
          <ReceiptThumbnail uri={receipt.uri} isPdf={receipt.mimeType === "application/pdf"} filename={receipt.name} />
        )}
      </Card>

      <Card>
        <Field label="Category" value={category} onChange={setCategory} placeholder="fuel, food, phone..." />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md }}>
          {CATEGORY_SUGGESTIONS.map((suggestion) => (
            <SmallAction key={suggestion} label={suggestion} active={category === suggestion} onPress={() => setCategory(suggestion)} />
          ))}
        </View>

        <DateField label="Date" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />
        <Field label="Amount (£)" value={totalAmount} onChange={setTotalAmount} keyboardType="decimal-pad" placeholder="0.00" />

        <Text style={{ fontSize: typography.body, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.xs }}>
          Payment method
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
          <SmallAction label="Card" active={paymentMethod === "card"} onPress={() => setPaymentMethod("card")} />
          <SmallAction label="Cash" active={paymentMethod === "cash"} onPress={() => setPaymentMethod("cash")} />
        </View>

        <Text style={{ fontSize: typography.body, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.xs }}>
          Reimbursed?
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
          <SmallAction label="No" active={reimbursementStatus === "none"} onPress={() => setReimbursementStatus("none")} />
          <SmallAction label="Partially" active={reimbursementStatus === "partial"} onPress={() => setReimbursementStatus("partial")} />
          <SmallAction label="Fully" active={reimbursementStatus === "full"} onPress={() => setReimbursementStatus("full")} />
        </View>
        {reimbursementStatus === "partial" && (
          <Field label="Reimbursed amount (£)" value={reimbursedAmount} onChange={setReimbursedAmount} keyboardType="decimal-pad" placeholder="0.00" />
        )}

        <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="" />

        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Save expense" onPress={handleSubmit} isLoading={isSubmitting} />
      </Card>

      {lastSummary && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
            {lastSummary.tax_year} running total
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <SnapshotTile label="Net profit" value={`£${lastSummary.net_profit.toFixed(2)}`} />
            <SnapshotTile label="Set aside for tax" value={`£${lastSummary.estimate.total_to_set_aside.toFixed(2)}`} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
