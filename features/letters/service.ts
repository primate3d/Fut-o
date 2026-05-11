import { formatCurrency } from "@/lib/utils";
import { findAlternativeOffers } from "@/features/recommendations/service";
import { ExpenseCategory, ExpenseSubcategory } from "@/types";
import type {
  CustomerProfile,
  Expense,
  GeneratedLetter,
  GeneratedLetterType,
  LetterPersonalization,
  LetterTemplate,
  MockAnalysis,
  Recommendation
} from "@/types";

type LetterContextCategory =
  | "mobile"
  | "internet"
  | "assurance"
  | "energie"
  | "abonnements"
  | "banque";

type LetterPreset = {
  title: string;
  subject: string;
  reason: string;
  request: string;
};

export async function generateLetterDraftStub(
  _template: LetterTemplate,
  _recommendation?: Recommendation
): Promise<string> {
  return "";
}

const defaultPersonalization: LetterPersonalization = {
  firstName: "[Prenom]",
  lastName: "[Nom]",
  address: "[Adresse]",
  customerNumber: "[Numero client]",
  email: "[Email]"
};

function getDocumentCustomerProfile(
  analysis: MockAnalysis,
  expense: Expense
): CustomerProfile | undefined {
  const documentProfile = expense.sourceDocumentId
    ? analysis.detectedParties?.documents?.[expense.sourceDocumentId]
    : undefined;

  return {
    ...analysis.detectedParties?.customer,
    ...documentProfile?.customer,
    customerNumber:
      expense.customerNumber ||
      expense.contractNumber ||
      documentProfile?.customer?.customerNumber ||
      analysis.detectedParties?.customer?.customerNumber,
    contractNumber:
      expense.contractNumber ||
      documentProfile?.customer?.contractNumber ||
      analysis.detectedParties?.customer?.contractNumber,
    invoiceNumber:
      expense.invoiceNumber ||
      documentProfile?.customer?.invoiceNumber ||
      analysis.detectedParties?.customer?.invoiceNumber,
    phone:
      expense.phone ||
      documentProfile?.customer?.phone ||
      analysis.detectedParties?.customer?.phone
  };
}

const providerAddresses: Record<string, string> = {
  EDF: "Service Client EDF\nTSA 21941\n62978 ARRAS CEDEX 9",
  Engie: "ENGIE Service Clients\nTSA 87 494\n76934 ROUEN CEDEX 09",
  Orange: "Orange Service Clients\nTSA 10001\n59878 LILLE CEDEX 9",
  SFR: "SFR Service Client\nTSA 10101\n69947 LYON CEDEX 20",
  Free: "Free Service Abonne\n75371 PARIS CEDEX 08",
  "Bouygues Telecom": "Bouygues Telecom\nService Clients\n60436 NOAILLES CEDEX",
  Netflix: "Netflix International B.V.\nKarperstraat 8-10\n1075 KZ Amsterdam\nPays-Bas",
  "Banque Populaire": "Service Relation Clientele\nBP 1234\n75001 PARIS",
  "Mutuelle Habitat": "Service Clients Assurance\n45 Avenue de la Republique\n69000 LYON"
};

function getProviderAddress(provider: string) {
  return (
    providerAddresses[provider] ||
    `Service Client ${provider}\n[Adresse du prestataire a completer]\n[Code Postal et Ville]`
  );
}

function getDetectedProviderAddress(analysis: MockAnalysis, provider: string) {
  return (
    analysis.detectedParties?.providers?.[provider]?.address ||
    getProviderAddress(provider)
  );
}

function getPotentialSavingForExpense(analysis: MockAnalysis, expense: Expense) {
  return analysis.recommendations
    .filter((recommendation) => recommendation.category === expense.category)
    .reduce((total, recommendation) => total + recommendation.potentialSaving, 0);
}

