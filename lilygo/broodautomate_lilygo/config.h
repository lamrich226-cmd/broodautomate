// ============================================================
// BROODAUTOMATE — Réglages du boîtier 4G (LE SEUL FICHIER À MODIFIER)
// Carte : LILYGO T-A7670E  ·  Arduino IDE : « ESP32 Dev Module »
// ============================================================
#pragma once

// ---------- 1. Mode de fonctionnement ----------
//   0 = NORMAL : lit la machine et envoie à Supabase (à mettre sur la machine)
//   1 = ESSAI 4G : sans machine, envoie seulement un « signal de vie » toutes les 2 minutes
//   2 = ESSAI LIAISON RS232 : sans 4G, envoie « TEST » sur les fils de la machine et regarde s'il revient
//       (pont entre les broches 18 et 19, ou entre les broches 2 et 3 de la prise du module MAX3232)
#define MODE  1

// ---------- 2. Clé secrète de CE boîtier ----------
// Donnée par Broodautomate (onglet « Connexion RS232 » → « Boîtiers 4G » → « Ajouter un boîtier »).
// Une clé différente par boîtier. Ne la donne à personne.
#define DEVICE_KEY  "COLLE_ICI_LA_CLE_DU_BOITIER"

// ---------- 3. Carte SIM ----------
#define APN      "internet"   // Digi Portugal : "internet". Mobile Vikings : "internet.proximus.be". 1NCE : "iot.1nce.net"
#define SIM_PIN  ""                       // vide si la carte SIM n'a pas de code PIN (conseillé)

// ---------- 4. Supabase (ne pas changer) ----------
#define SERVER_URL  "https://ujvihkryzjrawamekwpu.supabase.co/functions/v1/ingest"

// ---------- 5. Machine (mêmes réglages que le câble RS232 de Broodautomate) ----------
#define MACHINE_BAUD     9600     // vitesse de la commande 90 de la machine
#define READ_EVERY_MIN   5        // lecture de contrôle (liste 2) toutes les N minutes ; 0 = jamais (écoute seulement)
#define HEARTBEAT_MIN    30       // « je suis vivant » au moins toutes les N minutes, même sans changement

// ---------- 6. Moniteur série ----------
#define DETAILS_DDCMP    1        // 1 = affiche chaque trame échangée avec la machine (utile pour les essais)

// ---------- 7. Broches (carte LILYGO T-A7670, ne pas changer) ----------
#define MODEM_TX_PIN       26     // ESP32 → modem
#define MODEM_RX_PIN       27     // modem → ESP32
#define MODEM_PWRKEY_PIN    4
#define MODEM_RESET_PIN     5
#define BOARD_POWERON_PIN  12
// Module MAX3232 (fils Dupont) : VCC → 3V3, GND → GND, TXD → 18, RXD → 19
#define MACHINE_RX_PIN     18     // reçoit le « TXD » du module MAX3232
#define MACHINE_TX_PIN     19     // envoie vers le « RXD » du module MAX3232
