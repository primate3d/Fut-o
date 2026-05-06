import { ExpenseCategory, ExpenseSubcategory, type Expense } from "@/types";

type CategoryRule = {
  category: ExpenseCategory;
  subcategory?: ExpenseSubcategory;
  keywords: string[];
  documentTypes?: Expense["documentType"][];
};

export const categoryRules: CategoryRule[] = [
  {
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.MOBILE,
    keywords: ["orange", "sosh", "free mobile", "bouygues", "sfr mobile", "mobile"]
  },
  {
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.INTERNET,
    keywords: ["box", "internet", "fibre", "orange", "free", "bouygues", "sfr"]
  },
  {
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.ELECTRICITY,
    keywords: ["edf", "electricite", "enedis", "elec", "totalenergies"]
  },
  {
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.GAS,
    keywords: ["engie", "gaz", "grdf"]
  },
  {
    category: ExpenseCategory.INSURANCE,
    subcategory: ExpenseSubcategory.HOME_INSURANCE,
    keywords: ["assurance", "mutuelle habitat", "maif", "macif", "axa", "allianz"],
    documentTypes: ["home_insurance", "car_insurance", "health_insurance"]
  },
  {
    category: ExpenseCategory.SUBSCRIPTIONS,
    subcategory: ExpenseSubcategory.STREAMING,
    keywords: ["netflix", "spotify", "deezer", "canal", "disney", "prime video"]
  },
  {
    category: ExpenseCategory.BANKING,
    subcategory: ExpenseSubcategory.BANK_FEES,
    keywords: ["banque", "frais bancaires", "carte bancaire", "cotisation carte"],
    documentTypes: ["bank_statement"]
  },
  {
    category: ExpenseCategory.HOUSING,
    subcategory: ExpenseSubcategory.RENT,
    keywords: ["loyer", "bail", "syndic", "charges copropriete"]
  },
  {
    category: ExpenseCategory.TRANSPORT,
    subcategory: ExpenseSubcategory.PUBLIC_TRANSPORT,
    keywords: ["navigo", "sncf", "ratp", "transport", "essence", "peage"]
  },
  {
    category: ExpenseCategory.HEALTH,
    subcategory: ExpenseSubcategory.MUTUAL_HEALTH,
    keywords: ["sante", "mutuelle", "pharmacie", "docteur"]
  },
  {
    category: ExpenseCategory.EDUCATION,
    subcategory: ExpenseSubcategory.SCHOOL,
    keywords: ["ecole", "cantine", "scolarite", "formation"]
  },
  {
    category: ExpenseCategory.LEISURE,
    subcategory: ExpenseSubcategory.SPORT,
    keywords: ["sport", "cinema", "loisirs", "club"]
  }
];

function normalize(value?: string) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function findExpenseCategoryRule(expense: Partial<Expense>) {
  const searchableText = [expense.provider, expense.label, expense.subcategory]
    .map((value) => normalize(value))
    .filter(Boolean)
    .join(" ");

  return categoryRules.find((rule) => {
    const keywordMatch = rule.keywords.some((keyword) =>
      searchableText.includes(normalize(keyword) ?? "")
    );
    const documentMatch = rule.documentTypes?.includes(expense.documentType) ?? false;

    return keywordMatch || documentMatch;
  });
}

export function categorizeExpense(expense: Partial<Expense>): ExpenseCategory {
  return findExpenseCategoryRule(expense)?.category ?? ExpenseCategory.OTHER;
}

export function inferExpenseSubcategory(
  expense: Partial<Expense>
): ExpenseSubcategory | undefined {
  return findExpenseCategoryRule(expense)?.subcategory;
}
