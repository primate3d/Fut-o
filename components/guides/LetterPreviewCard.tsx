import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type LetterPreviewCardProps = {
  title: string;
  description: string;
  keywords: string[];
  object?: string;
  previewText?: string;
  cta?: string;
  href?: string;
};

export function LetterPreviewCard({
  title,
  description,
  keywords,
  object = "Objet : démarche personnalisée",
  previewText = "Voir la forme, sans donner un modèle complet.",
  cta = "Préparer ma démarche",
  href = "/tarifs"
}: LetterPreviewCardProps) {
  return (
    <Card className="relative flex h-full flex-col bg-white/95 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold leading-7 text-[#12243d]">{title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-sage-50">
          <Image
            alt=""
            className="object-contain p-1.5 opacity-75"
            fill
            sizes="36px"
            src="/brand/futeo-icon.png"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {keywords.slice(0, 3).map((keyword) => (
          <span
            className="rounded-full bg-sage-50 px-3 py-1 text-xs font-semibold text-sage-800"
            key={keyword}
          >
            {keyword}
          </span>
        ))}
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500">
        Voir la forme, sans donner un modèle complet.
      </p>

      <div className="mt-3 rounded-2xl border border-[#e9dece] bg-[#fbf6ed] px-4 py-3">
        <p className="line-clamp-1 text-xs font-semibold text-[#12243d]">
          {object}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
          {previewText}
        </p>
      </div>

      <Button className="mt-5 w-fit" href={href} variant="ghost">
        {cta} <ArrowRight size={16} />
      </Button>
    </Card>
  );
}
