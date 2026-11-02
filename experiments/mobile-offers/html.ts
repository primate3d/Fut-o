const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  laquo: "«",
  lt: "<",
  nbsp: " ",
  quot: '"',
  raquo: "»",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, token: string) => {
      if (token.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
      }
      if (token.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
      }
      return NAMED_ENTITIES[token.toLowerCase()] ?? entity;
    },
  );
}

export function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractScriptById(html: string, id: string): string | null {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<script\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
      "i",
    ),
  );
  return match?.[1]?.trim() ?? null;
}

export function parseFrenchAmount(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function parseEuroStyleAmount(value: string): number | null {
  const decimalMatch = value.match(/(\d{1,3})[,.](\d{1,2})\s*€/);
  if (decimalMatch) {
    return Number(`${decimalMatch[1]}.${decimalMatch[2].padEnd(2, "0")}`);
  }
  const euroMatch = value.match(/(\d{1,3})\s*€\s*(\d{2})/);
  if (euroMatch) return Number(`${euroMatch[1]}.${euroMatch[2]}`);
  const integerMatch = value.match(/(\d{1,3})\s*€/);
  return integerMatch ? Number(integerMatch[1]) : null;
}

export function cleanText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\\//g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function unescapeEmbeddedContent(value: string): string {
  let result = value;
  for (let index = 0; index < 3; index += 1) {
    result = result
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u0022/gi, '"')
      .replace(/\\\"/g, '"');
  }
  return decodeHtmlEntities(result);
}

export function normalizeOfferKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
