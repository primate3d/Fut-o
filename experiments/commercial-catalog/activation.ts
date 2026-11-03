import type { CommercialSector } from "./types";

const ENV_BY_SECTOR: Partial<Record<CommercialSector, string>> = {
  internet: "COMMERCIAL_CATALOG_INTERNET_ENABLED",
  electricity: "COMMERCIAL_CATALOG_ELECTRICITY_ENABLED",
  gas: "COMMERCIAL_CATALOG_GAS_ENABLED",
  home_insurance: "COMMERCIAL_CATALOG_HOME_INSURANCE_ENABLED",
  car_insurance: "COMMERCIAL_CATALOG_CAR_INSURANCE_ENABLED",
};

export function isCommercialSectorEnabled(
  sector: CommercialSector,
  environment: Record<string, string | undefined> = process.env,
) {
  const variable = ENV_BY_SECTOR[sector];
  return variable !== undefined && environment[variable] === "1";
}
