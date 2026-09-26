import React, { useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme/tokens";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export function ImageViewerModal({
  visible,
  uri,
  isLoading,
  onClose,
  onShare
}: {
  visible: boolean;
  uri: string | null;
  isLoading: boolean;
  onClose: () => void;
  onShare?: () => void;
}): React.JSX.Element {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // A different photo (or the modal closing) should never open already
  // zoomed/panned from whatever the last one was left at.
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, visible]);

  // Approximate, not pixel-exact against the image's real rendered box —
  // good enough to stop the image being dragged entirely off-screen once
  // zoomed in, without the extra complexity of measuring actual layout.
  function clamp(value: number, currentScale: number): number {
    "worklet";
    const bound = (150 * (currentScale - 1)) / MIN_SCALE;
    return Math.max(-bound, Math.min(bound, value));
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(MIN_SCALE, Math.min(savedScale.value * event.scale, MAX_SCALE));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value === MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (savedScale.value === MIN_SCALE) return;
      translateX.value = clamp(savedTranslateX.value + event.translationX, savedScale.value);
      translateY.value = clamp(savedTranslateY.value + event.translationY, savedScale.value);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = savedScale.value > MIN_SCALE ? MIN_SCALE : MAX_SCALE / 2;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }]
  }));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.headerAction}>Close</Text>
            </Pressable>
            {onShare && uri && (
              <Pressable onPress={onShare} hitSlop={12}>
                <Text style={styles.headerAction}>Share</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.body}>
            {isLoading && <ActivityIndicator color={colors.accentText} size="large" />}
            {!isLoading && uri && (
              <GestureDetector gesture={composedGesture}>
                <Animated.Image source={{ uri }} style={[styles.image, animatedImageStyle]} resizeMode="contain" />
              </GestureDetector>
            )}
            {!isLoading && !uri && <Text style={styles.errorText}>Could not load the file.</Text>}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md
  },
  headerAction: { color: colors.accentText, fontSize: typography.body, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  errorText: { color: colors.accentText, fontSize: typography.body }
});
