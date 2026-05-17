import { db } from "../lib/server/db/index";
import { analyses, documents, accessKeys } from "../lib/server/db/schema";

async function main() {
  try {
    console.log("--- ACCESS KEYS ---");
    const keys = await db.select().from(accessKeys);
    console.log(JSON.stringify(keys, null, 2));

    console.log("\n--- DOCUMENTS ---");
    const docs = await db.select().from(documents);
    console.log(JSON.stringify(docs.map(d => ({ id: d.id, keyCode: d.keyCode, fileName: d.fileName, status: d.status, provider: d.provider })), null, 2));

    console.log("\n--- ANALYSES ---");
    const anals = await db.select().from(analyses);
    console.log(JSON.stringify(anals.map(a => ({
      id: a.id,
      keyCode: a.keyCode,
      generatedAt: a.generatedAt,
      totalMonthlyAmount: a.totalMonthlyAmount,
      detectedParties: a.detectedParties,
      expenses: a.expenses
    })), null, 2));
  } catch (error) {
    console.error("DB Query error:", error);
  }
  process.exit(0);
}

main();
