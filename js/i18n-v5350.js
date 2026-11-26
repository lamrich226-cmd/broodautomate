// ============================================================
// BROODAUTOMATE v5.35.0 — Textes (FR / NL / EN) : étape facultative « Placements » de Remplir (appli opérateur)
// Le chargement devient la 4e étape ; l'étape 3 (Placements) est toujours facultative.
// Plus : « conseil de rupture » (clés rup_*), affiché dans le chargement (opérateur) et le plan de commande (admin).
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
    plc_err: "Impossible de déplacer ce pain : ",
    rup_window: "les {n} derniers jours",
    rup_title: "Conseil : pain souvent épuisé",
    rup_line: "{type} : épuisé {k} [k:jour|jours] sur {w}, en général vers {h} h.",
    rup_fill: "Charge ces sélections au maximum ({sels} : {n} [n:place libre|places libres]).",
    rup_full: "Ces sélections ({sels}) sont déjà pleines : pense à ajouter une sélection de ce pain.",
    rup_short: "Historique encore court : conseil indicatif. Tu peux l'ignorer.",
    rup_src: "D'après les alertes « Plus de pain … » de l'appli. Tu peux l'ignorer.",
    rup_admin_title: "Conseils de rupture : pain épuisé tôt",
    rup_admin_line: "#{n} {addr} : {type}, épuisé {k} [k:jour|jours] sur {w}, en général vers {h} h.",
    rup_admin_adv: "Conseil : chargement « à fond » pour cette machine, ou ajouter une sélection de ce pain.",
    rup_admin_on: "Cette machine est déjà chargée « à fond » : pense à ajouter une sélection de ce pain.",
    rup_btn_full: "Passer #{n} « à fond »"
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
    plc_err: "Dit brood kan niet verplaatst worden: ",
    rup_window: "de laatste {n} dagen",
    rup_title: "Advies: brood vaak uitverkocht",
    rup_line: "{type}: {k} [k:dag|dagen] uitverkocht in {w}, meestal rond {h} u.",
    rup_fill: "Laad deze selecties vol ({sels}: {n} [n:vrije plaats|vrije plaatsen]).",
    rup_full: "Deze selecties ({sels}) zijn al vol: overweeg een selectie van dit brood toe te voegen.",
    rup_short: "Geschiedenis nog kort: indicatief advies. Je mag het negeren.",
    rup_src: "Op basis van de meldingen « Geen … meer » van de app. Je mag het negeren.",
    rup_admin_title: "Adviezen over uitverkocht brood (te vroeg op)",
    rup_admin_line: "#{n} {addr}: {type}, {k} [k:dag|dagen] uitverkocht in {w}, meestal rond {h} u.",
    rup_admin_adv: "Advies: laad deze automaat « vol », of voeg een selectie van dit brood toe.",
    rup_admin_on: "Deze automaat wordt al « vol » geladen: overweeg een selectie van dit brood toe te voegen.",
    rup_btn_full: "#{n} « vol » laden"
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
    plc_err: "This bread cannot be moved: ",
    rup_window: "the last {n} days",
    rup_title: "Tip: bread often sold out",
    rup_line: "{type}: sold out {k} [k:day|days] in {w}, usually around {h}:00.",
    rup_fill: "Load these selections to the max ({sels}: {n} free [n:space|spaces]).",
    rup_full: "These selections ({sels}) are already full: consider adding a selection of this bread.",
    rup_short: "History is still short: indicative tip. You can ignore it.",
    rup_src: "Based on the app's « No … left » alerts. You can ignore it.",
    rup_admin_title: "Sell-out tips: bread gone early",
    rup_admin_line: "#{n} {addr}: {type}, sold out {k} [k:day|days] in {w}, usually around {h}:00.",
    rup_admin_adv: "Tip: load this machine « to the max », or add a selection of this bread.",
    rup_admin_on: "This machine is already loaded « to the max »: consider adding a selection of this bread.",
    rup_btn_full: "Load #{n} « to the max »"
  });
})();
