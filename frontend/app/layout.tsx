import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import GlobalUiSettings from "./components/GlobalUiSettings";

export const metadata: Metadata = {
  title: "System Strzelecki",
  description: "System zawodów strzeleckich",
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
      </body>
    </html>
  );
}
