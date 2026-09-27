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
    // Android in particular can re-fire "show" while the keyboard is
    // already up (e.g. its suggestion bar changing height as you type) —
    // without this guard, every re-fire forced the scroll back to the end
    // again, so it felt like the page was stuck and wouldn't scroll up.
    // Only the genuine hidden -> shown transition should auto-scroll.
    let isKeyboardVisible = false;
    const showSubscription = Keyboard.addListener(showEvent, () => {
      if (isKeyboardVisible) return;
      isKeyboardVisible = true;
      internalRef.current?.scrollToEnd({ animated: true });
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardVisible = false;
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Android previously relied solely on the OS's own window resize
      // (app.json's softwareKeyboardLayoutMode: "resize") with no help from
      // this component, leaving `behavior` a no-op here. That's what let a
      // field near the bottom of a screen end up genuinely unreachable —
      // not just un-auto-scrolled, but not manually scrollable either,
      // because the ScrollView's own measured content wasn't reliably
      // shrinking to make room. Setting "height" here makes this container
      // itself shrink on keyboard-show, guaranteeing the content overflows
      // and becomes scrollable regardless of what the OS-level resize does.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
