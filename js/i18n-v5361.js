// ============================================================
// BROODAUTOMATE v5.36.1 — Textes (FR / NL / EN) : « 📅 Changer la date » d'un pain depuis Stock en tableau
// (admin et opérateur ; chaque changement est noté dans l'Historique) + « lot 2/2 » sur les cartes des lots (Détails machine, téléphone)
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    dt_btn_tip: "Changer la date de livraison du pain",
    dt_title: "Changer la date",
    dt_help: "Corrige ici une date de livraison fausse. Chaque changement est noté dans l'Historique.",
    dt_err_bad: "Date incomplète : choisis le jour et l'heure.",
    dt_err_future: "La date ne peut pas être dans le futur.",
    dt_done: "[Date enregistrée|{n} dates enregistrées] — sélection {s}",
    lot_k: "lot {i}/{n}"
  });

  Object.assign(D.nl, {
    dt_btn_tip: "Leverdatum van het brood wijzigen",
    dt_title: "Datum wijzigen",
    dt_help: "Verbeter hier een verkeerde leverdatum. Elke wijziging wordt in de Historiek genoteerd.",
    dt_err_bad: "Onvolledige datum: kies de dag en het uur.",
    dt_err_future: "De datum mag niet in de toekomst liggen.",
    dt_done: "[Datum opgeslagen|{n} datums opgeslagen] — selectie {s}",
    lot_k: "lot {i}/{n}"
  });

  Object.assign(D.en, {
    dt_btn_tip: "Change the bread's delivery date",
    dt_title: "Change the date",
    dt_help: "Fix a wrong delivery date here. Every change is recorded in the History.",
    dt_err_bad: "Incomplete date: choose the day and the time.",
    dt_err_future: "The date cannot be in the future.",
    dt_done: "[Date saved|{n} dates saved] — selection {s}",
    lot_k: "batch {i}/{n}"
  });
})();
