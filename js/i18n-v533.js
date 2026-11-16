// ============================================================
// BROODAUTOMATE v5.33 — Textes (FR / NL / EN) : heure de récupération du pain (Paramètres)
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    set_deliv_hour: "Heure de récupération du pain",
    set_deliv_hour_help: "Date proposée pour le pain chargé dans « Remplir » : la dernière fois qu'il était cette heure-là (19 h : un chargement à 3 h du matin est daté de la veille à 19 h). L'opérateur peut toujours la changer."
  });

  Object.assign(D.nl, {
    set_deliv_hour: "Uur waarop het brood wordt opgehaald",
    set_deliv_hour_help: "Voorgestelde datum voor het brood dat bij « Vullen » wordt geladen: het laatste moment dat het dit uur was (19 u: laden om 3 u 's nachts krijgt de datum van de vorige dag 19 u). De operator kan ze altijd wijzigen."
  });

  Object.assign(D.en, {
    set_deliv_hour: "Bread pick-up time",
    set_deliv_hour_help: "Date suggested for bread loaded in “Fill”: the last time it was this hour (7 pm: loading at 3 am is dated the previous day at 7 pm). The operator can always change it."
  });
})();
