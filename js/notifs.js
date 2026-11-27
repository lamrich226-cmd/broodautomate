// ============================================================
// BROODAUTOMATE v5.9 — Notifications (BA.Notifs)
// • Cloche 🔔 dans l'en-tête (comptes admin) : liste des notifications envoyées par Supabase
//   (table ba_notifications, remplie par la fonction « ingest » même quand aucun écran n'est ouvert).
// • Ordinateur : notification du navigateur quand une nouvelle arrive (si l'admin l'a autorisée).
// • Appli Android : le téléphone s'inscrit (fonction ba_jeton) et reçoit de vraies notifications,
//   même appli fermée (Firebase). Toucher la notification ouvre la page Alertes.
// • v5.34.6 — iPhone (appli « ajoutée à l'écran d'accueil ») et ordinateur : notifications WEB même appli fermée (Web Push).
//   Le bouton du panneau 🔔 demande l'autorisation, abonne l'appareil (service worker sw.js) et l'inscrit avec la même
//   fonction ba_jeton (appareil « web… »). Le serveur (fonction « ingest ») les envoie comme celles d'Android.
// • v5.36.0 — « Choisir mes notifications » : chaque appareil coupe ou garde les ventes, les ruptures de pain, les pannes et alertes,
//   la porte, le boîtier muet. Le réglage est gardé sur l'appareil (la cloche le respecte tout de suite) et envoyé au serveur
//   (fonction ba_prefs) pour que les notifications du téléphone le respectent aussi. Les comptes opérateur n'ont pas les ventes.
// Lecture seule : rien ici ne change le stock, les machines ni les réglages de l'appli.
// ============================================================

window.BA = window.BA || {};

