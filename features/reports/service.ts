import { jsPDF } from "jspdf";
import type { GeneratedLetter, MockAnalysis } from "@/types";
import type { AlternativeOffer } from "@/features/recommendations/service";
import type { SelectedAlternativeOffer } from "@/features/recommendations/selected-offer";
import { expenseCategoryLabels } from "@/lib/expense-summary";
import { formatCurrency } from "@/lib/utils";

type JsPdfWithPages = jsPDF & {
  internal: jsPDF["internal"] & {
    getNumberOfPages: () => number;
  };
};

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

function getLetterTypeLabel(type: GeneratedLetter["type"]) {
  const labels: Record<GeneratedLetter["type"], string> = {
    subscription_cancellation: "Résiliation",
    price_negotiation: "Négociation",
    provider_followup: "Relance",
    offer_change: "Changement d'offre",
    comparison_report: "Comparaison"
  };

  return labels[type];
}

function truncateText(value: unknown, maxLength: number, fallback = "") {
  const text = typeof value === "string" && value.trim().length > 0 ? value : fallback;
  return text.substring(0, maxLength);
}

function getSyntheticPreparedLetters(letters: GeneratedLetter[], maxItems = 5) {
  const seen = new Set<string>();
  const uniqueLetters = letters.filter((letter) => {
    const key = `${letter.type}-${letter.category}-${letter.provider}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    displayedLetters: uniqueLetters.slice(0, maxItems),
    hiddenCount: Math.max(0, letters.length - maxItems),
    totalCount: letters.length
  };
}

export async function generatePdfReport(
  analysis: MockAnalysis,
  _alternatives: AlternativeOffer[] = [],
  letters: GeneratedLetter[] = [],
  selectedOffer?: SelectedAlternativeOffer | null
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

  if (selectedOffer) {
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("2. Offre retenue pour comparaison", 20, y);

    y += 10;
    doc.setFillColor(lightSage[0], lightSage[1], lightSage[2]);
    doc.roundedRect(20, y, 170, 42, 3, 3, "F");
    doc.setFontSize(10);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFont("helvetica", "bold");
    doc.text(
      truncateText(`${selectedOffer.provider ?? "Offre"} - ${selectedOffer.name ?? "retenue"}`, 75),
      28,
      y + 9
    );
    doc.setFont("helvetica", "normal");
    doc.text(`Prix mensuel: ${formatCurrency(selectedOffer.monthlyPrice)}`, 28, y + 18);
    doc.text(
      `Economie estimee: ${formatCurrency(selectedOffer.estimatedYearlySaving)} / an`,
      100,
      y + 18
    );
    doc.text(
      `Soit environ ${formatCurrency(selectedOffer.estimatedYearlySaving / 12)} / mois`,
      100,
      y + 26
    );
    doc.text(
      "Cette estimation permet de mesurer le gain potentiel par rapport au contrat actuel.",
      28,
      y + 34
    );
    if (selectedOffer.url) {
      doc.text(truncateText(`Lien: ${selectedOffer.url}`, 95), 28, y + 40);
    }

    y += 55;
  }

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(selectedOffer ? "3. Postes retrouvés" : "2. Postes retrouvés", 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Fournisseur / libellé", 25, y);
  doc.text("Catégorie", 82, y);
  doc.text("Mensuel", 140, y);
  doc.text("Annuel", 170, y);

  doc.setDrawColor(200, 200, 200);
  doc.line(20, y + 2, 190, y + 2);

  y += 8;
  doc.setFont("helvetica", "normal");
  analysis.expenses.slice(0, 15).forEach((expense) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(truncateText(expense.label, 30, "Dépense"), 25, y);
    doc.text(expenseCategoryLabels[expense.category] || expense.category, 82, y);
    doc.text(formatCurrency(expense.monthlyAmount), 140, y);
    doc.text(formatCurrency(expense.yearlyAmount), 170, y);
    y += 7;
  });

  y += 15;

  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(selectedOffer ? "4. Recommandations prioritaires" : "3. Recommandations prioritaires", 20, y);

  y += 10;
  analysis.recommendations.slice(0, 5).forEach((recommendation) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

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
    const lines = doc.splitTextToSize(recommendation.description, 160);
    doc.text(lines, 25, y + 13);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 120, 0);
    doc.text(
      `Piste: ${formatCurrency(recommendation.potentialSaving)}/an`,
      148,
      y + 7
    );

    y += 30;
  });

  const preparedLettersSummary = getSyntheticPreparedLetters(letters);

  if (preparedLettersSummary.totalCount > 0) {
    y += 8;
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Courriers préparés", 20, y);

    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`${preparedLettersSummary.totalCount} démarches prêtes à utiliser.`, 25, y);
    y += 8;

    const preparedAt = new Date(analysis.generatedAt).toLocaleDateString("fr-FR");
    preparedLettersSummary.displayedLetters.forEach((letter) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.text(
        truncateText(`• ${getLetterTypeLabel(letter.type)} - ${letter.title ?? "Démarche"}`, 90),
        25,
        y
      );
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(
        truncateText(
          `${expenseCategoryLabels[letter.category] || letter.category || "Catégorie"} - ${
            letter.provider || "Fournisseur"
          } - Préparée le ${preparedAt}`,
          100
        ),
        30,
        y
      );
      y += 9;
    });

    if (preparedLettersSummary.hiddenCount > 0) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(
        `+ ${preparedLettersSummary.hiddenCount} autres courriers disponibles dans l'espace Courriers`,
        25,
        y
      );
    }
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
