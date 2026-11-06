// ============================================================
// BROODAUTOMATE v5.13 — Consommation de cet appareil : BA.Conso
// Compte ce que CET appareil télécharge depuis Supabase (réponses des requêtes), mois par mois, dans le navigateur.
// Sert à surveiller le plafond « 5 Go de téléchargement par mois » de l'offre gratuite. Rien n'est envoyé nulle part.
// ============================================================

window.BA = window.BA || {};

(function () {
  const KEY = "ba_conso_app";
  const mois = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { data = {}; }
  let dirty = false;
  const save = () => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* rien */ } };
  setInterval(save, 10000);
  window.addEventListener("pagehide", save);

  function ajoute(octets, nbReq) {
    const m = mois(), r = data[m] || (data[m] = { o: 0, n: 0 });
    r.o += octets; r.n += nbReq; dirty = true;
    const old = Object.keys(data).sort().slice(0, -13); old.forEach(k => delete data[k]);        // 13 mois au plus
  }

  const base = (typeof BA_CONFIG !== "undefined" && BA_CONFIG.supabase && BA_CONFIG.supabase.url) || "";
  const f0 = window.fetch;
  if (f0 && base) {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const mine = url.indexOf(base) === 0;
      const p = f0.apply(this, arguments);
      if (mine) p.then(r => {
        try { const l = Number(r.headers.get("content-length")); ajoute(l > 0 ? l : 0, 1); } catch (e) { /* rien */ }
      }, () => {});
      return p;
    };
  }

  BA.Conso = {
    mois, all: () => JSON.parse(JSON.stringify(data)),
    courant: () => data[mois()] || { o: 0, n: 0 },
    _ajoute: ajoute, _vide: () => { data = {}; dirty = true; save(); }
  };
})();
