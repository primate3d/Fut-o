import { OpenAI } from "openai";
import { logger } from "@/lib/server/logger";
import {
  attachDocumentProfileToExpense,
  buildDocumentPartyProfiles,
  ensureDetectedDocumentsFromExpenses,
  getEnergyBillingInfoFromProfile,
  getEnergyServiceLinesFromProfile,
  getInsuranceContractsFromProfile,
  getInternetBoxInfoFromProfile,
  inferExpenseCategoryFromDocumentType,
  inferExpenseSubcategoryFromDocumentType,
  mergeDetectedParties,
  type ExtractedDocument
} from "@/features/analysis/document-profiles";
import type {
  AnalysisAnomaly,
  DetectedParties,
  Expense,
  MockAnalysis as Analysis,
  Recommendation
} from "@/types";
import { ExpenseCategory } from "@/types";

let _openai: OpenAI | null = null;

type AiExpense = Omit<Expense, "id" | "yearlyAmount" | "recurrence"> &
  Partial<Pick<Expense, "yearlyAmount" | "recurrence">>;
type AiRecommendation = Omit<Recommendation, "id">;
type AiAnomaly = Omit<AnalysisAnomaly, "id">;

type AiAnalysisPayload = {
  detectedParties?: DetectedParties;
  expenses?: AiExpense[];
  recommendations?: AiRecommendation[];
  anomalies?: AiAnomaly[];
};

const APPROX_CHARS_PER_TOKEN = 4;
const MAX_PROMPT_TOKENS = 100_000;
const MAX_DOCUMENT_TEXT_TOKENS = 80_000;
const MAX_DOCUMENT_TEXT_CHARS = MAX_DOCUMENT_TEXT_TOKENS * APPROX_CHARS_PER_TOKEN;

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY manquante");
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return _openai;
}

function estimateTokensFromCharacters(characters: number) {
  return Math.ceil(characters / APPROX_CHARS_PER_TOKEN);
}

function prepareDocumentsForAi(documents: ExtractedDocument[]) {
  const totalCharacters = documents.reduce(
    (sum, document) => sum + (document.extractedText?.length ?? 0),
    0
  );

  if (estimateTokensFromCharacters(totalCharacters) <= MAX_PROMPT_TOKENS) {
    return documents;
  }

  return documents.map((document) => {
    const extractedText = document.extractedText ?? "";
    if (extractedText.length <= MAX_DOCUMENT_TEXT_CHARS) {
      return document;
    }

    logger.warn("Texte extrait tronque avant appel IA", {
      service: "AI",
      action: "input_truncated",
      metadata: {
        originalCharacters: extractedText.length,
        truncatedCharacters: MAX_DOCUMENT_TEXT_CHARS
      }
    });

    return {
      ...document,
      extractedText: extractedText.slice(0, MAX_DOCUMENT_TEXT_CHARS)
    };
  });
}

export async function analyzeDocumentsWithAI(
  documents: ExtractedDocument[],
  keyCode: string
): Promise<Analysis> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans les variables d'environnement.");
  }

  const aiDocuments = prepareDocumentsForAi(documents);
  const context = aiDocuments
    .map((document) => {
      const corrections = document.userCorrections;
      const correctionLines = [
        corrections?.provider ? `Fournisseur corrige: ${corrections.provider}` : undefined,
        corrections?.documentType ? `Type corrige: ${corrections.documentType}` : undefined,
        corrections?.amount ? `Montant corrige: ${corrections.amount}` : undefined,
        corrections?.frequency ? `Frequence corrigee: ${corrections.frequency}` : undefined,
        corrections?.isMultiContract ? "Document signale multi-contrats" : undefined,
        corrections?.notes ? `Notes utilisateur: ${corrections.notes}` : undefined
      ].filter(Boolean);

      return `### Document ID: ${document.id}
Nom du fichier: ${document.fileName}
Type detecte: ${document.documentType}
Fournisseur detecte par l'application: ${document.provider || "inconnu"}
${correctionLines.length > 0 ? `Corrections utilisateur:\n${correctionLines.join("\n")}\n` : ""}
Contenu extrait :\n${document.extractedText || "Contenu illisible ou vide."}`
    })
    .join("\n\n---\n\n");
  const documentProfiles = buildDocumentPartyProfiles(documents);

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en analyse de documents administratifs pour générer des courriers officiels.

