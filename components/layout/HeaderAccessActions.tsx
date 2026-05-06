"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getStoredAccessKey } from "@/features/billing";
import type { AccessKey } from "@/types";

export function HeaderAccessActions() {
  const [accessKey, setAccessKey] = useState<AccessKey | null>(null);

  useEffect(() => {
    setAccessKey(getStoredAccessKey());
  }, []);

  return (
    <div className="hidden items-center gap-4 md:flex">
      <span className="text-[10px] font-bold uppercase tracking-wider text-sage-600">
        {accessKey ? "Clé personnelle active" : "Zéro abonnement"}
      </span>
      <Button href="/tableau-de-bord" variant="secondary">
        Espace utilisateur
      </Button>
    </div>
  );
}
