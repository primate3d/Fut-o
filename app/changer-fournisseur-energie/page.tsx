import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";

export const metadata: Metadata = {
  title: "Changer de fournisseur d'énergie",
  description:
    "Comparer un contrat d'électricité ou de gaz, vérifier les points utiles et préparer un changement de fournisseur d'énergie."
};

export default function ChangerFournisseurEnergiePage() {
  return (
    <SeoLandingPage
      ctaLabel="Comparer mon énergie"
      description="Avant de changer de fournisseur d'énergie, il faut comprendre le contrat actuel, le montant mensuel et les conditions. Futéo aide à poser les informations au même endroit."
      eyebrow="Contrat énergie"
      faq={[
        {
          question: "Que comparer ?",
          answer:
            "Le prix, le type d'offre, les conditions d'évolution et les informations visibles sur la facture."
        },
        {
          question: "Est-ce toujours rentable ?",
          answer:
            "Non. L'objectif est de vérifier calmement, pas de changer pour changer."
        },
        {
          question: "Futéo remplace un comparateur énergie ?",
          answer:
            "Non. Futéo aide à lire vos documents et à préparer les démarches utiles."
        }
      ]}
      points={[
        "Relire la facture pour retrouver le fournisseur, l'offre et le montant.",
        "Repérer si le contrat mérite une comparaison.",
        "Préparer une demande ou un changement seulement si c'est pertinent."
      ]}
      title="Changer de fournisseur d'énergie sans décision précipitée"
    />
  );
}
