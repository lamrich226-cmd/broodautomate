// ============================================================
// BROODAUTOMATE — Boîtier 4G pour distributeur FAS (LILYGO T-A7670E) — v1.6
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
//   modem.h         modem 4G (réseau, heure, HTTPS ; v1.5 : écoute UDP pour la carte 1NCE)
//   dex_moteur.h    v1.4 : lecture de la FAS 480 (DEX-UCS)
//   horloge.h       heure belge (été / hiver)
//   envoi.h         préparation des envois
//   filtre.h        v1.3 : retire du relevé les lignes inutiles avant l'envoi 4G (moins de data)
//
// v1.6 : MODE 3 = essai d'une machine ancienne (480 TOP, logiciel 1.x, sans DEX) : sans 4G ; 4e fil vers la broche 7
//        de la machine (BROCHE7_PIN) ; affiche tout ce que la machine envoie et un bilan.
// v1.5 : carte 1NCE : écoute UDP (« Lire maintenant » instantané par le Device Controller de 1NCE).
//        Broodautomate (Technique → Boîtiers 4G → « Ajouter un boîtier ») donne le programme COMPLET, déjà
//        rempli (clé, carte SIM, mode 0) : il suffit de l'ouvrir et de téléverser.
// v1.4 : un seul programme pour la Power Lift et la FAS 480 (reconnaissance automatique).
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
