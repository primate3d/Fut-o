import { eq, sql } from "drizzle-orm";
import { adaptMobileCatalog, getMobileCatalogOfferId, MOBILE_CATALOG_MAX_AGE_MS } from "@/features/recommendations/mobile-catalog";
import type {
  CollectionFailure,
  CollectionSnapshot,
  CollectorResult,
  MobileOffer,
  Provider
} from "@/experiments/mobile-offers/types";
import { validateOffer } from "@/experiments/mobile-offers/validate";
import { db } from "./db/index";
import { mobileCatalogSources } from "./db/schema";
import { RequestError } from "./request-error";

type CatalogDatabase = Pick<typeof db, "select" | "insert" | "update" | "transaction">;

export type MobileCatalogRefreshReport = {
  queriedProviders: number;
  successfulCollections: number;
  failedCollections: number;
  detectedOffers: number;
  verifiedOffers: number;
  partialOffers: number;
  staleOffers: number;
  lastUpdatedAt: string | null;
};

function catalogOffers(offers: MobileOffer[]) {
  return offers.map((offer) => ({
    ...validateOffer(offer),
    catalogId: offer.catalogId ?? getMobileCatalogOfferId(offer)
  }));
}

function syntheticFailure(result: CollectorResult, message: string): CollectionFailure[] {
  return result.failures.length > 0
    ? result.failures
    : [{ code: "CATALOG_NOT_PUBLISHED", message, sourceUrl: result.sourceUrl }];
}

function countVerified(offers: MobileOffer[]) {
  return offers.filter((offer) => offer.verificationStatus === "VERIFIED").length;
}

async function persistResult(
  result: CollectorResult,
  attemptedAt: string,
  executor: Parameters<Parameters<CatalogDatabase["transaction"]>[0]>[0]
) {
  const previous = (await executor
    .select()
    .from(mobileCatalogSources)
    .where(eq(mobileCatalogSources.provider, result.provider)))[0];
  const offers = catalogOffers(result.offers);
  const verifiedCount = countVerified(offers);
  const previousOffers = (previous?.offers ?? []) as MobileOffer[];
  const previousVerifiedCount = countVerified(previousOffers);
  const degraded =
    verifiedCount === 0 ||
    (result.failures.length > 0 && verifiedCount < previousVerifiedCount);

  if (degraded) {
    const errors = syntheticFailure(
      result,
      verifiedCount === 0
        ? "Aucune offre vérifiée; dernier catalogue valide conservé."
        : "Collecte incomplète; dernier catalogue valide conservé."
    );
    if (previous) {
      await executor
        .update(mobileCatalogSources)
        .set({
          lastAttemptAt: attemptedAt,
          lastError: errors,
          updatedAt: attemptedAt
        })
        .where(eq(mobileCatalogSources.provider, result.provider));
    } else {
      await executor.insert(mobileCatalogSources).values({
        provider: result.provider,
        sourceUrl: result.sourceUrl,
        offers: [],
        retrievedAt: result.retrievedAt,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: null,
        lastError: errors,
        updatedAt: attemptedAt
      });
    }
    return false;
  }

  await executor
    .insert(mobileCatalogSources)
    .values({
      provider: result.provider,
      sourceUrl: result.sourceUrl,
      offers,
      retrievedAt: result.retrievedAt,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      lastError: result.failures.length > 0 ? result.failures : null,
      updatedAt: attemptedAt
    })
    .onConflictDoUpdate({
      target: mobileCatalogSources.provider,
      set: {
        sourceUrl: result.sourceUrl,
        offers,
        retrievedAt: result.retrievedAt,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: attemptedAt,
        lastError: result.failures.length > 0 ? result.failures : null,
        updatedAt: attemptedAt
      }
    });
  return true;
}

export async function loadPersistedMobileCatalog(
  now = new Date(),
  database: Pick<typeof db, "select"> = db
) {
  const rows = await database.select().from(mobileCatalogSources);
  const results = rows.map((row) => ({
    provider: row.provider as Provider,
    sourceUrl: row.sourceUrl,
    retrievedAt: row.retrievedAt,
    offers: row.offers as MobileOffer[],
    failures: (row.lastError ?? []) as CollectionFailure[]
  }));
  const snapshot: CollectionSnapshot = {
    schemaVersion: 2,
    retrievedAt:
      rows.map((row) => row.lastSuccessAt).filter(Boolean).sort().at(-1) ?? now.toISOString(),
    results,
    summary: Object.fromEntries(results.map((result) => [result.provider, {
      detected: result.offers.length,
      verified: countVerified(result.offers),
      partial: result.offers.filter((offer) => offer.verificationStatus === "PARTIAL").length,
      failed: result.failures.length
    }])) as CollectionSnapshot["summary"]
  };
  return adaptMobileCatalog(snapshot, now, "postgresql");
}

export async function refreshMobileCatalog(
  collect: () => Promise<CollectorResult[]>,
  now = new Date(),
  database: CatalogDatabase = db
): Promise<MobileCatalogRefreshReport> {
  return database.transaction(async (tx) => {
    const lock = await tx.execute(sql`
      select pg_try_advisory_xact_lock(hashtextextended('mobile-catalog-refresh', 0)) as acquired
    `);
    if (!lock[0]?.acquired) {
      throw new RequestError("Une actualisation du catalogue mobile est déjà en cours.", 409);
    }

    const results = await collect();
    const attemptedAt = now.toISOString();
    let successfulCollections = 0;
    for (const result of results) {
      if (await persistResult(result, attemptedAt, tx)) successfulCollections += 1;
    }

    const rows = await tx.select().from(mobileCatalogSources);
    const storedOffers = rows.flatMap((row) => row.offers as MobileOffer[]);
    const staleOffers = storedOffers.filter((offer) => {
      if (offer.verificationStatus !== "VERIFIED" || !offer.verifiedAt) return false;
      const verifiedAt = Date.parse(offer.verifiedAt);
      return !Number.isFinite(verifiedAt) || now.getTime() - verifiedAt > MOBILE_CATALOG_MAX_AGE_MS;
    }).length;

    return {
      queriedProviders: results.length,
      successfulCollections,
      failedCollections: results.length - successfulCollections,
      detectedOffers: results.reduce((total, result) => total + result.offers.length, 0),
      verifiedOffers: results.reduce(
        (total, result) => total + countVerified(catalogOffers(result.offers)),
        0
      ),
      partialOffers: results.reduce(
        (total, result) => total + catalogOffers(result.offers)
          .filter((offer) => offer.verificationStatus === "PARTIAL").length,
        0
      ),
      staleOffers,
      lastUpdatedAt: rows
        .map((row) => row.lastSuccessAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
    };
  });
}
