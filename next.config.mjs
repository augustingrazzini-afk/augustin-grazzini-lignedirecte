/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // En-têtes de sécurité : pas d'affichage dans un cadre tiers, pas de devinette de type, référent limité.
  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
    ];
    return [
      { source: "/:path*", headers: base },
      // Le jeton d'un lien de suivi ne doit jamais partir dans l'en-tête Referer.
      { source: "/suivi/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};
export default nextConfig;