EXEMPLE COMPLET - Entrée/Sortie :

Entrée reçue :
### Document ID: abc-123
Fichier analysé: facture_mobile.pdf
Type detecte: invoice
Contenu extrait :
Monsieur Jean DUPONT
5 rue Example, 75001 PARIS
NRJ Mobile - Service Client
40 avenue Commerce, 92000 Nanterre
Tel: 0800123456
Facture du 01/05/2026
Montant TTC: 25 EUR
N° client: 987654

Sortie JSON OBLIGATOIRE :
{
  "detectedParties": {
    "customer": {
      "firstName": "Jean",
      "lastName": "DUPONT",
      "fullName": "Jean DUPONT",
      "address": "5 rue Example, 75001 PARIS",
      "customerNumber": "987654"
    },
    "providers": {
      "NRJ Mobile": {
        "name": "NRJ Mobile",
        "address": "40 avenue Commerce, 92000 Nanterre",
        "phone": "0800123456"
      }
    },
    "documents": {
      "abc-123": {
        "documentId": "abc-123",
        "fileName": "facture_mobile.pdf",
        "documentType": "invoice",
        "providerName": "NRJ Mobile",
        "invoiceAmount": 25,
        "customer": {
          "firstName": "Jean",
          "lastName": "DUPONT",
          "fullName": "Jean DUPONT",
          "address": "5 rue Example, 75001 PARIS",
          "customerNumber": "987654"
        },
        "provider": {
          "name": "NRJ Mobile",
          "address": "40 avenue Commerce, 92000 Nanterre",
          "phone": "0800123456"
        }
      }
    }
  },
  "expenses": [{
    "sourceDocumentId": "abc-123",
    "provider": "NRJ Mobile",
    "category": "TELECOM",
    "subcategory": "MOBILE",
    "monthlyAmount": 25,
    "customerNumber": "987654"
  }]
}

RÈGLES IMPÉRATIVES :
1. Pour CHAQUE "### Document ID: X" reçu, crée documents[X] avec X comme clé EXACTE
2. Le customer/provider dans documents[X] = coordonnées visibles dans CE document
3. Chaque expense.sourceDocumentId DOIT matcher une clé documents[]
4. Fournisseur = marque commerciale prioritaire (NRJ Mobile > Bouygues, Sosh > Orange)
5. N'invente JAMAIS de coordonnées absentes
6. EXTRACTION DES COORDONNÉES CLIENT : Sois TRÈS RÉSILIENT et agnostique. Extrais explicitement le prénom, le nom, l'adresse postale, l'email, le téléphone, et les identifiants de contrat (numéro client, numéro de facture) PEU IMPORTE l'ordre (ex: Nom avant le Prénom) ou les variations de libellés sur la facture.

REGLES MULTI-LIGNES / MULTI-CONTRATS - EXEMPLES CONCRETS OBLIGATOIRES :

7. Si un meme document contient plusieurs contrats, services ou energies distincts,
   cree UNE expense separee pour chaque ligne identifiable, meme si le fournisseur
   et le document sont identiques.

