import { getMissingContractFields } from "@/features/analysis/contract-details";
import type { AlternativeOffer } from "@/features/recommendations/service";
import { isCommercialSectorEnabled } from "@/experiments/commercial-catalog/activation";
import {
  annualInternetRecurringCost,
  catalogConclusion,
  compareElectricityContract,
  compareGasContract,
  compareInsuranceContract,
  compareInternetContract,
} from "@/experiments/commercial-catalog/recommend";
import type {
  CommercialComparisonResult,
  CommercialOffer,
  CommercialSector,
  ElectricityOffer,
  GasOffer,
  InsuranceOffer,
  InternetOffer,
} from "@/experiments/commercial-catalog/types";
import {
  ExpenseCategory,
  type ContractComparisonState,
  type Expense,
  type MockAnalysis,
} from "@/types";
import { loadCommercialCatalog } from "./commercial-catalog";

type CatalogSnapshot = Awaited<ReturnType<typeof loadCommercialCatalog>>;
type CatalogLoader = (sector: CommercialSector, now: Date) => Promise<CatalogSnapshot>;

const SUPPORTED_SECTORS = [
  "internet", "electricity", "gas", "home_insurance", "car_insurance",
] as const satisfies readonly CommercialSector[];

export const DEFAULT_INTERNET_MIN_YEARLY_SAVING = 60;
export const DEFAULT_ENERGY_MIN_YEARLY_SAVING = 60;

function internetMinimumYearlySaving(environment: Record<string, string | undefined>) {
  const configured = Number(environment.COMMERCIAL_CATALOG_INTERNET_MIN_YEARLY_SAVING);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_INTERNET_MIN_YEARLY_SAVING;
}

function energyMinimumYearlySaving(
  sector: "electricity" | "gas",
  environment: Record<string, string | undefined>,
) {
  const name = sector === "electricity"
    ? "COMMERCIAL_CATALOG_ELECTRICITY_MIN_YEARLY_SAVING"
    : "COMMERCIAL_CATALOG_GAS_MIN_YEARLY_SAVING";
  const configured = Number(environment[name]);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_ENERGY_MIN_YEARLY_SAVING;
}

function hasTv(offer: AlternativeOffer) {
  return offer.conditions?.some((condition) => /tv|cha[iî]ne|décodeur/i.test(condition)) ?? false;
}

function nearDuplicateInternetOffer(left: AlternativeOffer, right: AlternativeOffer) {
  if (left.provider !== right.provider) return false;
  const savingDifference = Math.abs(
    (left.durableYearlySaving ?? left.estimatedYearlySaving) -
    (right.durableYearlySaving ?? right.estimatedYearlySaving)
  );
  const speedLeft = left.downloadMbps ?? 0;
  const speedRight = right.downloadMbps ?? 0;
  return savingDifference <= 24 && hasTv(left) === hasTv(right) && Math.abs(speedLeft - speedRight) < 1_000;
}

function hasDistinctInternetAdvantage(candidate: AlternativeOffer, selected: AlternativeOffer[]) {
  if (hasTv(candidate) && selected.every((offer) => !hasTv(offer))) return true;
  if ((candidate.commitmentMonths ?? 0) === 0 && selected.every((offer) => (offer.commitmentMonths ?? 0) > 0)) return true;
  if (candidate.promotionPrice === undefined && selected.every((offer) => offer.promotionPrice !== undefined)) return true;
  const bestSelectedSpeed = Math.max(0, ...selected.map((offer) => offer.downloadMbps ?? 0));
  if ((candidate.downloadMbps ?? 0) >= Math.max(2_000, bestSelectedSpeed * 2)) return true;
  return false;
}

