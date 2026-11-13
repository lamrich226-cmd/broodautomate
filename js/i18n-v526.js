// ============================================================
// BROODAUTOMATE v5.26 — Textes : « Lire maintenant » instantané (carte 1NCE) et numéro de carte SIM (ICCID) (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    tq_tab_usage: "Consommation 4G",
    bx_conso_note: "Chiffres de 1NCE, carte par carte, jour par jour (1 Ko = 1000 octets). Les chiffres du jour peuvent arriver avec un peu de retard.",
    bx_conso_noiccid: "Renseigne le n° ICCID de ce boîtier (onglet Boîtiers 4G) pour voir sa consommation.",
    bx_conso_day: "Jour",
    bx_conso_total: "Total",
    bx_conso_refresh: "Actualiser",
    bx_conso: "Consommation",
    bx_conso_none: "Pas encore de chiffre pour les 7 derniers jours.",
    bx_conso_sum: "7 jours : {k}",
    bx_conso_left: "reste {k}",
    bx_iccid: "N° de la carte SIM (ICCID)",
    bx_iccid_opt: "carte 1NCE, facultatif",
    bx_iccid_bad: "Le n° de la carte SIM (ICCID) doit contenir 18 à 20 chiffres (il est écrit sur la carte et dans le portail 1NCE).",
    bx_iccid_saved: "N° de carte SIM enregistré.",
    bx_iccid_sql: "La base n'a pas encore la colonne du n° de carte SIM : passe d'abord la commande v526.sql dans Supabase.",
    bx_read_sent_fast: "Demande envoyée : le boîtier lit la machine tout de suite (1 à 2 secondes pour recevoir l'ordre).",
    bx_read_fast_ko: "L'ordre instantané n'est pas parti : le boîtier lira la machine à son prochain passage ({d} au plus)."
  });
  Object.assign(D.nl, {
    tq_tab_usage: "Verbruik 4G",
    bx_conso_note: "Cijfers van 1NCE, kaart per kaart, dag per dag (1 Ko = 1000 bytes). De cijfers van vandaag kunnen wat vertraging hebben.",
    bx_conso_noiccid: "Vul het ICCID-nummer van deze module in (tabblad 4G-modules) om het verbruik te zien.",
    bx_conso_day: "Dag",
    bx_conso_total: "Totaal",
    bx_conso_refresh: "Vernieuwen",
    bx_conso: "Verbruik",
    bx_conso_none: "Nog geen cijfer voor de laatste 7 dagen.",
    bx_conso_sum: "7 dagen: {k}",
    bx_conso_left: "over: {k}",
    bx_iccid: "Nr. van de simkaart (ICCID)",
    bx_iccid_opt: "1NCE-kaart, facultatief",
    bx_iccid_bad: "Het nr. van de simkaart (ICCID) moet 18 tot 20 cijfers bevatten (staat op de kaart en in het 1NCE-portaal).",
    bx_iccid_saved: "Nr. van de simkaart opgeslagen.",
    bx_iccid_sql: "De database heeft de kolom voor het simkaartnummer nog niet: voer eerst het commando v526.sql uit in Supabase.",
    bx_read_sent_fast: "Aanvraag verstuurd: de module leest de automaat meteen (1 tot 2 seconden om het bevel te ontvangen).",
    bx_read_fast_ko: "Het directe bevel is niet vertrokken: de module leest de automaat bij zijn volgende contact (hoogstens {d})."
  });
  Object.assign(D.en, {
    tq_tab_usage: "4G usage",
    bx_conso_note: "Figures from 1NCE, card by card, day by day (1 Ko = 1000 bytes). Today's figures can arrive a little late.",
    bx_conso_noiccid: "Fill in this box's ICCID number (4G boxes tab) to see its usage.",
    bx_conso_day: "Day",
    bx_conso_total: "Total",
    bx_conso_refresh: "Refresh",
    bx_conso: "Usage",
    bx_conso_none: "No figure yet for the last 7 days.",
    bx_conso_sum: "7 days: {k}",
    bx_conso_left: "left: {k}",
    bx_iccid: "SIM card number (ICCID)",
    bx_iccid_opt: "1NCE card, optional",
    bx_iccid_bad: "The SIM card number (ICCID) must have 18 to 20 digits (printed on the card and in the 1NCE portal).",
    bx_iccid_saved: "SIM card number saved.",
    bx_iccid_sql: "The database does not have the SIM card number column yet: run the v526.sql command in Supabase first.",
    bx_read_sent_fast: "Request sent: the box reads the machine right away (1 to 2 seconds to receive the order).",
    bx_read_fast_ko: "The instant order did not go out: the box will read the machine at its next contact ({d} at most)."
  });

  // Réglage « toutes les 15 min / 30 min / 1 h » : devient un filet de sécurité pour les boîtiers à carte 1NCE
  D.fr.bx_ec_note += " Boîtier à carte 1NCE avec son n° ICCID renseigné : « Lire maintenant » est instantané (quelques secondes, environ 70 octets) ; ce réglage ne sert alors que de filet de sécurité si l'ordre se perd.";
  D.nl.bx_ec_note += " Module met 1NCE-kaart waarvan het ICCID-nummer is ingevuld: « Nu uitlezen » is direct (enkele seconden, ongeveer 70 bytes); deze instelling is dan enkel een vangnet als het bevel verloren gaat.";
  D.en.bx_ec_note += " Box with a 1NCE card whose ICCID number is filled in: « Read now » is instant (a few seconds, about 70 bytes); this setting is then only a safety net if the order gets lost.";
})();