(function () {
  const t = (k, v) => BA.I18n.t(k, v);
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const POLL_MS = 60000, RETRY_MS = 600000;
  const KEY = () => ((typeof BA_CONFIG !== "undefined" && BA_CONFIG.storageKey) || "broodautomate") + "-notifs-lu";
  const ICONES = { panne: "🔴", alerte: "🟠", coupure: "⚡", porte: "🚪", muet: "📵", info: "🔵", stock: "🍞", vente: "💶" };
  // v5.36.0 : catégorie de chaque type de notification (les MÊMES noms que la fonction « ingest » : un test les compare)
  const CATEGORIES = { panne: "alertes", alerte: "alertes", coupure: "alertes", porte: "porte", muet: "boitier", info: "boitier", stock: "stock", vente: "vente" };
  const categorie = type => CATEGORIES[type] || "alertes";
  const REGLAGES = [{ id: "vente", ico: "💶" }, { id: "stock", ico: "🍞" }, { id: "alertes", ico: "🔴" }, { id: "porte", ico: "🚪" }, { id: "boitier", ico: "📵" }];
  const CLE_REGLAGE = { vente: () => t("notif_cat_vente"), stock: () => t("notif_cat_stock"), alertes: () => t("notif_cat_alertes"), porte: () => t("notif_cat_porte"), boitier: () => t("notif_cat_boitier") };
  const PKEY = () => ((typeof BA_CONFIG !== "undefined" && BA_CONFIG.storageKey) || "broodautomate") + "-notifs-prefs";
  const PUSH = () => !!(BA.IN_APP && /BAPush/.test(navigator.userAgent || "") && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications);

  const st = { actif: false, items: [], lu: 0, vuMax: 0, premier: true, timer: null, ouvert: false, jeton: null, web: false, jetonWeb: null, webEnCours: false, webMsg: "",
    prefs: {}, prefsOuvert: false, prefsMsg: "" };

  // ---- v5.36.0 : réglages de CET appareil (seules les catégories coupées sont notées : {vente: false}) ----
  function prefsLues() {                                           // null = jamais réglé sur cet appareil
    try { const j = localStorage.getItem(PKEY()); if (j == null) return null; const o = JSON.parse(j); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return null; }
  }
  function prefsGarder(p) { try { localStorage.setItem(PKEY(), JSON.stringify(p)); } catch (e) { /* stockage bloqué : le réglage vaut jusqu'à la fermeture */ } }
  const veut = cat => !(st.prefs && st.prefs[cat] === false);
  const jetonActuel = () => st.jeton || st.jetonWeb;
  const visibles = () => st.items.filter(n => veut(categorie(n.type)));
  const coupes = () => REGLAGES.filter(r => !veut(r.id)).length;
  // Après l'inscription d'un appareil : le serveur et l'appareil se mettent d'accord (l'appareil fait foi ; s'il n'a jamais rien réglé, on reprend ceux du serveur)
  async function synchroniserPrefs(jeton) {
    if (!jeton) return;
    try {
      const loc = prefsLues();
      const r = await BA.DB.raw().rpc("ba_prefs_lire", { t: jeton });
      if (!r || r.error) return;                                   // commande SQL pas encore faite : réglages seulement sur cet appareil
      const srv = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {};
      if (loc === null) { if (Object.keys(srv).length) { st.prefs = srv; prefsGarder(srv); monter(); } return; }
      if (JSON.stringify(srv) !== JSON.stringify(loc)) await BA.DB.raw().rpc("ba_prefs", { t: jeton, p: loc });
    } catch (e) { console.warn("notifications : réglages", e); }
  }
  async function regler(cat, actif) {
    const p = Object.assign({}, st.prefs);
    if (actif) delete p[cat]; else p[cat] = false;
    st.prefs = p; prefsGarder(p); st.prefsMsg = "";
    const j = jetonActuel();
    if (!j) return;                                                // ordinateur sans notifications du navigateur : seule la cloche est concernée
    try { const r = await BA.DB.raw().rpc("ba_prefs", { t: j, p }); if (r && r.error) throw new Error(r.error.message); }
    catch (e) { console.warn("notifications : réglages", e); st.prefsMsg = "notif_prefs_err"; }
  }
  // Les cases à cocher (l'opérateur n'a pas les ventes)
  function casesReglages(operateur) {
    return REGLAGES.filter(r => !(operateur && r.id === "vente")).map(r =>
      `<label class="case"><input type="checkbox" data-cat="${r.id}" ${veut(r.id) ? "checked" : ""}> <span aria-hidden="true">${r.ico}</span> ${E(CLE_REGLAGE[r.id]())}</label>`).join("")
      + `<p class="note np-prefs-hint">${E(t("notif_prefs_hint"))}</p><p class="note np-prefs-msg" role="status">${st.prefsMsg ? E(t(st.prefsMsg)) : ""}</p>`;
  }

  // ---- v5.34.6 : notifications web (Web Push) ----
  const WEB = () => !BA.IN_APP && !PUSH() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const APPAREIL_WEB = () => (/iPhone|iPad|iPod/.test(navigator.userAgent || "") ? "web-ios" : "web");
  const IOS_SANS_NOTIF = () => /iPhone|iPad|iPod/.test(navigator.userAgent || "") && !("Notification" in window);   // iPhone : pas encore ajoutée à l'écran d'accueil
  function versOctets(b64url) {
    const b = atob(String(b64url).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(b64url).length + 3) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }
  async function serviceWorker() {
    const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
    return reg;
  }
  async function inscrireAbonnement(sub) {
    const o = sub.toJSON ? sub.toJSON() : sub;
    const page = (location.pathname.split("/").pop() || "index.html");
    const j = JSON.stringify({ endpoint: o.endpoint, keys: o.keys, page: /^(index|operateur)\.html$/.test(page) ? page : "index.html" });   // page = appli installée (admin ou opérateur) à rouvrir au toucher
    const r = await BA.DB.raw().rpc("ba_jeton", { t: j, appareil: APPAREIL_WEB() });
    if (r && r.error) throw new Error(r.error.message);
    st.jetonWeb = j; st.web = true;
    synchroniserPrefs(j);
  }
  // Au démarrage : si cet appareil est déjà abonné, on le réinscrit (rafraîchit la date, retrouve le compte actuel) sans rien demander
  async function etatWeb() {
    if (!WEB() || Notification.permission !== "granted") return;
    try {
      const reg = await serviceWorker();
      const sub = await reg.pushManager.getSubscription();
      if (sub) await inscrireAbonnement(sub); else st.web = false;
    } catch (e) { console.warn("notifications : web", e); }
    monter();
  }
  // Appelée par le bouton (geste de l'utilisateur obligatoire sur iPhone) : autorisation → abonnement → inscription
  async function activerWeb() {
    if (st.webEnCours) return;
    st.webEnCours = true; st.webMsg = "";
    try {
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();   // 1er await : doit rester dans le geste
      if (perm !== "granted") { st.webMsg = perm === "denied" ? "notif_blocked" : ""; return; }
      const cle = await BA.DB.raw().rpc("ba_vapid_public");
      if (!cle || cle.error || !cle.data) { st.webMsg = "notif_web_wait"; return; }          // clés pas encore créées par le serveur (au plus 15 min)
      const reg = await serviceWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(cle.data) });
      await inscrireAbonnement(sub);
      if (BA.UI && BA.UI.toast) BA.UI.toast(t("notif_web_on"));
    } catch (e) { console.warn("notifications : activation web", e); st.webMsg = "notif_web_err"; }
    finally { st.webEnCours = false; if (st.ouvert) panneau(); }
  }
  async function desactiverWeb() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (st.jetonWeb) await BA.DB.raw().rpc("ba_jeton_retirer", { t: st.jetonWeb });
      if (sub) await sub.unsubscribe();
    } catch (e) { console.warn("notifications : désactivation web", e); }
    st.web = false; st.jetonWeb = null; st.webMsg = "";
    if (st.ouvert) panneau();
  }

  function lire() { try { return Number(localStorage.getItem(KEY())) || 0; } catch (e) { return 0; } }
  function ecrire(v) { try { localStorage.setItem(KEY(), String(v)); } catch (e) { /* stockage bloqué : tant pis */ } }
  const nonLues = () => visibles().filter(n => n.id > st.lu).length;

  function depuis(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!(ms >= 0)) return "";
    if (ms < 90000) return t("notif_now");
    if (ms < 3600000) return t("notif_ago_min", { n: Math.round(ms / 60000) });
    if (ms < 86400000) return t("notif_ago_h", { n: Math.round(ms / 3600000) });
    return new Date(iso).toLocaleString(BA.I18n.lang === "nl" ? "nl-BE" : BA.I18n.lang === "en" ? "en-GB" : "fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  async function role() {
    try { const s = await BA.DB.getSession(); return (s && s.user && s.user.app_metadata && s.user.app_metadata.role) || ""; } catch (e) { return ""; }
  }

  async function charger() {
    clearTimeout(st.timer);
    let res;
    try {
      let q = BA.DB.raw().from("ba_notifications").select("id, type, titre, texte, machine_id, cree_at").eq("silencieux", false);
      const off = Object.keys(CATEGORIES).filter(ty => !veut(CATEGORIES[ty]));           // v5.36.0 : ce que cet appareil a coupé n'est même pas téléchargé
      if (off.length) q = q.not("type", "in", "(" + off.join(",") + ")");
      res = await q.order("id", { ascending: false }).limit(30);
    } catch (e) { res = { error: e }; }
    if (res.error) {                                      // table pas encore créée (commandes SQL) ou hors ligne : cloche cachée, on réessaie plus tard
      st.actif = false; monter(); st.timer = setTimeout(charger, RETRY_MS); return;
    }
    st.actif = true;
    st.items = res.data || [];
    const max = st.items.length ? st.items[0].id : 0;
    if (!lire() && max) { st.lu = max; ecrire(max); }    // première fois sur cet appareil : l'ancien est considéré comme lu
    if (!st.premier) st.items.filter(n => n.id > st.vuMax).slice(0, 3).reverse().forEach(nouvelle);
    st.premier = false;
    st.vuMax = Math.max(st.vuMax, max);
    monter();
    st.timer = setTimeout(charger, POLL_MS);
  }

  function nouvelle(n) {
    if (!veut(categorie(n.type))) return;
    if (BA.UI && BA.UI.toast) BA.UI.toast("🔔 " + n.titre, 8000);
    if (BA.IN_APP || st.web || !("Notification" in window) || Notification.permission !== "granted") return;     // st.web : le service worker l'affiche déjà
    try {
      const x = new Notification(n.titre, { body: n.texte || "", tag: "ba-" + n.id });
      x.onclick = () => { window.focus(); aller(); x.close(); };
    } catch (e) { /* certains navigateurs refusent hors d'un service worker */ }
  }

  function aller() { fermer(); try { BA.Shell.go("alerts"); } catch (e) { /* pas de page alertes */ } }

  // Bouton dans l'en-tête (l'en-tête est redessiné à chaque changement de langue : on remonte le bouton)
  function monter() {
    const slot = document.getElementById("notif-slot");
    if (!slot) return;
    if (!st.actif) { slot.innerHTML = ""; return; }
    const n = nonLues();
    const cloche = (BA.UI && BA.UI.NAV_ICONS && BA.UI.NAV_ICONS.bell) || "🔔";    // v5.11 : icône au même trait que le menu
    slot.innerHTML = `<button type="button" id="notif-btn" class="icon-btn" aria-haspopup="dialog" aria-expanded="${st.ouvert}"
      aria-label="${E(t("notif_title") + (n ? " — " + t("notif_unread", { n }) : ""))}" title="${E(t("notif_title"))}">${cloche}${n ? `<span class="notif-n">${n > 9 ? "9+" : n}</span>` : ""}</button>`;
    slot.querySelector("#notif-btn").onclick = e => { e.stopPropagation(); st.ouvert ? fermer() : ouvrir(); };
    if (st.ouvert) panneau();
  }

  function panneau() {
    let p = document.getElementById("notif-panel");
    if (!p) {
      p = document.createElement("div"); p.id = "notif-panel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", t("notif_title"));
      document.body.appendChild(p);
      p.addEventListener("click", e => e.stopPropagation());
    }
    const haut = p.scrollTop, focus = document.activeElement && p.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.cat : null;
    const liste = visibles();
    const h = document.getElementById("app-header");          // le panneau s'ouvre juste sous l'en-tête (plus haut sur téléphone)
    if (h) p.style.top = Math.max(8, Math.round(h.getBoundingClientRect().bottom) + 8) + "px";
    const web = WEB();
    const peutDemander = !BA.IN_APP && "Notification" in window && Notification.permission === "default";
    const bloque = !BA.IN_APP && "Notification" in window && Notification.permission === "denied";
    const aActiver = web && !st.web && Notification.permission !== "denied";            // v5.34.6 : bouton « même appli fermée »
    p.innerHTML = `<div class="np-head"><strong>🔔 ${E(t("notif_title"))}</strong><button type="button" class="np-x" aria-label="${E(t("btn_close"))}">✕</button></div>
      ${aActiver ? `<button type="button" class="btn secondary petit np-web" ${st.webEnCours ? "disabled" : ""}>📲 ${E(t("notif_web_enable"))}</button>` : ""}
      ${web && st.web ? `<p class="note np-web-on">✅ ${E(t("notif_web_active"))}</p><button type="button" class="btn secondary petit np-web-off">${E(t("notif_web_off"))}</button>` : ""}
      ${st.webMsg ? `<p class="note">${E(t(st.webMsg))}</p>` : ""}
      ${!web && peutDemander ? `<button type="button" class="btn secondary petit np-perm">💻 ${E(t("notif_enable"))}</button>` : ""}
      ${IOS_SANS_NOTIF() ? `<p class="note">${E(t("notif_ios_hint"))}</p>` : ""}
      ${bloque ? `<p class="note">${E(t("notif_blocked"))}</p>` : ""}
      <details class="np-prefs" ${st.prefsOuvert ? "open" : ""}><summary><span class="np-ptitle">⚙️ ${E(t("notif_prefs"))}</span>${coupes() ? ` <span class="np-off">${E(t("notif_prefs_n", { n: coupes() }))}</span>` : ""}</summary>${casesReglages(false)}</details>
      ${liste.length ? `<ul class="np-list">${liste.map(n => `<li class="${n.id > st.lu ? "new" : ""}"><span class="np-i" aria-hidden="true">${ICONES[n.type] || "🔔"}</span>
        <span class="np-t"><b>${E(n.titre)}</b>${n.texte ? `<span>${E(n.texte)}</span>` : ""}<small>${E(depuis(n.cree_at))}</small></span></li>`).join("")}</ul>`
        : `<p class="note">${E(t("notif_none"))}</p>`}
      <div class="np-foot"><button type="button" class="btn secondary petit np-lu" ${nonLues() ? "" : "disabled"}>✓ ${E(t("notif_mark"))}</button>
      <button type="button" class="btn petit np-al">${E(t("notif_see_alerts"))}</button></div>`;
    p.scrollTop = haut;
    p.querySelector(".np-x").onclick = fermer;
    const dp = p.querySelector(".np-prefs"); dp.addEventListener("toggle", () => { st.prefsOuvert = dp.open; });
    p.querySelectorAll(".np-prefs input[data-cat]").forEach(i => i.onchange = async () => {
      await regler(i.dataset.cat, i.checked);
      panneau(); charger();                                    // la cloche suit tout de suite ; la liste est relue sans ce qui est coupé
    });
    if (focus) { const f = p.querySelector('input[data-cat="' + focus + '"]'); if (f) f.focus(); }
    p.querySelector(".np-al").onclick = aller;
    p.querySelector(".np-lu").onclick = () => { st.lu = st.vuMax; ecrire(st.lu); monter(); };
    const bw = p.querySelector(".np-web"); if (bw) bw.onclick = activerWeb;
    const bo = p.querySelector(".np-web-off"); if (bo) bo.onclick = desactiverWeb;
    const perm = p.querySelector(".np-perm");
    if (perm) perm.onclick = async () => { try { await Notification.requestPermission(); } catch (e) { /* refus */ } panneau(); if (Notification.permission === "granted" && BA.UI) BA.UI.toast(t("notif_enabled")); };
  }

  function ouvrir() { st.ouvert = true; monter(); setTimeout(() => document.addEventListener("click", fermer, { once: true }), 0); }
  function fermer() { st.ouvert = false; const p = document.getElementById("notif-panel"); if (p) p.remove(); const b = document.getElementById("notif-btn"); if (b) b.setAttribute("aria-expanded", "false"); }

  // Appli Android : inscription du téléphone pour les vraies notifications (Firebase)
  async function inscrireTelephone() {
    if (!PUSH()) return;
    const P = window.Capacitor.Plugins.PushNotifications;
    try {
      if (P.createChannel) await P.createChannel({ id: "alertes", name: "Alertes machines", description: "Pannes, coupures, porte ouverte, boîtier muet", importance: 5, visibility: 1, sound: "default" }).catch(() => {});
      let perm = await P.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await P.requestPermissions();
      if (perm.receive !== "granted") return;
      await P.addListener("registration", async jeton => {
        st.jeton = jeton && jeton.value;
        if (!st.jeton) return;
        const r = await BA.DB.raw().rpc("ba_jeton", { t: st.jeton, appareil: "android" });
        if (r && r.error) console.warn("notifications : inscription du téléphone", r.error.message);
        else synchroniserPrefs(st.jeton);
      });
      await P.addListener("registrationError", e => console.warn("notifications : Firebase", e && e.error));
      await P.addListener("pushNotificationReceived", () => { if (st.actif) charger(); });
      await P.addListener("pushNotificationActionPerformed", () => aller());
      await P.register();
    } catch (e) { console.warn("notifications : téléphone", e); }
  }

  BA.Notifs = {
    async start(ctx) {
      if (!BA.DB || !BA.DB.isReady || !BA.DB.isReady()) return;      // mode local : pas de notifications
      st.lu = lire();
      st.prefs = prefsLues() || {};
      const r = await role();
      inscrireTelephone();
      if (WEB()) {                                                      // v5.34.6 : toucher une notification ramène l'appli sur la page Alertes ; état de l'abonnement (v5.34.7 : aussi pour les comptes opérateur)
        try { navigator.serviceWorker.addEventListener("message", ev => { if (ev.data && ev.data.ba === "aller") aller(); }); } catch (e) { /* tant pis */ }
        etatWeb();
      }
      if (r === "operator") return;                                    // la cloche est pour les comptes admin
      document.addEventListener("visibilitychange", () => { if (!document.hidden && st.actif) charger(); });
      charger();
    },
    mount: monter,
    // v5.34.7 : bloc « alertes sur cet appareil » pour l'appli opérateur (pas de cloche là-bas) : bouton Activer / état / Désactiver
    // v5.36.0 : + « Choisir mes notifications » (sans les ventes) dès que cet appareil reçoit des notifications (appli Android ou web activé)
    montrerWeb(el, redessiner) {
      if (!el) return;
      st.prefs = prefsLues() || st.prefs;
      const web = WEB();
      const recoit = PUSH() || (web && st.web);
      const bloque = web && Notification.permission === "denied";
      let h = "";
      if (web) h = st.web
        ? `<p class="note">✅ ${E(t("notif_web_active"))}</p><button type="button" class="btn secondary np-web-off">${E(t("notif_web_off"))}</button>`
        : bloque ? `<p class="note">${E(t("notif_blocked"))}</p>`
        : `<button type="button" class="btn secondary np-web">📲 ${E(t("notif_web_enable"))}</button>${st.webMsg ? `<p class="note">${E(t(st.webMsg))}</p>` : ""}`;
      else if (IOS_SANS_NOTIF()) h = `<p class="note">${E(t("notif_ios_hint"))}</p>`;
      if (recoit) h += `<div class="np-prefs-op"><b>⚙️ ${E(t("notif_prefs"))}</b>${casesReglages(true)}</div>`;
      el.innerHTML = h;
      const redo = () => { if (redessiner) redessiner(); };
      const a = el.querySelector(".np-web"); if (a) a.onclick = async () => { await activerWeb(); redo(); };
      const d = el.querySelector(".np-web-off"); if (d) d.onclick = async () => { await desactiverWeb(); redo(); };
      el.querySelectorAll(".np-prefs-op input[data-cat]").forEach(i => i.onchange = async () => {
        await regler(i.dataset.cat, i.checked);
        const m = el.querySelector(".np-prefs-msg"); if (m) m.textContent = st.prefsMsg ? t(st.prefsMsg) : "";
      });
    },
    async retirer() {                                                  // déconnexion : ce téléphone ne reçoit plus rien
      for (const j of [st.jeton, st.jetonWeb]) {
        if (!j) continue;
        try { await BA.DB.raw().rpc("ba_jeton_retirer", { t: j }); } catch (e) { /* hors ligne */ }
      }
      st.web = false; st.jetonWeb = null;
    },
    CATEGORIES, categorie,
    _st: st
  };
})();
