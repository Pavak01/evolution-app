import React, { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../../api/client";
import { createIncomeInvoice } from "../../api/income";
import { getTaxSummary } from "../../api/tax";
import type { TaxSummary } from "../../api/types";
import { Card, Field, PrimaryButton, SmallAction, SnapshotTile, StatusBanner } from "../../components/Controls";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { Screen } from "../../components/Screen";
import { useReceiptCapture, type PickedFile } from "../../hooks/useReceiptCapture";
import { enqueueIncome, generateLocalId, syncQueue } from "../../offlineQueue";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatUkDate, getTaxYearFromDate } from "../../utils/taxYear";
import { parseIncomeCsv, type ParsedIncomeCsvRow } from "../../utils/parseIncomeCsv";

type ImportRow = ParsedIncomeCsvRow & {
  key: string;
  included: boolean;
  outcome: "pending" | "submitting" | "done" | "failed" | "queued";
};

export function ImportIncomeCsvScreen(): React.JSX.Element {
  const { pickDocument, readLocalTextFile } = useReceiptCapture();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [source, setSource] = useState("");
  const [isPicking, setIsPicking] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<TaxSummary | null>(null);
  const [otherTaxYears, setOtherTaxYears] = useState<string[]>([]);

  function updateRow(key: string, patch: Partial<ImportRow>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handlePick(): Promise<void> {
    setStatus(null);
    setFile(null);
    setRows([]);
    setSkippedCount(0);
    setIsPicking(true);
    try {
      const picked = await pickDocument("csv");
      if (!picked) return;

      if (picked.mimeType !== "text/csv") {
        setStatus({ kind: "error", text: "Please pick a CSV file." });
        return;
      }

      const text = await readLocalTextFile(picked.uri);
      const result = parseIncomeCsv(text);

      if (result.error) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      if (result.rows.length === 0) {
        setStatus({ kind: "error", text: "No usable rows were found in this file." });
        return;
      }

      setFile(picked);
      setSkippedCount(result.skippedCount);
      setRows(
        result.rows.map((row, index) => ({
          ...row,
          key: `${Date.now()}-${index}`,
          included: true,
          outcome: "pending"
        }))
      );
    } finally {
      setIsPicking(false);
    }
  }

  async function handleImport(): Promise<void> {
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      setStatus({ kind: "error", text: "Enter who paid you before importing." });
      return;
    }

    const included = rows.filter((row) => row.included && row.outcome === "pending");
    if (included.length === 0) {
      setStatus({ kind: "error", text: "No rows selected to import." });
      return;
    }

    setStatus(null);
    setIsImporting(true);

    let succeeded = 0;
    let queued = 0;
    let failed = 0;
    const currentTaxYear = getTaxYearFromDate(new Date());
    const touchedOtherYears = new Set<string>();

    for (const row of included) {
      updateRow(row.key, { outcome: "submitting" });
      // Generated once per row, before its attempt, and reused on any retry
      // (direct or offline-queued) — same pattern as every other create
      // flow in this app, so a lost response never creates a duplicate.
      const idempotencyKey = generateLocalId();
      const fields = {
        period_start: row.date,
        period_end: row.date,
        source: trimmedSource,
        total_amount: row.totalAmount,
        received_date: row.date,
        notes: `Invoice ${row.invoiceNumber}`,
        idempotencyKey
      };

      try {
        const { invoice } = await createIncomeInvoice({
          ...fields,
          fileUri: file?.uri,
          fileName: file?.name,
          fileType: file?.mimeType
        });
        updateRow(row.key, { outcome: "done" });
        succeeded += 1;
        if (invoice.tax_year !== currentTaxYear) {
          touchedOtherYears.add(invoice.tax_year);
        }
      } catch (error) {
        if (error instanceof ApiError) {
          updateRow(row.key, { outcome: "failed" });
          failed += 1;
        } else {
          await enqueueIncome(fields, file?.uri, file?.name, file?.mimeType, idempotencyKey);
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
    setOtherTaxYears(Array.from(touchedOtherYears));

    if (succeeded > 0) {
      try {
        setLastSummary(await getTaxSummary(currentTaxYear));
      } catch {
        // Running total is a convenience, not the source of truth (that's
        // Summary) — a failed refresh just leaves the card showing nothing new.
      }
    }

    setIsImporting(false);
  }

  const pendingCount = rows.filter((row) => row.included && row.outcome === "pending").length;

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Import income from CSV</Text>
      <Text style={{ color: colors.textSecondary }}>
        For a report covering several invoices at once (e.g. an earnings export). Each row becomes its own income
        record — review and untick any you don't want before importing.
      </Text>
      {status && <StatusBanner kind={status.kind} text={status.text} />}

      <PrimaryButton label={file ? "Pick a different CSV" : "Pick CSV"} onPress={handlePick} isLoading={isPicking} />

      {file && rows.length > 0 && (
        <Card>
          <ReceiptThumbnail uri={file.uri} isPdf={false} isCsv filename={file.name} />
          {skippedCount > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: typography.small, marginTop: spacing.sm }}>
              {skippedCount} row{skippedCount === 1 ? "" : "s"} couldn't be read and {skippedCount === 1 ? "was" : "were"} skipped.
            </Text>
          )}
          <View style={{ height: spacing.sm }} />
          <Field label="Who paid you" value={source} onChange={setSource} placeholder="Client or company name" />
        </Card>
      )}

      {rows.map((row) => (
        <Card key={row.key}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: colors.textMain, fontWeight: "700" }}>
                {formatUkDate(row.date)} · £{row.totalAmount.toFixed(2)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typography.small }}>Invoice {row.invoiceNumber}</Text>
            </View>
            {row.outcome === "pending" && (
              <SmallAction
                label={row.included ? "Included — tap to skip" : "Skipped — tap to include"}
                active={row.included}
                onPress={() => updateRow(row.key, { included: !row.included })}
              />
            )}
            {row.outcome === "done" && <Text style={{ color: colors.accent, fontWeight: "700" }}>Imported</Text>}
            {row.outcome === "queued" && <Text style={{ color: colors.accent, fontWeight: "700" }}>Queued</Text>}
            {row.outcome === "failed" && <Text style={{ color: colors.danger, fontWeight: "700" }}>Failed</Text>}
          </View>
        </Card>
      ))}

      {rows.length > 0 && (
        <PrimaryButton
          label={`Import ${pendingCount} income record${pendingCount === 1 ? "" : "s"}`}
          onPress={handleImport}
          isLoading={isImporting}
          disabled={pendingCount === 0}
        />
      )}

      {lastSummary && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
            {lastSummary.tax_year} running total
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <SnapshotTile label="Total income" value={`£${lastSummary.total_income.toFixed(2)}`} />
            <SnapshotTile label="Net profit" value={`£${lastSummary.net_profit.toFixed(2)}`} />
          </View>
          {otherTaxYears.length > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: typography.small, marginTop: spacing.sm }}>
              This total is for {lastSummary.tax_year} only — some of what you just imported was logged to{" "}
              {otherTaxYears.join(", ")} instead, based on its own date, and shows up in that year's summary.
            </Text>
          )}
        </Card>
      )}
    </Screen>
  );
}
