import {
  ExpenseCategory,
  ExpenseSubcategory,
  type CustomerProfile,
  type DetectedParties,
  type DocumentPartyProfile,
  type Expense,
  type ProviderProfile,
  type UploadedDocument,
  type UploadedDocumentType
} from "@/types";

export type ExtractedDocument = UploadedDocument & { extractedText: string };

function normalize(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clean(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = clean(match?.[1]);
    if (value) return value;
  }
  return undefined;
}

function parseAmount(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function extractInlinePostalAddress(text: string) {
  const compactText = clean(text);
  const match = compactText?.match(
    /(?:m\.|mme|madame|monsieur)\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,}\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,}\s+(.+?\b\d{5}\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,})(?=\s+(?:Facture|TVA|Utilisateur|Montant|N[\u00B0o]|$))/i
  );

  return clean(match?.[1]);
}

function extractProviderAddress(text: string) {
  // We prefer the highly accurate predefined service client addresses (e.g. CEDEX addresses)
  // rather than the legal/corporate headquarters footers from invoices.
  return undefined;
}

function detectProvider(document: ExtractedDocument) {
  const text = normalize(`${document.provider ?? ""} ${document.fileName} ${document.extractedText}`);
  const providers = [
    "NRJ Mobile",
    "B&You",
    "Sosh",
    "RED by SFR",
    "SFR",
    "Orange",
    "Free",
    "Bouygues Telecom",
    "EDF",
    "Engie"
  ];

  return providers.find((provider) => text.includes(normalize(provider))) ?? document.provider;
}

function getSubscriptionType(documentType: UploadedDocumentType) {
  const labels: Record<UploadedDocumentType, string> = {
    bank_statement: "Document bancaire",
    electricity_invoice: "Contrat electricite",
    gas_invoice: "Contrat gaz",
    internet_invoice: "Box internet",
    mobile_invoice: "Forfait mobile",
    car_insurance: "Assurance auto",
    home_insurance: "Assurance habitation",
    health_insurance: "Assurance sante",
    subscription: "Abonnement",
    credit: "Credit",
    other: "Contrat"
  };

  return labels[documentType];
}

function splitFullName(fullName?: string): CustomerProfile {
  const parts =
    clean(fullName)
      ?.replace(/^(m\.|mme|madame|monsieur)\s+/i, "")
      .split(/\s+/)
      .filter(Boolean) ?? [];
  if (parts.length === 0) return {};
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(" ")
  };
}

function extractPostalAddress(text: string) {
  const inlineAddress = extractInlinePostalAddress(text);
  if (inlineAddress) return inlineAddress;

  const lines = text
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean) as string[];

  const postalIndex = lines.findIndex((line) => /\b\d{5}\s+[A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]{2,}\b/.test(line));
  if (postalIndex < 0) return undefined;

  let start = postalIndex;
  while (start > 0 && postalIndex - start < 3) {
    const previousLine = lines[start - 1];
    if (/^(m\.|mme|madame|monsieur|titulaire|utilisateur)\b/i.test(previousLine)) {
      break;
    }
    start -= 1;
  }

  return lines.slice(start, postalIndex + 1).join("\n");
}

