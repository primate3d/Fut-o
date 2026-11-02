import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectBouyguesOffers } from "./collectors/bouygues";
import { collectCdiscountOffers } from "./collectors/cdiscount";
import { collectFreeOffers } from "./collectors/free";
import { collectNrjOffers } from "./collectors/nrj";
import { collectOrangeOffers } from "./collectors/orange";
import { collectPrixtelOffers } from "./collectors/prixtel";
import { collectRedOffers } from "./collectors/red";
import { collectSfrOffers } from "./collectors/sfr";
import { collectSoshOffers } from "./collectors/sosh";
import { compareSnapshots } from "./compare-snapshots";
import type {
  CollectionSnapshot,
  CollectionSummary,
  CollectorResult,
  Provider,
} from "./types";

const PROVIDERS: Provider[] = [
  "Free Mobile",
  "RED by SFR",
  "B&You",
  "Orange",
  "Sosh",
  "SFR",
  "Prixtel",
  "NRJ Mobile",
  "Cdiscount Mobile",
];

function summarize(result: CollectorResult): CollectionSummary {
  return {
    detected: result.offers.length,
    verified: result.offers.filter(
      (offer) => offer.verificationStatus === "VERIFIED",
    ).length,
    partial: result.offers.filter(
      (offer) => offer.verificationStatus === "PARTIAL",
    ).length,
    failed:
      result.failures.length +
      result.offers.filter((offer) => offer.verificationStatus === "FAILED")
        .length,
  };
}

function buildSnapshot(results: CollectorResult[]): CollectionSnapshot {
  const summary = Object.fromEntries(
    PROVIDERS.map((provider) => {
      const result = results.find((item) => item.provider === provider);
      if (!result) throw new Error(`Collecteur absent: ${provider}`);
      return [provider, summarize(result)];
    }),
  ) as Record<Provider, CollectionSummary>;

  return {
    schemaVersion: 2,
    retrievedAt: new Date().toISOString(),
    results,
    summary,
  };
}

export function resultIsDegraded(
  previous: CollectionSnapshot,
  currentResult: CollectorResult,
): boolean {
  const previousResult = previous.results.find(
    (result) => result.provider === currentResult.provider,
  );
  if (!previousResult || currentResult.failures.length === 0) return false;
  const previousVerified = previousResult.offers.filter(
    (offer) => offer.verificationStatus === "VERIFIED",
  ).length;
  const currentVerified = currentResult.offers.filter(
    (offer) => offer.verificationStatus === "VERIFIED",
  ).length;
  return (
    (previousResult.offers.length > 0 && currentResult.offers.length === 0) ||
    currentVerified < previousVerified
  );
}

function snapshotForComparison(
  previous: CollectionSnapshot,
  current: CollectionSnapshot,
): CollectionSnapshot {
  return {
    ...current,
    results: current.results.map((result) => {
      if (!resultIsDegraded(previous, result)) return result;
      return previous.results.find((item) => item.provider === result.provider) ?? result;
    }),
  };
}

async function loadPrevious(filePath: string): Promise<CollectionSnapshot | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as CollectionSnapshot;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function run(): Promise<void> {
  if (!process.argv.includes("--live")) {
    throw new Error(
      "Collecte réseau désactivée par défaut. Utilisez --live explicitement.",
    );
  }

  // Une page par marque, sauf Prixtel qui publie les paliers sur quatre pages.
  const results = await Promise.all([
    collectFreeOffers(),
    collectRedOffers(),
    collectBouyguesOffers(),
    collectOrangeOffers(),
    collectSoshOffers(),
    collectSfrOffers(),
    collectPrixtelOffers(),
    collectNrjOffers(),
    collectCdiscountOffers(),
  ]);
  const snapshot = buildSnapshot(results);
  const snapshotsDir = path.resolve(
    process.cwd(),
    "experiments",
    "mobile-offers",
    "snapshots",
  );
  const latestPath = path.join(snapshotsDir, "latest.json");
  const previous = await loadPrevious(latestPath);
  const fileStamp = snapshot.retrievedAt.replace(/[:.]/g, "-");
  const snapshotPath = path.join(snapshotsDir, `${fileStamp}.json`);
  const changesPath = path.join(snapshotsDir, `${fileStamp}.changes.json`);

  await mkdir(snapshotsDir, { recursive: true });
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(snapshotPath, serialized, "utf8");
  const canPromoteLatest =
    !previous || !results.some((result) => resultIsDegraded(previous, result));
  if (canPromoteLatest) {
    await writeFile(latestPath, serialized, "utf8");
  }
  const comparableSnapshot = previous
    ? snapshotForComparison(previous, snapshot)
    : snapshot;
  await writeFile(
    changesPath,
    `${JSON.stringify(previous ? compareSnapshots(previous, comparableSnapshot) : [], null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`${JSON.stringify(snapshot.summary, null, 2)}\n`);
  process.stdout.write(`Snapshot: ${snapshotPath}\n`);
  if (!canPromoteLatest) {
    process.stdout.write(
      "latest.json conservé: au moins une source précédemment fiable est dégradée.\n",
    );
  }
}

if (process.argv[1]?.endsWith("run.ts")) {
  void run().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Erreur inconnue"}\n`,
    );
    process.exitCode = 1;
  });
}
