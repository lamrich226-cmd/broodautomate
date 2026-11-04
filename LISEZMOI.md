> **v5.6 — fonctions de la version test 4.8.9** (reprises dans le vrai logiciel, sur les vraies données) :
> - **Commander & prévisions** : un seul menu. Onglets *Préparer une commande* · *Vérifier l'état de stock* · *Prévision* (Calendrier · Profils par jour · **L'an dernier**). L'entrée « Prévisions & calendrier » du menu n'existe plus.
> - **L'an dernier** : *Période à venir (pour commander)* (dates libres, détail par type de pain, « Utiliser l'an dernier » avec ↩ Annuler, Excel) et *8 dernières semaines (comparaison)*. Depuis la commande : « Voir l'an dernier pour ces jours » puis « ← Retour à la commande ». La reprise de la v3 contient 400 jours de ventes : l'an dernier est complet à partir de ~420 jours d'historique.
> - **Dashboard → « À faire aujourd'hui »** (admin) : pains invalides, porte ouverte, machines hors ligne, alertes, machines vides, pains trop vieux, retours de la semaine dernière ; le lundi, le résumé de la semaine à télécharger.
> - **Statistiques** : onglets *Rentabilité* (nouveaux graphiques : courbe, barres, cumul), *Zéro retour* (objectif réglable, 5 % par défaut, ventes perdues, conseil par machine) et *Fiabilité de la prévision* ; bouton **Résumé de la semaine** (Excel, 3 feuilles).
> - **💾 Sauvegardes et retour en arrière** (en bas de l'onglet Prévision) : besoins par machine, historique des ventes, réglages et calendrier ; jamais le stock, les lots ni les missions. Les sauvegardes « dans le logiciel » restent dans le navigateur de CE PC (fichier .json pour les garder ailleurs).
> - **⇄ Déplacer du pain** entre deux sélections du même produit (Détails machine) : l'admin le fait ou le demande à l'opérateur (Missions → Fait). Noté dans l'Historique.
> - Retour à la v5.5 si besoin : version `c949574` sur GitHub (dernière v5.5, mode clair compris).

> **Mode clair** : bouton ☀️/🌙 dans l'en-tête (fichier `js/theme.js`). Choix gardé sur l'appareil.

> **v5.5 — nouveau design** : menu latéral à icônes fines et pastille bleue, cartes douces, pastilles d'état, écran de chargement en « squelette ». Fichier ajouté : `css/design.css` (retirer sa ligne dans index.html pour revenir à l'ancien look).

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
| `js/rs232.js` | onglet Connexion RS232 |
| `js/boot.js` | connexion au compte, chargement, écran d'installation |
| `js/ui.js`, `js/admin.js`, `js/admin-forecast.js`, `js/operateur.js`, `js/history.js`, `js/excel.js` | écrans |
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
