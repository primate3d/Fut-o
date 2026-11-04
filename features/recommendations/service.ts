import {
  ExpenseCategory,
  ExpenseSubcategory,
  type Expense,
  type Recommendation
} from "@/types";
import {
  BOX_PROFILES,
  MOBILE_PROFILES,
  type BoxProfile,
  type MobileProfile
} from "@/config/marketOffers";
import { getProviderBranding } from "@/lib/provider-branding";
import {
  getMobileCatalogOfferId,
  type MobileCatalog
} from "./mobile-catalog";
import type {
  ConditionalPrice,
  MobileOffer,
  PricingTier
} from "@/experiments/mobile-offers/types";

export async function generateRecommendationsStub(
  _expenses: Expense[]
): Promise<Recommendation[]> {
  return [];
}

export type AlternativeOffer = {
  id: string;
  category: ExpenseCategory;
  provider: string;
  logoUrl?: string;
  name: string;
  url: string;
  sourceUrl?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  estimatedYearlySaving: number;
  sourceExpenseId?: string;
  reason: string;
  action: string;
  comparisonKind?:
    | "equivalent"
    | "reduced_data"
    | "additional_commitment"
    | "requires_validation";
  savingKind?: "certified" | "temporary" | "recurring_only";
  recurringYearlySaving?: number;
  durableYearlySaving?: number;
  netFirstYearSaving?: number;
  publicMonthlyPrice?: number;
  promotionPrice?: number;
  promotionDurationMonths?: number;
  priceAfterPromotion?: number;
  knownEntryFees?: number;
  entryFeesKnown?: boolean;
  terminationFees?: number;
  commitmentMonths?: number;
  technology?: string;
  downloadMbps?: number;
  conditions?: string[];
  conditionalPrices?: ConditionalPrice[];
  verifiedAt?: string;
  priceRange?: { min: number; max: number };
  mobileDataLimitGB?: number;
  mobileDataUnlimited?: boolean;
  billingPrice?: number;
  billingPeriodDays?: number;
  autoRenewal?: boolean;
};

export type ConditionalSupportOffer = {
  id: string;
  provider: string;
  logoUrl?: string;
  name: string;
  url: string;
  monthlyPrice: number;
  estimatedYearlySaving: number;
  condition: string;
};

type AlternativeTemplate = {
  provider: string;
  name: string;
  url: string;
  monthlyPrice: number;
  subcategories?: Expense["subcategory"][];
  documentTypes?: Expense["documentType"][];
  accessTechnology?: "fiber" | "adsl" | "unknown";
  tvMode?: "included_decoder" | "app_only" | "decoder_optional" | "none";
  comparableTvMonthlyPrice?: number;
  requiresBundle?: {
    category: string;
    provider: string;
  };
  dataLimitGB?: number;
  dataUnlimited?: boolean;
  reason: string;
  action: string;
};

type InternetAwareExpense = Expense & {
  internetAccessTechnology?: "fiber" | "adsl" | "unknown";
  internetPromoDetected?: boolean;
  internetTvIncluded?: boolean;
  internetBundledMobile?: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatMobileData(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2
  }).format(value);
}

export function calculateAnnualSavings(
  currentMonthlyPrice: number,
  alternativePrice: number
): number {
  const savings = Math.round((currentMonthlyPrice - alternativePrice) * 12 * 100) / 100;
  return savings > 0 ? savings : 0;
}

export function classifyBoxProfile(currentHasTv: boolean): BoxProfile | undefined {
  return BOX_PROFILES.find((profile) => profile.hasTv === currentHasTv);
}

export function classifyMobileProfile(currentDataGB: number): MobileProfile | undefined {
  return MOBILE_PROFILES.find(
    (profile) => currentDataGB >= profile.minData && currentDataGB <= profile.maxData
  );
}

export function isPrimaryAlternative(offer: AlternativeOffer) {
  return (
    offer.comparisonKind !== "reduced_data" &&
    offer.comparisonKind !== "additional_commitment" &&
    offer.comparisonKind !== "requires_validation" &&
    offer.savingKind !== "temporary"
  );
}

