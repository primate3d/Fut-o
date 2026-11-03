import { createHash } from "node:crypto";
import type {
  CommercialCollectorOptions,
  CommercialSourceDefinition,
  FetchCacheMetadata,
} from "./types";

const MAX_RESOURCE_BYTES = 3_000_000;
const REQUEST_TIMEOUT_MS = 15_000;

export function assertApprovedSourceUrl(
  value: string,
  source: CommercialSourceDefinition,
): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !source.allowedHosts.includes(url.hostname)) {
    throw new Error(`Source non autorisee: ${url.hostname}`);
  }
  return url;
}

export type CommercialFetchResult = {
  body: string | null;
  bytes: Uint8Array | null;
  contentType: string;
  finalUrl: string;
  notModified: boolean;
  cache: FetchCacheMetadata;
};

export async function fetchCommercialResource(
  source: CommercialSourceDefinition,
  options: CommercialCollectorOptions = {},
): Promise<CommercialFetchResult> {
  return fetchApprovedCommercialUrl(source.sourceUrl, source, options);
}

export async function fetchApprovedCommercialUrl(
  requestedUrl: string,
  source: CommercialSourceDefinition,
  options: CommercialCollectorOptions = {},
): Promise<CommercialFetchResult> {
  assertApprovedSourceUrl(requestedUrl, source);
  if (source.approvalStatus !== "APPROVED") {
    throw new Error("Une source non approuvee ne peut pas etre collectee.");
  }

  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/json,application/pdf",
    "User-Agent": "FuteoCommercialCatalog/1.0",
  };
  if (options.previousCache?.etag) {
    headers["If-None-Match"] = options.previousCache.etag;
  }
  if (options.previousCache?.lastModified) {
    headers["If-Modified-Since"] = options.previousCache.lastModified;
  }

  const response = await (options.fetchImpl ?? fetch)(requestedUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const finalUrl = response.url || requestedUrl;
  assertApprovedSourceUrl(finalUrl, source);
  const cache = {
    etag: response.headers.get("etag") ?? options.previousCache?.etag ?? null,
    lastModified:
      response.headers.get("last-modified") ??
      options.previousCache?.lastModified ??
      null,
    contentHash: options.previousCache?.contentHash ?? null,
  };

  if (response.status === 304) {
    return { body: null, bytes: null, contentType: "", finalUrl, notModified: true, cache };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml") &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/pdf")
  ) {
    throw new Error(`Type de contenu inattendu: ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESOURCE_BYTES) {
    throw new Error(`Ressource trop volumineuse (>${MAX_RESOURCE_BYTES} octets)`);
  }
  const isPdf = contentType.includes("application/pdf") || requestedUrl.toLowerCase().includes(".pdf");
  const body = isPdf ? null : bytes.toString("utf8");
  cache.contentHash = createHash("sha256").update(bytes).digest("hex");
  if (
    options.previousCache?.contentHash &&
    options.previousCache.contentHash === cache.contentHash
  ) {
    return { body: null, bytes: null, contentType, finalUrl, notModified: true, cache };
  }
  return {
    body,
    bytes: isPdf ? new Uint8Array(bytes) : null,
    contentType,
    finalUrl,
    notModified: false,
    cache,
  };
}
