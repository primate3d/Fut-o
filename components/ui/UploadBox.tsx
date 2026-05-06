import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function UploadBox() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-sage-500/50 bg-sage-50 p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-sage-700 shadow-sm">
        <FileUp size={26} />
      </div>
      <h2 className="text-xl font-semibold text-navy-900">Importer vos documents</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
        Ajoutez factures, contrats ou releves pour preparer l'analyse de votre
        foyer.
      </p>
      <Button className="mt-6" type="button">
        Selectionner des fichiers
      </Button>
    </div>
  );
}
