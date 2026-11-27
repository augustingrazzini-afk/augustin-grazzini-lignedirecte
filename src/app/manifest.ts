import type { MetadataRoute } from "next";

/** Rend l'app installable sur téléphone (« Ajouter à l'écran d'accueil »). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.APP_NAME || "Trustpipe",
    short_name: "Trustpipe",
    start_url: "/app",
    display: "standalone",
    background_color: "#F5F7FC",
    theme_color: "#0B122F",
    icons: [{ src: "/trustpipe-mark.svg", sizes: "any", type: "image/svg+xml" }, { src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
