// ============================================================
// BROODAUTOMATE v5.29 — Avertissement « nouvelle version publiée »
// Une page restée ouverte (téléphone, autre ordinateur) garde l'ancien programme tant qu'on ne la recharge pas.
// Le 14/11/2026, une page ancienne a ainsi envoyé des « Lire maintenant » sans l'ordre instantané du boîtier.
// Toutes les 5 min, et dès qu'on revient sur la page, on relit la version publiée (js/config.js, sans cache) :
// si elle a changé, un bandeau propose de recharger. Rien n'est rechargé tout seul (une saisie en cours n'est jamais perdue).
// ============================================================
(function () {
  "use strict";
  const BA = window.BA = window.BA || {};
  const actuelle = (typeof BA_CONFIG !== "undefined" && BA_CONFIG.app && BA_CONFIG.app.version) || "";
  const t = (k, o) => (BA.I18n && BA.I18n.t ? BA.I18n.t(k, o) : k);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let derniere = 0, bandeau = null, enCours = false;

  // Version écrite dans js/config.js tel qu'il est publié maintenant ("" si illisible ou hors ligne)
  async function publiee() {
    try {
      const r = await fetch("js/config.js?maj=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return "";
      const m = /version\s*:\s*["']([0-9][0-9A-Za-z.\-]*)["']/.exec(await r.text());
      return m ? m[1] : "";
    } catch (e) { return ""; }
  }
  function montrer(v) {
    if (bandeau || !document.body) return;
    bandeau = document.createElement("div");
    bandeau.className = "maj-bandeau";
    bandeau.setAttribute("role", "status");
    bandeau.innerHTML = `<span>🔄 ${esc(t("maj_txt", { v }))}</span><button type="button" class="btn petit" data-maj>${esc(t("maj_btn"))}</button>`;
    bandeau.querySelector("[data-maj]").onclick = () => location.reload();
    document.body.appendChild(bandeau);
  }
  async function verifier(force) {
    if (!actuelle || enCours || (!force && Date.now() - derniere < 60000)) return null;
    enCours = true; derniere = Date.now();
    try {
      const v = await publiee();
      if (v && v !== actuelle) montrer(v);
      return v;
    } finally { enCours = false; }
  }
  BA.Maj = { verifier, publiee, actuelle: () => actuelle, bandeau: () => bandeau };
  setInterval(() => { verifier(false); }, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) verifier(false); });
  window.addEventListener("load", () => setTimeout(() => verifier(false), 20000));
})();
