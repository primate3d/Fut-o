import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { compareCommercialOffers } from "../experiments/commercial-catalog/compare";
import {
  discoverApprovedPageLinks,
  proposeSearchCandidates,
} from "../experiments/commercial-catalog/discovery";
import { collectInternetSource, parseInternetOffers } from "../experiments/commercial-catalog/internet/collector";
import { parseEnergyOffers } from "../experiments/commercial-catalog/energy/collector";
import { parseInsuranceProduct } from "../experiments/commercial-catalog/insurance/collector";
import {
  CAR_INSURANCE_SOURCES,
  ELECTRICITY_SOURCES,
  GAS_SOURCES,
  HOME_INSURANCE_SOURCES,
  INTERNET_SOURCES,
} from "../experiments/commercial-catalog/source-registry";
import {
  annualInternetCost,
  catalogConclusion,
  compareElectricityContract,
  compareGasContract,
  compareInsuranceContract,
  compareInternetContract,
} from "../experiments/commercial-catalog/recommend";
import {
  dedupeEnergyContracts,
  splitMixedEnergyDocument,
  toInsuranceContractInput,
  type ExtractedElectricityContract,
  type ExtractedGasContract,
} from "../experiments/commercial-catalog/contracts";
import { isCommercialSectorEnabled } from "../experiments/commercial-catalog/activation";
import type {
  CommercialOfferInterpreter,
  ElectricityOffer,
  GasOffer,
  InsuranceOffer,
  InternetOffer,
} from "../experiments/commercial-catalog/types";
import { validateAndDedupeCommercialOffers, validateAndDedupeInternetOffers } from "../experiments/commercial-catalog/validate";
import { filterFreshCommercialOffers } from "../lib/server/commercial-catalog";
import { buildEnabledCommercialComparisons } from "../lib/server/multisector-comparison";
import { applyContractConfirmation } from "../lib/server/contract-confirmation";
import {
  extractContractDetails,
  getMissingContractFields,
  mergeContractDetails,
  normalizeAiContractDetails,
} from "../features/analysis/contract-details";
import { attachDocumentProfileToExpense, buildDocumentPartyProfiles } from "../features/analysis/document-profiles";
import { ExpenseCategory, ExpenseSubcategory, type Expense, type MockAnalysis, type UploadedDocumentType } from "../types";

const NOW = "2026-11-03T10:00:00.000Z";
const SOURCE = INTERNET_SOURCES[0];
const fixturePath = path.resolve(
  process.cwd(),
  "experiments/commercial-catalog/fixtures/internet-boxes.html",
);

async function fixture() {
  return readFile(fixturePath, "utf8");
}

async function parsedOffers() {
  return parseInternetOffers(await fixture(), SOURCE, NOW).offers;
}

function verifiedOffer(overrides: Partial<InternetOffer> = {}): InternetOffer {
  return {
    catalogId: "internet-test",
    sector: "internet",
    provider: SOURCE.provider,
    offerName: "Offre test",
    sourceUrl: SOURCE.sourceUrl,
    retrievedAt: NOW,
    verifiedAt: NOW,
    validFrom: null,
    validUntil: "2026-12-31T23:59:59.999Z",
    verificationStatus: "VERIFIED",
    extractionMethod: "deterministic",
    technology: "FIBER",
    monthlyPrice: 29.99,
    promotionPrice: null,
    promotionDurationMonths: null,
    priceAfterPromotion: null,
    promotionConditions: [],
    commitmentMonths: 0,
    activationFees: 39,
    activationFeeRefund: null,
    activationFeeRefundConditional: false,
    terminationFees: 49,
    downloadMbps: 1000,
    uploadMbps: 700,
    includedServices: ["Wi-Fi 6"],
    eligibilityConditions: ["Sous reserve d'eligibilite"],
    conditions: [],
    evidence: [],
    ...overrides,
  };
}

test("le pilote extrait et verifie une offre Internet complete", async () => {
  const offers = await parsedOffers();
  const offer = offers.find((item) => item.offerName === "Box Fibre Essentiel");
  assert.ok(offer);
  assert.equal(offer.verificationStatus, "VERIFIED");
  assert.equal(offer.monthlyPrice, 29.99);
  assert.equal(offer.promotionPrice, 19.99);
  assert.equal(offer.promotionDurationMonths, 6);
  assert.equal(offer.downloadMbps, 1000);
  assert.equal(offer.commitmentMonths, 0);
});

