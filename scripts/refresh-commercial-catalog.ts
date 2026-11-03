import * as dotenv from "dotenv";
import { OpenAiCommercialInterpreter } from "../experiments/commercial-catalog/ai";
import { collectCommercialSource } from "../experiments/commercial-catalog/collector";
import { getApprovedSources } from "../experiments/commercial-catalog/source-registry";
import { COMMERCIAL_SECTORS, type CommercialSector } from "../experiments/commercial-catalog/types";

dotenv.config({ path: ".env.local" });

async function run() {
  if (!process.argv.includes("--live")) {
    throw new Error("Collecte reseau desactivee. Ajoutez --live explicitement.");
  }
  const sectorArgument = process.argv.find((argument) => argument.startsWith("--sector="));
  const sector = sectorArgument?.split("=")[1];
  if (!COMMERCIAL_SECTORS.includes(sector as CommercialSector) || sector === "health_insurance") {
    throw new Error("Secteur invalide. Utilisez internet, electricity, gas, home_insurance ou car_insurance.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not defined");

  const aiEnabled = process.env.COMMERCIAL_CATALOG_AI_ENABLED === "1";
  if (aiEnabled && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY est requise lorsque le secours IA est active.");
  }
  const maxAiCalls = Number.parseInt(process.env.COMMERCIAL_CATALOG_AI_MAX_CALLS ?? "10", 10);
  if (!Number.isInteger(maxAiCalls) || maxAiCalls < 0) {
    throw new Error("COMMERCIAL_CATALOG_AI_MAX_CALLS doit etre un entier positif.");
  }
  const interpreter = aiEnabled
    ? new OpenAiCommercialInterpreter(
        process.env.OPENAI_API_KEY!,
        process.env.COMMERCIAL_CATALOG_AI_MODEL ?? "gpt-5.4-mini",
        maxAiCalls,
      )
    : undefined;
  const aiInputRate = Number.parseFloat(process.env.COMMERCIAL_CATALOG_AI_INPUT_USD_PER_MILLION ?? "0");
  const aiOutputRate = Number.parseFloat(process.env.COMMERCIAL_CATALOG_AI_OUTPUT_USD_PER_MILLION ?? "0");
  const selectedSector = sector as CommercialSector;
  const sources = getApprovedSources(selectedSector);
  const knownUrls = sources.map((source) => source.sourceUrl);
  const { refreshCommercialCatalog } = await import("../lib/server/commercial-catalog");
  const { client } = await import("../lib/server/db/index");
  try {
    const report = await refreshCommercialCatalog(
      selectedSector,
      sources,
      (source, previousCache) => collectCommercialSource(source, knownUrls, {
        previousCache,
        interpreter: selectedSector === "internet" ? interpreter : undefined,
      }),
    );
    const usage = interpreter?.getUsage();
    const estimatedAiCost = usage && Number.isFinite(aiInputRate) && Number.isFinite(aiOutputRate)
      ? (usage.inputTokens * aiInputRate + usage.outputTokens * aiOutputRate) / 1_000_000
      : 0;
    process.stdout.write([
      "Actualisation du catalogue commercial terminee.",
      `Secteur : ${report.sector}`,
      `Sources interrogees : ${report.queriedSources}`,
      `Collectes acceptees : ${report.successfulCollections}`,
      `Collectes degradees : ${report.failedCollections}`,
      `Offres detectees : ${report.detectedOffers}`,
      `Offres verifiees : ${report.verifiedOffers}`,
      `Offres partielles : ${report.partialOffers}`,
      `Sources en attente : ${report.pendingSources}`,
      `Modifications detectees : ${report.changes.length}`,
      `Derniere mise a jour : ${report.lastUpdatedAt ?? "aucune"}`,
      `Duree de collecte : ${report.collectionDurationMs} ms`,
      usage
        ? `IA : ${usage.calls} appel(s), ${usage.inputTokens} tokens entree, ${usage.outputTokens} tokens sortie`
        : "IA : desactivee",
      usage ? `Cout IA estime : ${estimatedAiCost.toFixed(6)} USD` : "Cout IA estime : 0 USD",
      "",
    ].join("\n"));
  } finally {
    await client.end({ timeout: 5 });
  }
}

void run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Erreur inconnue"}\n`);
  process.exitCode = 1;
});
