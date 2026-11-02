import snapshot from "@/experiments/mobile-offers/snapshots/latest.json";
import type {
  CollectionSnapshot,
  MobileOffer
} from "@/experiments/mobile-offers/types";
import { validateOffer } from "@/experiments/mobile-offers/validate";

export const MOBILE_CATALOG_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export type MobileCatalogStatus = "fresh" | "stale" | "empty";

export type MobileCatalog = {
  offers: MobileOffer[];
  status: MobileCatalogStatus;
  verifiedAt: string | null;
  detectedOffers: number;
  verifiedOffers: number;
  source: "embedded_snapshot";
};

function validDate(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function adaptMobileCatalog(
  input: CollectionSnapshot,
  now = new Date()
): MobileCatalog {
  const detectedOffers = input.results.reduce(
    (total, result) => total + result.offers.length,
    0
  );
  const verified = input.results
    .flatMap((result) => result.offers)
    .filter((offer) => offer.verificationStatus === "VERIFIED")
    .map(validateOffer)
    .filter((offer) => offer.verificationStatus === "VERIFIED");
  const timestamps = verified
    .map((offer) => validDate(offer.verifiedAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const verifiedAt = newestTimestamp === null
    ? null
    : new Date(newestTimestamp).toISOString();

  if (verified.length === 0 || newestTimestamp === null) {
    return {
      offers: [],
      status: "empty",
      verifiedAt,
      detectedOffers,
      verifiedOffers: 0,
      source: "embedded_snapshot"
    };
  }

  const nowTimestamp = now.getTime();
  const freshOffers = verified.filter((offer) => {
    const timestamp = validDate(offer.verifiedAt);
    return timestamp !== null &&
      timestamp <= nowTimestamp + 5 * 60 * 1000 &&
      nowTimestamp - timestamp <= MOBILE_CATALOG_MAX_AGE_MS;
  });

  return {
    offers: freshOffers,
    status: freshOffers.length > 0 ? "fresh" : "stale",
    verifiedAt,
    detectedOffers,
    verifiedOffers: verified.length,
    source: "embedded_snapshot"
  };
}

export function getEmbeddedMobileCatalog(now = new Date()): MobileCatalog {
  return adaptMobileCatalog(snapshot as CollectionSnapshot, now);
}
