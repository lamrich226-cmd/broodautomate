// ============================================================
// BROODAUTOMATE v5.35 — « Placements » : conseils pour déplacer le vieux pain vers la meilleure sélection du même type
// Étape FACULTATIVE de « Remplir » (appli opérateur), entre le retrait et le chargement.
// Principe : pour chaque pain resté depuis un moment (24 h par défaut) dans une sélection, on cherche une sélection du MÊME
// type de pain qui vend mieux, avec de la place. Le classement vient du journal (ventes par sélection, 28 derniers jours).
// Rien n'est jamais déplacé tout seul : l'opérateur touche « Fait » (il a déplacé le pain) ou ignore.
// Logique pure : pas d'écran ici (voir operateur.js).
// ============================================================
(function () {
  const M = BA.Model;
  const H = 3600000, DAY = 86400000;
  const FENETRE_JOURS = 28;     // ventes comptées sur les 28 derniers jours
  const AGE_PAR_DEFAUT = 24;    // un pain de plus de 24 h est candidat au déplacement (réglable : settings.placeHours)

  // Ventes par sélection d'une machine (journal « sale »), et nombre de jours d'historique disponibles
  function ventes(s, m) {
    const debut = s.now - FENETRE_JOURS * DAY;
    const par = {}; let premier = null, total = 0;
    for (const e of (s.journal || [])) {
      if (e.k !== "sale" || e.n !== m.num) continue;
      const q = Number(e.q) || 1, t = Number(e.t) || 0;
      if (premier == null || t < premier) premier = t;
      if (t < debut) continue;
      par[e.s] = (par[e.s] || 0) + q; total += q;
    }
    const jours = premier == null ? 0 : Math.max(0, (s.now - Math.max(premier, debut)) / DAY);
    return { par, total, jours };
  }

  // Qualité de l'historique : « none » (rien), « low » (moins de 7 jours ou 50 ventes), « mid » (moins de 21 jours), « good »
  function niveau(v) {
    if (!v.total) return "none";
    if (v.jours < 7 || v.total < 50) return "low";
    if (v.jours < 21) return "mid";
    return "good";
  }

  // Conseils pour une machine : [{ key, from, to, lotId, qty, type, date, age }], triés du plus vieux au plus récent
  function conseils(s, m) {
    const v = ventes(s, m), lvl = niveau(v);
    const heures = Number(s.settings && s.settings.placeHours) > 0 ? Number(s.settings.placeHours) : AGE_PAR_DEFAUT;
    const libre = {};                                   // place restante par sélection, en tenant compte des conseils déjà faits
    m.sels.forEach(x => { libre[x.n] = Math.max(0, x.cap - M.qty(x)); });
    const lots = [];
    m.sels.forEach(x => x.lots.forEach(l => {
      if (!(l.qty > 0)) return;
      if (l.kept && M.isMandatory(s, l)) return;        // pain invalide : il se retire, il ne se déplace pas
      if (s.now - l.date < heures * H) return;
      lots.push({ sel: x, lot: l });
    }));
    lots.sort((a, b) => a.lot.date - b.lot.date);
    const recos = [];
    for (const { sel, lot } of lots) {
      const mien = v.par[sel.n] || 0;
      const cands = m.sels.filter(y => y.n !== sel.n && y.type === sel.type && libre[y.n] >= 1 && (v.par[y.n] || 0) > mien);
      if (!cands.length) continue;
      cands.sort((a, b) => ((v.par[b.n] || 0) - (v.par[a.n] || 0)) || (libre[b.n] - libre[a.n]) || (a.n - b.n));
      const to = cands[0], qty = Math.min(lot.qty, libre[to.n]);
      libre[to.n] -= qty;
      recos.push({ key: sel.n + ">" + to.n + "@" + Math.floor(lot.date / M.MIN) + (lot.kept ? "k" : ""), from: sel.n, to: to.n, lotId: lot.id, qty,
        type: sel.type, date: lot.date, age: s.now - lot.date, ventesFrom: mien, ventesTo: v.par[to.n] || 0 });
    }
    return { recos, niveau: lvl, jours: Math.floor(v.jours), ventes: v.total };
  }

  BA.Placements = { conseils, ventes, niveau, FENETRE_JOURS, AGE_PAR_DEFAUT };
})();
