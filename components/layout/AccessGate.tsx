"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ACCESS_KEY_STORAGE_KEY,
  getStoredAccessKey,
  validateAccessKeyServer
} from "@/features/billing";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      const accessKey = getStoredAccessKey();

      if (!accessKey) {
        if (!isMounted) return;
        setIsAllowed(false);
        setHasCheckedAccess(true);
        router.replace(`/activer-cle?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const serverKey = await validateAccessKeyServer(accessKey.code);

      if (!isMounted) return;

      if (!serverKey) {
        window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
        setIsAllowed(false);
        setHasCheckedAccess(true);
        router.replace(`/activer-cle?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, JSON.stringify(serverKey));
      setIsAllowed(true);
      setHasCheckedAccess(true);
    }

    setHasCheckedAccess(false);
    void checkAccess();

    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

  if (!hasCheckedAccess) {
    return (
      <div className="rounded-xl border border-navy-100 bg-white p-8 text-center shadow-soft">
        <p className="font-semibold text-navy-900">Préparation de votre accès...</p>
        <p className="mt-2 text-sm text-slate-500">
          Un instant, nous vérifions que votre espace est prêt.
        </p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-sage-500/20 bg-sage-100 text-sage-700">
          <ShieldCheck size={28} />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-sage-700">
          Accès sécurisé
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-900">
          Accès par clé personnelle
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Futéo fonctionne avec une clé personnelle, à usage unique et non
          transférable. Activez votre clé pour ouvrir l'import, l'analyse, les
          courriers et le rapport.
        </p>
        <p className="mt-3 rounded-lg bg-navy-50 px-4 py-3 text-xs leading-5 text-slate-500">
          Votre clé sert à réserver l'accès à votre parcours, sans abonnement ni
          engagement mensuel.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Button href="/tarifs">Acheter une clé</Button>
          <Button
            href={`/activer-cle?redirect=${encodeURIComponent(pathname)}`}
            variant="secondary"
          >
            <KeyRound size={18} />
            J'ai déjà une clé
          </Button>
        </div>
      </Card>
    );
  }

  return children;
}
