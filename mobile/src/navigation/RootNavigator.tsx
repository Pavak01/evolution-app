import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";
import { CaptureExpenseScreen } from "../screens/expenses/CaptureExpenseScreen";
import { ExpenseDetailScreen } from "../screens/expenses/ExpenseDetailScreen";
import { ExpenseHistoryScreen } from "../screens/expenses/ExpenseHistoryScreen";
import { ImportReceiptsScreen } from "../screens/expenses/ImportReceiptsScreen";
import { ExportScreen } from "../screens/export/ExportScreen";
import { IncomeHistoryScreen } from "../screens/income/IncomeHistoryScreen";
import { RecordIncomeScreen } from "../screens/income/RecordIncomeScreen";
import { SummaryScreen } from "../screens/summary/SummaryScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { VerifyTwoFactorScreen } from "../screens/auth/VerifyTwoFactorScreen";
import { colors } from "../theme/tokens";
import type { AuthStackParamList, CaptureStackParamList, ExpensesStackParamList, IncomeStackParamList, MainTabParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const CaptureStack = createNativeStackNavigator<CaptureStackParamList>();
const ExpensesStack = createNativeStackNavigator<ExpensesStackParamList>();
const IncomeStack = createNativeStackNavigator<IncomeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

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
    </IncomeStack.Navigator>
  );
}

// Capture is the initial/default tab — it's now the primary, highest-frequency
// action, unlike Qbit where the equivalent "week" screen was just one of
// several equally-weighted entries in a button row.
function MainTabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="Capture"
      screenOptions={{
        ...headerOptions,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted
      }}
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

export function RootNavigator(): React.JSX.Element {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <MainTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="VerifyTwoFactor" component={VerifyTwoFactorScreen} options={{ headerShown: true, title: "Verify" }} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
