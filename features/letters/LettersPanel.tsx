"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Mail,
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
  isEnrichedAnalysisForDocuments,
  refreshStoredAnalysisServer,
  storeMockAnalysis
} from "@/features/analysis";
import {
  getStoredUploadedDocuments,
  getStoredUploadedDocumentsServer
} from "@/features/upload/storage";
import { expenseCategoryLabels } from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import { formatCurrency } from "@/lib/utils";
import type { GeneratedLetter, LetterPersonalization, MockAnalysis } from "@/types";
import { generateLettersFromAnalysis, renderLetter } from "./service";

const initialPersonalization: LetterPersonalization = {
  firstName: "",
  lastName: "",
  address: "",
  customerNumber: "",
  email: ""
};

const fieldLabels: Record<keyof LetterPersonalization, string> = {
  firstName: "PrÃ©nom",
  lastName: "Nom",
  address: "Adresse",
  customerNumber: "NumÃ©ro client",
  email: "Email"
};

function splitFullName(fullName?: string) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function getPersonalizationFromAnalysis(
  analysis: MockAnalysis
): Partial<LetterPersonalization> {
  const customer =
    analysis.detectedParties?.customer ??
    Object.values(analysis.detectedParties?.documents ?? {}).find(
      (documentProfile) => documentProfile.customer
    )?.customer;
  if (!customer) return {};

  const nameParts = splitFullName(customer.fullName);

  return {
    firstName: customer.firstName || nameParts.firstName || "",
    lastName: customer.lastName || nameParts.lastName || "",
    address: customer.address || "",
    customerNumber: customer.customerNumber || "",
    email: customer.email || ""
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

function getLetterTypeLabel(type: GeneratedLetter["type"]) {
  const labels: Record<GeneratedLetter["type"], string> = {
    subscription_cancellation: "RÃ©siliation",
    price_negotiation: "NÃ©gociation",
    provider_followup: "Relance",
    offer_change: "Changement d'offre",
    comparison_report: "Comparaison"
  };

  return labels[type];
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
  doc.setFontSize(20);
  doc.text(title, 20, 20);
  doc.setFontSize(11);
  const splitText = doc.splitTextToSize(content, 170);
  doc.text(splitText, 20, 40);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Document prÃ©parÃ© avec FutÃ©o", 20, 285);
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

  useEffect(() => {
    const storedAnalysis = getStoredMockAnalysis();
    const documents = getStoredUploadedDocuments();
    const hasCurrentAnalysis = isEnrichedAnalysisForDocuments(storedAnalysis, documents);

    setAnalysis(hasCurrentAnalysis ? storedAnalysis : null);

    if (!storedAnalysis || !hasCurrentAnalysis) {
      async function loadServerState() {
        const serverDocuments = await getStoredUploadedDocumentsServer();
        let serverAnalysis = await getStoredAnalysisServer();

        if (!isEnrichedAnalysisForDocuments(serverAnalysis, serverDocuments)) {
          serverAnalysis = await refreshStoredAnalysisServer(
            serverDocuments.filter((document) => document.status === "ready")
          );
        }

        if (isEnrichedAnalysisForDocuments(serverAnalysis, serverDocuments) && serverAnalysis) {
          storeMockAnalysis(serverAnalysis);
          setAnalysis(serverAnalysis);
          setPersonalization((currentValue) => ({
            ...mergeDetectedPersonalization(
              getPersonalizationFromAnalysis(serverAnalysis),
              currentValue
            )
          }));
          setLetters(generateLettersFromAnalysis(serverAnalysis));
        }
      }

      void loadServerState();
      return;
    }

    const analysisToLoad = storedAnalysis;
    setPersonalization((currentValue) => ({
      ...mergeDetectedPersonalization(
        getPersonalizationFromAnalysis(analysisToLoad),
        currentValue
      )
    }));

    async function loadLetters() {
      try {
        const response = await fetch("/api/courriers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ analysis: analysisToLoad })
        });

        if (!response.ok) {
          throw new Error("Service courriers indisponible.");
        }

        const payload = (await response.json()) as { letters?: GeneratedLetter[] };
        setLetters(payload.letters ?? generateLettersFromAnalysis(analysisToLoad));
      } catch {
        setLetters(generateLettersFromAnalysis(analysisToLoad));
        setServiceMessage(
          "GÃ©nÃ©ration locale des dÃ©marches activÃ©e. L'envoi email automatique sera connectÃ© ensuite."
        );
      }
    }

    void loadLetters();
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
  const detectedCustomer = analysis?.detectedParties?.customer;
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
    setCopyMessage("DÃ©marche copiÃ©e dans le presse-papiers.");
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  if (!analysis || letters.length === 0) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez les documents utiles pour prÃ©parer vos dÃ©marches."
        icon={<FileSearch size={24} />}
        title="Vos dÃ©marches seront prÃ©parÃ©es ici"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">DÃ©marches adaptÃ©es</h1>
          <p className="mt-2 text-slate-600">
            Des actions proposÃ©es selon les documents analysÃ©s, prÃªtes Ã 
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Aucune coordonnÃ©e client n'a Ã©tÃ© dÃ©tectÃ©e dans l'analyse actuelle. Relancez
          l'analyse depuis la page Importer avec la facture d'origine pour prÃ©remplir
          le nom, l'adresse, l'email et le numÃ©ro client quand ils sont lisibles.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Choisissez une dÃ©marche", "SÃ©lectionnez la demande adaptÃ©e."],
          ["2", "Ajoutez vos coordonnÃ©es", "Renseignez uniquement ce que vous voulez voir apparaÃ®tre."],
          ["3", "Copiez ou tÃ©lÃ©chargez", "Relisez, adaptez, puis envoyez avec votre outil habituel."]
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,480px)]">
        <div className="space-y-4">
          {letters.map((letter) => (
            <Card
              className={
                selectedLetterId === letter.id
                  ? "border-sage-500 bg-sage-50"
                  : "bg-white"
              }
              key={letter.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <ProviderLogo
                      logoUrl={getProviderBranding(letter.provider).logoUrl}
                      provider={letter.provider}
                    />
                    <div>
                      <Mail className="text-sage-700" size={18} />
                      <Badge tone="green">{getLetterTypeLabel(letter.type)}</Badge>
                    </div>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-navy-900">
                    {letter.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {letter.provider} - {expenseCategoryLabels[letter.category]}
                  </p>
                  {letter.offerName ? (
                    <p className="mt-2 text-sm font-medium text-sage-800">
                      Offre cible : {letter.offerName}
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
                  Voir la dÃ©marche
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
              Les champs remplis seront intÃ©grÃ©s dans la dÃ©marche. Vous pouvez les laisser vides.
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

        </div>
      </div>

      {selectedLetter ? (
            <Card className="bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
                    AperÃ§u de la dÃ©marche : {selectedLetter.title}
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
              <pre className="mx-auto mt-6 max-w-3xl whitespace-pre-wrap rounded-xl border border-navy-100 bg-white px-6 py-7 text-sm leading-7 text-navy-900 shadow-sm sm:px-10">
                {renderedLetter}
              </pre>
            </Card>
      ) : null}
    </section>
  );
}


