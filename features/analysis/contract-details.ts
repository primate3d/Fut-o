import type {
  ContractDetails,
  ElectricityContractDetails,
  Expense,
  GasContractDetails,
  InsuranceContractDetails,
  InternetContractDetails,
  UploadedDocumentType,
} from "@/types";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function number(value?: string) {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function firstNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = number(text.match(pattern)?.[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return undefined;
}

function durationMonths(text: string) {
  return firstNumber(text, [/(?:pendant|durant)\s+(\d{1,2})\s+mois/i]);
}

function speedMbps(text: string, labels: string) {
  const match = text.match(new RegExp(`(?:${labels})[^\\n]{0,80}?(\\d+(?:[.,]\\d+)?)\\s*(gbit|gb|mbit|mb)\\s*\\/?s`, "i"));
  const value = number(match?.[1]);
  if (value === undefined) return undefined;
  return /gbit|gb/i.test(match?.[2] ?? "") ? value * 1000 : value;
}

function documentKind(text: string) {
  if (/echeancier|mensualisation|prelevements? mensuels?/.test(text)) return "PAYMENT_SCHEDULE" as const;
  if (/estimation|estimee?|simulation/.test(text)) return "ESTIMATE" as const;
  if (/facture|consommation relevee|index releve/.test(text)) return "INVOICE" as const;
  return "UNKNOWN" as const;
}

function extractPeriod(text: string) {
  const match = text.match(/(?:du|periode\s+du)\s+(\d{2})[/.](\d{2})[/.](\d{4})\s+au\s+(\d{2})[/.](\d{2})[/.](\d{4})/i);
  if (!match) return undefined;
  return { start: `${match[3]}-${match[2]}-${match[1]}`, end: `${match[6]}-${match[5]}-${match[4]}` };
}

function extractInternet(text: string, sourceDocumentId: string): InternetContractDetails {
  const normalized = normalize(text);
  const technology: InternetContractDetails["technology"] = /\b(ftth|fibre|fiber)\b/.test(normalized)
    ? "FIBER"
    : /\bcable\b/.test(normalized)
      ? "CABLE"
      : /\bvdsl\b/.test(normalized)
        ? "VDSL"
        : /\badsl|xdsl\b/.test(normalized)
          ? "ADSL"
          : "UNKNOWN";
  const promotionPrice = firstNumber(normalized, [
    /(?:prix\s+promo|promotion|pendant\s+\d{1,2}\s+mois)[^\n]{0,50}?(\d+[.,]\d{1,2})\s*(?:eur|€)/i,
    /(\d+[.,]\d{1,2})\s*(?:eur|€)\s*\/\s*mois\s*pendant/i,
  ]);
  const priceAfterPromotion = firstNumber(normalized, [
    /(?:puis|ensuite|apres\s+promotion)[^\d]{0,30}(\d+[.,]\d{1,2})\s*(?:eur|€)/i,
  ]);
  const monthlyPrice = firstNumber(normalized, [
    /(?:abonnement|prix\s+mensuel|total\s+abonnements?)[^\n]{0,80}?(\d+[.,]\d{1,2})\s*(?:eur|€)/i,
    /(\d+[.,]\d{1,2})\s*(?:eur|€)\s*\/\s*mois/i,
  ]);
  const offerName = firstText(text, [
    /(?:offre|abonnement|forfait)\s*[:\-]?\s*([^\n]{3,80})/i,
  ]);
  const commitmentMonths = /sans\s+engagement/.test(normalized)
    ? 0
    : firstNumber(normalized, [/(?:engagement|engage)[^\d]{0,20}(\d{1,2})\s+mois/i]);
  const includedServices = [
    /\b(tv|television|decodeur|bouquet)\b/.test(normalized) ? "TV" : null,
    /\b(wi[- ]?fi\s*[567]|wifi\s*[567])\b/.test(normalized) ? "Wi-Fi" : null,
    /\b(telephonie|appels? illimites?)\b/.test(normalized) ? "Telephonie" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    version: 1,
    kind: "internet",
    source: "document",
    sourceDocumentId,
    offerName,
    technology,
    monthlyPrice,
    promotionPrice,
    promotionDurationMonths: durationMonths(normalized),
    priceAfterPromotion,
    commitmentMonths,
    activationFees: firstNumber(normalized, [/(?:frais\s+(?:de\s+)?(?:mise\s+en\s+service|activation))[^\d]{0,30}(\d+[.,]?\d*)\s*(?:eur|€)/i]),
    terminationFees: firstNumber(normalized, [/(?:frais\s+(?:de\s+)?resiliation)[^\d]{0,30}(\d+[.,]?\d*)\s*(?:eur|€)/i]),
    downloadMbps: speedMbps(normalized, "debit descendant|telechargement|download|jusqu a"),
    uploadMbps: speedMbps(normalized, "debit montant|envoi|upload"),
    includedServices: includedServices.length > 0 ? includedServices : undefined,
  };
}

function extractElectricity(text: string, sourceDocumentId: string): ElectricityContractDetails {
  const normalized = normalize(text);
  const tariffOption: ElectricityContractDetails["tariffOption"] = /\btempo\b/.test(normalized)
    ? "TEMPO"
    : /heures?\s+(?:pleines?|creuses?)|\bhp\s*\/\s*hc\b|\bhphc\b/.test(normalized)
      ? "HPHC"
      : /option\s+base|tarif\s+base/.test(normalized)
        ? "BASE"
        : "UNKNOWN";
  return {
    version: 1,
    kind: "electricity",
    source: "document",
    sourceDocumentId,
    documentKind: documentKind(normalized),
    powerKva: firstNumber(normalized, [/(?:puissance\s+(?:souscrite|compteur)?|abonnement)[^\d]{0,25}(\d+(?:[.,]\d+)?)\s*kva/i]),
    tariffOption,
    annualConsumptionKwh: firstNumber(normalized, [/(?:consommation\s+(?:annuelle|sur\s+12\s+mois)|conso\s+annuelle)[^\d]{0,35}(\d[\d\s.,]*)\s*kwh/i]),
    peakConsumptionKwh: firstNumber(normalized, [/(?:heures?\s+pleines?|\bhp\b)[^\d]{0,35}(\d[\d\s.,]*)\s*kwh/i]),
    offPeakConsumptionKwh: firstNumber(normalized, [/(?:heures?\s+creuses?|\bhc\b)[^\d]{0,35}(\d[\d\s.,]*)\s*kwh/i]),
    subscriptionAmount: firstNumber(normalized, [/(?:abonnement\s+(?:annuel|ht|ttc)?)[^\d]{0,40}(\d+[.,]\d{1,4})\s*(?:eur|€)/i]),
    basePricePerKwh: tariffOption === "BASE" ? firstNumber(normalized, [/(?:prix\s+(?:unitaire\s+)?du\s+kwh|kwh\s+base)[^\d]{0,30}(0[.,]\d+)/i]) : undefined,
    peakPricePerKwh: firstNumber(normalized, [/(?:prix[^\n]{0,20})?(?:heures?\s+pleines?|\bhp\b)[^\d]{0,30}(0[.,]\d+)/i]),
    offPeakPricePerKwh: firstNumber(normalized, [/(?:prix[^\n]{0,20})?(?:heures?\s+creuses?|\bhc\b)[^\d]{0,30}(0[.,]\d+)/i]),
    taxes: firstNumber(normalized, [/(?:total\s+taxes|taxes\s+et\s+contributions)[^\d]{0,35}(\d+[.,]\d{1,2})\s*(?:eur|€)/i]),
    period: extractPeriod(normalized),
  };
}

function extractGas(text: string, sourceDocumentId: string): GasContractDetails {
  const normalized = normalize(text);
  return {
    version: 1,
    kind: "gas",
    source: "document",
    sourceDocumentId,
    documentKind: documentKind(normalized),
    annualConsumptionKwh: firstNumber(normalized, [/(?:consommation\s+(?:annuelle|sur\s+12\s+mois)|conso\s+annuelle)[^\d]{0,35}(\d[\d\s.,]*)\s*kwh/i]),
    tariffZone: firstText(normalized, [/(?:zone\s+tarifaire|zone\s+gaz)\s*[:\-]?\s*([a-z0-9-]{1,12})/i]),
    consumptionClass: firstText(normalized, [/(?:classe\s+de\s+consommation|profil\s+gaz)\s*[:\-]?\s*([a-z0-9-]{1,16})/i]),
    pricePerKwh: firstNumber(normalized, [/(?:prix\s+(?:unitaire\s+)?du\s+kwh|kwh\s+gaz)[^\d]{0,30}(0[.,]\d+)/i]),
    annualSubscription: firstNumber(normalized, [/(?:abonnement\s+annuel)[^\d]{0,35}(\d+[.,]\d{1,2})\s*(?:eur|€)/i]),
    taxes: firstNumber(normalized, [/(?:total\s+taxes|taxes\s+et\s+contributions)[^\d]{0,35}(\d+[.,]\d{1,2})\s*(?:eur|€)/i]),
    period: extractPeriod(normalized),
  };
}

function collectLabels(text: string, definitions: Array<[string, RegExp]>) {
  return definitions.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function extractInsurance(text: string, sourceDocumentId: string, kind: InsuranceContractDetails["kind"]): InsuranceContractDetails {
  const normalized = normalize(text);
  const guarantees = collectLabels(normalized, [
    ["responsabilite civile", /responsabilite\s+civile/], ["incendie", /incendie/], ["vol", /\bvol\b/],
    ["degats des eaux", /degats?\s+des\s+eaux/], ["bris de glace", /bris\s+de\s+glace/],
    ["dommages tous accidents", /tous\s+risques|dommages\s+tous\s+accidents/], ["protection du conducteur", /protection\s+du\s+conducteur/],
  ]);
  const deductibles = [...normalized.matchAll(/franchise[^\n.;]{0,80}?(\d+[.,]?\d*)\s*(?:eur|€)/gi)].map((match) => `${number(match[1])} EUR`);
  const limits = [...normalized.matchAll(/(?:plafond|capital\s+garanti)[^\n.;]{0,80}?(\d[\d\s.,]*)\s*(?:eur|€)/gi)].map((match) => match[0].trim());
  const exclusions = [...normalized.matchAll(/exclusions?\s*[:\-]\s*([^\n.]{3,160})/gi)].map((match) => match[1].trim());
  const assistance = [...normalized.matchAll(/assistance[^\n.;]{0,80}/gi)].map((match) => match[0].trim());
  return {
    version: 1,
    kind,
    source: "document",
    sourceDocumentId,
    annualPremium: firstNumber(normalized, [/(?:cotisation|prime)\s+(?:annuelle|ttc)[^\d]{0,35}(\d+[.,]\d{1,2})\s*(?:eur|€)/i]),
    vehicle: kind === "car_insurance" ? firstText(text, [/(?:vehicule|automobile)\s*[:\-]\s*([^\n]{3,100})/i]) : undefined,
    formula: firstText(text, [/(?:formule|niveau\s+de\s+garantie)\s*[:\-]\s*([^\n]{2,80})/i]),
    housingType: kind === "home_insurance" ? firstText(text, [/(?:type\s+de\s+logement|logement)\s*[:\-]\s*([^\n]{3,80})/i]) : undefined,
    surfaceM2: kind === "home_insurance" ? firstNumber(normalized, [/(?:surface|superficie)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*m2/i]) : undefined,
    occupancyStatus: kind === "home_insurance" ? firstText(normalized, [/(locataire|proprietaire occupant|proprietaire non occupant)/i]) : undefined,
    contentsCapital: kind === "home_insurance" ? firstNumber(normalized, [/(?:capital\s+mobilier|contenu)[^\d]{0,30}(\d[\d\s.,]*)\s*(?:eur|€)/i]) : undefined,
    guarantees: guarantees.length > 0 ? guarantees : undefined,
    deductibles: deductibles.length > 0 ? deductibles : undefined,
    limits: limits.length > 0 ? limits : undefined,
    assistance: assistance.length > 0 ? assistance : undefined,
    exclusions: exclusions.length > 0 ? exclusions : undefined,
  };
}

export function extractContractDetails(input: {
  text: string;
  documentType?: UploadedDocumentType;
  sourceDocumentId: string;
}): ContractDetails | undefined {
  if (input.documentType === "internet_invoice") return extractInternet(input.text, input.sourceDocumentId);
  if (input.documentType === "electricity_invoice") return extractElectricity(input.text, input.sourceDocumentId);
  if (input.documentType === "gas_invoice") return extractGas(input.text, input.sourceDocumentId);
  if (input.documentType === "car_insurance") return extractInsurance(input.text, input.sourceDocumentId, "car_insurance");
  if (input.documentType === "home_insurance") return extractInsurance(input.text, input.sourceDocumentId, "home_insurance");
  return undefined;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() && value.length <= 500 ? value.trim() : undefined;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeStrings(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const values = value.map(safeString).filter((item): item is string => Boolean(item)).slice(0, 30);
  return values.length > 0 ? values : undefined;
}

function safePeriod(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const period = value as Record<string, unknown>;
  const start = safeString(period.start);
  const end = safeString(period.end);
  return start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    ? { start, end }
    : undefined;
}

function safeTempoConsumption(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const fields = ["bluePeak", "blueOffPeak", "whitePeak", "whiteOffPeak", "redPeak", "redOffPeak"] as const;
  const entries = fields
    .map((field) => [field, safeNumber(input[field])] as const)
    .filter((entry): entry is readonly [typeof fields[number], number] => entry[1] !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeAiContractDetails(
  value: unknown,
  documentType: UploadedDocumentType | undefined,
  sourceDocumentId: string,
): ContractDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const expectedKind = documentType === "internet_invoice" ? "internet"
    : documentType === "electricity_invoice" ? "electricity"
      : documentType === "gas_invoice" ? "gas"
        : documentType === "car_insurance" ? "car_insurance"
          : documentType === "home_insurance" ? "home_insurance"
            : undefined;
  if (!expectedKind || input.kind !== expectedKind) return undefined;
  const base = { version: 1 as const, source: "ai" as const, sourceDocumentId };
  if (expectedKind === "internet") {
    const technology = ["FIBER", "CABLE", "ADSL", "VDSL", "MIXED", "UNKNOWN"].includes(String(input.technology))
      ? input.technology as InternetContractDetails["technology"] : undefined;
    return {
      ...base, kind: "internet", technology,
      offerName: safeString(input.offerName), monthlyPrice: safeNumber(input.monthlyPrice),
      promotionPrice: safeNumber(input.promotionPrice), promotionDurationMonths: safeNumber(input.promotionDurationMonths),
      priceAfterPromotion: safeNumber(input.priceAfterPromotion), commitmentMonths: safeNumber(input.commitmentMonths),
      activationFees: safeNumber(input.activationFees), terminationFees: safeNumber(input.terminationFees),
      downloadMbps: safeNumber(input.downloadMbps), uploadMbps: safeNumber(input.uploadMbps),
      includedServices: safeStrings(input.includedServices),
    };
  }
  if (expectedKind === "electricity") {
    const tariffOption = ["BASE", "HPHC", "TEMPO", "UNKNOWN"].includes(String(input.tariffOption))
      ? input.tariffOption as ElectricityContractDetails["tariffOption"] : undefined;
    const kind = ["INVOICE", "PAYMENT_SCHEDULE", "ESTIMATE", "UNKNOWN"].includes(String(input.documentKind))
      ? input.documentKind as ElectricityContractDetails["documentKind"] : undefined;
    return {
      ...base, kind: "electricity", documentKind: kind, tariffOption,
      powerKva: safeNumber(input.powerKva), annualConsumptionKwh: safeNumber(input.annualConsumptionKwh),
      peakConsumptionKwh: safeNumber(input.peakConsumptionKwh), offPeakConsumptionKwh: safeNumber(input.offPeakConsumptionKwh),
      tempoConsumptionKwh: safeTempoConsumption(input.tempoConsumptionKwh),
      subscriptionAmount: safeNumber(input.subscriptionAmount), basePricePerKwh: safeNumber(input.basePricePerKwh),
      peakPricePerKwh: safeNumber(input.peakPricePerKwh), offPeakPricePerKwh: safeNumber(input.offPeakPricePerKwh),
      taxes: safeNumber(input.taxes), period: safePeriod(input.period),
    };
  }
  if (expectedKind === "gas") {
    const kind = ["INVOICE", "PAYMENT_SCHEDULE", "ESTIMATE", "UNKNOWN"].includes(String(input.documentKind))
      ? input.documentKind as GasContractDetails["documentKind"] : undefined;
    return {
      ...base, kind: "gas", documentKind: kind,
      annualConsumptionKwh: safeNumber(input.annualConsumptionKwh), tariffZone: safeString(input.tariffZone),
      consumptionClass: safeString(input.consumptionClass), pricePerKwh: safeNumber(input.pricePerKwh),
      annualSubscription: safeNumber(input.annualSubscription), taxes: safeNumber(input.taxes),
      period: safePeriod(input.period),
    };
  }
  return {
    ...base, kind: expectedKind,
    annualPremium: safeNumber(input.annualPremium), vehicle: safeString(input.vehicle),
    formula: safeString(input.formula), housingType: safeString(input.housingType),
    surfaceM2: safeNumber(input.surfaceM2), occupancyStatus: safeString(input.occupancyStatus),
    contentsCapital: safeNumber(input.contentsCapital), guarantees: safeStrings(input.guarantees),
    deductibles: safeStrings(input.deductibles), limits: safeStrings(input.limits),
    assistance: safeStrings(input.assistance), exclusions: safeStrings(input.exclusions),
  };
}

export function mergeContractDetails(primary?: ContractDetails, fallback?: ContractDetails) {
  if (!primary) return fallback;
  if (!fallback || primary.kind !== fallback.kind) return primary;
  const merged = { ...fallback } as ContractDetails;
  const fieldSources = { ...(fallback.fieldSources ?? {}) };
  for (const [field, value] of Object.entries(fallback)) {
    if (
      value !== undefined
      && value !== "UNKNOWN"
      && !["version", "kind", "source", "sourceDocumentId", "fieldSources"].includes(field)
    ) {
      fieldSources[field] ??= fallback.source;
    }
  }
  for (const [field, value] of Object.entries(primary)) {
    if (value !== undefined && value !== "UNKNOWN") {
      Object.assign(merged, { [field]: value });
      if (!["version", "kind", "source", "sourceDocumentId", "fieldSources"].includes(field)) {
        fieldSources[field] = primary.fieldSources?.[field] ?? primary.source;
      }
    }
  }
  merged.fieldSources = fieldSources;
  return merged;
}

export function getMissingContractFields(expense: Expense) {
  const details = expense.contractDetails;
  if (!details) return ["caracteristiques contractuelles"];
  if (details.kind === "internet") {
    return [
      details.technology && details.technology !== "UNKNOWN" ? null : "technologie",
      details.commitmentMonths !== undefined ? null : "engagement",
      details.downloadMbps !== undefined ? null : "debit descendant",
      details.includedServices !== undefined ? null : "services inclus",
    ].filter((value): value is string => Boolean(value));
  }
  if (details.kind === "electricity") {
    const missing = [
      details.powerKva !== undefined ? null : "puissance kVA",
      details.tariffOption && details.tariffOption !== "UNKNOWN" ? null : "option tarifaire",
      details.annualConsumptionKwh !== undefined ? null : "consommation annuelle",
    ];
    if (details.tariffOption === "HPHC") {
      missing.push(details.peakConsumptionKwh !== undefined ? null : "consommation heures pleines");
      missing.push(details.offPeakConsumptionKwh !== undefined ? null : "consommation heures creuses");
    }
    if (details.tariffOption === "TEMPO") {
      const labels: Record<string, string> = {
        bluePeak: "Tempo bleu HP", blueOffPeak: "Tempo bleu HC",
        whitePeak: "Tempo blanc HP", whiteOffPeak: "Tempo blanc HC",
        redPeak: "Tempo rouge HP", redOffPeak: "Tempo rouge HC",
      };
      for (const [field, label] of Object.entries(labels)) {
        missing.push(details.tempoConsumptionKwh?.[field as keyof NonNullable<typeof details.tempoConsumptionKwh>] !== undefined ? null : label);
      }
    }
    return missing.filter((value): value is string => Boolean(value));
  }
  if (details.kind === "gas") {
    return [
      details.annualConsumptionKwh !== undefined ? null : "consommation annuelle",
      details.tariffZone ? null : "zone tarifaire",
      details.consumptionClass ? null : "classe de consommation",
    ].filter((value): value is string => Boolean(value));
  }
  return [
    details.guarantees?.length ? null : "garanties",
    details.deductibles?.length ? null : "franchises",
  ].filter((value): value is string => Boolean(value));
}
