import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import { createExpense } from "../../api/expenses";
import { extractReceiptFields } from "../../api/receiptExtraction";
import { Card, DateField, Field, PrimaryButton, SmallAction, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueExpense, syncQueue } from "../../offlineQueue";
import { colors, spacing, typography } from "../../theme/tokens";

const CATEGORY_SUGGESTIONS = ["fuel", "travel", "parking_tolls", "vehicle_maintenance", "phone", "home_office", "ppe", "accountancy", "food", "other"];

type ImportRow = {
  key: string;
  file: PickedFile;
  included: boolean;
  isExtracting: boolean;
  extractionSucceeded: boolean;
  category: string;
  occurredAt: string;
  totalAmount: string;
  outcome: "pending" | "submitting" | "done" | "failed" | "queued";
};

// payment_method/reimbursement_status aren't shown per row — OCR can't
// infer either, so every imported row defaults to card/none, same as a
// fresh manual entry. If one's wrong, void it from History and re-log it
// correctly, same correction model the rest of the app already uses.
const DEFAULT_PAYMENT_METHOD = "card" as const;
const DEFAULT_REIMBURSEMENT_STATUS = "none" as const;

export function ImportReceiptsScreen(): React.JSX.Element {
  const { pickMultipleFromFiles } = useReceiptCapture();

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  function updateRow(key: string, patch: Partial<ImportRow>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handlePick(): Promise<void> {
    setStatus(null);
    setIsPicking(true);
    try {
      const files = await pickMultipleFromFiles();
      if (files.length === 0) return;

      const newRows: ImportRow[] = files.map((file, index) => ({
        key: `${Date.now()}-${index}`,
        file,
        included: true,
        isExtracting: true,
        extractionSucceeded: false,
        category: "",
        occurredAt: "",
        totalAmount: "",
        outcome: "pending"
      }));
      setRows((current) => [...current, ...newRows]);

      // Extract sequentially rather than in parallel — this is the same
      // paid-upgrade OCR endpoint single-capture auto-fill uses, no reason
      // to hammer it with N simultaneous requests for a bulk pick.
      for (const row of newRows) {
        try {
          const result = await extractReceiptFields(row.file.uri, row.file.name, row.file.mimeType);
          updateRow(row.key, {
            isExtracting: false,
            extractionSucceeded: result.extraction_succeeded,
            included: result.extraction_succeeded,
            category: result.category ?? "",
            occurredAt: result.occurred_at ?? "",
            totalAmount: result.total_amount !== null ? String(result.total_amount) : ""
          });
        } catch {
          updateRow(row.key, { isExtracting: false, extractionSucceeded: false, included: false });
        }
      }
    } finally {
      setIsPicking(false);
    }
  }

  async function handleImport(): Promise<void> {
    const included = rows.filter((row) => row.included && row.outcome === "pending");
    if (included.length === 0) {
      setStatus({ kind: "error", text: "No receipts selected to import." });
      return;
    }

    setStatus(null);
    setIsImporting(true);

    let succeeded = 0;
    let queued = 0;
    let failed = 0;

    for (const row of included) {
      const amount = Number(row.totalAmount);
      if (!row.category.trim() || !Number.isFinite(amount) || amount <= 0 || !row.occurredAt) {
        updateRow(row.key, { outcome: "failed" });
        failed += 1;
        continue;
      }

      updateRow(row.key, { outcome: "submitting" });
      const fields = {
        category: row.category.trim(),
        occurred_at: row.occurredAt,
        payment_method: DEFAULT_PAYMENT_METHOD,
        total_amount: amount,
        reimbursement_status: DEFAULT_REIMBURSEMENT_STATUS,
        business_use_percent: 100
      };

      try {
        await createExpense({ ...fields, receiptUri: row.file.uri, receiptName: row.file.name, receiptType: row.file.mimeType });
        updateRow(row.key, { outcome: "done" });
        succeeded += 1;
      } catch (error) {
        if (error instanceof ApiError) {
          updateRow(row.key, { outcome: "failed" });
          failed += 1;
        } else {
          await enqueueExpense(fields, row.file.uri, row.file.name, row.file.mimeType);
          updateRow(row.key, { outcome: "queued" });
          queued += 1;
        }
      }
    }

    if (queued > 0) {
      void syncQueue();
    }

    const parts = [
      succeeded > 0 ? `${succeeded} imported` : null,
      queued > 0 ? `${queued} saved offline (will sync)` : null,
      failed > 0 ? `${failed} failed — fix and retry` : null
    ].filter(Boolean);
    setStatus({ kind: failed > 0 ? "error" : "info", text: parts.join(", ") || "Nothing imported." });
    setIsImporting(false);
  }

  const pendingCount = rows.filter((row) => row.included && row.outcome === "pending").length;

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Import past receipts</Text>
      <Text style={{ color: colors.textSecondary }}>
        For receipts you already have from before you started using Evolution. Pick several photos at once — each
        one gets auto-read, then you review and correct before importing.
      </Text>
      {status && <StatusBanner kind={status.kind} text={status.text} />}

      <PrimaryButton label="Pick receipt photos" onPress={handlePick} isLoading={isPicking} />

      {rows.map((row) => (
        <Card key={row.key}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ReceiptThumbnail uri={row.file.uri} isPdf={false} filename={row.file.name} />
            </View>
            {row.isExtracting && <ActivityIndicator color={colors.accent} />}
            {row.outcome === "done" && <Text style={{ color: colors.accent, fontWeight: "700" }}>Imported</Text>}
            {row.outcome === "queued" && <Text style={{ color: colors.accent, fontWeight: "700" }}>Queued</Text>}
            {row.outcome === "failed" && <Text style={{ color: colors.danger, fontWeight: "700" }}>Failed</Text>}
          </View>

          {!row.isExtracting && row.outcome === "pending" && (
            <>
              {!row.extractionSucceeded && (
                <Text style={{ color: colors.textMuted, fontSize: typography.small, marginBottom: spacing.sm }}>
                  Couldn't read this one automatically — fill in the details or leave it unchecked to skip.
                </Text>
              )}
              <Field label="Category" value={row.category} onChange={(value) => updateRow(row.key, { category: value })} placeholder="fuel, food, phone..." />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md }}>
                {CATEGORY_SUGGESTIONS.map((suggestion) => (
                  <SmallAction
                    key={suggestion}
                    label={suggestion}
                    active={row.category === suggestion}
                    onPress={() => updateRow(row.key, { category: suggestion })}
                  />
                ))}
              </View>
              <DateField
                label="Date"
                value={row.occurredAt}
                onChange={(value) => updateRow(row.key, { occurredAt: value })}
                maximumDate={new Date()}
              />
              <Field
                label="Amount (£)"
                value={row.totalAmount}
                onChange={(value) => updateRow(row.key, { totalAmount: value })}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <SmallAction
                label={row.included ? "Included — tap to skip" : "Skipped — tap to include"}
                active={row.included}
                onPress={() => updateRow(row.key, { included: !row.included })}
              />
            </>
          )}
        </Card>
      ))}

      {rows.length > 0 && (
        <PrimaryButton
          label={`Import ${pendingCount} receipt${pendingCount === 1 ? "" : "s"}`}
          onPress={handleImport}
          isLoading={isImporting}
          disabled={pendingCount === 0}
        />
      )}
    </Screen>
  );
}
