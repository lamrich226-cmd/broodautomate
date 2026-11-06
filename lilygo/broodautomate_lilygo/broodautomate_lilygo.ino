// ============================================================
// BROODAUTOMATE — Boîtier 4G pour distributeur FAS (LILYGO T-A7670E) — v1.3
//
// Ce fichier ne contient que ce mode d'emploi : le programme est dans les
// autres onglets. LE SEUL ONGLET À MODIFIER EST « config.h ».
//
// 1. Outils → Type de carte → esp32 → « ESP32 Dev Module »
// 2. Onglet config.h : MODE, DEVICE_KEY (clé donnée par Broodautomate), APN
// 3. Téléverser (flèche →), puis Outils → Moniteur série, vitesse 115200
//
// Onglets :
//   config.h        réglages (mode, clé du boîtier, carte SIM, broches)
//   boitier.cpp     programme principal (lecture, envois, Moniteur série)
//   ddcmp_moteur.h  liaison RS232 EVA-DTS DDCMP (copie du moteur du logiciel)
//   modem.h         modem 4G (réseau, heure, HTTPS)
//   horloge.h       heure belge (été / hiver)
//   envoi.h         préparation des envois
//   filtre.h        v1.3 : retire du relevé les lignes inutiles avant l'envoi 4G (moins de data)
//
// v1.3 : surveillance des ventes toutes les SURVEILLE_VENTES_SEC secondes sur le câble (gratuit) : une vente,
// une porte ou une erreur est envoyée tout de suite ; relevés allégés (filtre.h).
// v1.1 : lecture chaque heure (READ_EVERY_MIN), envois de la machine acceptés à
// tout moment (télémétrie = 1) puis relecture des ventes, bouton « Lire maintenant »
// de Broodautomate (vérifié toutes les DEMANDE_EVERY_SEC secondes).
//
// Sécurité : le boîtier ne fait que LIRE la machine (liste 2). Il n'envoie
// jamais de commande d'écriture ni d'effacement : toute autre trame est
// bloquée avant l'envoi.
// ============================================================
