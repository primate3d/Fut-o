"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  generateMockAnalysisFromDocuments,
  getStoredAnalysisServer,
  getStoredMockAnalysis,
  MOCK_ANALYSIS_STORAGE_KEY,
  storeMockAnalysis
} from "@/features/analysis";
import { getStoredAccessKey } from "@/features/billing/access-keys";
import { expenseCategoryLabels } from "@/lib/expense-summary";
import { cn, formatBytes } from "@/lib/utils";
import {
  ExpenseCategory,
  type DocumentUserCorrections,
  type MockAnalysis,
  type UploadedDocument,
  type UploadedDocumentType
} from "@/types";
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  detectDocumentType,
  documentTypeOptions,
  getCategoryForDocumentType
} from "./document-types";
import {
  applyDocumentCorrections,
  clearStoredDocumentCorrections,
  deleteDocumentServer,
  getStoredDocumentCorrections,
  getStoredUploadedDocumentsServer,
  removeStoredDocumentCorrection,
  storeUploadedDocumentServer,
  storeDocumentCorrections,
  storeUploadedDocuments
} from "./storage";

const acceptedExtensions = ".pdf,.jpg,.jpeg,.png,.csv";

function inferProviderFromFileName(fileName: string) {
  const normalizedName = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const knownProviders = [
    "edf",
    "engie",
    "orange",
    "sfr",
    "free",
    "bouygues",
    "netflix",
    "canal",
    "maif",
    "macif",
    "axa",
    "allianz",
    "credit agricole",
    "banque populaire",
    "boursorama"
  ];
  const lowerName = normalizedName.toLowerCase();
  const matchedProvider = knownProviders.find((provider) =>
    lowerName.includes(provider)
  );

  if (matchedProvider) {
    return matchedProvider
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return normalizedName.split(" ").slice(0, 3).join(" ") || "Fournisseur";
}

function clearStoredAnalysis() {
  window.localStorage.removeItem(MOCK_ANALYSIS_STORAGE_KEY);
}

async function deleteStoredAnalysisServer() {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return;

  await fetch(`/api/analyse?code=${encodeURIComponent(activeKey.code)}`, {
    method: "DELETE"
  });
}

async function purgeStoredDocumentsServer() {
  const activeKey = getStoredAccessKey();
  if (!activeKey) return;

  await fetch("/api/documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: activeKey.code, purge: true })
  });
}

async function resetCurrentAuditDocuments() {
  await deleteStoredAnalysisServer();
  await purgeStoredDocumentsServer();
  clearStoredAnalysis();
  clearStoredDocumentCorrections();
  storeUploadedDocuments([]);
}

function hasAcceptedFileType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const acceptedExtension = ["pdf", "jpg", "jpeg", "png", "csv"].includes(
    extension ?? ""
  );

  return (
    ACCEPTED_UPLOAD_MIME_TYPES.includes(file.type || "application/octet-stream") ||
    acceptedExtension
  );
}

function createDocumentFromFile(file: File): UploadedDocument {
  const documentType = detectDocumentType(file.name);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    documentType,
    detectedCategory: getCategoryForDocumentType(documentType),
    provider: inferProviderFromFileName(file.name),
    status:
      file.size <= MAX_UPLOAD_SIZE_BYTES && hasAcceptedFileType(file)
        ? "ready"
        : "error",
    uploadedAt: new Date().toISOString()
  };
}

function isLikelyMultiContractInsuranceDocument(document: UploadedDocument) {
  const fileName = document.fileName.toLowerCase();
  return (
    document.detectedCategory === ExpenseCategory.INSURANCE &&
    (fileName.includes("macif") ||
      fileName.includes("avis d echeance") ||
      fileName.includes("avis d'echeance") ||
      fileName.includes("sociétaire") ||
      fileName.includes("societaire"))
  );
}

function hasUserCorrections(document: UploadedDocument) {
  const corrections = document.userCorrections;
  if (!corrections) return false;

  return Boolean(
    corrections.provider?.trim() ||
      corrections.documentType ||
      corrections.amount ||
      corrections.frequency ||
      corrections.isMultiContract ||
      corrections.notes?.trim()
  );
}

