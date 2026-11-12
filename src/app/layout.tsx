import type { Metadata, Viewport } from "next";
// Polices hébergées sur le site (aucune requête vers Google : pas de transfert d'adresse IP, RGPD).
import "@fontsource-variable/outfit";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const APP = process.env.APP_NAME || "Trustpipe";
export const metadata: Metadata = {
  title: { default: APP, template: `%s · ${APP}` },
  description: "Le reporting d'appels pour chaque client : vos clients suivent vos appels en direct (Minari, lemlist, Aircall, Ringover…) et l'assistant IA intégré prépare leurs rendez-vous. Pour les SDR freelances et les petites équipes commerciales.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/trustpipe-mark.svg", apple: "/trustpipe-mark.svg" },
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
