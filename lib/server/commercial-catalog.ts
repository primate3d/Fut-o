import { and, eq, sql } from "drizzle-orm";
import { compareCommercialOffers } from "@/experiments/commercial-catalog/compare";
import type {
  CommercialCollectionFailure,
  CommercialCollectionResult,
  CommercialOffer,
  CommercialOfferChange,
  CommercialSector,
  CommercialSourceDefinition,
  FetchCacheMetadata,
  VerificationStatus,
} from "@/experiments/commercial-catalog/types";
import { db } from "./db/index";
import { commercialCatalogSources } from "./db/schema";
import { RequestError } from "./request-error";

type CatalogDatabase = Pick<typeof db, "select" | "insert" | "update" | "transaction">;
type CatalogTransaction = Parameters<Parameters<CatalogDatabase["transaction"]>[0]>[0];

export const COMMERCIAL_CATALOG_MAX_AGE_MS: Record<CommercialSector, number> = {
  internet: 72 * 60 * 60 * 1000,
  electricity: 7 * 24 * 60 * 60 * 1000,
  gas: 7 * 24 * 60 * 60 * 1000,
  home_insurance: 30 * 24 * 60 * 60 * 1000,
  car_insurance: 30 * 24 * 60 * 60 * 1000,
  health_insurance: 30 * 24 * 60 * 60 * 1000,
};

export type CommercialCatalogRefreshReport = {
  sector: CommercialSector;
  queriedSources: number;
  successfulCollections: number;
  failedCollections: number;
  detectedOffers: number;
  verifiedOffers: number;
  partialOffers: number;
  pendingSources: number;
  changes: CommercialOfferChange[];
  lastUpdatedAt: string | null;
  collectionDurationMs: number;
};

function countStatus(offers: CommercialOffer[], status: VerificationStatus) {
  return offers.filter((offer) => offer.verificationStatus === status).length;
}

function syntheticFailure(
  result: CommercialCollectionResult,
  message: string,
): CommercialCollectionFailure[] {
  return result.failures.length > 0
    ? result.failures
    : [{ code: "CATALOG_NOT_PUBLISHED", message, sourceUrl: result.source.sourceUrl }];
}

async function registerSource(
  source: CommercialSourceDefinition,
  now: string,
  executor: CatalogTransaction,
) {
  const hostname = new URL(source.sourceUrl).hostname;
  await executor.insert(commercialCatalogSources).values({
    id: source.id,
    sector: source.sector,
    provider: source.provider,
    sourceUrl: source.sourceUrl,
    officialHost: hostname,
    sourceStatus: source.approvalStatus,
    parser: source.parser,
    offers: [],
    etag: null,
    lastModified: null,
    contentHash: null,
    retrievedAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    discoveredAt: now,
    approvedAt: source.approvalStatus === "APPROVED" ? now : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: commercialCatalogSources.id,
    set: {
      provider: source.provider,
      sourceUrl: source.sourceUrl,
      officialHost: hostname,
      sourceStatus: source.approvalStatus,
      parser: source.parser,
      approvedAt: source.approvalStatus === "APPROVED"
        ? sql`coalesce(${commercialCatalogSources.approvedAt}, ${now})`
        : null,
      updatedAt: now,
    },
  });
}

async function persistDiscoveredSources(
  result: CommercialCollectionResult,
  executor: CatalogTransaction,
) {
  for (const candidate of result.discoveredSources) {
    await executor.insert(commercialCatalogSources).values({
      id: candidate.id,
      sector: candidate.sector,
      provider: candidate.provider,
      sourceUrl: candidate.sourceUrl,
      officialHost: new URL(candidate.sourceUrl).hostname,
      sourceStatus: "PENDING",
      parser: "unassigned",
      offers: [],
      etag: null,
      lastModified: null,
      contentHash: null,
      retrievedAt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      discoveredAt: candidate.discoveredAt,
      approvedAt: null,
      updatedAt: candidate.discoveredAt,
    }).onConflictDoNothing();
  }
}

