import { registerRootComponent } from "expo";
import { Platform } from "react-native";
import App from "./App";
import { isAndroidExpoGo } from "./src/nativeSupport";

registerRootComponent(App);

// The home-screen widget renders in a background task registered here, at
// start-up. Its library needs native code, so it's only loaded in real
// Android builds — Expo Go would crash on import (see nativeSupport.ts).
if (Platform.OS === "android" && !isAndroidExpoGo) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { widgetTaskHandler } = require("./src/widget/widgetTaskHandler");
  /* eslint-enable @typescript-eslint/no-require-imports */
  registerWidgetTaskHandler(widgetTaskHandler);
}
