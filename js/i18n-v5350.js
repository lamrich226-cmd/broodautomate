// ============================================================
// BROODAUTOMATE v5.35.0 — Textes (FR / NL / EN) : étape facultative « Placements » de Remplir (appli opérateur)
// Le chargement devient la 4e étape ; l'étape 3 (Placements) est toujours facultative.
// ============================================================
(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    step_place: "Placements",
    step3_title: "Étape 4 — Chargement",
    plc_title: "Étape 3 — Placements (facultatif)",
    plc_help: "Conseil : déplacer le vieux pain vers la sélection du même pain qui se vend le mieux. Tu peux tout ignorer et passer au chargement.",
    plc_low: "Historique de ventes très court sur cette machine (environ {d} [d:jour|jours]) : ces conseils sont indicatifs et pas vraiment nécessaires pour l'instant. Ils deviendront fiables quand l'historique sera plus long.",
    plc_mid: "Historique de ventes encore court ({d} jours) : à prendre comme une indication.",
    plc_move: "Déplacer {q} [q:pain|pains] de la sélection {a} vers la sélection {b}",
    plc_since: "Livré le {d} ({age})",
    plc_why: "La sélection {b} se vend mieux que la sélection {a}.",
    plc_done_btn: "Fait, j'ai déplacé",
    plc_skip_btn: "Ignorer",
    plc_next: "Continuer vers le chargement",
    plc_none_left: "Plus rien à déplacer.",
    plc_moved: "{q} [q:pain déplacé|pains déplacés] : sélection {a} → {b}",
    plc_err: "Impossible de déplacer ce pain : "
  });

  Object.assign(D.nl, {
    step_place: "Verplaatsen",
    step3_title: "Stap 4 — Laden",
    plc_title: "Stap 3 — Verplaatsen (optioneel)",
    plc_help: "Advies: verplaats het oude brood naar de selectie van hetzelfde brood die het best verkoopt. Je mag alles negeren en doorgaan naar het laden.",
    plc_low: "Zeer korte verkoopgeschiedenis voor deze automaat (ongeveer {d} [d:dag|dagen]): deze adviezen zijn indicatief en voorlopig niet echt nodig. Ze worden betrouwbaar als de geschiedenis langer is.",
    plc_mid: "Verkoopgeschiedenis nog kort ({d} dagen): neem het als indicatie.",
    plc_move: "{q} [q:brood|broden] verplaatsen van selectie {a} naar selectie {b}",
    plc_since: "Geleverd op {d} ({age})",
    plc_why: "Selectie {b} verkoopt beter dan selectie {a}.",
    plc_done_btn: "Klaar, ik heb het verplaatst",
    plc_skip_btn: "Negeren",
    plc_next: "Verder naar het laden",
    plc_none_left: "Niets meer te verplaatsen.",
    plc_moved: "{q} [q:brood|broden] verplaatst: selectie {a} → {b}",
    plc_err: "Dit brood kan niet verplaatst worden: "
  });

  Object.assign(D.en, {
    step_place: "Placements",
    step3_title: "Step 4 — Loading",
    plc_title: "Step 3 — Placements (optional)",
    plc_help: "Tip: move the old bread to the selection of the same bread that sells best. You can ignore everything and go on to loading.",
    plc_low: "Very short sales history for this machine (about {d} [d:day|days]): these tips are only indicative and not really needed for now. They become reliable once the history is longer.",
    plc_mid: "Sales history is still short ({d} days): take it as an indication.",
    plc_move: "Move {q} [q:loaf|loaves] from selection {a} to selection {b}",
    plc_since: "Delivered {d} ({age})",
    plc_why: "Selection {b} sells better than selection {a}.",
    plc_done_btn: "Done, I moved it",
    plc_skip_btn: "Ignore",
    plc_next: "Continue to loading",
    plc_none_left: "Nothing left to move.",
    plc_moved: "{q} [q:loaf|loaves] moved: selection {a} → {b}",
    plc_err: "This bread cannot be moved: "
  });
})();
