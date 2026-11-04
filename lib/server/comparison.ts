import {
  ExpenseSubcategory,
  type ContractComparisonState,
  type MockAnalysis,
} from "@/types";
import {
  findAlternativeOffers,
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import type { MobileCatalog } from "@/features/recommendations/mobile-catalog";
import { loadPersistedMobileCatalog } from "./mobile-catalog";
import { buildEnabledCommercialComparisons } from "./multisector-comparison";

export function getMobileComparisonMessage(
  analysis: MockAnalysis,
  catalog: MobileCatalog,
  alternatives: AlternativeOffer[]
) {
  const mobileExpenses = analysis.expenses.filter(
    (expense) => expense.subcategory === ExpenseSubcategory.MOBILE
  );
  if (mobileExpenses.length === 0) return null;
  if (catalog.status === "stale") {
    return "Le catalogue mobile vérifié est trop ancien. La comparaison n'est pas concluante et aucune économie mobile n'est annoncée.";
  }
  if (catalog.status === "empty") {
    return "Le catalogue mobile vérifié est vide ou indisponible. La comparaison n'est pas concluante et aucune économie mobile n'est annoncée.";
  }

  const missingMobileData = mobileExpenses.some(
    (expense) =>
      !expense.mobileDataUnlimited &&
      typeof expense.mobileIncludedDataGB !== "number" &&
      typeof expense.mobileDataGB !== "number"
  );
  if (missingMobileData) {
    return "Confirmez le volume de données inclus pour obtenir une comparaison mobile fiable.";
  }

  const missingMinimum = mobileExpenses.some(
    (expense) =>
      expense.mobileAllowLowerDataOffers === true &&
      (typeof expense.mobileMinimumDataGB !== "number" ||
        !Number.isFinite(expense.mobileMinimumDataGB) ||
        expense.mobileMinimumDataGB <= 0)
  );
  if (missingMinimum) {
    return "Confirmez le volume minimum de données que vous acceptez avant d'examiner des forfaits moins généreux.";
  }

  const mobileExpenseIds = new Set(mobileExpenses.map((expense) => expense.id));
  const hasMobileAlternative = alternatives.some(
    (offer) => offer.sourceExpenseId && mobileExpenseIds.has(offer.sourceExpenseId)
  );
  return hasMobileAlternative
    ? null
    : "Votre forfait actuel reste compétitif. Parmi les offres vérifiées répondant à vos besoins, aucune alternative plus avantageuse n'a été identifiée. Nous vous recommandons de conserver votre forfait actuel.";
}

export async function buildServerComparison(analysis: MockAnalysis, now = new Date()) {
  const catalog = await loadPersistedMobileCatalog(now);
  // Legacy templates are not verified commercial catalogs. Keep this path
  // exclusively for the validated PostgreSQL-backed mobile catalog.
  const mobileExpenses = analysis.expenses.filter(
    (expense) => expense.subcategory === ExpenseSubcategory.MOBILE
  );
  const existingAlternatives = findAlternativeOffers(mobileExpenses, {
    mobileCatalog: catalog
  });
  const commercial = await buildEnabledCommercialComparisons(analysis, now);
  const alternatives = [
    ...existingAlternatives.filter((offer) => !offer.sourceExpenseId || !commercial.replacedExpenseIds.has(offer.sourceExpenseId)),
    ...commercial.alternatives,
  ];
  const mobileComparisonStates: ContractComparisonState[] = mobileExpenses.map((expense) => {
    if (catalog.status !== "fresh") {
      return {
        expenseId: expense.id,
        status: "unavailable",
        message: "La comparaison des offres n'est pas disponible actuellement.",
      };
    }
    if (
      !expense.mobileDataUnlimited &&
      typeof expense.mobileIncludedDataGB !== "number" &&
      typeof expense.mobileDataGB !== "number"
    ) {
      return {
        expenseId: expense.id,
        status: "missing_information",
        message: "Complétez les caractéristiques nécessaires pour comparer ce contrat.",
        missingFields: ["volume de données inclus"],
      };
    }
    if (
      expense.mobileAllowLowerDataOffers === true &&
      (typeof expense.mobileMinimumDataGB !== "number" || expense.mobileMinimumDataGB <= 0)
    ) {
      return {
        expenseId: expense.id,
        status: "missing_information",
        message: "Complétez les caractéristiques nécessaires pour comparer ce contrat.",
        missingFields: ["volume minimum acceptable"],
      };
    }
    const hasAlternative = alternatives.some(
      (offer) => offer.sourceExpenseId === expense.id && isPrimaryAlternative(offer)
    );
    return hasAlternative
      ? {
          expenseId: expense.id,
          status: "alternative_found",
          message: "Une alternative plus avantageuse a été identifiée parmi les offres vérifiées.",
        }
      : {
          expenseId: expense.id,
          status: "no_better_offer",
          message: "Aucune alternative plus avantageuse n'a été identifiée parmi les offres vérifiées.",
        };
  });
  const comparisonStates = [...mobileComparisonStates, ...commercial.comparisonStates];
  const comparisonMessage = [
    getMobileComparisonMessage(analysis, catalog, alternatives),
    ...commercial.messages,
  ].filter(Boolean).join(" ") || null;

  return {
    alternatives,
    catalog,
    commercialCatalogs: commercial.catalogs,
    comparisonMessage,
    comparisonStates,
  };
}

export function canReferenceOfferInLetter(offer: AlternativeOffer) {
  if (!offer.sourceExpenseId) return false;
  if (offer.savingKind === undefined) return isPrimaryAlternative(offer);
  return offer.savingKind === "certified" && isPrimaryAlternative(offer);
}
