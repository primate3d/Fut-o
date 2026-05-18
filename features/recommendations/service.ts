import {
  ExpenseCategory,
  ExpenseSubcategory,
  type Expense,
  type Recommendation
} from "@/types";
import { formatCurrency } from "@/lib/utils";
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

type AlternativeTemplate = {
  provider: string;
  name: string;
  url: string;
  monthlyPrice: number;
  subcategories?: Expense["subcategory"][];
  reason: string;
  action: string;
};

const alternativesByCategory: Partial<Record<ExpenseCategory, AlternativeTemplate[]>> = {
  [ExpenseCategory.ENERGY]: [
    {
      provider: "Mint Energie",
      name: "Offre électricité verte 100% connectée",
      url: "https://www.mint-energie.com/",
      monthlyPrice: 65,
      reason: "Fournisseur alternatif souvent moins cher que le tarif réglementé.",
      action: "Comparer le prix du kWh par rapport à votre contrat actuel."
    },
    {
      provider: "TotalEnergies",
      name: "Offre Heures Eco",
      url: "https://www.totalenergies.fr/",
      monthlyPrice: 70,
      reason: "Permet de réaliser des économies si vous consommez pendant les heures creuses.",
      action: "Vérifier la compatibilité avec vos habitudes de consommation."
    },
    {
      provider: "Alpiq",
      name: "Électricité ajustable",
      url: "https://particuliers.alpiq.fr/",
      monthlyPrice: 68,
      reason: "Offre modulable permettant de choisir la part d'énergie verte.",
      action: "Demander une simulation personnalisée basée sur vos factures passées."
    },
    {
      provider: "Octopus Energy",
      name: "Offre Éco-responsable",
      url: "https://www.octopusenergy.fr/",
      monthlyPrice: 66,
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
      monthlyPrice: 24.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      reason: "Offre fibre simple, sans engagement et souvent à prix fixe.",
      action: "Vérifier l'éligibilité fibre de votre logement."
    },
    {
      provider: "Sosh",
      name: "La Boîte Sosh",
      url: "https://shop.sosh.fr/box-internet",
      monthlyPrice: 25.99,
      subcategories: [ExpenseSubcategory.INTERNET],
      reason: "Réseau Orange avec une offre simplifiée sans TV incluse (en option).",
      action: "Idéal si vous n'avez pas besoin du décodeur TV traditionnel."
    },
    {
      provider: "Free",
      name: "Freebox Pop",
      url: "https://www.free.fr/freebox/",
      monthlyPrice: 29.99,
      subcategories: [ExpenseSubcategory.INTERNET],
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
      reason: "Modèle 100% en ligne permettant de réduire les coûts de gestion.",
      action: "Comparer les franchises et les exclusions de garanties."
    },
    {
      provider: "Leocare",
      name: "Assurance 100% mobile",
      url: "https://leocare.eu/fr/",
      monthlyPrice: 12,
      reason: "Gestion entièrement via l'application, tarifs très agressifs.",
      action: "Vérifier les avis sur la gestion des sinistres."
    },
    {
      provider: "L'olivier Assurance",
      name: "Formule Essentielle",
      url: "https://www.lolivier.fr/",
      monthlyPrice: 14,
      reason: "Alternative économique avec un parcours client simplifié.",
      action: "Demander un devis en ajustant vos options réelles."
    },
    {
      provider: "Luko",
      name: "Assurance habitation connectée",
      url: "https://www.luko.eu/fr/",
      monthlyPrice: 10,
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

export function findAlternativeOffers(expenses: Expense[]): AlternativeOffer[] {
  return expenses
    .flatMap((expense) => {
      const templates = (alternativesByCategory[expense.category] ?? []).filter(
        (template) =>
          !template.subcategories ||
          !expense.subcategory ||
          template.subcategories.includes(expense.subcategory)
      );

      return templates.map((template, index) => {
        const yearlyPrice = template.monthlyPrice * 12;
        const estimatedYearlySaving = Math.max(0, expense.yearlyAmount - yearlyPrice);

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
              ? `${template.reason} Ecart estime : ${formatCurrency(estimatedYearlySaving)} / an.`
              : template.reason,
          action: template.action
        };
      });
    })

    .sort((a, b) => b.estimatedYearlySaving - a.estimatedYearlySaving)
    .slice(0, 8);
}
