"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ACCESS_KEY_STORAGE_KEY,
  getStoredAccessKey,
  lookupAccessKeyStatusServer
} from "@/features/billing";
import type { AccessKey } from "@/types";

type AccessCheckState = "checking" | "active" | "inactive" | "unavailable";

export function HeaderAccessActions({ mobile = false }: { mobile?: boolean }) {
  const [accessKey, setAccessKey] = useState<AccessKey | null>(null);
  const [accessCheckState, setAccessCheckState] = useState<AccessCheckState>("checking");

  useEffect(() => {
    let isMounted = true;

    async function validateStoredAccessKey() {
      const storedKey = getStoredAccessKey();

      if (!storedKey) {
        if (isMounted) {
          setAccessKey(null);
          setAccessCheckState("inactive");
        }
        return;
      }

      setAccessCheckState("checking");
      const lookup = await lookupAccessKeyStatusServer(storedKey.code);

      if (!isMounted) return;

      if (lookup.state === "invalid") {
        window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
        setAccessKey(null);
        setAccessCheckState("inactive");
        return;
      }

      if (lookup.state === "unavailable") {
        setAccessKey(storedKey);
        setAccessCheckState("unavailable");
        return;
      }

      const serverKey = lookup.status.key;
      if (!serverKey) return;

      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, JSON.stringify(serverKey));
      setAccessKey(serverKey);
      setAccessCheckState("active");
    }

    void validateStoredAccessKey();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasValidatedAccess = accessCheckState === "active" && Boolean(accessKey);
  const keepsWorkspacePath =
    hasValidatedAccess ||
    (Boolean(accessKey) && accessCheckState === "unavailable") ||
    accessCheckState === "checking";
  const workspaceHref = keepsWorkspacePath
    ? "/tableau-de-bord"
    : "/activer-cle?redirect=/tableau-de-bord";
  const statusLabel = hasValidatedAccess
    ? "Cle personnelle active"
    : accessCheckState === "checking"
      ? "Verification de la cle"
      : accessCheckState === "unavailable"
        ? "Verification indisponible"
        : "Zero abonnement";

  if (mobile) {
    return (
      <Link
        className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-sage-50 hover:text-navy-900"
        href={workspaceHref}
      >
        Espace utilisateur
      </Link>
    );
  }

  return (
    <div className="hidden items-center gap-4 md:flex">
      <span className="text-[10px] font-bold uppercase tracking-wider text-sage-600">
        {statusLabel}
      </span>
      <Button href={workspaceHref} variant="secondary">
        Espace utilisateur
      </Button>
    </div>
  );
}
