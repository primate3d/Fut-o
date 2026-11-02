import { ExpenseSubcategory, type MockAnalysis } from "@/types";
import {
  findAlternativeOffers,
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import { loadPersistedMobileCatalog } from "./mobile-catalog";

export async function buildServerComparison(analysis: MockAnalysis, now = new Date()) {
  const catalog = await loadPersistedMobileCatalog(now);
  const alternatives = findAlternativeOffers(analysis.expenses, { mobileCatalog: catalog });
  const mobileExpenses = analysis.expenses.filter(
    (expense) => expense.subcategory === ExpenseSubcategory.MOBILE
  );
  const missingMobileData = mobileExpenses.some(
    (expense) =>
      !expense.mobileDataUnlimited &&
      typeof expense.mobileIncludedDataGB !== "number" &&
      typeof expense.mobileDataGB !== "number"
  );
  const mobileAlternatives = alternatives.filter(
    (offer) => offer.sourceExpenseId &&
      mobileExpenses.some((expense) => expense.id === offer.sourceExpenseId)
  );
  const comparisonMessage = mobileExpenses.length === 0
    ? null
    : catalog.status !== "fresh"
      ? "Le catalogue mobile vérifié est indisponible ou trop ancien. Aucune économie mobile n'est annoncée."
      : missingMobileData
        ? "Confirmez le volume de données inclus pour obtenir une comparaison mobile fiable."
        : mobileAlternatives.length === 0
          ? "Aucune offre mobile vérifiée, adaptée et moins chère n'est disponible pour ce contrat."
          : null;

  return { alternatives, catalog, comparisonMessage };
}

export function canReferenceOfferInLetter(offer: AlternativeOffer) {
  if (!offer.sourceExpenseId) return false;
  if (offer.savingKind === undefined) return isPrimaryAlternative(offer);
  return offer.savingKind === "certified" && isPrimaryAlternative(offer);
}
