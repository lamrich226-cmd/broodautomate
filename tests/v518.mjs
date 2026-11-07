// Essais de la v5.18 : « Ajouter un boîtier » avec la machine saisie à la main ; relevé d'un autre modèle de machine refusé
// node v518.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v518");
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

// v5.18 : (1) « Ajouter un boîtier » avec la machine saisie à la main ; (2) un relevé d'un autre MODÈLE de machine est refusé
// même quand les deux machines annoncent le même n° générique. Données inventées.
const now = Date.now(), H = 3600000, MIN = 60000;
const DEV = { A: "d0000000-0000-0000-0000-00000000000a" };
const etat = {
  v: 1, hv: 1, seq: 5000, real: { v: 5, created: now - 9 * 24 * H }, daily: {}, epoch: "essai518", moves: [], thr48: true, orders: [], missions: [], interventions: [], journal: [], applied: [], events: [],
  machines: [{ id: "FAS-FAS000000001", num: 1, street: "Kerkstraat 1", city: "Antwerpen", region: "vl", serial: "202164170", door: false, link: false, power: false, temp: 4.5,
    sels: [{ n: 1, cap: 10, lots: [], type: "blanc", price: 2.5 }], lastSale: null, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null }],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: {}, calendar: []
};
const PL = n => ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "ID1*FAS000000001* FASTER     *0091* *+120*", "ID5*261107*1000",
  "VA1*" + n * 250 + "*" + n + "*" + n * 250 + "*" + n + "*0**0", "PA1*1*250*0", "PA2*" + n + "*" + n * 250 + "*" + n, "DXE*1*1"].join("\r\n") + "\r\n";