export function selectInternetAlternatives(
  offers: AlternativeOffer[],
  minimumYearlySaving = DEFAULT_INTERNET_MIN_YEARLY_SAVING,
) {
  const candidates = offers
    .filter((offer) =>
      offer.comparisonKind === "equivalent" &&
      (offer.durableYearlySaving ?? offer.estimatedYearlySaving) >= minimumYearlySaving
    )
    .sort((left, right) => {
      const durableSaving =
        (right.durableYearlySaving ?? right.estimatedYearlySaving) -
        (left.durableYearlySaving ?? left.estimatedYearlySaving);
      if (durableSaving !== 0) return durableSaving;
      const firstYearSaving = right.estimatedYearlySaving - left.estimatedYearlySaving;
      if (firstYearSaving !== 0) return firstYearSaving;
      if ((left.promotionPrice !== undefined) !== (right.promotionPrice !== undefined)) {
        return left.promotionPrice === undefined ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    });
  const selected: AlternativeOffer[] = [];
  for (const candidate of candidates) {
    if (selected.some((offer) => nearDuplicateInternetOffer(candidate, offer))) continue;
    if (selected.length < 2 || (selected.length === 2 && hasDistinctInternetAdvantage(candidate, selected))) {
      selected.push(candidate);
    }
    if (selected.length === 3) break;
  }
  return selected;
}

export function selectEnergyAlternatives(
  offers: AlternativeOffer[],
  minimumYearlySaving = DEFAULT_ENERGY_MIN_YEARLY_SAVING,
) {
  const candidates = offers
    .filter((offer) => offer.comparisonKind === "equivalent" && offer.estimatedYearlySaving >= minimumYearlySaving)
    .sort((left, right) => right.estimatedYearlySaving - left.estimatedYearlySaving || left.id.localeCompare(right.id));
  const selected: AlternativeOffer[] = [];
  for (const candidate of candidates) {
    if (selected.some((offer) => offer.provider === candidate.provider)) continue;
    const distinctPricing = selected.length === 2 && candidate.pricingMode !== undefined &&
      selected.every((offer) => offer.pricingMode !== candidate.pricingMode);
    if (selected.length < 2 || distinctPricing) selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected;
}

function isAnnualPeriod(period?: { start: string; end: string }) {
  if (!period) return false;
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  return Number.isFinite(start) && Number.isFinite(end) && end - start >= 300 * 24 * 60 * 60 * 1000;
}

function comparableCurrentAnnualCost(expense: Expense) {
  const details = expense.contractDetails;
  if (!details || (details.kind !== "electricity" && details.kind !== "gas")) return expense.yearlyAmount;
  if (details.documentKind === "INVOICE" && expense.recurrence === "one_time" && !isAnnualPeriod(details.period)) {
    return null;
  }
  return expense.yearlyAmount;
}

function categoryForSector(sector: CommercialSector) {
  if (sector === "internet") return ExpenseCategory.TELECOM;
  if (sector === "electricity" || sector === "gas") return ExpenseCategory.ENERGY;
  return ExpenseCategory.INSURANCE;
}

function detailsSector(expense: Expense): CommercialSector | null {
  if (expense.subcategory === "INTERNET") return "internet";
  if (expense.subcategory === "ELECTRICITY") return "electricity";
  if (expense.subcategory === "GAS") return "gas";
  if (expense.subcategory === "HOME_INSURANCE") return "home_insurance";
  if (expense.subcategory === "CAR_INSURANCE") return "car_insurance";
  if (expense.documentType === "internet_invoice") return "internet";
  if (expense.documentType === "electricity_invoice") return "electricity";
  if (expense.documentType === "gas_invoice") return "gas";
  if (expense.documentType === "home_insurance") return "home_insurance";
  if (expense.documentType === "car_insurance") return "car_insurance";
  if (expense.contractDetails) return expense.contractDetails.kind;
  return null;
}

function offerConditions(offer: CommercialOffer) {
  const eligibility = "eligibilityConditions" in offer ? offer.eligibilityConditions : [];
  if (offer.sector !== "internet") return [...offer.conditions, ...eligibility];
  const conciseConditions = offer.conditions
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0 && condition.length <= 180);
  const eligibilitySummary = eligibility.some((condition) =>
    /éligibilit[eé]|raccordement|adresse/i.test(condition)
  )
    ? ["Sous réserve d'éligibilité technique et géographique."]
    : [];
  const serviceConditions = offer.includedServices
    .map((service) => service.trim())
    .filter((service) => service.length > 0 && service.length <= 80);
  const technicalConditions = [
    offer.commitmentMonths === 0
      ? "Sans engagement"
      : offer.commitmentMonths !== null
        ? `Engagement ${offer.commitmentMonths} mois`
        : null,
    offer.downloadMbps !== null ? `Débit descendant jusqu'à ${offer.downloadMbps} Mbit/s` : null,
  ].filter((condition): condition is string => Boolean(condition));
  return [...new Set([
    ...conciseConditions,
    ...technicalConditions,
    ...serviceConditions,
    ...eligibilitySummary,
  ])];
}

function toAlternative(
  expense: Expense,
  result: CommercialComparisonResult,
  reliableInput: boolean,
): AlternativeOffer | null {
  const quoteRequired = result.confidence === "QUOTE_REQUIRED";
  if (result.alternativeAnnualCost === null && !quoteRequired) return null;
  if (!quoteRequired && (result.estimatedAnnualSaving ?? 0) <= 0) return null;
  const annualPrice = result.alternativeAnnualCost ?? expense.yearlyAmount;
  const certified = reliableInput && result.confidence === "CERTIFIED" && result.comparisonKind === "EQUIVALENT";
  const recurringOnly = reliableInput && result.confidence === "ESTIMATED" && result.comparisonKind === "EQUIVALENT";
  const offer = result.offer;
  const internet = offer.sector === "internet" ? offer : null;
  const energy = offer.sector === "electricity" || offer.sector === "gas" ? offer : null;
  const recurringAnnualPrice = internet ? annualInternetRecurringCost(internet) : null;
  const durableAnnualPrice = internet?.priceAfterPromotion !== null && internet?.priceAfterPromotion !== undefined
    ? internet.priceAfterPromotion * 12
    : internet?.monthlyPrice !== null && internet?.monthlyPrice !== undefined
      ? internet.monthlyPrice * 12
      : null;
  const durableYearlySaving = durableAnnualPrice === null
    ? undefined
    : Math.round(Math.max(0, expense.monthlyAmount * 12 - durableAnnualPrice) * 100) / 100;
  const saving = certified || recurringOnly ? result.estimatedAnnualSaving ?? 0 : 0;
  return {
    id: `commercial-${expense.id}-${offer.catalogId}`,
    category: categoryForSector(offer.sector),
    provider: offer.provider,
    name: offer.offerName,
    url: offer.offerUrl ?? offer.sourceUrl,
    sourceUrl: offer.sourceUrl,
    monthlyPrice: Math.round(((recurringAnnualPrice ?? annualPrice) / 12) * 100) / 100,
    yearlyPrice: Math.round(annualPrice * 100) / 100,
    estimatedYearlySaving: saving,
    recurringYearlySaving: recurringOnly ? saving : undefined,
    durableYearlySaving,
    pricingMode: energy?.pricingMode,
    estimateReason: recurringOnly
      ? internet ? "unknown_fees" : energy?.pricingMode === "INDEXED" ? "indexed_price" : energy ? "estimated_schedule" : undefined
      : undefined,
    sourceExpenseId: expense.id,
    reason: result.reasons.join(" ") || (quoteRequired
      ? "Les garanties peuvent être comparées, mais un devis personnalisé reste indispensable."
      : "Offre vérifiée sur une période de comparaison de 12 mois."),
    action: quoteRequired
      ? "Comparer les garanties et demander un devis personnalisé sans transmettre automatiquement vos données."
      : offer.offerUrl
        ? "Vérifier votre éligibilité et les conditions contractuelles sur la page officielle de l'offre."
        : `Ouvrir la page officielle et rechercher l'offre « ${offer.offerName} » avant tout changement.`,
    comparisonKind: result.comparisonKind === "EQUIVALENT" ? "equivalent" : "requires_validation",
    savingKind: certified ? "certified" : recurringOnly ? "recurring_only" : undefined,
    netFirstYearSaving: certified ? result.estimatedAnnualSaving ?? 0 : undefined,
    publicMonthlyPrice: internet?.monthlyPrice ?? Math.round((annualPrice / 12) * 100) / 100,
    promotionPrice: internet?.promotionPrice ?? undefined,
    promotionDurationMonths: internet?.promotionDurationMonths ?? undefined,
    priceAfterPromotion: internet?.priceAfterPromotion ?? undefined,
    knownEntryFees: internet?.activationFees ?? undefined,
    entryFeesKnown: internet
      ? internet.activationFees !== null && internet.terminationFees !== null
      : undefined,
    terminationFees: internet?.terminationFees ?? undefined,
    commitmentMonths: internet?.commitmentMonths ?? undefined,
    technology: internet?.technology,
    downloadMbps: internet?.downloadMbps ?? undefined,
    conditions: offerConditions(offer),
    verifiedAt: offer.verifiedAt ?? undefined,
  };
}

function compareExpense(expense: Expense, catalog: CatalogSnapshot) {
  const details = expense.contractDetails;
  if (!details) return [];
  if (details.kind === "internet") {
    const technology = details.technology;
    if (!technology || technology === "UNKNOWN") return [];
    return compareInternetContract({
      monthlyPrice: details.monthlyPrice ?? expense.monthlyAmount,
      technology,
      minimumDownloadMbps: details.downloadMbps ?? null,
      requiresTv: details.includedServices?.some((service) => /tv|television|decodeur/i.test(service)) ?? expense.internetTvIncluded === true,
      commitmentMonths: details.commitmentMonths ?? null,
    }, catalog.offers as InternetOffer[]);
  }
  if (details.kind === "electricity") {
    if (details.powerKva === undefined || !details.tariffOption || details.tariffOption === "UNKNOWN" || details.annualConsumptionKwh === undefined) return [];
    return compareElectricityContract({
      powerKva: details.powerKva,
      tariffOption: details.tariffOption,
      annualConsumptionKwh: details.annualConsumptionKwh,
      peakConsumptionKwh: details.peakConsumptionKwh,
      offPeakConsumptionKwh: details.offPeakConsumptionKwh,
      tempoConsumptionKwh: details.tempoConsumptionKwh,
      currentAnnualCost: comparableCurrentAnnualCost(expense),
      isEstimatedSchedule: details.documentKind !== "INVOICE",
    }, catalog.offers as ElectricityOffer[]);
  }
  if (details.kind === "gas") {
    if (details.annualConsumptionKwh === undefined) return [];
    return compareGasContract({
      annualConsumptionKwh: details.annualConsumptionKwh,
      tariffZone: details.tariffZone ?? null,
      consumptionClass: details.consumptionClass?.toUpperCase() ?? null,
      currentAnnualCost: comparableCurrentAnnualCost(expense),
      isEstimatedSchedule: details.documentKind !== "INVOICE",
    }, catalog.offers as GasOffer[]);
  }
  return compareInsuranceContract({
    sector: details.kind,
    currentAnnualPremium: details.annualPremium ?? expense.yearlyAmount,
    requiredGuarantees: details.guarantees ?? [],
    knownDeductibles: details.deductibles ?? [],
  }, catalog.offers as InsuranceOffer[]);
}

function conclusionMessage(expense: Expense, conclusion: ReturnType<typeof catalogConclusion>) {
  if (conclusion === "KEEP_CURRENT_CONTRACT") {
    return `${expense.provider}: aucune meilleure offre vérifiée n'a été identifiée; conservez le contrat actuel.`;
  }
  if (conclusion === "CATALOG_INSUFFICIENT") {
    return `${expense.provider}: le catalogue vérifié est insuffisant pour conclure.`;
  }
  if (conclusion === "COMPARISON_INCONCLUSIVE") {
    return `${expense.provider}: la comparaison nécessite des informations ou un devis complémentaire.`;
  }
  return null;
}

export async function buildEnabledCommercialComparisons(
  analysis: MockAnalysis,
  now = new Date(),
  options: {
    environment?: Record<string, string | undefined>;
    loadCatalog?: CatalogLoader;
  } = {},
) {
  const environment = options.environment ?? process.env;
  const loadCatalog = options.loadCatalog ?? loadCommercialCatalog;
  const enabledSectors = SUPPORTED_SECTORS.filter((sector) => isCommercialSectorEnabled(sector, environment));
  const alternatives: AlternativeOffer[] = [];
  const messages: string[] = [];
  const comparisonStates: ContractComparisonState[] = [];
  const replacedExpenseIds = new Set<string>();
  const catalogs: Partial<Record<CommercialSector, Pick<CatalogSnapshot, "status" | "verifiedAt" | "sources">>> = {};

  for (const sector of SUPPORTED_SECTORS.filter((candidate) => !enabledSectors.includes(candidate))) {
    for (const expense of analysis.expenses.filter((candidate) => detailsSector(candidate) === sector)) {
      comparisonStates.push({
        expenseId: expense.id,
        status: "disabled",
        message: "La comparaison des offres n'est pas disponible actuellement.",
      });
    }
  }

  for (const sector of enabledSectors) {
    const expenses = analysis.expenses.filter((expense) => detailsSector(expense) === sector);
    if (expenses.length === 0) continue;
    const catalog = await loadCatalog(sector, now);
    catalogs[sector] = { status: catalog.status, verifiedAt: catalog.verifiedAt, sources: catalog.sources };
    for (const expense of expenses) {
      replacedExpenseIds.add(expense.id);
      const missing = getMissingContractFields(expense);
      if (missing.length > 0) {
        const message = "Complétez les caractéristiques nécessaires pour comparer ce contrat.";
        comparisonStates.push({ expenseId: expense.id, status: "missing_information", message, missingFields: missing });
        messages.push(`${expense.provider}: ${message}`);
        continue;
      }
      if (catalog.status !== "fresh") {
        const message = "La comparaison des offres n'est pas disponible actuellement.";
        comparisonStates.push({ expenseId: expense.id, status: "unavailable", message });
        messages.push(
          `${expense.provider}: le catalogue ${sector} est ${catalog.status === "stale" ? "périmé" : "indisponible"}; ${message}`
        );
        continue;
      }
      const results = compareExpense(expense, catalog);
      const reliableInput = expense.contractDetails?.source !== "ai" &&
        !Object.values(expense.contractDetails?.fieldSources ?? {}).includes("ai");
      const mappedAlternatives = results
        .map((result) => toAlternative(expense, result, reliableInput))
        .filter((offer): offer is AlternativeOffer => Boolean(offer));
      const expenseAlternatives = sector === "internet"
        ? [
            ...selectInternetAlternatives(mappedAlternatives, internetMinimumYearlySaving(environment)),
            ...mappedAlternatives.filter((offer) => offer.savingKind === undefined).slice(0, 1),
          ]
        : sector === "electricity" || sector === "gas"
          ? selectEnergyAlternatives(mappedAlternatives, energyMinimumYearlySaving(sector, environment))
        : mappedAlternatives;
      alternatives.push(...expenseAlternatives);
      const conclusion = catalogConclusion(results);
      const hasRecommendedAlternative = expenseAlternatives.some(
        (offer) => (offer.savingKind === "certified" || offer.savingKind === "recurring_only") &&
          offer.estimatedYearlySaving > 0
      );
      const hasSubThresholdEnergyAlternative = (sector === "electricity" || sector === "gas") &&
        mappedAlternatives.some((offer) =>
          (offer.savingKind === "certified" || offer.savingKind === "recurring_only") &&
          offer.estimatedYearlySaving > 0
        );
      if (hasRecommendedAlternative) {
        comparisonStates.push({
          expenseId: expense.id,
          status: "alternative_found",
          message: "Une alternative plus avantageuse a été identifiée parmi les offres vérifiées.",
        });
      } else if (conclusion === "KEEP_CURRENT_CONTRACT" || sector === "internet" || hasSubThresholdEnergyAlternative) {
        comparisonStates.push({
          expenseId: expense.id,
          status: "no_better_offer",
          message: "Aucune alternative plus avantageuse n'a été identifiée parmi les offres vérifiées.",
        });
      } else {
        comparisonStates.push({
          expenseId: expense.id,
          status: "unavailable",
          message: conclusion === "CATALOG_INSUFFICIENT"
            ? "La couverture des offres vérifiées est insuffisante pour conclure."
            : "La comparaison nécessite une vérification complémentaire.",
        });
      }
      const message = conclusionMessage(expense, conclusion);
      if (message) messages.push(message);
    }
  }

  return { alternatives, messages, replacedExpenseIds, catalogs, comparisonStates };
}
