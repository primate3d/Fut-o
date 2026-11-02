import * as dotenv from "dotenv";
import { collectAllProviders } from "../experiments/mobile-offers/run";

dotenv.config({ path: ".env.local" });

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  const { refreshMobileCatalog } = await import("../lib/server/mobile-catalog");
  const { client } = await import("../lib/server/db/index");
  try {
    const report = await refreshMobileCatalog(collectAllProviders);
    process.stdout.write([
      "Actualisation du catalogue mobile terminée.",
      `Opérateurs interrogés : ${report.queriedProviders}`,
      `Collectes réussies : ${report.successfulCollections}`,
      `Collectes échouées : ${report.failedCollections}`,
      `Offres détectées : ${report.detectedOffers}`,
      `Offres vérifiées : ${report.verifiedOffers}`,
      `Offres partielles : ${report.partialOffers}`,
      `Offres périmées : ${report.staleOffers}`,
      `Dernière mise à jour : ${report.lastUpdatedAt ?? "aucune"}`,
      ""
    ].join("\n"));
  } finally {
    await client.end({ timeout: 5 });
  }
}

void run()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Erreur inconnue"}\n`);
    process.exitCode = 1;
  });
