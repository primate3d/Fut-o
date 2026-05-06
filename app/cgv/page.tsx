const sections = [
  {
    title: "Objet",
    text:
      "Les présentes conditions générales encadrent l'achat et l'utilisation du service Futéo, qui aide l'utilisateur à organiser certains documents, comparer des pistes utiles et préparer des courriers personnalisables."
  },
  {
    title: "Prix",
    text:
      "Les prix sont indiqués en euros, toutes taxes comprises lorsque cela est applicable. Futéo fonctionne par paiement unique, sans abonnement récurrent."
  },
  {
    title: "Paiement",
    text:
      "Le paiement est réalisé en ligne par le prestataire de paiement indiqué lors de la commande. La commande est considérée comme validée après confirmation du paiement."
  },
  {
    title: "Livraison du service",
    text:
      "Après paiement, l'utilisateur reçoit ou active une clé personnelle permettant d'accéder au parcours Futéo. La livraison est numérique et intervient normalement immédiatement après confirmation du paiement."
  },
  {
    title: "Droit de rétractation",
    text:
      "Pour un service numérique fourni avant la fin du délai légal de rétractation, l'utilisateur peut être amené à renoncer expressément à son droit de rétractation au moment de la commande. Ce point doit être confirmé dans le tunnel de paiement avant lancement public."
  },
  {
    title: "Conditions d'utilisation",
    text:
      "L'utilisateur choisit les documents qu'il ajoute et reste responsable de la relecture des résultats, comparaisons et courriers. Futéo fournit une aide à la décision et à la préparation des démarches, sans garantir une économie ni un changement d'offre."
  },
  {
    title: "Limites du service",
    text:
      "Les informations fournies par Futéo doivent être vérifiées avant toute décision. Les courriers préparés sont personnalisables et doivent être relus avant envoi."
  },
  {
    title: "Support et contact",
    text:
      "Les modalités de support et l'adresse de contact doivent être complétées dans les mentions légales avant la mise en ligne publique."
  }
];

export default function TermsPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Conditions de vente
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Conditions générales de vente
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Ces CGV sont nécessaires dès lors que Futéo vend un accès payant au
            service. Elles restent volontairement simples et devront être
            complétées avec les informations exactes de l'éditeur avant lancement.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-5">
          {sections.map((section) => (
            <article
              className="rounded-2xl border border-[#e5d8c6] bg-white/90 p-6 shadow-sm"
              key={section.title}
            >
              <h2 className="text-xl font-bold text-[#12243d]">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{section.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
