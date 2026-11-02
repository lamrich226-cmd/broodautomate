// ============================================================
// BROODAUTOMATE v5.5 — Mode clair / sombre (BA.Theme)
// Sombre par défaut. Le choix est gardé sur cet appareil.
// ============================================================
window.BA = window.BA || {};
(function () {
  const KEY = "ba_theme";
  const get = () => { try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch (e) { return "dark"; } };
  function apply(m) {
    document.documentElement.setAttribute("data-theme", m);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", m === "light" ? "#e9edf4" : "#1e293b");
  }
  const TXT = {
    fr: { light: "Passer en mode clair", dark: "Passer en mode sombre" },
    nl: { light: "Lichte modus", dark: "Donkere modus" },
    en: { light: "Switch to light mode", dark: "Switch to dark mode" }
  };
  const lang = () => (BA.I18n && BA.I18n.lang) || "fr";
  const label = () => (TXT[lang()] || TXT.fr)[get() === "light" ? "dark" : "light"];
  function paint(btn) {
    if (!btn) return;
    const light = get() === "light";
    btn.textContent = light ? "🌙" : "☀️";
    btn.title = label(); btn.setAttribute("aria-label", label());
    btn.setAttribute("aria-pressed", light ? "true" : "false");
  }
  function bind(btn) {
    if (!btn) return;
    paint(btn);
    btn.onclick = () => {
      const m = get() === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, m); } catch (e) { /* tant pis : valable jusqu'au rechargement */ }
      apply(m); BA.Theme._mem = m; paint(btn);
    };
  }
  apply(get());
  BA.Theme = { get, apply, label, bind };
})();
