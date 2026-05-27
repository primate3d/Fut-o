import { findAlternativeOffers } from "@/features/recommendations/service";
import type { SelectedAlternativeOffer } from "@/features/recommendations/selected-offer";
import { ExpenseCategory, ExpenseSubcategory } from "@/types";
import type {
  CustomerProfile,
  DocumentPartyProfile,
  Expense,
  GeneratedLetter,
  GeneratedLetterType,
  LetterPersonalization,
  LetterTemplate,
  MockAnalysis,
  ProviderProfile,
  Recommendation
} from "@/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

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
  firstName: "",
  lastName: "",
  address: "",
  customerNumber: "",
  email: "",
  contractNumber: "",
  invoiceNumber: "",
  phone: ""
};

function hasText(value?: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeDetectedCustomerIdentity(customer: CustomerProfile | undefined) {
  if (!customer) return undefined;

  const identityText = [customer.fullName, customer.firstName, customer.lastName]
    .filter(hasText)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const looksLikeDocumentText =
    /\b(souscrit|offre|abonnement|contrat|facture|forfait|adsl|fibre|internet|mobile|sfr)\b/.test(
      identityText
    );

  if (!looksLikeDocumentText) return customer;

  return {
    ...customer,
    fullName: undefined,
    firstName: undefined,
    lastName: undefined
  };
}

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
      documentProfile?.customer?.customerNumber ||
      analysis.detectedParties?.customer?.customerNumber ||
      expense.contractNumber,
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
  Sosh: "Sosh\nService Clients\n59878 LILLE CEDEX 9",
  SFR: "SFR Service Client\nTSA 10101\n69947 LYON CEDEX 20",
  "RED by SFR": "SFR Service Client\nService RED\nTSA 10101\n69947 LYON CEDEX 20",
  Free: "Free Service Abonne\n75371 PARIS CEDEX 08",
  "NRJ Mobile": "NRJ Mobile - Service Client\n53098 Laval Cedex 09",
  "Bouygues Telecom": "Bouygues Telecom\nService Clients\n60436 NOAILLES CEDEX",
  "B&You": "Bouygues Telecom\nService Clients B&You\n60436 NOAILLES CEDEX",
  Netflix: "Netflix International B.V.\nKarperstraat 8-10\n1075 KZ Amsterdam\nPays-Bas",
  "Banque Populaire": "Service Relation Clientele\nBP 1234\n75001 PARIS",
  "Mutuelle Habitat": "Service Clients Assurance\n45 Avenue de la Republique\n69000 LYON"
};

function getProviderAddress(provider: string) {
  return (
    providerAddresses[provider] ||
    `Service Client ${provider}\nAdresse du prestataire a completer`
  );
}