test("une offre incomplete reste partielle et ne peut pas certifier une economie", async () => {
  const offers = await parsedOffers();
  const offer = offers.find((item) => item.offerName === "Box Incomplete");
  assert.ok(offer);
  assert.equal(offer.verificationStatus, "PARTIAL");
  assert.equal(offer.verifiedAt, null);
  assert.equal(filterFreshCommercialOffers([offer], "internet", new Date(NOW)).length, 0);
});

test("les doublons d'une meme source sont ignores", async () => {
  const [offer] = await parsedOffers();
  const checked = validateAndDedupeInternetOffers([offer, { ...offer }], SOURCE, new Date(NOW));
  assert.equal(checked.offers.length, 1);
  assert.equal(checked.failures[0]?.code, "DUPLICATE_OFFER");
});

test("une source non approuvee ne peut produire aucune offre verifiee", async () => {
  const [offer] = await parsedOffers();
  const pendingSource = { ...SOURCE, approvalStatus: "PENDING" as const };
  const checked = validateAndDedupeInternetOffers([offer], pendingSource, new Date(NOW));
  assert.equal(checked.offers[0]?.verificationStatus, "FAILED");
});

test("la decouverte sur une page approuvee cree uniquement des candidats en attente", async () => {
  const candidates = discoverApprovedPageLinks(await fixture(), SOURCE, [SOURCE.sourceUrl], NOW);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.approvalStatus, "PENDING");
  assert.match(candidates[0]?.sourceUrl ?? "", /nouvelle-box/);
});

test("un resultat de recherche reste en attente et les comparateurs sont exclus", () => {
  const candidates = proposeSearchCandidates([
    { title: "Nouvelle offre fibre", url: "https://nouvel-operateur.example/offre-fibre", publisherName: "Nouveau" },
    { title: "Comparatif box", url: "https://www.ariase.com/box/offres" },
  ], SOURCE, [SOURCE.sourceUrl], NOW);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.approvalStatus, "PENDING");
  assert.equal(candidates[0]?.provider, "Nouveau");
});

test("les changements de prix et la suppression d'une promotion sont detectes", () => {
  const before = verifiedOffer({
    promotionPrice: 19.99,
    promotionDurationMonths: 6,
    priceAfterPromotion: 29.99,
  });
  const after = verifiedOffer({ monthlyPrice: 27.99 });
  const changes = compareCommercialOffers([before], [after]);
  assert.ok(changes.some((change) => change.type === "PRICE_CHANGED"));
  assert.ok(changes.some((change) => change.type === "PROMOTION_CHANGED"));
});

test("une offre supprimee est detectee", () => {
  const changes = compareCommercialOffers([verifiedOffer()], []);
  assert.equal(changes[0]?.type, "REMOVED");
});

test("une offre de plus de 72 heures est exclue", () => {
  const stale = verifiedOffer({
    retrievedAt: "2026-10-30T00:00:00.000Z",
    verifiedAt: "2026-10-30T00:00:00.000Z",
  });
  assert.equal(filterFreshCommercialOffers([stale], "internet", new Date(NOW)).length, 0);
});

test("une collecte HTTP echouee n'invente aucune offre", async () => {
  const result = await collectInternetSource(SOURCE, [SOURCE.sourceUrl], {
    now: () => new Date(NOW),
    fetchImpl: async () => new Response("indisponible", { status: 503 }),
  });
  assert.equal(result.offers.length, 0);
  assert.equal(result.failures[0]?.code, "FETCH_FAILED");
});

test("ETag et Last-Modified evitent de retraiter une page inchangee", async () => {
  let receivedHeaders: Headers | undefined;
  const result = await collectInternetSource(SOURCE, [SOURCE.sourceUrl], {
    now: () => new Date(NOW),
    previousCache: { etag: "etag-1", lastModified: "Mon, 02 Nov 2026 10:00:00 GMT" },
    fetchImpl: async (_url, init) => {
      receivedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 304, headers: { etag: "etag-1" } });
    },
  });
  assert.equal(receivedHeaders?.get("if-none-match"), "etag-1");
  assert.equal(result.notModified, true);
  assert.equal(result.offers.length, 0);
});

