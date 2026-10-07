import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

// App-wide ref — lets anything (a notification tap, a "See plans" link deep
// inside any tab) navigate without threading navigation props through.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openPlans(): void {
  if (navigationRef.isReady()) navigationRef.navigate("Plans");
}

// Compare a just-saved expense with its suspected duplicate, inside History
// (initial: false keeps the History list underneath, so Back lands there).
export function openCompareInHistory(leftId: string, rightId: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("Main", {
    screen: "History",
    params: { screen: "CompareExpenses", initial: false, params: { leftId, rightId } }
  });
}

export function openTwoFactor(): void {
  if (navigationRef.isReady()) navigationRef.navigate("TwoFactor");
}

export function openPromoAdmin(): void {
  if (navigationRef.isReady()) navigationRef.navigate("PromoAdmin");
}
