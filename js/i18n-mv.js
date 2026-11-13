// ============================================================
// BROODAUTOMATE v5.24 (design-test) — Textes de la « Vue machine » (tiroirs, prix, heures et date de chaque pain,
// places « Non utilisé »), de « Remplir » en touchant les tiroirs, et du mode démo (FR / NL / EN)
// ============================================================
(function () {
  const D = BA.I18n.dicts;
  Object.assign(D.fr, {
    mv_title: "Vue de la machine", mv_floor: "Étage {n}", mv_empty: "Vide", mv_remove: "{n} à retirer", mv_must: "{n} obligatoire", mv_kept: "{n} gardé",
    mv_note: "Chaque case est un tiroir : son numéro, le pain et son prix, puis sous chaque pain ses heures et sa date de livraison. Touchez un tiroir pour le détail ou pour le modifier, ou « Non utilisé » pour ajouter une sélection.",
    mv_pick: "Touchez un tiroir pour voir son détail.", mv_sel: "Sélection {n}", mv_inside: "Dans le tiroir", mv_lot: "Livraison du {d}", mv_ago: "{h} h", mv_n: "× {n}",
    mv_legend_old: "à retirer (≥ {h} h)", mv_legend_empty: "place vide", mv_lot_old: "à retirer", mv_lot_kept: "gardé une fois", mv_lot_must: "obligatoire",
    mv_demo: "Mode démo : 20 machines inventées. Rien n'est envoyé à Supabase, tout reste dans cette page.",
    mv_unused: "Non utilisé", mv_add_short: "＋ Ajouter", mv_add_title: "Ajouter la sélection {n}",
    mv_add_help: "Choisissez le pain, la capacité (nombre de pains) et le prix. Le numéro peut être changé.",
    mv_edit_title: "Modifier la sélection", mv_save: "Enregistrer", mv_price_eur: "Prix (€)",
    mv_price_note: "Ce prix sert aux calculs de l'appli. Il ne change pas le prix dans la machine (commande 03 au clavier).",
    mv_lg_kept: "gardé une fois", mv_lg_miss: "compté en moins (sort du stock)", mv_lg_extra: "compté en plus", mv_lg_gone: "à retirer",
    mv_lg_keep: "reste (gardé une fois)", mv_lg_must: "à retirer obligatoirement", mv_lg_new: "nouveau pain",
    mv_vue_machine: "Machine", mv_vue_table: "Tableau", mv_vue_aria: "Affichage",
    mv_inv_help: "Comptez les pains de chaque tiroir. Si un nombre est faux, touchez le tiroir et corrigez-le avec − et +.",
    mv_inv_less: "{n} [pain|pains] en moins : [le plus ancien sort|les plus anciens sortent] du stock.", mv_inv_more: "{n} [pain|pains] en plus : [ajouté|ajoutés] à la dernière livraison.",
    mv_inv_reset_one: "C'est juste", mv_inv_changed: "{n} [tiroir corrigé|tiroirs corrigés]", mv_reset: "Annuler mes changements",
    mv_minus: "Un de moins", mv_plus: "Un de plus",
    mv_rm_help: "Les pains à retirer sont marqués ✖. Touchez un tiroir pour les garder une fois (s'ils sont encore bons) ou changer le nombre.",
    mv_rm_none_sel: "Rien à retirer dans ce tiroir.", mv_good: "bon", mv_out_n: "{n} [retiré|retirés]", mv_rm_out: "Retirés", mv_rm_all: "Tout retirer",
    mv_rm_sum: "À retirer : {n} · gardés une fois : {k}",
    mv_ld_help: "Touchez un tiroir et choisissez avec − et + combien de pains vous mettez.",
    mv_ld_free: "Place libre", mv_ld_add: "À charger", mv_ld_date: "Livraison", mv_ld_full: "Remplir à fond", mv_ld_all_full: "Tout remplir à fond",
    mv_full: "plein", mv_full_sel: "Ce tiroir est plein.", mv_after: "La machine maintenant"
  });
  Object.assign(D.nl, {
    mv_title: "Overzicht van de automaat", mv_floor: "Rij {n}", mv_empty: "Leeg", mv_remove: "{n} te verwijderen", mv_must: "{n} verplicht", mv_kept: "{n} bewaard",
    mv_note: "Elk vak is een lade: nummer, brood en prijs, en onder elk brood de uren en de leverdatum. Tik op een lade voor de details of om ze te wijzigen, of op « Niet gebruikt » om een keuze toe te voegen.",
    mv_pick: "Tik op een lade om de details te zien.", mv_sel: "Keuze {n}", mv_inside: "In de lade", mv_lot: "Levering van {d}", mv_ago: "{h} u", mv_n: "× {n}",
    mv_legend_old: "te verwijderen (≥ {h} u)", mv_legend_empty: "lege plaats", mv_lot_old: "te verwijderen", mv_lot_kept: "eenmaal bewaard", mv_lot_must: "verplicht",
    mv_demo: "Demomodus: 20 verzonnen automaten. Er wordt niets naar Supabase gestuurd, alles blijft op deze pagina.",
    mv_unused: "Niet gebruikt", mv_add_short: "＋ Toevoegen", mv_add_title: "Keuze {n} toevoegen",
    mv_add_help: "Kies het brood, de capaciteit (aantal broden) en de prijs. U kunt het nummer wijzigen.",
    mv_edit_title: "Keuze wijzigen", mv_save: "Opslaan", mv_price_eur: "Prijs (€)",
    mv_price_note: "Deze prijs dient voor de berekeningen van de app. Hij verandert de prijs in de automaat niet (commando 03 op het toetsenbord).",
    mv_lg_kept: "eenmaal bewaard", mv_lg_miss: "minder geteld (gaat uit de voorraad)", mv_lg_extra: "meer geteld", mv_lg_gone: "te verwijderen",
    mv_lg_keep: "blijft (eenmaal bewaard)", mv_lg_must: "verplicht te verwijderen", mv_lg_new: "nieuw brood",
    mv_vue_machine: "Automaat", mv_vue_table: "Tabel", mv_vue_aria: "Weergave",
    mv_inv_help: "Tel de broden in elke lade. Klopt een aantal niet? Tik op de lade en pas het aan met − en +.",
    mv_inv_less: "{n} [brood|broden] minder: [het oudste gaat|de oudste gaan] uit de voorraad.", mv_inv_more: "{n} [brood|broden] meer: toegevoegd aan de laatste levering.",
    mv_inv_reset_one: "Klopt", mv_inv_changed: "{n} [lade aangepast|laden aangepast]", mv_reset: "Mijn wijzigingen annuleren",
    mv_minus: "Eén minder", mv_plus: "Eén meer",
    mv_rm_help: "De broden die weg moeten, zijn gemarkeerd met ✖. Tik op een lade om ze één keer te houden (als ze nog goed zijn) of om het aantal te wijzigen.",
    mv_rm_none_sel: "Niets te verwijderen in deze lade.", mv_good: "goed", mv_out_n: "{n} verwijderd", mv_rm_out: "Verwijderd", mv_rm_all: "Alles verwijderen",
    mv_rm_sum: "Te verwijderen: {n} · eenmaal bewaard: {k}",
    mv_ld_help: "Tik op een lade en kies met − en + hoeveel broden u erin legt.",
    mv_ld_free: "Vrije plaats", mv_ld_add: "In te laden", mv_ld_date: "Levering", mv_ld_full: "Helemaal vullen", mv_ld_all_full: "Alles helemaal vullen",
    mv_full: "vol", mv_full_sel: "Deze lade is vol.", mv_after: "De automaat nu"
  });
  Object.assign(D.en, {
    mv_title: "Machine view", mv_floor: "Shelf {n}", mv_empty: "Empty", mv_remove: "{n} to remove", mv_must: "{n} mandatory", mv_kept: "{n} kept",
    mv_note: "Each box is a drawer: its number, bread and price, then each bread's hours and delivery date. Tap a drawer for details or to edit it, or “Not used” to add a selection.",
    mv_pick: "Tap a drawer to see its details.", mv_sel: "Selection {n}", mv_inside: "In the drawer", mv_lot: "Delivery of {d}", mv_ago: "{h} h", mv_n: "× {n}",
    mv_legend_old: "to remove (≥ {h} h)", mv_legend_empty: "empty slot", mv_lot_old: "to remove", mv_lot_kept: "kept once", mv_lot_must: "mandatory",
    mv_demo: "Demo mode: 20 invented machines. Nothing is sent to Supabase, everything stays in this page.",
    mv_unused: "Not used", mv_add_short: "＋ Add", mv_add_title: "Add selection {n}",
    mv_add_help: "Choose the bread, the capacity (number of breads) and the price. You can change the number.",
    mv_edit_title: "Edit the selection", mv_save: "Save", mv_price_eur: "Price (€)",
    mv_price_note: "This price is used for the app's calculations. It does not change the price in the machine (command 03 on the keypad).",
    mv_lg_kept: "kept once", mv_lg_miss: "counted less (leaves the stock)", mv_lg_extra: "counted more", mv_lg_gone: "to remove",
    mv_lg_keep: "stays (kept once)", mv_lg_must: "must be removed", mv_lg_new: "new bread",
    mv_vue_machine: "Machine", mv_vue_table: "Table", mv_vue_aria: "View",
    mv_inv_help: "Count the breads in each drawer. If a number is wrong, tap the drawer and fix it with − and +.",
    mv_inv_less: "{n} [bread|breads] less: the oldest [leaves|leave] the stock.", mv_inv_more: "{n} [bread|breads] more: added to the last delivery.",
    mv_inv_reset_one: "It's right", mv_inv_changed: "{n} [drawer|drawers] corrected", mv_reset: "Cancel my changes",
    mv_minus: "One less", mv_plus: "One more",
    mv_rm_help: "Breads to remove are marked ✖. Tap a drawer to keep them once (if still good) or to change the number.",
    mv_rm_none_sel: "Nothing to remove in this drawer.", mv_good: "good", mv_out_n: "{n} removed", mv_rm_out: "Removed", mv_rm_all: "Remove all",
    mv_rm_sum: "To remove: {n} · kept once: {k}",
    mv_ld_help: "Tap a drawer and choose with − and + how many breads you put in.",
    mv_ld_free: "Free space", mv_ld_add: "To load", mv_ld_date: "Delivery", mv_ld_full: "Fill up", mv_ld_all_full: "Fill everything up",
    mv_full: "full", mv_full_sel: "This drawer is full.", mv_after: "The machine now"
  });
})();
