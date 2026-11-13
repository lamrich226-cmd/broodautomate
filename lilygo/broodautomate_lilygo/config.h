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
//   3 = ESSAI MACHINE ANCIENNE (v1.6) : sans 4G, pour les anciennes FAS (480 TOP, logiciel 1.x, sans DEX) : écoute la
//       machine, allume / coupe la broche 7 de sa prise (4e fil), attend l'appui sur le bouton de la carte mère et
//       affiche tout ce qui arrive + un bilan (Moniteur série à 115200)
#define MODE  1

// ---------- 2. Clé secrète de CE boîtier ----------
// Donnée par Broodautomate (menu Technique → Boîtiers 4G → « Ajouter un boîtier »).
// v1.5 : Broodautomate peut aussi donner le programme COMPLET, déjà rempli (clé, carte SIM, mode) : rien à écrire ici.
// Une clé différente par boîtier. Ne la donne à personne.
#define DEVICE_KEY  "COLLE_ICI_LA_CLE_DU_BOITIER"

// ---------- 3. Carte SIM ----------
#define APN      "internet.proximus.be"   // Mobile Vikings (réseau Proximus). Autres : Digi Portugal "internet", 1NCE "iot.1nce.net". Si ça ne marche pas, le boîtier essaie aussi web.be et mworld.be
#define SIM_PIN  ""                       // vide si la carte SIM n'a pas de code PIN (conseillé)
#define ECOUTE_UDP 0                      // v1.5 : 1 = carte 1NCE : le boîtier écoute le port UDP 3000 (« lire » envoyé par le
                                          //        Device Controller de 1NCE = lecture tout de suite) ; 0 = comme avant (Digi…)

// ---------- 4. Supabase (ne pas changer) ----------
#define SERVER_URL    "https://ujvihkryzjrawamekwpu.supabase.co/functions/v1/ingest"          // relevés et signaux de vie
#define DEMANDE_URL   "https://ujvihkryzjrawamekwpu.supabase.co/rest/v1/rpc/ba_boitier"       // bouton « Lire maintenant »
#define SUPABASE_KEY  "sb_publishable_s6F8C6S_gDlh68L5BfJ47Q_coFMjWKI"                        // clé publique (pas secrète)

// ---------- 5. Machine (mêmes réglages que le câble RS232 de Broodautomate) ----------
#define MACHINE_BAUD     9600     // vitesse de la commande 90 de la machine
#define SURVEILLE_VENTES_SEC 30   // v1.3 : le boîtier lit la machine toutes les N secondes sur le câble RS232 (gratuit : aucune data 4G) ;
                                  //        dès qu'une vente, une porte ou une erreur apparaît, le relevé part tout de suite. 0 = pas de surveillance
#define READ_EVERY_MIN   60       // relevé de contrôle envoyé au moins toutes les N minutes même si rien n'a changé (températures) ; 0 = jamais.
                                  // Sans surveillance (SURVEILLE_VENTES_SEC 0) : lecture de la machine toutes les N minutes
#define HEARTBEAT_MIN    30       // « je suis vivant » au moins toutes les N minutes, même sans changement
#define DEMANDE_EVERY_SEC 120     // bouton « Lire maintenant » de Broodautomate : le boîtier regarde toutes les N secondes
                                  // s'il y a une demande (120 = réponse en 2 à 3 min) ; 0 = bouton désactivé
#define PROTOCOLE        0        // v1.4 : 0 = le boîtier reconnaît tout seul la machine (Power Lift ou FAS 480) — conseillé ; 1 = force Power Lift ; 2 = force FAS 480
#define DEX_LECTURE_SEC  300      // v1.4 FAS 480 : la machine ne prévient pas quand elle vend : le boîtier la lit toutes les N secondes sur le câble RS232 (gratuit)
#define DEX_RECAP_MIN    120      // v1.4 FAS 480 : relevé de contrôle envoyé en 4G au moins toutes les N minutes même sans changement (sinon : seulement vente ou erreur nouvelle)
#define LIRE_APRES_ENVOI_MACHINE 1  // 1 = quand la machine envoie elle-même (télémétrie = 1 : vente, porte…),
                                    //     le boîtier relit la machine juste après pour mettre les ventes à jour

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
// v1.6, MODE 3 seulement : 4e fil (Dupont) de cette broche du LILYGO vers la broche 7 (DTR) de la prise de la machine
#define BROCHE7_PIN        21     // -1 = pas de 4e fil
#define BROCHE7_PIN_BIS    22     // même rôle : le 4e fil peut aller sur la broche 21 OU sur la 22 ; -1 = pas utilisée