const alternativesByCategory: Partial<Record<ExpenseCategory, AlternativeTemplate[]>> = {
  [ExpenseCategory.ENERGY]: [
    {
      provider: "Mint Energie",
      name: "Offre électricité verte 100% connectée",
      url: "https://www.mint-energie.com/",
      monthlyPrice: 65,
      subcategories: [ExpenseSubcategory.ELECTRICITY],
      reason: "Fournisseur alternatif souvent moins cher que le tarif réglementé.",
      action: "Comparer le prix du kWh par rapport à votre contrat actuel."
    },
    {
      provider: "TotalEnergies",
      name: "Offre Heures Eco",
      url: "https://www.totalenergies.fr/",
      monthlyPrice: 70,
      subcategories: [ExpenseSubcategory.ELECTRICITY],
      reason: "Permet de réaliser des économies si vous consommez pendant les heures creuses.",
      action: "Vérifier la compatibilité avec vos habitudes de consommation."
    },
    {
      provider: "Alpiq",
      name: "Électricité ajustable",
      url: "https://particuliers.alpiq.fr/",
      monthlyPrice: 68,
      subcategories: [ExpenseSubcategory.ELECTRICITY],
      reason: "Offre modulable permettant de choisir la part d'énergie verte.",
      action: "Demander une simulation personnalisée basée sur vos factures passées."
    },
    {
      provider: "Octopus Energy",
      name: "Offre Éco-responsable",
      url: "https://www.octopusenergy.fr/",
      monthlyPrice: 66,
      subcategories: [ExpenseSubcategory.ELECTRICITY],
      reason: "Bonne alternative avec un service client reconnu et de l'énergie verte.",
      action: "Comparer les frais fixes d'abonnement mensuels."
    },
    {
      provider: "Engie",
      name: "Passerelle Gaz - estimation indicative",
      url: "https://particuliers.engie.fr/gaz-naturel.html",
      monthlyPrice: 65,
      subcategories: [ExpenseSubcategory.GAS],
      reason:
        "Référence de comparaison gaz : le prix réel dépend de votre consommation, de votre zone tarifaire et des taxes.",
      action: "Demander une estimation TTC personnalisée avant tout changement."
    },
    {
      provider: "TotalEnergies",
      name: "Verte Fixe Gaz - estimation indicative",
      url: "https://www.totalenergies.fr/particuliers/gaz/offres-de-gaz/offre-verte-fixe-gaz",
      monthlyPrice: 68,
      subcategories: [ExpenseSubcategory.GAS],
      reason:
        "Référence de comparaison gaz avec prix HT fixe un an ; le budget TTC dépend de la consommation et de la zone.",
      action: "Consulter la grille et obtenir une estimation TTC adaptée au logement."
    }
  ],
  [ExpenseCategory.TELECOM]: [
    // --- INTERNET ---
    {
      provider: "RED by SFR",
      name: "La RED Box (Fibre)",
      url: "https://www.red-by-sfr.fr/offre-internet/",
      monthlyPrice: 22.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      accessTechnology: "fiber",
      tvMode: "decoder_optional",
      comparableTvMonthlyPrice: 25.99,
      reason: "Offre fibre sans engagement avec TV via application ; décodeur TV disponible en option.",
      action: "Vérifier l'éligibilité fibre et le besoin d'un décodeur TV."
    },
    {
      provider: "Sosh",
      name: "La Boîte Sosh",
      url: "https://shop.sosh.fr/box-internet",
      monthlyPrice: 24.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      accessTechnology: "unknown",
      tvMode: "decoder_optional",
      comparableTvMonthlyPrice: 29.99,
      reason: "Réseau Orange avec une offre simplifiée sans TV incluse (en option).",
      action: "Idéal si vous n'avez pas besoin du décodeur TV traditionnel."
    },
    {
      provider: "Bouygues Telecom",
      name: "B&YOU Pure fibre",
      url: "https://www.bouyguestelecom.fr/offres-internet/sans-engagement",
      monthlyPrice: 24.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      accessTechnology: "fiber",
      tvMode: "none",
      reason: "Offre fibre sans engagement avec un prix durable, sans service TV inclus.",
      action: "Vérifier vos besoins TV et l'éligibilité fibre de votre logement."
    },
    {
      provider: "Free",
      name: "Freebox Pop",
      url: "https://www.free.fr/freebox/",
      monthlyPrice: 29.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      accessTechnology: "fiber",
      tvMode: "included_decoder",
      reason: "Débit ultra-rapide et services inclus très compétitifs pour la première année.",
      action: "Vérifier le prix hors promotion après la 1ère année."
    },
  ],
  [ExpenseCategory.INSURANCE]: [
    {
      provider: "Direct Assurance",
      name: "Assurance habitation",
      url: "https://www.direct-assurance.fr/nos-assurances/assurance-habitation",
      monthlyPrice: 15,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Modèle 100% en ligne permettant de réduire les coûts de gestion.",
      action: "Comparer les franchises et les exclusions de garanties."
    },
    {
      provider: "Leocare",
      name: "Assurance 100% mobile",
      url: "https://leocare.eu/fr/assurance-habitation/",
      monthlyPrice: 12,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Gestion entièrement via l'application, tarifs très agressifs.",
      action: "Vérifier les avis sur la gestion des sinistres."
    },
    {
      provider: "L'olivier Assurance",
      name: "Formule Essentielle",
      url: "https://www.lolivier.fr/assurance-habitation",
      monthlyPrice: 14,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Alternative économique avec un parcours client simplifié.",
      action: "Demander un devis en ajustant vos options réelles."
    },
    {
      provider: "Luko",
      name: "Assurance habitation connectée",
      url: "https://www.fr.luko.eu/assurance/habitation",
      monthlyPrice: 10,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Remboursement rapide et contrat transparent et solidaire.",
      action: "Idéal pour les petits appartements ou locataires."
    },
    {
      provider: "Direct Assurance",
      name: "Auto Tiers - estimation indicative",
      url: "https://www.direct-assurance.fr/assurance-auto/devis-assurance-auto",
      monthlyPrice: 25,
      subcategories: [ExpenseSubcategory.OTHER],
      documentTypes: ["car_insurance"],
      reason:
        "Base de comparaison indicative pour une assurance auto au tiers ; le tarif final dépend du conducteur, du véhicule et des garanties.",
      action: "Réaliser un devis personnalisé avec les garanties équivalentes."
    },
    {
      provider: "Eurofil",
      name: "Auto Tous Risques - estimation indicative",
      url: "https://www.eurofil.com/assurances/assurance-auto.html",
      monthlyPrice: 39,
      subcategories: [ExpenseSubcategory.OTHER],
      documentTypes: ["car_insurance"],
      reason:
        "Base de comparaison indicative pour une formule auto tous risques ; le prix final dépend du profil et du véhicule.",
      action: "Comparer les franchises, garanties et exclusions sur devis."
    },
    {
      provider: "AMV",
      name: "Moto Tiers - estimation indicative",
      url: "https://www.amv.fr/assurance/moto/",
      monthlyPrice: 15,
      subcategories: [ExpenseSubcategory.TWO_WHEELER_INSURANCE],
      reason:
        "Base de comparaison indicative pour un deux-roues au tiers ; le tarif final dépend de la moto et de l'assuré.",
      action: "Demander un devis avec des garanties comparables."
    },
    {
      provider: "Club 14",
      name: "Moto Confort - estimation indicative",
      url: "https://www.club14.com/",
      monthlyPrice: 29,
      subcategories: [ExpenseSubcategory.TWO_WHEELER_INSURANCE],
      reason:
        "Base de comparaison indicative pour une protection deux-roues renforcée ; le tarif final nécessite un devis.",
      action: "Vérifier franchises, assistance et protection du conducteur."
    }
  ],
  [ExpenseCategory.SUBSCRIPTIONS]: [
    {
      provider: "Spliiit",
      name: "Partage d'abonnements",
      url: "https://www.spliiit.com/",
      monthlyPrice: 5,
      reason: "Partager les frais de vos abonnements (SVOD, musique) avec d'autres utilisateurs légalement.",
      action: "Vérifier les conditions d'utilisation de vos plateformes."
    }
  ],
  [ExpenseCategory.BANKING]: [
    {
      provider: "BoursoBank",
      name: "Compte Ultim",
      url: "https://www.boursobank.com/",
      monthlyPrice: 0,
      reason: "Banque en ligne gratuite sous condition d'utilisation de la carte.",
      action: "Vérifier que vous réalisez au moins une opération par mois."
    },
    {
      provider: "Fortuneo",
      name: "Compte Fosfo",
      url: "https://www.fortuneo.fr/",
      monthlyPrice: 0,
      reason: "Zéro frais à l'étranger et carte gratuite (sous condition d'utilisation).",
      action: "Idéal pour voyager sans frais bancaires."
    },
    {
      provider: "Monabanq",
      name: "Compte Pratiq+",
      url: "https://www.monabanq.com/",
      monthlyPrice: 3,
      reason: "Accessible sans conditions de revenus, avec un excellent service client.",
      action: "Comparer les frais avec les banques 100% gratuites."
    }
  ]
};

