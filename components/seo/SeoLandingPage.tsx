import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type SeoLandingPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  faq: Array<{
    question: string;
    answer: string;
  }>;
  ctaLabel?: string;
};

export function SeoLandingPage({
  eyebrow,
  title,
  description,
  points,
  faq,
  ctaLabel = "Comparer mes contrats"
}: SeoLandingPageProps) {
  return (
    <main className="bg-[#fbf6ed] text-navy-900">
      <section className="border-b border-[#e9dece] bg-[#fffaf2]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-[#12243d] md:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              {description}
            </p>
            <Button className="mt-7" href="/tarifs">
              {ctaLabel} <ArrowRight size={18} />
            </Button>
          </div>
          <Card className="self-end bg-white/90 p-6">
            <h2 className="text-xl font-semibold text-[#12243d]">
              À vérifier avant d'agir
            </h2>
            <div className="mt-5 space-y-4">
              {points.map((point) => (
                <div className="flex gap-3" key={point}>
                  <CheckCircle2 className="mt-0.5 shrink-0 text-sage-700" size={19} />
                  <p className="text-sm leading-7 text-slate-600">{point}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {faq.map((item) => (
            <Card className="bg-white/90 p-5" key={item.question}>
              <h2 className="text-base font-semibold leading-6 text-[#12243d]">
                {item.question}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {item.answer}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-[#e9dece] bg-[#142238] px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Voir clair avant de négocier, résilier ou changer.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
              Futéo aide à relire les dépenses mensuelles, comparer les contrats
              et préparer une démarche simple.
            </p>
          </div>
          <Button href="/guides" variant="secondary">
            Voir les guides <ArrowRight size={18} />
          </Button>
        </div>
      </section>
    </main>
  );
}
