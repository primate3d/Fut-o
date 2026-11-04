import type { CollectorOptions } from "./types";

const MAX_HTML_BYTES = 3_000_000;
const REQUEST_TIMEOUT_MS = 15_000;

const OFFICIAL_HOSTS = new Set([
  "mobile.free.fr",
  "red-by-sfr.fr",
  "www.red-by-sfr.fr",
  "bouyguestelecom.fr",
  "www.bouyguestelecom.fr",
  "boutique.orange.fr",
  "shop.sosh.fr",
  "sfr.fr",
  "www.sfr.fr",
  "prixtel.com",
  "www.prixtel.com",
  "nrjmobile.fr",
  "www.nrjmobile.fr",
  "cdiscount.com",
  "www.cdiscount.com",
  "lycamobile.fr",
  "www.lycamobile.fr",
  "lebara.fr",
  "www.lebara.fr",
  "symamobile.com",
  "www.symamobile.com",
  "lapostemobile.fr",
  "www.lapostemobile.fr",
]);

export function assertOfficialUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname)) {
    throw new Error(`Source non officielle refusée: ${url.hostname}`);
  }
  return url;
}

export async function fetchOfficialHtml(
  sourceUrl: string,
  options: CollectorOptions = {},
): Promise<string> {
  assertOfficialUrl(sourceUrl);
  const response = await (options.fetchImpl ?? fetch)(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "FuteoMobileOfferResearch/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  assertOfficialUrl(response.url || sourceUrl);

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("text/html")) {
    throw new Error(`Type de contenu inattendu: ${contentType}`);
  }

  const html = await response.text();
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error(`Page trop volumineuse (>${MAX_HTML_BYTES} octets)`);
  }
  return html;
}
