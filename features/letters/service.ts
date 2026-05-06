import { formatCurrency } from "@/lib/utils";
import type {
  Expense,
  GeneratedLetter,
  GeneratedLetterType,
  LetterPersonalization,
  LetterTemplate,
  MockAnalysis,
  Recommendation
} from "@/types";

export async function generateLetterDraftStub(
  _template: LetterTemplate,
  _recommendation?: Recommendation
): Promise<string> {
  return "";
}

const defaultPersonalization: LetterPersonalization = {
  firstName: "[Prenom]",
  lastName: "[Nom]",
  address: "[Adresse]",
  customerNumber: "[Numero client]",
  email: "[Email]"
};

const providerAddresses: Record<string, string> = {
  EDF: "Service Client EDF\nTSA 21941\n62978 ARRAS CEDEX 9",
  Engie: "ENGIE Service Clients\nTSA 87 494\n76934 ROUEN CEDEX 09",
  Orange: "Orange Service Clients\nTSA 10001\n59878 LILLE CEDEX 9",
  SFR: "SFR Service Client\nTSA 10101\n69947 LYON CEDEX 20",
  Free: "Free Service Abonne\n75371 PARIS CEDEX 08",
  "Bouygues Telecom": "Bouygues Telecom\nService Clients\n60436 NOAILLES CEDEX",
  Netflix: "Netflix International B.V.\nKarperstraat 8-10\n1075 KZ Amsterdam\nPays-Bas",
  "Banque Populaire": "Service Relation Clientele\nBP 1234\n75001 PARIS",
  "Mutuelle Habitat": "Service Clients Assurance\n45 Avenue de la Republique\n69000 LYON"
};

function getProviderAddress(provider: string) {
  return (
    providerAddresses[provider] ||
    `Service Client ${provider}\n[Adresse du prestataire a completer]\n[Code Postal et Ville]`
  );
}

function getPotentialSavingForExpense(analysis: MockAnalysis, expense: Expense) {
  return analysis.recommendations
    .filter((recommendation) => recommendation.category === expense.category)
    .reduce((total, recommendation) => total + recommendation.potentialSaving, 0);
}

function buildBodyTemplate(params: {
  provider: string;
  monthlyAmount: number;
  yearlyAmount: number;
  potentialSaving: number;
  reason: string;
  request: string;
}) {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return [
    "{{firstName}} {{lastName}}",
    "{{address}}",
    "{{email}}",
    "",
    "                                        A l'attention du :",
    `                                        ${getProviderAddress(params.provider)
      .split("\n")
      .join("\n                                        ")}`,
    "",
    `                                        Fait le ${today}`,
    "",
    "Objet : {{subject}}",
    "Reference client : {{customerNumber}}",
    "",
    "Madame, Monsieur,",
    "",
    `Client(e) chez vous sous la reference {{customerNumber}}, je vous contacte au sujet du contrat indique dans mes documents, dont le montant mensuel est estime a ${formatCurrency(
      params.monthlyAmount
    )}, soit environ ${formatCurrency(params.yearlyAmount)} par an.`,
    "",
    params.reason,
    "",
    params.request,
    "",
    `La piste d'amelioration estimee a partir des elements fournis est de ${formatCurrency(
      params.potentialSaving
    )} par an. Je vous remercie de me faire parvenir une proposition actualisee ou les modalites permettant de faire evoluer mon engagement.`,
    "",
    "Dans l'attente de votre retour, je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.",
    "",
    "{{firstName}} {{lastName}}"
  ].join("\n");
}

