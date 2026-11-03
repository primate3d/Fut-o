import { RequestError } from "@/lib/server/request-error";
import { ExpenseSubcategory, type ContractDetails, type Expense, type MockAnalysis } from "@/types";

export type ContractConfirmationInput = {
  expenseId?: unknown;
  details?: unknown;
};

function requiredId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 180) {
    throw new RequestError("Contrat invalide", 400);
  }
  return value.trim();
}

function optionalNumber(value: unknown, field: string, max = 10_000_000) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new RequestError(`${field} invalide`, 400);
  }
  return parsed;
}

function optionalString(value: unknown, field: string, max = 500) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new RequestError(`${field} invalide`, 400);
  }
  return value.trim() || undefined;
}

function optionalStrings(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : null;
  if (!values) throw new RequestError(`${field} invalide`, 400);
  const normalized = values.map((item) => optionalString(item, field, 200)).filter((item): item is string => Boolean(item));
  if (normalized.length > 30) throw new RequestError(`${field} invalide`, 400);
  return normalized.length > 0 ? normalized : undefined;
}

function expectedKind(expense: Expense): ContractDetails["kind"] | null {
  if (expense.contractDetails) return expense.contractDetails.kind;
  if (expense.documentType === "internet_invoice" || expense.subcategory === ExpenseSubcategory.INTERNET) return "internet";
  if (expense.documentType === "electricity_invoice" || expense.subcategory === ExpenseSubcategory.ELECTRICITY) return "electricity";
  if (expense.documentType === "gas_invoice" || expense.subcategory === ExpenseSubcategory.GAS) return "gas";
  if (expense.documentType === "car_insurance" || expense.subcategory === ExpenseSubcategory.CAR_INSURANCE) return "car_insurance";
  if (expense.documentType === "home_insurance" || expense.subcategory === ExpenseSubcategory.HOME_INSURANCE) return "home_insurance";
  return null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new RequestError(`${field} invalide`, 400);
  return value as T;
}

function buildPatch(kind: ContractDetails["kind"], input: Record<string, unknown>) {
  if (kind === "internet") {
    return {
      technology: enumValue(input.technology, ["FIBER", "CABLE", "ADSL", "VDSL", "MIXED", "UNKNOWN"] as const, "Technologie"),
      commitmentMonths: optionalNumber(input.commitmentMonths, "Engagement", 120),
      downloadMbps: optionalNumber(input.downloadMbps, "Debit descendant", 1_000_000),
      includedServices: optionalStrings(input.includedServices, "Services inclus"),
    };
  }
  if (kind === "electricity") {
    const rawTempo = input.tempoConsumptionKwh;
    const tempoConsumptionKwh = rawTempo && typeof rawTempo === "object"
      ? Object.fromEntries(
          ["bluePeak", "blueOffPeak", "whitePeak", "whiteOffPeak", "redPeak", "redOffPeak"]
            .map((field) => [field, optionalNumber((rawTempo as Record<string, unknown>)[field], `Consommation Tempo ${field}`, 100_000_000)])
            .filter(([, value]) => value !== undefined)
        )
      : undefined;
    return {
      powerKva: optionalNumber(input.powerKva, "Puissance", 1000),
      tariffOption: enumValue(input.tariffOption, ["BASE", "HPHC", "TEMPO", "UNKNOWN"] as const, "Option tarifaire"),
      annualConsumptionKwh: optionalNumber(input.annualConsumptionKwh, "Consommation annuelle", 100_000_000),
      peakConsumptionKwh: optionalNumber(input.peakConsumptionKwh, "Consommation heures pleines", 100_000_000),
      offPeakConsumptionKwh: optionalNumber(input.offPeakConsumptionKwh, "Consommation heures creuses", 100_000_000),
      tempoConsumptionKwh: tempoConsumptionKwh && Object.keys(tempoConsumptionKwh).length > 0 ? tempoConsumptionKwh : undefined,
    };
  }
  if (kind === "gas") {
    return {
      annualConsumptionKwh: optionalNumber(input.annualConsumptionKwh, "Consommation annuelle", 100_000_000),
      tariffZone: optionalString(input.tariffZone, "Zone tarifaire", 40),
      consumptionClass: optionalString(input.consumptionClass, "Classe de consommation", 40),
    };
  }
  return {
    guarantees: optionalStrings(input.guarantees, "Garanties"),
    deductibles: optionalStrings(input.deductibles, "Franchises"),
    limits: optionalStrings(input.limits, "Plafonds"),
    exclusions: optionalStrings(input.exclusions, "Exclusions"),
  };
}

export function applyContractConfirmation(analysis: MockAnalysis, input: ContractConfirmationInput) {
  const expenseId = requiredId(input.expenseId);
  const expense = analysis.expenses.find((candidate) => candidate.id === expenseId);
  if (!expense) throw new RequestError("Contrat introuvable", 404);
  const kind = expectedKind(expense);
  if (!kind) throw new RequestError("Ce contrat ne prend pas en charge la confirmation", 400);
  if (!input.details || typeof input.details !== "object") throw new RequestError("Informations contractuelles manquantes", 400);
  const patch = buildPatch(kind, input.details as Record<string, unknown>);
  const definedEntries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (definedEntries.length === 0) throw new RequestError("Aucune information contractuelle valide", 400);
  const current = expense.contractDetails?.kind === kind ? expense.contractDetails : undefined;
  const fieldSources = { ...(current?.fieldSources ?? {}) };
  for (const [field] of definedEntries) fieldSources[field] = "user_confirmed";
  const contractDetails = {
    ...(current ?? { version: 1, kind, source: "user_confirmed" }),
    ...Object.fromEntries(definedEntries),
    sourceDocumentId: expense.sourceDocumentId,
    fieldSources,
  } as ContractDetails;
  return {
    ...analysis,
    expenses: analysis.expenses.map((candidate) => candidate.id === expenseId ? { ...candidate, contractDetails } : candidate),
  } satisfies MockAnalysis;
}
