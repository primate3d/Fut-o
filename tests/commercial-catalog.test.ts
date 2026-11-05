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
  annualInternetRecurringCost,
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
import {
  DEFAULT_ENERGY_MIN_YEARLY_SAVING,
  DEFAULT_INTERNET_MIN_YEARLY_SAVING,
  buildEnabledCommercialComparisons,
  selectEnergyAlternatives,
  selectInternetAlternatives,
} from "../lib/server/multisector-comparison";
import type { AlternativeOffer } from "../features/recommendations/service";
import { formatOfferPrice } from "../features/recommendations/offer-pricing";
import { generateLettersFromAnalysis } from "../features/letters/service";
import { toSelectedAlternativeOffer } from "../features/recommendations/selected-offer";
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
const SOURCE = INTERNET_SOURCES.find((source) => source.provider === "RED by SFR")!;
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
  const offers = parseInternetOffers(html, SOURCE, NOW).offers;
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

test("les pages officielles SFR, Bouygues et Orange conservent prix, promotion et services", () => {
  const eligibility = "Offres sous réserve d'éligibilité fibre.";
  const sfr = INTERNET_SOURCES.find((item) => item.provider === "SFR")!;
  const sfrOffers = parseInternetOffers(`<main>
    SFR Fibre Starter Le très haut débit à petit prix 27,99 €/mois Engagement 12 mois
    Fibre jusqu'à 1 Gb/s ↓ 1 Gb/s ↑ WiFi 5 160 chaînes TV incluses.
    Frais d'ouverture de service de 49€. Frais de résiliation de 59€. ${eligibility}
  </main>`, sfr, NOW).offers;
  assert.equal(sfrOffers[0]?.verificationStatus, "VERIFIED");
  assert.equal(sfrOffers[0]?.monthlyPrice, 27.99);
  assert.equal(sfrOffers[0]?.downloadMbps, 1000);

  const bouygues = INTERNET_SOURCES.find((item) => item.provider === "Bouygues Telecom")!;
  const bboxOffers = parseInternetOffers(`<main>
    Bbox fit L'essentiel du WiFi 6 et b.tv inclus 37 €99 / mois 30 €99 / mois
    30.99 euros par mois, au lieu de 37.99 € par mois pendant 12 mois puis 37,99€ /mois.
    Engagement 1 an. Fibre jusqu'à ↓ 1 Gb/s ↑ 700 Mb/s. Plus de 180 chaînes avec b.tv.
    Frais de mise en service : 48€. Frais de résiliation : 69€. ${eligibility}
  </main>`, bouygues, NOW).offers;
  assert.equal(bboxOffers[0]?.promotionPrice, 30.99);
  assert.equal(bboxOffers[0]?.priceAfterPromotion, 37.99);
  assert.equal(bboxOffers[0]?.offerUrl, "https://www.bouyguestelecom.fr/offres-internet/bbox-fit");

  const orange = INTERNET_SOURCES.find((item) => item.provider === "Orange")!;
  const orangeOffers = parseInternetOffers(`<main>
    Livebox Classic Fibre 29,99 €/mois pendant 12 mois puis 42,99 €/mois. Engagement 12 mois.
    Fibre jusqu'à ↓ 2 Gb/s ↑ 800 Mb/s. 200 chaînes TV et décodeur TV inclus.
    Frais de mise en service : 49€. Frais de résiliation : 69€. ${eligibility}
  </main>`, orange, NOW).offers;
  assert.equal(orangeOffers[0]?.verificationStatus, "VERIFIED");
  assert.equal(orangeOffers[0]?.promotionPrice, 29.99);
  assert.equal(orangeOffers[0]?.priceAfterPromotion, 42.99);
});

