"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getStoredAccessKey } from "@/features/billing/access-keys";
import { getMissingContractFields } from "./contract-details";
import type { ContractDetails, Expense, MockAnalysis } from "@/types";

type Draft = Record<string, string> & { tempoConsumptionKwh?: never };

function supportedKind(expense: Expense): ContractDetails["kind"] | null {
  if (expense.contractDetails) return expense.contractDetails.kind;
  if (expense.documentType === "internet_invoice") return "internet";
  if (expense.documentType === "electricity_invoice") return "electricity";
  if (expense.documentType === "gas_invoice") return "gas";
  if (expense.documentType === "car_insurance") return "car_insurance";
  if (expense.documentType === "home_insurance") return "home_insurance";
  return null;
}

function inputClass() {
  return "mt-1 min-h-11 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-sage-500";
}

export function ContractDetailsConfirmationPanel({
  analysis,
  onSaved,
}: {
  analysis: MockAnalysis;
  onSaved: (analysis: MockAnalysis) => void;
}) {
  const relevantExpenses = analysis.expenses.filter((expense) => supportedKind(expense) && getMissingContractFields(expense).length > 0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (relevantExpenses.length === 0) return null;

  function setField(expenseId: string, field: string, value: string) {
    setDrafts((current) => ({ ...current, [expenseId]: { ...(current[expenseId] ?? {}), [field]: value } }));
  }

  async function submit(event: FormEvent, expense: Expense) {
    event.preventDefault();
    const activeKey = getStoredAccessKey();
    if (!activeKey?.code) {
      setMessage("Clé d'accès introuvable.");
      return;
    }
    const draft = drafts[expense.id] ?? {};
    const tempoConsumptionKwh = Object.fromEntries(
      ["bluePeak", "blueOffPeak", "whitePeak", "whiteOffPeak", "redPeak", "redOffPeak"]
        .filter((field) => draft[field] !== undefined && draft[field] !== "")
        .map((field) => [field, draft[field]])
    );
    const details = {
      ...draft,
      ...(Object.keys(tempoConsumptionKwh).length > 0 ? { tempoConsumptionKwh } : {}),
    };
    setSavingId(expense.id);
    setMessage(null);
    try {
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activeKey.code,
          contractConfirmation: { expenseId: expense.id, details },
        }),
      });
      const payload = await response.json() as { analysis?: MockAnalysis; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error || "Confirmation impossible");
      onSaved(payload.analysis);
      setMessage("Informations contractuelles enregistrées pour cet audit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Confirmation impossible");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-amber-700" size={20} />
        <h2 className="text-lg font-semibold text-navy-900">Informations à confirmer</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Futéo demande uniquement les éléments absents du document. Ils restent associés à ce contrat et à cet audit.
      </p>
      <div className="mt-4 space-y-4">
        {relevantExpenses.map((expense) => {
          const kind = supportedKind(expense)!;
          const draft = drafts[expense.id] ?? {};
          const option = draft.tariffOption || (expense.contractDetails?.kind === "electricity" ? expense.contractDetails.tariffOption : "");
          return (
            <form className="rounded-lg border border-amber-200 bg-white p-4" key={expense.id} onSubmit={(event) => void submit(event, expense)}>
              <h3 className="font-semibold text-navy-900">{expense.provider} — {expense.label}</h3>
              <p className="mt-1 text-xs text-amber-800">Manquant : {getMissingContractFields(expense).join(", ")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {kind === "internet" ? <>
                  <label className="text-sm font-medium text-navy-900">Technologie<select className={inputClass()} onChange={(event) => setField(expense.id, "technology", event.target.value)} value={draft.technology ?? ""}><option value="">Choisir</option><option value="FIBER">Fibre</option><option value="CABLE">Câble</option><option value="ADSL">ADSL</option><option value="VDSL">VDSL</option></select></label>
                  <label className="text-sm font-medium text-navy-900">Engagement (mois)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "commitmentMonths", event.target.value)} type="number" value={draft.commitmentMonths ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Débit descendant (Mbit/s)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "downloadMbps", event.target.value)} type="number" value={draft.downloadMbps ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Services inclus<input className={inputClass()} onChange={(event) => setField(expense.id, "includedServices", event.target.value)} placeholder="TV, téléphonie, ou Aucun" value={draft.includedServices ?? ""} /></label>
                </> : null}
                {kind === "electricity" ? <>
                  <label className="text-sm font-medium text-navy-900">Puissance (kVA)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "powerKva", event.target.value)} step="0.1" type="number" value={draft.powerKva ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Option<select className={inputClass()} onChange={(event) => setField(expense.id, "tariffOption", event.target.value)} value={option ?? ""}><option value="">Choisir</option><option value="BASE">Base</option><option value="HPHC">HP/HC</option><option value="TEMPO">Tempo</option></select></label>
                  <label className="text-sm font-medium text-navy-900">Consommation annuelle (kWh)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "annualConsumptionKwh", event.target.value)} type="number" value={draft.annualConsumptionKwh ?? ""} /></label>
                  {option === "HPHC" ? <><label className="text-sm font-medium text-navy-900">Heures pleines (kWh)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "peakConsumptionKwh", event.target.value)} type="number" value={draft.peakConsumptionKwh ?? ""} /></label><label className="text-sm font-medium text-navy-900">Heures creuses (kWh)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "offPeakConsumptionKwh", event.target.value)} type="number" value={draft.offPeakConsumptionKwh ?? ""} /></label></> : null}
                  {option === "TEMPO" ? ["bluePeak", "blueOffPeak", "whitePeak", "whiteOffPeak", "redPeak", "redOffPeak"].map((field) => <label className="text-sm font-medium text-navy-900" key={field}>Tempo {field}<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, field, event.target.value)} type="number" value={draft[field] ?? ""} /></label>) : null}
                </> : null}
                {kind === "gas" ? <>
                  <label className="text-sm font-medium text-navy-900">Consommation annuelle (kWh)<input className={inputClass()} min="0" onChange={(event) => setField(expense.id, "annualConsumptionKwh", event.target.value)} type="number" value={draft.annualConsumptionKwh ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Zone tarifaire<input className={inputClass()} onChange={(event) => setField(expense.id, "tariffZone", event.target.value)} value={draft.tariffZone ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Classe de consommation<input className={inputClass()} onChange={(event) => setField(expense.id, "consumptionClass", event.target.value)} value={draft.consumptionClass ?? ""} /></label>
                </> : null}
                {kind === "car_insurance" || kind === "home_insurance" ? <>
                  <label className="text-sm font-medium text-navy-900">Garanties<textarea className={inputClass()} onChange={(event) => setField(expense.id, "guarantees", event.target.value)} placeholder="Séparées par des virgules" value={draft.guarantees ?? ""} /></label>
                  <label className="text-sm font-medium text-navy-900">Franchises<textarea className={inputClass()} onChange={(event) => setField(expense.id, "deductibles", event.target.value)} placeholder="Séparées par des virgules" value={draft.deductibles ?? ""} /></label>
                </> : null}
              </div>
              <Button className="mt-4" disabled={savingId === expense.id} type="submit" variant="secondary">{savingId === expense.id ? <Loader2 className="animate-spin" size={16} /> : null}Enregistrer et comparer</Button>
            </form>
          );
        })}
      </div>
      {message ? <p className="mt-3 text-sm font-medium text-amber-900">{message}</p> : null}
    </Card>
  );
}
