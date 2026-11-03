"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getDocumentTypeLabel } from "@/features/upload";
import {
  applyDocumentCorrections,
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import { expenseCategoryLabels, summarizeExpensesByCategory } from "@/lib/expense-summary";
import type { MockAnalysis, UploadedDocument } from "@/types";
import {
  AnalysisServerError,
  MOCK_ANALYSIS_STORAGE_KEY,
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  refreshStoredAnalysisServer,
  selectReusableAnalysis,
  storeMockAnalysis
} from "./storage";

const analysisSteps = [
  "Lecture des éléments fournis",
  "Repérage des montants",
  "Catégorisation",
  "Comparaison des pistes",
  "Préparation des actions"
];

function formatPreciseCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function isLikelyMultiContractInsuranceDocument(document: UploadedDocument) {
  const fileName = document.fileName.toLowerCase();
  return (
    document.detectedCategory === "INSURANCE" &&
    (fileName.includes("macif") ||
      fileName.includes("avis d echeance") ||
      fileName.includes("avis d'echeance") ||
      fileName.includes("sociétaire") ||
      fileName.includes("societaire"))
  );
}

export function AnalysisRunner() {
  const router = useRouter();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);

  useEffect(() => {
    let timers: number[] = [];

    async function load() {
      const localDocuments = getStoredUploadedDocuments();
      setDocuments(localDocuments);

      const storedDocuments = await getStoredUploadedDocumentsServer();
      const usableDocuments = storedDocuments.filter(
        (document) => document.status === "ready"
      );
      const usableDocumentsWithCorrections = applyDocumentCorrections(usableDocuments);
      const storedAnalysis = getStoredMockAnalysis();
      const serverAnalysis = await getStoredAnalysisServer();
      const reusableAnalysis = selectReusableAnalysis(
        [storedAnalysis, serverAnalysis],
        storedDocuments
      );

      setDocuments(storedDocuments);

      if (usableDocuments.length === 0) {
        return;
      }

      setCurrentStep(0);
      setIsComplete(false);
      setHasFailed(false);

      timers = analysisSteps.map((_, index) =>
        window.setTimeout(async () => {
        setCurrentStep(index + 1);

        if (index === analysisSteps.length - 1) {
          const hasMultiContractInsurance = usableDocumentsWithCorrections.some(
            isLikelyMultiContractInsuranceDocument
          );
          let refreshedAnalysis: MockAnalysis | null = null;
          let failureMessage = "Erreur serveur non précisée.";

          if (reusableAnalysis) {
            storeMockAnalysis(reusableAnalysis);
            setAnalysis(reusableAnalysis);
            setIsComplete(true);
            router.replace("/resultats");
            return;
          }

          try {
            refreshedAnalysis = await refreshStoredAnalysisServer(usableDocumentsWithCorrections, {
              incremental: true,
              throwOnError: true
            });
          } catch (error) {
            if (error instanceof AnalysisServerError) {
              failureMessage = error.details.message;
              console.warn("[FUTEO_ANALYSIS_BLOCKED]", {
                documentCount: error.details.documentCount,
                status: error.details.status
              });
            } else {
              failureMessage = error instanceof Error ? error.message : failureMessage;
              console.warn("[FUTEO_ANALYSIS_BLOCKED]");
            }
          }

          if (!refreshedAnalysis) {
            window.localStorage.removeItem(MOCK_ANALYSIS_STORAGE_KEY);
            setAnalysis(null);
            setServiceMessage(
              hasMultiContractInsurance
                ? `L'analyse du document multi-contrats n'a pas abouti : ${failureMessage}`
                : `L'analyse serveur n'a pas abouti : ${failureMessage} Corrigez le problème puis relancez l'analyse.`
            );
            setCurrentStep(analysisSteps.length - 1);
            setHasFailed(true);
            setIsComplete(false);
            return;
          }

          const currentAnalysis = refreshedAnalysis;

          storeMockAnalysis(currentAnalysis);
          setServiceMessage(null);

          setAnalysis(currentAnalysis);
          setIsComplete(true);
          router.replace("/resultats");
        }
        }, (index + 1) * 500)
      );
    }

    void load();

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [router]);

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
    [analysis]
  );
  const detectedProviders = useMemo(
    () =>
      analysis
        ? [...new Set(analysis.expenses.map((expense) => expense.provider).filter(Boolean))].join(
            ", "
          )
        : "",
    [analysis]
  );

  const progress = Math.min((currentStep / analysisSteps.length) * 100, 100);

  if (documents.length === 0) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez une facture, un contrat ou un abonnement pour commencer."
        icon={<FileSearch size={24} />}
        title="Ajoutez un premier document"
      />
    );
  }

  if (documents.every((document) => document.status !== "ready")) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Revoir mes documents"
        description="Aucun fichier utilisable n'est disponible pour l'instant. Ajoutez un PDF, JPG, PNG ou CSV de moins de 10 Mo."
        icon={<FileSearch size={24} />}
        title="Aucun document utilisable"
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-navy-900">Analyse en cours</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Futéo s'appuie sur les documents que vous avez choisis pour
              préparer une lecture claire de vos contrats.
            </p>
          </div>
          <Badge tone={isComplete ? "green" : "amber"}>
            {hasFailed ? "À reprendre" : isComplete ? "Terminée" : "En cours"}
          </Badge>
        </div>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-navy-50">
          <div
            className="h-full rounded-full bg-sage-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {analysisSteps.map((step, index) => {
            const isDone = currentStep > index;
            const isActive = !hasFailed && currentStep === index;

            return (
              <div
                className="rounded-lg border border-navy-100 bg-white p-3 text-sm"
                key={step}
              >
                <div className="flex items-center gap-2">
                  {isDone ? (
                    <CheckCircle2 className="text-sage-700" size={18} />
                  ) : isActive ? (
                    <Loader2 className="animate-spin text-sage-700" size={18} />
                  ) : (
                    <span className="h-4 w-4 rounded-full bg-navy-50" />
                  )}
                  <span className="font-medium text-navy-900">{step}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {serviceMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          {serviceMessage}
        </div>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-navy-900">Documents analysés</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {documents
            .filter((document) => document.status === "ready")
            .map((document) => {
              const normalizedExpense = analysis?.expenses.find(
                (expense) => expense.sourceDocumentId === document.id
              );
              const documentType =
                normalizedExpense?.documentType ?? document.documentType;
              const category =
                normalizedExpense?.category ?? document.detectedCategory;

              return (
                <div className="rounded-lg bg-navy-50 p-4" key={document.id}>
                  <p className="font-medium text-navy-900">{document.fileName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {getDocumentTypeLabel(documentType)} -{" "}
                    {expenseCategoryLabels[category]}
                  </p>
                </div>
              );
            })}
        </div>
      </Card>

      {analysis ? (
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Total mensuel estimé</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                {formatPreciseCurrency(analysis.totalMonthlyAmount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total annuel estimé</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                {formatPreciseCurrency(analysis.totalYearlyAmount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fournisseur détecté</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                {detectedProviders || "Non détecté"}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {categorySummaries.map((summary) => (
              <div
                className="flex items-center justify-between rounded-lg bg-navy-50 p-3"
                key={summary.category}
              >
                <p className="font-medium text-navy-900">{summary.label}</p>
                <p className="font-semibold text-navy-900">
                  {formatPreciseCurrency(summary.monthlyTotal)} / mois
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button href="/resultats">
              Voir mes résultats
            </Button>
            <p className="text-xs italic text-slate-500 sm:text-sm">
              &#128161; Vérifier si des offres alternatives peuvent vous faire
              réaliser des économies.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
