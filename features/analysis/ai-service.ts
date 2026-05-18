import { OpenAI } from "openai";
import {
  attachDocumentProfileToExpense,
  buildDocumentPartyProfiles,
  ensureDetectedDocumentsFromExpenses,
  getEnergyBillingInfoFromProfile,
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

type AiExpense = Omit<Expense, "id" | "yearlyAmount" | "recurrence">;
type AiRecommendation = Omit<Recommendation, "id">;
type AiAnomaly = Omit<AnalysisAnomaly, "id">;

type AiAnalysisPayload = {
  detectedParties?: DetectedParties;
  expenses?: AiExpense[];
  recommendations?: AiRecommendation[];
  anomalies?: AiAnomaly[];
};

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

export async function analyzeDocumentsWithAI(
  documents: ExtractedDocument[],
  keyCode: string
): Promise<Analysis> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans les variables d'environnement.");
  }

  const context = documents
    .map(
      (document) =>
        `### Document ID: ${document.id}
Nom du fichier: ${document.fileName}
Type detecte: ${document.documentType}
Fournisseur detecte par l'application: ${document.provider || "inconnu"}
Contenu extrait :\n${document.extractedText || "Contenu illisible ou vide."}`
    )
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
5. N'invente JAMAIS de coordonnées absentes`
        },
        {
          role: "user",
          content: `Analyse les documents suivants :\n\n${context}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const rawResult = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as AiAnalysisPayload;

    const aiExpenses = rawResult.expenses ?? [];
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
      aiExpenses.length > 0
        ? []
        : [...profileFallbackExpenses, ...detectedDocumentFallbackExpenses];

    const expenses: Expense[] = [...aiExpenses, ...fallbackExpenses].map(
      (expense, index) =>
        attachDocumentProfileToExpense(
          {
            id: `exp_${keyCode}_${index}`,
            ...expense,
            yearlyAmount: expense.monthlyAmount * 12,
            recurrence: "monthly"
          },
          documentProfiles
        )
    );

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

    const totalMonthlyAmount = expenses.reduce(
      (sum, expense) => sum + expense.monthlyAmount,
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
      anomalies: [...anomalies, ...energyFrequencyAnomalies],
      totalMonthlyAmount,
      totalYearlyAmount: totalMonthlyAmount * 12,
      yearlyPotentialSavings
    };
  } catch (error: unknown) {
    console.error("Erreur OpenAI:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    throw new Error(`Echec de l'analyse IA: ${message}`);
  }
}
