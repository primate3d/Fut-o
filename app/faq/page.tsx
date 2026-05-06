const faqs = [
  {
    question: "Qui voit mes documents ?",
    answer:
      "Futéo utilise uniquement les documents que vous choisissez d'ajouter pour construire votre parcours. Ils ne sont pas affichés publiquement, ni revendus. Les accès techniques dépendent des prestataires réellement connectés au service, qui doivent être listés dans la politique de confidentialité avant lancement."
  },
  {
    question: "Quels types de contrats sont pris en charge ?",
    answer:
      "Le service est pensé pour les contrats et dépenses récurrentes du foyer : énergie, internet, mobile, assurances, abonnements, banque, logement, transport ou autres postes réguliers."
  },
  {
    question: "Combien de temps dure l'accès par clé ?",
    answer:
      "L'accès par clé est prévu pour un usage personnel et ponctuel. La durée exacte dépend de l'offre affichée au moment de l'achat, avec une logique simple : paiement unique, sans abonnement."
  },
  {
    question: "Que se passe-t-il si je ne fais aucune démarche après l'analyse ?",
    answer:
      "Rien n'est envoyé automatiquement. Futéo vous aide à comprendre, comparer et préparer des courriers. Vous restez libre de ne rien faire, de relire plus tard ou de choisir uniquement certaines démarches."
  },
  {
    question: "Futéo garantit-il des économies ?",
    answer:
      "Non. Futéo ne promet pas d'économie automatique. Le service aide à repérer ce qui mérite d'être vérifié et à préparer les actions possibles, mais la décision finale vous appartient."
  },
  {
    question: "Les courriers sont-ils envoyés automatiquement ?",
    answer:
      "Non. Les courriers sont préparés pour être relus, adaptés puis utilisés si vous le souhaitez. Aucun courrier n'est envoyé sans action de votre part."
  },
  {
    question: "Dois-je transmettre tous mes documents ?",
    answer:
      "Non. Vous pouvez commencer avec les éléments que vous jugez utiles. Plus les documents sont clairs et complets, plus le parcours peut être précis, mais vous gardez toujours le contrôle."
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