test("un hash identique evite l'analyse meme sans reponse 304", async () => {
  const html = await fixture();
  const { createHash } = await import("node:crypto");
  const contentHash = createHash("sha256").update(Buffer.from(html)).digest("hex");
  const result = await collectInternetSource(SOURCE, [SOURCE.sourceUrl], {
    now: () => new Date(NOW),
    previousCache: { contentHash },
    fetchImpl: async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(result.notModified, true);
  assert.equal(result.offers.length, 0);
});

test("le secours IA reste partiel meme si une valeur semble complete", async () => {
  const aiOffer = verifiedOffer({
    catalogId: "ai-candidate",
    offerName: "Offre IA",
    extractionMethod: "ai",
    verificationStatus: "PARTIAL",
    verifiedAt: null,
  });
  const interpreter: CommercialOfferInterpreter = {
    interpretInternetOffers: async () => [aiOffer],
  };
  const result = await collectInternetSource(SOURCE, [SOURCE.sourceUrl], {
    now: () => new Date(NOW),
    interpreter,
    fetchImpl: async () => new Response("<html><body>offre commerciale non structuree</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(result.offers[0]?.verificationStatus, "PARTIAL");
  assert.equal(result.offers[0]?.verifiedAt, null);
});

test("les secteurs autres qu'Internet sont isoles du catalogue pilote", () => {
  const offer = verifiedOffer();
  assert.equal(filterFreshCommercialOffers([offer], "electricity", new Date(NOW)).length, 0);
});

test("RED distingue le remboursement conditionnel des frais automatiques", () => {
  const html = `<main>Configurer mon offre Fibre Sans engagement 22,99 €/mois.
    39€ de frais de mise en service remboursés sur demande.
    Offre sous réserve d'éligibilité technique. Frais de résiliation : 59€.
    Débit jusqu'à ↓ 1 Gb/s ↑ 1 Gb/s et WiFi 5.
    Débit jusqu'à ↓ 2 Gb/s partagés ↑ 1 Gb/s et WiFi 6 +1€/mois.</main>`;
  const offers = parseInternetOffers(html, INTERNET_SOURCES[0], NOW).offers;
  assert.equal(offers.length, 2);
  assert.equal(offers[0]?.activationFeeRefundConditional, true);
  assert.equal(annualInternetCost(offers[0]!), 314.88);
  assert.equal(offers[1]?.monthlyPrice, 23.99);
});

test("B&You ne transforme pas un prix groupe en prix standard", () => {
  const source = INTERNET_SOURCES.find((item) => item.provider === "B&You")!;
  const html = `<main>
    B&YOU Pure fibre : offre valable pour toute première souscription, sous réserve d'éligibilité fibre.
    Sans engagement. Frais de mise en service : 48€ frais de résiliation : 69€. 24,99€/mois.
    Débit descendant 2 Gb/s et montant 900 Mb/s.
    Remise mobile + fibre à 26,99€ sous condition de souscription simultanée.
    B&YOU Pure fibre Plus : offre valable sous réserve d'éligibilité fibre. Sans engagement.
    Frais de mise en service : 48€ frais de résiliation : 69€. 27,99€/mois.
    Débit descendant 8 Gb/s et montant 1 Gb/s.
  </main>`;
  const offers = parseInternetOffers(html, source, NOW).offers;
  assert.deepEqual(offers.map((offer) => offer.monthlyPrice), [24.99, 27.99]);
});

test("Free conserve prix promotionnel, duree et prix recurrent", () => {
  const source = INTERNET_SOURCES.find((item) => item.provider === "Free")!;
  const html = `<main>
    Freebox Pop Fibre jusqu'à 5 Gbit/s partagés 900 Mbit/s Wi-Fi 7 +300 chaines TV.
    29 € 99 /mois pendant 1 an puis 39,99€/mois Sans engagement.
    Offres soumises à conditions, sous réserve d'éligibilité en zone fibrée.
    Frais de mise en service : 49€ Frais de résiliation : 69€.
  </main>`;
  const [offer] = parseInternetOffers(html, source, NOW).offers;
  assert.equal(offer?.promotionPrice, 29.99);
  assert.equal(offer?.promotionDurationMonths, 12);
  assert.equal(offer?.priceAfterPromotion, 39.99);
  assert.equal(annualInternetCost(offer!), 408.88);
});

function edfFixture() {
  return `<main>L'offre Tarif Bleu (option Base) pour les particuliers au 1er août 2026 :
    Puissance souscrite 3 12,13 0,2001 6 15,86 9 19,88 12 23,76 15 27,40 18 31,14 24 39,14 30 46,47 36 53,88.
    L'offre Tarif Bleu (option Heures Creuses) : 6 15,86 0,2142 0,1589 et 9 19,88 12 23,76 15 27,40 18 31,14 24 39,14 30 46,47 36 53,88.</main>`;
}

test("electricite Base et HP/HC utilisent des grilles et consommations distinctes", () => {
  const source = ELECTRICITY_SOURCES[0];
  const checked = validateAndDedupeCommercialOffers(parseEnergyOffers(edfFixture(), source, NOW), source, new Date(NOW));
  assert.equal(checked.offers.length, 2);
  assert.ok(checked.offers.every((offer) => offer.verificationStatus === "VERIFIED"));
  const offers = checked.offers as ElectricityOffer[];
  const baseOffer = offers.find((offer) => offer.tariffOption === "BASE");
  assert.deepEqual(baseOffer?.powerKva, [3, 6]);
  assert.equal(baseOffer?.monthlySubscriptionByPower["9"], undefined);
  const unavailableBase = compareElectricityContract({ powerKva: 9, tariffOption: "BASE", annualConsumptionKwh: 4000,
    currentAnnualCost: 1000, isEstimatedSchedule: false }, offers);
  assert.equal(unavailableBase.find((result) => result.offer.tariffOption === "BASE")?.confidence, "INSUFFICIENT");
  const missingSplit = compareElectricityContract({ powerKva: 6, tariffOption: "HPHC", annualConsumptionKwh: 4000,
    currentAnnualCost: 1000, isEstimatedSchedule: false }, offers);
  assert.equal(missingSplit.find((result) => result.offer.tariffOption === "HPHC")?.confidence, "INSUFFICIENT");
  const complete = compareElectricityContract({ powerKva: 6, tariffOption: "HPHC", annualConsumptionKwh: 4000,
    peakConsumptionKwh: 2500, offPeakConsumptionKwh: 1500, currentAnnualCost: 1000, isEstimatedSchedule: false }, offers);
  assert.equal(complete.find((result) => result.offer.tariffOption === "HPHC")?.confidence, "CERTIFIED");
});

test("electricite Tempo exige les six consommations et une puissance compatible", () => {
  const offer: ElectricityOffer = {
    catalogId: "edf-tempo-test",
    sector: "electricity",
    provider: "EDF",
    offerName: "Tarif Bleu Tempo",
    sourceUrl: ELECTRICITY_SOURCES[0].sourceUrl,
    retrievedAt: NOW,
    verifiedAt: NOW,
    validFrom: null,
    validUntil: "2026-12-31T23:59:59.999Z",
    verificationStatus: "VERIFIED",
    extractionMethod: "deterministic",
    conditions: [],
    evidence: [],
    pricingMode: "REGULATED",
    tariffOption: "TEMPO",
    powerKva: [6, 9],
    monthlySubscriptionByPower: { "6": 15.86, "9": 19.88 },
    basePricePerKwh: null,
    peakPricePerKwh: null,
    offPeakPricePerKwh: null,
    tempoPrices: {
      bluePeak: 0.16,
      blueOffPeak: 0.13,
      whitePeak: 0.19,
      whiteOffPeak: 0.15,
      redPeak: 0.65,
      redOffPeak: 0.16,
    },
    taxesIncluded: true,
    priceRevision: null,
    eligibilityConditions: [],
  };
  const completeConsumption = {
    bluePeak: 1800,
    blueOffPeak: 900,
    whitePeak: 500,
    whiteOffPeak: 300,
    redPeak: 100,
    redOffPeak: 400,
  };
  const [complete] = compareElectricityContract({ powerKva: 9, tariffOption: "TEMPO", annualConsumptionKwh: 4000,
    tempoConsumptionKwh: completeConsumption, currentAnnualCost: 1200, isEstimatedSchedule: false }, [offer]);
  assert.equal(complete?.confidence, "CERTIFIED");
  const [missingBucket] = compareElectricityContract({ powerKva: 9, tariffOption: "TEMPO", annualConsumptionKwh: 4000,
    tempoConsumptionKwh: { ...completeConsumption, redPeak: undefined }, currentAnnualCost: 1200, isEstimatedSchedule: false }, [offer]);
  assert.equal(missingBucket?.confidence, "INSUFFICIENT");
  const [unsupportedPower] = compareElectricityContract({ powerKva: 12, tariffOption: "TEMPO", annualConsumptionKwh: 4000,
    tempoConsumptionKwh: completeConsumption, currentAnnualCost: 1200, isEstimatedSchedule: false }, [offer]);
  assert.equal(unsupportedPower?.confidence, "INSUFFICIENT");
});

test("un echeancier electricite estime ne produit pas d'economie certifiee", () => {
  const source = ELECTRICITY_SOURCES[0];
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(edfFixture(), source, NOW), source, new Date(NOW)).offers as ElectricityOffer[];
  const [result] = compareElectricityContract({ powerKva: 6, tariffOption: "BASE", annualConsumptionKwh: 4000,
    currentAnnualCost: 1200, isEstimatedSchedule: true }, offers.filter((offer) => offer.tariffOption === "BASE"));
  assert.equal(result?.confidence, "ESTIMATED");
  assert.equal(result?.estimatedAnnualSaving, null);
});

function totalGasFixture() {
  return `<main>Offre Access gaz Partie abonnement Option tarifaire Consommation Annuelle Abonnement mensuel TTC
    T1 (Zone 1) &lt; 4 MWh 12,70 T1 (Zone 2) 12,70 T1 (Zone 3) 12,70 T1 (Zone 4) 12,70 T1 (Zone 5) 12,70 T1 (Zone 6) 12,70
    T2 (Zone 1) ≥ 4 MWh 30,07 T2 (Zone 2) 30,07 T2 (Zone 3) 30,07 T2 (Zone 4) 30,07 T2 (Zone 5) 30,07 T2 (Zone 6) 30,07
    Prix du kWh Offre Access Gaz TTC T1 Zone 1 0,1711 T1 Zone 2 0,1719 T1 Zone 3 0,1734 T1 Zone 4 0,1750 T1 Zone 5 0,1772 T1 Zone 6 0,1801
    T2 Zone 1 0,1397 T2 Zone 2 0,1413 T2 Zone 3 0,1435 T2 Zone 4 0,1469 T2 Zone 5 0,1508 T2 (Zone 6) 0,1562 TTC.</main>`;
}

test("gaz exige une classe et une zone compatibles", () => {
  const source = GAS_SOURCES[0];
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(totalGasFixture(), source, NOW), source, new Date(NOW)).offers as GasOffer[];
  assert.equal(offers.length, 12);
  const missingZone = compareGasContract({ annualConsumptionKwh: 12000, tariffZone: null, consumptionClass: "T2", currentAnnualCost: 2200 }, offers);
  assert.ok(missingZone.every((result) => result.estimatedAnnualSaving === null));
  const exact = compareGasContract({ annualConsumptionKwh: 12000, tariffZone: "1", consumptionClass: "T2", currentAnnualCost: 2200 }, offers);
  assert.ok(exact.some((result) => result.confidence === "CERTIFIED"));
});

test("une reference CRE n'est jamais presentee comme offre souscriptible", () => {
  const source = GAS_SOURCES[1];
  const fixture = `<main>Grille du prix repère de vente du gaz pour novembre 2026 sur la zone de GRDF.
    Cuisson/eau chaude Chauffage Abonnement TTC 152,46 360,79 Prix par kWh moyen TTC 0,19027 0,15760.</main>`;
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(fixture, source, NOW), source, new Date(NOW)).offers as GasOffer[];
  const results = compareGasContract({ annualConsumptionKwh: 10000, tariffZone: "GRDF", consumptionClass: "chauffage", currentAnnualCost: 2000 }, offers);
  assert.ok(results.every((result) => result.comparisonKind === "NOT_COMPARABLE"));
  assert.ok(results.every((result) => result.estimatedAnnualSaving === null));
});

test("assurance habitation et auto exigent toujours un devis", () => {
  for (const source of [HOME_INSURANCE_SOURCES[0], CAR_INSURANCE_SOURCES[0]]) {
    const html = source.sector === "home_insurance"
      ? `<main>Assurance habitation avec responsabilité civile, dégâts des eaux, incendie, vol et bris de glace. Obtenir un devis personnalisé.</main>`
      : `<main>Assurance auto au tiers, bris de glace, vol, incendie, tous risques et assistance 0 km. Faire un devis gratuit.</main>`;
    const offers = validateAndDedupeCommercialOffers(parseInsuranceProduct(html, source, NOW), source, new Date(NOW)).offers as InsuranceOffer[];
    assert.equal(offers[0]?.verificationStatus, "VERIFIED");
    const results = compareInsuranceContract({ sector: source.sector as InsuranceOffer["sector"], currentAnnualPremium: 700,
      requiredGuarantees: ["responsabilite civile"], knownDeductibles: [] }, offers);
    assert.equal(results[0]?.confidence, "QUOTE_REQUIRED");
    assert.equal(results[0]?.estimatedAnnualSaving, null);
  }
});

test("la conclusion distingue contrat competitif et catalogue insuffisant", () => {
  assert.equal(catalogConclusion([]), "CATALOG_INSUFFICIENT");
  const offer = verifiedOffer();
  const results = compareInternetContract({ monthlyPrice: 20, technology: "FIBER", minimumDownloadMbps: 100, requiresTv: false }, [offer]);
  assert.equal(catalogConclusion(results), "KEEP_CURRENT_CONTRACT");
});

test("une facture reelle remplace l'echeancier de la meme periode", () => {
  const period = { start: "2026-01-01", end: "2026-12-31" };
  const selected = dedupeEnergyContracts([
    { provider: "EDF", period, documentKind: "PAYMENT_SCHEDULE" as const, value: 1000 },
    { provider: "EDF", period, documentKind: "INVOICE" as const, value: 980 },
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.documentKind, "INVOICE");
});

test("un document mixte produit deux contrats sans additionner le total global", () => {
  const electricity: ExtractedElectricityContract = {
    provider: "ENGIE", powerKva: 6, tariffOption: "BASE", annualConsumptionKwh: 2400,
    peakConsumptionKwh: null, offPeakConsumptionKwh: null, tempoConsumptionKwh: undefined,
    subscriptionAmount: 190, basePricePerKwh: 0.2, peakPricePerKwh: null, offPeakPricePerKwh: null,
    taxes: null, discounts: null, annualCost: 480.72, period: null, documentKind: "PAYMENT_SCHEDULE",
  };
  const gas: ExtractedGasContract = {
    provider: "ENGIE", annualConsumptionKwh: 5200, pricePerKwh: 0.14, annualSubscription: 250,
    tariffZone: "1", consumptionClass: "T2", taxes: null, discounts: null, annualCost: 814.8,
    period: null, documentKind: "PAYMENT_SCHEDULE",
  };
  const split = splitMixedEnergyDocument({ electricity, gas });
  assert.equal(split.electricity?.currentAnnualCost, 480.72);
  assert.equal(split.gas?.currentAnnualCost, 814.8);
});

test("les donnees assurance incompletes n'inventent pas de prime", () => {
  assert.equal(toInsuranceContractInput({ sector: "car_insurance", provider: "Assureur", annualPremium: null,
    guarantees: ["responsabilite civile"], deductibles: [], limits: [], exclusions: [] }), null);
});

test("chaque secteur commercial reste desactive par defaut", () => {
  assert.equal(isCommercialSectorEnabled("internet", {}), false);
  assert.equal(isCommercialSectorEnabled("electricity", { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" }), true);
  assert.equal(isCommercialSectorEnabled("gas", { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" }), false);
});

function expenseFromExtractedText(documentType: UploadedDocumentType, text: string, yearlyAmount: number) {
  const category = documentType === "internet_invoice" ? ExpenseCategory.TELECOM
    : documentType === "electricity_invoice" || documentType === "gas_invoice" ? ExpenseCategory.ENERGY
      : ExpenseCategory.INSURANCE;
  const subcategory = documentType === "internet_invoice" ? ExpenseSubcategory.INTERNET
    : documentType === "electricity_invoice" ? ExpenseSubcategory.ELECTRICITY
      : documentType === "gas_invoice" ? ExpenseSubcategory.GAS
        : documentType === "car_insurance" ? ExpenseSubcategory.CAR_INSURANCE
          : ExpenseSubcategory.HOME_INSURANCE;
  const document = {
    id: `doc-${documentType}`,
    fileName: `${documentType}.pdf`,
    fileSize: 1000,
    mimeType: "application/pdf",
    documentType,
    detectedCategory: category,
    status: "ready" as const,
    uploadedAt: NOW,
    extractedText: text,
  };
  const profiles = buildDocumentPartyProfiles([document]);
  const expense: Expense = attachDocumentProfileToExpense({
    id: `expense-${documentType}`,
    label: documentType,
    provider: "Fournisseur",
    category,
    subcategory,
    isRecurring: true,
    monthlyAmount: yearlyAmount / 12,
    yearlyAmount,
    documentType,
    sourceDocumentId: document.id,
    sourceDocumentName: document.fileName,
    recurrence: "monthly",
  }, profiles);
  return { document, expense };
}

function analysisFor(expense: Expense): MockAnalysis {
  return {
    id: `analysis-${expense.id}`,
    generatedAt: NOW,
    documents: [],
    expenses: [expense],
    recommendations: [],
    anomalies: [],
    totalMonthlyAmount: expense.monthlyAmount,
    totalYearlyAmount: expense.yearlyAmount,
    yearlyPotentialSavings: 0,
  };
}

function catalogLoader(sector: Parameters<typeof buildEnabledCommercialComparisons>[2] extends never ? never : string, offers: unknown[], status: "fresh" | "stale" | "empty" = "fresh") {
  return async () => ({ sector, offers, status, verifiedAt: status === "fresh" ? NOW : null, sources: 1 }) as never;
}

test("document Internet -> extraction -> comparaison verifiee", async () => {
  const { expense } = expenseFromExtractedText("internet_invoice", `Offre Fibre Max\nAbonnement 49,99 EUR / mois. Promotion 39,99 EUR pendant 12 mois puis 49,99 EUR.\nSans engagement. Frais de mise en service 49 EUR. Frais de resiliation 59 EUR.\nDebit descendant 2 Gbit/s, debit montant 700 Mbit/s. TV et Wi-Fi 6 inclus.`, 599.88);
  assert.equal(expense.contractDetails?.kind, "internet");
  assert.equal(expense.contractDetails?.kind === "internet" && expense.contractDetails.technology, "FIBER");
  assert.deepEqual(getMissingContractFields(expense), []);
  const offer = verifiedOffer({ monthlyPrice: 29.99, activationFees: 39, downloadMbps: 2000, includedServices: ["TV", "Wi-Fi 6"] });
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" }, loadCatalog: catalogLoader("internet", [offer]),
  });
  assert.equal(result.alternatives[0]?.savingKind, "certified");
  assert.ok((result.alternatives[0]?.estimatedYearlySaving ?? 0) > 0);
});

test("document electricite -> extraction Base -> cout annuel", async () => {
  const { expense } = expenseFromExtractedText("electricity_invoice", `Facture EDF du 01/01/2026 au 31/12/2026. Puissance souscrite 6 kVA. Option Base. Consommation annuelle 4 000 kWh. Prix du kWh 0,2500 EUR. Abonnement annuel 190,00 EUR. Taxes et contributions 120,00 EUR.`, 1500);
  assert.deepEqual(getMissingContractFields(expense), []);
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(edfFixture(), ELECTRICITY_SOURCES[0], NOW), ELECTRICITY_SOURCES[0], new Date(NOW)).offers;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" }, loadCatalog: catalogLoader("electricity", offers),
  });
  assert.ok(result.alternatives.some((offer) => offer.savingKind === "certified"));
});

test("document gaz -> extraction zone et classe -> comparaison", async () => {
  const { expense } = expenseFromExtractedText("gas_invoice", `Facture gaz du 01/01/2026 au 31/12/2026. Consommation annuelle 12 000 kWh. Zone tarifaire 1. Classe de consommation T2. Prix du kWh 0,1500 EUR. Abonnement annuel 360,00 EUR.`, 2500);
  assert.deepEqual(getMissingContractFields(expense), []);
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(totalGasFixture(), GAS_SOURCES[0], NOW), GAS_SOURCES[0], new Date(NOW)).offers;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_GAS_ENABLED: "1" }, loadCatalog: catalogLoader("gas", offers),
  });
  assert.equal(result.alternatives.filter((offer) => offer.savingKind === "certified").length, 1);
});