function normalizeProviderLookupKey(provider?: string) {
  const normalized = (provider ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const synonyms: Array<[string, string]> = [
    ["red by sfr", "sfr"],
    ["nrj mobile", "nrj"],
    ["bouygues telecom", "bouygues"],
    ["sosh", "orange"],
    ["engie", "engie"],
    ["edf", "edf"],
    ["sfr", "sfr"],
    ["orange", "orange"],
    ["free", "free"]
  ];

  return synonyms.find(([alias]) => normalized.includes(alias))?.[1] ?? normalized;
}

function findProviderProfileByNormalizedKey(
  providers: NonNullable<MockAnalysis["detectedParties"]>["providers"] | undefined,
  provider: string
) {
  const searchedKey = normalizeProviderLookupKey(provider);
  return Object.entries(providers ?? {}).find(
    ([key, profile]) =>
      normalizeProviderLookupKey(key) === searchedKey ||
      normalizeProviderLookupKey(profile.name) === searchedKey
  )?.[1];
}

function getDocumentProfileForExpense(
  analysis: MockAnalysis,
  expense: Expense
): DocumentPartyProfile | undefined {
  if (expense.sourceDocumentId) {
    return analysis.detectedParties?.documents?.[expense.sourceDocumentId];
  }

  const expenseProviderKey = normalizeProviderLookupKey(expense.provider);
  if (!expenseProviderKey) return undefined;

  return Object.values(analysis.detectedParties?.documents ?? {}).find((documentProfile) => {
    const providerNames = [
      documentProfile.providerName,
      documentProfile.provider?.name
    ];

    return providerNames.some(
      (providerName) => normalizeProviderLookupKey(providerName) === expenseProviderKey
    );
  });
}

const commercialProviderNames = ["NRJ Mobile", "Sosh", "RED by SFR", "B&You"];

function pickCommercialProvider(...providers: Array<string | undefined>) {
  const candidates = providers.filter(Boolean) as string[];
  return (
    commercialProviderNames.find((provider) => candidates.includes(provider)) ??
    candidates[0]
  );
}

function getCommercialProviderName(analysis: MockAnalysis, expense: Expense) {
  const documentProfile = getDocumentProfileForExpense(analysis, expense);
  return pickCommercialProvider(
    documentProfile?.providerName,
    documentProfile?.provider?.name,
    expense.provider
  ) ?? expense.provider;
}

function getDetectedProviderProfile(
  analysis: MockAnalysis,
  expense: Expense,
  provider: string
): ProviderProfile | undefined {
  const documentProfile = getDocumentProfileForExpense(analysis, expense);
  const detectedProvider =
    findProviderProfileByNormalizedKey(analysis.detectedParties?.providers, provider) ||
    findProviderProfileByNormalizedKey(analysis.detectedParties?.providers, expense.provider);

  return (
    documentProfile?.provider ||
    detectedProvider
  );
}

function formatPostalAddressLines(address: string) {
  return address
    .split("\n")
    .flatMap((line) => {
      const trimmedLine = line.trim();
      const postalMatch = trimmedLine.match(/^(.+?)[,\s]+(\d{5}\s+.+)$/);

      if (!postalMatch) {
        return [trimmedLine];
      }

      return [postalMatch[1].trim(), postalMatch[2].trim()];
    })
    .filter(Boolean);
}

function formatSenderAddress(address?: string) {
  return (address ?? "")
    .replace(/\s*,\s*/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const trimmedLine = line.trim();
      const postalMatch = trimmedLine.match(/^(.+?)\s+(\d{5}\s+.+)$/);

      if (!postalMatch) {
        return [trimmedLine];
      }

      return [postalMatch[1].trim(), postalMatch[2].trim()];
    })
    .flatMap((line) => {
      const streetMatch = line.match(/^(.{12,}?)\s+(\d{1,5}\s+(?:rue|avenue|av\.?|allee|allée|boulevard|bd|chemin|impasse|route|place)\b.+)$/i);
      if (!streetMatch) {
        return [line];
      }

      return [streetMatch[1].trim(), streetMatch[2].trim()];
    })
    .filter(Boolean)
    .join("\n");
}

function isUsableReference(value?: string) {
  if (!value?.trim()) return false;
  return !/(?:titulaire|votre contrat|facture|electricit[eé]|tarif bleu|point de livraison)$/i.test(
    value.trim()
  );
}

function buildProviderRecipientBlock(provider: string, address?: string) {
  const providerAddress = address || getProviderAddress(provider);
  const addressLines = formatPostalAddressLines(providerAddress);
  const firstLine = addressLines[0] ?? "";

  if (firstLine.toLowerCase().includes(provider.toLowerCase())) {
    return addressLines.join("\n");
  }

  return [provider, ...addressLines].join("\n");
}

function getDetectedProviderAddress(
  analysis: MockAnalysis,
  expense: Expense,
  provider: string
) {
  return buildProviderRecipientBlock(
    provider,
    getDetectedProviderProfile(analysis, expense, provider)?.address
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
  offerProvider?: string;
  offerMonthlyPrice?: number;
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
    "Référence client : {{customerNumber}}",
    "Numéro de contrat : {{contractNumber}}",
    "Numéro de facture : {{invoiceNumber}}",
    "Téléphone : {{phone}}",
    "",
    "Madame, Monsieur,",
    "",
    `Je suis client(e) chez vous sous la référence {{customerNumber}}. Je vous écris au sujet de mon contrat, facturé ${formatCurrency(
      params.monthlyAmount
    )} par mois, soit environ ${formatCurrency(params.yearlyAmount)} par an.`,
    "",
    params.reason,
    "",
    params.offerName
      ? `J'ai également repéré une offre comparable qui pourrait mieux correspondre à mon usage : ${
          params.offerProvider ? `${params.offerProvider} - ` : ""
        }${params.offerName}${
          typeof params.offerMonthlyPrice === "number"
            ? `, à ${formatCurrency(params.offerMonthlyPrice)} / mois`
            : ""
        }${
          params.offerUrl ? ` (${params.offerUrl})` : ""
        }.`
      : "",
    params.offerName ? "" : "",
    params.request,
    "",
    params.potentialSaving > 0
      ? `D'après les éléments dont je dispose, l'économie possible serait d'environ ${formatCurrency(
          params.potentialSaving
        )} par an. Avant de prendre une décision, je souhaite savoir si vous pouvez me proposer de meilleures conditions ou une offre plus adaptée.`
      : "Avant de prendre une décision, je souhaite savoir si vous pouvez me proposer de meilleures conditions ou une offre plus adaptée.",
    "",
    "Dans l'attente de votre retour, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
    "",
    "{{firstName}} {{lastName}}"
  ].join("\n");
}

