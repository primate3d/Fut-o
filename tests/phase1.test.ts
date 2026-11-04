import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import snapshot from "../drizzle/meta/0000_snapshot.json";
import { householdDocuments, aiHouseholdPayload, emptyAnalysis } from "./fixtures/household";
import {
  MOBILE_CATALOG_FIXTURE_NOW,
  mobileCatalogSnapshotFixture
} from "./fixtures/mobile-catalog";
import { registerE2eWorkflows } from "./e2e-workflows.test";
import {
  ExpenseCategory,
  ExpenseSubcategory,
  type Expense,
  type GeneratedLetter,
  type MockAnalysis,
  type UploadedDocument
} from "../types";
import { jsPDF } from "jspdf";
import type Stripe from "stripe";
import { adaptMobileCatalog } from "../features/recommendations/mobile-catalog";

let pg: EmbeddedPostgres;
let sql: ReturnType<typeof postgres>;
let repo: typeof import("../lib/server/db");
let free: typeof import("../lib/server/free-access");
let root: string;
let aiServer: http.Server;
let aiReply: unknown = aiHouseholdPayload();
let aiRequests = 0;
const aiRequestBodies: unknown[] = [];
let aiWait: Promise<void> | undefined;
let onAiStarted: (() => void) | undefined;
const fakeKey = (code = randomUUID().toUpperCase()) => ({
  id: randomUUID(), code, plan: "foyer" as const, usesRemaining: 10,
  isActive: true, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  allowedNames: ["DUPONT"], profilePostalAddress: "1 rue Exemple 75001 Paris", profileLockedAt: new Date().toISOString()
});
const legacyFreeAccessCode = "FUTEO-LEGACY-EXPIRED";
const legacyDuplicateCode = "FUTEO-LEGACY-DUPLICATE";

function getTestMobileCatalog() {
  return adaptMobileCatalog(
    mobileCatalogSnapshotFixture,
    MOBILE_CATALOG_FIXTURE_NOW
  );
}

function paidSession(id: string, planId: "foyer" | "famille" = "foyer") {
  return {
    id,
    payment_status: "paid",
    customer_details: { email: "paid@example.invalid" },
    metadata: { planId, planName: planId === "famille" ? "Audit Famille" : "Audit Foyer" }
  } as unknown as Stripe.Checkout.Session;
}

function analysisWithProvider(code: string, provider: string): MockAnalysis {
  return {
    ...emptyAnalysis(code),
    expenses: [{
      id: `expense_${code}`,
      label: `Contrat ${provider}`,
      provider,
      category: ExpenseCategory.ENERGY,
      isRecurring: true,
      monthlyAmount: 100,
      yearlyAmount: 1200,
      documentType: "electricity_invoice",
      recurrence: "monthly"
    }],
    totalMonthlyAmount: 100,
    totalYearlyAmount: 1200
  };
}

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "futeo-phase1-"));
  const port = await availablePort();
  const password = randomUUID();
  pg = new EmbeddedPostgres({ databaseDir: path.join(root, "pg"), port, user: "postgres", password,
    persistent: true, onLog: () => {}, onError: () => {}, postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("phase1_test");
  process.env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/phase1_test`;
  process.env.UPLOADS_DIR = path.join(root, "uploads");
  process.env.FUTEO_LOCAL_E2E = "0";
  process.env.OPENAI_API_KEY = "local-test-only";
  process.env.STRIPE_SECRET_KEY = "sk_test_phase15";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_phase15";
  aiServer = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    aiRequestBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    aiRequests++;
    onAiStarted?.();
    if (aiWait) await aiWait;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(aiReply) } }] }));
  });
  await new Promise<void>((resolve) => aiServer.listen(0, "127.0.0.1", resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(aiServer.address() as net.AddressInfo).port}/v1`;
  sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  // Recreate the checked-in pre-migration schema on a disposable local cluster.
  for (const table of Object.values(snapshot.tables)) {
    const columns = Object.values(table.columns).map((column) => `"${column.name}" ${column.type}${column.primaryKey ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${"default" in column ? ` DEFAULT ${column.default}` : ""}`);
    const unique = Object.values(table.uniqueConstraints).map((constraint) => `CONSTRAINT "${constraint.name}" UNIQUE (${constraint.columns.map((name) => `"${name}"`).join(",")})`);
    await sql.unsafe(`CREATE TABLE "${table.name}" (${[...columns, ...unique].join(",")})`);
  }
  const legacyCreatedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  const legacyExpiresAt = new Date(Date.now() - 86400000).toISOString();
  await sql`insert into access_keys (id, code, plan, uses_remaining, expires_at, is_active, created_at)
    values (${randomUUID()}, ${legacyFreeAccessCode}, 'decouverte', 1, ${legacyExpiresAt}, true, ${legacyCreatedAt})`;
  await sql`insert into access_keys (id, code, plan, uses_remaining, expires_at, is_active, created_at)
    values (${randomUUID()}, ${legacyDuplicateCode}, 'decouverte', 1, ${legacyExpiresAt}, true, ${new Date(Date.parse(legacyCreatedAt) + 1000).toISOString()})`;
  await sql`insert into free_trials (id, email, key_code, used_at, created_at)
    values (${randomUUID()}, ' Legacy@Example.INVALID ', ${legacyFreeAccessCode}, ${legacyCreatedAt}, ${legacyCreatedAt})`;
  await sql`insert into free_trials (id, email, key_code, used_at, created_at)
    values (${randomUUID()}, 'legacy@example.invalid', ${legacyDuplicateCode}, ${legacyCreatedAt}, ${new Date(Date.parse(legacyCreatedAt) + 1000).toISOString()})`;
  for (const statement of (await fs.readFile("drizzle/0001_phase1_security.sql", "utf8")).split("--> statement-breakpoint")) {
    await sql.unsafe(statement);
  }
  await sql.unsafe(await fs.readFile("drizzle/0002_mobile_catalog.sql", "utf8"));
  for (const statement of (await fs.readFile("drizzle/0003_commercial_catalog.sql", "utf8")).split("--> statement-breakpoint")) {
    await sql.unsafe(statement);
  }
  repo = await import("../lib/server/db");
  free = await import("../lib/server/free-access");
}, { timeout: 120000 });

