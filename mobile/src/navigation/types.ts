import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyTwoFactor: { challengeToken: string };
};

export type ExpensesStackParamList = {
  ExpenseHistory: undefined;
  ExpenseDetail: { expenseId: string };
};

// Carried from ExpenseDetailScreen's "Resubmit" action on a voided expense
// into a fresh Capture entry — a local file already downloaded and ready to
// re-attach, not a remote URL (CaptureExpenseScreen has no download step).
export type ResubmitPrefill = {
  category: string;
  totalAmount: string;
  occurredAt: string;
  businessUsePercent: string;
  notes: string;
  file: { uri: string; name: string; mimeType: string } | null;
  // The voided expense being corrected — carried through to the new
  // expense's resubmitted_from_expense_id so History/detail can show the
  // link back to it (see "mark resubmitted as resubmitted").
  originalExpenseId: string;
};

export type CaptureStackParamList = {
  // Named distinctly from the "Capture" tab that hosts this stack —
  // React Navigation warns about nested screens sharing a name.
  CaptureForm: { resubmit?: ResubmitPrefill } | undefined;
  ImportReceipts: undefined;
};

export type IncomeStackParamList = {
  RecordIncome: undefined;
  IncomeHistory: undefined;
  ImportIncomeCsv: undefined;
};

export type MainTabParamList = {
  // NavigatorScreenParams (not `undefined`) so a screen outside this tab can
  // navigate straight into one of Capture's nested screens with params —
  // React Navigation's standard pattern for typed cross-tab navigation, used
  // by ExpenseDetailScreen's "Resubmit" action.
  Capture: NavigatorScreenParams<CaptureStackParamList> | undefined;
  Income: undefined;
  Summary: undefined;
  History: undefined;
  Export: undefined;
  Settings: undefined;
};
