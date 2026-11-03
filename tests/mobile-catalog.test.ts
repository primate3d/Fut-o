import assert from "node:assert/strict";
import { test } from "node:test";
import type { MobileOffer } from "../experiments/mobile-offers/types";
import {
  adaptMobileCatalog,
  type MobileCatalog
} from "../features/recommendations/mobile-catalog";
import {
  findAlternativeOffers,
  getMobileComparisonMinimumDataGB,
  isPrimaryAlternative
} from "../features/recommendations/service";
import { getMobileComparisonMessage } from "../lib/server/comparison";
import {
  ExpenseCategory,
  ExpenseSubcategory,
  type Expense,
  type MockAnalysis
} from "../types";
import {
  MOBILE_CATALOG_FIXTURE_NOW,
  mobileCatalogSnapshotFixture
} from "./fixtures/mobile-catalog";

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

function analysisFor(expense: Expense): MockAnalysis {
  return {
    id: "mobile-analysis",
    generatedAt: VERIFIED_AT,
    documents: [],
    expenses: [expense],
    recommendations: [],
    anomalies: [],
    totalMonthlyAmount: expense.monthlyAmount,
    totalYearlyAmount: expense.yearlyAmount,
    yearlyPotentialSavings: 0
  };
}

test("la fixture expose uniquement ses 31 offres vérifiées tant qu'elle est fraîche", () => {
  const adapted = adaptMobileCatalog(
    mobileCatalogSnapshotFixture,
    MOBILE_CATALOG_FIXTURE_NOW
  );
  assert.equal(adapted.detectedOffers, 45);
  assert.equal(adapted.verifiedOffers, 31);
  assert.equal(adapted.offers.length, 31);
  assert.equal(adapted.status, "fresh");
  assert.ok(adapted.offers.every((offer) => offer.verificationStatus === "VERIFIED"));
});

