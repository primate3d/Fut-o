import { createHash } from "node:crypto";
import type {
  CommercialSourceDefinition,
  DiscoveredSourceCandidate,
  SearchCandidate,
} from "./types";

const COMMERCIAL_PATH = /(?:offre|box|fibre|fiber|adsl|internet|tarif|promo|electric|gaz|assurance|garantie|contrat|prix|grille)/i;
const EXCLUDED_HOSTS = [
  "google.com",
  "bing.com",
  "dealabs.com",
  "selectra.info",
  "ariase.com",
];

function candidateId(sector: string, url: string) {
  return `candidate-${sector}-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function pendingCandidate(
  source: CommercialSourceDefinition,
  url: string,
  discoveredFrom: string,
  discoveryMethod: DiscoveredSourceCandidate["discoveryMethod"],
  discoveredAt: string,
  provider = source.provider,
): DiscoveredSourceCandidate {
  return {
    id: candidateId(source.sector, url),
    sector: source.sector,
    provider,
    sourceUrl: url,
    discoveredFrom,
    discoveryMethod,
    approvalStatus: "PENDING",
    discoveredAt,
  };
}

export function discoverApprovedPageLinks(
  html: string,
  source: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  discoveredAt: string,
): DiscoveredSourceCandidate[] {
  if (!source.discoveryEnabled) return [];
  const known = new Set([...knownUrls].map((value) => new URL(value).href));
  const found = new Map<string, DiscoveredSourceCandidate>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], source.sourceUrl);
      url.hash = "";
      if (
        url.protocol !== "https:" ||
        !source.allowedHosts.includes(url.hostname) ||
        !COMMERCIAL_PATH.test(`${url.pathname}${url.search}`) ||
        known.has(url.href)
      ) continue;
      found.set(
        url.href,
        pendingCandidate(source, url.href, source.sourceUrl, "approved_page_link", discoveredAt),
      );
    } catch {
      // Invalid links are ignored and never become catalog sources.
    }
  }
  return [...found.values()];
}

export function proposeSearchCandidates(
  results: SearchCandidate[],
  sourceTemplate: CommercialSourceDefinition,
  knownUrls: Iterable<string>,
  discoveredAt: string,
): DiscoveredSourceCandidate[] {
  const known = new Set([...knownUrls].map((value) => new URL(value).href));
  const found = new Map<string, DiscoveredSourceCandidate>();
  for (const result of results) {
    try {
      const url = new URL(result.url);
      url.hash = "";
      if (
        url.protocol !== "https:" ||
        EXCLUDED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ||
        known.has(url.href) ||
        !COMMERCIAL_PATH.test(`${result.title} ${url.pathname}`)
      ) continue;
      found.set(
        url.href,
        pendingCandidate(
          sourceTemplate,
          url.href,
          "external_search",
          "search_candidate",
          discoveredAt,
          result.publisherName?.trim() || url.hostname,
        ),
      );
    } catch {
      // Search results are untrusted input.
    }
  }
  return [...found.values()];
}