function normalizeContextValue(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getLetterContextCategory(expense: Expense): LetterContextCategory | null {
  const searchable = normalizeContextValue(
    [
      expense.label,
      expense.provider,
      expense.documentType,
      expense.category,
      expense.subcategory
    ].join(" ")
  );

  if (
    expense.subcategory === ExpenseSubcategory.MOBILE ||
    expense.documentType === "mobile_invoice" ||
    /\b(mobile|forfait mobile|ligne mobile|sosh|red by sfr)\b/.test(searchable)
  ) {
    return "mobile";
  }

  if (
    expense.subcategory === ExpenseSubcategory.INTERNET ||
    expense.documentType === "internet_invoice" ||
    /\b(internet|box|fibre|adsl|livebox|freebox|bbox)\b/.test(searchable)
  ) {
    return "internet";
  }

  if (
    expense.category === ExpenseCategory.INSURANCE ||
    ["car_insurance", "home_insurance", "health_insurance"].includes(
      expense.documentType ?? ""
    ) ||
    /\b(assurance|habitation|auto|mutuelle)\b/.test(searchable)
  ) {
    return "assurance";
  }

  if (
    expense.category === ExpenseCategory.ENERGY ||
    ["electricity_invoice", "gas_invoice"].includes(expense.documentType ?? "") ||
    /\b(energie|electricite|gaz|edf|engie|totalenergies)\b/.test(searchable)
  ) {
    return "energie";
  }

  if (
    expense.category === ExpenseCategory.SUBSCRIPTIONS ||
    expense.documentType === "subscription" ||
    /\b(abonnement|streaming|netflix|spotify|canal)\b/.test(searchable)
  ) {
    return "abonnements";
  }

  if (
    expense.category === ExpenseCategory.BANKING ||
    expense.documentType === "bank_statement" ||
    /\b(banque|bancaire|frais|credit)\b/.test(searchable)
  ) {
    return "banque";
  }

  return null;
}

const letterTypesByCategory: Record<LetterContextCategory, GeneratedLetterType[]> = {
  mobile: [
    "price_negotiation",
    "offer_change",
    "subscription_cancellation",
    "comparison_report"
  ],
  internet: [
    "price_negotiation",
    "offer_change",
    "subscription_cancellation",
    "comparison_report"
  ],
  assurance: [
    "subscription_cancellation",
    "price_negotiation",
    "offer_change",
    "comparison_report"
  ],
  energie: [
    "offer_change",
    "comparison_report",
    "price_negotiation",
    "subscription_cancellation"
  ],
  abonnements: [
    "subscription_cancellation",
    "price_negotiation",
    "provider_followup"
  ],
  banque: ["price_negotiation", "provider_followup", "comparison_report"]
};

const defaultLetterTypes = [
  "price_negotiation",
  "provider_followup",
  "comparison_report"
] satisfies GeneratedLetterType[];

function buildBodyTemplate(params: {
  provider: string;
  monthlyAmount: number;
  yearlyAmount: number;
  potentialSaving: number;
  providerAddress: string;
  offerName?: string;
  offerUrl?: string;
  reason: string;
  request: string;
}) {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return [
    "{{firstName}} {{lastName}}",
    "{{address}}",
    "{{email}}",
    "",
    "                                        A l'attention du :",
    `                                        ${params.providerAddress
      .split("\n")
      .join("\n                                        ")}`,
    "",
    `                                        Fait le ${today}`,
    "",
    "Objet : {{subject}}",
    "Reference client : {{customerNumber}}",
    "",
    "Madame, Monsieur,",
    "",
    `Client(e) chez vous sous la reference {{customerNumber}}, je vous contacte au sujet du contrat indique dans mes documents, dont le montant mensuel est estime a ${formatCurrency(
      params.monthlyAmount
    )}, soit environ ${formatCurrency(params.yearlyAmount)} par an.`,
    "",
    params.reason,
    "",
    params.offerName
      ? `Offre reperee a comparer : ${params.offerName}${
          params.offerUrl ? ` (${params.offerUrl})` : ""
        }.`
      : "",
    params.offerName ? "" : "",
    params.request,
    "",
    `La piste d'amelioration estimee a partir des elements fournis est de ${formatCurrency(
      params.potentialSaving
    )} par an. Je vous remercie de me faire parvenir une proposition actualisee ou les modalites permettant de faire evoluer mon engagement.`,
    "",
    "Dans l'attente de votre retour, je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.",
    "",
    "{{firstName}} {{lastName}}",
    "",
    "Document préparé avec Futéo"
  ].join("\n");
}

const fallbackPresets: Record<GeneratedLetterType, LetterPreset> = {
  subscription_cancellation: {
    title: "Demarche de resiliation",
    subject: "Demande de resiliation de contrat / abonnement",
    reason:
      "Apres relecture de ma situation et de mes besoins actuels, je souhaite mettre fin a ce contrat.",
    request:
      "Je vous demande donc de proceder a la resiliation effective de mon abonnement dans les delais prevus par les conditions generales."
  },
  price_negotiation: {
    title: "Demande de negociation",
    subject: "Demande de renegociation de mes conditions tarifaires",
    reason:
      "Les elements compares font apparaitre des offres equivalentes qui semblent plus adaptees a ma situation actuelle.",
    request:
      "Je souhaite recevoir une proposition actualisee ou un geste commercial afin d'etudier la poursuite de mon contrat chez vous."
  },
  provider_followup: {
    title: "Relance fournisseur",
    subject: "Relance concernant ma demande precedente",
    reason:
      "Je souhaite obtenir un retour clair concernant l'ajustement possible de mon contrat.",
    request:
      "Je vous relance donc afin de connaitre les options disponibles pour faire evoluer mon offre actuelle."
  },
  offer_change: {
    title: "Demande de changement d'offre",
    subject: "Changement vers une offre plus adaptee",
    reason:
      "Mon usage actuel semble pouvoir correspondre a une offre plus simple ou plus adaptee que mon contrat actuel.",
    request:
      "Je souhaite etudier le passage vers une offre plus competitive ou toute proposition equivalente que vous pourriez me transmettre."
  },
  comparison_report: {
    title: "Rapport de comparaison",
    subject: "Transmission d'une comparaison de mon contrat",
    reason:
      "Je souhaite partager une comparaison entre mon contrat actuel et plusieurs offres disponibles afin d'echanger sur une solution plus adaptee.",
    request:
      "Ce document sert de base a ma demande d'alignement, d'ajustement ou de modification de mon engagement actuel."
  }
};

const categoryPresets: Record<
  LetterContextCategory,
  Partial<Record<GeneratedLetterType, LetterPreset>>
> = {
  mobile: {
    price_negotiation: {
      title: "Negociation forfait mobile",
      subject: "Demande de renegociation de mon forfait mobile",
      reason:
        "La comparaison de mon forfait mobile fait apparaitre des offres mobiles plus adaptees a mon usage actuel.",
      request:
        "Je souhaite recevoir une proposition tarifaire actualisee pour conserver mon forfait dans de meilleures conditions."
    },
    offer_change: {
      title: "Changement d'offre mobile",
      subject: "Demande de changement d'offre mobile",
      reason:
        "Mon forfait mobile actuel semble pouvoir etre remplace par une offre plus simple ou plus competitive.",
      request:
        "Je souhaite connaitre les offres mobiles disponibles correspondant a mon usage et les modalites de changement."
    },
    subscription_cancellation: {
      title: "Resiliation forfait mobile",
      subject: "Demande de resiliation de mon forfait mobile",
      reason:
        "Apres comparaison de mon forfait mobile et de mes besoins, je souhaite mettre fin a cet abonnement.",
      request:
        "Je vous demande de proceder a la resiliation de ma ligne mobile selon les conditions applicables."
    },
    comparison_report: {
      title: "Comparaison forfait mobile",
      subject: "Comparaison de mon forfait mobile",
      reason:
        "Je souhaite partager les elements de comparaison retrouves autour de mon forfait mobile actuel.",
      request:
        "Cette comparaison sert de base pour etudier une negociation, un changement d'offre ou une resiliation."
    }
  },
  internet: {
    price_negotiation: {
      title: "Negociation box internet",
      subject: "Demande de renegociation de mon abonnement internet",
      reason:
        "La comparaison de ma box internet fait apparaitre des offres proches potentiellement plus interessantes.",
      request:
        "Je souhaite recevoir une proposition actualisee pour mon abonnement internet."
    },
    offer_change: {
      title: "Changement d'offre internet",
      subject: "Demande de changement d'offre internet",
      reason:
        "Mon abonnement internet actuel semble pouvoir evoluer vers une offre plus adaptee.",
      request:
        "Je souhaite connaitre les offres internet disponibles et les conditions de changement."
    },
    subscription_cancellation: {
      title: "Resiliation box internet",
      subject: "Demande de resiliation de mon abonnement internet",
      reason:
        "Apres comparaison de mon contrat internet et de mes besoins, je souhaite mettre fin a cet abonnement.",
      request:
        "Je vous demande de proceder a la resiliation de ma box internet dans les conditions prevues."
    },
    comparison_report: {
      title: "Comparaison box internet",
      subject: "Comparaison de mon abonnement internet",
      reason:
        "Je souhaite partager les elements de comparaison retrouves autour de mon contrat internet actuel.",
      request:
        "Cette comparaison sert de base pour etudier une negociation ou un changement d'offre."
    }
  },
  assurance: {
    subscription_cancellation: {
      title: "Resiliation assurance",
      subject: "Demande de resiliation de mon contrat d'assurance",
      reason:
        "Apres relecture de mon contrat d'assurance et de mes besoins, je souhaite etudier sa resiliation.",
      request:
        "Je vous remercie de m'indiquer les modalites et la date possible de resiliation de ce contrat."
    },
    price_negotiation: {
      title: "Reevaluation tarifaire assurance",
      subject: "Demande de reevaluation tarifaire de mon assurance",
      reason:
        "La comparaison de mon assurance fait apparaitre une possibilite de reevaluation tarifaire.",
      request:
        "Je souhaite recevoir une proposition actualisee tenant compte de ma situation et des garanties utiles."
    },
    offer_change: {
      title: "Changement d'offre assurance",
      subject: "Demande de changement d'offre assurance",
      reason:
        "Mes garanties actuelles semblent pouvoir etre ajustees vers une offre plus adaptee.",
      request:
        "Je souhaite connaitre les formules disponibles et les consequences sur mon tarif."
    },
    comparison_report: {
      title: "Comparaison assurance",
      subject: "Comparaison de mon contrat d'assurance",
      reason:
        "Je souhaite partager une comparaison de mon contrat d'assurance avec les garanties et tarifs reperes.",
      request:
        "Cette comparaison sert de base pour une reevaluation, un changement d'offre ou une resiliation."
    }
  },
  energie: {
    offer_change: {
      title: "Changement fournisseur energie",
      subject: "Demande d'information pour changer d'offre energie",
      reason:
        "La comparaison de mon contrat energie fait apparaitre des offres potentiellement plus adaptees.",
      request:
        "Je souhaite connaitre les conditions pour faire evoluer mon contrat ou changer d'offre energie."
    },
    comparison_report: {
      title: "Comparaison energie",
      subject: "Comparaison de mon contrat energie",
      reason:
        "Je souhaite partager les elements de comparaison retrouves autour de mon contrat electricite ou gaz.",
      request:
        "Cette comparaison sert de base pour etudier un changement de fournisseur ou une negociation."
    },
    price_negotiation: {
      title: "Negociation contrat energie",
      subject: "Demande de renegociation de mon contrat energie",
      reason:
        "Les elements compares font apparaitre une possibilite d'ajustement de mon contrat energie.",
      request:
        "Je souhaite recevoir une proposition actualisee ou des informations sur les options plus adaptees."
    },
    subscription_cancellation: {
      title: "Resiliation energie",
      subject: "Demande de resiliation de mon contrat energie",
      reason:
        "Apres comparaison de mon contrat energie, je souhaite connaitre les conditions de resiliation.",
      request:
        "Je vous remercie de m'indiquer les modalites applicables pour mettre fin a ce contrat."
    }
  },
  abonnements: {
    subscription_cancellation: {
      title: "Resiliation abonnement",
      subject: "Demande de resiliation de mon abonnement",
      reason:
        "Apres relecture de mes depenses mensuelles, cet abonnement ne semble plus correspondre a mon besoin actuel.",
      request:
        "Je vous demande de proceder a la resiliation de cet abonnement selon les conditions applicables."
    },
    price_negotiation: {
      title: "Negociation abonnement",
      subject: "Demande de reduction tarifaire sur mon abonnement",
      reason:
        "La comparaison de mes abonnements fait apparaitre une possibilite de reduction tarifaire.",
      request:
        "Je souhaite connaitre les offres ou gestes commerciaux disponibles pour conserver cet abonnement."
    },
    provider_followup: {
      title: "Relance service abonnement",
      subject: "Relance concernant mon abonnement",
      reason:
        "Je souhaite obtenir un retour clair concernant ma demande sur cet abonnement.",
      request:
        "Je vous relance afin de connaitre les options disponibles ou la suite donnee a ma demande."
    }
  },
  banque: {
    price_negotiation: {
      title: "Negociation frais bancaires",
      subject: "Demande de reevaluation de mes frais bancaires",
      reason:
        "La lecture de mes depenses fait apparaitre des frais bancaires qui meritent une reevaluation.",
      request:
        "Je souhaite connaitre les possibilites de reduction, de geste commercial ou d'offre plus adaptee."
    },
    provider_followup: {
      title: "Relance banque",
      subject: "Relance concernant ma demande bancaire",
      reason:
        "Je souhaite obtenir un retour clair concernant ma demande liee a mes frais ou a mon contrat bancaire.",
      request:
        "Je vous relance afin de connaitre les options disponibles et la suite donnee a ma demande."
    },
    comparison_report: {
      title: "Comparaison frais bancaires",
      subject: "Comparaison de mes frais bancaires",
      reason:
        "Je souhaite partager une comparaison de mes frais bancaires avec les elements retrouves.",
      request:
        "Cette comparaison sert de base pour etudier une reduction tarifaire ou une offre plus adaptee."
    }
  }
};

function getPresetForExpense(type: GeneratedLetterType, expense: Expense) {
  const context = getLetterContextCategory(expense);
  return context ? categoryPresets[context]?.[type] ?? fallbackPresets[type] : fallbackPresets[type];
}

function createLetter(
  type: GeneratedLetterType,
  expense: Expense,
  analysis: MockAnalysis
): GeneratedLetter {
  const potentialSaving = Math.max(getPotentialSavingForExpense(analysis, expense), 48);
  const bestOffer = findAlternativeOffers([expense])[0];
  const providerAddress = getDetectedProviderAddress(analysis, expense.provider);

  const preset = getPresetForExpense(type, expense);

  return {
    id: `letter_${type}_${expense.id}`,
    type,
    provider: expense.provider,
    providerAddress,
    customerProfile: getDocumentCustomerProfile(analysis, expense),
    offerName: bestOffer?.name,
    offerUrl: bestOffer?.url,
    category: expense.category,
    potentialSaving,
    monthlyAmount: expense.monthlyAmount,
    yearlyAmount: expense.yearlyAmount,
    subject: preset.subject,
    title: preset.title,
    bodyTemplate: buildBodyTemplate({
      provider: expense.provider,
      monthlyAmount: expense.monthlyAmount,
      yearlyAmount: expense.yearlyAmount,
      potentialSaving,
      providerAddress,
      offerName: bestOffer?.name,
      offerUrl: bestOffer?.url,
      reason: preset.reason,
      request: preset.request
    })
  };
}

function getLetterTypesForExpense(expense: Expense, _analysis: MockAnalysis) {
  const context = getLetterContextCategory(expense);
  return context ? letterTypesByCategory[context] : defaultLetterTypes;
}

export function generateLettersFromAnalysis(analysis: MockAnalysis): GeneratedLetter[] {
  const letters = analysis.expenses.flatMap((expense) =>
    getLetterTypesForExpense(expense, analysis).map((type) =>
      createLetter(type, expense, analysis)
    )
  );

  return letters.sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 50);
}

