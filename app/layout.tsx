import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { LifecycleManager } from "@/components/layout/LifecycleManager";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://futeo.fr";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  verification: {
    google: "yMo2Nl2YDactgaNpw-3WiNq4cyxKcWT55Jz5IIL2g2I"
  },
  title: {
    default: "Futéo | Comparer ses contrats et réduire ses dépenses",
    template: "%s | Futéo"
  },
  description:
    "Comparez les contrats du foyer, repérez les pistes d'économie et préparez vos courriers de résiliation, négociation ou changement d'offre.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Futéo | Comparer ses contrats du foyer",
    description:
      "Analysez box internet, assurance, énergie, forfait mobile et abonnements pour mieux gérer vos dépenses mensuelles.",
    url: "/",
    siteName: "Futéo",
    locale: "fr_FR",
    type: "website",
    images: [
      {
        url: "/brand/futeo-logo.png",
        width: 1200,
        height: 630,
        alt: "Futéo"
      }
    ]
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand/futeo-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <Header />
        <LifecycleManager />
        {children}
        <Footer />
      </body>
    </html>
  );
}