function getFollowupRequest(type: GeneratedLetterType) {
  switch (type) {
    case "subscription_cancellation":
      return "Je vous remercie de me confirmer la prise en compte de ma demande de resiliation, ainsi que sa date d'effet et les eventuelles demarches restant a effectuer.";
    case "offer_change":
      return "Je vous remercie de me confirmer l'etat de traitement de ma demande de changement d'offre et les conditions qui seront appliquees.";
    case "comparison_report":
      return "Je vous remercie de m'indiquer si une proposition adaptee peut m'etre formulee au regard des elements transmis.";
    case "price_negotiation":
      return "Je vous remercie d'etudier ma demande et de me communiquer les conditions tarifaires pouvant etre proposees pour ce contrat, ou a defaut de me confirmer votre position.";
    case "provider_followup":
    default:
      return "Je vous remercie de bien vouloir me communiquer la suite donnee a ma demande.";
  }
}

function buildFollowupBodyTemplate(params: {
  providerAddress: string;
  monthlyAmount: number;
  yearlyAmount: number;
  initialTitle: string;
  initialDate: string;
  initialType: GeneratedLetterType;
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
    "Référence client : {{customerNumber}}",
    "Numéro de contrat : {{contractNumber}}",
    "Numéro de facture : {{invoiceNumber}}",
    "Téléphone : {{phone}}",
    "",
    "Madame, Monsieur,",
    "",
    `Je me permets de revenir vers vous au sujet de ma demande initiale "${params.initialTitle}", datee du ${params.initialDate}.`,
    "",
    `Cette demande concerne mon contrat facture ${formatCurrency(
      params.monthlyAmount
    )} par mois, soit ${formatCurrency(params.yearlyAmount)} par an.`,
    "",
    "Sauf erreur de ma part, je n'ai pas encore recu de reponse a ce jour.",
    "",
    getFollowupRequest(params.initialType),
    "",
    "Dans l'attente de votre retour, je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.",
    "",
    "{{firstName}} {{lastName}}"
  ].join("\n");
}

const fallbackPresets: Record<GeneratedLetterType, LetterPreset> = {
  subscription_cancellation: {
    title: "Demarche de resiliation",
    subject: "Demande de resiliation de contrat / abonnement",
    reason:
      "Ma situation a evolue et ce contrat ne correspond plus vraiment a mes besoins.",
    request:
      "Je vous remercie de prendre en compte ma demande de resiliation et de m'indiquer la date de fin effective."
  },
  price_negotiation: {
    title: "Demande de negociation",
    subject: "Demande de renegociation de mes conditions tarifaires",
    reason:
      "J'ai compare mon contrat avec d'autres offres du marche et je constate que mon tarif pourrait etre revu.",
    request:
      "Je prefere rester chez vous si une proposition plus competitive peut m'etre faite."
  },
  provider_followup: {
    title: "Relance fournisseur",
    subject: "Relance concernant ma demande precedente",
    reason:
      "Je reviens vers vous car je n'ai pas encore de reponse claire concernant ma demande.",
    request:
      "Pouvez-vous me confirmer les options possibles pour adapter mon offre actuelle ?"
  },
  offer_change: {
    title: "Demande de changement d'offre",
    subject: "Changement vers une offre plus adaptee",
    reason:
      "Mon usage a change et une offre plus simple pourrait aujourd'hui mieux me convenir.",
    request:
      "Je souhaite connaitre les offres disponibles et les conditions pour changer sans difficulte."
  },
  comparison_report: {
    title: "Rapport de comparaison",
    subject: "Transmission d'une comparaison de mon contrat",
    reason:
      "Je vous transmets les elements que j'ai releves afin d'echanger sur mon contrat actuel.",
    request:
      "J'aimerais savoir si vous pouvez vous aligner ou me proposer une solution plus adaptee."
  }
};

const categoryPresets: Record<
  LetterContextCategory,
  Partial<Record<GeneratedLetterType, LetterPreset>>
