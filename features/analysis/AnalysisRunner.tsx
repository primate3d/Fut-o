"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getDocumentTypeLabel } from "@/features/upload";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import { expenseCategoryLabels, summarizeExpensesByCategory } from "@/lib/expense-summary";
import { formatCurrency } from "@/lib/utils";
import type { MockAnalysis, UploadedDocument } from "@/types";
import { generateMockAnalysisFromDocuments } from "./service";
import { getStoredMockAnalysis, isAnalysisForDocuments, storeMockAnalysis } from "./storage";

const analysisSteps = [
  "Lecture des éléments fournis",
  "Repérage des montants",
  "Catégorisation",
  "Comparaison des pistes",
  "Préparation des actions"
];

export function AnalysisRunner() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
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
      const storedAnalysis = getStoredMockAnalysis();

      setDocuments(storedDocuments);

      if (usableDocuments.length === 0) {
        return;
      }

      setCurrentStep(0);
      setIsComplete(false);

      timers = analysisSteps.map((_, index) =>
        window.setTimeout(() => {
        setCurrentStep(index + 1);

        if (index === analysisSteps.length - 1) {
          const hasCurrentAnalysis = isAnalysisForDocuments(storedAnalysis, storedDocuments);
          const currentAnalysis = hasCurrentAnalysis && storedAnalysis
            ? storedAnalysis
            : generateMockAnalysisFromDocuments(usableDocuments);

          if (!hasCurrentAnalysis) {
            storeMockAnalysis(currentAnalysis);
            setServiceMessage(
              "Analyse locale préparée à partir des documents ajoutés. Les services OCR et IA seront connectés ensuite."
            );
          }

          setAnalysis(currentAnalysis);
          setIsComplete(true);
        }
        }, (index + 1) * 500)
      );
    }

    void load();

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const categorySummaries = useMemo(
    () => (analysis ? summarizeExpensesByCategory(analysis.expenses) : []),
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
            {isComplete ? "Terminée" : "En cours"}
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
            const isActive = currentStep === index;

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
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900">
          {serviceMessage}
        </div>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-navy-900">Documents analysés</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {documents
            .filter((document) => document.status === "ready")
            .map((document) => (
              <div className="rounded-lg bg-navy-50 p-4" key={document.id}>
                <p className="font-medium text-navy-900">{document.fileName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getDocumentTypeLabel(document.documentType)} -{" "}
                  {expenseCategoryLabels[document.detectedCategory]}
                </p>
              </div>
            ))}
        </div>
      </Card>

      {analysis ? (
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Total mensuel estimé</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                {formatCurrency(analysis.totalMonthlyAmount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total annuel estimé</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                {formatCurrency(analysis.totalYearlyAmount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Pistes d'économies</p>
              <p className="mt-1 text-2xl font-bold text-sage-700">
                {formatCurrency(analysis.yearlyPotentialSavings)}
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
                  {formatCurrency(summary.monthlyTotal)} / mois
                </p>
              </div>
            ))}
          </div>
          <Button className="mt-6" href="/resultats">
            Voir mes résultats
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