const L480 = ["DXS*1234567890*VA*V1/1", "ST*001*0001", "ID1*FAS00000001* 480 LUX  *0280", "ID5*121019*1745",
  "VA1*21054935*87271*21054935*87271", "PA1*1*270*0", "PA2***1389", "DXE*1*1"].join("\r\n") + "\r\n";

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: 4.5, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  fake.t.devices.push({ id: DEV.A, name: "Boîtier Kerk", machine_id: "FAS-FAS000000001", key_hash: "a".repeat(64), last_seen: new Date(now - 2 * MIN).toISOString(), created_at: "2026-10-27T10:00:00Z",
    info: { fw: "1.4", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), rssi: 18, op: "20601", seq: 10, up: 7200, lu: 2, ko: 0 } });
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
  await sleep(2500);
  const shot = n => p.screenshot({ path: path.join(OUT, n + ".png") });
  const toast = () => p.evaluate(() => { const x = document.getElementById("toast"); return x ? x.textContent : ""; });
  const refresh = async () => { await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(1200); };
  const ms = () => p.evaluate(() => BA.Store.get().machines.map(m => ({ id: m.id, num: m.num, street: m.street, city: m.city, serial: m.serial })));
  const m1 = () => p.evaluate(() => { const m = BA.Store.get().machines[0]; return { tot: m.tot && m.tot.n, sig: m.g4 && m.g4.sig, rid: m.g4 && m.g4.rid, wrong: BA.Store.get().events.filter(e => e.num === 1 && e.code === "BOX_WRONG" && !e.resolved).length }; });

  console.log("== 1. Technique → Boîtiers 4G → « Ajouter un boîtier » : la machine se saisit à la main");
  await p.evaluate(() => BA.Shell.go("technique")); await sleep(800);
  await p.waitForSelector("#bx-add", { timeout: 15000 });
  ok("formulaire : nom du boîtier, liste de machines (« Nouvelle machine » en premier), nom/adresse, ville, plaque facultative", !!(await p.$("#bx-name")) && !!(await p.$("#bx-street")) && !!(await p.$("#bx-city")) && !!(await p.$("#bx-plate")) && /Nouvelle machine/.test(await p.$eval("#bx-machine option", o => o.textContent)));
  ok("les champs de la nouvelle machine sont visibles par défaut", await p.isVisible("#bx-street"));
  await p.$eval("#bx-add", e => e.scrollIntoView({ block: "center" })); await sleep(300); await shot("v518-01-ajouter-boitier");
  await p.fill("#bx-name", "Boîtier 480"); await p.click("#bx-add"); await sleep(500);
  ok("sans nom de machine ni ville : refusé, rien créé", /nom ou l'adresse/.test(await toast()) && (await ms()).length === 1 && fake.t.devices.length === 1, await toast());
  await p.fill("#bx-street", "Garage Test"); await p.fill("#bx-city", "Deurne"); await p.fill("#bx-plate", "FAS000000001"); await p.click("#bx-add"); await sleep(500);
  ok("plaque générique refusée", /générique|plaque/i.test(await toast()) && (await ms()).length === 1 && fake.t.devices.length === 1, await toast());
  await p.fill("#bx-plate", ""); await p.click("#bx-add");
  await p.waitForSelector("#bx-key-line", { timeout: 10000 });
  const line = await p.innerText("#bx-key-line");
  ok("clé affichée une fois (#define DEVICE_KEY)", /^#define DEVICE_KEY\s+"[0-9a-f]{32}"/.test(line));
  await p.click("#dlg-ok"); await sleep(600);
  const m = await ms();
  ok("machine #2 créée (sans plaque) : nom, ville, identifiant interne FAS-BX…", m.length === 2 && m[1].num === 2 && m[1].street === "Garage Test" && m[1].city === "Deurne" && /^FAS-BX[0-9A-Z]{5}$/.test(m[1].id) && m[1].serial === "", m);
  const nb = fake.t.devices.find(d => d.name === "Boîtier 480");
  ok("Supabase : machine ajoutée et boîtier lié à cette machine", !!nb && nb.machine_id === m[1].id && fake.t.machines.some(x => x.id === m[1].id && x.name === "Garage Test" && x.city === "Deurne"), [nb && nb.machine_id]);
  await p.waitForSelector("#bx-add"); await sleep(300);
  await p.fill("#bx-name", "Boîtier 3"); await p.fill("#bx-street", "Rue Test"); await p.fill("#bx-city", "Bruxelles"); await p.fill("#bx-plate", "fas-202160001"); await p.click("#bx-add");
  await p.waitForSelector("#bx-key-line", { timeout: 10000 }); await p.click("#dlg-ok"); await sleep(600);
  const m3 = (await ms())[2];
  ok("avec plaque : machine « FAS-202160001 », plaque notée", m3 && m3.id === "FAS-202160001" && m3.serial === "202160001", m3);
  await p.waitForSelector("#bx-add"); await sleep(300);
  await p.fill("#bx-name", "Boîtier 4"); await p.fill("#bx-street", "Autre"); await p.fill("#bx-city", "Gent"); await p.fill("#bx-plate", "202160001"); await p.click("#bx-add"); await sleep(500);
  ok("même plaque que celle d'une machine existante : refusée", /déjà|autre machine|utilis/i.test(await toast()) && (await ms()).length === 3, await toast());
  await p.selectOption("#bx-machine", "FAS-FAS000000001"); await sleep(200);
  ok("machine existante choisie : champs de saisie cachés", !(await p.isVisible("#bx-street")));
  await p.fill("#bx-name", "Boîtier 2e"); await p.click("#bx-add");
  await p.waitForSelector("#bx-key-line", { timeout: 10000 }); await p.click("#dlg-ok"); await sleep(500);
  ok("2e boîtier sur une machine existante : aucune machine créée", (await ms()).length === 3 && fake.t.devices.some(d => d.name === "Boîtier 2e" && d.machine_id === "FAS-FAS000000001"));

  console.log("\n== 2. Relevé d'un autre modèle de machine (même n° générique) : refusé");
  let id = 0;
  const report = async (raw, minAgo) => { fake.t.device_reports.push({ id: ++id, device_id: DEV.A, machine_id: "FAS-FAS000000001", raw, role: "boitier", received_at: new Date(now - minAgo * MIN).toISOString() }); await refresh(); };
  await report(PL(10), 30);
  let r = await m1();
  ok("1er relevé de la Power Lift (modèle FASTER) : accepté, modèle retenu", r.tot === 10 && r.sig === "FASTER" && r.wrong === 0, r);
  await report(PL(12), 20);
  r = await m1(); ok("2e relevé : +2 ventes", r.tot === 12, r);
  await report(L480, 10);
  r = await m1();
  ok("relevé d'une 480 (87 271 ventes, même n° générique) : RIEN compté, alerte « autre machine »", r.tot === 12 && r.wrong === 1 && r.rid === 3, r);
  await p.evaluate(() => BA.Shell.go("alerts")); await sleep(900); await shot("v518-02-releve-autre-machine");
  const al = await p.evaluate(() => { const e = BA.Store.get().events.find(x => x.code === "BOX_WRONG"); return e && e.data && e.data.msg; });
  ok("alerte : nom du modèle reçu (480 LUX)", al === "480 LUX", al);
  await report(PL(13), 5);
  r = await m1(); ok("relevé suivant de la bonne machine : accepté (+1), alerte réglée", r.tot === 13 && r.wrong === 0, r);
  const bad = await p.evaluate(() => (BA.Store.get().daily[Object.keys(BA.Store.get().daily).pop()] || {})[1]);
  ok("aucune vente fantôme dans le journal du jour", JSON.stringify(bad || {}).indexOf("87271") < 0 && (await p.evaluate(() => (BA.Store.get().journal || []).length)) < 100);

  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST BON");
  process.exit(ko ? 1 : 0);
})();
