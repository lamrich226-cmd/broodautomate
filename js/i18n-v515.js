// ============================================================
// BROODAUTOMATE v5.15 — Textes : onglet Technique → « Flux brut » (relevé complet à la demande) (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    tq_tab_raw: "Flux brut",
    tq_raw_intro: "Les envois automatiques du boîtier sont allégés : seulement ce que Broodautomate utilise, pour économiser la data 4G. Ici, tu demandes UN relevé complet, tel que la machine l'a donné (tout, y compris la caisse et les réglages), avec la traduction de chaque ligne. Rien n'est automatique : le boîtier ne l'envoie que quand tu cliques.",
    tq_raw_btn: "Flux brut", tq_raw_title: "Demander au boîtier un relevé complet, non filtré",
    tq_raw_box: "Boîtier :",
    tq_raw_none: "Aucun flux demandé.",
    tq_raw_wait: "Demande envoyée à {h}. Le boîtier la prend au plus tard dans {d}, puis lit la machine.",
    tq_raw_taken: "Le boîtier a pris la demande : il lit la machine…",
    tq_raw_done: "Flux reçu à {h} · {n} · {l} lignes",
    tq_raw_fail: "Le boîtier n'a pas pu lire la machine : {e}",
    tq_raw_notsent: "La demande n'a pas pu être envoyée.",
    tq_raw_notfound: "La demande est faite, mais le relevé n'a pas été retrouvé. Regarde l'onglet Journal.",
    tq_raw_local: "Le flux brut vient d'un boîtier 4G : il faut le mode en ligne (Supabase).",
    tq_raw_nobox: "Aucun boîtier 4G n'est encore ajouté.",
    tq_raw_nosql: "Les commandes SQL des boîtiers ne sont pas encore passées (onglet Boîtiers 4G).",
    tq_raw_offline: "Le boîtier est hors ligne : il ne peut pas répondre."
  });
  Object.assign(D.nl, {
    tq_tab_raw: "Ruwe stroom",
    tq_raw_intro: "De automatische verzendingen van de 4G-module zijn afgeslankt: alleen wat Broodautomate gebruikt, om 4G-data te besparen. Hier vraag je ÉÉN volledige uitlezing, zoals de automaat hem gaf (alles, ook kassa en instellingen), met de vertaling van elke regel. Niets gebeurt automatisch: de module verstuurt hem alleen als je klikt.",
    tq_raw_btn: "Ruwe stroom", tq_raw_title: "Vraag de module om een volledige, ongefilterde uitlezing",
    tq_raw_box: "4G-module:",
    tq_raw_none: "Geen stroom gevraagd.",
    tq_raw_wait: "Aanvraag verstuurd om {h}. De module neemt hem uiterlijk binnen {d} aan en leest dan de automaat.",
    tq_raw_taken: "De module heeft de aanvraag aangenomen: hij leest de automaat…",
    tq_raw_done: "Stroom ontvangen om {h} · {n} · {l} regels",
    tq_raw_fail: "De module kon de automaat niet uitlezen: {e}",
    tq_raw_notsent: "De aanvraag kon niet worden verstuurd.",
    tq_raw_notfound: "De aanvraag is klaar, maar de uitlezing is niet teruggevonden. Kijk in het tabblad Logboek.",
    tq_raw_local: "De ruwe stroom komt van een 4G-module: de online modus (Supabase) is nodig.",
    tq_raw_nobox: "Er is nog geen 4G-module toegevoegd.",
    tq_raw_nosql: "De SQL-opdrachten voor de modules zijn nog niet uitgevoerd (tabblad 4G-kastjes).",
    tq_raw_offline: "De module is offline: hij kan niet antwoorden."
  });
  Object.assign(D.en, {
    tq_tab_raw: "Raw feed",
    tq_raw_intro: "The box's automatic sends are slimmed down: only what Broodautomate uses, to save 4G data. Here you ask for ONE complete reading, exactly as the machine gave it (everything, including cash and settings), with a translation of each line. Nothing is automatic: the box only sends it when you click.",
    tq_raw_btn: "Raw feed", tq_raw_title: "Ask the box for a complete, unfiltered reading",
    tq_raw_box: "Box:",
    tq_raw_none: "No feed requested.",
    tq_raw_wait: "Request sent at {h}. The box picks it up within {d} at most, then reads the machine.",
    tq_raw_taken: "The box took the request: it is reading the machine…",
    tq_raw_done: "Feed received at {h} · {n} · {l} lines",
    tq_raw_fail: "The box could not read the machine: {e}",
    tq_raw_notsent: "The request could not be sent.",
    tq_raw_notfound: "The request is done, but the reading was not found. Check the Log tab.",
    tq_raw_local: "The raw feed comes from a 4G box: online mode (Supabase) is required.",
    tq_raw_nobox: "No 4G box has been added yet.",
    tq_raw_nosql: "The boxes' SQL commands have not been run yet (4G boxes tab).",
    tq_raw_offline: "The box is offline: it cannot answer."
  });
})();
