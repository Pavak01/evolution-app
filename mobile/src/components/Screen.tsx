import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme/tokens";

export function Screen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.gap}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  gap: { gap: spacing.lg }
});