function normalizeBundleProvider(provider: string) {
  return provider.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasRequiredBundle(template: AlternativeTemplate, expenses: Expense[]) {
  if (!template.requiresBundle) return true;

  const requiredCategory = template.requiresBundle.category.toLowerCase();
  const requiredProvider = normalizeBundleProvider(template.requiresBundle.provider);

  return expenses.some(
    (expense) =>
      expense.category.toLowerCase() === requiredCategory &&
      normalizeBundleProvider(expense.provider).includes(requiredProvider)
  );
}

function adaptInternetTemplateToDetectedServices(
  template: AlternativeTemplate,
  expense: InternetAwareExpense
): AlternativeTemplate | undefined {
  if (!expense.internetTvIncluded) return template;

  if (template.tvMode === "none") {
    return undefined;
  }

  if (template.comparableTvMonthlyPrice) {
    return {
      ...template,
      name: `${template.name} + décodeur TV`,
      monthlyPrice: template.comparableTvMonthlyPrice,
      reason: `${template.reason} Prix comparé avec l'option décodeur TV car un service TV est détecté sur votre facture.`
    };
  }

  return template;
}

type AlternativeSearchOptions = {
  mobileCatalog?: MobileCatalog;
};

type MobilePrice = {
  monthlyPrice: number;
  publicMonthlyPrice: number;
  durableMonthlyPrice: number;
  firstYearRecurringCost: number;
  billingPrice?: number;
  billingPeriodDays?: number;
  promotionPrice?: number;
  promotionDurationMonths?: number;
  priceAfterPromotion?: number;
  priceRange?: { min: number; max: number };
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const MOBILE_MIN_MEANINGFUL_MONTHLY_SAVING = 3;
const MOBILE_MIN_MEANINGFUL_YEARLY_SAVING =
  MOBILE_MIN_MEANINGFUL_MONTHLY_SAVING * 12;

function billingCyclesPerYear(offer: MobileOffer) {
  return offer.billingPeriodDays ? 365 / offer.billingPeriodDays : 12;
}

function monthlyEquivalent(price: number, offer: MobileOffer) {
  return roundMoney(price * billingCyclesPerYear(offer) / 12);
}

export const MOBILE_CONSUMPTION_SAFETY_MARGIN = 1.2;

export function getMobileComparisonMinimumDataGB(expense: Expense) {
  if (!expense.mobileAllowLowerDataOffers) return null;
  if (
    typeof expense.mobileMinimumDataGB !== "number" ||
    !Number.isFinite(expense.mobileMinimumDataGB) ||
    expense.mobileMinimumDataGB <= 0
  ) {
    return null;
  }

  const consumptionFloor =
    typeof expense.mobileConsumedDataGB === "number" &&
    Number.isFinite(expense.mobileConsumedDataGB) &&
    expense.mobileConsumedDataGB >= 0
      ? Math.ceil(expense.mobileConsumedDataGB * MOBILE_CONSUMPTION_SAFETY_MARGIN)
      : 0;
  return Math.max(expense.mobileMinimumDataGB, consumptionFloor);
}

function isConditionalPromotion(offer: MobileOffer) {
  return offer.promotionPrice !== null && offer.conditionalPrices.some(
    (conditional) =>
      conditional.monthlyPrice === offer.promotionPrice &&
      conditional.durationMonths === offer.promotionDuration
  );
}

function tierForConsumption(tiers: PricingTier[], consumption: number) {
  const sorted = [...tiers].sort((left, right) => left.upToDataGB - right.upToDataGB);
  return sorted.find((tier, index) =>
    consumption <= tier.upToDataGB &&
    (index === 0 ? consumption >= tier.fromDataGB : consumption > tier.fromDataGB)
  );
}

function mobilePrice(offer: MobileOffer, expense: Expense): MobilePrice | null {
  if (offer.pricingTiers.length > 0) {
    const prices = offer.pricingTiers.map((tier) => monthlyEquivalent(tier.monthlyPrice, offer));
    const selectedTier = typeof expense.mobileConsumedDataGB === "number"
      ? tierForConsumption(offer.pricingTiers, expense.mobileConsumedDataGB)
      : [...offer.pricingTiers].sort(
          (left, right) => right.monthlyPrice - left.monthlyPrice
        )[0];
    if (!selectedTier) return null;
    const selectedMonthlyPrice = monthlyEquivalent(selectedTier.monthlyPrice, offer);
    return {
      monthlyPrice: selectedMonthlyPrice,
      publicMonthlyPrice: selectedMonthlyPrice,
      durableMonthlyPrice: selectedMonthlyPrice,
      firstYearRecurringCost: roundMoney(
        selectedTier.monthlyPrice * billingCyclesPerYear(offer)
      ),
      billingPrice: selectedTier.monthlyPrice,
      ...(offer.billingPeriodDays ? { billingPeriodDays: offer.billingPeriodDays } : {}),
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices)
      }
    };
  }

  if (offer.monthlyPrice === null) return null;
  const publicPromotion =
    offer.promotionPrice !== null &&
    offer.promotionDuration !== null &&
    offer.priceAfterPromotion !== null &&
    !isConditionalPromotion(offer);
  if (!publicPromotion) {
    const equivalentMonthlyPrice = monthlyEquivalent(offer.monthlyPrice, offer);
    return {
      monthlyPrice: equivalentMonthlyPrice,
      publicMonthlyPrice: equivalentMonthlyPrice,
      durableMonthlyPrice: equivalentMonthlyPrice,
      firstYearRecurringCost: roundMoney(
        offer.monthlyPrice * billingCyclesPerYear(offer)
      ),
      billingPrice: offer.monthlyPrice,
      ...(offer.billingPeriodDays ? { billingPeriodDays: offer.billingPeriodDays } : {})
    };
  }

  const promotionMonths = Math.min(12, offer.promotionDuration!);
  const firstYearRecurringCost =
    offer.promotionPrice! * promotionMonths +
    offer.priceAfterPromotion! * (12 - promotionMonths);
  return {
    monthlyPrice: offer.promotionPrice!,
    publicMonthlyPrice: offer.monthlyPrice,
    durableMonthlyPrice: offer.priceAfterPromotion!,
    firstYearRecurringCost: roundMoney(firstYearRecurringCost),
    promotionPrice: offer.promotionPrice!,
    promotionDurationMonths: offer.promotionDuration!,
    priceAfterPromotion: offer.priceAfterPromotion!
  };
}