export function ImportDocumentsPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasLoadedDocuments, setHasLoadedDocuments] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasExistingAudit, setHasExistingAudit] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [documentCorrections, setDocumentCorrections] = useState<
    Record<string, DocumentUserCorrections>
  >({});

  useEffect(() => {
    async function load() {
      const storedDocuments = await getStoredUploadedDocumentsServer();
      const localAnalysis = getStoredMockAnalysis();
      const serverAnalysis = await getStoredAnalysisServer();
      setDocuments(storedDocuments);
      setDocumentCorrections(getStoredDocumentCorrections());
      setHasExistingAudit(Boolean(localAnalysis || serverAnalysis));
      setHasLoadedDocuments(true);
    }
    void load();
  }, []);

  useEffect(() => {
    if (!hasLoadedDocuments) {
      return;
    }

    storeUploadedDocuments(documents);
  }, [documents, hasLoadedDocuments]);

  function shouldAskAuditMode() {
    return hasExistingAudit && documents.some((document) => document.status === "ready");
  }

  function getDuplicateFileNames(filesArray: File[]) {
    const existingNames = new Set(
      documents.map((document) => document.fileName.trim().toLowerCase())
    );

    return filesArray
      .map((file) => file.name)
      .filter((fileName) => existingNames.has(fileName.trim().toLowerCase()));
  }

  function queueFilesForAuditChoice(fileList: FileList | File[]) {
    const filesArray = Array.from(fileList);

    if (filesArray.length === 0) {
      return;
    }

    if (shouldAskAuditMode()) {
      setPendingFiles(filesArray);
      setStatusMessage(null);
      return;
    }

    void addFiles(filesArray, "append");
  }

  async function addFiles(fileList: FileList | File[], mode: "append" | "replace") {
    const filesArray = Array.from(fileList);
    const duplicateFileNames = mode === "append" ? getDuplicateFileNames(filesArray) : [];

    if (mode === "replace") {
      await resetCurrentAuditDocuments();
      setDocuments([]);
      setDocumentCorrections({});
      setHasExistingAudit(false);
    }

    const preparedDocuments = filesArray.map((file) => {
      const localDocument = createDocumentFromFile(file);
      return {
        localDocument,
        uploadingDocument: { ...localDocument, status: "uploading" as const }
      };
    });

    setDocuments((current) =>
      mode === "replace"
        ? preparedDocuments.map((item) => item.uploadingDocument)
        : [...preparedDocuments.map((item) => item.uploadingDocument), ...current]
    );

    for (let index = 0; index < filesArray.length; index += 1) {
      const file = filesArray[index];
      const { localDocument, uploadingDocument } = preparedDocuments[index];

      const serverDocument = await storeUploadedDocumentServer(uploadingDocument, file);
      setDocuments((current) =>
        current.map((document) =>
          document.id === uploadingDocument.id
            ? serverDocument ?? localDocument
            : document
        )
      );
    }

    setPendingFiles(null);
    setStatusMessage(
      duplicateFileNames.length > 0
        ? `Document déjà présent dans cet audit : ${duplicateFileNames.join(", ")}. Vérifiez avant de relancer l'analyse.`
        : mode === "replace"
          ? "Nouvel audit créé. Seuls les nouveaux documents seront analysés."
          : "Documents ajoutés à l'audit actuel."
    );
    clearStoredAnalysis();
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      queueFilesForAuditChoice(event.target.files);
      event.target.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    queueFilesForAuditChoice(event.dataTransfer.files);
  }

  function updateDocumentType(id: string, documentType: UploadedDocumentType) {
    setDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === id
          ? {
              ...document,
              documentType,
              detectedCategory: getCategoryForDocumentType(documentType)
            }
          : document
      )
    );
    updateDocumentCorrection(id, { documentType });
    clearStoredAnalysis();
  }

  function updateDocumentCorrection(
    id: string,
    patch: Partial<DocumentUserCorrections>
  ) {
    setDocumentCorrections((currentCorrections) => {
      const nextCorrections = {
        ...currentCorrections,
        [id]: {
          ...(currentCorrections[id] ?? {}),
          ...patch
        }
      };

      storeDocumentCorrections(nextCorrections);
      return nextCorrections;
    });
    clearStoredAnalysis();
  }

  function removeDocument(id: string) {
    setDocuments((currentDocuments) =>
      currentDocuments.filter((document) => document.id !== id)
    );
    setDocumentCorrections((currentCorrections) => {
      const nextCorrections = { ...currentCorrections };
      delete nextCorrections[id];
      return nextCorrections;
    });
    removeStoredDocumentCorrection(id);
    void deleteDocumentServer(id);
    clearStoredAnalysis();
  }

  async function launchAnalysis() {
    const usableDocuments = applyDocumentCorrections(
      documents.filter((document) => document.status === "ready")
    );

    if (usableDocuments.length === 0 || isAnalyzing) {
      setStatusMessage("Ajoutez au moins un fichier utilisable avant de lancer l'analyse.");
      return;
    }

    setIsAnalyzing(true);

    try {
      const activeKey = getStoredAccessKey();
      console.info("[FUTEO_ANALYSIS_POST]", {
        code: activeKey?.code,
        documentCount: usableDocuments.length,
        force: true
      });
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documents: usableDocuments,
          code: activeKey?.code,
          force: true
        })
      });
      const payload = (await response.json()) as {
        analysis?: MockAnalysis;
        error?: string;
        details?: string;
      };

      if (!response.ok || !payload.analysis) {
        const message =
          payload.details ||
          payload.error ||
          `Service d'analyse serveur indisponible (${response.status}).`;
        console.warn("[FUTEO_ANALYSIS_POST_ERROR]", {
          code: activeKey?.code,
          documentCount: usableDocuments.length,
          message,
          status: response.status
        });
        throw new Error(message);
      }

      console.info("[FUTEO_ANALYSIS_POST_OK]", {
        code: activeKey?.code,
        documentCount: usableDocuments.length,
        expensesCount: payload.analysis.expenses.length,
        status: response.status
      });
      storeMockAnalysis(payload.analysis);
      router.push("/analyse");
    } catch (error) {
      const hasCorrectedDocuments = usableDocuments.some(hasUserCorrections);
      const hasMultiContractInsurance = usableDocuments.some(
        isLikelyMultiContractInsuranceDocument
      );

      if (hasCorrectedDocuments || hasMultiContractInsurance) {
        clearStoredAnalysis();
        setStatusMessage(
          hasCorrectedDocuments
            ? "Analyse serveur nécessaire pour appliquer vos corrections."
            : "Analyse serveur nécessaire pour ce document multi-contrats."
        );
        console.warn("[FUTEO_ANALYSIS_BLOCKED]", error);
        return;
      }

      const localAnalysis = generateMockAnalysisFromDocuments(usableDocuments);
      storeMockAnalysis(localAnalysis);
      setStatusMessage(
        "Analyse locale préparée à partir des documents ajoutés. Les services OCR et IA seront connectés ensuite."
      );
      router.push("/analyse");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const usableDocumentCount = documents.filter(
    (document) => document.status === "ready"
  ).length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-blue-900">Pour une lecture plus utile</h3>
            <p className="mt-1 text-sm leading-relaxed text-blue-800/80">
              Ajoutez les documents que vous jugez utiles : facture, contrat,
              abonnement ou relevé d'offre.
            </p>
            <p className="mt-2 text-xs italic text-blue-700/70">
              Vous pouvez commencer avec peu d'éléments et compléter ensuite si besoin.
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition",
          isDragging
            ? "border-sage-700 bg-sage-100"
            : "border-sage-500/50 bg-sage-50"
        )}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-sage-700 shadow-sm">
          <FileUp size={26} />
        </div>
        <h2 className="text-xl font-semibold text-navy-900">
          Glissez vos documents ici
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Formats acceptés : PDF, JPG, PNG, CSV. Taille maximale : 10 Mo par fichier.
          Les fichiers ajoutés servent à préparer votre comparaison.
        </p>
        <input
          accept={acceptedExtensions}
          className="hidden"
          multiple
          onChange={handleFileInputChange}
          ref={inputRef}
          type="file"
        />
        <Button className="mt-6" onClick={() => inputRef.current?.click()} type="button">
          Sélectionner des fichiers
        </Button>
        <p className="mt-3 max-w-xl text-xs leading-5 text-slate-500">
          🔒 Confidentialité garantie : Vos documents servent uniquement à calculer vos
          économies. Vous pouvez les supprimer définitivement de nos serveurs en un clic
          depuis votre espace.
        </p>
      </div>

      {pendingFiles ? (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-navy-900">
            Un audit existe déjà
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Vous ajoutez {pendingFiles.length} nouveau(x) fichier(s). Choisissez
            si vous voulez compléter l'audit actuel ou repartir sur un nouvel audit.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() => void addFiles(pendingFiles, "append")}
              type="button"
              variant="secondary"
            >
              Ajouter à cet audit
            </Button>
            <Button
              onClick={() => void addFiles(pendingFiles, "replace")}
              type="button"
            >
              Créer un nouvel audit
            </Button>
            <Button
              onClick={() => setPendingFiles(null)}
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
          </div>
        </Card>
      ) : null}

      {statusMessage ? (
        <div className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm leading-6 text-sage-900">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white">
          <ShieldCheck className="text-sage-700" size={24} />
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Vous choisissez les documents à ajouter. Ils servent uniquement à
            préparer la lecture de vos contrats et les pistes de comparaison.
          </p>
        </Card>
        <Card className="bg-navy-50">
          <p className="text-sm font-semibold text-navy-900">Conseil</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Commencez par les contrats ou factures qui vous semblent les plus chers.
            Vous pourrez compléter ensuite si besoin.
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">
              Documents ajoutés
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {documents.length} document(s) ajouté(s), dont {usableDocumentCount} utilisable(s).
            </p>
          </div>
          <Button
            disabled={usableDocumentCount === 0 || isAnalyzing}
            onClick={launchAnalysis}
            type="button"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={18} />
                Analyse en cours
              </>
            ) : (
              "Comparer mes contrats"
            )}
          </Button>
        </div>

        <div className="mt-6 overflow-x-auto">
          {documents.length === 0 ? (
            <div className="rounded-lg border border-navy-100 bg-navy-50 p-6 text-center text-sm text-slate-600">
              Aucun document ajouté pour le moment.
            </div>
          ) : (
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="border-b border-navy-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Fichier</th>
                  <th className="py-3 pr-4 font-semibold">Taille</th>
                  <th className="py-3 pr-4 font-semibold">Type détecté</th>
                  <th className="py-3 pr-4 font-semibold">Catégorie</th>
                  <th className="py-3 pr-4 font-semibold">Statut</th>
                  <th className="py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-navy-900">{document.fileName}</p>
                      <p className="text-xs text-slate-500">{document.mimeType}</p>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {formatBytes(document.fileSize)}
                    </td>
                    <td className="py-4 pr-4">
                      <select
                        className="h-10 rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                        onChange={(event) =>
                          updateDocumentType(
                            document.id,
                            event.target.value as UploadedDocumentType
                          )
                        }
                        value={document.documentType}
                      >
                        {documentTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {expenseCategoryLabels[document.detectedCategory] ??
                        expenseCategoryLabels[ExpenseCategory.OTHER]}
                    </td>
                    <td className="py-4 pr-4">
                      <Badge
                        tone={
                          document.status === "ready"
                            ? "green"
                            : document.status === "uploading"
                              ? "blue"
                              : document.status === "pending"
                                ? "amber"
                                : "neutral"
                        }
                      >
                        {document.status === "uploading" ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="animate-spin" size={12} />
                            Téléchargement...
                          </span>
                        ) : document.status === "ready" ? (
                          "Prêt"
                        ) : document.status === "pending" ? (
                          "En attente"
                        ) : (
                          "À revoir"
                        )}
                      </Badge>
                    </td>
                    <td className="py-4 text-right">
                      <button
                        aria-label={`Supprimer ${document.fileName}`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        onClick={() => removeDocument(document.id)}
                        type="button"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {documents.some((document) => document.status === "ready") ? (
          <div className="mt-6 space-y-3">
            {documents
              .filter((document) => document.status === "ready")
              .map((document) => {
                const correction = documentCorrections[document.id] ?? {};

                return (
                  <div
                    className="rounded-xl border border-navy-100 bg-navy-50/40 p-4"
                    key={`corrections-${document.id}`}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-navy-900">
                          Vérifier les infos
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          Nous avons prérempli ces informations automatiquement.
                          Corrigez uniquement si nécessaire.
                        </p>
                      </div>
                      <p className="max-w-sm truncate text-xs text-slate-500">
                        {document.fileName}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <label className="text-xs font-semibold text-slate-600">
                        Fournisseur
                        <input
                          className="mt-1 h-10 w-full rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          onChange={(event) =>
                            updateDocumentCorrection(document.id, {
                              provider: event.target.value
                            })
                          }
                          placeholder={document.provider ?? "Fournisseur"}
                          type="text"
                          value={correction.provider ?? ""}
                        />
                      </label>

                      <label className="text-xs font-semibold text-slate-600">
                        Type de dépense
                        <select
                          className="mt-1 h-10 w-full rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          onChange={(event) =>
                            updateDocumentType(
                              document.id,
                              event.target.value as UploadedDocumentType
                            )
                          }
                          value={correction.documentType ?? document.documentType}
                        >
                          {documentTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs font-semibold text-slate-600">
                        Montant
                        <input
                          className="mt-1 h-10 w-full rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          min="0"
                          onChange={(event) =>
                            updateDocumentCorrection(document.id, {
                              amount: event.target.value
                                ? Number(event.target.value)
                                : undefined
                            })
                          }
                          placeholder="Ex : 39,98"
                          step="0.01"
                          type="number"
                          value={correction.amount ?? ""}
                        />
                      </label>

                      <label className="text-xs font-semibold text-slate-600">
                        Fréquence
                        <select
                          className="mt-1 h-10 w-full rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          onChange={(event) =>
                            updateDocumentCorrection(document.id, {
                              frequency:
                                event.target.value === ""
                                  ? undefined
                                  : (event.target.value as DocumentUserCorrections["frequency"])
                            })
                          }
                          value={correction.frequency ?? ""}
                        >
                          <option value="">Automatique</option>
                          <option value="monthly">Mensuel</option>
                          <option value="bimonthly">Bimestriel</option>
                          <option value="quarterly">Trimestriel</option>
                          <option value="yearly">Annuel</option>
                          <option value="one_time">Ponctuel</option>
                          <option value="schedule">Échéancier</option>
                        </select>
                      </label>

                      <label className="flex items-center gap-2 self-end rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm font-semibold text-navy-900">
                        <input
                          checked={Boolean(correction.isMultiContract)}
                          className="h-4 w-4 rounded border-navy-200 text-sage-700"
                          onChange={(event) =>
                            updateDocumentCorrection(document.id, {
                              isMultiContract: event.target.checked
                            })
                          }
                          type="checkbox"
                        />
                        Document multi-contrats
                      </label>

                      <label className="text-xs font-semibold text-slate-600 md:col-span-3">
                        Notes
                        <input
                          className="mt-1 h-10 w-full rounded-lg border border-navy-100 bg-white px-3 text-sm text-navy-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          onChange={(event) =>
                            updateDocumentCorrection(document.id, {
                              notes: event.target.value
                            })
                          }
                          placeholder="Ex : facture groupée, échéancier, contrat à vérifier"
                          type="text"
                          value={correction.notes ?? ""}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
