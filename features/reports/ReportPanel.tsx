"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSearch, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addAnalysisToReportPortfolio,
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  getStoredReportPortfolioAnalysis,
  hasDocumentProfiles,
  isAnalysisForDocuments,
  refreshStoredAnalysisServer,
  storeMockAnalysis
} from "@/features/analysis";
import { getStoredAccessKey, isDiscoveryPlan } from "@/features/billing/access-keys";
import { generateLettersFromAnalysis } from "@/features/letters/service";
import type { AlternativeOffer } from "@/features/recommendations/service";
import { findAlternativeOffers } from "@/features/recommendations/service";
import {
  getSelectedAlternativeOffer,
  refreshSelectedAlternativeOffer,
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import {
  addAuditActionLog,
  getAuditActionLogs,
  type AuditActionLog
} from "@/features/privacy/action-log";
import { purgeSourceDocuments } from "@/features/privacy/lifecycle";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import type { GeneratedLetter, MockAnalysis } from "@/types";
import { generatePdfReport } from "./service";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
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

function applyAlternativeSavings(analysis: MockAnalysis, alternatives: AlternativeOffer[]) {
  const bestSavingByExpense = alternatives.reduce<Record<string, number>>((savings, offer) => {
    const expenseId = getExpenseIdFromAlternativeId(offer, analysis);
    if (!expenseId) return savings;

    savings[expenseId] = Math.max(savings[expenseId] ?? 0, offer.estimatedYearlySaving);
    return savings;
  }, {});

  return {
    ...analysis,
    yearlyPotentialSavings: Object.values(bestSavingByExpense).reduce(
      (total, saving) => total + Math.max(0, saving),
      0
    )
  };
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

function isManualAnalysis(analysis: MockAnalysis | null) {
  return Boolean(
    analysis?.documents.some((document) => document.mimeType === "manual/input")
  );
}

function formatActionDate(createdAt: string) {
  return new Date(createdAt).toLocaleDateString("fr-FR");
}

export function ReportPanel() {
  const router = useRouter();
  const isDiscoveryAccess = isDiscoveryPlan(getStoredAccessKey()?.plan);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<SelectedAlternativeOffer | null>(null);
  const [recommendedLetters, setRecommendedLetters] = useState<GeneratedLetter[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [sourcePurgeMessage, setSourcePurgeMessage] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<AuditActionLog[]>([]);

  useEffect(() => {
    if (isDiscoveryAccess) return;

    setActionLogs(getAuditActionLogs());

    const retainedOffer = getSelectedAlternativeOffer();
    setSelectedOffer(retainedOffer);

    const activeAnalysis = getStoredMockAnalysis();
    if (activeAnalysis) {
      addAnalysisToReportPortfolio(activeAnalysis);
    }
    const portfolioAnalysis = getStoredReportPortfolioAnalysis();
    const storedAnalysis = portfolioAnalysis ?? activeAnalysis;
    const documents = getStoredUploadedDocuments();
    const hasManualAnalysis = isManualAnalysis(storedAnalysis);
    const hasCurrentAnalysis =
      Boolean(portfolioAnalysis) ||
      (isAnalysisForDocuments(storedAnalysis, documents) &&
        hasDocumentProfiles(storedAnalysis));

    setAnalysis(hasCurrentAnalysis || hasManualAnalysis ? storedAnalysis : null);

    if ((!storedAnalysis || !hasCurrentAnalysis) && !hasManualAnalysis) {
      async function loadServerState() {
        const serverDocuments = await getStoredUploadedDocumentsServer();
        const readyServerDocuments = serverDocuments.filter(
          (document) => document.status === "ready"
        );
        const serverAnalysis =
          (await getStoredAnalysisServer()) ??
          (readyServerDocuments.length > 0
            ? await refreshStoredAnalysisServer(readyServerDocuments)
            : null);

        if (
          isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
          serverAnalysis &&
          !isManualAnalysis(getStoredMockAnalysis())
        ) {
          const allAlternatives = findAlternativeOffers(serverAnalysis.expenses);
          const refreshedOffer = refreshSelectedAlternativeOffer(retainedOffer, allAlternatives);
          const analysisWithSavings = applyAlternativeSavings(serverAnalysis, allAlternatives);
          storeMockAnalysis(serverAnalysis);
          setAnalysis(analysisWithSavings);
          setAlternatives(allAlternatives);
          setSelectedOffer(refreshedOffer);
          setRecommendedLetters(
            generateLettersFromAnalysis(serverAnalysis, refreshedOffer).slice(0, 5)
          );
        }
      }

      void loadServerState();
      return;
    }

    if (!storedAnalysis) {
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

        const allAlternatives = alternativesPayload.alternatives ?? [];
        const refreshedOffer = refreshSelectedAlternativeOffer(retainedOffer, allAlternatives);
        const analysisWithSavings = applyAlternativeSavings(analysisToLoad, allAlternatives);
        setAlternatives(allAlternatives);
        setSelectedOffer(refreshedOffer);
        setAnalysis(analysisWithSavings);
        setRecommendedLetters(
          refreshedOffer
            ? generateLettersFromAnalysis(analysisWithSavings, refreshedOffer).slice(0, 5)
            : (lettersPayload.letters ?? []).slice(0, 5)
        );
      } catch {
        const allAlternatives = findAlternativeOffers(analysisToLoad.expenses);
        const refreshedOffer = refreshSelectedAlternativeOffer(retainedOffer, allAlternatives);
        const analysisWithSavings = applyAlternativeSavings(analysisToLoad, allAlternatives);
        setAlternatives(allAlternatives);
        setSelectedOffer(refreshedOffer);
        setAnalysis(analysisWithSavings);
        setRecommendedLetters(
          generateLettersFromAnalysis(analysisWithSavings, refreshedOffer).slice(0, 5)
        );
        setServiceMessage(
          "Rapport préparé localement. Les services externes de comparaison, d'email et de stockage seront connectés ensuite."
        );
      }
    }

    void loadConnectedData();
  }, [isDiscoveryAccess]);

  async function handleDownload() {
    if (!analysis) return;
    setIsDownloading(true);
    try {
      await generatePdfReport(
        analysis,
        alternatives,
        recommendedLetters,
        selectedOffer,
        actionLogs
      );
      setActionLogs(
        addAuditActionLog({
          type: "report_downloaded",
          label: "Rapport téléchargé",
          documentName: analysis.documents.map((document) => document.fileName).join(", ")
        })
      );
      const purged = await purgeSourceDocuments();
      if (purged) {
        setSourcePurgeMessage(
          "Sécurité : vos documents sources ont été définitivement effacés de nos serveurs. Pour toute modification ou nouvelle démarche, il vous suffit de réimporter votre document."
        );
      } else {
        setServiceMessage(
          "Le rapport a été généré, mais la suppression automatique du document source n'a pas pu être confirmée."
        );
      }
    } catch (error) {
      console.error("Erreur PDF:", error);
      setServiceMessage("Le PDF n'a pas pu être généré. Vous pouvez utiliser l'impression navigateur.");
    } finally {
      setIsDownloading(false);
    }
  }

  function handlePrepareFollowup(action: AuditActionLog) {
    if (!action.letterSnapshot) return;
    router.push(`/courriers?relance=${encodeURIComponent(action.id)}`);
  }

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
    [analysis]
  );
  const topExpenses = useMemo(
    () => (analysis ? getTopExpenses(analysis.expenses, 5) : []),
    [analysis]
  );

  if (isDiscoveryAccess) {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-navy-900">
          Rapport complet non inclus dans l&apos;accès Découverte
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Votre aperçu gratuit permet d&apos;identifier une économie potentielle.
          Passez à Audit Foyer ou Audit Famille pour obtenir le rapport complet et
          préparer vos démarches.
        </p>
        <Button className="mt-6" href="/tarifs">
          Débloquer mon audit complet
        </Button>
      </Card>
    );
  }

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
  const contractComparisons = analysis.expenses
    .map((expense) => ({
      expense,
      offer: getBestAlternativeForExpense(expense.id, alternatives, analysis)
    }));
  const summaryStats = [
    { label: "Total mensuel estimé", value: formatCurrency(analysis.totalMonthlyAmount) },
    { label: "Total annuel estimé", value: formatCurrency(analysis.totalYearlyAmount) },
    { label: "Pistes annuelles", value: formatCurrency(analysis.yearlyPotentialSavings) },
    { label: "Postes détectés", value: `${analysis.expenses.length}` },
    { label: "Points à vérifier", value: `${analysis.anomalies.length}` }
  ];

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

      {serviceMessage && !serviceMessage.startsWith("Rapport préparé localement") ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900 print:hidden">
          {serviceMessage}
        </div>
      ) : null}

      {sourcePurgeMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-medium leading-6 text-sage-900 print:hidden">
          {sourcePurgeMessage}
        </div>
      ) : null}

      <Card className="print:shadow-none">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="rounded-xl bg-sage-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              Score d'optimisation
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{score}</p>
            <div className="mt-4">
              <Badge tone={scoreBadge.tone}>{scoreBadge.label}</Badge>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-navy-900">Résumé global</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              L'analyse a fait ressortir {analysis.expenses.length} poste(s),{" "}
              {analysis.anomalies.length} point(s) à vérifier et{" "}
              <span className="whitespace-nowrap font-medium">
                {formatCurrency(analysis.yearlyPotentialSavings)}
              </span>{" "}
              de pistes
              d'économies annuelles. Ces montants servent à prioriser les contrats
              à regarder en premier.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4">
        {summaryStats.map((stat) => (
          <Card className="min-h-28 min-w-[180px] flex-1 p-5 print:shadow-none" key={stat.label}>
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-2 whitespace-nowrap text-xl font-semibold text-slate-800 md:text-2xl">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      {contractComparisons.length > 0 ? (
        <Card className="border-sage-200 bg-white p-4 print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Vos pistes d&apos;économies par contrat
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Chaque contrat analysé apparaît ci-dessous, y compris lorsqu&apos;aucune
            offre plus compétitive n&apos;a été identifiée.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {contractComparisons.map(({ expense, offer }) => {
              const hasSaving = Boolean(offer && offer.estimatedYearlySaving > 0);

              return (
                <div
                  className="flex w-full flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
                  key={expense.id}
                >
                  <p
                    className={`min-w-0 flex-1 text-sm font-semibold md:text-base ${
                      hasSaving ? "text-slate-800" : "text-slate-600"
                    }`}
                  >
                    {normalizeDisplayText(expense.label)} —{" "}
                    {normalizeDisplayText(expense.provider)} (
                    {formatCurrency(expense.monthlyAmount)}/mois)
                  </p>
                  <p
                    className="min-w-0 flex-1 text-xs text-slate-500 md:text-sm"
                  >
                    {hasSaving && offer
                      ? `Alternative : ${normalizeDisplayText(offer.provider)} - ${normalizeDisplayText(offer.name)}`
                      : "Déjà optimisé : aucune offre plus compétitive"}
                  </p>
                  <p
                    className={`shrink-0 whitespace-nowrap text-sm font-semibold md:text-base ${
                      hasSaving ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
                    {hasSaving
                      ? `+ ${formatCurrency(offer?.estimatedYearlySaving ?? 0)} / an`
                      : formatCurrency(0)}
                  </p>
                </div>
              );
            })}
            <div className="mt-3 flex w-full flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-slate-700">
                💰 Total de vos économies annuelles potentielles
              </p>
              <p className="whitespace-nowrap text-base font-bold text-emerald-600">
                + {formatCurrency(analysis.yearlyPotentialSavings)} / an
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {priorityRecommendations.length > 0 ? (
        <Card className="print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Recommandations prioritaires
          </h2>
          <div className="mt-4 space-y-4">
            {priorityRecommendations.map((recommendation) => (
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
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:break-inside-avoid">
        <Card className="p-4 print:break-inside-avoid print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Dépenses par catégorie
          </h2>
          <div className="mt-3 space-y-2">
            {categorySummaries.map((summary) => (
              <div className="rounded-lg border border-navy-100 bg-white p-3" key={summary.category}>
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-navy-900">{summary.label}</p>
                  <p className="whitespace-nowrap font-semibold text-slate-700">
                    {formatCurrency(summary.monthlyTotal)} / mois
                  </p>
                </div>
                <p className="mt-1 whitespace-nowrap text-sm text-slate-500">
                  {formatCurrency(summary.yearlyTotal)} / an
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 print:break-inside-avoid print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">Top 5 dépenses</h2>
          <div className="mt-3 space-y-2">
            {topExpenses.map((expense, index) => (
              <div
                className="flex items-center justify-between gap-4 rounded-lg border border-navy-100 bg-white p-3"
                key={expense.id}
              >
                <div>
                  <p className="text-xs font-bold text-sage-700">#{index + 1}</p>
                  <p className="font-medium text-navy-900">
                    {normalizeDisplayText(expense.label)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {normalizeDisplayText(expense.provider)} - {expenseCategoryLabels[expense.category]}
                  </p>
                </div>
                <p className="whitespace-nowrap font-semibold text-slate-700">
                  {formatCurrency(expense.yearlyAmount)} / an
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="print:shadow-none">
        <h2 className="text-xl font-semibold text-navy-900">
          Historique de vos démarches
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Les actions réalisées pendant cette session apparaissent ici pour garder
          une trace claire des courriers et rapports générés.
        </p>
        <div className="mt-4 space-y-3">
          {actionLogs.length > 0 ? (
            actionLogs.map((action) => (
              <div
                className="flex flex-col gap-3 rounded-lg border border-navy-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                key={action.id}
              >
                <div>
                  <p className="font-semibold text-navy-900">{action.label}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatActionDate(action.createdAt)}
                    {action.provider ? ` - ${normalizeDisplayText(action.provider)}` : ""}
                    {action.documentName ? ` - ${action.documentName}` : ""}
                  </p>
                </div>
                {action.letterSnapshot ? (
                  <Button
                    onClick={() => handlePrepareFollowup(action)}
                    type="button"
                    variant="secondary"
                  >
                    Préparer une relance
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Aucun téléchargement enregistré pendant cette session.
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}
