// See useReceiptCapture.ts for why this imports the /legacy subpath.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { fetchExportText } from "../../api/tax";
import { ApiError } from "../../api/client";
import { getTaxYearLockStatus, lockTaxYear, unlockTaxYear, type TaxYearLockStatus } from "../../api/taxYearLock";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner } from "../../components/Controls";
import { Screen } from "../../components/Screen";
import { colors, spacing, typography } from "../../theme/tokens";
import { getTaxYearFromDate } from "../../utils/taxYear";

const TAX_YEAR_FORMAT = /^\d{4}-\d{2}$/;

export function ExportScreen(): React.JSX.Element {
  const [taxYear, setTaxYear] = useState(getTaxYearFromDate(new Date()));
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const [lockStatus, setLockStatus] = useState<TaxYearLockStatus | null>(null);
  const [isLockBusy, setIsLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  // Refetches whenever the tax year field holds a complete, valid value —
  // not on every keystroke of a partial one.
  useEffect(() => {
    if (!TAX_YEAR_FORMAT.test(taxYear)) {
      setLockStatus(null);
      return;
    }
    let cancelled = false;
    getTaxYearLockStatus(taxYear)
      .then((result) => {
        if (!cancelled) setLockStatus(result);
      })
      .catch(() => {
        if (!cancelled) setLockStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [taxYear]);

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

  async function handleLock(): Promise<void> {
    setLockError(null);
    setIsLockBusy(true);
    try {
      await lockTaxYear(taxYear);
      setLockStatus(await getTaxYearLockStatus(taxYear));
    } catch (error) {
      setLockError(error instanceof ApiError ? error.message : "Could not lock this tax year.");
    } finally {
      setIsLockBusy(false);
    }
  }

  async function handleUnlock(): Promise<void> {
    setLockError(null);
    setIsLockBusy(true);
    try {
      await unlockTaxYear(taxYear);
      setLockStatus(await getTaxYearLockStatus(taxYear));
    } catch (error) {
      setLockError(error instanceof ApiError ? error.message : "Could not unlock this tax year.");
    } finally {
      setIsLockBusy(false);
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

      {lockStatus && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm }}>
            Filed status
          </Text>
          {lockError && <StatusBanner kind="error" text={lockError} />}
          {lockStatus.locked ? (
            <>
              <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
                Locked on {lockStatus.locked_at?.slice(0, 10)} — this tax year's data is protected from Reset all
                data. A copy of the export from that moment is archived below.
              </Text>
              <View style={{ gap: spacing.sm }}>
                {lockStatus.archive_download_url && (
                  <PrimaryButton
                    label="View archived copy"
                    onPress={() => Linking.openURL(lockStatus.archive_download_url as string)}
                  />
                )}
                <DangerAction label="Unlock this tax year" onPress={handleUnlock} isLoading={isLockBusy} />
              </View>
            </>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
                Archives today's export and protects this tax year's data from Reset all data. Use this once you've
                actually filed a Self Assessment return using these figures.
              </Text>
              <PrimaryButton label="Lock this tax year" onPress={handleLock} isLoading={isLockBusy} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
