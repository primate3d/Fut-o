export type GuideArticle = {
  slug: string;
  title: string;
  description: string;
  category: "Résiliation" | "Négociation" | "Comparaison" | "Dépenses";
  readingTime: string;
  keywords: string[];
  includes: string[];
  questions: string[];
  steps: string[];
  preview: {
    object: string;
    text: string;
  };
  cta: string;
};

export const guideArticles: GuideArticle[] = [
  {
    slug: "lettre-resiliation-assurance-habitation",
    title: "Lettre de résiliation assurance habitation",
    description:
      "Comprendre quand et comment préparer une résiliation d'assurance habitation, sans recopier un modèle générique qui ne correspond pas à votre situation.",
    category: "Résiliation",
    readingTime: "4 min",
    keywords: ["résiliation", "contrat", "assurance", "habitation"],
    includes: [
      "structure du courrier",
      "formulation adaptée",
      "informations importantes",
      "base prête à personnaliser"
    ],
    questions: [
      "Quel contrat d'assurance habitation voulez-vous résilier ?",
      "Avez-vous une date d'échéance ou un motif particulier ?",
      "Quelles références client doivent apparaître dans la démarche ?"
    ],
    steps: [
      "Identifier le contrat concerné et le fournisseur.",
      "Vérifier les informations utiles avant l'envoi.",
      "Préparer une demande claire, polie et traçable.",
      "Relire le courrier avant de l'utiliser."
    ],
    preview: {
      object: "Objet : demande de résiliation du contrat d'assurance habitation",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Préparer mon courrier"
  },
  {
    slug: "negocier-son-forfait-internet",
    title: "Négocier son forfait internet",
    description:
      "Beaucoup de foyers gardent la même box internet pendant des années sans comparer les offres disponibles aujourd'hui.",
    category: "Négociation",
    readingTime: "4 min",
    keywords: ["internet", "forfait", "négociation", "réduction tarifaire"],
    includes: [
      "comparaison du contrat actuel",
      "arguments de négociation",
      "formulation claire",
      "demande prête à adapter"
    ],
    questions: [
      "Quel est le prix actuel de votre box internet ?",
      "Avez-vous une offre concurrente ou une promotion comparable ?",
      "Souhaitez-vous négocier ou préparer un changement d'offre ?"
    ],
    steps: [
      "Retrouver le prix mensuel et les options incluses.",
      "Comparer avec des offres proches de votre usage.",
      "Préparer une demande courte au service client.",
      "Décider ensuite si vous gardez, renégociez ou changez."
    ],
    preview: {
      object: "Objet : demande de réévaluation de mon forfait internet",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Comparer mes contrats"
  },
  {
    slug: "comparer-plusieurs-contrats-facilement",
    title: "Comparer plusieurs contrats facilement",
    description:
      "Assurance, énergie, internet, mobile : le plus difficile est souvent de remettre les informations au même endroit.",
    category: "Comparaison",
    readingTime: "5 min",
    keywords: ["comparaison", "contrat", "assurance", "énergie", "internet"],
    includes: [
      "lecture par poste",
      "montants importants",
      "contrats à prioriser",
      "pistes d'action"
    ],
    questions: [
      "Quels contrats reviennent chaque mois ?",
      "Quels postes semblent les plus élevés ?",
      "Quels contrats méritent une comparaison en premier ?"
    ],
    steps: [
      "Rassembler les factures ou contrats utiles.",
      "Classer les postes par catégorie.",
      "Comparer les montants et les engagements.",
      "Préparer les démarches utiles seulement si elles ont du sens."
    ],
    preview: {
      object: "Synthèse : contrats à comparer en priorité",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Comparer mes contrats"
  },
  {
    slug: "reduire-ses-depenses-mensuelles",
    title: "Réduire ses dépenses mensuelles",
    description:
      "Avant de supprimer au hasard des abonnements, il vaut mieux comprendre ce qui pèse vraiment dans le budget du foyer.",
    category: "Dépenses",
    readingTime: "4 min",
    keywords: ["dépenses mensuelles", "abonnement", "comparaison", "contrat"],
    includes: [
      "repérage des dépenses récurrentes",
      "tri des abonnements",
      "priorités d'action",
      "courriers si nécessaire"
    ],
    questions: [
      "Quels paiements reviennent tous les mois ?",
      "Quels abonnements sont encore utiles ?",
      "Quelles démarches peuvent être préparées sans urgence ?"
    ],
    steps: [
      "Repérer les dépenses récurrentes.",
      "Identifier les contrats à comparer.",
      "Choisir ce qu'il faut garder, négocier ou résilier.",
      "Préparer uniquement les actions utiles."
    ],
    preview: {
      object: "Objet : demande de réduction tarifaire",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Générer ma démarche"
  },
  {
    slug: "changer-de-fournisseur-energie",
    title: "Changer de fournisseur d'énergie",
    description:
      "Un contrat d'électricité ou de gaz peut rester inchangé longtemps alors que les offres évoluent régulièrement.",
    category: "Comparaison",
    readingTime: "4 min",
    keywords: ["énergie", "contrat", "fournisseur", "comparaison"],
    includes: [
      "comparaison énergie",
      "points à vérifier",
      "démarche de changement",
      "message prêt à personnaliser"
    ],
    questions: [
      "Quel fournisseur d'énergie avez-vous actuellement ?",
      "Quel est votre montant mensuel ou annuel ?",
      "Souhaitez-vous comparer ou préparer un changement ?"
    ],
    steps: [
      "Lire les informations principales de la facture.",
      "Comparer avec des offres plus adaptées.",
      "Vérifier les conditions avant de changer.",
      "Préparer la démarche si le changement est pertinent."
    ],
    preview: {
      object: "Objet : demande d'information sur mon contrat énergie",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Comparer mes contrats"
  },
  {
    slug: "resilier-une-box-internet",
    title: "Résilier une box internet",
    description:
      "Résilier une box internet demande surtout de vérifier les informations utiles et de garder une trace claire de la demande.",
    category: "Résiliation",
    readingTime: "3 min",
    keywords: ["résilier", "box internet", "contrat", "abonnement"],
    includes: [
      "structure de résiliation",
      "références à prévoir",
      "formulation simple",
      "demande prête à adapter"
    ],
    questions: [
      "Quel opérateur est concerné ?",
      "Avez-vous un numéro client ou une référence contrat ?",
      "La résiliation doit-elle être immédiate ou à échéance ?"
    ],
    steps: [
      "Identifier le contrat box internet.",
      "Ajouter les informations utiles.",
      "Préparer une demande courte et claire.",
      "Conserver une preuve de la démarche."
    ],
    preview: {
      object: "Objet : résiliation de mon abonnement internet",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Préparer mon courrier"
  },
  {
    slug: "demande-reduction-tarifaire",
    title: "Demande de réduction tarifaire",
    description:
      "Une demande de réduction tarifaire est plus crédible quand elle s'appuie sur un contrat actuel et une comparaison claire.",
    category: "Négociation",
    readingTime: "3 min",
    keywords: ["réduction tarifaire", "négociation", "contrat", "abonnement"],
    includes: [
      "argumentaire de négociation",
      "rappel du contrat actuel",
      "formulation respectueuse",
      "demande prête à personnaliser"
    ],
    questions: [
      "Quel tarif souhaitez-vous faire réévaluer ?",
      "Avez-vous repéré une offre plus adaptée ?",
      "Voulez-vous demander un geste commercial ou changer d'offre ?"
    ],
    steps: [
      "Comparer le prix actuel avec une offre proche.",
      "Formuler une demande simple et factuelle.",
      "Éviter les promesses ou menaces inutiles.",
      "Relire avant envoi."
    ],
    preview: {
      object: "Objet : demande de réduction tarifaire",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Générer ma démarche"
  },
  {
    slug: "changement-offre-mobile",
    title: "Changement d'offre mobile",
    description:
      "Les forfaits mobiles évoluent souvent. Une offre ancienne peut ne plus être adaptée à votre usage actuel.",
    category: "Négociation",
    readingTime: "3 min",
    keywords: ["forfait mobile", "changement d'offre", "abonnement", "comparaison"],
    includes: [
      "comparaison du forfait",
      "usage à vérifier",
      "demande de changement",
      "courrier prêt à adapter"
    ],
    questions: [
      "Quel est votre forfait mobile actuel ?",
      "Vos usages ont-ils changé ?",
      "Voulez-vous négocier ou demander un changement d'offre ?"
    ],
    steps: [
      "Retrouver le prix et les services inclus.",
      "Comparer avec des offres mobiles actuelles.",
      "Préparer une demande de changement ou de négociation.",
      "Choisir ensuite ce qui vous convient."
    ],
    preview: {
      object: "Objet : demande de changement d'offre mobile",
      text: "Voir la forme, sans donner un modèle complet."
    },
    cta: "Préparer mon courrier"
  }
];

export const guideFaqItems = [
  {
    question: "Pourquoi les courriers complets ne sont-ils pas affichés ici ?",
    answer:
      "Parce qu'un courrier utile dépend du contrat, du fournisseur, du montant et de la situation. Les pages publiques montrent la démarche, Futéo prépare ensuite un courrier personnalisé."
  },
  {
    question: "Puis-je utiliser Futéo pour une résiliation ou une négociation ?",
    answer:
      "Oui. Futéo aide à comparer les contrats utiles, puis à préparer une démarche de résiliation, de négociation, de relance ou de changement d'offre."
  },
  {
    question: "Dois-je tout transmettre pour comparer mes contrats ?",
    answer:
      "Non. Vous choisissez les éléments utiles. Vous pouvez commencer avec un contrat internet, une assurance, une facture d'énergie ou un abonnement."
  },
  {
    question: "Les guides remplacent-ils un conseil juridique ?",
    answer:
      "Non. Les guides donnent des repères pratiques. Les courriers générés doivent être relus et adaptés avant toute utilisation."
  }
];
