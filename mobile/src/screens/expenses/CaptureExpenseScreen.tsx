import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View, type ScrollView } from "react-native";
import { useAccess, useAuth } from "../../auth/AuthContext";
import { createExpense } from "../../api/expenses";
import { getTaxSummary } from "../../api/tax";
import { ApiError } from "../../api/client";
import { extractReceiptFields } from "../../api/receiptExtraction";
import type { PaymentMethod, TaxSummary } from "../../api/types";
import { CategoryPickerModal } from "../../components/CategoryPickerModal";
import { awaitingPill, Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ImageViewerModal } from "../../components/ImageViewerModal";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueExpense, generateLocalId, syncQueue, subscribePendingCount } from "../../offlineQueue";
import { syncReimbursementReminders } from "../../reimbursementReminders";
import { PlanRequiredCard, ProUpsell, TrialBanner } from "../../components/PlanBits";
import { openCompareInHistory } from "../../navigation/navigationRef";
import type { CaptureStackParamList } from "../../navigation/types";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate, getTodayIso } from "../../utils/taxYear";
import { formatGbp } from "../../utils/money";

type Props = NativeStackScreenProps<CaptureStackParamList, "CaptureForm">;

export function CaptureExpenseScreen({ navigation, route }: Props): React.JSX.Element {
  const { refreshUser } = useAuth();
  const { captureFromCamera, pickFromFiles, openLocalFile } = useReceiptCapture();
  // Trial or Pro — anything that reads a photo/PDF for you.
  const { ocr: hasOcrUpgrade, canWrite } = useAccess();

  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(getTodayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [totalAmount, setTotalAmount] = useState("");
  const [businessUsePercent, setBusinessUsePercent] = useState("100");
  const [isAdjustingBusinessUse, setIsAdjustingBusinessUse] = useState(false);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  // OCR-only enrichment, never a manual-entry field — used server-side as a
  // duplicate-matching signal only.
  const [transactionTime, setTransactionTime] = useState<string | undefined>(undefined);
  // OCR-only, informational — never blocks or excludes anything, just warns.
  const [fuelCardHint, setFuelCardHint] = useState<string | null>(null);
  // Local file, not yet uploaded — the viewer points straight at its uri,
  // no download step needed (same as ImportReceiptsScreen's tap-to-enlarge).
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Set only via the "Resubmit" prefill effect below — carries the voided
  // expense's id through to the save, so it can be linked as the original.
  const [resubmittedFromExpenseId, setResubmittedFromExpenseId] = useState<string | null>(null);

  // travel is the one category where a receipt genuinely may not exist yet
  // at capture time (see api/expenses.ts / offlineQueue.ts) — it can still
  // be attached later from ExpenseDetailScreen.
  const isTravel = category.trim().toLowerCase() === "travel";
  // Travel only: "will a firm pay some of this back later?" — the amount
  // is never known yet. Saves as reimbursement_status "awaiting", which
  // still counts in full but keeps a tax-summary warning up until the
  // real amount is recorded from ExpenseDetailScreen.
  const [awaitingReimbursement, setAwaitingReimbursement] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  // Set when the receipt just saved looks like one already logged — offers a
  // straight route to Compare (in History) instead of making the user find it.
  const [duplicatePair, setDuplicatePair] = useState<{ savedId: string; otherId: string } | null>(null);
  // Swaps the "No connection — saved on your device" notice once the queued
  // entry has actually uploaded, rather than leaving a stale warning up.
  const awaitingUpload = useRef(false);
  useEffect(
    () =>
      subscribePendingCount((count) => {
        if (count === 0 && awaitingUpload.current) {
          awaitingUpload.current = false;
          setStatus({ kind: "info", text: "Back online — your saved expense has uploaded." });
        }
      }),
    []
  );
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
    // (duplicatePair deliberately survives the post-save reset — that's when it's shown)
    setCategory("");
    setTotalAmount("");
    setBusinessUsePercent("100");
    setIsAdjustingBusinessUse(false);
    setNotes("");
    setReceipt(null);
    setTransactionTime(undefined);
    setFuelCardHint(null);
    setViewerUri(null);
    setResubmittedFromExpenseId(null);
    setAwaitingReimbursement(false);
    // occurredAt deliberately left as-is: back-to-back captures on the same day are the common case.
  }

  // ExpenseDetailScreen's "Resubmit" action on a voided expense lands here
  // with everything pre-filled, including the same receipt (already
  // downloaded to a local file — this screen has no download step of its
  // own). Params are cleared right after applying them so this only ever
  // fires once, not on every later visit to this screen while they linger.
  useEffect(() => {
    const resubmit = route.params?.resubmit;
    if (!resubmit) return;

    setCategory(resubmit.category);
    setTotalAmount(resubmit.totalAmount);
    setOccurredAt(resubmit.occurredAt);
    setBusinessUsePercent(resubmit.businessUsePercent);
    setNotes(resubmit.notes);
    setReceipt(resubmit.file);
    setResubmittedFromExpenseId(resubmit.originalExpenseId);
    setAwaitingReimbursement(resubmit.awaitingReimbursement);
    showStatus({ kind: "info", text: "Prefilled from a voided expense — review and correct before saving." });
    navigation.setParams({ resubmit: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.resubmit]);

  // Widget / app-icon shortcut "Receipt": open the camera straight away.
  useEffect(() => {
    if (!route.params?.launchCamera) return;
    navigation.setParams({ launchCamera: undefined });
    if (canWrite) void handleAttachReceipt(captureFromCamera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.launchCamera]);

  // A photo shared to Evolution from another app, chosen as a receipt.
  useEffect(() => {
    const shared = route.params?.sharedFile;
    if (!shared) return;
    navigation.setParams({ sharedFile: undefined });
    void handleAttachReceipt(async () => shared);
    showStatus({ kind: "info", text: `${shared.mimeType === "application/pdf" ? "PDF" : "Photo"} added from another app — fill in the details and save.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.sharedFile]);

  function validate(): string | null {
    if (!category.trim()) return "Enter a category.";
    if (!receipt && !isTravel) return "Add a receipt photo or file.";
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
    const businessUse = Number(businessUsePercent);
    if (!Number.isFinite(businessUse) || businessUse <= 0 || businessUse > 100) {
      return "Business use % must be between 1 and 100.";
    }
    return null;
  }

  // Replacing the photo — not just the very first pick — has to clear
  // every auto-fillable field first. Without this, a field the new photo's
  // OCR pass can't confidently read (handleAutoFill only ever sets a field
  // when the result has a value) would keep showing whatever an earlier
  // photo filled in, looking like it came from the new receipt when it
  // didn't. A cancelled pick changes nothing, including the existing photo.
  async function handleAttachReceipt(pick: () => Promise<PickedFile | null>): Promise<void> {
    const picked = await pick();
    if (!picked) return;

    setCategory("");
    setTotalAmount("");
    setOccurredAt(getTodayIso());
    setNotes("");
    setTransactionTime(undefined);
    setFuelCardHint(null);
    setViewerUri(null);
    setReceipt(picked);
    setDuplicatePair(null);
  }

  async function handleAutoFill(): Promise<void> {
    if (!receipt) return;

    setStatus(null);
    setIsExtracting(true);
    setFuelCardHint(null);
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
      setFuelCardHint(result.fuel_card_hint);
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
      // Only ever "is one expected?" at capture — the amount is recorded
      // later from ExpenseDetailScreen. ImportReceiptsScreen always sends "none".
      reimbursement_status: isTravel && awaitingReimbursement ? ("awaiting" as const) : ("none" as const),
      business_use_percent: Number(businessUsePercent),
      notes: notes.trim() || undefined,
      idempotencyKey,
      transactionTime,
      resubmittedFromExpenseId: resubmittedFromExpenseId ?? undefined
    };
    try {
      const { expense: saved, summary, duplicate_warning } = await createExpense({
        ...fields,
        receiptUri: receipt?.uri,
        receiptName: receipt?.name,
        receiptType: receipt?.mimeType
      });
      setLastSummary(summary);
      if (fields.reimbursement_status === "awaiting") {
        // The moment a reminder makes sense — asks for notification permission if not yet decided.
        void syncReimbursementReminders({ askPermission: true });
      }
      showStatus({
        kind: "info",
        text: duplicate_warning ? `Expense logged. ${duplicate_warning.message}` : "Expense logged."
      });
      setDuplicatePair(duplicate_warning ? { savedId: saved.id, otherId: duplicate_warning.expense_id } : null);
      resetForm();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error("Expense submit failed:", error);
        showStatus({ kind: "error", text: error.message });
        // Trial ended since the app last checked — swap the form for the plan card.
        if (error.status === 402) void refreshUser();
      } else {
        // Not a real server response — treat as a connectivity failure and
        // queue it. This is meant to feel like success: the point-of-sale
        // moment shouldn't require the user to think about their signal.
        await enqueueExpense(fields, receipt?.uri, receipt?.name, receipt?.mimeType, idempotencyKey);
        showStatus({ kind: "info", text: "No connection — saved on your device. It'll upload automatically once you're back online." });
        awaitingUpload.current = true;
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
      {duplicatePair && status && (
        <PrimaryButton
          label="Compare and void"
          onPress={() => {
            openCompareInHistory(duplicatePair.savedId, duplicatePair.otherId);
            setDuplicatePair(null);
          }}
        />
      )}
      <TrialBanner />
      {!canWrite && <PlanRequiredCard />}
      {canWrite && (
      <>
      {hasOcrUpgrade && (
        <Text style={{ color: colors.accent, textAlign: "center" }} onPress={() => navigation.navigate("ImportReceipts")}>
          Import past receipts
        </Text>
      )}

      <Card>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Take photo" onPress={() => handleAttachReceipt(captureFromCamera)} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Choose photo" onPress={() => handleAttachReceipt(pickFromFiles)} />
          </View>
        </View>
        {receipt ? (
          <>
            {/* A shared PDF receipt can't show in the photo viewer — open it in the phone's PDF viewer. */}
            <Pressable onPress={() => (receipt.mimeType === "application/pdf" ? void openLocalFile(receipt.uri, "application/pdf") : setViewerUri(receipt.uri))}>
              <ReceiptThumbnail uri={receipt.uri} isPdf={receipt.mimeType === "application/pdf"} filename={receipt.name} />
            </Pressable>
            <Text style={{ color: colors.textMuted, fontSize: typography.micro, marginTop: spacing.xs }}>
              {receipt.mimeType === "application/pdf" ? "Tap to open the PDF and check it before saving" : "Tap the photo to check it full-size before saving"}
            </Text>
            <View style={{ height: spacing.sm }} />
            {hasOcrUpgrade ? (
              <PrimaryButton label="Auto-fill from receipt ✨" onPress={handleAutoFill} isLoading={isExtracting} />
            ) : (
              <ProUpsell what="Auto-fill from receipt" />
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
        {fuelCardHint && (
          <Text style={{ color: colors.danger, fontSize: typography.small, marginBottom: spacing.sm }}>
            This receipt looks like it was paid with a {fuelCardHint} — if that's a company-owned fuel card, you
            didn't personally pay for this, so it shouldn't be claimed as a deductible expense. Still your call.
          </Text>
        )}
        <CategoryPickerModal label="Category" value={category} onChange={setCategory} />

        <DateField label="Date" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />
        <Field label="Amount (£)" value={totalAmount} onChange={setTotalAmount} keyboardType="decimal-pad" placeholder="0.00" />

        <Text style={{ fontSize: typography.body, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.xs }}>
          Payment method
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
          <SmallAction label="Card" active={paymentMethod === "card"} onPress={() => setPaymentMethod("card")} />
          <SmallAction label="Cash" active={paymentMethod === "cash"} onPress={() => setPaymentMethod("cash")} />
        </View>

        {isTravel && (
          <>
            <Text style={{ fontSize: typography.body, fontWeight: "600", color: colors.textSecondary, marginBottom: spacing.xs }}>
              Expecting reimbursement?
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md }}>
              <SmallAction label="No" active={!awaitingReimbursement} onPress={() => setAwaitingReimbursement(false)} />
              <SmallAction label="Yes" active={awaitingReimbursement} onPress={() => setAwaitingReimbursement(true)} />
            </View>
            {awaitingReimbursement && (
              <Text style={[awaitingPill, { fontWeight: "400", marginBottom: spacing.md }]}>
                Saved as awaiting reimbursement — counts in full until you record what's paid back.
              </Text>
            )}
          </>
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
        {(receipt || category.trim() || totalAmount.trim() || notes.trim()) && (
          <Text
            style={{ color: colors.textMuted, textAlign: "center", marginTop: spacing.md, fontWeight: "600" }}
            onPress={() =>
              Alert.alert("Discard this receipt?", "What you've entered and the attached photo will be cleared.", [
                { text: "Keep editing", style: "cancel" },
                {
                  text: "Discard",
                  style: "destructive",
                  onPress: () => {
                    resetForm();
                    setStatus(null);
                  }
                }
              ])
            }
          >
            Cancel
          </Text>
        )}
      </Card>
      </>
      )}

      {lastSummary && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
            {lastSummary.tax_year} running total
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <SnapshotTile label="Net profit" value={`${formatGbp(lastSummary.net_profit)}`} />
            <SnapshotTile label="Set aside for tax" value={`${formatGbp(lastSummary.estimate.total_to_set_aside)}`} />
          </View>
        </Card>
      )}

      <ImageViewerModal visible={!!viewerUri} uri={viewerUri} isLoading={false} onClose={() => setViewerUri(null)} />
    </Screen>
  );
}