test("contrats assurance auto et habitation restent soumis a devis", async () => {
  for (const documentType of ["car_insurance", "home_insurance"] as const) {
    const text = documentType === "car_insurance"
      ? `Cotisation annuelle TTC 720,00 EUR. Vehicule : Peugeot 308. Formule : Tous risques. Garanties responsabilite civile, vol, incendie, bris de glace. Franchise 300 EUR. Assistance 0 km.`
      : `Cotisation annuelle TTC 480,00 EUR. Logement : appartement. Garanties responsabilite civile, incendie, vol, degats des eaux. Franchise 150 EUR. Capital garanti 20 000 EUR.`;
    const { expense } = expenseFromExtractedText(documentType, text, documentType === "car_insurance" ? 720 : 480);
    assert.deepEqual(getMissingContractFields(expense), []);
    const source = documentType === "car_insurance" ? CAR_INSURANCE_SOURCES[0] : HOME_INSURANCE_SOURCES[0];
    const offerText = documentType === "car_insurance"
      ? `<main>Assurance auto avec responsabilite civile, vol, incendie, bris de glace et assistance 0 km. Devis personnalise.</main>`
      : `<main>Assurance habitation avec responsabilite civile, incendie, vol et degats des eaux. Devis personnalise.</main>`;
    const offers = validateAndDedupeCommercialOffers(parseInsuranceProduct(offerText, source, NOW), source, new Date(NOW)).offers;
    const variable = documentType === "car_insurance" ? "COMMERCIAL_CATALOG_CAR_INSURANCE_ENABLED" : "COMMERCIAL_CATALOG_HOME_INSURANCE_ENABLED";
    const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
      environment: { [variable]: "1" }, loadCatalog: catalogLoader(documentType, offers),
    });
    assert.equal(result.alternatives[0]?.comparisonKind, "requires_validation");
    assert.equal(result.alternatives[0]?.estimatedYearlySaving, 0);
    assert.equal(result.alternatives[0]?.savingKind, undefined);
  }
});

