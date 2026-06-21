import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import GlobalUiSettings from "./components/GlobalUiSettings";

export const metadata: Metadata = {
  title: "System Strzelecki",
  description: "System Organizacji Zawodów Strzeleckich",
  manifest: "/manifest.webmanifest?v=20260602-bgfix",
  icons: {
    icon: [
      { url: "/favicon.ico?v=20260602-bgfix", sizes: "any" },
      { url: "/icon.png?v=20260602-bgfix", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png?v=20260602-bgfix", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico?v=20260602-bgfix"],
  },
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
