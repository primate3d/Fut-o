import { ExpenseCategory, type Expense } from "@/types";

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
