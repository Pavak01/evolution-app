import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { PendingItem } from "../offlineQueue";
import { colors, radius, spacing, typography } from "../theme/tokens";

export function PendingUploads({
  items,
  isSyncing,
  onRetry,
  onDelete
}: {
  items: PendingItem[];
  isSyncing: boolean;
  onRetry: () => void;
  onDelete: (localId: string) => void;
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {items.length} pending upload{items.length === 1 ? "" : "s"}
        </Text>
        <Pressable onPress={onRetry} disabled={isSyncing}>
          {isSyncing ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.retry}>Retry now</Text>}
        </Pressable>
      </View>
      {items.map((item) => (
        <View key={item.localId} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.label}>{item.kind === "expense" ? item.input.category : item.input.source}</Text>
            <Text style={styles.sub}>Saved on device — no connection yet</Text>
          </View>
          <View style={styles.rowEnd}>
            <Text style={styles.amount}>£{item.input.total_amount.toFixed(2)}</Text>
            <Pressable onPress={() => onDelete(item.localId)}>
              <Text style={styles.delete}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: typography.small, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },
  retry: { fontSize: typography.small, fontWeight: "700", color: colors.accent },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    padding: spacing.md
  },
  rowMain: { gap: spacing.xs },
  label: { fontSize: typography.body, fontWeight: "700", color: colors.textMain, textTransform: "capitalize" },
  sub: { fontSize: typography.micro, color: colors.textMuted },
  rowEnd: { alignItems: "flex-end", gap: spacing.xs },
  amount: { fontSize: typography.body, fontWeight: "700", color: colors.snapshotValue },
  delete: { fontSize: typography.small, color: colors.danger, fontWeight: "700" }
});
