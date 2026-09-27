import React, { forwardRef, useEffect, useRef } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme/tokens";

// Forwards a ref to the underlying ScrollView so screens can scroll back to
// top on demand — e.g. to bring an important status message (like an
// offline-queue notice) back into view after a form reset leaves the
// ScrollView's offset pointing at content that no longer exists there.
export const Screen = forwardRef<
  ScrollView,
  { children: React.ReactNode; refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"] }
>(function Screen({ children, refreshControl }, forwardedRef) {
  // A screen's own field-level onFocus->scrollToEnd (the previous approach)
  // fires before the keyboard has actually finished appearing, scrolling
  // based on the still-full-height screen — so a field near the bottom can
  // still end up covered with no correction afterward. Listening for the
  // keyboard's own show event instead (its size/timing is only known once
  // it's genuinely showing) fixes this for every screen at once, not just
  // the one that happened to wire an onFocus handler.
  const internalRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(showEvent, () => {
      internalRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={(node) => {
          internalRef.current = node;
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
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
