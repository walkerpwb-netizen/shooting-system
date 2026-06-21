import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "System Strzelecki",
    short_name: "System Strzelecki",
    description: "System Organizacji Zawodów Strzeleckich",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#065f2d",
    icons: [
      {
        src: "/icons/system-strzelecki-192.png?v=20260602-bgfix",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/system-strzelecki-512.png?v=20260602-bgfix",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/system-strzelecki-512.png?v=20260602-bgfix",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
