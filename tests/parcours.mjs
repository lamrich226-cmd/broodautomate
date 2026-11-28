// Parcours complet de l'appli (audit du 28/11/2026, gardé comme test) : TOUTES les pages admin et opérateur, leurs onglets,
// filtres, listes de choix et sections repliables, en FR / NL / EN, téléphone (390 px, tactile) et ordinateur, clair et sombre,
// avec des données inventées (5 machines, 30 jours de ventes, toutes les sortes d'alertes, un Remplir ouvert) puis appli vide.
// En plus : changement de langue pendant l'utilisation (chaque page = la même que si l'appli avait été ouverte dans cette
// langue) et le Remplir de bout en bout (tableau et vue Machine). Faux Supabase : aucune vraie donnée lue ni modifiée.
// Cherche : erreurs JavaScript, erreurs console, textes non traduits (code de texte affiché), « undefined » / « NaN » /
// « [object Object] » / « Invalid Date » à l'écran, élément qui dépasse ou coupé sur téléphone, images cassées.
// Avant de commencer, 5 défauts sont placés exprès dans une page : s'ils ne sont pas tous vus, le parcours s'arrête.
// node parcours.mjs <dossier du site> <dossier des captures>   (~12 min)
//   LANGUES=fr          une seule langue (plus rapide)
//   CONTROLE_SEUL=1     seulement le contrôle du détecteur
//   SEULEMENT_REMPLIR=1 seulement le changement de langue et le Remplir
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-parcours");
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname), NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": NM + "/@supabase/supabase-js/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": NM + "/chart.js/dist/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": NM + "/xlsx/dist/xlsx.full.min.js"
};
const TY = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGUES = (process.env.LANGUES || "fr,nl,en").split(",");
const NOW = new Date("2026-11-27T13:00:00+01:00").getTime(), H = 3600000, DAY = 86400000;
const USERS = [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }];
const TYPES = ["gris", "blanc", "complet", "maya", "sandwich", "c900001", "c900002"];
function etatDeBase() {
  let id = 1;
  const machines = [1, 2, 3, 4, 5].map(num => ({ id: "FAS-9000000" + num, num, street: "Rue inventée " + num, city: ["Antwerpen", "Mechelen", "Gent", "Lier", "Brussel"][num - 1], region: "vl",
    serial: "", door: num === 1, link: false, power: false, temp: num === 4 ? 21 : null,
    sels: [11, 12, 13, 15, 19, 21, 25, 29, 31, 35, 39, 41].map((n, i) => {
      const cap = 3 + (i % 3), type = TYPES[(i + num) % TYPES.length];
      const lots = num === 5 ? [] : [{ id: id++, qty: 1, date: NOW - (i % 4 === 0 ? 52 : 20) * H }, { id: id++, qty: Math.max(0, cap - 2), date: NOW - 6 * H }].filter(l => l.qty > 0);
      if (num === 3 && i === 2) lots.push({ id: id++, qty: 1, date: NOW - 30 * H, kept: true, keptAt: NOW - 3 * H });
      return { n, cap, type, price: 2.5 + (i % 3) * 0.5, lots };
    }) }));
  return { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 70 * DAY }, epoch: "parcours", thr48: true, orders: [], applied: [], missions: [],
    machines, events: [], journal: [], interventions: [], moves: [], daily: {},
    settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [{ id: "c900001", name: "Pistolets" }, { id: "c900002", name: "Tijger wit" }], dayDecisions: {}, profileManual: {}, calendar: [] };
}
// 30 jours de ventes, toutes les sortes d'alertes et un Remplir en cours, faits PAR L'APPLI (BA.Model / BA.Actions)
async function remplirDonnees(p) {
  return p.evaluate(({ H, DAY }) => {
    const M = BA.Model;
    BA.Store.update(s => {
      for (let d = 30; d >= 1; d--) for (const m of s.machines) {
        if (m.num === 5 && d < 3) continue;                          // machine 5 : vide depuis 2 jours
        for (const sel of m.sels) { const free = sel.cap - M.qty(sel); if (free > 0) sel.lots.push({ id: s.seq++, qty: free, date: s.now - d * DAY - 5 * H }); }
        const avant = { door: m.door, power: m.power }; m.online = true; m.door = false; m.power = false;
        const n = 6 + ((m.num * 7 + d * 3) % 10);
        for (let k = 0; k < n; k++) M.sellOne(s, m, s.now - d * DAY + 7 * H + k * 50 * 60000);
        delete m.online; m.door = avant.door; m.power = avant.power;
      }
      const when = "25/11 11:00", t = s.now - 2 * H;
      const ev = [
        [1, "DOOR_OPEN", null], [2, "TYPE_EMPTY", { key: "type|sandwich", sels: [15, 25], type: "sandwich" }],
        [3, "OLD_BREAD", { key: "old|3|11", lotDate: s.now - 52 * H, qty: 1, sel: 11, type: "gris" }],
        [4, "FAS_ERROR", { code: "45", count: 2, expl: "Ascenseur bloqué par un produit qui dépasse", key: "fas|45|54", sol: "Vérifier le produit", sous: "54", title: "Ascenseur bloqué", until: s.now + DAY, when }],
        [4, "MACHINE_EVENT", { active: true, code: "EGS", count: 1, expl: "Porte ouverte", gr: "EG", key: "eva|EGS", title: "Porte ouverte", until: null, when }],
        [2, "POWER_LOG", { key: "pow|1", off: "26/11 03:10", on: "26/11 03:40" }], [3, "PRICE_CHANGED", { from: 2.5, key: "prix|3|12", sel: 12, to: 3, type: "blanc" }],
        [1, "READ_FIRST", { key: "first|1", total: 1234 }], [1, "SEL_EMPTY", { sel: 13, type: "maya" }],
        [2, "SELS_FROM_MACHINE", { key: "sels|2", msg: "2 sélections ajoutées d'après la machine", total: 2 }],
        [3, "STOCK_GAP", { gained: 2, key: "gap|3", lost: 1 }], [4, "STOCK_UNKNOWN", { sels: [11, 12] }], [5, "MACHINE_EMPTY", null],
        [1, "BOX_FAIL", { msg: "Lecture impossible" }], [2, "BOX_SILENT", { msg: "Aucune nouvelle depuis 3 h", when }]];
      ev.forEach(([num, code, data]) => { try { const e = M.addEvent(s, num, code, data || undefined); if (e && typeof e === "object") e.t = t; } catch (x) { console.error("addEvent " + code + " : " + x.message); } });
    });
    try { BA.Actions.startIntervention(2); } catch (x) { console.error("startIntervention : " + x.message); }
    const s = BA.Store.get();
    return { ventes: s.journal.filter(e => e.k === "sale").length, alertes: s.events.length, interventions: s.interventions.length };
  }, { H, DAY });
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch();
  let etat = etatDeBase(), donnees = null;
  const problemes = [];                              // { ou, quoi, detail }
  const note = (ou, quoi, detail) => { if (!problemes.some(x => x.ou === ou && x.quoi === quoi && x.detail === detail)) problemes.push({ ou, quoi, detail }); };
  async function appareil(o) {
    const fake = new FakeSupabase({ users: USERS });
    if (!o.vide) fake.baState = [{ id: "main", version: 3, data: JSON.parse(JSON.stringify(etat)), updated_at: new Date(NOW).toISOString() }];
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: o.tel ? { width: 390, height: 844 } : { width: 1366, height: 900 },
      isMobile: o.tel, hasTouch: o.tel, deviceScaleFactor: 1 });
    await ctx.addInitScript(([lang, role, theme]) => { try { localStorage.setItem("ba_mv_3di", "0"); localStorage.setItem("ba-test-lang-" + role, lang); localStorage.setItem("ba_theme", theme); } catch (e) { /* ok */ } },
      [o.lang, o.page === "index.html" ? "admin" : "op", o.theme]);
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, "parcours");
    await ctx.clock.setFixedTime(NOW);
    const p = await ctx.newPage();
    const ou = () => o.nom + " › " + (p.__vue || "démarrage");
    p.on("pageerror", e => note(ou(), "erreur JavaScript", e.message.slice(0, 200)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|net::ERR|WebSocket|realtime/i.test(m.text())) note(ou(), "erreur console", m.text().slice(0, 200)); });
    await p.goto(URL0 + o.page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", o.page === "index.html" ? "amor@test.be" : "op@test.be"); await p.fill("#login-pass", o.page === "index.html" ? "Secret-123" : "Secret-456"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(1200);
    return { p, ctx, fake };
  }
  // Ce qui ne va pas sur l'écran affiché
  const examiner = (p, o, vue) => p.evaluate(([tel, clesL]) => {
    const r = [], cles = new Set(clesL);
    const zone = document.getElementById("app-main") || document.body;
    const vis = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0; };
    const textes = []; const w = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode, t = n.textContent.trim(); if (t && n.parentElement && vis(n.parentElement) && !n.parentElement.closest("script,style,textarea,code,pre")) textes.push(t); }
    const tout = textes.join(" ¦ ");
    for (const mot of ["undefined", "NaN", "[object Object]", "Invalid Date", "null €", "Infinity"]) {
      const i = tout.indexOf(mot); if (i >= 0) r.push(["texte « " + mot + " » à l'écran", tout.slice(Math.max(0, i - 60), i + 40)]);
    }
    const brutes = textes.filter(t => cles.has(t) || /^[a-z]{2,}(_[a-z0-9]+){1,}$/.test(t));
    if (brutes.length) r.push(["texte non traduit (code affiché)", [...new Set(brutes)].slice(0, 6).join(", ")]);
    const attrs = [...zone.querySelectorAll("[title],[placeholder],[aria-label]")].flatMap(el => ["title", "placeholder", "aria-label"].map(a => el.getAttribute(a)).filter(Boolean)).filter(t => cles.has(t.trim()));
    if (attrs.length) r.push(["infobulle ou libellé non traduit", [...new Set(attrs)].slice(0, 6).join(", ")]);
    if (tel) {
      // élément coupé ou qui dépasse à droite de l'écran (le corps de page masque le débordement, donc on regarde chaque élément)
      const defile = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true; } return false; };
      const large = [...zone.querySelectorAll("*")].filter(el => { if (!vis(el)) return false; const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && b.right > innerWidth + 2 && b.left < innerWidth && getComputedStyle(el).position !== "fixed" && !defile(el); })
        .filter((el, i, l) => !l.some(x => x !== el && x.contains(el)))            // garder le plus haut placé
        .slice(0, 3).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "") + " (" + Math.round(el.getBoundingClientRect().right) + " px)");
      if (large.length || document.documentElement.scrollWidth > innerWidth + 1) r.push(["la page déborde sur le côté (écran de " + innerWidth + " px)", large.join(" ; ") || "page " + document.documentElement.scrollWidth + " px"]);
    }
    const imgs = [...zone.querySelectorAll("img")].filter(i => vis(i) && i.complete && i.naturalWidth === 0).map(i => i.getAttribute("src"));
    if (imgs.length) r.push(["image cassée", imgs.slice(0, 3).join(", ")]);
    return r;
  }, [o.tel, [...CLES]]).then(l => l.forEach(([q, d]) => note(o.nom + " › " + vue, q, d)));
  // Ouvre chaque onglet / choix et chaque section repliable de la page, sans jamais toucher à un bouton qui modifie quelque chose
  async function visiterPage(p, o, id) {
    p.__vue = id;
    await p.evaluate(v => BA.Shell.go(v), id); await sleep(700);
    await examiner(p, o, id);
    const n = await p.evaluate(() => { const l = [...document.querySelectorAll("#app-main details:not([open]) > summary")]; l.forEach(s => s.parentElement.open = true); return l.length; });
    if (n) { await sleep(400); await examiner(p, o, id + " (sections ouvertes)"); }
    const SEL_ONGLETS = "#app-main .seg button, #app-main [role=tab], #app-main .chips button, #app-main .mv-chips button";
    const onglets = await p.$$eval(SEL_ONGLETS, l => l.map((b, i) => ({ i, txt: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) })));
    for (const og of onglets.slice(0, 16)) {
      const b = (await p.$$(SEL_ONGLETS))[og.i];
      if (!b || !(await b.isVisible().catch(() => false))) continue;
      p.__vue = id + " › " + og.txt;
      await b.click({ timeout: 3000 }).catch(() => {}); await sleep(450); compte.onglets++;
      await examiner(p, o, p.__vue);
    }
    // listes de choix (filtres, période, machine, affichage) : seulement sur les pages où elles ne font que filtrer
    if (!LISTES_OK.has(id)) return;
    await p.evaluate(v => BA.Shell.go(v), id); await sleep(600);
    const nbSel = await p.$$eval("#app-main select", l => l.length);
    for (let k = 0; k < Math.min(nbSel, 6); k++) {
      const sel = (await p.$$("#app-main select"))[k]; if (!sel || !(await sel.isVisible().catch(() => false))) continue;
      const opts = await sel.$$eval("option", l => l.map(x => ({ v: x.value, t: x.textContent.trim().slice(0, 24), d: x.disabled })));
      for (const op of opts.filter(x => !x.d).slice(0, 8)) {
        const s2 = (await p.$$("#app-main select"))[k]; if (!s2) break;
        p.__vue = id + " › choix « " + op.t + " »";
        await s2.selectOption(op.v, { timeout: 3000 }).catch(() => {}); await sleep(450); compte.choix++;
        await examiner(p, o, p.__vue);
      }
    }
  }
  const compte = { onglets: 0, choix: 0 };
  const LISTES_OK = new Set(["dashboard", "details", "order", "stats", "history", "alerts", "todo", "missions"]);
  // tous les codes de texte connus (pour repérer un code affiché tel quel)
  const CLES = new Set();
  {
    const { p, ctx } = await appareil({ nom: "préparation", page: "index.html", tel: false, lang: "fr", theme: "light" });
    donnees = await remplirDonnees(p); await sleep(1500);
    etat = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(BA.Store.get())); delete s.now; return s; });
    (await p.evaluate(() => Object.keys(BA.I18n.dicts.fr).filter(k => /_/.test(k)))).forEach(k => CLES.add(k));
    await ctx.close();
    console.log("données inventées : " + JSON.stringify(donnees) + " ; codes de texte connus : " + CLES.size);
  }
  const PAGES = { "index.html": ["dashboard", "details", "products", "order", "stats", "history", "alerts", "rs232", "technique", "settings"],
    "operateur.html": ["dashboard", "todo", "fill", "alerts", "more", "details", "products", "history", "rs232", "missions"] };
  const PASSAGES = [];
  for (const page of Object.keys(PAGES)) for (const lang of LANGUES) for (const tel of [true, false])
    PASSAGES.push({ page, lang, tel, theme: (lang === "fr" && !tel) ? "dark" : "light" });
  PASSAGES.push({ page: "operateur.html", lang: "fr", tel: true, theme: "dark" });
  for (const page of Object.keys(PAGES)) PASSAGES.push({ page, lang: "fr", tel: true, theme: "light", vide: true });
  let pages = 0;
  // Contrôle du détecteur : on place exprès 5 défauts dans une page ; ils doivent tous être vus, sinon le parcours ne prouve rien.
  {
    const o = { nom: "contrôle du détecteur", page: "operateur.html", tel: true, lang: "fr", theme: "light" };
    const { p, ctx } = await appareil(o);
    await p.evaluate(() => BA.Shell.go("dashboard")); await new Promise(r => setTimeout(r, 600));
    await p.evaluate(() => { const z = document.getElementById("app-main"); const d = document.createElement("div");
      d.innerHTML = '<p>btn_save</p><p>Total : undefined pains</p><div style="width:900px;height:4px">large</div><img src="/nexistepas.png" alt=""><button title="dt_btn_tip">x</button>'; z.prepend(d); });
    await new Promise(r => setTimeout(r, 500));
    const avant = problemes.length; await examiner(p, o, "piège"); const vus = problemes.splice(avant).map(x => x.quoi);
    await ctx.close();
    const attendus = ["texte non traduit", "« undefined »", "déborde", "image cassée", "infobulle"];
    const rates = attendus.filter(a => !vus.some(v => v.includes(a)));
    console.log("contrôle du détecteur : " + (rates.length ? "RATÉ " + rates.join(", ") : "les 5 défauts placés exprès sont bien vus"));
    if (rates.length) process.exit(2);
    if (process.env.CONTROLE_SEUL) process.exit(0);
  }
  for (const o of PASSAGES) {
    if (process.env.SEULEMENT_REMPLIR) break;
    o.nom = (o.page === "index.html" ? "admin" : "opérateur") + " " + o.lang.toUpperCase() + " " + (o.tel ? "téléphone" : "ordinateur") + (o.theme === "dark" ? " sombre" : "") + (o.vide ? " (appli vide)" : "");
    const t0 = Date.now();
    const { p, ctx } = await appareil(o);
    for (const id of PAGES[o.page]) {
      try { await visiterPage(p, o, id); pages++; } catch (e) { note(o.nom + " › " + id, "la page ne s'ouvre pas", e.message.slice(0, 160)); }
      if (o.lang === "fr" && o.theme === "light" && !o.vide) await p.screenshot({ path: path.join(OUT, (o.page === "index.html" ? "admin" : "op") + "-" + (o.tel ? "tel" : "pc") + "-" + id + ".png"), fullPage: false });
    }
    await ctx.close();
    console.log("  " + o.nom + " : " + PAGES[o.page].length + " pages visitées (" + Math.round((Date.now() - t0) / 1000) + " s)");
  }
  // Changer de langue pendant l'utilisation : chaque page doit être exactement la même que si l'appli avait été ouverte dans cette langue
  for (const page of Object.keys(PAGES)) for (const [de, vers] of [["fr", "nl"], ["nl", "en"], ["en", "fr"]]) {
    const role = page === "index.html" ? "admin" : "op", nom = (role === "admin" ? "admin" : "opérateur") + " : langue changée " + de.toUpperCase() + " → " + vers.toUpperCase();
    const A = await appareil({ nom, page, tel: true, lang: de, theme: "light" });
    await A.p.evaluate(([v, r]) => { if (r === "op") { BA.Shell.go("more"); const s = document.getElementById("more-lang"); s.value = v; s.dispatchEvent(new Event("change")); }
      else { const s = document.getElementById("lang-select"); s.value = v; s.dispatchEvent(new Event("change")); } }, [vers, role]);
    await sleep(800);
    const B = await appareil({ nom: nom + " (référence)", page, tel: true, lang: vers, theme: "light" });
    const texte = p => p.evaluate(() => ["#app-header", "#app-nav", "#app-main", "#app-tabbar"].map(q => { const e = document.querySelector(q); return e ? e.innerText.replace(/[ \t]+/g, " ") : ""; }).join("\n¦\n"));
    for (const id of PAGES[page]) {
      await A.p.evaluate(v => BA.Shell.go(v), id); await B.p.evaluate(v => BA.Shell.go(v), id); await sleep(500);
      const [a, b] = [await texte(A.p), await texte(B.p)];
      if (a !== b) { const la = a.split("\n"), lb = b.split("\n"); const i = la.findIndex((x, k) => x !== lb[k]);
        note(nom + " › " + id, "texte resté dans l'ancienne langue (ou différent)", "« " + (la[i] || "").slice(0, 70) + " » au lieu de « " + (lb[i] || "").slice(0, 70) + " »"); }
      compte.langues = (compte.langues || 0) + 1;
    }
    await A.ctx.close(); await B.ctx.close();
    if (process.env.SEULEMENT_REMPLIR) console.log("  " + nom + " : " + PAGES[page].length + " pages comparées");
  }
  // Le Remplir de bout en bout (opérateur) : chaque écran de l'assistant, en tableau et en vue Machine, dans les 3 langues
  const BOUTONS = ["#wz-continue", "#inv-yes", "#mvw-inv-yes", "#inv-validate", "#mvw-inv-ok", "#rm-yes", "#mvw-rm-yes", "#rm-next", "#mvw-rm-next", "#rm-validate", "#plc-next", "#ld-validate", "#mvw-ld-ok", "#wz-close"];
  const REMPLIR = [];
  for (const lang of LANGUES) for (const mode of ["classic", "machine"]) REMPLIR.push({ page: "operateur.html", lang, tel: true, theme: "light", mode });
  REMPLIR.push({ page: "operateur.html", lang: "fr", tel: false, theme: "dark", mode: "classic" });
  for (const o of REMPLIR) {
    o.nom = "Remplir " + o.lang.toUpperCase() + " " + (o.tel ? "téléphone" : "ordinateur") + " " + (o.mode === "machine" ? "vue Machine" : "tableau") + (o.theme === "dark" ? " sombre" : "");
    const { p, ctx } = await appareil(o); let ecrans = 0;
    for (const num of [3, 2]) {                                         // #3 : Remplir neuf (vieux pain à retirer) ; #2 : Remplir déjà ouvert ailleurs
      await p.evaluate(v => { BA.MachineView.setMode(v); BA.Shell.go("fill"); }, o.mode); await sleep(600);
      const b = await p.$('[data-fill="' + num + '"]'); if (!b) { note(o.nom, "bouton Remplir absent", "machine #" + num); continue; }
      await b.click(); await sleep(700);
      let fini = false;
      for (let k = 0; k < 14 && !fini; k++) {
        const id = await p.evaluate(l => l.find(x => { const e = document.querySelector(x); return e && e.offsetParent !== null; }) || null, BOUTONS);
        const etape = await p.evaluate(() => { const st = document.querySelector(".stepper .step.on"); return st ? st.textContent.replace(/\s+/g, " ").trim() : (document.querySelector("#app-main h2, #app-main h3") || {}).textContent || "?"; });
        p.__vue = "#" + num + " › " + String(etape).slice(0, 40) + (id ? " [" + id + "]" : "");
        await examiner(p, o, p.__vue); ecrans++;
        if (!id) { note(o.nom + " › " + p.__vue, "assistant bloqué (aucun bouton pour continuer)", "écran : " + String(etape).slice(0, 60)); break; }
        if (id === "#wz-close") fini = true;
        await p.click(id).catch(() => {}); await sleep(id === "#ld-validate" || id === "#mvw-ld-ok" ? 900 : 600);
        if ((id === "#ld-validate" || id === "#mvw-ld-ok") && await p.$(id)) { await p.click(id).catch(() => {}); await sleep(900); }   // 2e appui si une confirmation est demandée
      }
      if (!fini) note(o.nom + " › #" + num, "le Remplir ne va pas jusqu'au bout", "dernier écran : " + p.__vue);
    }
    const it = await p.evaluate(() => BA.Store.get().interventions.map(x => x.num + ":" + x.status).join(" "));
    await ctx.close(); pages++;
    console.log("  " + o.nom + " : " + ecrans + " écrans de l'assistant (Remplir : " + it + ")");
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, "problemes.json"), JSON.stringify(problemes, null, 1));
  console.log("\n" + pages + " pages visitées, " + compte.onglets + " onglets ou filtres cliqués, " + compte.choix + " choix de liste essayés ; " + problemes.length + " problème(s) :");
  const parQuoi = {}; problemes.forEach(x => { (parQuoi[x.quoi] = parQuoi[x.quoi] || []).push(x); });
  for (const [q, l] of Object.entries(parQuoi)) { console.log("\n## " + q + " (" + l.length + ")"); l.slice(0, 12).forEach(x => console.log("  - " + x.ou + " : " + x.detail)); }
  console.log(problemes.length ? "\n" + problemes.length + " PROBLÈME(S)" : "\nTOUT EST OK"); process.exit(problemes.length ? 1 : 0);
})().catch(e => { console.error("ARRÊT :", e); process.exit(1); });
