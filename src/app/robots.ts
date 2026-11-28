import type { MetadataRoute } from "next";

const BASE = (process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "");

/** Seules les pages publiques sont indexées : jamais l'application, les espaces des commerciaux ni les liens de suivi. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/portal", "/suivi", "/api", "/paiement", "/onboarding", "/oauth", "/reinitialiser"] }], sitemap: `${BASE}/sitemap.xml` };
}
