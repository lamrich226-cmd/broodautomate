// ============================================================
// BROODAUTOMATE v5.24 (design-test) — Textes de la « Vue machine » (tiroirs, heures et date de chaque pain) et du mode démo (FR / NL / EN)
// ============================================================
(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, {
    mv_title: "Vue de la machine", mv_floor: "Étage {n}", mv_empty: "Vide", mv_remove: "{n} à retirer", mv_must: "{n} obligatoire", mv_kept: "{n} gardé",
    mv_note: "Chaque case est un tiroir. Sous chaque pain : ses heures et sa date de livraison. Touche un tiroir pour le détail.",
    mv_pick: "Touche un tiroir pour voir son détail.", mv_sel: "Sélection {n}", mv_inside: "Dans le tiroir", mv_lot: "Livraison du {d}", mv_ago: "{h} h", mv_n: "× {n}",
    mv_legend_old: "à retirer (≥ {h} h)", mv_legend_empty: "place vide", mv_lot_old: "à retirer", mv_lot_kept: "gardé une fois", mv_lot_must: "obligatoire", mv_btn_rm: "Retirer", mv_btn_more: "Détail",
    mv_demo: "Mode démo : 20 machines inventées. Rien n'est envoyé à Supabase, tout reste dans cette page.", mv_floor_short: "Ét. {n}"
  });
  Object.assign(D.nl, {
    mv_title: "Overzicht van de automaat", mv_floor: "Rij {n}", mv_empty: "Leeg", mv_remove: "{n} te verwijderen", mv_must: "{n} verplicht", mv_kept: "{n} bewaard",
    mv_note: "Elk vak is een lade. Onder elk brood: zijn uren en leverdatum. Tik op een lade voor details.",
    mv_pick: "Tik op een lade om de details te zien.", mv_sel: "Keuze {n}", mv_inside: "In de lade", mv_lot: "Levering van {d}", mv_ago: "{h} u", mv_n: "× {n}",
    mv_legend_old: "te verwijderen (≥ {h} u)", mv_legend_empty: "lege plaats", mv_lot_old: "te verwijderen", mv_lot_kept: "eenmaal bewaard", mv_lot_must: "verplicht", mv_btn_rm: "Verwijderen", mv_btn_more: "Details",
    mv_demo: "Demomodus: 20 verzonnen automaten. Er wordt niets naar Supabase gestuurd, alles blijft op deze pagina.", mv_floor_short: "Rij {n}"
  });
  Object.assign(D.en, {
    mv_title: "Machine view", mv_floor: "Shelf {n}", mv_empty: "Empty", mv_remove: "{n} to remove", mv_must: "{n} mandatory", mv_kept: "{n} kept",
    mv_note: "Each box is a drawer. Under each bread: its hours and delivery date. Tap a drawer for details.",
    mv_pick: "Tap a drawer to see its details.", mv_sel: "Selection {n}", mv_inside: "In the drawer", mv_lot: "Delivery of {d}", mv_ago: "{h} h", mv_n: "× {n}",
    mv_legend_old: "to remove (≥ {h} h)", mv_legend_empty: "empty slot", mv_lot_old: "to remove", mv_lot_kept: "kept once", mv_lot_must: "mandatory", mv_btn_rm: "Remove", mv_btn_more: "Details",
    mv_demo: "Demo mode: 20 invented machines. Nothing is sent to Supabase, everything stays in this page.", mv_floor_short: "Shelf {n}"
  });
})();
