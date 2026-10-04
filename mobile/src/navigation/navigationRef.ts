import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

// App-wide ref — lets anything (a notification tap, a "See plans" link deep
// inside any tab) navigate without threading navigation props through.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openPlans(): void {
  if (navigationRef.isReady()) navigationRef.navigate("Plans");
}
