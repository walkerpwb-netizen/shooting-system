import type { Metadata, Viewport } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import GlobalUiSettings from "./components/GlobalUiSettings";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "System Strzelecki",
  title: "System Strzelecki | Organizacja zawodów strzeleckich",
  description:
    "System Strzelecki pomaga organizować zawody strzeleckie: publikacja zawodów, zapisy zawodników, obsługa sędziów, wyniki na żywo i historia startów.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: siteUrl,
    siteName: "System Strzelecki",
    title: "System Strzelecki | Organizacja zawodów strzeleckich",
    description:
      "Kompleksowy system do obsługi zawodów strzeleckich, zapisów, sędziowania i publikacji zawodów.",
    images: [
      {
        url: "/icons/system-strzelecki-logo-20260623.png",
        width: 1560,
        height: 1008,
        alt: "System Strzelecki",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "System Strzelecki | Organizacja zawodów strzeleckich",
    description:
      "Publikuj zawody strzeleckie, obsługuj zapisy, sędziów i wyniki w jednym systemie.",
    images: ["/icons/system-strzelecki-logo-20260623.png"],
  },
  appleWebApp: {
    capable: true,
    title: "S-S",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#14532d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className="dark h-full antialiased"
    >
      <body className="min-h-full">
        <GlobalUiSettings />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
