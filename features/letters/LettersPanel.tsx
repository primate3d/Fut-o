"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  storeMockAnalysis,
  hasDocumentProfiles
} from "@/features/analysis";
import { getStoredAccessKey, isDiscoveryPlan } from "@/features/billing/access-keys";
import { expenseCategoryLabels } from "@/lib/expense-summary";
import { getProviderBranding } from "@/lib/provider-branding";
import {
  getSelectedAlternativeOffer
} from "@/features/recommendations/selected-offer";
import {
  addAuditActionLog,
  getAuditActionLogs,
  getStoredLetterRecord,
  saveFollowupLetter,
  savePreparedLetter,
  type LetterActionSnapshot
} from "@/features/privacy/action-log";
import { purgeSourceDocuments } from "@/features/privacy/lifecycle";
import type { CustomerProfile, GeneratedLetter, LetterPersonalization, MockAnalysis } from "@/types";
import {
  createFollowupLetterFromSnapshot,
  generateLettersFromAnalysis,
  renderLetter
} from "./service";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

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

function isManualAnalysis(analysis: MockAnalysis | null) {
  return Boolean(
    analysis?.documents.some((document) => document.mimeType === "manual/input")
  );
}

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

function sanitizeDetectedCustomerIdentity(customer: CustomerProfile | undefined) {
  if (!customer) return undefined;

  const identityText = [customer.fullName, customer.firstName, customer.lastName]
    .filter(hasText)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const looksLikeDocumentText =
    /\b(souscrit|offre|abonnement|contrat|facture|forfait|adsl|fibre|internet|mobile|sfr)\b/.test(
      identityText
    );

  if (!looksLikeDocumentText) return customer;

  return {
    ...customer,
    fullName: undefined,
    firstName: undefined,
    lastName: undefined
  };
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
  return getPersonalizationFromCustomer(getMergedCustomerFromAnalysis(analysis));
}

