"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSearch, Lightbulb, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import type { AlternativeOffer } from "@/features/recommendations/service";
import { getStoredUploadedDocuments } from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { formatCurrency } from "@/lib/utils";
import type { MockAnalysis } from "@/types";
import { getStoredMockAnalysis, isAnalysisForDocuments } from "./storage";

export function ResultsPanel() {
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
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

    async function loadAlternatives() {
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
      } catch {
        setAlternatives([]);
        setServiceMessage(
          "Les alternatives détaillées seront affichées quand le service de comparaison sera connecté."
        );
      }
    }

    void loadAlternatives();
  }, []);

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
    [analysis]
  );
  const topExpenses = useMemo(
    () => (analysis ? getTopExpenses(analysis.expenses, 5) : []),
    [analysis]
  );

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
            {categorySummaries.map((summary) => (
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
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-navy-900">
            Contrats qui pèsent le plus
          </h2>
          <div className="mt-4 space-y-3">
            {topExpenses.map((expense) => (
              <div className="flex items-center justify-between gap-4" key={expense.id}>
                <div>
                  <p className="font-medium text-navy-900">{expense.label}</p>
                  <p className="text-sm text-slate-500">
                    {expenseCategoryLabels[expense.category]} - {expense.provider}
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
        <div className="flex items-center gap-2">
          <SearchCheck className="text-sage-700" size={22} />
          <h2 className="text-lg font-semibold text-navy-900">
            Alternatives à comparer
          </h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Ces pistes servent de base à une comparaison ou à une négociation. Vous
          gardez toujours la décision finale.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {alternatives.length > 0 ? (
            alternatives.map((offer) => (
              <div className="rounded-lg border border-navy-100 p-4" key={offer.id}>
                <Badge tone="green">{expenseCategoryLabels[offer.category]}</Badge>
                <h3 className="mt-3 font-semibold text-navy-900">{offer.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{offer.provider}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {offer.reason}
                </p>
                <p className="mt-3 font-semibold text-sage-700">
                  {formatCurrency(offer.monthlyPrice)} / mois
                </p>
                <p className="mt-2 text-sm font-medium text-navy-900">
                  {offer.action}
                </p>
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
