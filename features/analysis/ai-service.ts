import { OpenAI } from "openai";
import type {
  AnalysisAnomaly,
  Expense,
  MockAnalysis as Analysis,
  Recommendation,
  UploadedDocument
} from "@/types";

let _openai: OpenAI | null = null;

type AiExpense = Omit<Expense, "id" | "yearlyAmount" | "recurrence">;
type AiRecommendation = Omit<Recommendation, "id">;
type AiAnomaly = Omit<AnalysisAnomaly, "id">;

type AiAnalysisPayload = {
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
  documents: (UploadedDocument & { extractedText: string })[],
  keyCode: string
): Promise<Analysis> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante dans les variables d'environnement.");
  }

  const context = documents
    .map(
      (document) =>
        `### Document: ${document.fileName} (${document.documentType})
Contenu extrait :\n${document.extractedText || "Contenu illisible ou vide."}`
    )
    .join("\n\n---\n\n");

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu aides Futéo à préparer une lecture claire de contrats du foyer.
Réponds uniquement en JSON avec trois tableaux : expenses, recommendations, anomalies.
N'invente pas de garantie d'économie. Signale les limites quand le texte extrait est insuffisant.`
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

    const expenses: Expense[] = (rawResult.expenses ?? []).map((expense, index) => ({
      id: `exp_${keyCode}_${index}`,
      ...expense,
      yearlyAmount: expense.monthlyAmount * 12,
      recurrence: "monthly"
    }));

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
    throw new Error(`Échec de l'analyse IA: ${message}`);
  }
}
