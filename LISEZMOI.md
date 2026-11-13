> **v5.6 — fonctions de la version test 4.8.9** (reprises dans le vrai logiciel, sur les vraies données) :
> - **Commander & prévisions** : un seul menu. Onglets *Préparer une commande* · *Vérifier l'état de stock* · *Prévision* (Calendrier · Profils par jour · **L'an dernier**). L'entrée « Prévisions & calendrier » du menu n'existe plus.
> - **L'an dernier** : *Période à venir (pour commander)* (dates libres, détail par type de pain, « Utiliser l'an dernier » avec ↩ Annuler, Excel) et *8 dernières semaines (comparaison)*. Depuis la commande : « Voir l'an dernier pour ces jours » puis « ← Retour à la commande ». La reprise de la v3 contient 400 jours de ventes : l'an dernier est complet à partir de ~420 jours d'historique.
> - **Dashboard → « À faire aujourd'hui »** (admin) : pains invalides, porte ouverte, machines hors ligne, alertes, machines vides, pains trop vieux, retours de la semaine dernière ; le lundi, le résumé de la semaine à télécharger.
> - **Statistiques** : onglets *Rentabilité* (nouveaux graphiques : courbe, barres, cumul), *Zéro retour* (objectif réglable, 5 % par défaut, ventes perdues, conseil par machine) et *Fiabilité de la prévision* ; bouton **Résumé de la semaine** (Excel, 3 feuilles).
> - **💾 Sauvegardes et retour en arrière** (en bas de l'onglet Prévision) : besoins par machine, historique des ventes, réglages et calendrier ; jamais le stock, les lots ni les missions. Les sauvegardes « dans le logiciel » restent dans le navigateur de CE PC (fichier .json pour les garder ailleurs).
> - **⇄ Déplacer du pain** entre deux sélections du même produit (Détails machine) : l'admin le fait ou le demande à l'opérateur (Missions → Fait). Noté dans l'Historique.
> - Retour à la v5.5 si besoin : version `c949574` sur GitHub (dernière v5.5, mode clair compris).

> **v5.11 — design de la version test 4.8.6** : thème nuit / clair (bouton soleil / lune en bas de la barre latérale, fichier `js/theme.js`), barre latérale à icônes, onglets en bas sur téléphone. Tout le style est dans `css/app.css`. Voir la section v5.11 plus bas et `DESIGN.md`.

# Broodautomate v5.6

Logiciel de suivi des distributeurs de pain FAS Power Lift.

- `index.html` : le logiciel **admin** (sur le PC).
- `operateur.html` : l'**appli opérateur** (sur le téléphone).
- `v3/` : l'ancienne version 3.2, gardée telle quelle en secours.

La version 5 reprend toutes les fonctions de la version test 4.8.1 : Dashboard, lots de pain datés (le plus ancien sort en premier), appli opérateur avec « Remplir » en 3 étapes, Commander, Prévisions et calendrier, Statistiques, Historique, Alertes, français, néerlandais et anglais. Elle est branchée sur les vraies machines.

## Première ouverture (une seule fois)

1. Ouvre le logiciel et connecte-toi avec ton compte habituel (le même que pour la v3).
2. L'écran « Une dernière étape dans Supabase » s'affiche avec 5 commandes, chacune avec un bouton « Copier ».
3. Dans Supabase : ton projet → **SQL Editor** → **New query**. L'éditeur n'accepte qu'une commande à la fois : colle une commande → **Run** → « Success » → commande suivante. Les mêmes commandes sont dans `supabase/ba_state.sql`.
4. Reviens dans Broodautomate et clique sur « Réessayer ».

Tes machines, produits et ventes de la v3 sont alors repris automatiquement. Les machines reçoivent les numéros #1, #2… dans l'ordre où elles ont été créées. Tu peux changer ces numéros dans l'onglet « Connexion RS232 », partie « Mes machines ». Le stock repris de la v3 forme un seul lot marqué « estimé ». Sa date est celle de la dernière livraison : corrige-la dans « Détails machine » si besoin.

## Ce qui n'a pas changé

- **La liaison RS232 EVA-DTS DDCMP** : `js/serial.js` est exactement le même fichier qu'en v3.2. Les réglages sont aussi les mêmes : 9600 bauds, liste 2, identifiant du PC 00000001, réglages gardés sur chaque PC. Le PC n'envoie jamais de commande d'écriture ou d'effacement à la machine.
- **Le catalogue des alertes** (`js/alertes.js`) et l'analyse des relevés (`js/evadts-parser.js`) sont identiques à la v3.2.
- **La connexion à Supabase** (`js/config.js`) et les tables de la v3 (machines, products, sales, events, audits).

## Ce qui change par rapport à la version test

- Plus de simulateur ni de boutons de test : seulement tes vraies machines.
- Le PC et le téléphone partagent les mêmes données, grâce à la table `ba_state` de Supabase. Le badge « ☁️ Synchronisé » en haut de l'écran le confirme.
- Sans réseau, l'appli continue de fonctionner : les modifications sont gardées sur l'appareil et envoyées au retour du réseau. Si deux appareils modifient en même temps, les deux modifications sont gardées.
- L'onglet « Connexion RS232 » reprend celui de la v3.2 : câble, lecture, lecture automatique, journal. Il ajoute « Mes machines » (ajouter, renuméroter ou supprimer une machine) et l'import d'un relevé depuis une clé USB.
- **À chaque relevé** :
  - les ventes sont retirées des lots les plus anciens ;
  - la porte, la température, les coupures de courant et les erreurs de la machine apparaissent dans les Alertes, avec un titre et une explication ;
  - au premier relevé d'une machine, son journal d'erreurs est repris comme historique dans les alertes « Résolues ».
- Une machine est « En ligne » si elle a envoyé des données il y a moins de 45 minutes.

## Boîtiers 4G (v5.1, « Lire maintenant » en v5.2, « Lire toutes les machines » en v5.3)

Un boîtier LILYGO T-A7670E + module MAX3232, branché sur la prise RS232 de la machine, la lit tout seul (liste 2, comme le câble) et envoie les relevés par la 4G. Ils sont traités exactement comme un relevé par câble (ventes, stock, alertes), sur le PC comme sur le téléphone, sans jamais compter une vente deux fois.

- Programme du boîtier v1.1 : lecture **chaque heure** ; ce que la machine envoie d'elle-même (télémétrie = 1 : vente, porte…) part **tout de suite**, puis le boîtier relit la machine pour mettre les ventes à jour ; bouton **« 📡 Lire maintenant »** (onglet « Connexion RS232 » → « Boîtiers 4G », et page « Détails » de la machine) : le boîtier voit la demande en 2 minutes au plus.
- Bouton **« 📡 Lire toutes les machines »** (v5.3) : en haut de « Commander / Extraction », sur le Dashboard et dans « Boîtiers 4G ». Un clic → chaque boîtier lit sa machine (2 à 3 minutes) → le stock de toute la flotte est à jour avant de préparer la commande. La carte montre l'avancement, puis les machines lues et celles qui ne l'ont pas été (pas de boîtier, boîtier hors ligne, ancien programme, pas de réponse), avec l'heure de leur dernière lecture. Si une commande a été calculée avant la lecture, la carte demande de cliquer de nouveau sur « Calculer la commande ». Aucune nouvelle commande SQL : il suffit des commandes 10 à 17.
- Mise en place : onglet « Connexion RS232 » → « 📡 Boîtiers 4G » (commandes SQL une par une — 1 à 9 pour les boîtiers, 10 à 17 pour « Lire maintenant » —, fonction « ingest », ajout d'un boîtier et de sa clé secrète).
- Programme du boîtier et mode d'emploi pas à pas : dossier `lilygo/` (`lilygo/LISEZMOI.md`, `lilygo/broodautomate_lilygo.zip`).
- « En ligne » : le boîtier passe chez Supabase toutes les 2 minutes (demandes de lecture) et envoie son état toutes les 30 minutes. Alertes : « Boîtier 4G muet », « Boîtier 4G : lecture de la machine impossible ».
- La liaison du boîtier est une copie fidèle de `js/serial.js` (mêmes trames, même liste de sécurité) : il ne fait que lire.

## Menu et IA (v5.4)

- **Menu en barre latérale flottante** (admin, `index.html`) : repliée sur les icônes, elle s'ouvre par-dessus la page quand la souris passe dessus (ou au clavier avec Tab). Le bouton ☰ la garde ouverte (le contenu se décale) ; ce choix est gardé sur l'appareil. Téléphone : un bouton rond ☰ en bas à gauche ouvre le menu. L'appli opérateur garde son menu du haut. Palette « Ocean Depths » (marine, turquoise, écume) sur le fond ardoise.
- **🤖 Copier pour l'IA** (page « Commander / Extraction ») : un clic copie un résumé en français (règles de la tournée, stock par machine et par type de pain, ventes par jour de semaine, jours fériés des 14 prochains jours, alertes actives, calcul du logiciel s'il existe) à coller dans Claude ou ChatGPT en version gratuite. Rien n'est envoyé tout seul, aucune clé, aucun coût ; l'IA conseille, tu décides.

## Fichiers

| Fichier | Rôle |
|---|---|
| `js/config.js` | réglages (Supabase, RS232, valeurs par défaut) |
| `js/serial.js` | liaison RS232 EVA-DTS DDCMP (v3.2, inchangé) |
| `js/evadts-parser.js`, `js/alertes.js` | lecture des relevés et catalogue des alertes (v3.2, inchangés) |
| `js/db.js` | connexion Supabase (v3.2) |
| `js/store.js`, `js/forecast.js`, `js/actions.js` | lots, commande, prévisions et modifications (version test, inchangés) |
| `js/store-reel.js` | données partagées dans Supabase (remplace le stockage de la version test) |
| `js/reel.js` | ce qu'un relevé change (ventes, alertes) et l'heure réelle (remplace le simulateur) |
| `js/rs232.js` | câble RS232, clé USB, test EVA-DTS et « Mes machines » (dans la page Technique) |
| `js/technique.js`, `js/i18n-v512.js` | page Technique : boîtiers en détail, machines, câble, journal des envois, système |
| `js/boot.js` | connexion au compte, chargement, écran d'installation |
| `js/ui.js`, `js/admin.js`, `js/admin-forecast.js`, `js/operateur.js`, `js/history.js`, `js/excel.js` | écrans |
| `css/app.css`, `js/theme.js`, `DESIGN.md` | design (thèmes nuit / clair, barre latérale, icônes) |
| `js/i18n.js`, `js/i18n-forecast.js`, `js/i18n-reel.js` | textes en français, néerlandais et anglais |
| `js/boitiers.js`, `js/i18n-4g.js` | boîtiers 4G : relevés reçus par la 4G, état des boîtiers, ajout d'un boîtier |
| `supabase/ba_state.sql` | commandes à passer une fois dans Supabase (données partagées) |
| `supabase/4g-boitiers.sql`, `supabase/functions/ingest/index.ts` | boîtiers 4G : 9 commandes SQL et fonction « ingest » |
| `lilygo/` | programme du boîtier 4G (LILYGO) et son mode d'emploi |

## Rappels de sécurité

- Seule la clé « publishable » de Supabase peut être dans le code. Ne jamais y mettre la clé « secret » ni « service_role ».
- Sur la machine, ne jamais utiliser « Erase Interim Data » ni « Immediate Erasing » : ils effacent les compteurs.

## v5.7 — design opérateur
- Téléphone : menu en bas de l'écran (icônes, nom de la page active), grands boutons, assistant « Remplir » au nouveau style.
- Ordinateur : menu en pastilles. Bouton jour / nuit déjà présent dans l'en-tête.
- Un tableau trop large ne peut plus faire sortir le menu du bas de l'écran.
- Point de retour : v5.6.0 = commit ee27dc4.

## v5.8 — appli Android opérateur + compte opérateur séparé
- **Compte opérateur** : un compte Supabase avec le rôle « operator » (voir `supabase/operateur-compte.sql`, une commande à la fois). Le logiciel admin le refuse ; côté Supabase il n'a plus accès aux tables des boîtiers 4G (devices, device_reports, ba_demandes) et ne peut rien effacer dans ba_state. Ton compte admin ne change pas.
- **Limite connue** : le stock, les missions ET les chiffres de vente sont dans les mêmes données partagées (ba_state). Un opérateur très technique pourrait donc encore lire les chiffres d'affaires avec l'API Supabase. Pour le bloquer vraiment : séparer les ventes dans une table réservée à l'admin (chantier à part).
- **Appli Android** (`android-app/`, fabriquée par GitHub : onglet Actions « Appli Android operateur » → fichier dans Releases « Appli Android Opérateur »). Elle n'ouvre que la page opérateur, sans lien vers l'admin ; `index.html` y renvoie vers l'opérateur. Mise à jour du site = mise à jour de l'appli, sans réinstaller.

## v5.9 — notifications (page admin + appli Android) et copie automatique chaque nuit
- **Cloche 🔔** dans l'en-tête des comptes admin (PC, téléphone, appli Android) : pannes, coupures de courant, froid, produit épuisé, porte restée ouverte 15 min, boîtier muet depuis 2 h, boîtier de nouveau en ligne. Sur l'ordinateur, bouton « Recevoir aussi les notifications sur cet ordinateur » (notifications du navigateur quand la page est ouverte).
- **Appli Android** : vraies notifications du téléphone, même appli fermée (Firebase, gratuit). Les comptes « operator » ne reçoivent rien.
- **Côté Supabase, même sans écran ouvert** : la fonction `ingest` repère les NOUVEAUX événements de chaque relevé (le vieux journal de la machine, au premier relevé, est seulement noté comme vu) et une tâche toutes les 15 min (`ba-veille`) surveille les boîtiers muets et les portes.
- **Copie de toutes les données chaque nuit** (`ba-copie-nuit`, 14 nuits gardées) dans la table `ba_state_backup`. Restaurer : seulement avec Claude (commande en bas du fichier SQL).
- Mise en place : `supabase/notifications-sauvegarde.sql` (22 commandes, une à la fois), puis remplacer le code de la fonction `ingest` par `supabase/functions/ingest/index.ts` (Deploy, « Verify JWT » toujours désactivé). Pour l'appli : projet Firebase (application Android `be.broodautomate.operateur`), secret GitHub `GOOGLE_SERVICES_JSON` (fichier google-services.json) et secret Supabase `FCM_SERVICE_ACCOUNT` (clé du compte de service), puis relancer « Appli Android operateur » dans Actions.
- Les codes à ne jamais notifier sont en haut de la fonction (`SANS_NOTIF`) : à compléter après l'essai si la machine envoie des événements inutiles.
- **Tests** : maintenant dans `tests/` (voir `tests/README.md`). Le relevé d'une vraie machine n'est pas dans le dépôt.
- Point de retour : v5.8.0 = commit 7acd1e2.

## v5.10 — appli opérateur simplifiée et « Lire maintenant » réglable à distance
- **Appli opérateur (téléphone et appli Android)** : 4 onglets seulement — **À faire** (missions de l'admin et machines urgentes), **Remplir** (une grande carte par machine, recherche), **Alertes**, **Plus** (Détails, Sélections et stock, Historique, Liaison, langue, jour / nuit, déconnexion). En-tête sur une seule ligne. Sur téléphone : tableaux affichés en cartes, boutons − / + dans l'assistant « Remplir », longues explications repliées derrière « ℹ️ Aide ». Les anciennes pages restent accessibles (liens, « Plus »).
- **« Lire maintenant » réglable à distance** : admin → Connexion RS232 → Boîtiers 4G → 15 min, 30 min ou 1 h. Le réglage part par Internet (fonction `ba_boitier`, commande SQL n° 23 de `supabase/notifications-sauvegarde.sql`) ; il faut le programme du boîtier **v1.2** (voir `lilygo/LISEZMOI.md`). La liste des boîtiers montre le délai que chaque boîtier a vraiment reçu.
- Tests : `tests/sql/supabase.test.mjs` essaie les commandes SQL dans une vraie base PostgreSQL en mémoire (PGlite).
- Point de retour : v5.9.0 = commit cb44fae.

## v5.11 — design de la version test 4.8.6, machine « en ligne » seulement si elle est lue, alertes rangées
- **Nouveau design** (repris tel quel de la version test 4.8.6 « design v5 », choisi par Amor) : barre latérale réduite aux icônes qui s'ouvre au survol (cliquer sur le logo 🍞 la garde ouverte), en bas de la barre : appli opérateur, langue, bouton soleil / lune, déconnexion. Thème **nuit** (ardoise) et thème **clair** (crème, lisible au soleil) avec de vraies couleurs : l'ancien « mode clair » qui inversait l'écran est supprimé. Sans choix, le thème suit celui de l'ordinateur ou du téléphone. Sur téléphone : bouton ☰ (tiroir) et onglets en bas (admin : Dashboard, Détails, Produits, Alertes, Menu ; opérateur : ses 4 onglets). Icônes au même trait partout. Tout le style est dans `css/app.css` (variables en haut) ; `css/design.css` et `css/reel.css` n'existent plus. Règles du design : `DESIGN.md`.
- **« En ligne » = la machine est vraiment lue** : un boîtier 4G qui répond mais n'est pas branché sur la machine (mode essai, câble absent, machine qui ne répond pas) ne la met plus « en ligne ». La carte dit « boîtier en mode essai (pas branché sur la machine) » ou « boîtier en ligne, machine pas lue ». Le badge « Synchronisé » s'appelle maintenant « Sauvegardé » : il parle des données dans Supabase, pas des machines.
- **Détails machine → alertes** : les alertes en cours une par une ; les alertes résolues identiques regroupées (« Porte ouverte ×7, la dernière le … », détail à déplier) ; boutons **📦 Archiver** (une alerte, un groupe, ou toutes les résolues d'un coup) et « Voir les archivées ». Les archivées restent dans Alertes → « Archivées ».
- **Profils par jour → clic sur un chiffre** : la fenêtre « #1 … — lundi » par type de pain marche aussi pour une machine **sans historique de ventes** : on écrit directement le nombre de pains de chaque sorte ; la « journée normale » devient la moyenne des jours réglés à la main, jusqu'à ce que l'historique prenne le relais.
- **Connexion RS232** : la page est rangée en 4 onglets — **Câble** (choisir la machine, Connecter, Lire maintenant ; réglages et journal repliés), **Boîtiers 4G**, **Mes machines**, **Outils** (clé USB, test EVA-DTS).
- Point de retour : v5.10.0 = commit 7cffeec.

## v5.11.1 — l'opérateur change aussi le prix d'une sélection
- **Appli opérateur → Plus → Sélections et stock** : la colonne **Prix** se change directement (écrire le nouveau prix, il est enregistré en quittant la case). Le prix est aussi demandé quand on ajoute une sélection. Ajouter et supprimer une sélection existaient déjà (en bas de la page) ; ils sont maintenant plus visibles : bouton **« ➕ Ajouter une sélection »** en haut de la page, boutons **« ⇄ Déplacer »** et **« 🗑 Supprimer »** écrits en entier sur chaque ligne.
- Chaque changement de prix (opérateur ou admin) est noté dans l'**Historique** : « 💶 Prix changé — 2,50 € → 2,80 € », avec qui l'a fait et quand (filtre « Autres (dates, encore bon, sélections, prix) »).
- Le prix d'ici ne change pas la machine : son prix de vente se règle toujours sur la machine elle-même. Le montant des ventes vient du relevé de la machine ; le prix d'ici ne sert que si le relevé ne donne pas le montant d'une sélection.
- Correction : chez l'opérateur, le message « ✅ enregistré » (prix, capacité, sélection ajoutée…) n'apparaissait jamais dans les pages ouvertes depuis « Plus ». Il apparaît maintenant.
- Point de retour : v5.11.0 = commit 0fee273.

## v5.13 — porte en direct, total cumulé, carte / espèces, consommation

- **Porte ouverte en direct** : l'appli demande la fonction `ba_portes` toutes les 15 s (écran visible) ; la porte apparaît sur tous les appareils en ~15 s, avec « depuis X min » sur la machine et les n° des machines ouvertes sur la carte « Portes ouvertes ». Sans la commande SQL `supabase/v513.sql`, rien ne change.
- **Total depuis la mise en service** et **carte / espèces** (Détails machine) : lus dans le relevé (`VA1` = total, `DA2` = carte ; espèces = total − carte). Le détail du jour carte / espèces apparaît à partir du 2e relevé.
- **Technique → Système → Consommation** : ce que l'appareil télécharge ce mois (plafond 5 Go/mois pour tous), taille de la base (500 Mo), data de chaque boîtier par mois (`ba_conso`), copie des données (fichier à garder dans Google Drive) et effacement des relevés bruts de plus de 30 jours.
- **Notification immédiate de porte** (réglage dans Technique → Boîtiers 4G, éteint par défaut) : fonction `ingest` mise à jour.
- Tests : `tests/v513.mjs`, `tests/ingest/flux.test.mts`.

## v5.12 — page « Technique » (diagnostic et installation)
- **Nouvelle page « Technique »** (admin seulement, dans le menu juste après « Connexion RS232 »), en 5 onglets :
  - **📡 Boîtiers 4G** : la liste des boîtiers, puis le **détail de chacun** (programme, mode, allumé depuis, dernier contact, signal et réseau, machine et température, dernière lecture réussie, lectures, rythme, message, porte) et les **données 4G estimées** (depuis le démarrage du boîtier, et par mois au même rythme). Ensuite : réglage « Lire maintenant », « Lire toutes les machines », ajouter un boîtier. L'installation (commandes SQL, fonction « ingest », programme) est repliée en bas.
  - **🏭 Machines** : ajouter, renuméroter, supprimer une machine (avant : « Mes machines »). Nouveau : le **n° de plaque** se corrige. Il sert à vérifier qu'un boîtier lit bien cette machine : s'il est faux (par exemple le n° générique FAS000000001), chaque relevé du boîtier est refusé (« relevé d'une autre machine »). L'identifiant interne de la machine ne change pas.
  - **🔌 Câble et clé USB** : le câble entre le PC et une machine, les relevés reçus, le journal du câble ; l'import d'une clé USB ; le test d'un texte EVA-DTS (replié).
  - **📜 Journal** : les 30 derniers envois des boîtiers (heure à la seconde, origine « envoyé par la machine » ou « lu par le boîtier », contenu décodé, taille, traité ou pas) ; « 🔍 Voir » montre tout l'envoi décodé (n° lu, horloge, ventes, températures, événements, coupures) puis le texte reçu, à copier. Aussi : les alertes de communication et les demandes « Lire maintenant ».
  - **🖥 Système** : version, langue et thème, câble possible ou non dans ce navigateur, connexion et sauvegarde, taille et version des données, copies de nuit, dernière notification, état des boîtiers. Lecture seule.
- **« Connexion RS232 »** ne montre plus que les boîtiers : combien, lesquels, en ligne ou hors ligne, et si la machine est vraiment lue (✅ lue, 🧪 mode essai, ⚠️ pas lue). Un bouton ouvre la page Technique.
- Téléphone : les onglets passent à la ligne, les tableaux deviennent des cartes.
- Données 4G : c'est une **estimation** (5 à 9 Ko par échange avec Supabase, d'après le nombre d'envois que le boîtier compte lui-même). La vraie consommation se lit sur l'appli de la carte SIM.
- Point de retour : v5.11.1 = commit 886f3a0.


## v5.21 — carte SIM du boîtier (Digi / 1NCE) et programme complet à télécharger

- Technique → 📡 Boîtiers 4G → **Ajouter un boîtier** : nouveau choix **Carte SIM** (Digi par défaut, comme avant, ou 1NCE).
- La fenêtre de la clé (aussi après 🔑 « Nouvelle clé ») propose **⬇️ Télécharger le programme complet (.zip)** : le programme
  du boîtier v1.5 avec `config.h` déjà rempli (MODE 0, clé de CE boîtier, APN de la carte, écoute UDP pour 1NCE). La clé ne
  quitte pas le navigateur : le .zip est fabriqué sur l'ordinateur (`js/zip.js`, `js/programme.js`). La ligne DEVICE_KEY à
  copier reste là (ancienne méthode).
- Boîtier v1.5 (`lilygo/`) : avec 1NCE, il écoute le port UDP 3000 ; `lire` envoyé par le Device Controller de 1NCE = lecture
  et envoi tout de suite. Avec Digi, rien ne change. Mode d'emploi et essai pas à pas : `lilygo/LISEZMOI.md`.
- Aucun changement de base de données ni de fonction Supabase. Tests : `tests/v521.mjs`, `lilygo/essais/sim/essai_udp.sh`.

## v5.20 — conseil IA sous la commande

- Après la préparation de la commande (et dans l'onglet Stock), la carte « Demander conseil à une IA » a trois boutons : **Claude**, **ChatGPT**, **Copier pour l'IA**. Un clic copie le résumé et ouvre le site ; il reste à coller (Ctrl+V) et envoyer.
- Le résumé contient le stock, le stock estimé, la quantité à commander, les commandes passées, le calcul du logiciel et 8 semaines de ventes (flotte, par type de pain, par machine) ; réglages manuels si l'historique est court. L'IA conseille, rien n'est commandé. Aucune adresse ni secret n'est copié.
- Test : `tests/v520.mjs`. Aucun changement de base de données ni de fonction.

## v5.19 — remplissage spontané à 0, vérification complète
- **Remplir (appli opérateur)** : remplissage **sans commande** (aucune mission de l'admin) → **0 pain par défaut** sur chaque sélection, l'opérateur saisit ce qu'il met (message « Remplissage sans commande : tout est à 0 »). Remplissage d'une **mission** (commande envoyée par l'admin) → les quantités de la commande sont déjà écrites (« conseillé »), modifiables.
- Le **« Total à charger »** suit la saisie (boutons − / + ou clavier) ; avant, il restait à 0 jusqu'à la validation.
- Téléphone : « Date de livraison (toutes les lignes) » sur une ligne, la date en dessous.
- **À faire (opérateur)** : une machine **hors ligne** (pas de boîtier, ou boîtier muet) reste « à visiter » si le stock noté le demande (pains trop vieux à retirer, sélection vide…), avec « Hors ligne » et la raison sur sa carte. Avant, elle disparaissait et la page disait « Rien d'urgent ».
- **Annuler** (Remplir) : la confirmation ne redessine plus la fenêtre (les chiffres tapés restent) et le délai d'un « Remplir » précédent ne désarme plus le suivant.
- Les deux pages chargent les mêmes fichiers de textes ; chaque fichier js / css est demandé avec `?v=5.19.0` : après une publication, un simple rechargement de la page prend tous les nouveaux fichiers (plus de mélange avec l'ancienne version gardée par le navigateur). **À chaque nouvelle version, changer ce numéro dans `index.html`, `operateur.html` et `js/config.js`** (le test `v519.mjs` le vérifie).
- Vérification complète : syntaxe et analyse de tout le code (ESLint), 252 écrans (admin PC et téléphone, opérateur, 3 langues, 2 thèmes), orthographe FR / NL / EN, programme du boîtier recompilé (0 avertissement) avec ses essais et son simulateur, Supabase (journaux, conseils de sécurité).
- Tests : `tests/v519.mjs` (et `v515.mjs` ajouté à `npm run tout`).
- Point de retour : v5.18 = commit 112cfd6.

## v5.25 (essai « design-test ») — nouveau design et corrections après une vérification complète

**Design** (détails : `DESIGN.md`) : Dashboard en nombres (vert = plein, orange = à moitié, rouge = vide), en cartes ou en liste ;
un tiroir touché s'ouvre en fenêtre (le tiroir en grand, ses pains, ➕ pour les places vides, Retirer, Encore bon, ⇄ Déplacer, Modifier) ;
bouton **Machine / Classique** (Classique = l'ancien affichage, sans changement) ; l'opérateur a aussi le Dashboard.

**Corrections** (rien ne change dans la façon de travailler) :
- Fenêtre « ⇄ Déplacer du pain » : elle montrait les titres de la vue machine ; elle a de nouveau ses vrais titres.
- La fenêtre d'un tiroir ne remonte plus en haut quand l'écran se met à jour (vente, relevé), et ne s'ouvre plus toute seule sur une autre page.
- « Remplir » commencé puis oublié (appli fermée) : la machine restait « porte ouverte » pour toujours. Maintenant : un bandeau dans
  Détails machine (« Reprendre » / « Clore ce Remplir »), et le Remplir est clos tout seul après 4 h (`interventionMaxHours` dans `js/config.js`) ;
  ce qui était déjà validé (inventaire, retrait) reste.
- Ventes retirées deux fois du stock : un relevé lu AVANT un inventaire mais traité APRÈS (page admin fermée, téléphone sans réseau)
  ne retire plus les ventes une 2e fois (elles restent comptées dans les chiffres).
- Une même panne envoyait deux notifications (« ECF_38 » et « 16/38 ») : une seule maintenant (fonction `ingest`).
- « Remplir » fait sans réseau, appli fermée avant le retour du réseau, et un autre appareil avait écrit entre-temps : le Remplir était
  mis de côté. Maintenant il est refait sur les dernières données et envoyé (message « modification faite sans réseau envoyée »).
- Avec les mois, l'historique grossit : il est gardé dans IndexedDB (le stockage habituel du navigateur est limité à 5 Mo) et
  l'entretien des 30 s ne recopie plus tout l'historique (1 ms au lieu de 29 ms avec 400 jours × 35 machines).
- Compte opérateur : il peut LIRE les relevés des boîtiers 4G (sinon son stock n'était pas à jour), toujours sans pouvoir y écrire ni effacer.
- L'ancien code du simulateur de la version test est retiré (plus utilisé, mais il relisait les données pour rien).
- Version **5.27.1** partout (`?v=5.27.1`) : après la publication, les téléphones prennent tous les nouveaux fichiers.

**Supabase** (rien n'a été changé dans Supabase) :
- Le jour où cette version remplace le vrai site : remplacer le code de la fonction `ingest` par `supabase/functions/ingest/index.ts`
  (Deploy, « Verify JWT » toujours désactivé) ; et pour créer le compte opérateur, utiliser la nouvelle version de `supabase/operateur-compte.sql`.
- Dès maintenant (sécurité, ne change rien au site) : Authentication → Sign In / Providers → désactiver « Allow new users to sign up »
  (personne ne peut plus se créer un compte tout seul ; ton compte continue de marcher).
- Autre appli du même Supabase (« Preuve de livraison ») : `supabase/preuve-livraison-securite.sql` est prêt et essayé (verrou de 15 min
  après 5 mots de passe faux), **pas installé**.
- « Leaked password protection » : seulement avec l'abonnement Pro (ton Supabase est en gratuit) ; rien à faire.
- Tests : `tests/v525.mjs`, `tests/sql/operateur.test.mjs`, `tests/sql/preuve-livraison.test.mjs`.
- Point de retour : v5.23 = commit 6e9d66f.

