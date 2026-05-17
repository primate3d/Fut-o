"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { purgeFullAudit } from "./lifecycle";

export function ResetAuditButton() {
  const [isReseting, setIsReseting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resetAudit() {
    setIsReseting(true);
    try {
      await purgeFullAudit();
      setMessage("Votre audit a été réinitialisé avec succès.");
      // Rechargement pour refléter l'état vide
      window.location.reload();
    } catch {
      setMessage("Une erreur est survenue lors de la réinitialisation.");
    } finally {
      setIsReseting(false);
    }
  }

  return (
    <div>
      <Button disabled={isReseting} onClick={resetAudit} type="button" variant="secondary">
        <RotateCcw className={`mr-2 ${isReseting ? "animate-spin" : ""}`} size={18} />
        {isReseting ? "Réinitialisation..." : "Recommencer mon audit"}
      </Button>
      {message ? <p className="mt-3 text-sm font-medium text-sage-700">{message}</p> : null}
    </div>
  );
}
