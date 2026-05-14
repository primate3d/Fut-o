"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { storeAccessKey } from "@/features/billing";
import type { AccessKey } from "@/types";

export function AccessKeyActivator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") ?? "/tableau-de-bord";
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch("/api/keys/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      setStatus("error");
      setMessage("Cette clé ne semble pas correspondre. Vérifiez le code saisi.");
      return;
    }

    const { key } = (await response.json()) as { key: AccessKey };

    await storeAccessKey(key);
    setStatus("success");
    setMessage("Clé activée. Votre espace s'ouvre dans un instant.");
    window.setTimeout(() => router.replace(redirectPath), 650);
  }

  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-sage-500/20 bg-sage-100 text-sage-700">
        <KeyRound size={24} />
      </div>
      <h1 className="mt-5 text-3xl font-bold text-navy-900">Activer ma clé</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Entrez votre clé personnelle pour ouvrir votre espace Futéo. Paiement
        unique, sans abonnement, clé non transférable.
      </p>
      <div className="mt-5 grid gap-3 rounded-xl border border-navy-100 bg-navy-50 p-4 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-sage-700" size={17} />
          Accès complet après activation
        </div>
        <div className="flex items-center gap-2">
          <ShoppingCart className="text-sage-700" size={17} />
          Pas encore de clé ? La page tarifs présente les accès disponibles.
        </div>
      </div>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold text-navy-900" htmlFor="access-key">
          Code d'accès
        </label>
        <input
          className="h-12 w-full rounded-lg border border-navy-100 bg-white px-4 text-navy-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
          id="access-key"
          onChange={(event) => setCode(event.target.value)}
          placeholder="FUTEO-PREMIUM-XXXXXX"
          value={code}
        />
        {message ? (
          <p
            className={
              status === "success"
                ? "text-sm font-medium text-sage-700"
                : "text-sm font-medium text-red-600"
            }
          >
            {message}
          </p>
        ) : null}
        <Button className="w-full" type="submit">
          Activer la clé
        </Button>
        <Button className="w-full" href="/tarifs" variant="ghost">
          Acheter une clé
        </Button>
      </form>
    </Card>
  );
}
