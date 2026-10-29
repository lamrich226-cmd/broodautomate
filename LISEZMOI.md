# Broodautomate v5.0

Logiciel de suivi des distributeurs de pain FAS Power Lift.

- `index.html` : le logiciel **admin** (sur le PC).
- `operateur.html` : l'**appli opérateur** (sur le téléphone).
- `v3/` : l'ancienne version 3.2, gardée telle quelle en secours.

La version 5 reprend toutes les fonctions de la version test 4.8.1 : Dashboard, lots de pain datés (le plus ancien sort en premier), appli opérateur avec « Remplir » en 3 étapes, Commander, Prévisions et calendrier, Statistiques, Historique, Alertes, français, néerlandais et anglais. Elle est branchée sur les vraies machines.

## Première ouverture (une seule fois)

1. Ouvre le logiciel et connecte-toi avec ton compte habituel (le même que pour la v3).
2. L'écran « Une dernière étape dans Supabase » s'affiche avec un script. Clique sur « Copier le script ».
3. Dans Supabase : ton projet → **SQL Editor** → **New query** → colle le script → **Run**. Tu dois voir « Success ». Le même script est dans `supabase/ba_state.sql`.
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
| `supabase/ba_state.sql` | script à coller une fois dans Supabase |

## Rappels de sécurité

- Seule la clé « publishable » de Supabase peut être dans le code. Ne jamais y mettre la clé « secret » ni « service_role ».
- Sur la machine, ne jamais utiliser « Erase Interim Data » ni « Immediate Erasing » : ils effacent les compteurs.
