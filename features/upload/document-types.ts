import { ExpenseCategory, type UploadedDocumentType } from "@/types";

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.ms-excel"
];

export const documentTypeOptions: Array<{
  value: UploadedDocumentType;
  label: string;
  category: ExpenseCategory;
}> = [
  {
    value: "bank_statement",
    label: "Document de dépenses",
    category: ExpenseCategory.BANKING
  },
  {
    value: "electricity_invoice",
    label: "Facture électricité",
    category: ExpenseCategory.ENERGY
  },
  {
    value: "gas_invoice",
    label: "Facture gaz",
    category: ExpenseCategory.ENERGY
  },
  {
    value: "internet_invoice",
    label: "Facture internet",
    category: ExpenseCategory.TELECOM
  },
  {
    value: "mobile_invoice",
    label: "Facture mobile",
    category: ExpenseCategory.TELECOM
  },
  {
    value: "car_insurance",
    label: "Assurance auto",
    category: ExpenseCategory.INSURANCE
  },
  {
    value: "home_insurance",
    label: "Assurance habitation",
    category: ExpenseCategory.INSURANCE
  },
  {
    value: "health_insurance",
    label: "Assurance santé",
    category: ExpenseCategory.HEALTH
  },
  {
    value: "subscription",
    label: "Abonnement",
    category: ExpenseCategory.SUBSCRIPTIONS
  },
  {
    value: "credit",
    label: "Crédit",
    category: ExpenseCategory.BANKING
  },
  {
    value: "other",
    label: "Autre",
    category: ExpenseCategory.OTHER
  }
];

export function getDocumentTypeLabel(documentType: UploadedDocumentType) {
  return (
    documentTypeOptions.find((option) => option.value === documentType)?.label ??
    "Autre"
  );
}

export function getCategoryForDocumentType(documentType: UploadedDocumentType) {
  return (
    documentTypeOptions.find((option) => option.value === documentType)?.category ??
    ExpenseCategory.OTHER
  );
}

export function detectDocumentType(fileName: string): UploadedDocumentType {
  const normalizedName = fileName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizedName.includes("releve") || normalizedName.includes("banque")) {
    return "bank_statement";
  }

  if (normalizedName.includes("edf") || normalizedName.includes("electric")) {
    return "electricity_invoice";
  }

  if (normalizedName.includes("gaz") || normalizedName.includes("engie")) {
    return "gas_invoice";
  }

  if (
    normalizedName.includes("box") ||
    normalizedName.includes("internet") ||
    normalizedName.includes("fibre")
  ) {
    return "internet_invoice";
  }

  if (normalizedName.includes("mobile") || normalizedName.includes("telephone")) {
    return "mobile_invoice";
  }

  if (
    normalizedName.includes("macif") ||
    normalizedName.includes("avis d echeance") ||
    normalizedName.includes("assurance") ||
    normalizedName.includes("societaire")
  ) {
    return "home_insurance";
  }

  if (normalizedName.includes("habitation")) {
    return "home_insurance";
  }

  if (normalizedName.includes("auto") || normalizedName.includes("voiture")) {
    return "car_insurance";
  }

  if (normalizedName.includes("sante") || normalizedName.includes("mutuelle")) {
    return "health_insurance";
  }

  if (
    normalizedName.includes("netflix") ||
    normalizedName.includes("spotify") ||
    normalizedName.includes("abonnement")
  ) {
    return "subscription";
  }

  if (normalizedName.includes("credit") || normalizedName.includes("pret")) {
    return "credit";
  }

  return "other";
}
