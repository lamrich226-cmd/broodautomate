// Essais de la v5.29 (vérification complète du 14/11/2026) — vraie appli dans Chromium, faux Supabase, données inventées.
//  1) historique : une machine supprimée laisse son historique sous un numéro FANTÔME ; réparation au démarrage
//     (historique orphelin, et historique plus ancien qu'une machine créée en v5.29) ; renumérotation (pains à déplacer compris)
//  2) « Lire maintenant » en UDP (carte 1NCE) : textes « écoute permanente », pas d'estimation de data fausse, état coupé proprement,
//     aide ajoutée au message court du boîtier v1.6.2, 1NCE par défaut, demande vivante 35 min et bouton 🔁 après 1 min
//  3) bandeau « nouvelle version publiée »
//  4) v5.32.2 : consommation 1NCE expliquée (paliers) + heure de lecture ; Dashboard en premier dans l'appli opérateur
// node v529.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v529");
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
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 600))); if (!c) ko++; };
const ICCID = "89882280666680646327";
const pad = n => String(n).padStart(2, "0");
const cle = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  { const _nc = browser.newContext.bind(browser); browser.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } }); return c; }; }     // v5.41 : les pages sont en 3D par défaut ; ces essais vérifient la vue à plat (2D)
  const now = Date.now(), DAY = 86400000, MIN = 60000, H = 3600000;
  const sel = (n, type) => ({ n, cap: 10, lots: [], type, price: 2.5 });
  const machine = (num, id, extra) => Object.assign({ id, num, street: "Rue " + num, city: "Bruxelles", region: "bxl", serial: id.slice(4), door: false, link: false, power: false, temp: 5, sels: [sel(1, "blanc")] }, extra || {});
  const vieux = cle(now - 3 * DAY), auj = cle(now);
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * DAY }, epoch: "essai529", thr48: true, orders: [], applied: [], missions: [],
    // #1 : machine ancienne (sans date de création) ; #2 : créée il y a 1 h en v5.29 (cree) ; n° 7 : machine supprimée avant la v5.29
    machines: [machine(1, "FAS-529000001"), machine(2, "FAS-529000002", { cree: now - H })],
    journal: [
      { i: 101, t: now - 3 * DAY, n: 2, k: "rm", s: 1, y: "blanc", q: 2, b: "admin" },      // d'une ANCIENNE machine n°2 → fantôme
      { i: 102, t: now - 10 * MIN, n: 2, k: "rm", s: 1, y: "blanc", q: 1, b: "admin" },     // de la machine n°2 actuelle → reste
      { i: 103, t: now - 4 * DAY, n: 7, k: "rm", s: 1, y: "blanc", q: 3, b: "admin" },      // machine n°7 supprimée → fantôme
      { i: 104, t: now - 2 * DAY, n: 1, k: "rm", s: 1, y: "blanc", q: 1, b: "admin" }       // machine n°1 (pas de date de création) → reste
    ],
    events: [
      { id: 201, t: now - 2 * DAY, num: 2, code: "BOX_FAIL", cat: "tech", key: "", data: { msg: "ancienne" }, resolved: true },
      { id: 202, t: now - 5 * MIN, num: 2, code: "BOX_FAIL", cat: "tech", key: "", data: { msg: "actuelle" }, resolved: false },
      { id: 203, t: now - 4 * DAY, num: 7, code: "BOX_FAIL", cat: "tech", key: "", data: { msg: "n°7" }, resolved: true }
    ],
    interventions: [{ id: 301, num: 2, start: now - 5 * DAY, end: now - 5 * DAY + MIN, status: "done", inv: [], rem: [], load: [], step: 3 }],
    moves: [{ id: 401, num: 1, from: 1, to: 1, date: now - DAY, kept: false, type: "blanc", qty: 1, at: now - H, by: "admin" }],
    daily: { [vieux]: { 2: { s: 5, r: 12.5, l: 0, x: 0 }, 7: { s: 2, r: 5, l: 0, x: 0 }, 1: { s: 3, r: 7.5, l: 0, x: 0 } }, [auj]: { 2: { s: 1, r: 2.5, l: 0, x: 0 } } },
    settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15 },
    customTypes: [], dayDecisions: {}, profileManual: { 7: [100, 100, 100, 100, 100, 100, 100] }, calendar: [] };
  const fake = new FakeSupabase({ boitiers: true });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.runDemandesSql();
  const LONG = "La machine ne répond pas (10 START sans réponse). La machine est peut-être dans son menu de réglage (elle ne répond plus pendant qu'on y change un prix) : ressors du menu et attends un peu. Sinon vérifier le module MAX3232 et ses fils, la v";
  const dev = (id, name, machineId, iccid, info) => ({ id, name, machine_id: machineId, key_hash: "x".repeat(64), last_seen: new Date(now - 5 * MIN).toISOString(), created_at: new Date(now - DAY).toISOString(), iccid,
    info: Object.assign({ fw: "1.6.2 1NCE UDP", mode: 0, ec: 120, hb: 30, rd: 60, up: 6000, seq: 24, lu: 40, rssi: 31, op: "20601" }, info || {}) });
  fake.t.devices = [dev("dev-U", "Boîtier 1NCE", "FAS-529000002", ICCID, { st: LONG, stok: false }),
                    dev("dev-H", "Boîtier HTTPS", "FAS-529000001", null, { fw: "1.6.2", st: "La machine ne répond pas (10 START sans réponse).", stok: false, ec: 900 })];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const appels = [];
  await ctx.route(/functions\/v1\/lire-1nce/, async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    appels.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, id: "t1" }) });
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|WebSocket|net::ERR|status of 50\d/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  const toasts = () => p.evaluate(() => [...document.querySelectorAll(".toast, #toasts > *, [role=status]")].map(e => e.textContent));

  console.log("== 1. Historique des machines : numéro fantôme et réparation au démarrage");
  const st = await p.evaluate(() => JSON.parse(JSON.stringify(BA.Store.get())));
  const j = id => st.journal.find(e => e.i === id) || {};
  ok("réparation : l'historique d'une ANCIENNE machine n°2 (plus vieux que la #2 actuelle) passe sous le n° fantôme 100002", j(101).n === 100002, j(101));
  ok("réparation : l'historique de la #2 actuelle (après sa création) reste à elle", j(102).n === 2, j(102));
  ok("réparation : machine n°7 supprimée avant la v5.29 → son historique passe sous 100007", j(103).n === 100007, j(103));
  ok("réparation : machine #1 sans date de création → rien ne bouge", j(104).n === 1, j(104));
  ok("réparation : alertes des anciennes machines effacées, alerte actuelle de la #2 gardée", !st.events.some(e => e.id === 201 || e.id === 203) && st.events.some(e => e.id === 202 && e.num === 2), st.events.map(e => [e.id, e.num]));
  ok("réparation : intervention d'une ancienne machine n°2 → fantôme", st.interventions.find(x => x.id === 301).num === 100002, st.interventions);
  ok("réparation : ventes par jour : ancienne n°2 → 100002, n°7 → 100007 ; aujourd'hui de la #2 et #1 inchangés",
    st.daily[vieux]["100002"] && st.daily[vieux]["100002"].s === 5 && !st.daily[vieux]["2"] && st.daily[vieux]["100007"] && st.daily[vieux]["1"].s === 3 && st.daily[auj]["2"].s === 1, st.daily);
  ok("réparation : réglage propre à la machine n°7 supprimée (profil) effacé", !st.profileManual["7"] && !st.profileManual["100007"], st.profileManual);
  ok("réparation enregistrée dans Supabase (nouvelle version des données)", (fake.baState.find(r => r.id === "main") || {}).version > 3, fake.baState.map(r => [r.id, r.version]));
  const encore = await p.evaluate(() => BA.Reel.aReparer(BA.Store.get()));
  ok("réparation faite une seule fois (plus rien à réparer)", encore === false);
  ok("affichage : « #2 (supprimée) » pour un n° fantôme", await p.evaluate(() => BA.Model.numTxt(100002) === "#2 (supprimée)" && BA.Model.numTxt(2) === "#2"));

  // suppression d'une machine (v5.29) puis nouvelle machine avec le même numéro
  await p.evaluate(() => BA.Store.update(s => BA.Reel.removeMachine(s, 1)));
  const s2 = await p.evaluate(() => JSON.parse(JSON.stringify(BA.Store.get())));
  ok("suppression de la #1 : son journal passe sous 100001, ses pains à déplacer et ses alertes partent", s2.journal.find(e => e.i === 104).n === 100001 && !s2.moves.some(x => x.num === 1) && !s2.events.some(e => e.num === 1), [s2.journal.find(e => e.i === 104), s2.moves]);
  ok("suppression de la #1 : ses ventes restent dans les statistiques de la flotte (sous 100001)", s2.daily[vieux]["100001"] && s2.daily[vieux]["100001"].s === 3 && !s2.daily[vieux]["1"], s2.daily[vieux]);
  const err = await p.evaluate(() => BA.Store.update(s => BA.Reel.addMachine(s, { num: 1, id: "FAS-529000009", street: "Nouvelle", city: "Gent", region: "vl", serial: "529000009" })));
  const s3 = await p.evaluate(() => JSON.parse(JSON.stringify(BA.Store.get())));
  const m1 = s3.machines.find(m => m.num === 1);
  ok("nouvelle machine #1 : créée avec sa date (cree) et SANS l'historique de l'ancienne #1", !err && m1 && m1.id === "FAS-529000009" && m1.cree > 0 && !s3.journal.some(e => e.n === 1) && !(s3.daily[vieux] || {})["1"], [err, m1 && m1.cree]);
  // renumérotation : tout suit, y compris les pains à déplacer (oubliés avant la v5.29)
  await p.evaluate(() => BA.Store.update(s => { s.moves.push({ id: 402, num: 2, from: 1, to: 1, date: s.now, kept: false, type: "blanc", qty: 1, at: s.now, by: "admin" }); }));
  const e5 = await p.evaluate(() => BA.Store.update(s => BA.Reel.updateMachine(s, 2, { num: 5 })));
  const s4 = await p.evaluate(() => JSON.parse(JSON.stringify(BA.Store.get())));
  ok("renumérotation #2 → #5 : journal, alertes et pains à déplacer suivent ; les fantômes ne bougent pas",
    !e5 && s4.journal.find(e => e.i === 102).n === 5 && s4.events.find(e => e.id === 202).num === 5 && s4.moves.find(x => x.id === 402).num === 5 && s4.journal.find(e => e.i === 101).n === 100002, [e5, s4.moves]);
  await p.evaluate(() => BA.Store.update(s => BA.Reel.updateMachine(s, 5, { num: 2 })));
  // l'Historique (toutes les machines) montre « #2 (supprimée) »
  await p.evaluate(() => BA.Shell.go("history")); await sleep(1200);
  await p.evaluate(() => { const s = document.getElementById("hist-period"); if (s) { s.value = "30"; s.dispatchEvent(new Event("change", { bubbles: true })); } }); await sleep(800);
  const histTxt = await p.evaluate(() => (document.getElementById("view-history") || document.body).innerText);
  ok("Historique : les lignes d'une machine supprimée sont notées « #… (supprimée) »", /#\d+ \(supprimée\)/.test(histTxt), histTxt.slice(0, 400));
  await p.screenshot({ path: path.join(OUT, "v529-historique.png") });

  console.log("== 2. « Lire maintenant » en UDP (carte 1NCE)");
  await p.evaluate(async () => { await BA.Boitiers.refresh(true); BA.Technique && BA.Technique.tab("boxes"); BA.Shell.go("technique"); }); await sleep(1500);
  const rowU = await p.evaluate(() => (document.querySelector('tr[data-bxid="dev-U"]') || {}).innerText || "");
  const rowH = await p.evaluate(() => (document.querySelector('tr[data-bxid="dev-H"]') || {}).innerText || "");
  ok("liste : boîtier 1NCE « écoute permanente (1NCE) », plus « écoute toutes les 2 min »", /écoute permanente \(1NCE\)/.test(rowU) && !/écoute toutes les/.test(rowU), rowU.slice(0, 300));
  ok("liste : boîtier HTTPS garde « écoute toutes les 15 min »", /écoute toutes les 15 min/.test(rowH), rowH.slice(0, 300));
  ok("liste : l'état long est coupé à la fin d'une phrase (« … »), plus jamais « la v »", /attends un peu\. …/.test(rowU) && !/la v\s*$/m.test(rowU), rowU.slice(0, 400));
  const detU = await p.evaluate(() => (document.querySelector('[data-bxmore="dev-U"]') || {}).textContent || "");
  const detH = await p.evaluate(() => (document.querySelector('[data-bxmore="dev-H"]') || {}).textContent || "");
  ok("détail 1NCE : « Lire maintenant » instantané (écoute permanente)", /instantané : le boîtier écoute en permanence/.test(detU), detU.slice(0, 600));
  ok("détail 1NCE : plus d'estimation « ≈ … Mo » ; renvoi vers l'onglet Consommation 4G", !/≈/.test(detU) && /Consommation 4G/.test(detU), detU.slice(0, 600));
  ok("détail HTTPS : l'estimation reste (elle est juste pour l'HTTPS)", /≈/.test(detH), detH.slice(0, 600));
  ok("détail : message court du boîtier v1.6.2 → l'appli ajoute l'aide (menu de réglage, MAX3232…)", /ne répond pas \(10 START sans réponse\)\. Menu de réglage ouvert/.test(detH), detH.slice(0, 600));
  const total = await p.evaluate(() => (document.querySelector(".bx-data-total") || {}).innerText || "");
  ok("total « tous les boîtiers … Mo par mois » : sans le boîtier 1NCE", !total || /\(1\)/.test(total), total);
  const sim = await p.evaluate(() => [...document.querySelectorAll("#bx-sim option")].map(o => o.value));
  ok("Ajouter un boîtier : carte 1NCE proposée en premier (choix par défaut)", sim[0] === "1nce", sim);
  await p.screenshot({ path: path.join(OUT, "v529-boitiers.png") });

  // demande d'un boîtier 1NCE : vivante 35 min ; 🔁 après 1 min ; plus de 35 min → « sans réponse »
  const dId = 9001;
  fake.t.ba_demandes.push({ id: dId, device_id: "dev-U", machine_id: "FAS-529000002", statut: "attente", message: null, cree_at: new Date(now - 20 * MIN).toISOString(), prise_at: null, fini_at: null, brut: false });
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(800);
  const btn = await p.evaluate(() => { const b = document.querySelector('button[data-bxread="dev-U"]'); return b ? { t: b.textContent, d: b.disabled, title: b.title } : null; });
  ok("demande de 20 min : toujours en cours (35 min de vie) et bouton 🔁 actif", !!btn && /🔁/.test(btn.t) && !btn.d && /renvoyer l'ordre/.test(btn.title), btn);
  const n0 = appels.length;
  await p.click('button[data-bxread="dev-U"]'); await sleep(900);
  ok("🔁 : le MÊME ordre est renvoyé (même n° de demande, aucune nouvelle demande)", appels.length === n0 + 1 && appels[n0].demande === dId && fake.t.ba_demandes.filter(x => x.device_id === "dev-U").length === 1, appels.slice(n0));
  ok("🔁 : message « Ordre renvoyé au boîtier »", (await toasts()).some(x => /Ordre renvoyé/.test(x)), await toasts());
  fake.t.ba_demandes.find(x => x.id === dId).cree_at = new Date(now - 40 * MIN).toISOString();
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(800);
  const btn2 = await p.evaluate(() => { const b = document.querySelector('button[data-bxread="dev-U"]'); return b ? { t: b.textContent, d: b.disabled } : null; });
  const dem2 = await p.evaluate(() => (document.querySelector('[data-bxdem="dev-U"]') || {}).textContent || "");
  ok("demande de 40 min : plus en cours (« pas de réponse »), bouton normal", !!btn2 && !/🔁/.test(btn2.t) && !btn2.d && /⌛/.test(dem2), [btn2, dem2]);

  console.log("== 3. Bandeau « nouvelle version publiée »");
  const v0 = await p.evaluate(async () => { await BA.Maj.verifier(true); return { v: BA.Maj.actuelle(), b: !!document.querySelector(".maj-bandeau") }; });
  ok("même version publiée : pas de bandeau", v0.v === "5.33.0" && v0.b === false, v0);
  await p.route(/js\/config\.js\?maj=/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: 'const BA_CONFIG = {\n  app: { name: "Broodautomate", version: "9.9.9" },\n};' }));
  const v1 = await p.evaluate(async () => { await BA.Maj.verifier(true); const b = document.querySelector(".maj-bandeau"); return b ? b.innerText : ""; });
  ok("nouvelle version publiée : bandeau « … (9.9.9) » + bouton « Recharger »", /nouvelle version/i.test(v1) && /9\.9\.9/.test(v1) && /Recharger/.test(v1), v1);
  await p.screenshot({ path: path.join(OUT, "v529-bandeau.png") });
  const ope = fs.readFileSync(path.join(ROOT, "operateur.html"), "utf8");
  ok("appli opérateur : le bandeau y est aussi (js/maj.js chargé)", /js\/maj\.js\?v=5\.33\.0/.test(ope) && /js\/i18n-v529\.js/.test(ope));

  console.log("== 4. v5.29.1 : consommation 1NCE (par paliers, heure de lecture) ; Dashboard en premier dans l'appli opérateur");
  let nConso = 0, consoKo = false;
  await ctx.route(/functions\/v1\/conso-1nce/, async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    nConso++;
    if (consoKo) return r.fulfill({ status: 502, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: false, error: "1NCE injoignable (jeton)" }) });
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, jours: [{ date: auj, ko: 76, rx: 30, tx: 46 }], restantKo: 499900, totalKo: 500000 }) });
  });
  await p.evaluate(() => { BA.Technique.tab("boxes"); BA.Shell.go("technique"); }); await p.waitForSelector("#view-technique.active");
  await p.click("[data-tq-tab=usage]"); await sleep(1500);
  const u1 = await p.innerText("#tq-usage");
  ok("note : 1NCE compte par paliers (fin de connexion ou 100 Ko) → le chiffre peut rester pareil des heures, c'est normal", /100 Ko/.test(u1) && /plusieurs heures/.test(u1) && /rien n'est perdu/.test(u1) && !/un peu de retard/.test(u1), u1.slice(0, 400));
  ok("heure de la lecture chez 1NCE affichée près de « Actualiser »", nConso === 1 && /chiffres lus chez 1NCE à \d\d:\d\d/.test(u1) && (await p.$("#tq-usage .bx-conso-lu")) !== null && /76 Ko/.test(u1), [nConso, u1.slice(-200)]);
  await p.screenshot({ path: path.join(OUT, "v5291-conso.png") });
  consoKo = true; await p.click("#tq-usage [data-bxconso-refresh]"); await sleep(1200);
  const u2 = await p.innerText("#tq-usage");
  ok("1NCE injoignable : erreur affichée, et PAS d'heure de lecture (pas de faux « à jour »)", nConso === 2 && /1NCE injoignable/.test(u2) && !/chiffres lus chez 1NCE/.test(u2), u2.slice(-300));

  console.log("== 5. v5.29.2 : « Hors ligne » ne reste pas affiché quand le réseau est revenu (téléphone en veille)");
  fake.setOffline("pc", true);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p.waitForFunction(() => BA.Store.status().sync === "offline", null, { timeout: 40000 }).catch(() => {});   // le client réessaie quelques secondes avant d'abandonner
  ok("réseau coupé : le badge dit « Hors ligne »", (await p.innerText("#sync-status")).includes("Hors ligne") && (await p.evaluate(() => BA.Store.status().sync)) === "offline", await p.innerText("#sync-status"));
  fake.setOffline("pc", false);
  await p.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(1500);
  ok("réseau revenu (rien n'a changé dans la base) : le badge repasse à « Sauvegardé » tout seul", (await p.innerText("#sync-status")).includes("Sauvegardé") && (await p.evaluate(() => BA.Store.status().sync)) === "ok", await p.innerText("#sync-status"));

  const o = await ctx.newPage();
  o.on("pageerror", e => errs.push("opérateur : " + e.message));
  await o.goto(URL0 + "operateur.html");
  await o.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2000);
  const opTabs = await o.$$eval("#app-tabbar [data-view]", l => l.map(b => b.dataset.view).join()), opNav = await o.$$eval("#app-nav [data-view]", l => l.map(b => b.dataset.view).join());
  ok("appli opérateur : Dashboard en PREMIER onglet (onglets du bas et menu), puis À faire, Remplir, Alertes, Plus", opTabs === "dashboard,todo,fill,alerts,more" && opNav === opTabs, [opTabs, opNav]);
  ok("appli opérateur : s'ouvre sur le Dashboard (onglet actif), avec les machines", !!(await o.$("#view-dashboard.active")) && !(await o.$("#view-todo.active")) && (await o.$eval("#app-tabbar [data-view=dashboard]", b => b.classList.contains("active"))) && /FAS-529000001|#1/.test(await o.innerText("#view-dashboard")));
  await o.click("#app-tabbar [data-view=todo]").catch(() => o.click("#app-nav [data-view=todo]")); await sleep(600);
  ok("l'onglet « À faire » s'ouvre toujours", !!(await o.$("#view-todo.active")));
  await o.close();

  ok("aucune erreur JavaScript", errs.length === 0, errs.slice(0, 6));
  await browser.close(); srv.close();
  if (ko) { console.log("\nv5.29 : " + ko + " ÉCHEC(S)"); process.exit(1); } else console.log("\nv5.29 : TOUT EST OK");
})().catch(e => { console.log("ARRÊT : " + (e.stack || e)); process.exit(1); });
