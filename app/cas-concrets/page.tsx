import { FileText, Handshake, SearchCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";

const cases = [
  {
    icon: <SearchCheck size={24} />,
    title: "Vérifier un contrat internet devenu ancien",
    context:
      "Un foyer garde la même offre internet depuis plusieurs années et ne sait plus si elle correspond encore à son usage.",
    use:
      "Il ajoute la facture ou le contrat disponible. Futéo aide à clarifier le poste, à le comparer avec des pistes plus adaptées et à préparer une demande de changement ou de négociation."
  },
  {
    icon: <FileText size={24} />,
    title: "Mettre de l'ordre dans plusieurs abonnements",
    context:
      "Plusieurs abonnements sont prélevés chaque mois, mais ils ne sont pas toujours regardés ensemble.",
    use:
      "Le foyer ajoute les éléments utiles. Futéo centralise les lignes retrouvées, fait ressortir les postes à surveiller et prépare les courriers si une résiliation ou une relance est nécessaire."
  },
  {
    icon: <Handshake size={24} />,
    title: "Préparer une discussion avec un assureur",
    context:
      "Avant de changer de contrat, l'utilisateur veut d'abord demander une proposition plus adaptée à son fournisseur actuel.",
    use:
      "Futéo aide à formuler un courrier de négociation clair, en bonne et due forme, que l'utilisateur peut relire, adapter puis envoyer lui-même."
  }
];

export default function UseCasesPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Cas concrets
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            À quoi peut servir Futéo ?
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Quelques exemples simples, sans promesse de gain automatique. Futéo
            aide surtout à clarifier la situation et à préparer les prochaines
            démarches.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {cases.map((item) => (
            <Card className="bg-white/90" key={item.title}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-50 text-sage-700">
                {item.icon}
              </div>
              <h2 className="mt-5 text-xl font-bold leading-7 text-[#12243d]">
                {item.title}
              </h2>
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-sage-700">
                Situation
              </p>
              <p className="mt-2 leading-7 text-slate-600">{item.context}</p>
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-sage-700">
                Avec Futéo
              </p>
              <p className="mt-2 leading-7 text-slate-600">{item.use}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
