import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { LifecycleManager } from "@/components/layout/LifecycleManager";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Futéo",
  description:
    "Comparez les contrats du foyer, repérez les pistes utiles et préparez vos courriers.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand/futeo-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <Header />
        <LifecycleManager />
        {children}
        <Footer />
      </body>
    </html>
  );
}
