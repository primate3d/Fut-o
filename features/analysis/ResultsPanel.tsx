"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { getStoredAccessKey, isDiscoveryPlan } from "@/features/billing/access-keys";
import {
  buildFinancialSummary,
  getRealizedSavingsForAnalysis,
  isReliablePotentialOffer,
  type RealizedSavingRecord
} from "@/features/reports/financial-summary";
import {
  findConditionalInternetSupportOffers,
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import { formatOfferPrice } from "@/features/recommendations/offer-pricing";
import {
  SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY,
  getSelectedAlternativeOffer,
  refreshSelectedAlternativeOffer,
  storeSelectedAlternativeOffer,
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import { visibleDocumentTypeOptions } from "@/features/upload/document-types";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer,
  storeUploadedDocuments
} from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getExpenseDisplayLabel,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import { LatestRequestController } from "@/features/analysis/latest-request";
import type {
  ContractComparisonState,
  DocumentUserCorrections,
  Expense,
  MockAnalysis,
  UploadedDocumentType
} from "@/types";
import { ExpenseSubcategory } from "@/types";
import {
  addAnalysisToReportPortfolio,
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  isAnalysisForDocuments,
  storeMockAnalysis
} from "./storage";
import { ContractDetailsConfirmationPanel } from "./ContractDetailsConfirmationPanel";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatOfferBilling(
  offer: Pick<
    AlternativeOffer,
    | "monthlyPrice"
    | "billingPrice"
    | "billingPeriodDays"
    | "promotionPrice"
    | "promotionDurationMonths"
    | "priceAfterPromotion"
  >
) {
  return formatOfferPrice(offer, formatCurrency);
}

function hasUsableAmounts(analysis: MockAnalysis | null) {
  return Boolean(
    analysis &&
      (analysis.totalMonthlyAmount > 0 ||
        analysis.expenses.some((expense) => {
          const monthlyAmount = Number(expense.monthlyAmount);
          const yearlyAmount = Number(expense.yearlyAmount);
          return (
            (Number.isFinite(monthlyAmount) && monthlyAmount > 0) ||
            (Number.isFinite(yearlyAmount) && yearlyAmount > 0)
          );
        }))
  );
}

function getComparisonMessageForExpenses(
  expenses: Expense[],
  comparisonStates: ContractComparisonState[]
) {
  const states = expenses
    .map((expense) => comparisonStates.find((state) => state.expenseId === expense.id))
    .filter((state): state is ContractComparisonState => Boolean(state));
  if (states.some((state) => state.status === "alternative_found")) return null;
  return states.find((state) => state.status === "missing_information")?.message
    ?? states.find((state) => state.status === "disabled")?.message
    ?? states.find((state) => state.status === "unavailable")?.message
    ?? states.find((state) => state.status === "no_better_offer")?.message
    ?? "La comparaison des offres n'est pas disponible actuellement.";
}

function isManualAnalysis(analysis: MockAnalysis | null) {
  return Boolean(
    analysis?.documents.some((document) => document.mimeType === "manual/input")
  );
}

function getExpenseIdFromAlternativeId(offer: AlternativeOffer, analysis: MockAnalysis) {
  if (offer.sourceExpenseId) return offer.sourceExpenseId;
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

function computeAlternativeSavings(analysis: MockAnalysis, alternatives: AlternativeOffer[]) {
  const bestSavingByExpense = alternatives.filter(isReliablePotentialOffer).reduce<Record<string, number>>((savings, offer) => {
    const expenseId = getExpenseIdFromAlternativeId(offer, analysis);
    if (!expenseId) return savings;

    savings[expenseId] = Math.max(
      savings[expenseId] ?? 0,
      offer.estimatedYearlySaving
    );
    return savings;
  }, {});

  return Object.values(bestSavingByExpense).reduce(
    (total, saving) => total + Math.max(0, saving),
    0
  );
}

function computeVerifiedOfferSaving(offer: AlternativeOffer, analysis: MockAnalysis) {
  void analysis;
  return offer.estimatedYearlySaving;
}

function getExpenseForAlternative(offer: AlternativeOffer, analysis: MockAnalysis) {
  if (offer.sourceExpenseId) {
    return analysis.expenses.find((expense) => expense.id === offer.sourceExpenseId);
  }
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  );
}

function getSavingsStorageKey(auditKey: string) {
  return `futeo_savings_${auditKey}`;
}

function persistYearlyPotentialSavings(yearlyPotentialSavings: number) {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return;

  try {
    if (yearlyPotentialSavings <= 0) {
      window.localStorage.removeItem(getSavingsStorageKey(activeKey.code));
      return;
    }

    window.localStorage.setItem(
      getSavingsStorageKey(activeKey.code),
      String(yearlyPotentialSavings)
    );
  } catch (error) {
    console.warn("Impossible de persister les pistes d'economies", error);
  }
}

const billingFrequencyLabels = {
  monthly: "mois",
  bimonthly: "bimestre",
  quarterly: "trimestre",
  yearly: "an",
  one_time: "ponctuel",
  schedule: "échéancier"
} as const;

function formatBillingHint(expense: MockAnalysis["expenses"][number]) {
  if (
    !expense.billingFrequency ||
    expense.billingFrequency === "monthly" ||
    typeof expense.billingAmount !== "number" ||
    !Number.isFinite(expense.billingAmount) ||
    expense.billingAmount <= 0
  ) {
    return null;
  }

  return `${formatCurrency(expense.billingAmount)} / ${billingFrequencyLabels[expense.billingFrequency]} saisis, soit ${formatCurrency(expense.monthlyAmount)} / mois pour comparer.`;
}

function formatFrequencyWarning(expense: MockAnalysis["expenses"][number]) {
  if (expense.mobileRecurringAmountNeedsConfirmation) {
    return "Prix mensuel récurrent à confirmer : le total de la facture n'est pas utilisé pour calculer des économies.";
  }

  if (
    expense.billingFrequency ||
    expense.monthlyAmount > 0 ||
    expense.yearlyAmount <= 0 ||
    expense.recurrence !== "one_time"
  ) {
    return null;
  }

  return `Fréquence à confirmer : montant détecté ${formatCurrency(expense.yearlyAmount)}.`;
}

type ManualEntryForm = {
  provider: string;
  documentType: UploadedDocumentType;
  amount: string;
  frequency: NonNullable<DocumentUserCorrections["frequency"]>;
  mobileDataGB: string;
  mobileDataUnlimited: boolean;
  mobileAllowLowerDataOffers: boolean;
  mobileMinimumDataGB: string;
  internetTvIncluded: boolean;
  clientFirstName: string;
  clientLastName: string;
  clientAddress: string;
  customerNumber: string;
  contractNumber: string;
  invoiceNumber: string;
  phone: string;
  email: string;
  providerAddress: string;
};

type MobileDataConfirmation = {
  mobileDataGB: string;
  mobileDataUnlimited: boolean;
  mobileAllowLowerDataOffers: boolean;
  mobileMinimumDataGB: string;
};

function getMobileDataConfirmation(expense: Expense): MobileDataConfirmation {
  const includedDataGB = typeof expense.mobileIncludedDataGB === "number"
    ? expense.mobileIncludedDataGB
    : expense.mobileDataGB;
  return {
    mobileDataGB: typeof includedDataGB === "number" ? String(includedDataGB) : "",
    mobileDataUnlimited: expense.mobileDataUnlimited === true,
    mobileAllowLowerDataOffers: expense.mobileAllowLowerDataOffers === true,
    mobileMinimumDataGB:
      typeof expense.mobileMinimumDataGB === "number"
        ? String(expense.mobileMinimumDataGB)
        : ""
  };
}

const manualInputClass =
  "mt-2 w-full rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm font-medium text-navy-900 outline-none transition focus:border-sage-400 focus:ring-2 focus:ring-sage-200";

const manualFrequencyOptions: Array<{
  value: NonNullable<DocumentUserCorrections["frequency"]>;
  label: string;
}> = [
  { value: "monthly", label: "Mensuel" },
  { value: "bimonthly", label: "Bimestriel" },
  { value: "quarterly", label: "Trimestriel" },
  { value: "yearly", label: "Annuel" },
  { value: "one_time", label: "Ponctuel" },
  { value: "schedule", label: "Echeancier" }
];

export function ResultsPanel() {
  const router = useRouter();
  const activeAccessKeyCode = getStoredAccessKey()?.code;
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [alternativesUpdatedAt, setAlternativesUpdatedAt] = useState<string | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"fresh" | "stale" | "empty" | null>(null);
  const [comparisonMessage, setComparisonMessage] = useState<string | null>(null);
  const [comparisonStates, setComparisonStates] = useState<ContractComparisonState[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<SelectedAlternativeOffer | null>(null);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualEntryForm>({
    provider: "",
    documentType: "home_insurance",
    amount: "",
    frequency: "monthly",
    mobileDataGB: "",
    mobileDataUnlimited: false,
    mobileAllowLowerDataOffers: false,
    mobileMinimumDataGB: "",
    internetTvIncluded: false,
    clientFirstName: "",
    clientLastName: "",
    clientAddress: "",
    customerNumber: "",
    contractNumber: "",
    invoiceNumber: "",
    phone: "",
    email: "",
    providerAddress: ""
  });
  const [manualFormMessage, setManualFormMessage] = useState<string | null>(null);
  const [isSubmittingManualForm, setIsSubmittingManualForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [mobileDataConfirmations, setMobileDataConfirmations] = useState<
    Record<string, MobileDataConfirmation>
  >({});
  const [savingMobileExpenseId, setSavingMobileExpenseId] = useState<string | null>(null);
  const [realizedSavings, setRealizedSavings] = useState<RealizedSavingRecord[]>([]);
  const alternativesRequestController = useRef<LatestRequestController | null>(null);
  if (!alternativesRequestController.current) {
    alternativesRequestController.current = new LatestRequestController();
  }

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    setShowManualForm(mode === "manuel");
  }, []);

  useEffect(
    () => () => alternativesRequestController.current?.cancel(),
    []
  );

  function updateManualForm<K extends keyof ManualEntryForm>(
    field: K,
    value: ManualEntryForm[K]
  ) {
    setManualForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  }

  async function handleManualAnalysisSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const provider = manualForm.provider.trim();
    const amount = Number(manualForm.amount.replace(",", "."));

    if (!provider || !Number.isFinite(amount) || amount <= 0) {
      setManualFormMessage("Renseignez au minimum le fournisseur et un montant valide.");
      return;
    }

    const parsedMobileDataGB = Number(manualForm.mobileDataGB.replace(",", "."));
    const parsedMobileMinimumDataGB = Number(
      manualForm.mobileMinimumDataGB.replace(",", ".")
    );
    if (
      manualForm.documentType === "mobile_invoice" &&
      !manualForm.mobileDataUnlimited &&
      (!manualForm.mobileDataGB.trim() ||
        !Number.isFinite(parsedMobileDataGB) ||
        parsedMobileDataGB < 0)
    ) {
      setManualFormMessage("Renseignez le volume de donnees inclus ou choisissez Illimite.");
      return;
    }
    if (
      manualForm.documentType === "mobile_invoice" &&
      manualForm.mobileAllowLowerDataOffers &&
      (!manualForm.mobileMinimumDataGB.trim() ||
        !Number.isFinite(parsedMobileMinimumDataGB) ||
        parsedMobileMinimumDataGB <= 0)
    ) {
      setManualFormMessage("Renseignez le volume minimum de donnees que vous acceptez.");
      return;
    }

    const activeKey = getStoredAccessKey();
    if (!activeKey) {
      setManualFormMessage("Activez une clé d'accès avant d'ajouter un contrat.");
      return;
    }

    setIsSubmittingManualForm(true);
    setManualFormMessage("Enregistrement du contrat en cours...");
    try {
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activeKey.code,
          manualContract: {
            ...manualForm,
            requestId: crypto.randomUUID(),
            amount,
            mobileDataGB:
              manualForm.documentType === "mobile_invoice" &&
              !manualForm.mobileDataUnlimited &&
              manualForm.mobileDataGB.trim()
              ? parsedMobileDataGB
              : undefined,
            mobileMinimumDataGB:
              manualForm.documentType === "mobile_invoice" &&
              manualForm.mobileAllowLowerDataOffers
                ? parsedMobileMinimumDataGB
                : undefined
          }
        })
      });
      const payload = (await response.json()) as { analysis?: MockAnalysis; error?: string };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error || "Enregistrement du contrat indisponible.");
      }

      const manualAnalysis = payload.analysis;
      storeUploadedDocuments(manualAnalysis.documents);
      storeMockAnalysis(manualAnalysis);
      addAnalysisToReportPortfolio(manualAnalysis);
      window.localStorage.removeItem(SELECTED_ALTERNATIVE_OFFER_STORAGE_KEY);
      setSelectedOffer(null);
      setAnalysis(manualAnalysis);
      setShowManualForm(false);
      router.replace("/resultats");
      setManualFormMessage("Contrat manuel ajouté. Recherche des alternatives en cours.");
      void loadAlternatives(manualAnalysis);
    } catch (error) {
      setManualFormMessage(
        error instanceof Error ? error.message : "Enregistrement du contrat indisponible."
      );
    } finally {
      setIsSubmittingManualForm(false);
    }
  }

  function updateMobileDataConfirmation(
    expense: Expense,
    update: Partial<MobileDataConfirmation>
  ) {
    setMobileDataConfirmations((current) => ({
      ...current,
      [expense.id]: Object.assign(
        getMobileDataConfirmation(expense),
        current[expense.id],
        update
      )
    }));
  }

  async function handleMobileDataConfirmation(expense: Expense) {
    const confirmation = mobileDataConfirmations[expense.id] ?? getMobileDataConfirmation(expense);
    const mobileDataGB = Number(confirmation.mobileDataGB.replace(",", "."));
    const mobileMinimumDataGB = Number(
      confirmation.mobileMinimumDataGB.replace(",", ".")
    );
    if (
      !confirmation.mobileDataUnlimited &&
      (!confirmation.mobileDataGB.trim() || !Number.isFinite(mobileDataGB) || mobileDataGB < 0)
    ) {
      setServiceMessage("Confirmez le volume inclus ou choisissez le forfait illimite.");
      return;
    }
    if (
      confirmation.mobileAllowLowerDataOffers &&
      (!confirmation.mobileMinimumDataGB.trim() ||
        !Number.isFinite(mobileMinimumDataGB) ||
        mobileMinimumDataGB <= 0)
    ) {
      setServiceMessage("Confirmez le volume minimum de donnees que vous acceptez.");
      return;
    }

    const activeKey = getStoredAccessKey();
    if (!activeKey) {
      setServiceMessage("Activez une cle d'acces avant de confirmer le forfait mobile.");
      return;
    }

    setSavingMobileExpenseId(expense.id);
    setServiceMessage(null);
    try {
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activeKey.code,
          mobileContractPreferences: {
            expenseId: expense.id,
            mobileDataGB: confirmation.mobileDataUnlimited ? undefined : mobileDataGB,
            mobileDataUnlimited: confirmation.mobileDataUnlimited,
            mobileAllowLowerDataOffers: confirmation.mobileAllowLowerDataOffers,
            mobileMinimumDataGB: confirmation.mobileAllowLowerDataOffers
              ? mobileMinimumDataGB
              : undefined
          }
        })
      });
      const payload = (await response.json()) as { analysis?: MockAnalysis; error?: string };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error || "Confirmation du forfait mobile indisponible.");
      }

      storeMockAnalysis(payload.analysis);
      addAnalysisToReportPortfolio(payload.analysis);
      setAnalysis(payload.analysis);
      setServiceMessage("Volume mobile confirme. Comparaison actualisee.");
      void loadAlternatives(payload.analysis);
    } catch (error) {
      setServiceMessage(
        error instanceof Error ? error.message : "Confirmation du forfait mobile indisponible."
      );
    } finally {
      setSavingMobileExpenseId(null);
    }
  }

  function handleSelectOffer(offer: AlternativeOffer) {
    storeSelectedAlternativeOffer(offer);
    setSelectedOffer(getSelectedAlternativeOffer());
    setServiceMessage("Offre retenue pour les courriers et le rapport.");
    router.push("/courriers");
  }

  async function loadAlternatives(analysisToLoad: MockAnalysis) {
    const requestController = alternativesRequestController.current!;
    const request = requestController.start();
    setIsLoadingAlternatives(true);
    setServiceMessage(null);

    try {
      const activeKey = getStoredAccessKey();
      const response = await fetch("/api/alternatives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: request.signal,
        body: JSON.stringify({ code: activeKey?.code })
      });

      if (!response.ok) {
        throw new Error("Service alternatives indisponible.");
      }

      const payload = (await response.json()) as {
        alternatives?: AlternativeOffer[];
        catalog?: {
          status?: "fresh" | "stale" | "empty";
          verifiedAt?: string | null;
        };
        comparisonMessage?: string | null;
        comparisonStates?: ContractComparisonState[];
      };
      if (!requestController.isCurrent(request)) return;

      const nextAlternatives = payload.alternatives ?? [];
      const alternativeSavings = computeAlternativeSavings(
        analysisToLoad,
        nextAlternatives
      );
      const analysisWithSavings =
        alternativeSavings !== analysisToLoad.yearlyPotentialSavings
          ? {
              ...analysisToLoad,
              yearlyPotentialSavings: alternativeSavings
            }
          : analysisToLoad;

      if (analysisWithSavings !== analysisToLoad) {
        setAnalysis(analysisWithSavings);
        storeMockAnalysis(analysisWithSavings);
        persistYearlyPotentialSavings(alternativeSavings);
      }
      addAnalysisToReportPortfolio(analysisWithSavings);
      setAlternatives(nextAlternatives);
      setSelectedOffer((currentOffer) =>
        refreshSelectedAlternativeOffer(currentOffer, nextAlternatives)
      );
      setAlternativesUpdatedAt(payload.catalog?.verifiedAt ?? null);
      setCatalogStatus(payload.catalog?.status ?? null);
      setComparisonMessage(payload.comparisonMessage ?? null);
      setComparisonStates(payload.comparisonStates ?? []);
    } catch {
      if (!requestController.isCurrent(request)) return;

      setAlternatives([]);
      setAlternativesUpdatedAt(null);
      setCatalogStatus(null);
      setComparisonMessage(null);
      setComparisonStates([]);
      setServiceMessage(
        "Les alternatives détaillées seront affichées quand le service de comparaison sera connecté."
      );
    } finally {
      if (requestController.isCurrent(request)) {
        setIsLoadingAlternatives(false);
        requestController.finish(request);
      }
    }
  }

  useEffect(() => {
    setSelectedOffer(getSelectedAlternativeOffer());

    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasCurrentAnalysis = isAnalysisForDocuments(storedAnalysis, documents);
    const hasUsableCurrentAnalysis =
      hasCurrentAnalysis && hasUsableAmounts(storedAnalysis);

    setAnalysis(hasUsableCurrentAnalysis ? storedAnalysis : null);

    if (storedAnalysis && hasUsableCurrentAnalysis) {
      addAnalysisToReportPortfolio(storedAnalysis);
      void loadAlternatives(storedAnalysis);
    }

    async function loadServerState() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const serverAnalysis = await getStoredAnalysisServer();
      const currentAnalysis = getStoredMockAnalysis();

      if (isManualAnalysis(currentAnalysis)) {
        return;
      }

      if (
        isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
        hasUsableAmounts(serverAnalysis) &&
        serverAnalysis
      ) {
        storeMockAnalysis(serverAnalysis);
        addAnalysisToReportPortfolio(serverAnalysis);
        setAnalysis(serverAnalysis);
        void loadAlternatives(serverAnalysis);
      }
    }

    void loadServerState();
  }, []);

  useEffect(() => {
    setRealizedSavings(
      analysis ? getRealizedSavingsForAnalysis(analysis, activeAccessKeyCode) : []
    );
  }, [activeAccessKeyCode, analysis]);

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
  const firstManualExpenseByCategory = useMemo(() => {
    if (!analysis) return {};

    return analysis.expenses.reduce<Partial<Record<string, MockAnalysis["expenses"][number]>>>(
      (manualExpenses, expense) => {
        if (!expense.billingFrequency || expense.billingFrequency === "monthly") {
          return manualExpenses;
        }

        return {
          ...manualExpenses,
          [expense.category]: manualExpenses[expense.category] ?? expense
        };
      },
      {}
    );
  }, [analysis]);
  const firstUncertainExpenseByCategory = useMemo(() => {
    if (!analysis) return {};

    return analysis.expenses.reduce<Partial<Record<string, MockAnalysis["expenses"][number]>>>(
      (uncertainExpenses, expense) => {
        if (!formatFrequencyWarning(expense)) {
          return uncertainExpenses;
        }

        return {
          ...uncertainExpenses,
          [expense.category]: uncertainExpenses[expense.category] ?? expense
        };
      },
      {}
    );
  }, [analysis]);
  const topExpenses = useMemo(
    () => getTopExpenses(currentDisplayExpenses, 5),
    [currentDisplayExpenses]
  );
  const hasMobileExpense = useMemo(
    () => analysis?.expenses.some((expense) => expense.subcategory === ExpenseSubcategory.MOBILE) ?? false,
    [analysis]
  );
  const primaryAlternatives = useMemo(
    () => alternatives.filter(isPrimaryAlternative),
    [alternatives]
  );
  const bestIndicativeAlternative = useMemo(
    () => primaryAlternatives.find(
      (offer) =>
        offer.savingKind === "recurring_only" &&
        offer.estimatedYearlySaving > 0
    ),
    [primaryAlternatives]
  );
  const temporaryPromotionAlternatives = useMemo(
    () => alternatives.filter((offer) => offer.savingKind === "temporary"),
    [alternatives]
  );
  const compromiseAlternatives = useMemo(
    () => alternatives.filter((offer) =>
      offer.comparisonKind === "reduced_data" ||
      offer.comparisonKind === "additional_commitment" ||
      offer.comparisonKind === "requires_validation"
    ),
    [alternatives]
  );
  const mobileExpensesNeedingConfirmation = useMemo(
    () =>
      analysis?.expenses.filter(
        (expense) =>
          expense.subcategory === ExpenseSubcategory.MOBILE &&
          ((
            !expense.mobileDataUnlimited &&
            !(typeof expense.mobileIncludedDataGB === "number" &&
              Number.isFinite(expense.mobileIncludedDataGB)) &&
            !(typeof expense.mobileDataGB === "number" && Number.isFinite(expense.mobileDataGB))
          ) || (
            expense.mobileAllowLowerDataOffers === true &&
            !(typeof expense.mobileMinimumDataGB === "number" &&
              Number.isFinite(expense.mobileMinimumDataGB) &&
              expense.mobileMinimumDataGB > 0)
          ))
      ) ?? [],
    [analysis]
  );
  const bestAlternativeByCategory = useMemo(() => {
    return primaryAlternatives.reduce<Partial<Record<string, AlternativeOffer>>>(
      (bestOffers, offer) => {
        const currentOffer = bestOffers[offer.category];
        const verifiedSaving = analysis
          ? computeVerifiedOfferSaving(offer, analysis)
          : offer.estimatedYearlySaving;
        const currentVerifiedSaving =
          currentOffer && analysis
            ? computeVerifiedOfferSaving(currentOffer, analysis)
            : currentOffer?.estimatedYearlySaving;
        if (
          !currentOffer ||
          verifiedSaving > (currentVerifiedSaving ?? 0)
        ) {
          bestOffers[offer.category] = offer;
        }

        return bestOffers;
      },
      {}
    );
  }, [primaryAlternatives, analysis]);
  const bestAlternativeByExpense = useMemo(() => {
    return primaryAlternatives.reduce<Record<string, AlternativeOffer>>(
      (bestOffers, offer) => {
        const expenseId = analysis ? getExpenseIdFromAlternativeId(offer, analysis) : undefined;
        if (!analysis || !expenseId) return bestOffers;

        const currentOffer = bestOffers[expenseId];
        const verifiedSaving = computeVerifiedOfferSaving(offer, analysis);
        const currentVerifiedSaving = currentOffer
          ? computeVerifiedOfferSaving(currentOffer, analysis)
          : 0;
        if (!currentOffer || verifiedSaving > currentVerifiedSaving) {
          bestOffers[expenseId] = offer;
        }

        return bestOffers;
      },
      {}
    );
  }, [primaryAlternatives, analysis]);
  if (showManualForm || !analysis || analysis.expenses.length === 0) {
    return (
      <section className="space-y-6">
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez les documents que vous souhaitez comparer pour afficher vos résultats."
        icon={<FileSearch size={24} />}
        title="Vos résultats apparaîtront ici"
      />
        <Card>
          <div className="flex flex-col gap-2">
            <Badge tone="green">Saisie manuelle sans televersement</Badge>
            <h2 className="text-2xl font-semibold text-navy-900">
              Ajouter un contrat manuellement
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              Utilisez ce mode pour un document multi-contrats ou si vous preferez ne pas
              televerser de fichier. Futeo analysera uniquement la ligne saisie ici.
            </p>
          </div>

          {manualFormMessage ? (
            <div className="mt-4 rounded-lg border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-medium text-sage-900">
              {manualFormMessage}
            </div>
          ) : null}

          <form className="mt-5 grid gap-4" onSubmit={handleManualAnalysisSubmit}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-navy-900">
                Fournisseur
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("provider", event.target.value)}
                  placeholder="Ex : MACIF, EDF, SFR"
                  value={manualForm.provider}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Type de contrat
                <select
                  className={manualInputClass}
                  onChange={(event) =>
                    updateManualForm("documentType", event.target.value as UploadedDocumentType)
                  }
                  value={manualForm.documentType}
                >
                  {visibleDocumentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Montant
                <input
                  className={manualInputClass}
                  inputMode="decimal"
                  onChange={(event) => updateManualForm("amount", event.target.value)}
                  placeholder="Ex : 187,80"
                  value={manualForm.amount}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-navy-900">
                Frequence
                <select
                  className={manualInputClass}
                  onChange={(event) =>
                    updateManualForm(
                      "frequency",
                      event.target.value as NonNullable<DocumentUserCorrections["frequency"]>
                    )
                  }
                  value={manualForm.frequency}
                >
                  {manualFrequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Prenom client
                <input
                  className={manualInputClass}
                  onChange={(event) =>
                    updateManualForm("clientFirstName", event.target.value)
                  }
                  placeholder="Optionnel"
                  value={manualForm.clientFirstName}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Nom client
                <input
                  className={manualInputClass}
                  onChange={(event) =>
                    updateManualForm("clientLastName", event.target.value)
                  }
                  placeholder="Optionnel"
                  value={manualForm.clientLastName}
                />
              </label>
            </div>

            {manualForm.documentType === "mobile_invoice" ? (
              <div className="grid gap-4 rounded-xl border border-navy-100 bg-navy-50/40 p-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-navy-900">
                  Volume de donnees inclus (Go)
                  <input
                    className={manualInputClass}
                    disabled={manualForm.mobileDataUnlimited}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => updateManualForm("mobileDataGB", event.target.value)}
                    placeholder="Ex : 100 ou 12,5"
                    required={!manualForm.mobileDataUnlimited}
                    step="any"
                    type="number"
                    value={manualForm.mobileDataGB}
                  />
                </label>
                <label className="flex items-center gap-3 self-end rounded-lg border border-navy-100 bg-white px-4 py-3 text-sm font-semibold text-navy-900">
                  <input
                    checked={manualForm.mobileDataUnlimited}
                    className="h-4 w-4 accent-sage-600"
                    onChange={(event) => {
                      updateManualForm("mobileDataUnlimited", event.target.checked);
                      if (event.target.checked) updateManualForm("mobileDataGB", "");
                    }}
                    type="checkbox"
                  />
                  Internet mobile illimite
                </label>
              </div>
            ) : null}

            {manualForm.documentType === "internet_invoice" ? (
              <label className="flex items-center gap-3 rounded-lg border border-navy-100 bg-white px-4 py-3 text-sm font-semibold text-navy-900 md:max-w-sm">
                <input
                  checked={manualForm.internetTvIncluded}
                  className="h-4 w-4 accent-sage-600"
                  onChange={(event) =>
                    updateManualForm("internetTvIncluded", event.target.checked)
                  }
                  type="checkbox"
                />
                Option TV incluse
              </label>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-navy-900">
                Adresse client
                <textarea
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("clientAddress", event.target.value)}
                  placeholder="Optionnel, utile pour les courriers"
                  rows={3}
                  value={manualForm.clientAddress}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Adresse fournisseur
                <textarea
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("providerAddress", event.target.value)}
                  placeholder="Optionnel, utile pour les courriers"
                  rows={3}
                  value={manualForm.providerAddress}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-navy-900">
                Numéro client
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("customerNumber", event.target.value)}
                  placeholder="Optionnel"
                  value={manualForm.customerNumber}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Numéro de contrat
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("contractNumber", event.target.value)}
                  placeholder="Optionnel"
                  value={manualForm.contractNumber}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Numéro de facture
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("invoiceNumber", event.target.value)}
                  placeholder="Optionnel"
                  value={manualForm.invoiceNumber}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-navy-900">
                Téléphone
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("phone", event.target.value)}
                  placeholder="Optionnel"
                  value={manualForm.phone}
                />
              </label>

              <label className="text-sm font-semibold text-navy-900">
                Email
                <input
                  className={manualInputClass}
                  onChange={(event) => updateManualForm("email", event.target.value)}
                  placeholder="Optionnel"
                  type="email"
                  value={manualForm.email}
                />
              </label>
            </div>

            {manualForm.documentType === "mobile_invoice" ? (
              <fieldset className="rounded-xl border border-sage-200 bg-sage-50 p-4">
                <legend className="px-1 text-sm font-semibold text-navy-900">
                  Avez-vous réellement besoin d&apos;autant de Go ?
                </legend>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Si vous n&apos;utilisez pas toutes les données incluses dans votre forfait,
                  une offre avec moins de Go pourrait vous permettre d&apos;économiser davantage.
                </p>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center gap-3 text-sm font-medium text-navy-900">
                    <input
                      checked={!manualForm.mobileAllowLowerDataOffers}
                      className="h-4 w-4 accent-sage-600"
                      name="mobile-lower-data"
                      onChange={() => {
                        updateManualForm("mobileAllowLowerDataOffers", false);
                        updateManualForm("mobileMinimumDataGB", "");
                      }}
                      type="radio"
                    />
                    Non, je souhaite conserver mon volume actuel.
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium text-navy-900">
                    <input
                      checked={manualForm.mobileAllowLowerDataOffers}
                      className="h-4 w-4 accent-sage-600"
                      name="mobile-lower-data"
                      onChange={() => updateManualForm("mobileAllowLowerDataOffers", true)}
                      type="radio"
                    />
                    Oui, je souhaite également découvrir des forfaits avec moins de Go.
                  </label>
                </div>
                {manualForm.mobileAllowLowerDataOffers ? (
                  <label className="mt-4 block text-sm font-semibold text-navy-900">
                    Volume minimum acceptable (Go)
                    <input
                      className={manualInputClass}
                      inputMode="decimal"
                      min="0.01"
                      onChange={(event) =>
                        updateManualForm("mobileMinimumDataGB", event.target.value)
                      }
                      placeholder="Ex : 300"
                      required
                      step="any"
                      type="number"
                      value={manualForm.mobileMinimumDataGB}
                    />
                    <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                      Futéo n'affichera aucun forfait limité sous ce seuil. La consommation
                      observée peut relever automatiquement ce minimum avec une marge de sécurité.
                    </span>
                  </label>
                ) : null}
              </fieldset>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button disabled={isSubmittingManualForm} type="submit">
                {isSubmittingManualForm ? "Enregistrement..." : "Comparer ce contrat"}
              </Button>
              <Button href="/importer" variant="secondary">
                Importer un document
              </Button>
            </div>
          </form>
        </Card>
      </section>
    );
  }

  const currentFinancialSummary = financialSummary!;
  const hasMeaningfulSavings = currentFinancialSummary.potentialYearlySaving > 0;
  const hasIndicativeTariffSaving = Boolean(bestIndicativeAlternative);
  const hasActionableAlternative = hasMeaningfulSavings || hasIndicativeTariffSaving;
  const isDiscoveryAccess = isDiscoveryPlan(getStoredAccessKey()?.plan);
  const conditionalSupportOffers = isDiscoveryAccess
    ? []
    : findConditionalInternetSupportOffers(analysis.expenses);

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
        {isDiscoveryAccess ? (
          <Button href="/tarifs">🔓 Débloquer mon audit complet</Button>
        ) : hasActionableAlternative || isManualAnalysis(analysis) ? (
          <Button href="/courriers">Préparer mes courriers</Button>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button href="/rapport">Voir mon rapport</Button>
            <Button href="/importer" variant="secondary">
              Ajouter un document
            </Button>
          </div>
        )}
      </div>

      {!hasMeaningfulSavings ? (
        <Card className="border-sage-200 bg-sage-50">
          {bestIndicativeAlternative ? (
            <>
              <h2 className="text-lg font-semibold text-navy-900">
                Économie tarifaire estimée identifiée
              </h2>
              <p className="mt-2 font-semibold text-navy-900">
                {bestIndicativeAlternative.provider} - {bestIndicativeAlternative.name}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatOfferBilling(bestIndicativeAlternative)}
              </p>
              <p className="mt-2 text-sm font-semibold text-sage-700">
                Environ {formatCurrency(bestIndicativeAlternative.estimatedYearlySaving / 12)} / mois et{" "}
                {formatCurrency(bestIndicativeAlternative.estimatedYearlySaving)} / an d'écart tarifaire.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Montant indicatif, hors frais ponctuels. Des frais ponctuels peuvent réduire les
                économies estimées. Vérifiez les conditions du fournisseur.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-navy-900">
                Aucune économie significative détectée
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Le montant analysé ne fait pas ressortir d'offre clairement plus avantageuse.
                Vous pouvez conserver ce constat dans le rapport, ajouter d'autres documents
                ou vérifier la fréquence et le montant saisis.
              </p>
            </>
          )}
        </Card>
      ) : null}

      {serviceMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900">
          {serviceMessage}
        </div>
      ) : null}

      {mobileExpensesNeedingConfirmation.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-700" size={22} />
            <h2 className="text-lg font-semibold text-navy-900">
              Confirmez vos besoins avant la comparaison mobile
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Confirmez le volume inclus et, si vous acceptez un forfait moins généreux, le seuil
            minimum qui reste adapté à vos besoins. Futéo ne proposera rien sous ce seuil.
          </p>
          <div className="mt-4 space-y-4">
            {mobileExpensesNeedingConfirmation.map((expense) => {
              const confirmation =
                mobileDataConfirmations[expense.id] ?? getMobileDataConfirmation(expense);

              return (
                <div className="rounded-xl border border-amber-200 bg-white p-4" key={expense.id}>
                  <p className="font-semibold text-navy-900">
                    {getExpenseDisplayLabel(expense)} - {expense.provider}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-semibold text-navy-900">
                      Volume de données inclus (Go)
                      <input
                        className={manualInputClass}
                        disabled={confirmation.mobileDataUnlimited}
                        inputMode="decimal"
                        min="0"
                        onChange={(event) =>
                          updateMobileDataConfirmation(expense, {
                            mobileDataGB: event.target.value
                          })
                        }
                        placeholder="Ex : 100 ou 12,5"
                        step="any"
                        type="number"
                        value={confirmation.mobileDataGB}
                      />
                    </label>
                    <label className="flex items-center gap-3 self-end rounded-lg border border-navy-100 px-4 py-3 text-sm font-semibold text-navy-900">
                      <input
                        checked={confirmation.mobileDataUnlimited}
                        className="h-4 w-4 accent-sage-600"
                        onChange={(event) =>
                          updateMobileDataConfirmation(expense, {
                            mobileDataUnlimited: event.target.checked,
                            ...(event.target.checked ? { mobileDataGB: "" } : {})
                          })
                        }
                        type="checkbox"
                      />
                      Internet mobile illimité
                    </label>
                  </div>
                  <fieldset className="mt-4 rounded-xl border border-sage-200 bg-sage-50 p-4">
                    <legend className="px-1 text-sm font-semibold text-navy-900">
                      Avez-vous réellement besoin d&apos;autant de Go ?
                    </legend>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Si vous n&apos;utilisez pas toutes les données incluses dans votre forfait,
                      une offre avec moins de Go pourrait vous permettre d&apos;économiser davantage.
                    </p>
                    <div className="mt-3 grid gap-2">
                      <label className="flex items-center gap-3 text-sm font-medium text-navy-900">
                        <input
                          checked={!confirmation.mobileAllowLowerDataOffers}
                          className="h-4 w-4 accent-sage-600"
                          name={`mobile-lower-data-${expense.id}`}
                          onChange={() =>
                            updateMobileDataConfirmation(expense, {
                              mobileAllowLowerDataOffers: false,
                              mobileMinimumDataGB: ""
                            })
                          }
                          type="radio"
                        />
                        Non, je souhaite conserver mon volume actuel.
                      </label>
                      <label className="flex items-center gap-3 text-sm font-medium text-navy-900">
                        <input
                          checked={confirmation.mobileAllowLowerDataOffers}
                          className="h-4 w-4 accent-sage-600"
                          name={`mobile-lower-data-${expense.id}`}
                          onChange={() =>
                            updateMobileDataConfirmation(expense, {
                              mobileAllowLowerDataOffers: true
                            })
                          }
                          type="radio"
                        />
                        Oui, je souhaite également découvrir des forfaits avec moins de Go.
                      </label>
                    </div>
                    {confirmation.mobileAllowLowerDataOffers ? (
                      <label className="mt-4 block text-sm font-semibold text-navy-900">
                        Volume minimum acceptable (Go)
                        <input
                          className={manualInputClass}
                          inputMode="decimal"
                          min="0.01"
                          onChange={(event) =>
                            updateMobileDataConfirmation(expense, {
                              mobileMinimumDataGB: event.target.value
                            })
                          }
                          placeholder="Ex : 300"
                          required
                          step="any"
                          type="number"
                          value={confirmation.mobileMinimumDataGB}
                        />
                        <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">
                          Aucune offre limitée sous ce seuil ne sera proposée. Si une consommation
                          est connue, Futéo conserve aussi une marge de sécurité de 20 %.
                        </span>
                      </label>
                    ) : null}
                  </fieldset>
                  <Button
                    className="mt-4"
                    disabled={savingMobileExpenseId === expense.id}
                    onClick={() => void handleMobileDataConfirmation(expense)}
                    type="button"
                  >
                    {savingMobileExpenseId === expense.id
                      ? "Confirmation..."
                      : "Confirmer et comparer"}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dépenses actuelles mensuelles"
          value={formatCurrency(currentFinancialSummary.currentMonthlyAmount)}
        />
        <StatCard
          label="Dépenses actuelles annuelles"
          value={formatCurrency(currentFinancialSummary.currentYearlyAmount)}
        />
        <StatCard
          helper={currentFinancialSummary.potentialStatus === "partial"
            ? "Montant partiel vérifié"
            : currentFinancialSummary.potentialStatus === "undetermined"
              ? "Comparaison insuffisante"
              : "Comparaisons vérifiées"}
          icon={<Lightbulb size={22} />}
          label="Économies potentielles"
          value={currentFinancialSummary.potentialStatus === "undetermined"
            ? "Non déterminé"
            : `${formatCurrency(currentFinancialSummary.potentialYearlySaving)} / an`}
        />
        <StatCard
          helper="Réductions confirmées et effectives"
          label="Économies réalisées"
          value={`${formatCurrency(currentFinancialSummary.realizedYearlySaving)} / an`}
        />
      </div>

      {selectedOffer && !isDiscoveryAccess ? (
        <Card className="border-sage-200 bg-sage-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge tone="blue">Offre retenue pour comparaison</Badge>
              <h2 className="mt-3 text-lg font-semibold text-navy-900">
                {selectedOffer.provider} - {selectedOffer.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cette offre sera reprise dans les courriers et le rapport.
              </p>
              <div className="mt-3">
                <Button href="/courriers" variant="secondary">
                  Préparer le courrier avec cette offre
                </Button>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-semibold text-navy-900">
                {formatOfferBilling(selectedOffer)}
              </p>
              <p className="text-sm font-semibold text-sage-700">
                {typeof selectedOffer.durableYearlySaving === "number"
                  ? `${formatCurrency(selectedOffer.durableYearlySaving)} / an d'économie durable · ${formatCurrency(selectedOffer.estimatedYearlySaving)} estimés sur 12 mois`
                  : selectedOffer.savingKind === "recurring_only"
                  ? `${formatCurrency(selectedOffer.estimatedYearlySaving / 12)} / mois · ${formatCurrency(selectedOffer.estimatedYearlySaving)} / an estimés hors frais ponctuels`
                  : `${formatCurrency(selectedOffer.estimatedYearlySaving)} / an estimés`}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-navy-900">
            Postes à comparer
          </h2>
          <div className="mt-4 space-y-3">
            {categorySummaries.map((summary) => {
              const bestOffer = bestAlternativeByCategory[summary.category];
              const bestOfferExpense =
                bestOffer && analysis ? getExpenseForAlternative(bestOffer, analysis) : undefined;
              const manualExpense = firstManualExpenseByCategory[summary.category];
              const uncertainExpense = firstUncertainExpenseByCategory[summary.category];
              const billingHint = manualExpense ? formatBillingHint(manualExpense) : null;
              const frequencyWarning = uncertainExpense
                ? formatFrequencyWarning(uncertainExpense)
                : null;
              const noAlternativeMessage = getComparisonMessageForExpenses(
                summary.expenses,
                comparisonStates
              );

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
                  {billingHint ? (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {billingHint}
                    </p>
                  ) : null}
                  {!bestOffer && !isLoadingAlternatives ? (
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      {noAlternativeMessage}
                    </p>
                  ) : null}
                  {frequencyWarning ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      {frequencyWarning}
                    </p>
                  ) : null}
                  {bestOffer && isDiscoveryAccess ? (
                    <div className="mt-4 rounded-lg border border-sage-200 bg-sage-50 p-3">
                      <p className="text-sm font-semibold text-sage-700">
                        Économie potentielle :{" "}
                        {formatCurrency(computeVerifiedOfferSaving(bestOffer, analysis))} / an
                      </p>
                      <p className="mt-3 font-semibold text-navy-900">
                        🔒 Opérateur sélectionné caché
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Notre comparateur a identifié une offre adaptée à votre profil.
                      </p>
                      <Button className="mt-3" href="/tarifs" variant="secondary">
                        🔓 Débloquer mes économies
                      </Button>
                    </div>
                  ) : bestOffer ? (
                    <div className="mt-4 rounded-lg bg-sage-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
                        Meilleure offre repérée
                      </p>
                      {bestOfferExpense ? (
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Sur : {bestOfferExpense.label}
                        </p>
                      ) : null}
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
              const bestOffer = bestAlternativeByExpense[expense.id];
              const comparisonState = comparisonStates.find(
                (state) => state.expenseId === expense.id
              );

              return (
                <div className="rounded-lg border border-transparent bg-white p-3" key={expense.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo
                        logoUrl={getProviderBranding(expense.provider).logoUrl}
                        provider={expense.provider}
                      />
                      <div>
                        <p className="font-medium text-navy-900">
                          {getExpenseDisplayLabel(expense)}
                        </p>
                        <p className="text-sm text-slate-500">
                          {expenseCategoryLabels[expense.category]} - {expense.provider}
                        </p>
                        {formatBillingHint(expense) ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {formatBillingHint(expense)}
                          </p>
                        ) : null}
                        {formatFrequencyWarning(expense) ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            {formatFrequencyWarning(expense)}
                          </p>
                        ) : null}
                        {!bestOffer && comparisonState ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {comparisonState.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="font-semibold text-navy-900">
                      {formatCurrency(expense.yearlyAmount)} / an
                    </p>
                  </div>
                  {bestOffer && isDiscoveryAccess ? (
                    <div className="mt-3 rounded-lg border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-semibold text-sage-800">
                      🔒 Opérateur sélectionné caché
                    </div>
                  ) : bestOffer ? (
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

      <ContractDetailsConfirmationPanel
        analysis={analysis}
        onSaved={(updatedAnalysis) => {
          setAnalysis(updatedAnalysis);
          storeMockAnalysis(updatedAnalysis);
          addAnalysisToReportPortfolio(updatedAnalysis);
          void loadAlternatives(updatedAnalysis);
        }}
      />

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
                Offres vérifiées le{" "}
                {new Date(alternativesUpdatedAt).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            ) : null}
            {hasMobileExpense && catalogStatus && catalogStatus !== "fresh" ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">
                Catalogue mobile non exploitable actuellement.
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
        {comparisonMessage ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {comparisonMessage}
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {isLoadingAlternatives && alternatives.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-navy-100 p-4 text-sm font-medium text-slate-600">
              <Loader2 className="animate-spin text-sage-700" size={18} />
              Recherche des offres concurrentes...
            </div>
          ) : primaryAlternatives.length > 0 ? (
            primaryAlternatives.map((offer) => {
              const verifiedSaving = computeVerifiedOfferSaving(offer, analysis);
              const recurringSaving = offer.recurringYearlySaving ?? verifiedSaving;
              const sourceExpense = getExpenseForAlternative(offer, analysis);

              if (isDiscoveryAccess) {
                return (
                  <div className="rounded-lg border border-sage-200 bg-sage-50 p-4" key={offer.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Badge tone="green">{expenseCategoryLabels[offer.category]}</Badge>
                      <p className="font-semibold text-sage-700">
                        {offer.savingKind === "recurring_only"
                          ? `Écart récurrent estimé : ${formatCurrency(recurringSaving)} / an`
                          : `Économie nette estimée : ${formatCurrency(verifiedSaving)} / an`}
                      </p>
                    </div>
                    <p className="mt-4 font-semibold text-navy-900">
                      🔒 Opérateur sélectionné caché
                    </p>
                    <div className="mt-4 rounded-lg border border-sage-200 bg-white p-4">
                      <p className="text-sm leading-6 text-slate-600">
                        💡 Notre comparateur a trouvé une offre parfaitement adaptée à votre
                        profil. Débloquez votre audit complet pour découvrir le fournisseur idéal
                        et obtenir vos courriers de résiliation prêts à l&apos;envoi.
                      </p>
                      <Button className="mt-4" href="/tarifs">
                        🔓 Débloquer mes économies
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  className={
                    selectedOffer?.id === offer.id
                      ? "rounded-lg border border-sage-400 bg-sage-50 p-4"
                      : "rounded-lg border border-navy-100 p-4"
                  }
                  key={offer.id}
                >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="green">{expenseCategoryLabels[offer.category]}</Badge>
                    {selectedOffer?.id === offer.id ? (
                      <Badge tone="blue">Offre choisie pour le courrier et le rapport</Badge>
                    ) : null}
                  </div>
                  <p className="font-semibold text-sage-700">
                    {sourceExpense?.subcategory === ExpenseSubcategory.INTERNET && typeof offer.durableYearlySaving === "number"
                      ? `Économie durable : ${formatCurrency(offer.durableYearlySaving)} / an · 12 premiers mois : ${formatCurrency(verifiedSaving)}`
                      : offer.savingKind === "recurring_only"
                      ? `Économie tarifaire estimée : ${formatCurrency(offer.estimatedYearlySaving / 12)} / mois · ${formatCurrency(offer.estimatedYearlySaving)} / an`
                      : `Économie estimée sur 12 mois : ${formatCurrency(verifiedSaving)}`}
                  </p>
                </div>
                {sourceExpense ? (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Forfait actuel : {sourceExpense.provider} - {formatCurrency(sourceExpense.monthlyAmount)} / mois
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <ProviderLogo logoUrl={offer.logoUrl} provider={offer.provider} />
                  <div>
                    <h3 className="font-semibold text-navy-900">{offer.name}</h3>
                    <p className="text-sm text-slate-500">
                      {offer.provider} - {sourceExpense?.subcategory === ExpenseSubcategory.INTERNET
                        ? formatOfferBilling(offer)
                        : `${formatCurrency(offer.monthlyPrice)} / mois`}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {offer.reason}
                </p>
                {offer.conditions && offer.conditions.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-500">
                    {offer.conditions.map((condition) => (
                      <li key={condition}>Condition : {condition}</li>
                    ))}
                  </ul>
                ) : null}
                {offer.conditionalPrices && offer.conditionalPrices.length > 0 ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Des remises conditionnelles existent mais ne sont pas incluses dans le calcul.
                  </p>
                ) : null}
                <p className="mt-2 text-sm font-medium text-navy-900">
                  {offer.action}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => handleSelectOffer(offer)} type="button" variant="secondary">
                    Choisir pour mon courrier et mon rapport
                  </Button>
                  {offer.entryFeesKnown === false ? (
                    <p className="basis-full text-sm text-amber-800">
                      Des frais de mise en service ou de résiliation peuvent réduire les économies estimées.
                    </p>
                  ) : null}
                  <a
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
                    href={offer.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Voir l'offre <ExternalLink size={15} />
                  </a>
                </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-600">
              {comparisonMessage ??
                "Aucune offre vérifiée plus avantageuse n'a été identifiée avec les informations actuellement disponibles. Votre contrat reste affiché et vous pouvez compléter les informations demandées avant de relancer la comparaison."}
            </p>
          )}
        </div>
      </Card>

      {temporaryPromotionAlternatives.length > 0 ? (
        <Card className="border-blue-200 bg-blue-50">
          <h2 className="text-lg font-semibold text-navy-900">Promotions temporaires</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ces offres sont moins chères pendant une durée limitée. Leur économie n'est pas
            présentée comme durable et n'est pas ajoutée au total principal.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {temporaryPromotionAlternatives.map((offer) => (
              <div className="rounded-lg border border-blue-200 bg-white p-4" key={offer.id}>
                <Badge tone="blue">Promotion temporaire</Badge>
                <h3 className="mt-3 font-semibold text-navy-900">{offer.provider} - {offer.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatCurrency(offer.monthlyPrice)} / mois
                  {offer.priceAfterPromotion !== undefined
                    ? ` puis ${formatCurrency(offer.priceAfterPromotion)} / mois`
                    : ""}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{offer.reason}</p>
                <a
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900"
                  href={offer.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Vérifier la promotion <ExternalLink size={15} />
                </a>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {compromiseAlternatives.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <Lightbulb className="text-amber-700" size={22} />
            <h2 className="text-lg font-semibold text-navy-900">
              Autres possibilités pour réduire votre facture
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ces offres réduisent le volume de données, ajoutent un engagement ou nécessitent une
            vérification complémentaire. Elles ne sont jamais traitées comme équivalentes et leurs
            économies ne sont pas ajoutées au total principal.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {compromiseAlternatives.map((offer) => (
              <div className="rounded-lg border border-amber-200 bg-white p-4" key={offer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="amber">
                      {offer.comparisonKind === "reduced_data"
                        ? "Volume réduit"
                        : offer.comparisonKind === "additional_commitment"
                          ? "Engagement supplémentaire"
                          : "À vérifier"}
                    </Badge>
                    <Badge tone="neutral">Forfait mobile</Badge>
                  </div>
                  <p className="font-semibold text-amber-800">
                    {offer.netFirstYearSaving !== undefined
                      ? `Écart net possible : ${formatCurrency(offer.netFirstYearSaving)}`
                      : `Écart récurrent possible : ${formatCurrency(offer.recurringYearlySaving ?? 0)} / an`}
                  </p>
                </div>
                {isDiscoveryAccess ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-navy-900">Opérateur sélectionné caché</p>
                    <Button className="mt-3" href="/tarifs" variant="secondary">
                      Débloquer mon audit complet
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <ProviderLogo logoUrl={offer.logoUrl} provider={offer.provider} />
                      <div>
                        <h3 className="font-semibold text-navy-900">{offer.name}</h3>
                        <p className="text-sm text-slate-500">
                          {offer.provider} - {formatCurrency(offer.monthlyPrice)} / mois
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{offer.reason}</p>
                    <a
                      className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-amber-100"
                      href={offer.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Voir le compromis <ExternalLink size={15} />
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {conditionalSupportOffers.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <Lightbulb className="text-amber-700" size={22} />
            <h2 className="text-lg font-semibold text-navy-900">
              Offre solidaire sous conditions
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Cette piste est présentée séparément : elle dépend de votre éligibilité et
            n&apos;est jamais retenue automatiquement pour vos démarches.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {conditionalSupportOffers.map((offer) => (
              <div className="rounded-lg border border-amber-200 bg-white p-4" key={offer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ProviderLogo logoUrl={offer.logoUrl} provider={offer.provider} />
                    <div>
                      <h3 className="font-semibold text-navy-900">{offer.name}</h3>
                      <p className="text-sm text-slate-500">
                        {offer.provider} - {formatCurrency(offer.monthlyPrice)} / mois
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-sage-700">
                    Jusqu&apos;à {formatCurrency(offer.estimatedYearlySaving)} / an
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {offer.condition}
                </p>
                <a
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-amber-100"
                  href={offer.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Vérifier mon éligibilité <ExternalLink size={15} />
                </a>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

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
