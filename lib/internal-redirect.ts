const allowedPaths = new Set([
  "/tableau-de-bord",
  "/importer",
  "/analyse",
  "/resultats",
  "/courriers",
  "/rapport",
  "/compte"
]);

export function sanitizeInternalRedirect(
  value?: string | null,
  fallback = "/tableau-de-bord"
) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://futeo.internal");
    if (parsed.origin !== "https://futeo.internal" || !allowedPaths.has(parsed.pathname)) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
