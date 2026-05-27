import { jsPDF } from "jspdf";
import type { GeneratedLetter, MockAnalysis } from "@/types";
import type { AlternativeOffer } from "@/features/recommendations/service";
import type { SelectedAlternativeOffer } from "@/features/recommendations/selected-offer";
import type { AuditActionLog } from "@/features/privacy/action-log";
import {
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";

type JsPdfWithPages = jsPDF & {
  internal: jsPDF["internal"] & {
    getNumberOfPages: () => number;
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

async function loadImageAsDataUrl(src: string) {
  const response = await fetch(src);
  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function truncateText(value: unknown, maxLength: number, fallback = "") {
  const text = typeof value === "string" && value.trim().length > 0 ? value : fallback;
  return text.substring(0, maxLength);
}

function normalizeDisplayText(value?: string | null, fallback = "Non renseigné") {
  return (value?.trim() || fallback)
    .replace(/sfr\s+pox/gi, "SFR Box")
    .replace(/nrj\s+moblie/gi, "NRJ Mobile")
    .replace(/\/\s*mais\b/gi, "/mois");
}

function getExpenseIdFromAlternativeId(offer: AlternativeOffer, analysis: MockAnalysis) {
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

function getBestAlternativeForExpense(
  expenseId: string,
  alternatives: AlternativeOffer[],
  analysis: MockAnalysis
) {
  return alternatives
    .filter((offer) => getExpenseIdFromAlternativeId(offer, analysis) === expenseId)
    .sort((first, second) => second.estimatedYearlySaving - first.estimatedYearlySaving)[0];
}

export async function generatePdfReport(
  analysis: MockAnalysis,
  alternatives: AlternativeOffer[] = [],
  _letters: GeneratedLetter[] = [],
  _selectedOffer?: SelectedAlternativeOffer | null,
  actionLogs: AuditActionLog[] = []
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const navy = [20, 34, 56] as const;
  const lightSage = [240, 250, 245] as const;

  let y = 20;
  let logoDataUrl: string | null = null;
  const ensurePageSpace = (height: number) => {
    if (y + height > 270) {
      doc.addPage();
      y = 20;
    }
  };

  try {
    logoDataUrl = await loadImageAsDataUrl("/brand/futeo-icon.png");
  } catch {
    logoDataUrl = null;
  }

  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(0, 0, 210, 42, "F");

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 18, 9, 18, 18);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Futéo", logoDataUrl ? 42 : 20, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Rapport d'audit du foyer", logoDataUrl ? 42 : 20, 27);
  doc.text(
    `Généré le ${new Date(analysis.generatedAt).toLocaleDateString("fr-FR")}`,
    145,
    27
  );

  y = 56;

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("1. Résumé global", 20, y);

  y += 10;
  doc.setFillColor(lightSage[0], lightSage[1], lightSage[2]);
  doc.roundedRect(20, y, 170, 35, 3, 3, "F");

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Montant mensuel estimé", 30, y + 10);
  doc.text("Pistes annuelles possibles", 110, y + 10);

  doc.setFontSize(20);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(formatCurrency(analysis.totalMonthlyAmount), 30, y + 22);

  doc.setTextColor(0, 120, 0);
  doc.text(formatCurrency(analysis.yearlyPotentialSavings), 110, y + 22);

  y += 50;

  const contractComparisons = analysis.expenses.slice(0, 15).map((expense) => ({
    expense,
    offer: getBestAlternativeForExpense(expense.id, alternatives, analysis)
  }));
  ensurePageSpace(24 + contractComparisons.length * 8);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("2. Pistes d'économies par contrat", 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Contrat", 25, y);
  doc.text("Alternative", 88, y);
  doc.text("Gain estimé", 185, y, { align: "right" });

  doc.setDrawColor(200, 200, 200);
  doc.line(20, y + 2, 190, y + 2);

  y += 8;
  contractComparisons.forEach(({ expense, offer }) => {
    const hasSaving = Boolean(offer && offer.estimatedYearlySaving > 0);
    doc.setFont("helvetica", hasSaving ? "bold" : "normal");
    doc.setTextColor(hasSaving ? navy[0] : 125, hasSaving ? navy[1] : 125, hasSaving ? navy[2] : 125);
    doc.text(
      truncateText(
        `${normalizeDisplayText(expense.provider || expense.label)} - ${formatCurrency(expense.monthlyAmount)}/mois`,
        39
      ),
      25,
      y
    );
    doc.setFont("helvetica", "normal");
    doc.text(
      truncateText(
        hasSaving && offer
          ? `${normalizeDisplayText(offer.provider)} - ${normalizeDisplayText(offer.name)}`
          : "Aucune offre plus compétitive trouvée",
        48
      ),
      88,
      y
    );
    doc.setTextColor(hasSaving ? 0 : 125, hasSaving ? 120 : 125, hasSaving ? 0 : 125);
    doc.text(`${formatCurrency(offer?.estimatedYearlySaving ?? 0)}/an`, 185, y, {
      align: "right"
    });
    y += 8;
  });

  y += 12;
  const categorySummaries = summarizeExpensesByCategory(analysis.expenses);
  const topExpenses = getTopExpenses(analysis.expenses, 5);
  const overviewHeight = 20 + Math.max(categorySummaries.length, topExpenses.length) * 8;
  ensurePageSpace(overviewHeight);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("3. Vue des dépenses", 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Dépenses par catégorie", 25, y);
  doc.text("Top 5 dépenses", 110, y);
  doc.setDrawColor(210, 210, 210);
  doc.line(20, y + 2, 190, y + 2);
  y += 9;

  for (let index = 0; index < Math.max(categorySummaries.length, topExpenses.length); index += 1) {
    const summary = categorySummaries[index];
    const expense = topExpenses[index];
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    if (summary) {
      doc.text(
        truncateText(`${summary.label} - ${formatCurrency(summary.monthlyTotal)}/mois`, 43),
        25,
        y
      );
    }
    if (expense) {
      doc.text(
        truncateText(
          `${normalizeDisplayText(expense.provider)} - ${formatCurrency(expense.yearlyAmount)}/an`,
          43
        ),
        110,
        y
      );
    }
    y += 8;
  }

  const priorityRecommendations = analysis.recommendations
    .filter((recommendation) => recommendation.priority !== "low")
    .slice(0, 5);

  if (priorityRecommendations.length > 0) {
    y += 10;
    ensurePageSpace(16 + priorityRecommendations.length * 30);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("4. Recommandations prioritaires", 20, y);
    y += 10;

    priorityRecommendations.forEach((recommendation) => {
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(20, y, 170, 25, 2, 2, "F");
      doc.setDrawColor(navy[0], navy[1], navy[2]);
      doc.line(20, y, 20, y + 25);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(recommendation.title, 25, y + 7);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(doc.splitTextToSize(recommendation.description, 160), 25, y + 13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 120, 0);
      doc.text(`Piste: ${formatCurrency(recommendation.potentialSaving)}/an`, 148, y + 7);
      y += 30;
    });
  }

  if (actionLogs.length > 0) {
    y += 8;
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Historique de vos démarches", 20, y);

    y += 10;
    actionLogs.slice(0, 8).forEach((action) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.text(truncateText(action.label, 95), 25, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(
        truncateText(
          `${new Date(action.createdAt).toLocaleDateString("fr-FR")}${
            action.provider ? ` - ${normalizeDisplayText(action.provider)}` : ""
          }${action.documentName ? ` - ${action.documentName}` : ""}`,
          100
        ),
        30,
        y
      );
      y += 9;
    });
  }

  const pageCount = (doc as JsPdfWithPages).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Futéo - Document d'aide à la décision. Les montants restent à vérifier avant toute démarche.",
      20,
      285
    );
    doc.text(`Page ${i} / ${pageCount}`, 180, 285);
  }

  doc.save(`Rapport_Futeo_${truncateText(analysis.id, 8, "audit")}.pdf`);
}
