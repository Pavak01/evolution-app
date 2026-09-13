export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type ExpensesStackParamList = {
  ExpenseHistory: undefined;
  ExpenseDetail: { expenseId: string };
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
};
