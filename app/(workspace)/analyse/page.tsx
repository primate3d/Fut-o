import { AnalysisRunner } from "@/features/analysis/AnalysisRunner";

export default function AnalysisPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy-900">Analyse de vos contrats</h1>
        <p className="mt-2 text-slate-600">
          Nous organisons les elements fournis pour voir ce qui merite d'etre
          compare, ajuste ou prepare en courrier.
        </p>
      </div>
      <AnalysisRunner />
    </section>
  );
}
