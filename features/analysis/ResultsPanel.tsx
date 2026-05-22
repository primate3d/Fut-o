"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { getStoredAccessKey } from "@/features/billing/access-keys";
import type { AlternativeOffer } from "@/features/recommendations/service";
import {
  getSelectedAlternativeOffer,
  storeSelectedAlternativeOffer,
  type SelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import {
  getCategoryForDocumentType,
  getDocumentTypeLabel,
  visibleDocumentTypeOptions
} from "@/features/upload/document-types";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer,
  storeUploadedDocuments
} from "@/features/upload/storage";
import {
  expenseCategoryLabels,
  getTopExpenses,
  summarizeExpensesByCategory
} from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import { formatCurrency } from "@/lib/utils";
import {
  ExpenseSubcategory,
  type DocumentUserCorrections,
  type MockAnalysis,
  type UploadedDocument,
  type UploadedDocumentType
} from "@/types";
import {
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  isAnalysisForDocuments,
  storeMockAnalysis
} from "./storage";

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

function getExpenseIdFromAlternativeId(offer: AlternativeOffer, analysis: MockAnalysis) {
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

function computeAlternativeSavings(analysis: MockAnalysis, alternatives: AlternativeOffer[]) {
  const bestSavingByExpense = alternatives.reduce<Record<string, number>>((savings, offer) => {
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
  const expense = analysis.expenses.find((candidate) =>
    offer.id.startsWith(`alternative_${candidate.id}_`)
  );

  if (!expense) return offer.estimatedYearlySaving;

  return Math.max(0, expense.yearlyAmount - offer.yearlyPrice);
}

function getExpenseForAlternative(offer: AlternativeOffer, analysis: MockAnalysis) {
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  );
}

function getSavingsStorageKey(auditKey: string) {
  return `futeo_savings_${auditKey}`;
}

function persistYearlyPotentialSavings(yearlyPotentialSavings: number) {
  const activeKey = getStoredAccessKey();
  if (!activeKey || yearlyPotentialSavings <= 0) return;

  try {
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
  clientFirstName: string;
  clientLastName: string;
  clientAddress: string;
  providerAddress: string;
};

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

function getManualSubcategory(documentType: UploadedDocumentType) {
  if (documentType === "electricity_invoice") return ExpenseSubcategory.ELECTRICITY;
  if (documentType === "gas_invoice") return ExpenseSubcategory.GAS;
  if (documentType === "internet_invoice") return ExpenseSubcategory.INTERNET;
  if (documentType === "mobile_invoice") return ExpenseSubcategory.MOBILE;
  if (documentType === "two_wheeler_insurance") {
    return ExpenseSubcategory.TWO_WHEELER_INSURANCE;
  }
  if (documentType === "home_insurance") return ExpenseSubcategory.HOME_INSURANCE;
  if (documentType === "health_insurance") return ExpenseSubcategory.MUTUAL_HEALTH;
  if (documentType === "bank_statement" || documentType === "credit") {
    return ExpenseSubcategory.BANK_FEES;
  }

  return ExpenseSubcategory.OTHER;
}

function getManualAmounts(
  amount: number,
  frequency: NonNullable<DocumentUserCorrections["frequency"]>
) {
  if (frequency === "bimonthly") {
    return { monthlyAmount: amount / 2, yearlyAmount: amount * 6 };
  }

  if (frequency === "quarterly") {
    return { monthlyAmount: amount / 3, yearlyAmount: amount * 4 };
  }

  if (frequency === "yearly" || frequency === "one_time") {
    return { monthlyAmount: amount / 12, yearlyAmount: amount };
  }

  return { monthlyAmount: amount, yearlyAmount: amount * 12 };
}

function getManualRecurrence(
  frequency: NonNullable<DocumentUserCorrections["frequency"]>
): "monthly" | "yearly" | "one_time" {
  if (frequency === "yearly") return "yearly";
  if (frequency === "one_time") return "one_time";
  return "monthly";
}

export function ResultsPanel() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeOffer[]>([]);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [alternativesUpdatedAt, setAlternativesUpdatedAt] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<SelectedAlternativeOffer | null>(null);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualEntryForm>({
    provider: "",
    documentType: "home_insurance",
    amount: "",
    frequency: "monthly",
    clientFirstName: "",
    clientLastName: "",
    clientAddress: "",
    providerAddress: ""
  });
  const [manualFormMessage, setManualFormMessage] = useState<string | null>(null);

  function updateManualForm<K extends keyof ManualEntryForm>(
    field: K,
    value: ManualEntryForm[K]
  ) {
    setManualForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  }

  function handleManualAnalysisSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const provider = manualForm.provider.trim();
    const amount = Number(manualForm.amount.replace(",", "."));

    if (!provider || !Number.isFinite(amount) || amount <= 0) {
      setManualFormMessage("Renseignez au minimum le fournisseur et un montant valide.");
      return;
    }

    const documentId = `manual_${Date.now()}`;
    const now = new Date().toISOString();
    const documentType = manualForm.documentType;
    const category = getCategoryForDocumentType(documentType);
    const label = getDocumentTypeLabel(documentType);
    const { monthlyAmount, yearlyAmount } = getManualAmounts(
      amount,
      manualForm.frequency
    );
    const documentName = `Saisie manuelle - ${label}`;
    const customerFullName = [
      manualForm.clientFirstName.trim(),
      manualForm.clientLastName.trim()
    ]
      .filter(Boolean)
      .join(" ");
    const customerProfile =
      customerFullName || manualForm.clientAddress.trim()
        ? {
            firstName: manualForm.clientFirstName.trim() || undefined,
            lastName: manualForm.clientLastName.trim() || undefined,
            fullName: customerFullName || undefined,
            address: manualForm.clientAddress.trim() || undefined
          }
        : undefined;
    const providerProfile = {
      name: provider,
      address: manualForm.providerAddress.trim() || undefined
    };

    const manualDocument: UploadedDocument = {
      id: documentId,
      fileName: documentName,
      fileSize: 0,
      mimeType: "manual/input",
      documentType,
      detectedCategory: category,
      status: "ready",
      uploadedAt: now,
      provider,
      userCorrections: {
        provider,
        documentType,
        amount,
        frequency: manualForm.frequency,
        isMultiContract: true
      }
    };

    const manualAnalysis: MockAnalysis = {
      id: `analysis_${documentId}`,
      generatedAt: now,
      documents: [manualDocument],
      detectedParties: {
        customer: customerProfile,
        providers: {
          [provider]: providerProfile
        },
        documents: {
          [documentId]: {
            documentId,
            fileName: documentName,
            documentType,
            providerName: provider,
            invoiceAmount: amount,
            customer: customerProfile,
            provider: providerProfile
          }
        }
      },
      expenses: [
        {
          id: `expense_${documentId}`,
          label,
          provider,
          category,
          subcategory: getManualSubcategory(documentType),
          isRecurring: manualForm.frequency !== "one_time",
          monthlyAmount,
          yearlyAmount,
          documentType,
          sourceDocumentId: documentId,
          sourceDocumentName: documentName,
          recurrence: getManualRecurrence(manualForm.frequency),
          billingAmount: amount,
          billingFrequency: manualForm.frequency
        }
      ],
      recommendations: [],
      anomalies: [],
      totalMonthlyAmount: monthlyAmount,
      totalYearlyAmount: yearlyAmount,
      yearlyPotentialSavings: 0
    };

    storeUploadedDocuments([manualDocument]);
    storeMockAnalysis(manualAnalysis);
    setAnalysis(manualAnalysis);
    setManualFormMessage("Contrat manuel ajoute. Recherche des alternatives en cours.");
    void loadAlternatives(manualAnalysis);
  }

  function handleSelectOffer(offer: AlternativeOffer) {
    storeSelectedAlternativeOffer(offer);
    setSelectedOffer(getSelectedAlternativeOffer());
    setServiceMessage("Offre retenue pour les courriers et le rapport.");
    router.push("/courriers");
  }

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
      const nextAlternatives = payload.alternatives ?? [];
      const alternativeSavings = computeAlternativeSavings(
        analysisToLoad,
        nextAlternatives
      );
      const analysisWithSavings =
        alternativeSavings > analysisToLoad.yearlyPotentialSavings
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
      setAlternatives(nextAlternatives);
      setAlternativesUpdatedAt(new Date().toISOString());
    } catch {
      setAlternatives([]);
      setServiceMessage(
        "Les alternatives détaillées seront affichées quand le service de comparaison sera connecté."
      );
    } finally {
      setIsLoadingAlternatives(false);
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
      void loadAlternatives(storedAnalysis);
    }

    async function loadServerState() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const serverAnalysis = await getStoredAnalysisServer();

      if (
        isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
        hasUsableAmounts(serverAnalysis) &&
        serverAnalysis
      ) {
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
    () => (analysis ? getTopExpenses(analysis.expenses, 5) : []),
    [analysis]
  );
  const bestAlternativeByCategory = useMemo(() => {
    return alternatives.reduce<Partial<Record<string, AlternativeOffer>>>(
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
  }, [alternatives, analysis]);
  const bestAlternativeByExpense = useMemo(() => {
    return alternatives.reduce<Record<string, AlternativeOffer>>(
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
  }, [alternatives, analysis]);

  if (!analysis || analysis.expenses.length === 0) {
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

            <div className="flex flex-wrap gap-3">
              <Button type="submit">Comparer ce contrat</Button>
              <Button href="/importer" variant="secondary">
                Importer un document
              </Button>
            </div>
          </form>
        </Card>
      </section>
    );
  }

  const hasMeaningfulSavings = analysis.yearlyPotentialSavings > 0;

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
        {hasMeaningfulSavings ? (
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
          <h2 className="text-lg font-semibold text-navy-900">
            Aucune économie significative détectée
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Le montant analysé ne fait pas ressortir d'offre clairement plus avantageuse.
            Vous pouvez conserver ce constat dans le rapport, ajouter d'autres documents
            ou vérifier la fréquence et le montant saisis.
          </p>
        </Card>
      ) : null}

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

      {selectedOffer ? (
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
                {formatCurrency(selectedOffer.monthlyPrice)} / mois
              </p>
              <p className="text-sm font-semibold text-sage-700">
                {formatCurrency(selectedOffer.estimatedYearlySaving)} / an estimés
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
                  ) : (
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      Aucune alternative fiable disponible pour ce type de contrat.
                    </p>
                  )}
                  {frequencyWarning ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      {frequencyWarning}
                    </p>
                  ) : null}
                  {bestOffer ? (
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
            alternatives.map((offer) => {
              const verifiedSaving = computeVerifiedOfferSaving(offer, analysis);

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
                    {formatCurrency(verifiedSaving)} / an
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => handleSelectOffer(offer)} type="button" variant="secondary">
                    Choisir pour mon courrier et mon rapport
                  </Button>
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
