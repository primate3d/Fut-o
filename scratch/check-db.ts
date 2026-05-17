import dotenv from "dotenv";
import path from "path";
// Load env vars
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { db } from "../lib/server/db/index";
import { analyses, documents } from "../lib/server/db/schema";

async function main() {
  console.log("=== CHECKING DOCUMENTS ===");
  const allDocs = await db.select().from(documents);
  console.log(`Found ${allDocs.length} documents.`);
  for (const doc of allDocs) {
    console.log(`- ID: ${doc.id}`);
    console.log(`  File Name: ${doc.fileName}`);
    console.log(`  Mime: ${doc.mimeType}`);
    console.log(`  Provider: ${doc.provider}`);
    console.log(`  Status: ${doc.status}`);
  }

  console.log("\n=== CHECKING ANALYSES ===");
  const allAnalyses = await db.select().from(analyses);
  console.log(`Found ${allAnalyses.length} analyses.`);
  for (const analysis of allAnalyses) {
    console.log(`- ID: ${analysis.id}`);
    console.log(`  Key Code: ${analysis.keyCode}`);
    console.log(`  Generated At: ${analysis.generatedAt}`);
    console.log(`  Total Monthly Amount: ${analysis.totalMonthlyAmount}`);
    console.log(`  Detected Parties:`, JSON.stringify(analysis.detectedParties, null, 2));
    
    // Look at expenses
    const expenses = analysis.expenses as any[];
    console.log(`  Expenses:`);
    for (const exp of expenses) {
      console.log(`    * ${exp.label} | Provider: ${exp.provider} | Monthly: ${exp.monthlyAmount}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
