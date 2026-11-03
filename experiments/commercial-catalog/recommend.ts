import type {
  CommercialComparisonResult,
  ElectricityContractInput,
  ElectricityOffer,
  GasContractInput,
  GasOffer,
  InsuranceContractInput,
  InsuranceOffer,
  InternetContractInput,
  InternetOffer,
} from "./types";

function money(value: number) { return Math.round(value * 100) / 100; }
function saving(current: number | null, alternative: number | null) {
  if (current === null || alternative === null) return null;
  return money(Math.max(0, current - alternative));
}

export function annualInternetCost(offer: InternetOffer) {
  if (offer.monthlyPrice === null || offer.activationFees === null) return null;
  const recurring = offer.promotionPrice !== null && offer.promotionDurationMonths !== null && offer.priceAfterPromotion !== null
    ? offer.promotionPrice * Math.min(12, offer.promotionDurationMonths) +
      offer.priceAfterPromotion * Math.max(0, 12 - offer.promotionDurationMonths)
    : offer.monthlyPrice * 12;
  const automaticRefund = offer.activationFeeRefundConditional ? 0 : offer.activationFeeRefund ?? 0;
  return money(recurring + offer.activationFees - automaticRefund);
}

export function compareInternetContract(input: InternetContractInput, offers: InternetOffer[]) {
  return offers.filter((offer) => offer.verificationStatus === "VERIFIED").map((offer): CommercialComparisonResult<InternetOffer> => {
    const reasons: string[] = [];
    let kind: CommercialComparisonResult["comparisonKind"] = "EQUIVALENT";
    if (input.technology === "FIBER" && offer.technology !== "FIBER") {
      kind = "NOT_COMPARABLE";
      reasons.push("La technologie ne correspond pas au contrat actuel.");
    }
    if (input.minimumDownloadMbps !== null && (offer.downloadMbps ?? 0) < input.minimumDownloadMbps) {
      kind = "COMPROMISE";
      reasons.push("Le debit descendant est inferieur au besoin indique.");
    }
    if (input.requiresTv && !offer.includedServices.some((service) => /tv|chaine/i.test(service))) {
      kind = "COMPROMISE";
      reasons.push("Le service TV requis n'est pas etabli comme inclus.");
    }
    if (offer.activationFeeRefundConditional) reasons.push("Le remboursement des frais d'activation reste conditionnel et n'est pas deduit.");
    const current = money(input.monthlyPrice * 12);
    const alternative = annualInternetCost(offer);
    const estimatedSaving = kind === "EQUIVALENT" ? saving(current, alternative) : null;
    return { offer, comparisonKind: kind, confidence: alternative === null ? "INSUFFICIENT" : "CERTIFIED",
      currentAnnualCost: current, alternativeAnnualCost: alternative, estimatedAnnualSaving: estimatedSaving, reasons };
  }).sort((left, right) => (right.estimatedAnnualSaving ?? -1) - (left.estimatedAnnualSaving ?? -1));
}

export function annualElectricityCost(input: ElectricityContractInput, offer: ElectricityOffer) {
  const subscription = offer.monthlySubscriptionByPower[String(input.powerKva)];
  if (subscription === undefined || offer.tariffOption !== input.tariffOption) return null;
  if (offer.tariffOption === "BASE") {
    return offer.basePricePerKwh === null ? null : money(subscription * 12 + input.annualConsumptionKwh * offer.basePricePerKwh);
  }
  if (offer.tariffOption === "HPHC") {
    if (input.peakConsumptionKwh === undefined || input.offPeakConsumptionKwh === undefined ||
      offer.peakPricePerKwh === null || offer.offPeakPricePerKwh === null) return null;
    return money(subscription * 12 + input.peakConsumptionKwh * offer.peakPricePerKwh + input.offPeakConsumptionKwh * offer.offPeakPricePerKwh);
  }
  if (offer.tariffOption === "TEMPO") {
    const consumption = input.tempoConsumptionKwh;
    const keys = ["bluePeak", "blueOffPeak", "whitePeak", "whiteOffPeak", "redPeak", "redOffPeak"] as const;
    if (!consumption || keys.some((key) => consumption[key] === undefined || offer.tempoPrices[key] === undefined)) return null;
    return money(subscription * 12 + keys.reduce((total, key) => total + consumption[key]! * offer.tempoPrices[key]!, 0));
  }
  return null;
}

