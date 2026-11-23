// ============================================================
// BROODAUTOMATE v5.34.3 — Textes (FR / NL / EN) : « Remplir » sécurisé (inventaire, chargement à 0, stock inconnu)
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    inv_suspect: "L'appli croit cette machine vide (ou presque). Ce n'est peut-être pas vrai : ouvrez la machine, comptez les pains et tapez le nombre pour chaque sélection.",
    inv_suspect_mv: "L'appli croit cette machine vide (ou presque). Ce n'est peut-être pas vrai : comptez les pains de chaque tiroir et corrigez avec + / −, puis validez.",
    btn_really_empty: "La machine est vraiment vide",
    btn_empty_confirm: "Appuyez encore pour confirmer : machine vide",
    ld_zero_ask: "Vous n'avez rien chargé ? La machine sera notée VIDE. Appuyez encore sur « Valider le chargement » pour confirmer, ou tapez ce que vous avez chargé.",
    ev_STOCK_UNKNOWN: "Stock inconnu : ventes alors que l'appli croit la machine vide",
    evd_STOCK_UNKNOWN: "Des pains ont été vendus alors que l'appli notait 0 pain. Le stock de l'appli n'est pas juste : faites un inventaire (Remplir → compter)."
  });

  Object.assign(D.nl, {
    inv_suspect: "De app denkt dat dit toestel leeg (of bijna leeg) is. Dat klopt misschien niet: open het toestel, tel de broden en typ het aantal voor elke selectie.",
    inv_suspect_mv: "De app denkt dat dit toestel leeg (of bijna leeg) is. Dat klopt misschien niet: tel de broden van elke lade, pas aan met + / − en bevestig.",
    btn_really_empty: "Het toestel is echt leeg",
    btn_empty_confirm: "Druk nog eens om te bevestigen: toestel leeg",
    ld_zero_ask: "Niets geladen? Het toestel wordt als LEEG genoteerd. Druk nogmaals op « Lading bevestigen » of typ wat u hebt geladen.",
    ev_STOCK_UNKNOWN: "Onbekende voorraad: verkopen terwijl de app het toestel leeg denkt",
    evd_STOCK_UNKNOWN: "Er zijn broden verkocht terwijl de app 0 broden noteerde. De voorraad in de app klopt niet: doe een inventaris (Vullen → tellen)."
  });

  Object.assign(D.en, {
    inv_suspect: "The app thinks this machine is empty (or nearly). That may not be true: open the machine, count the bread and type the number for each selection.",
    inv_suspect_mv: "The app thinks this machine is empty (or nearly). That may not be true: count the bread in each tray, adjust with + / −, then confirm.",
    btn_really_empty: "The machine is really empty",
    btn_empty_confirm: "Press again to confirm: machine empty",
    ld_zero_ask: "Nothing loaded? The machine will be recorded as EMPTY. Press « Confirm loading » again to confirm, or type what you loaded.",
    ev_STOCK_UNKNOWN: "Unknown stock: sales while the app thinks the machine is empty",
    evd_STOCK_UNKNOWN: "Bread was sold while the app recorded 0 bread. The app's stock is wrong: do an inventory (Fill → count)."
  });
})();