after(async () => {
  if (aiServer) { aiServer.closeAllConnections(); await new Promise<void>((resolve) => aiServer.close(() => resolve())); }
  if (repo) await (await import("../lib/server/db/index")).client.end({ timeout: 2 });
  if (sql) await sql.end({ timeout: 2 });
  if (pg && root) {
    const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
    const { pg_ctl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
    await promisify(execFile)(pg_ctl, ["-D", path.join(root, "pg"), "stop", "-m", "fast", "-w"], { windowsHide: true });
  }
  // Only remove the directory created by this test run, after its server has stopped.
  if (root && path.basename(root).startsWith("futeo-phase1-") && path.dirname(root) === os.tmpdir()) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("one allocation and one email for two concurrent normalized email requests", async () => {
  let sends = 0;
  const send = async () => { sends++; await new Promise((resolve) => setTimeout(resolve, 100)); return { success: true }; };
  const results = await Promise.allSettled([
    free.requestFreeAccess(" Simultaneous@example.invalid ", send),
    free.requestFreeAccess("simultaneous@EXAMPLE.invalid", send)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(sends, 1);
  const rows = await sql`select * from free_trials where email = 'simultaneous@example.invalid'`;
  assert.equal(rows.length, 1);
  const keys = await sql`select * from access_keys where code = ${rows[0].key_code}`;
  assert.equal(keys.length, 1);
  assert.match(keys[0].code, /^FUTEO-DECOUVERTE-[A-F0-9]{32}$/);
  assert.equal(keys[0].uses_remaining, 1);
  assert.ok(Math.abs(Date.parse(keys[0].expires_at) - Date.parse(keys[0].created_at) - 7 * 86400000) < 1000);
});

test("failed delivery retries the same key and expiration; scopes remain independent", async () => {
  const codes: string[] = [];
  await assert.rejects(free.requestFreeAccess("retry@example.invalid", async (_email, code) => { codes.push(code); return { success: false }; }));
  const [first] = await sql`select k.* from access_keys k join free_trials f on f.key_code=k.code where f.email='retry@example.invalid'`;
  await free.requestFreeAccess("retry@example.invalid", async (_email, code) => { codes.push(code); return { success: true }; });
  assert.equal(codes[0], codes[1]);
  assert.equal((await repo.findKeyByCode(codes[0]))!.expiresAt, first.expires_at);
  await free.requestFreeAccess("retry@example.invalid", async () => ({ success: true }), "isolated-test-scope");
  assert.equal((await sql`select * from free_trials where email='retry@example.invalid'`).length, 2);
});

test("activation is idempotent, keeps expiration and refuses expired/inactive keys", async () => {
  const key = fakeKey(); await repo.saveKey(key);
  const first = await repo.activateStoredKey(key.code);
  const second = await repo.activateStoredKey(key.code);
  assert.equal(first.expiresAt, key.expiresAt);
  assert.equal(second.activatedAt, first.activatedAt);
  assert.equal(second.usesRemaining, 10);
  await assert.rejects(sql`update access_keys set expires_at=${new Date(Date.now()+30*86400000).toISOString()} where code=${key.code}`);
  for (const key of [{ ...fakeKey(), isActive: false }, { ...fakeKey(), expiresAt: new Date(Date.now()-1000).toISOString() }]) {
    await repo.saveKey(key);
    await assert.rejects(repo.activateStoredKey(key.code));
  }
});

async function uploadRequest(
  code: string,
  id: string,
  content?: File,
  fixtureId = id,
  replacementBatchId?: string
) {
  const { POST } = await import("../app/api/documents/route");
  const fixture = householdDocuments.find((doc) => doc.id === fixtureId) ?? householdDocuments[3];
  const pdf = new jsPDF();
  pdf.text(fixture.extractedText, 10, 15);
  const file = content ?? new File([pdf.output("arraybuffer")], `${id}.pdf`, { type: "application/pdf" });
  const form = new FormData();
  form.set("code", code);
  form.set("document", JSON.stringify({ ...fixture, id }));
  form.set("file", file);
  if (replacementBatchId) form.set("replacementBatchId", replacementBatchId);
  return POST(new Request("http://local.test/api/documents", { method: "POST", body: form }));
}

async function replaceDocumentsRequest(
  code: string,
  replacementAction: "commit" | "rollback",
  replacementBatchId: string,
  replacementDocumentIds?: string[]
) {
  const { DELETE } = await import("../app/api/documents/route");
  return DELETE(new Request("http://local.test/api/documents", {
    method: "DELETE",
    body: JSON.stringify({
      code,
      replacementAction,
      replacementBatchId,
      replacementDocumentIds
    })
  }));
}

function analysisRequest(code: string, documents: unknown[]) {
  return new Request("http://local.test/api/analyse", { method: "POST", body: JSON.stringify({ code, documents, force: true }) });
}

function incrementalAnalysisRequest(code: string, documents: unknown[]) {
  return new Request("http://local.test/api/analyse", {
    method: "POST",
    body: JSON.stringify({ code, documents, incremental: true })
  });
}

function manualAnalysisRequest(
  code: string,
  overrides: Record<string, unknown> = {}
) {
  return new Request("http://local.test/api/analyse", {
    method: "POST",
    body: JSON.stringify({
      code,
      manualContract: {
        requestId: randomUUID(),
        provider: "EDF",
        documentType: "electricity_invoice",
        amount: 120,
        frequency: "monthly",
        clientFirstName: "Jean",
        clientLastName: "DUPONT",
        clientAddress: "1 rue Exemple 75001 Paris",
        customerNumber: "CLIENT-123",
        contractNumber: "CONTRAT-123",
        invoiceNumber: "FACTURE-123",
        phone: "0102030405",
        email: "jean.dupont@example.invalid",
        providerAddress: "Service clients EDF",
        ...overrides
      }
    })
  });
}

function remapAiPayload(fixturesToDocumentIds: Record<string, string>) {
  const fixtureIds = Object.keys(fixturesToDocumentIds);
  const payload = aiHouseholdPayload(fixtureIds);
  return {
    ...payload,
    detectedParties: {
      ...payload.detectedParties,
      documents: Object.fromEntries(Object.entries(payload.detectedParties.documents).map(([fixtureId, document]) => {
        const documentId = fixturesToDocumentIds[fixtureId];
        return [documentId, { ...document, documentId }];
      }))
    },
    expenses: payload.expenses.map((expense) => ({
      ...expense,
      sourceDocumentId: fixturesToDocumentIds[expense.sourceDocumentId]
    }))
  };
}

function pdfFile(name: string, text: string) {
  const pdf = new jsPDF();
  pdf.text(text, 10, 15);
  return new File([pdf.output("arraybuffer")], name, { type: "application/pdf" });
}

const macifThreeContractText = `${householdDocuments[1].extractedText}\nCotisation TTC 360,00 EUR\nVotre prevoyance`;

test("server validates uploads and derives size/MIME from real bytes", async () => {
  const key = fakeKey(); await repo.saveKey(key);
  const response = await uploadRequest(key.code, "mobile");
  assert.equal(response.status, 200);
  const doc = (await response.json()).document;
  assert.equal(doc.mimeType, "application/pdf");
  assert.ok(doc.fileSize > 100);
  const { storage } = await import("../lib/server/storage");
  assert.equal((await storage.get(doc.physicalFileName))!.length, doc.fileSize);
  for (const [file, status] of [
    [new File(["not a PDF"], "fake.pdf", { type: "application/pdf" }), 415],
    [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }), 413],
    [new File(["%PDF-1.4"], "../escape.pdf", { type: "application/pdf" }), 403]
  ] as const) assert.equal((await uploadRequest(key.code, "invalid", file)).status, status);
});

test("cross-household document ID cannot overwrite metadata or files", async () => {
  const owner = fakeKey(), attacker = fakeKey(); await repo.saveKey(owner); await repo.saveKey(attacker);
  const id = randomUUID(); assert.equal((await uploadRequest(owner.code, id)).status, 200);
  const before = await repo.getDocumentsByKey(owner.code);
  assert.equal((await uploadRequest(attacker.code, id)).status, 403);
  assert.deepEqual(await repo.getDocumentsByKey(owner.code), before);
  assert.equal((await repo.getDocumentsByKey(attacker.code)).length, 0);
});

test("concurrent uploads preserve both documents after retrying the busy request", async () => {
  const key = fakeKey(); await repo.saveKey(key);
  const ids = [randomUUID(), randomUUID()];
  const responses = await Promise.all(ids.map((id) => uploadRequest(key.code, id)));
  for (let i = 0; i < responses.length; i++) {
    assert.ok([200, 409].includes(responses[i].status));
    if (responses[i].status === 409) assert.equal((await uploadRequest(key.code, ids[i])).status, 200);
  }
  assert.equal((await repo.getDocumentsByKey(key.code)).length, 2);
});

test("replacement stays hidden and preserves the current audit when an import fails", async () => {
  const { GET } = await import("../app/api/documents/route");
  const { storage } = await import("../lib/server/storage");
  const key = fakeKey();
  await repo.saveKey(key);
  const oldId = randomUUID();
  const oldDocument = ((await (await uploadRequest(key.code, oldId)).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  await repo.saveAnalysis(key.code, analysisWithProvider(key.code, "EDF"));

  const batchId = randomUUID();
  const stagedId = randomUUID();
  const stagedDocument = ((await (await uploadRequest(
    key.code,
    stagedId,
    undefined,
    "mobile",
    batchId
  )).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  const invalidUpload = await uploadRequest(
    key.code,
    randomUUID(),
    new File(["not a PDF"], "invalid.pdf", { type: "application/pdf" }),
    "mobile",
    batchId
  );
  assert.equal(invalidUpload.status, 415);

  const visibleResponse = await GET(new Request("http://local.test/api/documents", {
    headers: { "x-futeo-access-key": key.code }
  }));
  const visibleDocuments = ((await visibleResponse.json()) as {
    documents: UploadedDocument[];
  }).documents;
  assert.deepEqual(visibleDocuments.map((document) => document.id), [oldId]);
  assert.ok(await repo.getAnalysisByKey(key.code));
  const { POST: analyze } = await import("../app/api/analyse/route");
  const quotaBeforeRejectedStage = (await repo.findKeyByCode(key.code))!.usesRemaining;
  assert.equal(
    (await analyze(analysisRequest(key.code, [stagedDocument]))).status,
    403
  );
  assert.equal(
    (await repo.findKeyByCode(key.code))!.usesRemaining,
    quotaBeforeRejectedStage
  );

  assert.equal((await replaceDocumentsRequest(
    key.code,
    "commit",
    batchId,
    [stagedId, randomUUID()]
  )).status, 409);
  assert.ok(await repo.getAnalysisByKey(key.code));
  assert.ok(await storage.get(oldDocument.physicalFileName));

  assert.equal((await replaceDocumentsRequest(
    key.code,
    "rollback",
    batchId
  )).status, 200);
  assert.deepEqual(
    (await repo.getDocumentsByKey(key.code)).map((document) => document.id),
    [oldId]
  );
  assert.equal(await storage.get(stagedDocument.physicalFileName), null);
  assert.ok(await storage.get(oldDocument.physicalFileName));
  assert.ok(await repo.getAnalysisByKey(key.code));
});

test("replacement atomically swaps documents and removes only the previous analysis", async () => {
  const { GET } = await import("../app/api/documents/route");
  const { storage } = await import("../lib/server/storage");
  const key = fakeKey();
  const foreignKey = fakeKey();
  await repo.saveKey(key);
  await repo.saveKey(foreignKey);
  const oldId = randomUUID();
  const oldDocument = ((await (await uploadRequest(key.code, oldId)).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  await repo.saveAnalysis(key.code, analysisWithProvider(key.code, "EDF"));

  const batchId = randomUUID();
  const newIds = [randomUUID(), randomUUID()];
  const stagedDocuments: Array<UploadedDocument & { physicalFileName: string }> = [];
  for (let index = 0; index < newIds.length; index += 1) {
    const response = await uploadRequest(
      key.code,
      newIds[index],
      undefined,
      index === 0 ? "mobile" : "sfr",
      batchId
    );
    assert.equal(response.status, 200);
    stagedDocuments.push(((await response.json()) as {
      document: UploadedDocument & { physicalFileName: string };
    }).document);
  }

  assert.equal((await replaceDocumentsRequest(
    foreignKey.code,
    "commit",
    batchId,
    newIds
  )).status, 409);
  assert.equal((await repo.getDocumentsByKey(foreignKey.code)).length, 0);

  const commitResponse = await replaceDocumentsRequest(
    key.code,
    "commit",
    batchId,
    newIds
  );
  assert.equal(commitResponse.status, 200);
  const committedDocuments = ((await commitResponse.json()) as {
    documents: UploadedDocument[];
  }).documents;
  assert.deepEqual(
    committedDocuments.map((document) => document.id).sort(),
    [...newIds].sort()
  );
  assert.ok(committedDocuments.every((document) => document.status === "ready"));
  assert.equal(await repo.getAnalysisByKey(key.code), null);
  assert.equal(await storage.get(oldDocument.physicalFileName), null);
  for (const document of stagedDocuments) {
    assert.ok(await storage.get(document.physicalFileName));
  }
  assert.equal((await replaceDocumentsRequest(
    key.code,
    "rollback",
    batchId
  )).status, 409);

  const reloaded = await GET(new Request("http://local.test/api/documents", {
    headers: { "x-futeo-access-key": key.code }
  }));
  assert.deepEqual(
    ((await reloaded.json()) as { documents: UploadedDocument[] }).documents
      .map((document) => document.id)
      .sort(),
    [...newIds].sort()
  );
});

test("missing prepared file cannot replace the current audit", async () => {
  const { storage } = await import("../lib/server/storage");
  const key = fakeKey();
  await repo.saveKey(key);
  const oldId = randomUUID();
  const oldDocument = ((await (await uploadRequest(
    key.code,
    oldId,
    undefined,
    "edf"
  )).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  await repo.saveAnalysis(key.code, analysisWithProvider(key.code, "EDF"));

  const batchId = randomUUID();
  const stagedId = randomUUID();
  const stagedDocument = ((await (await uploadRequest(
    key.code,
    stagedId,
    undefined,
    "mobile",
    batchId
  )).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  await storage.delete(stagedDocument.physicalFileName);

  assert.equal((await replaceDocumentsRequest(
    key.code,
    "commit",
    batchId,
    [stagedId]
  )).status, 409);
  assert.ok(await storage.get(oldDocument.physicalFileName));
  assert.ok(await repo.getAnalysisByKey(key.code));
  assert.ok((await repo.getDocumentsByKey(key.code)).some(
    (document) => document.id === oldId
  ));
  assert.equal((await replaceDocumentsRequest(
    key.code,
    "rollback",
    batchId
  )).status, 200);
});

test("concurrent replacements never mix batches", async () => {
  const key = fakeKey();
  await repo.saveKey(key);
  const oldId = randomUUID();
  assert.equal((await uploadRequest(key.code, oldId, undefined, "edf")).status, 200);
  await repo.saveAnalysis(key.code, analysisWithProvider(key.code, "EDF"));

  const batches: string[] = [randomUUID(), randomUUID()];
  const ids: string[] = [randomUUID(), randomUUID()];
  assert.equal((await uploadRequest(
    key.code,
    ids[0],
    undefined,
    "mobile",
    batches[0]
  )).status, 200);
  assert.equal((await uploadRequest(
    key.code,
    ids[1],
    undefined,
    "sfr",
    batches[1]
  )).status, 200);

  const responses = await Promise.all([
    replaceDocumentsRequest(key.code, "commit", batches[0], [ids[0]]),
    replaceDocumentsRequest(key.code, "commit", batches[1], [ids[1]])
  ]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 1);

  const stored = await repo.getDocumentsByKey(key.code);
  assert.equal(stored.length, 1);
  assert.ok(ids.includes(stored[0].id));
  assert.equal(stored[0].status, "ready");
  assert.equal(await repo.getAnalysisByKey(key.code), null);
});

test("same file name keeps distinct contents and rejects exact duplicates", async () => {
  const key = fakeKey();
  await repo.saveKey(key);
  const first = pdfFile("facture.pdf", "Facture EDF contenu A");
  const second = pdfFile("facture.pdf", "Facture SFR contenu B");

  assert.equal((await uploadRequest(
    key.code,
    randomUUID(),
    first,
    "edf"
  )).status, 200);
  assert.equal((await uploadRequest(
    key.code,
    randomUUID(),
    second,
    "sfr"
  )).status, 200);
  assert.equal((await repo.getDocumentsByKey(key.code)).length, 2);

  const exactDuplicate = pdfFile("copie-renommee.pdf", "Contenu strictement identique");
  const duplicateBytes = await exactDuplicate.arrayBuffer();
  assert.equal((await uploadRequest(
    key.code,
    randomUUID(),
    new File([duplicateBytes], "original.pdf", { type: "application/pdf" }),
    "mobile"
  )).status, 200);
  assert.equal((await uploadRequest(
    key.code,
    randomUUID(),
    new File([duplicateBytes], "copie.pdf", { type: "application/pdf" }),
    "mobile"
  )).status, 409);
});

test("expired prepared documents are purged with their physical files", async () => {
  const { storage } = await import("../lib/server/storage");
  const key = fakeKey();
  await repo.saveKey(key);
  const batchId = randomUUID();
  const staged = ((await (await uploadRequest(
    key.code,
    randomUUID(),
    undefined,
    "mobile",
    batchId
  )).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  assert.ok(await storage.get(staged.physicalFileName));

  await sql`delete from access_keys where code=${key.code}`;
  await repo.saveKey({
    ...key,
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  });
  await repo.purgeExpiredData();

  assert.equal(await storage.get(staged.physicalFileName), null);
  assert.equal((await repo.getDocumentsByKey(key.code)).length, 0);
});

test("client storage helpers reject failed upload and delete responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const key = fakeKey();
  const values = new Map<string, string>([
    ["futeo.activeAccessKey", JSON.stringify(key)]
  ]);
  const localStorage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage }
  });
  try {
    const {
      deleteDocumentServer,
      storeUploadedDocumentServer
    } = await import("../features/upload/storage");
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: "simulated failure" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );

    assert.equal(await deleteDocumentServer(randomUUID()), false);
    await assert.rejects(
      storeUploadedDocumentServer(
        { ...householdDocuments[3], id: randomUUID() },
        pdfFile("failed-upload.pdf", householdDocuments[3].extractedText)
      ),
      /enregistrement serveur/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("analysis rejects foreign documents, forged paths and duplicate IDs before OCR/AI", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const key = fakeKey(); await repo.saveKey(key);
  const doc = (await (await uploadRequest(key.code, randomUUID())).json()).document;
  const calls = aiRequests;
  for (const [docs, status] of [
    [[{ id: "foreign" }], 403],
    [[{ ...doc, physicalFileName: "../../.env.local" }], 403],
    [[doc, doc], 400]
  ] as const) assert.equal((await POST(analysisRequest(key.code, [...docs]))).status, status);
  assert.equal(aiRequests, calls);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 10);
});

test("import analysis selection keeps review documents but sends only ready documents", async () => {
  const { getAnalysisStartMessage, partitionDocumentsForAnalysis } = await import(
    "../features/upload/analysis-selection"
  );
  const ready = { ...householdDocuments[0], id: randomUUID(), status: "ready" as const };
  const review = {
    ...householdDocuments[1],
    id: randomUUID(),
    status: "error" as const,
    statusDetail: "Type ou contenu de fichier non autorise"
  };
  const selection = partitionDocumentsForAnalysis([ready, review]);

  assert.deepEqual(selection.usableDocuments.map((document) => document.id), [ready.id]);
  assert.deepEqual(selection.skippedDocuments.map((document) => document.id), [review.id]);
  assert.match(getAnalysisStartMessage(1, 1), /1 document\(s\) à revoir/);
  assert.match(getAnalysisStartMessage(0, 2), /Aucun document utilisable/);
});

test("analysis completion reuses the saved result even when documents have corrections", async () => {
  const { selectReusableAnalysis } = await import("../features/analysis/storage");
  const document = {
    ...householdDocuments[0],
    id: randomUUID(),
    userCorrections: { provider: "EDF", documentType: "electricity_invoice" as const }
  };
  const saved = emptyAnalysis("REUSABLE");
  saved.documents = [document];
  saved.expenses = [{
    id: "expense-reusable",
    label: "Electricité",
    provider: "EDF",
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.ELECTRICITY,
    monthlyAmount: 100,
    yearlyAmount: 1200,
    isRecurring: true,
    recurrence: "monthly",
    sourceDocumentId: document.id,
    documentType: "electricity_invoice"
  }];
  saved.totalMonthlyAmount = 100;
  saved.totalYearlyAmount = 1200;

  assert.equal(selectReusableAnalysis([saved], [document]), saved);
  assert.equal(
    selectReusableAnalysis([saved], [{ ...document, status: "purged" }]),
    saved
  );
  assert.equal(
    selectReusableAnalysis([saved], [{ ...document, id: randomUUID() }]),
    null
  );

  const source = await fs.readFile("features/analysis/AnalysisRunner.tsx", "utf8");
  assert.match(source, /router\.replace\("\/resultats"\)/);
  assert.doesNotMatch(source, /hasEnrichedCurrentAnalysis\s*&&\s*!hasCorrectedDocuments/);
  assert.doesNotMatch(source, /removeItem\(MOCK_ANALYSIS_STORAGE_KEY\)/);
  assert.match(source, /error\.details\.status === 409/);
  assert.match(source, /completedAnalysis = await getStoredAnalysisServer\(\)/);
  assert.match(source, /setHasFailed\(true\)[\s\S]{0,120}setIsComplete\(false\)/);
});

test("a mixed ready and review import analyzes only the usable server document", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const { partitionDocumentsForAnalysis } = await import(
    "../features/upload/analysis-selection"
  );
  const key = fakeKey();
  await repo.saveKey(key);
  const readyId = randomUUID();
  const ready = (await (await uploadRequest(key.code, readyId)).json()).document as UploadedDocument;
  const review = {
    ...householdDocuments[0],
    id: randomUUID(),
    status: "error" as const,
    statusDetail: "OCR à revoir"
  };
  aiReply = remapAiPayload({ mobile: readyId });

  const { usableDocuments, skippedDocuments } = partitionDocumentsForAnalysis([ready, review]);
  const response = await POST(analysisRequest(key.code, usableDocuments));

  assert.equal(response.status, 200);
  assert.equal(skippedDocuments.length, 1);
  assert.equal(((await response.json()) as { analysis: MockAnalysis }).analysis.documents.length, 1);
  assert.equal((await repo.findKeyByCode(key.code))?.usesRemaining, 9);
});

test("adding a document analyzes only the new source and preserves the existing contract", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const key = fakeKey();
  await repo.saveKey(key);

  const firstId = randomUUID();
  const firstDocument = (await (await uploadRequest(
    key.code,
    firstId,
    undefined,
    "edf"
  )).json()).document as UploadedDocument;
  aiReply = remapAiPayload({ edf: firstId });
  const callsBeforeFirstAnalysis = aiRequests;
  const firstResponse = await POST(incrementalAnalysisRequest(key.code, [firstDocument]));
  assert.equal(firstResponse.status, 200);
  const firstPayload = await firstResponse.json() as {
    analysis: MockAnalysis;
    analyzedDocumentCount: number;
  };
  assert.equal(firstPayload.analyzedDocumentCount, 1);
  assert.equal(aiRequests, callsBeforeFirstAnalysis + 1);
  assert.equal((await repo.findKeyByCode(key.code))?.usesRemaining, 9);
  const preservedExpense = firstPayload.analysis.expenses.find(
    (expense) => expense.sourceDocumentId === firstId
  );
  assert.ok(preservedExpense);

  const secondId = randomUUID();
  const secondDocument = (await (await uploadRequest(
    key.code,
    secondId,
    undefined,
    "sfr"
  )).json()).document as UploadedDocument;
  aiReply = remapAiPayload({ sfr: secondId });
  const callsBeforeSecondAnalysis = aiRequests;
  const secondResponse = await POST(
    incrementalAnalysisRequest(key.code, [firstDocument, secondDocument])
  );
  assert.equal(secondResponse.status, 200);
  const secondPayload = await secondResponse.json() as {
    analysis: MockAnalysis;
    analyzedDocumentCount: number;
  };
  assert.equal(secondPayload.analyzedDocumentCount, 1);
  assert.equal(aiRequests, callsBeforeSecondAnalysis + 1);
  assert.equal((await repo.findKeyByCode(key.code))?.usesRemaining, 8);
  assert.deepEqual(
    secondPayload.analysis.documents.map((document) => document.id).sort(),
    [firstId, secondId].sort()
  );
  assert.equal(
    secondPayload.analysis.expenses.find((expense) => expense.sourceDocumentId === firstId)?.id,
    preservedExpense.id
  );

  const callsBeforeRetry = aiRequests;
  const retryResponse = await POST(
    incrementalAnalysisRequest(key.code, [firstDocument, secondDocument])
  );
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json() as { cached: boolean }).cached, true);
  assert.equal(aiRequests, callsBeforeRetry);
  assert.equal((await repo.findKeyByCode(key.code))?.usesRemaining, 8);
});

test("purged sources keep validated contracts while EDF, SFR and Engie are added once", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const { POST: upload, DELETE: mutateDocuments } = await import("../app/api/documents/route");
  const key = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(key);

  const edfId = randomUUID();
  const edf = (await (await uploadRequest(
    key.code,
    edfId,
    undefined,
    "edf"
  )).json()).document as UploadedDocument;
  aiReply = remapAiPayload({ edf: edfId });
  const callsBeforeEdf = aiRequests;
  const edfResponse = await analyze(incrementalAnalysisRequest(key.code, [edf]));
  assert.equal(edfResponse.status, 200);
  const edfAnalysis = (await edfResponse.json() as { analysis: MockAnalysis }).analysis;
  const edfExpenseId = edfAnalysis.expenses.find(
    (expense) => expense.sourceDocumentId === edfId
  )?.id;
  assert.ok(edfExpenseId);
  assert.equal(aiRequests, callsBeforeEdf + 1);

  const purgeResponse = await mutateDocuments(new Request(
    "http://local.test/api/documents",
    { method: "DELETE", body: JSON.stringify({ code: key.code, purge: true }) }
  ));
  assert.equal(purgeResponse.status, 200);
  assert.equal((await repo.getDocumentsByKey(key.code))[0].status, "purged");

  const sfrId = randomUUID();
  const sfr = (await (await uploadRequest(
    key.code,
    sfrId,
    undefined,
    "sfr"
  )).json()).document as UploadedDocument;
  aiReply = remapAiPayload({ sfr: sfrId });
  const callsBeforeSfr = aiRequests;
  const sfrResponse = await analyze(incrementalAnalysisRequest(key.code, [sfr]));
  assert.equal(sfrResponse.status, 200);
  const sfrAnalysis = (await sfrResponse.json() as { analysis: MockAnalysis }).analysis;
  assert.equal(aiRequests, callsBeforeSfr + 1);
  assert.deepEqual(
    sfrAnalysis.documents.map((document) => document.id).sort(),
    [edfId, sfrId].sort()
  );
  assert.equal(
    sfrAnalysis.expenses.find((expense) => expense.sourceDocumentId === edfId)?.id,
    edfExpenseId
  );

  const engieId = randomUUID();
  const engieMetadata: UploadedDocument = {
    ...householdDocuments[0],
    id: engieId,
    fileName: "engie.pdf",
    provider: "ENGIE",
    documentType: "gas_invoice",
    detectedCategory: ExpenseCategory.ENERGY
  };
  const engieForm = new FormData();
  engieForm.set("code", key.code);
  engieForm.set("document", JSON.stringify(engieMetadata));
  engieForm.set("file", pdfFile(
    "engie.pdf",
    "Monsieur Jean DUPONT ENGIE Gaz 80 EUR par mois Electricite 60 EUR par mois"
  ));
  const engieUpload = await upload(new Request(
    "http://local.test/api/documents",
    { method: "POST", body: engieForm }
  ));
  assert.equal(engieUpload.status, 200);
  const engie = (await engieUpload.json()).document as UploadedDocument;
  aiReply = {
    detectedParties: {
      customer: { fullName: "Jean DUPONT", firstName: "Jean", lastName: "DUPONT" },
      documents: {
        [engieId]: {
          documentId: engieId,
          documentType: "gas_invoice",
          providerName: "ENGIE",
          invoiceAmount: 140
        }
      }
    },
    expenses: [
      {
        sourceDocumentId: engieId,
        documentType: "gas_invoice",
        provider: "ENGIE",
        label: "Gaz",
        category: ExpenseCategory.ENERGY,
        subcategory: ExpenseSubcategory.GAS,
        monthlyAmount: 80,
        yearlyAmount: 960,
        recurrence: "monthly",
        isRecurring: true
      },
      {
        sourceDocumentId: engieId,
        documentType: "electricity_invoice",
        provider: "ENGIE",
        label: "Electricite",
        category: ExpenseCategory.ENERGY,
        subcategory: ExpenseSubcategory.ELECTRICITY,
        monthlyAmount: 60,
        yearlyAmount: 720,
        recurrence: "monthly",
        isRecurring: true
      }
    ],
    recommendations: [],
    anomalies: []
  };
  const callsBeforeEngie = aiRequests;
  const engieResponse = await analyze(
    incrementalAnalysisRequest(key.code, [sfr, engie])
  );
  assert.equal(engieResponse.status, 200);
  const engieAnalysis = (await engieResponse.json() as { analysis: MockAnalysis }).analysis;
  assert.equal(aiRequests, callsBeforeEngie + 1);
  assert.deepEqual(
    engieAnalysis.documents.map((document) => document.id).sort(),
    [edfId, sfrId, engieId].sort()
  );
  assert.equal(
    engieAnalysis.expenses.filter((expense) => expense.sourceDocumentId === engieId).length,
    2
  );
  assert.equal(new Set(engieAnalysis.expenses.map((expense) => expense.id)).size, 4);
  assert.equal((await repo.findKeyByCode(key.code))?.usesRemaining, 7);

  const callsBeforeRetry = aiRequests;
  const retryResponse = await analyze(
    incrementalAnalysisRequest(key.code, [sfr, engie])
  );
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json() as { cached: boolean }).cached, true);
  assert.equal(aiRequests, callsBeforeRetry);

  const deleteResponse = await mutateDocuments(new Request(
    "http://local.test/api/documents",
    { method: "DELETE", body: JSON.stringify({ code: key.code, documentId: edfId }) }
  ));
  assert.equal(deleteResponse.status, 200);
  const afterDeleteResponse = await analyze(
    incrementalAnalysisRequest(key.code, [sfr, engie])
  );
  assert.equal(afterDeleteResponse.status, 200);
  const afterDelete = (await afterDeleteResponse.json() as { analysis: MockAnalysis }).analysis;
  assert.equal(aiRequests, callsBeforeRetry);
  assert.ok(!afterDelete.documents.some((document) => document.id === edfId));
  assert.ok(!afterDelete.expenses.some((expense) => expense.sourceDocumentId === edfId));
});

test("contract deduplication uses a strong identity and prefers an invoice over a schedule", async () => {
  const { mergeAnalyses } = await import("../lib/server/manual-analysis");
  const scheduleDocument = { ...householdDocuments[0], id: "energy-schedule" };
  const invoiceDocument = { ...householdDocuments[0], id: "energy-invoice" };
  const baseExpense: Expense = {
    id: "schedule-expense",
    label: "Contrat EDF",
    provider: "EDF",
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.ELECTRICITY,
    isRecurring: true,
    monthlyAmount: 100,
    yearlyAmount: 1200,
    recurrence: "monthly",
    documentType: "electricity_invoice",
    sourceDocumentId: scheduleDocument.id,
    contractNumber: "CONTRACT-001",
    contractDetails: {
      version: 1,
      source: "document",
      sourceDocumentId: scheduleDocument.id,
      kind: "electricity",
      documentKind: "PAYMENT_SCHEDULE"
    }
  };
  const scheduleAnalysis: MockAnalysis = {
    ...emptyAnalysis("dedup-schedule"),
    documents: [scheduleDocument],
    expenses: [baseExpense],
    totalMonthlyAmount: 100,
    totalYearlyAmount: 1200
  };
  const invoiceExpense: Expense = {
    ...baseExpense,
    id: "invoice-expense",
    sourceDocumentId: invoiceDocument.id,
    monthlyAmount: 95,
    yearlyAmount: 1140,
    contractDetails: {
      version: 1,
      source: "document",
      sourceDocumentId: invoiceDocument.id,
      kind: "electricity",
      documentKind: "INVOICE"
    }
  };
  const invoiceAnalysis: MockAnalysis = {
    ...emptyAnalysis("dedup-invoice"),
    documents: [invoiceDocument],
    expenses: [invoiceExpense],
    totalMonthlyAmount: 95,
    totalYearlyAmount: 1140
  };

  const merged = mergeAnalyses(scheduleAnalysis, invoiceAnalysis);
  assert.equal(merged.expenses.length, 1);
  assert.equal(merged.expenses[0].id, invoiceExpense.id);
  assert.equal(merged.totalYearlyAmount, 1140);

  const distinctContract = {
    ...invoiceExpense,
    id: "second-contract",
    contractNumber: "CONTRACT-002"
  };
  const withDistinctContract = mergeAnalyses(merged, {
    ...emptyAnalysis("dedup-distinct"),
    documents: [{ ...invoiceDocument, id: "second-contract-document" }],
    expenses: [distinctContract],
    totalMonthlyAmount: distinctContract.monthlyAmount,
    totalYearlyAmount: distinctContract.yearlyAmount
  });
  assert.equal(withDistinctContract.expenses.length, 2);
});

test("server document loading preserves local documents that still need review", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const localReady = { ...householdDocuments[0], id: randomUUID(), status: "ready" as const };
  const localReview = {
    ...householdDocuments[1],
    id: randomUUID(),
    status: "error" as const,
    statusDetail: "Fichier trop volumineux"
  };
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      },
      setTimeout,
      clearTimeout
    }
  });

  try {
    const { storeAccessKey } = await import("../features/billing/access-keys");
    storeAccessKey(fakeKey());
    values.set("futeo.uploadedDocuments", JSON.stringify([localReady, localReview]));
    globalThis.fetch = async () => Response.json({ documents: [localReady] });
    const { getStoredUploadedDocumentsServer } = await import("../features/upload/storage");
    const loaded = await getStoredUploadedDocumentsServer();
    assert.deepEqual(loaded.map((document) => document.id), [localReady.id, localReview.id]);
    assert.equal(loaded[1].statusDetail, "Fichier trop volumineux");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("JPEG uploads accept common MIME aliases only with a valid JPEG signature", async () => {
  const { validateUpload } = await import("../lib/server/document-validation");
  const metadata = {
    id: randomUUID(),
    documentType: "electricity_invoice" as const,
    provider: "EDF"
  };
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  for (const mimeType of ["image/jpeg", "image/jpg", "image/pjpeg"]) {
    const result = await validateUpload(
      new File([jpegBytes], "facture edf.jpeg", { type: mimeType }),
      metadata
    );
    assert.equal(result.document.status, "ready");
    assert.equal(result.document.mimeType, "image/jpeg");
  }

  await assert.rejects(
    validateUpload(
      new File([new Uint8Array([0x00, 0x01, 0x02])], "facture edf.jpeg", {
        type: "image/jpeg"
      }),
      metadata
    ),
    /Type ou contenu de fichier non autorise/
  );
});

test("one credit: concurrent analysis is rejected before AI and only one result is committed", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const key = { ...fakeKey(), usesRemaining: 1 }; await repo.saveKey(key);
  // The original mobile ID belongs to an earlier test; use a unique ID and map the fixture response.
  const id = randomUUID(); const doc = (await (await uploadRequest(key.code, id)).json()).document;
  const payload = aiHouseholdPayload(["mobile"]);
  payload.expenses[0].sourceDocumentId = id as "mobile";
  aiReply = payload;
  let release!: () => void;
  aiWait = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { onAiStarted = resolve; });
  const calls = aiRequests;
  const first = POST(analysisRequest(key.code, [doc]));
  try {
    await started;
    assert.equal((await POST(analysisRequest(key.code.toLowerCase(), [doc]))).status, 409);
    release();
    assert.equal((await first).status, 200);
  } finally { release(); aiWait = undefined; onAiStarted = undefined; }
  assert.equal(aiRequests, calls + 1);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 0);
  assert.ok(await repo.getAnalysisByKey(key.code));
  assert.equal((await POST(analysisRequest(key.code, [doc]))).status, 403);
});

