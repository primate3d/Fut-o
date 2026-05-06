import { ImportDocumentsPanel } from "@/features/upload/ImportDocumentsPanel";

export default function ImportPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy-900">Importer mes documents</h1>
        <p className="mt-2 text-slate-600">
          Ajoutez uniquement les factures, contrats ou abonnements que vous voulez
          faire analyser. Vous pouvez commencer avec un seul document.
        </p>
      </div>
      <ImportDocumentsPanel />
    </section>
  );
}
