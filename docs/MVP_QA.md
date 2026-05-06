# Futeo MVP - QA

## Checklist test utilisateur

1. Ouvrir `/activer-cle`.
2. Saisir une cle invalide et verifier le message d'erreur.
3. Activer une cle mock valide : `FOYER-SIMPLE-2026`, `FOYER-AUDIT-2026` ou `FOYER-PREMIUM-2026`.
4. Verifier la redirection vers `/tableau-de-bord`.
5. Depuis `/tarifs`, simuler l'achat d'une cle et verifier que la cle generee peut etre activee.
6. Aller sur `/importer`.
7. Verifier le bouton "Lancer l'analyse" desactive sans document.
8. Ajouter un fichier PDF, JPG, PNG ou CSV de moins de 10 Mo.
9. Modifier manuellement le type de document.
10. Supprimer un document et verifier que la liste est mise a jour.
11. Lancer l'analyse et verifier la redirection vers `/analyse`.
12. Verifier la progression mockee et le bouton "Voir mes resultats".
13. Aller sur `/resultats` et verifier les totaux, categories, anomalies et recommandations.
14. Aller sur `/courriers` et verifier la generation des modeles.
15. Remplir les champs personnalisables et verifier la mise a jour du courrier.
16. Tester les boutons "Copier" et "Telecharger en .txt".
17. Aller sur `/rapport` et verifier le score, le plan d'action et les courriers recommandes.
18. Tester "Imprimer / exporter en PDF".
19. Recharger chaque page du parcours et verifier que les donnees locales restent disponibles.
20. Aller sur `/compte`, cliquer "Reinitialiser mon audit" et verifier que documents + analyse disparaissent, mais que la cle active reste conservee.

## Cas limites verifies

- Cle invalide : message d'erreur sur `/activer-cle`.
- Cle achetee simulee : stockee localement puis activable.
- LocalStorage vide : les pages workspace redirigent vers `/activer-cle` si aucune cle active n'existe.
- Aucun document : EmptyState sur `/analyse`, `/resultats`, `/courriers` et `/rapport`.
- Fichiers invalides : le bouton d'analyse reste bloque si tous les fichiers sont en erreur.
- Rechargement page : documents, analyse et cle active sont relus depuis `localStorage`.
- Retour navigateur : les pages relisent l'etat local au montage.

## Bugs connus

- La protection est uniquement cote client. Un backend devra verifier les cles avant tout traitement reel.
- Les fichiers ne sont pas envoyes ni lus : seul leur nom, taille, type MIME et type choisi sont utilises.
- Le bouton copier depend des permissions navigateur du presse-papiers.
- L'impression PDF utilise `window.print()` et depend du navigateur.
- Le reset audit supprime les donnees locales du navigateur courant uniquement.

## Limites actuelles

- Pas d'OCR reel.
- Pas d'IA externe.
- Pas de base de donnees.
- Pas d'authentification.
- Pas de paiement Stripe reel.
- Pas de generation PDF serveur.
- Pas d'envoi automatique de courriers.
- Les analyses, anomalies, recommandations et courriers sont simules par regles.

## Prochaines integrations

- OCR pour lire les factures et releves.
- IA pour extraire les lignes de depense et generer des courriers plus precis.
- Stripe pour acheter, creer et verifier les cles d'acces.
- Stockage serveur chiffre des documents et analyses.
- Suppression serveur complete des donnees utilisateur.
- Generation PDF serveur du rapport.
- Authentification et espace utilisateur persistant.
