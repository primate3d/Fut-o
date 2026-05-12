"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileSearch,
  Lightbulb,
  Loader2,
  RefreshCw,
  SearchCheck
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { StatCard } from "@/components/ui/StatCard";
import type { AlternativeOffer } from "@/features/recommendations/service";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import { formatCurrency } from "@/lib/utils";
import type { MockAnalysis } from "@/types";
import {
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  hasUsableAnalysis,
  isAnalysisForDocuments,
  storeMockAnalysis
} from "./storage";

const DEBUG_FLOW = process.env.NODE_ENV !== "production";

function debugFlow(message: string, metadata?: Record<string, unknown>) {
  if (DEBUG_FLOW) {
    console.debug(`[Futéo flow] Résultats - ${message}`, metadata ?? {});
  }
}

export function ResultsPanel() {
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [alternativesUpdatedAt, setAlternativesUpdatedAt] = useState<string | null>(null);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);

  async function loadAlternatives(analysisToLoad: MockAnalysis) {
    setIsLoadingAlternatives(true);
    setServiceMessage(null);

    try {
      const response = await fetch("/api/alternatives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expenses: analysisToLoad.expenses })
      });

      if (!response.ok) {
        throw new Error("Service alternatives indisponible.");
      }

      const payload = (await response.json()) as {
        alternatives?: AlternativeOffer[];
      };

      setAlternatives(payload.alternatives ?? []);
      setAlternativesUpdatedAt(new Date().toISOString());
    } catch {
      setAlternatives([]);
      setServiceMessage(
        "Les alternatives détaillées ne sont pas disponibles pour le moment. Vous pouvez continuer avec les pistes déjà identifiées."
      );
    } finally {
      setIsLoadingAlternatives(false);
    }
  }

  useEffect(() => {
    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasCurrentAnalysis =
      isAnalysisForDocuments(storedAnalysis, documents) &&
      hasUsableAnalysis(storedAnalysis);

    debugFlow("état local", {
      documentCount: documents.length,
      documentIds: documents.map((document) => document.id),
      hasStoredAnalysis: Boolean(storedAnalysis),
      hasCurrentAnalysis
    });

    setAnalysis(hasCurrentAnalysis ? storedAnalysis : null);

    if (storedAnalysis && hasCurrentAnalysis) {
      void loadAlternatives(storedAnalysis);
    }

    async function loadServerState() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const serverAnalysis = await getStoredAnalysisServer();
      const hasServerAnalysis =
        isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
        hasUsableAnalysis(serverAnalysis);

      debugFlow("état serveur/local après sync", {
        documentCount: serverDocuments.length,
        documentIds: serverDocuments.map((document) => document.id),
        hasServerAnalysis: Boolean(serverAnalysis),
        hasCurrentServerAnalysis: hasServerAnalysis
      });

      if (serverDocuments.length === 0) {
        setAnalysis(null);
        setAlternatives([]);
        return;
      }

      if (hasServerAnalysis && serverAnalysis) {
        storeMockAnalysis(serverAnalysis);
        setAnalysis(serverAnalysis);
        void loadAlternatives(serverAnalysis);
      }
    }

    void loadServerState();
  }, []);

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
    [analysis]
  );
  const topExpenses = useMemo(
    () => (analysis ? getTopExpenses(analysis.expenses, 5) : []),
    [analysis]
  );
  const bestAlternativeByCategory = useMemo(() => {
    return alternatives.reduce<Partial<Record<string, AlternativeOffer>>>(
      (bestOffers, offer) => {
        const currentOffer = bestOffers[offer.category];
        if (
          !currentOffer ||
          offer.estimatedYearlySaving > currentOffer.estimatedYearlySaving
        ) {
          bestOffers[offer.category] = offer;
        }

        return bestOffers;
      },
      {}
    );
  }, [alternatives]);

  if (!analysis || analysis.expenses.length === 0) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez les documents que vous souhaitez comparer pour afficher vos résultats."
        icon={<FileSearch size={24} />}
        title="Vos résultats apparaîtront ici"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">
            Ce qui mérite votre attention
          </h1>
          <p className="mt-2 text-slate-600">
            Lecture préparée à partir des documents que vous avez ajoutés.
          </p>
        </div>
        <Button href="/courriers">Préparer mes courriers</Button>
      </div>

      {serviceMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900">
          {serviceMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total mensuel estimé"
          value={formatCurrency(analysis.totalMonthlyAmount)}
        />
        <StatCard
          label="Total annuel estimé"
          value={formatCurrency(analysis.totalYearlyAmount)}
        />
        <StatCard
          helper="Estimation à confirmer"
          icon={<Lightbulb size={22} />}
          label="Pistes d'économies"
          value={formatCurrency(analysis.yearlyPotentialSavings)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-navy-900">
            Postes à comparer
          </h2>
          <div className="mt-4 space-y-3">
            {categorySummaries.map((summary) => {
              const bestOffer = bestAlternativeByCategory[summary.category];

              return (
                <div className="rounded-lg border border-navy-100 p-4" key={summary.category}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-navy-900">{summary.label}</p>
                    <p className="font-semibold text-navy-900">
                      {formatCurrency(summary.monthlyTotal)} / mois
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatCurrency(summary.yearlyTotal)} / an
                  </p>
                  {bestOffer ? (
                    <div className="mt-4 rounded-lg bg-sage-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                        Meilleure offre repérée
                      </p>
                      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <ProviderLogo
                            logoUrl={bestOffer.logoUrl}
                            provider={bestOffer.provider}
                          />
                          <div>
                            <p className="font-semibold text-navy-900">{bestOffer.name}</p>
                            <p className="text-sm text-slate-600">
                              {bestOffer.provider} - {formatCurrency(bestOffer.monthlyPrice)} / mois
                            </p>
                          </div>
                        </div>
                        <a
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-100"
                          href={bestOffer.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Voir l'offre <ExternalLink size={15} />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy-900">
            Contrats qui pèsent le plus
          </h2>
          <div className="mt-4 space-y-3">
            {topExpenses.map((expense) => {
              const bestOffer = bestAlternativeByCategory[expense.category];

              return (
                <div className="rounded-lg border border-transparent bg-white p-3" key={expense.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo
                        logoUrl={getProviderBranding(expense.provider).logoUrl}
                        provider={expense.provider}
                      />
                      <div>
                        <p className="font-medium text-navy-900">{expense.label}</p>
                        <p className="text-sm text-slate-500">
                          {expenseCategoryLabels[expense.category]} - {expense.provider}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-navy-900">
                      {formatCurrency(expense.yearlyAmount)} / an
                    </p>
                  </div>
                  {bestOffer ? (
                    <a
                      className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-sage-50 px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-100"
                      href={bestOffer.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Comparer avec {bestOffer.provider} <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              );
            })}
            {isLoadingAlternatives && alternatives.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-sage-50 p-3 text-sm font-medium text-slate-600">
                <Loader2 className="animate-spin text-sage-700" size={16} />
                Recherche des liens d'offres...
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-amber-600" size={22} />
          <h2 className="text-lg font-semibold text-navy-900">Points à vérifier</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {analysis.anomalies.length > 0 ? (
            analysis.anomalies.map((anomaly) => (
              <div className="rounded-lg bg-amber-50 p-4" key={anomaly.id}>
                <Badge tone={anomaly.severity === "high" ? "amber" : "neutral"}>
                  {anomaly.severity}
                </Badge>
                <h3 className="mt-3 font-semibold text-navy-900">{anomaly.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {anomaly.description}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Aucun point prioritaire n'apparaît pour le moment.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <SearchCheck className="text-sage-700" size={22} />
              <h2 className="text-lg font-semibold text-navy-900">
                Alternatives à comparer
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ces pistes servent de base à une comparaison ou à une négociation.
              Vous gardez toujours la décision finale.
            </p>
            {alternativesUpdatedAt ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Actualisé à{" "}
                {new Date(alternativesUpdatedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            ) : null}
          </div>
          <Button
            disabled={isLoadingAlternatives}
            onClick={() => void loadAlternatives(analysis)}
            type="button"
            variant="secondary"
          >
            {isLoadingAlternatives ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Actualiser
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {isLoadingAlternatives && alternatives.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-navy-100 p-4 text-sm font-medium text-slate-600">
              <Loader2 className="animate-spin text-sage-700" size={18} />
              Recherche des offres concurrentes...
            </div>
          ) : alternatives.length > 0 ? (
            alternatives.map((offer) => (
              <div className="rounded-lg border border-navy-100 p-4" key={offer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Badge tone="green">{expenseCategoryLabels[offer.category]}</Badge>
                  <p className="font-semibold text-sage-700">
                    {formatCurrency(offer.estimatedYearlySaving)} / an
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProviderLogo logoUrl={offer.logoUrl} provider={offer.provider} />
                  <div>
                    <h3 className="font-semibold text-navy-900">{offer.name}</h3>
                    <p className="text-sm text-slate-500">
                      {offer.provider} - {formatCurrency(offer.monthlyPrice)} / mois
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {offer.reason}
                </p>
                <p className="mt-2 text-sm font-medium text-navy-900">
                  {offer.action}
                </p>
                <a
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
                  href={offer.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Voir l'offre <ExternalLink size={15} />
                </a>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              Aucune alternative détaillée disponible pour l'instant.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4">
        <h2 className="text-xl font-semibold text-navy-900">
          Actions recommandées
        </h2>
        {analysis.recommendations.map((recommendation) => (
          <Card key={recommendation.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge tone={recommendation.priority === "high" ? "green" : "blue"}>
                  Priorité {recommendation.priority}
                </Badge>
                <h3 className="mt-4 text-xl font-semibold text-navy-900">
                  {recommendation.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {recommendation.description}
                </p>
              </div>
              <p className="text-2xl font-bold text-sage-700">
                {formatCurrency(recommendation.potentialSaving)}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
