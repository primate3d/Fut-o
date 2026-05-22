import { ArrowRight, Ban, CreditCard, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PricingAccessKeys } from "@/components/billing/PricingAccessKeys";

const faqItems = [
  {
    question: "La clé est-elle personnelle ?",
    answer:
      "Oui. Chaque clé ouvre un parcours personnel. Elle est prévue pour un usage unique et ne doit pas être partagée."
  },
  {
    question: "Que se passe-t-il si je veux refaire un audit plus tard ?",
    answer:
      "Vous pourrez reprendre une nouvelle clé quand vous en aurez besoin. Il n'y a pas d'abonnement ni de prélèvement mensuel."
  },
  {
    question: "Dois-je transmettre tous mes documents ?",
    answer:
      "Non. Vous choisissez les éléments utiles à ajouter. Plus le dossier est complet, plus la lecture est précise, mais rien ne vous oblige à tout transmettre."
  },
  {
    question: "Quelle différence entre les plans ?",
    answer:
      "Le plan Simple donne une première lecture. L'Audit foyer ajoute des pistes de comparaison. Le Premium inclut le rapport complet et les courriers prêts à adapter."
  },
  {
    question: "Le paiement réel est-il déjà connecté ?",
    answer:
      "Oui. Le paiement est sécurisé par Stripe. Votre clé d'accès est générée après paiement et envoyée par e-mail."
  }
];

const guarantees = [
  {
    icon: <Ban size={20} />,
    label: "Sans abonnement"
  },
  {
    icon: <CreditCard size={20} />,
    label: "Paiement unique"
  },
  {
    icon: <KeyRound size={20} />,
    label: "Clé personnelle"
  },
  {
    icon: <ShieldCheck size={20} />,
    label: "Vous gardez la main"
  }
];

export default function PricingPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              Accès au coup par coup
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
              Une clé personnelle pour avancer sans abonnement.
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Choisissez le niveau d'accompagnement qui vous convient. Futéo vous
              aide à lire les éléments que vous ajoutez, à repérer ce qui mérite
              comparaison et à préparer les démarches utiles.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {guarantees.map((item) => (
              <div
                className="flex items-center gap-2 rounded-full border border-[#e5d8c6] bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                key={item.label}
              >
                <span className="text-sage-700">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <PricingAccessKeys />

        <p className="mt-6 text-center text-sm text-slate-500">
          Vous avez déjà une clé ?{" "}
          <Button
            className="inline text-sm font-semibold text-sage-700 underline-offset-4 hover:underline"
            href="/activer-cle"
            variant="ghost"
          >
            L'activer maintenant
          </Button>
        </p>

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[#e5d8c6] bg-white/80 px-5 py-4 text-center shadow-sm">
          <p className="text-sm font-semibold text-[#12243d]">
            Prochainement dans Futéo
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-semibold text-slate-500/80">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
              🏥 Mutuelle & Prévoyance · Bientôt disponible
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
              💳 Assurance Emprunteur & Crédit · Bientôt disponible
            </span>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-[#12243d]">
            Questions fréquentes
          </h2>
          <div className="mt-8 space-y-6">
            {faqItems.map((item) => (
              <div
                className="rounded-2xl border border-[#e5d8c6] bg-white/90 px-6 py-5 shadow-sm"
                key={item.question}
              >
                <p className="font-semibold text-[#12243d]">{item.question}</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e9dece] bg-[#142238] py-14 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#9bd7b5]">
            Prêt à commencer ?
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">
            Choisissez une clé et ouvrez votre espace.
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/70">
            Choisissez votre formule, réglez votre accès de façon sécurisée,
            puis activez votre clé reçue par e-mail.
          </p>
          <Button className="mt-7" href="#plans" variant="secondary">
            Voir les plans <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
