import React, { useRef, useState } from "react";
import { Text, View, type ScrollView } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { createExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import { extractReceiptFields } from "../../api/receiptExtraction";
import type { PaymentMethod, ReimbursementStatus, TaxSummary } from "../../api/types";
import { Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueExpense, syncQueue } from "../../offlineQueue";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTodayIso } from "../../utils/taxYear";

const CATEGORY_SUGGESTIONS = ["fuel", "travel", "parking_tolls", "vehicle_maintenance", "phone", "home_office", "ppe", "accountancy", "food", "other"];

export function CaptureExpenseScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { captureFromCamera, pickFromFiles } = useReceiptCapture();
  const hasOcrUpgrade = user?.entitlements.ocr_upgrade_active ?? false;

  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(getTodayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [totalAmount, setTotalAmount] = useState("");
  const [reimbursementStatus, setReimbursementStatus] = useState<ReimbursementStatus>("none");
  const [reimbursedAmount, setReimbursedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<PickedFile | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<TaxSummary | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  // The status banner lives at the top of the screen precisely so feedback
  // like "saved offline, will sync" is never missed — but a long form means
  // the user is often scrolled well past it, so also snap back to top
  // whenever a new message appears rather than relying on position alone.
  function showStatus(next: { kind: "info" | "error"; text: string }): void {
    setStatus(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

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

  async function handleAutoFill(): Promise<void> {
    if (!receipt) return;

    setStatus(null);
    setIsExtracting(true);
    try {
      const result = await extractReceiptFields(receipt.uri, receipt.name, receipt.mimeType);
      if (!result.extraction_succeeded) {
        showStatus({ kind: "error", text: "Couldn't read this receipt clearly — enter the details manually." });
        return;
      }

      if (result.category) setCategory(result.category);
      if (result.total_amount !== null) setTotalAmount(String(result.total_amount));
      if (result.occurred_at) setOccurredAt(result.occurred_at);
      if (result.merchant && !notes.trim()) setNotes(result.merchant);
      showStatus({ kind: "info", text: "Auto-filled from the receipt — review before saving." });
    } catch (error) {
      showStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Auto-fill failed — enter the details manually." });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      showStatus({ kind: "error", text: validationError });
      return;
    }

    setStatus(null);
    setIsSubmitting(true);
    const fields = {
      category: category.trim(),
      occurred_at: occurredAt,
      payment_method: paymentMethod,
      total_amount: Number(totalAmount),
      reimbursement_status: reimbursementStatus,
      reimbursed_amount: reimbursementStatus === "partial" ? Number(reimbursedAmount) : undefined,
      notes: notes.trim() || undefined
    };
    try {
      const { summary } = await createExpense({
        ...fields,
        receiptUri: receipt!.uri,
        receiptName: receipt!.name,
        receiptType: receipt!.mimeType
      });
      setLastSummary(summary);
      showStatus({ kind: "info", text: "Expense logged." });
      resetForm();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error("Expense submit failed:", error);
        showStatus({ kind: "error", text: error.message });
      } else {
        // Not a real server response — treat as a connectivity failure and
        // queue it. This is meant to feel like success: the point-of-sale
        // moment shouldn't require the user to think about their signal.
        await enqueueExpense(fields, receipt!.uri, receipt!.name, receipt!.mimeType);
        showStatus({ kind: "info", text: "No connection — saved on your device. It'll upload automatically once you're back online." });
        resetForm();
        void syncQueue();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen ref={scrollRef}>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Log a receipt</Text>
      {status && <StatusBanner kind={status.kind} text={status.text} />}

      <Card>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Take photo" onPress={async () => setReceipt((await captureFromCamera()) ?? receipt)} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Choose photo" onPress={async () => setReceipt((await pickFromFiles()) ?? receipt)} />
          </View>
        </View>
        {receipt && (
          <>
            <ReceiptThumbnail uri={receipt.uri} isPdf={receipt.mimeType === "application/pdf"} filename={receipt.name} />
            <View style={{ height: spacing.sm }} />
            {hasOcrUpgrade ? (
              <PrimaryButton label="Auto-fill from receipt ✨" onPress={handleAutoFill} isLoading={isExtracting} />
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: typography.small, textAlign: "center" }}>
                ✨ Auto-fill from receipt — paid upgrade, coming soon
              </Text>
            )}
          </>
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