test("un snapshot périmé ne produit aucune offre", () => {
  const adapted = adaptMobileCatalog(
    mobileCatalogSnapshotFixture,
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

test("Free illimité respecte le seuil utilisateur de 300 Go", () => {
  const current = mobileExpense({
    provider: "Free Mobile",
    monthlyAmount: 9.99,
    yearlyAmount: 119.88,
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 300
  });
  const offers = findAlternativeOffers([current], {
    mobileCatalog: catalog(
      mobileOffer({ offerName: "10 Go", monthlyPrice: 7.99, includedDataGB: 10 }),
      mobileOffer({ offerName: "300 Go", monthlyPrice: 6.99, includedDataGB: 300 }),
      mobileOffer({ offerName: "500 Go", monthlyPrice: 8.99, includedDataGB: 500 }),
      mobileOffer({
        offerName: "Illimité",
        monthlyPrice: 9.49,
        includedDataGB: null,
        unlimitedData: true
      })
    )
  });

  assert.ok(offers.some((offer) => offer.name === "Illimité"));
  assert.ok(offers.some((offer) => offer.name === "500 Go"));
  assert.ok(offers.some((offer) => offer.name === "300 Go"));
  assert.ok(offers.every((offer) => offer.name !== "10 Go"));
  assert.deepEqual(
    offers
      .filter((offer) => offer.comparisonKind === "reduced_data")
      .map((offer) => offer.mobileDataLimitGB),
    [300, 500]
  );
});

test("les frais connus et les promotions sont compares sur la meme premiere annee", () => {
  const current = mobileExpense({
    monthlyAmount: 9.99,
    yearlyAmount: 119.88,
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 300
  });
  const offers = findAlternativeOffers([current], {
    mobileCatalog: catalog(
      mobileOffer({
        offerName: "300 Go avec frais",
        monthlyPrice: 5,
        includedDataGB: 300,
        activationFees: 50
      }),
      mobileOffer({ offerName: "500 Go sans frais", monthlyPrice: 8.99, includedDataGB: 500 }),
      mobileOffer({
        offerName: "300 Go promotion courte",
        monthlyPrice: 9.5,
        includedDataGB: 300,
        promotionPrice: 1,
        promotionDuration: 1,
        priceAfterPromotion: 9.5
      })
    )
  });

  assert.deepEqual(
    offers.map((offer) => offer.name),
    ["300 Go promotion courte", "500 Go sans frais", "300 Go avec frais"]
  );
  assert.equal(offers[0]?.netFirstYearSaving, 14.38);
  assert.equal(offers[0]?.recurringYearlySaving, 5.88);
  assert.equal(offers[1]?.netFirstYearSaving, 12);
  assert.equal(offers[2]?.netFirstYearSaving, 9.88);
});

test("une economie non certifiable reste derriere une economie nette verifiee", () => {
  const current = mobileExpense({
    monthlyAmount: 9.99,
    yearlyAmount: 119.88,
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 300
  });
  const offers = findAlternativeOffers([current], {
    mobileCatalog: catalog(
      mobileOffer({
        offerName: "300 Go frais inconnus",
        monthlyPrice: 5,
        includedDataGB: 300,
        activationFees: null
      }),
      mobileOffer({ offerName: "500 Go economie certifiee", monthlyPrice: 8.99, includedDataGB: 500 })
    )
  });

  assert.deepEqual(
    offers.map((offer) => offer.name),
    ["500 Go economie certifiee", "300 Go frais inconnus"]
  );
  assert.equal(offers[1]?.netFirstYearSaving, undefined);
  assert.equal(offers[1]?.estimatedYearlySaving, 0);
  assert.equal(offers[1]?.savingKind, "recurring_only");
});

test("a economie egale le meilleur volume de donnees departage les offres", () => {
  const current = mobileExpense({
    monthlyAmount: 9.99,
    yearlyAmount: 119.88,
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 300
  });
  const offers = findAlternativeOffers([current], {
    mobileCatalog: catalog(
      mobileOffer({ offerName: "300 Go", monthlyPrice: 8, includedDataGB: 300 }),
      mobileOffer({ offerName: "500 Go", monthlyPrice: 8, includedDataGB: 500 })
    )
  });

  assert.deepEqual(offers.map((offer) => offer.name), ["500 Go", "300 Go"]);
});

test("une offre 300 Go est un compromis transparent, jamais un équivalent", () => {
  const current = mobileExpense({
    monthlyAmount: 9.99,
    yearlyAmount: 119.88,
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 300
  });
  const [offer] = findAlternativeOffers([current], {
    mobileCatalog: catalog(mobileOffer({
      offerName: "300 Go moins cher",
      monthlyPrice: 8.49,
      includedDataGB: 300
    }))
  });

  assert.equal(offer.comparisonKind, "reduced_data");
  assert.equal(isPrimaryAlternative(offer), false);
  assert.match(offer.reason, /seuil minimum retenu\s*:\s*300 Go/i);
});

test("un forfait illimité sans accord de réduction refuse toutes les offres limitées", () => {
  const offers = findAlternativeOffers([
    mobileExpense({
      mobileDataGB: undefined,
      mobileIncludedDataGB: undefined,
      mobileDataUnlimited: true,
      mobileAllowLowerDataOffers: false
    })
  ], {
    mobileCatalog: catalog(mobileOffer({ monthlyPrice: 5, includedDataGB: 500 }))
  });
  assert.deepEqual(offers, []);
});

test("la consommation NRJ applique une marge de sécurité de 20 pour cent", () => {
  const current = mobileExpense({
    provider: "NRJ Mobile",
    monthlyAmount: 17.49,
    yearlyAmount: 209.88,
    mobileIncludedDataGB: 500,
    mobileConsumedDataGB: 248.99,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: 100
  });
  assert.equal(getMobileComparisonMinimumDataGB(current), 299);

  const offers = findAlternativeOffers([current], {
    mobileCatalog: catalog(
      mobileOffer({ offerName: "250 Go insuffisants", monthlyPrice: 7, includedDataGB: 250 }),
      mobileOffer({ offerName: "300 Go adaptés", monthlyPrice: 9, includedDataGB: 300 })
    )
  });
  assert.deepEqual(offers.map((offer) => offer.name), ["300 Go adaptés"]);
});

test("aucune offre satisfaisante recommande de conserver le forfait actuel", () => {
  const current = mobileExpense({ monthlyAmount: 9.99, yearlyAmount: 119.88 });
  const currentCatalog = catalog(mobileOffer({ monthlyPrice: 12, includedDataGB: 100 }));
  const offers = findAlternativeOffers([current], { mobileCatalog: currentCatalog });
  assert.deepEqual(offers, []);
  assert.match(
    getMobileComparisonMessage(analysisFor(current), currentCatalog, offers) ?? "",
    /forfait actuel reste compétitif/i
  );
});

test("un seuil absent et un catalogue vide ou périmé restent non concluants", () => {
  const missingThreshold = mobileExpense({
    mobileDataGB: undefined,
    mobileIncludedDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: true,
    mobileMinimumDataGB: undefined
  });
  const freshCatalog = catalog(mobileOffer({ monthlyPrice: 5, includedDataGB: 10 }));
  const offers = findAlternativeOffers([missingThreshold], { mobileCatalog: freshCatalog });
  assert.deepEqual(offers, []);
  assert.match(
    getMobileComparisonMessage(analysisFor(missingThreshold), freshCatalog, offers) ?? "",
    /volume minimum/i
  );

  for (const status of ["stale", "empty"] as const) {
    const unavailableCatalog: MobileCatalog = { ...freshCatalog, status, offers: [] };
    assert.match(
      getMobileComparisonMessage(analysisFor(missingThreshold), unavailableCatalog, []) ?? "",
      /comparaison n'est pas concluante/i
    );
  }
});
