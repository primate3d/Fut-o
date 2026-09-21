# Rapport détaillé - Phase 1 de sécurisation

## Verdict

**PHASE 1 PRÊTE**

Les corrections indispensables sont en place et les validations locales passent. Aucun commit n'a été créé.

## Les 17 fichiers de sécurisation

### 1. `app/api/analyse/route.ts`

**Diff :** +30 / -16

- Verrou transactionnel par clé pour empêcher deux analyses concurrentes.
- Sélection des documents depuis la base et contrôle de leur appartenance au dossier.
- Rejet des doublons, références de fichiers falsifiées et fichiers physiques manquants avant l'appel IA.
- Sauvegarde de l'analyse et consommation atomique du crédit dans la même transaction.
- Limitation de la taille du corps JSON et normalisation du code d'accès.

**Tests :** documents étrangers, métadonnées falsifiées, fichier absent, concurrence à un crédit, rollback, quota séquentiel et workflows complets.

### 2. `app/api/documents/route.ts`

**Diff :** +38 / -17

- Lecture bornée du multipart et validation serveur du fichier et des métadonnées.
- Nom physique aléatoire généré côté serveur.
- Upload, remplacement et suppression protégés par verrou transactionnel.
- Nettoyage du nouveau fichier si la transaction échoue et suppression de l'ancien après validation.
- Purge fondée sur le `physicalFileName` enregistré.

**Tests :** taille, signature/MIME, path traversal, dossier étranger, uploads concurrents et workflows d'upload réels.

### 3. `app/api/free-access/route.ts`

**Diff :** +8 / -39

- Délégation à un service d'attribution atomique.
- Normalisation et longueur maximale de l'email.
- Propagation contrôlée des erreurs métier.

**Tests :** deux demandes simultanées, retry email et unicité par scope.

### 4. `app/api/keys/activate/route.ts`

**Diff :** +11 / -33

- Activation idempotente via le service DB.
- Suppression de tout recalcul ou report de la date d'expiration.
- Rejet des clés expirées, inactives ou inexistantes.

**Tests :** activation répétée, expiration immuable, ancienne clé gratuite, clé inactive et code inconnu.

### 5. `drizzle/meta/_journal.json`

**Diff :** +8 / -1

- Enregistrement de la migration `0001_phase1_security` dans le journal Drizzle.

**Test :** application réelle de la migration sur un schéma `0000` dans PostgreSQL jetable.

### 6. `features/analysis/ai-service.ts`

**Diff :** +16 / -20

- Sélection de la meilleure source de dépenses document par document.
- Une détection assurance ou énergie ne supprime plus les dépenses mobile ou box d'un dossier mixte.
- Une correction manuelle MACIF reste limitée au document concerné.

**Tests :** EDF, ENGIE gaz + électricité, MACIF multi-contrats, SFR Box, mobile, dossier mixte et sélection manuelle.

### 7. `lib/server/db.ts`

**Diff :** +63 / -37

- Exécuteurs transactionnels injectables pour clés, documents et analyses.
- Activation idempotente sans modification de l'expiration.
- Décrément atomique du crédit avec garde `uses_remaining > 0`.
- Protection contre l'écrasement ou la suppression d'un document appartenant à une autre clé.
- Purge sous verrou utilisant le provider de stockage commun.

**Tests :** concurrence, rollback, cross-household, quota, expiration et purge DB + disque.

### 8. `lib/server/db/schema.ts`

**Diff :** +10 / -4

- Ajout de `activated_at`, `scope` et `email_sent_at`.
- Index unique fonctionnel sur `(scope, lower(btrim(email)))`.
- Index sur `documents.key_code`.

**Tests :** migration historique, unicité email normalisée et réutilisation de la même clé après échec email.

### 9. `lib/server/storage/index.ts`

**Diff :** +37 / -20

- Utilisation asynchrone de `UPLOADS_DIR` comme répertoire unique.
- Rejet des chemins absolus, séparateurs, flux NTFS, caractères de contrôle et noms suspects.
- Rejet des liens symboliques et des entrées non-fichiers.
- Écriture exclusive pour éviter un écrasement silencieux.

**Tests :** traversal Windows/Linux, symlink, lecture, suppression et purge physique.

### 10. `package.json`

**Diff :** +2 / -0

- Ajout de `npm run test:phase1`.
- Ajout de `embedded-postgres` comme dépendance de développement pour tester les transactions PostgreSQL réelles.

### 11. `package-lock.json`

**Diff :** +338 / -0

