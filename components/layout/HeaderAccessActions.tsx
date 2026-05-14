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

    async function checkStoredAccess() {
      const storedKey = getStoredAccessKey();
      if (!storedKey) {
        setAccessKey(null);
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

    void checkStoredAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="hidden items-center gap-4 md:flex">
      <span className="text-[10px] font-bold uppercase tracking-wider text-sage-600">
        {accessKey ? "Clé personnelle active" : "Zéro abonnement"}
      </span>
      <Button href={accessKey ? "/tableau-de-bord" : "/activer-cle"} variant="secondary">
        {accessKey ? "Espace utilisateur" : "Activer ma clé"}
      </Button>
    </div>
  );
}