export function extractDocumentPartyProfile(document: ExtractedDocument): DocumentPartyProfile {
  const text = document.extractedText ?? "";
  const compactText = clean(text) ?? "";
  const providerName = detectProvider(document);
  const fullName = firstMatch(text, [
    /(?:titulaire|client|factur[ée]\s*à|destinataire)\s*:?\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,}\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,})/i,
    /(?:m\.|mme|madame|monsieur)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,}\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,})/i
  ]);
  const customer = splitFullName(fullName);
  const phone = firstMatch(text, [
    /(?:ligne|mobile|t[ée]l[ée]phone|n[°o]\s*mobile)\s*:?\s*((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})/i,
    /\b((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})\s*(?:n[°o]\s*)?(?:de\s*)?t[ée]l[ée]phone\b/i,
    /\b((?:\+33|0)\s*[67](?:[\s.-]*\d{2}){4})\b/
  ]);
  const customerNumber = firstMatch(text, [
    /\b([A-Z0-9][A-Z0-9 -]{4,})[ \t]*(?:compte client|identifiant client)\b/i,
    /(?:n[°o][ \t]*)?(?:client|compte client|identifiant client)[ \t]*:?[ \t]*([A-Z0-9][A-Z0-9 -]{4,})/i
  ]);
  const contractNumber = firstMatch(text, [
    /\b([A-Z0-9][A-Z0-9 -]{4,})[ \t]*(?:n[°o][ \t]*)?(?:de[ \t]*)?contrat\b/i,
    /(?:n[°o][ \t]*)?(?:contrat|abonnement)[ \t]*:?[ \t]*([A-Z0-9][A-Z0-9 -]{4,})/i
  ]);
  const invoiceNumber = firstMatch(text, [
    /\b([A-Z0-9][A-Z0-9 -]{4,})[ \t]*(?:n[°o][ \t]*)de[ \t]*facture\b/i,
    /(?:n[°o][ \t]*)de[ \t]*facture[ \t]*:?[ \t]*([A-Z0-9][A-Z0-9 -]{4,})/i
  ]);
  const invoiceAmount = parseAmount(
    firstMatch(text, [
      /(?:total\s+(?:ttc|à payer|a payer)|montant\s+(?:ttc|factur[ée]|de la facture))\s*:?\s*([0-9][0-9\s.,]*)\s*€/i,
      /(?:montant\s+net\s+à\s+payer|montant\s+net\s+a\s+payer)\s*:?\s*([0-9][0-9\s.,]*)\s*€/i,
      /([0-9][0-9\s.,]*)\s*€\s*(?:ttc|à payer|a payer)/i
    ])
  );

  const reversePhone = firstMatch(compactText, [
    /\b((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})\s*N[\u00B0o]\s*de\s*T[ée]l[ée]phone\b/i
  ]);
  const reverseCustomerNumber = firstMatch(compactText, [
    /\b(\d{8,})\s*Compte client\b/i,
    /\b([A-Z0-9][A-Z0-9 -]{4,})\s*Compte client\b/i
  ]);
  const reverseContractNumber = firstMatch(compactText, [
    /\b(CT\d{6,})\s*N[\u00B0o]\s*de\s*contrat\b/i,
    /\b([A-Z0-9][A-Z0-9 -]{4,})\s*N[\u00B0o]\s*de\s*contrat\b/i
  ]);
  const reverseInvoiceNumber = firstMatch(compactText, [
    /\b(FM\d{6,})\s*N[\u00B0o]\s*de\s*facture\b/i,
    /\b([A-Z0-9][A-Z0-9 -]{4,})\s*N[\u00B0o]\s*de\s*facture\b/i
  ]);
  const reverseInvoiceAmount = parseAmount(
    firstMatch(compactText, [
      /montant\s+net\s+[àa]\s+payer\s*:?\s*([0-9][0-9\s.,]*)\s*€/i,
      /montant\s+de\s+votre\s+facture\s+[0-9][0-9\s.,]*\s+([0-9][0-9\s.,]*)/i
    ])
  );
  const providerAddress = extractProviderAddress(compactText);

  customer.address = extractPostalAddress(text);
  customer.phone = reversePhone ?? phone;
  customer.customerNumber = reverseCustomerNumber ?? customerNumber;
  customer.contractNumber = reverseContractNumber ?? contractNumber;
  customer.invoiceNumber = reverseInvoiceNumber ?? invoiceNumber;

  const provider: ProviderProfile | undefined = providerName
    ? {
        name: providerName,
        address: providerAddress,
        phone: firstMatch(text, [
          /(?:service client|assistance|contact)\s*:?\s*((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})/i
        ])
      }
    : undefined;

  return {
    documentId: document.id,
    fileName: document.fileName,
    documentType: document.documentType,
    providerName,
    subscriptionType: getSubscriptionType(document.documentType),
    invoiceAmount: reverseInvoiceAmount ?? invoiceAmount,
    customer: Object.values(customer).some(Boolean) ? customer : undefined,
    provider
  };
}

export function buildDocumentPartyProfiles(documents: ExtractedDocument[]) {
  return documents.reduce<Record<string, DocumentPartyProfile>>((profiles, document) => {
    profiles[document.id] = extractDocumentPartyProfile(document);
    return profiles;
  }, {});
}

export function mergeDetectedParties(
  detectedParties: DetectedParties | undefined,
  documentProfiles: Record<string, DocumentPartyProfile>
): DetectedParties {
  // On récupère le premier profil client trouvé localement comme base de secours
  const firstLocalCustomer = Object.values(documentProfiles).find(
    (profile) => profile.customer
  )?.customer;

  // Fusion des fournisseurs : Priorité à l'IA (detectedParties), complété par le local (documentProfiles)
  const providers = Object.values(documentProfiles).reduce<NonNullable<DetectedParties["providers"]>>(
    (accumulator, profile) => {
      const provider = profile.provider;
      if (!provider?.name) return accumulator;
      
      const aiProvider = detectedParties?.providers?.[provider.name];
      
      accumulator[provider.name] = {
        ...provider,         // Données locales (nom, adresse extraite par regex)
        ...aiProvider,       // Écrase/Complète avec les données IA (service, postalCode, city, confidence)
      };
      return accumulator;
    },
    { ...(detectedParties?.providers ?? {}) }
  );

  return {
    ...detectedParties,
    customer: detectedParties?.customer ?? firstLocalCustomer,
    providers,
    documents: {
      ...documentProfiles,
      ...(detectedParties?.documents ?? {})
    }
  };
}

