// Essais de la v5.36.2 (corrections de l'audit du 28/11/2026) :
//  1. « 📅 Changer la date » : échanger les dates de deux lots d'une même sélection gardait tout le pain à UNE date
//     (au 1er changement les deux lots se rejoignaient, le 2e ne trouvait plus son lot). Maintenant toutes les dates
//     changent ensemble (BA.Actions.setLotDates), puis les lots sont rangés une seule fois.
//  2. Notification touchée (iPhone, ordinateur) : la fenêtre de la BONNE appli est ramenée devant (admin ou opérateur),
//     plus « la première fenêtre ouverte ».
// Vraie appli dans Chromium, faux Supabase, données inventées (aucune vraie donnée lue ni modifiée).
// node v5362.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import vm from "node:vm";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v5362");
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname), NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": NM + "/@supabase/supabase-js/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": NM + "/chart.js/dist/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": NM + "/xlsx/dist/xlsx.full.min.js"
};
const TY = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ko = 0;
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 700))); if (!c) ko++; };
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// Vendredi 27 novembre 2026, 13:00 à Bruxelles. Machine inventée n° 3 :
//  11 « gris » : lot 1 = 2 pains de 50 h, lot 2 = 3 pains de 10 h ; 15 « gris » : lot 3 = 4 pains de 30 h ; 19 « blanc » : lot 4 = 1 pain de 49 h, lot 5 = 2 pains de 19 h
const NOW = new Date("2026-11-27T13:00:00+01:00").getTime(), H = 3600000, DAY = 86400000;
const L1 = NOW - 50 * H, L2 = NOW - 10 * H, L3 = NOW - 30 * H, L4 = NOW - 49 * H, L5 = NOW - 19 * H;
const USERS = [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }];
function etat() {
  const mk = (n, type, lots) => ({ n, cap: 6, type, price: 2.5, lots });
  return { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 70 * DAY }, epoch: "essai5362", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-536200001", num: 3, street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null, sels: [
      mk(11, "gris", [{ id: 1, qty: 2, date: L1 }, { id: 2, qty: 3, date: L2 }]), mk(15, "gris", [{ id: 3, qty: 4, date: L3 }]),
      mk(19, "blanc", [{ id: 4, qty: 1, date: L4 }, { id: 5, qty: 2, date: L5 }])] }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
}

