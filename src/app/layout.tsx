import type { Metadata, Viewport } from "next";
// Polices hébergées sur le site (aucune requête vers Google : pas de transfert d'adresse IP, RGPD).
import "@fontsource-variable/outfit";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";

const APP = process.env.APP_NAME || "Trustpipe";
export const metadata: Metadata = {
  title: { default: APP, template: `%s · ${APP}` },
  description: "Un reporting pour chaque client et tous vos outils au même endroit : appels, campagnes email et LinkedIn, suivis en direct par vos clients. Pour les SDR freelances et les petites équipes commerciales.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/trustpipe-mark.svg", apple: "/trustpipe-mark.svg" },
  appleWebApp: { capable: true, title: "Trustpipe", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0B122F", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