function createLetter(
  type: GeneratedLetterType,
  expense: Expense,
  analysis: MockAnalysis
): GeneratedLetter {
  const potentialSaving = Math.max(getPotentialSavingForExpense(analysis, expense), 48);

  const presets: Record<
    GeneratedLetterType,
    {
      title: string;
      subject: string;
      reason: string;
      request: string;
    }
  > = {
    subscription_cancellation: {
      title: "Courrier de resiliation",
      subject: "Demande de resiliation de contrat / abonnement",
      reason:
        "Apres relecture de ma situation et de mes besoins actuels, je souhaite mettre fin a ce contrat.",
      request:
        "Je vous demande donc de proceder a la resiliation effective de mon abonnement dans les delais prevus par les conditions generales."
    },
    price_negotiation: {
      title: "Demande de negociation",
      subject: "Demande de renegociation de mes conditions tarifaires",
      reason:
        "Les elements compares font apparaitre des offres equivalentes qui semblent plus adaptees a ma situation actuelle.",
      request:
        "Je souhaite recevoir une proposition actualisee ou un geste commercial afin d'etudier la poursuite de mon contrat chez vous."
    },
    provider_followup: {
      title: "Relance fournisseur",
      subject: "Relance concernant ma demande precedente",
      reason:
        "Je souhaite obtenir un retour clair concernant l'ajustement possible de mon contrat.",
      request:
        "Je vous relance donc afin de connaitre les options disponibles pour faire evoluer mon offre actuelle."
    },
    offer_change: {
      title: "Demande de changement d'offre",
      subject: "Changement vers une offre plus adaptee",
      reason:
        "Mon usage actuel semble pouvoir correspondre a une offre plus simple ou plus adaptee que mon contrat actuel.",
      request:
        "Je souhaite etudier le passage vers l'offre [Nom de l'offre cible] ou toute proposition equivalente que vous pourriez me transmettre."
    },
    comparison_report: {
      title: "Rapport de comparaison",
      subject: "Transmission d'une comparaison de mon contrat",
      reason:
        "Je souhaite partager une comparaison entre mon contrat actuel et plusieurs offres disponibles afin d'echanger sur une solution plus adaptee.",
      request:
        "Ce document sert de base a ma demande d'alignement, d'ajustement ou de modification de mon engagement actuel."
    }
  };

  const preset = presets[type];

  return {
    id: `letter_${type}_${expense.id}`,
    type,
    provider: expense.provider,
    category: expense.category,
    potentialSaving,
    monthlyAmount: expense.monthlyAmount,
    yearlyAmount: expense.yearlyAmount,
    subject: preset.subject,
    title: preset.title,
    bodyTemplate: buildBodyTemplate({
      provider: expense.provider,
      monthlyAmount: expense.monthlyAmount,
      yearlyAmount: expense.yearlyAmount,
      potentialSaving,
      reason: preset.reason,
      request: preset.request
    })
  };
}

function getLetterTypesForExpense(_expense: Expense, _analysis: MockAnalysis) {
  return [
    "subscription_cancellation",
    "price_negotiation",
    "provider_followup",
    "offer_change",
    "comparison_report"
  ] satisfies GeneratedLetterType[];
}

export function generateLettersFromAnalysis(analysis: MockAnalysis): GeneratedLetter[] {
  const letters = analysis.expenses.flatMap((expense) =>
    getLetterTypesForExpense(expense, analysis).map((type) =>
      createLetter(type, expense, analysis)
    )
  );

  return letters.sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 50);
}

export function renderLetter(
  letter: GeneratedLetter,
  personalization: Partial<LetterPersonalization>
) {
  const values = { ...defaultPersonalization, ...personalization };

  return letter.bodyTemplate
    .replaceAll("{{firstName}}", values.firstName || defaultPersonalization.firstName)
    .replaceAll("{{lastName}}", values.lastName || defaultPersonalization.lastName)
    .replaceAll("{{address}}", values.address || defaultPersonalization.address)
    .replaceAll(
      "{{customerNumber}}",
      values.customerNumber || defaultPersonalization.customerNumber
    )
    .replaceAll("{{email}}", values.email || defaultPersonalization.email)
    .replaceAll("{{subject}}", letter.subject);
}
