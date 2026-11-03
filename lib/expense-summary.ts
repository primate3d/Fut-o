import { ExpenseCategory, ExpenseSubcategory, type Expense } from "@/types";

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  [ExpenseCategory.ENERGY]: "Énergie",
  [ExpenseCategory.TELECOM]: "Télécom",
  [ExpenseCategory.INSURANCE]: "Assurance",
  [ExpenseCategory.SUBSCRIPTIONS]: "Abonnements",
  [ExpenseCategory.BANKING]: "Banque",
  [ExpenseCategory.HOUSING]: "Logement",
  [ExpenseCategory.TRANSPORT]: "Transport",
  [ExpenseCategory.HEALTH]: "Santé",
  [ExpenseCategory.EDUCATION]: "Éducation",
  [ExpenseCategory.LEISURE]: "Loisirs",
  [ExpenseCategory.OTHER]: "Autre"
};

const expenseSubcategoryLabels: Partial<Record<ExpenseSubcategory, string>> = {
  [ExpenseSubcategory.ELECTRICITY]: "Électricité",
  [ExpenseSubcategory.GAS]: "Gaz",
  [ExpenseSubcategory.MOBILE]: "Mobile",
  [ExpenseSubcategory.INTERNET]: "Internet / Box",
  [ExpenseSubcategory.HOME_INSURANCE]: "Assurance habitation",
  [ExpenseSubcategory.CAR_INSURANCE]: "Assurance automobile",
  [ExpenseSubcategory.TWO_WHEELER_INSURANCE]: "Assurance deux roues",
  [ExpenseSubcategory.MUTUAL_HEALTH]: "Assurance santé",
  [ExpenseSubcategory.STREAMING]: "Abonnement numérique",
  [ExpenseSubcategory.BANK_FEES]: "Frais bancaires"
};

const expenseDocumentTypeLabels: Partial<Record<NonNullable<Expense["documentType"]>, string>> = {
  bank_statement: "Document de dépenses",
  electricity_invoice: "Électricité",
  gas_invoice: "Gaz",
  internet_invoice: "Internet / Box",
  mobile_invoice: "Mobile",
  two_wheeler_insurance: "Assurance deux roues",
  car_insurance: "Assurance auto",
  home_insurance: "Assurance habitation",
  health_insurance: "Assurance santé",
  subscription: "Abonnement",
  credit: "Crédit",
  other: "Autre contrat"
};

export function getExpenseDisplayLabel(expense: Expense) {
  const label = expense.label?.trim();
  if (label && !/^non renseign[eé]$/i.test(label)) return label;
  if (expense.subcategory && expenseSubcategoryLabels[expense.subcategory]) {
    return expenseSubcategoryLabels[expense.subcategory]!;
  }
  if (expense.documentType && expenseDocumentTypeLabels[expense.documentType]) {
    return expenseDocumentTypeLabels[expense.documentType]!;
  }
  return expenseCategoryLabels[expense.category] ?? "Contrat";
}

export type ExpenseCategorySummary = {
  category: ExpenseCategory;
  label: string;
  monthlyTotal: number;
  yearlyTotal: number;
  expenses: Expense[];
};

export function summarizeExpensesByCategory(
  expenses: Expense[]
): ExpenseCategorySummary[] {
  const summaries = Object.values(ExpenseCategory).map((category) => ({
    category,
    label: expenseCategoryLabels[category],
    monthlyTotal: 0,
    yearlyTotal: 0,
    expenses: [] as Expense[]
  }));

  for (const expense of expenses) {
    const summary = summaries.find((item) => item.category === expense.category);

    if (summary) {
      summary.monthlyTotal += expense.monthlyAmount;
      summary.yearlyTotal += expense.yearlyAmount;
      summary.expenses.push(expense);
    }
  }

  return summaries
    .filter((summary) => summary.expenses.length > 0)
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal);
}

export function getTopExpenses(expenses: Expense[], limit = 3) {
  return [...expenses]
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
    .slice(0, limit);
}

export function getMostExpensiveCategory(expenses: Expense[]) {
  return summarizeExpensesByCategory(expenses)[0];
}
