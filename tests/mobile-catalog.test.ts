import assert from "node:assert/strict";
import { test } from "node:test";
import snapshot from "../experiments/mobile-offers/snapshots/latest.json";
import type {
  CollectionSnapshot,
  MobileOffer
} from "../experiments/mobile-offers/types";
import {
  adaptMobileCatalog,
  type MobileCatalog
} from "../features/recommendations/mobile-catalog";
import {
  findAlternativeOffers,
  isPrimaryAlternative
} from "../features/recommendations/service";
import {
  ExpenseCategory,
  ExpenseSubcategory,
  type Expense
} from "../types";

const VERIFIED_AT = "2026-11-02T09:20:33.000Z";

function mobileOffer(overrides: Partial<MobileOffer> = {}): MobileOffer {
  return {
    provider: "NRJ Mobile",
    offerName: "Forfait test 100 Go",
    monthlyPrice: 10,
    includedDataGB: 100,
    unlimitedData: false,
    euDataGB: 20,
    network: "Réseau test",
    technology: "5G",
    commitmentMonths: 0,
    promotionPrice: null,
    promotionDuration: null,
    priceAfterPromotion: null,
    activationFees: 0,
    simFees: 0,
    conditionalPrices: [],
    pricingTiers: [],
    conditions: [],
    evidence: ["fixture"],
    sourceUrl: "https://www.nrjmobile.fr/forfait-se",
    retrievedAt: VERIFIED_AT,
    verifiedAt: VERIFIED_AT,
    verificationStatus: "VERIFIED",
    ...overrides
  };
}

function catalog(...offers: MobileOffer[]): MobileCatalog {
  return {
    offers,
    status: "fresh",
    verifiedAt: VERIFIED_AT,
    detectedOffers: offers.length,
    verifiedOffers: offers.length,
    source: "embedded_snapshot"
  };
}

function mobileExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "mobile-current",
    label: "Forfait mobile",
    provider: "Opérateur actuel",
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.MOBILE,
    isRecurring: true,
    monthlyAmount: 30,
    yearlyAmount: 360,
    recurrence: "monthly",
    documentType: "mobile_invoice",
    mobileDataGB: 100,
    mobileIncludedDataGB: 100,
    mobileAllowLowerDataOffers: false,
    ...overrides
  };
}

test("le snapshot Lot 1 expose uniquement ses 31 offres vérifiées tant qu'il est frais", () => {
  const adapted = adaptMobileCatalog(
    snapshot as CollectionSnapshot,
    new Date("2026-11-02T10:00:00.000Z")
  );
  assert.equal(adapted.detectedOffers, 45);
  assert.equal(adapted.verifiedOffers, 31);
  assert.equal(adapted.offers.length, 31);
  assert.equal(adapted.status, "fresh");
  assert.ok(adapted.offers.every((offer) => offer.verificationStatus === "VERIFIED"));
});

test("un snapshot périmé ne produit aucune offre", () => {
  const adapted = adaptMobileCatalog(
    snapshot as CollectionSnapshot,
    new Date("2026-11-06T10:00:00.000Z")
  );
  assert.equal(adapted.status, "stale");
  assert.equal(adapted.offers.length, 0);
});

test("une promotion temporaire n'est ni durable ni ajoutée au total principal", () => {
  const [offer] = findAlternativeOffers([mobileExpense()], {
    mobileCatalog: catalog(mobileOffer({
      offerName: "Promotion temporaire",
      monthlyPrice: 30,
      promotionPrice: 10,
      promotionDuration: 6,
      priceAfterPromotion: 30
    }))
  });
  assert.equal(offer.savingKind, "temporary");
  assert.equal(offer.netFirstYearSaving, 120);
  assert.equal(offer.recurringYearlySaving, 0);
  assert.equal(offer.estimatedYearlySaving, 0);
  assert.equal(isPrimaryAlternative(offer), false);
});

