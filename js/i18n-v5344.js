// ============================================================
// BROODAUTOMATE v5.34.4 — Textes (FR / NL / EN) : « Remplir » sûr avec plusieurs appareils, inventaire
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    inv_suspect: "L'appli croit cette machine vide. Ce n'est peut-être pas vrai : ouvrez la machine, comptez les pains et tapez le nombre pour chaque sélection.",
    inv_suspect_mv: "L'appli croit cette machine vide. Ce n'est peut-être pas vrai : comptez les pains de chaque tiroir, corrigez avec + / −, puis validez.",
    inv_suspect_sel: "Des pains ont été vendus alors que l'appli notait 0 (sélection {list}). Comptez ces sélections (en rouge) et tapez le nombre.",
    inv_suspect_sel_mv: "Des pains ont été vendus alors que l'appli notait 0 (sélection {list}). Comptez ces tiroirs, corrigez avec + / −, puis validez.",
    btn_zero_sel_confirm: "Appuyez encore pour confirmer : 0 pain dans {list}",
    ld_zero_ask_stock: "Vous n'avez rien chargé ? Le stock restera à {n} [pain|pains]. Appuyez encore sur « Valider le chargement » pour confirmer, ou tapez ce que vous avez chargé.",
    wz_moved: "Ce « Remplir » a changé sur un autre appareil : vous êtes maintenant à l'étape {n}.",
    wz_lost_gone: "Ce « Remplir » n'existe plus.",
    wz_lost_done: "Ce « Remplir » a été terminé sur un autre appareil.",
    wz_lost_auto: "Ce « Remplir » était ouvert depuis plus d'1 heure sans rien de validé : il a été annulé tout seul. Rien n'a changé dans le stock.",
    wz_lost_auto4: "Ce « Remplir » est resté ouvert trop longtemps : il a été fermé tout seul. Les étapes déjà validées sont gardées.",
    wz_lost_cancel: "Ce « Remplir » a été annulé sur un autre appareil. Ce qui avait été validé a été défait.",
    wz_lost_refused: "Cette étape n'a pas pu être enregistrée : le « Remplir » a changé sur un autre appareil.",
    wz_lost_help: "Rien n'a été enregistré depuis cette fenêtre. Touchez « Recommencer » pour ouvrir un nouveau « Remplir » et recomptez les pains.",
    wz_restart: "Recommencer",
    wz_open_elsewhere: "Un « Remplir » est déjà en cours sur cette machine : commencé le {h} {by}, à l'étape {n}.",
    wz_open_elsewhere_help: "Si c'est le vôtre ou celui d'un collègue qui travaille dessus, continuez-le. Si personne ne s'en occupe, annulez-le et recommencez : ce qui avait été validé sera défait.",
    wz_continue: "Continuer ce Remplir",
    wz_cancel_restart: "Annuler et recommencer",
    wz_restart_confirm: "Appuyez encore pour annuler ce Remplir",
    wz_by_user: "par {u} ({d})",
    wz_by_device: "sur un autre appareil ({d})",
    wz_by_unknown: "sur un autre appareil",
    wz_sync_ok: "Enregistré sur le serveur : les autres appareils le voient.",
    wz_sync_wait: "Pas encore envoyé au serveur. Gardez l'appli ouverte avec du réseau jusqu'à ce que ce message passe à « Enregistré »."
  });

  Object.assign(D.nl, {
    inv_suspect: "De app denkt dat dit toestel leeg is. Dat klopt misschien niet: open het toestel, tel de broden en typ het aantal voor elke selectie.",
    inv_suspect_mv: "De app denkt dat dit toestel leeg is. Dat klopt misschien niet: tel de broden van elke lade, pas aan met + / − en bevestig.",
    inv_suspect_sel: "Er zijn broden verkocht terwijl de app 0 noteerde (selectie {list}). Tel deze selecties (in het rood) en typ het aantal.",
    inv_suspect_sel_mv: "Er zijn broden verkocht terwijl de app 0 noteerde (selectie {list}). Tel deze laden, pas aan met + / − en bevestig.",
    btn_zero_sel_confirm: "Druk nog eens om te bevestigen: 0 broden in {list}",
    ld_zero_ask_stock: "Niets geladen? De voorraad blijft op {n} [brood|broden]. Druk nogmaals op « Lading bevestigen » of typ wat u hebt geladen.",
    wz_moved: "Deze « Vullen » is op een ander toestel veranderd: u bent nu bij stap {n}.",
    wz_lost_gone: "Deze « Vullen » bestaat niet meer.",
    wz_lost_done: "Deze « Vullen » is op een ander toestel afgewerkt.",
    wz_lost_auto: "Deze « Vullen » stond meer dan 1 uur open zonder iets te bevestigen: hij is vanzelf geannuleerd. Er is niets aan de voorraad veranderd.",
    wz_lost_auto4: "Deze « Vullen » stond te lang open: hij is vanzelf gesloten. De al bevestigde stappen blijven bewaard.",
    wz_lost_cancel: "Deze « Vullen » is op een ander toestel geannuleerd. Wat bevestigd was, is ongedaan gemaakt.",
    wz_lost_refused: "Deze stap kon niet worden opgeslagen: de « Vullen » is op een ander toestel veranderd.",
    wz_lost_help: "Er is niets opgeslagen vanuit dit venster. Tik op « Opnieuw beginnen » om een nieuwe « Vullen » te openen en tel de broden opnieuw.",
    wz_restart: "Opnieuw beginnen",
    wz_open_elsewhere: "Er loopt al een « Vullen » op dit toestel: begonnen op {h} {by}, bij stap {n}.",
    wz_open_elsewhere_help: "Is het de uwe of die van een collega die eraan werkt, ga dan verder. Werkt niemand eraan, annuleer en begin opnieuw: wat bevestigd was, wordt ongedaan gemaakt.",
    wz_continue: "Deze Vullen voortzetten",
    wz_cancel_restart: "Annuleren en opnieuw",
    wz_restart_confirm: "Druk nog eens om deze Vullen te annuleren",
    wz_by_user: "door {u} ({d})",
    wz_by_device: "op een ander toestel ({d})",
    wz_by_unknown: "op een ander toestel",
    wz_sync_ok: "Opgeslagen op de server: de andere toestellen zien het.",
    wz_sync_wait: "Nog niet naar de server verstuurd. Houd de app open met netwerk tot dit bericht « Opgeslagen » toont."
  });

  Object.assign(D.en, {
    inv_suspect: "The app thinks this machine is empty. That may not be true: open the machine, count the bread and type the number for each selection.",
    inv_suspect_mv: "The app thinks this machine is empty. That may not be true: count the bread in each tray, adjust with + / −, then confirm.",
    inv_suspect_sel: "Bread was sold while the app recorded 0 (selection {list}). Count these selections (in red) and type the number.",
    inv_suspect_sel_mv: "Bread was sold while the app recorded 0 (selection {list}). Count these trays, adjust with + / −, then confirm.",
    btn_zero_sel_confirm: "Press again to confirm: 0 bread in {list}",
    ld_zero_ask_stock: "Nothing loaded? The stock will stay at {n} [bread|breads]. Press « Confirm loading » again to confirm, or type what you loaded.",
    wz_moved: "This « Fill » changed on another device: you are now at step {n}.",
    wz_lost_gone: "This « Fill » no longer exists.",
    wz_lost_done: "This « Fill » was finished on another device.",
    wz_lost_auto: "This « Fill » was open for more than 1 hour with nothing confirmed: it was cancelled automatically. Nothing changed in the stock.",
    wz_lost_auto4: "This « Fill » stayed open too long: it was closed automatically. The steps already confirmed are kept.",
    wz_lost_cancel: "This « Fill » was cancelled on another device. What had been confirmed was undone.",
    wz_lost_refused: "This step could not be saved: the « Fill » changed on another device.",
    wz_lost_help: "Nothing was saved from this window. Tap « Start again » to open a new « Fill » and count the bread again.",
    wz_restart: "Start again",
    wz_open_elsewhere: "A « Fill » is already in progress on this machine: started on {h} {by}, at step {n}.",
    wz_open_elsewhere_help: "If it is yours or a colleague's who is working on it, continue it. If nobody is working on it, cancel it and start again: what had been confirmed will be undone.",
    wz_continue: "Continue this Fill",
    wz_cancel_restart: "Cancel and start again",
    wz_restart_confirm: "Press again to cancel this Fill",
    wz_by_user: "by {u} ({d})",
    wz_by_device: "on another device ({d})",
    wz_by_unknown: "on another device",
    wz_sync_ok: "Saved on the server: the other devices can see it.",
    wz_sync_wait: "Not sent to the server yet. Keep the app open with network until this message says « Saved »."
  });
})();
