import fs from "fs";
import path from "path";
import PDFParser from "pdf2json";

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

async function main() {
  const uploadsDir = path.join(process.cwd(), "server-data", "uploads");
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith(".pdf"));
  if (files.length === 0) {
    console.log("No PDFs found in uploads.");
    return;
  }
  
  const fileToRead = files[0];
  const filePath = path.join(uploadsDir, fileToRead);
  console.log(`Reading PDF: ${filePath}`);
  const dataBuffer = fs.readFileSync(filePath);

  const text = await new Promise<string>((resolve, reject) => {
    const parser = new PDFParser(null, true);
    parser.on("pdfParser_dataError", (error) => reject(error));
    parser.on("pdfParser_dataReady", (pdfData: Pdf2JsonData) => {
      resolve(extractTextFromPdfData(pdfData));
    });
    parser.parseBuffer(dataBuffer);
  });

  console.log("=== EXTRACTED TEXT (FIRST 1500 CHARACTERS) ===");
  console.log(text.slice(0, 1500));
}

main().catch(console.error);
