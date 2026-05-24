"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileSearch, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import {
  getStoredAnalysisServer,
  getStoredMockAnalysis,
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
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import {
  addAuditActionLog,
  getAuditActionLogs,
  queueLetterFollowup,
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

    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasCurrentAnalysis =
      isAnalysisForDocuments(storedAnalysis, documents) &&
      hasDocumentProfiles(storedAnalysis);

    setAnalysis(hasCurrentAnalysis ? storedAnalysis : null);

    if (!storedAnalysis || !hasCurrentAnalysis) {
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

        if (isAnalysisForDocuments(serverAnalysis, serverDocuments) && serverAnalysis) {
          storeMockAnalysis(serverAnalysis);
          setAnalysis(serverAnalysis);
          setAlternatives(findAlternativeOffers(serverAnalysis.expenses).slice(0, 5));
          setRecommendedLetters(
            generateLettersFromAnalysis(serverAnalysis, retainedOffer).slice(0, 5)
          );
        }
      }

      void loadServerState();
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
        setRecommendedLetters(
          retainedOffer
            ? generateLettersFromAnalysis(analysisToLoad, retainedOffer).slice(0, 5)
            : (lettersPayload.letters ?? []).slice(0, 5)
        );
      } catch {
        setAlternatives(findAlternativeOffers(analysisToLoad.expenses).slice(0, 5));
        setRecommendedLetters(
          generateLettersFromAnalysis(analysisToLoad, retainedOffer).slice(0, 5)
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
    if (!queueLetterFollowup(action)) return;
    router.push("/courriers");
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
  const preparedAt = new Date(analysis.generatedAt).toLocaleDateString("fr-FR");
  const preparedLettersSummary = getSyntheticPreparedLetters(recommendedLetters);

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

      {selectedOffer ? (
        <Card className="border-sage-200 bg-sage-50 print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Offre retenue pour comparaison
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Cette estimation permet de mesurer le gain potentiel par rapport à votre contrat actuel.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                Fournisseur
              </p>
              <p className="mt-1 font-semibold text-navy-900">{selectedOffer.provider}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                Offre
              </p>
              <p className="mt-1 font-semibold text-navy-900">{selectedOffer.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                Prix mensuel
              </p>
              <p className="mt-1 font-semibold text-navy-900">
                {formatCurrency(selectedOffer.monthlyPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                Économie annuelle
              </p>
              <p className="mt-1 text-xl font-bold text-sage-700">
                {formatCurrency(selectedOffer.estimatedYearlySaving)} / an
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                Économie mensuelle
              </p>
              <p className="mt-1 text-xl font-bold text-sage-700">
                {formatCurrency(selectedOffer.estimatedYearlySaving / 12)} / mois
              </p>
            </div>
          </div>
          {selectedOffer.url ? (
            <a
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-100"
              href={selectedOffer.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              Voir l'offre retenue <ExternalLink size={15} />
            </a>
          ) : null}
        </Card>
      ) : null}

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
        <h2 className="text-xl font-semibold text-navy-900">Courriers préparés</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {preparedLettersSummary.totalCount > 0
            ? `${preparedLettersSummary.totalCount} démarches prêtes à utiliser.`
            : "Les courriers préparés apparaîtront ici après génération."}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {preparedLettersSummary.displayedLetters.length > 0 ? (
            preparedLettersSummary.displayedLetters.map((letter) => (
              <div className="rounded-lg bg-navy-50 p-4" key={letter.id}>
                <p className="font-semibold text-navy-900">
                  {getLetterTypeLabel(letter.type)} - {letter.title}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {expenseCategoryLabels[letter.category]} - {letter.provider}
                </p>
                <p className="mt-2 text-sm font-medium text-sage-700">
                  Préparée le {preparedAt}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Les courriers apparaîtront ici après génération.
            </p>
          )}
        </div>
        {preparedLettersSummary.hiddenCount > 0 ? (
          <p className="mt-3 text-sm font-medium text-slate-600">
            + {preparedLettersSummary.hiddenCount} autres courriers disponibles dans l'espace Courriers
          </p>
        ) : null}
      </Card>

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
                    {action.provider ? ` - ${action.provider}` : ""}
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
