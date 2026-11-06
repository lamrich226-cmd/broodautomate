// Essais de la v5.15 : onglet Technique → « Flux brut » (relevé complet demandé au boîtier, jamais automatique)
// node v515.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v515");
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
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 500))); if (!c) ko++; };

// 3 machines, 3 boîtiers : A lit la machine #1 (dont la plaque est encore le n° générique), B est hors ligne, C est en mode essai
const now = Date.now(), H = 3600000, MIN = 60000;
const machine = (num, id, street, serial) => ({ id, num, street, city: "Antwerpen", region: "vl", serial, door: false, link: false, power: false, temp: 4.5,
  sels: [{ n: 11, cap: 10, lots: [], type: "blanc", price: 2.5 }], lastSale: null, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null });
const etat = {
  v: 1, hv: 1, seq: 5000, real: { v: 5, created: now - 9 * 24 * H }, daily: {}, epoch: "essai512", moves: [], thr48: true, orders: [], missions: [], interventions: [], journal: [], applied: [], events: [],
  machines: [machine(1, "FAS-FAS000000001", "Kerkstraat 1", "FAS000000001"), machine(2, "FAS-202166085", "Molenstraat 2", "202166085"), machine(3, "FAS-202177777", "Schoolstraat 3", "202177777")],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: {}, calendar: []
};
const DEV = { A: "d0000000-0000-0000-0000-00000000000a", B: "d0000000-0000-0000-0000-00000000000b", C: "d0000000-0000-0000-0000-00000000000c" };
// Relevé COMPLET inventé (avec le « bruit » : caisse CA*, jetons, lecteur de carte…) et relevé allégé comme en envoie le boîtier v1.3
const COMPLET = ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "ID1*FAS000000001* FASTER     *0091* *+120*", "ID4*2*39", "ID5*261106*1000",
  "VA1*125050*501*0*7*0**0", "VA2**0**0", "VA3*0*0*0*0", "BA1***", "CA1***", "CA2*0*14*0*7", "CA11*5*0*0*0*0*0*0", "CA17*0*5*0***0", "TA2*0*0*0*0",
  "DA1*00000001    *SELF/2000   *0216", "DA2*125050*480*0*3", "DA4*0*0", "MA1**0", "PA1*11*100*1100*0**1**0*99", "PA2*50*5000*7", "LA1*0*11*100*7*50",
  "EA1*EGS*261106*0955***+120", "EA2*EGS****0", "MA5*POW OFF*261030*1010", "MA5*TEMPER*261106*0950*+045", "MA5*TEMPER*261106*0935*+044", "G85*0000", "SE*26*001*0001", "DXE*1*1"].join("\r\n") + "\r\n";
const ALLEGE = ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "ID5*261106*1000", "VA1*125050*501*0*7*0**0", "DA2*125050*480*0*3", "PA1*11*100*1100*0**1**0*99", "PA2*50*5000*7",
  "LA1*0*11*100*7*50", "G85*0000", "SE*9*001*0001", "DXE*1*1"].join("\r\n") + "\r\n";
