# Boîtier 4G Broodautomate — LILYGO T-A7670E (programme v1.0)

Le boîtier reste branché sur la prise RS232 de la machine FAS. Il la **lit tout seul** toutes les 5 minutes
(liste 2, comme le câble : rien n'est remis à zéro) et envoie par la 4G **seulement ce qui a changé**,
plus un « signal de vie » toutes les 30 minutes. Broodautomate (PC ou téléphone) traite ces relevés exactement
comme un relevé par câble : ventes retirées des pains les plus anciens, stock, porte, température, coupures,
erreurs de la machine dans les Alertes.

**Sécurité** : le boîtier ne fait que lire. Il n'envoie jamais de commande d'écriture ni d'effacement :
toute autre trame est bloquée avant l'envoi (même liste de sécurité que le logiciel).

Ordre à suivre : **1 Supabase → 2 Broodautomate → 3 Arduino → 4 essai 4G → 5 essai de la liaison → 6 sur la machine.**

---

## 1. Supabase (une seule fois)

### a) 9 commandes SQL
Dans Broodautomate : onglet **🔌 Connexion RS232** → partie **📡 Boîtiers 4G** → bouton **📋 Commandes SQL**.
Les 9 commandes y sont, chacune avec un bouton **Copier** (elles sont aussi dans `supabase/4g-boitiers.sql`).

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
   - `APN` : `internet.proximus.be` pour Mobile Vikings, `iot.1nce.net` pour 1NCE ;
   - `SIM_PIN` : vide (enlève le code PIN de la carte SIM dans un téléphone, c'est plus simple).
5. Antenne 4G vissée sur la prise **LTE**, carte SIM insérée (carte éteinte), câble USB-C **de données**.
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

## 5. Essai de la liaison RS232 (`MODE 2`)
Mets `#define MODE 2`, téléverse. Le modem reste éteint.
- **Essai A** : un fil Dupont entre les broches **18** et **19** du LILYGO (module débranché).
- **Essai B** : module MAX3232 branché (VCC → **3V3**, GND → GND, **TXD → 18**, **RXD → 19**), et un fil entre les
  broches **2** et **3** de la prise DB9 du module.

Toutes les 2 secondes : `✔ OK : « TEST » est revenu` = la liaison fonctionne. `PAS DE RETOUR` = fil, broche ou module à vérifier.

## 6. Sur la machine (`MODE 0`)
1. Mets `#define MODE 0`, téléverse.
2. Machine : commande **90** = EVA-DTS DDCMP, sortie RS232, adresse **1**, vitesse **9600**, télémétrie **0**.
   « Erase Interim Data » reste à **0**. Ne jamais utiliser « Erase Interim Data » ni « Immediate Erasing ».
3. Branche le module MAX3232 sur la prise RS232 de la machine, et le LILYGO sur son alimentation USB (5 V / 2 A).
4. Moniteur série (PC portable branché) :
```
[RS232] Lecture de contrôle (liste 2)…
[RS232] ← Who Are You accepté …
[RS232] Données complètes : 2333 octets reçus.
[Envoi] ✔ Reçu par Supabase (réponse 200).
```
5. Dans Broodautomate : premier relevé = point de départ (alerte « Premier relevé »), puis chaque vente arrive toute seule.

### Commandes du Moniteur série (dépannage)
Tape dans la case du haut puis Entrée :
- `etat` : résumé (réseau, signal, heure, lectures, envois) ;
- `lire` : lit la machine tout de suite ;
- `envoi` : envoie un signal de vie tout de suite ;
- une commande AT, par ex. `AT+CSQ` (signal) : réponse du modem.

### Messages fréquents
| Message | Que faire |
|---|---|
| `Le modem ne répond pas` | alimentation 5 V / 2 A, interrupteur de la carte, câble USB |
| `Carte SIM : …` / `demande un code PIN` | SIM bien enfoncée (carte éteinte), enlever le code PIN |
| `Pas de réseau` | antenne sur la prise LTE, couverture 4G, forfait de la SIM |
| `Réseau trouvé mais pas de données` | APN dans config.h |
| `Échec (code 401)` | `DEVICE_KEY` : clé de CE boîtier, copiée en entier |
| `Échec (code 404)` | fonction **ingest** pas déployée (étape 1b) |
| `La machine ne répond pas (10 START sans réponse)` | module, fils 18/19, vitesse, commande 90 |
| `La machine reprend la main…` | télémétrie de la commande 90 à remettre à 0 |

## Données mobiles
Chaque envoi en HTTPS coûte environ 5 à 9 Ko. Avec les réglages de départ (lecture toutes les 5 min, envoi seulement si
quelque chose change, signal de vie toutes les 30 min) : environ **15 à 20 Mo par mois** et par boîtier.
Pour économiser (carte 1NCE) : `READ_EVERY_MIN 15` et `HEARTBEAT_MIN 60` dans config.h.

## Ce qui a été vérifié (sur ordinateur)
- Le programme se compile pour l'ESP32 (carte esp32 3.3.12, « ESP32 Dev Module »), sans avertissement, dans les 3 modes.
- La liaison DDCMP du boîtier donne **les mêmes trames, octet par octet**, que `js/serial.js` du logiciel, et la même
  liste de sécurité (20 000 trames essayées) ; essais contre une fausse machine avec le vrai relevé du 21/10.
- Le programme complet a tourné avec un modem et une machine simulés : coupure du réseau, pas d'heure de l'opérateur,
  mauvaise clé, session ouverte par la machine.
- **Pas encore vérifié** : la vraie carte (modem, 4G, HTTPS vers Supabase) et le vrai module MAX3232.
  Au premier essai, copie le texte du Moniteur série s'il y a un problème.
