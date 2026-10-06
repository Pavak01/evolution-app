import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";

// "Evolution — quick log" home-screen widget, in the logo's colours (deep
// blue tile, orange and cream): two big buttons, nothing
// private shown, nothing to refresh. Colours mirror theme/tokens.ts
// (widgets can't import app styles). Only ever loaded in real Android
// builds — see index.ts.
const ACCENT = "#b65931";
const ACCENT_TEXT = "#f8f4e8";
const CARD = "#fff9f1";
const NAV = "#2f566f";

function WidgetButton({ label, uri, background, color }: { label: string; uri: string; background: `#${string}`; color: `#${string}` }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: "match_parent",
        backgroundColor: background,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        marginHorizontal: 4
      }}
    >
      <TextWidget text={label} style={{ fontSize: 16, fontWeight: "700", color }} />
    </FlexWidget>
  );
}

export function QuickLogWidget() {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "row",
        backgroundColor: NAV,
        borderRadius: 20,
        padding: 6
      }}
    >
      <WidgetButton label="📷  Receipt" uri="evolution://capture?camera=1" background={ACCENT} color={ACCENT_TEXT} />
      <WidgetButton label="£  Income" uri="evolution://income" background={CARD} color={NAV} />
    </FlexWidget>
  );
}
