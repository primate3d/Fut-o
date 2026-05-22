import path from "path";
import { OpenAI } from "openai";
import PDFParser from "pdf2json";
import { storage } from "@/lib/server/storage";
import type { UploadedDocument } from "@/types";

let _openai: OpenAI | null = null;

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

type Pdf2JsonRun = {
  T?: string;
};

type Pdf2JsonText = {
  R?: Pdf2JsonRun[];
};

type Pdf2JsonPage = {
  Texts?: Pdf2JsonText[];
};

type Pdf2JsonData = {
  Pages?: Pdf2JsonPage[];
};

function decodePdfText(value?: string) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractTextFromPdfData(pdfData: Pdf2JsonData) {
  return (pdfData.Pages ?? [])
    .map((page) =>
      (page.Texts ?? [])
        .map((item) =>
          (item.R ?? []).map((run) => decodePdfText(run.T)).join("")
        )
        .join(" ")
    )
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY manquante");
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

async function extractTextFromPDF(physicalFileName: string): Promise<string> {
  const dataBuffer = await storage.get(physicalFileName);
  if (!dataBuffer) return "";

  try {
    return await new Promise<string>((resolve, reject) => {
      const parser = new PDFParser(null, true);

      parser.on("pdfParser_dataError", (error: Error | { parserError: Error }) => {
        reject("parserError" in error ? error.parserError : error);
      });
      parser.on("pdfParser_dataReady", (pdfData: Pdf2JsonData) => {
        resolve(extractTextFromPdfData(pdfData));
      });
      parser.parseBuffer(dataBuffer);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur extraction texte PDF pour ${physicalFileName}:`, message, error);
    throw error;
  }
}

function isUsableExtractedText(text: string) {
  return text.trim().replace(/\s+/g, " ").length >= 40;
}

function cleanOcrText(text: string) {
  return text
    .replace(/^```(?:text|plaintext)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isImageOcrRefusal(text: string) {
  const normalizedText = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    normalizedText.includes("je suis desole") ||
    normalizedText.includes("je ne peux pas") ||
    normalizedText.includes("cannot extract") ||
    normalizedText.includes("can't extract") ||
    normalizedText.includes("unable to extract") ||
    normalizedText.includes("ocr_image_illisible")
  );
}

async function extractTextFromImage(
  physicalFileName: string,
  declaredMimeType?: string
): Promise<string> {
  const imageBuffer = await storage.get(physicalFileName);
  if (!imageBuffer) return "";

  const base64Image = imageBuffer.toString("base64");
  const extension = path.extname(physicalFileName).slice(1);

  if (extension === "pdf") {
    return "";
  }

  const mimeType =
    declaredMimeType?.startsWith("image/")
      ? declaredMimeType
      : `image/${extension === "jpg" ? "jpeg" : extension}`;

  try {
    const openai = getOpenAI();
    const prompts = [
      "Effectue un OCR technique du document fourni par l'utilisateur. Transcris tout le texte lisible, y compris montants, dates, adresses et references. Reponds uniquement avec le texte brut. Si l'image est vraiment illisible, reponds exactement OCR_IMAGE_ILLISIBLE.",
      "Lis cette facture comme un moteur OCR. Recopie tout le texte visible sans commentaire, sans resume et sans refuser. Inclus les montants en euros. Si aucun texte n'est lisible, reponds exactement OCR_IMAGE_ILLISIBLE."
    ];

    for (const prompt of prompts) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "Tu es un moteur OCR pour documents administratifs fournis par l'utilisateur. Tu renvoies uniquement le texte visible.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      });

      const text = cleanOcrText(response.choices[0].message.content || "");
      if (isUsableExtractedText(text) && !isImageOcrRefusal(text)) {
        return text;
      }
    }

    console.warn(`OCR image insuffisant pour ${physicalFileName}.`);
    return "";
  } catch (error) {
    console.error("Erreur Vision OCR:", error);
    return "";
  }
}

export async function extractTextFromDocument(
  keyCode: string,
  document: UploadedDocument
): Promise<string> {
  const storedDocument = document as StoredUploadedDocument;
  const physicalFileName =
    storedDocument.physicalFileName || `${keyCode}_${document.id}_${document.fileName}`;

  const buffer = await storage.get(physicalFileName);
  if (!buffer) {
    console.warn(`Fichier non trouvé dans le stockage: ${physicalFileName}`);
    return "";
  }

  const extension = path.extname(document.fileName).toLowerCase();

  if (extension === ".pdf") {
    const nativeText = await extractTextFromPDF(physicalFileName);
    if (isUsableExtractedText(nativeText)) {
      return nativeText;
    }

    console.warn(
      `Extraction texte PDF native insuffisante pour ${physicalFileName}. Fallback OCR requis si le PDF est scanné.`
    );
    return nativeText;
  }

  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return extractTextFromImage(physicalFileName, document.mimeType);
  }

  return "";
}