test("failed analysis transaction restores quota and leaves no partial result", async () => {
  const { withKeyLock } = await import("../lib/server/key-lock");
  const key = { ...fakeKey(), usesRemaining: 1 }; await repo.saveKey(key);
  await assert.rejects(withKeyLock(`key:${key.code}`, async (tx) => {
    await repo.consumeAnalysisCredit(key.code, tx);
    await repo.saveAnalysis(key.code, emptyAnalysis(key.code), tx);
    throw new Error("simulated persistence failure");
  }));
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 1);
  assert.equal(await repo.getAnalysisByKey(key.code), null);
  await withKeyLock(`key:${key.code}`, async (tx) => { await repo.consumeAnalysisCredit(key.code, tx); });
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 0);
});

test("mixed EDF / MACIF multi-contract / SFR box / mobile preserves every document", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload();
  const result = await analyzeDocumentsWithAI(householdDocuments, "MIXED");
  assert.deepEqual([...new Set(result.expenses.map((expense) => expense.sourceDocumentId))].sort(), ["edf", "macif", "mobile", "sfr"]);
  const macif = result.expenses.filter((expense) => expense.sourceDocumentId === "macif");
  assert.equal(macif.length, 2);
  assert.deepEqual(macif.map((expense) => expense.yearlyAmount).sort((a, b) => a - b), [120, 240]);
  assert.equal(result.expenses.find((expense) => expense.sourceDocumentId === "edf")!.monthlyAmount, 120);
  assert.equal(result.expenses.filter((expense) => expense.sourceDocumentId === "sfr").length, 1);
  assert.equal(result.expenses.find((expense) => expense.sourceDocumentId === "mobile")!.mobileDataGB, 100);
  const { findAlternativeOffers } = await import("../features/recommendations/service");
  const alternatives = findAlternativeOffers(
    result.expenses.map((expense) =>
      expense.subcategory === ExpenseSubcategory.MOBILE
        ? {
            ...expense,
            mobileAllowLowerDataOffers: true,
            mobileMinimumDataGB: 20
          }
        : expense
    ),
    {
      mobileCatalog: getTestMobileCatalog()
    }
  );
  assert.ok(alternatives.length > 0);
  assert.ok(alternatives.some((offer) => offer.comparisonKind === "reduced_data"));
  const { generateLettersFromAnalysis, renderLetter } = await import("../features/letters/service");
  const letters = generateLettersFromAnalysis(result);
  assert.ok(letters.length > 0);
  assert.ok(letters.every((letter) => letter.potentialSaving === 0));
  assert.ok(letters.every((letter) => !letter.offerName));
  assert.ok(
    letters.every((letter) =>
      letter.type !== "offer_change" && letter.type !== "comparison_report"
    )
  );
  assert.ok(
    letters.every((letter) =>
      result.expenses.some((expense) => expense.id === letter.sourceExpenseId)
    )
  );
  const mobileLetter = letters.find(
    (letter) => letter.sourceExpenseId === result.expenses.find(
      (expense) => expense.sourceDocumentId === "mobile"
    )?.id
  );
  assert.match(mobileLetter?.bodyTemplate ?? "", /100 Go inclus/);
  const text = renderLetter(letters[0], { firstName: "Jean", lastName: "DUPONT", address: "1 rue Exemple", customerNumber: "12345678", email: "test@example.invalid" });
  assert.ok(text.includes("DUPONT"));
  const { summarizeExpensesByCategory } = await import("../lib/expense-summary");
  assert.ok(summarizeExpensesByCategory(result.expenses).length >= 3);
  await repo.saveAnalysis("MIXED", result);
  assert.deepEqual((await repo.getAnalysisByKey("MIXED"))!.expenses, JSON.parse(JSON.stringify(result.expenses)));
  const { generatePdfReport } = await import("../features/reports/service");
  let report: string = "";
  // Capture the real PDF output instead of downloading a file in the workspace.
  const events = jsPDF.API.events;
  const capture = ["initialized", function (this: jsPDF) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.save as any) = () => { report = this.output(); return this; };
  }] as typeof events[number];
  events.push(capture);
  try { await generatePdfReport(result, alternatives, letters); }
  finally { events.splice(events.indexOf(capture), 1); }
  assert.ok(report?.startsWith("%PDF-"));
  for (const provider of ["EDF", "MACIF", "SFR", "NRJ Mobile"]) assert.ok(report.includes(provider), `PDF missing ${provider}`);
  assert.ok(report.includes("Autres possibilites pour reduire votre facture"));
});

test("the report targets existing letters without triggering a second analysis", async () => {
  const reportSource = await fs.readFile("features/reports/ReportPanel.tsx", "utf8");
  const lettersSource = await fs.readFile("features/letters/LettersPanel.tsx", "utf8");

  assert.match(
    reportSource,
    /\/courriers\?expenseId=\$\{encodeURIComponent\(expenseId\)\}&returnTo=rapport/
  );
  assert.match(reportSource, /Choisir un courrier/);
  assert.doesNotMatch(reportSource, /refreshStoredAnalysisServer/);
  assert.doesNotMatch(reportSource, /findAlternativeOffers/);
  assert.match(lettersSource, /letter\.sourceExpenseId === selectedExpenseId/);
  assert.match(lettersSource, /visibleLetters\.map/);
  assert.match(lettersSource, /Contenu modifiable avant téléchargement/);
  assert.match(lettersSource, /savePreparedLetter\(letterAuditId, snapshot\)/);
  assert.match(lettersSource, /saveFollowupLetter\(sourceLetterRecordId, snapshot\)/);
  assert.match(lettersSource, /saveLetterAsPrepared\(letter, content\)/);
  assert.match(lettersSource, /sourceRecord\.status !== "sent"/);
  assert.match(lettersSource, /!sourceRecord\.sentAt/);
  assert.match(lettersSource, /sourceRecord\.auditId !== currentAuditId/);
  assert.match(lettersSource, /record\.auditId === currentAuditId/);
  assert.match(lettersSource, /confirmedSourceRecord\.sentAt/);
  assert.doesNotMatch(lettersSource, /sentAt \?\? sourceRecord\.createdAt/);
  assert.match(reportSource, /Préparé le \{formatActionDate\(initialLetter\.createdAt\)\}/);
  assert.match(reportSource, /Relance préparée/);
  assert.match(reportSource, /Confirmer l&apos;envoi/);
  assert.match(reportSource, /Date réelle d&apos;envoi/);
  assert.match(reportSource, /initialLetter\.status === "sent" && initialLetter\.sentAt/);
  assert.doesNotMatch(lettersSource, /handleForceAnalysis|deleteStoredAnalysisServer/);
  const letterServiceSource = await fs.readFile("features/letters/service.ts", "utf8");
  assert.doesNotMatch(letterServiceSource, /findAlternativeOffers/);
});

