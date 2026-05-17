import { OpenAI } from "openai";
import {
  attachDocumentProfileToExpense,
  buildDocumentPartyProfiles,
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
          content: `Tu es un expert en analyse de documents administratifs (factures, contrats, abonnements). 
Ton objectif est d'extraire les données avec une RIGUEUR ABSOLUE pour préparer des courriers officiels.

PRIORITÉS D'EXTRACTION (dans cet ordre) :
1. COORDONNÉES CLIENT (firstName, lastName, fullName, address, email, phone, customerNumber, contractNumber, invoiceNumber)
2. COORDONNÉES FOURNISSEUR (name, service, address, postalCode, city, phone)
3. DÉTAILS CONTRAT (provider, category, subcategory, monthlyAmount)
4. RECOMMANDATIONS & ANOMALIES

RÈGLES CRITIQUES :
- NE JAMAIS INVENTER. Si une donnée n'est pas visible, retourne null ou laisse vide.
- NE PAS HALLUCINER de noms, d'adresses ou de numéros.
- Pour chaque bloc principal (customer, providers), inclus un score de confiance global "confidence" (0.0 à 1.0).
- Le nom du client est prioritaire sur tout autre nom dans le document.

STRUCTURE JSON ATTENDUE :
{
  "detectedParties": {
    "customer": {
      "firstName": "...", "lastName": "...", "fullName": "...", 
      "address": "...", "email": "...", "phone": "...", 
      "customerNumber": "...", "contractNumber": "...", "invoiceNumber": "...",
      "confidence": 0.95
    },
    "providers": {
      "NomFournisseur": {
        "name": "...", "service": "...", "address": "...", 
        "postalCode": "...", "city": "...", "phone": "...",
        "confidence": 0.9
      }
    },
    "documents": {
      "DocumentID": {
        "documentId": "...", "fileName": "...", "documentType": "...", 
        "providerName": "...", "subscriptionType": "...", "invoiceAmount": 0,
        "customer": { ...même structure que ci-dessus... },
        "provider": { ...même structure que ci-dessus... }
      }
    }
  },
  "expenses": [ ... ],
  "recommendations": [ ... ],
  "anomalies": [ ... ]
}`
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
    const fallbackExpenses: AiExpense[] =
      aiExpenses.length > 0
        ? []
        : Object.values(documentProfiles)
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

    const totalMonthlyAmount = expenses.reduce(
      (sum, expense) => sum + expense.monthlyAmount,
      0
    );
    const yearlyPotentialSavings = recommendations.reduce(
      (sum, recommendation) => sum + recommendation.potentialSaving,
      0
    );

    return {
      id: `analysis_${keyCode}_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      documents,
      detectedParties: mergeDetectedParties(rawResult.detectedParties, documentProfiles),
      expenses,
      recommendations,
      anomalies,
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