async function persistCollection(
  result: CommercialCollectionResult,
  attemptedAt: string,
  executor: CatalogTransaction,
): Promise<{ accepted: boolean; changes: CommercialOfferChange[] }> {
  const previous = (await executor.select().from(commercialCatalogSources)
    .where(eq(commercialCatalogSources.id, result.source.id)))[0];
  await persistDiscoveredSources(result, executor);

  if (result.notModified) {
  const previousOffers = (previous?.offers ?? []) as CommercialOffer[];
  const nowMs = Date.parse(attemptedAt);

  const refreshedOffers = previousOffers.map((offer) => {
    if (
      offer.verificationStatus !== "VERIFIED" ||
      !offer.verifiedAt ||
      !Number.isFinite(nowMs) ||
      !Number.isFinite(Date.parse(offer.verifiedAt))
    ) {
      return offer;
    }

    const validFrom = offer.validFrom
      ? Date.parse(offer.validFrom)
      : null;

    const validUntil = offer.validUntil
      ? Date.parse(offer.validUntil)
      : null;

    if (
      (validFrom !== null &&
        (!Number.isFinite(validFrom) || validFrom > nowMs)) ||
      (validUntil !== null &&
        (!Number.isFinite(validUntil) || validUntil < nowMs))
    ) {
      return offer;
    }

    // Prudence : ne pas prolonger automatiquement un tarif
    // énergétique indexé sans date de fin vérifiable.
    const indexedEnergyWithoutExpiry =
      (offer.sector === "electricity" || offer.sector === "gas") &&
      "pricingMode" in offer &&
      offer.pricingMode === "INDEXED" &&
      !offer.validUntil;

    if (indexedEnergyWithoutExpiry) {
      return offer;
    }

    return {
      ...offer,
      verifiedAt: attemptedAt,
    };
  });

  await executor.update(commercialCatalogSources).set({
    offers: refreshedOffers,
    lastAttemptAt: attemptedAt,
    lastError: null,
    updatedAt: attemptedAt,
  }).where(eq(commercialCatalogSources.id, result.source.id));

  return { accepted: true, changes: [] };
}


  const previousOffers = (previous?.offers ?? []) as CommercialOffer[];
  const verifiedCount = countStatus(result.offers, "VERIFIED");
  const previousVerifiedCount = countStatus(previousOffers, "VERIFIED");
  const degraded = verifiedCount === 0 ||
    (result.failures.length > 0 && verifiedCount < previousVerifiedCount);

  if (degraded) {
    const errors = syntheticFailure(
      result,
      verifiedCount === 0
        ? "Aucune offre verifiee; dernier catalogue valide conserve."
        : "Collecte incomplete; dernier catalogue valide conserve.",
    );
    await executor.update(commercialCatalogSources).set({
      offers: previousOffers.length > 0 ? previousOffers : result.offers,
      retrievedAt: previous?.retrievedAt ?? result.retrievedAt,
      lastAttemptAt: attemptedAt,
      lastError: errors,
      updatedAt: attemptedAt,
    }).where(eq(commercialCatalogSources.id, result.source.id));
    return { accepted: false, changes: [] };
  }

  const changes = compareCommercialOffers(previousOffers, result.offers);
  await executor.update(commercialCatalogSources).set({
    offers: result.offers,
    etag: result.cache.etag,
    lastModified: result.cache.lastModified,
    contentHash: result.cache.contentHash,
    retrievedAt: result.retrievedAt,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: attemptedAt,
    lastError: result.failures.length > 0 ? result.failures : null,
    updatedAt: attemptedAt,
  }).where(eq(commercialCatalogSources.id, result.source.id));
  return { accepted: true, changes };
}