test("les sources officielles Free distinguent tarif stable et promotion", () => {
  const eligibility = "Testez votre éligibilité à la Fibre.";
  const popSource = INTERNET_SOURCES.find((item) => item.id === "internet-freebox-pop-s")!;
  const [pop] = parseInternetOffers(`<main>
    Freebox Pop S 24 € 99 /mois. Fibre jusqu'à 5 Gbit/s descendant et 900 Mbit/s montant.
    Wi-Fi 7. Sans engagement. ${eligibility}
  </main>`, popSource, NOW).offers;
  assert.equal(pop?.verificationStatus, "VERIFIED");
  assert.equal(pop?.promotionPrice, null);
  assert.equal(pop?.monthlyPrice, 24.99);

  const revolutionSource = INTERNET_SOURCES.find((item) => item.id === "internet-freebox-revolution-light")!;
  const [revolution] = parseInternetOffers(`<main>
    Freebox Révolution Light Fibre 1 Gbit/s descendant 900 Mbit/s montant, Wi-Fi 5 et 300 chaines TV.
    24 € 99 /mois pendant 1 an puis 29,99 € /mois. Sans engagement. ${eligibility}
  </main>`, revolutionSource, NOW).offers;
  assert.equal(revolution?.verificationStatus, "VERIFIED");
  assert.equal(revolution?.promotionPrice, 24.99);
  assert.equal(revolution?.priceAfterPromotion, 29.99);
});

test("les frais inconnus produisent une economie tarifaire indicative mais selectionnable", async () => {
  const offer = verifiedOffer({
    provider: "Offre indicative",
    monthlyPrice: 24.99,
    activationFees: null,
    terminationFees: null,
    downloadMbps: 2000,
    includedServices: ["TV"],
  });
  const comparison = compareInternetContract({
    monthlyPrice: 44.99,
    technology: "FIBER",
    minimumDownloadMbps: 1000,
    requiresTv: true,
    commitmentMonths: 12,
  }, [offer]);
  assert.equal(comparison[0]?.confidence, "ESTIMATED");
  assert.equal(annualInternetCost(offer), null);
  assert.equal(annualInternetRecurringCost(offer), 299.88);

  const expense = expenseFromExtractedText(
    "internet_invoice",
    "Offre Fibre. Abonnement 44,99 EUR par mois. Engagement 12 mois. Debit descendant 1 Gbit/s. TV incluse.",
    539.88,
  ).expense;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" },
    loadCatalog: catalogLoader("internet", [offer]),
  });
  assert.equal(result.alternatives[0]?.savingKind, "recurring_only");
  assert.equal(result.alternatives[0]?.comparisonKind, "equivalent");
  assert.equal(result.alternatives[0]?.estimatedYearlySaving, 240);
});

test("le seuil Box, la television et l'engagement evitent les changements peu pertinents", () => {
  const expensive = verifiedOffer({ monthlyPrice: 42.99, activationFees: 0, terminationFees: 0, includedServices: ["TV"] });
  const lowSaving = compareInternetContract({ monthlyPrice: 44.99, technology: "FIBER", minimumDownloadMbps: 1000,
    requiresTv: true, commitmentMonths: 12 }, [expensive]);
  assert.equal(lowSaving[0]?.estimatedAnnualSaving, 24);

  const withoutTv = verifiedOffer({ monthlyPrice: 24.99, activationFees: 0, terminationFees: 0, includedServices: [] });
  const withLongerCommitment = verifiedOffer({ monthlyPrice: 24.99, activationFees: 0, terminationFees: 0,
    commitmentMonths: 12, includedServices: ["TV"] });
  const incompatible = compareInternetContract({ monthlyPrice: 44.99, technology: "FIBER", minimumDownloadMbps: 1000,
    requiresTv: true, commitmentMonths: 0 }, [withoutTv, withLongerCommitment]);
  assert.ok(incompatible.every((result) => result.comparisonKind === "COMPROMISE"));
  assert.ok(incompatible.every((result) => result.estimatedAnnualSaving === null));
});

test("une box deja competitive ne produit aucune recommandation insignifiante", async () => {
  const expense = expenseFromExtractedText(
    "internet_invoice",
    "Offre Fibre. Abonnement 19,99 EUR par mois. Sans engagement. Debit descendant 1 Gbit/s. Wi-Fi 6 inclus.",
    239.88,
  ).expense;
  const offer = verifiedOffer({ monthlyPrice: 18.99, activationFees: 0, terminationFees: 0 });
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" },
    loadCatalog: catalogLoader("internet", [offer]),
  });
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.comparisonStates[0]?.status, "no_better_offer");
});