test("une confirmation reste limitee au contrat et survit a la reouverture", () => {
  const { expense } = expenseFromExtractedText("electricity_invoice", "Facture electricite sans caracteristiques tarifaires.", 1200);
  const analysis = analysisFor(expense);
  const updated = applyContractConfirmation(analysis, {
    expenseId: expense.id,
    details: { powerKva: 6, tariffOption: "BASE", annualConsumptionKwh: 4000 },
  });
  const reopened = JSON.parse(JSON.stringify(updated)) as MockAnalysis;
  assert.deepEqual(getMissingContractFields(reopened.expenses[0]!), []);
  assert.equal(reopened.expenses[0]?.contractDetails?.fieldSources?.powerKva, "user_confirmed");
  assert.equal(analysis.expenses[0]?.contractDetails?.kind, "electricity");
  assert.equal(analysis.expenses[0]?.contractDetails && "powerKva" in analysis.expenses[0].contractDetails ? analysis.expenses[0].contractDetails.powerKva : undefined, undefined);
});

test("les index Tempo et la periode IA sont valides sans invention", () => {
  const details = normalizeAiContractDetails({
    kind: "electricity",
    documentKind: "INVOICE",
    powerKva: 9,
    tariffOption: "TEMPO",
    annualConsumptionKwh: 5000,
    tempoConsumptionKwh: {
      bluePeak: 1000, blueOffPeak: 1200, whitePeak: 800,
      whiteOffPeak: 900, redPeak: 500, redOffPeak: 600,
      unexpected: 999999,
    },
    period: { start: "2025-11-01", end: "2026-10-31" },
  }, "electricity_invoice", "doc-tempo");
  assert.ok(details?.kind === "electricity");
  assert.equal(details.tempoConsumptionKwh?.redPeak, 500);
  assert.equal("unexpected" in (details.tempoConsumptionKwh ?? {}), false);
  assert.deepEqual(details.period, { start: "2025-11-01", end: "2026-10-31" });
});

