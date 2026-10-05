import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { QuickLogWidget } from "./QuickLogWidget";

// Renders the widget whenever Android asks (added, resized, updated).
// Taps are plain deep links (OPEN_URI), so there are no click actions to
// handle here.
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetInfo.widgetName !== "QuickLog" || widgetAction === "WIDGET_DELETED") return;
  renderWidget(<QuickLogWidget />);
}
