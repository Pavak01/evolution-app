import { NavigationContainer } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useCallback, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { CaptureExpenseScreen } from "../screens/expenses/CaptureExpenseScreen";
import { ExpenseDetailScreen } from "../screens/expenses/ExpenseDetailScreen";
import { ExpenseHistoryScreen } from "../screens/expenses/ExpenseHistoryScreen";
import { ImportReceiptsScreen } from "../screens/expenses/ImportReceiptsScreen";
import { ExportScreen } from "../screens/export/ExportScreen";
import { ImportIncomeCsvScreen } from "../screens/income/ImportIncomeCsvScreen";
import { IncomeHistoryScreen } from "../screens/income/IncomeHistoryScreen";
import { RecordIncomeScreen } from "../screens/income/RecordIncomeScreen";
import { SummaryScreen } from "../screens/summary/SummaryScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { PlansScreen } from "../screens/settings/PlansScreen";
import { AcceptTermsScreen } from "../screens/auth/AcceptTermsScreen";
import { PromoAdminScreen } from "../screens/settings/PromoAdminScreen";
import { navigationRef } from "./navigationRef";
import { consumeLaunchReminderTap, onReminderTapped } from "../reimbursementReminders";
import { VerifyTwoFactorScreen } from "../screens/auth/VerifyTwoFactorScreen";
import { VerifyEmailScreen } from "../screens/auth/VerifyEmailScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { colors } from "../theme/tokens";
import type {
  AuthStackParamList,
  CaptureStackParamList,
  ExpensesStackParamList,
  IncomeStackParamList,
  MainTabParamList,
  RootStackParamList
} from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const CaptureStack = createNativeStackNavigator<CaptureStackParamList>();
const ExpensesStack = createNativeStackNavigator<ExpensesStackParamList>();
const IncomeStack = createNativeStackNavigator<IncomeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const headerOptions = { headerStyle: { backgroundColor: colors.navBg }, headerTintColor: colors.navText };

function CaptureStackScreen(): React.JSX.Element {
  return (
    <CaptureStack.Navigator screenOptions={headerOptions}>
      <CaptureStack.Screen name="CaptureForm" component={CaptureExpenseScreen} options={{ title: "Log a receipt" }} />
      <CaptureStack.Screen name="ImportReceipts" component={ImportReceiptsScreen} options={{ title: "Import past receipts" }} />
    </CaptureStack.Navigator>
  );
}

function HistoryStackScreen(): React.JSX.Element {
  return (
    <ExpensesStack.Navigator screenOptions={headerOptions}>
      <ExpensesStack.Screen name="ExpenseHistory" component={ExpenseHistoryScreen} options={{ title: "History" }} />
      <ExpensesStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ title: "Expense" }} />
    </ExpensesStack.Navigator>
  );
}

function IncomeStackScreen(): React.JSX.Element {
  return (
    <IncomeStack.Navigator screenOptions={headerOptions}>
      <IncomeStack.Screen name="RecordIncome" component={RecordIncomeScreen} options={{ title: "Record Income" }} />
      <IncomeStack.Screen name="IncomeHistory" component={IncomeHistoryScreen} options={{ title: "Income History" }} />
      <IncomeStack.Screen name="ImportIncomeCsv" component={ImportIncomeCsvScreen} options={{ title: "Import CSV" }} />
    </IncomeStack.Navigator>
  );
}

// Filled icon for the selected tab, outline for the rest, with a soft
// rounded "wrapper" behind the selected one so the current page is obvious.
type IconName = React.ComponentProps<typeof Ionicons>["name"];
const TAB_ICONS: Record<keyof MainTabParamList, IconName> = {
  Capture: "camera",
  Income: "cash",
  Summary: "pie-chart",
  History: "time",
  Export: "share-social",
  Settings: "settings"
};

function TabIcon({ name, focused, color }: { name: keyof MainTabParamList; focused: boolean; color: string }): React.JSX.Element {
  const icon = (focused ? TAB_ICONS[name] : `${TAB_ICONS[name]}-outline`) as IconName;
  return (
    <View
      style={{
        width: 52,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? colors.accentSoft : "transparent"
      }}
    >
      <Ionicons name={icon} size={20} color={color} />
    </View>
  );
}

// Capture is the initial/default tab — it's now the primary, highest-frequency
// action, unlike Qbit where the equivalent "week" screen was just one of
// several equally-weighted entries in a button row.
function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="Capture"
      screenOptions={({ route }) => ({
        ...headerOptions,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused, color }) => <TabIcon name={route.name} focused={focused} color={color} />
      })}
    >
      <Tab.Screen name="Capture" component={CaptureStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Income" component={IncomeStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Summary" component={SummaryScreen} />
      <Tab.Screen name="History" component={HistoryStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Export" component={ExportScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function openAwaitingFromReminder(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate("Main", { screen: "History", params: { screen: "ExpenseHistory", params: { awaitingOnly: true } } });
}

export function RootNavigator(): React.JSX.Element {
  const { user, isLoading } = useAuth();

  // Tapping a reimbursement reminder opens History filtered to what's
  // still awaiting — both while running and from a cold start (onReady).
  useEffect(() => {
    if (!user) return;
    return onReminderTapped(openAwaitingFromReminder);
  }, [user]);

  const handleReady = useCallback(() => {
    if (!user) return;
    void consumeLaunchReminderTap().then((tapped) => {
      if (tapped) openAwaitingFromReminder();
    });
  }, [user]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={handleReady}>
      {user && user.terms && !user.terms.accepted ? (
        <AcceptTermsScreen />
      ) : user ? (
        <RootStack.Navigator screenOptions={headerOptions}>
          <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen name="Plans" component={PlansScreen} options={{ title: "Plans", presentation: "modal" }} />
          <RootStack.Screen name="PromoAdmin" component={PromoAdminScreen} options={{ title: "Promo codes" }} />
        </RootStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="VerifyTwoFactor" component={VerifyTwoFactorScreen} options={{ headerShown: true, title: "Verify" }} />
          <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ headerShown: true, title: "Confirm email" }} />
          <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: true, title: "Forgot password" }} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
