import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useRef, useState } from "react";
import { Text, View, type ScrollView } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { createExpense } from "../../api/expenses";
import { getTaxSummary } from "../../api/tax";
import { ApiError } from "../../api/client";
import { extractReceiptFields } from "../../api/receiptExtraction";
import type { PaymentMethod, ReimbursementStatus, TaxSummary } from "../../api/types";
import { Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueExpense, generateLocalId, syncQueue } from "../../offlineQueue";
import type { CaptureStackParamList } from "../../navigation/types";
import { colors, spacing, typography } from "../../theme/tokens";
import { humanizeCategory } from "../../utils/category";
import { getTaxYearFromDate, getTodayIso } from "../../utils/taxYear";

const CATEGORY_SUGGESTIONS = ["fuel", "travel", "parking_tolls", "vehicle_maintenance", "phone", "home_office", "clothing", "accountancy", "food", "other"];

type Props = NativeStackScreenProps<CaptureStackParamList, "CaptureForm">;

export function CaptureExpenseScreen({ navigation }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { captureFromCamera, pickFromFiles } = useReceiptCapture();
  const hasOcrUpgrade = user?.entitlements.ocr_upgrade_active ?? false;

  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(getTodayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [totalAmount, setTotalAmount] = useState("");
  const [reimbursementStatus, setReimbursementStatus] = useState<ReimbursementStatus>("none");
  const [reimbursedAmount, setReimbursedAmount] = useState("");
  const [businessUsePercent, setBusinessUsePercent] = useState("100");
  const [isAdjustingBusinessUse, setIsAdjustingBusinessUse] = useState(false);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  // OCR-only enrichment, never a manual-entry field — used server-side as a
  // duplicate-matching signal only.
  const [transactionTime, setTransactionTime] = useState<string | undefined>(undefined);

  // travel is the one category where a receipt genuinely may not exist yet
  // at capture time (see api/expenses.ts / offlineQueue.ts) — it can still
  // be attached later from ExpenseDetailScreen.
  const isTravel = category.trim().toLowerCase() === "travel";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<TaxSummary | null>(null);

  // Without this, the running-total card only ever reflected whatever was
  // true at the moment of the last save on this screen — voiding a
  // duplicate from History, for example, wouldn't be reflected here until
  // another expense was logged, while Summary (which always refetches on
  // focus) showed the correct current figure. Refreshing on focus keeps
  // the two screens agreeing.
  useFocusEffect(
    useCallback(() => {
      void getTaxSummary(getTaxYearFromDate(new Date()))
        .then(setLastSummary)
        .catch(() => {
          // Best-effort only — this card is a convenience snapshot, not
          // the source of truth (that's Summary), so a failed refresh
          // just leaves the previous figure showing rather than erroring.
        });
    }, [])
  );

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
    setBusinessUsePercent("100");
    setIsAdjustingBusinessUse(false);
    setNotes("");
    setReceipt(null);
    setTransactionTime(undefined);
    // occurredAt deliberately left as-is: back-to-back captures on the same day are the common case.
  }

  function validate(): string | null {
    if (!category.trim()) return "Enter a category.";
    if (!receipt && !isTravel) return "Add a receipt photo or file.";
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
    if (reimbursementStatus === "partial") {
      const reimbursed = Number(reimbursedAmount);
      if (!Number.isFinite(reimbursed) || reimbursed <= 0 || reimbursed >= amount) {
        return "Enter a partial reimbursement amount less than the total.";
      }
    }
    const businessUse = Number(businessUsePercent);
    if (!Number.isFinite(businessUse) || businessUse <= 0 || businessUse > 100) {
      return "Business use % must be between 1 and 100.";
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
      if (result.transaction_time) setTransactionTime(result.transaction_time);
      showStatus({ kind: "info", text: "Auto-filled from the receipt — review before saving." });
    } catch (error) {
      // A 502/503/504 here is a gateway/timeout-style failure (large photo,
      // slow connection, a transient hiccup) — not a real answer from the
      // extraction call, so the raw status text isn't useful to show. Auto-
      // fill is always optional, so this only ever needs to point back at
      // manual entry, never block it.
      const isGatewayError = error instanceof ApiError && [502, 503, 504].includes(error.status);
      const message = isGatewayError
        ? "Auto-fill timed out — try again, or enter the details manually."
        : error instanceof ApiError
          ? error.message
          : "Auto-fill failed — enter the details manually.";
      showStatus({ kind: "error", text: message });
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
    // Generated once, before the first attempt, and reused on any retry
    // (direct or offline-queued) — lets the server recognize a retry after
    // a lost response instead of creating a real duplicate.
    const idempotencyKey = generateLocalId();
    const fields = {
      category: category.trim(),
      occurred_at: occurredAt,
      payment_method: paymentMethod,
      total_amount: Number(totalAmount),
      reimbursement_status: reimbursementStatus,
      reimbursed_amount: reimbursementStatus === "partial" ? Number(reimbursedAmount) : undefined,
      business_use_percent: Number(businessUsePercent),
      notes: notes.trim() || undefined,
      idempotencyKey,
      transactionTime
    };
    try {
      const { summary, duplicate_warning } = await createExpense({
        ...fields,
        receiptUri: receipt?.uri,
        receiptName: receipt?.name,
        receiptType: receipt?.mimeType
      });
      setLastSummary(summary);
      showStatus({
        kind: "info",
        text: duplicate_warning ? `Expense logged. ${duplicate_warning.message}` : "Expense logged."
      });
      resetForm();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error("Expense submit failed:", error);
        showStatus({ kind: "error", text: error.message });
      } else {
        // Not a real server response — treat as a connectivity failure and
        // queue it. This is meant to feel like success: the point-of-sale
        // moment shouldn't require the user to think about their signal.
        await enqueueExpense(fields, receipt?.uri, receipt?.name, receipt?.mimeType, idempotencyKey);
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
      {hasOcrUpgrade && (
        <Text style={{ color: colors.accent, textAlign: "center" }} onPress={() => navigation.navigate("ImportReceipts")}>
          Import past receipts
        </Text>
      )}

      <Card>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Take photo" onPress={async () => setReceipt((await captureFromCamera()) ?? receipt)} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Choose photo" onPress={async () => setReceipt((await pickFromFiles()) ?? receipt)} />
          </View>
        </View>
        {receipt ? (
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
        ) : (
          isTravel && (
            <Text style={{ color: colors.textMuted, fontSize: typography.small }}>
              No receipt yet? That's fine for travel — save now and attach proof (a bank statement, app payment
              confirmation, or emailed receipt) once you have it. It won't count as deductible until you do.
            </Text>
          )
        )}
      </Card>

      <Card>
        <Field label="Category" value={category} onChange={setCategory} placeholder="fuel, food, phone..." />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md }}>
          {CATEGORY_SUGGESTIONS.map((suggestion) => (
            <SmallAction
              key={suggestion}
              label={humanizeCategory(suggestion)}
              active={category === suggestion}
              onPress={() => setCategory(suggestion)}
            />
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

        {isAdjustingBusinessUse ? (
          <Field
            label="Business use %"
            value={businessUsePercent}
            onChange={setBusinessUsePercent}
            keyboardType="decimal-pad"
            placeholder="100"
          />
        ) : (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }} onPress={() => setIsAdjustingBusinessUse(true)}>
            Business use: {businessUsePercent}% · Change
          </Text>
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
