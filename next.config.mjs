/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // Liens de suivi fusionnés : l'ancien lien d'un client regroupé renvoie vers l'espace commun.
  async redirects() {
    return [
      { source: "/suivi/V_fs0PnUrDiSNhTNnz8qOp2DNoNGuA0n", destination: "/suivi/0LrXRXwJpuJrjv_F5ZmCtuUvo4DlcgRu", permanent: false },
      { source: "/suivi/V_fs0PnUrDiSNhTNnz8qOp2DNoNGuA0n/:path*", destination: "/suivi/0LrXRXwJpuJrjv_F5ZmCtuUvo4DlcgRu/:path*", permanent: false },
    ];
  },
};
export default nextConfig;
