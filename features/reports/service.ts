import { jsPDF } from "jspdf";
import {
  ExpenseSubcategory,
  type ContractComparisonState,
  type GeneratedLetter,
  type MockAnalysis,
} from "@/types";
import {
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import {
  findSelectedAlternativeOffer,
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import type { AuditActionLog } from "@/features/privacy/action-log";
import {
  buildFinancialSummary,
  isReliablePotentialOffer,
  type RealizedSavingRecord
} from "./financial-summary";
import {
  getExpenseDisplayLabel,
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
  if (offer.sourceExpenseId) return offer.sourceExpenseId;
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

function getBestAlternativeForExpense(
  expenseId: string,
  alternatives: AlternativeOffer[],
  analysis: MockAnalysis,
  selectedOffer?: SelectedAlternativeOffer | null
) {
  const currentSelectedOffer = findSelectedAlternativeOffer(
    selectedOffer ?? null,
    alternatives
  );
  if (
    currentSelectedOffer &&
    isPrimaryAlternative(currentSelectedOffer) &&
    getExpenseIdFromAlternativeId(currentSelectedOffer, analysis) === expenseId
  ) {
    return currentSelectedOffer;
  }

  return alternatives
    .filter(
      (offer) =>
        isReliablePotentialOffer(offer) &&
        getExpenseIdFromAlternativeId(offer, analysis) === expenseId
    )
    .sort((first, second) => second.estimatedYearlySaving - first.estimatedYearlySaving)[0];
}

export async function generatePdfReport(
  analysis: MockAnalysis,
  alternatives: AlternativeOffer[] = [],
  _letters: GeneratedLetter[] = [],
  selectedOffer?: SelectedAlternativeOffer | null,
  actionLogs: AuditActionLog[] = [],
  comparisonMessage?: string | null,
  comparisonStates: ContractComparisonState[] = [],
  realizedSavings: RealizedSavingRecord[] = []
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const navy = [20, 34, 56] as const;
  const financialSummary = buildFinancialSummary(
    analysis,
    alternatives,
    comparisonStates,
    realizedSavings
  );

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
  const summaryCards = [
    {
      x: 20,
      title: "Dépenses actuelles",
      monthly: financialSummary.currentMonthlyAmount,
      yearly: financialSummary.currentYearlyAmount,
      fill: [238, 246, 255] as const,
      text: [16, 42, 76] as const
    },
    {
      x: 78,
      title: "Économies potentielles",
      monthly: financialSummary.potentialMonthlySaving,
      yearly: financialSummary.potentialYearlySaving,
      fill: [255, 247, 237] as const,
      text: [217, 119, 6] as const
    },
    {
      x: 136,
      title: "Économies réalisées",
      monthly: financialSummary.realizedMonthlySaving,
      yearly: financialSummary.realizedYearlySaving,
      fill: [240, 253, 244] as const,
      text: [21, 128, 61] as const
    }
  ];
  summaryCards.forEach((card, index) => {
    doc.setFillColor(card.fill[0], card.fill[1], card.fill[2]);
    doc.roundedRect(card.x, y, 54, 34, 2, 2, "F");
    doc.setTextColor(card.text[0], card.text[1], card.text[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(card.title, card.x + 4, y + 8);
    doc.setFontSize(index === 1 && financialSummary.potentialStatus === "undetermined" ? 10 : 14);
    doc.text(
      index === 1 && financialSummary.potentialStatus === "undetermined"
        ? "Non déterminé"
        : `${formatCurrency(card.monthly)}/mois`,
      card.x + 4,
      y + 20
    );
    doc.setFontSize(8);
    doc.text(`${formatCurrency(card.yearly)}/an`, card.x + 4, y + 28);
  });

  y += 40;
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.roundedRect(20, y, 170, 22, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Votre budget après optimisation", 26, y + 8);
  doc.setFontSize(13);
  doc.text(
    financialSummary.potentialStatus === "undetermined"
      ? "Projection non calculable"
      : `${formatCurrency(financialSummary.projectedMonthlyAmount)}/mois`,
    184,
    y + 9,
    { align: "right" }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Projection non garantie, sans double comptabilisation des économies réalisées.", 26, y + 16);

  y += 35;

  const contractComparisons = analysis.expenses.slice(0, 15).map((expense) => ({
    expense,
    offer: getBestAlternativeForExpense(
      expense.id,
      alternatives,
      analysis,
      selectedOffer
    ),
    comparisonState: comparisonStates.find((state) => state.expenseId === expense.id)
  }));
  ensurePageSpace(24 + contractComparisons.length * 14);
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
  contractComparisons.forEach(({ expense, offer, comparisonState }) => {
    const contractFinancial = financialSummary.contracts[expense.id];
    const hasSaving = contractFinancial.potentialYearlySaving > 0;
    const hasIndicativeSelectedOffer = Boolean(
      offer &&
      selectedOffer?.id === offer.id &&
      offer.savingKind === "recurring_only" &&
      offer.estimatedYearlySaving > 0
    );
    const hasDisplayedOffer = hasSaving || hasIndicativeSelectedOffer;
    doc.setFont("helvetica", hasDisplayedOffer ? "bold" : "normal");
    doc.setTextColor(hasDisplayedOffer ? navy[0] : 125, hasDisplayedOffer ? navy[1] : 125, hasDisplayedOffer ? navy[2] : 125);
    doc.text(
      truncateText(
        `${getExpenseDisplayLabel(expense)} - ${normalizeDisplayText(expense.provider)} - ${formatCurrency(contractFinancial.currentMonthlyAmount)}/mois - ${expense.sourceDocumentName ?? "Saisie manuelle"}`,
        39
      ),
      25,
      y
    );
    doc.setFont("helvetica", "normal");
    doc.text(
      truncateText(
        hasDisplayedOffer && offer
          ? `${normalizeDisplayText(offer.provider)} - ${normalizeDisplayText(offer.name)}`
          : comparisonState?.message ?? "Comparaison non disponible",
        48
      ),
      88,
      y
    );
    doc.setTextColor(hasDisplayedOffer ? 0 : 125, hasDisplayedOffer ? 120 : 125, hasDisplayedOffer ? 0 : 125);
    const displayedYearlySaving = hasIndicativeSelectedOffer && offer
      ? offer.estimatedYearlySaving
      : contractFinancial.potentialYearlySaving;
    doc.text(`${hasIndicativeSelectedOffer ? "~ " : ""}${formatCurrency(displayedYearlySaving)}/an`, 185, y, {
      align: "right"
    });
    y += 8;
    if (hasIndicativeSelectedOffer) {
      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14);
      doc.text("Estimation tarifaire hors frais ponctuels, non garantie.", 88, y);
      y += 6;
      doc.setFontSize(10);
    }
    if (contractFinancial.realizedYearlySaving > 0) {
      doc.setFontSize(8);
      doc.setTextColor(21, 128, 61);
      doc.text(
        `Économie réalisée: ${formatCurrency(contractFinancial.realizedYearlySaving)}/an`,
        30,
        y
      );
      y += 6;
    }
  });

  const reducedDataAlternatives = alternatives.filter(
    (offer) => offer.comparisonKind === "reduced_data"
  );
  if (reducedDataAlternatives.length > 0) {
    y += 8;
    ensurePageSpace(18 + reducedDataAlternatives.length * 13);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Autres possibilites pour reduire votre facture", 20, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(
      "Forfaits mobiles moins genereux, non equivalents et exclus du total principal.",
      20,
      y
    );
    y += 7;
    reducedDataAlternatives.forEach((offer) => {
      ensurePageSpace(13);
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.setFont("helvetica", "bold");
      doc.text(
        truncateText(`${normalizeDisplayText(offer.provider)} - ${normalizeDisplayText(offer.name)}`, 60),
        25,
        y
      );
      doc.setFont("helvetica", "normal");
      doc.setTextColor(125, 90, 20);
      doc.text(`Compromis: ${formatCurrency(offer.estimatedYearlySaving)}/an`, 185, y, {
        align: "right"
      });
      y += 7;
    });
  }

  const mobileExpenses = analysis.expenses.filter(
    (expense) => expense.subcategory === ExpenseSubcategory.MOBILE
  );
  if (mobileExpenses.length > 0) {
    y += 10;
    ensurePageSpace(24);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Détail des comparaisons mobiles", 20, y);
    y += 8;

    const mobileAlternatives = alternatives.filter((offer) =>
      offer.sourceExpenseId && mobileExpenses.some((expense) => expense.id === offer.sourceExpenseId)
    );
    if (mobileAlternatives.length === 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(
        doc.splitTextToSize(
          comparisonMessage ?? "Aucune offre mobile vérifiée et suffisamment récente n'est disponible.",
          165
        ),
        25,
        y
      );
      y += 14;
    } else {
      for (const offer of mobileAlternatives.slice(0, 8)) {
        const expense = mobileExpenses.find((item) => item.id === offer.sourceExpenseId);
        if (!expense) continue;
        ensurePageSpace(34);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(navy[0], navy[1], navy[2]);
        const currentData = expense.mobileDataUnlimited
          ? "illimité"
          : typeof expense.mobileIncludedDataGB === "number"
            ? `${expense.mobileIncludedDataGB} Go`
            : "volume non confirmé";
        doc.text(
          truncateText(`${expense.provider} - ${formatCurrency(expense.monthlyAmount)}/mois - ${currentData}`, 95),
          25,
          y
        );
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(
          truncateText(`${offer.provider} - ${offer.name} - ${formatCurrency(offer.monthlyPrice)}/mois`, 105),
          30,
          y
        );
        y += 5;
        const savingText = offer.savingKind === "certified"
          ? `Économie nette 12 mois : ${formatCurrency(offer.estimatedYearlySaving)}`
          : offer.savingKind === "recurring_only"
            ? `Écart récurrent informatif : ${formatCurrency(offer.recurringYearlySaving ?? 0)}/an; frais incomplets`
            : "Compromis ou promotion temporaire, exclu du total principal";
        doc.text(truncateText(savingText, 110), 30, y);
        y += 5;
        if (typeof offer.terminationFees === "number") {
          doc.text(`Frais de résiliation indiqués : ${formatCurrency(offer.terminationFees)}`, 30, y);
          y += 5;
        }
        const verified = offer.verifiedAt
          ? new Date(offer.verifiedAt).toLocaleDateString("fr-FR")
          : "date inconnue";
        doc.text(truncateText(`Vérifiée le ${verified} - Source : ${offer.url}`, 110), 30, y);
        y += 5;
        if (offer.conditions?.length) {
          doc.text(truncateText(`Conditions : ${offer.conditions.join("; ")}`, 110), 30, y);
          y += 5;
        }
        y += 5;
      }
    }
  }

  y += 12;
  const currentExpenses = analysis.expenses.map((expense) => {
    const contract = financialSummary.contracts[expense.id];
    return contract
      ? {
          ...expense,
          monthlyAmount: contract.currentMonthlyAmount,
          yearlyAmount: contract.currentYearlyAmount
        }
      : expense;
  });
  const categorySummaries = summarizeExpensesByCategory(currentExpenses);
  const topExpenses = getTopExpenses(currentExpenses, 5);
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
