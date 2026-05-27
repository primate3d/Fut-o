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

type EnergyBillingInfo = {
  documentKind: "schedule" | "invoice" | "estimate" | "unknown";
  recurrence: Expense["recurrence"];
  frequencyConfidence: "high" | "medium" | "low";
  amount?: number;
  monthlyAmount?: number;
  yearlyAmount?: number;
  confirmationPrompt?: string;
  hasElectricity?: boolean;
  hasGas?: boolean;
};

type EnergyServiceLineInfo = {
  label: string;
  subcategory: ExpenseSubcategory.GAS | ExpenseSubcategory.ELECTRICITY;
  monthlyAmount: number;
  yearlyAmount: number;
};

type InsuranceContractInfo = {
  label: string;
  documentType: UploadedDocumentType;
  subcategory?: ExpenseSubcategory;
  yearlyAmount: number;
  monthlyAmount: number;
  provider?: string;
  customerNumber?: string;
};

type InternetBoxInfo = {
  technology: "fiber" | "adsl" | "unknown";
  hasPromo: boolean;
  hasCommitment: boolean;
  hasTvIncluded: boolean;
  isBundledMobile: boolean;
};

type MobilePlanInfo = {
  dataGB?: number;
  includedDataGB?: number;
  consumedDataGB?: number;
};

type ManualBillingInfo = {
  amount: number;
  monthlyAmount: number;
  yearlyAmount: number;
  recurrence: Expense["recurrence"];
  frequency: NonNullable<UploadedDocument["userCorrections"]>["frequency"];
  isMultiContract?: boolean;
};

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

function normalizeAmount(amount: number) {
  return Math.round(amount * 100) / 100;
}

function normalizeManualAmount(amount?: number) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return normalizeAmount(amount);
}

function buildManualBillingInfo(
  corrections?: UploadedDocument["userCorrections"]
): ManualBillingInfo | undefined {
  const amount = normalizeManualAmount(corrections?.amount);
  if (!amount || !corrections?.frequency) {
    return undefined;
  }

  if (corrections.frequency === "yearly") {
    return {
      amount,
      monthlyAmount: normalizeAmount(amount / 12),
      yearlyAmount: amount,
      recurrence: "yearly",
      frequency: corrections.frequency,
      isMultiContract: corrections.isMultiContract
    };
  }

  if (corrections.frequency === "bimonthly") {
    return {
      amount,
      monthlyAmount: normalizeAmount(amount / 2),
      yearlyAmount: normalizeAmount(amount * 6),
      recurrence: "one_time",
      frequency: corrections.frequency,
      isMultiContract: corrections.isMultiContract
    };
  }

  if (corrections.frequency === "quarterly") {
    return {
      amount,
      monthlyAmount: normalizeAmount(amount / 3),
      yearlyAmount: normalizeAmount(amount * 4),
      recurrence: "one_time",
      frequency: corrections.frequency,
      isMultiContract: corrections.isMultiContract
    };
  }

  if (corrections.frequency === "one_time") {
    return {
      amount,
      monthlyAmount: 0,
      yearlyAmount: amount,
      recurrence: "one_time",
      frequency: corrections.frequency,
      isMultiContract: corrections.isMultiContract
    };
  }

  return {
    amount,
    monthlyAmount: amount,
    yearlyAmount: normalizeAmount(amount * 12),
    recurrence: "monthly",
    frequency: corrections.frequency,
    isMultiContract: corrections.isMultiContract
  };
}

function firstAmountNearLabel(text: string, labels: RegExp[]) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`${label.source}.{0,90}?([0-9][0-9\\s.,]*[,.][0-9]{2})`, "i")
    );
    const amount = parseAmount(match?.[1]);
    if (amount) return amount;
  }
  return undefined;
}

function extractAmounts(text?: string) {
  return [...(text ?? "").matchAll(/([0-9][0-9\s.,]*[,.][0-9]{2})/g)]
    .map((match) => parseAmount(match[1]))
    .filter((amount): amount is number => typeof amount === "number");
}

function mostRepeatedAmount(amounts: number[]) {
  const counts = amounts.reduce<Map<number, number>>((accumulator, amount) => {
    const roundedAmount = Math.round(amount * 100) / 100;
    accumulator.set(roundedAmount, (accumulator.get(roundedAmount) ?? 0) + 1);
    return accumulator;
  }, new Map());

  const repeatedAmounts = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  return repeatedAmounts[0]?.[0];
}

function extractEnergyServiceLines(
  text: string,
  documentType?: UploadedDocumentType,
  providerName?: string
): EnergyServiceLineInfo[] {
  if (!isEnergyDocument(documentType, providerName)) return [];

  const normalizedText = normalize(clean(text));
  const scheduleMatch = normalizedText.match(
    /\bgaz\b([\s\S]{0,260}?)\belectricite\b([\s\S]{0,260}?)\btotal\s+prelevement\b/i
  );

  if (!scheduleMatch) return [];

  const gasMonthlyAmount = mostRepeatedAmount(extractAmounts(scheduleMatch[1]));
  const electricityMonthlyAmount = mostRepeatedAmount(
    extractAmounts(scheduleMatch[2])
  );
  const lines: EnergyServiceLineInfo[] = [];

  if (gasMonthlyAmount) {
    lines.push({
      label: "Gaz",
      subcategory: ExpenseSubcategory.GAS,
      monthlyAmount: normalizeAmount(gasMonthlyAmount),
      yearlyAmount: normalizeAmount(gasMonthlyAmount * 12)
    });
  }

  if (electricityMonthlyAmount) {
    lines.push({
      label: "Electricite",
      subcategory: ExpenseSubcategory.ELECTRICITY,
      monthlyAmount: normalizeAmount(electricityMonthlyAmount),
      yearlyAmount: normalizeAmount(electricityMonthlyAmount * 12)
    });
  }

  return lines.length >= 2 ? lines : [];
}

