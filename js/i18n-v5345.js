// ============================================================
// BROODAUTOMATE v5.34.5 — Textes (FR / NL / EN) : alerte « plus de pain X » (rupture d'un type de pain dans une machine)
// Remplace l'alerte « Sélection N vide » : une sélection vide n'est pas un problème tant qu'une autre sélection
// du même pain en a encore. Les anciennes alertes « Sélection N vide » restent lisibles dans l'historique.
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    ev_TYPE_EMPTY: "Plus de {typel}",
    evd_TYPE_EMPTY: "[sn:La sélection {sels} est vide|Les sélections {sels} sont toutes vides] : la machine n'a plus de {typel} à vendre.",
    chip_types_out: "Plus de : {list}",
    st_low: "Pain en rupture"
  });

  Object.assign(D.nl, {
    ev_TYPE_EMPTY: "Geen {typel} meer",
    evd_TYPE_EMPTY: "[sn:Selectie {sels} is leeg|De selecties {sels} zijn allemaal leeg]: de automaat heeft geen {typel} meer te verkopen.",
    chip_types_out: "Uitverkocht: {list}",
    st_low: "Brood uitverkocht"
  });

  Object.assign(D.en, {
    ev_TYPE_EMPTY: "No {typel} left",
    evd_TYPE_EMPTY: "[sn:Selection {sels} is empty|Selections {sels} are all empty]: the machine has no {typel} left to sell.",
    chip_types_out: "Sold out: {list}",
    st_low: "Bread sold out"
  });
})();
