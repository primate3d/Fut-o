const editorFields = [
  ["Editeur du site", "homservices"],
  ["Forme juridique", "Auto-entrepreneur"],
  ["Adresse du siege", "1 allee de Lartigot, 64100 Bayonne"],
  ["SIREN / SIRET", "90490233500010"],
  ["Directeur de publication", "Yannick TEJOU"],
  ["Contact", "contact@futeo.fr"]
];

export default function LegalNoticePage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Informations legales
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Mentions legales
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Cette page rassemble les informations d'identification de l'editeur
            du site Futeo.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">Editeur</h2>
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
          <h2 className="text-xl font-bold text-[#12243d]">Hebergement</h2>
          <p className="mt-4 leading-7 text-slate-600">
            Le site est heberge par Railway.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">
            Propriete intellectuelle
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            Les textes, interfaces, elements graphiques, logos et contenus du
            site Futeo sont proteges. Toute reproduction ou reutilisation non
            autorisee est interdite, sauf accord ecrit prealable.
          </p>
        </div>
      </section>
    </main>
  );
}
