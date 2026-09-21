import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useRef, useState } from "react";
import { Text, View, type ScrollView } from "react-native";
import { createIncomeInvoice } from "../../api/income";
import { ApiError } from "../../api/client";
import type { TaxSummary } from "../../api/types";
import { Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueIncome, generateLocalId, syncQueue } from "../../offlineQueue";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTodayIso } from "../../utils/taxYear";
import type { IncomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<IncomeStackParamList, "RecordIncome">;

export function RecordIncomeScreen({ navigation }: Props): React.JSX.Element {
  const { pickFromFiles, pickDocument } = useReceiptCapture();

  const [periodStart, setPeriodStart] = useState(getTodayIso());
  const [periodEnd, setPeriodEnd] = useState(getTodayIso());
  const [source, setSource] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(getTodayIso());
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<TaxSummary | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  function showStatus(next: { kind: "info" | "error"; text: string }): void {
    setStatus(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function validate(): string | null {
    if (!source.trim()) return "Enter who paid you.";
    const amount = Number(totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
    if (periodEnd < periodStart) return "Period end must be on or after period start.";
    return null;
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
      period_start: periodStart,
      period_end: periodEnd,
      source: source.trim(),
      total_amount: Number(totalAmount),
      received_date: receivedDate,
      notes: notes.trim() || undefined,
      idempotencyKey
    };
    try {
      const { summary } = await createIncomeInvoice({
        ...fields,
        fileUri: file?.uri,
        fileName: file?.name,
        fileType: file?.mimeType
      });
      setLastSummary(summary);
      showStatus({ kind: "info", text: "Income recorded." });
      setSource("");
      setTotalAmount("");
      setNotes("");
      setFile(null);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error("Income submit failed:", error);
        showStatus({ kind: "error", text: error.message });
      } else {
        await enqueueIncome(fields, file?.uri, file?.name, file?.mimeType, idempotencyKey);
        showStatus({ kind: "info", text: "No connection — saved on your device. It'll upload automatically once you're back online." });
        setSource("");
        setTotalAmount("");
        setNotes("");
        setFile(null);
        void syncQueue();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen ref={scrollRef}>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Record income</Text>
      {status && <StatusBanner kind={status.kind} text={status.text} />}

      <Card>
        <Field label="Who paid you" value={source} onChange={setSource} placeholder="Client or company name" />
        <DateField label="Period start" value={periodStart} onChange={setPeriodStart} />
        <DateField label="Period end" value={periodEnd} onChange={setPeriodEnd} />
        <Field label="Total amount (£)" value={totalAmount} onChange={setTotalAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <DateField label="Received date" value={receivedDate} onChange={setReceivedDate} maximumDate={new Date()} />
        <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="" />

        <PrimaryButton label={file ? "Change invoice photo" : "Attach invoice photo (optional)"} onPress={async () => setFile((await pickFromFiles()) ?? file)} />
        <Text style={{ color: colors.accent, textAlign: "center", marginTop: spacing.sm }} onPress={async () => setFile((await pickDocument()) ?? file)}>
          Attach a PDF instead
        </Text>
        {file && <ReceiptThumbnail uri={file.uri} isPdf={file.mimeType === "application/pdf"} filename={file.name} />}

        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Save income" onPress={handleSubmit} isLoading={isSubmitting} />
      </Card>

      {lastSummary && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
            {lastSummary.tax_year} running total
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <SnapshotTile label="Total income" value={`£${lastSummary.total_income.toFixed(2)}`} />
            <SnapshotTile label="Net profit" value={`£${lastSummary.net_profit.toFixed(2)}`} />
          </View>
        </Card>
      )}

      <Text style={{ color: colors.textMuted, textAlign: "center" }} onPress={() => navigation.navigate("IncomeHistory")}>
        View income history
      </Text>
    </Screen>
  );
}