7. EXEMPLE OBLIGATOIRE ENGIE GAZ + ELECTRICITE :

   Si tu vois un tableau "Votre echeancier de paiement" avec :

   Gaz          67,90 EUR    67,90 EUR    67,90 EUR    67,90 EUR    ...
   Electricite  26,35 EUR    40,06 EUR    40,06 EUR    40,06 EUR    ...
   Total        94,25 EUR   107,96 EUR   107,96 EUR   107,96 EUR    ...

   TU DOIS creer DEUX expenses distinctes (PAS UNE SEULE) :

   expense 1 :
     provider: "ENGIE"
     category: "ENERGY"
     subcategory: "GAS"
     amount: 67.90
     recurrence: "monthly"
     monthlyAmount: 67.90
     yearlyAmount: 814.80

   expense 2 :
     provider: "ENGIE"
     category: "ENERGY"
     subcategory: "ELECTRICITY"
     amount: 40.06
     recurrence: "monthly"
     monthlyAmount: 40.06
     yearlyAmount: 480.72

   NE JAMAIS creer une seule expense "Energie" avec le total 107,96 EUR ou 189 EUR.
   NE JAMAIS utiliser le premier montant electricite 26,35 EUR comme reference.
   NE JAMAIS diviser le total annuel (2262 EUR) par 12 pour obtenir 189 EUR.

   Le total du tableau sert uniquement a VERIFIER la coherence,
   il ne remplace PAS les lignes Gaz et Electricite separees.

8. Pour un avis d'echeance assurance annuel preleve mensuellement :
   - cree une expense par contrat identifiable
   - utilise la cotisation annuelle TTC du contrat comme reference
   - recurrence = "yearly", yearlyAmount = cotisation TTC,
     monthlyAmount = yearlyAmount / 12
   - le prelevement mensuel global sert a verifier l'echeancier,
     il ne remplace pas les cotisations par contrat

9. Pour les documents multi-contrats type MACIF, le libelle precise le contrat :
   "Assurance deux roues", "Assurance habitation", "Prevoyance familiale".

10. Ne transforme pas un total, un report de solde, des frais ou une contribution
    annexe en contrat principal.

11. Si seul un montant annuel est visible sans periodicite claire,
    ne l'invente pas en mensualite : monthlyAmount = yearlyAmount / 12
    et recurrence = "yearly".

