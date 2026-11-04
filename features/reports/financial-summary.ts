import {
  isPrimaryAlternative,
  type AlternativeOffer
} from "@/features/recommendations/service";
import type { ContractComparisonState, Expense, MockAnalysis } from "@/types";

export const REALIZED_SAVINGS_STORAGE_PREFIX = "futeo.realizedSavings";

export type RealizedSavingRecord = {
  id: string;
  auditId: string;
  expenseId: string;
  previousMonthlyAmount: number;
  newMonthlyAmount: number;
  effectiveDate: string;
  confirmedAt: string;
  updatedAt: string;
};

export type ContractFinancialSummary = {
  expenseId: string;
  currentMonthlyAmount: number;
  currentYearlyAmount: number;
  potentialMonthlySaving: number;
  potentialYearlySaving: number;
  realizedMonthlySaving: number;
  realizedYearlySaving: number;
  realizedSaving?: RealizedSavingRecord;
  realizedSavingIsEffective: boolean;
};

export type FinancialSummary = {
  currentMonthlyAmount: number;
  currentYearlyAmount: number;
  potentialMonthlySaving: number;
  potentialYearlySaving: number;
  realizedMonthlySaving: number;
  realizedYearlySaving: number;
  projectedMonthlyAmount: number;
  projectedYearlyAmount: number;
  potentialStatus: "calculated" | "partial" | "undetermined";
  contracts: Record<string, ContractFinancialSummary>;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getStorageKey(accessKeyCode?: string) {
  return `${REALIZED_SAVINGS_STORAGE_PREFIX}.${accessKeyCode || "anonymous"}`;
}

function isRealizedSavingRecord(value: unknown): value is RealizedSavingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RealizedSavingRecord>;
  return Boolean(
    typeof record.id === "string" &&
      typeof record.auditId === "string" &&
      typeof record.expenseId === "string" &&
      typeof record.previousMonthlyAmount === "number" &&
      Number.isFinite(record.previousMonthlyAmount) &&
      typeof record.newMonthlyAmount === "number" &&
      Number.isFinite(record.newMonthlyAmount) &&
      typeof record.effectiveDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(record.effectiveDate) &&
      typeof record.confirmedAt === "string" &&
      typeof record.updatedAt === "string"
  );
}

export function getRealizedSavingRecords(accessKeyCode?: string) {
  if (typeof window === "undefined") return [];

  try {
    const storedValue = window.localStorage.getItem(getStorageKey(accessKeyCode));
    if (!storedValue) return [];
    const records = JSON.parse(storedValue) as unknown;
    return Array.isArray(records) ? records.filter(isRealizedSavingRecord) : [];
  } catch {
    return [];
  }
}

export function getRealizedSavingsForAnalysis(
  analysis: MockAnalysis,
  accessKeyCode?: string
) {
  const expenseIds = new Set(analysis.expenses.map((expense) => expense.id));
  return getRealizedSavingRecords(accessKeyCode).filter((record) =>
    expenseIds.has(record.expenseId)
  );
}