export function filterFreshCommercialOffers(
  offers: CommercialOffer[],
  sector: CommercialSector,
  now = new Date(),
) {
  const maxAge = COMMERCIAL_CATALOG_MAX_AGE_MS[sector];
  return offers.filter((offer) => {
    if (offer.sector !== sector || offer.verificationStatus !== "VERIFIED" || !offer.verifiedAt) {
      return false;
    }
    const verifiedAt = Date.parse(offer.verifiedAt);
    if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime() + 5 * 60 * 1000) return false;
    if (now.getTime() - verifiedAt > maxAge) return false;
    if (offer.validFrom && Date.parse(offer.validFrom) > now.getTime()) return false;
    if (offer.validUntil && Date.parse(offer.validUntil) < now.getTime()) return false;
    return true;
  });
}

export async function loadCommercialCatalog(
  sector: CommercialSector,
  now = new Date(),
  database: Pick<typeof db, "select"> = db,
) {
  const rows = await database.select().from(commercialCatalogSources).where(and(
    eq(commercialCatalogSources.sector, sector),
    eq(commercialCatalogSources.sourceStatus, "APPROVED"),
  ));
  const storedOffers = rows.flatMap((row) => row.offers as CommercialOffer[]);
  const offers = filterFreshCommercialOffers(storedOffers, sector, now);
  const hadVerifiedOffers = storedOffers.some(
    (offer) => offer.verificationStatus === "VERIFIED",
  );
  return {
    sector,
    offers,
    status: offers.length > 0 ? "fresh" as const : hadVerifiedOffers ? "stale" as const : "empty" as const,
    verifiedAt: offers.map((offer) => offer.verifiedAt).filter(Boolean).sort().at(-1) ?? null,
    sources: rows.length,
  };
}

export async function refreshCommercialCatalog(
  sector: CommercialSector,
  sources: CommercialSourceDefinition[],
  collect: (
    source: CommercialSourceDefinition,
    previousCache: Partial<FetchCacheMetadata>,
  ) => Promise<CommercialCollectionResult>,
  now = new Date(),
  database: CatalogDatabase = db,
): Promise<CommercialCatalogRefreshReport> {
  if (sources.some((source) => source.sector !== sector || source.approvalStatus !== "APPROVED")) {
    throw new RequestError("Toutes les sources doivent etre approuvees pour le secteur demande.", 400);
  }
  return database.transaction(async (tx) => {
    const lock = await tx.execute(sql`
      select pg_try_advisory_xact_lock(hashtextextended(${`commercial-catalog-refresh:${sector}`}, 0)) as acquired
    `);
    if (!lock[0]?.acquired) {
      throw new RequestError(`Une actualisation du catalogue ${sector} est deja en cours.`, 409);
    }

    const attemptedAt = now.toISOString();
    let successfulCollections = 0;
    let detectedOffers = 0;
    let verifiedOffers = 0;
    let partialOffers = 0;
    let collectionDurationMs = 0;
    const changes: CommercialOfferChange[] = [];
    for (const source of sources) {
      await registerSource(source, attemptedAt, tx);
      const previous = (await tx.select().from(commercialCatalogSources)
        .where(eq(commercialCatalogSources.id, source.id)))[0];
      const collectionStartedAt = performance.now();
      const result = await collect(source, {
        etag: previous?.etag,
        lastModified: previous?.lastModified,
        contentHash: previous?.contentHash,
      });
      collectionDurationMs += performance.now() - collectionStartedAt;
      detectedOffers += result.offers.length;
      verifiedOffers += countStatus(result.offers, "VERIFIED");
      partialOffers += countStatus(result.offers, "PARTIAL");
      const persisted = await persistCollection(result, attemptedAt, tx);
      if (persisted.accepted) successfulCollections += 1;
      changes.push(...persisted.changes);
    }

    const rows = await tx.select().from(commercialCatalogSources)
      .where(eq(commercialCatalogSources.sector, sector));
    return {
      sector,
      queriedSources: sources.length,
      successfulCollections,
      failedCollections: sources.length - successfulCollections,
      detectedOffers,
      verifiedOffers,
      partialOffers,
      pendingSources: rows.filter((row) => row.sourceStatus === "PENDING").length,
      changes,
      lastUpdatedAt: rows.map((row) => row.lastSuccessAt)
        .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      collectionDurationMs: Math.round(collectionDurationMs),
    };
  });
}