const sha = k => crypto.createHash("sha256").update(k).digest("hex");
const KEY = "0123456789abcdef0123456789abcdef";

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: 4.5, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  fake.t.ba_demandes = []; fake.t.device_reports = [];
  const seen = ms => new Date(Date.now() - ms).toISOString();
  fake.t.devices.push(
    { id: DEV.A, name: "Boîtier Kerk", machine_id: "FAS-FAS000000001", key_hash: sha(KEY), last_seen: seen(MIN), created_at: "2026-10-27T10:00:00Z",
      info: { fw: "1.3", mode: 0, stok: true, st: "ok", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), seq: 10, up: 7200, lu: 2, ko: 0, porte: { ouverte: false, depuis: seen(H), alerte: false } } },
    { id: DEV.B, name: "Boîtier Molen", machine_id: "FAS-202166085", key_hash: "b".repeat(64), last_seen: seen(MIN), created_at: "2026-10-28T10:00:00Z",
      info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), seq: 5, up: 7200, lu: 2, ko: 0 } });

  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1440, height: 900 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 });
  await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
  await sleep(3000);
  const shot = n => p.screenshot({ path: path.join(OUT, n + ".png") });
  const door = n => p.evaluate(x => { const m = BA.Store.get().machines.find(y => y.num === x); return { door: m.door, at: m.doorAt || 0 }; }, n);
  const waitDoor = async (n, want, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await door(n)).door === want) return Date.now() - t0; await sleep(500); } return -1; };

  
  const rpc = (fait = 0, ok2 = true, msg = "") => fake.boitierRpc(KEY, fait, ok2, msg).body;
  const addReport = (raw, role = "boitier", ms = 0) => { const id = Math.max(0, ...fake.t.device_reports.map(r => r.id)) + 1; fake.t.device_reports.push({ id, device_id: DEV.A, machine_id: "FAS-FAS000000001", raw, role, received_at: new Date(Date.now() + ms).toISOString() }); return id; };
  const onglet = async () => { await p.evaluate(() => { BA.Shell.go("technique"); }); await sleep(800); await p.evaluate(() => BA.Technique.tab("raw")); await sleep(600); };

  console.log("== 1. L'onglet « Flux brut » est à côté de « Système »");
  await onglet();
  const tabs = await p.$$eval("#app-main .tq-tabs [data-tq-tab]", bs => bs.map(b => b.dataset.tqTab));
  ok("ordre des onglets : …, Système, Flux brut", tabs.join(",") === "boxes,machines,cable,journal,system,raw", tabs);
  ok("le libellé est « Flux brut »", /Flux brut/.test(await p.innerText("#tq-tab-raw")));
  let pane = await p.innerText("#tq-pane-raw");
  ok("explication + bouton + « Aucun flux demandé. »", /allégés/.test(pane) && /Aucun flux demandé/.test(pane) && (await p.$("#tq-raw-go:not([disabled])")) !== null, pane.slice(0, 300));
  await sleep(6000);
  ok("RIEN n'est automatique : aucune demande envoyée au boîtier", fake.t.ba_demandes.length === 0, fake.t.ba_demandes);
  await shot("v515-01-flux-brut-vide");

  console.log("\n== 2. Clic sur « Flux brut » → demande « brut » au boîtier");
  await p.click("#tq-raw-go"); await sleep(1200);
  const dm = fake.t.ba_demandes[0];
  ok("une demande créée, pour le bon boîtier, marquée brut", fake.t.ba_demandes.length === 1 && dm.device_id === DEV.A && dm.brut === true && dm.statut === "attente", fake.t.ba_demandes);
  pane = await p.innerText("#tq-pane-raw");
  ok("affichage : « Demande envoyée à hh:mm » et bouton désactivé", /Demande envoyée à \d\d:\d\d/.test(pane) && (await p.$("#tq-raw-go[disabled]")) !== null, pane.slice(0, 400));
  await shot("v515-02-demande-envoyee");
  await p.click("#tq-raw-go", { force: true, timeout: 1000 }).catch(() => {});
  await sleep(300);
  ok("2e clic pendant l'attente : pas de 2e demande", fake.t.ba_demandes.length === 1);

  console.log("\n== 3. Le boîtier prend la demande, lit, envoie le relevé COMPLET");
  addReport(ALLEGE, "boitier", -1000);                          // un envoi automatique allégé arrive entre-temps
  const r1 = rpc();
  ok("ba_boitier donne la demande avec brut = vrai", r1.dem === dm.id && r1.brut === true, r1);
  const idComplet = addReport(COMPLET, "boitier");
  addReport("DXS*FAS000000001*VA*V1/6*1\r\nST*001*0001\r\nEA1*EGT*261106*1001***+120\r\nG85*0000\r\nSE*4*001*0001\r\nDXE*1*1\r\n", "machine", 500);
  const r2 = rpc(dm.id, true, "");
  ok("annonce « faite »", r2.fait === 1 && fake.t.ba_demandes[0].statut === "faite", r2);
  await p.evaluate(() => BA.Boitiers.refresh(true));
  await p.waitForFunction(() => /Flux reçu à/.test(document.querySelector("#tq-pane-raw").innerText), null, { timeout: 25000 });
  pane = await p.innerText("#tq-pane-raw");
  ok("« Flux reçu à hh:mm · Ko · lignes »", /Flux reçu à \d\d:\d\d(:\d\d)? · \d+,\d Ko · \d+ lignes/.test(pane), pane.slice(0, 300));
  const lignes = await p.$$eval("#tq-pane-raw tbody tr", rs => rs.map(r => r.innerText));
  ok("tableau : TOUTES les lignes du relevé complet (caisse CA11, jetons TA2, lecteur DA1…), pas le relevé allégé", lignes.some(l => /^CA11\*5/.test(l)) && lignes.some(l => /^TA2/.test(l)) && lignes.some(l => /^DA1/.test(l)) && lignes.length >= 28, lignes.length);
  ok("chaque ligne a sa traduction (VA1 : ventes totales)", lignes.some(l => /^VA1\*125050\*501[\s\S]*1250,50/.test(l)), lignes.find(l => /^VA1/.test(l)));
  ok("le relevé affiché est le plus complet (pas l'envoi allégé ni celui de la machine)", lignes.length > 20);
  await shot("v515-03-flux-recu");
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(600);
  await shot("v515-04-flux-recu-telephone");
  await p.setViewportSize({ width: 1440, height: 900 }); await sleep(400);
  const copie = await p.evaluate(() => { let t = ""; navigator.clipboard.writeText = async x => { t = x; }; document.querySelector("#tq-raw-copy").click(); return new Promise(r => setTimeout(() => r(t), 300)); });
  ok("bouton « Copier le texte » : le texte brut exact", copie === COMPLET, copie.slice(0, 80));

  console.log("\n== 4. Une demande normale « Lire maintenant » n'est pas brute");
  await p.evaluate(() => BA.Shell.go("technique")); await sleep(400);
  await p.evaluate(() => BA.Technique.tab("boxes")); await sleep(1500);
  await p.evaluate(id => BA.Boitiers.readNow(id), DEV.A); await sleep(800);
  const dn = fake.t.ba_demandes[fake.t.ba_demandes.length - 1];
  ok("demande normale : brut faux", dn.id !== dm.id && !dn.brut, dn);
  ok("le boîtier la reçoit avec brut = faux", rpc().brut === false);
  rpc(dn.id, true, "");
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(800);

  console.log("\n== 5. Échec : le boîtier n'arrive pas à lire la machine");
  await onglet();
  await p.click("#tq-raw-go"); await sleep(1000);
  const d3 = fake.t.ba_demandes[fake.t.ba_demandes.length - 1];
  rpc(); rpc(d3.id, false, "La machine ne répond pas (menu)");
  await p.evaluate(() => BA.Boitiers.refresh(true));
  await p.waitForFunction(() => /n'a pas pu lire la machine/.test(document.querySelector("#tq-pane-raw").innerText), null, { timeout: 25000 });
  pane = await p.innerText("#tq-pane-raw");
  ok("message clair avec la raison", /La machine ne répond pas \(menu\)/.test(pane), pane.slice(0, 300));
  ok("le bouton est de nouveau utilisable", (await p.$("#tq-raw-go:not([disabled])")) !== null);
  await shot("v515-05-echec");

  console.log("\n== 6. Boîtier hors ligne : bouton désactivé avec explication");
  fake.t.devices.find(d => d.id === DEV.A).last_seen = seen(5 * 3600000);
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(1500); await onglet();
  pane = await p.innerText("#tq-pane-raw");
  ok("hors ligne : bouton désactivé", (await p.$("#tq-raw-go[disabled]")) !== null);
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTout est OK");
  process.exit(ko ? 1 : 0);
})();
