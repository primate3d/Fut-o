"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FileText,
  Handshake,
  PiggyBank,
  ReceiptText,
  SearchCheck
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { 
  isAnalysisForDocuments,
  getStoredAnalysisServer 
} from "@/features/analysis";
import { getStoredUploadedDocumentsServer } from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getMostExpensiveCategory,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { formatCurrency } from "@/lib/utils";
import type { MockAnalysis, UploadedDocument } from "@/types";

const dashboardImage =
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1800&q=84";
const emptyExpenses: MockAnalysis["expenses"] = [];
const emptyRecommendations: MockAnalysis["recommendations"] = [];

export default function DashboardPage() {
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  useEffect(() => {
    async function load() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const serverAnalysis = await getStoredAnalysisServer();

      setAnalysis(
        isAnalysisForDocuments(serverAnalysis, serverDocuments) ? serverAnalysis : null
      );
      setDocuments(serverDocuments);
    }
    void load();
  }, []);

  const expenses = analysis?.expenses ?? emptyExpenses;
  const recommendations = analysis?.recommendations ?? emptyRecommendations;
  const monthlyTotal = analysis?.totalMonthlyAmount ?? 0;
  const yearlyTotal = analysis?.totalYearlyAmount ?? monthlyTotal * 12;
  const yearlyPotentialSavings = analysis?.yearlyPotentialSavings ?? 0;
  const hasDocuments = documents.length > 0;
  const hasAnalysis = Boolean(analysis);

  const categorySummaries = useMemo(
    () => summarizeExpensesByCategory(expenses),
    [expenses]
  );
  const mostExpensiveCategory = useMemo(
    () => getMostExpensiveCategory(expenses),
    [expenses]
  );
  const maxCategoryMonthlyTotal = categorySummaries[0]?.monthlyTotal ?? 0;
  const firstRecommendation = recommendations[0];

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-[#eadfce] bg-[#fffaf2] shadow-soft">
      <Image
        alt="Documents, ordinateur et calculatrice sur une table de foyer"
        className="object-cover opacity-[0.18]"
        fill
        priority
        sizes="(min-width: 1024px) 960px, 100vw"
        src={dashboardImage}
      />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,250,242,0.98)_0%,rgba(255,250,242,0.92)_45%,rgba(251,246,237,0.78)_100%)]" />

      <div className="relative z-10 space-y-6 p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <Badge tone="green">Espace foyer</Badge>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              Découvrez vos pistes d'économie
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              {hasAnalysis
                ? "Nous avons comparé vos contrats avec les meilleures offres du marché. Découvrez les alternatives plus avantageuses identifiées pour votre foyer et préparez vos démarches."
                : hasDocuments
                  ? "Vos documents sont prêts. Lancez l'analyse pour découvrir les offres les plus intéressantes et les économies que vous pouvez réaliser."
                  : "Commencez par ajouter un contrat ou une facture pour que nous puissions rechercher des offres plus avantageuses."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
            <p className="text-sm font-semibold text-slate-600">
              Prochaine étape conseillée
            </p>
            <p className="mt-2 text-lg font-bold text-navy-900">
              {hasDocuments ? "Lancer ou revoir l'analyse" : "Importer vos documents"}
            </p>
            <Button
              className="mt-4 w-full justify-center"
              href={hasDocuments ? "/analyse" : "/importer"}
            >
              {hasDocuments ? "Voir l'analyse" : "Importer maintenant"}{" "}
              <ArrowRight size={18} />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="bg-white/90">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-sage-100 p-3 text-sage-800">
                <ReceiptText size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Les montants retrouves dans vos documents
                </p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-navy-900">
                  {formatCurrency(monthlyTotal)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  soit une estimation annuelle de{" "}
                  <span className="font-semibold text-navy-900">
                    {formatCurrency(yearlyTotal)}
                  </span>{" "}
                  {hasAnalysis
                    ? "sur les postes retrouves."
                    : "une fois l'analyse lancée."}
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-[#f7efe1]/92">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-white p-3 text-amber-700">
                <PiggyBank size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Ce qu'il faut regarder de près
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-navy-900">
                  {formatCurrency(yearlyPotentialSavings)}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {hasAnalysis
                    ? "de pistes d'économie sur un an, à confirmer avec les offres qui correspondent vraiment à votre foyer."
                    : "de pistes possibles après analyse des documents choisis."}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <Card className="bg-white/90">
              <div className="flex items-center gap-3">
                <SearchCheck className="text-sage-700" size={24} />
                <h2 className="text-xl font-semibold text-navy-900">
                  Ce qui ressort des elements ajoutes
                </h2>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-[#fbf6ed] p-4">
                  <p className="text-sm font-semibold text-slate-500">
                    Le poste qui pèse le plus
                  </p>
                  <p className="mt-1 text-2xl font-bold text-navy-900">
                    {mostExpensiveCategory?.label ?? "Aucun poste retrouve"}
                  </p>
                  {mostExpensiveCategory ? (
                    <p className="mt-2 text-sm text-slate-600">
                      {formatCurrency(mostExpensiveCategory.monthlyTotal)} par mois.
                      C'est le premier endroit à comparer avec les offres actuelles.
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#eadfce] bg-white p-4">
                    <FileText className="text-sage-700" size={21} />
                    <p className="mt-3 text-2xl font-bold text-navy-900">
                      {documents.length}
                    </p>
                    <p className="text-sm text-slate-600">
                      {hasDocuments
                        ? "documents importés pour cet audit"
                        : "document importé pour le moment"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#eadfce] bg-white p-4">
                    <Handshake className="text-sage-700" size={21} />
                    <p className="mt-3 text-2xl font-bold text-navy-900">
                      {recommendations.length}
                    </p>
                    <p className="text-sm text-slate-600">
                      pistes pour garder, négocier ou changer
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="bg-navy-900 text-white">
              <h2 className="text-xl font-semibold">Vos prochaines actions</h2>
              <div className="mt-5 space-y-4">
                {[
                  "Comparer le poste qui pèse le plus avec les offres actuelles.",
                  "Vérifier les abonnements ou options que vous n'utilisez plus.",
                  "Préparer un courrier de négociation avant de changer de fournisseur."
                ].map((action, index) => (
                  <div className="flex gap-3" key={action}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12 text-sm font-bold">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-white/80">{action}</p>
                  </div>
                ))}
              </div>
              <Button
                className="mt-6"
                href={hasAnalysis ? "/resultats" : hasDocuments ? "/analyse" : "/importer"}
                variant="secondary"
              >
                {hasAnalysis
                  ? "Voir ce qu'on a trouvé"
                  : hasDocuments
                    ? "Lancer l'analyse"
                    : "Importer des documents"}{" "}
                <ArrowRight size={18} />
              </Button>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-white/90">
              <h2 className="text-xl font-semibold text-navy-900">
                Vos postes à comparer
              </h2>
              <div className="mt-5 space-y-4">
                {categorySummaries.length > 0 ? (
                  categorySummaries.map((summary) => {
                  const width =
                    maxCategoryMonthlyTotal > 0
                      ? Math.round((summary.monthlyTotal / maxCategoryMonthlyTotal) * 100)
                      : 0;

                  return (
                    <div key={summary.category}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <p className="font-semibold text-navy-900">{summary.label}</p>
                        <p className="text-slate-500">
                          {formatCurrency(summary.monthlyTotal)} / mois
                        </p>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-[#edf1e8]">
                        <div
                          className="h-full rounded-full bg-sage-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(summary.yearlyTotal)} / an à surveiller
                      </p>
                    </div>
                  );
                  })
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    Les postes a comparer apparaitront ici apres traitement des documents ajoutes.
                  </p>
                )}
              </div>
            </Card>

            <Card className="bg-white/90">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-navy-900">
                    Ce qu'on vous conseille de regarder ensuite
                  </h2>
                  {firstRecommendation ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {firstRecommendation.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Les recommandations seront construites à partir de vos
                      documents importés.
                    </p>
                  )}
                </div>
                {firstRecommendation ? (
                  <Badge tone="green">
                    {formatCurrency(firstRecommendation.potentialSaving)}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-5 space-y-4">
                {recommendations.length > 0 ? (
                  recommendations.map((recommendation) => (
                  <div className="rounded-2xl border border-[#eadfce] bg-[#fffaf2] p-4" key={recommendation.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-navy-900">
                        {recommendation.title}
                      </p>
                      <Badge tone={recommendation.priority === "high" ? "green" : "blue"}>
                        Priorité {recommendation.priority === "high" ? "Haute" : "Normale"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {recommendation.description}
                    </p>
                  </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    Aucune recommandation tant que l'analyse n'a pas été lancée.
                  </p>
                )}
              </div>
            </Card>

            <Card className="bg-white/90">
              <h2 className="text-xl font-semibold text-navy-900">
                Les lignes retrouvées dans l'audit
              </h2>
              <div className="mt-4 space-y-3">
                {expenses.length > 0 ? (
                  expenses.map((expense) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf6ed] px-4 py-3"
                    key={expense.id}
                  >
                    <div>
                      <p className="font-semibold text-navy-900">{expense.label}</p>
                      <p className="text-sm text-slate-500">
                        {expenseCategoryLabels[expense.category]} - {expense.provider}
                      </p>
                    </div>
                    <p className="font-bold text-navy-900">
                      {formatCurrency(expense.monthlyAmount)}
                    </p>
                  </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    Les lignes retrouvees apparaitront ici apres traitement des
                    documents ajoutes.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
