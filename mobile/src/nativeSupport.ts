import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

// Expo Go on Android can't load native modules that aren't bundled into it
// (expo-notifications even throws on import — that crashed the app on
// 2026-10-04). Every native-only feature — reminders, the widget, home
// screen shortcuts, "share to Evolution" — checks this and loads its
// library with a guarded require() instead of a top-level import.
export const isAndroidExpoGo = Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
