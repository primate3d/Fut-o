import { Suspense } from "react";
import { AccessKeyActivator } from "@/components/billing/AccessKeyActivator";

export default function ActivateKeyPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="rounded-xl border border-navy-100 bg-white p-8 text-center shadow-soft">
            Chargement de l'activation...
          </div>
        }
      >
        <AccessKeyActivator />
      </Suspense>
    </main>
  );
}
