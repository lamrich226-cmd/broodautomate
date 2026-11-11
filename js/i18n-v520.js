// ============================================================
// BROODAUTOMATE v5.20 — Textes : boutons Claude / ChatGPT sous la préparation de commande (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    ia_title: "Demander conseil à une IA",
    ia_note2: "Un clic copie le résumé de ta commande (stock, 8 semaines de ventes, commandes passées, calcul du logiciel) et ouvre le site. L'IA conseille, tu décides : rien n'est commandé.",
    ia_noplan: "Prépare d'abord la commande ci-dessus : l'IA verra aussi le calcul du logiciel.",
    ia_how: "Dans Claude ou ChatGPT : colle le texte (Ctrl+V ; sur téléphone : appui long puis Coller), puis envoie.",
    ia_opened: "Résumé copié ({n} caractères). Dans {site} : colle-le (Ctrl+V) puis envoie.",
    ia_opened_manual: "Le navigateur a bloqué la copie. Reviens ici : le texte est affiché, copie-le (Ctrl+A puis Ctrl+C) et colle-le dans {site}."
  });
  Object.assign(D.nl, {
    ia_title: "Advies vragen aan een AI",
    ia_note2: "Een klik kopieert de samenvatting van je bestelling (voorraad, 8 weken verkoop, eerdere bestellingen, berekening van het programma) en opent de site. De AI adviseert, jij beslist: er wordt niets besteld.",
    ia_noplan: "Bereid eerst de bestelling hierboven voor: dan ziet de AI ook de berekening van het programma.",
    ia_how: "Plak de tekst in Claude of ChatGPT (Ctrl+V; op de telefoon: lang indrukken en Plakken) en verstuur.",
    ia_opened: "Samenvatting gekopieerd ({n} tekens). Plak ze in {site} (Ctrl+V) en verstuur.",
    ia_opened_manual: "De browser blokkeerde het kopiëren. Kom hier terug: de tekst staat hieronder, kopieer ze (Ctrl+A en dan Ctrl+C) en plak ze in {site}."
  });
  Object.assign(D.en, {
    ia_title: "Ask an AI for advice",
    ia_note2: "One click copies the summary of your order (stock, 8 weeks of sales, past orders, the software's calculation) and opens the site. The AI advises, you decide: nothing is ordered.",
    ia_noplan: "Prepare the order above first: the AI will then also see the software's calculation.",
    ia_how: "Paste the text into Claude or ChatGPT (Ctrl+V; on a phone: long-press then Paste) and send.",
    ia_opened: "Summary copied ({n} characters). Paste it into {site} (Ctrl+V) and send.",
    ia_opened_manual: "The browser blocked copying. Come back here: the text is shown below, copy it (Ctrl+A then Ctrl+C) and paste it into {site}."
  });
})();
