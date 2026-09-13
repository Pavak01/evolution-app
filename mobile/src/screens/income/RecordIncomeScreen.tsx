import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { createIncomeInvoice } from "../../api/income";
import { ApiError } from "../../api/client";
import type { TaxSummary } from "../../api/types";
import { Card, DateField, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTodayIso } from "../../utils/taxYear";
import type { IncomeStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<IncomeStackParamList, "RecordIncome">;

export function RecordIncomeScreen({ navigation }: Props): React.JSX.Element {
  // pickDocument (expo-document-picker, covers PDF) is implemented but its
  // copy-to-cache output is unreadable by every API tried against it, in
  // Expo Go, on Android — a sandboxing quirk, not a bug in how it is
  // called (see the fix history on useReceiptCapture.ts). Deferred until
  // this can be verified on a real EAS/dev-client build rather than Expo
  // Go, since that sandbox may not be present there. pickFromFiles
  // (expo-image-picker) covers images only, but is proven working.
  const { pickFromFiles } = useReceiptCapture();

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
      setStatus({ kind: "error", text: validationError });
      return;
    }

    setStatus(null);
    setIsSubmitting(true);
    try {
      const { summary } = await createIncomeInvoice({
        period_start: periodStart,
        period_end: periodEnd,
        source: source.trim(),
        total_amount: Number(totalAmount),
        received_date: receivedDate,
        notes: notes.trim() || undefined,
        fileUri: file?.uri,
        fileName: file?.name,
        fileType: file?.mimeType
      });
      setLastSummary(summary);
      setStatus({ kind: "info", text: "Income recorded." });
      setSource("");
      setTotalAmount("");
      setNotes("");
      setFile(null);
    } catch (error) {
      console.error("Income submit failed:", error);
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : `Could not record this income: ${String(error)}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Record income</Text>

      <Card>
        <Field label="Who paid you" value={source} onChange={setSource} placeholder="Client or company name" />
        <DateField label="Period start" value={periodStart} onChange={setPeriodStart} />
        <DateField label="Period end" value={periodEnd} onChange={setPeriodEnd} />
        <Field label="Total amount (£)" value={totalAmount} onChange={setTotalAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <DateField label="Received date" value={receivedDate} onChange={setReceivedDate} maximumDate={new Date()} />
        <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="" />

        <PrimaryButton label={file ? "Change invoice photo" : "Attach invoice photo (optional)"} onPress={async () => setFile((await pickFromFiles()) ?? file)} />
        {file && <ReceiptThumbnail uri={file.uri} isPdf={file.mimeType === "application/pdf"} filename={file.name} />}

        {status && <StatusBanner kind={status.kind} text={status.text} />}
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
