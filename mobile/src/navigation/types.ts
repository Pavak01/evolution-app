import type { NavigatorScreenParams } from "@react-navigation/native";

// A file shared to Evolution from another app, already copied into the
// app's own storage (see share/ShareIntentRouter.tsx).
export type SharedFile = { uri: string; name: string; mimeType: string };

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyTwoFactor: { challengeToken: string };
  VerifyEmail: { verificationToken: string; email: string; notice?: string };
  ForgotPassword: { email?: string } | undefined;
};

export type ExpensesStackParamList = {
  // awaitingOnly: opened from a reimbursement reminder — starts filtered.
  ExpenseHistory: { awaitingOnly?: boolean } | undefined;
  ExpenseDetail: { expenseId: string };
  // Side by side: a suspected duplicate, or a resubmitted entry and its original.
  CompareExpenses: { leftId: string; rightId: string };
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
  // Carries a still-outstanding reimbursement over to the corrected entry.
  awaitingReimbursement: boolean;
  // The voided expense being corrected — carried through to the new
  // expense's resubmitted_from_expense_id so History/detail can show the
  // link back to it (see "mark resubmitted as resubmitted").
  originalExpenseId: string;
};

export type CaptureStackParamList = {
  // Named distinctly from the "Capture" tab that hosts this stack —
  // React Navigation warns about nested screens sharing a name.
  // launchCamera: a timestamp (widget / app-icon shortcut) so each tap
  // re-triggers; sharedFile: a photo shared to Evolution as a receipt.
  CaptureForm: { resubmit?: ResubmitPrefill; launchCamera?: number; sharedFile?: SharedFile } | undefined;
  ImportReceipts: undefined;
};

export type IncomeStackParamList = {
  RecordIncome: { sharedFile?: SharedFile } | undefined;
  IncomeHistory: undefined;
  ImportIncomeCsv: { sharedFile?: SharedFile } | undefined;
};

// Plans sits above the tabs so it can be opened from any of them.
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Plans: undefined;
  PromoAdmin: undefined;
  TwoFactor: undefined;
  Hmrc: undefined;
};

export type MainTabParamList = {
  // NavigatorScreenParams (not `undefined`) so a screen outside this tab can
  // navigate straight into one of Capture's nested screens with params —
  // React Navigation's standard pattern for typed cross-tab navigation, used
  // by ExpenseDetailScreen's "Resubmit" action.
  Capture: NavigatorScreenParams<CaptureStackParamList> | undefined;
  Income: NavigatorScreenParams<IncomeStackParamList> | undefined;
  Summary: undefined;
  History: NavigatorScreenParams<ExpensesStackParamList> | undefined;
  Export: undefined;
  Settings: undefined;
};