function expenseMatchesDocument(expense: Expense, profile: DocumentPartyProfile) {
  if (expense.sourceDocumentId === profile.documentId) return true;
  if (expense.documentType && profile.documentType === expense.documentType) return true;

  const expenseText = normalize(`${expense.label} ${expense.provider} ${expense.subcategory ?? ""}`);
  const profileText = normalize(
    `${profile.fileName ?? ""} ${profile.providerName ?? ""} ${profile.subscriptionType ?? ""}`
  );

  return Boolean(expenseText && profileText && (profileText.includes(expenseText) || expenseText.includes(profileText)));
}

export function inferExpenseCategoryFromDocumentType(documentType?: UploadedDocumentType) {
  if (documentType === "mobile_invoice" || documentType === "internet_invoice") {
    return ExpenseCategory.TELECOM;
  }
  if (documentType === "electricity_invoice" || documentType === "gas_invoice") {
    return ExpenseCategory.ENERGY;
  }
  if (documentType === "car_insurance" || documentType === "home_insurance") {
    return ExpenseCategory.INSURANCE;
  }
  if (documentType === "health_insurance") {
    return ExpenseCategory.HEALTH;
  }
  if (documentType === "bank_statement" || documentType === "credit") {
    return ExpenseCategory.BANKING;
  }
  if (documentType === "subscription") {
    return ExpenseCategory.SUBSCRIPTIONS;
  }
  return ExpenseCategory.OTHER;
}

export function inferExpenseSubcategoryFromDocumentType(documentType?: UploadedDocumentType) {
  if (documentType === "mobile_invoice") return ExpenseSubcategory.MOBILE;
  if (documentType === "internet_invoice") return ExpenseSubcategory.INTERNET;
  if (documentType === "electricity_invoice") return ExpenseSubcategory.ELECTRICITY;
  if (documentType === "gas_invoice") return ExpenseSubcategory.GAS;
  if (documentType === "home_insurance") return ExpenseSubcategory.HOME_INSURANCE;
  if (documentType === "health_insurance") return ExpenseSubcategory.MUTUAL_HEALTH;
  if (documentType === "bank_statement") return ExpenseSubcategory.BANK_FEES;
  if (documentType === "subscription") return ExpenseSubcategory.STREAMING;
  return undefined;
}

function isGenericProvider(provider?: string) {
  if (!provider) return true;
  const genericProviders = [
    "operateur mobile",
    "assureur auto",
    "assureur habitation",
    "mutuelle sante",
    "banque principale",
    "services recurrents",
    "service abonnement",
    "organisme de credit",
    "fournisseur inconnu",
    "facture mobile"
  ];
  return genericProviders.includes(provider.toLowerCase());
}

export function attachDocumentProfileToExpense(
  expense: Expense,
  documentProfiles: Record<string, DocumentPartyProfile>
) {
  const profile =
    (expense.sourceDocumentId ? documentProfiles[expense.sourceDocumentId] : undefined) ??
    Object.values(documentProfiles).find((candidate) =>
      expenseMatchesDocument(expense, candidate)
    );

  if (!profile) return expense;

  const finalProvider = expense.provider && !isGenericProvider(expense.provider)
    ? expense.provider
    : (profile.providerName || expense.provider);

  return {
    ...expense,
    provider: finalProvider,
    documentType: expense.documentType ?? profile.documentType,
    sourceDocumentId: profile.documentId,
    sourceDocumentName: profile.fileName,
    customerNumber: expense.customerNumber ?? profile.customer?.customerNumber,
    contractNumber: expense.contractNumber ?? profile.customer?.contractNumber,
    invoiceNumber: expense.invoiceNumber ?? profile.customer?.invoiceNumber,
    phone: expense.phone ?? profile.customer?.phone,
    monthlyAmount: profile.invoiceAmount ?? expense.monthlyAmount,
    yearlyAmount: (profile.invoiceAmount ?? expense.monthlyAmount) * 12,
    category: expense.category ?? inferExpenseCategoryFromDocumentType(profile.documentType),
    subcategory: expense.subcategory ?? inferExpenseSubcategoryFromDocumentType(profile.documentType)
  };
}