test("la selection Box retient deux offres et une troisieme seulement si elle est distincte", () => {
  const alternative = (id: string, provider: string, saving: number, overrides: Partial<AlternativeOffer> = {}): AlternativeOffer => ({
    id, provider, name: id, url: "https://example.com", category: ExpenseCategory.TELECOM,
    monthlyPrice: 20, yearlyPrice: 240, estimatedYearlySaving: saving,
    comparisonKind: "equivalent", savingKind: "certified", reason: "", action: "", ...overrides,
  });
  const selected = selectInternetAlternatives([
    alternative("promotion", "A", 240, { durableYearlySaving: 180, downloadMbps: 1000, commitmentMonths: 0 }),
    alternative("stable", "B", 155, { durableYearlySaving: 204, downloadMbps: 1000, commitmentMonths: 12 }),
    alternative("duplicate", "B", 170, { durableYearlySaving: 190, downloadMbps: 1100, commitmentMonths: 12 }),
    alternative("distinct", "C", 120, { durableYearlySaving: 120, downloadMbps: 8000, commitmentMonths: 0 }),
    alternative("insignificant", "D", 300, { durableYearlySaving: DEFAULT_INTERNET_MIN_YEARLY_SAVING - 1 }),
  ]);
  assert.deepEqual(selected.map((offer) => offer.id), ["stable", "promotion", "distinct"]);
});

test("le prix Box affiche immédiatement la promotion et son tarif durable", () => {
  const formatted = formatOfferPrice({
    monthlyPrice: 24.99,
    promotionPrice: 24.99,
    promotionDurationMonths: 12,
    priceAfterPromotion: 29.99,
  }, (value) => `${value.toFixed(2)} €`);
  assert.equal(formatted, "24.99 € / mois pendant 12 mois, puis 29.99 € / mois");
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

test("un echeancier electricite produit uniquement une economie indicative", () => {
  const source = ELECTRICITY_SOURCES[0];
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(edfFixture(), source, NOW), source, new Date(NOW)).offers as ElectricityOffer[];
  const [result] = compareElectricityContract({ powerKva: 6, tariffOption: "BASE", annualConsumptionKwh: 4000,
    currentAnnualCost: 1200, isEstimatedSchedule: true }, offers.filter((offer) => offer.tariffOption === "BASE"));
  assert.equal(result?.confidence, "ESTIMATED");
  assert.ok((result?.estimatedAnnualSaving ?? 0) > 0);
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
  assert.ok(
  exact.some(
    (result) =>
      result.confidence === "ESTIMATED" &&
      (result.estimatedAnnualSaving ?? 0) > 0
  )
);
});

test("une reference CRE n'est jamais presentee comme offre souscriptible", () => {
  const source = GAS_SOURCES.find((candidate) => candidate.provider === "CRE")!;
  const fixture = `<main>Grille du prix repère de vente du gaz pour novembre 2026 sur la zone de GRDF.
    Cuisson/eau chaude Chauffage Abonnement TTC 152,46 360,79 Prix par kWh moyen TTC 0,19027 0,15760.</main>`;
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(fixture, source, NOW), source, new Date(NOW)).offers as GasOffer[];
  const results = compareGasContract({ annualConsumptionKwh: 10000, tariffZone: "GRDF", consumptionClass: "chauffage", currentAnnualCost: 2000 }, offers);
  assert.ok(results.every((result) => result.comparisonKind === "NOT_COMPARABLE"));
  assert.ok(results.every((result) => result.estimatedAnnualSaving === null));
});

