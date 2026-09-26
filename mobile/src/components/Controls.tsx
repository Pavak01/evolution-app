import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { formatUkDate } from "../utils/taxYear";

// Adapted from Qbit's Controls.tsx. DateField's value/onChange contract
// stays ISO (YYYY-MM-DD) throughout the app — the format the backend
// expects — but is displayed/typed as DD/MM/YYYY, restoring Qbit's
// original UK-friendly display after a plain-ISO display turned out to
// read as confusingly US-shaped to an actual UK user (a receipt's
// "2024-01-12" misread the same way an ambiguous OCR date can).
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

// Only returns a value once a full, plausible DD/MM/YYYY has been typed —
// partial input (e.g. "12/0") just keeps displaying as typed, without
// propagating anything upward yet.
function ukDisplayToIso(display: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim());
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
    return null;
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.card}>{children}</View>;
}

export function Field({
  label,
  value,
  onChange,
  keyboardType,
  placeholder,
  onFocus
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  // Lets a screen scroll a low-down field (e.g. a void reason near the
  // bottom) into view when the keyboard opens and would otherwise cover it.
  onFocus?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        keyboardType={keyboardType}
        placeholder={placeholder}
        onFocus={onFocus}
      />
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  placeholder,
  maximumDate
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maximumDate?: Date;
}): React.JSX.Element {
  const [showPicker, setShowPicker] = useState(false);
  // Decoupled from `value` so the user can type a partial date (e.g.
  // "12/0") without a re-render clobbering it mid-entry — re-synced below
  // whenever `value` actually changes (the picker, or the parent resetting
  // the form), which also normalizes to zero-padded DD/MM/YYYY once a
  // valid date lands.
  const [displayText, setDisplayText] = useState(() => formatUkDate(value));

  useEffect(() => {
    setDisplayText(formatUkDate(value));
  }, [value]);

  function handleTextChange(text: string): void {
    setDisplayText(text);
    const iso = ukDisplayToIso(text);
    if (iso) {
      onChange(iso);
    }
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateFieldRow}>
        <TextInput
          value={displayText}
          onChangeText={handleTextChange}
          style={[styles.input, styles.dateInput]}
          placeholder={placeholder ?? "DD/MM/YYYY"}
        />
        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.dateIconButton}
          accessibilityLabel="Open date picker"
        >
          <Text style={styles.dateIconText}>{"\u{1F4C5}"}</Text>
        </Pressable>
      </View>
      {showPicker && (
        <DateTimePicker
          value={parseIsoDate(value) ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={maximumDate}
          onValueChange={(_event, selectedDate) => {
            setShowPicker(false);
            onChange(formatIsoDate(selectedDate));
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}
    </View>
  );
}

export function StatusBanner({ kind, text }: { kind: "info" | "error"; text: string }): React.JSX.Element {
  return (
    <View style={[styles.statusBanner, kind === "error" ? styles.statusError : styles.statusInfo]}>
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

export function SnapshotTile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.snapshotTile}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

export function SmallAction({
  label,
  onPress,
  active = false,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallActionButton, active && styles.smallActionButtonActive, disabled && styles.smallActionButtonDisabled]}
    >
      <Text style={[styles.smallActionText, active && styles.smallActionTextActive, disabled && styles.smallActionTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function PreviewPill({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.previewPill}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>£{value.toFixed(2)}</Text>
    </View>
  );
}

export function SummaryRow({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>£{value.toFixed(2)}</Text>
    </View>
  );
}

export function NavButton({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <Text style={[styles.navButtonText, active && styles.navButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function DangerAction({
  label,
  sublabel,
  onPress,
  disabled = false,
  isLoading = false
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      style={[styles.dangerAction, (disabled || isLoading) && styles.dangerActionDisabled]}
    >
      <View style={styles.dangerActionContent}>
        <Text style={styles.dangerActionLabel}>{label}</Text>
        {sublabel && <Text style={styles.dangerActionSublabel}>{sublabel}</Text>}
      </View>
      {isLoading && <ActivityIndicator color={colors.danger} size="small" />}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  isLoading = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      style={[styles.primaryButton, (disabled || isLoading) && styles.primaryButtonDisabled]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.accentText} size="small" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  fieldWrap: {
    marginBottom: 10
  },
  label: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputBg
  },
  dateFieldRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xs
  },
  dateInput: {
    flex: 1
  },
  dateIconButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft
  },
  dateIconText: {
    fontSize: 18
  },
  statusBanner: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md
  },
  statusInfo: {
    backgroundColor: colors.successBg
  },
  statusError: {
    backgroundColor: colors.errorBg
  },
  statusText: {
    color: colors.statusText,
    fontWeight: "600"
  },
  snapshotTile: {
    width: "48%",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 10
  },
  snapshotLabel: {
    fontSize: typography.micro,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: "700"
  },
  snapshotValue: {
    fontSize: 15,
    color: colors.snapshotValue,
    fontWeight: "700"
  },
  smallActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  smallActionButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  smallActionButtonDisabled: {
    opacity: 0.45
  },
  smallActionText: {
    fontSize: typography.small,
    color: colors.sectionHint,
    fontWeight: "700"
  },
  smallActionTextActive: {
    color: colors.accentText
  },
  smallActionTextDisabled: {
    color: colors.textSecondary
  },
  previewPill: {
    flex: 1,
    backgroundColor: colors.accentSoftAlt,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  previewLabel: {
    fontSize: typography.micro,
    color: colors.sectionHint,
    marginBottom: 4,
    fontWeight: "600"
  },
  previewValue: {
    color: colors.snapshotValue,
    fontWeight: "700",
    fontSize: 14
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontWeight: "600"
  },
  summaryValue: {
    color: colors.snapshotValue,
    fontWeight: "700"
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.navBg
  },
  navButtonActive: {
    backgroundColor: colors.navActiveBg
  },
  navButtonText: {
    color: colors.navText,
    fontSize: typography.body,
    fontWeight: "600"
  },
  navButtonTextActive: {
    color: colors.navTextActive
  },
  dangerAction: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "#ffe6e6",
    borderWidth: 1,
    borderColor: colors.danger
  },
  dangerActionDisabled: {
    opacity: 0.5
  },
  dangerActionContent: {
    flex: 1,
    gap: spacing.xs
  },
  dangerActionLabel: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.danger
  },
  dangerActionSublabel: {
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: "400"
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonDisabled: {
    opacity: 0.5
  },
  primaryButtonText: {
    color: colors.accentText,
    fontWeight: "700",
    fontSize: typography.body
  }
});
