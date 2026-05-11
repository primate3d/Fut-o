import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";

export const metadata: Metadata = {
  title: "Réduire ses dépenses mensuelles",
  description:
    "Identifier les abonnements, contrats et dépenses mensuelles qui méritent une comparaison ou une négociation."
};

export default function ReduireDepensesMensuellesPage() {
  return (
    <SeoLandingPage
      ctaLabel="Analyser mes dépenses"
      description="Réduire ses dépenses mensuelles commence par voir ce qui revient vraiment : assurance, internet, énergie, forfait mobile ou abonnements. Futéo aide à prioriser sans surcharge."
      eyebrow="Dépenses du foyer"
      faq={[
        {
          question: "Par où commencer ?",
          answer:
            "Commencez par les contrats récurrents : internet, assurance, énergie, mobile et abonnements."
        },
        {
          question: "Faut-il tout résilier ?",
          answer:
            "Non. Le plus utile est de comparer, négocier ou ajuster selon chaque situation."
        },
        {
          question: "Une économie est-elle garantie ?",
          answer:
            "Non. Futéo met en avant des pistes à confirmer avant toute décision."
        }
      ]}
      points={[
        "Rassembler les factures ou contrats qui reviennent chaque mois.",
        "Repérer les postes les plus importants avant de décider.",
        "Préparer une négociation, une résiliation ou un changement si nécessaire."
      ]}
      title="Réduire ses dépenses mensuelles avec une vue simple"
    />
  );
}
