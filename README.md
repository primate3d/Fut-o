# Futeo

Futeo est une application web Next.js qui aide les particuliers a analyser les depenses de leur foyer, reperer des economies possibles et preparer des courriers de negociation ou de resiliation.

Cette premiere base ne connecte pas encore Stripe, une IA, un OCR ou un generateur PDF reel. Elle pose une architecture stable, typee et evolutive avec des donnees mockees.

Le modele commercial prevu est au coup par coup : pas d'abonnement, l'utilisateur achete une cle d'acces pour lancer une analyse quand il en a besoin.

## Stack

- Next.js avec App Router
- TypeScript
- Tailwind CSS
- Architecture modulaire par fonctionnalite
- Interface responsive en francais

## Structure

```txt
app/                         Pages App Router
components/layout/           Header, sidebar, footer
components/ui/               Composants UI reutilisables
features/                    Modules metier et integrations futures
features/upload/             Import de documents et stub OCR
features/analysis/           Analyse des depenses
features/recommendations/    Recommandations d'economies
features/letters/            Courriers de negociation/resiliation
features/reports/            Rapport PDF
features/billing/            Cles d'acces mockees et paiement futur
lib/                         Utilitaires partages
types/                       Types TypeScript du domaine
data/                        Donnees fictives
config/                      Navigation et configuration produit
```

## Systeme de cle d'acces

Les pages de l'espace utilisateur sont protegees cote client par une cle stockee dans `localStorage`.

- `/tarifs` affiche trois offres au coup par coup : Analyse simple, Audit foyer, Audit premium + courriers.
- Les boutons "Acheter une cle" simulent un achat et generent une cle mock.
- `/activer-cle` valide une cle mock, enregistre l'acces dans `localStorage`, puis redirige vers le tableau de bord.
- Les routes workspace redirigent vers `/activer-cle` si aucune cle active n'est presente.

Cles mock disponibles pour tester :

```txt
FOYER-SIMPLE-2026
FOYER-AUDIT-2026
FOYER-PREMIUM-2026
```

Stripe sera branche plus tard pour creer et verifier les cles depuis un vrai paiement. Aucune base de donnees ni authentification n'est encore connectee.

## Parcours MVP

Parcours complet a tester :

```txt
Activer une cle -> Importer des documents -> Lancer l'analyse -> Voir les resultats -> Generer les courriers -> Voir le rapport
```

Dans cette version :

- `/activer-cle` active une cle mock et conserve l'acces localement.
- `/importer` stocke temporairement les documents dans `localStorage`, sans upload serveur.
- `/analyse` genere une analyse simulee a partir des types de documents importes.
- `/resultats` affiche les totaux, anomalies, recommandations et top depenses.
- `/courriers` genere des modeles a copier ou telecharger en `.txt`.
- `/rapport` synthetise l'audit et utilise `window.print()` pour imprimer ou exporter en PDF depuis le navigateur.
- `/compte` permet de reinitialiser l'audit local tout en conservant la cle active.

## Limites actuelles du MVP

- Pas de vrai OCR : les fichiers ne sont pas lus automatiquement.
- Pas d'IA externe : les analyses et courriers sont generes par regles mockees.
- Pas de backend : documents, analyse et cle active restent dans `localStorage`.
- Pas de paiement reel : l'achat de cle est simule.
- Pas d'envoi automatique de courriers, de signature electronique ou de PDF serveur.
- Les modeles de courriers doivent etre relus et adaptes avant envoi.

La checklist QA detaillee est disponible dans `docs/MVP_QA.md`.

## Lancer le projet

```bash
pnpm install
pnpm dev
```

Puis ouvrir `http://localhost:3000`.

## Scripts utiles

```bash
pnpm build
pnpm typecheck
pnpm lint
```

## Prochaines etapes

- Brancher un vrai systeme d'import et d'OCR.
- Connecter une IA pour extraire et classer les donnees de factures.
- Brancher Stripe pour acheter et verifier les cles d'acces.
- Ajouter une couche d'authentification et de stockage utilisateur.
- Remplacer les donnees mockees par une base de donnees.
- Ajouter une suppression serveur complete des documents et analyses.
- Produire un rapport PDF telechargeable.
- Finaliser les parcours de suppression et confidentialite des donnees.
