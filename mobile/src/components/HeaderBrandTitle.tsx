import React from "react";
import { Image, Text, View } from "react-native";
import { colors } from "../theme/tokens";

// Small logo mark beside the header title — only on the home screen (Log a
// receipt), so the brand shows where the app opens without repeating on
// every page.
const mark = require("../../assets/logo-mark.png");

export function HeaderBrandTitle({ title }: { title: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image source={mark} style={{ width: 26, height: 26 }} accessibilityLabel="Evolution" />
      <Text style={{ color: colors.navText, fontSize: 18, fontWeight: "600" }} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
