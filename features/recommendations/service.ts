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
      provider: "Energie Verte",
      name: "Offre electricite ajustee",
      url: "https://www.energie-info.fr/comparateurs-et-outils/",
      monthlyPrice: 116,
      reason: "Tarif mensuel plus bas pour un foyer au profil comparable.",
      action: "Comparer les conditions et demander une estimation actualisee."
    },
    {
      provider: "Maison Energie",
      name: "Contrat heures utiles",
      url: "https://www.energie-info.fr/comparateurs-et-outils/",
      monthlyPrice: 124,
      reason: "Option interessante si la consommation est concentree sur certains horaires.",
      action: "Verifier la compatibilite avec vos habitudes de consommation."
    }
  ],
  [ExpenseCategory.TELECOM]: [
    {
      provider: "Fibre Maison",
      name: "Box fibre essentielle",
      url: "https://www.ariase.com/box/comparatif",
      monthlyPrice: 29,
      subcategories: [ExpenseSubcategory.INTERNET],
      reason: "Debit proche, tarif mensuel plus simple et sans options inutiles.",
      action: "Demander un alignement tarifaire a votre operateur actuel."
    },
    {
      provider: "Connect&Vous",
      name: "Internet foyer",
      url: "https://www.ariase.com/box/comparatif",
      monthlyPrice: 34,
      subcategories: [ExpenseSubcategory.INTERNET],
      reason: "Offre adaptee aux usages courants du foyer.",
      action: "Comparer les frais de mise en service et la duree d'engagement."
    },
    {
      provider: "Free Mobile",
      name: "Forfait 5G sans engagement",
      url: "https://mobile.free.fr/",
      monthlyPrice: 9.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Forfait mobile sans engagement souvent plus competitif pour un usage courant.",
      action: "Comparer l'enveloppe data, la couverture reseau et les conditions hors promotion."
    },
    {
      provider: "B&You",
      name: "Serie mobile sans engagement",
      url: "https://www.bouyguestelecom.fr/forfaits-mobiles/sans-engagement",
      monthlyPrice: 12.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Prix mensuel inferieur au forfait detecte, a verifier selon la data necessaire.",
      action: "Comparer la quantite de data, les appels inclus et les frais de carte SIM."
    },
    {
      provider: "Sosh",
      name: "Forfait mobile ajustable",
      url: "https://shop.sosh.fr/mobile/forfaits-mobiles",
      monthlyPrice: 15.99,
      subcategories: [ExpenseSubcategory.MOBILE],
      reason: "Alternative sans engagement permettant de garder une couverture reseau large.",
      action: "Verifier le prix apres promotion et l'adequation avec vos usages reels."
    }
  ],
  [ExpenseCategory.INSURANCE]: [
    {
      provider: "Assur Habitat",
      name: "Formule habitation claire",
      url: "https://www.assurland.com/assurance-habitation.html",
      monthlyPrice: 24,
      reason: "Garanties proches avec une cotisation plus basse.",
      action: "Comparer les franchises avant toute resiliation."
    },
    {
      provider: "Mutuelle Foyer",
      name: "Protection logement ajustee",
      url: "https://www.assurland.com/assurance-habitation.html",
      monthlyPrice: 27,
      reason: "Contrat recentrage sur les garanties vraiment utiles.",
      action: "Demander une proposition a garanties equivalentes."
    }
  ],
  [ExpenseCategory.SUBSCRIPTIONS]: [
    {
      provider: "Services regroupes",
      name: "Pack essentiel foyer",
      url: "https://www.google.com/search?q=comparer+abonnements+foyer",
      monthlyPrice: 19,
      reason: "Regroupement possible de plusieurs services peu utilises.",
      action: "Lister les abonnements utiles avant de resilier."
    }
  ],
  [ExpenseCategory.BANKING]: [
    {
      provider: "Banque Simple",
      name: "Compte quotidien",
      url: "https://www.tarifs-bancaires.gouv.fr/",
      monthlyPrice: 4,
      reason: "Frais fixes reduits pour les operations courantes.",
      action: "Demander le retrait des options bancaires inutiles."
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
    .filter((offer) => offer.estimatedYearlySaving > 0)
    .sort((a, b) => b.estimatedYearlySaving - a.estimatedYearlySaving)
    .slice(0, 8);
}
