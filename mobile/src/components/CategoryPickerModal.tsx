import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listUsedCategories } from "../api/expenses";
import { humanizeCategory } from "../utils/category";
import { colors, radius, spacing, typography } from "../theme/tokens";

// Mirrors the CATEGORY_SUGGESTIONS list duplicated across CaptureExpenseScreen/
// ImportReceiptsScreen/receiptExtraction.ts — the picker's default list before
// listUsedCategories() resolves, and the floor it's always merged with (so a
// brand-new account with no history yet still sees sensible options).
const CATEGORY_SUGGESTIONS = ["fuel", "travel", "parking_tolls", "phone", "home_office", "clothing", "accountancy", "food", "other"];

// One shared picker for every place a category is chosen (Capture, Import
// Receipts, History's filter) — not a closed list: typing a genuinely new
// category has always worked here (see the FAQ) and still does, via the
// text field at the top of the modal.
export function CategoryPickerModal({
  label,
  value,
  onChange,
  allowClear
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  // History's filter only — "no filter" is a valid state there, but never
  // a valid category on an actual expense.
  allowClear?: boolean;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [customText, setCustomText] = useState("");
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetched fresh every time the modal opens, not once on mount — if the
  // user just added a new custom category elsewhere, it should show up
  // here immediately, not after a reload.
  useEffect(() => {
    if (!visible) return;
    setCustomText("");
    setIsLoading(true);
    listUsedCategories()
      .then(setUsedCategories)
      .catch(() => setUsedCategories([]))
      .finally(() => setIsLoading(false));
  }, [visible]);

  const merged = Array.from(new Set([...CATEGORY_SUGGESTIONS, ...usedCategories.map((category) => category.toLowerCase())])).sort();

  function select(next: string): void {
    onChange(next);
    setVisible(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setVisible(true)}>
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {value ? humanizeCategory(value) : allowClear ? "All categories" : "Select a category"}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={12}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customText}
              onChangeText={setCustomText}
              placeholder="Type a new category..."
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={[styles.useButton, !customText.trim() && styles.useButtonDisabled]}
              disabled={!customText.trim()}
              onPress={() => select(customText.trim())}
            >
              <Text style={styles.useButtonText}>Use this</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <ScrollView>
              {allowClear && (
                <Pressable style={styles.row} onPress={() => select("")}>
                  <Text style={[styles.rowText, !value && styles.rowTextActive]}>All categories</Text>
                </Pressable>
              )}
              {merged.map((category) => (
                <Pressable key={category} style={styles.row} onPress={() => select(category)}>
                  <Text style={[styles.rowText, value === category && styles.rowTextActive]}>{humanizeCategory(category)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: typography.body, color: colors.textSecondary, marginBottom: 4, fontWeight: "600" },
  trigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputBg
  },
  triggerText: { fontSize: typography.body, color: colors.textMain, textTransform: "capitalize" },
  triggerPlaceholder: { color: colors.textMuted },
  chevron: { color: colors.textMuted, fontSize: typography.body },
  modalContainer: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md
  },
  modalTitle: { fontSize: typography.h1, fontWeight: "700", color: colors.textMain },
  modalClose: { color: colors.accent, fontSize: typography.body, fontWeight: "700" },
  customRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputBg,
    color: colors.textMain
  },
  useButton: {
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent
  },
  useButtonDisabled: { opacity: 0.5 },
  useButtonText: { color: colors.accentText, fontWeight: "700" },
  spinner: { marginTop: spacing.xl },
  row: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  rowText: { fontSize: typography.body, color: colors.textMain, textTransform: "capitalize" },
  rowTextActive: { color: colors.accent, fontWeight: "700" }
});
