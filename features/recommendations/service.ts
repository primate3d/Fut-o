import { ExpenseCategory, type Expense, type Recommendation } from "@/types";
import { formatCurrency } from "@/lib/utils";

export async function generateRecommendationsStub(
  _expenses: Expense[]
): Promise<Recommendation[]> {
  return [];
}

export type AlternativeOffer = {
  id: string;
  category: ExpenseCategory;
  provider: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  estimatedYearlySaving: number;
  reason: string;
  action: string;
};

type AlternativeTemplate = {
  provider: string;
  name: string;
  monthlyPrice: number;
  reason: string;
  action: string;
};

const alternativesByCategory: Partial<Record<ExpenseCategory, AlternativeTemplate[]>> = {
  [ExpenseCategory.ENERGY]: [
    {
      provider: "Energie Verte",
      name: "Offre electricite ajustee",
      monthlyPrice: 116,
      reason: "Tarif mensuel plus bas pour un foyer au profil comparable.",
      action: "Comparer les conditions et demander une estimation actualisee."
    },
    {
      provider: "Maison Energie",
      name: "Contrat heures utiles",
      monthlyPrice: 124,
      reason: "Option interessante si la consommation est concentree sur certains horaires.",
      action: "Verifier la compatibilite avec vos habitudes de consommation."
    }
  ],
  [ExpenseCategory.TELECOM]: [
    {
      provider: "Fibre Maison",
      name: "Box fibre essentielle",
      monthlyPrice: 29,
      reason: "Debit proche, tarif mensuel plus simple et sans options inutiles.",
      action: "Demander un alignement tarifaire a votre operateur actuel."
    },
    {
      provider: "Connect&Vous",
      name: "Internet foyer",
      monthlyPrice: 34,
      reason: "Offre adaptee aux usages courants du foyer.",
      action: "Comparer les frais de mise en service et la duree d'engagement."
    }
  ],
  [ExpenseCategory.INSURANCE]: [
    {
      provider: "Assur Habitat",
      name: "Formule habitation claire",
      monthlyPrice: 24,
      reason: "Garanties proches avec une cotisation plus basse.",
      action: "Comparer les franchises avant toute resiliation."
    },
    {
      provider: "Mutuelle Foyer",
      name: "Protection logement ajustee",
      monthlyPrice: 27,
      reason: "Contrat recentrage sur les garanties vraiment utiles.",
      action: "Demander une proposition a garanties equivalentes."
    }
  ],
  [ExpenseCategory.SUBSCRIPTIONS]: [
    {
      provider: "Services regroupes",
      name: "Pack essentiel foyer",
      monthlyPrice: 19,
      reason: "Regroupement possible de plusieurs services peu utilises.",
      action: "Lister les abonnements utiles avant de resilier."
    }
  ],
  [ExpenseCategory.BANKING]: [
    {
      provider: "Banque Simple",
      name: "Compte quotidien",
      monthlyPrice: 4,
      reason: "Frais fixes reduits pour les operations courantes.",
      action: "Demander le retrait des options bancaires inutiles."
    }
  ]
};

export function findAlternativeOffers(expenses: Expense[]): AlternativeOffer[] {
  return expenses
    .flatMap((expense) => {
      const templates = alternativesByCategory[expense.category] ?? [];

      return templates.map((template, index) => {
        const yearlyPrice = template.monthlyPrice * 12;
        const estimatedYearlySaving = Math.max(0, expense.yearlyAmount - yearlyPrice);

        return {
          id: `alternative_${expense.id}_${index}`,
          category: expense.category,
          provider: template.provider,
          name: template.name,
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