export function confirmRealizedSaving(
  accessKeyCode: string | undefined,
  input: {
    auditId: string;
    expense: Expense;
    newMonthlyAmount: number;
    effectiveDate: string;
  },
  now = new Date()
) {
  if (typeof window === "undefined") {
    throw new Error("Le suivi des économies est disponible uniquement dans le navigateur.");
  }
  if (!input.expense.isRecurring || input.expense.recurrence === "one_time") {
    throw new Error("Une dépense ponctuelle ne peut pas être confirmée comme nouveau tarif mensuel.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
    throw new Error("Indiquez une date d'effet valide.");
  }

  const records = getRealizedSavingRecords(accessKeyCode);
  const recordId = `${input.expense.id}:confirmed-reduction`;
  const existing = records.find((record) => record.id === recordId);
  const previousMonthlyAmount = existing?.previousMonthlyAmount ?? input.expense.monthlyAmount;
  if (!Number.isFinite(previousMonthlyAmount) || previousMonthlyAmount <= 0) {
    throw new Error("Le montant mensuel d'origine doit être confirmé avant d'enregistrer une réduction.");
  }
  if (
    !Number.isFinite(input.newMonthlyAmount) ||
    input.newMonthlyAmount < 0 ||
    input.newMonthlyAmount >= previousMonthlyAmount
  ) {
    throw new Error("Le nouveau tarif doit être inférieur au montant mensuel d'origine.");
  }

  const timestamp = now.toISOString();
  const record: RealizedSavingRecord = {
    id: recordId,
    auditId: input.auditId,
    expenseId: input.expense.id,
    previousMonthlyAmount: roundMoney(previousMonthlyAmount),
    newMonthlyAmount: roundMoney(input.newMonthlyAmount),
    effectiveDate: input.effectiveDate,
    confirmedAt: existing?.confirmedAt ?? timestamp,
    updatedAt: timestamp
  };
  const nextRecords = [
    ...records.filter((candidate) => candidate.id !== recordId),
    record
  ];
  window.localStorage.setItem(getStorageKey(accessKeyCode), JSON.stringify(nextRecords));
  return record;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isRealizedSavingEffective(record: RealizedSavingRecord, now = new Date()) {
  return record.effectiveDate <= toLocalDateKey(now);
}

function getExpenseIdForOffer(offer: AlternativeOffer, analysis: MockAnalysis) {
  if (offer.sourceExpenseId) return offer.sourceExpenseId;
  return analysis.expenses.find((expense) =>
    offer.id.startsWith(`alternative_${expense.id}_`)
  )?.id;
}

export function isReliablePotentialOffer(offer: AlternativeOffer) {
  return (
    isPrimaryAlternative(offer) &&
    offer.savingKind === "certified" &&
    Number.isFinite(offer.estimatedYearlySaving) &&
    offer.estimatedYearlySaving > 0
  );
}

export function buildFinancialSummary(
  analysis: MockAnalysis,
  alternatives: AlternativeOffer[],
  comparisonStates: ContractComparisonState[],
  realizedSavings: RealizedSavingRecord[],
  now = new Date()
): FinancialSummary {
  const activeSavingsByExpense = new Map<string, RealizedSavingRecord>();
  const confirmedSavingsByExpense = new Map<string, RealizedSavingRecord>();
  for (const record of realizedSavings) {
    if (!analysis.expenses.some((expense) => expense.id === record.expenseId)) continue;
    confirmedSavingsByExpense.set(record.expenseId, record);
    if (isRealizedSavingEffective(record, now)) {
      activeSavingsByExpense.set(record.expenseId, record);
    }
  }

  const bestPotentialByExpense = new Map<string, number>();
  for (const offer of alternatives.filter(isReliablePotentialOffer)) {
    const expenseId = getExpenseIdForOffer(offer, analysis);
    if (!expenseId) continue;
    bestPotentialByExpense.set(
      expenseId,
      Math.max(bestPotentialByExpense.get(expenseId) ?? 0, offer.estimatedYearlySaving)
    );
  }

  const contracts = analysis.expenses.reduce<Record<string, ContractFinancialSummary>>(
    (summaries, expense) => {
      const confirmedSaving = confirmedSavingsByExpense.get(expense.id);
      const effectiveSaving = activeSavingsByExpense.get(expense.id);
      const realizedMonthlySaving = effectiveSaving
        ? Math.max(0, effectiveSaving.previousMonthlyAmount - effectiveSaving.newMonthlyAmount)
        : 0;
      const realizedYearlySaving = realizedMonthlySaving * 12;
      const originalPotential = bestPotentialByExpense.get(expense.id) ?? 0;
      const potentialYearlySaving = Math.max(0, originalPotential - realizedYearlySaving);

      summaries[expense.id] = {
        expenseId: expense.id,
        currentMonthlyAmount: roundMoney(
          Math.max(0, expense.monthlyAmount - realizedMonthlySaving)
        ),
        currentYearlyAmount: roundMoney(
          Math.max(0, expense.yearlyAmount - realizedYearlySaving)
        ),
        potentialMonthlySaving: roundMoney(potentialYearlySaving / 12),
        potentialYearlySaving: roundMoney(potentialYearlySaving),
        realizedMonthlySaving: roundMoney(realizedMonthlySaving),
        realizedYearlySaving: roundMoney(realizedYearlySaving),
        realizedSaving: confirmedSaving,
        realizedSavingIsEffective: Boolean(effectiveSaving)
      };
      return summaries;
    },
    {}
  );

  const realizedMonthlySaving = Object.values(contracts).reduce(
    (total, contract) => total + contract.realizedMonthlySaving,
    0
  );
  const realizedYearlySaving = Object.values(contracts).reduce(
    (total, contract) => total + contract.realizedYearlySaving,
    0
  );
  const potentialYearlySaving = Object.values(contracts).reduce(
    (total, contract) => total + contract.potentialYearlySaving,
    0
  );
  const unresolvedComparison = comparisonStates.some((state) =>
    state.status === "disabled" ||
    state.status === "missing_information" ||
    state.status === "unavailable"
  );
  const hasComparisonEvidence = comparisonStates.length > 0 || alternatives.length > 0;
  const potentialStatus = unresolvedComparison
    ? potentialYearlySaving > 0
      ? "partial"
      : "undetermined"
    : hasComparisonEvidence
      ? "calculated"
      : "undetermined";
  const currentMonthlyAmount = Math.max(
    0,
    analysis.totalMonthlyAmount - realizedMonthlySaving
  );
  const currentYearlyAmount = Math.max(
    0,
    analysis.totalYearlyAmount - realizedYearlySaving
  );
  const potentialMonthlySaving = potentialYearlySaving / 12;

  return {
    currentMonthlyAmount: roundMoney(currentMonthlyAmount),
    currentYearlyAmount: roundMoney(currentYearlyAmount),
    potentialMonthlySaving: roundMoney(potentialMonthlySaving),
    potentialYearlySaving: roundMoney(potentialYearlySaving),
    realizedMonthlySaving: roundMoney(realizedMonthlySaving),
    realizedYearlySaving: roundMoney(realizedYearlySaving),
    projectedMonthlyAmount: roundMoney(
      Math.max(0, currentMonthlyAmount - potentialMonthlySaving)
    ),
    projectedYearlyAmount: roundMoney(
      Math.max(0, currentYearlyAmount - potentialYearlySaving)
    ),
    potentialStatus,
    contracts
  };
}
