import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseCdiscountOffers } from "../collectors/cdiscount";
import { collectNrjOffers, parseNrjOffers } from "../collectors/nrj";
import { parseOrangeOffers } from "../collectors/orange";
import { parsePrixtelOffer } from "../collectors/prixtel";
import { parseRedOffers } from "../collectors/red";
import { parseSfrOffers } from "../collectors/sfr";
import { parseSoshOffers } from "../collectors/sosh";
import { compareSnapshots } from "../compare-snapshots";
import { resultIsDegraded } from "../run";
import type {
  CollectionSnapshot,
  CollectionSummary,
  CollectorResult,
  MobileOffer,
  Provider,
} from "../types";

const NOW = "2026-11-02T12:00:00.000Z";
const fixturesDir = path.resolve(
  process.cwd(),
  "experiments",
  "mobile-offers",
  "fixtures",
);
const providers: Provider[] = [
  "Free Mobile",
  "RED by SFR",
  "B&You",
  "Orange",
  "Sosh",
  "SFR",
  "Prixtel",
  "NRJ Mobile",
  "Cdiscount Mobile",
];

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}

function findOffer(result: CollectorResult, name: string): MobileOffer {
  const offer = result.offers.find((item) => item.offerName === name);
  assert.ok(offer, `Offre absente: ${name}`);
  return offer;
}

function snapshot(offers: MobileOffer[]): CollectionSnapshot {
  const empty: CollectionSummary = {
    detected: 0,
    verified: 0,
    partial: 0,
    failed: 0,
  };
  return {
    schemaVersion: 2,
    retrievedAt: NOW,
    results: providers.map((provider) => ({
      provider,
      sourceUrl: offers.find((offer) => offer.provider === provider)?.sourceUrl ??
        "https://www.sfr.fr/offre-mobile",
      retrievedAt: NOW,
      offers: offers.filter((offer) => offer.provider === provider),
      failures: [],
    })),
    summary: Object.fromEntries(
      providers.map((provider) => [provider, { ...empty }]),
    ) as Record<Provider, CollectionSummary>,
  };
}

test("1. offre classique sans engagement", async () => {
  const result = parseNrjOffers(await fixture("nrj.html"), NOW);
  const offer = findOffer(result, "Série spéciale NRJ Mobile 100 Go");
  assert.equal(offer.monthlyPrice, 9.99);
  assert.equal(offer.commitmentMonths, 0);
  assert.equal(offer.verificationStatus, "VERIFIED");
});

test("2. prix promotionnel", async () => {
  const result = parseOrangeOffers(await fixture("orange.html"), NOW);
  const offer = findOffer(result, "Forfait Voyage 250Go 5G+");
  assert.equal(offer.promotionPrice, 24.99);
  assert.equal(offer.promotionDuration, 12);
});

test("3. prix après promotion", async () => {
  const result = parseOrangeOffers(await fixture("orange.html"), NOW);
  const offer = findOffer(result, "Forfait Voyage 250Go 5G+");
  assert.equal(offer.monthlyPrice, 33.99);
  assert.equal(offer.priceAfterPromotion, 33.99);
});

test("4. remise Box séparée du prix public", async () => {
  const result = parseSfrOffers(await fixture("sfr.html"), NOW);
  const offer = findOffer(result, "20 Go 5G");
  assert.equal(offer.monthlyPrice, 15.99);
  assert.equal(offer.conditionalPrices[0]?.kind, "BOX");
  assert.equal(offer.conditionalPrices[0]?.monthlyPrice, 8.99);
});

test("5. prix nouveau client séparé", async () => {
  const result = parseOrangeOffers(await fixture("orange.html"), NOW);
  const offer = findOffer(result, "Série Spéciale 130Go 5G+");
  assert.equal(offer.monthlyPrice, 24.99);
  assert.ok(
    offer.conditionalPrices.some(
      (price) => price.kind === "NEW_CUSTOMER" && price.monthlyPrice === 20.99,
    ),
  );
});

test("6. offre avec engagement", async () => {
  const result = parseOrangeOffers(await fixture("orange.html"), NOW);
  assert.equal(
    findOffer(result, "Série Spéciale 80Go 5G").commitmentMonths,
    24,
  );
});

test("7. technologie 5G distincte du volume", async () => {
  const result = parseSfrOffers(await fixture("sfr.html"), NOW);
  const offer = findOffer(result, "20 Go 5G");
  assert.equal(offer.includedDataGB, 20);
  assert.equal(offer.technology, "5G");
});

test("8. forfait Prixtel à plusieurs paliers", async () => {
  const offer = parsePrixtelOffer(await fixture("prixtel.html"), NOW, {
    name: "Le petit",
    url: "https://www.prixtel.com/forfait-mobile/forfait-lepetit/",
  });
  assert.ok(offer);
  assert.equal(offer.monthlyPrice, null);
  assert.deepEqual(offer.pricingTiers, [
    { fromDataGB: 0, upToDataGB: 10, monthlyPrice: 6.99 },
    { fromDataGB: 10, upToDataGB: 20, monthlyPrice: 8.99 },
    { fromDataGB: 20, upToDataGB: 40, monthlyPrice: 10.99 },
  ]);
  assert.equal(offer.verificationStatus, "VERIFIED");
});

