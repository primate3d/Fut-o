"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  Download,
  FileSearch,
  Loader2,
  Printer,
  TrendingDown,
  Wallet
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addAnalysisToReportPortfolio,
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  hasDocumentProfiles,
  storeMockAnalysis
} from "@/features/analysis";
import { getMissingContractFields } from "@/features/analysis/contract-details";
import { getStoredAccessKey, isDiscoveryPlan } from "@/features/billing/access-keys";
import { generateLettersFromAnalysis } from "@/features/letters/service";
import {
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import { formatOfferPrice } from "@/features/recommendations/offer-pricing";
import {
  findSelectedAlternativeOffer,
  getSelectedAlternativeOffer,
  refreshSelectedAlternativeOffer,
  storeSelectedAlternativeOffer,
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import {
  addAuditActionLog,
  confirmLetterSent,
  getAuditActionLogs,
  getStoredLetterRecords,
  savePreparedLetter,
  type AuditActionLog,
  type StoredLetterRecord
} from "@/features/privacy/action-log";
import { purgeSourceDocuments } from "@/features/privacy/lifecycle";
import {
  expenseCategoryLabels,
  getExpenseDisplayLabel,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { ExpenseSubcategory, type ContractComparisonState, type GeneratedLetter, type MockAnalysis } from "@/types";
import {
  buildFinancialSummary,
  confirmRealizedSaving,
  getRealizedSavingsForAnalysis,
  isReliablePotentialOffer,
  type RealizedSavingRecord
} from "./financial-summary";
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
  if (offer.sourceExpenseId) return offer.sourceExpenseId;
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

function applyAlternativeSavings(analysis: MockAnalysis, alternatives: AlternativeOffer[]) {
  const bestSavingByExpense = alternatives
    .filter(isReliablePotentialOffer)
    .reduce<Record<string, number>>((savings, offer) => {
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

export function getOptimizationScore(
  analysis: MockAnalysis,
  comparisonStates: ContractComparisonState[]
) {
  if (analysis.totalYearlyAmount <= 0 || comparisonStates.length === 0) return null;
  if (comparisonStates.some((state) =>
    state.status === "disabled" ||
    state.status === "missing_information" ||
    state.status === "unavailable"
  )) return null;

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

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ReductionDraft = {
  newMonthlyAmount: string;
  effectiveDate: string;
};

export function ReportPanel() {
  const router = useRouter();
  const activeKey = getStoredAccessKey();
  const activeKeyCode = activeKey?.code;
  const isDiscoveryAccess = isDiscoveryPlan(activeKey?.plan);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<SelectedAlternativeOffer | null>(null);
  const [recommendedLetters, setRecommendedLetters] = useState<GeneratedLetter[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [sourcePurgeMessage, setSourcePurgeMessage] = useState<string | null>(null);
  const [comparisonMessage, setComparisonMessage] = useState<string | null>(null);
  const [comparisonStates, setComparisonStates] = useState<ContractComparisonState[]>([]);
  const [actionLogs, setActionLogs] = useState<AuditActionLog[]>([]);
  const [letterRecords, setLetterRecords] = useState<StoredLetterRecord[]>([]);
  const [realizedSavings, setRealizedSavings] = useState<RealizedSavingRecord[]>([]);
  const [reductionDrafts, setReductionDrafts] = useState<Record<string, ReductionDraft>>({});
  const [reductionMessage, setReductionMessage] = useState<string | null>(null);
  const [confirmingLetterId, setConfirmingLetterId] = useState<string | null>(null);
  const [confirmedSentDate, setConfirmedSentDate] = useState("");
  const [letterTrackingMessage, setLetterTrackingMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDiscoveryAccess) return;

    setActionLogs(getAuditActionLogs());

    const retainedOffer = getSelectedAlternativeOffer();
    setSelectedOffer(retainedOffer);

    async function loadConnectedData(analysisToLoad: MockAnalysis) {
      try {
        const [alternativesResponse, lettersResponse] = await Promise.all([
          fetch("/api/alternatives", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ code: activeKeyCode })
          }),
          fetch("/api/courriers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              code: activeKeyCode,
              selectedOfferId: retainedOffer?.id
            })
          })
        ]);

        if (!alternativesResponse.ok || !lettersResponse.ok) {
          throw new Error("Services connectés indisponibles.");
        }

        const alternativesPayload = (await alternativesResponse.json()) as {
          alternatives?: AlternativeOffer[];
          comparisonMessage?: string | null;
          comparisonStates?: ContractComparisonState[];
        };
        const lettersPayload = (await lettersResponse.json()) as {
          letters?: GeneratedLetter[];
        };

        const allAlternatives = alternativesPayload.alternatives ?? [];
        const refreshedOffer = refreshSelectedAlternativeOffer(retainedOffer, allAlternatives);
        const analysisWithSavings = applyAlternativeSavings(analysisToLoad, allAlternatives);
        setAlternatives(allAlternatives);
        setComparisonMessage(alternativesPayload.comparisonMessage ?? null);
        setComparisonStates(alternativesPayload.comparisonStates ?? []);
        setSelectedOffer(refreshedOffer);
        setAnalysis(analysisWithSavings);
        setRecommendedLetters((lettersPayload.letters ?? []).slice(0, 5));
        setServiceMessage(null);
      } catch {
        const analysisWithoutVerifiedSavings = applyAlternativeSavings(analysisToLoad, []);
        setAlternatives([]);
        setComparisonMessage(
          "Comparaison indisponible : aucune économie non vérifiée n'est utilisée en remplacement."
        );
        setComparisonStates([]);
        setSelectedOffer(null);
        setAnalysis(analysisWithoutVerifiedSavings);
        setRecommendedLetters(
          generateLettersFromAnalysis(analysisWithoutVerifiedSavings, null).slice(0, 5)
        );
        setServiceMessage(
          "Le rapport reste disponible, mais aucune offre ni économie locale n'est présentée sans validation du service de comparaison."
        );
      }
    }

    const activeAnalysis = getStoredMockAnalysis();
    if (activeAnalysis) {
      addAnalysisToReportPortfolio(activeAnalysis);
    }
    const storedAnalysis = activeAnalysis;
    const hasManualAnalysis = isManualAnalysis(storedAnalysis);
    const hasCurrentAnalysis = Boolean(storedAnalysis && hasDocumentProfiles(storedAnalysis));

    setAnalysis(
      hasCurrentAnalysis || hasManualAnalysis
        ? applyAlternativeSavings(storedAnalysis!, [])
        : null
    );

    if ((!storedAnalysis || !hasCurrentAnalysis) && !hasManualAnalysis) {
      async function loadServerState() {
        const serverAnalysis = await getStoredAnalysisServer();

        if (serverAnalysis) {
          storeMockAnalysis(serverAnalysis);
          setAnalysis(applyAlternativeSavings(serverAnalysis, []));
          await loadConnectedData(serverAnalysis);
        }
      }

      void loadServerState();
      return;
    }

    if (!storedAnalysis) {
      return;
    }

    void loadConnectedData(storedAnalysis);
  }, [activeKeyCode, isDiscoveryAccess]);

  useEffect(() => {
    setLetterRecords(analysis ? getStoredLetterRecords(analysis.id) : []);
    setRealizedSavings(
      analysis ? getRealizedSavingsForAnalysis(analysis, activeKeyCode) : []
    );
  }, [activeKeyCode, analysis]);

  async function handleDownload() {
    if (!analysis) return;
    setIsDownloading(true);
    try {
      await generatePdfReport(
        analysis,
        alternatives,
        recommendedLetters,
        selectedOffer,
        actionLogs,
        comparisonMessage,
        comparisonStates,
        realizedSavings
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

  function handleViewStoredLetter(record: StoredLetterRecord) {
    router.push(`/courriers?courrier=${encodeURIComponent(record.id)}&returnTo=rapport`);
  }

  function handlePrepareStoredFollowup(record: StoredLetterRecord) {
    if (record.status !== "sent" || !record.sentAt) {
      setLetterTrackingMessage(
        "Confirmez la date réelle d'envoi avant de préparer une relance."
      );
      return;
    }
    router.push(`/courriers?relanceRecord=${encodeURIComponent(record.id)}&returnTo=rapport`);
  }

  function startSentDateConfirmation(recordId: string) {
    setConfirmingLetterId(recordId);
    setConfirmedSentDate("");
    setLetterTrackingMessage(null);
  }

  function finishSentDateConfirmation(record: StoredLetterRecord) {
    if (!analysis || !confirmedSentDate) {
      setLetterTrackingMessage("Indiquez la date réelle d'envoi du courrier.");
      return;
    }
    const updated = confirmLetterSent(record.id, confirmedSentDate);
    if (!updated) {
      setLetterTrackingMessage("La date d'envoi est invalide ou située dans le futur.");
      return;
    }
    setLetterRecords(getStoredLetterRecords(analysis.id));
    setConfirmingLetterId(null);
    setConfirmedSentDate("");
    setLetterTrackingMessage("Envoi confirmé. La relance est maintenant disponible.");
  }

  function finishLegacySentDateConfirmation(action: AuditActionLog) {
    if (!analysis || !action.letterSnapshot || !confirmedSentDate) {
      setLetterTrackingMessage("Indiquez la date réelle d'envoi du courrier.");
      return;
    }
    const record = savePreparedLetter(
      analysis.id,
      action.letterSnapshot,
      action.createdAt
    );
    const updated = record ? confirmLetterSent(record.id, confirmedSentDate) : null;
    if (!updated) {
      setLetterTrackingMessage(
        "Ce courrier historique ne peut pas être confirmé avec cette date."
      );
      return;
    }
    setLetterRecords(getStoredLetterRecords(analysis.id));
    setConfirmingLetterId(null);
    setConfirmedSentDate("");
    setLetterTrackingMessage("Envoi confirmé. La relance est maintenant disponible.");
  }

  function handleViewLegacyAction(action: AuditActionLog) {
    router.push(`/courriers?action=${encodeURIComponent(action.id)}&returnTo=rapport`);
  }

  function handleChooseLetter(
    expenseId: string,
    offer: AlternativeOffer | undefined
  ) {
    if (offer) {
      storeSelectedAlternativeOffer(offer);
    }
    router.push(`/courriers?expenseId=${encodeURIComponent(expenseId)}&returnTo=rapport`);
  }

  function updateReductionDraft(expenseId: string, update: Partial<ReductionDraft>) {
    setReductionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [expenseId]: {
        newMonthlyAmount: currentDrafts[expenseId]?.newMonthlyAmount ?? "",
        effectiveDate: currentDrafts[expenseId]?.effectiveDate ?? getTodayDateInputValue(),
        ...update
      }
    }));
  }

  function handleConfirmReduction(
    event: FormEvent<HTMLFormElement>,
    expense: MockAnalysis["expenses"][number]
  ) {
    event.preventDefault();
    if (!analysis) return;

    const draft = reductionDrafts[expense.id];
    const newMonthlyAmount = Number((draft?.newMonthlyAmount ?? "").replace(",", "."));
    try {
      confirmRealizedSaving(
        activeKeyCode,
        {
          auditId: analysis.id,
          expense,
          newMonthlyAmount,
          effectiveDate: draft?.effectiveDate || getTodayDateInputValue()
        }
      );
      setRealizedSavings(getRealizedSavingsForAnalysis(analysis, activeKeyCode));
      setReductionDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[expense.id];
        return nextDrafts;
      });
      setReductionMessage(
        `Réduction confirmée pour ${normalizeDisplayText(expense.provider)}. Le budget actuel sera mis à jour à la date d'effet.`
      );
    } catch (error) {
      setReductionMessage(
        error instanceof Error ? error.message : "La réduction n'a pas pu être enregistrée."
      );
    }
  }

  const financialSummary = useMemo(
    () => analysis
      ? buildFinancialSummary(
          analysis,
          alternatives,
          comparisonStates,
          realizedSavings
        )
      : null,
    [alternatives, analysis, comparisonStates, realizedSavings]
  );
  const currentDisplayExpenses = useMemo(
    () => analysis
      ? analysis.expenses.map((expense) => {
          const contract = financialSummary?.contracts[expense.id];
          return contract
            ? {
                ...expense,
                monthlyAmount: contract.currentMonthlyAmount,
                yearlyAmount: contract.currentYearlyAmount
              }
            : expense;
        })
      : [],
    [analysis, financialSummary]
  );
  const categorySummaries = useMemo(
    () => summarizeExpensesByCategory(currentDisplayExpenses),
    [currentDisplayExpenses]
  );
  const topExpenses = useMemo(
    () => getTopExpenses(currentDisplayExpenses, 5),
    [currentDisplayExpenses]
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

  const hasSelectedIndicativeTariff =
    selectedOffer?.savingKind === "recurring_only" &&
    selectedOffer.estimatedYearlySaving > 0;
  const score = hasSelectedIndicativeTariff
    ? null
    : getOptimizationScore(analysis, comparisonStates);
  const scoreBadge = score === null
    ? { label: "Comparaison incomplète", tone: "amber" as const }
    : getScoreBadge(score);
  const priorityRecommendations = analysis.recommendations
    .filter((recommendation) => recommendation.priority !== "low")
    .slice(0, 4);
  const contractComparisons = analysis.expenses
    .map((expense) => ({
      expense,
      offer: getBestAlternativeForExpense(
        expense.id,
        alternatives,
        analysis,
        selectedOffer
      ),
      recommendation: analysis.recommendations.find(
        (recommendation) => recommendation.category === expense.category
      ),
      comparisonState: comparisonStates.find((state) => state.expenseId === expense.id)
    }));
  const reducedDataAlternatives = alternatives.filter(
    (offer) => offer.comparisonKind === "reduced_data"
  );
  const currentFinancialSummary = financialSummary!;

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

      {reductionMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-medium leading-6 text-sage-900 print:hidden">
          {reductionMessage}
        </div>
      ) : null}

      {letterTrackingMessage ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium leading-6 text-blue-900 print:hidden">
          {letterTrackingMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-blue-200 bg-blue-50/70 p-6 print:shadow-none">
          <div className="flex items-center gap-3 text-[#102A4C]">
            <span className="rounded-xl bg-white/80 p-2.5"><Wallet size={22} /></span>
            <p className="text-xs font-bold uppercase tracking-[0.12em]">
              Vos dépenses actuelles
            </p>
          </div>
          <p className="mt-5 text-3xl font-bold text-[#102A4C] md:text-4xl">
            {formatCurrency(currentFinancialSummary.currentMonthlyAmount)}
            <span className="ml-1 text-base font-semibold">/ mois</span>
          </p>
          <p className="mt-1 text-lg font-bold text-[#102A4C]">
            {formatCurrency(currentFinancialSummary.currentYearlyAmount)} / an
          </p>
          <p className="mt-4 text-sm text-slate-600">Total de vos contrats analysés</p>
        </Card>

        <Card className="border-orange-200 bg-orange-50/80 p-6 print:shadow-none">
          <div className="flex items-center gap-3 text-[#D97706]">
            <span className="rounded-xl bg-white/80 p-2.5"><TrendingDown size={22} /></span>
            <p className="text-xs font-bold uppercase tracking-[0.12em]">
              Vos économies potentielles
            </p>
          </div>
          {currentFinancialSummary.potentialStatus === "undetermined" ? (
            <p className="mt-5 text-2xl font-bold text-[#D97706] md:text-3xl">
              Non déterminé
            </p>
          ) : (
            <>
              <p className="mt-5 text-3xl font-bold text-[#D97706] md:text-4xl">
                {formatCurrency(currentFinancialSummary.potentialMonthlySaving)}
                <span className="ml-1 text-base font-semibold">/ mois</span>
              </p>
              <p className="mt-1 text-lg font-bold text-[#D97706]">
                {formatCurrency(currentFinancialSummary.potentialYearlySaving)} / an
              </p>
            </>
          )}
          <p className="mt-4 text-sm text-slate-600">
            {currentFinancialSummary.potentialStatus === "partial"
              ? "Montant partiel vérifié, certaines comparaisons restent à compléter"
              : currentFinancialSummary.potentialStatus === "undetermined"
                ? "Données commerciales insuffisantes pour calculer un montant fiable"
                : "Économies supplémentaires identifiées"}
          </p>
        </Card>

        <Card className="border-green-200 bg-green-50/80 p-6 print:shadow-none">
          <div className="flex items-center gap-3 text-[#15803D]">
            <span className="rounded-xl bg-white/80 p-2.5"><CircleCheck size={22} /></span>
            <p className="text-xs font-bold uppercase tracking-[0.12em]">
              Vos économies réalisées
            </p>
          </div>
          <p className="mt-5 text-3xl font-bold text-[#15803D] md:text-4xl">
            {formatCurrency(currentFinancialSummary.realizedMonthlySaving)}
            <span className="ml-1 text-base font-semibold">/ mois</span>
          </p>
          <p className="mt-1 text-lg font-bold text-[#15803D]">
            {formatCurrency(currentFinancialSummary.realizedYearlySaving)} / an
          </p>
          <p className="mt-4 text-sm text-slate-600">Réductions effectivement obtenues</p>
        </Card>
      </div>

      <Card className="overflow-hidden border-navy-200 bg-gradient-to-r from-[#102A4C] to-[#1f456f] p-0 text-white print:shadow-none">
        <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">
              Votre budget après optimisation
            </p>
            <p className="mt-2 text-sm text-blue-50">
              Projection si les économies potentielles vérifiées sont effectivement obtenues.
            </p>
          </div>
          {currentFinancialSummary.potentialStatus === "undetermined" ? (
            <p className="text-xl font-bold">Projection non calculable</p>
          ) : (
            <div className="sm:text-right">
              <p className="text-3xl font-bold">
                {formatCurrency(currentFinancialSummary.projectedMonthlyAmount)} / mois
              </p>
              <p className="mt-1 text-sm font-semibold text-blue-100">
                {formatCurrency(currentFinancialSummary.projectedYearlyAmount)} / an, montant non garanti
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card className="print:shadow-none">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="rounded-xl bg-sage-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-500">
              Score d'optimisation
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">
              {score === null ? "Non déterminé" : score}
            </p>
            <div className="mt-4">
              <Badge tone={scoreBadge.tone}>{scoreBadge.label}</Badge>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-navy-900">Résumé global</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              L'analyse a fait ressortir {analysis.expenses.length} poste(s) et{" "}
              {analysis.anomalies.length + comparisonStates.filter((state) => state.status === "missing_information").length} point(s) à vérifier.{" "}
              {score === null
                ? "L'optimisation reste non déterminée tant que les comparaisons nécessaires ne sont pas disponibles ou complètes."
                 : `${formatCurrency(currentFinancialSummary.potentialYearlySaving)} de pistes d'économies annuelles supplémentaires ont été validées.`}
            </p>
             <p className="mt-2 text-xs leading-5 text-slate-500">
               Le score est un indicateur de comparaison, pas une garantie que tous les contrats sont déjà optimisés.
             </p>
          </div>
        </div>
      </Card>

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
            {contractComparisons.map(({ expense, offer, recommendation, comparisonState }) => {
              const contractFinancial = currentFinancialSummary.contracts[expense.id];
              const hasSaving = contractFinancial.potentialYearlySaving > 0;
              const hasIndicativeSelectedOffer = Boolean(
                offer &&
                selectedOffer?.id === offer.id &&
                offer.savingKind === "recurring_only" &&
                offer.estimatedYearlySaving > 0
              );
              const realizedSaving = contractFinancial.realizedSaving;
              const expenseRecords = letterRecords
                .filter((record) => record.expenseId === expense.id)
                .sort(
                  (first, second) =>
                    Date.parse(second.updatedAt) - Date.parse(first.updatedAt)
                );
              const initialLetters = expenseRecords.filter(
                (record) => !record.parentRecordId
              );
              const trackedLetterIds = new Set(
                initialLetters.map((record) => record.snapshot.letter.id)
              );
              const legacyActions = actionLogs.filter(
                (action) =>
                  action.letterSnapshot?.letter.sourceExpenseId === expense.id &&
                  !trackedLetterIds.has(action.letterSnapshot.letter.id)
              );

              return (
                <div
                  className="flex w-full flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between"
                  key={expense.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                      {expenseCategoryLabels[expense.category]}
                    </p>
                    <p className={`mt-1 text-sm font-semibold md:text-base ${hasSaving ? "text-slate-800" : "text-slate-600"}`}>
                      {getExpenseDisplayLabel(expense)} — {normalizeDisplayText(expense.provider)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 md:text-sm">
                      Dépense actuelle : {formatCurrency(contractFinancial.currentMonthlyAmount)} / mois · {formatCurrency(contractFinancial.currentYearlyAmount)} / an
                    </p>
                    {realizedSaving ? (
                      <p className="mt-1 text-xs font-medium text-green-700 md:text-sm">
                        {contractFinancial.realizedSavingIsEffective
                          ? `Économie réalisée : ${formatCurrency(contractFinancial.realizedMonthlySaving)} / mois · ${formatCurrency(contractFinancial.realizedYearlySaving)} / an`
                          : `Nouveau tarif confirmé à partir du ${new Date(`${realizedSaving.effectiveDate}T12:00:00`).toLocaleDateString("fr-FR")}, pas encore comptabilisé`}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs font-medium text-orange-700 md:text-sm">
                      {hasSaving
                        ? `Économie potentielle supplémentaire : ${formatCurrency(contractFinancial.potentialMonthlySaving)} / mois · ${formatCurrency(contractFinancial.potentialYearlySaving)} / an`
                        : "Aucune économie potentielle certifiée"}
                    </p>
                    {hasIndicativeSelectedOffer && offer ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 md:text-sm">
                        <p className="font-semibold">
                          Offre tarifaire sélectionnée : {normalizeDisplayText(offer.provider)} - {normalizeDisplayText(offer.name)}
                        </p>
                        <p>
                          Tarif : {offer.billingPeriodDays && typeof offer.billingPrice === "number"
                            ? `${formatCurrency(offer.billingPrice)} tous les ${offer.billingPeriodDays} jours (soit ${formatCurrency(offer.monthlyPrice)} / mois civil)`
                            : `${formatCurrency(offer.monthlyPrice)} / mois`}
                        </p>
                        <p>
                          Économie tarifaire indicative : {formatCurrency(offer.estimatedYearlySaving / 12)} / mois · {formatCurrency(offer.estimatedYearlySaving)} / an.
                        </p>
                        <p>
                          Des frais ponctuels peuvent réduire cette estimation. Elle n'est ni nette ni garantie.
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500 md:text-sm">
                      Document source : {expense.sourceDocumentName ?? "Saisie manuelle"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500 md:text-sm">
                      {(hasSaving || hasIndicativeSelectedOffer) && offer
                        ? `Alternative vérifiée : ${normalizeDisplayText(offer.provider)} - ${normalizeDisplayText(offer.name)}`
                        : comparisonState?.message ?? recommendation?.description ?? "La comparaison des offres n'est pas disponible actuellement."}
                    </p>
                    {offer && expense.subcategory === ExpenseSubcategory.INTERNET ? (
                      <div className="mt-2 text-xs leading-5 text-slate-600 md:text-sm">
                        <p>Tarif : {formatOfferPrice(offer, formatCurrency)}.</p>
                        {typeof offer.durableYearlySaving === "number" ? (
                          <p>
                            Économie durable estimée : {formatCurrency(offer.durableYearlySaving)} / an · économie estimée sur les 12 premiers mois : {formatCurrency(offer.estimatedYearlySaving)}.
                          </p>
                        ) : null}
                        {offer.entryFeesKnown === false ? (
                          <p className="text-amber-800">
                            Des frais de mise en service ou de résiliation peuvent réduire les économies estimées.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {getMissingContractFields(expense).length > 0 ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Informations manquantes : {getMissingContractFields(expense).join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium text-slate-600">
                      État de la comparaison : {comparisonState?.message ?? (hasSaving
                        ? "Alternative vérifiée disponible."
                        : "Comparaison non disponible actuellement.")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end print:hidden">
                    <p className={`whitespace-nowrap text-sm font-semibold md:text-base ${hasSaving || hasIndicativeSelectedOffer ? "text-emerald-600" : "text-slate-400"}`}>
                      {hasSaving
                        ? `+ ${formatCurrency(offer?.estimatedYearlySaving ?? 0)} / an`
                        : hasIndicativeSelectedOffer && offer
                          ? `~ ${formatCurrency(offer.estimatedYearlySaving)} / an hors frais`
                        : "Aucune économie certifiée"}
                    </p>
                    {initialLetters.length === 0 && legacyActions.length === 0 ? (
                      <Button
                        onClick={() => handleChooseLetter(expense.id, offer)}
                        type="button"
                        variant="secondary"
                      >
                        Choisir un courrier
                      </Button>
                    ) : null}
                  </div>
                  {initialLetters.length > 0 || legacyActions.length > 0 ? (
                    <div className="basis-full space-y-3 border-t border-slate-100 pt-3 print:hidden">
                      {initialLetters.map((initialLetter) => {
                        const followupLetter = expenseRecords.find(
                          (record) => record.parentRecordId === initialLetter.id
                        );
                        const confirmationKey = `record:${initialLetter.id}`;
                        return (
                          <div
                            className="rounded-lg border border-sage-200 bg-sage-50/50 p-3"
                            key={initialLetter.id}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-sage-900">
                                  {getLetterTypeLabel(initialLetter.letterType)}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  Préparé le {formatActionDate(initialLetter.createdAt)} · Statut : {initialLetter.status === "sent"
                                    ? `envoyé le ${formatActionDate(initialLetter.sentAt!)}`
                                    : "préparé, envoi non confirmé"}
                                  {followupLetter
                                    ? ` · Relance préparée le ${formatActionDate(followupLetter.createdAt)}`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => handleViewStoredLetter(initialLetter)}
                                  type="button"
                                  variant="secondary"
                                >
                                  Voir mon courrier
                                </Button>
                                {initialLetter.status === "sent" && initialLetter.sentAt ? (
                                  followupLetter ? (
                                    <Button
                                      onClick={() => handleViewStoredLetter(followupLetter)}
                                      type="button"
                                      variant="secondary"
                                    >
                                      Voir la relance
                                    </Button>
                                  ) : (
                                    <Button
                                      onClick={() => handlePrepareStoredFollowup(initialLetter)}
                                      type="button"
                                      variant="secondary"
                                    >
                                      Préparer une relance
                                    </Button>
                                  )
                                ) : (
                                  <Button
                                    onClick={() => startSentDateConfirmation(confirmationKey)}
                                    type="button"
                                    variant="ghost"
                                  >
                                    Confirmer l&apos;envoi
                                  </Button>
                                )}
                              </div>
                            </div>
                            {confirmingLetterId === confirmationKey ? (
                              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-sage-200 bg-white p-3 sm:flex-row sm:items-end">
                                <label className="text-sm font-semibold text-navy-900">
                                  Date réelle d&apos;envoi
                                  <input
                                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 font-normal"
                                    max={getTodayDateInputValue()}
                                    onChange={(event) => setConfirmedSentDate(event.target.value)}
                                    required
                                    type="date"
                                    value={confirmedSentDate}
                                  />
                                </label>
                                <Button
                                  onClick={() => finishSentDateConfirmation(initialLetter)}
                                  type="button"
                                >
                                  Valider la date
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {legacyActions.map((action) => {
                        const confirmationKey = `action:${action.id}`;
                        return (
                          <div
                            className="rounded-lg border border-blue-200 bg-blue-50/50 p-3"
                            key={action.id}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-navy-900">
                                  {getLetterTypeLabel(action.letterSnapshot!.letter.type)}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  Préparé le {formatActionDate(action.createdAt)} · Statut : envoi non confirmé
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => handleViewLegacyAction(action)}
                                  type="button"
                                  variant="secondary"
                                >
                                  Voir mon courrier
                                </Button>
                                <Button
                                  onClick={() => startSentDateConfirmation(confirmationKey)}
                                  type="button"
                                  variant="ghost"
                                >
                                  Confirmer l&apos;envoi
                                </Button>
                              </div>
                            </div>
                            {confirmingLetterId === confirmationKey ? (
                              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-blue-200 bg-white p-3 sm:flex-row sm:items-end">
                                <label className="text-sm font-semibold text-navy-900">
                                  Date réelle d&apos;envoi
                                  <input
                                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 font-normal"
                                    max={getTodayDateInputValue()}
                                    onChange={(event) => setConfirmedSentDate(event.target.value)}
                                    required
                                    type="date"
                                    value={confirmedSentDate}
                                  />
                                </label>
                                <Button
                                  onClick={() => finishLegacySentDateConfirmation(action)}
                                  type="button"
                                >
                                  Valider la date
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {expense.isRecurring && expense.recurrence !== "one_time" && expense.monthlyAmount > 0 ? (
                    <details className="basis-full rounded-lg border border-green-200 bg-green-50/50 p-3 print:hidden">
                      <summary className="cursor-pointer text-sm font-semibold text-green-800">
                        {realizedSaving
                          ? "Mettre à jour la réduction obtenue"
                          : "Confirmer une réduction effectivement obtenue"}
                      </summary>
                      <form
                        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                        onSubmit={(event) => handleConfirmReduction(event, expense)}
                      >
                        <label className="text-sm font-semibold text-navy-900">
                          Nouveau tarif mensuel
                          <input
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                            inputMode="decimal"
                            min="0"
                            onChange={(event) => updateReductionDraft(expense.id, {
                              newMonthlyAmount: event.target.value
                            })}
                            placeholder={`Inférieur à ${formatCurrency(realizedSaving?.previousMonthlyAmount ?? expense.monthlyAmount)}`}
                            required
                            step="0.01"
                            type="number"
                            value={reductionDrafts[expense.id]?.newMonthlyAmount ?? (realizedSaving ? String(realizedSaving.newMonthlyAmount) : "")}
                          />
                        </label>
                        <label className="text-sm font-semibold text-navy-900">
                          Date d&apos;effet
                          <input
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                            onChange={(event) => updateReductionDraft(expense.id, {
                              effectiveDate: event.target.value
                            })}
                            required
                            type="date"
                            value={reductionDrafts[expense.id]?.effectiveDate ?? realizedSaving?.effectiveDate ?? getTodayDateInputValue()}
                          />
                        </label>
                        <Button type="submit">Confirmer la réduction</Button>
                      </form>
                      <p className="mt-3 text-xs leading-5 text-slate-600">
                        Montant d&apos;origine conservé : {formatCurrency(realizedSaving?.previousMonthlyAmount ?? expense.monthlyAmount)} / mois. Un courrier ou une relance ne valide jamais cette économie automatiquement.
                      </p>
                    </details>
                  ) : (
                    <p className="basis-full text-xs text-slate-500">
                      Dépense ponctuelle ou périodicité non mensuelle confirmée : aucune réduction mensuelle n&apos;est déduite automatiquement.
                    </p>
                  )}
                </div>
              );
            })}
            <div className="mt-3 flex w-full flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-slate-700">
                💰 Total de vos économies annuelles potentielles
              </p>
              <p className="whitespace-nowrap text-base font-bold text-emerald-600">
                + {formatCurrency(currentFinancialSummary.potentialYearlySaving)} / an
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {reducedDataAlternatives.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50 p-4 print:shadow-none">
          <h2 className="text-xl font-semibold text-navy-900">
            Autres possibilités pour réduire votre facture
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ces forfaits mobiles réduisent le volume de données inclus. Ils ne sont pas considérés
            comme équivalents et leurs économies ne sont pas ajoutées au total principal.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {reducedDataAlternatives.map((offer) => (
              <div
                className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                key={offer.id}
              >
                <div>
                  <p className="font-semibold text-navy-900">
                    {normalizeDisplayText(offer.provider)} - {normalizeDisplayText(offer.name)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{offer.reason}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-amber-800">
                  Compromis : {formatCurrency(offer.estimatedYearlySaving)} / an
                </p>
              </div>
            ))}
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
                    {getExpenseDisplayLabel(expense)}
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
          Les courriers enregistrés restent accessibles après actualisation. Les
          téléchargements et préparations d&apos;email sont indiqués séparément et ne
          constituent jamais une preuve d&apos;envoi.
        </p>
        <div className="mt-4 space-y-3">
          {letterRecords.map((record) => (
            <div
              className="flex flex-col gap-3 rounded-lg border border-sage-200 bg-sage-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              key={record.id}
            >
              <div>
                <p className="font-semibold text-navy-900">
                  {record.status === "followup_prepared"
                    ? "Relance préparée"
                    : record.status === "sent"
                      ? "Courrier préparé - envoi confirmé"
                      : "Courrier préparé"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatActionDate(record.createdAt)} - {normalizeDisplayText(record.snapshot.letter.provider)}
                  {record.sentAt
                    ? ` - envoyé le ${formatActionDate(record.sentAt)}`
                    : ""}
                </p>
              </div>
              <Button
                onClick={() => handleViewStoredLetter(record)}
                type="button"
                variant="secondary"
              >
                Voir mon courrier
              </Button>
            </div>
          ))}
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
                      onClick={() => handleViewLegacyAction(action)}
                      type="button"
                      variant="secondary"
                    >
                      Voir mon courrier
                    </Button>
                  ) : null}
              </div>
            ))
          ) : letterRecords.length === 0 ? (
            <p className="text-sm text-slate-600">
              Aucun courrier ni téléchargement enregistré pour cet audit.
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
