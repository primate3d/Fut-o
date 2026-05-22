"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ACCESS_KEY_STORAGE_KEY,
  getStoredAccessKey,
  validateAccessKeyServer
} from "@/features/billing";
import type { AccessKey } from "@/types";

export function HeaderAccessActions() {
  const [accessKey, setAccessKey] = useState<AccessKey | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function validateStoredAccessKey() {
      const storedKey = getStoredAccessKey();

      if (!storedKey) {
        if (isMounted) {
          setAccessKey(null);
        }
        return;
      }

      const serverKey = await validateAccessKeyServer(storedKey.code);

      if (!isMounted) return;

      if (!serverKey) {
        window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
        setAccessKey(null);
        return;
      }

      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, JSON.stringify(serverKey));
      setAccessKey(serverKey);
    }

    void validateStoredAccessKey();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasValidatedAccess = Boolean(accessKey);
  const workspaceHref = hasValidatedAccess
    ? "/tableau-de-bord"
    : "/activer-cle?redirect=/tableau-de-bord";

  return (
    <div className="hidden items-center gap-4 md:flex">
      <span className="text-[10px] font-bold uppercase tracking-wider text-sage-600">
        {hasValidatedAccess ? "Cle personnelle active" : "Zero abonnement"}
      </span>
      <Button href={workspaceHref} variant="secondary">
        Espace utilisateur
      </Button>
    </div>
  );
}
