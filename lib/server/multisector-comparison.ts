import { getMissingContractFields } from "@/features/analysis/contract-details";
import type { AlternativeOffer } from "@/features/recommendations/service";
import { isCommercialSectorEnabled } from "@/experiments/commercial-catalog/activation";
import {
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
  return [...offer.conditions, ...eligibility];
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
  const offer = result.offer;
  const internet = offer.sector === "internet" ? offer : null;
  return {
    id: `commercial-${expense.id}-${offer.catalogId}`,
    category: categoryForSector(offer.sector),
    provider: offer.provider,
    name: offer.offerName,
    url: offer.sourceUrl,
    monthlyPrice: Math.round((annualPrice / 12) * 100) / 100,
    yearlyPrice: Math.round(annualPrice * 100) / 100,
    estimatedYearlySaving: certified ? result.estimatedAnnualSaving ?? 0 : 0,
    sourceExpenseId: expense.id,
    reason: result.reasons.join(" ") || (quoteRequired
      ? "Les garanties peuvent être comparées, mais un devis personnalisé reste indispensable."
      : "Offre vérifiée sur une période de comparaison de 12 mois."),
    action: quoteRequired
      ? "Comparer les garanties et demander un devis personnalisé sans transmettre automatiquement vos données."
      : certified
        ? "Vérifier votre éligibilité et les conditions contractuelles avant tout changement."
        : "Confirmer les informations du contrat avant de retenir cette offre.",
    comparisonKind: certified ? "equivalent" : "requires_validation",
    savingKind: certified ? "certified" : undefined,
    netFirstYearSaving: certified ? result.estimatedAnnualSaving ?? 0 : undefined,
    publicMonthlyPrice: Math.round((annualPrice / 12) * 100) / 100,
    promotionPrice: internet?.promotionPrice ?? undefined,
    promotionDurationMonths: internet?.promotionDurationMonths ?? undefined,
    priceAfterPromotion: internet?.priceAfterPromotion ?? undefined,
    knownEntryFees: internet?.activationFees ?? undefined,
    entryFeesKnown: internet ? internet.activationFees !== null : undefined,
    terminationFees: internet?.terminationFees ?? undefined,
    commitmentMonths: internet?.commitmentMonths ?? undefined,
    technology: internet?.technology,
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
      currentAnnualCost: expense.yearlyAmount,
      isEstimatedSchedule: details.documentKind !== "INVOICE",
    }, catalog.offers as ElectricityOffer[]);
  }
  if (details.kind === "gas") {
    if (details.annualConsumptionKwh === undefined) return [];
    return compareGasContract({
      annualConsumptionKwh: details.annualConsumptionKwh,
      tariffZone: details.tariffZone ?? null,
      consumptionClass: details.consumptionClass?.toUpperCase() ?? null,
      currentAnnualCost: expense.yearlyAmount,
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
      const expenseAlternatives = results
        .map((result) => toAlternative(expense, result, reliableInput))
        .filter((offer): offer is AlternativeOffer => Boolean(offer));
      alternatives.push(...expenseAlternatives);
      const conclusion = catalogConclusion(results);
      const hasCertifiedAlternative = expenseAlternatives.some(
        (offer) => offer.savingKind === "certified" && offer.estimatedYearlySaving > 0
      );
      if (hasCertifiedAlternative) {
        comparisonStates.push({
          expenseId: expense.id,
          status: "alternative_found",
          message: "Une alternative plus avantageuse a été identifiée parmi les offres vérifiées.",
        });
      } else if (conclusion === "KEEP_CURRENT_CONTRACT") {
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
