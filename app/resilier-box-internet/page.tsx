import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";

export const metadata: Metadata = {
  title: "Résilier une box internet simplement",
  description:
    "Préparer une résiliation de box internet avec les bonnes informations : contrat, abonnement, opérateur et courrier clair."
};

export default function ResilierBoxInternetPage() {
  return (
    <SeoLandingPage
      ctaLabel="Préparer ma démarche"
      description="Avant une résiliation de box internet, il vaut mieux retrouver le contrat, vérifier l'abonnement et comparer les offres disponibles. Futéo vous aide à organiser ces informations sans démarche lourde."
      eyebrow="Résiliation internet"
      faq={[
        {
          question: "Que faut-il vérifier ?",
          answer:
            "Le numéro client, l'engagement éventuel, les frais de résiliation et la date souhaitée."
        },
        {
          question: "Faut-il comparer avant ?",
          answer:
            "Oui, comparer une box internet permet de savoir si une négociation ou un changement est plus pertinent."
        },
        {
          question: "Futéo envoie le courrier ?",
          answer:
            "Futéo prépare une base claire à relire et adapter avant envoi avec votre outil habituel."
        }
      ]}
      points={[
        "Retrouver le fournisseur, le numéro client et les conditions du contrat.",
        "Comparer le prix de la box internet avec des offres proches de votre usage.",
        "Préparer un courrier de résiliation court, clair et traçable."
      ]}
      title="Résilier une box internet sans perdre le fil"
    />
  );
}
