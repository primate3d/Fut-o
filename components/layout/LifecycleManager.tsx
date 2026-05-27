"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { getStoredAccessKey } from "@/features/billing/access-keys";
import { purgeAllSessionData } from "@/features/privacy/lifecycle";

export function LifecycleManager() {
  const pathname = usePathname();
  const router = useRouter();
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const keysToMigrate = [
      "activeAccessKey",
      "purchasedAccessKeys",
      "uploadedDocuments",
      "mockAnalysis"
    ];

    keysToMigrate.forEach((key) => {
      const oldKey = `foyerfute.${key}`;
      const newKey = `futeo.${key}`;
      const oldData = window.localStorage.getItem(oldKey);
      const newData = window.localStorage.getItem(newKey);

      if (oldData && !newData) {
        window.localStorage.setItem(newKey, oldData);
      }
    });
  }, []);

  useEffect(() => {
    const checkExpiration = () => {
      const accessKey = getStoredAccessKey();

      if (!accessKey?.activatedAt) return;

      const expirationDate = new Date(accessKey.expiresAt);
      const now = new Date();

      if (now > expirationDate) {
        purgeAllSessionData();
        setIsExpired(true);

        if (
          pathname.includes("/tableau-de-bord") ||
          pathname.includes("/importer") ||
          pathname.includes("/analyse") ||
          pathname.includes("/courriers")
        ) {
          router.push("/?expired=true");
        }
      }
    };

    checkExpiration();

    const interval = window.setInterval(checkExpiration, 60000);
    return () => window.clearInterval(interval);
  }, [pathname, router]);

  if (!isExpired) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Clock size={20} />
        </div>
        <div>
          <p className="font-bold text-amber-900">Session terminée</p>
          <p className="mt-1 text-sm text-amber-800">
            Votre clé est arrivée à expiration. Les données locales
            de l'audit ont été retirées de ce navigateur.
          </p>
        </div>
      </div>
    </div>
  );
}
