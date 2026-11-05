// ============================================================
// BROODAUTOMATE v5.11 — Textes : nouveau design (menu, thème), machine « en ligne » seulement si elle est vraiment lue,
// alertes de la page Détails regroupées et archivables, profils par jour sans historique, page RS232 en onglets (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    nav_menu: "Menu", nav_open: "Ouvrir le menu", nav_close: "Fermer le menu",
    nav_pin_tip: "Garder le menu ouvert ou le replier",
    sync_ok: "Sauvegardé",
    sync_tip: "Tes données sont bien enregistrées dans Supabase (le nuage). Ce n'est pas l'état des machines.",
    online_tip: "Machines dont les données arrivent vraiment (câble, ou boîtier 4G qui lit la machine). Un boîtier en mode essai ou pas branché sur la machine ne compte pas.",
    bx_tag_test: "boîtier en mode essai (pas branché sur la machine)",
    bx_tag_notread: "boîtier en ligne {h}, machine pas lue"
  });

  Object.assign(D.nl, {
    nav_menu: "Menu", nav_open: "Menu openen", nav_close: "Menu sluiten",
    nav_pin_tip: "Menu open houden of inklappen",
    sync_ok: "Opgeslagen",
    sync_tip: "Je gegevens zijn opgeslagen in Supabase (de cloud). Dit is niet de toestand van de automaten.",
    online_tip: "Automaten waarvan de gegevens echt binnenkomen (kabel, of 4G-kastje dat de automaat leest). Een kastje in testmodus of niet aangesloten op de automaat telt niet mee.",
    bx_tag_test: "kastje in testmodus (niet aangesloten op de automaat)",
    bx_tag_notread: "kastje online {h}, automaat niet gelezen"
  });

  Object.assign(D.en, {
    nav_menu: "Menu", nav_open: "Open the menu", nav_close: "Close the menu",
    nav_pin_tip: "Keep the menu open or fold it",
    sync_ok: "Saved",
    sync_tip: "Your data is saved in Supabase (the cloud). This is not the state of the machines.",
    online_tip: "Machines whose data really arrives (cable, or a 4G box that reads the machine). A box in test mode or not plugged into the machine does not count.",
    bx_tag_test: "box in test mode (not plugged into the machine)",
    bx_tag_notread: "box online {h}, machine not read"
  });
})();

(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, {
    sync_sending: "Envoi…", sync_offline: "Hors ligne : modifications gardées sur cet appareil", sync_local: "Mode local",
    det_al_none_active: "Aucune alerte en cours pour cette machine.",
    det_al_resolved_title: "Déjà résolues ({n})",
    det_al_resolved_1: "résolue le {d}",
    det_al_resolved_n: "résolues, la dernière le {d}",
    det_al_times: "{n} fois",
    det_al_show: "Voir le détail ({n})",
    det_al_arch_done: "Archiver les {n} [alerte résolue|alertes résolues]",
    det_al_see_archived: "Voir les archivées ({n})"
  });
  Object.assign(D.nl, {
    sync_sending: "Verzenden…", sync_offline: "Offline: wijzigingen bewaard op dit toestel", sync_local: "Lokale modus",
    det_al_none_active: "Geen lopende melding voor deze automaat.",
    det_al_resolved_title: "Al opgelost ({n})",
    det_al_resolved_1: "opgelost op {d}",
    det_al_resolved_n: "opgelost, de laatste op {d}",
    det_al_times: "{n} keer",
    det_al_show: "Details bekijken ({n})",
    det_al_arch_done: "De {n} [opgeloste melding|opgeloste meldingen] archiveren",
    det_al_see_archived: "Gearchiveerde bekijken ({n})"
  });
  Object.assign(D.en, {
    sync_sending: "Sending…", sync_offline: "Offline: changes kept on this device", sync_local: "Local mode",
    det_al_none_active: "No current alert for this machine.",
    det_al_resolved_title: "Already resolved ({n})",
    det_al_resolved_1: "resolved on {d}",
    det_al_resolved_n: "resolved, the last one on {d}",
    det_al_times: "{n} times",
    det_al_show: "Show details ({n})",
    det_al_arch_done: "Archive the {n} resolved [alert|alerts]",
    det_al_see_archived: "See archived ({n})"
  });
})();

(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, { pc_nohist: "Cette machine n'a pas encore d'historique de ventes : écris directement combien de pains de chaque sorte prévoir le {d}. Dès qu'il y aura assez de ventes, l'historique prendra le relais." });
  Object.assign(D.nl, { pc_nohist: "Deze automaat heeft nog geen verkoopgeschiedenis: vul rechtstreeks in hoeveel broden van elke soort je voorziet op {d}. Zodra er genoeg verkoop is, neemt de geschiedenis het over." });
  Object.assign(D.en, { pc_nohist: "This machine has no sales history yet: type directly how many loaves of each kind to plan on {d}. As soon as there are enough sales, the history takes over." });
})();

(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, {
    rs_tab_cable: "Câble", rs_tab_boxes: "Boîtiers 4G", rs_tab_machines: "Mes machines", rs_tab_tools: "Outils",
    rs_tab_cable_note: "Câble entre ce PC et une machine (Chrome ou Edge). Choisis la machine, branche, puis « Lire maintenant ».",
    rs_read_more: "Quelle liste lire",
    rs_journal_hint: "pour le dépannage"
  });
  Object.assign(D.nl, {
    rs_tab_cable: "Kabel", rs_tab_boxes: "4G-kastjes", rs_tab_machines: "Mijn automaten", rs_tab_tools: "Hulpmiddelen",
    rs_tab_cable_note: "Kabel tussen deze pc en een automaat (Chrome of Edge). Kies de automaat, sluit aan en klik op „Nu lezen”.",
    rs_read_more: "Welke lijst lezen",
    rs_journal_hint: "voor het oplossen van problemen"
  });
  Object.assign(D.en, {
    rs_tab_cable: "Cable", rs_tab_boxes: "4G boxes", rs_tab_machines: "My machines", rs_tab_tools: "Tools",
    rs_tab_cable_note: "Cable between this PC and a machine (Chrome or Edge). Choose the machine, connect, then “Read now”.",
    rs_read_more: "Which list to read",
    rs_journal_hint: "for troubleshooting"
  });
})();

(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, { prof_click_hint: "Clique sur un chiffre (par exemple sous « lun. ») pour régler ce jour par sorte de pain." });
  Object.assign(D.nl, { prof_click_hint: "Klik op een getal (bijvoorbeeld onder „ma.”) om die dag per broodsoort in te stellen." });
  Object.assign(D.en, { prof_click_hint: "Click a number (for example under “Mon.”) to set that day per kind of bread." });
})();
