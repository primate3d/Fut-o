const faqs = [
  {
    question: "Quelles formules Futéo propose-t-il ?",
    answer:
      "Futéo propose trois accès personnels : Découverte gratuite à 0 €, Audit Foyer à 9,90 € et Audit Famille à 19,90 €. Chaque accès est sans abonnement et limité dans le temps selon la formule choisie."
  },
  {
    question: "Quels contrats puis-je analyser aujourd'hui ?",
    answer:
      "Futéo compare actuellement le mobile, la box et internet, l'électricité, le gaz et l'assurance habitation. Des pistes indicatives sont également proposées pour l'assurance auto et deux-roues, sous réserve de devis et de garanties comparables. La mutuelle, la prévoyance et l'assurance emprunteur ne sont pas encore disponibles."
  },
  {
    question: "Puis-je utiliser Futéo sans téléverser un document ?",
    answer:
      "Oui. Vous pouvez utiliser la saisie manuelle depuis l'espace Résultats pour indiquer un fournisseur, un type de contrat, un montant, une fréquence et les coordonnées utiles. Cette option est adaptée si vous préférez ne pas déposer de fichier ou si votre document regroupe plusieurs contrats."
  },
  {
    question: "Mes documents sont-ils conservés ?",
    answer:
      "Les documents que vous choisissez d'importer servent uniquement à préparer votre analyse et vos démarches. Vous pouvez supprimer les fichiers sources depuis votre espace. Les résultats textuels utiles restent accessibles pendant la durée de validité de votre clé."
  },
  {
    question: "Futéo garantit-il une économie ?",
    answer:
      "Non. Futéo affiche une piste d'économie uniquement lorsqu'une alternative moins chère et exploitable est identifiée. Vous restez libre de vérifier l'offre, de la choisir ou de ne réaliser aucune démarche."
  },
  {
    question: "Les courriers sont-ils envoyés automatiquement ?",
    answer:
      "Non. Futéo prépare des courriers personnalisables. Vous devez toujours les relire et décider vous-même de les utiliser ou non."
  }
];

export default function FaqPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Questions fréquentes
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Les réponses avant de commencer.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Voici les questions les plus concrètes sur les documents, l'accès par
            clé, les courriers et les limites du service.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4">
          {faqs.map((faq) => (
            <details
              className="group rounded-2xl border border-[#e5d8c6] bg-white/90 p-5 shadow-sm"
              key={faq.question}
            >
              <summary className="cursor-pointer list-none text-lg font-bold text-[#12243d]">
                {faq.question}
              </summary>
              <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