export function renderLetter(
  letter: GeneratedLetter,
  personalization: Partial<LetterPersonalization>
) {
  const fullNameParts = letter.customerProfile?.fullName
    ?.trim()
    .split(/\s+/)
    .filter(Boolean);
  const values = {
    ...defaultPersonalization,
    firstName: letter.customerProfile?.firstName || fullNameParts?.[0],
    lastName: letter.customerProfile?.lastName || fullNameParts?.slice(1).join(" "),
    address: letter.customerProfile?.address,
    customerNumber:
      letter.customerProfile?.customerNumber || letter.customerProfile?.contractNumber,
    email: letter.customerProfile?.email,
    ...Object.fromEntries(
      Object.entries(personalization).filter(([, value]) => Boolean(value))
    )
  };

  return letter.bodyTemplate
    .replaceAll("{{firstName}}", values.firstName || defaultPersonalization.firstName)
    .replaceAll("{{lastName}}", values.lastName || defaultPersonalization.lastName)
    .replaceAll("{{address}}", values.address || defaultPersonalization.address)
    .replaceAll(
      "{{customerNumber}}",
      values.customerNumber || defaultPersonalization.customerNumber
    )
    .replaceAll("{{email}}", values.email || defaultPersonalization.email)
    .replaceAll("{{subject}}", letter.subject);
}