function mobileComparisonKind(
  expense: Expense,
  offer: MobileOffer
): AlternativeOffer["comparisonKind"] | null {
  const currentIncluded = typeof expense.mobileIncludedDataGB === "number"
    ? expense.mobileIncludedDataGB
    : expense.mobileDataGB;
  const offerIncluded = offer.includedDataGB;
  let reducedData = false;

  if (expense.mobileDataUnlimited) {
    reducedData = offer.unlimitedData !== true;
  } else {
    if (typeof currentIncluded !== "number") return null;
    if (offer.unlimitedData !== true) {
      if (typeof offerIncluded !== "number") return null;
      reducedData = offerIncluded < currentIncluded;
    }
  }

  if (reducedData) {
    const minimumDataGB = getMobileComparisonMinimumDataGB(expense);
    if (
      minimumDataGB === null ||
      offerIncluded === null ||
      offerIncluded < minimumDataGB
    ) {
      return null;
    }
    return "reduced_data";
  }

  if ((offer.commitmentMonths ?? 0) > 0) {
    return "additional_commitment";
  }

  if (
    typeof expense.mobileRoamingIncludedDataGB === "number" &&
    (offer.euDataGB === null || offer.euDataGB < expense.mobileRoamingIncludedDataGB)
  ) {
    return "requires_validation";
  }

  return "equivalent";
}

