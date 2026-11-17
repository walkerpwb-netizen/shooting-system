import type { Metadata, Viewport } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AppNavigation from "@/components/AppNavigation";
import GlobalUiSettings from "./components/GlobalUiSettings";
import MaintenanceGuard from "./components/MaintenanceGuard";

import { siteUrl, homeTitle, homeDescription } from "@/lib/page-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "System Strzelecki",
  title: homeTitle,
  description: homeDescription,
  manifest: "/manifest.webmanifest",
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
      {
        url: "/icons/system-strzelecki-apple-180-20260717.png",
        sizes: "180x180",
        type: "image/png",
      },
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
        <MaintenanceGuard />
        <GlobalUiSettings />
        <AppNavigation />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
