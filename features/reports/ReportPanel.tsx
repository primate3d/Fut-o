"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSearch, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { getStoredMockAnalysis, isAnalysisForDocuments } from "@/features/analysis";
import { generateLettersFromAnalysis } from "@/features/letters/service";
import type { AlternativeOffer } from "@/features/recommendations/service";
import { findAlternativeOffers } from "@/features/recommendations/service";
import { getStoredUploadedDocuments } from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { formatCurrency } from "@/lib/utils";
import type { GeneratedLetter, MockAnalysis } from "@/types";
import { generatePdfReport } from "./service";

function getOptimizationScore(analysis: MockAnalysis) {
  if (analysis.totalYearlyAmount <= 0) {
    return 100;
  }

  const savingRatio = analysis.yearlyPotentialSavings / analysis.totalYearlyAmount;
  return Math.max(0, Math.min(100, Math.round(100 - savingRatio * 220)));
}

function getScoreBadge(score: number) {
  if (score >= 75) {
    return { label: "Bon", tone: "green" as const };
  }

  if (score >= 50) {
    return { label: "À optimiser", tone: "amber" as const };
  }

  return { label: "Prioritaire", tone: "neutral" as const };
}

const actionPlan = [
  "Comparer les contrats les plus chers",
  "Préparer une négociation quand c'est pertinent",
  "Résilier les abonnements inutiles",
  "Refaire un point dans quelques mois"
];