test("letter tracking persists prepared, sent and follow-up states without duplicates", async () => {
  const originalWindow = globalThis.window;
  const firstKey = fakeKey("FF-11111111-22222222-33333333");
  const secondKey = fakeKey("FF-AAAAAAAA-BBBBBBBB-CCCCCCCC");
  const values = new Map<string, string>([
    ["futeo.activeAccessKey", JSON.stringify(firstKey)]
  ]);
  const sessionValues = new Map<string, string>();
  const storage = (entries: Map<string, string>) => ({
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage(values),
      sessionStorage: storage(sessionValues)
    }
  });

  const initialLetter: GeneratedLetter = {
    id: "letter-expense-energy-negotiation",
    sourceExpenseId: "expense-energy",
    type: "price_negotiation",
    provider: "EDF",
    category: ExpenseCategory.ENERGY,
    potentialSaving: 0,
    monthlyAmount: 100,
    yearlyAmount: 1200,
    subject: "Demande de révision",
    title: "Négociation du contrat",
    bodyTemplate: "Bonjour"
  };
  const personalization = {
    firstName: "Jean",
    lastName: "DUPONT",
    address: "1 rue Exemple",
    customerNumber: "12345678",
    email: "test@example.invalid"
  };

  try {
    const {
      addAuditActionLog,
      confirmLetterSent,
      getStoredLetterRecord,
      getStoredLetterRecords,
      saveFollowupLetter,
      savePreparedLetter
    } = await import("../features/privacy/action-log");
    const initialSnapshot = {
      letter: initialLetter,
      personalization,
      documentName: "facture.pdf",
      renderedContent: "Courrier personnalisé"
    };

    const prepared = savePreparedLetter("audit-one", initialSnapshot);
    assert.ok(prepared);
    assert.equal(savePreparedLetter("audit-one", initialSnapshot)?.id, prepared.id);
    assert.equal(getStoredLetterRecords("audit-one").length, 1);
    assert.equal(getStoredLetterRecord(prepared.id)?.status, "prepared");

    const historicalPreparedAt = "2026-10-01T10:00:00.000Z";
    const historical = savePreparedLetter(
      "audit-history",
      {
        ...initialSnapshot,
        letter: {
          ...initialLetter,
          id: "letter-expense-historical",
          sourceExpenseId: "expense-historical"
        }
      },
      historicalPreparedAt
    );
    assert.equal(historical?.createdAt, historicalPreparedAt);
    assert.equal(confirmLetterSent(historical!.id, "2026-10-02")?.status, "sent");

    addAuditActionLog({
      type: "letter_downloaded",
      label: "Courrier téléchargé",
      provider: "EDF",
      letterSnapshot: initialSnapshot
    });
    assert.equal(getStoredLetterRecord(prepared.id)?.status, "prepared");
    assert.equal(
      saveFollowupLetter(prepared.id, {
        ...initialSnapshot,
        letter: {
          ...initialLetter,
          id: "premature-followup",
          type: "provider_followup"
        }
      }),
      null
    );
    assert.equal(confirmLetterSent(prepared.id, "not-a-date"), null);
    assert.equal(confirmLetterSent(prepared.id, "2099-01-01"), null);
    assert.equal(getStoredLetterRecord(prepared.id)?.status, "prepared");

    const sentAt = new Date().toISOString().slice(0, 10);
    assert.equal(confirmLetterSent(prepared.id, sentAt)?.status, "sent");
    assert.equal(getStoredLetterRecord(prepared.id)?.sentAt, sentAt);
    savePreparedLetter("audit-one", {
      ...initialSnapshot,
      renderedContent: "Modification postérieure à l'envoi"
    });
    assert.equal(
      getStoredLetterRecord(prepared.id)?.snapshot.renderedContent,
      "Courrier personnalisé"
    );

    const followupLetter: GeneratedLetter = {
      ...initialLetter,
      id: "followup-expense-energy",
      type: "provider_followup",
      title: "Relance du fournisseur"
    };
    const followupSnapshot = {
      ...initialSnapshot,
      letter: followupLetter,
      renderedContent: "Relance personnalisée"
    };
    const followup = saveFollowupLetter(prepared.id, followupSnapshot);
    assert.ok(followup);
    assert.equal(saveFollowupLetter(prepared.id, followupSnapshot)?.id, followup.id);
    assert.equal(getStoredLetterRecords("audit-one").length, 2);
    assert.equal(getStoredLetterRecord(prepared.id)?.status, "sent");
    assert.equal(getStoredLetterRecord(followup.id)?.parentRecordId, prepared.id);

    const secondContract = savePreparedLetter("audit-one", {
      ...initialSnapshot,
      letter: {
        ...initialLetter,
        id: "letter-expense-internet-cancellation",
        sourceExpenseId: "expense-internet",
        provider: "SFR",
        type: "subscription_cancellation"
      }
    });
    assert.ok(secondContract);
    assert.equal(getStoredLetterRecords("audit-one").length, 3);

    values.set("futeo.activeAccessKey", JSON.stringify(secondKey));
    assert.deepEqual(getStoredLetterRecords("audit-one"), []);
    values.set("futeo.activeAccessKey", JSON.stringify(firstKey));
    assert.equal(getStoredLetterRecords("audit-one").length, 3);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("OpenAI SDK keeps the existing mocked chat completions contract", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload();
  const requestCount = aiRequestBodies.length;

  await analyzeDocumentsWithAI([householdDocuments[0]], "OPENAI-SDK-MOCK");

  assert.equal(aiRequestBodies.length, requestCount + 1);
  const body = aiRequestBodies.at(-1) as {
    model?: string;
    messages?: Array<{ role?: string; content?: unknown }>;
    response_format?: { type?: string };
  };
  assert.equal(body.model, "gpt-4o");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.messages?.map((message) => message.role), ["system", "user"]);
  assert.equal(typeof body.messages?.[1]?.content, "string");
});

test("manual selection in MACIF does not suppress mobile or box", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload();
  const docs = householdDocuments.map((doc) => doc.id === "macif" ? {
    ...doc, userCorrections: { isMultiContract: true, amount: 240, frequency: "yearly" as const }
  } : doc);
  const result = await analyzeDocumentsWithAI(docs, "MANUAL");
  assert.equal(result.expenses.filter((expense) => expense.sourceDocumentId === "macif").length, 1);
  assert.ok(result.expenses.some((expense) => expense.sourceDocumentId === "mobile"));
  assert.ok(result.expenses.some((expense) => expense.sourceDocumentId === "sfr"));
});

test("complete and optional manual contracts persist server-side and generate letters", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const { POST: letters } = await import("../app/api/courriers/route");
  const key = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(key);

  const firstRequestId = randomUUID();
  const first = await analyze(manualAnalysisRequest(key.code, { requestId: firstRequestId }));
  assert.equal(first.status, 200);
  const firstAnalysis = ((await first.json()) as { analysis: MockAnalysis }).analysis;
  assert.equal(firstAnalysis.documents[0].mimeType, "manual/input");
  assert.equal(firstAnalysis.expenses[0].provider, "EDF");
  assert.equal(firstAnalysis.totalMonthlyAmount, 120);
  assert.equal(firstAnalysis.totalYearlyAmount, 1440);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 9);

  const replay = await analyze(manualAnalysisRequest(key.code, { requestId: firstRequestId }));
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as { cached: boolean }).cached, true);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 9);

  const secondRequestId = randomUUID();
  const second = await analyze(manualAnalysisRequest(key.code, {
    requestId: secondRequestId,
    provider: "Free",
    documentType: "internet_invoice",
    amount: 23.35,
    frequency: "monthly",
    clientFirstName: undefined,
    clientLastName: undefined,
    clientAddress: undefined,
    customerNumber: undefined,
    contractNumber: undefined,
    invoiceNumber: undefined,
    phone: undefined,
    email: undefined,
    providerAddress: undefined
  }));
  assert.equal(second.status, 200);
  const analysis = ((await second.json()) as { analysis: MockAnalysis }).analysis;
  assert.equal(analysis.documents.length, 2);
  assert.equal(analysis.expenses.length, 2);
  assert.equal(analysis.totalMonthlyAmount, 143.35);
  assert.equal(analysis.totalYearlyAmount, 1720.2);
  const freeBox = analysis.expenses.find((expense) => expense.provider === "Free")!;
  assert.equal(freeBox.category, ExpenseCategory.TELECOM);
  assert.equal(freeBox.subcategory, ExpenseSubcategory.INTERNET);
  assert.equal(freeBox.documentType, "internet_invoice");
  assert.equal(freeBox.label, "Facture internet");
  const { findAlternativeOffers } = await import("../features/recommendations/service");
  const redBox = findAlternativeOffers([freeBox]).find((offer) => offer.provider === "RED by SFR");
  assert.equal(redBox?.estimatedYearlySaving, 4.32);
  const optionalProfile = analysis.detectedParties?.documents?.[`manual_${secondRequestId}`]?.customer;
  assert.equal(optionalProfile?.fullName, "DUPONT");
  assert.equal(optionalProfile?.address, key.profilePostalAddress);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 8);

  const letterResponse = await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: key.code })
  }));
  assert.equal(letterResponse.status, 200);
  const generated = (await letterResponse.json()) as { letters: unknown[] };
  assert.ok(generated.letters.length >= 2);
});

test("manual mobile contracts require included data, accept decimals and preserve unlimited plans", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const key = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(key);

  const missing = await analyze(manualAnalysisRequest(key.code, {
    provider: "Operateur mobile",
    documentType: "mobile_invoice",
    amount: 28,
    mobileDataGB: undefined,
    mobileDataUnlimited: false
  }));
  assert.equal(missing.status, 400);
  assert.match((await missing.text()), /volume de donnees inclus manquant/i);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 10);

  const decimal = await analyze(manualAnalysisRequest(key.code, {
    requestId: randomUUID(),
    provider: "Operateur decimal",
    documentType: "mobile_invoice",
    amount: 28,
    mobileDataGB: 12.5,
    mobileDataUnlimited: false,
    mobileAllowLowerDataOffers: false
  }));
  assert.equal(decimal.status, 200);
  const decimalAnalysis = ((await decimal.json()) as { analysis: MockAnalysis }).analysis;
  const decimalExpense = decimalAnalysis.expenses.find(
    (expense) => expense.provider === "Operateur decimal"
  )!;
  assert.equal(decimalExpense.mobileDataGB, 12.5);
  assert.equal(decimalExpense.mobileIncludedDataGB, 12.5);
  assert.equal(decimalExpense.mobileDataUnlimited, false);
  assert.equal(decimalExpense.mobileAllowLowerDataOffers, false);

  const unlimited = await analyze(manualAnalysisRequest(key.code, {
    requestId: randomUUID(),
    provider: "Operateur illimite",
    documentType: "mobile_invoice",
    amount: 35,
    mobileDataGB: undefined,
    mobileDataUnlimited: true,
    mobileAllowLowerDataOffers: false
  }));
  assert.equal(unlimited.status, 200);
  const unlimitedAnalysis = ((await unlimited.json()) as { analysis: MockAnalysis }).analysis;
  const unlimitedExpense = unlimitedAnalysis.expenses.find(
    (expense) => expense.provider === "Operateur illimite"
  )!;
  assert.equal(unlimitedExpense.mobileDataUnlimited, true);
  assert.equal(unlimitedExpense.mobileDataGB, undefined);
  assert.equal(unlimitedExpense.mobileIncludedDataGB, undefined);

  const missingMinimum = await analyze(new Request("http://local.test/api/analyse", {
    method: "POST",
    body: JSON.stringify({
      code: key.code,
      mobileContractPreferences: {
        expenseId: decimalExpense.id,
        mobileDataGB: 100,
        mobileDataUnlimited: false,
        mobileAllowLowerDataOffers: true
      }
    })
  }));
  assert.equal(missingMinimum.status, 400);
  assert.match(await missingMinimum.text(), /volume mobile minimum accepte manquant/i);

  const updated = await analyze(new Request("http://local.test/api/analyse", {
    method: "POST",
    body: JSON.stringify({
      code: key.code,
      mobileContractPreferences: {
        expenseId: decimalExpense.id,
        mobileDataGB: 100,
        mobileDataUnlimited: false,
        mobileAllowLowerDataOffers: true,
        mobileMinimumDataGB: 20
      }
    })
  }));
  assert.equal(updated.status, 200);
  const updatedAnalysis = ((await updated.json()) as { analysis: MockAnalysis }).analysis;
  const updatedExpense = updatedAnalysis.expenses.find(
    (expense) => expense.id === decimalExpense.id
  )!;
  assert.equal(updatedExpense.mobileIncludedDataGB, 100);
  assert.equal(updatedExpense.mobileAllowLowerDataOffers, true);
  assert.equal(updatedExpense.mobileMinimumDataGB, 20);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 8);
  assert.deepEqual(
    (await repo.getAnalysisByKey(key.code))!.expenses,
    JSON.parse(JSON.stringify(updatedAnalysis.expenses))
  );
});

test("report labels fall back to contract classification when a stored label is missing", async () => {
  const { getExpenseDisplayLabel } = await import("../lib/expense-summary");
  const baseExpense = analysisWithProvider("DISPLAY", "Provider").expenses[0];
  const cases = [
    ["internet_invoice", ExpenseCategory.TELECOM, ExpenseSubcategory.INTERNET, "Internet / Box"],
    ["mobile_invoice", ExpenseCategory.TELECOM, ExpenseSubcategory.MOBILE, "Mobile"],
    ["electricity_invoice", ExpenseCategory.ENERGY, ExpenseSubcategory.ELECTRICITY, "Électricité"],
    ["home_insurance", ExpenseCategory.INSURANCE, ExpenseSubcategory.HOME_INSURANCE, "Assurance habitation"]
  ] as const;

  for (const [documentType, category, subcategory, expectedLabel] of cases) {
    assert.equal(getExpenseDisplayLabel({
      ...baseExpense,
      label: "",
      documentType,
      category,
      subcategory
    }), expectedLabel);
  }
});

test("manual and PDF contracts remain available together in either addition order", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const { POST: letters } = await import("../app/api/courriers/route");
  const key = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(key);

  assert.equal((await analyze(manualAnalysisRequest(key.code, {
    provider: "MACIF",
    documentType: "home_insurance",
    amount: 30
  }))).status, 200);

  const pdfId = randomUUID();
  const uploaded = ((await (await uploadRequest(key.code, pdfId, undefined, "edf")).json()) as {
    document: UploadedDocument;
  }).document;
  aiReply = remapAiPayload({ edf: pdfId });
  const pdfResponse = await analyze(analysisRequest(key.code, [uploaded]));
  assert.equal(pdfResponse.status, 200);
  const afterPdf = ((await pdfResponse.json()) as { analysis: MockAnalysis }).analysis;
  assert.equal(afterPdf.documents.length, 2);
  assert.ok(afterPdf.expenses.some((expense) => expense.provider === "MACIF"));
  assert.ok(afterPdf.expenses.some((expense) => expense.provider === "EDF"));

  const afterSecondManual = await analyze(manualAnalysisRequest(key.code, {
    provider: "SFR",
    documentType: "internet_invoice",
    amount: 49.99
  }));
  assert.equal(afterSecondManual.status, 200);
  const mixed = ((await afterSecondManual.json()) as { analysis: MockAnalysis }).analysis;
  assert.equal(mixed.documents.length, 3);
  for (const provider of ["MACIF", "EDF", "SFR"]) {
    assert.ok(mixed.expenses.some((expense) => expense.provider === provider));
  }
  assert.equal((await repo.getAnalysisByKey(key.code))!.expenses.length, 3);
  assert.equal((await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: key.code })
  }))).status, 200);
});

test("manual contracts keep Foyer, Famille and Discovery plan rules", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const { POST: letters } = await import("../app/api/courriers/route");

  const foyer = fakeKey();
  await repo.saveKey(foyer);
  assert.equal((await analyze(manualAnalysisRequest(foyer.code))).status, 200);
  const duplicateCategory = await analyze(manualAnalysisRequest(foyer.code, {
    provider: "ENGIE",
    documentType: "gas_invoice"
  }));
  assert.equal(duplicateCategory.status, 403);
  assert.equal((await repo.findKeyByCode(foyer.code))!.usesRemaining, 9);
  assert.equal((await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: foyer.code })
  }))).status, 200);

  const family = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(family);
  assert.equal((await analyze(manualAnalysisRequest(family.code))).status, 200);
  assert.equal((await analyze(manualAnalysisRequest(family.code, {
    provider: "ENGIE",
    documentType: "gas_invoice"
  }))).status, 200);
  assert.equal((await repo.getAnalysisByKey(family.code))!.documents.length, 2);

  const discovery = {
    ...fakeKey(),
    plan: "decouverte" as const,
    usesRemaining: 1,
    allowedNames: null,
    profilePostalAddress: null,
    profileLockedAt: null
  };
  await repo.saveKey(discovery);
  assert.equal((await analyze(manualAnalysisRequest(discovery.code))).status, 200);
  assert.equal((await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: discovery.code })
  }))).status, 403);
});

