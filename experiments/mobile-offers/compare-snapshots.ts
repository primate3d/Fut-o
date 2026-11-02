import { readFile } from "node:fs/promises";
import { normalizeOfferKey } from "./html";
import type {
  CollectionSnapshot,
  MobileOffer,
  OfferChange,
} from "./types";

function offerKey(offer: MobileOffer): string {
  return `${offer.provider}:${normalizeOfferKey(offer.offerName)}`;
}

function allOffers(snapshot: CollectionSnapshot): MobileOffer[] {
  return snapshot.results.flatMap((result) => result.offers);
}

function changed<T>(left: T, right: T): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function compareSnapshots(
  previous: CollectionSnapshot,
  current: CollectionSnapshot,
): OfferChange[] {
  const beforeByKey = new Map(
    allOffers(previous).map((offer) => [offerKey(offer), offer]),
  );
  const afterByKey = new Map(
    allOffers(current).map((offer) => [offerKey(offer), offer]),
  );
  const changes: OfferChange[] = [];

  for (const [key, after] of afterByKey) {
    const before = beforeByKey.get(key);
    if (!before) {
      changes.push({
        type: "NEW",
        provider: after.provider,
        offerName: after.offerName,
        before: null,
        after,
      });
      continue;
    }

    const base = {
      provider: after.provider,
      offerName: after.offerName,
    };
    if (before.monthlyPrice !== after.monthlyPrice) {
      changes.push({
        ...base,
        type: "PRICE_CHANGED",
        before: { monthlyPrice: before.monthlyPrice },
        after: { monthlyPrice: after.monthlyPrice },
      });
    }
    if (
      before.includedDataGB !== after.includedDataGB ||
      before.unlimitedData !== after.unlimitedData ||
      before.euDataGB !== after.euDataGB
    ) {
      changes.push({
        ...base,
        type: "DATA_CHANGED",
        before: {
          includedDataGB: before.includedDataGB,
          unlimitedData: before.unlimitedData,
          euDataGB: before.euDataGB,
        },
        after: {
          includedDataGB: after.includedDataGB,
          unlimitedData: after.unlimitedData,
          euDataGB: after.euDataGB,
        },
      });
    }
    if (
      before.promotionPrice !== after.promotionPrice ||
      before.promotionDuration !== after.promotionDuration ||
      before.priceAfterPromotion !== after.priceAfterPromotion
    ) {
      changes.push({
        ...base,
        type: "PROMOTION_CHANGED",
        before: {
          promotionPrice: before.promotionPrice,
          promotionDuration: before.promotionDuration,
          priceAfterPromotion: before.priceAfterPromotion,
        },
        after: {
          promotionPrice: after.promotionPrice,
          promotionDuration: after.promotionDuration,
          priceAfterPromotion: after.priceAfterPromotion,
        },
      });
    }
    if (
      changed([...before.conditions].sort(), [...after.conditions].sort())
    ) {
      changes.push({
        ...base,
        type: "CONDITIONS_CHANGED",
        before: { conditions: before.conditions },
        after: { conditions: after.conditions },
      });
    }
  }

  for (const [key, before] of beforeByKey) {
    if (!afterByKey.has(key)) {
      changes.push({
        type: "REMOVED",
        provider: before.provider,
        offerName: before.offerName,
        before,
        after: null,
      });
    }
  }

  return changes;
}

async function runCli(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error(
      "Usage: npx tsx compare-snapshots.ts <ancien.json> <nouveau.json>",
    );
  }
  const [beforeContent, afterContent] = await Promise.all([
    readFile(beforePath, "utf8"),
    readFile(afterPath, "utf8"),
  ]);
  const changes = compareSnapshots(
    JSON.parse(beforeContent) as CollectionSnapshot,
    JSON.parse(afterContent) as CollectionSnapshot,
  );
  process.stdout.write(`${JSON.stringify(changes, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("compare-snapshots.ts")) {
  void runCli().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Erreur inconnue"}\n`,
    );
    process.exitCode = 1;
  });
}
