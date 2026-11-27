// ============================================================
// BROODAUTOMATE v5.36.0 — Textes (FR / NL / EN) : « Choisir mes notifications »
// Chaque appareil garde ou coupe : les ventes, les ruptures de pain, les pannes et alertes, la porte, le boîtier muet.
// (les ventes n'existent pas pour les comptes opérateur)
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    notif_none: "Aucune notification pour l'instant. Ventes, ruptures de pain, pannes, coupures, porte restée ouverte et boîtier muet arriveront ici.",
    notif_prefs: "Choisir mes notifications",
    notif_prefs_n: "({n} coupée(s))",
    notif_cat_vente: "Chaque vente",
    notif_cat_stock: "Rupture de pain (plus de pain gris, machine vide…)",
    notif_cat_alertes: "Pannes, coupures de courant et alertes de la machine",
    notif_cat_porte: "Porte ouverte",
    notif_cat_boitier: "Boîtier muet ou de nouveau en ligne",
    notif_prefs_hint: "Ce choix ne concerne que cet appareil : les autres gardent le leur.",
    notif_prefs_err: "Choix gardé sur cet appareil, mais pas encore enregistré sur le serveur : les notifications du téléphone ne le suivront pas pour l'instant."
  });

  Object.assign(D.nl, {
    notif_none: "Nog geen meldingen. Verkopen, broodtekorten, storingen, stroomonderbrekingen, open deuren en stille kastjes verschijnen hier.",
    notif_prefs: "Mijn meldingen kiezen",
    notif_prefs_n: "({n} uitgeschakeld)",
    notif_cat_vente: "Elke verkoop",
    notif_cat_stock: "Brood op (geen grijs brood meer, automaat leeg…)",
    notif_cat_alertes: "Storingen, stroomonderbrekingen en waarschuwingen van de automaat",
    notif_cat_porte: "Open deur",
    notif_cat_boitier: "Kastje stil of weer online",
    notif_prefs_hint: "Deze keuze geldt alleen voor dit toestel: de andere houden hun eigen keuze.",
    notif_prefs_err: "Keuze bewaard op dit toestel, maar nog niet opgeslagen op de server: de meldingen van de telefoon volgen ze voorlopig niet."
  });

  Object.assign(D.en, {
    notif_none: "No notifications yet. Sales, bread running out, faults, power cuts, doors left open and silent boxes will show up here.",
    notif_prefs: "Choose my notifications",
    notif_prefs_n: "({n} off)",
    notif_cat_vente: "Every sale",
    notif_cat_stock: "Bread running out (no more brown bread, machine empty…)",
    notif_cat_alertes: "Faults, power cuts and machine alerts",
    notif_cat_porte: "Door open",
    notif_cat_boitier: "Box silent or back online",
    notif_prefs_hint: "This only applies to this device: the others keep their own choice.",
    notif_prefs_err: "Choice kept on this device, but not saved on the server yet: phone notifications will not follow it for now."
  });
})();
