// ============================================================
// BROODAUTOMATE v5.35.0 — « Conseil de rupture » : un type de pain régulièrement épuisé tôt dans la journée
// Principe : on regarde les alertes « Plus de pain X » (TYPE_EMPTY) des 14 derniers jours pour une machine. Si un type de pain
// est épuisé sur au moins 3 jours différents, et en général AVANT 18 h (heure du milieu des ruptures), on conseille de charger
// plus de ce pain : au maximum les sélections de ce type, ou ajouter une sélection si elles sont déjà pleines.
// Logique pure (pas d'écran) : l'appli opérateur (Chargement) et l'admin (plan de commande) l'affichent.
// Limite connue : les alertes sont gardées tant qu'il y en a moins de 400 ; un conseil ne se base donc que sur les ruptures retrouvées.
// ============================================================
(function () {
  const M = BA.Model;
  const H = 3600000, DAY = 86400000;
  const FENETRE_JOURS = 14;     // ruptures comptées sur les 14 derniers jours
  const MIN_JOURS = 3;          // au moins 3 jours différents avec une rupture (réglable : settings.ruptureMinDays)
  const AVANT_HEURE = 18;       // « tôt » = épuisé avant 18 h (réglable : settings.ruptureBefore)
  const HISTORIQUE_COURT = 7;   // moins de 7 jours d'historique : conseil à prendre comme une indication

  function mediane(a) {
    const b = a.slice().sort((x, y) => x - y), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }

  // Conseils pour une machine : { items: [{ type, jours, heure, sels, libre }], court, histJours }
  //   jours : nombre de jours (sur 14) avec une rupture de ce type ; heure : heure habituelle de la rupture (0-23)
  //   sels : sélections de ce type ; libre : places libres maintenant dans ces sélections
  function conseils(s, m) {
    const set = s.settings || {};
    const minJ = Number(set.ruptureMinDays) >= 1 ? Math.floor(Number(set.ruptureMinDays)) : MIN_JOURS;
    const avant = Number(set.ruptureBefore) > 0 ? Number(set.ruptureBefore) : AVANT_HEURE;
    const dayH = set.dayHour != null && Number(set.dayHour) >= 0 ? Number(set.dayHour) : 4;     // la « journée de vente » commence à cette heure
    const debut = s.now - FENETRE_JOURS * DAY;
    const par = {};
    (s.events || []).forEach(e => {
      if (e.num !== m.num || e.code !== "TYPE_EMPTY" || !(e.t >= debut) || !e.data || !e.data.type) return;
      const type = e.data.type;
      if (!m.sels.some(x => x.type === type)) return;
      const d = new Date(e.t);
      const minutes = ((d.getHours() - dayH + 24) % 24) * 60 + d.getMinutes();               // minutes depuis le début de la journée de vente
      const r = par[type] || (par[type] = { jours: new Set(), minutes: [] });
      r.jours.add(M.dayKey(e.t - dayH * H)); r.minutes.push(minutes);
    });
    const seuil = ((avant - dayH + 24) % 24) * 60;                                          // « avant 18 h » en minutes depuis le début de la journée de vente
    const items = [];
    Object.keys(par).forEach(type => {
      const r = par[type]; if (r.jours.size < minJ) return;
      const med = mediane(r.minutes);
      if (med >= seuil) return;                                                              // épuisé plutôt le soir : pas un problème
      const sels = m.sels.filter(x => x.type === type);
      items.push({ type, jours: r.jours.size, heure: Math.round((med + dayH * 60) / 60) % 24, sels: sels.map(x => x.n),
        libre: sels.reduce((a, x) => a + Math.max(0, x.cap - M.qty(x)), 0) });
    });
    items.sort((a, b) => b.jours - a.jours || (a.type < b.type ? -1 : 1));
    let premier = null;
    (s.journal || []).forEach(e => { if (e.n === m.num && (premier == null || e.t < premier)) premier = e.t; });
    const histJours = premier == null ? 0 : Math.floor((s.now - premier) / DAY);
    return { items, court: histJours < HISTORIQUE_COURT, histJours, fenetre: FENETRE_JOURS };
  }

  BA.Ruptures = { conseils, FENETRE_JOURS, MIN_JOURS, AVANT_HEURE };
})();