function mobileReason(
  offer: MobileOffer,
  expense: Expense,
  kind: NonNullable<AlternativeOffer["comparisonKind"]>,
  price: MobilePrice,
  entryFeesKnown: boolean
) {
  const notes = [
    offer.unlimitedData
      ? "Données mobiles illimitées."
      : `${formatMobileData(offer.includedDataGB ?? 0)} Go inclus.`,
    offer.technology ? `Réseau ${offer.technology}.` : null,
    kind === "reduced_data"
      ? `Volume inférieur : compromis accepté par l'utilisateur, jamais traité comme équivalent. Seuil minimum retenu : ${formatMobileData(getMobileComparisonMinimumDataGB(expense) ?? 0)} Go.`
      : null,
    kind === "additional_commitment"
      ? `Engagement de ${offer.commitmentMonths} mois : validation nécessaire.`
      : null,
    kind === "requires_validation"
      ? `Enveloppe Europe insuffisante ou non vérifiée par rapport aux ${formatMobileData(expense.mobileRoamingIncludedDataGB ?? 0)} Go actuels.`
      : null,
    price.promotionPrice !== undefined
      ? `Promotion à ${formatCurrency(price.promotionPrice)} pendant ${price.promotionDurationMonths} mois, puis ${formatCurrency(price.priceAfterPromotion ?? price.publicMonthlyPrice)}.`
      : null,
    price.priceRange
      ? `Tarif évolutif de ${formatCurrency(price.priceRange.min)} à ${formatCurrency(price.priceRange.max)} selon la consommation.`
      : null,
    price.billingPeriodDays
      ? `Tarif facturé ${formatCurrency(price.billingPrice ?? price.monthlyPrice)} tous les ${price.billingPeriodDays} jours, soit ${formatCurrency(price.monthlyPrice)} par mois civil en moyenne.`
      : null,
    offer.autoRenewal === true
      ? "Renouvellement automatique prévu par l'opérateur; vérifier ses modalités de désactivation."
      : null,
    !entryFeesKnown
      ? "Des frais de souscription ou de résiliation peuvent s'appliquer et réduire les économies estimées."
      : null
  ].filter((note): note is string => Boolean(note));
  return notes.join(" ");
}

