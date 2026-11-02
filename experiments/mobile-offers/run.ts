import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectBouyguesOffers } from "./collectors/bouygues";
import { collectFreeOffers } from "./collectors/free";
import { collectRedOffers } from "./collectors/red";
import { compareSnapshots } from "./compare-snapshots";
import type {
  CollectionSnapshot,
  CollectionSummary,
  CollectorResult,
  Provider,
} from "./types";

const PROVIDERS: Provider[] = ["Free Mobile", "RED by SFR", "B&You"];

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
    schemaVersion: 1,
    retrievedAt: new Date().toISOString(),
    results,
    summary,
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

  // Une seule requête officielle par fournisseur.
  const results = await Promise.all([
    collectFreeOffers(),
    collectRedOffers(),
    collectBouyguesOffers(),
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
  await writeFile(latestPath, serialized, "utf8");
  await writeFile(
    changesPath,
    `${JSON.stringify(previous ? compareSnapshots(previous, snapshot) : [], null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`${JSON.stringify(snapshot.summary, null, 2)}\n`);
  process.stdout.write(`Snapshot: ${snapshotPath}\n`);
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Erreur inconnue"}\n`,
  );
  process.exitCode = 1;
});
