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
  monthlyPrice: number;
  yearlyPrice: number;
  estimatedYearlySaving: number;
  reason: string;
  action: string;
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
  accessTechnology?: "fiber" | "adsl" | "unknown";
  tvMode?: "included_decoder" | "app_only" | "decoder_optional" | "none";
  comparableTvMonthlyPrice?: number;
  requiresBundle?: {
    category: string;
    provider: string;
  };
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
    // --- MOBILE ---
    {
      provider: "Prixtel",
      name: "Forfait flexible",
      url: "https://www.prixtel.com/",
      monthlyPrice: 5.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Le prix s'ajuste chaque mois à votre consommation réelle de data.",
      action: "Idéal si votre consommation internet varie beaucoup d'un mois à l'autre."
    },
    {
      provider: "Lebara",
      name: "Forfait sans engagement",
      url: "https://mobile.lebara.com/fr/fr/",
      monthlyPrice: 5.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Forfait utilisant le réseau Orange, souvent avec beaucoup de data à petit prix.",
      action: "Vérifier si l'absence de MMS (souvent non inclus) vous pose problème."
    },
    {
      provider: "Syma Mobile",
      name: "Le Neuf (5G)",
      url: "https://www.symamobile.com/",
      monthlyPrice: 9.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Très bonne offre 5G avec une large enveloppe data sur le réseau SFR.",
      action: "Vérifier la couverture réseau SFR dans votre région."
    },
    {
      provider: "La Poste Mobile",
      name: "Forfait SIM sans engagement",
      url: "https://www.lapostemobile.fr/",
      monthlyPrice: 10.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Alternative solide avec l'avantage de pouvoir se rendre en bureau de poste en cas de besoin.",
      action: "Comparer avec les offres 100% digitales si vous préférez un accompagnement."
    },
    {
      provider: "Free Mobile",
      name: "Forfait 2€ (ou 0€ abonnés Freebox)",
      url: "https://mobile.free.fr/",
      monthlyPrice: 2.00,
      subcategories: [ExpenseSubcategory.MOBILE],
      requiresBundle: { category: "INTERNET", provider: "free" },
      reason: "Imbattable pour les très petits besoins (peu d'appels, peu de data).",
      action: "Attention au hors-forfait si vous utilisez beaucoup internet."
    },
    {
      provider: "B&You",
      name: "Série Spéciale",
      url: "https://www.bouyguestelecom.fr/forfaits-mobiles/sans-engagement",
      monthlyPrice: 8.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Excellente couverture (Bouygues) et forfaits souvent riches en data pour moins de 10€.",
      action: "Comparer les promotions du moment."
    }
  ],
  [ExpenseCategory.INSURANCE]: [
    {
      provider: "Direct Assurance",
      name: "Assurance Auto/Habitation directe",
      url: "https://www.directassurance.fr/",
      monthlyPrice: 15,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Modèle 100% en ligne permettant de réduire les coûts de gestion.",
      action: "Comparer les franchises et les exclusions de garanties."
    },
    {
      provider: "Leocare",
      name: "Assurance 100% mobile",
      url: "https://leocare.eu/fr/",
      monthlyPrice: 12,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Gestion entièrement via l'application, tarifs très agressifs.",
      action: "Vérifier les avis sur la gestion des sinistres."
    },
    {
      provider: "L'olivier Assurance",
      name: "Formule Essentielle",
      url: "https://www.lolivier.fr/",
      monthlyPrice: 14,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Alternative économique avec un parcours client simplifié.",
      action: "Demander un devis en ajustant vos options réelles."
    },
    {
      provider: "Luko",
      name: "Assurance habitation connectée",
      url: "https://www.luko.eu/fr/",
      monthlyPrice: 10,
      subcategories: [ExpenseSubcategory.HOME_INSURANCE],
      reason: "Remboursement rapide et contrat transparent et solidaire.",
      action: "Idéal pour les petits appartements ou locataires."
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

export function findAlternativeOffers(expenses: Expense[]): AlternativeOffer[] {
  return expenses
    .flatMap((expense) => {
      const internetExpense = expense as InternetAwareExpense;
      const templates = (alternativesByCategory[expense.category] ?? [])
        .filter(
          (template) =>
          hasRequiredBundle(template, expenses) &&
          (!template.subcategories ||
            (expense.subcategory && template.subcategories.includes(expense.subcategory))) &&
          !(
            expense.subcategory === ExpenseSubcategory.INTERNET &&
            internetExpense.internetAccessTechnology === "adsl" &&
            template.accessTechnology === "fiber"
          )
        )
        .flatMap((template) => {
          if (expense.subcategory !== ExpenseSubcategory.INTERNET) {
            return [template];
          }

          const comparableTemplate = adaptInternetTemplateToDetectedServices(
            template,
            internetExpense
          );
          return comparableTemplate ? [comparableTemplate] : [];
        });

      return templates.flatMap((template, index) => {
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
            : [];

        return {
          id: `alternative_${expense.id}_${index}`,
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
            (cautionNotes.length ? " Confirmer les points a verifier avant toute demarche." : "")
        };
      });
    })

    .sort((a, b) => b.estimatedYearlySaving - a.estimatedYearlySaving)
    .slice(0, 8);
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