- Verrouillage de `embedded-postgres` et de ses dépendances de test multiplateformes.

### 12. `drizzle/0001_phase1_security.sql`

**Nouveau :** 48 lignes

- Ajout des colonnes de suivi d'activation et d'envoi email.
- Normalisation des emails historiques et dédoublonnage par scope.
- Désactivation des clés associées aux doublons supprimés.
- Index unique empêchant toute double attribution concurrente.
- Trigger PostgreSQL interdisant toute modification ultérieure de `expires_at`.

### 13. `drizzle/meta/0001_snapshot.json`

**Nouveau :** 440 lignes

- Snapshot Drizzle correspondant au schéma Phase 1.

### 14. `lib/server/document-validation.ts`

**Nouveau :** 90 lignes

- Lecture bornée des corps HTTP.
- Validation Zod des métadonnées et corrections autorisées.
- Validation de la taille, de l'extension, du MIME déclaré et de la signature réelle.
- Résolution des documents depuis la base et contrôle de `physicalFileName`.

### 15. `lib/server/free-access.ts`

**Nouveau :** 50 lignes

- Réservation atomique d'un accès gratuit par email normalisé et scope serveur.
- Verrou de livraison empêchant les doubles envois concurrents.
- Retry d'envoi avec la même clé et la même expiration.
- Aucun scope ou plan de campagne sélectionnable par le client.

### 16. `lib/server/key-lock.ts`

**Nouveau :** 19 lignes

- Transaction PostgreSQL avec advisory lock dérivé de la ressource.
- Réponse métier `409` quand une opération concurrente possède déjà le verrou.

### 17. `lib/server/request-error.ts`

**Nouveau :** 5 lignes

- Erreur serveur typée avec statut HTTP explicite pour les rejets contrôlés.

## Fichiers de tests ajoutés

- `tests/phase1.test.ts` : suite d'intégration PostgreSQL, routes, stockage, IA simulée, quotas, migration et sécurité.
- `tests/e2e-workflows.test.ts` : cinq workflows upload -> analyse -> comparatifs -> courriers -> PDF selon le parcours.
- `tests/fixtures/household.ts` : fixtures EDF, MACIF, SFR Box et NRJ Mobile.

Le fichier `dev-free-access.log` était déjà présent et non suivi. Il n'a pas été créé, modifié ni supprimé pendant cette complétion.

## Tests et résultats

- `npm run test:phase1` : **29 réussis, 0 échec, 0 ignoré**.
- `npm run lint` : **réussi, 0 erreur**.
- `npx tsc --noEmit --incremental false` : **réussi, 0 erreur**.
- `npm run build` : **réussi**, compilation, TypeScript et génération des 50 pages terminés.
- `git diff --check` : **réussi**.

Les parcours validés couvrent EDF/électricité, ENGIE gaz + électricité, MACIF avec trois contrats, SFR Box, NRJ Mobile, dossier mixte, comparatifs, courriers et rapport PDF.

## Migration nécessaire

La migration `drizzle/0001_phase1_security.sql` doit être exécutée avant le déploiement applicatif, via le mécanisme `predeploy` existant.

Une sauvegarde de la base est recommandée avant son application : la migration normalise les emails, conserve l'attribution historique la plus ancienne, supprime les doublons `free_trials` et désactive leurs clés surnuméraires. Le test applique réellement la migration à un ancien schéma et vérifie ce dédoublonnage.

## Risques résiduels

- Les tests utilisent PostgreSQL local jetable et une IA simulée ; Railway, Brevo et l'API IA réelle ne sont pas sollicités.
- Le verrou concurrent renvoie `409` immédiatement. Le navigateur doit retenter une opération si une autre requête sur la même clé est encore active.
- Un email Brevo envoyé avec succès suivi d'un échec DB avant `email_sent_at` peut être renvoyé au retry, mais la clé reste identique et aucune seconde attribution n'est créée.
- La suppression physique précède la validation finale de la transaction de purge ; un incident DB à cet instant peut laisser une métadonnée sans fichier.
- Le stockage local suppose que `UPLOADS_DIR` pointe vers un volume Railway persistant et partagé avec l'instance exécutant la purge.
- Aucun test de charge n'a été réalisé, conformément à la consigne.

## Périmètre commercial

Aucun changement n'a été apporté à Stripe, au pricing, à la page Tarifs, aux offres commerciales, à Brevo ou à une campagne Dealabs. Le moteur IA n'a été modifié que pour corriger la perte de dépenses des dossiers mixtes.

**Verdict final : PHASE 1 PRÊTE**
