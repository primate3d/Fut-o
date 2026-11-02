# Collecteur expérimental d'offres mobiles

Prototype autonome pour examiner les pages publiques officielles de neuf marques
mobiles : Free Mobile, RED by SFR, B&You, Orange, Sosh, SFR, Prixtel,
NRJ Mobile et Cdiscount Mobile. Il n'est connecté ni au comparateur Futéo, ni à
une route API, ni à PostgreSQL.

## Principes

- Une donnée absente reste `null`.
- Une extraction incomplète reste `PARTIAL`.
- Une incohérence devient `FAILED`.
- Aucun prix historique ou catalogue Futéo existant n'est utilisé.
- Les domaines non officiels et les redirections vers un domaine tiers sont
  refusés.
- Une exécution réelle effectue une requête par fournisseur, sauf Prixtel dont
  les quatre grilles tarifaires sont publiées sur quatre pages distinctes.
- Un prix conditionnel ne remplace jamais le prix public.
- Les paliers Prixtel sont conservés individuellement; le tarif minimal n'est
  pas présenté comme un prix mensuel unique.
- `latest.json` n'est pas remplacé si une source auparavant vérifiée devient
  vide ou moins complète à la suite d'une erreur de collecte.

## Commandes

Tests hors ligne :

```bash
npx tsx --test experiments/mobile-offers/tests/mobile-offers.test.ts
npx tsx --test experiments/mobile-offers/tests/phase2.test.ts
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
  pas de façon vérifiable chaque volume au prix dynamique, le parseur retombe
  sur un résultat partiel. La configuration structurée `serviceOffer` est
  utilisée en priorité lorsqu'elle associe explicitement prix, volume et data
  internationale.
- **B&You** : lecture des cartes structurées embarquées dans la page. Les tarifs
  conditionnés à une souscription Box/Fibre sont signalés et ne sont pas traités
  comme des prix publics inconditionnels.
- **Orange** : lecture des cartes serveur pour les contextes public et client
  Internet. Les remises Box, nouveau client et âge sont séparées.
- **Sosh** : lecture de la page officielle des récapitulatifs contractuels. Les
  offres restent partielles lorsque la page commerciale est inaccessible et que
  l'engagement ou l'enveloppe Europe ne sont pas confirmés.
- **SFR** : lecture du JSON-LD officiel des produits et séparation du prix
  standard et du prix Client Box.
- **Prixtel** : lecture des grilles tarifaires des quatre pages détaillées. Les
  bornes de consommation et chaque prix sont conservés.
- **NRJ Mobile** : lecture des cartes HTML, frais SIM, réseau, technologie et
  données Europe/DOM.
- **Cdiscount Mobile** : lecture des cartes HTML lorsqu'elles sont présentes. Une
  coquille JavaScript sans offre produit un échec explicite.

Les parseurs dépendent de structures éditoriales externes. Un changement de page
doit conduire à un échec visible, jamais à une valeur inventée.
