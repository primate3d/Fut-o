const editorFields = [
  ["Éditeur du site", "Futéo - Informations légales de l'éditeur à renseigner"],
  ["Forme juridique", "À compléter avant mise en ligne publique"],
  ["Adresse du siège", "À compléter avant mise en ligne publique"],
  ["SIREN / SIRET", "À compléter avant mise en ligne publique"],
  ["Directeur de publication", "À compléter avant mise en ligne publique"],
  ["Contact", "contact@futeo.fr"]
];

export default function LegalNoticePage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Informations légales
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Mentions légales
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Cette page rassemble les informations d'identification de l'éditeur
            du site Futéo. Les champs marqués “à compléter” doivent être
            remplacés par les informations officielles avant publication.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">Éditeur</h2>
          <dl className="mt-6 grid gap-4">
            {editorFields.map(([label, value]) => (
              <div
                className="grid gap-1 border-b border-[#efe6d8] pb-4 last:border-0 last:pb-0 sm:grid-cols-[220px_1fr]"
                key={label}
              >
                <dt className="font-semibold text-[#12243d]">{label}</dt>
                <dd className="text-slate-600">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">Hébergement</h2>
          <p className="mt-4 leading-7 text-slate-600">
            Le site est hébergé par Railway. Les informations exactes de
            l'hébergeur et l'adresse du prestataire doivent être confirmées dans
            le compte Railway avant lancement public.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">
            Propriété intellectuelle
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            Les textes, interfaces, éléments graphiques, logos et contenus du
            site Futéo sont protégés. Toute reproduction ou réutilisation non
            autorisée est interdite, sauf accord écrit préalable.
          </p>
        </div>
      </section>
    </main>
  );
}