test("les grilles PDF officielles Mint et Plenitude produisent des offres electricite verifiees", () => {
  const mintSource = ELECTRICITY_SOURCES.find((source) => source.provider === "Mint Energie")!;
  const mintFixture = `Offre ONLINE & GREEN OFFRE INDEXEE TRVE Grille tarifaire applicable au 01/08/2026
    Option tarifaire BASE Puissance Abonnement mensuel Prix du kWh EUR HTT EUR TTC EUR HTT EUR TTC
    3 kVA 9,22 12,13 0,1211 0,1821 6 kVA 11,94 15,86 9 kVA 14,90 19,88 0,1200 0,1807
    12 kVA 17,74 23,76 15 kVA 20,38 27,40 18 kVA 23,11 31,14
    Puissance Abonnement mensuel Prix du kWh HP HC EUR HTT EUR TTC EUR HTT EUR TTC EUR HTT EUR TTC
    6 kVA 11,94 16,05 0,1316 0,1947 0,0906 0,1455 9 kVA 14,90 20,16 12 kVA 17,74 24,13
    Le tarif applicable dépend de la puissance souscrite.`;
  const mint = validateAndDedupeCommercialOffers(parseEnergyOffers(mintFixture, mintSource, NOW), mintSource, new Date(NOW)).offers as ElectricityOffer[];
  assert.equal(mint.length, 3);
  assert.ok(mint.every((offer) => offer.verificationStatus === "VERIFIED"));
  const mintBase = mint.find((offer) => offer.tariffOption === "BASE" && offer.powerKva.includes(6))!;
  const [mintResult] = compareElectricityContract({ powerKva: 6, tariffOption: "BASE", annualConsumptionKwh: 4000,
    currentAnnualCost: 1200, isEstimatedSchedule: false }, [mintBase]);
  assert.equal(mintResult?.alternativeAnnualCost, 918.72);
  assert.equal(mintResult?.confidence, "ESTIMATED");
  assert.match(mintResult?.reasons.join(" ") ?? "", /indexe|indicative/i);

  const plenitudeSource = ELECTRICITY_SOURCES.find((source) => source.provider === "Plenitude")!;
  const plenitudeFixture = `Grille tarifaire de référence pour toute souscription du 01/10/2026 au 17/11/2026 non inclus
    Puissance souscrite Option tarifaire Base Option tarifaire Heures Pleines HP Heures Creuses HC
    3 kVA 134,64 174,36 0,12249 0,18373 134,64 174,36 0,13311 0,19648 0,09162 0,14669
    6 kVA 167,28 219,15 0,12249 0,18373 167,28 219,15 0,13311 0,19648 0,09162 0,14669
    9 kVA 202,80 267,40 0,12132 0,18233 202,80 267,40 0,13311 0,19648 0,09162 0,14669
    Précisions sur votre offre`;
  const plenitude = validateAndDedupeCommercialOffers(parseEnergyOffers(plenitudeFixture, plenitudeSource, NOW), plenitudeSource, new Date(NOW)).offers as ElectricityOffer[];
  assert.equal(plenitude.length, 3);
  assert.ok(plenitude.every((offer) => offer.verificationStatus === "VERIFIED"));
  assert.ok(plenitude.every((offer) => offer.validFrom === "2026-10-01T00:00:00.000Z"));
  assert.ok(plenitude.every((offer) => offer.validUntil === "2026-11-16T23:59:59.999Z"));
  assert.equal(filterFreshCommercialOffers(plenitude, "electricity", new Date("2026-11-17T00:00:00.000Z")).length, 0);
  assert.equal(parseEnergyOffers(plenitudeFixture.replace(/\s+non inclus/i, ""), plenitudeSource, NOW).length, 0);
});

