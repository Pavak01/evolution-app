// See useReceiptCapture.ts for why this imports the /legacy subpath.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Text } from "react-native";
import { fetchExportText } from "../../api/tax";
import { ApiError } from "../../api/client";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";

export function ExportScreen(): React.JSX.Element {
  const [taxYear, setTaxYear] = useState(getTaxYearFromDate(new Date()));
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  // CSV only — JSON isn't useful to the person actually using this export
  // (handing figures to an accountant, or reading them themselves); it's a
  // machine format with nothing here currently consuming it programmatically.
  async function handleExport(): Promise<void> {
    setStatus(null);
    setIsExporting(true);
    try {
      const text = await fetchExportText(taxYear, "csv");
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) {
        setStatus({ kind: "error", text: "No writable directory is available on this device." });
        return;
      }

      const fileUri = `${baseDir}self-assessment-${taxYear}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: `Export ${taxYear}` });
      } else {
        setStatus({ kind: "info", text: `Saved to ${fileUri}` });
      }
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Export failed." });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Export</Text>
      <Card>
        <Field label="Tax year" value={taxYear} onChange={setTaxYear} placeholder="2026-27" />
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <PrimaryButton label="Export as CSV" onPress={handleExport} isLoading={isExporting} />
      </Card>
    </Screen>
  );
}
