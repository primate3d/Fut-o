import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://futeo.fr";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/guides", "/tarifs", "/a-propos", "/faq"],
        disallow: [
          "/compte",
          "/rapport",
          "/resultats",
          "/courriers",
          "/analyse",
          "/importer",
          "/tableau-de-bord",
          "/api/"
        ]
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
