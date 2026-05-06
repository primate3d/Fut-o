import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  FileText,
  Gauge,
  Inbox,
  ScrollText,
  Search,
  Settings
} from "lucide-react";
import { siteConfig } from "@/config/site";

const icons = [
  Gauge,
  Inbox,
  Search,
  BarChart3,
  FileText,
  ScrollText,
  Settings,
  CreditCard
];

export function Sidebar() {
  return (
    <aside className="rounded-xl border border-navy-100/80 bg-white p-3 shadow-soft ring-1 ring-white/70 lg:sticky lg:top-24">
      <div className="mb-2 rounded-lg bg-navy-50 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Espace foyer
        </p>
        <p className="mt-1 text-sm font-semibold text-navy-900">Audit en cours</p>
      </div>
      <nav className="grid gap-1">
        {siteConfig.userNav.map((item, index) => {
          const Icon = icons[index] ?? Gauge;

          return (
            <Link
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-sage-50 hover:text-navy-900"
              href={item.href}
              key={item.href}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                <Icon size={17} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
