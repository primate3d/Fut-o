import path from "path";
import { OpenAI } from "openai";
import { storage } from "@/lib/server/storage";
import type { UploadedDocument } from "@/types";

let _openai: OpenAI | null = null;

type StoredUploadedDocument = UploadedDocument & {
  physicalFileName?: string;
};

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      buffer: Buffer,
      options?: Record<string, unknown>
    ) => Promise<{ text: string; numpages: number }>;

    const data = await pdfParse(dataBuffer);
    return data.text.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur extraction texte PDF pour ${physicalFileName}:`, message, error);
    throw error;
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
          content: "Tu extrais uniquement le texte visible dans l'image, sans commentaire.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrait tout le texte de cette image.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
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
      `Extraction texte PDF native insuffisante pour ${physicalFileName}. Fallback OCR requis si le PDF est scanné.`
    );
    return nativeText;
  }

  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return extractTextFromImage(physicalFileName);
  }

  return "";
}