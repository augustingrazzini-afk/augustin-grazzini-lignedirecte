import type { Metadata, Viewport } from "next";
// Polices hébergées sur le site (aucune requête vers Google : pas de transfert d'adresse IP, RGPD).
import "@fontsource-variable/outfit";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource-variable/unbounded";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const APP = process.env.APP_NAME || "Trustpipe";
export const metadata: Metadata = {
  title: { default: APP, template: `%s · ${APP}` },
  description: "Centralisez tous vos commerciaux (salariés, freelances, agences de prospection) et suivez chacun de leurs appels en direct, quel que soit leur outil : Minari, Aircall, Ringover, lemlist… Classement, résumés IA et un assistant IA qui a tout écouté.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/trustpipe-mark.svg", type: "image/svg+xml" }, { url: "/icon-192.png", type: "image/png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Trustpipe", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0B122F", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}<Analytics /></body>
    </html>
  );
}
