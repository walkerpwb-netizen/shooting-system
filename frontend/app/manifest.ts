import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "System Strzelecki",
    short_name: "S-S",
    description: "System Organizacji Zawodów Strzeleckich",
    start_url: "/",
    display: "standalone",
    background_color: "#031c18",
    theme_color: "#14532d",
    icons: [
      {
        src: "/icons/system-strzelecki-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/system-strzelecki-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/system-strzelecki-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
