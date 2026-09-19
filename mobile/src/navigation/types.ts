export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyTwoFactor: { challengeToken: string };
};

export type ExpensesStackParamList = {
  ExpenseHistory: undefined;
  ExpenseDetail: { expenseId: string };
};

export type CaptureStackParamList = {
  // Named distinctly from the "Capture" tab that hosts this stack —
  // React Navigation warns about nested screens sharing a name.
  CaptureForm: undefined;
  ImportReceipts: undefined;
};

export type IncomeStackParamList = {
  RecordIncome: undefined;
  IncomeHistory: undefined;
};

export type MainTabParamList = {
  Capture: undefined;
  Income: undefined;
  Summary: undefined;
  History: undefined;
  Export: undefined;
  Settings: undefined;
};
