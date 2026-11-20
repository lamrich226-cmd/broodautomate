// ============================================================
// BROODAUTOMATE v5.33.1 — Textes (FR / NL / EN) : prix et sélections repris de la machine
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    hist_price_w_m: "prix réglé dans la machine",
    hist_price_w_v: "prix payé à la dernière vente",
    ev_SELS_FROM_MACHINE: "{total} sélections ajoutées d'après la machine",
    evd_SELS_FROM_MACHINE: "À la première connexion, la machine a annoncé ses sélections ({msg}). Elles ont été ajoutées avec le type de pain et la capacité les plus courants : vérifie-les dans Détails machine. Leur stock reste à 0 jusqu'au premier « Remplir »."
  });

  Object.assign(D.nl, {
    hist_price_w_m: "prijs ingesteld in de automaat",
    hist_price_w_v: "prijs betaald bij de laatste verkoop",
    ev_SELS_FROM_MACHINE: "{total} selecties toegevoegd volgens de automaat",
    evd_SELS_FROM_MACHINE: "Bij de eerste verbinding meldde de automaat zijn selecties ({msg}). Ze zijn toegevoegd met het meest gebruikte broodtype en de meest gebruikte capaciteit: controleer ze in Automaatdetails. Hun voorraad blijft op 0 tot de eerste « Vullen »."
  });

  Object.assign(D.en, {
    hist_price_w_m: "price set in the machine",
    hist_price_w_v: "price paid at the last sale",
    ev_SELS_FROM_MACHINE: "{total} selections added from the machine",
    evd_SELS_FROM_MACHINE: "At the first connection, the machine announced its selections ({msg}). They were added with the most common bread type and capacity: check them in Machine details. Their stock stays at 0 until the first “Fill”."
  });
})();
