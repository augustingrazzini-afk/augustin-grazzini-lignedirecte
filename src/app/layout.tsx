import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP = process.env.APP_NAME || "LigneDirecte Cockpit";
export const metadata: Metadata = {
  title: { default: APP, template: `%s · ${APP}` },
  description: "Le reporting d'appels de prospection en direct, pour les SDR, les agences et leurs clients.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
  appleWebApp: { capable: true, title: "Cockpit", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0B122F", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
