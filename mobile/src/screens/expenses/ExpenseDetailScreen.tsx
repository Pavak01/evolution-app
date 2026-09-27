import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Text, View, type ScrollView } from "react-native";
import { attachReceipt, getExpense, voidExpense } from "../../api/expenses";
import { ApiError } from "../../api/client";
import type { Expense } from "../../api/types";
import { Card, DangerAction, Field, PrimaryButton, StatusBanner, SummaryRow } from "../../components/Controls";
import { ImageViewerModal } from "../../components/ImageViewerModal";
import { Screen } from "../../components/Screen";
import { useReceiptCapture } from "../../hooks/useReceiptCapture";
import { colors, spacing, typography } from "../../theme/tokens";
import { humanizeCategory } from "../../utils/category";
import { formatUkDate, getTodayIso } from "../../utils/taxYear";
import type { ExpensesStackParamList, MainTabParamList } from "../../navigation/types";

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

type Props = NativeStackScreenProps<ExpensesStackParamList, "ExpenseDetail">;

export function ExpenseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { expenseId } = route.params;
  const { captureFromCamera, downloadToLocalUri, pickFromFiles, shareLocalUri } = useReceiptCapture();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setExpense(await getExpense(expenseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this expense.");
    } finally {
      setIsLoading(false);
    }
  }, [expenseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleViewReceipt(): Promise<void> {
    if (!expense?.receipt_download_url) return;
    setViewerVisible(true);
    setViewerLoading(true);
    setViewerUri(null);
    const localUri = await downloadToLocalUri(expense.receipt_download_url, `${expense.category}-receipt`);
    setViewerUri(localUri);
    setViewerLoading(false);
  }

  async function handleAttachReceipt(pick: () => Promise<{ uri: string; name: string; mimeType: string } | null>): Promise<void> {
    const file = await pick();
    if (!file) return;

    setIsAttaching(true);
    setError(null);
    try {
      await attachReceipt(expenseId, file.uri, file.name, file.mimeType);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not attach the receipt.");
    } finally {
      setIsAttaching(false);
    }
  }

  // Opens a fresh Capture entry prefilled from this voided expense — the
  // whole point being to avoid retyping everything and separately
  // re-attaching the photo by hand. Downloads the receipt locally first
  // (CaptureExpenseScreen has no download step of its own, only ever deals
  // in local files already picked/captured). occurredAt prefills to today,
  // not this expense's original date — resubmitting corrects a mistake and
  // logs it now, not re-backdates it; still fully editable either way.
  async function handleResubmit(): Promise<void> {
    if (!expense) return;

    setIsResubmitting(true);
    setError(null);
    try {
      let file: { uri: string; name: string; mimeType: string } | null = null;
      if (expense.receipt_download_url && expense.receipt_mime_type) {
        const ext = extensionForMimeType(expense.receipt_mime_type);
        const localUri = await downloadToLocalUri(expense.receipt_download_url, `receipt.${ext}`);
        if (localUri) {
          file = { uri: localUri, name: `receipt.${ext}`, mimeType: expense.receipt_mime_type };
        }
      }

      navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()?.navigate("Capture", {
        screen: "CaptureForm",
        params: {
          resubmit: {
            category: expense.category,
            totalAmount: String(expense.total_amount),
            occurredAt: getTodayIso(),
            businessUsePercent: String(expense.business_use_percent),
            notes: expense.notes ?? "",
            file,
            originalExpenseId: expense.id
          }
        }
      });
    } finally {
      setIsResubmitting(false);
    }
  }

  async function handleVoid(): Promise<void> {
    if (!voidReason.trim()) {
      setError("Enter a reason for voiding this expense.");
      return;
    }

    setIsVoiding(true);
    setError(null);
    try {
      await voidExpense(expenseId, voidReason.trim());
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not void this expense.");
    } finally {
      setIsVoiding(false);
    }
  }

  if (isLoading || !expense) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Screen ref={scrollRef}>
      <Text style={{ fontSize: typography.h1, fontWeight: "700", color: colors.textMain }}>
        {humanizeCategory(expense.category)}
      </Text>

      <Card>
        <SummaryRow label="Total" value={expense.total_amount} />
        <SummaryRow label="Net deductible" value={expense.net_deductible_amount} />
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
          {formatUkDate(expense.occurred_at)} · {expense.payment_method}
          {expense.business_use_percent !== 100 ? ` · ${expense.business_use_percent}% business use` : ""}
        </Text>
        {expense.notes && <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{expense.notes}</Text>}
        {expense.voided_at && (
          <Text style={{ color: colors.danger, marginTop: spacing.sm, fontWeight: "700" }}>
            Voided: {expense.void_reason}
          </Text>
        )}
      </Card>

      {expense.voided_at && (
        <PrimaryButton label="Resubmit" onPress={handleResubmit} isLoading={isResubmitting} />
      )}

      {expense.possible_duplicate && !expense.voided_at && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Possible duplicate
          </Text>
          <Text style={{ color: colors.textSecondary }}>{expense.possible_duplicate.message}</Text>
          <Text
            style={{ color: colors.accent, marginTop: spacing.sm, fontWeight: "600" }}
            onPress={() => navigation.navigate("ExpenseDetail", { expenseId: expense.possible_duplicate!.expense_id })}
          >
            Open the other entry
          </Text>
        </Card>
      )}

      {expense.resubmitted_from && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.sm }}>
            Resubmitted
          </Text>
          <Text style={{ color: colors.textSecondary }}>{expense.resubmitted_from.message}</Text>
          <Text
            style={{ color: colors.accent, marginTop: spacing.sm, fontWeight: "600" }}
            onPress={() => navigation.navigate("ExpenseDetail", { expenseId: expense.resubmitted_from!.expense_id })}
          >
            Open the original entry
          </Text>
        </Card>
      )}

      {expense.receipt_download_url ? (
        <PrimaryButton label="View receipt" onPress={handleViewReceipt} />
      ) : (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Missing receipt
          </Text>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
            This travel expense isn't counted as deductible yet — attach proof (a bank statement screenshot, app
            payment confirmation, or emailed receipt) to claim it.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Take photo" onPress={() => handleAttachReceipt(captureFromCamera)} isLoading={isAttaching} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Choose photo" onPress={() => handleAttachReceipt(pickFromFiles)} isLoading={isAttaching} />
            </View>
          </View>
        </Card>
      )}
      <ImageViewerModal
        visible={viewerVisible}
        uri={viewerUri}
        isLoading={viewerLoading}
        onClose={() => setViewerVisible(false)}
        onShare={viewerUri ? () => shareLocalUri(viewerUri) : undefined}
      />

      {!expense.voided_at && (
        <Card>
          <Text style={{ fontSize: typography.body, fontWeight: "700", color: colors.danger, marginBottom: spacing.sm }}>
            Void this expense
          </Text>
          <Field
            label="Reason"
            value={voidReason}
            onChange={setVoidReason}
            placeholder="Duplicate entry, wrong amount..."
            onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
          />
          {error && <StatusBanner kind="error" text={error} />}
          <View style={{ height: spacing.sm }} />
          <DangerAction label="Void expense" onPress={handleVoid} isLoading={isVoiding} disabled={!voidReason.trim()} />
        </Card>
      )}
    </Screen>
  );
}
