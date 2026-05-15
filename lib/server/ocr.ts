import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";
import { OpenAI } from "openai";
import { storage } from "@/lib/server/storage";
import type { UploadedDocument } from "@/types";

let _openai: OpenAI | null = null;
let isPdfWorkerConfigured = false;

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY manquante");
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return _openai;
}

function configurePdfWorkerForNode() {
  if (isPdfWorkerConfigured) return;

  const require = createRequire(import.meta.url);
  const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  isPdfWorkerConfigured = true;
}

async function extractTextFromPDF(physicalFileName: string): Promise<string> {
  const dataBuffer = await storage.get(physicalFileName);
  if (!dataBuffer) return "";

  configurePdfWorkerForNode();

  const parser = new PDFParse({ data: dataBuffer });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } catch (error) {
    console.error("Erreur extraction texte PDF:", error);
    return "";
  } finally {
    await parser.destroy();
  }
}

function isUsableExtractedText(text: string) {
  return text.trim().replace(/\s+/g, " ").length >= 40;
}

async function extractTextFromImage(physicalFileName: string): Promise<string> {
  const imageBuffer = await storage.get(physicalFileName);
  if (!imageBuffer) return "";

  const base64Image = imageBuffer.toString("base64");
  const extension = path.extname(physicalFileName).slice(1);

  if (extension === "pdf") {
    return "";
  }

  const mimeType = `image/${extension}`;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Tu extrais uniquement le texte visible dans l'image, sans commentaire."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrait tout le texte de cette image."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    });

    return response.choices[0].message.content || "";
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
      `Extraction texte PDF native insuffisante pour ${physicalFileName}. Fallback OCR requis si le PDF est scanne.`
    );
    return nativeText;
  }

  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return extractTextFromImage(physicalFileName);
  }

  return "";
}
