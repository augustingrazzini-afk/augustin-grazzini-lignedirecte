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
    icons: [{ src: "/trustpipe-mark.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
