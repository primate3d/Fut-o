import {
  ExpenseCategory,
  ExpenseSubcategory,
  type AnalysisAnomaly,
  type DetectedParties,
  type Expense,
  type MockAnalysis,
  type ProviderProfile,
  type Recommendation,
  type UploadedDocument
} from "@/types";

export async function analyzeDocumentsStub(
  _documents: UploadedDocument[]
): Promise<Expense[]> {
  return [];
}

type ExpenseTemplate = {
  label: string;
  provider: string;
  category: ExpenseCategory;
  subcategory?: ExpenseSubcategory;
  monthlyAmount: number;
  recommendation?: Omit<Recommendation, "id">;
  anomaly?: Omit<AnalysisAnomaly, "id">;
};

const templatesByDocumentType: Record<UploadedDocument["documentType"], ExpenseTemplate[]> = {
  electricity_invoice: [
    {
      label: "Electricite",
      provider: "Fournisseur energie",
      category: ExpenseCategory.ENERGY,
      subcategory: ExpenseSubcategory.ELECTRICITY,
      monthlyAmount: 148,
      recommendation: {
        title: "Comparer votre contrat electricite",
        description:
          "La mensualite detectee semble elevee pour un foyer standard. Une comparaison tarifaire peut reduire la facture.",
        category: ExpenseCategory.ENERGY,
        potentialSaving: 180,
        priority: "high"
      }
    }
  ],
  gas_invoice: [
    {
      label: "Gaz",
      provider: "Fournisseur gaz",
      category: ExpenseCategory.ENERGY,
      subcategory: ExpenseSubcategory.GAS,
      monthlyAmount: 92,
      recommendation: {
        title: "Verifier l'offre gaz",
        description:
          "Le contrat gaz peut etre renegocie ou compare avec une offre indexee plus adaptee.",
        category: ExpenseCategory.ENERGY,
        potentialSaving: 120,
        priority: "medium"
      }
    }
  ],
  internet_invoice: [
    {
      label: "Box internet",
      provider: "Operateur internet",
      category: ExpenseCategory.TELECOM,
      subcategory: ExpenseSubcategory.INTERNET,
      monthlyAmount: 43,
      recommendation: {
        title: "Renegocier la box internet",
        description:
          "Le tarif detecte est superieur aux offres d'appel courantes pour un service equivalent.",
        category: ExpenseCategory.TELECOM,
        potentialSaving: 156,
        priority: "high"
      }
    }
  ],
  mobile_invoice: [
    {
      label: "Forfait mobile",
      provider: "Operateur mobile",
      category: ExpenseCategory.TELECOM,
      subcategory: ExpenseSubcategory.MOBILE,
      monthlyAmount: 24,
      recommendation: {
        title: "Optimiser le forfait mobile",
        description:
          "Un forfait sans engagement moins cher peut couvrir les memes usages.",
        category: ExpenseCategory.TELECOM,
        potentialSaving: 84,
        priority: "medium"
      }
    }
  ],
  car_insurance: [
    {
      label: "Assurance auto",
      provider: "Assureur auto",
      category: ExpenseCategory.INSURANCE,
      monthlyAmount: 58,
      recommendation: {
        title: "Comparer l'assurance auto",
        description:
          "Le montant mensuel detecte justifie une comparaison de garanties et franchises.",
        category: ExpenseCategory.INSURANCE,
        potentialSaving: 144,
        priority: "medium"
      }
    }
  ],
  home_insurance: [
    {
      label: "Assurance habitation",
      provider: "Assureur habitation",
      category: ExpenseCategory.INSURANCE,
      subcategory: ExpenseSubcategory.HOME_INSURANCE,
      monthlyAmount: 34,
      recommendation: {
        title: "Revoir l'assurance habitation",
        description:
          "Une offre equivalente peut souvent reduire la cotisation annuelle.",
        category: ExpenseCategory.INSURANCE,
        potentialSaving: 72,
        priority: "medium"
      }
    }
  ],
  health_insurance: [
    {
      label: "Assurance sante",
      provider: "Mutuelle sante",
      category: ExpenseCategory.HEALTH,
      subcategory: ExpenseSubcategory.MUTUAL_HEALTH,
      monthlyAmount: 86,
      anomaly: {
        title: "Cotisation sante importante",
        description:
          "La mutuelle represente un poste eleve. Verifiez que les garanties correspondent aux besoins reels.",
        severity: "medium",
        category: ExpenseCategory.HEALTH
      }
    }
  ],
  bank_statement: [
    {
      label: "Frais bancaires",
      provider: "Banque principale",
      category: ExpenseCategory.BANKING,
      subcategory: ExpenseSubcategory.BANK_FEES,
      monthlyAmount: 12,
      recommendation: {
        title: "Reduire les frais bancaires",
        description:
          "Les frais recurrents peuvent etre renegocies ou limites avec une offre plus simple.",
        category: ExpenseCategory.BANKING,
        potentialSaving: 96,
        priority: "medium"
      }
    },
    {
      label: "Abonnements numeriques",
      provider: "Services recurrents",
      category: ExpenseCategory.SUBSCRIPTIONS,
      subcategory: ExpenseSubcategory.STREAMING,
      monthlyAmount: 49,
      recommendation: {
        title: "Faire le tri dans les abonnements",
        description:
          "Plusieurs abonnements semblent recurrents. Supprimer les moins utilises peut generer une economie rapide.",
        category: ExpenseCategory.SUBSCRIPTIONS,
        potentialSaving: 180,
        priority: "high"
      },
      anomaly: {
        title: "Multiples abonnements recurrents",
        description:
          "Le document fourni suggere plusieurs paiements mensuels de services numeriques.",
        severity: "medium",
        category: ExpenseCategory.SUBSCRIPTIONS
      }
    }
  ],
  subscription: [
    {
      label: "Abonnement",
      provider: "Service abonnement",
      category: ExpenseCategory.SUBSCRIPTIONS,
      monthlyAmount: 19,
      recommendation: {
        title: "Verifier l'usage de l'abonnement",
        description:
          "Un abonnement isole peut etre resilie s'il n'est plus utile au foyer.",
        category: ExpenseCategory.SUBSCRIPTIONS,
        potentialSaving: 60,
        priority: "low"
      }
    }
  ],
  credit: [
    {
      label: "Credit",
      provider: "Organisme de credit",
      category: ExpenseCategory.BANKING,
      monthlyAmount: 210,
      anomaly: {
        title: "Mensualite de credit elevee",
        description:
          "La mensualite detectee merite une verification du taux, de l'assurance et des conditions de remboursement.",
        severity: "high",
        category: ExpenseCategory.BANKING
      }
    }
  ],
  other: [
    {
      label: "Depense non classee",
      provider: "Fournisseur inconnu",
      category: ExpenseCategory.OTHER,
      monthlyAmount: 27,
      anomaly: {
        title: "Document a verifier",
        description:
          "Le type de document ne permet pas encore une categorisation fiable.",
        severity: "low",
        category: ExpenseCategory.OTHER
      }
    }
  ]
};

