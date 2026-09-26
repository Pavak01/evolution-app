import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { listIncomeInvoices, voidIncomeInvoice } from "../../api/income";
import { ApiError } from "../../api/client";
import type { IncomeInvoice } from "../../api/types";
import { DangerAction, Field, SmallAction, StatusBanner } from "../../components/Controls";
import { ImageViewerModal } from "../../components/ImageViewerModal";
import { PendingUploads } from "../../components/PendingUploads";
import { useReceiptCapture } from "../../hooks/useReceiptCapture";
import { listPending, removePending, syncQueue, type PendingItem } from "../../offlineQueue";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { formatUkDate, getTaxYearFromDate } from "../../utils/taxYear";

function InvoiceRow({ invoice, onVoided }: { invoice: IncomeInvoice; onVoided: () => void }): React.JSX.Element {
  const { downloadToLocalUri, shareLocalUri } = useReceiptCapture();
  const [isExpanded, setIsExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  async function handleVoid(): Promise<void> {
    if (!reason.trim()) {
      setError("Enter a reason.");
      return;
    }
    setIsVoiding(true);
    setError(null);
    try {
      await voidIncomeInvoice(invoice.id, reason.trim());
      onVoided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not void this income.");
    } finally {
      setIsVoiding(false);
    }
  }

  // A PDF or CSV can't be shown in ImageViewerModal (it only renders
  // <Image>), and the download URL itself can't be opened externally either
  // — it's a requireAuth-protected backend route, not a public link. So
  // either goes through the same authenticated download as an image, then
  // hands off to the OS share sheet (the same content-URI-safe path already
  // proven for CSV export) instead of the in-app viewer.
  async function handleViewInvoice(): Promise<void> {
    if (!invoice.file_download_url) return;

    if (invoice.invoice_mime_type === "application/pdf" || invoice.invoice_mime_type === "text/csv") {
      const extension = invoice.invoice_mime_type === "text/csv" ? "csv" : "pdf";
      setIsOpeningFile(true);
      const localUri = await downloadToLocalUri(invoice.file_download_url, `${invoice.source}-invoice.${extension}`);
      setIsOpeningFile(false);
      if (localUri) {
        await shareLocalUri(localUri);
      }
      return;
    }

    setViewerVisible(true);
    setViewerLoading(true);
    setViewerUri(null);
    const localUri = await downloadToLocalUri(invoice.file_download_url, `${invoice.source}-invoice`);
    setViewerUri(localUri);
    setViewerLoading(false);
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.source}>{invoice.source}</Text>
        <Text style={styles.period}>
          {formatUkDate(invoice.period_start)} → {formatUkDate(invoice.period_end)}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amount}>£{invoice.total_amount.toFixed(2)}</Text>
        {invoice.voided_at ? (
          <Text style={styles.voided}>voided</Text>
        ) : (
          <SmallAction label="Void" onPress={() => setIsExpanded((v) => !v)} />
        )}
      </View>
      {invoice.file_download_url && (
        <Text style={styles.viewLink} onPress={handleViewInvoice}>
          {isOpeningFile ? "Opening…" : "View invoice"}
        </Text>
      )}
      {isExpanded && !invoice.voided_at && (
        <View style={styles.expandWrap}>
          <Field label="Reason" value={reason} onChange={setReason} placeholder="Duplicate, wrong amount..." />
          {error && <StatusBanner kind="error" text={error} />}
          <DangerAction label="Confirm void" onPress={handleVoid} isLoading={isVoiding} disabled={!reason.trim()} />
        </View>
      )}
      <ImageViewerModal
        visible={viewerVisible}
        uri={viewerUri}
        isLoading={viewerLoading}
        onClose={() => setViewerVisible(false)}
        onShare={viewerUri ? () => shareLocalUri(viewerUri) : undefined}
      />
    </View>
  );
}

export function IncomeHistoryScreen(): React.JSX.Element {
  const [invoices, setInvoices] = useState<IncomeInvoice[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    // Independent try/catch per source: listPending() is purely local and
    // must still populate while offline, when listIncomeInvoices()'s
    // network call is exactly the thing failing — bundling them in one
    // Promise.all meant a network failure silently hid the pending items too.
    try {
      const allPending = await listPending();
      setPending(allPending.filter((item) => item.kind === "income"));
    } catch {
      // pending list is local-only; a failure here isn't user-facing
    }
    try {
      const taxYear = getTaxYearFromDate(new Date());
      setInvoices(await listIncomeInvoices({ tax_year: taxYear }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load income.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRetry = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncQueue(load);
      await load();
    } finally {
      setIsSyncing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {error && (
        <View style={styles.errorWrap}>
          <StatusBanner kind="error" text={error} />
        </View>
      )}
      <PendingUploads
        items={pending}
        isSyncing={isSyncing}
        onRetry={handleRetry}
        onDelete={(localId) => {
          void removePending(localId).then(load);
        }}
      />
      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No income recorded yet this tax year.</Text>}
        renderItem={({ item }) => <InvoiceRow invoice={item} onVoided={load} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  errorWrap: { padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: spacing.xxl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    gap: spacing.sm
  },
  rowMain: { flexDirection: "row", justifyContent: "space-between" },
  source: { fontSize: typography.body, fontWeight: "700", color: colors.textMain },
  period: { fontSize: typography.small, color: colors.textMuted },
  rowEnd: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: typography.body, fontWeight: "700", color: colors.snapshotValue },
  voided: { fontSize: typography.micro, color: colors.danger, textTransform: "uppercase" },
  expandWrap: { marginTop: spacing.sm, gap: spacing.sm },
  viewLink: { color: colors.accent, fontWeight: "600", fontSize: typography.small }
});
