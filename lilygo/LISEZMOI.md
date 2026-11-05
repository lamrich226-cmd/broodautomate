# Boîtier 4G Broodautomate — LILYGO T-A7670E (programme v1.2)

Le boîtier reste branché sur la prise RS232 de la machine FAS. Il fait trois choses :

1. **Chaque heure**, il lit la machine (liste 2, comme le câble : rien n'est remis à zéro) : ventes, erreurs, alertes.
   Il n'envoie par la 4G **que ce qui a changé**, plus son état toutes les 30 minutes.
2. **Quand la machine envoie d'elle-même** (télémétrie = 1 : vente, porte…), son envoi part **tout de suite**,
   puis le boîtier relit la machine pour mettre les ventes à jour.
3. **Bouton « 📡 Lire maintenant »** dans Broodautomate : toutes les 2 minutes, le boîtier demande à Supabase
   s'il y a une demande. Si oui, il lit la machine et envoie le relevé (réponse en 2 à 3 minutes).

Broodautomate (PC ou téléphone) traite ces relevés exactement comme un relevé par câble : ventes retirées des pains
les plus anciens, stock, porte, température, coupures, erreurs de la machine dans les Alertes.

**Sécurité** : le boîtier ne fait que lire. Il n'envoie jamais de commande d'écriture ni d'effacement :
toute autre trame est bloquée avant l'envoi (même liste de sécurité que le logiciel).

---

## Mise à jour v1.1 → v1.2 : « Lire maintenant » réglable à distance

- Nouveau : le délai de « Lire maintenant » se règle **dans Broodautomate** (admin → Connexion RS232 → Boîtiers 4G :
  15 min, 30 min ou 1 h). Le boîtier le reçoit à son prochain passage chez Supabase : **plus besoin de brancher
  l'ordinateur** pour le changer. Tant que rien n'est réglé, il garde `DEMANDE_EVERY_SEC` (2 min).
- À faire une seule fois : la commande SQL n° 23 de `supabase/notifications-sauvegarde.sql`, puis téléverser ce programme
  (Arduino IDE, comme d'habitude ; `config.h` ne change pas : garde ta clé `DEVICE_KEY`).
- Le Moniteur série écrit : « Réglage reçu de Broodautomate : « Lire maintenant » vérifié toutes les 15 min. »
- Vérifié sur ordinateur : programme compilé pour l'ESP32 (26 % de la mémoire), simulateur `sim/lancer.sh reglage 0`
  (8 passages en 95 min au lieu de 45, la demande est prise au passage suivant), 61 essais de `test_boitier.cpp`.

## Mise à jour v1.0 → v1.1 (boîtier déjà installé)

1. **Supabase** : dans Broodautomate, onglet **🔌 Connexion RS232** → **📡 Boîtiers 4G** → **📋 Commandes SQL**.
   Fais seulement les commandes **10 à 17** (marquées 🆕), une par une, comme la première fois. La fonction « ingest » ne change pas.
2. **Programme** : télécharge le nouveau ZIP (lien plus bas), **Extraire tout**, ouvre `broodautomate_lilygo.ino`.
   Dans l'onglet **config.h**, remets **ta** ligne `DEVICE_KEY`, ton `APN` et `MODE 0`. Téléverse.
3. **Moniteur série** : au démarrage, tu dois voir
   `Lecture chaque 60 min ; envois de la machine acceptés à tout moment ; « Lire maintenant » vérifié toutes les 120 s`.
4. **Broodautomate** : le bouton **📡 Lire maintenant** apparaît (onglet Connexion RS232 → Boîtiers 4G, et page **Détails**
   de la machine). Clique : « ⏳ Demande envoyée », puis « 📥 Le boîtier lit la machine », puis « ✅ Lue à … ».

---

Installation complète, dans l'ordre : **1 Supabase → 2 Broodautomate → 3 Arduino → 4 essai 4G → 5 essai de la liaison → 6 sur la machine.**

## 1. Supabase (une seule fois)

### a) 17 commandes SQL
Dans Broodautomate : onglet **🔌 Connexion RS232** → partie **📡 Boîtiers 4G** → bouton **📋 Commandes SQL**.
Les 17 commandes y sont, chacune avec un bouton **Copier** (elles sont aussi dans `supabase/4g-boitiers.sql`).
Les commandes 1 à 9 servent aux boîtiers, les commandes 10 à 17 au bouton « Lire maintenant ».

Pour chaque commande : Supabase → ton projet → **SQL Editor** → **New query** → efface tout → colle → **Run** →
« Success » → commande suivante. Si une commande répond « already exists », elle est déjà faite : passe à la suivante.
Puis, dans Broodautomate, clique sur **J'ai fini : vérifier**.

### b) La fonction « ingest » (elle reçoit les envois des boîtiers)
Bouton **📋 Fonction « ingest »** dans la même partie (le code est aussi dans `supabase/functions/ingest/index.ts`).
1. Supabase → ton projet → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nom : **ingest** (exactement).
3. Efface le code d'exemple, colle le code (bouton **Copier le code**), puis **Deploy function**.
4. Ouvre la fonction **ingest** → **Details** (ou Settings) → **désactive « Verify JWT »** (« Enforce JWT verification ») → **Save**.
   Le boîtier se présente avec sa propre clé secrète, pas avec un compte.

## 2. Broodautomate : déclarer le boîtier
Onglet **🔌 Connexion RS232** → **📡 Boîtiers 4G** → **Ajouter un boîtier** : un nom (par ex. « Boîtier Midi ») et la machine.
Une fenêtre montre la ligne à copier :

```
#define DEVICE_KEY  "…32 caractères…"
```

Elle ne s'affiche **qu'une seule fois** (Supabase ne garde que son empreinte). Si tu la perds : bouton 🔑 « Nouvelle clé ».
Une clé différente par boîtier.

Dans **Mes machines**, le « N° de plaque » de la machine doit être le numéro que la machine annonce dans le Moniteur série
(`Who Are You accepté : n° « 20216417 »`, 8 chiffres). Sinon Broodautomate ne compte rien et affiche l'alerte
« relevé d'une autre machine ».

## 3. Arduino IDE : programme du boîtier
1. Arduino IDE 2 avec la carte **esp32 (Espressif)** déjà installée (Gestionnaire de carte).
2. Télécharge le programme : https://lamrich226-cmd.github.io/broodautomate/lilygo/broodautomate_lilygo.zip
   (aussi : bouton **⬇️ Programme du boîtier** dans Broodautomate). Clic droit sur le fichier → **Extraire tout**.
   Les 7 fichiers doivent rester ensemble dans le dossier `broodautomate_lilygo`.
   Arduino IDE → **Fichier → Ouvrir** → `broodautomate_lilygo.ino`.
3. **Outils → Type de carte → esp32 → ESP32 Dev Module.**
4. Onglet **config.h** (le SEUL fichier à modifier) :
   - `MODE` : 1 pour le premier essai (voir plus bas) ;
   - `DEVICE_KEY` : remplace toute la ligne par celle copiée à l'étape 2 ;
   - `APN` : `internet.proximus.be` pour Mobile Vikings, `internet` pour Digi, `iot.1nce.net` pour 1NCE ;
   - `SIM_PIN` : vide (enlève le code PIN de la carte SIM dans un téléphone, c'est plus simple).
   Les autres réglages ont déjà la bonne valeur (lecture chaque heure, bouton vérifié toutes les 2 minutes).
5. Antenne 4G vissée sur la prise **LTE** (pas GPS), carte SIM insérée (carte éteinte), câble USB-C **de données**.
6. **Outils → Port** : le port COM du LILYGO. Clique sur la flèche **Téléverser**.
7. **Outils → Moniteur série**, vitesse **115200**.

## 4. Essai 4G sans machine (`MODE 1`)
Le Moniteur série doit afficher, en 1 à 2 minutes :
```
[4G] Modem prêt …
[4G] ✔ Réseau : Proximus, signal 21/31, adresse 10.…
[Heure] 30/10/2026 04:19:03 (heure belge, …)
[Envoi] Signal de vie (… octets)…
[Envoi] ✔ Reçu par Supabase (réponse 200).
```
Dans Broodautomate, le boîtier passe **🟢 En ligne** (« Mode essai 4G »). Il renvoie un signal toutes les 2 minutes.
Tu peux déjà essayer le bouton **📡 Lire maintenant** : en mode essai, le boîtier répond
« Lecture impossible : boîtier en mode essai » (c'est normal, il n'est pas branché sur une machine).

## 5. Essai de la liaison RS232 (`MODE 2`)
Mets `#define MODE 2`, téléverse. Le modem reste éteint.
- **Essai A** : un fil Dupont entre les broches **18** et **19** du LILYGO (module débranché).
- **Essai B** : module MAX3232 branché (VCC → **3V3**, GND → GND, **TXD → 18**, **RXD → 19**), et un fil entre les
  trous **2** et **3** de la prise DB9 du module.

Toutes les 2 secondes : `✔ OK : « TEST » est revenu` = la liaison fonctionne.
`PAS DE RETOUR` à l'essai B = **échange les deux fils 18 et 19** (sur certains modules, TXD et RXD sont marqués à l'envers),
puis recommence.

## 6. Sur la machine (`MODE 0`)
1. Mets `#define MODE 0`, téléverse.
2. Machine : commande **90** = EVA-DTS DDCMP, sortie RS232, adresse **1**, vitesse **9600**, télémétrie **0** pour commencer
   (voir l'essai de la télémétrie plus bas). « Erase Interim Data » reste à **0**.
   **Ne jamais utiliser** « Erase Interim Data » ni « Immediate Erasing ».
3. **Branchement module ↔ machine** : les broches **2 et 3 doivent être croisées** (le module et la machine envoient
   tous les deux sur leur broche 2). Deux façons :
   - **Adaptateur « null modem » DB9 mâle-femelle** (ex. Amazon AK-610513-000-I, « Mini-adaptateur modem nul »,
     broches 2-3 / 3-2) entre le module et la machine : rien à câbler. Vérifie d'abord que la porte ferme avec
     l'adaptateur en place. Un adaptateur « 1:1 » ou un simple changeur de genre ne croise rien : il ne marche pas.
   - **3 fils Dupont mâle-femelle** : machine **2** → trou **3** du module, machine **3** → trou **2** du module,
     machine **5** → trou **5** du module.
4. Alimente le LILYGO avec un **chargeur USB 5 V / 2 A** (avec le port USB d'un PC, il redémarre quand la 4G émet).
5. Moniteur série (PC portable branché) :
```
[RS232] Lecture de contrôle (liste 2)…
[RS232] ← Who Are You accepté : n° « 20216417 » …
[RS232] Données complètes : 2791 octets reçus.
[Envoi] ✔ Reçu par Supabase (réponse 200).
```
6. Dans Broodautomate : premier relevé = point de départ (alerte « Premier relevé »), puis les ventes arrivent toutes seules
   (chaque heure, tout de suite avec la télémétrie, ou avec le bouton **📡 Lire maintenant**).

## 7. Essai de la télémétrie (ventes envoyées tout de suite) — sur UNE machine d'abord
Le manuel de la Power Lift ne dit pas ce que la machine envoie avec la télémétrie (ventes ? porte ? erreurs ?).
Cet essai le montre. Le boîtier v1.1 doit être installé et lire la machine normalement (étape 6).
1. Garde le PC branché sur le LILYGO, Moniteur série ouvert.
2. Machine : commande **90** → change **seulement** « télémétrie » de 0 à **1**. Ne touche à rien d'autre
   (surtout pas « Erase Interim Data » ni « Immediate Erasing »).
3. Fais **une vente** (achète un pain), puis ouvre et ferme la porte.
4. Regarde le Moniteur série. Si la machine envoie, tu vois :
```
[RS232] ← START (la machine ouvre une session)
[Relevé] … octets envoyés par la machine → à envoyer
[Envoi] ✔ Reçu par Supabase (réponse 200).
[RS232] Envoi de la machine reçu : lecture de contrôle pour mettre les ventes à jour.
```
   et la vente apparaît dans Broodautomate en 1 à 2 minutes.
5. **Copie tout le texte du Moniteur série et envoie-le à Claude** : il dira ce que la machine envoie vraiment.
6. Si rien n'arrive après la vente, ou si le Moniteur série affiche `La machine reprend la main à chaque essai`,
   remets la télémétrie à **0** (commande 90). Le boîtier continue alors avec la lecture chaque heure et le bouton.

### Commandes du Moniteur série (dépannage)
Tape dans la case du haut puis Entrée :
- `etat` : résumé (réseau, signal, heure, lectures, envois, demande en cours) ;
- `lire` : lit la machine tout de suite ;
- `envoi` : envoie l'état du boîtier tout de suite ;
- `demande` : regarde tout de suite s'il y a une demande « Lire maintenant » ;
- une commande AT, par ex. `AT+CSQ` (signal) : réponse du modem.

### Messages fréquents
| Message | Que faire |
|---|---|
| `Le modem ne répond pas` / `Brownout detector` | chargeur 5 V / 2 A, interrupteur de la carte, câble USB |
| `Carte SIM : …` / `demande un code PIN` | SIM bien enfoncée (carte éteinte), enlever le code PIN |
| `Pas de réseau` | antenne sur la prise **LTE** (pas GPS), couverture 4G, forfait de la SIM. Le boîtier essaie tout seul les 3 opérateurs belges (≈ 4 min) |
| `Réseau trouvé mais pas de données` | APN dans config.h |
| `Échec (code 401)` | `DEVICE_KEY` : clé de CE boîtier, copiée en entier |
| `Échec (code 404)` | fonction **ingest** pas déployée (étape 1b) |
| `Échec (code 713)` | DNS : signal faible ou réseau instable, le boîtier réessaie tout seul |
| `[Demande] ✖ La fonction « ba_boitier » n'existe pas encore` | commandes SQL **10 à 17** (étape 1a) |
| `[Demande] ✖ Clé du boîtier inconnue` | `DEVICE_KEY` (même clé que pour les envois) |
| `[Demande] ✖ Supabase refuse la clé publique` | ne pas modifier `SUPABASE_KEY` dans config.h (reprendre le ZIP) |
| `La machine ne répond pas (10 START sans réponse)` | fils 2/3 croisés (ou adaptateur null modem), fils 18/19, vitesse, commande 90 |
| `La machine reprend la main…` | télémétrie de la commande 90 à remettre à 0 |
| `Trame incomplète abandonnée` (une fois de temps en temps) | sans gravité si la lecture se termine quand même par `Données complètes` (la machine renvoie le bloc) |

## Données mobiles
Chaque échange en HTTPS coûte environ 5 à 9 Ko. Le boîtier v1.1 passe chez Supabase **toutes les 2 minutes**
(bouton « Lire maintenant ») : environ **100 à 200 Mo par mois** et par boîtier, plus les relevés (peu : seulement
quand quelque chose change). C'est sans problème avec un forfait Mobile Vikings de quelques Go.
Pour une carte avec très peu de données (1NCE : 500 Mo pour 10 ans), dans config.h :
`DEMANDE_EVERY_SEC 0` (bouton désactivé) ou `600` (réponse en 10 minutes), et `HEARTBEAT_MIN 60`.

## Ce qui a été vérifié
- **Sur la vraie machine (30/10/2026, v1.0)** : 4G Mobile Vikings, envoi HTTPS vers Supabase, module MAX3232 (fils 2/3 croisés),
  lecture complète de la Power Lift (2791 octets, liste 2) reçue par Supabase.
- **Sur ordinateur (v1.1)** : compilation pour l'ESP32 (esp32 3.3.12, « ESP32 Dev Module »), sans avertissement, dans les 3 modes ;
  même liaison DDCMP que `js/serial.js`, octet par octet (27 000 trames) ; programme complet avec modem et machine simulés :
  demande « Lire maintenant » (relevé identique envoyé quand même), mode essai, fonction absente, envoi de la machine
  suivi d'une lecture, envois de la machine juste après chaque lecture (pas de lectures en boucle) ; les 17 commandes SQL
  dans une vraie base PostgreSQL (droits, mauvaise clé, autre boîtier) ; Broodautomate avec un faux Supabase (bouton,
  suivi de la demande, échec, pas de réponse, boîtier hors ligne, ancien programme, envoi partiel de la machine).
- **Pas encore vérifié** : la v1.1 sur la vraie carte (en-tête « apikey » du modem vers la base) et la télémétrie = 1
  de la machine (étape 7). Au premier essai, copie le texte du Moniteur série s'il y a un problème.