test("manual analysis refuses expired keys and remains isolated from another key", async () => {
  const { POST: analyze } = await import("../app/api/analyse/route");
  const { POST: letters } = await import("../app/api/courriers/route");
  const expired = {
    ...fakeKey(),
    plan: "famille" as const,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  };
  await repo.saveKey(expired);
  assert.equal((await analyze(manualAnalysisRequest(expired.code))).status, 403);
  assert.equal((await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: expired.code })
  }))).status, 403);

  const owner = { ...fakeKey(), plan: "famille" as const };
  const foreign = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(owner);
  await repo.saveKey(foreign);
  const ownerResponse = await analyze(manualAnalysisRequest(owner.code, { provider: "EDF" }));
  const ownerAnalysis = ((await ownerResponse.json()) as { analysis: MockAnalysis }).analysis;
  const foreignResponse = await letters(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: foreign.code, analysis: ownerAnalysis })
  }));
  assert.equal(foreignResponse.status, 404);
});

test("storage rejects traversal and purge removes only expired files from UPLOADS_DIR", async () => {
  const { storage } = await import("../lib/server/storage");
  for (const name of ["../escape.pdf", "..\\escape.pdf", "/etc/passwd", "C:\\secret", "a:stream", "file\0.pdf"]) {
    await assert.rejects(storage.get(name));
    await assert.rejects(storage.put(name, Buffer.from("test")));
    await assert.rejects(storage.delete(name));
  }
  const expired = { ...fakeKey(), expiresAt: new Date(Date.now() - 60000).toISOString() };
  const active = fakeKey(); await repo.saveKey(expired); await repo.saveKey(active);
  for (const key of [expired, active]) {
    const physicalFileName = `${randomUUID()}.pdf`;
    await storage.put(physicalFileName, Buffer.from("%PDF-test"));
    await repo.saveDocuments(key.code, [{ ...householdDocuments[3], id: randomUUID(), physicalFileName } as UploadedDocument]);
  }
  const [expiredDoc] = await repo.getDocumentsByKey(expired.code) as Array<UploadedDocument & { physicalFileName: string }>;
  const [activeDoc] = await repo.getDocumentsByKey(active.code) as Array<UploadedDocument & { physicalFileName: string }>;
  await repo.purgeExpiredData();
  assert.equal(await storage.get(expiredDoc.physicalFileName), null);
  assert.ok(await storage.get(activeDoc.physicalFileName));
  assert.equal((await repo.getDocumentsByKey(expired.code)).length, 0);
  assert.equal((await repo.findKeyByCode(expired.code))!.isActive, false);
});

test("old free access older than 30 days remains expired after migration", async () => {
  const { POST } = await import("../app/api/keys/activate/route");
  const response = await POST(new Request("http://local.test/api/keys/activate", {
    method: "POST",
    body: JSON.stringify({ code: legacyFreeAccessCode.toLowerCase() })
  }));
  assert.equal(response.status, 403);
  assert.match(((await response.json()) as { error: string }).error, /inactive|expiree/i);
  const trials = await sql`select email, email_sent_at, created_at from free_trials where email='legacy@example.invalid'`;
  assert.equal(trials.length, 1);
  const [trial] = trials;
  assert.equal(trial.email, "legacy@example.invalid");
  assert.equal(trial.email_sent_at, trial.created_at);
  assert.equal((await repo.findKeyByCode(legacyDuplicateCode))!.isActive, false);
});

test("analysis rejects missing physical file before AI without consuming quota", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const { storage } = await import("../lib/server/storage");
  const key = { ...fakeKey(), usesRemaining: 1 };
  await repo.saveKey(key);
  const id = randomUUID();
  const document = ((await (await uploadRequest(key.code, id, undefined, "mobile")).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  await storage.delete(document.physicalFileName);
  const calls = aiRequests;
  const response = await POST(analysisRequest(key.code, [document]));
  assert.equal(response.status, 422);
  assert.match(((await response.json()) as { error: string }).error, /fichier source indisponible/i);
  assert.equal(aiRequests, calls);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 1);
  assert.equal(await repo.getAnalysisByKey(key.code), null);
});

test("analysis rejects forged physical paths and ignores other client metadata", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const key = { ...fakeKey(), usesRemaining: 1 };
  await repo.saveKey(key);
  const id = randomUUID();
  const uploaded = ((await (await uploadRequest(key.code, id, undefined, "mobile")).json()) as {
    document: UploadedDocument & { physicalFileName: string };
  }).document;
  const calls = aiRequests;
  const rejected = await POST(analysisRequest(key.code, [{ ...uploaded, physicalFileName: "../../../etc/passwd" }]));
  assert.equal(rejected.status, 403);
  assert.doesNotMatch(await rejected.text(), /etc[\\/]passwd/i);
  assert.equal(aiRequests, calls);

  aiReply = remapAiPayload({ mobile: id });
  const accepted = await POST(analysisRequest(key.code, [{
    id,
    fileName: "forged.csv",
    fileSize: 1,
    mimeType: "text/csv",
    documentType: "electricity_invoice",
    provider: "FORGED"
  }]));
  assert.equal(accepted.status, 200);
  const analysis = ((await accepted.json()) as { analysis: { documents: UploadedDocument[] } }).analysis;
  assert.equal(analysis.documents[0].fileName, uploaded.fileName);
  assert.equal(analysis.documents[0].mimeType, "application/pdf");
  assert.equal(analysis.documents[0].documentType, "mobile_invoice");
  assert.equal(analysis.documents[0].provider, "NRJ Mobile");
});

test("EDF-only analysis produces one electricity expense", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload(["edf"]);
  const result = await analyzeDocumentsWithAI([householdDocuments[0]], "EDF-ONLY");
  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].provider, "EDF");
  assert.equal(result.expenses[0].documentType, "electricity_invoice");
});

test("EDF invoice keeps the TTC total as a one-time amount, not a monthly charge", async () => {
  const {
    attachDocumentProfileToExpense,
    buildDocumentPartyProfiles,
  } = await import("../features/analysis/document-profiles");
  const document: UploadedDocument & { extractedText: string } = {
    id: "edf-real-shape",
    fileName: "facture edf.jpeg",
    fileSize: 150_000,
    mimeType: "image/jpeg",
    documentType: "electricity_invoice",
    detectedCategory: ExpenseCategory.ENERGY,
    provider: "EDF",
    status: "ready",
    uploadedAt: new Date().toISOString(),
    extractedText: "Facture EDF du 04/08/2025. Electricite releve estime 80,31 EUR. TVA 16,33 EUR. Facture TTC 96,64 EUR. A payer avant le 19/08/2025.",
  };
  const expense = attachDocumentProfileToExpense({
    id: "edf-expense",
    label: "Electricite",
    provider: "EDF",
    category: ExpenseCategory.ENERGY,
    subcategory: ExpenseSubcategory.ELECTRICITY,
    isRecurring: true,
    monthlyAmount: 96.64,
    yearlyAmount: 1159.68,
    documentType: "electricity_invoice",
    sourceDocumentId: document.id,
    recurrence: "monthly",
  }, buildDocumentPartyProfiles([document]));

  assert.equal(expense.monthlyAmount, 0);
  assert.equal(expense.yearlyAmount, 96.64);
  assert.equal(expense.recurrence, "one_time");
});

test("ENGIE multi-line schedule preserves gas and electricity expenses", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  const document = {
    ...householdDocuments[0],
    id: "engie",
    fileName: "engie.pdf",
    documentType: "gas_invoice" as const,
    provider: "Engie",
    extractedText: [
      "Monsieur Jean DUPONT", "1 rue Exemple", "75001 PARIS", "ENGIE Echeancier",
      "Gaz", "Janvier 80,00 EUR", "Fevrier 80,00 EUR",
      "Electricite", "Janvier 60,00 EUR", "Fevrier 60,00 EUR", "Total prelevement 140,00 EUR",
      "Votre consommation en Gaz : 4349 kWh", "Votre consommation en Electricite : 1369 kWh"
    ].join("\n")
  };
  aiReply = {
    ...aiHouseholdPayload([]),
    detectedParties: {
      customer: { fullName: "Jean DUPONT", firstName: "Jean", lastName: "DUPONT" },
      documents: {
        engie: { documentId: "engie", documentType: "gas_invoice", providerName: "Engie", invoiceAmount: 140 }
      }
    },
    expenses: [{
      sourceDocumentId: "engie", documentType: "gas_invoice", provider: "Engie", label: "Energie",
      category: "ENERGY", monthlyAmount: 140, yearlyAmount: 1680, recurrence: "monthly", isRecurring: true
    }]
  };
  const result = await analyzeDocumentsWithAI([document], "ENGIE-MULTI");
  assert.equal(result.expenses.length, 2);
  assert.deepEqual(result.expenses.map((expense) => expense.subcategory).sort(), ["ELECTRICITY", "GAS"]);
  assert.deepEqual(result.expenses.map((expense) => expense.monthlyAmount).sort((a, b) => a - b), [60, 80]);
  const gas = result.expenses.find((expense) => expense.subcategory === ExpenseSubcategory.GAS);
  const electricity = result.expenses.find((expense) => expense.subcategory === ExpenseSubcategory.ELECTRICITY);
  assert.equal(gas?.contractDetails?.kind, "gas");
  assert.equal(electricity?.contractDetails?.kind, "electricity");
  assert.equal(gas?.contractDetails?.kind === "gas" && gas.contractDetails.annualConsumptionKwh, 4349);
  assert.equal(electricity?.contractDetails?.kind === "electricity" && electricity.contractDetails.annualConsumptionKwh, 1369);
});

test("MACIF-only analysis preserves three distinct contracts", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload(["macif"]);
  const document = { ...householdDocuments[1], extractedText: macifThreeContractText };
  const result = await analyzeDocumentsWithAI([document], "MACIF-ONLY");
  assert.equal(result.expenses.length, 3);
  assert.deepEqual(
    result.expenses.map((expense) => expense.documentType).sort(),
    ["health_insurance", "home_insurance", "two_wheeler_insurance"]
  );
});

test("SFR-box-only analysis produces one Internet expense", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload(["sfr"]);
  const result = await analyzeDocumentsWithAI([householdDocuments[2]], "SFR-ONLY");
  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].provider, "SFR");
  assert.equal(result.expenses[0].documentType, "internet_invoice");
});

test("mobile-only analysis produces one mobile expense", async () => {
  const { analyzeDocumentsWithAI } = await import("../features/analysis/ai-service");
  aiReply = aiHouseholdPayload(["mobile"]);
  const result = await analyzeDocumentsWithAI([householdDocuments[3]], "MOBILE-ONLY");
  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].provider, "NRJ Mobile");
  assert.equal(result.expenses[0].documentType, "mobile_invoice");
  assert.equal(result.expenses[0].mobileDataGB, 100);
});

test("mobile extraction preserves decimals, unlimited data, consumption and MOBILE classification", async () => {
  const {
    attachDocumentProfileToExpense,
    buildDocumentPartyProfiles
  } = await import("../features/analysis/document-profiles");

  const extract = (text: string, documentType: UploadedDocument["documentType"] = "mobile_invoice") => {
    const id = randomUUID();
    const document = {
      ...householdDocuments[3],
      id,
      documentType,
      extractedText: text
    };
    const expense: Expense = {
      id: `expense_${id}`,
      sourceDocumentId: id,
      label: "Contrat telecom",
      provider: "NRJ Mobile",
      category: documentType === "other" ? ExpenseCategory.OTHER : ExpenseCategory.TELECOM,
      subcategory:
        documentType === "other" ? ExpenseSubcategory.OTHER : ExpenseSubcategory.INTERNET,
      isRecurring: true,
      monthlyAmount: 28,
      yearlyAmount: 336,
      documentType,
      recurrence: "monthly",
      mobileDataGB: 999
    };
    return attachDocumentProfileToExpense(
      expense,
      buildDocumentPartyProfiles([document])
    );
  };

  const hundred = extract("NRJ Mobile Forfait mobile 100 Go inclus");
  assert.equal(hundred.mobileIncludedDataGB, 100);
  assert.equal(hundred.mobileDataGB, 100);

  const decimal = extract("NRJ Mobile Forfait mobile 12,5 Go inclus");
  assert.equal(decimal.mobileIncludedDataGB, 12.5);
  assert.equal(decimal.mobileDataGB, 12.5);

  const unlimited = extract("NRJ Mobile Internet mobile illimite");
  assert.equal(unlimited.mobileDataUnlimited, true);
  assert.equal(unlimited.mobileIncludedDataGB, undefined);
  assert.equal(unlimited.mobileDataGB, undefined);

  const includedAndConsumed = extract(
    "NRJ Mobile Forfait mobile 100 Go inclus. Consommation : 10 Go"
  );
  assert.equal(includedAndConsumed.mobileIncludedDataGB, 100);
  assert.equal(includedAndConsumed.mobileConsumedDataGB, 10);

  const nrj = extract("NRJ Mobile Web : 500 Go debit ajuste au-dela 248,99 Go inclus");
  assert.equal(nrj.mobileIncludedDataGB, 500);
  assert.equal(nrj.mobileConsumedDataGB, 248.99);

  const consumptionOnly = extract("NRJ Mobile Forfait mobile consommation : 10 Go");
  assert.equal(consumptionOnly.mobileConsumedDataGB, 10);
  assert.equal(consumptionOnly.mobileIncludedDataGB, undefined);
  assert.equal(consumptionOnly.mobileDataGB, undefined);

  const mobileContainingInternet = extract(
    "NRJ Mobile facture pour une ligne et un forfait internet mobile 80 Go inclus",
    "other"
  );
  assert.equal(mobileContainingInternet.documentType, "mobile_invoice");
  assert.equal(mobileContainingInternet.category, ExpenseCategory.TELECOM);
  assert.equal(mobileContainingInternet.subcategory, ExpenseSubcategory.MOBILE);
});

test("mobile PDF normalization separates recurring prices, invoice totals and data usage", async () => {
  const {
    attachDocumentProfileToExpense,
    buildDocumentPartyProfiles
  } = await import("../features/analysis/document-profiles");

  const normalizeMobileExpense = (
    fileName: string,
    extractedText: string,
    provider: string,
    monthlyAmount: number
  ) => {
    const id = randomUUID();
    const document: UploadedDocument & { extractedText: string } = {
      ...householdDocuments[3],
      id,
      fileName,
      provider,
      documentType: "mobile_invoice",
      extractedText
    };
    const expense: Expense = {
      id: `expense_${id}`,
      sourceDocumentId: id,
      label: "Forfait mobile",
      provider,
      category: ExpenseCategory.TELECOM,
      subcategory: ExpenseSubcategory.MOBILE,
      isRecurring: true,
      monthlyAmount,
      yearlyAmount: monthlyAmount * 12,
      documentType: "mobile_invoice",
      recurrence: "monthly",
      mobileDataGB: 5,
      mobileIncludedDataGB: 5
    };

    return attachDocumentProfileToExpense(
      expense,
      buildDocumentPartyProfiles([document])
    );
  };

  const free = normalizeMobileExpense(
    "facture-free-mobile.pdf",
    [
      "Free Mobile Total de la facture HT 23,35 € TVA 4,67 € Somme à payer TTC* 28,02 €",
      "Abonnement “Forfait Free 5G+” 19,99 (16,66)",
      "Remise abonné Freebox - Free Family -10,00 (-8,33)",
      "Internet depuis la France métropolitaine 7,447 Go 0,00",
      "Services fournis par des tiers Services ponctuels",
      "Offre sans engagement"
    ].join(" "),
    "Free",
    23.35
  );
  assert.equal(free.provider, "Free Mobile");
  assert.equal(free.mobileInvoiceTotalTTC, 28.02);
  assert.equal(free.mobileInvoiceTotalHT, 23.35);
  assert.equal(free.mobileSubscriptionBeforeDiscount, 19.99);
  assert.equal(free.mobileDiscountAmount, -10);
  assert.equal(free.monthlyAmount, 9.99);
  assert.equal(free.yearlyAmount, 119.88);
  assert.equal(free.mobileConsumedDataGB, 7.447);
  assert.equal(free.mobileIncludedDataGB, undefined);
  assert.equal(free.mobileDataGB, undefined);
  assert.equal(free.mobileDataUnlimited, false);
  assert.equal(free.mobileHasOneOffCharges, true);
  assert.equal(free.mobileCommitment, "none");
  assert.equal(free.mobileRecurringAmountNeedsConfirmation, false);

  const nrj = normalizeMobileExpense(
    "facture-nrj-mobile.pdf",
    [
      "NRJ Mobile Série spéciale NRJ Mobile illimitée 24.99 20.83",
      "Remise 7,50€ -6.25 -7.50",
      "Montant de votre facture 14.57 17.49",
      "Web : 500 Go débit ajusté au-delà 248.99 Go Inclus",
      "42 Go depuis l'Europe et les DOM",
      "Appels illimités SMS illimités"
    ].join(" "),
    "Bouygues Telecom",
    17.49
  );
  assert.equal(nrj.provider, "NRJ Mobile");
  assert.equal(nrj.mobileInvoiceTotalTTC, 17.49);
  assert.equal(nrj.mobileInvoiceTotalHT, 14.57);
  assert.equal(nrj.mobileSubscriptionBeforeDiscount, 24.99);
  assert.equal(nrj.mobileDiscountAmount, -7.5);
  assert.equal(nrj.monthlyAmount, 17.49);
  assert.equal(nrj.mobileIncludedDataGB, 500);
  assert.equal(nrj.mobileConsumedDataGB, 248.99);
  assert.equal(nrj.mobileRoamingIncludedDataGB, 42);
  assert.equal(nrj.mobileDataUnlimited, false);
  assert.equal(nrj.mobileRecurringAmountNeedsConfirmation, false);

  const unknown5g = normalizeMobileExpense(
    "facture-free-mobile.pdf",
    "Free Mobile Forfait Free 5G+ Appels illimités SMS illimités Total TTC 28,02 €",
    "Free",
    28.02
  );
  assert.equal(unknown5g.mobileIncludedDataGB, undefined);
  assert.equal(unknown5g.mobileDataUnlimited, false);
  assert.equal(unknown5g.monthlyAmount, 0);
  assert.equal(unknown5g.mobileRecurringAmountNeedsConfirmation, true);
});