test("les dates des grilles PDF Engie et Plenitude gouvernent leur disponibilite", () => {
  const engieSource = GAS_SOURCES.find((source) => source.provider === "Engie")!;
  const engieFixture = `Grille tarifaire - août 2026. Prix TTC. Plage de consommation prévisionnelle
    Plage 0 - 3999 kWh Plage 4000 - 29999 kWh Plage 30000 - 300000 kWh HTT TTC HTT TTC HTT TTC
    Abonnement en EUR / an 112,84 152,46 274,59 387,85 274,59 387,85 Consommation EUR / kWh
    Niveau 1 0,12199 0,16638 0,08956 0,12746 0,08977 0,12772
    Niveau 2 0,09024 0,12828 0,09046 0,12854 Niveau 3 0,09092 0,12910 0,09115 0,12937
    Niveau 4 0,09160 0,12991 0,09184 0,13020 Niveau 5 0,09227 0,13072 0,09253 0,13103
    Niveau 6 0,09295 0,13153 0,09322 0,13186 Gaz Adapt 1 an`;
  const engie = validateAndDedupeCommercialOffers(parseEnergyOffers(engieFixture, engieSource, NOW), engieSource, new Date(NOW)).offers as GasOffer[];
  assert.equal(engie.length, 7);
  assert.ok(engie.every((offer) => offer.verificationStatus !== "VERIFIED"));
  assert.ok(engie.every((offer) => offer.pricingMode === "INDEXED"));
  assert.ok(engie.every((offer) => offer.validFrom === "2026-08-01T00:00:00.000Z"));
  assert.ok(engie.every((offer) => offer.validUntil === "2026-08-31T23:59:59.999Z"));
  assert.equal(filterFreshCommercialOffers(engie, "gas", new Date(NOW)).length, 0);

  const currentEngieFixture = engieFixture.replace("août 2026", "novembre 2026");
  const currentEngie = validateAndDedupeCommercialOffers(
    parseEnergyOffers(currentEngieFixture, engieSource, NOW), engieSource, new Date(NOW),
  ).offers as GasOffer[];
  assert.ok(currentEngie.every((offer) => offer.verificationStatus === "VERIFIED"));
  assert.equal(filterFreshCommercialOffers(currentEngie, "gas", new Date(NOW)).length, 7);
  const [indexedResult] = compareGasContract({ annualConsumptionKwh: 12000, tariffZone: "1", consumptionClass: "T2",
    currentAnnualCost: 2500, isEstimatedSchedule: false }, currentEngie);
  assert.equal(indexedResult?.confidence, "ESTIMATED");
  assert.match(indexedResult?.reasons.join(" ") ?? "", /indexé|indicative/i);

  const plenitudeSource = GAS_SOURCES.find((source) => source.provider === "Plenitude")!;
  const plenitudeFixture = `Grille tarifaire de référence pour toute souscription du 01/10/2026 au 17/11/2026 non inclus
    Option tarifaire Abonnement EUR/an Consommation EUR/kWh HT TTC HT TTC
    < 4 MWh 135,04 179,10 0,13194 0,17832 ≥ 4 MWh 274,24 387,43 0,10464 0,14556`;
  const plenitude = validateAndDedupeCommercialOffers(parseEnergyOffers(plenitudeFixture, plenitudeSource, NOW), plenitudeSource, new Date(NOW)).offers as GasOffer[];
  assert.equal(plenitude.length, 2);
  assert.ok(plenitude.every((offer) => offer.validUntil === "2026-11-16T23:59:59.999Z"));
  assert.equal(filterFreshCommercialOffers(plenitude, "gas", new Date("2026-11-17T00:00:00.000Z")).length, 0);
  assert.equal(parseEnergyOffers(plenitudeFixture.replace(/\s+non inclus/i, ""), plenitudeSource, NOW).length, 0);
  const t2 = plenitude.find((offer) => offer.consumptionClass === "T2")!;
  assert.equal(compareGasContract({ annualConsumptionKwh: 12000, tariffZone: "4", consumptionClass: "T2",
    currentAnnualCost: 2500 }, [t2])[0]?.alternativeAnnualCost, 2134.15);
});

test("la selection energie retient deux offres et une troisieme seulement pour un mode tarifaire distinct", () => {
  const alternative = (id: string, provider: string, saving: number, pricingMode: AlternativeOffer["pricingMode"]): AlternativeOffer => ({
    id, provider, name: id, url: "https://example.com", category: ExpenseCategory.ENERGY,
    monthlyPrice: 80, yearlyPrice: 960, estimatedYearlySaving: saving, comparisonKind: "equivalent",
    savingKind: "certified", reason: "", action: "", pricingMode,
  });
  const selected = selectEnergyAlternatives([
    alternative("best", "A", 220, "INDEXED"), alternative("second", "B", 180, "INDEXED"),
    alternative("duplicate-provider", "A", 170, "FIXED"), alternative("distinct", "C", 160, "FIXED"),
    alternative("small", "D", DEFAULT_ENERGY_MIN_YEARLY_SAVING - 1, "REGULATED"),
  ]);
  assert.deepEqual(selected.map((offer) => offer.id), ["best", "second", "distinct"]);
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

test("les etats de comparaison distinguent desactivation, informations manquantes et absence d'offre", async () => {
  const incomplete = expenseFromExtractedText(
    "electricity_invoice",
    "Facture electricite sans caracteristiques tarifaires.",
    1200
  ).expense;
  const disabled = await buildEnabledCommercialComparisons(analysisFor(incomplete), new Date(NOW), {
    environment: {},
  });
  assert.equal(disabled.comparisonStates[0]?.status, "disabled");

  const missing = await buildEnabledCommercialComparisons(analysisFor(incomplete), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" },
    loadCatalog: catalogLoader("electricity", []),
  });
  assert.equal(missing.comparisonStates[0]?.status, "missing_information");
  assert.ok((missing.comparisonStates[0]?.missingFields?.length ?? 0) > 0);

  const complete = expenseFromExtractedText(
    "internet_invoice",
    "Offre Fibre. Abonnement 49,99 EUR par mois. Sans engagement. Debit descendant 1 Gbit/s. TV incluse.",
    599.88
  ).expense;
  const noBetter = await buildEnabledCommercialComparisons(analysisFor(complete), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" },
    loadCatalog: catalogLoader("internet", [verifiedOffer({
      monthlyPrice: 99,
      activationFees: 49,
      downloadMbps: 1000,
      includedServices: ["TV"],
    })]),
  });
  assert.equal(noBetter.comparisonStates[0]?.status, "no_better_offer");
});

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
  assert.equal(result.comparisonStates[0]?.status, "alternative_found");
});