const knownProviderProfiles: Record<string, ProviderProfile> = {
  EDF: {
    name: "EDF",
    address: "Service Client EDF\nTSA 21941\n62978 ARRAS CEDEX 9",
    customerServiceUrl: "https://particulier.edf.fr/fr/accueil/aide-contact/contact.html"
  },
  Orange: {
    name: "Orange",
    address: "Orange Service Clients\nTSA 10001\n59878 LILLE CEDEX 9",
    customerServiceUrl: "https://assistance.orange.fr/"
  },
  SFR: {
    name: "SFR",
    address: "SFR Service Client\nTSA 10101\n69947 LYON CEDEX 20",
    customerServiceUrl: "https://assistance.sfr.fr/"
  },
  Free: {
    name: "Free",
    address: "Free Service Abonne\n75371 PARIS CEDEX 08",
    customerServiceUrl: "https://assistance.free.fr/"
  },
  "Bouygues Telecom": {
    name: "Bouygues Telecom",
    address: "Bouygues Telecom\nService Clients\n60436 NOAILLES CEDEX",
    customerServiceUrl: "https://www.assistance.bouyguestelecom.fr/"
  }
};

function buildDetectedParties(documents: UploadedDocument[]): DetectedParties {
  const providers = documents.reduce<NonNullable<DetectedParties["providers"]>>(
    (accumulator, document) => {
      if (!document.provider) return accumulator;

      const knownProvider = knownProviderProfiles[document.provider];
      accumulator[document.provider] = knownProvider ?? {
        name: document.provider
      };

      return accumulator;
    },
    {}
  );

  return Object.keys(providers).length > 0 ? { providers } : {};
}

function buildExpense(
  template: ExpenseTemplate,
  document: UploadedDocument,
  index: number
): Expense {
  const fileWeight = Math.min(1.35, Math.max(0.82, document.fileSize / 1_200_000));
  const nameWeight =
    (Array.from(document.fileName).reduce(
      (total, character) => total + character.charCodeAt(0),
      0
    ) %
      17) /
      100 +
    0.94;
  const monthlyAmount = Math.max(
    4,
    Math.round(template.monthlyAmount * fileWeight * nameWeight)
  );

  return {
    id: `expense_${document.id}_${index}`,
    label: template.label,
    provider: document.provider ?? template.provider,
    category: template.category,
    subcategory: template.subcategory,
    isRecurring: true,
    monthlyAmount,
    yearlyAmount: monthlyAmount * 12,
    documentType: document.documentType,
    sourceDocumentId: document.id,
    sourceDocumentName: document.fileName,
    recurrence: "monthly"
  };
}

export function generateMockAnalysisFromDocuments(
  documents: UploadedDocument[]
): MockAnalysis {
  const readyDocuments = documents.filter((document) => document.status !== "error");
  const expenses = readyDocuments.flatMap((document) =>
    templatesByDocumentType[document.documentType].map((template, index) =>
      buildExpense(template, document, index)
    )
  );

  const recommendations = readyDocuments.flatMap((document) =>
    templatesByDocumentType[document.documentType].flatMap((template, index) =>
      template.recommendation
        ? [
            {
              id: `recommendation_${document.id}_${index}`,
              ...template.recommendation
            }
          ]
        : []
    )
  );

  const anomalies = readyDocuments.flatMap((document) =>
    templatesByDocumentType[document.documentType].flatMap((template, index) =>
      template.anomaly
        ? [
            {
              id: `anomaly_${document.id}_${index}`,
              ...template.anomaly
            }
          ]
        : []
    )
  );

  return {
    id: `analysis_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    documents: readyDocuments,
    detectedParties: buildDetectedParties(readyDocuments),
    expenses,
    recommendations,
    anomalies,
    totalMonthlyAmount: expenses.reduce(
      (total, expense) => total + expense.monthlyAmount,
      0
    ),
    totalYearlyAmount: expenses.reduce(
      (total, expense) => total + expense.yearlyAmount,
      0
    ),
    yearlyPotentialSavings: recommendations.reduce(
      (total, recommendation) => total + recommendation.potentialSaving,
      0
    )
  };
}
