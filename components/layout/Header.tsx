import Link from "next/link";
import { Menu } from "lucide-react";
import { HeaderAccessActions } from "@/components/layout/HeaderAccessActions";
import { Logo } from "@/components/layout/Logo";
import { siteConfig } from "@/config/site";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-100/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link className="flex flex-col items-start gap-1" href="/">
          <Logo className="h-10 sm:h-12" />
          <span className="rounded-full bg-sage-50 px-2.5 py-0.5 text-[10px] font-semibold leading-none text-navy-800 sm:text-[11px]">
            On analyse. On compare. On vous aide à{" "}
            <span className="text-sage-700">agir.</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-2 rounded-full border border-navy-100 bg-navy-50/70 p-1 md:flex">
          {siteConfig.mainNav.map((item) => (
            <Link
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-navy-900 hover:shadow-sm"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <HeaderAccessActions />
        <details className="relative md:hidden">
          <summary
            aria-label="Ouvrir le menu"
            className="flex cursor-pointer list-none rounded-lg border border-navy-100 bg-white p-2 text-navy-900 shadow-sm hover:bg-navy-50"
          >
            <Menu size={22} />
          </summary>
          <div className="absolute right-0 mt-3 w-64 rounded-xl border border-navy-100 bg-white p-3 shadow-soft">
            <nav className="grid gap-1">
              {siteConfig.mainNav.map((item) => (
                <Link
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-sage-50 hover:text-navy-900"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
              <HeaderAccessActions mobile />
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
