// ============================================================
// BROODAUTOMATE v5.29 — Textes (FR / NL / EN) : machines supprimées, « Lire maintenant » en UDP (carte 1NCE),
// avertissement de nouvelle version ; v5.29.1 : heure de lecture de la consommation 1NCE
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    num_supprimee: "(supprimée)",
    bx_read_resent: "Ordre renvoyé au boîtier.",
    bx_read_retry_title: "Pas encore de réponse : renvoyer l'ordre au boîtier",
    bx_read_title_fast: "Le boîtier lit la machine tout de suite (réponse en quelques secondes).",
    bx_all_title_fast: "Chaque boîtier lit sa machine tout de suite (quelques secondes). Ensuite, le stock et les ventes de toutes les machines sont à jour.",
    bx_udp_tag: "écoute permanente (1NCE)",
    bx_det_ec_udp: "instantané : le boîtier écoute en permanence (UDP)",
    bx_det_data_1nce_l: "Données 4G",
    bx_det_data_1nce: "chiffre exact de 1NCE : onglet « Consommation 4G »",
    bx_hint_nostart: "Menu de réglage ouvert ? Ressors-en et attends un peu. Sinon, vérifier le module MAX3232 et ses fils, la vitesse et la commande 90.",
    tq_raw_wait_fast: "Demande envoyée à {h}. Le boîtier lit la machine tout de suite (quelques secondes).",
    maj_txt: "Une nouvelle version de Broodautomate est publiée ({v}).",
    maj_btn: "Recharger",
    bx_conso_at: "🕒 chiffres lus chez 1NCE à {h}"
  });

  Object.assign(D.nl, {
    num_supprimee: "(verwijderd)",
    bx_read_resent: "Opdracht opnieuw naar de module gestuurd.",
    bx_read_retry_title: "Nog geen antwoord: opdracht opnieuw naar de module sturen",
    bx_read_title_fast: "De module leest de automaat meteen uit (antwoord binnen enkele seconden).",
    bx_all_title_fast: "Elke module leest zijn automaat meteen uit (enkele seconden). Daarna zijn de voorraad en de verkoop van alle automaten bijgewerkt.",
    bx_udp_tag: "luistert permanent (1NCE)",
    bx_det_ec_udp: "meteen: de module luistert permanent (UDP)",
    bx_det_data_1nce_l: "4G-data",
    bx_det_data_1nce: "exact cijfer van 1NCE: tabblad « Verbruik 4G »",
    bx_hint_nostart: "Instellingenmenu open? Verlaat het en wacht even. Anders de MAX3232-module en de draden, de snelheid en commando 90 controleren.",
    tq_raw_wait_fast: "Aanvraag verstuurd om {h}. De module leest de automaat meteen uit (enkele seconden).",
    maj_txt: "Er is een nieuwe versie van Broodautomate gepubliceerd ({v}).",
    maj_btn: "Herladen",
    bx_conso_at: "🕒 cijfers gelezen bij 1NCE om {h}"
  });

  Object.assign(D.en, {
    num_supprimee: "(deleted)",
    bx_read_resent: "Order sent to the box again.",
    bx_read_retry_title: "No answer yet: send the order to the box again",
    bx_read_title_fast: "The box reads the machine right away (answer within a few seconds).",
    bx_all_title_fast: "Each box reads its machine right away (a few seconds). Then the stock and sales of every machine are up to date.",
    bx_udp_tag: "always listening (1NCE)",
    bx_det_ec_udp: "instant: the box is always listening (UDP)",
    bx_det_data_1nce_l: "4G data",
    bx_det_data_1nce: "exact figure from 1NCE: « 4G usage » tab",
    bx_hint_nostart: "Settings menu open? Leave it and wait a little. Otherwise check the MAX3232 module and its wires, the speed and command 90.",
    tq_raw_wait_fast: "Request sent at {h}. The box reads the machine right away (a few seconds).",
    maj_txt: "A new version of Broodautomate is published ({v}).",
    maj_btn: "Reload",
    bx_conso_at: "🕒 figures read from 1NCE at {h}"
  });
})();
