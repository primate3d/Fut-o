"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Copy, Download, FileSearch, Mail, Printer, Send } from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getStoredMockAnalysis, isAnalysisForDocuments } from "@/features/analysis";
import { getStoredUploadedDocuments } from "@/features/upload/storage";
import { expenseCategoryLabels } from "@/lib/expense-summary";
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
  firstName: "Prénom",
  lastName: "Nom",
  address: "Adresse",
  customerNumber: "Numéro client",
  email: "Email"
};

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
    const hasCurrentAnalysis = isAnalysisForDocuments(storedAnalysis, documents);

    setAnalysis(hasCurrentAnalysis ? storedAnalysis : null);

    if (!storedAnalysis || !hasCurrentAnalysis) {
      return;
    }

    const analysisToLoad = storedAnalysis;

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
          "Génération locale des courriers activée. L'envoi email automatique sera connecté ensuite."
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
    setCopyMessage("Courrier copié dans le presse-papiers.");
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  if (!analysis || letters.length === 0) {
    return (
      <EmptyState
        actionHref="/importer"
        actionLabel="Ajouter mes documents"
        description="Ajoutez les documents utiles pour préparer vos courriers."
        icon={<FileSearch size={24} />}
        title="Vos courriers seront préparés ici"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">Courriers personnalisés</h1>
          <p className="mt-2 text-slate-600">
            Des courriers en bonne et due forme, prêts à utiliser, que vous pouvez
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

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Choisissez un courrier", "Sélectionnez la demande adaptée."],
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

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
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
                  <Mail className="text-sage-700" size={22} />
                  <Badge tone="green">{getLetterTypeLabel(letter.type)}</Badge>
                  <h2 className="mt-3 text-lg font-semibold text-navy-900">
                    {letter.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {letter.provider} - {expenseCategoryLabels[letter.category]}
                  </p>
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
                  Voir le courrier
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
              Les champs remplis seront intégrés dans le courrier. Vous pouvez les laisser vides.
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
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
                    Aperçu du courrier : {selectedLetter.title}
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
              <pre className="mt-6 whitespace-pre-wrap rounded-lg bg-navy-50 p-5 text-sm leading-7 text-navy-900">
                {renderedLetter}
              </pre>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}
