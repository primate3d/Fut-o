"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Printer,
  Send
} from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import {
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  isAnalysisForDocuments,
  refreshStoredAnalysisServer,
  storeMockAnalysis,
  deleteStoredAnalysisServer,
  hasDocumentProfiles
} from "@/features/analysis";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import { expenseCategoryLabels } from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import { formatCurrency } from "@/lib/utils";
import { getSelectedAlternativeOffer } from "@/features/recommendations/selected-offer";
import type { CustomerProfile, GeneratedLetter, LetterPersonalization, MockAnalysis } from "@/types";
import { generateLettersFromAnalysis, renderLetter } from "./service";

const initialPersonalization: LetterPersonalization = {
  firstName: "",
  lastName: "",
  address: "",
  customerNumber: "",
  email: "",
  contractNumber: "",
  invoiceNumber: "",
  phone: ""
};

const fieldLabels: Record<keyof LetterPersonalization, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  address: "Adresse",
  customerNumber: "Numéro client",
  email: "Email",
  contractNumber: "Numéro de contrat",
  invoiceNumber: "Numéro de facture",
  phone: "Téléphone"
};

function splitFullName(fullName?: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function hasText(value?: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function mergeCustomerWhenMissing(
  base: CustomerProfile | undefined,
  fallback: CustomerProfile | undefined
) {
  if (!fallback) return base;

  const merged: CustomerProfile = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(fallback) as Array<
    [keyof CustomerProfile, CustomerProfile[keyof CustomerProfile]]
  >) {
    if (
      typeof value === "string" &&
      value.trim().length > 0 &&
      !hasText(merged[key] as string | undefined)
    ) {
      merged[key] = value as never;
    }
  }

  return Object.values(merged).some(Boolean) ? merged : undefined;
}

function getMergedCustomerFromAnalysis(analysis: MockAnalysis | null) {
  if (!analysis) return undefined;

  return Object.values(analysis.detectedParties?.documents ?? {}).reduce<
    CustomerProfile | undefined
  >(
    (customer, documentProfile) =>
      mergeCustomerWhenMissing(customer, documentProfile.customer),
    analysis.detectedParties?.customer
  );
}

function getPersonalizationFromAnalysis(
  analysis: MockAnalysis
): Partial<LetterPersonalization> {
  const customer = getMergedCustomerFromAnalysis(analysis);
  if (!customer) return {};

  const nameParts = splitFullName(customer.fullName);

  return {
    firstName: customer.firstName || nameParts.firstName || "",
    lastName: customer.lastName || nameParts.lastName || "",
    address: customer.address || "",
    customerNumber: customer.customerNumber || "",
    email: customer.email || "",
    contractNumber: customer.contractNumber || "",
    invoiceNumber: customer.invoiceNumber || "",
    phone: customer.phone || ""
  };
}

function mergeDetectedPersonalization(
  detected: Partial<LetterPersonalization>,
  currentValue: LetterPersonalization
) {
  return {
    ...initialPersonalization,
    ...detected,
    ...Object.fromEntries(
      Object.entries(currentValue).filter(([, value]) => Boolean(value))
    )
  };
}

function hasCustomerDataForLetters(analysis: MockAnalysis | null) {
  const customer = getMergedCustomerFromAnalysis(analysis);
  const hasFullName = hasText(customer?.fullName);
  const hasFirstAndLastName = hasText(customer?.firstName) && hasText(customer?.lastName);

  return Boolean(customer && (hasFullName || hasFirstAndLastName) && hasText(customer.address));
}

function hasAnalysisDataForLetters(analysis: MockAnalysis | null) {
  return Boolean(
    analysis &&
      (analysis.expenses.length > 0 ||
        analysis.totalMonthlyAmount > 0 ||
        hasCustomerDataForLetters(analysis))
  );
}

function getLetterTypeLabel(type: GeneratedLetter["type"]) {
  const labels: Record<GeneratedLetter["type"], string> = {
    subscription_cancellation: "Résiliation",
    price_negotiation: "Négociation",
    provider_followup: "Relance",
    offer_change: "Changement d'offre",
    comparison_report: "Comparaison"
  };

  return labels[type];
}

function getLetterOfferLabel(letter: GeneratedLetter) {
  return [
    letter.offerProvider,
    letter.offerName,
    typeof letter.offerMonthlyPrice === "number"
      ? `${formatCurrency(letter.offerMonthlyPrice)} / mois`
      : undefined
  ]
    .filter(Boolean)
    .join(" - ");
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function generatePDF(fileName: string, title: string, content: string) {
  const doc = new jsPDF();
  const pageTop = 20;
  const pageBottom = 270;
  const lineHeight = 6;
  let y = pageTop;

  const ensureSpace = (neededHeight = lineHeight) => {
    if (y + neededHeight > pageBottom) {
      doc.addPage();
      y = pageTop;
    }
  };
  doc.setFontSize(20);
  ensureSpace(10);
  doc.text(title, 20, y);
  y = 40;
  doc.setFontSize(11);
  const splitText = doc.splitTextToSize(content, 170);
  splitText.forEach((line: string) => {
    ensureSpace(lineHeight);
    doc.text(line, 20, y);
    y += lineHeight;
  });
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  if (y > pageBottom) {
    doc.addPage();
  }
  doc.text("Document préparé avec Futéo", 20, 285);
  doc.save(fileName);
}

function sendEmail(subject: string, body: string) {
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

export function LettersPanel() {
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [personalization, setPersonalization] =
    useState<LetterPersonalization>(initialPersonalization);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [letters, setLetters] = useState<GeneratedLetter[]>([]);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  async function handleForceAnalysis() {
    setIsReloading(true);
    setServiceMessage("Relance de l'analyse IA en cours...");
    await deleteStoredAnalysisServer();
    const serverDocuments = await getStoredUploadedDocumentsServer();
    const readyServerDocuments = serverDocuments.filter(doc => doc.status === "ready");
    if (readyServerDocuments.length > 0) {
      const newAnalysis = await refreshStoredAnalysisServer(readyServerDocuments);
      if (newAnalysis) {
        storeMockAnalysis(newAnalysis);
        setAnalysis(newAnalysis);
        setPersonalization((currentValue) => ({
          ...mergeDetectedPersonalization(
            getPersonalizationFromAnalysis(newAnalysis),
            currentValue
          )
        }));
        setLetters(generateLettersFromAnalysis(newAnalysis, getSelectedAlternativeOffer()));
        setServiceMessage("Analyse IA terminée.");
      } else {
        setServiceMessage("Erreur lors de la relance de l'analyse.");
      }
    }
    setIsReloading(false);
  }

  useEffect(() => {
    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasUsableStoredAnalysis =
      isAnalysisForDocuments(storedAnalysis, documents) &&
      hasAnalysisDataForLetters(storedAnalysis);

    function applyAnalysis(nextAnalysis: MockAnalysis) {
      setAnalysis(nextAnalysis);
      setPersonalization((currentValue) => ({
        ...mergeDetectedPersonalization(
          getPersonalizationFromAnalysis(nextAnalysis),
          currentValue
        )
      }));
      setLetters(generateLettersFromAnalysis(nextAnalysis, getSelectedAlternativeOffer()));
    }

    if (storedAnalysis && hasUsableStoredAnalysis) {
      applyAnalysis(storedAnalysis);
    }

    async function loadServerState() {
      const serverDocuments = await getStoredUploadedDocumentsServer();
      const readyServerDocuments = serverDocuments.filter(
        (document) => document.status === "ready"
      );
      let serverAnalysis = await getStoredAnalysisServer();
      const hasUsableServerAnalysis =
        isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
        hasAnalysisDataForLetters(serverAnalysis);

      if (!hasUsableServerAnalysis && readyServerDocuments.length > 0) {
        setServiceMessage(
          "Chargement des courriers depuis l'analyse."
        );
        serverAnalysis = await refreshStoredAnalysisServer(readyServerDocuments);
      }

      if (
        serverAnalysis &&
        isAnalysisForDocuments(serverAnalysis, serverDocuments) &&
        hasAnalysisDataForLetters(serverAnalysis)
      ) {
        storeMockAnalysis(serverAnalysis);
        applyAnalysis(serverAnalysis);
        setServiceMessage(null);
        return;
      }

      if (!hasUsableStoredAnalysis) {
        setAnalysis(null);
        setLetters([]);
        setServiceMessage(
          readyServerDocuments.length > 0
            ? "Chargement des courriers depuis l'analyse."
            : "Importez un document puis lancez l'analyse pour preparer les courriers."
        );
      }
    }

    void loadServerState();
  }, []);

  useEffect(() => {
    if (!selectedLetterId && letters.length > 0) {
      setSelectedLetterId(letters[0].id);
    }
  }, [letters, selectedLetterId]);

  const selectedLetter = letters.find((letter) => letter.id === selectedLetterId) ?? null;
  const renderedLetter = selectedLetter
    ? renderLetter(selectedLetter, personalization)
    : "";
  const detectedCustomer =
    analysis?.detectedParties?.customer ??
    Object.values(analysis?.detectedParties?.documents ?? {}).find(
      (documentProfile) => documentProfile.customer
    )?.customer;
  const hasDetectedCustomer =
    Boolean(detectedCustomer) && Object.values(detectedCustomer ?? {}).some(Boolean);

  function updateField(
    field: keyof LetterPersonalization,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setPersonalization((currentValue) => ({
      ...currentValue,
      [field]: event.target.value
    }));
  }

  async function copyLetter(letter: GeneratedLetter) {
    const content = renderLetter(letter, personalization);
    await navigator.clipboard?.writeText(content);
    setCopyMessage("Démarche copiée dans le presse-papiers.");
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  if (!analysis || letters.length === 0) {
    return (
      <section className="space-y-4">
        {serviceMessage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {serviceMessage}
          </div>
        ) : null}
        <EmptyState
          actionHref="/analyse"
          actionLabel="Lancer l'analyse"
          description="Lancez l'analyse pour generer les courriers a partir de vos documents."
          icon={<FileSearch size={24} />}
          title="Vos courriers seront prepares ici"
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-navy-900">Démarches adaptées</h1>
            {hasDocumentProfiles(analysis) ? (
              <Badge tone="green">Analyse IA</Badge>
            ) : (
              <Badge tone="amber">Analyse Rapide</Badge>
            )}
          </div>
          <p className="mt-2 text-slate-600">
            Des actions proposées selon les documents analysés, prêtes à
            personnaliser et relire tranquillement avant envoi.
          </p>
        </div>
        <Button href="/rapport">Voir mon rapport</Button>
      </div>

      {serviceMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900">
          {serviceMessage}
        </div>
      ) : null}

      {!hasDetectedCustomer ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p>
            Aucune coordonnée client n'a été détectée dans l'analyse actuelle. Relancez
            l'analyse depuis la page Importer avec la facture d'origine pour préremplir
            le nom, l'adresse, l'email et le numéro client quand ils sont lisibles.
          </p>
          <Button onClick={handleForceAnalysis} disabled={isReloading} type="button" variant="secondary" className="whitespace-nowrap shrink-0">
            {isReloading ? "Analyse..." : "Relancer l'analyse (IA)"}
          </Button>
        </div>
      ) : !hasDocumentProfiles(analysis) ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p>
            Les courriers actuels sont générés à partir d'une analyse rapide. Pour une personnalisation plus fine (coordonnées, détails des contrats), vous pouvez relancer une analyse IA complète.
          </p>
          <Button onClick={handleForceAnalysis} disabled={isReloading} type="button" variant="secondary" className="whitespace-nowrap shrink-0">
            {isReloading ? "Analyse..." : "Relancer l'analyse (IA)"}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Choisissez une démarche", "Sélectionnez la demande adaptée."],
          ["2", "Ajoutez vos coordonnées", "Renseignez uniquement ce que vous voulez voir apparaître."],
          ["3", "Copiez ou téléchargez", "Relisez, adaptez, puis envoyez avec votre outil habituel."]
        ].map(([step, title, description]) => (
          <div className="rounded-2xl border border-sage-200 bg-sage-50/50 p-4" key={step}>
            <p className="flex h-7 w-7 items-center justify-center rounded-full bg-sage-500 text-xs font-bold text-white">
              {step}
            </p>
            <h3 className="mt-2 font-bold text-navy-900">{title}</h3>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          {letters.map((letter) => (
            <Card
              className={
                selectedLetterId === letter.id
                  ? "cursor-pointer border-sage-500 bg-sage-50"
                  : "cursor-pointer bg-white transition hover:border-sage-300 hover:bg-sage-50/40"
              }
              key={letter.id}
              onClick={() => setSelectedLetterId(letter.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <ProviderLogo
                      logoUrl={getProviderBranding(letter.provider).logoUrl}
                      provider={letter.provider}
                    />
                    <Badge tone="green">{getLetterTypeLabel(letter.type)}</Badge>
                    {selectedLetterId === letter.id ? (
                      <Badge tone="blue">Selectionnee</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-navy-900">
                    {letter.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {letter.provider} - {expenseCategoryLabels[letter.category]}
                  </p>
                  {letter.offerName ? (
                    <p className="mt-2 text-sm font-medium text-sage-800">
                      Offre cible : {getLetterOfferLabel(letter)}
                    </p>
                  ) : null}
                </div>
                <p className="text-right text-sm font-semibold text-sage-700">
                  {formatCurrency(letter.potentialSaving)}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={() => setSelectedLetterId(letter.id)}
                  type="button"
                  variant="secondary"
                >
                  Voir la démarche
                </Button>
                <Button onClick={() => copyLetter(letter)} type="button" variant="ghost">
                  <Copy className="mr-2" size={17} />
                  Copier
                </Button>
                <Button
                  onClick={() =>
                    generatePDF(
                      `${letter.provider}-${letter.type}.pdf`.replaceAll(" ", "-"),
                      letter.title,
                      renderLetter(letter, personalization)
                    )
                  }
                  type="button"
                  variant="ghost"
                >
                  <Printer className="mr-2" size={17} />
                  PDF
                  </Button>
                  {letter.offerUrl ? (
                    <a
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-5 py-2.5 text-sm font-semibold leading-none text-sage-800 transition hover:bg-sage-50"
                      href={letter.offerUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Offre <ExternalLink size={16} />
                    </a>
                  ) : null}
                <Button
                  onClick={() => sendEmail(letter.subject, renderLetter(letter, personalization))}
                  type="button"
                  variant="ghost"
                >
                  <Send className="mr-2" size={17} />
                  Mail
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className="border-sage-100">
            <h2 className="text-xl font-semibold text-navy-900">
              Champs de personnalisation
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Les champs remplis seront intégrés dans la démarche. Vous pouvez les laisser vides.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {(Object.keys(fieldLabels) as Array<keyof LetterPersonalization>).map(
                (field) => (
                  <label className="block text-sm font-semibold text-navy-900" key={field}>
                    {fieldLabels[field]}
                    {field === "address" ? (
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-lg border border-navy-100 px-3 py-2 text-sm font-normal text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                        onChange={(event) => updateField(field, event)}
                        value={personalization[field]}
                      />
                    ) : (
                      <input
                        className="mt-2 h-11 w-full rounded-lg border border-navy-100 px-3 text-sm font-normal text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                        onChange={(event) => updateField(field, event)}
                        value={personalization[field]}
                      />
                    )}
                  </label>
                )
              )}
            </div>
          </Card>

          {selectedLetter ? (
            <Card className="bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
                    Apercu de la demarche
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-navy-900">
                    {selectedLetter.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => copyLetter(selectedLetter)}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="mr-2" size={17} />
                    Copier
                  </Button>
                  <Button
                    onClick={() =>
                      generatePDF(
                        `${selectedLetter.provider}-${selectedLetter.type}.pdf`.replaceAll(" ", "-"),
                        selectedLetter.title,
                        renderedLetter
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Printer className="mr-2" size={17} />
                    PDF
                  </Button>
                  <Button
                    onClick={() => sendEmail(selectedLetter.subject, renderedLetter)}
                    type="button"
                    variant="ghost"
                  >
                    <Send className="mr-2" size={17} />
                    Email
                  </Button>
                  <Button
                    onClick={() =>
                      downloadTextFile(
                        `${selectedLetter.provider}-${selectedLetter.type}.txt`.replaceAll(
                          " ",
                          "-"
                        ),
                        renderedLetter
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Download className="mr-2" size={17} />
                    TXT
                  </Button>
                </div>
              </div>
              {copyMessage ? (
                <p className="mt-4 text-sm font-medium text-sage-700">{copyMessage}</p>
              ) : null}
              <pre className="mt-6 max-h-[58vh] overflow-auto whitespace-pre-wrap rounded-xl border border-navy-100 bg-white px-5 py-6 font-sans text-sm leading-7 text-navy-900 shadow-sm sm:px-8">
                {renderedLetter}
              </pre>
            </Card>
          ) : null}

        </div>
      </div>

      {/*
      {selectedLetter ? (
            <Card className="bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
                    Aperçu de la démarche : {selectedLetter.title}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-navy-900">
                    Objet : {selectedLetter.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => copyLetter(selectedLetter)}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="mr-2" size={17} />
                    Copier
                  </Button>
                  <Button
                    onClick={() =>
                      generatePDF(
                        `${selectedLetter.provider}-${selectedLetter.type}.pdf`.replaceAll(" ", "-"),
                        selectedLetter.title,
                        renderedLetter
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Printer className="mr-2" size={17} />
                    PDF
                  </Button>
                  <Button
                    onClick={() => sendEmail(selectedLetter.subject, renderedLetter)}
                    type="button"
                    variant="ghost"
                  >
                    <Send className="mr-2" size={17} />
                    Email
                  </Button>
                  <Button
                    onClick={() =>
                      downloadTextFile(
                        `${selectedLetter.provider}-${selectedLetter.type}.txt`.replaceAll(
                          " ",
                          "-"
                        ),
                        renderedLetter
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Download className="mr-2" size={17} />
                    TXT
                  </Button>
                </div>
              </div>
              {copyMessage ? (
                <p className="mt-4 text-sm font-medium text-sage-700">{copyMessage}</p>
              ) : null}
              {selectedLetter.offerUrl ? (
                <a
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-5 py-2.5 text-sm font-semibold leading-none text-sage-800 transition hover:bg-sage-50"
                  href={selectedLetter.offerUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Voir l'offre retenue <ExternalLink size={16} />
                </a>
              ) : null}
              <pre className="mx-auto mt-6 max-w-3xl whitespace-pre-wrap font-sans rounded-xl border border-navy-100 bg-white px-6 py-7 text-sm leading-7 text-navy-900 shadow-sm sm:px-10">
                {renderedLetter}
              </pre>
            </Card>
      ) : null}
      */}
    </section>
  );
}


