import * as FileSystem from "expo-file-system/legacy";
import { useEffect } from "react";
import { Alert } from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import { navigationRef } from "../navigation/navigationRef";
import type { SharedFile } from "../navigation/types";

// "Share to Evolution" from another app (Gmail, Files, Photos…). Only
// mounted in real Android builds (see App.tsx / RootNavigator.tsx).
//   PDF   -> Record income, attached        (receipts stay photo-only)
//   CSV   -> Import income from CSV, loaded
//   image -> ask: receipt (expense) or invoice (income)
// Waits until the app is ready (signed in, terms accepted, navigator up),
// so a file shared while signed out is handled right after signing in.
const SHARED_DIR = `${FileSystem.documentDirectory}shared/`;

const isCsv = (mimeType: string, name: string) =>
  ["text/csv", "text/comma-separated-values"].includes(mimeType) || name.toLowerCase().endsWith(".csv");

// The shared copy can live in another app's temporary space; keep our own,
// as the offline queue does, so it survives until the user saves.
async function keepCopy(path: string, name: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(SHARED_DIR, { intermediates: true }).catch(() => undefined);
  const target = `${SHARED_DIR}${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  await FileSystem.copyAsync({ from: path, to: target });
  return target;
}

export function ShareIntentRouter({ ready }: { ready: boolean }): null {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!ready || !hasShareIntent || !navigationRef.isReady() || !navigationRef.getRootState()?.routeNames?.includes("Main")) return;
    const shared = shareIntent.files?.[0];
    resetShareIntent();
    if (!shared) {
      Alert.alert("Nothing to add", "Evolution can take a photo, a PDF or a CSV file.");
      return;
    }
    void (async () => {
      try {
        const name = shared.fileName || "shared-file";
        const mimeType = shared.mimeType || "application/octet-stream";
        const uri = await keepCopy(shared.path, name);
        const file: SharedFile = { uri, name, mimeType };
        const toIncome = () =>
          navigationRef.navigate("Main", { screen: "Income", params: { screen: "RecordIncome", params: { sharedFile: file } } });
        if (mimeType === "application/pdf") {
          toIncome();
        } else if (isCsv(mimeType, name)) {
          navigationRef.navigate("Main", { screen: "Income", params: { screen: "ImportIncomeCsv", params: { sharedFile: { ...file, mimeType: "text/csv" } } } });
        } else if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
          Alert.alert("Add this photo as…", undefined, [
            {
              text: "Receipt (expense)",
              onPress: () =>
                navigationRef.navigate("Main", { screen: "Capture", params: { screen: "CaptureForm", params: { sharedFile: file } } })
            },
            { text: "Invoice (income)", onPress: toIncome },
            { text: "Cancel", style: "cancel" }
          ]);
        } else {
          Alert.alert("Can't use that file", "Evolution can take a photo (JPEG, PNG or WebP), a PDF or a CSV file.");
        }
      } catch {
        Alert.alert("Couldn't open that file", "Please try sharing it again.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasShareIntent]);

  return null;
}
