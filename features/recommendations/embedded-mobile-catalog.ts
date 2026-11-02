import snapshot from "@/experiments/mobile-offers/snapshots/latest.json";
import type { CollectionSnapshot } from "@/experiments/mobile-offers/types";
import { adaptMobileCatalog } from "./mobile-catalog";

export function getEmbeddedMobileCatalog(now = new Date()) {
  return adaptMobileCatalog(snapshot as CollectionSnapshot, now);
}
