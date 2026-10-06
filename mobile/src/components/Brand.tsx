import Constants from "expo-constants";
import React from "react";
import { Image, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme/tokens";

// Logo + name (+ tagline). "large" heads the sign-in screens; "small" sits
// at the bottom of Settings with the app version.
const logo = require("../../assets/logo.png");

export function Brand({ size = "large" }: { size?: "large" | "small" }): React.JSX.Element {
  if (size === "small") {
    const version = Constants.expoConfig?.version ?? "";
    const build = Constants.expoConfig?.android?.versionCode;
    return (
      <View style={{ alignItems: "center", gap: spacing.xs, marginTop: spacing.md }}>
        <Image source={logo} style={{ width: 40, height: 40 }} accessibilityIgnoresInvertColors />
        <Text style={{ color: colors.textMuted, fontSize: typography.small }}>
          Evolution {version}
          {build ? ` (build ${build})` : ""}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typography.micro }}>by APLC Commodities Ltd</Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: "center", marginTop: spacing.xxxl, marginBottom: spacing.md }}>
      <Image source={logo} style={{ width: 88, height: 88, marginBottom: spacing.md }} accessibilityLabel="Evolution logo" />
      <Text style={{ fontSize: 30, fontWeight: "700", color: colors.textMain }}>Evolution</Text>
      <Text style={{ color: colors.textMuted, fontSize: typography.body, marginTop: spacing.xs }}>Receipts, income & tax</Text>
    </View>
  );
}