> = {
  mobile: {
    price_negotiation: {
      title: "Négociation forfait mobile",
      subject: "Demande de renégociation de mon forfait mobile",
      reason:
        "En regardant les offres mobiles disponibles, je vois que mon forfait pourrait être ajusté à un tarif plus cohérent avec mon usage.",
      request:
        "Je souhaite savoir si vous pouvez me proposer un meilleur tarif ou une offre équivalente plus avantageuse."
    },
    offer_change: {
      title: "Changement d'offre mobile",
      subject: "Demande de changement d'offre mobile",
      reason:
        "Mon forfait actuel ne me semble plus le plus adapté, notamment au regard des offres mobiles disponibles aujourd'hui.",
      request:
        "Pouvez-vous m'indiquer les offres que vous pouvez me proposer et les conditions de changement ?"
    },
    subscription_cancellation: {
      title: "Résiliation forfait mobile",
      subject: "Demande de résiliation de mon forfait mobile",
      reason:
        "Après avoir comparé mon forfait et mes besoins actuels, je préfère mettre fin à cette ligne.",
      request:
        "Je vous remercie de procéder à la résiliation dans les conditions prévues et de me confirmer la date de fin."
    },
    comparison_report: {
      title: "Comparaison forfait mobile",
      subject: "Comparaison de mon forfait mobile",
      reason:
        "Je souhaite vous partager les éléments que j'ai comparés concernant mon forfait mobile.",
      request:
        "Ces éléments me permettront de décider s'il est préférable de renégocier, changer d'offre ou résilier."
    }
  },
  internet: {
    price_negotiation: {
      title: "Negociation box internet",
      subject: "Demande de renegociation de mon abonnement internet",
      reason:
        "En comparant mon abonnement internet avec les offres disponibles, je constate que mon tarif pourrait etre revu.",
      request:
        "Je souhaite savoir si vous pouvez me proposer un tarif plus interessant pour conserver mon abonnement."
    },
    offer_change: {
      title: "Changement d'offre internet",
      subject: "Demande de changement d'offre internet",
      reason:
        "Mon abonnement actuel ne correspond peut-etre plus exactement a mes besoins.",
      request:
        "Pouvez-vous m'indiquer les offres disponibles et les conditions pour changer simplement ?"
    },
    subscription_cancellation: {
      title: "Resiliation box internet",
      subject: "Demande de resiliation de mon abonnement internet",
      reason:
        "Apres comparaison de mon abonnement et de mes besoins actuels, je souhaite y mettre fin.",
      request:
        "Je vous remercie de m'indiquer la date de resiliation possible et les eventuelles demarches a prevoir."
    },
    comparison_report: {
      title: "Comparaison box internet",
      subject: "Comparaison de mon abonnement internet",
      reason:
        "Je souhaite vous transmettre les elements que j'ai compares concernant mon abonnement internet.",
      request:
        "J'aimerais savoir si une adaptation de mon offre actuelle est possible."
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
        "En relisant mon contrat, je pense que le tarif pourrait etre reevalue.",
      request:
        "Je souhaite savoir si vous pouvez me proposer un ajustement tenant compte de ma situation actuelle."
    },
    offer_change: {
      title: "Changement d'offre assurance",
      subject: "Demande de changement d'offre assurance",
      reason:
        "Mes garanties actuelles pourraient etre mieux ajustees a mes besoins.",
      request:
        "Pouvez-vous me presenter les formules disponibles et leur impact sur mon tarif ?"
    },
    comparison_report: {
      title: "Comparaison assurance",
      subject: "Comparaison de mon contrat d'assurance",
      reason:
        "Je souhaite partager les elements compares concernant mon contrat d'assurance.",
      request:
        "J'aimerais savoir si une solution plus adaptee peut etre proposee."
    }
  },
  energie: {
    offer_change: {
      title: "Changement fournisseur energie",
      subject: "Demande d'information pour changer d'offre energie",
      reason:
        "En comparant mon contrat energie, je vois qu'une autre offre pourrait etre plus adaptee.",
      request:
        "Je souhaite connaitre les conditions pour faire evoluer mon contrat ou changer d'offre."
    },
    comparison_report: {
      title: "Comparaison energie",
      subject: "Comparaison de mon contrat energie",
      reason:
        "Je souhaite vous transmettre les elements compares autour de mon contrat energie.",
      request:
        "J'aimerais savoir quelles options sont possibles pour reduire ou ajuster ma facture."
    },
    price_negotiation: {
      title: "Negociation contrat energie",
      subject: "Demande de renegociation de mon contrat energie",
      reason:
        "Les elements compares me laissent penser que mon contrat energie pourrait etre ajuste.",
      request:
        "Je souhaite recevoir une proposition plus adaptee, ou les informations utiles pour faire evoluer mon contrat."
    },
    subscription_cancellation: {
      title: "Resiliation energie",
      subject: "Demande de resiliation de mon contrat energie",
      reason:
        "Apres comparaison de mon contrat energie, j'envisage d'y mettre fin.",
      request:
        "Je vous remercie de m'indiquer les modalites applicables et la date possible de resiliation."
    }
  },
  abonnements: {
    subscription_cancellation: {
      title: "Resiliation abonnement",
      subject: "Demande de resiliation de mon abonnement",
      reason:
        "Apres relecture de mes depenses mensuelles, cet abonnement ne me semble plus utile aujourd'hui.",
      request:
        "Je vous remercie de prendre en compte ma demande de resiliation et de me confirmer sa date d'effet."
    },
    price_negotiation: {
      title: "Negociation abonnement",
      subject: "Demande de reduction tarifaire sur mon abonnement",
      reason:
        "En comparant mes abonnements, je pense que ce tarif pourrait etre revu.",
      request:
        "Je souhaite savoir si une remise ou une offre plus adaptee peut m'etre proposee."
    },
    provider_followup: {
      title: "Relance service abonnement",
      subject: "Relance concernant mon abonnement",
      reason:
        "Je me permets de vous relancer concernant ma demande sur cet abonnement.",
      request:
        "Pouvez-vous m'indiquer les options disponibles ou la suite donnee a mon dossier ?"
    }
  },
  banque: {
    price_negotiation: {
      title: "Negociation frais bancaires",
      subject: "Demande de reevaluation de mes frais bancaires",
      reason:
        "En relisant mes depenses, certains frais bancaires me semblent pouvoir etre revus.",
      request:
        "Je souhaite connaitre les possibilites de reduction ou d'offre plus adaptee."
    },
    provider_followup: {
      title: "Relance banque",
      subject: "Relance concernant ma demande bancaire",
      reason:
        "Je me permets de vous relancer concernant ma demande liee a mes frais ou a mon contrat bancaire.",
      request:
        "Pouvez-vous m'indiquer les options disponibles et la suite donnee a ma demande ?"
    },
    comparison_report: {
      title: "Comparaison frais bancaires",
      subject: "Comparaison de mes frais bancaires",
      reason:
        "Je souhaite vous transmettre les elements que j'ai compares concernant mes frais bancaires.",
      request:
        "J'aimerais savoir si une reduction ou une offre plus adaptee peut etre envisagee."
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
  analysis: MockAnalysis,
  selectedOffer?: SelectedAlternativeOffer | null
): GeneratedLetter {
  const bestOffer =
    selectedOffer?.category === expense.category
      ? selectedOffer
      : findAlternativeOffers([expense])[0];
  const potentialSaving =
    bestOffer && typeof bestOffer.monthlyPrice === "number"
      ? Math.max(0, expense.yearlyAmount - bestOffer.monthlyPrice * 12)
      : bestOffer?.estimatedYearlySaving ?? Math.max(getPotentialSavingForExpense(analysis, expense), 0);
  const provider = getCommercialProviderName(analysis, expense);
  const providerAddress = getDetectedProviderAddress(analysis, expense, provider);

  const preset = getPresetForExpense(type, expense);

  return {
    id: `letter_${type}_${expense.id}`,
    type,
    provider,
    providerAddress,
    customerProfile: getDocumentCustomerProfile(analysis, expense),
    offerName: bestOffer?.name,
    offerProvider: bestOffer?.provider,
    offerMonthlyPrice: bestOffer?.monthlyPrice,
    offerEstimatedYearlySaving: bestOffer?.estimatedYearlySaving,
    offerUrl: bestOffer?.url,
    category: expense.category,
    potentialSaving,
    monthlyAmount: expense.monthlyAmount,
    yearlyAmount: expense.yearlyAmount,
    subject: preset.subject,
    title: preset.title,
    bodyTemplate: buildBodyTemplate({
      provider,
      monthlyAmount: expense.monthlyAmount,
      yearlyAmount: expense.yearlyAmount,
      potentialSaving,
      providerAddress,
      offerName: bestOffer?.name,
      offerProvider: bestOffer?.provider,
      offerMonthlyPrice: bestOffer?.monthlyPrice,
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

export function generateLettersFromAnalysis(
  analysis: MockAnalysis,
  selectedOffer?: SelectedAlternativeOffer | null
): GeneratedLetter[] {
  const letters = analysis.expenses.flatMap((expense) =>
    getLetterTypesForExpense(expense, analysis).map((type) =>
      createLetter(type, expense, analysis, selectedOffer)
    )
  );

  return letters.sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 50);
}

export function createFollowupLetterFromSnapshot(
  sourceLetter: GeneratedLetter,
  sourceActionDate: string
): GeneratedLetter {
  const originalDate = new Date(sourceActionDate).toLocaleDateString("fr-FR");

  return {
    ...sourceLetter,
    id: `letter_provider_followup_${sourceLetter.id}_${Date.now()}`,
    type: "provider_followup",
    title: `Relance - ${sourceLetter.title}`,
    subject: `Relance concernant ma demande du ${originalDate}`,
    bodyTemplate: buildFollowupBodyTemplate({
      initialTitle: sourceLetter.title,
      initialDate: originalDate,
      initialType: sourceLetter.type,
      monthlyAmount: sourceLetter.monthlyAmount,
      yearlyAmount: sourceLetter.yearlyAmount,
      providerAddress: sourceLetter.providerAddress ?? sourceLetter.provider
    })
  };
}

export function renderLetter(
  letter: GeneratedLetter,
  personalization: Partial<LetterPersonalization>
) {
  const detectedCustomer = sanitizeDetectedCustomerIdentity(letter.customerProfile);
  const fullNameParts = detectedCustomer?.fullName
    ?.trim()
    .split(/\s+/)
    .filter(Boolean);
  const values = {
    ...defaultPersonalization,
    firstName: detectedCustomer?.firstName || fullNameParts?.[0],
    lastName: detectedCustomer?.lastName || fullNameParts?.slice(1).join(" "),
    address: detectedCustomer?.address,
    customerNumber:
      detectedCustomer?.customerNumber || detectedCustomer?.contractNumber,
    contractNumber: isUsableReference(detectedCustomer?.contractNumber)
      ? detectedCustomer?.contractNumber
      : "",
    invoiceNumber: isUsableReference(detectedCustomer?.invoiceNumber)
      ? detectedCustomer?.invoiceNumber
      : "",
    phone: detectedCustomer?.phone,
    email: detectedCustomer?.email,
    ...Object.fromEntries(
      Object.entries(personalization).filter(([, value]) => Boolean(value))
    )
  };

  // 1. Gestion du bloc expéditeur (toujours présent)
  const senderInfo = [
    `${values.firstName || ""} ${values.lastName || ""}`.trim(),
    formatSenderAddress(values.address),
    values.email || ""
  ].filter(line => line.length > 0);

  const senderBlock = senderInfo.length > 0 ? senderInfo.join("\n") : "Coordonnées à compléter";

  // 2. Traitement du template
  let body = letter.bodyTemplate;

  // On remplace d'abord le bloc expéditeur fixe (les 3 premières lignes)
  body = body.replace("{{firstName}} {{lastName}}\n{{address}}\n{{email}}", senderBlock);

  // Remplacement des champs standards
  body = body
    .replaceAll("{{subject}}", letter.subject)
    .replaceAll("{{customerNumber}}", values.customerNumber || "")
    .replaceAll("{{firstName}}", values.firstName || "") // Pour la signature en bas
    .replaceAll("{{lastName}}", values.lastName || ""); // Pour la signature en bas

  // 3. Traitement conditionnel des lignes de références
  // On cherche le pattern complet pour supprimer la ligne si la donnée est absente
  const refPatterns = [
    { key: "{{contractNumber}}", label: "Numéro de contrat : ", value: values.contractNumber },
    { key: "{{invoiceNumber}}", label: "Numéro de facture : ", value: values.invoiceNumber },
    { key: "{{phone}}", label: "Téléphone : ", value: values.phone }
  ];

  refPatterns.forEach(ref => {
    const fullLine = `${ref.label}${ref.key}`;
    if (ref.value) {
      body = body.replaceAll(fullLine, `${ref.label}${ref.value}`);
    } else {
      // Supprime la ligne et le saut de ligne suivant si possible
      body = body.replaceAll(fullLine + "\n", "");
      body = body.replaceAll(fullLine, "");
    }
  });

  // Nettoyage final pour éviter les doubles sauts de lignes accidentels en haut du courrier
  return body.trim();
}
