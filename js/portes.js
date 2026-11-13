// ============================================================
// BROODAUTOMATE v5.13 — Porte ouverte en direct : BA.Portes
//
// Le boîtier envoie « porte ouverte » à Supabase tout de suite (fonction ingest). Avant, l'appli ne s'en
// apercevait qu'au prochain tour de lecture des relevés (1 min), puis les autres appareils au tour suivant
// (1 min de plus) : 1 min 30 en moyenne.
// Maintenant : toutes les 15 s (écran visible) l'appli demande à Supabase la porte de chaque machine par la
// fonction ba_portes. La réponse est minuscule quand rien n'a changé ({"v": 123}), et la porte est appliquée
// à la machine tout de suite — sur le PC comme sur le téléphone de l'opérateur, même si personne n'a la page
// admin ouverte. Si la fonction n'existe pas encore dans Supabase (commande SQL v5.13), rien ne change :
// l'appli continue comme avant.
// ============================================================

window.BA = window.BA || {};

(function () {
  const CLOUD = () => !!(BA.DB && BA.DB.isReady && BA.DB.isReady());
  const FAST = 15000, SLOW = 60000;
  let v = 0;                    // « version » des portes déjà reçues (la plus récente heure de changement)
  let ok = null;                // null : pas encore essayé · true : la fonction répond · false : fonction absente
  let timer = null, busy = false, last = 0, open = new Map(), liste = [];      // open : id de la machine → heure d'ouverture (ms)

  const missing = e => !!e && (e.code === "PGRST202" || e.code === "42883" || /ba_portes|schema cache|does not exist|Could not find/i.test(e.message || ""));

  async function tick(force) {
    if (!CLOUD() || ok === false || busy || !BA.Store || !BA.Store.ready()) return;
    busy = true;
    try {
      const r = await BA.DB.raw().rpc("ba_portes", { vu: force ? 0 : v });
      if (r.error) { if (missing(r.error)) { ok = false; return; } throw new Error(r.error.message); }
      ok = true; last = Date.now();
      const j = r.data || {};
      if (Array.isArray(j.l)) {
        liste = j.l;
        open = new Map(liste.filter(p => p.o).map(p => [p.m, Date.parse(p.d) || Date.now()]));
        v = Number(j.v) || 0;
      }
      // À CHAQUE tour (même si rien n'a changé côté serveur) : la porte de l'appli doit suivre celle du serveur.
      // Une porte restée « ouverte » dans l'appli (ouverte par un relevé, jamais refermée) est ainsi corrigée toute seule.
      const s = BA.Store.get();
      if (s && liste.length && BA.Reel.portesPlan(s, liste).length) BA.Store.update(st => BA.Reel.portes(st, liste), false, { derived: true });
    } catch (e) {
      console.warn("Portes :", e.message || e);
    } finally { busy = false; }
  }

  function start() {
    if (timer || !CLOUD()) return;
    setTimeout(() => tick(true), 1200);
    const loop = () => { if (!document.hidden || Date.now() - last > SLOW) tick(false); };
    timer = setInterval(loop, FAST);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - last > 3000) tick(false); });
  }

  BA.Portes = {
    start, tick,
    isOpen: id => open.has(id),                 // le serveur voit la porte de cette machine ouverte
    since: id => open.get(id) || 0,
    available: () => ok === true
  };
})();