test("uncertain mobile recurring totals do not produce alternatives", async () => {
  const { findAlternativeOffers } = await import("../features/recommendations/service");
  const expense: Expense = {
    id: `mobile_${randomUUID()}`,
    label: "Forfait mobile",
    provider: "Operateur mobile",
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.MOBILE,
    isRecurring: true,
    monthlyAmount: 0,
    yearlyAmount: 0,
    documentType: "mobile_invoice",
    recurrence: "monthly",
    mobileIncludedDataGB: 100,
    mobileRecurringAmountNeedsConfirmation: true
  };

  assert.deepEqual(findAlternativeOffers([expense], {
    mobileCatalog: getTestMobileCatalog()
  }), []);
});

test("latest alternatives request rejects stale out-of-order responses", async () => {
  const { LatestRequestController } = await import(
    "../features/analysis/latest-request"
  );
  const controller = new LatestRequestController();
  const first = controller.start();
  const second = controller.start();

  assert.equal(first.signal.aborted, true);
  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
  controller.finish(second);
  assert.equal(controller.isCurrent(second), true);
  controller.cancel();
  assert.equal(controller.isCurrent(second), false);
});

test("mobile comparison uses included data and separates opt-in lower-data compromises", async () => {
  const { findAlternativeOffers, isPrimaryAlternative } = await import(
    "../features/recommendations/service"
  );
  const options = {
    mobileCatalog: getTestMobileCatalog()
  };
  const mobileExpense = (overrides: Partial<Expense> = {}): Expense => ({
    id: `mobile_${randomUUID()}`,
    label: "Forfait mobile",
    provider: "Operateur actuel",
    category: ExpenseCategory.TELECOM,
    subcategory: ExpenseSubcategory.MOBILE,
    isRecurring: true,
    monthlyAmount: 28,
    yearlyAmount: 336,
    documentType: "mobile_invoice",
    recurrence: "monthly",
    mobileDataGB: 100,
    mobileIncludedDataGB: 100,
    mobileAllowLowerDataOffers: false,
    ...overrides
  });

  const current = mobileExpense({ mobileConsumedDataGB: 10 });
  const strictOffers = findAlternativeOffers([current], options);
  assert.ok(strictOffers.length > 0);
  assert.ok(strictOffers.every(isPrimaryAlternative));
  assert.ok(
    strictOffers.every(
      (offer) => offer.mobileDataUnlimited || (offer.mobileDataLimitGB ?? 0) >= 100
    )
  );

  const optedIn = findAlternativeOffers([
    {
      ...current,
      mobileAllowLowerDataOffers: true,
      mobileMinimumDataGB: 5
    }
  ], options);
  const primary = optedIn.filter(isPrimaryAlternative);
  const reduced = optedIn.filter((offer) => offer.comparisonKind === "reduced_data");
  assert.deepEqual(
    primary.map((offer) => offer.id).sort(),
    strictOffers.map((offer) => offer.id).sort()
  );
  assert.ok(reduced.length > 0);
  assert.ok(reduced.every((offer) => (offer.mobileDataLimitGB ?? 0) < 100));
  assert.ok(reduced.every((offer) => (offer.mobileDataLimitGB ?? 0) >= 12));
  assert.ok(reduced.every((offer) => /compromis|non equivalente/i.test(offer.reason)));

  const decimalOffers = findAlternativeOffers([
    mobileExpense({ mobileDataGB: 12.5, mobileIncludedDataGB: 12.5 })
  ], options);
  assert.ok(decimalOffers.every((offer) => (offer.mobileDataLimitGB ?? Infinity) >= 12.5));

  const unlimitedStrict = findAlternativeOffers([
    mobileExpense({
      mobileDataGB: undefined,
      mobileIncludedDataGB: undefined,
      mobileDataUnlimited: true
    })
  ], options);
  assert.ok(unlimitedStrict.every((offer) => offer.mobileDataUnlimited));

  const unlimitedOptIn = findAlternativeOffers([
    mobileExpense({
      mobileDataGB: undefined,
      mobileIncludedDataGB: undefined,
      mobileDataUnlimited: true,
      mobileAllowLowerDataOffers: true,
      mobileMinimumDataGB: 300
    })
  ], options);
  assert.ok(unlimitedOptIn.length > 0);
  assert.ok(
    unlimitedOptIn
      .filter(isPrimaryAlternative)
      .every((offer) => offer.mobileDataUnlimited)
  );
  assert.ok(
    unlimitedOptIn
      .filter((offer) => !offer.mobileDataUnlimited)
      .every((offer) => offer.comparisonKind === "reduced_data")
  );

  const legacyOffers = findAlternativeOffers([
    mobileExpense({ mobileDataGB: 100, mobileIncludedDataGB: undefined })
  ], options);
  assert.ok(legacyOffers.length > 0);
  assert.ok(legacyOffers.every((offer) => (offer.mobileDataLimitGB ?? Infinity) >= 100));

  const second = mobileExpense({ mobileDataGB: 12.5, mobileIncludedDataGB: 12.5 });
  const multiple = findAlternativeOffers([current, second], options);
  assert.ok(multiple.some((offer) => offer.id.startsWith(`alternative_${current.id}_`)));
  assert.ok(multiple.some((offer) => offer.id.startsWith(`alternative_${second.id}_`)));
});

test("quota remains at zero after a second sequential analysis is rejected", async () => {
  const { POST } = await import("../app/api/analyse/route");
  const key = { ...fakeKey(), usesRemaining: 1 };
  await repo.saveKey(key);
  const id = randomUUID();
  const document = ((await (await uploadRequest(key.code, id, undefined, "mobile")).json()) as {
    document: UploadedDocument;
  }).document;
  aiReply = remapAiPayload({ mobile: id });
  const calls = aiRequests;
  assert.equal((await POST(analysisRequest(key.code, [document]))).status, 200);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 0);
  assert.equal((await POST(analysisRequest(key.code, [document]))).status, 403);
  assert.equal((await repo.findKeyByCode(key.code))!.usesRemaining, 0);
  assert.equal(aiRequests, calls + 1);
});

test("storage rejects a symbolic link inside UPLOADS_DIR", async () => {
  const { storage } = await import("../lib/server/storage");
  const targetDirectory = path.join(root, `symlink-target-${randomUUID()}`);
  const linkName = `symlink-${randomUUID()}.pdf`;
  const linkPath = path.join(process.env.UPLOADS_DIR!, linkName);
  await fs.mkdir(targetDirectory, { recursive: true });
  await fs.mkdir(process.env.UPLOADS_DIR!, { recursive: true });
  await fs.symlink(targetDirectory, linkPath, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(storage.get(linkName), /Fichier non autorise/);
  await assert.rejects(storage.delete(linkName), /Fichier non autorise/);
});

test("activation rejects an inactive key", async () => {
  const { POST } = await import("../app/api/keys/activate/route");
  const key = { ...fakeKey(), isActive: false };
  await repo.saveKey(key);
  const response = await POST(new Request("http://local.test/api/keys/activate", {
    method: "POST",
    body: JSON.stringify({ code: key.code })
  }));
  assert.equal(response.status, 403);
});

test("activation returns 404 for a non-existent key", async () => {
  const { POST } = await import("../app/api/keys/activate/route");
  const response = await POST(new Request("http://local.test/api/keys/activate", {
    method: "POST",
    body: JSON.stringify({ code: `MISSING-${randomUUID()}` })
  }));
  assert.equal(response.status, 404);
  assert.match(((await response.json()) as { error: string }).error, /invalide/i);
});

test("paid checkout creates one cryptographic key and replay keeps delivery idempotent", async () => {
  const { fulfillPaidCheckout } = await import("../lib/server/paid-access");
  const session = paidSession(`cs_test_${randomUUID()}`);
  await repo.saveOrder(session.id, {
    planId: "foyer",
    planName: "Audit Foyer",
    status: "pending",
    createdAt: new Date().toISOString()
  });
  let sends = 0;
  const sender = async () => { sends += 1; return { success: true }; };

  const first = await fulfillPaidCheckout(session, sender);
  const replay = await fulfillPaidCheckout(session, sender);
  assert.equal(first.key.code, replay.key.code);
  assert.equal(first.key.expiresAt, replay.key.expiresAt);
  assert.match(first.key.code, /^FF-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
  assert.equal(first.key.usesRemaining, 10);
  assert.equal(Date.parse(first.key.expiresAt) - Date.parse(first.key.createdAt), 7 * 86400000);
  assert.equal(sends, 1);
  assert.equal((await repo.getOrderBySessionId(session.id))!.emailSent, true);
});

test("two concurrent paid webhooks create and deliver exactly one key", async () => {
  const { fulfillPaidCheckout } = await import("../lib/server/paid-access");
  const session = paidSession(`cs_test_${randomUUID()}`, "famille");
  await repo.saveOrder(session.id, {
    planId: "famille",
    planName: "Audit Famille",
    status: "pending",
    createdAt: new Date().toISOString()
  });
  let sends = 0;
  const sender = async () => {
    sends += 1;
    await new Promise((resolve) => setTimeout(resolve, 75));
    return { success: true };
  };

  const [first, second] = await Promise.all([
    fulfillPaidCheckout(session, sender),
    fulfillPaidCheckout(session, sender)
  ]);
  assert.equal(first.key.code, second.key.code);
  assert.equal(first.key.usesRemaining, 50);
  assert.equal(Date.parse(first.key.expiresAt) - Date.parse(first.key.createdAt), 14 * 86400000);
  assert.equal(sends, 1);
  assert.equal((await sql`select count(*)::int as count from access_keys where code=${first.key.code}`)[0].count, 1);
});

test("Brevo failure retries the same paid key without extending expiration", async () => {
  const { fulfillPaidCheckout } = await import("../lib/server/paid-access");
  const session = paidSession(`cs_test_${randomUUID()}`);
  await repo.saveOrder(session.id, {
    planId: "foyer",
    planName: "Audit Foyer",
    status: "pending",
    createdAt: new Date().toISOString()
  });

  await assert.rejects(fulfillPaidCheckout(session, async () => ({ success: false })));
  const failedOrder = (await repo.getOrderBySessionId(session.id))!;
  const failedKey = (await repo.findKeyByCode(failedOrder.generatedKey!))!;
  assert.equal(failedOrder.status, "completed");
  assert.equal(failedOrder.emailSent, false);

  const retried = await fulfillPaidCheckout(session, async () => ({ success: true }));
  assert.equal(retried.key.code, failedKey.code);
  assert.equal(retried.key.expiresAt, failedKey.expiresAt);
  assert.equal((await repo.getOrderBySessionId(session.id))!.emailSent, true);
});

test("order status requires the signed checkout claim and refuses another session", async () => {
  const { fulfillPaidCheckout } = await import("../lib/server/paid-access");
  const { createCheckoutClaim, CHECKOUT_CLAIM_COOKIE } = await import("../lib/server/checkout-claim");
  const { GET } = await import("../app/api/orders/status/route");
  const { NextRequest } = await import("next/server");
  const session = paidSession(`cs_test_${randomUUID()}`);
  await repo.saveOrder(session.id, {
    planId: "foyer",
    planName: "Audit Foyer",
    status: "pending",
    createdAt: new Date().toISOString()
  });
  const fulfilled = await fulfillPaidCheckout(session, async () => ({ success: true }));
  const claim = createCheckoutClaim(session.id);
  const allowed = await GET(new NextRequest(`http://local.test/api/orders/status?session_id=${session.id}`, {
    headers: { cookie: `${CHECKOUT_CLAIM_COOKIE}=${claim}` }
  }));
  assert.equal(allowed.status, 200);
  assert.equal(((await allowed.json()) as { key: string }).key, fulfilled.key.code);

  const foreignSessionId = `cs_test_${randomUUID()}`;
  const refused = await GET(new NextRequest(`http://local.test/api/orders/status?session_id=${foreignSessionId}`, {
    headers: { cookie: `${CHECKOUT_CLAIM_COOKIE}=${claim}` }
  }));
  assert.equal(refused.status, 403);
});

test("letters API enforces key, expiration, plan and server-owned analysis", async () => {
  const { POST } = await import("../app/api/courriers/route");
  assert.equal((await POST(new Request("http://local.test/api/courriers", {
    method: "POST", body: JSON.stringify({})
  }))).status, 400);

  const expired = { ...fakeKey(), expiresAt: new Date(Date.now() - 1000).toISOString() };
  await repo.saveKey(expired);
  assert.equal((await POST(new Request("http://local.test/api/courriers", {
    method: "POST", body: JSON.stringify({ code: expired.code })
  }))).status, 403);

  const discovery = { ...fakeKey(), plan: "decouverte" as const };
  await repo.saveKey(discovery);
  await repo.saveAnalysis(discovery.code, analysisWithProvider(discovery.code, "DECOUVERTE"));
  assert.equal((await POST(new Request("http://local.test/api/courriers", {
    method: "POST", body: JSON.stringify({ code: discovery.code })
  }))).status, 403);

  const owner = fakeKey();
  const foreign = fakeKey();
  await repo.saveKey(owner);
  await repo.saveKey(foreign);
  await repo.saveAnalysis(owner.code, analysisWithProvider(owner.code, "EDF"));
  await repo.saveAnalysis(foreign.code, analysisWithProvider(foreign.code, "SFR"));
  const response = await POST(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: owner.code, analysis: analysisWithProvider(foreign.code, "SFR") })
  }));
  assert.equal(response.status, 200);
  const payload = JSON.stringify(await response.json());
  assert.match(payload, /EDF/);
  assert.doesNotMatch(payload, /SFR/);
});

