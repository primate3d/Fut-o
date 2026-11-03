import { collectEnergySource } from "./energy/collector";
import { collectInsuranceSource } from "./insurance/collector";
import { collectInternetSource } from "./internet/collector";
import type { CommercialCollectorOptions, CommercialSourceDefinition } from "./types";

export function collectCommercialSource(
  source: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  options: CommercialCollectorOptions = {},
) {
  if (source.sector === "internet") return collectInternetSource(source, knownUrls, options);
  if (source.sector === "electricity" || source.sector === "gas") {
    return collectEnergySource(source, knownUrls, options);
  }
  if (source.sector === "home_insurance" || source.sector === "car_insurance") {
    return collectInsuranceSource(source, knownUrls, options);
  }
  throw new Error(`Secteur sans collecteur: ${source.sector}`);
}
