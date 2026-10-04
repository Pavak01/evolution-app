import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LoginResult } from "../../api/auth";
import type { AuthStackParamList } from "../../navigation/types";

// Sends the user to whichever step their sign-in needs next. On success
// there's nothing to do — RootNavigator swaps to the app once `user` is set.
export function routeAuthResult(
  navigation: Pick<NativeStackNavigationProp<AuthStackParamList>, "navigate">,
  result: LoginResult
): void {
  if (result.status === "verify_email") {
    navigation.navigate("VerifyEmail", {
      verificationToken: result.verificationToken,
      email: result.email,
      notice: result.message
    });
  } else if (result.status === "two_factor_required") {
    navigation.navigate("VerifyTwoFactor", { challengeToken: result.challengeToken });
  }
}
