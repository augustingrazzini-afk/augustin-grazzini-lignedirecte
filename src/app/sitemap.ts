import type { MetadataRoute } from "next";

const BASE = (process.env.APP_URL || "https://trustpipe.fr").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/assistant", "/claude", "/inscription", "/cgv", "/confidentialite", "/mentions-legales"].map((p, i) => ({ url: BASE + p, changeFrequency: "weekly" as const, priority: i === 0 ? 1 : 0.6 }));
}
