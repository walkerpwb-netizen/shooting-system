import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "System Strzelecki",
    short_name: "SystemStrzelecki",
    description: "System Organizacji Zawodów Strzeleckich",
    start_url: "/",
    display: "standalone",
    background_color: "#031c18",
    theme_color: "#14532d",
    icons: [
      {
        src: "/icons/system-strzelecki-192.png?v=20260717",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/system-strzelecki-512.png?v=20260717",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/system-strzelecki-512.png?v=20260717",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