function extractEnergyScheduleMonthlyAmount(normalizedText: string) {
  const prelevementAmounts = [...normalizedText.matchAll(/\bprelevement\b/gi)].flatMap((match) => {
    const startIndex = match.index ?? 0;
    const segment = normalizedText.slice(startIndex, startIndex + 620);
    const totalElectricityIndex = segment.search(/\btotal\s+electricite/i);
    if (totalElectricityIndex < 0) return [];

    return extractAmounts(segment.slice(0, totalElectricityIndex));
  });
  const dominantPrelevement = mostRepeatedAmount(prelevementAmounts);
  if (dominantPrelevement) return dominantPrelevement;

  const labelledMonthlyAmount = firstAmountNearLabel(normalizedText, [
    /total\s+prelevement/,
    /prelevement\s+mensuel/,
    /montant\s+mensuel/,
    /echeance\s+mensuelle/
  ]);

  return labelledMonthlyAmount;
}

function extractInvoiceAmount(text: string) {
  const compactText = clean(text) ?? "";
  const normalizedText = normalize(compactText);
  const normalizedAmount = firstAmountNearLabel(normalizedText, [
    /net\s+a\s+payer/,
    /montant\s+(?:total|ttc|a\s+payer|du|de\s+votre\s+facture|preleve)/,
    /total\s+(?:ttc|a\s+payer)?/,
    /facture\s+ttc/,
    /a\s+regler/,
    /reste\s+a\s+payer/
  ]);

  if (normalizedAmount) return normalizedAmount;

  const amount = parseAmount(
    firstMatch(compactText, [
      /(?:montant\s+(?:total|ttc|factur[ée]|de\s+la\s+facture|d[ûu]|à\s+payer|a\s+payer)|total\s+(?:ttc|à\s+payer|a\s+payer)?|net\s+(?:à|a)\s+payer|montant\s+net\s+(?:à|a)\s+payer|facture\s+ttc|à\s+régler|a\s+regler|reste\s+(?:à|a)\s+payer)[^\d€]{0,50}([0-9][0-9\s.,]*[,.][0-9]{2})\s*(?:€|eur|euros|â‚¬)?/i,
      /([0-9][0-9\s.,]*[,.][0-9]{2})\s*(?:€|eur|euros|â‚¬)\s*(?:ttc|à\s+payer|a\s+payer|net\s+(?:à|a)\s+payer|total|montant\s+d[ûu])/i,
      /(?:total|montant|facture)[^\d€]{0,30}([0-9][0-9\s.,]*[,.][0-9]{2})/i,
      /montant\s+de\s+votre\s+facture\s+[0-9][0-9\s.,]*\s+([0-9][0-9\s.,]*[,.][0-9]{2})/i
    ])
  );

  return amount;
}

function extractEnergyBillingInfo(
  text: string,
  documentType?: UploadedDocumentType,
  providerName?: string
): EnergyBillingInfo | undefined {
  if (!isEnergyDocument(documentType, providerName)) return undefined;

  const compactText = clean(text) ?? "";
  const normalizedText = normalize(compactText);
  const invoiceAmount = extractInvoiceAmount(text);
  const monthlyDebit = extractEnergyScheduleMonthlyAmount(normalizedText);
  const annualEstimate = firstAmountNearLabel(normalizedText, [
    /estimation\s+annuelle/,
    /budget\s+annuel/,
    /montant\s+annuel/,
    /total\s+annuel/
  ]);
  const isSchedule = /\b(echeancier|mensualisation|mensualite|mensualites|prelevement\s+mensuel)\b/.test(
    normalizedText
  );
  const isBimonthly = /\b(bimestriel|tous\s+les\s+deux\s+mois|tous\s+les\s+2\s+mois|deux\s+mois)\b/.test(
    normalizedText
  );
  const isEstimate = /\b(estimation\s+annuelle|budget\s+annuel|montant\s+annuel)\b/.test(
    normalizedText
  );
  const isInvoice = /\b(facture|a\s+payer|net\s+a\s+payer|montant\s+du)\b/.test(
    normalizedText
  );
  const hasElectricity = /\b(electricite|enedis|linky|kwh)\b/.test(normalizedText);
  const hasGas = /\b(gaz|grdf|kwh\s+pcs)\b/.test(normalizedText);

  if (isSchedule && monthlyDebit) {
    return {
      documentKind: "schedule",
      recurrence: "monthly",
      frequencyConfidence: "high",
      amount: monthlyDebit,
      monthlyAmount: monthlyDebit,
      yearlyAmount: monthlyDebit * 12,
      hasElectricity,
      hasGas
    };
  }

  if (isEstimate && annualEstimate) {
    return {
      documentKind: "estimate",
      recurrence: "yearly",
      frequencyConfidence: "medium",
      amount: annualEstimate,
      monthlyAmount: annualEstimate / 12,
      yearlyAmount: annualEstimate,
      hasElectricity,
      hasGas
    };
  }

  if (isBimonthly && invoiceAmount) {
    return {
      documentKind: "invoice",
      recurrence: "one_time",
      frequencyConfidence: "medium",
      amount: invoiceAmount,
      monthlyAmount: invoiceAmount / 2,
      yearlyAmount: invoiceAmount * 6,
      confirmationPrompt: "Ce montant correspond-il bien a une facture bimestrielle ?",
      hasElectricity,
      hasGas
    };
  }

  if (isInvoice && invoiceAmount) {
    return {
      documentKind: "invoice",
      recurrence: "one_time",
      frequencyConfidence: "low",
      amount: invoiceAmount,
      monthlyAmount: 0,
      yearlyAmount: invoiceAmount,
      confirmationPrompt: "Ce montant correspond-il a une facture mensuelle, bimestrielle ou ponctuelle ?",
      hasElectricity,
      hasGas
    };
  }

  return {
    documentKind: "unknown",
    recurrence: "monthly",
    frequencyConfidence: "low",
    amount: invoiceAmount,
    hasElectricity,
    hasGas
  };
}