test("une remise conditionnelle n'est jamais appliquée sans éligibilité", () => {
  const [offer] = findAlternativeOffers([mobileExpense()], {
    mobileCatalog: catalog(mobileOffer({
      monthlyPrice: 20,
      conditionalPrices: [{
        kind: "BOX",
        monthlyPrice: 5,
        durationMonths: null,
        priceAfter: 20,
        condition: "Client Box uniquement"
      }]
    }))
  });
  assert.equal(offer.monthlyPrice, 20);
  assert.equal(offer.netFirstYearSaving, 120);
  assert.equal(offer.conditionalPrices?.[0]?.monthlyPrice, 5);
});

test("un engagement supplémentaire reste un compromis hors total principal", () => {
  const [offer] = findAlternativeOffers([mobileExpense()], {
    mobileCatalog: catalog(mobileOffer({ monthlyPrice: 15, commitmentMonths: 24 }))
  });
  assert.equal(offer.comparisonKind, "additional_commitment");
  assert.equal(isPrimaryAlternative(offer), false);
  assert.ok((offer.netFirstYearSaving ?? 0) > 0);
});

test("des frais inconnus interdisent une économie nette certifiée", () => {
  const [offer] = findAlternativeOffers([mobileExpense()], {
    mobileCatalog: catalog(mobileOffer({ activationFees: null, simFees: 1 }))
  });
  assert.equal(offer.entryFeesKnown, false);
  assert.equal(offer.savingKind, "recurring_only");
  assert.equal(offer.netFirstYearSaving, undefined);
  assert.equal(offer.estimatedYearlySaving, 0);
  assert.equal(offer.recurringYearlySaving, 240);
});

test("Prixtel utilise la consommation connue et le palier maximal sinon", () => {
  const prixtel = mobileOffer({
    provider: "Prixtel",
    offerName: "Forfait Prixtel",
    monthlyPrice: null,
    includedDataGB: 300,
    activationFees: null,
    simFees: null,
    pricingTiers: [
      { fromDataGB: 0, upToDataGB: 100, monthlyPrice: 10 },
      { fromDataGB: 100, upToDataGB: 200, monthlyPrice: 15 },
      { fromDataGB: 200, upToDataGB: 300, monthlyPrice: 20 }
    ],
    sourceUrl: "https://www.prixtel.com/forfait-mobile/forfait-legeant/"
  });
  const [known] = findAlternativeOffers([
    mobileExpense({ mobileConsumedDataGB: 50 })
  ], { mobileCatalog: catalog(prixtel) });
  const [unknown] = findAlternativeOffers([
    mobileExpense({ mobileConsumedDataGB: undefined })
  ], { mobileCatalog: catalog(prixtel) });
  assert.equal(known.monthlyPrice, 10);
  assert.equal(unknown.monthlyPrice, 20);
  assert.deepEqual(unknown.priceRange, { min: 10, max: 20 });
});

test("un volume mobile absent bloque la comparaison", () => {
  const offers = findAlternativeOffers([
    mobileExpense({ mobileDataGB: undefined, mobileIncludedDataGB: undefined })
  ], { mobileCatalog: catalog(mobileOffer()) });
  assert.deepEqual(offers, []);
});

test("plusieurs contrats conservent des identifiants stables et séparés", () => {
  const offers = [
    mobileOffer({ provider: "NRJ Mobile", offerName: "Offre A" }),
    mobileOffer({ provider: "RED by SFR", offerName: "Offre B", sourceUrl: "https://www.red-by-sfr.fr/forfaits-mobiles/" })
  ];
  const firstExpense = mobileExpense({ id: "first" });
  const secondExpense = mobileExpense({ id: "second", mobileIncludedDataGB: 50 });
  const firstRun = findAlternativeOffers([firstExpense, secondExpense], {
    mobileCatalog: catalog(...offers)
  });
  const secondRun = findAlternativeOffers([firstExpense, secondExpense], {
    mobileCatalog: catalog(...offers.reverse())
  });
  assert.ok(firstRun.some((offer) => offer.sourceExpenseId === "first"));
  assert.ok(firstRun.some((offer) => offer.sourceExpenseId === "second"));
  assert.deepEqual(
    firstRun.map((offer) => offer.id).sort(),
    secondRun.map((offer) => offer.id).sort()
  );
});
