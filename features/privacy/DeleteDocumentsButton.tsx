"use client";

import { useEffect, useState } from "react";
import { Trash2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getStoredMockAnalysis } from "@/features/analysis/storage";
import { getStoredUploadedDocuments } from "@/features/upload/storage";
import { purgeSourceDocuments } from "./lifecycle";

export function DeleteDocumentsButton() {
  const [isReady, setIsReady] = useState(false);
  const [hasDocuments, setHasDocuments] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    const analysis = getStoredMockAnalysis();
    const docs = getStoredUploadedDocuments();
    
    // Le bouton est "pret" si l'analyse existe (traitement termine)
    setIsReady(Boolean(analysis));
    // Verifie s'il reste des documents sources a supprimer
    setHasDocuments(docs.length > 0);
  }, []);

  function handleDelete() {
    if (!isReady) return;
    
    if (confirm("Voulez-vous supprimer définitivement les fichiers sources ? Votre analyse et vos courriers resteront accessibles.")) {
      purgeSourceDocuments();
      setHasDocuments(false);
      setIsDeleted(true);
    }
  }

  if (isDeleted || !hasDocuments) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-sage-700 bg-sage-50 px-4 py-2 rounded-lg border border-sage-200">
        <CheckCircle2 size={18} />
        Fichiers sources supprimés (Analyse conservée)
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button 
        onClick={handleDelete} 
        disabled={!isReady}
        variant={isReady ? "secondary" : "ghost"}
        className={!isReady ? "bg-slate-50 text-slate-400 border-slate-100" : ""}
      >
        <Trash2 className="mr-2" size={18} />
        Supprimer les documents sources
      </Button>
      
      {!isReady ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock size={14} />
          Disponible une fois l'analyse terminée
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Action recommandée pour votre confidentialité.
        </p>
      )}
    </div>
  );
}