function isInternetDocument(documentType?: UploadedDocumentType) {
  return documentType === "internet_invoice";
}

function extractInternetBoxInfo(
  text: string,
  documentType?: UploadedDocumentType
): InternetBoxInfo | undefined {
  if (!isInternetDocument(documentType)) return undefined;

  const normalizedText = normalize(clean(text));
  const technology: InternetBoxInfo["technology"] =
    /\b(fibre|fiber|ftth)\b/.test(normalizedText)
      ? "fiber"
      : /\b(adsl|xdsl|vdsl)\b/.test(normalizedText)
        ? "adsl"
        : "unknown";
  const hasPromo =
    /\b(promo|promotion|remise|offert|offerte|prix\s+special|avantage)\b/.test(normalizedText) ||
    /\bpendant\s+(?:6|12)\s+mois\b/.test(normalizedText);
  const explicitlyWithoutCommitment =
    /\b(?:offre\s+)?sans\s+engagement\b/.test(normalizedText);
  const hasCommitment =
    !explicitlyWithoutCommitment &&
    /\b(engagement|fin\s+d\s+engagement|date\s+de\s+fin|jusqu\s+au|jusqu'a)\b/.test(normalizedText);
  const hasTvIncluded =
    /\b(tv|television|decodeur|bouquet|canal\+?|netflix|bein)\b/.test(normalizedText);
  const hasBoxSignal = /\b(box|internet|fibre|fiber|adsl|wifi|livebox|freebox|bbox)\b/.test(normalizedText);
  const hasMobileSignal = /\b(mobile|ligne\s+mobile|forfait\s+mobile|sim|5g|4g|go\b)\b/.test(normalizedText);

  return {
    technology,
    hasPromo,
    hasCommitment,
    hasTvIncluded,
    isBundledMobile: hasBoxSignal && hasMobileSignal
  };
}

function extractMobilePlanInfo(
  text: string,
  documentType?: UploadedDocumentType
): MobilePlanInfo | undefined {
  if (documentType !== "mobile_invoice") return undefined;

  const normalizedText = normalize(clean(text));
  const nrjUsageMatch = normalizedText.match(
    /\bweb\s*:\s*(\d+(?:[.,]\d+)?)\s*go\s+debit\s+ajuste\s+au[-\s]+dela\s+(\d+(?:[.,]\d+)?)\s*go\s+inclus\b/i
  );
  if (nrjUsageMatch) {
    const includedDataGB = Number(nrjUsageMatch[1].replace(",", "."));
    const consumedDataGB = Number(nrjUsageMatch[2].replace(",", "."));
    if (
      Number.isFinite(includedDataGB) &&
      includedDataGB >= 0 &&
      Number.isFinite(consumedDataGB) &&
      consumedDataGB >= 0
    ) {
      return {
        dataGB: Math.round(includedDataGB),
        includedDataGB: Math.round(includedDataGB),
        consumedDataGB: Math.round(consumedDataGB * 100) / 100
      };
    }
  }

  const consumedDataPattern =
    /\b\d+(?:[.,]\d+)?\s*go\s*(?:utilises?|utilisees?|consommes?|consommees?|restants?)\b/i;
  const candidatePatterns = [
    /(?:forfait|enveloppe|data|internet\s+mobile)[^.\n]{0,40}?(\d+(?:[.,]\d+)?)\s*go\b/i,
    /(\d+(?:[.,]\d+)?)\s*go\s*(?:inclus|incluse|incluses|compris|comprise)\b/i,
    /(?:jusqu['’]?\s+a|volume\s+inclus)\s*(\d+(?:[.,]\d+)?)\s*go\b/i
  ];

  for (const pattern of candidatePatterns) {
    const match = normalizedText.match(pattern);
    if (!match) continue;

    const matchStart = match.index ?? 0;
    const matchContext = normalizedText.slice(matchStart, matchStart + match[0].length + 30);
    if (consumedDataPattern.test(matchContext)) continue;

    const dataGB = Number(match[1].replace(",", "."));
    if (Number.isFinite(dataGB) && dataGB >= 0) {
      return { dataGB: Math.round(dataGB) };
    }
  }

  return undefined;
}

function lastAmountBeforeMarker(text: string, marker: string) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const beforeMarker = text.slice(Math.max(0, markerIndex - 260), markerIndex);
  const amounts = extractAmounts(beforeMarker)
    .filter((amount) => amount > 0 && amount < 10000);

  return amounts.at(-1);
}

function extractInsuranceCustomerNumber(text: string) {
  const normalizedText = normalize(text);
  const normalizedMatch = normalizedText.match(/n\W{0,4}de\s+societaire\s*:?\s*([0-9]{4,})/i);
  if (normalizedMatch?.[1]) return normalizedMatch[1];

  return firstMatch(text, [
    /n[Â°o]\s+de\s+soci[Ã©e]taire\s*:?\s*([A-Z0-9 -]{4,})/i,
    /soci[Ã©e]taire\s*:?\s*([A-Z0-9 -]{4,})/i
  ]);
}

function extractMacifInsuranceContracts(text: string): InsuranceContractInfo[] {
  const normalizedText = normalize(clean(text));
  if (!/\bmacif\b/.test(normalizedText)) return [];

  const customerNumber = extractInsuranceCustomerNumber(text);
  const contracts: InsuranceContractInfo[] = [];
  const twoWheelsAmount = lastAmountBeforeMarker(normalizedText, "votre deux roues");
  const homeAmount =
    lastAmountBeforeMarker(normalizedText, "votre bien immobilier") ??
    lastAmountBeforeMarker(normalizedText, "votre habitation");
  const prevoyanceAmount = lastAmountBeforeMarker(normalizedText, "votre prevoyance");

  if (twoWheelsAmount) {
    contracts.push({
      label: "Assurance deux roues",
      documentType: "two_wheeler_insurance",
      subcategory: ExpenseSubcategory.TWO_WHEELER_INSURANCE,
      yearlyAmount: twoWheelsAmount,
      monthlyAmount: normalizeAmount(twoWheelsAmount / 12),
      provider: "MACIF",
      customerNumber
    });
  }

  if (homeAmount) {
    contracts.push({
      label: "Assurance habitation",
      documentType: "home_insurance",
      subcategory: ExpenseSubcategory.HOME_INSURANCE,
      yearlyAmount: homeAmount,
      monthlyAmount: normalizeAmount(homeAmount / 12),
      provider: "MACIF",
      customerNumber
    });
  }

  if (prevoyanceAmount) {
    contracts.push({
      label: "Prevoyance familiale",
      documentType: "health_insurance",
      subcategory: ExpenseSubcategory.MUTUAL_HEALTH,
      yearlyAmount: prevoyanceAmount,
      monthlyAmount: normalizeAmount(prevoyanceAmount / 12),
      provider: "MACIF",
      customerNumber
    });
  }

  if (contracts.length === 0) {
    const hasExpectedSections =
      normalizedText.includes("votre deux roues") &&
      normalizedText.includes("votre bien immobilier") &&
      normalizedText.includes("votre prevoyance");
    const cotisationAmounts = [
      ...normalizedText.matchAll(/cotisation\s+ttc\s+([0-9][0-9\s.,]*[,.][0-9]{2})\s*(?:€|eur|euros)?/gi)
    ]
      .map((match) => parseAmount(match[1]))
      .filter((amount): amount is number =>
        typeof amount === "number" &&
        amount > 50 &&
        amount < 500
      );

    if (hasExpectedSections && cotisationAmounts.length === 3) {
      const [twoWheelsYearlyAmount, homeYearlyAmount, prevoyanceYearlyAmount] = cotisationAmounts;

      contracts.push(
        {
          label: "Assurance deux roues",
          documentType: "two_wheeler_insurance",
          subcategory: ExpenseSubcategory.TWO_WHEELER_INSURANCE,
          yearlyAmount: twoWheelsYearlyAmount,
          monthlyAmount: normalizeAmount(twoWheelsYearlyAmount / 12),
          provider: "MACIF",
          customerNumber
        },
        {
          label: "Assurance habitation",
          documentType: "home_insurance",
          subcategory: ExpenseSubcategory.HOME_INSURANCE,
          yearlyAmount: homeYearlyAmount,
          monthlyAmount: normalizeAmount(homeYearlyAmount / 12),
          provider: "MACIF",
          customerNumber
        },
        {
          label: "Prevoyance familiale",
          documentType: "health_insurance",
          subcategory: ExpenseSubcategory.MUTUAL_HEALTH,
          yearlyAmount: prevoyanceYearlyAmount,
          monthlyAmount: normalizeAmount(prevoyanceYearlyAmount / 12),
          provider: "MACIF",
          customerNumber
        }
      );
    }
  }

  return contracts;
}

const commercialProviderNames = ["NRJ Mobile", "Sosh", "RED by SFR", "B&You"];

function pickCommercialProvider(...providers: Array<string | undefined>) {
  const candidates = providers.filter(Boolean) as string[];
  return (
    commercialProviderNames.find((provider) => candidates.includes(provider)) ??
    candidates[0]
  );
}

function extractInlinePostalAddress(text: string) {
  const compactText = clean(text);
  const match = compactText?.match(
    /(?:m\.|mme|madame|monsieur)\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,}\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,}\s+(.+?\b\d{5}\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,})(?=\s+(?:Facture|TVA|Utilisateur|Montant|N[\u00B0o]|$))/i
  );

  return clean(match?.[1]);
}

