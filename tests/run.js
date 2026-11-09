// Essais de bout en bout de Broodautomate v5 (Playwright, Chromium).
// node run.js <dossier du site> <dossier des captures> [scénarios séparés par des virgules]
"use strict";
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { FakeSupabase } = require("./fake_supabase_server");

const ROOT = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const ONLY = (process.argv[4] || "").split(",").filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const TESTS = __dirname;
// Relevé d'une vraie machine : PAS dans le dépôt (données privées). Le mettre dans tests/donnees/ ou donner son chemin avec BA_AUDIT=…
const DAT = process.env.BA_AUDIT || path.join(TESTS, "donnees", "AUDIT_FASTER_170824020354.dat");
const AUDIT = fs.readFileSync(DAT).toString("latin1").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
const FAKE_SERIAL = fs.readFileSync(path.join(TESTS, "fake_serial.js"), "utf8");
const NM = path.join(TESTS, "node_modules");
const XLSX_JS = path.join(NM, "xlsx/dist/xlsx.full.min.js");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": path.join(NM, "@supabase/supabase-js/dist/umd/supabase.js"),
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": path.join(NM, "chart.js/dist/chart.umd.js"),
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": XLSX_JS
};
const LIBTXT = {}; for (const [u, f] of Object.entries(LIB)) LIBTXT[u] = fs.readFileSync(f, "utf8");

// ---------------- serveur du site ----------------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8", ".sql": "text/plain; charset=utf-8" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
});

// ---------------- résultats ----------------
const fails = [];
function ok(name, cond, info) {
  console.log((cond ? "  OK     " : "  ÉCHEC  ") + name + (info !== undefined && (!cond || process.env.VERBOSE) ? "  → " + (typeof info === "string" ? info : JSON.stringify(info)).slice(0, 600) : ""));
  if (!cond) fails.push(name);
  return !!cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- données de la v3 (tables Supabase actuelles) ----------------
const DAY = 86400000;
function v3Data() {
  const machines = [
    { id: "FAS-202164170", name: "Gare du Midi", city: "Bruxelles", serial: "202164170", model: null, status: "online", temp_c: 16.4, last_seen: "2026-10-20T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    { id: "FAS-202166085", name: "Antwerpen Centraal", city: "Antwerpen", serial: "202166085", model: null, status: "unknown", temp_c: null, last_seen: null, created_at: "2026-01-02T00:00:00Z" }
  ];
  const products = [
    { id: 1, machine_id: "FAS-202164170", selection: 11, name: "Pain blanc", price: 2.5, qty: 8, capacity: 10 },
    { id: 2, machine_id: "FAS-202164170", selection: 19, name: "Pain gris", price: 3.0, qty: 0, capacity: 10 },
    { id: 3, machine_id: "FAS-202166085", selection: 21, name: "Volkoren brood", price: 3.2, qty: 5, capacity: 8 }
  ];
  const sales = [];
  let id = 1;
  const now = Date.now();
  for (let d = 20; d >= 1; d--) {
    const day = new Date(now - d * DAY); day.setHours(0, 0, 0, 0);
    [8, 12, 17].forEach((h, i) => sales.push({ id: id++, machine_id: "FAS-202164170", selection: i === 2 ? 19 : 11, name: i === 2 ? "Pain gris" : "Pain blanc", price: i === 2 ? 3.0 : 2.5, created_at: new Date(day.getTime() + h * 3600000).toISOString() }));
  }
  return { machines, products, sales };
}

// ---------------- appareils (contextes de navigateur) ----------------
let browser;
const allErrors = [];
const IGNORE = [/WebSocket connection to .* failed/i, /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i, /Failed to load resource: net::ERR_CONNECTION_RESET/i, /ERR_INTERNET_DISCONNECTED/, /net::ERR_FAILED/];
async function device(fake, name, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts.ctx || {}));
  for (const u of Object.keys(LIBTXT)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: LIBTXT[u] }));
  if (opts.local) {
    const cfg = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8").replace(/url: "[^"]*"/, 'url: "REMPLACER_ICI"').replace(/key: "[^"]*"/, 'key: "REMPLACER_ICI"');
    await ctx.route("**/js/config.js*", r => r.fulfill({ status: 200, contentType: "application/javascript", body: cfg }));
  }
  if (fake) await fake.attach(ctx, name);
  if (opts.serial) { await ctx.addInitScript("window.__AUDIT__ = " + JSON.stringify(AUDIT) + ";"); await ctx.addInitScript(FAKE_SERIAL); }
  const d = { ctx, name, errors: [], fake };
  ctx.on("page", p => {
    p.on("pageerror", e => { const m = name + " pageerror: " + e.message; d.errors.push(m); allErrors.push(m); });
    p.on("console", m => {
      if (m.type() !== "error") return;
      const t = m.text(), loc = (m.location() || {}).url || "";
      if (IGNORE.some(r => r.test(t))) return;
      // réponses d'erreur attendues de Supabase (mauvais mot de passe, table pas encore créée…) : vérifiées à part
      if (/supabase\.co/.test(loc) && /status of (400|404)/.test(t)) { (d.http = d.http || []).push(t + " " + loc); return; }
      const x = name + " console.error: " + t; d.errors.push(x); allErrors.push(x);
    });
  });
  return d;
}
const URL0 = () => "http://127.0.0.1:" + srv.address().port + "/";
async function open(d, file) {
  const p = await d.ctx.newPage();
  p.on("dialog", dlg => { (d.dialogs = d.dialogs || []).push(dlg.message()); dlg.accept(); });
  await p.goto(URL0() + file);
  return p;
}
async function login(p, email, pass) {
  await p.waitForSelector("#login-email", { timeout: 20000 });
  await p.fill("#login-email", email || "amor@test.be");
  await p.fill("#login-pass", pass || "Secret-123");
  await p.click("#login-go");
}
const ready = p => p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
// v5.11 : barre latérale (PC) ou onglets du bas (téléphone) ; sinon (page cachée) directement
const view = async (p, v) => {
  const b = [`#app-nav button[data-view='${v}']`, `#app-tabbar button[data-view='${v}']`];
  if (await p.isVisible(b[0])) await p.click(b[0]); else if (await p.isVisible(b[1])) await p.click(b[1]); else await p.evaluate(x => BA.Shell.go(x), v);
  await p.mouse.move(900, 300); await p.waitForSelector(`#view-${v}.active`); await sleep(450);
};
// v5.10 : sur le téléphone opérateur, la langue est dans l'onglet « Plus »
async function setLang(p, lang) {
  if (await p.isVisible("#lang-select")) { await p.selectOption("#lang-select", lang); return; }
  if (await p.$("#app-tabbar [data-view=more]")) { await view(p, "more"); await p.selectOption("#more-lang", lang); await sleep(200); return; }
  // v5.11 : PC, barre latérale repliée (la liste des langues n'apparaît qu'au survol)
  await p.mouse.move(30, 820); await sleep(500);
  if (await p.isVisible("#lang-select")) await p.selectOption("#lang-select", lang);
  else await p.evaluate(l => { const x = document.getElementById("lang-select"); x.value = l; x.dispatchEvent(new Event("change", { bubbles: true })); }, lang);
  await p.mouse.move(900, 300); await sleep(300);
}
const synced = (p, ms) => p.waitForFunction(() => BA.Store.status().pending === 0 && BA.Store.status().sync === "ok", null, { timeout: ms || 20000 });
// v5.12 : le câble, la clé USB et « Mes machines » sont dans la page Technique (onglets « cable », « machines »…)
const tech = async (p, tab) => { await view(p, "technique"); await p.click(`[data-tq-tab=${tab}]`); await sleep(350); };
const st = (p, fn, arg) => p.evaluate(fn, arg);
const journal = (p, txt, ms) => p.waitForFunction(t => { const j = document.querySelector("#rs-journal"); return j && j.textContent.includes(t); }, txt, { timeout: ms || 30000 });   // v5.11 : journal replié (textContent)
const qtyOf = (p, num, sel) => p.evaluate(([n, s]) => { const m = BA.Store.get().machines.find(x => x.num === n); const x = m && BA.Model.sel(m, s); return x ? BA.Model.qty(x) : null; }, [num, sel]);
async function shot(p, name, full) { await p.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full !== false }); }
// textes qui ressemblent à une clé de traduction (texte manquant)
async function rawKeys(p) {
  return p.evaluate(() => {
    const keys = new Set(Object.keys(BA.I18n.dicts.fr));
    const txt = document.body.innerText;
    const found = new Set();
    (txt.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).forEach(w => { if (keys.has(w) || /^(ev|evd|rs|usb|eva|sync|login|setup|btn|nav|col|st|sum|cat|fc|cal|sg|kind|rel|mv|hk|by|it|af|per|rr)_/.test(w)) found.add(w); });
    return [...found];
  });
}

// textes EVA-DTS modifiés (comme une vraie machine après des ventes / des erreurs)
const MODIF_AUDIT = `() => {
  let lignes = window.__AUDIT__.split("\\r\\n");
  const idx = p => lignes.findIndex(l => l.startsWith(p));
  let i = idx("VA1*"); let f = lignes[i].split("*");
  f[1] = String(+f[1] + 1050); f[2] = String(+f[2] + 4); f[3] = String(+f[3] + 1050); f[4] = String(+f[4] + 4); lignes[i] = f.join("*");
  const majPa = (sel, n, cents) => { const j = idx("PA1*" + sel + "*"); const k = lignes.findIndex((l, x) => x > j && l.startsWith("PA2*"));
    const g = lignes[k].split("*"); g[1] = String(+g[1] + n); g[2] = String(+g[2] + cents); if (g[3]) g[3] = String(+g[3] + n); lignes[k] = g.join("*"); };
  majPa(11, 3, 750); majPa(19, 1, 300);
  const majLa = (sel, n) => { const j = idx("LA1*0*" + sel + "*"); const g = lignes[j].split("*"); g[4] = String(+g[4] + n); g[5] = String(+g[5] + n); lignes[j] = g.join("*"); };
  majLa(11, 3); majLa(19, 1);
  lignes = lignes.map(l => l === "EA2*EGS****1" ? "EA2*EGS****0" : l);
  let t = lignes.join("\\r\\n");
  t = t.replace(/G85\\*[0-9A-F]{4}/, "G85*" + BA.EvaDts.calculerG85(t));
  window.__AUDIT__ = t;
  const a = BA.EvaDts.parse(t);
  return [a.g85.ok, a.va1.countTotal, a.va1.valueTotal];
}`;
const pad = n => String(n).padStart(2, "0");
const ADD_ERRORS = `() => {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date(), p = new Date(d.getTime() - 25 * 60000);
  const ds = x => String(x.getFullYear()).slice(2) + pad(x.getMonth() + 1) + pad(x.getDate()), hs = x => pad(x.getHours()) + pad(x.getMinutes());
  let lignes = window.__AUDIT__.split("\\r\\n");
  const i = lignes.findIndex(l => l.startsWith("MA5*ERROR"));
  lignes.splice(i, 0, "MA5*ERROR*" + ds(d) + "*" + hs(d) + "*45*54");
  const j = lignes.findIndex(l => l.startsWith("MA5*POW OFF"));
  lignes.splice(j, 0, "MA5*POW OFF*" + ds(p) + "*" + hs(p), "MA5*POW ON*" + ds(d) + "*" + hs(d));
  let k = -1; lignes.forEach((l, x) => { if (l.startsWith("MA5*POW")) k = x; });
  lignes.splice(k + 1, 0, "MA5*TEMPER*" + ds(d) + "*" + hs(d) + "*+205");
  let t = lignes.join("\\r\\n");
  t = t.replace(/G85\\*[0-9A-F]{4}/, "G85*" + BA.EvaDts.calculerG85(t));
  window.__AUDIT__ = t;
  const a = BA.EvaDts.parse(t);
  return [a.g85.ok, a.fasErrors.length, a.powerCuts.length, (a.temperatures || []).length];
}`;
const PUSH_EVENTS = `() => {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date();
  const ds = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()), hs = pad(d.getHours()) + pad(d.getMinutes());
  let t = "DXS*FAS000000001*VA*V1/6*1\\r\\nST*001*0001\\r\\nEA1*ELA_19*" + ds + "*" + hs + "***+120\\r\\nEA2*ELA_19****1\\r\\nEA1*EGS*" + ds + "*" + hs + "***+120\\r\\nEA2*EGS****1\\r\\nG85*0000\\r\\nSE*7*001*0001\\r\\nDXE*1*1\\r\\n";
  t = t.replace("G85*0000", "G85*" + BA.EvaDts.calculerG85(t));
  window.__machine.pousser(t);
  return BA.EvaDts.parse(t).g85.ok;
}`;