test("promotion Box, économie durable et courrier restent cohérents", async () => {
  const { expense } = expenseFromExtractedText(
    "internet_invoice",
    "Offre Fibre. Abonnement 44,99 EUR par mois. Engagement 12 mois. Debit descendant 1 Gbit/s. TV incluse.",
    539.88,
  );
  const offer = verifiedOffer({
    provider: "Free",
    offerName: "Freebox Révolution Light",
    monthlyPrice: 24.99,
    promotionPrice: 24.99,
    promotionDurationMonths: 12,
    priceAfterPromotion: 29.99,
    activationFees: 49,
    terminationFees: 69,
    downloadMbps: 1000,
    includedServices: ["TV"],
  });
  const analysis = analysisFor(expense);
  const result = await buildEnabledCommercialComparisons(analysis, new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_INTERNET_ENABLED: "1" },
    loadCatalog: catalogLoader("internet", [offer]),
  });
  const alternative = result.alternatives[0]!;
  assert.equal(alternative.estimatedYearlySaving, 191);
  assert.equal(alternative.durableYearlySaving, 180);
  const selected = toSelectedAlternativeOffer(alternative);
  const letter = generateLettersFromAnalysis(analysis, selected)[0]!;
  assert.equal(letter.offerPriceAfterPromotion, 29.99);
  assert.match(letter.bodyTemplate, /24,99\s*€ \/ mois pendant 12 mois, puis 29,99\s*€ \/ mois/);
  assert.match(letter.bodyTemplate, /durable estimé est d'environ 180,00\s*€/);
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

test("une grille electricite hors de sa periode de validite est exclue", () => {
  const offers = validateAndDedupeCommercialOffers(
    parseEnergyOffers(edfFixture(), ELECTRICITY_SOURCES[0], NOW), ELECTRICITY_SOURCES[0], new Date(NOW),
  ).offers as ElectricityOffer[];
  const expired = offers.map((offer) => ({ ...offer, validUntil: "2026-11-02T23:59:59.000Z" }));
  assert.equal(filterFreshCommercialOffers(expired, "electricity", new Date(NOW)).length, 0);
});

test("une economie electricite inferieure au seuil n'est pas recommandee", async () => {
  const { expense } = expenseFromExtractedText(
    "electricity_invoice",
    "Facture EDF du 01/01/2026 au 31/12/2026. Puissance souscrite 6 kVA. Option Base. Consommation annuelle 4 000 kWh. Prix du kWh 0,2100 EUR. Abonnement annuel 190,00 EUR.",
    1030,
  );
  const offers = validateAndDedupeCommercialOffers(
    parseEnergyOffers(edfFixture(), ELECTRICITY_SOURCES[0], NOW), ELECTRICITY_SOURCES[0], new Date(NOW),
  ).offers;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" },
    loadCatalog: catalogLoader("electricity", offers),
  });
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.comparisonStates[0]?.status, "no_better_offer");
});