function extractProviderAddress(text: string) {
  const bouyguesSupportAddress = text.match(
    /13\s*[-–]\s*15[,\s]+avenue\s+du\s+Mar(?:é|e|Ã©)chal\s+Juin[\s,.-]+92360\s+Meudon(?:[\s-]+la[\s-]+For(?:ê|e|Ãª)t)?/i
  );

  if (bouyguesSupportAddress) {
    return "13-15, avenue du Maréchal Juin\n92360 Meudon-la-Forêt";
  }

  // We prefer the highly accurate predefined service client addresses (e.g. CEDEX addresses)
  // rather than the legal/corporate headquarters footers from invoices.
  return undefined;
}

function detectProvider(document: ExtractedDocument) {
  const fileNameNorm = clean(normalize(document.fileName)) ?? "";
  const textNorm = clean(normalize(document.extractedText)) ?? "";
  const rawText = document.extractedText || "";

  const providers = [
    // Insurance
    { name: "MACIF", aliases: ["macif"] },

    // MVNOs / Brands (Highest priority)
    { name: "NRJ Mobile", aliases: ["nrj mobile", "nrjmobile", "nrj"] },
    { name: "Sosh", aliases: ["sosh"] },
    { name: "RED by SFR", aliases: ["red by sfr", "red by", "redbysfr"] },
    { name: "B&You", aliases: ["b&you", "b and you", "b & you"] },
    { name: "La Poste Mobile", aliases: ["la poste mobile", "lapostemobile"] },
    { name: "Prixtel", aliases: ["prixtel"] },
    { name: "Syma Mobile", aliases: ["syma mobile", "syma"] },
    { name: "Lebara", aliases: ["lebara"] },

    // Main Operators / Providers
    { name: "Free", aliases: ["free mobile", "free telecom", "free"] },
    { name: "SFR", aliases: ["sfr"] },
    { name: "Orange", aliases: ["orange"] },
    { name: "Bouygues Telecom", aliases: ["bouygues telecom", "bouygues"] },

    // Energy
    { name: "EDF", aliases: ["edf", "electricite de france"] },
    { name: "Engie", aliases: ["engie", "gdf suez"] },
    { name: "TotalEnergies", aliases: ["totalenergies", "total energies", "direct energie"] },
    { name: "Eni", aliases: ["eni"] }
  ];

  let bestProvider: string | undefined = undefined;
  let maxScore = 0;

  for (const { name, aliases } of providers) {
    for (const alias of aliases) {
      const aliasNorm = clean(normalize(alias)) ?? "";
      let score = 0;

      if (fileNameNorm.includes(aliasNorm)) {
        score += 50;
      }

      if (textNorm.includes(aliasNorm)) {
        score += 10;

        const index = textNorm.indexOf(aliasNorm);
        if (index >= 0 && index < 500) {
          score += 20;
        }

        const domainAlias = aliasNorm.replace(/\s+/g, "");
        if (domainAlias.length > 2) {
          const domainRegex = new RegExp(`@(?:[a-z0-9-]+\\.)*${domainAlias}\\.[a-z]{2,}`, "i");
          if (domainRegex.test(rawText)) {
            score += 15;
          }
        }

        const mvnoBrands = [
          "NRJ Mobile", "Sosh", "RED by SFR", "B&You",
          "La Poste Mobile", "Prixtel", "Syma Mobile", "Lebara"
        ];
        if (mvnoBrands.includes(name)) {
          score += 100;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestProvider = name;
      }
    }
  }

  return bestProvider ?? document.provider;
}

function getSubscriptionType(documentType: UploadedDocumentType) {
  const labels: Record<UploadedDocumentType, string> = {
    bank_statement: "Document bancaire",
    electricity_invoice: "Contrat electricite",
    gas_invoice: "Contrat gaz",
    internet_invoice: "Box internet",
    mobile_invoice: "Forfait mobile",
    two_wheeler_insurance: "Assurance deux roues",
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

const postalAddressPattern =
  /\b\d{1,5}[,\s]+(?:all[ée]e|allee|rue|avenue|av\.?|boulevard|bd|chemin|impasse|route|place|quai|square|résidence|residence|cours|passage)\b.{0,140}?\b\d{5}\s+[A-Z\u00C0-\u0178][A-Za-z\u00C0-\u017F' -]{2,}/i;

const consumptionAddressMarkers = [
  "lieu de consommation",
  "adresse de consommation",
  "adresse du site",
  "site de consommation",
  "point de livraison",
  "pdl",
  "prm"
];

function isEnergyDocument(documentType?: UploadedDocumentType, providerName?: string) {
  return (
    documentType === "electricity_invoice" ||
    documentType === "gas_invoice" ||
    ["EDF", "Engie", "TotalEnergies", "Eni"].includes(providerName ?? "")
  );
}

function isLikelyProviderAddress(address?: string) {
  const normalized = normalize(address);
  return /(?:service client|tsa|cedex|rcs|capital|tva|samuel de champlain|marechal juin|meudon|courbevoie|noailles|arras|rouen)/i.test(
    normalized
  );
}

function extractAddressFromSegment(segment?: string) {
  const match = segment?.match(postalAddressPattern);
  const address = clean(match?.[0]);

  if (!address || isLikelyProviderAddress(address)) {
    return undefined;
  }

  return address.replace(/\s+(\d{5}\s+[A-Z\u00C0-\u0178])/i, "\n$1");
}

function extractEnergyConsumptionAddress(text: string) {
  const compactText = clean(text) ?? "";

  for (const marker of consumptionAddressMarkers) {
    const markerIndex = normalize(compactText).indexOf(marker);
    if (markerIndex < 0) continue;

    const segment = compactText.slice(markerIndex, markerIndex + 360);
    const address = extractAddressFromSegment(segment);
    if (address) return address;
  }

  const customerReferenceMatch = compactText.match(
    /(?:r[ée]f[ée]rence\s+client|reference\s+client|compte\s+de\s+contrat).{0,260}/i
  );

  return extractAddressFromSegment(customerReferenceMatch?.[0]);
}

function extractNameNearAddress(text: string, address?: string) {
  if (!address) return undefined;

  const compactText = clean(text) ?? "";
  const firstAddressLine = address.split("\n")[0]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!firstAddressLine) return undefined;

  const addressMatch = compactText.match(new RegExp(firstAddressLine, "i"));
  if (!addressMatch || addressMatch.index == null) return undefined;

  const beforeAddress = compactText
    .slice(Math.max(0, addressMatch.index - 140), addressMatch.index)
    .replace(
      /(?:lieu de consommation|adresse de consommation|adresse du site|site de consommation|point de livraison|pdl|prm|r[ée]f[ée]rence client|reference client|num[ée]ro compte de contrat|compte de contrat)\s*:?\s*/gi,
      " "
    )
    .replace(/\b[A-Z0-9]{2,}\d[A-Z0-9]*\b/g, " ")
    .replace(/\b\d+[A-Z]?\b/g, " ");

  const tokens = beforeAddress.match(/\b[A-Z\u00C0-\u0178][A-Z\u00C0-\u0178' -]{2,}\b/g) ?? [];
  const filteredTokens = tokens
    .map((token) => clean(token))
    .filter((token): token is string =>
      Boolean(token && !/^(DUPLICATA|CLIENT|CONTRAT|LIEU|CONSOMMATION|ADRESSE|SITE|POINT|LIVRAISON)$/i.test(token))
    );

  if (filteredTokens.length < 2 || filteredTokens.length > 4) {
    return undefined;
  }

  return filteredTokens.join(" ");
}

function extractPostalAddress(
  text: string,
  documentType?: UploadedDocumentType,
  providerName?: string
) {
  if (isEnergyDocument(documentType, providerName)) {
    const energyAddress = extractEnergyConsumptionAddress(text);
    if (energyAddress) return energyAddress;
  }

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

  const address = lines.slice(start, postalIndex + 1).join("\n");
  return isLikelyProviderAddress(address) ? undefined : address;
}

export function extractDocumentPartyProfile(document: ExtractedDocument): DocumentPartyProfile {
  const text = document.extractedText ?? "";
  const compactText = clean(text) ?? "";
  const manualCorrections = document.userCorrections;
  const manualProvider = clean(manualCorrections?.provider);
  const manualBilling = buildManualBillingInfo(manualCorrections);
  const providerName = manualProvider || detectProvider(document);
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
  const inferredDocumentType =
    manualCorrections?.documentType ?? inferDocumentTypeFromContent(document, providerName);
  const profileInvoiceAmount = extractInvoiceAmount(text) ?? invoiceAmount;
  const energyBilling = extractEnergyBillingInfo(text, inferredDocumentType, providerName);
  const energyServiceLines = extractEnergyServiceLines(text, inferredDocumentType, providerName);
  const effectiveManualBilling = manualBilling ?? (
    manualCorrections?.frequency && !manualCorrections?.amount
      ? buildManualBillingInfo({
          ...manualCorrections,
          amount: energyBilling?.amount ?? profileInvoiceAmount
        })
      : undefined
  );
  const hasManualContractSelection = Boolean(
    manualCorrections &&
      (manualProvider ||
        manualCorrections.documentType ||
        normalizeManualAmount(manualCorrections.amount) ||
        manualCorrections.frequency)
  );
  const useSingleManualContract = Boolean(
    manualCorrections?.isMultiContract &&
      effectiveManualBilling
  );
  const internetBox = extractInternetBoxInfo(text, inferredDocumentType);
  const mobilePlan = extractMobilePlanInfo(text, inferredDocumentType);
  const insuranceContracts = extractMacifInsuranceContracts(text);
  const insuranceCustomerNumber = extractInsuranceCustomerNumber(text);
  const postalAddress = extractPostalAddress(text, inferredDocumentType, providerName);
  const energyCustomerName =
    isEnergyDocument(inferredDocumentType, providerName)
      ? extractNameNearAddress(text, postalAddress)
      : undefined;
  const finalCustomer =
    Object.values(customer).some(Boolean) || !energyCustomerName
      ? customer
      : splitFullName(energyCustomerName);

  finalCustomer.address = postalAddress;
  finalCustomer.phone = reversePhone ?? phone;
  finalCustomer.customerNumber = insuranceCustomerNumber ?? reverseCustomerNumber ?? customerNumber;
  finalCustomer.contractNumber = reverseContractNumber ?? contractNumber;
  finalCustomer.invoiceNumber = reverseInvoiceNumber ?? invoiceNumber;

  const provider: ProviderProfile | undefined = providerName
    ? {
        name: providerName,
        address: providerAddress,
        phone: firstMatch(text, [
          /(?:service client|assistance|contact)\s*:?\s*((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})/i
        ])
      }
    : undefined;

  const profile: DocumentPartyProfile & {
    energyBilling?: EnergyBillingInfo;
    energyServiceLines?: EnergyServiceLineInfo[];
    internetBox?: InternetBoxInfo;
    mobilePlan?: MobilePlanInfo;
    insuranceContracts?: InsuranceContractInfo[];
    manualBilling?: ManualBillingInfo;
    hasManualContractSelection?: boolean;
  } = {
    documentId: document.id,
    fileName: document.fileName,
    documentType: inferredDocumentType,
    providerName,
    subscriptionType: getSubscriptionType(inferredDocumentType),
    invoiceAmount: effectiveManualBilling
      ? effectiveManualBilling.amount
      : insuranceContracts.length > 0
        ? insuranceContracts.reduce((total, contract) => total + contract.yearlyAmount, 0)
        : manualCorrections?.isMultiContract
          ? undefined
          : energyBilling?.amount ?? reverseInvoiceAmount ?? profileInvoiceAmount,
    customer: Object.values(finalCustomer).some(Boolean) ? finalCustomer : undefined,
    provider,
    energyBilling,
    energyServiceLines: energyServiceLines.length > 0 ? energyServiceLines : undefined,
    internetBox,
    mobilePlan,
    manualBilling: effectiveManualBilling,
    insuranceContracts:
      !useSingleManualContract && insuranceContracts.length > 0
        ? insuranceContracts
        : undefined,
    hasManualContractSelection
  };

  return profile;
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

function inferDocumentTypeFromContent(
  document: ExtractedDocument,
  providerName?: string
): UploadedDocumentType {
  if (document.documentType !== "other") {
    return document.documentType;
  }

  const text = normalize(
    `${document.fileName} ${document.provider ?? ""} ${providerName ?? ""} ${document.extractedText}`
  );

  if (/\b(macif|avis\s+d\s*echeance|soci[eé]taire|deux\s+roues|bien\s+immobilier|prevoyance|pr[eé]voyance|cotisation\s+ttc)\b/.test(text)) {
    if (/\b(bien\s+immobilier|habitation|residence\s+principale|logement)\b/.test(text)) {
      return "home_insurance";
    }
    if (/\b(deux\s+roues|vehicule|immatriculation|moto|kawasaki)\b/.test(text)) {
      return "two_wheeler_insurance";
    }
    return "home_insurance";
  }

  if (
    /\b(edf|electricite|electricit[eé]|enedis|linky|kwh|compteur)\b/.test(text)
  ) {
    return "electricity_invoice";
  }

  if (/\b(engie|gaz|grdf|kwh pcs|consommation gaz)\b/.test(text)) {
    return "gas_invoice";
  }

  if (/\b(box|internet|fibre|adsl|wifi|livebox|freebox|bbox)\b/.test(text)) {
    return "internet_invoice";
  }

  if (/\b(mobile|forfait|ligne mobile|telephone|data|go\b|5g|4g|sim)\b/.test(text)) {
    return "mobile_invoice";
  }

  if (/\b(deux roues|moto)\b/.test(text)) {
    return "two_wheeler_insurance";
  }

  if (/\b(assurance auto|vehicule|immatriculation|bonus malus)\b/.test(text)) {
    return "car_insurance";
  }

  if (/\b(assurance habitation|multirisque habitation|logement|bien immobilier)\b/.test(text)) {
    return "home_insurance";
  }

  if (/\b(mutuelle|complementaire sante|assurance sante|prevoyance|pr[eé]voyance)\b/.test(text)) {
    return "health_insurance";
  }

  if (/\b(releve de compte|frais bancaires|carte bancaire|iban|banque)\b/.test(text)) {
    return "bank_statement";
  }

  if (/\b(abonnement|mensualite|prelevement mensuel)\b/.test(text)) {
    return "subscription";
  }

  return document.documentType;
}

function hasValue<T>(value: T | undefined | null): value is T {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function mergeWithoutEmptyOverwrite<T extends Record<string, unknown>>(
  ...sources: Array<T | undefined>
): T {
  return sources.reduce<T>((merged, source) => {
    if (!source) return merged;

    for (const [key, value] of Object.entries(source)) {
      if (!hasValue(value)) continue;
      if (hasValue(merged[key])) continue;
      merged[key as keyof T] = value as T[keyof T];
    }

    return merged;
  }, {} as T);
}

function normalizeDetectedDocuments(
  documents?: DetectedParties["documents"]
): NonNullable<DetectedParties["documents"]> {
  if (!documents || Array.isArray(documents)) {
    return {};
  }

  return documents;
}

export function ensureDetectedDocumentsFromExpenses(
  detectedParties: DetectedParties | undefined,
  expenses: Expense[],
  documentProfiles: Record<string, DocumentPartyProfile>
): DetectedParties {
  const documents = { ...normalizeDetectedDocuments(detectedParties?.documents) };
  const providers = { ...(detectedParties?.providers ?? {}) };

  for (const expense of expenses) {
    const sourceDocumentId = expense.sourceDocumentId;
    if (!sourceDocumentId) continue;

    const existingDocument = documents[sourceDocumentId];
    const profile = documentProfiles[sourceDocumentId];
    const providerName =
      existingDocument?.providerName ||
      expense.provider ||
      profile?.providerName ||
      profile?.provider?.name;
    const detectedProvider = providerName ? providers[providerName] : undefined;
    const expenseCustomer: CustomerProfile = {
      customerNumber: expense.customerNumber,
      contractNumber: expense.contractNumber,
      invoiceNumber: expense.invoiceNumber,
      phone: expense.phone
    };
    const customer = mergeWithoutEmptyOverwrite<CustomerProfile>(
      existingDocument?.customer,
      detectedParties?.customer,
      expenseCustomer,
      profile?.customer
    );
    const provider = mergeWithoutEmptyOverwrite<ProviderProfile>(
      existingDocument?.provider,
      detectedProvider,
      profile?.provider,
      providerName ? { name: providerName } : undefined
    );

    documents[sourceDocumentId] = {
      documentId: existingDocument?.documentId || profile?.documentId || sourceDocumentId,
      fileName: existingDocument?.fileName || expense.sourceDocumentName || profile?.fileName,
      documentType: existingDocument?.documentType || expense.documentType || profile?.documentType,
      providerName,
      subscriptionType: existingDocument?.subscriptionType || profile?.subscriptionType,
      invoiceAmount: existingDocument?.invoiceAmount || profile?.invoiceAmount,
      customer: Object.values(customer).some(Boolean) ? customer : undefined,
      provider: Object.values(provider).some(Boolean) ? provider : undefined
    };

    if (providerName && provider.name) {
      providers[providerName] = mergeWithoutEmptyOverwrite<ProviderProfile>(
        providers[providerName],
        provider
      );
    }
  }

  return {
    ...detectedParties,
    customer: detectedParties?.customer,
    providers,
    documents
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
  if (
    documentType === "car_insurance" ||
    documentType === "two_wheeler_insurance" ||
    documentType === "home_insurance"
  ) {
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
  if (documentType === "two_wheeler_insurance") {
    return ExpenseSubcategory.TWO_WHEELER_INSURANCE;
  }
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

export function getEnergyBillingInfoFromProfile(
  profile?: DocumentPartyProfile
) {
  return (profile as (DocumentPartyProfile & { energyBilling?: EnergyBillingInfo }) | undefined)
    ?.energyBilling;
}

export function getEnergyServiceLinesFromProfile(
  profile?: DocumentPartyProfile
) {
  return (
    profile as (DocumentPartyProfile & { energyServiceLines?: EnergyServiceLineInfo[] }) | undefined
  )?.energyServiceLines ?? [];
}

export function getInsuranceContractsFromProfile(
  profile?: DocumentPartyProfile
) {
  return (
    profile as (DocumentPartyProfile & { insuranceContracts?: InsuranceContractInfo[] }) | undefined
  )?.insuranceContracts ?? [];
}

export function getInternetBoxInfoFromProfile(
  profile?: DocumentPartyProfile
) {
  return (
    profile as (DocumentPartyProfile & { internetBox?: InternetBoxInfo }) | undefined
  )?.internetBox;
}

function getMobilePlanInfoFromProfile(profile?: DocumentPartyProfile) {
  return (
    profile as (DocumentPartyProfile & { mobilePlan?: MobilePlanInfo }) | undefined
  )?.mobilePlan;
}

function getManualBillingInfoFromProfile(
  profile?: DocumentPartyProfile
) {
  return (
    profile as (DocumentPartyProfile & { manualBilling?: ManualBillingInfo }) | undefined
  )?.manualBilling;
}

function hasManualContractSelectionInProfile(profile?: DocumentPartyProfile) {
  return Boolean(
    (
      profile as
        | (DocumentPartyProfile & { hasManualContractSelection?: boolean })
        | undefined
    )?.hasManualContractSelection
  );
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

  const finalProvider = pickCommercialProvider(
    profile.providerName,
    profile.provider?.name,
    expense.provider && !isGenericProvider(expense.provider) ? expense.provider : undefined,
    expense.provider
  );
  const manualBilling = getManualBillingInfoFromProfile(profile);
  const hasManualContractSelection = hasManualContractSelectionInProfile(profile);
  const inferenceDocumentType =
    hasManualContractSelection && profile.documentType
      ? profile.documentType
      : expense.category === ExpenseCategory.INSURANCE && expense.documentType
      ? expense.documentType
      : profile.documentType;
  const inferredCategory = inferExpenseCategoryFromDocumentType(inferenceDocumentType);
  const inferredSubcategory = inferExpenseSubcategoryFromDocumentType(inferenceDocumentType);
  const energyBilling = getEnergyBillingInfoFromProfile(profile);
  const internetBox = getInternetBoxInfoFromProfile(profile);
  const mobilePlan = getMobilePlanInfoFromProfile(profile);
  const shouldApplyManualBilling = Boolean(manualBilling);
  const isSeparatedEnergyExpense =
    expense.category === ExpenseCategory.ENERGY &&
    (expense.subcategory === ExpenseSubcategory.GAS ||
      expense.subcategory === ExpenseSubcategory.ELECTRICITY) &&
    typeof expense.monthlyAmount === "number" &&
    Number.isFinite(expense.monthlyAmount) &&
    expense.monthlyAmount > 0;
  const finalSubcategory =
    inferredCategory === ExpenseCategory.ENERGY &&
    energyBilling?.hasElectricity &&
    energyBilling.hasGas
      ? undefined
      : inferenceDocumentType === "internet_invoice"
        ? ExpenseSubcategory.INTERNET
      : inferredSubcategory;
  const monthlyAmount =
    shouldApplyManualBilling && manualBilling?.monthlyAmount != null
      ? manualBilling.monthlyAmount
      : isSeparatedEnergyExpense
      ? expense.monthlyAmount
      : inferredCategory === ExpenseCategory.ENERGY && energyBilling?.monthlyAmount != null
      ? energyBilling.monthlyAmount
      : expense.category === ExpenseCategory.INSURANCE
        ? expense.monthlyAmount
      : profile.invoiceAmount ?? expense.monthlyAmount;
  const safeMonthlyAmount =
    typeof monthlyAmount === "number" && Number.isFinite(monthlyAmount)
      ? monthlyAmount
      : 0;
  const safeYearlyAmount =
    shouldApplyManualBilling &&
    typeof manualBilling?.yearlyAmount === "number" &&
    Number.isFinite(manualBilling.yearlyAmount)
      ? manualBilling.yearlyAmount
      : isSeparatedEnergyExpense &&
    typeof expense.yearlyAmount === "number" &&
    Number.isFinite(expense.yearlyAmount)
      ? expense.yearlyAmount
      : inferredCategory === ExpenseCategory.ENERGY &&
    typeof energyBilling?.yearlyAmount === "number" &&
    Number.isFinite(energyBilling.yearlyAmount)
      ? energyBilling.yearlyAmount
      : expense.category === ExpenseCategory.INSURANCE &&
          typeof expense.yearlyAmount === "number" &&
          Number.isFinite(expense.yearlyAmount)
        ? expense.yearlyAmount
      : safeMonthlyAmount * 12;

  return {
    ...expense,
    ...(internetBox
      ? {
          internetAccessTechnology: internetBox.technology,
          internetPromoDetected: internetBox.hasPromo,
          internetCommitmentDetected: internetBox.hasCommitment,
          internetTvIncluded: internetBox.hasTvIncluded,
          internetBundledMobile: internetBox.isBundledMobile
        }
      : {}),
    ...(mobilePlan?.dataGB != null ? { mobileDataGB: mobilePlan.dataGB } : {}),
    ...(mobilePlan?.includedDataGB != null
      ? { mobileIncludedDataGB: mobilePlan.includedDataGB }
      : {}),
    ...(mobilePlan?.consumedDataGB != null
      ? { mobileConsumedDataGB: mobilePlan.consumedDataGB }
      : {}),
    provider: finalProvider,
    label:
      hasManualContractSelection && profile.subscriptionType
        ? profile.subscriptionType
        : expense.label,
    documentType:
      hasManualContractSelection && profile.documentType
        ? profile.documentType
        : expense.documentType ?? profile.documentType,
    sourceDocumentId: profile.documentId,
    sourceDocumentName: profile.fileName,
    customerNumber: expense.customerNumber ?? profile.customer?.customerNumber,
    contractNumber: expense.contractNumber ?? profile.customer?.contractNumber,
    invoiceNumber: expense.invoiceNumber ?? profile.customer?.invoiceNumber,
    phone: expense.phone ?? profile.customer?.phone,
    billingAmount: manualBilling?.amount ?? expense.billingAmount,
    billingFrequency: manualBilling?.frequency ?? expense.billingFrequency,
    monthlyAmount: safeMonthlyAmount,
    yearlyAmount: safeYearlyAmount,
    recurrence:
      shouldApplyManualBilling && manualBilling
        ? manualBilling.recurrence
        : isSeparatedEnergyExpense
        ? expense.recurrence
        : inferredCategory === ExpenseCategory.ENERGY && energyBilling
        ? energyBilling.recurrence
        : expense.recurrence,
    category:
      !expense.category || expense.category === ExpenseCategory.OTHER
        ? inferredCategory
        : expense.category,
    subcategory:
      hasManualContractSelection
        ? finalSubcategory
        : inferenceDocumentType === "internet_invoice"
        ? ExpenseSubcategory.INTERNET
      : expense.category === ExpenseCategory.INSURANCE && expense.subcategory
        ? expense.subcategory
        : !expense.subcategory || expense.subcategory === ExpenseSubcategory.OTHER
        ? finalSubcategory
        : expense.subcategory
  };
}
