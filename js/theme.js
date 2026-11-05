// ============================================================
// BROODAUTOMATE v5.11 — Thème nuit / clair (BA.Theme), comme la version test 4.8.6 (design v5)
// Sans choix enregistré : le thème suit celui de l'ordinateur ou du téléphone.
// Le choix fait avec le bouton soleil / lune est gardé sur cet appareil.
// Les couleurs des deux thèmes sont dans css/app.css (variables) : plus d'inversion de l'écran.
// ============================================================
window.BA = window.BA || {};
(function () {
  const KEY = "ba_theme";
  const SVG = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>')
  };
  const stored = () => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; } };
  const system = () => (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const get = () => document.documentElement.dataset.theme || stored() || system();
  function paintMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", get() === "light" ? "#f4f0e9" : "#0f172a");
  }
  function apply(m) {
    if (m === "light" || m === "dark") document.documentElement.dataset.theme = m;
    else delete document.documentElement.dataset.theme;
    paintMeta();
  }
  const TXT = {
    fr: { light: "Thème clair", dark: "Thème nuit" },
    nl: { light: "Lichte modus", dark: "Donkere modus" },
    en: { light: "Light theme", dark: "Dark theme" }
  };
  const lang = () => (BA.I18n && BA.I18n.lang) || "fr";
  const label = () => (TXT[lang()] || TXT.fr)[get() === "light" ? "dark" : "light"];
  function paint(btn) {
    if (!btn) return;
    const light = get() === "light";
    btn.innerHTML = light ? ICON.moon : ICON.sun;
    btn.title = label(); btn.setAttribute("aria-label", label());
    btn.setAttribute("aria-pressed", light ? "true" : "false");
  }
  function bind(btn) {
    if (!btn) return;
    paint(btn);
    btn.onclick = () => {
      const m = get() === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, m); } catch (e) { /* tant pis : valable jusqu'au rechargement */ }
      apply(m); paint(btn);
      // les graphiques lisent leurs couleurs au moment du dessin : on redessine la page ouverte
      try { if (BA.Shell && BA.Shell.ctx) BA.Shell.renderView(true); } catch (e) { /* rien */ }
    };
  }
  apply(stored());
  if (window.matchMedia) { try { matchMedia("(prefers-color-scheme: light)").addEventListener("change", paintMeta); } catch (e) { /* vieux navigateur */ } }
  BA.Theme = { get, apply, label, bind, paint };
})();
