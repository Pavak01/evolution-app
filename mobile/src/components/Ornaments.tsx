import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";

// The two soft, see-through circles behind every screen — carried over from
// Qbit's look (same sizes, positions and strength). Fixed to the screen,
// not scrolled, and never catch touches.
export function Ornaments(): React.JSX.Element {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.warm} />
      <View style={styles.cool} />
    </View>
  );
}

const styles = StyleSheet.create({
  warm: {
    position: "absolute",
    top: -70,
    right: -30,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: colors.ornamentWarm,
    opacity: 0.2
  },
  cool: {
    position: "absolute",
    bottom: 80,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.ornamentCool,
    opacity: 0.18
  }
});
