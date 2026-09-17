import React, { forwardRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme/tokens";

// Forwards a ref to the underlying ScrollView so screens can scroll back to
// top on demand — e.g. to bring an important status message (like an
// offline-queue notice) back into view after a form reset leaves the
// ScrollView's offset pointing at content that no longer exists there.
export const Screen = forwardRef<ScrollView, { children: React.ReactNode }>(function Screen({ children }, ref) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView ref={ref} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.gap}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  gap: { gap: spacing.lg }
});