// =====================================================================
// 1. Installation (table ba_state absente), connexion, reprise de la v3
//    + 2. téléphone de l'opérateur, « Remplir », synchronisation
//    + 3. câble RS232 : relevés, ventes FIFO, alertes
// =====================================================================
async function scenarioPrincipal() {
  console.log("\n== 1. Installation, connexion et reprise des données de la v3");
  const fake = new FakeSupabase(Object.assign({ baState: false }, v3Data()));
  const pc = await device(fake, "pc", { serial: true });
  const a = await open(pc, "index.html");
  await login(a, "amor@test.be", "mauvais");
  await a.waitForSelector("#boot .alert.err", { timeout: 15000 });
  ok("mauvais mot de passe refusé", (await a.innerText("#boot")).includes("E-mail ou mot de passe incorrect"));
  await login(a);
  await a.waitForSelector("#setup-sql", { timeout: 30000 });
  const sql = await a.innerText("#setup-sql");
  ok("écran d'installation : commandes SQL ba_state, une par une (5 boutons « Copier »)", sql.includes("create table if not exists public.ba_state") && !/supabase_realtime|do \$\$/.test(sql) && (await a.$$("#setup-sql [data-copy-step]")).length === 5, sql.slice(0, 200));
  ok("écran d'installation : lien vers la v3.2", (await a.innerText("#boot")).includes("v3/index.html"));
  await shot(a, "01-installation-sql");
  fake.runSetupSql();
  await a.click("#setup-retry");
  await ready(a);
  ok("appli admin ouverte après le script", true);
  const main = fake.ba("main");
  ok("ba_state : lignes main et hist créées (version 1)", main && main.version === 1 && !!fake.ba("hist"), main && main.version);
  const s0 = await st(a, () => { const s = BA.Store.get(); return { n: s.machines.length, m: s.machines.map(m => ({ num: m.num, id: m.id, street: m.street, city: m.city, region: m.region, temp: m.temp, sels: m.sels.map(x => ({ n: x.n, type: x.type, cap: x.cap, price: x.price, lots: x.lots })) })), days: Object.keys(s.daily).length, sales: Object.values(s.daily).reduce((t, d) => t + Object.values(d).reduce((u, r) => u + (r.s || 0), 0), 0), ev: s.events.map(e => e.code + "#" + e.num) }; });
  ok("reprise v3 : 2 machines numérotées #1 et #2", s0.n === 2 && s0.m[0].num === 1 && s0.m[1].num === 2 && s0.m[0].id === "FAS-202164170", s0.m.map(m => m.num + " " + m.id));
  ok("reprise v3 : adresse, ville et région (Bruxelles / Flandre)", s0.m[0].street === "Gare du Midi" && s0.m[0].region === "bxl" && s0.m[1].region === "vl", s0.m.map(m => m.street + "/" + m.region));
  const sel11 = s0.m[0].sels.find(x => x.n === 11), sel19 = s0.m[0].sels.find(x => x.n === 19);
  ok("reprise v3 : sélection 11 = pain blanc, 8 pains (1 lot « estimé »), 2,50 €", sel11 && sel11.type === "blanc" && sel11.lots.length === 1 && sel11.lots[0].qty === 8 && sel11.lots[0].estimated === true && sel11.price === 2.5, sel11);
  ok("reprise v3 : sélection 19 = pain gris, vide", sel19 && sel19.type === "gris" && sel19.lots.length === 0, sel19);
  ok("reprise v3 : produit inconnu « Volkoren brood » → type complet", s0.m[1].sels[0] && s0.m[1].sels[0].type === "complet", s0.m[1].sels[0]);
  ok("reprise v3 : 60 ventes sur 20 jours dans les statistiques", s0.sales === 60 && s0.days >= 20, s0.sales + " ventes / " + s0.days + " jours");
  ok("reprise v3 : alerte « sélection vide » pour la 19", s0.ev.includes("SEL_EMPTY#1"), s0.ev);
  ok("reprise v3 : température reprise (16,4 °C)", s0.m[0].temp === 16.4, s0.m[0].temp);
  await a.waitForSelector("#view-dashboard .carte-machine, #view-dashboard [data-machine]");
  const dash = await a.innerText("#view-dashboard");
  ok("Dashboard : 2 machines, hors ligne (pas encore de câble)", dash.includes("Gare du Midi") && dash.includes("Antwerpen Centraal") && /Hors ligne/.test(dash));
  ok("en-tête : badge « Sauvegardé » (données dans Supabase)", (await a.innerText("#sync-status")).includes("Sauvegardé"));
  ok("en-tête : plus de mention TEST ni simulateur", !(await a.innerText("#app-header")).match(/TEST|Simulat/i));
  ok("pied de page : version 5.19.0, sans boutons du simulateur", (await a.innerText("#app-footer")).includes("5.19.0") && !(await a.$("#btn-reset")) && !(await a.$("#sim-toggle")));
  await shot(a, "02-admin-dashboard");
  // v5.11 : thème nuit / clair (design de la version test 4.8.6) : sans choix, celui de l'ordinateur
  const sys = await a.evaluate(() => matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"), autre = sys === "light" ? "dark" : "light";
  ok("sans choix : le thème suit l'ordinateur (" + sys + ")", (await a.getAttribute("html", "data-theme")) === null && (await a.evaluate(() => BA.Theme.get())) === sys);
  ok("thème clair : vraies couleurs (fond crème), plus d'inversion de l'écran", await a.evaluate(() => { document.documentElement.dataset.theme = "light"; const bg = getComputedStyle(document.body).backgroundColor, f = getComputedStyle(document.documentElement).filter; delete document.documentElement.dataset.theme; return bg === "rgb(244, 240, 233)" && (f === "none" || !f); }));
  await a.click("#theme-toggle"); await a.mouse.move(900, 300); await a.waitForTimeout(300);
  ok("bouton soleil / lune : l'autre thème appliqué et gardé", (await a.getAttribute("html", "data-theme")) === autre && (await a.evaluate(() => localStorage.getItem("ba_theme"))) === autre);
  await shot(a, "02b-admin-" + autre);
  await a.reload(); await a.waitForSelector("#theme-toggle", { state: "attached" });
  ok("thème gardé après rechargement", (await a.getAttribute("html", "data-theme")) === autre);
  await a.click("#theme-toggle"); await a.mouse.move(900, 300);
  ok("re-clic : retour au premier thème", (await a.getAttribute("html", "data-theme")) === sys);

  // ---------------- 2. Téléphone de l'opérateur ----------------
  console.log("\n== 2. Appli opérateur sur le téléphone, « Remplir », synchronisation");
  const tel = await device(fake, "tel", { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const o = await open(tel, "operateur.html");
  await login(o);
  await ready(o);
  ok("téléphone : mêmes données (2 machines), sans nouvelle reprise", (await st(o, () => BA.Store.get().machines.length)) === 2 && fake.ba("main").version === 1, fake.ba("main").version);
  await shot(o, "10-op-dashboard");
  await view(o, "products");
  await o.click("#fill-btn");
  await o.waitForSelector("#inv-yes");
  await shot(o, "11-op-remplir-inventaire", false);
  await o.click("#inv-yes");
  await o.waitForSelector("#rm-next, #rm-yes");
  if (await o.$("#rm-next")) await o.click("#rm-next"); else await o.click("#rm-no");
  await o.waitForSelector("#ld-validate");
  // v5.19 : remplissage spontané (aucune commande de l'admin) : tout à 0, pas de quantité « conseillée »
  ok("Remplir sans commande : chargement à 0 par défaut (sél. 11 et 19), pas de « conseillé »", (await o.inputValue("#ld-11-0")) === "0" && (await o.inputValue("#ld-19-0")) === "0" && !/conseillé/.test(await o.innerText(".wz")) && /sans commande/.test(await o.innerText(".modal")), [await o.inputValue("#ld-11-0"), await o.inputValue("#ld-19-0")]);
  await o.fill("#ld-11-0", "2"); await o.fill("#ld-19-0", "10");
  ok("Remplir : le « Total à charger » suit la saisie (12)", /: 12 /.test(await o.innerText("#ld-total")), await o.innerText("#ld-total"));
  await shot(o, "12-op-remplir-chargement", false);
  await o.click("#ld-validate");
  await o.waitForSelector("#wz-close");
  await o.click("#wz-close");
  await synced(o);
  ok("téléphone : stock 11 = 10, 19 = 10", (await qtyOf(o, 1, 11)) === 10 && (await qtyOf(o, 1, 19)) === 10);
  let t0 = Date.now();
  await a.waitForFunction(() => { const m = BA.Store.get().machines.find(x => x.num === 1); return m && BA.Model.qty(BA.Model.sel(m, 19)) === 10; }, null, { timeout: 15000 }).catch(() => {});
  ok("PC admin : chargement du téléphone reçu (temps réel)", (await qtyOf(a, 1, 19)) === 10, (Date.now() - t0) + " ms");
  ok("PC admin : reçu en moins de 5 s", Date.now() - t0 < 5000, (Date.now() - t0) + " ms");
  const it = await st(a, () => BA.Store.get().interventions[0]);
  ok("intervention terminée enregistrée (opérateur)", it && it.status === "done" && it.load.reduce((t, r) => t + r.qty, 0) === 12, it && it.status);
  const jop = await st(a, () => BA.Store.get().journal.filter(e => e.k === "load").map(e => e.b + ":" + e.s + ":" + e.q));
  ok("historique : chargements notés « op »", jop.includes("op:11:2") && jop.includes("op:19:10"), jop);

  // ---------------- 3. Câble RS232 ----------------
  console.log("\n== 3. Câble RS232 : relevés, ventes (lots les plus anciens d'abord), alertes");
  await tech(a, "cable");
  ok("onglet RS232 : réglages de la v3.2 (9600 bauds, liste 2)", (await a.inputValue("#rs-vitesse")) === "9600" && await a.isChecked("input[name=rs-liste][value='2']"));
  await a.selectOption("#rs-machine", "FAS-202164170");
  await a.click("#btn-rs-connecter");
  await journal(a, "Port ouvert");
  ok("port ouvert à 9600 bauds, DTR/RTS", (await a.evaluate(() => window.__port.ouvertAvec.baudRate)) === 9600 && (await a.evaluate(() => JSON.stringify(window.__port.signaux))) !== undefined);
  ok("badge RS232 « connecté »", /connecté/i.test(await a.innerText("#serial-status")) && !/déconnecté/i.test(await a.innerText("#serial-status")));
  await a.click("#btn-rs-lire");
  await journal(a, "premier relevé enregistré");
  ok("liste 2 demandée, FINISH reçu", JSON.stringify(await a.evaluate(() => window.__machine.listes)) === "[2]" && (await a.evaluate(() => window.__machine.finis)) >= 1);
  ok("Supabase : 1 relevé (audits) pour la machine", fake.t.audits.length === 1 && fake.t.audits[0].machine_id === "FAS-202164170" && fake.t.audits[0].total_count === 2236, fake.t.audits.length);
  await synced(a);
  let m1 = await st(a, () => { const m = BA.Store.get().machines.find(x => x.num === 1); return { online: m.online, link: m.link, lastSeen: m.lastSeen, ev: BA.Store.get().events.filter(e => e.num === 1).map(e => e.code + (e.resolved ? "-r" : "")) }; });
  ok("machine #1 en ligne après le relevé", m1.online === true && m1.link === true, m1);
  ok("alerte « Premier relevé » (réglée)", m1.ev.includes("READ_FIRST-r"), m1.ev);
  const hist = await st(a, () => BA.Store.get().events.filter(e => e.num === 1 && /MACHINE_EVENT|FAS_ERROR|POWER_LOG/.test(e.code)).map(e => ({ c: e.code, r: e.resolved, code: e.data.code, n: e.data.count })));
  ok("journal de la machine repris en historique (réglé) : E45 ×2, EOA ×2, ECF_38, FAS 45, 10 coupures", hist.length > 0 && hist.every(e => e.r) && hist.some(e => e.code === "E45" && e.n === 2) && hist.some(e => e.code === "EOA") && hist.some(e => e.code === "ECF_38") && hist.some(e => e.c === "FAS_ERROR" && String(e.code) === "45") && hist.filter(e => e.c === "POWER_LOG").length === 10, hist);
  const d1 = await st(a, () => { const s = BA.Store.get(), m = s.machines.find(x => x.num === 1); return { door: m.door, open: s.events.some(e => e.num === 1 && e.code === "DOOR_OPEN" && !e.resolved), tech: s.events.filter(e => e.num === 1 && !e.resolved && e.cat === "tech").map(e => e.code) }; });
  ok("porte ouverte dans le relevé (EGS actif) → « Porte ouverte »", d1.door === true && d1.open, d1);
  ok("aucune alerte technique active au premier relevé", d1.tech.length === 0, d1.tech);
  ok("stock inchangé au premier relevé (11 = 10, 19 = 10)", (await qtyOf(a, 1, 11)) === 10 && (await qtyOf(a, 1, 19)) === 10);
  await shot(a, "03-rs232-premier-releve");

  // ventes
  const mod = await a.evaluate(new Function("return (" + MODIF_AUDIT + ")()"));
  ok("relevé modifié valide (G85 ok, 2240 ventes)", mod[0] === true && mod[1] === 2240, mod);
  await a.click("#btn-rs-lire");
  await journal(a, "+4 ventes");
  await synced(a);
  const d2 = await st(a, () => { const s = BA.Store.get(); return { door: s.machines.find(x => x.num === 1).door, open: s.events.some(e => e.num === 1 && e.code === "DOOR_OPEN" && !e.resolved) }; });
  ok("porte refermée (EGS inactif) → alerte réglée", d2.door === false && !d2.open, d2);
  ok("ventes : 11 → 7 (3 vendus), 19 → 9 (1 vendu)", (await qtyOf(a, 1, 11)) === 7 && (await qtyOf(a, 1, 19)) === 9, [await qtyOf(a, 1, 11), await qtyOf(a, 1, 19)]);
  const lots11 = await st(a, () => BA.Model.sel(BA.Store.get().machines.find(x => x.num === 1), 11).lots.map(l => ({ q: l.qty, est: !!l.estimated, d: l.date })));
  ok("FIFO : les ventes sortent d'abord du lot le plus ancien", lots11.length >= 1 && lots11.reduce((t, l) => t + l.q, 0) === 7, lots11);
  const today = await st(a, () => { const s = BA.Store.get(); const r = (s.daily[BA.Model.dayKey(s.now)] || {})[1] || {}; return { s: r.s, r: r.r, y: r.y, l: r.l }; });
  ok("statistiques du jour : 4 ventes, 10,50 €, par type (3 blanc, 1 gris)", today.s === 4 && Math.abs(today.r - 10.5) < 1e-9 && today.y && today.y.blanc === 3 && today.y.gris === 1, today);
  const js = await st(a, () => BA.Store.get().journal.filter(e => e.k === "sale").map(e => e.s + ":" + e.p + ":" + e.b));
  ok("historique : 4 ventes (3 × 2,50 € sél. 11, 1 × 3,00 € sél. 19)", js.length === 4 && js.filter(x => x === "11:2.5:sim").length === 3 && js.includes("19:3:sim"), js);
  ok("Supabase : 2e relevé avec +4 ventes", fake.t.audits.length === 2 && fake.t.audits[1].delta_count === 4, fake.t.audits.map(x => x.delta_count));
  t0 = Date.now();
  await o.waitForFunction(() => { const m = BA.Store.get().machines.find(x => x.num === 1); return BA.Model.qty(BA.Model.sel(m, 11)) === 7; }, null, { timeout: 15000 }).catch(() => {});
  ok("téléphone : ventes reçues (stock 11 = 7)", (await qtyOf(o, 1, 11)) === 7, (Date.now() - t0) + " ms");

  // relevé identique
  await a.click("#btn-rs-lire");
  await journal(a, "aucun changement depuis le relevé précédent");
  await synced(a);
  ok("relevé identique : pas de vente en double, pas de relevé en plus", (await st(a, () => BA.Store.get().journal.filter(e => e.k === "sale").length)) === 4 && fake.t.audits.length === 2);

  // erreurs, coupure, température
  const er = await a.evaluate(new Function("return (" + ADD_ERRORS + ")()"));
  ok("relevé avec erreur FAS 45, coupure et 20,5 °C (G85 ok)", er[0] === true, er);
  await a.click("#btn-rs-lire");
  await journal(a, "nouveaux événements");
  await synced(a);
  const evs = await st(a, () => BA.Store.get().events.filter(e => e.num === 1).map(e => ({ c: e.code, r: e.resolved, d: e.data })));
  const fas = evs.find(e => e.c === "FAS_ERROR"), pow = evs.find(e => e.c === "POWER_LOG"), th = evs.find(e => e.c === "TEMP_HIGH");
  ok("alerte erreur FAS 45 avec titre, explication et solution", fas && !fas.r && String(fas.d.code) === "45" && fas.d.title && fas.d.expl && fas.d.sol, fas);
  ok("alerte coupure de courant (de … à …)", pow && pow.r && /\d/.test(pow.d.off) && /\d/.test(pow.d.on), pow);
  ok("alerte température trop haute (20,5 °C)", th && !th.r && th.d.temp === 20.5, th);
  const dayO = await st(a, () => { const s = BA.Store.get(); return ((s.daily[BA.Model.dayKey(s.now)] || {})[1] || {}).o; });
  ok("coupure comptée dans la journée (≈ 0,42 h)", dayO > 0.3 && dayO < 0.5, dayO);
  await view(a, "alerts");
  const al = await a.innerText("#view-alerts");
  ok("page Alertes : erreur FAS avec « À faire »", /Erreur FAS 45/.test(al) && /À faire/.test(al), al.slice(0, 400));
  ok("page Alertes : température 20,5 °C", /20,5/.test(al));
  await shot(a, "04-alertes-machine");

  // la machine envoie elle-même des événements (porte ouverte + échec de distribution)
  await tech(a, "cable");
  ok("événements préparés (G85 ok)", await a.evaluate(new Function("return (" + PUSH_EVENTS + ")()")));
  await a.waitForFunction(() => BA.Store.get().events.some(e => e.code === "MACHINE_EVENT" && e.data.code === "ELA_19"), null, { timeout: 30000 });
  await synced(a);
  const m1b = await st(a, () => { const s = BA.Store.get(), m = s.machines.find(x => x.num === 1); return { door: m.door, ev: s.events.filter(e => e.num === 1 && !e.resolved).map(e => e.code + ":" + (e.data.code || "")), st: BA.Model.stats(s, m).st }; });
  ok("porte ouverte (EGS) → alerte « Porte ouverte » et statut", m1b.door === true && m1b.ev.includes("DOOR_OPEN:") && m1b.st === "door", m1b);
  ok("échec de distribution ELA_19 → alerte avec titre", m1b.ev.includes("MACHINE_EVENT:ELA_19"), m1b.ev);
  if (process.env.DEBUG) console.log("DEBUG", JSON.stringify(await st(a, () => ({ j: BA.Rs232._journal().slice(0, 8).map(l => l.texte), ev: BA.Store.get().events.filter(e => e.code === "MACHINE_EVENT").map(e => [e.id, e.resolved, e.resolvedAt, e.data.code, e.data.active, e.data.until]) })), null, 1));
  await view(a, "alerts");
  const al2 = await a.innerText("#view-alerts");
  ok("page Alertes : ELA_19 avec explication et heure machine", /ELA_19/.test(al2) && /horloge machine/.test(al2), al2.slice(0, 300));
  await o.waitForFunction(() => BA.Store.get().machines.find(x => x.num === 1).door === true, null, { timeout: 15000 }).catch(() => {});
  await view(o, "alerts");
  const alo = await o.innerText("#view-alerts");
  ok("téléphone : alertes porte + FAS visibles", /Porte ouverte/i.test(alo) && /Erreur FAS 45/.test(alo), alo.slice(0, 300));
  await shot(o, "13-op-alertes");

  // ---------------- import par clé USB (machine #2) ----------------
  console.log("\n== 3b. Import d'un relevé par clé USB");
  await tech(a, "cable");
  await a.selectOption("#usb-machine", "FAS-202166085");
  await a.setInputFiles("#usb-file", DAT);
  await a.waitForSelector("#dlg-ok", { timeout: 10000 });
  const dlg = await a.innerText(".dlg-modal");
  ok("USB : fenêtre de confirmation (premier relevé = point de départ)", /point de départ/.test(dlg) && /2236/.test(dlg.replace(/\s/g, "")), dlg);
  await a.click("#dlg-ok");
  await a.waitForFunction(() => BA.Store.get().events.some(e => e.num === 2 && e.code === "READ_FIRST"), null, { timeout: 10000 });
  await synced(a);
  ok("USB : relevé enregistré pour la machine #2", fake.t.audits.filter(x => x.machine_id === "FAS-202166085").length === 1 && fake.t.audits.find(x => x.machine_id === "FAS-202166085").source === "usb");
  const m2 = await st(a, () => { const m = BA.Store.get().machines.find(x => x.num === 2); return { link: m.link, lastSeen: m.lastSeen, online: m.online }; });
  ok("USB : « données reçues » sans marquer la machine comme reliée", m2.lastSeen > 0 && m2.link === false && m2.online === false, m2);
  await a.setInputFiles("#usb-file", DAT);
  await sleep(800);
  ok("USB : même fichier une 2e fois → « identique », rien d'importé", !(await a.$("#dlg-ok")) && fake.t.audits.filter(x => x.machine_id === "FAS-202166085").length === 1);

  // liste 1 : avertissement (v5.12 : page Technique, onglet Câble, réglage replié sous « Quelle liste lire »)
  await a.click("[data-tq-tab=cable]");
  await a.click("details.rs-more:has(input[name=rs-liste]) > summary");
  await a.click("input[name=rs-liste][value='1']");
  await a.waitForSelector("#dlg-ok");
  ok("liste 1 : avertissement avant de changer", /Erase interim data|interim/i.test(await a.innerText(".dlg-modal")));
  await a.click("#dlg-cancel");
  ok("liste 1 annulée : on reste en liste 2", (await a.evaluate(() => JSON.parse(localStorage.getItem("broodautomate_rs232")).liste)) === 2 && await a.isChecked("input[name=rs-liste][value='2']"));

  return { fake, pc, tel, a, o };
}

// =====================================================================
// 4. Conflits d'écriture, réponse perdue, réseau coupé, rechargement
// =====================================================================
async function scenarioSync(ctx) {
  console.log("\n== 4. Deux appareils qui écrivent en même temps, réseau coupé");
  const { fake, a, o } = ctx;
  // a) le téléphone retire un pain hors ligne pendant que le PC change un réglage
  fake.setOffline("tel", true);
  const lot = await st(o, () => BA.Model.sel(BA.Store.get().machines.find(x => x.num === 2), 21).lots[0].id);
  const r1 = await st(o, l => BA.Actions.removeBread(2, 21, [{ lotId: l, qty: 1 }], "damaged", "abîmé"), lot);
  ok("téléphone hors ligne : retrait fait sur l'appareil", r1 && r1.removed === 1 && (await qtyOf(o, 2, 21)) === 4, r1);
  await o.waitForFunction(() => BA.Store.status().sync === "offline", null, { timeout: 20000 }).catch(() => {});
  ok("téléphone : badge « Hors ligne »", (await o.innerText("#sync-status")).includes("Hors ligne"), await o.innerText("#sync-status"));
  await shot(o, "14-op-hors-ligne", false);
  await st(a, () => BA.Actions.saveSettings({ tempMax: 19 }));
  await synced(a);
  const v1 = fake.ba("main").version;
  fake.setOffline("tel", false);
  await st(o, () => window.dispatchEvent(new Event("online")));
  await synced(o, 30000).catch(() => {});
  const main = fake.ba("main").data;
  const q21 = BA_qty(main, 2, 21);
  ok("après le retour du réseau : le retrait ET le réglage sont gardés", q21 === 4 && main.settings.tempMax === 19, { q21, tempMax: main.settings.tempMax, version: fake.ba("main").version, avant: v1 });
  ok("téléphone : même version que la base", (await qtyOf(o, 2, 21)) === 4 && (await st(o, () => BA.Store.get().settings.tempMax)) === 19);
  await a.waitForFunction(() => BA.Model.qty(BA.Model.sel(BA.Store.get().machines.find(x => x.num === 2), 21)) === 4, null, { timeout: 15000 }).catch(() => {});
  ok("PC : retrait du téléphone reçu", (await qtyOf(a, 2, 21)) === 4);
  const rm = main.journal.filter(e => e.k === "rm" && e.n === 2);
  ok("historique : un seul retrait (pas de doublon)", rm.length === 1, rm.length);

  // b) écrit dans la base mais la réponse se perd : pas refait en double
  fake.device("pc").dropNext = 1;
  const err = await st(a, () => BA.Actions.calendarAdd({ kind: "event", from: "2026-12-05", to: "2026-12-05", name: "Marché de Noël (essai)", scope: "all", effect: 20 }));
  ok("événement du calendrier ajouté", err === null, err);
  await sleep(500);
  await synced(a, 30000).catch(() => {});
  const nCal = fake.ba("main").data.calendar.filter(e => e.name === "Marché de Noël (essai)").length;
  ok("réponse perdue : l'ajout n'est pas fait deux fois", nCal === 1 && (await st(a, () => BA.Store.get().calendar.filter(e => e.name === "Marché de Noël (essai)").length)) === 1, nCal);

  // c) les deux appareils écrivent exactement en même temps
  const before = fake.ba("main").version;
  await Promise.all([
    st(a, () => BA.Actions.saveSettings({ salePrice: 2.6 })),
    st(o, () => { const m = BA.Store.get().machines.find(x => x.num === 2); return BA.Actions.removeBread(2, 21, [{ lotId: BA.Model.sel(m, 21).lots[0].id, qty: 1 }], "gift", ""); })
  ]);
  await Promise.all([synced(a, 30000).catch(() => {}), synced(o, 30000).catch(() => {})]);
  await sleep(1500);
  const m3 = fake.ba("main").data;
  ok("écritures simultanées : les deux sont gardées", m3.settings.salePrice === 2.6 && BA_qty(m3, 2, 21) === 3, { prix: m3.settings.salePrice, q: BA_qty(m3, 2, 21), versions: before + " → " + fake.ba("main").version });
  const [qa, qo] = [await qtyOf(a, 2, 21), await qtyOf(o, 2, 21)];
  ok("PC et téléphone affichent la même chose", qa === 3 && qo === 3, [qa, qo]);

  // d) hors ligne, page fermée puis rouverte : la modification n'est pas perdue
  fake.setOffline("tel", true);
  const lot2 = await st(o, () => BA.Model.sel(BA.Store.get().machines.find(x => x.num === 1), 19).lots[0].id);
  await st(o, l => BA.Actions.removeBread(1, 19, [{ lotId: l, qty: 2 }], "old", ""), lot2);
  await sleep(300);
  await o.reload();
  await ready(o);
  ok("rouvert hors ligne : copie de l'appareil, retrait toujours là", (await qtyOf(o, 1, 19)) === 7 && (await st(o, () => BA.Store.status().sync)) === "offline", await qtyOf(o, 1, 19));
  fake.setOffline("tel", false);
  await st(o, () => window.dispatchEvent(new Event("online")));
  await synced(o, 30000).catch(() => {});
  ok("réseau revenu : retrait envoyé à la base", BA_qty(fake.ba("main").data, 1, 19) === 7, BA_qty(fake.ba("main").data, 1, 19));

  // e) hors ligne, page rouverte, et un autre appareil a écrit entre-temps : message, copie gardée
  fake.setOffline("tel", true);
  const lot3 = await st(o, () => BA.Model.sel(BA.Store.get().machines.find(x => x.num === 1), 19).lots[0].id);
  await st(o, l => BA.Actions.removeBread(1, 19, [{ lotId: l, qty: 1 }], "old", ""), lot3);
  await sleep(300);
  await o.reload();
  await ready(o);
  await st(a, () => BA.Actions.saveSettings({ tempMin: 13 }));
  await synced(a);
  fake.setOffline("tel", false);
  await st(o, () => window.dispatchEvent(new Event("online")));
  await o.waitForFunction(() => !!BA.Store.status().lost, null, { timeout: 30000 }).catch(() => {});
  const lost = await st(o, () => ({ lost: !!BA.Store.status().lost, copie: !!localStorage.getItem("broodautomate-v5-perdu"), toast: (document.getElementById("toast") || {}).textContent || "" }));
  ok("conflit après réouverture : message et copie gardée sur l'appareil", lost.lost && lost.copie && /n'ont pas pu être envoyées/.test(lost.toast), lost);
  await synced(o, 30000).catch(() => {});
  ok("… et l'appareil reprend la version de la base (réglage du PC)", (await st(o, () => BA.Store.get().settings.tempMin)) === 13);
}
function BA_qty(main, num, sel) {
  const m = main.machines.find(x => x.num === num); if (!m) return null;
  const s = m.sels.find(x => x.n === sel); return s ? s.lots.reduce((t, l) => t + l.qty, 0) : null;
}

// =====================================================================
// 5. Tous les onglets, en FR / NL / EN, PC et téléphone : pas d'erreur, pas de texte manquant
// =====================================================================
async function scenarioEcrans(ctx) {
  console.log("\n== 5. Tous les écrans (FR / NL / EN, PC et téléphone)");
  const { a, o, fake } = ctx;
  const adminViews = ["dashboard", "details", "products", "order", "stats", "history", "alerts", "rs232", "technique", "settings"];
  const opViews = ["todo", "fill", "alerts", "more", "details", "products", "history", "rs232", "dashboard", "missions"];
  for (const lang of ["fr", "nl", "en"]) {
    await setLang(a, lang); await sleep(300);
    await setLang(o, lang); await sleep(300);
    for (const v of adminViews) {
      await view(a, v);
      const keys = await rawKeys(a);
      ok(`admin ${lang} « ${v} » : pas de texte manquant`, keys.length === 0, keys);
      if (lang === "fr" || ["dashboard", "rs232", "alerts", "details"].includes(v)) await shot(a, `20-admin-${lang}-${v}`);
      // v5.12 : chaque onglet de la page Technique
      if (v === "technique") for (const tb of ["machines", "cable", "journal", "system", "boxes"]) {
        await a.click(`[data-tq-tab=${tb}]`); await sleep(300);
        await a.waitForFunction(() => !BA.Technique._journal().busy && !BA.Technique._system().busy, null, { timeout: 10000 }).catch(() => {});
        const k2 = await rawKeys(a);
        ok(`admin ${lang} « technique / ${tb} » : pas de texte manquant`, k2.length === 0, k2);
        if (lang === "fr") await shot(a, `21-admin-technique-${tb}`);
      }
    }
    for (const v of opViews) {
      await view(o, v);
      const keys = await rawKeys(o);
      ok(`téléphone ${lang} « ${v} » : pas de texte manquant`, keys.length === 0, keys);
      if (lang === "fr" || ["todo", "fill", "more"].includes(v)) await shot(o, `30-op-${lang}-${v}`);
      const wide = await o.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(`téléphone ${lang} « ${v} » : pas de défilement horizontal de la page`, wide <= 1, wide);
    }
  }
  await setLang(a, "fr"); await setLang(o, "fr");
  // badge RS232 gardé après le changement de langue
  ok("badge RS232 toujours « connecté » après changement de langue", /connecté/i.test(await a.innerText("#serial-status")) && !/déconnecté/i.test(await a.innerText("#serial-status")), await a.innerText("#serial-status"));
  // Commander : prévision confirmée, plan, missions envoyées au téléphone
  await view(a, "order");
  await a.click("[data-q=q1][data-v='1']");
  await a.click("[data-q=q2][data-v='0']");
  await a.click("#calc");
  await a.waitForSelector("#fc-calc", { timeout: 10000 });
  if (await a.$("#fc-all")) await a.click("#fc-all");
  await a.waitForSelector("#fc-calc:not([disabled])", { timeout: 10000 });
  await a.click("#fc-calc");
  await a.waitForSelector("#send", { timeout: 10000 });
  await shot(a, "21-admin-commande-plan");
  await a.click("[data-lm=full]");                 // « remplir à fond » : il y a quelque chose à charger
  await a.waitForSelector("[data-lm=full].active", { timeout: 5000 });
  await a.click("#send");
  await synced(a);
  const nMis = fake.ba("main").data.missions.filter(x => x.status === "open").length;
  ok("Commander : missions envoyées (dans la base)", nMis >= 1, nMis);
  await o.waitForFunction(() => BA.Store.get().missions.some(x => x.status === "open"), null, { timeout: 15000 }).catch(() => {});
  await view(o, "missions");
  ok("téléphone : missions reçues", (await o.$$("#view-missions .mission-card")).length >= 1);
  await shot(o, "15-op-missions");
  // Déconnexion
  await tech(a, "cable");
  await a.click("#btn-rs-deconnecter");
  await sleep(500);
  ok("câble déconnecté : badge et machine « hors ligne » (plus de lien)", /déconnecté/i.test(await a.innerText("#serial-status")) && (await st(a, () => BA.Store.get().machines.find(x => x.num === 1).link)) === false);
  await st(a, () => BA.Live.check());
  const dd = await st(a, () => { const s = BA.Store.get(); return { door: s.machines.find(x => x.num === 1).door, open: s.events.some(e => e.num === 1 && e.code === "DOOR_OPEN" && !e.resolved) }; });
  ok("sans câble : la porte n'est plus affichée ouverte", dd.door === false && !dd.open, dd);
}

// =====================================================================
// 6. Parc vide (aucune machine dans la v3), ajout d'une machine à la main
// =====================================================================
async function scenarioVide() {
  console.log("\n== 6. Aucune machine au départ, ajout à la main");
  const fake = new FakeSupabase({ machines: [], products: [], sales: [] });
  const pc = await device(fake, "pc2");
  const a = await open(pc, "index.html");
  await login(a); await ready(a);
  ok("parc vide : message sur le Dashboard", (await a.innerText("#view-dashboard")).includes("Aucune machine pour l'instant"));
  for (const v of ["details", "products", "order", "stats", "history", "alerts", "rs232", "technique", "settings"]) {
    await view(a, v);
  }
  await view(a, "order"); await a.click("#view-order .seg.tabs [data-tab=fc]");
  for (const sb of ["cal", "prof", "ly"]) { await a.click(`[data-sub=${sb}]`); await sleep(250); }
  await a.click("[data-lymode=past]"); await sleep(250);
  await a.click("#go-bk"); await a.waitForSelector("#bk-save", { timeout: 5000 }).catch(() => {});
  await view(a, "stats");
  for (const tb of ["returns", "acc", "money"]) { await a.click(`[data-sttab=${tb}]`); await sleep(250); }
  await view(a, "technique");
  for (const tb of ["boxes", "cable", "journal", "system", "machines"]) { await a.click(`[data-tq-tab=${tb}]`); await sleep(250); }
  ok("parc vide : tous les onglets s'ouvrent sans erreur", pc.errors.length === 0, pc.errors);
  await tech(a, "machines");
  await a.fill("#man-id", "202199999");
  await a.fill("#man-street", "Rue Neuve 1");
  await a.fill("#man-city", "Bruxelles");
  await a.click("[data-add=man]");
  await a.waitForFunction(() => BA.Store.get().machines.length === 1, null, { timeout: 10000 });
  const m = await st(a, () => BA.Store.get().machines[0]);
  ok("machine ajoutée : #1, FAS-202199999, Bruxelles (région bxl)", m.num === 1 && m.id === "FAS-202199999" && m.region === "bxl", m);
  await synced(a);
  ok("machine ajoutée aussi dans la table machines de Supabase", fake.t.machines.some(x => x.id === "FAS-202199999" && x.name === "Rue Neuve 1"));
  await a.fill("#mm-street-1", "Rue Neuve 12");
  await a.press("#mm-street-1", "Tab");
  await a.waitForFunction(() => BA.Store.get().machines[0].street === "Rue Neuve 12", null, { timeout: 5000 }).catch(() => {});
  await synced(a);
  ok("adresse modifiée (et dans Supabase)", (await st(a, () => BA.Store.get().machines[0].street)) === "Rue Neuve 12" && fake.t.machines.find(x => x.id === "FAS-202199999").name === "Rue Neuve 12");
  await a.fill("#mm-num-1", "7");
  await a.press("#mm-num-1", "Tab");
  await a.waitForFunction(() => BA.Store.get().machines[0].num === 7, null, { timeout: 5000 }).catch(() => {});
  ok("numéro changé : #1 → #7", (await st(a, () => BA.Store.get().machines[0].num)) === 7);
  await shot(a, "40-parc-vide-ajout");
  // l'opérateur la voit
  const tel = await device(fake, "tel2", { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  const o = await open(tel, "operateur.html");
  await login(o); await ready(o);
  await view(o, "fill");
  ok("opérateur : la nouvelle machine #7 est là (onglet Remplir)", (await o.innerText("#view-fill")).includes("Rue Neuve 12") && /#7/.test(await o.innerText("#view-fill")));
  // suppression
  await a.click("[data-mdel='7']");
  await a.waitForSelector("#dlg-ok");
  await a.click("#dlg-ok");
  await a.waitForFunction(() => BA.Store.get().machines.length === 0, null, { timeout: 5000 });
  await synced(a);
  ok("machine supprimée (et dans Supabase)", !fake.t.machines.some(x => x.id === "FAS-202199999"));
  await o.waitForFunction(() => BA.Store.get().machines.length === 0, null, { timeout: 15000 }).catch(() => {});
  ok("opérateur : machine disparue", (await st(o, () => BA.Store.get().machines.length)) === 0);
  ok("aucune erreur (parc vide)", pc.errors.length === 0 && tel.errors.length === 0, pc.errors.concat(tel.errors));
  await pc.ctx.close(); await tel.ctx.close();
}

// =====================================================================
// 6b. Fonctions reprises de la version test 4.8.9 (v5.6) : À faire aujourd'hui, Zéro retour,
//     Fiabilité, résumé de la semaine, Commander & prévisions (an dernier), sauvegardes, ⇄ déplacer
// =====================================================================
function data489() {
  const machines = [
    { id: "FAS-202164170", name: "Gare du Midi", city: "Bruxelles", serial: "202164170", model: null, status: "online", temp_c: 16.4, last_seen: null, created_at: "2025-01-01T00:00:00Z" },
    { id: "FAS-202166085", name: "Antwerpen Centraal", city: "Antwerpen", serial: "202166085", model: null, status: "unknown", temp_c: null, last_seen: null, created_at: "2025-01-02T00:00:00Z" }
  ];
  const products = [
    { id: 1, machine_id: "FAS-202164170", selection: 11, name: "Pain blanc", price: 2.5, qty: 8, capacity: 10 },
    { id: 2, machine_id: "FAS-202164170", selection: 12, name: "Pain blanc", price: 2.5, qty: 2, capacity: 10 },
    { id: 3, machine_id: "FAS-202164170", selection: 19, name: "Pain gris", price: 3.0, qty: 4, capacity: 10 },
    { id: 4, machine_id: "FAS-202166085", selection: 21, name: "Volkoren brood", price: 3.2, qty: 5, capacity: 8 }
  ];
  const sales = [];
  let id = 1;
  const now = Date.now();
  for (let d = 430; d >= 1; d--) {
    const day = new Date(now - d * DAY); day.setHours(0, 0, 0, 0);
    const wd = day.getDay(), nA = 5 + (wd === 1 ? 2 : 0) - (wd === 3 ? 1 : 0);
    const add = (mid, sel, name, price, h) => sales.push({ id: id++, machine_id: mid, selection: sel, name, price, created_at: new Date(day.getTime() + h * 3600000).toISOString() });
    for (let i = 0; i < nA; i++) add("FAS-202164170", 11, "Pain blanc", 2.5, 7 + i);
    add("FAS-202164170", 19, "Pain gris", 3.0, 13);
    for (let i = 0; i < 3; i++) add("FAS-202166085", 21, "Volkoren brood", 3.2, 8 + i * 3);
  }
  return { machines, products, sales };
}
async function scenario489() {
  console.log("\n== 6b. Fonctions de la version test 4.8.9");
  const XLSX = require(XLSX_JS);
  const fake = new FakeSupabase(data489());
  const pc = await device(fake, "pc489", { ctx: { acceptDownloads: true } });
  const a = await open(pc, "index.html");
  await login(a); await ready(a);
  const nDays = await st(a, () => Object.keys(BA.Store.get().daily).length);
  ok("reprise v3 : les 400 derniers jours de ventes (pour « l'an dernier »)", nDays >= 398, nDays);
  // pains mis / retournés / heures vides des 8 dernières semaines (ce que l'appli opérateur et les relevés enregistrent)
  await st(a, () => BA.Store.update(s => {
    const M = BA.Model;
    for (let d = 56; d >= 1; d--) {
      const k = M.dayKey(s.now - d * 86400000), day = s.daily[k] = s.daily[k] || {};
      const A = day[1] = day[1] || { s: 0, r: 0, l: 0, x: 0, c: 0 }; A.l = A.s + 1; A.x = 1;
      const B = day[2] = day[2] || { s: 0, r: 0, l: 0, x: 0, c: 0 }; B.l = B.s; B.x = 0; if (d % 7 === 2) B.e = 5;
    }
    s.histRev = (s.histRev || 0) + 1;
  }));
  await synced(a);

  // --- Dashboard : « À faire aujourd'hui »
  await view(a, "dashboard");
  const td = await a.innerText(".todo-card").catch(() => "");
  ok("Dashboard : bloc « À faire aujourd'hui » (admin)", td.includes("À faire aujourd'hui") && (await a.$$(".todo-card [data-todo]")).length >= 1, td.slice(0, 200));
  ok("À faire : ligne des retours de la semaine dernière face à l'objectif", (await a.$("[data-todo=returns]")) !== null && /Retours la semaine dernière/.test(td), td.slice(0, 300));
  await shot(a, "50-dashboard-a-faire");
  if (await a.$("[data-todo=weekly]")) {
    const [dl] = await Promise.all([a.waitForEvent("download", { timeout: 15000 }), a.click("[data-todo=weekly]")]);
    const f = path.join(OUT, "resume-semaine-lundi.xlsx"); await dl.saveAs(f);
    ok("lundi : « Résumé de la semaine » téléchargé depuis le Dashboard", XLSX.read(fs.readFileSync(f)).SheetNames.length === 3, XLSX.read(fs.readFileSync(f)).SheetNames);
  }
  // --- Statistiques : Zéro retour
  await a.click("[data-todo=returns]"); await a.mouse.move(900, 300);
  await a.waitForSelector("#view-stats.active .zr-table", { timeout: 10000 });
  ok("clic « retours » : Statistiques, onglet « Zéro retour »", !!(await a.$("[data-sttab=returns].active")));
  const zr = await a.innerText("#view-stats .zr-table");
  ok("Zéro retour : une ligne par machine + toutes les machines", zr.includes("#1") && zr.includes("#2") && zr.includes("Toutes les machines"), zr.slice(0, 200));
  ok("Zéro retour : conseil « commander moins » pour #1 (≈ 14 % de retours)", /Commander moins/.test(zr), zr.slice(0, 400));
  await shot(a, "51-stats-zero-retour");
  await a.fill("#zr-target", "8"); await a.press("#zr-target", "Enter");
  await a.waitForFunction(() => BA.Store.get().settings.returnTargetPct === 8, null, { timeout: 5000 }).catch(() => {});
  await synced(a);
  ok("objectif de retour réglé à 8 % (enregistré dans Supabase)", fake.ba("main").data.settings.returnTargetPct === 8, fake.ba("main").data.settings.returnTargetPct);
  // --- Fiabilité de la prévision
  await a.click("[data-sttab=acc]");
  await a.waitForSelector("#view-stats .fa-table", { timeout: 10000 });
  const fa = await a.innerText("#view-stats .fa-table");
  ok("Fiabilité : une ligne par machine avec une précision en %", /#1/.test(fa) && /#2/.test(fa) && /\d+ %/.test(fa), fa.slice(0, 300));
  await a.click("[data-fa-open='1']");
  await a.waitForSelector(".fa-modal #fa-chart", { timeout: 5000 });
  ok("Fiabilité : détail d'une machine (courbe prévu / vendu, jour par jour)", (await a.$$(".fa-modal tbody tr")).length >= 7);
  await shot(a, "52-stats-fiabilite-detail", false);
  await a.keyboard.press("Escape");
  ok("Échap ferme la fenêtre", !(await a.$(".fa-modal")));
  // --- Résumé de la semaine (Excel, 3 feuilles)
  const [dl2] = await Promise.all([a.waitForEvent("download", { timeout: 15000 }), a.click("#wk-x")]);
  const f2 = path.join(OUT, "resume-semaine.xlsx"); await dl2.saveAs(f2);
  const wb = XLSX.read(fs.readFileSync(f2));
  ok("Résumé de la semaine : Excel à 3 feuilles", wb.SheetNames.length === 3, wb.SheetNames);
  const sh1 = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[1]]);
  ok("Résumé de la semaine : une ligne par machine avec le conseil", sh1.includes("Gare du Midi") && sh1.includes("Antwerpen"), sh1.slice(0, 300));
  // --- Rentabilité (graphique v4.8.8 : cumul)
  await a.click("[data-sttab=money]");
  await a.waitForSelector("#st-view", { timeout: 5000 });
  await a.selectOption("#st-view", "cumul"); await sleep(400);
  ok("Rentabilité : vue « Cumul » avec graphique et chiffres clés", !!(await a.$("#stat-chart")) && /Total/.test(await a.innerText(".chart-kpis").catch(() => "")));
  await a.selectOption("#st-view", "numbers"); await sleep(300);

  // --- Commander & prévisions
  await view(a, "order");
  ok("menu : « Commander & prévisions », plus d'entrée « Prévisions » séparée", (await a.innerText("#view-order h2")).includes("Commander & prévisions") && !(await a.$("nav button[data-view=forecast]")));
  await a.click("#view-order .seg.tabs [data-tab=fc]");
  await a.waitForSelector("#view-order .sub-tabs [data-sub=cal].active", { timeout: 5000 });
  ok("onglet Prévision : Calendrier / Profils par jour / L'an dernier", (await a.$$("#view-order .sub-tabs [data-sub]")).length === 3);
  ok("onglet Prévision : pas de carte « Lire toutes les machines » ni « Copier pour l'IA » ici", !(await a.$("#view-order [data-ia]")) && !(await a.$("#view-order .bx-all-slot")));
  await shot(a, "53-commander-prevision-calendrier");
  await a.click("[data-sub=prof]"); await a.waitForSelector("[data-sub=prof].active"); await sleep(300);
  await shot(a, "54-commander-profils");
  await a.click("[data-sub=ly]"); await a.waitForSelector("[data-sub=ly].active"); await sleep(300);
  await a.waitForSelector("[data-pl-open='1']", { timeout: 5000 });
  const ly = await a.innerText("#fc-host");
  ok("L'an dernier, période à venir : machines avec les ventes de l'an dernier", /#1/.test(ly) && /#2/.test(ly) && !/Pas de données l'an dernier/.test(ly.split("#2")[0]), ly.slice(0, 300));
  await shot(a, "55-commander-an-dernier");
  await a.click("[data-pl-open='1']"); await a.waitForSelector(".det-modal", { timeout: 5000 });
  const det = await a.innerText(".det-modal");
  ok("L'an dernier : détail par type de pain (blanc, gris)", /blanc/i.test(det) && /gris/i.test(det), det.slice(0, 200));
  await a.keyboard.press("Escape");
  const dd0 = await st(a, () => JSON.stringify(BA.Store.get().dayDecisions));
  await a.click("#pl-apply-all"); await a.waitForSelector("#dlg-ok", { timeout: 5000 }); await a.click("#dlg-ok");
  await a.waitForSelector("#pl-undo", { timeout: 5000 });
  await synced(a);
  const nLy = Object.values(fake.ba("main").data.dayDecisions || {}).filter(d => d.m && Object.values(d.m).some(x => x.why === "ly")).length;
  ok("« Utiliser l'an dernier » pour toutes les machines : jours enregistrés (dans Supabase)", nLy >= 1, nLy);
  await a.click("#pl-undo"); await synced(a);
  ok("↩ Annuler : les jours reviennent comme avant", (await st(a, () => JSON.stringify(BA.Store.get().dayDecisions))) === dd0 || Object.values(fake.ba("main").data.dayDecisions || {}).every(d => !d.m || !Object.values(d.m).some(x => x.why === "ly")));
  await a.click("[data-lymode=past]"); await a.waitForSelector("[data-ly-open='1']", { timeout: 5000 });
  ok("L'an dernier, 8 dernières semaines : comparaison par machine", /#1/.test(await a.innerText("#fc-host")));
  await a.click("[data-ly-open='1']"); await a.waitForSelector(".det-modal", { timeout: 5000 }); await sleep(300);
  await shot(a, "56-an-dernier-8-semaines-detail", false);
  await a.keyboard.press("Escape");
  // depuis la commande : « Voir l'an dernier pour ces jours »
  await a.click("#view-order .seg.tabs [data-tab=order]");
  await a.click("[data-q=q1][data-v='1']"); await a.click("[data-q=q2][data-v='0']"); await a.click("#calc");
  await a.waitForSelector("#fc-ly", { timeout: 10000 });
  await a.click("#fc-ly");
  await a.waitForSelector("#pl-back-order", { timeout: 5000 });
  ok("depuis la commande : l'an dernier pour les jours de la commande, avec « ← Retour à la commande »", !!(await a.$("[data-sub=ly].active")) && !!(await a.$("#pl-from")));
  await a.click("#pl-back-order");
  await a.waitForSelector("#fc-calc", { timeout: 5000 });
  ok("← Retour à la commande : on retrouve l'étape de la prévision", !!(await a.$("[data-tab=order].active")));

  // --- Sauvegardes et retour en arrière
  await a.click("#view-order .seg.tabs [data-tab=fc]");
  await a.click("#go-bk");
  await a.waitForSelector("#bk-save", { timeout: 5000 });
  await shot(a, "57-sauvegardes");
  await a.click("#bk-save"); await sleep(300);
  const bk1 = await st(a, () => JSON.parse(localStorage.getItem(BA_CONFIG.storageKey + "-backups")).list.map(b => b.kind));
  ok("sauvegarde manuelle faite (et une automatique avant le changement d'objectif)", bk1.includes("manual") && bk1.includes("auto"), bk1);
  const k3 = await st(a, () => BA.Model.dayKey(Date.now() - 3 * 86400000));
  const s3 = await st(a, k => BA.Store.get().daily[k][1].s, k3);
  await st(a, k => BA.Store.update(s => { s.daily[k][1].s = 999; }), k3);
  await synced(a);
  await a.click("#bk-host tr:has(.tag.c-ok) [data-bk-act=restore]");
  await a.waitForSelector(".bk-modal #rs-preview", { timeout: 5000 });
  const pv = await a.innerText("#rs-preview");
  ok("restaurer : l'aperçu annonce ce qui va changer", /1/.test(pv) && pv.length > 5, pv);
  await shot(a, "58-restaurer-apercu", false);
  await a.click("#rs-ok"); await sleep(300); await synced(a);
  ok("restauré : la journée modifiée revient à sa valeur (dans l'appli)", (await st(a, k => BA.Store.get().daily[k][1].s, k3)) === s3, s3);
  const histK = (fake.ba("hist").data.days || {})[k3], mainK = (fake.ba("main").data.daily || {})[k3];
  ok("restauré aussi dans Supabase", ((histK || mainK || {})[1] || {}).s === s3, (histK || mainK));
  const bk2 = await st(a, () => JSON.parse(localStorage.getItem(BA_CONFIG.storageKey + "-backups")).list.map(b => b.kind));
  ok("« Avant restauration » gardé (on peut annuler)", bk2.includes("pre"), bk2);
  ok("le stock n'a pas bougé pendant la restauration", (await qtyOf(a, 1, 11)) === 8);

  // --- ⇄ Déplacer du pain (même produit)
  await st(a, () => { BA.Shell.state.machine = 1; });
  await view(a, "details");
  ok("Détails : bouton ⇄ Déplacer sur la sélection 11 (même pain que la 12)", !!(await a.$("[data-act=move][data-sel='11']")) && !(await a.$("[data-act=move][data-sel='19']")));
  await a.click("[data-act=move][data-sel='11']");
  await a.waitForSelector(".mv-modal #mv-ok", { timeout: 5000 });
  await shot(a, "59-deplacer", false);
  await a.click("#mv-ok"); await sleep(300); await synced(a);
  ok("déplacé : sélection 11 → 7 pains, sélection 12 → 3 pains", (await qtyOf(a, 1, 11)) === 7 && (await qtyOf(a, 1, 12)) === 3);
  ok("déplacement noté dans l'historique", await st(a, () => BA.Store.get().journal.some(e => e.k === "mv" && e.s === 11 && e.s2 === 12)));
  await a.click("[data-act=move][data-sel='11']"); await a.waitForSelector("#mv-ask"); await a.click("#mv-ask"); await sleep(300); await synced(a);
  ok("« Demander à l'opérateur » : demande enregistrée dans Supabase", (fake.ba("main").data.moves || []).length === 1, fake.ba("main").data.moves);
  const tel = await device(fake, "tel489", { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  const o = await open(tel, "operateur.html");
  await login(o); await ready(o);
  await view(o, "missions");
  ok("téléphone : la demande ⇄ est dans Missions", /#1/.test(await o.innerText("#view-missions")) && !!(await o.$("[data-act=mv-done]")));
  const okeys = await rawKeys(o);
  ok("téléphone : demande ⇄ sans texte manquant", okeys.length === 0, okeys);
  await shot(o, "60-op-deplacer-mission");
  await st(o, () => { BA.Shell.state.machine = 1; }); await view(o, "details");
  ok("téléphone, Détails de la machine #1 : la demande ⇄ est aussi affichée", !!(await o.$("#view-details [data-act=mv-done]")));
  await view(o, "missions");
  await o.click("#view-missions [data-act=mv-done]"); await sleep(300); await synced(o);
  ok("téléphone « Fait » : demande retirée, sélection 12 → 4 pains", (fake.ba("main").data.moves || []).length === 0 && (await qtyOf(o, 1, 12)) === 4);
  ok("téléphone : pas de bloc « À faire aujourd'hui » (admin seulement)", !(await o.$(".todo-card")));

  // --- 3 langues, téléphone : pas de texte manquant
  for (const lang of ["nl", "en", "fr"]) {
    await setLang(a, lang); await sleep(300);
    const miss = [];
    await view(a, "dashboard"); miss.push(...await rawKeys(a));
    await view(a, "stats");
    for (const tb of ["returns", "acc", "money"]) { await a.click(`[data-sttab=${tb}]`); await sleep(300); miss.push(...await rawKeys(a)); }
    await view(a, "order");
    await a.click("#view-order .seg.tabs [data-tab=fc]"); await sleep(200);
    for (const sb of ["cal", "prof", "ly"]) { await a.click(`[data-sub=${sb}]`); await sleep(300); miss.push(...await rawKeys(a)); }
    await a.click("[data-lymode=past]"); await sleep(300); miss.push(...await rawKeys(a));
    await a.click("[data-lymode=next]"); await sleep(200);
    await a.click("#go-bk"); await a.waitForSelector("#bk-save"); miss.push(...await rawKeys(a));
    await a.click("#bk-back"); await sleep(200);
    ok(`${lang} : nouveaux écrans sans texte manquant`, miss.length === 0, [...new Set(miss)]);
  }
  await a.setViewportSize({ width: 390, height: 844 });
  for (const tb of ["returns", "acc"]) {
    await view(a, "stats").catch(async () => { await st(a, () => BA.Shell.go("stats")); });
    await a.click(`[data-sttab=${tb}]`); await sleep(300);
    const wide = await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`téléphone (admin) : Statistiques « ${tb} » sans défilement de la page`, wide <= 1, wide);
  }
  await shot(a, "61-tel-admin-fiabilite");
  await a.setViewportSize({ width: 1280, height: 900 });
  ok("aucune erreur JavaScript (fonctions 4.8.9)", pc.errors.length === 0 && tel.errors.length === 0, pc.errors.concat(tel.errors).slice(0, 8));
  await pc.ctx.close(); await tel.ctx.close();
}

// =====================================================================
// 7. Mode local (Supabase non configuré)
// =====================================================================

// 7. Compte opérateur séparé (v5.8) : refusé sur l'admin, accepté sur l'opérateur ; appli Android : jamais d'admin
async function scenarioOperateurCompte() {
  console.log("\n== 7. Compte opérateur séparé + appli Android");
  const fake = new FakeSupabase({ machines: [], products: [], sales: [], users: [
    { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
    { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }] });
  await fake.listen?.();
  const d = await device(fake, "op57");
  const a = await open(d, "index.html");
  await login(a, "op@test.be", "Secret-456");
  await a.waitForSelector(".alert.err", { timeout: 15000 });
  const msg = await a.innerText(".alert.err");
  ok("compte opérateur sur l'admin : refusé avec un message", /réservé à l'application opérateur/.test(msg), msg);
  ok("compte opérateur sur l'admin : pas de menu", !(await a.$("#app-nav button")));
  const a2 = await open(d, "index.html");
  await a2.waitForSelector("#login-email", { timeout: 15000 });
  ok("compte opérateur : déconnecté, l'écran de connexion revient après rechargement", true);
  await login(a2, "amor@test.be", "Secret-123");
  await ready(a2);
  ok("compte admin sur l'admin : accepté", !!(await a2.$("nav button[data-view=dashboard]")));
  // opérateur sur operateur.html
  const d2 = await device(fake, "op57b");
  const o = await open(d2, "operateur.html");
  await login(o, "op@test.be", "Secret-456");
  await ready(o);
  ok("compte opérateur sur l'appli opérateur : accepté (4 onglets)", !!(await o.$("nav button[data-view=todo]")) && (await o.$$("nav#app-nav button[data-view]")).length === 4);
  ok("navigateur normal : lien « Logiciel admin » présent", !!(await o.$("a[href='index.html']")));
  // appli Android (agent utilisateur de l'appli)
  const d3 = await device(fake, "op57c", { ctx: { userAgent: "Mozilla/5.0 (Linux; Android 14) BroodautomateOperateurApp" } });
  const o3 = await open(d3, "operateur.html");
  await login(o3, "op@test.be", "Secret-456");
  await ready(o3);
  ok("appli Android : pas de lien vers le logiciel admin", !(await o3.$("a[href='index.html']")));
  const ad = await open(d3, "index.html");
  await ad.waitForURL(/operateur\.html/, { timeout: 15000 });
  ok("appli Android : ouvrir index.html renvoie vers l'opérateur", /operateur\.html/.test(ad.url()));
  await d.ctx.close(); await d2.ctx.close(); await d3.ctx.close();
}

// 8. Notifications (v5.9) : cloche admin, nouvelles notifications, opérateur sans cloche, téléphone
async function scenarioNotifs() {
  console.log("\n== 8. Notifications (cloche admin + téléphone)");
  const fake = new FakeSupabase({ machines: [], products: [], sales: [], users: [
    { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
    { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }] });
  const d = await device(fake, "notif-pc");
  const a = await open(d, "index.html");
  await login(a); await ready(a); await sleep(1500);
  ok("table pas encore créée : pas de cloche, pas d'erreur", !(await a.$("#notif-btn")) && d.errors.length === 0, d.errors);
  const now = Date.now(), iso = ms => new Date(now - ms).toISOString();
  fake.t.ba_notifications = [
    { id: 1, cle: "a", type: "panne", titre: "Machine 12 : Ascenseur bloqué par un produit qui dépasse", texte: "Erreur 45/54 à 04:30", silencieux: false, cree_at: iso(3600000 * 3) },
    { id: 2, cle: "b", type: "coupure", titre: "Machine 7 : Coupure de courant", texte: "ancienne", silencieux: true, cree_at: iso(3600000 * 5) }];
  await a.reload(); await ready(a);
  await a.waitForSelector("#notif-btn", { timeout: 15000 });
  ok("cloche affichée pour l'admin", true);
  ok("première fois sur cet appareil : l'ancien compte comme lu", !(await a.$("#notif-btn .notif-n")));
  fake.t.ba_notifications.push({ id: 3, cle: "c", type: "muet", titre: "Machine 21 : boîtier muet", texte: "Aucune nouvelle depuis le 05/11 02:10 (courant, 4G ou antenne ?)", silencieux: false, cree_at: iso(600000) },
                               { id: 4, cle: "d", type: "porte", titre: "Machine 12 : porte ouverte depuis plus de 15 min", texte: "Ouverte depuis le 05/11 04:41", silencieux: false, cree_at: iso(60000) });
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.waitForSelector("#notif-btn .notif-n", { timeout: 10000 });
  ok("2 nouvelles notifications : pastille « 2 »", (await a.innerText("#notif-btn .notif-n")) === "2");
  ok("message en bas de l'écran pour une nouvelle", /🔔/.test(await a.evaluate(() => (document.getElementById("toast") || {}).innerText || "")));
  await a.click("#notif-btn");
  await a.waitForSelector("#notif-panel");
  const items = await a.$$eval("#notif-panel .np-list li", l => l.map(x => ({ t: x.innerText, n: x.classList.contains("new") })));
  ok("liste : 3 notifications (la silencieuse cachée), 2 nouvelles en premier", items.length === 3 && items[0].n && items[1].n && !items[2].n && !items.some(x => /ancienne/.test(x.t)), items);
  const perm = await a.evaluate(() => Notification.permission);
  ok("ordinateur : bouton « Recevoir aussi sur cet ordinateur » ou explication si le navigateur bloque", perm === "default" ? !!(await a.$("#notif-panel .np-perm")) : perm === "denied" ? /bloque/.test(await a.innerText("#notif-panel")) : true, perm);
  await shot(a, "60-notifs-pc", false);
  await a.click("#notif-panel .np-lu");
  ok("tout marquer comme lu : plus de pastille", !(await a.$("#notif-btn .notif-n")));
  await a.click("#notif-panel .np-al");
  await a.waitForSelector("#view-alerts.active", { timeout: 10000 });
  ok("« Voir les alertes » ouvre la page Alertes et ferme le panneau", !(await a.$("#notif-panel")));
  await setLang(a, "nl");
  ok("changement de langue : la cloche reste", !!(await a.$("#notif-btn")) && /Meldingen/.test(await a.getAttribute("#notif-btn", "title")));
  await setLang(a, "fr");
  // opérateur : pas de cloche ; admin sur la page opérateur (téléphone) : cloche
  const d2 = await device(fake, "notif-op", { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const o = await open(d2, "operateur.html");
  await login(o, "op@test.be", "Secret-456"); await ready(o); await sleep(1500);
  ok("compte opérateur : pas de cloche", !(await o.$("#notif-btn")));
  const d3 = await device(fake, "notif-tel", { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (Linux; Android 14) BroodautomateOperateurApp BAPush" } });
  await d3.ctx.addInitScript(() => {
    window.__push = { reg: 0, perm: 0, listeners: {} };
    window.Capacitor = { Plugins: { PushNotifications: {
      createChannel: async () => {}, checkPermissions: async () => ({ receive: "prompt" }),
      requestPermissions: async () => { window.__push.perm++; return { receive: "granted" }; },
      addListener: async (n, f) => { window.__push.listeners[n] = f; return { remove() {} }; },
      register: async () => { window.__push.reg++; setTimeout(() => window.__push.listeners.registration({ value: "jeton-firebase-de-test-0123456789" }), 50); } } } };
  });
  let rpc = null;
  await d3.ctx.route("**/rest/v1/rpc/ba_jeton", async r => { rpc = JSON.parse(r.request().postData() || "{}"); await r.fulfill({ status: 204, body: "" }); });
  const o3 = await open(d3, "operateur.html");
  await login(o3); await ready(o3);
  await o3.waitForSelector("#notif-btn", { timeout: 15000 });
  await o3.waitForFunction(() => window.__push.reg === 1, null, { timeout: 10000 });
  await sleep(400);
  ok("appli Android (admin) : autorisation demandée, téléphone inscrit", rpc && rpc.t === "jeton-firebase-de-test-0123456789" && rpc.appareil === "android", rpc);
  ok("appli Android : cloche aussi dans l'appli", !!(await o3.$("#notif-btn")));
  await o3.click("#notif-btn"); await o3.waitForSelector("#notif-panel");
  ok("appli Android : pas de bouton « sur cet ordinateur »", !(await o3.$("#notif-panel .np-perm")));
  const w = await o3.evaluate(() => { const r = document.getElementById("notif-panel").getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  ok("téléphone : le panneau tient dans l'écran", w.l >= 0 && w.r <= w.vw && w.sw <= w.vw + 1, w);
  await shot(o3, "61-notifs-tel", false);
  await o3.evaluate(() => window.__push.listeners.pushNotificationActionPerformed({}));
  await o3.waitForSelector("#view-alerts.active", { timeout: 10000 });
  ok("toucher la notification ouvre les Alertes", true);
  ok("aucune erreur JavaScript (notifications)", d.errors.length + d2.errors.length + d3.errors.length === 0, d.errors.concat(d2.errors, d3.errors));
  await d.ctx.close(); await d2.ctx.close(); await d3.ctx.close();
}

// 9. Appli opérateur simplifiée (v5.10) : 4 onglets, en-tête d'une ligne, Plus, cartes, − / +
async function scenarioOpSimple(ctx) {
  console.log("\n== 9. Appli opérateur simplifiée (téléphone)");
  const { o } = ctx;
  await view(o, "todo");
  // v5.11 : sur téléphone, les onglets sont en bas (#app-tabbar), avec leur nom
  const tabs = await o.$$eval("#app-tabbar button[data-view]", l => l.map(b => ({ v: b.dataset.view, t: b.innerText.trim(), w: b.querySelector("span") ? getComputedStyle(b.querySelector("span")).display : "" })));
  ok("4 onglets : À faire, Remplir, Alertes, Plus — tous avec leur nom", tabs.map(x => x.v).join(",") === "todo,fill,alerts,more" && tabs.every(x => x.t && x.w !== "none"), tabs);
  const h = await o.evaluate(() => Math.round(document.getElementById("app-header").getBoundingClientRect().height));
  ok("en-tête sur une seule ligne (langue, thème, déconnexion dans « Plus »)", h <= 64 && !(await o.isVisible("#lang-select")), h);
  await shot(o, "70-op-a-faire", false);
  await view(o, "fill");
  ok("Remplir : une carte par machine avec un gros bouton « Remplir »", (await o.$$("#view-fill .mission-card [data-fill]")).length >= 1);
  await shot(o, "71-op-remplir", false);
  await view(o, "more");
  ok("Plus : Détails, Sélections et stock, Historique, Liaison + réglages", (await o.$$("#view-more .op-more-item")).length === 4 && !!(await o.$("#more-lang")) && !!(await o.$("#more-theme")));
  await shot(o, "72-op-plus", false);
  await o.click("#view-more [data-go=details]"); await o.waitForSelector("#view-details.active"); await sleep(400);
  ok("Détails ouvert depuis Plus : l'onglet « Plus » reste allumé, bouton « Retour »", (await o.getAttribute("nav button[data-view=more]", "class")).includes("active") && !!(await o.$("#view-details .op-back")));
  const cartes = await o.$$eval("#view-details table.tbl-cartes", l => l.length);
  const wide = await o.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("Détails : tableaux affichés en cartes, pas de défilement de côté", cartes >= 1 && wide <= 1, { cartes, wide });
  await shot(o, "73-op-details", false);
  await o.click("#view-details .op-back"); await o.waitForSelector("#view-more.active");
  ok("« Retour » ramène à Plus", true);
  await o.click("#view-more [data-go=products]"); await o.waitForSelector("#view-products.active"); await sleep(400);
  ok("Sélections et stock : longues explications repliées derrière « ℹ️ Aide »", (await o.$$("#view-products details.op-aide")).length >= 1);
  await view(o, "fill");
  await o.click("#view-fill [data-fill]"); await o.waitForSelector(".modal");
  await sleep(300);
  ok("Assistant Remplir : boutons − / + autour des nombres", (await o.$$(".modal .pm .pm-b")).length >= 2);
  if (await o.$("#inv-edit")) {
    await o.click("#inv-edit"); await sleep(300);
    const avant = await o.$eval(".modal input[type=number]:not([disabled])", i => Number(i.value));
    await o.click(".modal .pm:has(input:not([disabled])) .pm-b:last-child"); await sleep(100);
    const apres = await o.$eval(".modal input[type=number]:not([disabled])", i => Number(i.value));
    const max = await o.$eval(".modal input[type=number]:not([disabled])", i => Number(i.max));
    ok("« + » ajoute 1 (sans dépasser la capacité)", apres === Math.min(max, avant + 1), { avant, apres, max });
    await o.click(".modal .pm:has(input:not([disabled])) .pm-b:first-child"); await sleep(100);
    ok("« − » enlève 1", (await o.$eval(".modal input[type=number]:not([disabled])", i => Number(i.value))) === Math.max(0, Math.min(max, avant + 1) - 1));
  }
  await shot(o, "74-op-assistant", false);
  await o.click("#wz-cancel"); await sleep(200); if (await o.$("#wz-cancel")) await o.click("#wz-cancel"); await sleep(300);
  ok("assistant fermé sans rien changer", !(await o.$(".modal")));
}

async function scenarioLocal() {
  console.log("\n== 7. Mode local (sans Supabase)");
  const pc = await device(null, "local", { local: true });
  const a = await open(pc, "index.html");
  await ready(a);
  ok("mode local : pas d'écran de connexion, badge « Mode local »", (await a.innerText("#sync-status")).includes("Mode local") && !(await a.$("#btn-logout")));
  await tech(a, "machines");
  await a.fill("#man-id", "202100001"); await a.fill("#man-street", "Kerkstraat 5"); await a.fill("#man-city", "Gent");
  await a.click("[data-add=man]");
  await a.waitForFunction(() => BA.Store.get().machines.length === 1);
  await synced(a);
  await a.reload(); await ready(a);
  ok("mode local : machine gardée après rechargement", (await st(a, () => BA.Store.get().machines.map(m => m.street).join())) === "Kerkstraat 5");
  ok("aucune erreur (mode local)", pc.errors.length === 0, pc.errors);
  await pc.ctx.close();
}

// =====================================================================
// 8. Ancienne version 3.2 gardée dans v3/ (secours)
// =====================================================================
async function scenarioV3() {
  if (!fs.existsSync(path.join(ROOT, "v3/index.html"))) { console.log("\n== 8. (pas de dossier v3 ici)"); return; }
  console.log("\n== 8. Ancienne version 3.2 dans v3/");
  const fake = new FakeSupabase(v3Data());
  const pc = await device(fake, "v3");
  const p = await open(pc, "v3/index.html");
  await p.waitForFunction(() => window.BA && BA.App && BA.EvaDts && BA.Serial, null, { timeout: 15000 });
  ok("v3/index.html : la v3.2 se charge", (await p.title()).length > 0 && (await p.evaluate(() => typeof BA.Serial.connect)) === "function");
  ok("v3/js/serial.js : même fichier que la v5", fs.readFileSync(path.join(ROOT, "v3/js/serial.js")).equals(fs.readFileSync(path.join(ROOT, "js/serial.js"))));
  await pc.ctx.close();
}

(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  browser = await chromium.launch();
  const run = n => !ONLY.length || ONLY.includes(n);
  try {
    if (run("principal")) {
      const ctx = await scenarioPrincipal();
      if (run("sync") || !ONLY.length) await scenarioSync(ctx);
      if (run("ecrans") || !ONLY.length) await scenarioEcrans(ctx);
      if (run("opsimple") || !ONLY.length) await scenarioOpSimple(ctx);
      const http = (ctx.pc.http || []).concat(ctx.tel.http || []);
      ok("réponses d'erreur Supabase : seulement celles attendues (mot de passe, table absente)", http.filter(x => !/\/devices|\/ba_notifications|\/ba_state_backup|\/device_reports|\/ba_demandes|\/rpc\/ba_portes|\/rpc\/ba_conso/.test(x)).length <= 3 && http.every(x => /token\?grant_type=password|ba_state|\/devices|\/ba_notifications|\/device_reports|\/ba_demandes|\/rpc\/ba_portes|\/rpc\/ba_conso/.test(x)), http);
      ok("aucune erreur JavaScript (PC + téléphone)", ctx.pc.errors.length === 0 && ctx.tel.errors.length === 0, ctx.pc.errors.concat(ctx.tel.errors).slice(0, 8));
      fs.writeFileSync(path.join(OUT, "requetes.json"), JSON.stringify(ctx.fake.requests.slice(-400), null, 1));
      await ctx.pc.ctx.close(); await ctx.tel.ctx.close();
    }
    if (run("vide")) await scenarioVide();
    if (run("v489")) await scenario489();
    if (run("opcompte")) await scenarioOperateurCompte();
    if (run("notifs")) await scenarioNotifs();
    if (run("local")) await scenarioLocal();
    if (run("v3")) await scenarioV3();
  } catch (e) {
    console.log("ARRÊT : " + (e.stack || e));
    fails.push("arrêt : " + e.message.split("\n")[0]);
  }
  await browser.close();
  srv.close();
  console.log("\n" + (fails.length ? fails.length + " ÉCHEC(S) :\n - " + fails.join("\n - ") : "TOUT EST BON"));
  if (allErrors.length) console.log("Erreurs JS : " + allErrors.slice(0, 10).join("\n"));
  process.exit(fails.length ? 1 : 0);
})();
