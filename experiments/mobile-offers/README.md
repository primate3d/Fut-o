# Collecteur expérimental d'offres mobiles

Prototype autonome pour examiner les pages publiques officielles de Free Mobile,
RED by SFR et B&You. Il n'est connecté ni au comparateur Futéo, ni à une route
API, ni à PostgreSQL.

## Principes

- Une donnée absente reste `null`.
- Une extraction incomplète reste `PARTIAL`.
- Une incohérence devient `FAILED`.
- Aucun prix historique ou catalogue Futéo existant n'est utilisé.
- Les domaines non officiels et les redirections vers un domaine tiers sont
  refusés.
- Une exécution réelle effectue une seule requête par fournisseur.

## Commandes

Tests hors ligne :

```bash
npx tsx --test experiments/mobile-offers/tests/mobile-offers.test.ts
```

Collecte réelle explicitement autorisée :

```bash
npx tsx experiments/mobile-offers/run.ts --live
```

Les résultats sont enregistrés dans `snapshots/` avec un fichier horodaté,
`latest.json` et la liste des changements depuis la collecte précédente.

Comparer manuellement deux snapshots :

```bash
npx tsx experiments/mobile-offers/compare-snapshots.ts ancien.json nouveau.json
```

## Méthodes

- **Free Mobile** : lecture de `__NEXT_DATA__`, qui contient les forfaits publics
  structurés. Les remises Freebox sont conservées comme conditions et ne
  remplacent pas le prix public.
- **RED by SFR** : lecture du configurateur HTML public. Quand le site ne relie
  pas de façon vérifiable chaque volume au prix dynamique, les offres restent
  partielles et leur prix reste inconnu.
- **B&You** : lecture des cartes structurées embarquées dans la page. Les tarifs
  conditionnés à une souscription Box/Fibre sont signalés et ne sont pas traités
  comme des prix publics inconditionnels.

Les parseurs dépendent de structures éditoriales externes. Un changement de page
doit conduire à un échec visible, jamais à une valeur inventée.