export function ReportPanel() {
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [recommendedLetters, setRecommendedLetters] = useState<GeneratedLetter[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);

  useEffect(() => {
    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasCurrentAnalysis = isAnalysisForDocuments(storedAnalysis, documents);

    setAnalysis(hasCurrentAnalysis ? storedAnalysis : null);

    if (!storedAnalysis || !hasCurrentAnalysis) {
      return;
    }

    const analysisToLoad = storedAnalysis;

    async function loadConnectedData() {
      try {
        const [alternativesResponse, lettersResponse] = await Promise.all([
          fetch("/api/alternatives", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ expenses: analysisToLoad.expenses })
          }),
          fetch("/api/courriers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ analysis: analysisToLoad })
          })
        ]);

        if (!alternativesResponse.ok || !lettersResponse.ok) {
          throw new Error("Services connectés indisponibles.");
        }

        const alternativesPayload = (await alternativesResponse.json()) as {
          alternatives?: AlternativeOffer[];
        };
        const lettersPayload = (await lettersResponse.json()) as {
          letters?: GeneratedLetter[];
        };

        setAlternatives((alternativesPayload.alternatives ?? []).slice(0, 5));
        setRecommendedLetters((lettersPayload.letters ?? []).slice(0, 5));
      } catch {
        setAlternatives(findAlternativeOffers(analysisToLoad.expenses).slice(0, 5));
        setRecommendedLetters(generateLettersFromAnalysis(analysisToLoad).slice(0, 5));
        setServiceMessage(
          "Rapport préparé localement. Les services externes de comparaison, d'email et de stockage seront connectés ensuite."
        );
      }
    }

    void loadConnectedData();
  }, []);

  async function handleDownload() {
    if (!analysis) return;
    setIsDownloading(true);
    try {
      await generatePdfReport(analysis, alternatives, recommendedLetters);
    } catch (error) {
      console.error("Erreur PDF:", error);
      setServiceMessage("Le PDF n'a pas pu être généré. Vous pouvez utiliser l'impression navigateur.");
    } finally {
      setIsDownloading(false);
    }
  }

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
    [analysis]
  );
  const topExpenses = useMemo(
    () => (analysis ? getTopExpenses(analysis.expenses, 5) : []),
    [analysis]
  );

  if (!analysis) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez les documents que vous souhaitez comparer pour obtenir votre rapport."
        icon={<FileSearch size={24} />}
        title="Votre rapport sera prêt après l'analyse"
      />
    );
  }

  const score = getOptimizationScore(analysis);
  const scoreBadge = getScoreBadge(score);
  const priorityRecommendations = analysis.recommendations
    .filter((recommendation) => recommendation.priority !== "low")
    .slice(0, 4);

  return (
    <section className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">Rapport Futéo</h1>
          <p className="mt-2 text-slate-600">
            Synthèse générée le{" "}
            {new Date(analysis.generatedAt).toLocaleDateString("fr-FR")} à partir
            des documents ajoutés.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <Button disabled={isDownloading} onClick={handleDownload} type="button">
            {isDownloading ? (
              <Loader2 className="mr-2 animate-spin" size={18} />
            ) : (
              <Download className="mr-2" size={18} />
            )}
            Télécharger le rapport PDF
          </Button>
          <Button onClick={() => window.print()} type="button" variant="secondary">
            <Printer className="mr-2" size={18} />
            Imprimer
          </Button>
        </div>
      </div>

      {serviceMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900 print:hidden">
          {serviceMessage}
        </div>
      ) : null}

      <Card className="print:shadow-none">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="rounded-xl bg-sage-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              Score d'optimisation
            </p>
            <p className="mt-3 text-5xl font-bold text-navy-900">{score}</p>
            <div className="mt-4">
              <Badge tone={scoreBadge.tone}>{scoreBadge.label}</Badge>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-navy-900">Résumé global</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              L'analyse a fait ressortir {analysis.expenses.length} poste(s),{" "}
              {analysis.anomalies.length} point(s) à vérifier et{" "}
              {formatCurrency(analysis.yearlyPotentialSavings)} de pistes
              d'économies annuelles. Ces montants servent à prioriser les contrats
              à regarder en premier.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total mensuel estimé"
          value={formatCurrency(analysis.totalMonthlyAmount)}
        />
        <StatCard label="Total annuel estimé" value={formatCurrency(analysis.totalYearlyAmount)} />
        <StatCard
          label="Pistes annuelles"
          value={formatCurrency(analysis.yearlyPotentialSavings)}
        />
        <StatCard label="Postes détectés" value={`${analysis.expenses.length}`} />
        <StatCard label="Points à vérifier" value={`${analysis.anomalies.length}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Recommandations prioritaires
          </h2>
          <div className="mt-4 space-y-4">
            {priorityRecommendations.length > 0 ? (
              priorityRecommendations.map((recommendation) => (
                <div className="rounded-lg bg-navy-50 p-4" key={recommendation.id}>
                  <Badge tone={recommendation.priority === "high" ? "green" : "blue"}>
                    Priorité {recommendation.priority === "high" ? "haute" : "normale"}
                  </Badge>
                  <h3 className="mt-3 font-semibold text-navy-900">
                    {recommendation.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {recommendation.description}
                  </p>
                  <p className="mt-2 font-semibold text-sage-700">
                    {formatCurrency(recommendation.potentialSaving)} / an
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                Aucune recommandation prioritaire pour le moment.
              </p>
            )}
          </div>
        </Card>

        <Card className="print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">Plan d'action</h2>
          <ol className="mt-4 space-y-3">
            {actionPlan.map((action, index) => (
              <li className="flex gap-3 rounded-lg bg-sage-50 p-4" key={action}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-500 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <span className="font-medium text-navy-900">{action}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Dépenses par catégorie
          </h2>
          <div className="mt-4 space-y-3">
            {categorySummaries.map((summary) => (
              <div className="rounded-lg border border-navy-100 p-4" key={summary.category}>
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-navy-900">{summary.label}</p>
                  <p className="font-semibold text-navy-900">
                    {formatCurrency(summary.monthlyTotal)} / mois
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {formatCurrency(summary.yearlyTotal)} / an
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">Top 5 dépenses</h2>
          <div className="mt-4 space-y-3">
            {topExpenses.map((expense, index) => (
              <div className="flex items-center justify-between gap-4" key={expense.id}>
                <div>
                  <p className="text-xs font-bold text-sage-700">#{index + 1}</p>
                  <p className="font-medium text-navy-900">{expense.label}</p>
                  <p className="text-sm text-slate-500">
                    {expense.provider} - {expenseCategoryLabels[expense.category]}
                  </p>
                </div>
                <p className="font-semibold text-navy-900">
                  {formatCurrency(expense.yearlyAmount)} / an
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="print:shadow-none">
        <h2 className="text-xl font-semibold text-navy-900">
          Alternatives à comparer
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {alternatives.length > 0 ? (
            alternatives.map((offer) => (
              <div className="rounded-lg bg-navy-50 p-4" key={offer.id}>
                <p className="font-semibold text-navy-900">{offer.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {offer.provider} - {formatCurrency(offer.monthlyPrice)} / mois
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {offer.action}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Aucune alternative prioritaire à comparer pour le moment.
            </p>
          )}
        </div>
      </Card>

      <Card className="print:shadow-none">
        <h2 className="text-xl font-semibold text-navy-900">Courriers recommandés</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recommendedLetters.length > 0 ? (
            recommendedLetters.map((letter) => (
              <div className="rounded-lg bg-navy-50 p-4" key={letter.id}>
                <p className="font-semibold text-navy-900">{letter.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {letter.provider} - {formatCurrency(letter.potentialSaving)} / an
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Les courriers apparaîtront ici après génération.
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}