function getPersonalizationFromCustomer(
  detectedCustomer: CustomerProfile | undefined
): Partial<LetterPersonalization> {
  const customer = sanitizeDetectedCustomerIdentity(detectedCustomer);
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
  const searchParams = useSearchParams();
  const followupActionId = searchParams.get("relance");
  const followupRecordId = searchParams.get("relanceRecord");
  const savedRecordId = searchParams.get("courrier");
  const selectedExpenseId = searchParams.get("expenseId");
  const activeKey = getStoredAccessKey();
  const activeKeyCode = activeKey?.code;
  const isDiscoveryAccess = isDiscoveryPlan(activeKey?.plan);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);
  const [letterAuditId, setLetterAuditId] = useState<string | null>(null);
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [personalization, setPersonalization] =
    useState<LetterPersonalization>(initialPersonalization);
  const [letterDraft, setLetterDraft] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [letters, setLetters] = useState<GeneratedLetter[]>([]);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [sourcePurgeMessage, setSourcePurgeMessage] = useState<string | null>(null);
  const [isFollowupDraft, setIsFollowupDraft] = useState(false);
  const [sourceLetterRecordId, setSourceLetterRecordId] = useState<string | null>(null);
  const [followupSourceDocumentName, setFollowupSourceDocumentName] =
    useState<string | undefined>();

  const loadValidatedLetters = useCallback(async (nextAnalysis: MockAnalysis) => {
    const selectedOfferId = getSelectedAlternativeOffer()?.id;
    if (!activeKeyCode) {
      setLetters(generateLettersFromAnalysis(nextAnalysis));
      return;
    }

    try {
      const response = await fetch("/api/courriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activeKeyCode, selectedOfferId })
      });
      if (!response.ok) throw new Error("Courriers serveur indisponibles");
      const payload = (await response.json()) as {
        letters?: GeneratedLetter[];
        selectionStatus?: "valid" | "stale_or_ineligible" | "none";
        comparisonMessage?: string | null;
      };
      setLetters(payload.letters ?? []);
      if (payload.selectionStatus === "stale_or_ineligible") {
        setServiceMessage(
          "L'offre sélectionnée n'est plus assez récente ou vérifiable. Elle a été retirée du courrier."
        );
      } else if (payload.comparisonMessage) {
        setServiceMessage(payload.comparisonMessage);
      }
    } catch {
      setLetters(generateLettersFromAnalysis(nextAnalysis));
      setServiceMessage(
        "Comparaison mobile indisponible : le courrier a été préparé sans référence à une offre mobile."
      );
    }
  }, [activeKeyCode]);

  async function purgeSourcesAfterDownload() {
    const purged = await purgeSourceDocuments();
    if (purged) {
      setSourcePurgeMessage(
        "Sécurité : vos documents sources ont été définitivement effacés de nos serveurs. Pour toute modification ou nouvelle démarche, il vous suffit de réimporter votre document."
      );
    } else {
      setServiceMessage(
        "Le téléchargement est prêt, mais la suppression automatique du document source n'a pas pu être confirmée."
      );
    }
  }

  function getLetterActionSnapshot(
    letter: GeneratedLetter,
    renderedContent?: string
  ): LetterActionSnapshot {
    return {
      letter,
      personalization,
      documentName:
        analysis?.documents.map((document) => document.fileName).join(", ") ??
        followupSourceDocumentName,
      renderedContent
    };
  }

  async function downloadLetterPdf(letter: GeneratedLetter, content: string) {
    generatePDF(
      `${letter.provider}-${letter.type}.pdf`.replaceAll(" ", "-"),
      letter.title,
      content
    );
    addAuditActionLog({
      type: "letter_downloaded",
      label: `Courrier téléchargé : ${letter.title}`,
      documentName:
        analysis?.documents.map((document) => document.fileName).join(", ") ??
        followupSourceDocumentName,
      provider: letter.provider,
      letterSnapshot: getLetterActionSnapshot(letter, content)
    });
    await purgeSourcesAfterDownload();
  }

  async function downloadLetterText(letter: GeneratedLetter, content: string) {
    downloadTextFile(
      `${letter.provider}-${letter.type}.txt`.replaceAll(" ", "-"),
      content
    );
    addAuditActionLog({
      type: "letter_downloaded",
      label: `Courrier téléchargé : ${letter.title}`,
      documentName:
        analysis?.documents.map((document) => document.fileName).join(", ") ??
        followupSourceDocumentName,
      provider: letter.provider,
      letterSnapshot: getLetterActionSnapshot(letter, content)
    });
    await purgeSourcesAfterDownload();
  }

  function prepareLetterEmail(letter: GeneratedLetter, content: string) {
    const letterSnapshot = getLetterActionSnapshot(letter, content);
    addAuditActionLog({
      type: "letter_email_prepared",
      label: `Courrier préparé pour envoi par email : ${letter.title}`,
      documentName: letterSnapshot.documentName,
      provider: letter.provider,
      letterSnapshot
    });
    sendEmail(letter.subject, content);
  }

  function persistSelectedLetter() {
    if (!selectedLetter || !letterAuditId) {
      setServiceMessage("Le courrier ne peut pas être enregistré sans audit actif.");
      return;
    }

    const snapshot = getLetterActionSnapshot(selectedLetter, renderedLetter);
    const record = isFollowupDraft && sourceLetterRecordId
      ? saveFollowupLetter(sourceLetterRecordId, snapshot)
      : savePreparedLetter(letterAuditId, snapshot);
    setServiceMessage(
      record
        ? isFollowupDraft
          ? "Relance enregistrée. Le courrier initial reste conservé dans le rapport."
          : "Courrier enregistré comme préparé. Aucun envoi n'a été effectué."
        : "L'enregistrement du courrier a échoué."
    );
  }

  useEffect(() => {
    if (isDiscoveryAccess) return;

    const savedRecord = savedRecordId ? getStoredLetterRecord(savedRecordId) : null;
    if (savedRecord) {
      const savedLetter = savedRecord.snapshot.renderedContent
        ? {
            ...savedRecord.snapshot.letter,
            bodyTemplate: savedRecord.snapshot.renderedContent
          }
        : savedRecord.snapshot.letter;
      setLetters([savedLetter]);
      setSelectedLetterId(savedLetter.id);
      setPersonalization(savedRecord.snapshot.personalization);
      setFollowupSourceDocumentName(savedRecord.snapshot.documentName);
      setLetterAuditId(savedRecord.auditId);
      setIsFollowupDraft(savedRecord.status === "followup_prepared");
      setSourceLetterRecordId(savedRecord.parentRecordId ?? null);
      setServiceMessage(
        savedRecord.status === "followup_prepared"
          ? "Relance enregistrée. Vous pouvez la relire et la modifier avant tout envoi."
          : "Courrier enregistré. Vous pouvez le relire et le modifier avant tout envoi."
      );
      return;
    }

    const sourceRecord = followupRecordId
      ? getStoredLetterRecord(followupRecordId)
      : null;
    if (sourceRecord && !sourceRecord.parentRecordId) {
      const followupLetter = createFollowupLetterFromSnapshot(
        sourceRecord.snapshot.letter,
        sourceRecord.sentAt ?? sourceRecord.createdAt
      );
      setLetters([followupLetter]);
      setSelectedLetterId(followupLetter.id);
      setPersonalization(sourceRecord.snapshot.personalization);
      setFollowupSourceDocumentName(sourceRecord.snapshot.documentName);
      setLetterAuditId(sourceRecord.auditId);
      setIsFollowupDraft(true);
      setSourceLetterRecordId(sourceRecord.id);
      setServiceMessage(
        "Relance préparée à partir du courrier initial. Vérifiez et enregistrez son contenu avant tout envoi."
      );
      return;
    }

    const queuedFollowup = followupActionId
      ? getAuditActionLogs().find((action) => action.id === followupActionId)
      : undefined;
    if (queuedFollowup?.letterSnapshot) {
      const followupLetter = createFollowupLetterFromSnapshot(
        queuedFollowup.letterSnapshot.letter,
        queuedFollowup.createdAt
      );
      setLetters([followupLetter]);
      setSelectedLetterId(followupLetter.id);
      setPersonalization(queuedFollowup.letterSnapshot.personalization);
      setFollowupSourceDocumentName(queuedFollowup.letterSnapshot.documentName);
      setLetterAuditId(getStoredMockAnalysis()?.id ?? null);
      setIsFollowupDraft(true);
      setServiceMessage(
        "Relance préparée à partir du courrier précédemment généré. Vérifiez le contenu avant envoi."
      );
      return;
    }

    const storedAnalysis = getStoredMockAnalysis();
    const hasUsableStoredAnalysis = hasAnalysisDataForLetters(storedAnalysis);

    function applyAnalysis(nextAnalysis: MockAnalysis) {
      setAnalysis(nextAnalysis);
      setLetterAuditId(nextAnalysis.id);
      setPersonalization((currentValue) => ({
        ...mergeDetectedPersonalization(
          getPersonalizationFromAnalysis(nextAnalysis),
          currentValue
        )
      }));
      void loadValidatedLetters(nextAnalysis);
    }

    if (storedAnalysis && hasUsableStoredAnalysis) {
      applyAnalysis(storedAnalysis);
    }

    async function loadServerState() {
      const serverAnalysis = await getStoredAnalysisServer();
      const hasUsableServerAnalysis = hasAnalysisDataForLetters(serverAnalysis);

      if (serverAnalysis && hasUsableServerAnalysis) {
        storeMockAnalysis(serverAnalysis);
        applyAnalysis(serverAnalysis);
        setServiceMessage(null);
        return;
      }

      if (!hasUsableStoredAnalysis) {
        setAnalysis(null);
        setLetters([]);
        setServiceMessage(
          "Importez un document puis lancez l'analyse pour preparer les courriers."
        );
      }
    }

    void loadServerState();
  }, [
    activeKeyCode,
    followupActionId,
    followupRecordId,
    isDiscoveryAccess,
    loadValidatedLetters,
    savedRecordId
  ]);

  const visibleLetters = useMemo(() => {
    if (!selectedExpenseId) return letters;
    const matchingLetters = letters.filter(
      (letter) => letter.sourceExpenseId === selectedExpenseId
    );
    return matchingLetters.length > 0 ? matchingLetters : letters;
  }, [letters, selectedExpenseId]);

  useEffect(() => {
    if (visibleLetters.length === 0) return;
    const selectedIsVisible = visibleLetters.some((letter) => letter.id === selectedLetterId);
    if (!selectedIsVisible) {
      const targetLetter = visibleLetters[0];
      setSelectedLetterId(targetLetter.id);
      if (selectedExpenseId) {
        setPersonalization({
          ...initialPersonalization,
          ...(analysis ? getPersonalizationFromAnalysis(analysis) : {}),
          ...getPersonalizationFromCustomer(targetLetter.customerProfile)
        });
      }
    }
  }, [analysis, selectedExpenseId, selectedLetterId, visibleLetters]);

  const selectedLetter = visibleLetters.find((letter) => letter.id === selectedLetterId) ?? null;
  const generatedLetterContent = selectedLetter
    ? renderLetter(selectedLetter, personalization)
    : "";
  useEffect(() => {
    setLetterDraft(generatedLetterContent);
  }, [generatedLetterContent]);
  const renderedLetter = letterDraft;
  const detectedCustomer =
    selectedLetter?.customerProfile ??
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

  async function copyLetter(letter: GeneratedLetter, content = renderLetter(letter, personalization)) {
    await navigator.clipboard?.writeText(content);
    setCopyMessage("Démarche copiée dans le presse-papiers.");
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  if (isDiscoveryAccess) {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-navy-900">
          Courriers non inclus dans l&apos;accès Découverte
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Votre aperçu gratuit permet de voir une économie potentielle. Les courriers
          personnalisés sont disponibles avec Audit Foyer ou Audit Famille.
        </p>
        <Button className="mt-6" href="/tarifs">
          Débloquer mon audit complet
        </Button>
      </Card>
    );
  }

  if ((!analysis && !isFollowupDraft && !savedRecordId) || letters.length === 0) {
    return (
      <section className="space-y-4">
        {serviceMessage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {serviceMessage}
          </div>
        ) : null}
        <EmptyState
          actionHref="/importer"
          actionLabel="Importer un document"
          description="Importez un document puis lancez son analyse pour preparer les courriers."
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
            {isFollowupDraft ? (
              <Badge tone="green">Relance</Badge>
            ) : analysis && hasDocumentProfiles(analysis) ? (
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

      {selectedExpenseId ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Les démarches affichées concernent le contrat choisi dans le rapport. Les champs manquants restent modifiables avant tout envoi.
        </div>
      ) : null}

      {sourcePurgeMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-medium leading-6 text-sage-900">
          {sourcePurgeMessage}
        </div>
      ) : null}

      {!isFollowupDraft && !hasDetectedCustomer ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {isManualAnalysis(analysis) ? (
            <p>
              Certaines coordonnées nécessaires au courrier sont absentes de la saisie
              manuelle. Complétez uniquement les champs utiles dans la section de
              personnalisation ci-dessous avant l'envoi.
            </p>
          ) : (
            <p>
              Aucune coordonnée client n'a été détectée dans l'analyse actuelle. Complétez
              les champs utiles ci-dessous avant l'envoi. Aucune nouvelle analyse n'est
              nécessaire pour préparer le courrier.
            </p>
          )}
        </div>
      ) : !isFollowupDraft && analysis && !hasDocumentProfiles(analysis) ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          <p>
            Les courriers actuels sont générés à partir des informations disponibles. Vérifiez et complétez les champs manquants avant l'envoi.
          </p>
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
          {visibleLetters.map((letter) => (
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
                    void downloadLetterPdf(letter, renderLetter(letter, personalization))
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
                  onClick={() => prepareLetterEmail(letter, renderLetter(letter, personalization))}
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
                  <Button onClick={persistSelectedLetter} type="button">
                    {isFollowupDraft
                      ? "Enregistrer la relance"
                      : "Enregistrer comme préparé"}
                  </Button>
                  <Button
                    onClick={() => copyLetter(selectedLetter, renderedLetter)}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="mr-2" size={17} />
                    Copier
                  </Button>
                  <Button
                    onClick={() =>
                      void downloadLetterPdf(selectedLetter, renderedLetter)
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Printer className="mr-2" size={17} />
                    PDF
                  </Button>
                  <Button
                    onClick={() => prepareLetterEmail(selectedLetter, renderedLetter)}
                    type="button"
                    variant="ghost"
                  >
                    <Send className="mr-2" size={17} />
                    Email
                  </Button>
                  <Button
                    onClick={() =>
                      void downloadLetterText(selectedLetter, renderedLetter)
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
              <label className="mt-6 block text-sm font-semibold text-navy-900">
                Contenu modifiable avant téléchargement
                <textarea
                  className="mt-2 min-h-[34rem] w-full whitespace-pre-wrap rounded-xl border border-navy-100 bg-white px-5 py-6 font-sans text-sm font-normal leading-7 text-navy-900 shadow-sm outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 sm:px-8"
                  onChange={(event) => setLetterDraft(event.target.value)}
                  value={renderedLetter}
                />
              </label>
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


