import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme/tokens";
import { openDoc } from "../utils/docs";

// Tick-box line with links to both documents — used at sign-up.
export function TermsAgreement({ checked, onToggle }: { checked: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.md }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: checked ? colors.accent : colors.inputBorder,
          backgroundColor: checked ? colors.accent : colors.inputBg,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1
        }}
      >
        {checked && <Text style={{ color: colors.accentText, fontWeight: "700", fontSize: 14, lineHeight: 16 }}>✓</Text>}
      </View>
      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: typography.small }}>
        I agree to the{" "}
        <Text style={{ color: colors.accent, fontWeight: "700" }} onPress={() => openDoc("TERMS-OF-USE.html")}>
          Terms of Use
        </Text>{" "}
        and have read the{" "}
        <Text style={{ color: colors.accent, fontWeight: "700" }} onPress={() => openDoc("PRIVACY-POLICY.html")}>
          Privacy Policy
        </Text>
        . I understand Evolution gives estimates, not tax advice.
      </Text>
    </Pressable>
  );
}