test("une facture EDF ponctuelle ne devient jamais un cout annuel comparable", async () => {
  const { expense } = expenseFromExtractedText(
    "electricity_invoice",
    "Facture EDF du 04/08/2025. Puissance souscrite 6 kVA. Option Base. Consommation annuelle 4 000 kWh. Facture TTC 96,64 EUR.",
    96.64,
  );
  expense.recurrence = "one_time";
  expense.monthlyAmount = 0;
  const offers = validateAndDedupeCommercialOffers(
    parseEnergyOffers(edfFixture(), ELECTRICITY_SOURCES[0], NOW), ELECTRICITY_SOURCES[0], new Date(NOW),
  ).offers;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" },
    loadCatalog: catalogLoader("electricity", offers),
  });
  assert.equal(result.alternatives.length, 0);
  assert.notEqual(result.comparisonStates[0]?.status, "alternative_found");
});

test("un echeancier energie reste selectionnable comme estimation et conserve son avertissement", async () => {
  const { expense } = expenseFromExtractedText(
    "electricity_invoice",
    "Echeancier EDF. Puissance souscrite 6 kVA. Option Base. Consommation annuelle 4 000 kWh.",
    1200,
  );
  const offers = validateAndDedupeCommercialOffers(
    parseEnergyOffers(edfFixture(), ELECTRICITY_SOURCES[0], NOW), ELECTRICITY_SOURCES[0], new Date(NOW),
  ).offers;
  const analysis = analysisFor(expense);
  const result = await buildEnabledCommercialComparisons(analysis, new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_ELECTRICITY_ENABLED: "1" },
    loadCatalog: catalogLoader("electricity", offers),
  });
  const alternative = result.alternatives[0]!;
  assert.equal(alternative.savingKind, "recurring_only");
  assert.equal(alternative.estimateReason, "estimated_schedule");
  const selected = toSelectedAlternativeOffer(alternative);
  assert.equal(selected.estimateReason, "estimated_schedule");
  const letter = generateLettersFromAnalysis(analysis, selected)[0]!;
  assert.match(letter.bodyTemplate, /échéancier prévisionnel/);
  assert.doesNotMatch(letter.bodyTemplate, /frais ponctuels peuvent la réduire/);
});

test("document gaz -> extraction zone et classe -> comparaison", async () => {
  const { expense } = expenseFromExtractedText("gas_invoice", `Facture gaz du 01/01/2026 au 31/12/2026. Consommation annuelle 12 000 kWh. Zone tarifaire 1. Classe de consommation T2. Prix du kWh 0,1500 EUR. Abonnement annuel 360,00 EUR.`, 2500);
  assert.deepEqual(getMissingContractFields(expense), []);
  const offers = validateAndDedupeCommercialOffers(parseEnergyOffers(totalGasFixture(), GAS_SOURCES[0], NOW), GAS_SOURCES[0], new Date(NOW)).offers;
  const result = await buildEnabledCommercialComparisons(analysisFor(expense), new Date(NOW), {
    environment: { COMMERCIAL_CATALOG_GAS_ENABLED: "1" }, loadCatalog: catalogLoader("gas", offers),
  });
  assert.equal(
  result.alternatives.filter(
    (offer) => offer.savingKind === "recurring_only"
  ).length,
  1
);

assert.equal(
  result.alternatives.filter(
    (offer) => offer.savingKind === "certified"
  ).length,
  0
);
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

test("une ancienne ligne Engie electricite mal typee est confirmee comme electricite", () => {
  const { expense } = expenseFromExtractedText(
    "gas_invoice",
    "Echeancier Engie. Consommation annuelle gaz 4349 kWh.",
    814.8
  );
  const legacyExpense: Expense = {
    ...expense,
    subcategory: ExpenseSubcategory.ELECTRICITY,
  };
  const updated = applyContractConfirmation(analysisFor(legacyExpense), {
    expenseId: legacyExpense.id,
    details: { powerKva: 6, tariffOption: "HPHC", annualConsumptionKwh: 1369 },
  });
  assert.equal(updated.expenses[0]?.contractDetails?.kind, "electricity");
  assert.deepEqual(getMissingContractFields(updated.expenses[0]!), [
    "consommation heures pleines",
    "consommation heures creuses",
  ]);
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
  assert.equal(staleResult.comparisonStates[0]?.status, "unavailable");
  assert.equal(staleResult.alternatives.length, 0);
  assert.match(staleResult.messages.join(" "), /périmé/);
});
