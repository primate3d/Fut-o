import { EyeOff, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";

const guarantees = [
  {
    icon: <FileCheck2 size={24} />,
    title: "Vous choisissez les documents",
    text:
      "Futéo ne demande pas d'accès automatique à vos comptes. Le parcours part uniquement des fichiers ou informations que vous décidez d'ajouter."
  },
  {
    icon: <EyeOff size={24} />,
    title: "Pas d'affichage public",
    text:
      "Les documents ajoutés ne sont pas publiés, partagés sur une page publique ou revendus. Ils servent uniquement au parcours demandé."
  },
  {
    icon: <LockKeyhole size={24} />,
    title: "Accès personnel par clé",
    text:
      "L'accès par clé sert à ouvrir un espace personnel ponctuel, sans abonnement et sans création de compte complexe dans la version actuelle."
  },
  {
    icon: <ShieldCheck size={24} />,
    title: "Pas d'envoi automatique",
    text:
      "Les courriers préparés restent sous votre contrôle. Vous les relisez, les adaptez et décidez vous-même de les utiliser ou non."
  }
];

export default function SecurityPage() {
  return (
    <main className="bg-[#fbf6ed]">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Sécurité & confidentialité
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d]">
            Comprendre simplement ce qui se passe avec vos documents.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Cette page n'est pas un texte juridique. Elle explique en langage
            simple comment Futéo traite les éléments ajoutés et quelles limites
            sont importantes à connaître.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          {guarantees.map((item) => (
            <Card className="bg-white/90" key={item.title}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-50 text-sage-700">
                {item.icon}
              </div>
              <h2 className="mt-5 text-xl font-bold text-[#12243d]">
                {item.title}
              </h2>
              <p className="mt-3 leading-7 text-slate-600">{item.text}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <Card className="bg-white/90">
            <h2 className="text-xl font-bold text-[#12243d]">
              Ce qui est conservé
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              Les éléments nécessaires au parcours peuvent être conservés le
              temps de l'accès afin de retrouver l'analyse, les résultats et les
              courriers préparés.
            </p>
          </Card>
          <Card className="bg-white/90">
            <h2 className="text-xl font-bold text-[#12243d]">
              Ce qui ne se fait pas
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              Futéo ne vend pas les documents, ne les utilise pas pour de la
              publicité et n'envoie aucune démarche sans validation de votre part.
            </p>
          </Card>
          <Card className="bg-white/90">
            <h2 className="text-xl font-bold text-[#12243d]">
              Ce qui évoluera ensuite
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              Si des services externes sont ajoutés, comme l'analyse avancée,
              l'email ou le paiement réel, ils devront être expliqués clairement
              dans les pages légales.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}
