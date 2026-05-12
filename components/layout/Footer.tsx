import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

const productLinks = [
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
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 text-sm text-slate-500 sm:px-6 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)] lg:px-8">
        <div className="flex items-center gap-3">
          <Logo className="h-6 shrink-0" variant="icon" />
          <div>
            <p className="font-semibold text-navy-900">Futéo</p>
            <p className="mt-1 max-w-48 leading-6">Service en ligne, sans abonnement.</p>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-[minmax(140px,0.7fr)_minmax(0,1fr)] lg:max-w-xl lg:gap-10">
          <nav aria-label="Produit">
            <p className="font-semibold text-navy-900">Produit</p>
            <div className="mt-2 flex max-w-2xl flex-wrap gap-x-4 gap-y-2">
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
          </nav>

          <nav aria-label="Légal">
            <p className="font-semibold text-navy-900">Légal</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 sm:grid sm:gap-y-2">
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
          </nav>
        </div>
      </div>
    </footer>
  );
}
