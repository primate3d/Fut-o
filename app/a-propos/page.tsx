import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Clock3,
  FileText,
  Handshake,
  ListChecks,
  SearchCheck
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const blocks = [
  {
    title: "Pourquoi Futéo existe",
    icon: <FileText size={18} />,
    text:
      "Beaucoup de contrats du foyer restent en place pendant des années. Ils continuent de fonctionner, alors on les laisse de côté, même quand ils ne correspondent plus vraiment à la situation actuelle."
  },
  {
    title: "Pourquoi les gens ne comparent pas",
    icon: <Clock3 size={18} />,
    text:
      "Comparer demande du temps, de la patience et parfois plusieurs appels ou formulaires. Une majorité de consommateurs repousse ces démarches simplement parce qu'elles arrivent au mauvais moment."
  },
  {
    title: "Notre approche",
    icon: <SearchCheck size={18} />,
    text:
      "Futéo part des éléments que vous choisissez d'ajouter. Le service aide à centraliser, clarifier, comparer et préparer des courriers propres pour avancer plus sereinement."
  },
  {
    title: "Gagner du temps simplement",
    icon: <ListChecks size={18} />,
    text:
      "L'objectif n'est pas de transformer le foyer en expert administratif. Futéo organise les informations utiles et met en avant les prochaines actions possibles."
  },
  {
    title: "Comparer sans se compliquer la vie",
    icon: <Handshake size={18} />,
    text:
      "Selon plusieurs études, le manque de temps reste une raison majeure pour ne pas changer de contrat. Futéo aide à rendre cette première étape plus simple, sans promettre un gain automatique."
  }
];

function KangarooMark({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sage-50 ring-1 ring-sage-500/15 sm:h-[70px] sm:w-[70px]">
      <Image
        alt=""
        aria-hidden="true"
        className="h-11 w-11 object-contain opacity-90 sm:h-12 sm:w-12"
        height={653}
        src="/brand/futeo-icon.png"
        width={653}
      />
      <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sage-700 shadow-sm ring-1 ring-sage-500/20">
        {children}
      </span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="bg-[#fbf6ed] text-navy-900">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <div>
            <KangarooMark>
              <FileText size={15} />
            </KangarooMark>
            <h1 className="mt-6 max-w-2xl text-4xl font-bold tracking-tight text-[#12243d] sm:text-5xl">
              Pourquoi Futéo existe
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              La plupart des gens paient leurs contrats pendant des années sans
              vraiment savoir s'ils sont encore adaptés.
            </p>
          </div>
          <Card className="self-end bg-white/88 p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              Un constat simple
            </p>
            <p className="mt-4 text-xl font-semibold leading-8 text-[#12243d]">
              Le plus compliqué n'est pas toujours de trouver une meilleure
              offre. Souvent, le plus compliqué est simplement de commencer.
            </p>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            "Les contrats restent souvent invisibles dans le quotidien.",
            "Les démarches sont repoussées faute de temps.",
            "Les informations sont éparpillées entre factures, emails et espaces clients."
          ].map((item) => (
            <Card className="bg-white/90" key={item}>
              <p className="text-base font-semibold leading-7 text-[#12243d]">
                {item}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              Quelques tendances
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#12243d]">
              Beaucoup de foyers savent qu'ils devraient comparer, mais peu le
              font vraiment.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Selon plusieurs études, une majorité de consommateurs garde ses
              contrats par habitude. Le manque de temps, la dispersion des
              documents et la peur de se lancer dans des démarches longues
              restent parmi les principales raisons évoquées.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-6">
          {blocks.map((block) => (
            <Card
              className="grid gap-5 bg-white/90 p-6 sm:grid-cols-[auto_1fr] sm:p-7"
              key={block.title}
            >
              <KangarooMark>{block.icon}</KangarooMark>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#12243d]">
                  {block.title}
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-8 text-slate-600">
                  {block.text}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-[#142238] px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 shadow-soft sm:p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#9bd7b5]">
              Mission
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Rendre les prochaines démarches plus faciles.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/72">
              Futéo aide à analyser, comparer, centraliser les informations
              utiles et préparer des courriers clairs, sans transformer le sujet
              en parcours administratif interminable.
            </p>
          </div>
          <Button href="/" variant="secondary">
            Découvrir Futéo <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