test("alternatives API ignores browser expenses and does not expose static non-mobile offers", async () => {
  const owner = fakeKey();
  const foreign = fakeKey();
  await repo.saveKey(owner);
  await repo.saveKey(foreign);
  const ownerAnalysis = analysisWithProvider(owner.code, "EDF");
  const foreignAnalysis = analysisWithProvider(foreign.code, "SFR");
  ownerAnalysis.expenses[0].subcategory = ExpenseSubcategory.ELECTRICITY;
  foreignAnalysis.expenses[0].subcategory = ExpenseSubcategory.ELECTRICITY;
  await repo.saveAnalysis(owner.code, ownerAnalysis);
  await repo.saveAnalysis(foreign.code, foreignAnalysis);

  const { POST } = await import("../app/api/alternatives/route");
  const response = await POST(new Request("http://local.test/api/alternatives", {
    method: "POST",
    body: JSON.stringify({
      code: owner.code,
      expenses: foreignAnalysis.expenses
    })
  }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    alternatives: Array<{ sourceExpenseId?: string }>;
  };
  assert.equal(payload.alternatives.length, 0);
  assert.ok(payload.alternatives.every(
    (offer) => offer.sourceExpenseId === ownerAnalysis.expenses[0].id
  ));
  assert.ok(payload.alternatives.every(
    (offer) => offer.sourceExpenseId !== foreignAnalysis.expenses[0].id
  ));
});

test("mobile catalog persistence keeps the last valid provider data and expires it after 72 hours", async () => {
  const { refreshMobileCatalog, loadPersistedMobileCatalog } = await import(
    "../lib/server/mobile-catalog"
  );
  const verifiedAt = new Date().toISOString();
  const validResult = {
    provider: "NRJ Mobile" as const,
    sourceUrl: "https://www.nrjmobile.fr/forfait-se",
    retrievedAt: verifiedAt,
    failures: [],
    offers: [{
      provider: "NRJ Mobile" as const,
      offerName: "Forfait persistant 100 Go",
      monthlyPrice: 10,
      includedDataGB: 100,
      unlimitedData: false,
      euDataGB: 25,
      network: "Bouygues Telecom",
      technology: "5G",
      commitmentMonths: 0,
      promotionPrice: null,
      promotionDuration: null,
      priceAfterPromotion: null,
      activationFees: 0,
      simFees: 0,
      conditionalPrices: [],
      pricingTiers: [],
      conditions: [],
      evidence: ["test local"],
      sourceUrl: "https://www.nrjmobile.fr/forfait-se",
      retrievedAt: verifiedAt,
      verifiedAt,
      verificationStatus: "VERIFIED" as const
    }]
  };

  const report = await refreshMobileCatalog(async () => [validResult], new Date(verifiedAt));
  assert.equal(report.successfulCollections, 1);
  const firstLoad = await loadPersistedMobileCatalog(new Date(verifiedAt));
  const secondLoad = await loadPersistedMobileCatalog(new Date(verifiedAt));
  assert.equal(firstLoad.source, "postgresql");
  assert.equal(firstLoad.offers.length, 1);
  assert.equal(firstLoad.offers[0].catalogId, secondLoad.offers[0].catalogId);

  const failedAt = new Date(Date.parse(verifiedAt) + 60_000);
  const failedReport = await refreshMobileCatalog(async () => [{
    ...validResult,
    retrievedAt: failedAt.toISOString(),
    offers: [],
    failures: [{
      code: "EMPTY_RESPONSE",
      message: "Réponse vide simulée",
      sourceUrl: validResult.sourceUrl
    }]
  }], failedAt);
  assert.equal(failedReport.failedCollections, 1);
  const afterFailure = await loadPersistedMobileCatalog(failedAt);
  assert.equal(afterFailure.offers.length, 1);
  assert.equal(afterFailure.offers[0].offerName, "Forfait persistant 100 Go");
  const [stored] = await sql`select offers, last_error from mobile_catalog_sources where provider='NRJ Mobile'`;
  assert.equal(stored.offers.length, 1);
  assert.equal(stored.last_error[0].code, "EMPTY_RESPONSE");

  const cdiscountOffer = {
    ...validResult.offers[0],
    provider: "Cdiscount Mobile" as const,
    offerName: "Forfait isolé 10 Go",
    includedDataGB: 10,
    sourceUrl: "https://www.cdiscount.com/cdiscountmobile"
  };
  await refreshMobileCatalog(async () => [{
    provider: "Cdiscount Mobile" as const,
    sourceUrl: cdiscountOffer.sourceUrl,
    retrievedAt: verifiedAt,
    failures: [],
    offers: [cdiscountOffer]
  }], new Date(verifiedAt));
  assert.equal((await sql`select count(*)::int as count from mobile_catalog_sources`)[0].count, 2);
  await refreshMobileCatalog(async () => [{
    provider: "Cdiscount Mobile" as const,
    sourceUrl: cdiscountOffer.sourceUrl,
    retrievedAt: failedAt.toISOString(),
    failures: [],
    offers: [{ ...cdiscountOffer, network: null, retrievedAt: failedAt.toISOString() }]
  }], failedAt);
  const [cdiscountStored] = await sql`select offers from mobile_catalog_sources where provider='Cdiscount Mobile'`;
  assert.equal(cdiscountStored.offers[0].verificationStatus, "VERIFIED");

  const stale = await loadPersistedMobileCatalog(
    new Date(Date.parse(verifiedAt) + 73 * 60 * 60 * 1000)
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.offers.length, 0);
});

test("mobile catalog refresh rejects a concurrent collection without corrupting stored data", async () => {
  const { refreshMobileCatalog } = await import("../lib/server/mobile-catalog");
  const [stored] = await sql`select offers, source_url, retrieved_at from mobile_catalog_sources where provider='NRJ Mobile'`;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const hasStarted = new Promise<void>((resolve) => { started = resolve; });
  const result = {
    provider: "NRJ Mobile" as const,
    sourceUrl: stored.source_url as string,
    retrievedAt: stored.retrieved_at as string,
    offers: stored.offers,
    failures: []
  };
  const first = refreshMobileCatalog(async () => {
    started();
    await waiting;
    return [result];
  });
  await hasStarted;
  await assert.rejects(
    refreshMobileCatalog(async () => [result]),
    /déjà en cours/
  );
  release();
  await first;
  assert.equal((await sql`select count(*)::int as count from mobile_catalog_sources where provider='NRJ Mobile'`)[0].count, 1);
});

test("commercial catalog persists verified Internet offers and keeps the last valid collection", async () => {
  const { refreshCommercialCatalog, loadCommercialCatalog } = await import(
    "../lib/server/commercial-catalog"
  );
  const { parseInternetOffers } = await import(
    "../experiments/commercial-catalog/internet/collector"
  );
  const { INTERNET_SOURCES } = await import(
    "../experiments/commercial-catalog/source-registry"
  );
  const source = INTERNET_SOURCES[0];
  const collectedAt = new Date("2026-11-03T10:00:00.000Z");
  const html = await fs.readFile(
    "experiments/commercial-catalog/fixtures/internet-boxes.html",
    "utf8"
  );
  const parsed = parseInternetOffers(html, source, collectedAt.toISOString());
  const result = {
    source,
    retrievedAt: collectedAt.toISOString(),
    offers: parsed.offers,
    failures: parsed.failures,
    discoveredSources: [],
    cache: { etag: "catalog-v1", lastModified: null, contentHash: "hash-v1" },
    notModified: false
  };

  const report = await refreshCommercialCatalog(
    "internet",
    [source],
    async () => result,
    collectedAt
  );
  assert.equal(report.successfulCollections, 1);
  assert.equal(report.verifiedOffers, 1);
  const firstLoad = await loadCommercialCatalog("internet", collectedAt);
  const secondLoad = await loadCommercialCatalog("internet", collectedAt);
  assert.equal(firstLoad.status, "fresh");
  assert.equal(firstLoad.offers.length, 1);
  assert.equal(firstLoad.offers[0]?.catalogId, secondLoad.offers[0]?.catalogId);

  const failedAt = new Date(collectedAt.getTime() + 60_000);
  const failed = await refreshCommercialCatalog(
    "internet",
    [source],
    async () => ({
      ...result,
      retrievedAt: failedAt.toISOString(),
      offers: [],
      failures: [{
        code: "STRUCTURE_CHANGED",
        message: "Structure invalide simulee",
        sourceUrl: source.sourceUrl
      }],
      cache: { etag: "broken-v2", lastModified: null, contentHash: "broken-hash" }
    }),
    failedAt
  );
  assert.equal(failed.failedCollections, 1);
  const afterFailure = await loadCommercialCatalog("internet", failedAt);
  assert.equal(afterFailure.offers.length, 1);
  assert.equal(afterFailure.offers[0]?.offerName, "Box Fibre Essentiel");
  const [stored] = await sql`select offers, etag, content_hash, last_error from commercial_catalog_sources where id=${source.id}`;
  assert.equal(stored.offers.length, 2);
  assert.equal(stored.etag, "catalog-v1");
  assert.equal(stored.content_hash, "hash-v1");
  assert.equal(stored.last_error[0].code, "STRUCTURE_CHANGED");

  const stale = await loadCommercialCatalog(
    "internet",
    new Date(collectedAt.getTime() + 73 * 60 * 60 * 1000)
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.offers.length, 0);
});

test("commercial catalog rejects concurrent refreshes for the same sector", async () => {
  const { refreshCommercialCatalog } = await import("../lib/server/commercial-catalog");
  const { INTERNET_SOURCES } = await import(
    "../experiments/commercial-catalog/source-registry"
  );
  const source = INTERNET_SOURCES[0];
  const [stored] = await sql`select offers, retrieved_at, etag, content_hash from commercial_catalog_sources where id=${source.id}`;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const hasStarted = new Promise<void>((resolve) => { started = resolve; });
  const result = {
    source,
    retrievedAt: stored.retrieved_at as string,
    offers: stored.offers,
    failures: [],
    discoveredSources: [],
    cache: {
      etag: stored.etag as string,
      lastModified: null,
      contentHash: stored.content_hash as string
    },
    notModified: false
  };
  const first = refreshCommercialCatalog("internet", [source], async () => {
    started();
    await waiting;
    return result;
  });
  await hasStarted;
  await assert.rejects(
    refreshCommercialCatalog("internet", [source], async () => result),
    /deja en cours/
  );
  release();
  await first;
  assert.equal(
    (await sql`select count(*)::int as count from commercial_catalog_sources where id=${source.id}`)[0].count,
    1
  );
});

test("results, report and letters use the same fresh certified mobile offer", async () => {
  const key = { ...fakeKey(), plan: "famille" as const };
  await repo.saveKey(key);
  const analysis: MockAnalysis = {
    ...emptyAnalysis(key.code),
    expenses: [{
      id: "mobile-coherence",
      label: "Forfait mobile",
      provider: "Opérateur actuel",
      category: ExpenseCategory.TELECOM,
      subcategory: ExpenseSubcategory.MOBILE,
      isRecurring: true,
      monthlyAmount: 30,
      yearlyAmount: 360,
      recurrence: "monthly",
      documentType: "mobile_invoice",
      mobileIncludedDataGB: 100,
      mobileDataGB: 100
    }],
    totalMonthlyAmount: 30,
    totalYearlyAmount: 360
  };
  await repo.saveAnalysis(key.code, analysis);

  const { POST: alternativesPost } = await import("../app/api/alternatives/route");
  const alternativesResponse = await alternativesPost(new Request("http://local.test/api/alternatives", {
    method: "POST",
    body: JSON.stringify({ code: key.code })
  }));
  assert.equal(alternativesResponse.status, 200);
  const alternativesPayload = (await alternativesResponse.json()) as {
    alternatives: Array<import("../features/recommendations/service").AlternativeOffer>;
  };
  const selected = alternativesPayload.alternatives.find(
    (offer) =>
      offer.sourceExpenseId === "mobile-coherence" &&
      offer.provider === "NRJ Mobile" &&
      offer.savingKind === "certified"
  );
  assert.ok(selected);

  const { POST: lettersPost } = await import("../app/api/courriers/route");
  const lettersResponse = await lettersPost(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: key.code, selectedOfferId: selected.id })
  }));
  assert.equal(lettersResponse.status, 200);
  const lettersPayload = (await lettersResponse.json()) as {
    selectionStatus: string;
    letters: Array<import("../types").GeneratedLetter>;
  };
  assert.equal(lettersPayload.selectionStatus, "valid");
  assert.ok(lettersPayload.letters.some((letter) =>
    letter.offerProvider === selected.provider &&
    letter.offerEstimatedYearlySaving === selected.estimatedYearlySaving
  ));

  const { generatePdfReport } = await import("../features/reports/service");
  let report = "";
  const events = jsPDF.API.events;
  const capture = ["initialized", function (this: jsPDF) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.save as any) = () => { report = this.output(); return this; };
  }] as typeof events[number];
  events.push(capture);
  try {
    await generatePdfReport(analysis, alternativesPayload.alternatives, lettersPayload.letters);
  } finally {
    events.splice(events.indexOf(capture), 1);
  }
  assert.ok(report.includes(selected.provider));
  assert.ok(report.includes("Détail des comparaisons mobiles"));

  const [source] = await sql`select offers from mobile_catalog_sources where provider='NRJ Mobile'`;
  const staleOffers = source.offers.map((offer: Record<string, unknown>) => ({
    ...offer,
    retrievedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    verifiedAt: new Date(Date.now() - 4 * 86400000).toISOString()
  }));
  await sql`update mobile_catalog_sources set offers=${sql.json(staleOffers)} where provider='NRJ Mobile'`;
  const staleLetters = await lettersPost(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: key.code, selectedOfferId: selected.id })
  }));
  const stalePayload = (await staleLetters.json()) as { selectionStatus: string; letters: Array<import("../types").GeneratedLetter> };
  assert.equal(stalePayload.selectionStatus, "stale_or_ineligible");
  assert.ok(stalePayload.letters.every((letter) => !letter.offerName));
  const restoredAt = new Date().toISOString();
  const restoredOffers = staleOffers.map((offer: Record<string, unknown>) => ({
    ...offer,
    retrievedAt: restoredAt,
    verifiedAt: restoredAt
  }));
  await sql`update mobile_catalog_sources set offers=${sql.json(restoredOffers)}, retrieved_at=${restoredAt} where provider='NRJ Mobile'`;
});

test("recurring-only mobile offer stays selectable without becoming certified", async () => {
  const [storedSource] = await sql`
    select offers, retrieved_at from mobile_catalog_sources where provider='NRJ Mobile'
  `;
  const originalOffers = storedSource.offers;
  const originalRetrievedAt = storedSource.retrieved_at as string;
  const freshAt = new Date().toISOString();
  const recurringOffers = originalOffers.map((offer: Record<string, unknown>, index: number) => ({
    ...offer,
    provider: "NRJ Mobile",
    offerName: index === 0 ? "Forfait test 100 Go" : `Forfait test ${200 + index * 100} Go`,
    monthlyPrice: 9.99 + index,
    includedDataGB: index === 0 ? 100 : 200 + index * 100,
    promotionPrice: null,
    promotionDuration: null,
    priceAfterPromotion: null,
    activationFees: null,
    simFees: null,
    billingPeriodDays: index === 0 ? 30 : null,
    offerUrl: null,
    retrievedAt: freshAt,
    verifiedAt: freshAt,
    verificationStatus: "VERIFIED"
  }));
  await sql`
    update mobile_catalog_sources
    set offers=${sql.json(recurringOffers)}, retrieved_at=${freshAt}, last_success_at=${freshAt}
    where provider='NRJ Mobile'
  `;

  try {
    const key = { ...fakeKey(), plan: "famille" as const };
    await repo.saveKey(key);
    const analysis: MockAnalysis = {
      ...emptyAnalysis(key.code),
      expenses: [{
        id: "mobile-recurring-only",
        label: "Forfait mobile SFR 100 Go",
        provider: "SFR",
        category: ExpenseCategory.TELECOM,
        subcategory: ExpenseSubcategory.MOBILE,
        isRecurring: true,
        monthlyAmount: 22,
        yearlyAmount: 264,
        recurrence: "monthly",
        documentType: "mobile_invoice",
        mobileIncludedDataGB: 100,
        mobileDataGB: 100
      }],
      totalMonthlyAmount: 22,
      totalYearlyAmount: 264
    };
    await repo.saveAnalysis(key.code, analysis);

    const { POST: alternativesPost } = await import("../app/api/alternatives/route");
    const alternativesResponse = await alternativesPost(new Request("http://local.test/api/alternatives", {
      method: "POST",
      body: JSON.stringify({ code: key.code })
    }));
    const alternativesPayload = (await alternativesResponse.json()) as {
      alternatives: Array<import("../features/recommendations/service").AlternativeOffer>;
    };
    const selected = alternativesPayload.alternatives.find(
      (offer) => offer.sourceExpenseId === "mobile-recurring-only" && offer.savingKind === "recurring_only"
    );
    assert.ok(selected);
    assert.ok(selected.estimatedYearlySaving > 0);
    assert.equal(selected.netFirstYearSaving, undefined);
    assert.equal(selected.billingPeriodDays, 30);

    const { buildFinancialSummary } = await import("../features/reports/financial-summary");
    const summary = buildFinancialSummary(
      analysis,
      alternativesPayload.alternatives,
      [{
        expenseId: "mobile-recurring-only",
        status: "alternative_found",
        message: "Alternative tarifaire disponible"
      }],
      []
    );
    assert.equal(summary.potentialYearlySaving, 0);

    const { POST: lettersPost } = await import("../app/api/courriers/route");
    const lettersResponse = await lettersPost(new Request("http://local.test/api/courriers", {
      method: "POST",
      body: JSON.stringify({ code: key.code, selectedOfferId: selected.id })
    }));
    assert.equal(lettersResponse.status, 200);
    const lettersPayload = (await lettersResponse.json()) as {
      selectionStatus: string;
      selectedOffer: import("../features/recommendations/selected-offer").SelectedAlternativeOffer;
      letters: GeneratedLetter[];
    };
    assert.equal(lettersPayload.selectionStatus, "valid");
    assert.equal(lettersPayload.selectedOffer.savingKind, "recurring_only");
    assert.equal(lettersPayload.selectedOffer.billingPeriodDays, 30);
    const selectedLetter = lettersPayload.letters.find(
      (letter) => letter.offerProvider === selected.provider
    );
    assert.ok(selectedLetter);
    assert.equal(selectedLetter.offerEstimatedYearlySaving, selected.estimatedYearlySaving);
    assert.equal(selectedLetter.offerSavingKind, "recurring_only");
    assert.match(selectedLetter.bodyTemplate, /ni nette ni garantie/i);
    assert.match(selectedLetter.bodyTemplate, /tous les 30 jours/i);

    const { generatePdfReport } = await import("../features/reports/service");
    let report = "";
    const events = jsPDF.API.events;
    const capture = ["initialized", function (this: jsPDF) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.save as any) = () => { report = this.output(); return this; };
    }] as typeof events[number];
    events.push(capture);
    try {
      await generatePdfReport(
        analysis,
        alternativesPayload.alternatives,
        lettersPayload.letters,
        lettersPayload.selectedOffer
      );
    } finally {
      events.splice(events.indexOf(capture), 1);
    }
    assert.ok(report.includes(selected.provider));
    assert.ok(report.includes("Estimation tarifaire hors frais ponctuels"));

    const staleAt = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    const staleOffers = recurringOffers.map((offer: Record<string, unknown>) => ({
      ...offer,
      retrievedAt: staleAt,
      verifiedAt: staleAt
    }));
    await sql`
      update mobile_catalog_sources
      set offers=${sql.json(staleOffers)}, retrieved_at=${staleAt}, last_success_at=${staleAt}
      where provider='NRJ Mobile'
    `;
    const staleLetters = await lettersPost(new Request("http://local.test/api/courriers", {
      method: "POST",
      body: JSON.stringify({ code: key.code, selectedOfferId: selected.id })
    }));
    const stalePayload = (await staleLetters.json()) as { selectionStatus: string };
    assert.equal(stalePayload.selectionStatus, "stale_or_ineligible");
  } finally {
    await sql`
      update mobile_catalog_sources
      set offers=${sql.json(originalOffers)}, retrieved_at=${originalRetrievedAt}, last_success_at=${originalRetrievedAt}
      where provider='NRJ Mobile'
    `;
  }
});

