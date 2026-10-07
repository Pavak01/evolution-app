import React, { forwardRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { colors, spacing } from "../theme/tokens";
import { Ornaments } from "./Ornaments";

// Forwards a ref to the underlying ScrollView so screens can scroll back to
// top on demand — e.g. to bring an important status message (like an
// offline-queue notice) back into view after a form reset leaves the
// ScrollView's offset pointing at content that no longer exists there.
export const Screen = forwardRef<
  ScrollView,
  { children: React.ReactNode; refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"] }
>(function Screen({ children, refreshControl }, ref) {
  // Keyboard handling, take three. KeyboardAvoidingView + "scroll to the end
  // when the keyboard shows" looked fixed in Expo Go but not in real builds:
  // those run edge-to-edge (the app draws under Android's navigation bar and
  // the window no longer shrinks for the keyboard), so its maths came up
  // short by about the nav-bar height and the void-reason box stayed partly
  // hidden (Roger, build 112). react-native-keyboard-controller is built for
  // edge-to-edge: it scrolls whichever field is focused to sit bottomOffset
  // above the keyboard — on every screen, wherever the field is.
  return (
    <View style={styles.flex}>
      <Ornaments />
      <KeyboardAwareScrollView
        // Its handle is a ScrollView plus assureFocusedInputVisible(), so screens
        // that hold a plain ScrollView ref (to scroll back to the top) still work.
        ref={ref as React.Ref<KeyboardAwareScrollViewRef>}
        bottomOffset={96}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={styles.gap}>{children}</View>
      </KeyboardAwareScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl * 2 },
  gap: { gap: spacing.lg }
});
