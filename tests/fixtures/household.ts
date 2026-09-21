import { ExpenseCategory, ExpenseSubcategory, type MockAnalysis, type UploadedDocument } from "../../types";

const identity = "Monsieur Jean DUPONT\n1 rue Exemple\n75001 PARIS\nNumero client : 12345678\n";
const examples = [
  { id: "edf", type: "electricity_invoice", provider: "EDF", amount: 120, category: ExpenseCategory.ENERGY,
    text: "EDF Electricite\nEcheancier de mensualisation\nPrelevement mensuel : 120,00 EUR\nTotal annuel : 1440,00 EUR" },
  { id: "macif", type: "home_insurance", provider: "MACIF", amount: 30, category: ExpenseCategory.INSURANCE,
    text: "MACIF Avis d'echeance annuel\nCotisation TTC 120,00 EUR\nVotre deux roues\nCotisation TTC 240,00 EUR\nVotre bien immobilier" },
  { id: "sfr", type: "internet_invoice", provider: "SFR", amount: 49.99, category: ExpenseCategory.TELECOM,
    text: "SFR Box Fibre internet\nOffre sans engagement avec TV incluse\nMontant total TTC : 49,99 EUR" },
  { id: "mobile", type: "mobile_invoice", provider: "NRJ Mobile", amount: 29.99, category: ExpenseCategory.TELECOM,
    text: "NRJ Mobile\nForfait mobile 100 Go inclus\nMontant total TTC : 29,99 EUR" }
] as const;

export const householdDocuments = examples.map((example) => ({
  id: example.id, fileName: `${example.id}.pdf`, fileSize: 100,
  mimeType: "application/pdf", documentType: example.type, provider: example.provider,
  detectedCategory: example.category, status: "ready", uploadedAt: new Date().toISOString(),
  extractedText: identity + example.text
} satisfies UploadedDocument & { extractedText: string }));

export function aiHouseholdPayload(ids: string[] = examples.map((example) => example.id)) {
  return {
    detectedParties: {
      customer: { fullName: "Jean DUPONT", firstName: "Jean", lastName: "DUPONT", address: "1 rue Exemple 75001 Paris" },
      documents: Object.fromEntries(examples.filter((example) => ids.includes(example.id)).map((example) => [example.id, {
        documentId: example.id, documentType: example.type, providerName: example.provider, invoiceAmount: example.amount,
        customer: { fullName: "Jean DUPONT", firstName: "Jean", lastName: "DUPONT" }
      }]))
    },
    expenses: examples.filter((example) => ids.includes(example.id)).map((example) => ({
      sourceDocumentId: example.id, documentType: example.type, provider: example.provider,
      label: example.provider, category: example.category, monthlyAmount: example.amount,
      yearlyAmount: example.amount * 12, recurrence: "monthly", isRecurring: true,
      subcategory: example.id === "mobile" ? ExpenseSubcategory.MOBILE : example.id === "sfr" ? ExpenseSubcategory.INTERNET : undefined,
      mobileDataGB: example.id === "mobile" ? 100 : undefined
    })), recommendations: [], anomalies: []
  };
}

export const emptyAnalysis = (code: string): MockAnalysis => ({
  id: `analysis_${code}`, generatedAt: new Date().toISOString(), documents: [], expenses: [],
  recommendations: [], anomalies: [], totalMonthlyAmount: 0, totalYearlyAmount: 0, yearlyPotentialSavings: 0
});
