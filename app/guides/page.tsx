import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { guideArticles } from "@/data/guides";

export const metadata: Metadata = {
  title: "Guides et courriers | Futéo",
  description:
    "Guides Futéo pour résiliation, assurance habitation, forfait internet, énergie, négociation, réduction tarifaire, abonnements et dépenses mensuelles."
};

const shortCards: Record<
  string,
  {
    sentence: string;
    tags: string[];
    preview: string;
  }
> = {
  "lettre-resiliation-assurance-habitation": {
    sentence: "Préparer une résiliation d'assurance habitation sans recopier un modèle générique.",
    tags: ["résiliation", "assurance habitation", "contrat"],
    preview: "Objet : demande de résiliation du contrat d'assurance habitation"
  },
  "negocier-son-forfait-internet": {
    sentence: "Comparer une box ou un forfait internet avant de demander une offre adaptée.",
    tags: ["forfait internet", "négociation", "box internet"],
    preview: "Objet : demande de réévaluation de mon forfait internet"
  },
  "comparer-plusieurs-contrats-facilement": {
    sentence: "Repérer les contrats du foyer qui méritent une comparaison simple.",
    tags: ["comparaison de contrats", "abonnements", "démarche"],
    preview: "Objet : synthèse des contrats à comparer"
  },
  "reduire-ses-depenses-mensuelles": {
    sentence: "Identifier les dépenses mensuelles et abonnements qui pèsent le plus.",
    tags: ["dépenses mensuelles", "abonnement", "réduction tarifaire"],
    preview: "Objet : demande de réduction tarifaire"
  },
  "changer-de-fournisseur-energie": {
    sentence: "Comparer un contrat d'énergie avant un éventuel changement de fournisseur.",
    tags: ["énergie", "fournisseur", "offre adaptée"],
    preview: "Objet : demande d'information sur mon contrat énergie"
  },
  "resilier-une-box-internet": {
    sentence: "Préparer une résiliation de box internet claire et facile à relire.",
    tags: ["résiliation", "box internet", "abonnement"],
    preview: "Objet : résiliation de mon abonnement internet"
  },
  "demande-reduction-tarifaire": {
    sentence: "Structurer une demande de réduction tarifaire à partir d'un contrat existant.",
    tags: ["réduction tarifaire", "négociation", "contrat"],
    preview: "Objet : demande de réduction tarifaire"
  },
  "changement-offre-mobile": {
    sentence: "Comparer un forfait mobile ancien avec une offre plus adaptée.",
    tags: ["forfait mobile", "changement d'offre", "comparaison"],
    preview: "Objet : demande de changement d'offre mobile"
  }
};

export default function GuidesPage() {
  return (
    <main className="bg-[#fbf6ed] text-navy-900">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            Guides & courriers
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight text-[#12243d] md:text-5xl">
            Guides et courriers pour mieux gérer vos contrats
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Résiliation, négociation, comparaison d'offres, réduction tarifaire :
            des repères utiles, sans modèles complets à copier.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-[#12243d]">
            Les démarches les plus recherchées
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Assurance habitation, box internet, forfait mobile, fournisseur d'énergie,
            abonnements et dépenses mensuelles.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {guideArticles.map((article) => {
            const card = shortCards[article.slug];

            return (
              <Card className="bg-white/95 p-5" key={article.slug}>
                <h3 className="text-lg font-semibold leading-7 text-[#12243d]">
                  {article.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {card.sentence}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {card.tags.map((tag) => (
                    <span
                      className="rounded-full bg-sage-50 px-3 py-1 text-xs font-semibold text-sage-800"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-5 truncate rounded-xl border border-[#e9dece] bg-[#fbf6ed] px-3 py-2 text-xs font-medium text-slate-600">
                  {card.preview}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="bg-[#142238] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-16">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Comprendre la démarche, puis générer le bon courrier.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/72">
              Futéo vous aide à comparer vos contrats, repérer les offres adaptées
              et préparer une démarche personnalisée.
            </p>
          </div>
          <Button href="/tarifs" variant="secondary">
            Accéder à Futéo <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
