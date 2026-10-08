import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { getExpense, voidExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { useAccess } from "../../auth/AuthContext";
import { Card, DangerAction, Field, StatusBanner } from "../../components/Controls";
import { ImageViewerModal } from "../../components/ImageViewerModal";
import { Screen } from "../../components/Screen";
import { useReceiptCapture } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import { humanizeCategory } from "../../utils/category";
import { formatUkDate } from "../../utils/taxYear";
import type { ExpensesStackParamList } from "../../navigation/types";
import { formatGbp } from "../../utils/money";

type Props = NativeStackScreenProps<ExpensesStackParamList, "CompareExpenses">;

// Two expenses side by side — a suspected duplicate, or a resubmitted entry
// and its original — so the user can see what differs and void the right
// one without hopping between screens.

const money = formatGbp;
const loggedAt = (iso: string) => {
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? iso : `${formatUkDate(iso.slice(0, 10))} ${d.toTimeString().slice(0, 5)}`;
};

const ROWS: { label: string; value: (e: Expense) => string }[] = [
  { label: "Amount", value: (e) => money(e.total_amount) },
  { label: "Date", value: (e) => formatUkDate(e.occurred_at) },
  { label: "Category", value: (e) => humanizeCategory(e.category) },
  { label: "Paid by", value: (e) => (e.payment_method === "card" ? "Card" : "Cash") },
  { label: "Business use", value: (e) => `${e.business_use_percent}%` },
  { label: "Notes", value: (e) => e.notes?.trim() || "—" },
  { label: "Logged", value: (e) => loggedAt(e.created_at) }
];

export function CompareExpensesScreen({ route, navigation }: Props): React.JSX.Element {
  const { leftId, rightId } = route.params;
  const { canWrite } = useAccess();
  const { downloadToLocalUri, openLocalFile } = useReceiptCapture();
  const [pair, setPair] = useState<[Expense, Expense] | null>(null);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([getExpense(leftId), getExpense(rightId)]);
      setPair([a, b]);
      // Photo receipts are downloaded to show side by side; PDFs open on tap instead.
      for (const e of [a, b]) {
        if (e.receipt_download_url && e.receipt_mime_type !== "application/pdf") {
          void downloadToLocalUri(e.receipt_download_url, `compare-${e.id}.jpg`).then((uri) => setImages((m) => ({ ...m, [e.id]: uri })));
        }
      }
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not load these expenses." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftId, rightId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startVoid(target: Expense, other: Expense): void {
    setVoidingId(target.id);
    setReason(`Duplicate of the ${money(other.total_amount)} ${humanizeCategory(other.category).toLowerCase()} entry on ${formatUkDate(other.occurred_at)}`);
  }

  async function confirmVoid(target: Expense, kept: Expense): Promise<void> {
    setIsVoiding(true);
    setStatus(null);
    try {
      await voidExpense(target.id, reason.trim());
      // Land on the one that was kept.
      navigation.replace("ExpenseDetail", { expenseId: kept.id });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Could not void it." });
    } finally {
      setIsVoiding(false);
    }
  }

  if (!pair) {
    return (
      <Screen>
        {status ? <StatusBanner kind={status.kind} text={status.text} /> : <ActivityIndicator color={colors.accent} />}
      </Screen>
    );
  }

  const [a, b] = pair;
  const column = (e: Expense, other: Expense, label: string) => (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <Text style={{ fontWeight: "700", color: colors.textMain, textAlign: "center" }}>{label}</Text>
      {e.receipt_download_url ? (
        e.receipt_mime_type === "application/pdf" ? (
          <Pressable
            onPress={() =>
              void downloadToLocalUri(e.receipt_download_url!, `receipt-${e.id}.pdf`).then((uri) => {
                if (uri) void openLocalFile(uri, "application/pdf");
              })
            }
            style={{ height: 150, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Open PDF</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => images[e.id] && setViewerUri(images[e.id]!)}>
            {images[e.id] ? (
              <Image source={{ uri: images[e.id]! }} style={{ height: 150, borderRadius: 10 }} resizeMode="cover" />
            ) : (
              <View style={{ height: 150, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
          </Pressable>
        )
      ) : (
        <View style={{ height: 150, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted }}>No receipt</Text>
        </View>
      )}
      {e.voided_at ? (
        <Text style={{ color: colors.danger, fontWeight: "700", textAlign: "center" }}>Voided</Text>
      ) : canWrite && voidingId !== e.id ? (
        <DangerAction label="Void this one" onPress={() => startVoid(e, other)} />
      ) : null}
    </View>
  );

  const voidingTarget = voidingId === a.id ? a : voidingId === b.id ? b : null;
  const kept = voidingTarget ? (voidingTarget.id === a.id ? b : a) : null;

  return (
    <Screen>
      <Text style={{ color: colors.textMuted }}>Tap a receipt to see it full size. Differences are highlighted.</Text>
      <Card>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {column(a, b, "This entry")}
          {column(b, a, "Other entry")}
        </View>
      </Card>

      <Card>
        {ROWS.map((row) => {
          const va = row.value(a);
          const vb = row.value(b);
          const differs = va !== vb && row.label !== "Logged";
          const cell = (v: string) => (
            <Text
              style={{
                flex: 1,
                color: differs ? colors.danger : colors.textSecondary,
                fontWeight: differs ? "700" : "400",
                fontSize: typography.small
              }}
            >
              {v}
            </Text>
          );
          return (
            <View key={row.label} style={{ paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
              <Text style={{ color: colors.textMuted, fontSize: typography.micro }}>{row.label}</Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                {cell(va)}
                {cell(vb)}
              </View>
            </View>
          );
        })}
      </Card>

      {voidingTarget && kept && (
        <Card>
          <Text style={{ fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Void the {voidingTarget.id === a.id ? "first" : "second"} entry ({money(voidingTarget.total_amount)}, {formatUkDate(voidingTarget.occurred_at)})?
          </Text>
          <Field label="Reason" value={reason} onChange={setReason} />
          {status && <StatusBanner kind={status.kind} text={status.text} />}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <DangerAction label="Confirm void" onPress={() => void confirmVoid(voidingTarget, kept)} isLoading={isVoiding} disabled={!reason.trim()} />
            </View>
          </View>
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: spacing.sm }} onPress={() => setVoidingId(null)}>
            Cancel
          </Text>
        </Card>
      )}
      {!voidingTarget && status && <StatusBanner kind={status.kind} text={status.text} />}

      <ImageViewerModal visible={viewerUri !== null} uri={viewerUri} isLoading={false} onClose={() => setViewerUri(null)} />
    </Screen>
  );
}