(async () => {
  console.log("== 0. Fichiers");
  ok("version 5.36.3 dans config.js", /version: "5\.36\.3"/.test(lire("js/config.js")));
  ok("index.html et operateur.html : tous les fichiers en ?v=5.36.3, plus aucun en 5.36.2", [lire("index.html"), lire("operateur.html")].every(h => /\?v=5\.36\.3/.test(h) && !/\?v=5\.36\.2/.test(h)));
  ok("sw.js : en-tête v5.36.3", /BROODAUTOMATE v5\.36\.3/.test(lire("sw.js")));
  ok("actions.js : BA.Actions.setLotDates, et la fenêtre « Changer la date » l'utilise (plus de setLotDate lot par lot)",
    /setLotDates\(num, selN, items\)/.test(lire("js/actions.js")) && /BA\.Actions\.setLotDates\(num, sel\.n, items\)/.test(lire("js/ui.js")) && !/items\.forEach\(x => BA\.Actions\.setLotDate\(/.test(lire("js/ui.js")));

  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  // Un appareil (contexte) relié au faux Supabase partagé
  async function appareil(fake, nom, o = {}) {
    const tel = o.tel !== false;
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: tel ? { width: 390, height: 844 } : { width: 1280, height: 860 },
      isMobile: tel, hasTouch: tel, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } });
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    await ctx.clock.setFixedTime(NOW);
    return ctx;
  }
  async function ouvrir(ctx, nom, page, login) {
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(nom + " : " + e.message));
    await p.goto(URL0 + page);
    if (login) {
      await p.waitForSelector("#login-email", { timeout: 20000 });
      await p.fill("#login-email", page === "index.html" ? "amor@test.be" : "op@test.be"); await p.fill("#login-pass", page === "index.html" ? "Secret-123" : "Secret-456"); await p.click("#login-go");
    }
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(1500);
    return p;
  }
  const nouveau = () => { const f = new FakeSupabase({ users: USERS }); f.baState = [{ id: "main", version: 3, data: etat(), updated_at: new Date(NOW).toISOString() }]; return f; };
  const lots = (p, n) => p.evaluate(n => BA.Store.get().machines[0].sels.find(z => z.n === n).lots.map(l => l.qty + "@" + Math.round((BA.Store.get().now - l.date) / 3600000) + "h#" + l.id), n);
  const journal = p => p.evaluate(() => BA.Store.get().journal.filter(e => e.k === "date").map(e => ({ s: e.s, q: e.q, de: e.l, a: e.l2 })));
  const toast = p => p.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  const attendre = async (p, f, ms = 8000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await p.evaluate(f).catch(() => false)) return true; await sleep(200); } return false; };
  // ouvre la fenêtre « Changer la date » d'une sélection depuis Produits et stock → Stock en tableau, met les valeurs données, enregistre
  async function changer(p, n, valeurs) {
    await p.evaluate(() => { BA.MachineView.setMode("classic"); BA.Shell.go("products"); });
    await p.waitForSelector(".sel-table", { timeout: 15000, state: "attached" }); await sleep(300);
    const l = await p.$$(`.sel-table [data-act="lot-dates"][data-sel="${n}"]`); for (const x of l) if (await x.isVisible()) { await x.click(); break; }
    await p.waitForSelector(".dt-modal .dt-in");
    const ms2in = await p.evaluate(v => v.map(ms => ms == null ? null : BA.UI.F.toInput(ms)), valeurs);
    await p.$$eval(".dt-modal .dt-in", (l, v) => l.forEach((i, k) => { if (v[k] != null) { i.value = v[k]; i.dispatchEvent(new Event("input", { bubbles: true })); } }), ms2in);
    await p.click("#dt-ok"); await sleep(400);
  }

  console.log("\n== 1. Échanger les dates de deux lots (opérateur, téléphone)");
  {
    const fake = nouveau(), ctx = await appareil(fake, "tel"), p = await ouvrir(ctx, "tel", "operateur.html", true);
    ok("au départ : sélection 11 = 2 pains de 50 h (lot 1) + 3 pains de 10 h (lot 2)", JSON.stringify(await lots(p, 11)) === JSON.stringify(["2@50h#1", "3@10h#2"]), await lots(p, 11));
    await changer(p, 11, [L2, L1]);                                       // le lot de 2 pains prend 10 h, celui de 3 pains prend 50 h
    const apres = await lots(p, 11);
    ok("après l'échange : 3 pains de 50 h (lot 2) et 2 pains de 10 h (lot 1) — avant la v5.36.2 : 5 pains à une seule date", JSON.stringify(apres) === JSON.stringify(["3@50h#2", "2@10h#1"]), apres);
    const j = await journal(p);
    ok("Historique : les deux changements notés (2 pains 50 h → 10 h, 3 pains 10 h → 50 h)", j.length === 2 && j.some(e => e.q === 2 && e.de === L1 && e.a === L2) && j.some(e => e.q === 3 && e.de === L2 && e.a === L1), j);
    ok("message « 2 dates enregistrées — sélection 11 »", /2 dates enregistrées — sélection 11/.test(await toast(p)), await toast(p));
    ok("une seule modification envoyée (les deux dates ensemble) et reçue par le serveur", await attendre(p, () => BA.Store.pendingCount() === 0) &&
      JSON.stringify(fake.ba("main").data.machines[0].sels.find(z => z.n === 11).lots.map(l => l.qty + "@" + l.date)) === JSON.stringify(["3@" + L1, "2@" + L2]));
    await p.screenshot({ path: path.join(OUT, "v5362-echange-tel.png") });

    console.log("\n== 2. Autres cas de la fenêtre");
    await changer(p, 19, [L5, null]);                                     // lot 4 (1 pain, 49 h) mis à la même minute que le lot 5 (2 pains, 19 h)
    ok("deux lots mis à la MÊME minute : ils se rejoignent (règle habituelle) → 3 pains de 19 h", JSON.stringify(await lots(p, 19)) === JSON.stringify(["3@19h#4"]), await lots(p, 19));
    ok("message « Date enregistrée — sélection 19 » (une seule date changée)", /Date enregistrée — sélection 19/.test(await toast(p)), await toast(p));
    const avant15 = await lots(p, 15), j0 = (await journal(p)).length;
    await changer(p, 15, [null]);                                         // ouverte puis enregistrée sans rien changer
    ok("rien changé : aucun lot touché, rien dans l'Historique", JSON.stringify(await lots(p, 15)) === JSON.stringify(avant15) && (await journal(p)).length === j0);
    await p.evaluate(([L3]) => BA.Actions.setLotDate(3, 15, 3, L3 - 5 * 3600000), [L3]);  // le champ date du tableau des lots (Détails machine) : un seul lot
    ok("BA.Actions.setLotDate (un seul lot, tableau des Lots) marche toujours : 4 pains de 35 h", JSON.stringify(await lots(p, 15)) === JSON.stringify(["4@35h#3"]), await lots(p, 15));
    const r = await p.evaluate(([L1, L2]) => ({ vide: BA.Actions.setLotDates(3, 11, []), inconnu: BA.Actions.setLotDates(3, 11, [{ lot: 999, ms: L1 }]), pareil: BA.Actions.setLotDates(3, 11, [{ lot: 2, ms: L1 }]), selInconnue: BA.Actions.setLotDates(3, 77, [{ lot: 2, ms: L2 }]) }), [L1, L2]);
    ok("setLotDates : liste vide, lot inconnu, même date, sélection inconnue → 0 changement", r.vide === 0 && r.inconnu === 0 && r.pareil === 0 && r.selInconnue === 0, r);
    await ctx.close();
  }

  console.log("\n== 3. Admin (ordinateur) : même échange");
  {
    const fake = nouveau(), ctx = await appareil(fake, "pc", { tel: false }), p = await ouvrir(ctx, "pc", "index.html", true);
    await changer(p, 11, [L2, L1]);
    ok("admin : 3 pains de 50 h (lot 2) et 2 pains de 10 h (lot 1)", JSON.stringify(await lots(p, 11)) === JSON.stringify(["3@50h#2", "2@10h#1"]), await lots(p, 11));
    await p.evaluate(() => { BA.Shell.go("history"); const s = document.getElementById("hist-period"); if (s) { s.value = "7"; s.dispatchEvent(new Event("change")); } }); await sleep(600);
    const hist = await p.evaluate(() => document.getElementById("app-main").innerText);
    ok("Historique de l'admin : les deux changements « Date du lot changée » apparaissent", (hist.match(/Date du lot changée/g) || []).length >= 2, (hist.match(/Date du lot changée/g) || []).length);
    await ctx.close();
  }

  console.log("\n== 4. Sans réseau : l'échange est refait au retour du réseau, sur la version la plus récente");
  {
    const fake = nouveau();
    const ctxTel = await appareil(fake, "tel"), ctxPc = await appareil(fake, "pc", { tel: false });
    let tel = await ouvrir(ctxTel, "tel", "operateur.html", true); const pc = await ouvrir(ctxPc, "pc", "index.html", true);
    fake.setOffline("tel", true); await sleep(300);
    await changer(tel, 11, [L2, L1]);
    const hors = await tel.evaluate(() => ({ attente: BA.Store.pendingCount(), ops: (JSON.parse(localStorage.getItem("broodautomate-v5") || "{}").ops || []).filter(o => o.desc).map(o => o.desc.a) }));
    ok("téléphone hors ligne : changement gardé sur l'appareil, sous le nom « setLotDates »", hors.attente > 0 && hors.ops.includes("setLotDates"), hors);
    await tel.close();                                                    // appli fermée sans réseau
    await pc.evaluate(() => BA.Actions.removeBread(3, 11, [{ lotId: 1, qty: 1 }], "old", ""));    // entre-temps l'admin retire 1 des 2 vieux pains
    ok("l'admin a écrit entre-temps (1 pain de 50 h retiré)", await attendre(pc, () => BA.Store.pendingCount() === 0));
    fake.setOffline("tel", false);
    tel = await ouvrir(ctxTel, "tel", "operateur.html", false);
    await attendre(tel, () => BA.Store.pendingCount() === 0);
    const fin = fake.ba("main").data.machines[0].sels.find(z => z.n === 11).lots.map(l => l.qty + "@" + Math.round((NOW - l.date) / 3600000) + "h#" + l.id);
    ok("au retour : 3 pains de 50 h (lot 2) + le pain restant du lot 1 à 10 h — rien de perdu, rien de fondu", JSON.stringify(fin) === JSON.stringify(["3@50h#2", "1@10h#1"]), fin);
    await ctxTel.close(); await ctxPc.close();
  }

  console.log("\n== 5. Notification touchée : la fenêtre de la bonne appli (service worker, sans navigateur)");
  {
    const code = lire("sw.js");
    const essai = (fenetres, data) => {
      const h = {}, ouvertes = [], journalF = [];
      const clients = fenetres.map(u => ({ url: u, focus() { journalF.push("devant " + u); return Promise.resolve(this); }, postMessage(m) { journalF.push("message " + u + " " + m.vue); } }));
      const self = { addEventListener: (n, f) => { h[n] = f; }, skipWaiting() {}, registration: { showNotification() { return Promise.resolve(); } },
        clients: { claim() {}, matchAll: () => Promise.resolve(clients), openWindow: u => { ouvertes.push(u); return Promise.resolve(); } } };
      vm.runInNewContext(code, { self, URL, console });
      let attente = null;
      h.notificationclick({ notification: { close() {}, data }, waitUntil: p => { attente = p; } });
      return attente.then(() => ({ journal: journalF, ouvertes }));
    };
    const ADM = "https://x.github.io/broodautomate/index.html#dashboard", DOS = "https://x.github.io/broodautomate/", OPE = "https://x.github.io/broodautomate/operateur.html#todo";
    let r = await essai([OPE, ADM], { vue: "alerts", page: "index.html" });
    ok("alerte de l'admin, appli opérateur ouverte EN PREMIER et admin ouverte : c'est l'admin qui revient devant", JSON.stringify(r.journal) === JSON.stringify(["message " + ADM + " alerts", "devant " + ADM]), r);
    r = await essai([ADM, OPE], { vue: "alerts", page: "operateur.html" });
    ok("alerte de l'opérateur, les deux ouvertes : c'est l'appli opérateur", JSON.stringify(r.journal) === JSON.stringify(["message " + OPE + " alerts", "devant " + OPE]), r);
    r = await essai([OPE, DOS], { vue: "alerts", page: "index.html" });
    ok("admin ouverte par l'adresse du dossier (…/broodautomate/) : reconnue comme l'admin", r.journal[1] === "devant " + DOS, r);
    r = await essai([OPE], { vue: "alerts", page: "index.html" });
    ok("seule l'autre appli est ouverte : elle revient devant (comme avant), rien d'ouvert en plus", r.journal[1] === "devant " + OPE && !r.ouvertes.length, r);
    r = await essai([], { vue: "alerts", page: "index.html" });
    ok("aucune fenêtre : l'appli s'ouvre sur les Alertes (index.html#alerts)", JSON.stringify(r.ouvertes) === JSON.stringify(["index.html#alerts"]), r);
  }

  ok("aucune erreur JavaScript dans les pages", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ARRÊT :", e); process.exit(1); });
