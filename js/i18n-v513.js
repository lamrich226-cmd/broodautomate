// ============================================================
// BROODAUTOMATE v5.13 — Textes : porte ouverte en direct, total de la machine et carte / espèces,
// consommation (plafonds Supabase, données des cartes SIM), copie des données (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    tq_j_dlg_lines: "Texte reçu, ligne par ligne, avec sa traduction", tq_j_dlg_lines_note: "À gauche : la ligne exactement comme la machine l'a envoyée. À droite : ce qu'elle veut dire.", tq_j_dlg_l_raw: "Ligne reçue", tq_j_dlg_l_txt: "Ce que ça veut dire",
    bx_porte_notif: "Me prévenir tout de suite quand une porte s'ouvre", bx_porte_notif_note: "Éteint par défaut : sinon chaque passage de l'opérateur ferait sonner les téléphones. Dans tous les cas, tu es prévenu si une porte reste ouverte plus de 15 min.", bx_porte_notif_on: "Notification immédiate activée", bx_porte_notif_off: "Notification immédiate désactivée",
    tq_c_title: "Consommation (offre gratuite Supabase)",
    tq_c_dl: "Téléchargé par cet appareil", tq_c_dl_v: "{v} ce mois ({n} requêtes) · ≈ {p} sur 30 jours · plafond : 5 Go par mois pour TOUS les appareils",
    tq_c_db: "Base de données", tq_c_db_v: "{v} sur 500 Mo ({p} %)", tq_c_warn: "plus de 80 % : prévenir / copier les données",
    tq_c_missing: "Commande SQL v5.13 pas encore faite",
    tq_c_rel: "Relevés gardés (30 jours)", tq_c_rel_v: "{n} relevés · {v}",
    tq_c_total: "total {v}",
    tq_c_copy_title: "Copie des données", tq_c_copy_txt: "Télécharge un fichier avec toutes tes données (machines, historique des relevés). Garde-le dans ton Google Drive : c'est ta copie de secours.",
    tq_c_copy: "Télécharger une copie", tq_c_copied: "Copie téléchargée",
    tq_c_purge: "Effacer les relevés bruts de plus de 30 jours", tq_c_purge_ask: "Effacer les relevés bruts de plus de 30 jours ? Les totaux et l'historique des ventes restent.", tq_c_purged: "Effacé",
    door_since: "depuis {d}",
    // total de la machine et carte / espèces
    tot_title: "Total depuis la mise en service",
    tot_sub: "{n} ventes · relevé du {d}",
    tot_wait: "En attente d'un relevé complet de la machine",
    pay_title: "Carte / espèces",
    pay_card: "💳 Carte", pay_cash: "💶 Espèces",
    pay_line: "{k} : {v} ({n} ventes)",
    pay_today: "Aujourd'hui : carte {c} · espèces {e}",
    pay_calc: "Espèces = total − carte (calculé). Le détail du jour apparaît à partir du 2e relevé.",
    pay_none: "La machine n'a pas envoyé la part payée par carte.",
    bx_det_tot: "Total de la machine",
    bx_det_tot_v: "{v} · {n} ventes (relevé du {d})",
    bx_det_tot_card: "dont carte : {c}"
  });

  Object.assign(D.nl, {
    tq_j_dlg_lines: "Ontvangen tekst, regel per regel, met vertaling", tq_j_dlg_lines_note: "Links: de regel precies zoals de automaat hem stuurde. Rechts: wat hij betekent (in het Frans).", tq_j_dlg_l_raw: "Ontvangen regel", tq_j_dlg_l_txt: "Betekenis",
    bx_porte_notif: "Meteen verwittigen wanneer een deur opengaat", bx_porte_notif_note: "Standaard uit: anders gaan de telefoons bij elk bezoek van de operator af. Je wordt in elk geval verwittigd als een deur langer dan 15 min openblijft.", bx_porte_notif_on: "Directe melding aan", bx_porte_notif_off: "Directe melding uit",
    tq_c_title: "Verbruik (gratis Supabase-abonnement)",
    tq_c_dl: "Gedownload door dit toestel", tq_c_dl_v: "{v} deze maand ({n} verzoeken) · ≈ {p} over 30 dagen · limiet: 5 GB per maand voor ALLE toestellen",
    tq_c_db: "Database", tq_c_db_v: "{v} van 500 MB ({p} %)", tq_c_warn: "meer dan 80 %: waarschuwen / gegevens kopiëren",
    tq_c_missing: "SQL-opdracht v5.13 nog niet uitgevoerd",
    tq_c_rel: "Bewaarde uitlezingen (30 dagen)", tq_c_rel_v: "{n} uitlezingen · {v}",
    tq_c_total: "totaal {v}",
    tq_c_copy_title: "Kopie van de gegevens", tq_c_copy_txt: "Download een bestand met al je gegevens (automaten, geschiedenis van de uitlezingen). Bewaar het in je Google Drive als reservekopie.",
    tq_c_copy: "Kopie downloaden", tq_c_copied: "Kopie gedownload",
    tq_c_purge: "Ruwe uitlezingen ouder dan 30 dagen wissen", tq_c_purge_ask: "Ruwe uitlezingen ouder dan 30 dagen wissen? Totalen en verkoopgeschiedenis blijven.", tq_c_purged: "Gewist",
    door_since: "sinds {d}",
    tot_title: "Totaal sinds ingebruikname",
    tot_sub: "{n} verkopen · uitlezing van {d}",
    tot_wait: "Wachten op een volledige uitlezing van de automaat",
    pay_title: "Kaart / contant",
    pay_card: "💳 Kaart", pay_cash: "💶 Contant",
    pay_line: "{k}: {v} ({n} verkopen)",
    pay_today: "Vandaag: kaart {c} · contant {e}",
    pay_calc: "Contant = totaal − kaart (berekend). De dagdetails verschijnen vanaf de 2e uitlezing.",
    pay_none: "De automaat heeft het kaartgedeelte niet doorgegeven.",
    bx_det_tot: "Totaal van de automaat",
    bx_det_tot_v: "{v} · {n} verkopen (uitlezing van {d})",
    bx_det_tot_card: "waarvan kaart: {c}"
  });

  Object.assign(D.en, {
    tq_j_dlg_lines: "Received text, line by line, with translation", tq_j_dlg_lines_note: "Left: the line exactly as the machine sent it. Right: what it means (in French).", tq_j_dlg_l_raw: "Received line", tq_j_dlg_l_txt: "Meaning",
    bx_porte_notif: "Notify me right away when a door opens", bx_porte_notif_note: "Off by default: otherwise every operator visit would ring the phones. In all cases you are warned when a door stays open for more than 15 min.", bx_porte_notif_on: "Instant notification on", bx_porte_notif_off: "Instant notification off",
    tq_c_title: "Usage (free Supabase plan)",
    tq_c_dl: "Downloaded by this device", tq_c_dl_v: "{v} this month ({n} requests) · ≈ {p} over 30 days · limit: 5 GB per month for ALL devices",
    tq_c_db: "Database", tq_c_db_v: "{v} of 500 MB ({p} %)", tq_c_warn: "over 80 %: warn / copy the data",
    tq_c_missing: "SQL command v5.13 not run yet",
    tq_c_rel: "Readings kept (30 days)", tq_c_rel_v: "{n} readings · {v}",
    tq_c_total: "total {v}",
    tq_c_copy_title: "Data copy", tq_c_copy_txt: "Downloads a file with all your data (machines, readings history). Keep it in your Google Drive as a backup.",
    tq_c_copy: "Download a copy", tq_c_copied: "Copy downloaded",
    tq_c_purge: "Delete raw readings older than 30 days", tq_c_purge_ask: "Delete raw readings older than 30 days? Totals and sales history stay.", tq_c_purged: "Deleted",
    door_since: "for {d}",
    tot_title: "Total since commissioning",
    tot_sub: "{n} sales · reading of {d}",
    tot_wait: "Waiting for a full reading of the machine",
    pay_title: "Card / cash",
    pay_card: "💳 Card", pay_cash: "💶 Cash",
    pay_line: "{k}: {v} ({n} sales)",
    pay_today: "Today: card {c} · cash {e}",
    pay_calc: "Cash = total − card (calculated). The daily split appears from the 2nd reading on.",
    pay_none: "The machine did not send the card share.",
    bx_det_tot: "Machine total",
    bx_det_tot_v: "{v} · {n} sales (reading of {d})",
    bx_det_tot_card: "of which card: {c}"
  });
})();
