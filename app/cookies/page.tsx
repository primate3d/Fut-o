const cookieRows = [
  {
    name: "Stockage local de la clé d'accès",
    purpose: "Maintenir l'accès personnel ouvert sur le navigateur de l'utilisateur.",
    duration: "Jusqu'à suppression locale ou expiration prévue de la clé.",
    consent: "Strictement nécessaire au service."
  },
  {
    name: "Stockage local du parcours",
    purpose: "Conserver temporairement les documents ajoutés, l'analyse et les étapes du parcours.",
    duration: "Jusqu'à réinitialisation de l'audit ou nettoyage du navigateur.",
    consent: "Strictement nécessaire au service demandé."
  }
];

export default function CookiesPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Cookies et traceurs
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Politique de cookies
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Futéo n'utilise pas, à ce stade, de cookies publicitaires, de
            reciblage ou de mesure d'audience. Il n'y a donc pas de bannière de
            consentement cookies à afficher tant que cette situation ne change pas.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-[#e5d8c6] bg-white/90 shadow-sm">
          <div className="grid gap-4 border-b border-[#efe6d8] bg-[#fffaf2] px-5 py-4 text-sm font-semibold text-[#12243d] md:grid-cols-4">
            <p>Traceur</p>
            <p>Finalité</p>
            <p>Durée</p>
            <p>Consentement</p>
          </div>
          {cookieRows.map((row) => (
            <div
              className="grid gap-4 border-b border-[#efe6d8] px-5 py-5 text-sm leading-6 text-slate-600 last:border-0 md:grid-cols-4"
              key={row.name}
            >
              <p className="font-semibold text-[#12243d]">{row.name}</p>
              <p>{row.purpose}</p>
              <p>{row.duration}</p>
              <p>{row.consent}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#12243d]">
            Retirer ou nettoyer ses données locales
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            Vous pouvez réinitialiser votre audit depuis la page Compte ou
            effacer les données du site depuis les paramètres de votre navigateur.
            Si des cookies analytiques ou marketing sont ajoutés plus tard, un
            mécanisme de consentement sera mis en place.
          </p>
        </div>
      </section>
    </main>
  );
}
