import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  parseBouyguesOffers,
} from "../collectors/bouygues";
import { parseFreeOffers } from "../collectors/free";
import { collectRedOffers, parseRedOffers } from "../collectors/red";
import { compareSnapshots } from "../compare-snapshots";
import type {
  CollectionSnapshot,
  CollectorResult,
  MobileOffer,
  Provider,
} from "../types";

const NOW = "2026-11-02T10:00:00.000Z";
const fixturesDir = path.resolve(
  process.cwd(),
  "experiments",
  "mobile-offers",
  "fixtures",
);

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}

function findOffer(result: CollectorResult, name: string): MobileOffer {
  const offer = result.offers.find((item) => item.offerName === name);
  assert.ok(offer, `Offre absente: ${name}`);
  return offer;
}

function snapshot(offers: MobileOffer[]): CollectionSnapshot {
  const providers: Provider[] = ["Free Mobile", "RED by SFR", "B&You"];
  const results = providers.map((provider) => ({
    provider,
    sourceUrl: offers.find((offer) => offer.provider === provider)?.sourceUrl ??
      (provider === "Free Mobile"
        ? "https://mobile.free.fr/"
        : provider === "RED by SFR"
          ? "https://www.red-by-sfr.fr/forfaits-mobiles/"
          : "https://www.bouyguestelecom.fr/forfaits-mobiles/sans-engagement"),
    retrievedAt: NOW,
    offers: offers.filter((offer) => offer.provider === provider),
    failures: [],
  }));
  return {
    schemaVersion: 1,
    retrievedAt: NOW,
    results,
    summary: {
      "Free Mobile": { detected: 0, verified: 0, partial: 0, failed: 0 },
      "RED by SFR": { detected: 0, verified: 0, partial: 0, failed: 0 },
      "B&You": { detected: 0, verified: 0, partial: 0, failed: 0 },
    },
  };
}

test("1. extrait un forfait classique", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Forfait 100 Go");
  assert.equal(offer.monthlyPrice, 10.99);
  assert.equal(offer.includedDataGB, 100);
  assert.equal(offer.verificationStatus, "VERIFIED");
});

test("2. extrait un forfait promotionnel", async () => {
  const result = parseBouyguesOffers(await fixture("bouygues.html"), NOW);
  const offer = findOffer(result, "20Go 5G - 9€99");
  assert.equal(offer.monthlyPrice, 7.99);
  assert.equal(offer.promotionPrice, 7.99);
  assert.equal(offer.priceAfterPromotion, 9.99);
});

test("3. distingue les promotions de six et douze mois", async () => {
  const result = parseBouyguesOffers(await fixture("bouygues.html"), NOW);
  assert.equal(findOffer(result, "20Go 5G - 9€99").promotionDuration, 6);
  assert.equal(findOffer(result, "100Go 5G - 13€99").promotionDuration, 12);
});

test("4. reconnaît un forfait 5G de 100 Go", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Forfait 100 Go");
  assert.equal(offer.includedDataGB, 100);
  assert.match(offer.network ?? "", /5G/);
});

test("5. représente les données illimitées sans valeur numérique artificielle", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Forfait Free Max");
  assert.equal(offer.unlimitedData, true);
  assert.equal(offer.includedDataGB, null);
});

test("6. ne confond pas appels illimités et données illimitées", async () => {
  const result = parseRedOffers(await fixture("red.html"), NOW);
  const offer = findOffer(result, "Forfait RED 40 Go");
  assert.equal(offer.unlimitedData, false);
  assert.equal(offer.includedDataGB, 40);
});

test("7. conserve un volume décimal", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  assert.equal(findOffer(result, "Forfait décimal").includedDataGB, 12.5);
});

test("8. ne présente pas une remise Box comme prix public", async () => {
  const result = parseBouyguesOffers(await fixture("bouygues.html"), NOW);
  const offer = findOffer(result, "100Go 5G - 13€99");
  assert.equal(offer.monthlyPrice, 13.99);
  assert.equal(offer.promotionPrice, 10.99);
  assert.ok(offer.conditions.some((condition) => /Box\/Fibre/i.test(condition)));
});

test("9. extrait les frais de SIM et d'activation", async () => {
  const result = parseBouyguesOffers(await fixture("bouygues.html"), NOW);
  const offer = findOffer(result, "20Go 5G - 9€99");
  assert.equal(offer.simFees, 1);
  assert.equal(offer.activationFees, 1);
});

test("10. détecte une modification de tarif", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Forfait 100 Go");
  const updated = { ...offer, monthlyPrice: 11.99 };
  const changes = compareSnapshots(snapshot([offer]), snapshot([updated]));
  assert.ok(changes.some((change) => change.type === "PRICE_CHANGED"));
});

test("11. détecte une offre disparue", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Forfait 100 Go");
  const changes = compareSnapshots(snapshot([offer]), snapshot([]));
  assert.ok(changes.some((change) => change.type === "REMOVED"));
});

test("12. enregistre une page inaccessible sans inventer d'offre", async () => {
  const result = await collectRedOffers({
    fetchImpl: async () => new Response("indisponible", { status: 503 }),
    now: () => new Date(NOW),
  });
  assert.equal(result.offers.length, 0);
  assert.equal(result.failures[0]?.code, "FETCH_FAILED");
});

test("13. signale une structure HTML modifiée", async () => {
  const html = await fixture("changed-structure.html");
  const result = parseBouyguesOffers(html, NOW);
  assert.equal(result.offers.length, 0);
  assert.equal(result.failures[0]?.code, "STRUCTURE_CHANGED");
});

test("14. refuse des données contradictoires", async () => {
  const result = parseBouyguesOffers(
    await fixture("contradictory.html"),
    NOW,
  );
  assert.equal(result.offers[0]?.verificationStatus, "FAILED");
});

test("15. conserve une source partiellement exploitable en PARTIAL", async () => {
  const result = parseRedOffers(await fixture("red.html"), NOW);
  assert.ok(result.offers.length > 0);
  assert.ok(
    result.offers.every(
      (offer) =>
        offer.monthlyPrice === null && offer.verificationStatus === "PARTIAL",
    ),
  );
});

test("Free conserve une transition tarifaire de douze mois", async () => {
  const result = parseFreeOffers(await fixture("free.html"), NOW);
  const offer = findOffer(result, "Série Free");
  assert.equal(offer.promotionDuration, 12);
  assert.equal(offer.priceAfterPromotion, 19.99);
});

test("B&You conserve une offre sans prix comme partielle", async () => {
  const result = parseBouyguesOffers(await fixture("bouygues.html"), NOW);
  const offer = findOffer(result, "1Go");
  assert.equal(offer.monthlyPrice, null);
  assert.equal(offer.verificationStatus, "PARTIAL");
  assert.ok(
    offer.conditions.every((condition) => !/^\$?undefined$/i.test(condition)),
  );
});
