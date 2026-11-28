# Tests automatiques de Broodautomate

Ces tests ouvrent le vrai site dans un navigateur simulé (Playwright), avec un **faux Supabase**,
un **faux câble RS232** et un **faux Firebase**. Rien n'est envoyé sur Internet, aucune vraie machine n'est touchée.

| Fichier | Ce qu'il vérifie |
|---|---|
| `cles-traduction.js` | chaque texte existe en français, néerlandais et anglais |
| `ingest/logique.test.mts` | lecture des relevés par la fonction « ingest » (pannes, porte, coupures), jeton Google |
| `ingest/flux.test.mts` | « ingest » de bout en bout : notifications, porte restée ouverte, boîtier muet, téléphones |
| `run.js` | tout le logiciel : PC + téléphone, hors ligne, câble, commandes, prévisions, opérateur, cloche… |
| `run4g.mjs` | boîtiers 4G : relevés, « Lire maintenant », clés, fonction « ingest » |
| `v511.mjs` | v5.11 : machine « en ligne » seulement si elle est lue, alertes regroupées / archivées, profils sans historique, page Technique en onglets, thèmes nuit / clair |
| `v524.mjs` | v5.24 (design-test, mode démo) : vue machine (prix, places « Non utilisé », ajout / prix / suppression d'une sélection), « Remplir » en touchant les tiroirs (inventaire, retrait, chargement), Dashboard en nombres et en liste, fenêtre pop-up, bouton Machine / Classique, aucune requête vers Supabase |
| `v525.mjs` | v5.25 (design-test) : corrections de la vérification complète — fenêtre « Déplacer » (ses vrais titres), fenêtre d'un tiroir qui garde sa place, « Remplir » oublié (bandeau, clos après 4 h), ventes pas retirées deux fois, entretien rapide avec beaucoup d'historique, « Remplir » sans réseau gardé après un redémarrage, historique dans IndexedDB |
| `v528.mjs` | v5.28 (design-test) : plein écran en 3D à 360° (pains l'un derrière l'autre, parois transparentes, glisser / pincer / molette, Face, Tourner seul, choix 2D / 3D) |
| `v541.mjs` | v5.41 (design-test) : la 3D dans les pages (Détail machine) et dans « Remplir » de l'opérateur (inventaire, retrait, remplissage), le tiroir en 3D dans sa fenêtre (sélection, modification), couleurs des pains par état, choix 2D / 3D |
| `v5341.mjs` | v5.34.1 : appli opérateur installable sur l'écran d'accueil (manifeste, icônes PNG, balises iPhone), essai statique |
| `v5342.mjs` | v5.34.2 : la porte suit le capteur de la machine, même pendant un « Remplir » encore ouvert (porte fermée par le serveur, rouverte, refermée ; le « Remplir » reste ouvert) |
| `v5343.mjs` | v5.34.3 : « Remplir » sécurisé — « Annuler » défait tout, Remplir oublié (1 h) ignoré, inventaire à 0 refusé sans compter, chargement à 0 confirmé, alerte « stock inconnu » |
| `v5344.mjs` | v5.34.4 : audit du 23/11 — l'assistant « Remplir » suit les autres appareils (fermé, annulé ou avancé ailleurs), avertissement « déjà ouvert sur un autre appareil », étapes refusées sur un Remplir fermé, 1 h comptée depuis la dernière activité, inventaire « à compter » seulement si 0 ou « Stock inconnu », chargement à 0 confirmé dès qu'il reste de la place, Annuler et Retour par écarts (ventes gardées), état d'envoi en fin de Remplir |
| `v5345.mjs` | v5.34.5 : alerte « plus de pain X » (rupture d'un type de pain) au lieu de « Sélection N vide » — une sélection vide sans alerte si le pain reste ailleurs, une seule alerte par pain (sélections listées), réglée quand le pain revient, « stock inconnu » prend le relais, machine vide = une seule alerte, réglages des sélections, anciennes alertes lisibles, NL/EN, carte du tableau de bord et opérateur (À faire, Alertes) |
| `v5346.mjs` | v5.34.6 : notifications sur iPhone/ordinateur appli fermée (Web Push) — manifest et balises iPhone, `sw.js` (push reçu, toucher, jamais de cache, vrai événement push dans Chromium), bouton Activer/Désactiver, autorisation par geste, clé publique du serveur, abonnement inscrit (`web-ios`, page admin ou opérateur), pas de doublon appli ouverte, cas : clés pas prêtes, refus, iPhone dans Safari, navigateur sans Web Push, compte opérateur, appli Android |
| `v5350.mjs` | v5.35.0 : étape facultative « Placements » de Remplir (appli opérateur) — logique pure (même type seulement, âge, place, pain invalide, niveaux d'historique), vue Tableau et vue Machine de bout en bout (Fait / Ignorer / Continuer / Retour, date du pain gardée, écriture `mv`), sans historique = écran sauté, 375 px, NL/EN ; **conseil de rupture** : logique (≥ 3 jours, avant 18 h, soir/nuit, autre machine, vieux, réglages), encadré dans le chargement opérateur (tableau, vue Machine, 375 px) et dans le plan de commande admin (+ bouton « à fond », NL/EN), aucune erreur JS ; données inventées |
| `v5360.mjs` | v5.36.0 : « Choisir mes notifications » — cases dans la cloche (admin, appli Android simulée) et dans « Plus » (opérateur, sans les ventes), `ba_prefs` / `ba_prefs_lire`, liste relue sans le type coupé (`not.in`), aucun message pour un type coupé, serveur en panne, fonctions SQL absentes, reprise des réglages, mêmes catégories que `ingest/index.ts`, néerlandais/anglais, 375 px |
| `v5361.mjs` | v5.36.1 : « 📅 Changer la date » d'un pain depuis Stock en tableau — opérateur (téléphone, cartes, vue machine dessinée, 375 px) et admin (ordinateur) ; seules les dates changées sont enregistrées, notées dans l'Historique avec qui (op / admin) ; date future ou effacée refusée ; Annuler / Échap ; même minute = lots réunis ; néerlandais et anglais ; Détails machine → Lots sur téléphone : lots d'une même sélection dans un cadre bleu, « 11 lot 2/2 » et le pain sur chaque carte, tableau d'ordinateur inchangé |
| `v5362.mjs` | v5.36.2 : « 📅 Changer la date » — échanger les dates de deux lots (opérateur téléphone, admin ordinateur) : chaque lot garde sa nouvelle date, deux lignes dans l'Historique, une seule modification envoyée ; même minute = lots réunis ; rien changé = rien noté ; `setLotDate` seul marche toujours ; sans réseau : refait au retour sur la version la plus récente (un pain retiré entre-temps par l'admin) ; service worker : la notification touchée ramène la fenêtre de la bonne appli (admin / opérateur / adresse du dossier / aucune fenêtre) |
| `sql/v5362.test.mjs` | v5.36.2 : `supabase/v5362.sql` — les 2 règles de lecture réécrites (« (select auth.jwt()) ») ont exactement le même effet (admin lit, opérateur et visiteur non) ; tâche « veille » : même adresse, même message, attente 15 s ; l'installation neuve fait pareil ; aucune donnée touchée |
| `parcours.mjs` | parcours complet (≈ 12 min, `npm run parcours`, pas dans `tout`) : toutes les pages admin et opérateur, leurs onglets, filtres, listes et sections, FR/NL/EN, téléphone et ordinateur, clair et sombre, données inventées puis appli vide ; changement de langue en cours d'utilisation (chaque page identique à une ouverture directe dans la langue) ; Remplir de bout en bout (tableau et vue Machine). Cherche erreurs JavaScript / console, textes non traduits, « undefined » / « NaN » / « Invalid Date », débordements sur téléphone, images cassées ; contrôle d'abord qu'il voit 5 défauts placés exprès |
| `ingest/ventes.test.mts` | v5.36.0 : logique pure des ventes et ruptures (stock = enregistré − ventes depuis la référence ; tous les cas « dans le doute je me tais ») |
| `ingest/ventes-flux.test.mts` | v5.36.0 : « ingest » de bout en bout avec 4 appareils (admin, opérateur, sans ventes, sans ruptures), fonction SQL absente, colonne `prefs` absente, intervention ouverte, lecture par câble, tout coupé, base en panne |
| `sql/v5360.test.mjs` | v5.36.0 : `supabase/v5360.sql` dans PostgreSQL — `ba_prefs` (seulement son propre jeton), `ba_prefs_lire`, `ba_stock_machine` réservée au serveur |
| `ingest/webpush.test.mts` | v5.34.6 : chiffrement Web Push (vérifié par `http_ece`), signature VAPID, envoi de bout en bout (iPhone + ordinateur + Android ensemble, opérateur exclu, 410 retiré, adresse hors services jamais appelée, pannes réessayées) |
| `sql/web-push.test.mjs` | v5.34.6 : `supabase/web-push.sql` dans PostgreSQL — clé privée illisible pour tous les comptes, clé publique pour les comptes connectés seulement |
| `v527.mjs` | v5.27 (design-test) : plein écran direct depuis le Dashboard (bouton ⛶ sur chaque carte / ligne), machine exactement à la taille de l'écran sur téléphone |
| `v526.mjs` | v5.26 (design-test) : machine en plein écran (bouton ⛶, fenêtre d'un tiroir par-dessus, Échap, téléphone opérateur et PC admin) |
| `sql/operateur.test.mjs` | `supabase/operateur-compte.sql` dans une vraie base PostgreSQL en mémoire : le compte opérateur LIT les relevés 4G mais ne peut rien y écrire ni effacer ; l'admin garde tout |
| `sql/preuve-livraison.test.mjs` | `supabase/preuve-livraison-securite.sql` (autre appli du même Supabase, préparé, pas installé) : verrou après 5 mots de passe faux |
| `v5331.mjs` | v5.33.1 : prix gardé dans la machine (ligne PA1) repris à la première lecture et à chaque changement, prix payé quand la machine dit 0 €, relevé plus ancien et prix changé à la main respectés, sélections créées à la première connexion, Historique et Alertes en FR / NL / EN |
| `v512.mjs` | v5.12 : page « Technique » (boîtiers en détail, données 4G estimées, machines et n° de plaque, câble et clé USB, journal des envois, système), page « Connexion RS232 » allégée, téléphone, opérateur |

## Lancer les tests (sur un ordinateur avec Node 22 ou plus)

1. Mettre un relevé d'une vraie machine dans `tests/donnees/AUDIT_FASTER_170824020354.dat`
   (ce dossier n'est **jamais** envoyé sur GitHub : il contient des chiffres de vente),
   ou donner son chemin : `BA_AUDIT=/chemin/vers/releve.dat`.
   Sans ce fichier, les essais qui en ont besoin le disent et passent à la suite (les autres utilisent un relevé inventé).
2. Dans le dossier `tests` : `npm install`, puis `npm install --no-save playwright` et `npx playwright install chromium`.
3. `npm run tout` → chaque ligne affiche `OK` ou `ÉCHEC`, et la fin dit « TOUT EST BON ».

Les captures d'écran vont dans `tests/captures/` (pas envoyées sur GitHub).
