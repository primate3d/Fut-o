import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { jsPDF } from "jspdf";
import type { AccessKey, GeneratedLetter, MockAnalysis, UploadedDocument } from "../types";
import type { AlternativeOffer } from "../features/recommendations/service";
import { aiHouseholdPayload, householdDocuments } from "./fixtures/household";

type StoredDocument = UploadedDocument & { physicalFileName: string };

type WorkflowHarness = {
  createKey(usesRemaining?: number): Promise<AccessKey>;
  upload(code: string, id: string, fixtureId: string, text?: string): Promise<Response>;
  analyze(code: string, documents: unknown[]): Promise<Response>;
  setAiReply(reply: unknown): void;
};

function remapAiPayload(fixturesToDocumentIds: Record<string, string>) {
  const payload = aiHouseholdPayload(Object.keys(fixturesToDocumentIds));
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

async function capturePdf(analysis: MockAnalysis, alternatives: AlternativeOffer[], letters: GeneratedLetter[]) {
  const { generatePdfReport } = await import("../features/reports/service");
  let report = "";
  const events = jsPDF.API.events;
  const capture = ["initialized", function (this: jsPDF) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.save as any) = () => { report = this.output(); return this; };
  }] as typeof events[number];
  events.push(capture);
  try {
    await generatePdfReport(analysis, alternatives, letters);
  } finally {
    events.splice(events.indexOf(capture), 1);
  }
  return report;
}

async function uploadAndAnalyze(
  harness: WorkflowHarness,
  fixtureId: string,
  text?: string
) {
  const key = await harness.createKey(1);
  const id = `${fixtureId}-${randomUUID()}`;
  const uploadResponse = await harness.upload(key.code, id, fixtureId, text);
  assert.equal(uploadResponse.status, 200);
  const document = ((await uploadResponse.json()) as { document: StoredDocument }).document;
  harness.setAiReply(remapAiPayload({ [fixtureId]: id }));
  const analysisResponse = await harness.analyze(key.code, [document]);
  assert.equal(analysisResponse.status, 200);
  const analysis = ((await analysisResponse.json()) as { analysis: MockAnalysis }).analysis;
  return { key, document, analysis };
}

async function getWorkflowOutputs(key: AccessKey, analysis: MockAnalysis) {
  const { POST: alternativesPost } = await import("../app/api/alternatives/route");
  const alternativesResponse = await alternativesPost(new Request("http://local.test/api/alternatives", {
    method: "POST",
    body: JSON.stringify({ code: key.code, expenses: analysis.expenses })
  }));
  assert.equal(alternativesResponse.status, 200);
  const { alternatives } = (await alternativesResponse.json()) as { alternatives: AlternativeOffer[] };

  const { POST: lettersPost } = await import("../app/api/courriers/route");
  const lettersResponse = await lettersPost(new Request("http://local.test/api/courriers", {
    method: "POST",
    body: JSON.stringify({ code: key.code })
  }));
  assert.equal(lettersResponse.status, 200);
  const { letters } = (await lettersResponse.json()) as { letters: GeneratedLetter[] };
  return { alternatives, letters };
}

export function registerE2eWorkflows(harness: WorkflowHarness) {
  test("workflow EDF: upload, analysis, alternatives, letter and PDF", async () => {
    const { key, analysis } = await uploadAndAnalyze(harness, "edf");
    assert.equal(analysis.expenses.length, 1);
    assert.equal(analysis.expenses[0].provider, "EDF");
    const { alternatives, letters } = await getWorkflowOutputs(key, analysis);
    assert.ok(alternatives.length > 0);
    assert.ok(letters.length > 0);
    const report = await capturePdf(analysis, alternatives, letters);
    assert.ok(report.startsWith("%PDF-"));
    assert.ok(report.includes("EDF"));
  });

  test("workflow MACIF: three contracts remain in results and PDF", async () => {
    const macif = householdDocuments.find((document) => document.id === "macif")!;
    const text = `${macif.extractedText}\nCotisation TTC 360,00 EUR\nVotre prevoyance`;
    const { key, analysis } = await uploadAndAnalyze(harness, "macif", text);
    const contracts = analysis.expenses.filter((expense) => expense.provider === "MACIF");
    assert.equal(contracts.length, 3);
    assert.deepEqual(
      contracts.map((expense) => expense.documentType).sort(),
      ["health_insurance", "home_insurance", "two_wheeler_insurance"]
    );
    const { alternatives, letters } = await getWorkflowOutputs(key, analysis);
    const report = await capturePdf(analysis, alternatives, letters);
    assert.ok(report.startsWith("%PDF-"));
    assert.ok(report.includes("MACIF"));
    for (const label of ["Assurance deux roues", "Assurance habitation", "Prevoyance familiale"]) {
      assert.ok(analysis.expenses.some((expense) => expense.label === label));
    }
  });

  test("workflow SFR Box: internet expense and alternatives are preserved", async () => {
    const { key, analysis } = await uploadAndAnalyze(harness, "sfr");
    assert.equal(analysis.expenses.length, 1);
    assert.equal(analysis.expenses[0].provider, "SFR");
    assert.equal(analysis.expenses[0].documentType, "internet_invoice");
    const { alternatives } = await getWorkflowOutputs(key, analysis);
    assert.ok(alternatives.length > 0);
  });

  test("workflow NRJ Mobile: one mobile expense and alternatives are preserved", async () => {
    const { key, analysis } = await uploadAndAnalyze(harness, "mobile");
    assert.equal(analysis.expenses.length, 1);
    assert.equal(analysis.expenses[0].provider, "NRJ Mobile");
    assert.equal(analysis.expenses[0].documentType, "mobile_invoice");
    assert.equal(analysis.expenses[0].mobileDataGB, 100);
    const { alternatives } = await getWorkflowOutputs(key, analysis);
    assert.ok(alternatives.length > 0);
  });

  test("workflow mixed comparison: EDF, three MACIF contracts, SFR and mobile survive", async () => {
    const key = await harness.createKey(1);
    const mapping: Record<string, string> = {};
    const documents: StoredDocument[] = [];
    for (const fixtureId of ["edf", "macif", "sfr", "mobile"]) {
      const id = `${fixtureId}-${randomUUID()}`;
      mapping[fixtureId] = id;
      const text = fixtureId === "macif"
        ? `${householdDocuments.find((document) => document.id === "macif")!.extractedText}\nCotisation TTC 360,00 EUR\nVotre prevoyance`
        : undefined;
      const response = await harness.upload(key.code, id, fixtureId, text);
      assert.equal(response.status, 200);
      documents.push(((await response.json()) as { document: StoredDocument }).document);
    }
    harness.setAiReply(remapAiPayload(mapping));
    const response = await harness.analyze(key.code, documents);
    assert.equal(response.status, 200);
    const analysis = ((await response.json()) as { analysis: MockAnalysis }).analysis;
    assert.equal(analysis.expenses.length, 6);
    assert.equal(analysis.expenses.filter((expense) => expense.provider === "MACIF").length, 3);
    for (const provider of ["EDF", "MACIF", "SFR", "NRJ Mobile"]) {
      assert.ok(analysis.expenses.some((expense) => expense.provider === provider));
    }
    const { alternatives, letters } = await getWorkflowOutputs(key, analysis);
    assert.ok(alternatives.length > 0);
    assert.ok(letters.length > 0);
    const report = await capturePdf(analysis, alternatives, letters);
    for (const provider of ["EDF", "MACIF", "SFR", "NRJ Mobile"]) assert.ok(report.includes(provider));
  });
}
