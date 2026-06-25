import type { Metadata, Viewport } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import GlobalUiSettings from "./components/GlobalUiSettings";

export const metadata: Metadata = {
  applicationName: "System Strzelecki",
  title: "System Strzelecki",
  description: "System Organizacji Zawodów Strzeleckich",
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
