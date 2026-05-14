"use client";

import { type FormEvent, useState } from "react";
import { Check, Info, KeyRound, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  accessKeyPlans,
  type AccessKeyPlanDefinition,
  type PlanAddon
} from "@/features/billing";

export function PricingAccessKeys() {
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [freeEmail, setFreeEmail] = useState("");
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  async function requestPaidAccess(plan: AccessKeyPlanDefinition) {
    setPurchaseMessage(null);
    setPendingPlan(plan.plan);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.plan })
      });
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
      };

      if (!response.ok) {
        setPurchaseMessage(payload.error ?? "Impossible de préparer cet accès pour le moment.");
        return;
      }

      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }

      setPurchaseMessage("Impossible de préparer cet accès pour le moment.");
    } catch {
      setPurchaseMessage("Impossible de préparer cet accès pour le moment.");
    } finally {
      setPendingPlan(null);
    }
  }

  async function handleFreeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPurchaseMessage(null);
    setPendingPlan("decouverte");

    try {
      const response = await fetch("/api/free-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: freeEmail })
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setPurchaseMessage(payload.error ?? "Impossible d'envoyer la clé gratuite.");
        return;
      }

      setShowFreeForm(false);
      setFreeEmail("");
      setPurchaseMessage(payload.message ?? "Votre clé gratuite a été envoyée par email.");
    } catch {
      setPurchaseMessage("Impossible d'envoyer la clé gratuite.");
    } finally {
      setPendingPlan(null);
    }
  }

  function handleAccess(plan: AccessKeyPlanDefinition) {
    setPurchaseMessage(null);

    if (plan.plan === "decouverte") {
      console.log("free access clicked");
      setShowFreeForm(true);
      return;
    }

    void requestPaidAccess(plan);
  }

  return (
    <div id="plans" className="space-y-8">
      <Card className="border-sage-200 bg-white/95">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 shrink-0 text-sage-700" size={20} />
          <div>
            <p className="font-semibold text-[#12243d]">Accès Futéo</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Choisissez une formule pour lancer votre analyse et préparer vos démarches.
              Chaque accès est personnel, limité dans le temps et sans abonnement.
            </p>
          </div>
        </div>
      </Card>

      {showFreeForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12243d]/45 px-4 py-8">
          <Card className="w-full max-w-lg border-sage-200 bg-white shadow-xl">
            <form className="space-y-4" onSubmit={handleFreeSubmit}>
              <div>
                <p className="font-semibold text-[#12243d]">Recevoir mon accès gratuit</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Indiquez votre email pour recevoir votre clé gratuite. Une seule clé gratuite
                  peut être demandée par email.
                </p>
              </div>
              <div className="space-y-3">
                <label className="sr-only" htmlFor="free-access-email">
                  Email
                </label>
                <input
                  autoFocus
                  className="min-h-12 w-full rounded-xl border border-sage-200 bg-white px-4 text-sm text-[#12243d] outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-100"
                  id="free-access-email"
                  inputMode="email"
                  onChange={(event) => setFreeEmail(event.target.value)}
                  placeholder="votre@email.fr"
                  type="email"
                  value={freeEmail}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button disabled={pendingPlan === "decouverte"} type="submit">
                    {pendingPlan === "decouverte" ? "Envoi..." : "Recevoir ma clé"}
                  </Button>
                  <Button onClick={() => setShowFreeForm(false)} type="button" variant="ghost">
                    Annuler
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {purchaseMessage ? (
        <Card className="border-amber-200 bg-amber-50 text-sm font-medium text-amber-900">
          {purchaseMessage}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {accessKeyPlans.map((plan) => (
          <PricingPlanCard
            isPending={pendingPlan === plan.plan}
            key={plan.plan}
            onPurchase={() => handleAccess(plan)}
            plan={plan}
          />
        ))}
      </div>
    </div>
  );
}

function PricingPlanCard({
  isPending,
  plan,
  onPurchase
}: {
  isPending: boolean;
  plan: AccessKeyPlanDefinition;
  onPurchase: () => void;
}) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div
      className={`relative flex flex-col rounded-[1.4rem] border transition-all duration-300 ${
        plan.highlighted
          ? "border-sage-400 bg-[#142238] text-white shadow-lg"
          : "border-[#e5d8c6] bg-white/90 shadow-sm"
      }`}
    >
      {plan.highlighted ? (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1.5 rounded-full bg-sage-500 px-4 py-1 text-xs font-bold text-white shadow">
            <Sparkles size={13} />
            Parcours complet
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-6 pt-8">
        <div className="mb-auto">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              plan.highlighted ? "bg-white/15 text-[#9bd7b5]" : "bg-sage-100 text-sage-700"
            }`}
          >
            <KeyRound size={22} />
          </div>
          <h2
            className={`mt-4 text-xl font-bold ${
              plan.highlighted ? "text-white" : "text-[#12243d]"
            }`}
          >
            {plan.name}
          </h2>
          <p
            className={`mt-2 text-sm leading-6 ${
              plan.highlighted ? "text-white/70" : "text-slate-500"
            }`}
          >
            {plan.description}
          </p>

          <p
            className={`mt-5 text-4xl font-bold ${
              plan.highlighted ? "text-[#9bd7b5]" : "text-sage-700"
            }`}
          >
            {plan.price}
          </p>
          <div
            className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              plan.highlighted ? "bg-white/15 text-[#9bd7b5]" : "bg-sage-100 text-sage-700"
            }`}
          >
            {plan.plan === "decouverte" ? "Découverte limitée" : "Paiement unique - Sans abonnement"}
          </div>

          <ul className="mt-6 space-y-2.5">
            {plan.items.map((item) => (
              <li
                className={`flex items-start gap-2.5 text-sm ${
                  plan.highlighted ? "text-white/85" : "text-slate-600"
                }`}
                key={item}
              >
                <Check
                  className={`mt-0.5 shrink-0 ${
                    plan.highlighted ? "text-[#9bd7b5]" : "text-sage-600"
                  }`}
                  size={16}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {plan.addons?.length ? (
          <PlanAddons
            addons={plan.addons}
            addonsTotalLabel={plan.addonsTotalLabel}
            highlighted={Boolean(plan.highlighted)}
            showOptions={showOptions}
            toggleOptions={() => setShowOptions((value) => !value)}
          />
        ) : null}

        {plan.premiumHint ? (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 ${
              plan.highlighted ? "bg-white/5" : "bg-sage-50"
            }`}
          >
            <Info
              className={`mt-0.5 shrink-0 ${
                plan.highlighted ? "text-[#9bd7b5]" : "text-sage-600"
              }`}
              size={15}
            />
            <p
              className={`text-xs font-medium leading-5 ${
                plan.highlighted ? "text-white/80" : "text-sage-800"
              }`}
            >
              {plan.premiumHint}
            </p>
          </div>
        ) : null}

        <Button
          className={`mt-6 w-full justify-center ${
            plan.highlighted ? "bg-white text-[#12243d] hover:bg-white/90" : ""
          }`}
          disabled={isPending}
          onClick={onPurchase}
          type="button"
          variant="secondary"
        >
          {isPending
            ? "Préparation..."
            : plan.plan === "decouverte"
              ? "Accès gratuit"
              : "Obtenir mon accès"}
        </Button>
        {plan.ctaHelper ? (
          <p
            className={`mt-3 text-xs leading-5 ${
              plan.highlighted ? "text-white/65" : "text-slate-500"
            }`}
          >
            {plan.ctaHelper}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PlanAddons({
  addons,
  addonsTotalLabel,
  highlighted,
  showOptions,
  toggleOptions
}: {
  addons: PlanAddon[];
  addonsTotalLabel?: string;
  highlighted: boolean;
  showOptions: boolean;
  toggleOptions: () => void;
}) {
  return (
    <div className="mt-6 border-t border-slate-200/20 pt-4">
      <button
        aria-expanded={showOptions}
        className={`flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide transition hover:opacity-80 ${
          highlighted ? "text-[#9bd7b5]" : "text-slate-500"
        }`}
        onClick={toggleOptions}
        type="button"
      >
        <span className="flex items-center gap-1.5">
          <Plus
            className={`transition-transform duration-300 ${showOptions ? "rotate-45" : ""}`}
            size={13}
          />
          {showOptions ? "Masquer les options" : "Options complémentaires"}
        </span>
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          showOptions ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`rounded-xl border p-4 ${
              highlighted ? "border-white/10 bg-white/5" : "border-[#e5d8c6] bg-[#fbf6ed]"
            }`}
          >
            <ul className="space-y-2">
              {addons.map((addon) => (
                <li className="flex items-center justify-between gap-3 text-sm" key={addon.label}>
                  <span className={highlighted ? "text-white/70" : "text-slate-600"}>
                    {addon.label}
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      highlighted ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {addon.price}
                  </span>
                </li>
              ))}
            </ul>
            {addonsTotalLabel ? (
              <p
                className={`mt-3 border-t pt-3 text-xs font-semibold ${
                  highlighted ? "border-white/10 text-white/50" : "border-[#e5d8c6] text-slate-500"
                }`}
              >
                {addonsTotalLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
