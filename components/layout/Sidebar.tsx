import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  FileText,
  Gauge,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
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

type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
};

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  return (
    <aside className="rounded-xl border border-navy-100/80 bg-white p-3 shadow-soft ring-1 ring-white/70 lg:sticky lg:top-24">
      <div className={collapsed ? "mb-2 flex justify-center" : "mb-2 rounded-lg bg-navy-50 px-3 py-3"}>
        {collapsed ? (
          <button
            aria-label="Afficher le menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 text-navy-700 transition hover:bg-sage-50"
            onClick={onToggle}
            title="Afficher le menu"
            type="button"
          >
            <PanelLeftOpen size={18} />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Espace foyer
              </p>
              <p className="mt-1 text-sm font-semibold text-navy-900">Audit en cours</p>
            </div>
            <button
              aria-label="Réduire le menu"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-700 transition hover:bg-white"
              onClick={onToggle}
              title="Réduire le menu"
              type="button"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
        )}
      </div>
      <nav className="grid gap-1">
        {siteConfig.userNav.map((item, index) => {
          const Icon = icons[index] ?? Gauge;

          return (
            <Link
              className={
                collapsed
                  ? "flex items-center justify-center rounded-lg px-2 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-sage-50 hover:text-navy-900"
                  : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-sage-50 hover:text-navy-900"
              }
              href={item.href}
              key={item.href}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                <Icon size={17} />
              </span>
              {collapsed ? null : item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
