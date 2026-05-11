import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";

export const metadata: Metadata = {
  title: "Négocier son forfait internet",
  description:
    "Comparer une box internet, repérer une offre concurrente et préparer une négociation ou une demande de réduction tarifaire."
};

export default function NegocierForfaitInternetPage() {
  return (
    <SeoLandingPage
      ctaLabel="Comparer mon forfait"
      description="Un forfait internet ou une box ancienne peut rester au même tarif pendant des années. Futéo aide à relire le contrat, repérer les options et préparer une négociation simple."
      eyebrow="Négociation contrat"
      faq={[
        {
          question: "Quand négocier ?",
          answer:
            "Quand le prix mensuel semble élevé, quand une promotion concurrente existe ou quand vos usages ont changé."
        },
        {
          question: "Que demander ?",
          answer:
            "Une réduction tarifaire, un alignement avec une offre plus récente ou un changement de formule."
        },
        {
          question: "Faut-il menacer de résilier ?",
          answer:
            "Pas nécessairement. Une demande factuelle et polie est souvent plus claire."
        }
      ]}
      points={[
        "Identifier le prix actuel, les options et la durée d'engagement.",
        "Comparer avec des offres internet équivalentes.",
        "Préparer une demande de négociation courte et personnalisée."
      ]}
      title="Négocier son forfait internet avec une base claire"
    />
  );
}
