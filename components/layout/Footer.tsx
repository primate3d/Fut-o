import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

const productLinks = [
  { label: "Guides", href: "/guides" },
  { label: "Résilier une box", href: "/resilier-box-internet" },
  { label: "Négocier internet", href: "/negocier-forfait-internet" },
  { label: "Énergie", href: "/changer-fournisseur-energie" },
  { label: "À propos", href: "/a-propos" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" }
];

const legalLinks = [
  { label: "Mentions légales", href: "/mentions-legales" },
  { label: "Confidentialité", href: "/confidentialite" },
  { label: "Cookies", href: "/cookies" },
  { label: "CGV", href: "/cgv" }
];

export function Footer() {
  return (
    <footer className="border-t border-navy-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 text-sm text-slate-500 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-6" variant="icon" />
            <div>
              <p className="font-semibold text-navy-900">Futéo</p>
              <p className="mt-1">Service en ligne, sans abonnement.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:text-right">
            <div>
              <p className="font-semibold text-navy-900">Produit</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
                {productLinks.map((link) => (
                  <Link
                    className="font-semibold hover:text-navy-900"
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-navy-900">Légal</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
                {legalLinks.map((link) => (
                  <Link
                    className="font-semibold hover:text-navy-900"
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
