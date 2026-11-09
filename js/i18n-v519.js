// ============================================================
// BROODAUTOMATE v5.19 — Textes : remplissage spontané (sans commande) à 0 par défaut (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    step3_help_free: "Remplissage sans commande : tout est à 0. Saisissez le nombre de pains que vous mettez dans chaque sélection, puis validez.",
    op_reduced_load: "Les quantités de la commande suivent les ventes prévues jusqu'au prochain passage (pas forcément à fond). Vous pouvez les changer."
  });
  Object.assign(D.nl, {
    step3_help_free: "Vullen zonder bestelling: alles staat op 0. Vul per selectie in hoeveel broden u erin legt en bevestig.",
    op_reduced_load: "De aantallen van de bestelling volgen de verwachte verkoop tot het volgende bezoek (niet per se volledig). U kunt ze wijzigen."
  });
  Object.assign(D.en, {
    step3_help_free: "Refill without an order: everything starts at 0. Enter how many loaves you put in each selection, then confirm.",
    op_reduced_load: "The order quantities follow the sales expected until the next visit (not necessarily full). You can change them."
  });
})();
