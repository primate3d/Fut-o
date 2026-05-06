const sections = [
  {
    title: "Données utilisées",
    text:
      "Futéo utilise les éléments que vous choisissez d'ajouter : documents, informations de contrat, montants retrouvés, clé d'accès et éventuelles coordonnées saisies pour préparer un courrier. Vous n'êtes pas obligé de transmettre tous vos documents pour utiliser le service."
  },
  {
    title: "Finalités",
    text:
      "Ces données servent à ouvrir votre accès, organiser les documents fournis, produire une synthèse, comparer des pistes utiles et préparer des courriers personnalisables."
  },
  {
    title: "Base légale",
    text:
      "Le traitement repose principalement sur l'exécution du service demandé par l'utilisateur. Les données éventuellement nécessaires à la facturation reposent sur les obligations légales applicables."
  },
  {
    title: "Destinataires",
    text:
      "Les données ne sont pas vendues. Elles peuvent être traitées par les prestataires techniques nécessaires au fonctionnement du service, notamment l'hébergement et, lorsque les services réels seront activés, le paiement ou l'envoi d'emails."
  },
  {
    title: "Durée de conservation",
    text:
      "Les éléments liés à l'audit sont conservés le temps nécessaire à l'utilisation du service et peuvent être réinitialisés depuis l'espace compte. Les données de commande ou de facturation peuvent être conservées plus longtemps si la loi l'exige."
  },
  {
    title: "Vos droits",
    text:
      "Vous pouvez demander l'accès, la rectification, l'effacement ou la limitation du traitement de vos données. Le contact à utiliser doit être ajouté dans les mentions légales avant la mise en ligne."
  }
];

export default function PrivacyPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Données personnelles
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Politique de confidentialité
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Cette politique est volontairement courte : Futéo ne prévoit pas de
            collecte marketing ni de suivi publicitaire dans la version actuelle.
            Les données utilisées servent uniquement au fonctionnement du service.
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

        <div className="mt-6 rounded-2xl border border-sage-500/20 bg-sage-50 p-6">
          <p className="font-semibold text-[#12243d]">
            À compléter avant lancement
          </p>
          <p className="mt-2 leading-7 text-slate-600">
            Ajoutez l'identité du responsable de traitement, l'adresse de contact
            et la liste définitive des prestataires lorsque l'hébergement, le
            paiement, l'email et l'analyse réelle seront confirmés.
          </p>
        </div>
      </section>
    </main>
  );
}
