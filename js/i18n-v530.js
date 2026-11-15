// ============================================================
// BROODAUTOMATE v5.30 — Textes (FR / NL / EN) : Alertes → filtre par machine, « Supprimer » et Corbeille (30 jours)
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    alert_machine: "Machine",
    alert_machine_all: "Toutes les machines",
    af_trash: "Corbeille",
    btn_delete: "Supprimer",
    btn_restore: "Restaurer",
    btn_purge: "Effacer pour de bon",
    btn_delete_shown: "Supprimer ces {n} [alerte|alertes]",
    btn_empty_trash: "Vider la corbeille ({n})",
    ev_trash_left: "Corbeille : encore {n} [jour|jours]",
    delete_confirm_t: "Supprimer {n} [alerte|alertes] ?",
    delete_confirm: "{n} [alerte va|alertes vont] dans la corbeille. Tu peux les restaurer pendant {d} jours ; ensuite elles sont effacées pour de bon.",
    delete_confirm_act: "Attention : {a} [a:alerte est|alertes sont] encore [a:active|actives] : le problème n'est peut-être pas réglé sur la machine.",
    delete_done_n: "🗑 {n} [alerte supprimée|alertes supprimées] : dans la corbeille pendant {d} jours.",
    restore_done: "↩️ Alerte restaurée.",
    purge_confirm_t: "Effacer {n} [alerte|alertes] pour de bon ?",
    purge_confirm: "C'est définitif : {n} [alerte sera effacée|alertes seront effacées] et ne pourra pas être récupérée.",
    purge_done_n: "❌ {n} [alerte effacée|alertes effacées] pour de bon.",
    trash_note: "Une alerte supprimée reste ici {d} jours : tu peux la restaurer. Passé ce délai, elle est effacée pour de bon.",
    trash_empty: "La corbeille est vide."
  });

  Object.assign(D.nl, {
    alert_machine: "Machine",
    alert_machine_all: "Alle machines",
    af_trash: "Prullenbak",
    btn_delete: "Verwijderen",
    btn_restore: "Herstellen",
    btn_purge: "Definitief wissen",
    btn_delete_shown: "Deze {n} [melding|meldingen] verwijderen",
    btn_empty_trash: "Prullenbak legen ({n})",
    ev_trash_left: "Prullenbak: nog {n} [dag|dagen]",
    delete_confirm_t: "{n} [melding|meldingen] verwijderen?",
    delete_confirm: "{n} [melding gaat|meldingen gaan] naar de prullenbak. Je kunt ze {d} dagen herstellen; daarna worden ze definitief gewist.",
    delete_confirm_act: "Opgelet: {a} [a:melding is|meldingen zijn] nog actief: het probleem is misschien niet opgelost op de machine.",
    delete_done_n: "🗑 {n} [melding verwijderd|meldingen verwijderd]: {d} dagen in de prullenbak.",
    restore_done: "↩️ Melding hersteld.",
    purge_confirm_t: "{n} [melding|meldingen] definitief wissen?",
    purge_confirm: "Dit is definitief: {n} [melding wordt|meldingen worden] gewist en kan niet worden teruggehaald.",
    purge_done_n: "❌ {n} [melding|meldingen] definitief gewist.",
    trash_note: "Een verwijderde melding blijft hier {d} dagen: je kunt ze herstellen. Daarna wordt ze definitief gewist.",
    trash_empty: "De prullenbak is leeg."
  });

  Object.assign(D.en, {
    alert_machine: "Machine",
    alert_machine_all: "All machines",
    af_trash: "Trash",
    btn_delete: "Delete",
    btn_restore: "Restore",
    btn_purge: "Delete forever",
    btn_delete_shown: "Delete these {n} [alert|alerts]",
    btn_empty_trash: "Empty the trash ({n})",
    ev_trash_left: "Trash: {n} [day|days] left",
    delete_confirm_t: "Delete {n} [alert|alerts]?",
    delete_confirm: "{n} [alert goes|alerts go] to the trash. You can restore them for {d} days; after that they are deleted for good.",
    delete_confirm_act: "Careful: {a} [a:alert is|alerts are] still active: the problem may not be fixed on the machine.",
    delete_done_n: "🗑 {n} [alert deleted|alerts deleted]: in the trash for {d} days.",
    restore_done: "↩️ Alert restored.",
    purge_confirm_t: "Delete {n} [alert|alerts] forever?",
    purge_confirm: "This is final: {n} [alert will be|alerts will be] deleted and cannot be recovered.",
    purge_done_n: "❌ {n} [alert|alerts] deleted forever.",
    trash_note: "A deleted alert stays here for {d} days: you can restore it. After that it is deleted for good.",
    trash_empty: "The trash is empty."
  });
})();
