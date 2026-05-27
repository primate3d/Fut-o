"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccessGate } from "@/components/layout/AccessGate";
import { JourneyProgress } from "@/components/layout/JourneyProgress";
import { MvpBanner } from "@/components/layout/MvpBanner";

const SIDEBAR_COLLAPSED_KEY = "futeo.sidebarCollapsed";

export function WorkspaceClientProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldPreferCollapsedSidebar =
    pathname.includes("/courriers") ||
    pathname.includes("/rapport") ||
    pathname.includes("/resultats");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(shouldPreferCollapsedSidebar);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (shouldPreferCollapsedSidebar && storedValue !== "false") {
      setSidebarCollapsed(true);
      return;
    }

    setSidebarCollapsed(storedValue === "true");
  }, [shouldPreferCollapsedSidebar]);

  function toggleSidebar() {
    setSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextValue));
      return nextValue;
    });
  }

  return (
    <main
      className={
        sidebarCollapsed
          ? "mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[88px_1fr] lg:px-8 lg:py-8"
          : "mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8 lg:py-8"
      }
    >
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="min-w-0 space-y-6">
        <AccessGate>
          <MvpBanner />
          <JourneyProgress />
          {children}
        </AccessGate>
      </div>
    </main>
  );
}