test("missing and invalid expirations are rejected fail-closed", async () => {
  const { GET } = await import("../app/api/keys/status/route");
  for (const expiresAt of ["", "not-a-date"]) {
    const key = { ...fakeKey(), expiresAt };
    await repo.saveKey(key);
    const response = await GET(new Request("http://local.test/api/keys/status", {
      headers: { "x-futeo-access-key": key.code }
    }));
    assert.equal(response.status, 403);
  }
});

test("server key generator preserves discovery and paid formats", async () => {
  const { generateServerAccessKeyCode } = await import("../lib/server/access-key-generator");
  assert.match(generateServerAccessKeyCode("discovery"), /^FUTEO-DECOUVERTE-[A-F0-9]{32}$/);
  assert.match(generateServerAccessKeyCode("paid"), /^FF-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
});

test("structured logger masks access keys and personal document metadata", async () => {
  const { logger } = await import("../lib/server/logger");
  const previousNodeEnv = process.env.NODE_ENV;
  const originalConsoleLog = console.log;
  let output = "";
  console.log = (...values: unknown[]) => {
    output += values.map(String).join(" ");
  };
  Reflect.set(process.env, "NODE_ENV", "production");

  try {
    logger.info("Journal securise", {
      service: "SecurityTest",
      action: "mask",
      keyCode: "FUTEO-DECOUVERTE-0123456789ABCDEF0123456789ABCDEF",
      metadata: {
        email: "person@example.invalid",
        name: "facture-personnelle.pdf",
        extractedText: "contenu confidentiel"
      }
    });
  } finally {
    console.log = originalConsoleLog;
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    }
  }

  assert.doesNotMatch(output, /FUTEO-DECOUVERTE-0123456789ABCDEF0123456789ABCDEF/);
  assert.doesNotMatch(output, /person@example\.invalid|facture-personnelle\.pdf|contenu confidentiel/);
  assert.match(output, /\[MASQUE\]/);
});

test("status uses a header and existing key formats remain compatible", async () => {
  const { GET } = await import("../app/api/keys/status/route");
  const { POST } = await import("../app/api/keys/activate/route");
  const code = "FUTEO-LEGACY-COMPATIBLE-001";
  const key = { ...fakeKey(code), plan: "foyer" as const, usesRemaining: 7 };
  await repo.saveKey(key);

  const legacyQuery = await GET(new Request(`http://local.test/api/keys/status?code=${code}`));
  assert.equal(legacyQuery.status, 400);

  const status = await GET(new Request("http://local.test/api/keys/status", {
    headers: { "x-futeo-access-key": code, "x-forwarded-for": "198.51.100.10" }
  }));
  assert.equal(status.status, 200);
  const payload = await status.json() as { key: { code: string; plan: string }; usesRemaining: number };
  assert.equal(payload.key.code, code);
  assert.equal(payload.key.plan, "foyer");
  assert.equal(payload.usesRemaining, 7);

  const activation = await POST(new Request("http://local.test/api/keys/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.11" },
    body: JSON.stringify({ code })
  }));
  assert.equal(activation.status, 200);
  assert.equal((await activation.json() as { key: { code: string } }).key.code, code);
});

test("application sources do not generate access-key query strings", async () => {
  for (const file of [
    "features/billing/access-keys.ts",
    "features/analysis/storage.ts",
    "features/upload/storage.ts",
    "features/privacy/lifecycle.ts",
    "features/upload/ImportDocumentsPanel.tsx",
    "scripts/smoke-test-api.ts"
  ]) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /\/api\/(?:keys\/status|documents|analyse)\?code=/, file);
  }
});

test("progressive imports append directly and keep new audit as a distinct action", async () => {
  const source = await fs.readFile("features/upload/ImportDocumentsPanel.tsx", "utf8");
  assert.doesNotMatch(source, /Ajouter à cet audit|pendingFiles|queueFilesForAuditChoice/);
  assert.match(source, /Commencer un nouvel audit/);
  assert.match(source, /addFiles\(event\.target\.files, "replace"\)/);
  assert.match(source, /appendFiles\(event\.target\.files\)/);
});

test("optimization score stays undetermined until comparisons are conclusive", async () => {
  const { getOptimizationScore } = await import("../features/reports/ReportPanel");
  const analysis = analysisWithProvider("SCORE", "EDF");
  const disabled = [{
    expenseId: analysis.expenses[0].id,
    status: "disabled" as const,
    message: "Comparateur desactive",
  }];
  const conclusive = [{
    expenseId: analysis.expenses[0].id,
    status: "no_better_offer" as const,
    message: "Aucune meilleure offre",
  }];

  assert.equal(getOptimizationScore(analysis, []), null);
  assert.equal(getOptimizationScore(analysis, disabled), null);
  assert.equal(getOptimizationScore(analysis, conclusive), 100);
});

test("financial summary separates current, potential and realized savings without double counting", async () => {
  const { buildFinancialSummary } = await import("../features/reports/financial-summary");
  const analysis = analysisWithProvider("FINANCIAL", "Free");
  analysis.expenses[0] = {
    ...analysis.expenses[0],
    id: "expense-recurring",
    isRecurring: true,
    recurrence: "monthly",
    monthlyAmount: 50,
    yearlyAmount: 600
  };
  analysis.expenses.push({
    ...analysis.expenses[0],
    id: "expense-one-time",
    label: "Facture ponctuelle",
    provider: "EDF",
    isRecurring: false,
    recurrence: "one_time",
    monthlyAmount: 0,
    yearlyAmount: 96.64
  });
  analysis.totalMonthlyAmount = 50;
  analysis.totalYearlyAmount = 696.64;
  const alternatives = [{
    id: "alternative_expense-recurring_verified",
    sourceExpenseId: "expense-recurring",
    category: analysis.expenses[0].category,
    provider: "Alternative fiable",
    name: "Tarif vérifié",
    url: "https://example.invalid/offer",
    monthlyPrice: 30,
    yearlyPrice: 360,
    estimatedYearlySaving: 240,
    reason: "Comparaison fiable",
    action: "Vérifier",
    comparisonKind: "equivalent" as const,
    savingKind: "certified" as const
  }];
  const realizedSavings = [{
    id: "expense-recurring:confirmed-reduction",
    auditId: analysis.id,
    expenseId: "expense-recurring",
    previousMonthlyAmount: 50,
    newMonthlyAmount: 40,
    effectiveDate: "2026-11-01",
    confirmedAt: "2026-10-31T12:00:00.000Z",
    updatedAt: "2026-10-31T12:00:00.000Z"
  }];
  const states = [{
    expenseId: "expense-recurring",
    status: "alternative_found" as const,
    message: "Alternative disponible"
  }];

  const summary = buildFinancialSummary(
    analysis,
    alternatives,
    states,
    realizedSavings,
    new Date("2026-11-04T12:00:00.000Z")
  );
  assert.equal(summary.currentMonthlyAmount, 40);
  assert.equal(summary.currentYearlyAmount, 576.64);
  assert.equal(summary.realizedMonthlySaving, 10);
  assert.equal(summary.realizedYearlySaving, 120);
  assert.equal(summary.potentialMonthlySaving, 10);
  assert.equal(summary.potentialYearlySaving, 120);
  assert.equal(summary.projectedMonthlyAmount, 30);
  assert.equal(summary.projectedYearlyAmount, 456.64);
  assert.equal(summary.contracts["expense-one-time"].currentYearlyAmount, 96.64);
});

test("future reductions and unreliable offers are not counted as achieved or guaranteed", async () => {
  const { buildFinancialSummary } = await import("../features/reports/financial-summary");
  const analysis = analysisWithProvider("FUTURE-SAVING", "EDF");
  analysis.expenses[0] = {
    ...analysis.expenses[0],
    id: "expense-future",
    monthlyAmount: 50,
    yearlyAmount: 600,
    isRecurring: true,
    recurrence: "monthly"
  };
  analysis.totalMonthlyAmount = 50;
  analysis.totalYearlyAmount = 600;
  const unreliableOffer = [{
    id: "alternative_expense-future_partial",
    sourceExpenseId: "expense-future",
    category: analysis.expenses[0].category,
    provider: "Offre partielle",
    name: "Conditions inconnues",
    url: "https://example.invalid/partial",
    monthlyPrice: 20,
    yearlyPrice: 240,
    estimatedYearlySaving: 360,
    reason: "Frais inconnus",
    action: "Confirmer",
    comparisonKind: "requires_validation" as const,
    savingKind: "recurring_only" as const
  }];
  const futureSaving = [{
    id: "expense-future:confirmed-reduction",
    auditId: analysis.id,
    expenseId: "expense-future",
    previousMonthlyAmount: 50,
    newMonthlyAmount: 40,
    effectiveDate: "2026-12-01",
    confirmedAt: "2026-11-04T12:00:00.000Z",
    updatedAt: "2026-11-04T12:00:00.000Z"
  }];
  const summary = buildFinancialSummary(
    analysis,
    unreliableOffer,
    [{ expenseId: "expense-future", status: "unavailable", message: "Catalogue incomplet" }],
    futureSaving,
    new Date("2026-11-04T12:00:00.000Z")
  );

  assert.equal(summary.currentMonthlyAmount, 50);
  assert.equal(summary.realizedYearlySaving, 0);
  assert.equal(summary.potentialYearlySaving, 0);
  assert.equal(summary.potentialStatus, "undetermined");
  assert.equal(summary.contracts["expense-future"].realizedSavingIsEffective, false);
});

test("confirmed reductions persist per access key and preserve the original amount", async () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage }
  });

  try {
    const {
      confirmRealizedSaving,
      getRealizedSavingRecords
    } = await import("../features/reports/financial-summary");
    const analysis = analysisWithProvider("PERSISTED-SAVING", "SFR");
    const expense = {
      ...analysis.expenses[0],
      id: "expense-persisted",
      monthlyAmount: 50,
      yearlyAmount: 600,
      isRecurring: true,
      recurrence: "monthly" as const
    };
    confirmRealizedSaving("KEY-A", {
      auditId: analysis.id,
      expense,
      newMonthlyAmount: 40,
      effectiveDate: "2026-11-01"
    }, new Date("2026-11-02T10:00:00.000Z"));
    confirmRealizedSaving("KEY-A", {
      auditId: analysis.id,
      expense: { ...expense, monthlyAmount: 40 },
      newMonthlyAmount: 35,
      effectiveDate: "2026-11-03"
    }, new Date("2026-11-03T10:00:00.000Z"));

    const records = getRealizedSavingRecords("KEY-A");
    assert.equal(records.length, 1);
    assert.equal(records[0].previousMonthlyAmount, 50);
    assert.equal(records[0].newMonthlyAmount, 35);
    assert.equal(records[0].effectiveDate, "2026-11-03");
    assert.deepEqual(getRealizedSavingRecords("KEY-B"), []);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("report exposes the financial overview and requires explicit reduction confirmation", async () => {
  const reportSource = await fs.readFile("features/reports/ReportPanel.tsx", "utf8");
  const financialSource = await fs.readFile("features/reports/financial-summary.ts", "utf8");
  assert.match(reportSource, /Vos dépenses actuelles/);
  assert.match(reportSource, /Vos économies potentielles/);
  assert.match(reportSource, /Vos économies réalisées/);
  assert.match(reportSource, /Votre budget après optimisation/);
  assert.match(reportSource, /Confirmer une réduction effectivement obtenue/);
  assert.doesNotMatch(financialSource, /letter_downloaded|letter_email_prepared|report_downloaded/);
});

test("activation and status endpoints are rate limited per IP", async () => {
  const { POST } = await import("../app/api/keys/activate/route");
  const { GET } = await import("../app/api/keys/status/route");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await POST(new Request("http://local.test/api/keys/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.20" },
      body: JSON.stringify({ code: `MISSING-ACTIVATION-${attempt}` })
    }));
    assert.equal(response.status, 404);
  }
  const blockedActivation = await POST(new Request("http://local.test/api/keys/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.20" },
    body: JSON.stringify({ code: "MISSING-ACTIVATION-BLOCKED" })
  }));
  assert.equal(blockedActivation.status, 429);
  assert.equal(blockedActivation.headers.get("retry-after"), "60");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await GET(new Request("http://local.test/api/keys/status", {
      headers: {
        "x-futeo-access-key": `MISSING-STATUS-${attempt}`,
        "x-forwarded-for": "198.51.100.21"
      }
    }));
    assert.equal(response.status, 404);
  }
  const blockedStatus = await GET(new Request("http://local.test/api/keys/status", {
    headers: {
      "x-futeo-access-key": "MISSING-STATUS-BLOCKED",
      "x-forwarded-for": "198.51.100.21"
    }
  }));
  assert.equal(blockedStatus.status, 429);
  assert.equal(blockedStatus.headers.get("retry-after"), "60");
});

test("redirect sanitizer refuses external and executable destinations", async () => {
  const { sanitizeInternalRedirect } = await import("../lib/internal-redirect");
  assert.equal(sanitizeInternalRedirect("/rapport"), "/rapport");
  for (const value of ["https://example.com", "//example.com", "javascript:alert(1)", "data:text/html,test", "/unknown"]) {
    assert.equal(sanitizeInternalRedirect(value), "/tableau-de-bord");
  }
});

test("production environment and cron purge fail closed", async () => {
  const { parseEnvironment } = await import("../lib/env");
  assert.throws(() => parseEnvironment({ NODE_ENV: "production" }), /Configuration de production invalide/);
  const productionEnv = parseEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://futeo:test@127.0.0.1:5432/futeo",
    NEXT_PUBLIC_BASE_URL: "https://www.futeo.fr",
    NEXT_PUBLIC_APP_URL: "https://www.futeo.fr",
    UPLOADS_DIR: "/app/server-data/uploads",
    BREVO_FROM_EMAIL: ""
  });
  assert.equal(productionEnv.NEXT_PUBLIC_BASE_URL, "https://www.futeo.fr");
  assert.equal(productionEnv.BREVO_FROM_EMAIL, undefined);
  assert.throws(() => parseEnvironment({
    ...productionEnv,
    NODE_ENV: "production",
    BREVO_FROM_EMAIL: "not-an-email"
  }), /Configuration de production invalide/);

  const previousSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const { POST } = await import("../app/api/cron/purge/route");
    const response = await POST(new Request("http://local.test/api/cron/purge", { method: "POST" }));
    assert.equal(response.status, 401);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

registerE2eWorkflows({
  async createKey(usesRemaining = 1) {
    const key = { ...fakeKey(), usesRemaining };
    await repo.saveKey(key);
    return key;
  },
  async upload(code, id, fixtureId, text) {
    return uploadRequest(code, id, text ? pdfFile(`${id}.pdf`, text) : undefined, fixtureId);
  },
  async analyze(code, documents) {
    const { POST } = await import("../app/api/analyse/route");
    return POST(analysisRequest(code, documents));
  },
  setAiReply(reply) {
    aiReply = reply;
  }
});
