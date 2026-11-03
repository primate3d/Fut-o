import type {
  ElectricityContractInput,
  ElectricityTariffOption,
  GasContractInput,
  InsuranceContractInput,
  InsuranceSector,
} from "./types";

export type EnergyDocumentKind = "INVOICE" | "PAYMENT_SCHEDULE";

export interface BillingPeriod {
  start: string;
  end: string;
}

export interface ExtractedElectricityContract {
  provider: string;
  powerKva: number | null;
  tariffOption: ElectricityTariffOption;
  annualConsumptionKwh: number | null;
  peakConsumptionKwh: number | null;
  offPeakConsumptionKwh: number | null;
  tempoConsumptionKwh: ElectricityContractInput["tempoConsumptionKwh"];
  subscriptionAmount: number | null;
  basePricePerKwh: number | null;
  peakPricePerKwh: number | null;
  offPeakPricePerKwh: number | null;
  taxes: number | null;
  discounts: number | null;
  annualCost: number | null;
  period: BillingPeriod | null;
  documentKind: EnergyDocumentKind;
}

export interface ExtractedGasContract {
  provider: string;
  annualConsumptionKwh: number | null;
  pricePerKwh: number | null;
  annualSubscription: number | null;
  tariffZone: string | null;
  consumptionClass: string | null;
  taxes: number | null;
  discounts: number | null;
  annualCost: number | null;
  period: BillingPeriod | null;
  documentKind: EnergyDocumentKind;
}

export interface ExtractedInsuranceContract {
  sector: InsuranceSector;
  provider: string;
  annualPremium: number | null;
  guarantees: string[];
  deductibles: string[];
  limits: string[];
  exclusions: string[];
  vehicle?: string | null;
  formula?: string | null;
  bonusMalus?: number | null;
  housingType?: string | null;
  surfaceM2?: number | null;
  occupancyStatus?: string | null;
  contentsCapital?: number | null;
}

function validNonNegative(value: number | null) {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function validPeriod(period: BillingPeriod | null) {
  return period === null || (
    Number.isFinite(Date.parse(period.start)) && Number.isFinite(Date.parse(period.end)) &&
    Date.parse(period.start) <= Date.parse(period.end)
  );
}

export function toElectricityContractInput(contract: ExtractedElectricityContract): ElectricityContractInput | null {
  if (
    contract.powerKva === null || contract.annualConsumptionKwh === null || contract.tariffOption === "UNKNOWN" ||
    !validNonNegative(contract.powerKva) || !validNonNegative(contract.annualConsumptionKwh) || !validPeriod(contract.period)
  ) return null;
  return {
    powerKva: contract.powerKva,
    tariffOption: contract.tariffOption,
    annualConsumptionKwh: contract.annualConsumptionKwh,
    peakConsumptionKwh: contract.peakConsumptionKwh ?? undefined,
    offPeakConsumptionKwh: contract.offPeakConsumptionKwh ?? undefined,
    tempoConsumptionKwh: contract.tempoConsumptionKwh,
    currentAnnualCost: contract.annualCost,
    isEstimatedSchedule: contract.documentKind === "PAYMENT_SCHEDULE",
  };
}

export function toGasContractInput(contract: ExtractedGasContract): GasContractInput | null {
  if (contract.annualConsumptionKwh === null || !validNonNegative(contract.annualConsumptionKwh) || !validPeriod(contract.period)) return null;
  return {
    annualConsumptionKwh: contract.annualConsumptionKwh,
    tariffZone: contract.tariffZone,
    consumptionClass: contract.consumptionClass,
    currentAnnualCost: contract.annualCost,
  };
}

export function toInsuranceContractInput(contract: ExtractedInsuranceContract): InsuranceContractInput | null {
  if (contract.annualPremium === null || !validNonNegative(contract.annualPremium)) return null;
  return {
    sector: contract.sector,
    currentAnnualPremium: contract.annualPremium,
    requiredGuarantees: contract.guarantees,
    knownDeductibles: contract.deductibles,
  };
}

function periodKey(period: BillingPeriod | null) {
  return period ? `${period.start}:${period.end}` : null;
}

export function dedupeEnergyContracts<T extends { provider: string; period: BillingPeriod | null; documentKind: EnergyDocumentKind }>(contracts: T[]) {
  const selected = new Map<string, T>();
  const withoutPeriod: T[] = [];
  for (const contract of contracts) {
    const key = periodKey(contract.period);
    if (!key) {
      withoutPeriod.push(contract);
      continue;
    }
    const identity = `${contract.provider.toLowerCase()}:${key}`;
    const previous = selected.get(identity);
    if (!previous || (previous.documentKind === "PAYMENT_SCHEDULE" && contract.documentKind === "INVOICE")) {
      selected.set(identity, contract);
    }
  }
  return [...selected.values(), ...withoutPeriod];
}

export function splitMixedEnergyDocument(input: {
  electricity?: ExtractedElectricityContract | null;
  gas?: ExtractedGasContract | null;
}) {
  return {
    electricity: input.electricity ? toElectricityContractInput(input.electricity) : null,
    gas: input.gas ? toGasContractInput(input.gas) : null,
  };
}
