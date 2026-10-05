import "react-native-gesture-handler";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { isAndroidExpoGo } from "./src/nativeSupport";

// "Share to Evolution" needs its provider at the very top; native-only, so
// it's skipped in Android Expo Go (see src/nativeSupport.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const ShareProvider: React.ComponentType<{ children: React.ReactNode }> = isAndroidExpoGo
  ? ({ children }) => <>{children}</>
  : require("expo-share-intent").ShareIntentProvider;
/* eslint-enable @typescript-eslint/no-require-imports */

export default function App(): React.JSX.Element {
  return (
    <ShareProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ShareProvider>
  );
}