test("9. plusieurs offres sur une même page", async () => {
  const result = parseSoshOffers(await fixture("sosh.html"), NOW);
  assert.equal(result.offers.length, 5);
  assert.ok(result.offers.every((offer) => offer.verificationStatus === "PARTIAL"));
});

test("10. prix manquant reste partiel", async () => {
  const html = (await fixture("sfr.html")).replace(
    '{ "name": "Prix Standard", "price": "15.99" },',
    "",
  );
  const offer = findOffer(parseSfrOffers(html, NOW), "20 Go 5G");
  assert.equal(offer.monthlyPrice, null);
  assert.equal(offer.verificationStatus, "PARTIAL");
});

test("11. volume manquant reste partiel", async () => {
  const html = (await fixture("sfr.html"))
    .replace("20 Go 5G", "Forfait mystère 5G")
    .replace("Forfait 20 Go 5G", "Forfait mystère 5G");
  const offer = findOffer(parseSfrOffers(html, NOW), "Forfait mystère 5G");
  assert.equal(offer.includedDataGB, null);
  assert.equal(offer.verificationStatus, "PARTIAL");
});

test("12. prix ambigu n'est jamais choisi arbitrairement", async () => {
  const html = (await fixture("sfr.html")).replace(
    '{ "name": "Prix Standard", "price": "15.99" },',
    '{ "name": "Prix Standard", "price": "15.99" },\n{ "name": "Prix Standard", "price": "14.99" },',
  );
  const offer = findOffer(parseSfrOffers(html, NOW), "20 Go 5G");
  assert.equal(offer.monthlyPrice, null);
  assert.equal(offer.verificationStatus, "PARTIAL");
});

test("13. page inaccessible produit un échec sans offre", async () => {
  const result = await collectNrjOffers({
    fetchImpl: async () => new Response("indisponible", { status: 503 }),
    now: () => new Date(NOW),
  });
  assert.equal(result.offers.length, 0);
  assert.equal(result.failures[0]?.code, "FETCH_FAILED");
});

test("14. structure HTML modifiée produit un échec", async () => {
  const result = parseCdiscountOffers(
    await fixture("changed-structure.html"),
    NOW,
  );
  assert.equal(result.offers.length, 0);
  assert.equal(result.failures[0]?.code, "STRUCTURE_CHANGED");
});

test("15. changement de tarif détecté entre deux collectes", async () => {
  const offer = findOffer(
    parseNrjOffers(await fixture("nrj.html"), NOW),
    "Série spéciale NRJ Mobile 100 Go",
  );
  const changes = compareSnapshots(
    snapshot([offer]),
    snapshot([{ ...offer, monthlyPrice: 10.99 }]),
  );
  assert.ok(changes.some((change) => change.type === "PRICE_CHANGED"));
});

test("un changement de paliers Prixtel est détecté", async () => {
  const offer = parsePrixtelOffer(await fixture("prixtel.html"), NOW, {
    name: "Le petit",
    url: "https://www.prixtel.com/forfait-mobile/forfait-lepetit/",
  });
  assert.ok(offer);
  const modified = {
    ...offer,
    pricingTiers: offer.pricingTiers.map((tier, index) =>
      index === 0 ? { ...tier, monthlyPrice: 7.49 } : tier,
    ),
  };
  const changes = compareSnapshots(snapshot([offer]), snapshot([modified]));
  assert.ok(changes.some((change) => change.type === "TIERS_CHANGED"));
});

test("la fixture Cdiscount reste exploitable hors ligne", async () => {
  const result = parseCdiscountOffers(await fixture("cdiscount.html"), NOW);
  assert.equal(result.offers.length, 3);
  assert.equal(result.offers[1]?.monthlyPrice, 9.99);
});

test("RED associe les prix aux volumes depuis la configuration officielle", async () => {
  const result = parseRedOffers(await fixture("red-structured.html"), NOW);
  assert.equal(result.offers.length, 4);
  const offer = findOffer(result, "Forfait RED 120Go");
  assert.equal(offer.monthlyPrice, 12.99);
  assert.equal(offer.includedDataGB, 120);
  assert.equal(offer.euDataGB, 30);
  assert.equal(offer.verificationStatus, "VERIFIED");
});

test("Orange ne confond jamais 5Go avec la technologie 5G", async () => {
  const result = parseOrangeOffers(await fixture("orange.html"), NOW);
  const offer = findOffer(result, "Série Spéciale SaferPhone 5Go");
  assert.equal(offer.includedDataGB, 5);
  assert.equal(offer.technology, null);
});

test("une source fiable devenue vide ne remplace pas le dernier catalogue", async () => {
  const offer = findOffer(parseSfrOffers(await fixture("sfr.html"), NOW), "20 Go 5G");
  const previous = snapshot([offer]);
  assert.equal(
    resultIsDegraded(previous, {
      provider: "SFR",
      sourceUrl: "https://www.sfr.fr/offre-mobile",
      retrievedAt: NOW,
      offers: [],
      failures: [{
        code: "FETCH_FAILED",
        message: "HTTP 503",
        sourceUrl: "https://www.sfr.fr/offre-mobile",
      }],
    }),
    true,
  );
});