function mobileAlternativesForExpense(
  expense: Expense,
  catalog: MobileCatalog
): AlternativeOffer[] {
  if (
    expense.mobileRecurringAmountNeedsConfirmation ||
    catalog.status !== "fresh"
  ) {
    return [];
  }

  const currentYearlyCost = roundMoney(expense.monthlyAmount * 12);
  const offers = catalog.offers.flatMap((offer) => {
    const comparisonKind = mobileComparisonKind(expense, offer);
    const price = mobilePrice(offer, expense);
    if (!comparisonKind || !price) return [];

    const knownEntryFees = roundMoney(
      (offer.activationFees ?? 0) + (offer.simFees ?? 0)
    );
    const entryFeesKnown =
      offer.activationFees !== null && offer.simFees !== null;
    const firstYearCost = roundMoney(price.firstYearRecurringCost + knownEntryFees);
    const tariffFirstYearSaving = Math.max(
      0,
      roundMoney(currentYearlyCost - price.firstYearRecurringCost)
    );
    const netFirstYearSaving = entryFeesKnown
      ? Math.max(0, roundMoney(currentYearlyCost - firstYearCost))
      : undefined;
    const recurringYearlySaving = Math.max(
      0,
      roundMoney((expense.monthlyAmount - price.durableMonthlyPrice) * 12)
    );
    const temporary =
      price.promotionPrice !== undefined &&
      netFirstYearSaving !== undefined &&
      netFirstYearSaving > 0 &&
      recurringYearlySaving === 0;
    const savingKind: NonNullable<AlternativeOffer["savingKind"]> = temporary
      ? "temporary"
      : entryFeesKnown && netFirstYearSaving !== undefined
        ? "certified"
        : "recurring_only";

    if ((netFirstYearSaving ?? 0) <= 0 && recurringYearlySaving <= 0) {
      return [];
    }

    const estimatedYearlySaving = savingKind === "certified"
      ? netFirstYearSaving ?? 0
      : savingKind === "recurring_only"
        ? tariffFirstYearSaving
        : 0;
    const idToken = offer.catalogId ?? getMobileCatalogOfferId(offer);

    return [{
      id: `alternative_${expense.id}_${idToken}`,
      sourceExpenseId: expense.id,
      category: expense.category,
      provider: offer.provider,
      logoUrl: getProviderBranding(offer.provider).logoUrl,
      name: offer.offerName,
      url: offer.offerUrl ?? offer.sourceUrl,
      sourceUrl: offer.sourceUrl,
      monthlyPrice: price.monthlyPrice,
      publicMonthlyPrice: price.publicMonthlyPrice,
      yearlyPrice: firstYearCost,
      estimatedYearlySaving,
      recurringYearlySaving,
      ...(netFirstYearSaving !== undefined ? { netFirstYearSaving } : {}),
      reason: mobileReason(offer, expense, comparisonKind, price, entryFeesKnown),
      action: offer.offerUrl
        ? "Vérifier les conditions sur la source officielle avant toute souscription."
        : `Ouvrir la page officielle et rechercher l'offre « ${offer.offerName} » avant toute souscription.`,
      comparisonKind,
      savingKind,
      ...(price.promotionPrice !== undefined
        ? {
            promotionPrice: price.promotionPrice,
            promotionDurationMonths: price.promotionDurationMonths,
            priceAfterPromotion: price.priceAfterPromotion
          }
        : {}),
      knownEntryFees,
      entryFeesKnown,
      ...(typeof offer.terminationFees === "number"
        ? { terminationFees: offer.terminationFees }
        : {}),
      commitmentMonths: offer.commitmentMonths ?? undefined,
      technology: offer.technology ?? undefined,
      conditions: offer.conditions,
      conditionalPrices: offer.conditionalPrices,
      verifiedAt: offer.verifiedAt ?? undefined,
      ...(price.priceRange ? { priceRange: price.priceRange } : {}),
      ...(typeof offer.includedDataGB === "number"
        ? { mobileDataLimitGB: offer.includedDataGB }
        : {}),
      ...(offer.unlimitedData ? { mobileDataUnlimited: true } : {}),
      ...(price.billingPrice !== undefined ? { billingPrice: price.billingPrice } : {}),
      ...(price.billingPeriodDays !== undefined
        ? { billingPeriodDays: price.billingPeriodDays }
        : {}),
      ...(offer.autoRenewal !== null && offer.autoRenewal !== undefined
        ? { autoRenewal: offer.autoRenewal }
        : {})
    }];
  });

  const comparableYearlySaving = (offer: AlternativeOffer) =>
    offer.netFirstYearSaving ?? offer.estimatedYearlySaving ?? offer.recurringYearlySaving ?? 0;
  const compareEconomicInterest = (left: AlternativeOffer, right: AlternativeOffer) => {
    const comparableSavingDifference =
      comparableYearlySaving(right) - comparableYearlySaving(left);
    if (comparableSavingDifference !== 0) return comparableSavingDifference;

    const recurringSavingDifference =
      (right.recurringYearlySaving ?? 0) - (left.recurringYearlySaving ?? 0);
    if (recurringSavingDifference !== 0) return recurringSavingDifference;

    const leftIsPromotion = left.promotionPrice !== undefined;
    const rightIsPromotion = right.promotionPrice !== undefined;
    if (leftIsPromotion !== rightIsPromotion) return leftIsPromotion ? 1 : -1;

    if (left.mobileDataUnlimited !== right.mobileDataUnlimited) {
      return right.mobileDataUnlimited ? 1 : -1;
    }
    const dataDifference =
      (right.mobileDataLimitGB ?? 0) - (left.mobileDataLimitGB ?? 0);
    if (dataDifference !== 0) return dataDifference;

    const commitmentDifference =
      (left.commitmentMonths ?? 0) - (right.commitmentMonths ?? 0);
    if (commitmentDifference !== 0) return commitmentDifference;
    return left.id.localeCompare(right.id);
  };

  const isMeaningful = (offer: AlternativeOffer) =>
    comparableYearlySaving(offer) >= MOBILE_MIN_MEANINGFUL_YEARLY_SAVING;
  const isNearDuplicate = (left: AlternativeOffer, right: AlternativeOffer) => {
    if (left.provider !== right.provider) return false;
    if (left.mobileDataUnlimited !== right.mobileDataUnlimited) return false;
    const leftData = left.mobileDataLimitGB ?? 0;
    const rightData = right.mobileDataLimitGB ?? 0;
    const dataDifference = Math.abs(leftData - rightData);
    const similarData = dataDifference <= Math.max(20, Math.min(leftData, rightData) * 0.2);
    const savingDifference = Math.abs(
      (left.recurringYearlySaving ?? 0) - (right.recurringYearlySaving ?? 0)
    );
    return similarData && savingDifference <= 12;
  };
  const hasDistinctAdvantage = (
    candidate: AlternativeOffer,
    selected: AlternativeOffer[]
  ) => {
    if (candidate.mobileDataUnlimited && selected.every((offer) => !offer.mobileDataUnlimited)) {
      return true;
    }
    const bestSelectedData = Math.max(
      0,
      ...selected.map((offer) => offer.mobileDataLimitGB ?? 0)
    );
    if (
      (candidate.mobileDataLimitGB ?? 0) >= bestSelectedData + 50 &&
      (candidate.mobileDataLimitGB ?? 0) >= bestSelectedData * 1.5
    ) {
      return true;
    }
    return Boolean(
      candidate.technology?.includes("5G") &&
      selected.every((offer) => !offer.technology?.includes("5G"))
    );
  };
  const selectOffers = (candidates: AlternativeOffer[], max = 3) => {
    const selected: AlternativeOffer[] = [];
    for (const candidate of candidates) {
      if (selected.some((offer) => isNearDuplicate(candidate, offer))) continue;
      if (selected.length < 2 || (selected.length === 2 && hasDistinctAdvantage(candidate, selected))) {
        selected.push(candidate);
      }
      if (selected.length >= max) break;
    }
    return selected;
  };

  const sorted = offers.filter(isMeaningful).sort(compareEconomicInterest);
  const equivalent = selectOffers(sorted.filter(isPrimaryAlternative));
  const temporary = sorted.filter((offer) => offer.savingKind === "temporary").slice(0, 1);
  const compromises = selectOffers(sorted.filter(
    (offer) => !isPrimaryAlternative(offer) && offer.savingKind !== "temporary"
  ).sort(compareEconomicInterest), 2);
  return [...equivalent, ...temporary, ...compromises];
}