test("une donnee IA ou un catalogue perime ne certifie aucune economie", async () => {
  const details = extractContractDetails({ text: "Offre fibre sans engagement, debit descendant 1 Gbit/s. TV incluse.", documentType: "internet_invoice", sourceDocumentId: "doc-ai" });
  assert.ok(details?.kind === "internet");
  const mergedDetails = mergeContractDetails(
    { ...details, commitmentMonths: undefined },
    { ...details, source: "ai", commitmentMonths: 0, monthlyPrice: 50 },
  );
  assert.equal(mergedDetails?.fieldSources?.commitmentMonths, "ai");
  const expense: Expense = {
    id: "expense-ai", label: "Internet", provider: "Operateur", category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.INTERNET, isRecurring: true, monthlyAmount: 50, yearlyAmount: 600,
    recurrence: "monthly", documentType: "internet_invoice",
    contractDetails: mergedDetails,
  };
  const offer = verifiedOffer({ monthlyPrice: 20, activationFees: 0, downloadMbps: 1000, includedServices: ["TV"] });
  const aiResult = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" }, loadCatalog: catalogLoader("internet", [offer]),
  });
  assert.equal(aiResult.alternatives[0]?.savingKind, undefined);
  assert.equal(aiResult.alternatives[0]?.estimatedYearlySaving, 0);
  const staleResult = await buildEnabledCommercialComparisons(analysisFor({ ...expense, contractDetails: { ...expense.contractDetails!, source: "document" } }), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" }, loadCatalog: catalogLoader("internet", [offer], "stale"),
  });
  assert.equal(staleResult.alternatives.length, 0);
  assert.match(staleResult.messages.join(" "), /périmé/);
});
