"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { purgeFullAudit } from "./lifecycle";

export function ResetAuditButton() {
  const [message, setMessage] = useState<string | null>(null);

  function resetAudit() {
    purgeFullAudit();
    setMessage("Votre audit est prêt à être recommencé.");
  }

  return (
    <div>
      <Button onClick={resetAudit} type="button" variant="secondary">
        <RotateCcw className="mr-2" size={18} />
        Recommencer mon audit
      </Button>
      {message ? <p className="mt-3 text-sm font-medium text-sage-700">{message}</p> : null}
    </div>
  );
}
