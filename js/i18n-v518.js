// ============================================================
// BROODAUTOMATE v5.18 — Textes : « Ajouter un boîtier » avec la machine saisie à la main, contrôle du modèle de machine (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    bx_new_machine: "Nouvelle machine (je la saisis)",
    bx_m_street: "Nom ou adresse de la machine", bx_m_plate: "N° de plaque (facultatif)",
    bx_m_note: "La machine est créée en même temps que le boîtier. Le n° de plaque est facultatif : tu peux le saisir plus tard dans Technique → Machines. Pour un 2e boîtier sur une machine déjà créée, choisis-la dans la liste.",
    bx_err_machine: "Donne le nom ou l'adresse de la machine, et sa ville.",
    evd_BOX_WRONG: "Le boîtier envoie le relevé d'une autre machine (« {msg} »), qui n'est pas celle choisie pour ce boîtier : rien n'a été compté. Choisis la bonne machine dans la page Technique → Boîtiers 4G."
  });
  Object.assign(D.nl, {
    bx_new_machine: "Nieuwe automaat (ik vul hem in)",
    bx_m_street: "Naam of adres van de automaat", bx_m_plate: "Plaatnummer (optioneel)",
    bx_m_note: "De automaat wordt samen met de module aangemaakt. Het plaatnummer is optioneel: je kunt het later invullen bij Techniek → Automaten. Voor een 2e module op een bestaande automaat kies je die in de lijst.",
    bx_err_machine: "Geef de naam of het adres van de automaat en de stad.",
    evd_BOX_WRONG: "De module stuurt de uitlezing van een andere automaat (\"{msg}\"), die niet gekozen is voor deze module: er is niets geteld. Kies de juiste automaat op de pagina Techniek → 4G-modules."
  });
  Object.assign(D.en, {
    bx_new_machine: "New machine (I type it in)",
    bx_m_street: "Machine name or address", bx_m_plate: "Plate number (optional)",
    bx_m_note: "The machine is created together with the box. The plate number is optional: you can enter it later in Technical → Machines. For a 2nd box on an existing machine, pick it in the list.",
    bx_err_machine: "Give the machine's name or address, and its city.",
    evd_BOX_WRONG: "The box sends the reading of another machine (\"{msg}\"), which is not the one chosen for this box: nothing was counted. Choose the right machine on the Technical page → 4G boxes."
  });
})();