12. Si la frequence est incertaine, conserve les montants visibles,
    marque recurrence = "one_time", et ajoute une anomalie
    plutot que d'inventer une mensualite.`
        },
        {
          role: "user",
          content: `Analyse les documents suivants :\n\n${context}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const finishReason = response.choices[0].finish_reason;
    const responseContent = response.choices[0].message.content || "{}";
    let rawResult: AiAnalysisPayload;

    if (finishReason !== "stop") {
      logger.warn("Reponse IA terminee avec un finish_reason inattendu", {
        service: "AI",
        action: "unexpected_finish_reason",
        metadata: { finishReason }
      });
    }

    try {
      rawResult = JSON.parse(responseContent) as AiAnalysisPayload;
      if (finishReason !== "stop") {
        logger.warn("JSON IA parse malgre un finish_reason inattendu", {
          service: "AI",
          action: "parsed_unexpected_finish_reason",
          metadata: { finishReason }
        });
      }
    } catch (error) {
      const preview = responseContent.slice(0, 500);
      if (finishReason !== "stop") {
        throw new Error(`Réponse IA incomplète (finish_reason: ${finishReason})`);
      }
      throw new Error(
        `Réponse IA JSON invalide: ${error instanceof Error ? error.message : "erreur inconnue"}. Debut recu: ${preview}`
      );
    }

    const insuranceContractExpenses: AiExpense[] = Object.values(documentProfiles)
      .flatMap((profile) =>
        getInsuranceContractsFromProfile(profile).map((contract) => ({
          label: contract.label,
          provider: contract.provider ?? profile.providerName ?? "Assureur",
          category: ExpenseCategory.INSURANCE,
          subcategory: contract.subcategory,
          isRecurring: true,
          monthlyAmount: contract.monthlyAmount,
          yearlyAmount: contract.yearlyAmount,
          recurrence: "yearly" as const,
          documentType: contract.documentType,
          sourceDocumentId: profile.documentId,
          sourceDocumentName: profile.fileName,
          customerNumber: contract.customerNumber ?? profile.customer?.customerNumber
        }))
      );
    const energyServiceExpenses: AiExpense[] = Object.values(documentProfiles)
      .flatMap((profile) =>
        getEnergyServiceLinesFromProfile(profile).map((serviceLine) => ({
          label: serviceLine.label,
          provider: profile.providerName ?? profile.provider?.name ?? "Fournisseur energie",
          category: ExpenseCategory.ENERGY,
          subcategory: serviceLine.subcategory,
          isRecurring: true,
          monthlyAmount: serviceLine.monthlyAmount,
          yearlyAmount: serviceLine.yearlyAmount,
          recurrence: "monthly" as const,
          documentType: profile.documentType,
          sourceDocumentId: profile.documentId,
          sourceDocumentName: profile.fileName,
          customerNumber: profile.customer?.customerNumber,
          contractNumber: profile.customer?.contractNumber,
          invoiceNumber: profile.customer?.invoiceNumber,
          phone: profile.customer?.phone
        }))
      );
    const aiExpenses =
      insuranceContractExpenses.length > 0 || energyServiceExpenses.length > 0
        ? []
        : rawResult.expenses ?? [];
    const usefulAiExpenses = aiExpenses.filter((expense) => {
      const monthlyAmount = Number(expense.monthlyAmount);
      const yearlyAmount = Number(expense.yearlyAmount);
      return (
        (Number.isFinite(monthlyAmount) && monthlyAmount > 0) ||
        (Number.isFinite(yearlyAmount) && yearlyAmount > 0)
      );
    });
    const profileFallbackExpenses: AiExpense[] = Object.values(documentProfiles)
      .filter((profile) => profile.invoiceAmount)
      .map((profile) => ({
        label: profile.subscriptionType ?? "Contrat",
        provider: profile.providerName ?? "Fournisseur",
        category: inferExpenseCategoryFromDocumentType(profile.documentType),
        subcategory: inferExpenseSubcategoryFromDocumentType(profile.documentType),
        isRecurring: true,
        monthlyAmount: profile.invoiceAmount ?? 0,
        documentType: profile.documentType,
        sourceDocumentId: profile.documentId,
        sourceDocumentName: profile.fileName,
        customerNumber: profile.customer?.customerNumber,
        contractNumber: profile.customer?.contractNumber,
        invoiceNumber: profile.customer?.invoiceNumber,
        phone: profile.customer?.phone
      }));
    const detectedDocumentFallbackExpenses: AiExpense[] = Object.values(
      rawResult.detectedParties?.documents ?? {}
    )
      .filter(
        (document) =>
          document.documentId &&
          document.invoiceAmount &&
          !profileFallbackExpenses.some(
            (expense) => expense.sourceDocumentId === document.documentId
          )
      )
      .map((document) => ({
        label: document.subscriptionType ?? "Contrat",
        provider: document.providerName ?? document.provider?.name ?? "Fournisseur",
        category: inferExpenseCategoryFromDocumentType(document.documentType),
        subcategory: inferExpenseSubcategoryFromDocumentType(document.documentType),
        isRecurring: true,
        monthlyAmount: document.invoiceAmount ?? 0,
        documentType: document.documentType,
        sourceDocumentId: document.documentId,
        sourceDocumentName: document.fileName,
        customerNumber: document.customer?.customerNumber,
        contractNumber: document.customer?.contractNumber,
        invoiceNumber: document.customer?.invoiceNumber,
        phone: document.customer?.phone
      }));
    const fallbackExpenses: AiExpense[] =
      insuranceContractExpenses.length > 0
        ? insuranceContractExpenses
        : energyServiceExpenses.length > 0
        ? energyServiceExpenses
        : usefulAiExpenses.length > 0
        ? []
        : [...profileFallbackExpenses, ...detectedDocumentFallbackExpenses];

    const normalizedExpenses: Expense[] = [...usefulAiExpenses, ...fallbackExpenses].map(
      (expense, index) =>
        attachDocumentProfileToExpense(
          {
            id: `exp_${keyCode}_${index}`,
            ...expense,
            yearlyAmount: expense.yearlyAmount ?? expense.monthlyAmount * 12,
            recurrence:
              expense.recurrence ??
              (expense.category === ExpenseCategory.INSURANCE ? "yearly" : "monthly")
          },
          documentProfiles
        )
    );
    const seenInternetInvoiceDocuments = new Set<string>();
    const expenses = normalizedExpenses.filter((expense) => {
      const sourceDocumentId = expense.sourceDocumentId;
      if (
        !sourceDocumentId ||
        documentProfiles[sourceDocumentId]?.documentType !== "internet_invoice"
      ) {
        return true;
      }

      if (seenInternetInvoiceDocuments.has(sourceDocumentId)) {
        return false;
      }

      seenInternetInvoiceDocuments.add(sourceDocumentId);
      return true;
    });

    const recommendations: Recommendation[] = (rawResult.recommendations ?? []).map(
      (recommendation, index) => ({
        id: `rec_${keyCode}_${index}`,
        ...recommendation
      })
    );

    const anomalies: AnalysisAnomaly[] = (rawResult.anomalies ?? []).map(
      (anomaly, index) => ({
        id: `anom_${keyCode}_${index}`,
        ...anomaly
      })
    );
    const energyFrequencyAnomalies: AnalysisAnomaly[] = Object.values(documentProfiles)
      .flatMap((profile, index): AnalysisAnomaly[] => {
        const energyBilling = getEnergyBillingInfoFromProfile(profile);
        if (!energyBilling?.confirmationPrompt) return [];

        return [{
          id: `anom_${keyCode}_energy_frequency_${index}`,
          title: "Frequence energie a confirmer",
          description: energyBilling.confirmationPrompt,
          severity: "medium" as const,
          category: ExpenseCategory.ENERGY
        }];
      });
    const internetBoxAnomalies: AnalysisAnomaly[] = Object.values(documentProfiles)
      .flatMap((profile, profileIndex): AnalysisAnomaly[] => {
        const internetBox = getInternetBoxInfoFromProfile(profile);
        if (!internetBox) return [];

        const checks: Array<{ title: string; description: string }> = [];
        if (internetBox.hasPromo) {
          checks.push({
            title: "Prix promotionnel detecte",
            description: "Verifier le prix hors promotion avant de comparer cette offre internet."
          });
        }
        if (internetBox.hasCommitment) {
          checks.push({
            title: "Engagement possible",
            description: "Verifier la date de fin d'engagement et les frais eventuels avant tout changement."
          });
        }
        if (internetBox.isBundledMobile) {
          checks.push({
            title: "Offre groupee box + mobile",
            description: "La facture semble regrouper internet et mobile. La comparaison doit etre confirmee poste par poste."
          });
        }
        if (internetBox.hasTvIncluded) {
          checks.push({
            title: "TV incluse possible",
            description: "Verifier si la TV ou le decodeur doivent etre conserves dans l'offre comparee."
          });
        }

        return checks.map((check, checkIndex) => ({
          id: `anom_${keyCode}_internet_${profileIndex}_${checkIndex}`,
          ...check,
          severity: "medium" as const,
          category: ExpenseCategory.TELECOM
        }));
      });

    const totalMonthlyAmount = expenses.reduce(
      (sum, expense) => sum + expense.monthlyAmount,
      0
    );
    const totalYearlyAmount = expenses.reduce(
      (sum, expense) => sum + expense.yearlyAmount,
      0
    );
    const yearlyPotentialSavings = recommendations.reduce(
      (sum, recommendation) => sum + recommendation.potentialSaving,
      0
    );
    const detectedParties = ensureDetectedDocumentsFromExpenses(
      mergeDetectedParties(rawResult.detectedParties, documentProfiles),
      expenses,
      documentProfiles
    );

    return {
      id: `analysis_${keyCode}_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      documents,
      detectedParties,
      expenses,
      recommendations,
      anomalies: [...anomalies, ...energyFrequencyAnomalies, ...internetBoxAnomalies],
      totalMonthlyAmount,
      totalYearlyAmount,
      yearlyPotentialSavings
    };
  } catch (error: unknown) {
    logger.error("Erreur OpenAI", {
      service: "AI",
      action: "analysis_error",
      metadata: {
        error: error instanceof Error ? error.message : "Erreur inconnue"
      }
    });
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    throw new Error(`Echec de l'analyse IA: ${message}`);
  }
}