export function findAlternativeOffers(
  expenses: Expense[],
  options: AlternativeSearchOptions = {}
): AlternativeOffer[] {
  const mobileOffers = options.mobileCatalog
    ? expenses
        .filter((expense) => expense.subcategory === ExpenseSubcategory.MOBILE)
        .flatMap((expense) => mobileAlternativesForExpense(
          expense,
          options.mobileCatalog!
        ))
    : [];
  const offers = expenses
    .filter((expense) => expense.subcategory !== ExpenseSubcategory.MOBILE)
    .flatMap((expense) => {
      if (
        expense.subcategory === ExpenseSubcategory.MOBILE &&
        expense.mobileRecurringAmountNeedsConfirmation
      ) {
        return [];
      }

      const internetExpense = expense as InternetAwareExpense;
      const mobileIncludedDataGB =
        typeof expense.mobileIncludedDataGB === "number"
          ? expense.mobileIncludedDataGB
          : expense.mobileDataGB;
      const mobileProfile =
        expense.subcategory === ExpenseSubcategory.MOBILE &&
        typeof mobileIncludedDataGB === "number"
          ? classifyMobileProfile(mobileIncludedDataGB)
          : undefined;
      const templates = (alternativesByCategory[expense.category] ?? [])
        .map((template, templateIndex) => ({ template, templateIndex }))
        .filter(
          ({ template }) =>
          hasRequiredBundle(template, expenses) &&
          (!template.documentTypes ||
            (expense.documentType && template.documentTypes.includes(expense.documentType))) &&
          (!template.subcategories ||
            (expense.subcategory && template.subcategories.includes(expense.subcategory))) &&
          (expense.subcategory !== ExpenseSubcategory.MOBILE || (() => {
            if (expense.mobileDataUnlimited) {
              return template.dataUnlimited === true || expense.mobileAllowLowerDataOffers === true;
            }
            if (typeof mobileIncludedDataGB !== "number") return false;
            if (template.dataUnlimited) return true;
            if (typeof template.dataLimitGB !== "number") return false;
            if (template.dataLimitGB >= mobileIncludedDataGB) return true;
            if (!expense.mobileAllowLowerDataOffers) return false;
            return (
              typeof expense.mobileConsumedDataGB !== "number" ||
              template.dataLimitGB >= expense.mobileConsumedDataGB
            );
          })()) &&
          !(
            expense.subcategory === ExpenseSubcategory.INTERNET &&
            internetExpense.internetAccessTechnology === "adsl" &&
            template.accessTechnology === "fiber"
          )
        )
        .flatMap(({ template, templateIndex }) => {
          if (expense.subcategory !== ExpenseSubcategory.INTERNET) {
            return [{ template, templateIndex }];
          }

          const comparableTemplate = adaptInternetTemplateToDetectedServices(
            template,
            internetExpense
          );
          return comparableTemplate ? [{ template: comparableTemplate, templateIndex }] : [];
        });

      return templates.flatMap(({ template, templateIndex }) => {
        const isReducedMobileOffer =
          expense.subcategory === ExpenseSubcategory.MOBILE &&
          !template.dataUnlimited &&
          (expense.mobileDataUnlimited ||
            (typeof mobileIncludedDataGB === "number" &&
              typeof template.dataLimitGB === "number" &&
              template.dataLimitGB < mobileIncludedDataGB));
        const yearlyPrice = template.monthlyPrice * 12;
        const estimatedYearlySaving =
          expense.subcategory === ExpenseSubcategory.INTERNET ||
          expense.subcategory === ExpenseSubcategory.MOBILE
            ? calculateAnnualSavings(expense.monthlyAmount, template.monthlyPrice)
            : Math.max(0, expense.yearlyAmount - yearlyPrice);
        if (estimatedYearlySaving <= 0) {
          return [];
        }
        const cautionNotes =
          expense.subcategory === ExpenseSubcategory.INTERNET
            ? [
                internetExpense.internetPromoDetected
                  ? "Prix promotionnel detecte : comparer le tarif hors promotion."
                  : null,
                internetExpense.internetTvIncluded
                  ? "TV detectee : seules les offres conservant un service TV comparable sont classees."
                  : null,
                internetExpense.internetBundledMobile
                  ? "Offre groupee possible : separer box et mobile avant decision."
                  : null,
                internetExpense.internetAccessTechnology === "adsl"
                  ? "Ligne ADSL detectee : verifier les offres compatibles avec votre logement."
                  : null
              ].filter((note): note is string => Boolean(note))
            : isReducedMobileOffer && typeof template.dataLimitGB === "number"
            ? [
                `Volume reduit : ${formatMobileData(template.dataLimitGB)} Go au lieu de ${
                  expense.mobileDataUnlimited
                    ? "votre forfait illimite"
                    : `${formatMobileData(mobileIncludedDataGB ?? 0)} Go inclus`
                }. Il s'agit d'un compromis, pas d'une offre equivalente.${
                  typeof expense.mobileConsumedDataGB === "number"
                    ? ` Consommation observee : ${formatMobileData(expense.mobileConsumedDataGB)} Go.`
                    : ""
                }`
              ]
            : expense.subcategory === ExpenseSubcategory.MOBILE &&
                (expense.mobileDataUnlimited || typeof mobileIncludedDataGB === "number") &&
                typeof template.dataLimitGB === "number"
            ? [
                `Volume equivalent ou superieur a ${formatMobileData(mobileIncludedDataGB ?? 0)} Go${
                  mobileProfile ? ` (${mobileProfile.label})` : ""
                }.`
              ]
            : [];

        return {
          id: `alternative_${expense.id}_${templateIndex}`,
          sourceExpenseId: expense.id,
          category: expense.category,
          provider: template.provider,
          logoUrl: getProviderBranding(template.provider).logoUrl,
          name: template.name,
          url: template.url,
          monthlyPrice: template.monthlyPrice,
          yearlyPrice,
          estimatedYearlySaving,
          reason:
            estimatedYearlySaving > 0
              ? `${template.reason} Ecart estime : ${formatCurrency(estimatedYearlySaving)} / an.${cautionNotes.length ? ` ${cautionNotes.join(" ")}` : ""}`
              : `${template.reason}${cautionNotes.length ? ` ${cautionNotes.join(" ")}` : ""}`,
          action:
            template.action +
            (cautionNotes.length ? " Confirmer les points a verifier avant toute demarche." : ""),
          comparisonKind: isReducedMobileOffer
            ? ("reduced_data" as const)
            : ("equivalent" as const),
          ...(typeof template.dataLimitGB === "number"
            ? { mobileDataLimitGB: template.dataLimitGB }
            : {}),
          ...(template.dataUnlimited ? { mobileDataUnlimited: true } : {})
        };
      });
    })

    .sort((a, b) => b.estimatedYearlySaving - a.estimatedYearlySaving);

  const primaryOffers = offers.filter(isPrimaryAlternative).slice(0, 8);
  const reducedDataOffers = offers
    .filter((offer) => offer.comparisonKind === "reduced_data")
    .slice(0, 8);
  return [...primaryOffers, ...reducedDataOffers, ...mobileOffers];
}

export function findConditionalInternetSupportOffers(
  expenses: Expense[]
): ConditionalSupportOffer[] {
  const internetExpense = expenses.find(
    (expense) => expense.subcategory === ExpenseSubcategory.INTERNET
  );
  if (!internetExpense) return [];

  const monthlyPrice = 15.99;
  const estimatedYearlySaving = calculateAnnualSavings(
    internetExpense.monthlyAmount,
    monthlyPrice
  );
  if (estimatedYearlySaving <= 0) return [];

  return [
    {
      id: `conditional_orange_${internetExpense.id}`,
      provider: "Orange",
      logoUrl: getProviderBranding("Orange").logoUrl,
      name: "Coup de pouce Internet",
      url: "https://boutique.orange.fr/informations/offre-sociale/",
      monthlyPrice,
      estimatedYearlySaving,
      condition:
        "Offre sociale soumise à éligibilité. Elle est informative et ne sera pas sélectionnée automatiquement pour vos démarches."
    }
  ];
}