export function compareElectricityContract(input: ElectricityContractInput, offers: ElectricityOffer[]) {
  return offers.filter((offer) => offer.verificationStatus === "VERIFIED").map((offer): CommercialComparisonResult<ElectricityOffer> => {
    const alternative = annualElectricityCost(input, offer);
    const optionMatches = offer.tariffOption === input.tariffOption;
    const powerMatches = offer.powerKva.includes(input.powerKva);
    const complete = alternative !== null && optionMatches && powerMatches;
    const confidence = !complete ? "INSUFFICIENT" : input.isEstimatedSchedule ? "ESTIMATED" : "CERTIFIED";
    const reasons = complete ? [] : ["Puissance, option tarifaire ou repartition de consommation insuffisante."];
    if (input.isEstimatedSchedule) reasons.push("La depense actuelle provient d'un echeancier estime; l'economie n'est pas garantie.");
    return { offer, comparisonKind: complete ? "EQUIVALENT" : "MORE_INFO_REQUIRED", confidence,
      currentAnnualCost: input.currentAnnualCost, alternativeAnnualCost: alternative,
      estimatedAnnualSaving: complete && !input.isEstimatedSchedule ? saving(input.currentAnnualCost, alternative) : null, reasons };
  });
}

export function annualGasCost(input: GasContractInput, offer: GasOffer) {
  if (offer.referenceOnly || offer.annualSubscription === null || offer.pricePerKwh === null) return null;
  if (input.tariffZone === null || input.consumptionClass === null || offer.tariffZone !== input.tariffZone || offer.consumptionClass !== input.consumptionClass) return null;
  return money(offer.annualSubscription + input.annualConsumptionKwh * offer.pricePerKwh);
}

export function compareGasContract(input: GasContractInput, offers: GasOffer[]) {
  return offers.filter((offer) => offer.verificationStatus === "VERIFIED").map((offer): CommercialComparisonResult<GasOffer> => {
    const alternative = annualGasCost(input, offer);
    const reference = offer.referenceOnly;
    return { offer, comparisonKind: reference ? "NOT_COMPARABLE" : alternative === null ? "MORE_INFO_REQUIRED" : "EQUIVALENT",
      confidence: reference || alternative === null ? "INSUFFICIENT" : "CERTIFIED",
      currentAnnualCost: input.currentAnnualCost, alternativeAnnualCost: alternative,
      estimatedAnnualSaving: alternative === null ? null : saving(input.currentAnnualCost, alternative),
      reasons: reference ? ["La reference CRE n'est pas une offre souscriptible."] : alternative === null
        ? ["Zone tarifaire ou classe de consommation manquante ou incompatible."] : [] };
  });
}

export function compareInsuranceContract(input: InsuranceContractInput, offers: InsuranceOffer[]) {
  return offers.filter((offer) => offer.verificationStatus === "VERIFIED" && offer.sector === input.sector)
    .map((offer): CommercialComparisonResult<InsuranceOffer> => {
      const missing = input.requiredGuarantees.filter((required) =>
        !offer.guarantees.some((guarantee) => guarantee.toLowerCase().includes(required.toLowerCase())));
      return { offer, comparisonKind: "QUOTE_REQUIRED", confidence: "QUOTE_REQUIRED",
        currentAnnualCost: input.currentAnnualPremium, alternativeAnnualCost: null, estimatedAnnualSaving: null,
        reasons: missing.length > 0
          ? [`Garanties a verifier: ${missing.join(", ")}.`, "Un devis personnalise est indispensable."]
          : ["Les garanties semblent pertinentes, mais seul un devis personnalise permet une comparaison tarifaire."] };
    });
}

export function catalogConclusion(results: Array<CommercialComparisonResult>) {
  if (results.length === 0) return "CATALOG_INSUFFICIENT" as const;
  if (results.some((result) => result.estimatedAnnualSaving !== null && result.estimatedAnnualSaving > 0)) return "BETTER_OFFER_FOUND" as const;
  if (results.some((result) => result.comparisonKind === "EQUIVALENT")) return "KEEP_CURRENT_CONTRACT" as const;
  return "COMPARISON_INCONCLUSIVE" as const;
}
