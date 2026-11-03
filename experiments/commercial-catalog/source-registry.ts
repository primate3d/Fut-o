import type { CommercialSector, CommercialSourceDefinition } from "./types";

export const INTERNET_SOURCES: CommercialSourceDefinition[] = [
  {
    id: "internet-red-box", sector: "internet", provider: "RED by SFR",
    sourceUrl: "https://www.red-by-sfr.fr/offre-internet/",
    allowedHosts: ["red-by-sfr.fr", "www.red-by-sfr.fr", "static.s-sfr.fr"],
    approvalStatus: "APPROVED", parser: "red-html-v1", discoveryEnabled: true,
  },
  {
    id: "internet-sosh-contracts", sector: "internet", provider: "Sosh",
    sourceUrl: "https://shop.sosh.fr/information/tarifs-et-contrats",
    allowedHosts: ["shop.sosh.fr", "documentscontractuels.orange.fr"],
    approvalStatus: "APPROVED", parser: "sosh-contract-pdf-v1", discoveryEnabled: true,
  },
  {
    id: "internet-bouygues-pure-fibre", sector: "internet", provider: "B&You",
    sourceUrl: "https://www.bouyguestelecom.fr/offres-internet/sans-engagement",
    allowedHosts: ["bouyguestelecom.fr", "www.bouyguestelecom.fr"],
    approvalStatus: "APPROVED", parser: "bouygues-html-v1", discoveryEnabled: true,
  },
  {
    id: "internet-freebox", sector: "internet", provider: "Free",
    sourceUrl: "https://www.free.fr/freebox/",
    allowedHosts: ["free.fr", "www.free.fr", "adsl.free.fr"],
    approvalStatus: "APPROVED", parser: "free-html-v1", discoveryEnabled: true,
  },
];

export const ELECTRICITY_SOURCES: CommercialSourceDefinition[] = [
  {
    id: "electricity-edf-tarif-bleu", sector: "electricity", provider: "EDF",
    sourceUrl: "https://particulier.edf.fr/fr/accueil/guide-energie/electricite/prix-kwh-electricite.html",
    allowedHosts: ["particulier.edf.fr"], approvalStatus: "APPROVED",
    parser: "edf-electricity-tables-v1", discoveryEnabled: true,
  },
  {
    id: "electricity-totalenergies-grids", sector: "electricity", provider: "TotalEnergies",
    sourceUrl: "https://www.totalenergies.fr/particuliers/electricite-et-gaz/grilles-tarifaires",
    allowedHosts: ["totalenergies.fr", "www.totalenergies.fr"], approvalStatus: "APPROVED",
    parser: "totalenergies-energy-tables-v1", discoveryEnabled: true,
  },
];

export const GAS_SOURCES: CommercialSourceDefinition[] = [
  {
    id: "gas-totalenergies-grids", sector: "gas", provider: "TotalEnergies",
    sourceUrl: "https://www.totalenergies.fr/particuliers/electricite-et-gaz/grilles-tarifaires",
    allowedHosts: ["totalenergies.fr", "www.totalenergies.fr"], approvalStatus: "APPROVED",
    parser: "totalenergies-energy-tables-v1", discoveryEnabled: true,
  },
  {
    id: "gas-cre-reference", sector: "gas", provider: "CRE",
    sourceUrl: "https://www.cre.fr/consommateurs/prix-reperes-et-references/prix-repere-de-vente-de-gaz-naturel-a-destination-des-clients-residentiels.html",
    allowedHosts: ["cre.fr", "www.cre.fr"], approvalStatus: "APPROVED",
    parser: "cre-gas-reference-v1", discoveryEnabled: true,
  },
];

export const HOME_INSURANCE_SOURCES: CommercialSourceDefinition[] = [
  {
    id: "home-insurance-direct-assurance", sector: "home_insurance", provider: "Direct Assurance",
    sourceUrl: "https://www.direct-assurance.fr/nos-assurances/assurance-habitation",
    allowedHosts: ["direct-assurance.fr", "www.direct-assurance.fr"], approvalStatus: "APPROVED",
    parser: "insurance-product-html-v1", discoveryEnabled: true,
  },
  {
    id: "home-insurance-macif", sector: "home_insurance", provider: "MACIF",
    sourceUrl: "https://www.macif.fr/assurance/particuliers/assurance-habitation-et-vie-quotidienne/residence-principale",
    allowedHosts: ["macif.fr", "www.macif.fr"], approvalStatus: "APPROVED",
    parser: "insurance-product-html-v1", discoveryEnabled: true,
  },
];

export const CAR_INSURANCE_SOURCES: CommercialSourceDefinition[] = [
  {
    id: "car-insurance-direct-assurance", sector: "car_insurance", provider: "Direct Assurance",
    sourceUrl: "https://www.direct-assurance.fr/nos-assurances/assurance-auto",
    allowedHosts: ["direct-assurance.fr", "www.direct-assurance.fr"], approvalStatus: "APPROVED",
    parser: "insurance-product-html-v1", discoveryEnabled: true,
  },
  {
    id: "car-insurance-macif", sector: "car_insurance", provider: "MACIF",
    sourceUrl: "https://www.macif.fr/assurance/particuliers/assurance-auto-moto-scooter/assurance-automobile",
    allowedHosts: ["macif.fr", "www.macif.fr"], approvalStatus: "APPROVED",
    parser: "insurance-product-html-v1", discoveryEnabled: true,
  },
];

export const COMMERCIAL_SOURCES = [
  ...INTERNET_SOURCES,
  ...ELECTRICITY_SOURCES,
  ...GAS_SOURCES,
  ...HOME_INSURANCE_SOURCES,
  ...CAR_INSURANCE_SOURCES,
];

export function getApprovedSources(sector: CommercialSector) {
  return COMMERCIAL_SOURCES.filter(
    (source) => source.sector === sector && source.approvalStatus === "APPROVED",
  );
}
