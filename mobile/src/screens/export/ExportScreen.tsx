import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { fetchExportText } from "../../api/tax";
import { ApiError } from "../../api/client";
import { Card, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";

export function ExportScreen(): React.JSX.Element {
  const [taxYear, setTaxYear] = useState(getTaxYearFromDate(new Date()));
  const [isExporting, setIsExporting] = useState<"csv" | "json" | null>(null);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function handleExport(format: "csv" | "json"): Promise<void> {
    setStatus(null);
    setIsExporting(format);
    try {
      const text = await fetchExportText(taxYear, format);
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) {
        setStatus({ kind: "error", text: "No writable directory is available on this device." });
        return;
      }

      const fileUri = `${baseDir}self-assessment-${taxYear}.${format}`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { dialogTitle: `Export ${taxYear}` });
      } else {
        setStatus({ kind: "info", text: `Saved to ${fileUri}` });
      }
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof ApiError ? error.message : "Export failed." });
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>Export</Text>
      <Card>
        <Field label="Tax year" value={taxYear} onChange={setTaxYear} placeholder="2026-27" />
        {status && <StatusBanner kind={status.kind} text={status.text} />}
        <View style={{ gap: spacing.sm }}>
          <PrimaryButton label="Export as CSV" onPress={() => handleExport("csv")} isLoading={isExporting === "csv"} />
          <PrimaryButton label="Export as JSON" onPress={() => handleExport("json")} isLoading={isExporting === "json"} />
        </View>
      </Card>
    </Screen>
  );
}
