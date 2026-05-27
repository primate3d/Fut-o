import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LetterPreviewCard } from "@/components/guides/LetterPreviewCard";
import { guideArticles } from "@/data/guides";

type GuidePageProps = {
  params: Promise<{
    guideSlug: string;
  }>;
};

function formatGuideDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

export function generateStaticParams() {
  return guideArticles.map((article) => ({
    guideSlug: article.slug
  }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { guideSlug } = await params;
  const article = guideArticles.find((item) => item.slug === guideSlug);

  if (!article) {
    return {};
  }

  return {
    title: `${article.title} | Guides Futéo`,
    description: article.description
  };
}

export default async function GuideArticlePage({ params }: GuidePageProps) {
  const { guideSlug } = await params;
  const article = guideArticles.find((item) => item.slug === guideSlug);

  if (!article) {
    notFound();
  }

  return (
    <main className="bg-[#fbf6ed] text-navy-900">
      <article>
      <header className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
            {article.category} · {article.readingTime}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#12243d] md:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            {article.description}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            <time dateTime={article.updatedAt}>
              Mis à jour le {formatGuideDate(article.updatedAt)}
            </time>
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {article.keywords.map((keyword) => (
              <span
                className="rounded-full bg-sage-50 px-3 py-1 text-xs font-semibold text-sage-800"
                key={keyword}
              >
                {keyword}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/tarifs">
              {article.cta} <ArrowRight size={18} />
            </Button>
            <Button href="/guides" variant="secondary">
              Tous les guides
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
        <Card className="bg-white/90">
          <h2 className="text-2xl font-bold text-[#12243d]">
            Ce que contient la démarche
          </h2>
          <div className="mt-6 space-y-4">
            {article.includes.map((item) => (
              <div className="flex gap-3" key={item}>
                <CheckCircle2 className="mt-0.5 shrink-0 text-sage-700" size={19} />
                <p className="text-sm leading-7 text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-white/90">
          <h2 className="text-2xl font-bold text-[#12243d]">
            Les bonnes questions à se poser
          </h2>
          <div className="mt-6 space-y-4">
            {article.questions.map((question) => (
              <div className="flex gap-3" key={question}>
                <HelpCircle className="mt-0.5 shrink-0 text-sage-700" size={19} />
                <p className="text-sm leading-7 text-slate-600">{question}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="border-y border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              Aperçu limité
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#12243d]">
              La forme de la démarche, pas le courrier complet.
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Voir la forme, sans donner un modèle complet. Le document final est
              généré dans Futéo, avec les informations utiles à votre situation.
            </p>
          </div>
          <LetterPreviewCard
            description={article.description}
            href="/tarifs"
            keywords={article.keywords}
            object={article.preview.object}
            previewText={article.preview.text}
            title={article.title}
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8 lg:py-20">
        <Card className="bg-white/90">
          <h2 className="text-2xl font-bold text-[#12243d]">
            Méthode simple
          </h2>
          <div className="mt-6 space-y-4">
            {article.steps.map((step) => (
              <div className="flex gap-3" key={step}>
                <CheckCircle2 className="mt-0.5 shrink-0 text-sage-700" size={19} />
                <p className="text-sm leading-7 text-slate-600">{step}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="bg-[#142238] text-white">
          <h2 className="text-2xl font-bold">
            Générer une démarche adaptée
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/72">
            Futéo part des éléments que vous choisissez d'ajouter pour préparer une
            démarche plus utile qu'un modèle copié-collé : courrier, comparaison,
            négociation ou changement d'offre.
          </p>
          <Button className="mt-6" href="/tarifs" variant="secondary">
            {article.cta} <ArrowRight size={18} />
          </Button>
        </Card>
      </section>
      </article>
    </main>
  );
}
