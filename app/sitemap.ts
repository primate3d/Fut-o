import type { MetadataRoute } from "next";
import { guideArticles } from "@/data/guides";

const staticRoutes = [
  "",
  "/guides",
  "/a-propos",
  "/tarifs",
  "/faq",
  "/cas-concrets",
  "/resilier-box-internet",
  "/negocier-forfait-internet",
  "/changer-fournisseur-energie",
  "/reduire-depenses-mensuelles"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://futeo.fr";
  const now = new Date();

  return [
    ...staticRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: now
    })),
    ...guideArticles.map((article) => ({
      url: `${baseUrl}/${article.slug}`,
      lastModified: now
    }))
  ];
}
