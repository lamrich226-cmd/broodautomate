// Essais de la v5.12 : page « Technique » (Boîtiers 4G en détail, Machines, Câble et clé USB, Journal, Système)
// et page « Connexion RS232 » allégée (seulement les boîtiers et leur état), n° de plaque corrigeable.
// node v512.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v512");
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
// Relevé inventé, au format EVA-DTS (n° de la machine : FAS202164170)
const RAW = ["DXS*FAS202164170*VA*V1/6*1", "ST*001*0001", "ID1*FAS202164170* FASTER     *0091* *+120*", "ID5*261106*1000",
  "VA1*1000*10*0*0*0**0", "PA1*11*0*250*0**1**0*99", "PA2*10*1000*10", "EA1*EGS*261106*0955***+120", "EA2*EGS****0",
  "MA5*TEMPER*261106*0950*+045", "DXE*1*1"].join("\r\n") + "\r\n";

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [
    { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
    { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-123", meta: { role: "operator" } }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: 4.5, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  fake.t.ba_demandes = [
    { id: 1, device_id: DEV.A, machine_id: "FAS-FAS000000001", statut: "faite", message: null, cree_at: new Date(now - 40 * MIN).toISOString(), prise_at: new Date(now - 39 * MIN).toISOString(), fini_at: new Date(now - 38 * MIN).toISOString() },
    { id: 2, device_id: DEV.B, machine_id: "FAS-202166085", statut: "echec", message: "La machine ne répond pas", cree_at: new Date(now - 4 * H).toISOString(), prise_at: new Date(now - 4 * H + MIN).toISOString(), fini_at: new Date(now - 4 * H + 2 * MIN).toISOString() }];
  const seen = ms => new Date(now - ms).toISOString();
  fake.t.devices.push(
    { id: DEV.A, name: "Boîtier Kerk", machine_id: "FAS-FAS000000001", key_hash: "a".repeat(64), last_seen: seen(2 * MIN), created_at: "2026-10-27T10:00:00Z",
      info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), rssi: 18, op: "20601", seq: 10, up: 7200, lu: 2, ko: 0, porte: { ouverte: false, depuis: seen(H), alerte: false } } },
    { id: DEV.B, name: "Boîtier Molen", machine_id: "FAS-202166085", key_hash: "b".repeat(64), last_seen: seen(3 * H), created_at: "2026-10-28T10:00:00Z",
      info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 3 * H) / 1000), rssi: 9, op: "20610", seq: 300, up: 50000, lu: 14, ko: 1 } },
    { id: DEV.C, name: "Boîtier School", machine_id: "FAS-202177777", key_hash: "c".repeat(64), last_seen: seen(MIN), created_at: "2026-10-29T10:00:00Z",
      info: { fw: "1.2", mode: 1, stok: false, st: "essai sans machine", hb: 30, rd: 60, ec: 900, lok: 0, rssi: 25, op: "20620", seq: 4, up: 600, lu: 0, ko: 0 } });

  const browser = await chromium.launch();
  const errs = [];
  const device = async (name, opts, page = "index.html", email = "amor@test.be") => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts));
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, name);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(name + " : " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(name + " : " + m.text()); });
    await p.goto(URL0 + page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", email); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(2500);
    return p;
  };
  const p = await device("pc", { viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const go = async (v, pg = p) => { await pg.evaluate(x => BA.Shell.go(x), v); await pg.mouse.move(1000, 400); await sleep(700); };
  const tab = async (name, pg = p) => { await pg.click(`[data-tq-tab=${name}]`); await sleep(500); };
  const shot = (n, pg = p) => pg.screenshot({ path: path.join(OUT, n + ".png") });
  const rawKeys = pg => pg.evaluate(() => { const k = new Set(Object.keys(BA.I18n.dicts.fr)); return [...new Set((document.body.innerText.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).filter(w => k.has(w) || /^(bx|bxs|tq|rs|every|dur)_/.test(w)))]; });

  console.log("== 1. Page « Connexion RS232 » : seulement les boîtiers et leur état");
  await go("rs232");
  await p.waitForSelector("#view-rs232 .bx-sum-list", { timeout: 15000 });
  const sum = await p.innerText("#view-rs232");
  ok("4 chiffres : 3 boîtiers, 2 en ligne, 1 hors ligne, 1 / 3 machine lue", /Boîtiers\s*3/i.test(sum) && /En ligne\s*2/i.test(sum) && /Hors ligne\s*1/i.test(sum) && /1 \/ 3/.test(sum), sum.slice(0, 300));
  const rows = await p.$$eval("#view-rs232 li.bx-sum", l => l.map(x => x.innerText.replace(/\s+/g, " ")));
  ok("Boîtier Kerk : en ligne, machine lue (heure de la lecture)", rows.some(r => /Boîtier Kerk/.test(r) && /En ligne/.test(r) && /Machine lue \(\d\d:\d\d\)/.test(r)), rows);
  ok("Boîtier Molen : hors ligne, état de la machine inconnu, dernier contact", rows.some(r => /Boîtier Molen/.test(r) && /Hors ligne/.test(r) && /état inconnu/.test(r) && /Dernier contact/.test(r)), rows);
  ok("Boîtier School : en ligne mais en mode essai (pas branché sur la machine)", rows.some(r => /Boîtier School/.test(r) && /En ligne/.test(r) && /mode essai/.test(r)), rows);
  ok("plus de câble, de « Mes machines », de commandes SQL ni de clé USB sur cette page", !(await p.$("#view-rs232 #btn-rs-connecter")) && !(await p.$("#view-rs232 #rs-machines")) && !(await p.$("#view-rs232 [data-bx=sql]")) && !(await p.$("#view-rs232 #usb-file")));
  await shot("v512-01-connexion-rs232");
  await p.click("#view-rs232 [data-go-tech]"); await sleep(900);
  ok("bouton « Détail et réglages » → page Technique, onglet Boîtiers 4G", await p.evaluate(() => BA.Shell.state.view === "technique" && BA.Technique.current() === "boxes"));

  console.log("\n== 2. Technique → Boîtiers 4G : détail de chaque boîtier, données estimées");
  ok("menu : « Technique » juste après « Connexion RS232 »", (await p.$$eval("#app-nav button[data-view]", b => b.map(x => x.dataset.view).join())).includes("rs232,technique"));
  ok("6 onglets dans l'ordre (Flux brut après Système)", (await p.$$eval("[data-tq-tab]", b => b.map(x => x.dataset.tqTab).join())) === "boxes,machines,cable,journal,system,raw");
  await p.waitForSelector("#rs-boitiers details.bx-more", { timeout: 15000 });
  ok("3 boîtiers : détails repliés (ouvert seulement quand il n'y a qu'un boîtier)", (await p.$$eval("#rs-boitiers details.bx-more", d => d.map(x => x.open).join())) === "false,false,false");
  await p.click(`#rs-boitiers details.bx-more[data-bxmore="${DEV.A}"] > summary`); await sleep(300);
  const detA = await p.innerText(`#rs-boitiers details.bx-more[data-bxmore="${DEV.A}"]`);
  ok("détail : programme, mode normal, allumé depuis 2 h 00, réseau Proximus", /v1\.2/.test(detA) && /normal \(branché sur la machine\)/.test(detA) && /2 h 00/.test(detA) && /Proximus \(20601\)/.test(detA), detA);
  ok("détail : rythme « toutes les heures », « toutes les 30 min », « toutes les 15 min »", /Relit la machine\s*toutes les heures/.test(detA) && /Signal de vie\s*toutes les 30 min/.test(detA) && /vérifié\s*toutes les 15 min/.test(detA), detA);
  ok("détail : machine #1 et sa température, porte fermée, 2 lectures réussies", /#1 — Kerkstraat 1/.test(detA) && /4,5 °C/.test(detA) && /fermée/.test(detA) && /2 réussies · 0 échecs/.test(detA), detA);
  // 10 envois + 7200 s / 900 s = 8 vérifications ; 2 relevés : (18 × 5 Ko + 2 × 2,8 Ko) à (18 × 9 + 2 × 2,8) Ko ; × 360 pour 30 jours
  ok("données : ≈ 0,1 à 0,2 Mo depuis le démarrage (10 envois, 8 vérifications), ≈ 34 à 59 Mo par mois", /≈ 0,1 à 0,2 Mo \(10 envois, 8 vérifications/.test(detA) && /≈ 34 à 59 Mo, au même rythme/.test(detA), detA);
  const est = await p.evaluate(() => [BA.Boitiers.estimate({ info: { seq: 10, up: 7200, ec: 900, lu: 2 } }), BA.Boitiers.estimate({ info: { seq: 4, up: 600, ec: 900 } }), BA.Boitiers.estimate({ info: { fw: "1.0" } })]);
  ok("calcul de l'estimation (et rien sans les compteurs du boîtier ; pas de mois avant 1 h)", Math.abs(est[0].lo - 95.6 / 1024) < 1e-9 && Math.abs(est[0].moisHi - 167.6 / 1024 * 360) < 1e-6 && est[1].moisLo === null && est[2] === null, est);
  const detC = await p.innerText(`#rs-boitiers details.bx-more[data-bxmore="${DEV.C}"]`);
  ok("boîtier allumé depuis 10 min : « trop tôt » pour le mois", /trop tôt/.test(await p.evaluate(id => { const d = document.querySelector(`details.bx-more[data-bxmore="${id}"]`); d.open = true; return d.innerText; }, DEV.C)), detC);
  ok("total de tous les boîtiers allumés depuis plus d'une heure (2)", /Tous les boîtiers \(2\), au rythme actuel : ≈ \d+ à \d+ Mo par mois/.test(await p.innerText("#rs-boitiers")));
  await p.evaluate(() => BA.Boitiers.redraw(true)); await sleep(300);
  ok("le détail ouvert reste ouvert quand la liste est redessinée", await p.$eval(`details.bx-more[data-bxmore="${DEV.A}"]`, d => d.open));
  ok("installation (commandes SQL, fonction) repliée en bas", !!(await p.$("#rs-boitiers details.bx-install:not([open])")) && !(await p.isVisible("#rs-boitiers [data-bx=fn]")));
  ok("tableau des boîtiers : réseau en clair (BASE / Telenet)", /BASE \/ Telenet \(20620\)/.test(await p.innerText("#rs-boitiers .bx-table")));
  await shot("v512-02-technique-boitiers");

  console.log("\n== 3. Technique → Machines : n° de plaque corrigeable (il sert au contrôle du boîtier)");
  // un relevé du boîtier A, alors que la machine #1 a encore le n° générique FAS000000001 : refusé (« autre machine »)
  fake.t.device_reports.push({ id: 1, device_id: DEV.A, machine_id: "FAS-FAS000000001", raw: RAW, role: "boitier", received_at: new Date(now - 20 * MIN).toISOString() });
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(600);
  ok("plaque générique : le relevé de FAS202164170 est refusé (« relevé d'une autre machine »)", await p.evaluate(() => BA.Store.get().events.some(e => e.code === "BOX_WRONG" && e.num === 1 && !e.resolved)));
  await tab("machines");
  ok("la plaque est une case à remplir", (await p.inputValue("#mm-serial-1")) === "FAS000000001");
  const toasts = () => p.evaluate(() => { const x = document.getElementById("toast"); return x ? [x.textContent] : []; });
  await p.fill("#mm-serial-1", "FAS-000000001"); await p.press("#mm-serial-1", "Tab"); await sleep(500);
  ok("n° générique refusé", (await p.evaluate(() => BA.Store.get().machines[0].serial)) === "FAS000000001" && (await toasts()).some(x => /générique/.test(x)), await toasts());
  await p.fill("#mm-serial-1", "202166085"); await p.press("#mm-serial-1", "Tab"); await sleep(500);
  ok("plaque d'une autre machine refusée", (await p.evaluate(() => BA.Store.get().machines[0].serial)) === "FAS000000001" && (await toasts()).some(x => /autre machine/.test(x)), await toasts());
  await p.fill("#mm-serial-1", "202164170"); await p.press("#mm-serial-1", "Tab"); await sleep(1200);
  const m1 = await p.evaluate(() => { const m = BA.Store.get().machines[0]; return { id: m.id, serial: m.serial }; });
  ok("plaque corrigée : 202164170 (l'identifiant interne ne change pas)", m1.serial === "202164170" && m1.id === "FAS-FAS000000001", m1);
  await p.waitForFunction(() => BA.Store.status().pending === 0 && BA.Store.status().sync === "ok", null, { timeout: 15000 });
  ok("Supabase (table machines) : plaque mise à jour", fake.t.machines.find(x => x.id === "FAS-FAS000000001").serial === "202164170");
  fake.t.device_reports.push({ id: 2, device_id: DEV.A, machine_id: "FAS-FAS000000001", raw: RAW.replace("VA1*1000*10", "VA1*1250*11").replace("PA2*10*1000*10", "PA2*11*1250*11"), role: "machine", received_at: new Date(now - 5 * MIN).toISOString() });
  await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(800);
  const ev1 = await p.evaluate(() => BA.Store.get().events.filter(e => e.num === 1).map(e => e.code + (e.resolved ? "-r" : "")));
  ok("relevé suivant accepté : « relevé d'une autre machine » réglé, premier relevé noté", ev1.includes("BOX_WRONG-r") && ev1.some(c => /^READ_FIRST/.test(c)) && (await p.evaluate(() => BA.Store.get().machines[0].g4.rid)) === 2, ev1);
  await shot("v512-03-technique-machines");

  console.log("\n== 4. Technique → Câble et clé USB");
  await tab("cable");
  ok("câble : Connecter et Lire maintenant ; clé USB visible ; test EVA-DTS replié", (await p.isVisible("#btn-rs-connecter")) && (await p.isVisible("#btn-rs-lire")) && (await p.isVisible("#usb-machine")) && !(await p.isVisible("#eva-raw")));
  await p.click("details.rs-eva > summary"); await sleep(200);
  await p.fill("#eva-raw", RAW); await p.click("#btn-eva-parse"); await sleep(200);
  ok("test EVA-DTS : le texte collé est décodé", /FAS202164170/.test(await p.innerText("#eva-parsed")));
  await shot("v512-04-technique-cable");

  console.log("\n== 5. Technique → Journal : ce que les boîtiers ont envoyé");
  await tab("journal");
  await p.waitForSelector("#tq-journal .tq-reports", { timeout: 15000 });
  const lignes = await p.$$eval("#tq-journal .tq-reports tbody tr", l => l.map(x => x.innerText.replace(/\s+/g, " ")));
  ok("2 envois, le plus récent d'abord : origine, contenu décodé, taille, traité", lignes.length === 2 && /envoyé par la machine/.test(lignes[0]) && /lu par le boîtier/.test(lignes[1]) && /relevé complet · 11 ventes au total · 4,5 °C/.test(lignes[0]) && /Ko/.test(lignes[0]) && lignes.every(l => /traité/.test(l)), lignes);
  const jr = await p.innerText("#tq-journal");
  ok("alertes de communication : « relevé d'une autre machine » (réglée), « Boîtier 4G muet » (Molen), premier relevé", /relevé d'une autre machine/.test(jr) && /muet/.test(jr) && /Premier relevé|premier relevé/i.test(jr), jr.slice(0, 1500));
  ok("demandes « Lire maintenant » : faite (Kerk) et échec avec la raison (Molen)", /Boîtier Kerk[\s\S]*faite à/.test(jr) && /échec : La machine ne répond pas/.test(jr), jr.slice(-700));
  await p.click("#tq-journal [data-tqview='1']"); await sleep(500);
  const dlg = await p.innerText(".dlg-modal");
  ok("« Voir » : n° lu FAS202164170, porte (EGS), température, texte complet", /FAS202164170/.test(dlg) && /EGS/.test(dlg) && /4,5 °C/.test(dlg) && (await p.inputValue("#tq-raw")).includes("VA1*1000*10"), dlg.slice(0, 900));
  await shot("v512-05-voir");
  await p.keyboard.press("Escape"); await sleep(300);
  const at0 = await p.evaluate(() => BA.Technique._journal().at);
  fake.t.device_reports.push({ id: 3, device_id: DEV.C, machine_id: "FAS-202177777", raw: RAW.replace(/FAS202164170/g, "FAS202177777"), role: "boitier", received_at: new Date().toISOString() });
  await p.click("#tq-j-refresh"); await p.waitForFunction(at => BA.Technique._journal().at > at && !BA.Technique._journal().busy, at0, { timeout: 10000 });
  ok("« Actualiser » : le nouvel envoi apparaît en premier", (await p.$$eval("#tq-journal .tq-reports tbody tr", l => l.length)) === 3 && /Boîtier School/.test(await p.innerText("#tq-journal .tq-reports tbody tr:first-child")));
  await shot("v512-06-technique-journal");

  console.log("\n== 6. Technique → Système");
  await tab("system");
  await p.waitForFunction(() => !BA.Technique._system().busy && BA.Technique._system().at > 0, null, { timeout: 10000 });
  let sy = await p.innerText("#tq-system");
  ok("version 5.20.0, Supabase, compte amor@test.be, sauvegardé, taille des données", /Broodautomate v5\.20\.0/.test(sy) && /Supabase \(en ligne/.test(sy) && /amor@test\.be/.test(sy) && /Sauvegardé/.test(sy) && /\d+ Ko · machines : 3/.test(sy), sy.slice(0, 900));
  ok("copies de nuit et notifications pas encore installées : dit clairement", /pas installées \(commandes 13 à 18/.test(sy) && /pas installées \(commandes 1 à 12/.test(sy), sy);
  fake.t.ba_state_backup = ["2026-11-05", "2026-11-06"].flatMap(j => ["main", "hist"].map(l => ({ jour: j, ligne: l, version: 3, data: {}, cree_at: j + "T02:30:00.000Z" })));
  fake.t.ba_notifications = [{ id: 3, cle: "x", type: "porte", titre: "Boîtier Kerk : porte ouverte depuis plus de 15 min", texte: "", silencieux: false, cree_at: new Date(now - 30 * MIN).toISOString(), envoye_at: null }];
  await p.click("#tq-s-check"); await sleep(300);
  await p.waitForFunction(() => !BA.Technique._system().busy, null, { timeout: 10000 });
  sy = await p.innerText("#tq-system");
  ok("après « Tout revérifier » : 2 nuits gardées (dernière le 06/11), dernière notification pas encore envoyée", /2 nuit\(s\) gardée\(s\) · dernière copie le 06\/11/.test(sy) && /porte ouverte depuis plus de 15 min · pas encore envoyée/.test(sy), sy.slice(0, 1200));
  ok("boîtiers : 3, tables et « Lire maintenant » installés", /Boîtiers\s*3/.test(sy) && /Tables des boîtiers installées\s*oui/.test(sy) && /« Lire maintenant » installé\s*oui/.test(sy), sy);
  await shot("v512-07-technique-systeme");

  console.log("\n== 7. Clavier, langues, lien « machines hors ligne »");
  await p.click("[data-tq-tab=raw]"); await sleep(300); await p.keyboard.press("ArrowRight"); await sleep(400);
  ok("flèche droite sur le dernier onglet → retour au premier (Boîtiers 4G)", await p.evaluate(() => BA.Technique.current() === "boxes" && document.activeElement.dataset.tqTab === "boxes"));
  for (const lang of ["nl", "en"]) {
    await p.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build(); }, lang); await sleep(500);
    await go("rs232");
    let raw = await rawKeys(p);
    for (const tb of ["boxes", "machines", "cable", "journal", "system", "raw"]) {
      await go("technique"); await tab(tb); await sleep(300);
      raw = raw.concat(await rawKeys(p));
    }
    ok(`${lang} : Connexion RS232 et les 6 onglets de Technique sans texte manquant`, raw.length === 0, raw);
    ok(`${lang} : titre de la page traduit`, (await p.innerText("#view-technique h2")).trim() === (lang === "nl" ? "Techniek" : "Technical"));
  }
  await p.evaluate(() => { BA.I18n.set("fr", "admin"); BA.Shell.build(); }); await sleep(500);
  await go("dashboard");
  const todo = await p.$("[data-todo=offline]");
  ok("« À faire » : machines pas lues", !!todo);
  if (todo) { await todo.click(); await sleep(700); }
  ok("clic → page Connexion RS232 (l'état des boîtiers)", await p.evaluate(() => BA.Shell.state.view === "rs232"));

  console.log("\n== 8. Téléphone (admin) et opérateur");
  const tel = await device("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await go("rs232", tel); await tel.waitForSelector("#view-rs232 .bx-sum-list", { timeout: 15000 });
  const wide = () => tel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("téléphone, Connexion RS232 : pas de défilement horizontal", (await wide()) <= 1, await wide());
  await shot("v512-08-tel-connexion", tel);
  await go("technique", tel);
  ok("téléphone : les 6 onglets passent à la ligne", await tel.$eval(".tq-tabs", x => getComputedStyle(x).flexWrap === "wrap"));
  for (const tb of ["boxes", "machines", "cable", "journal", "system", "raw"]) {
    await tab(tb, tel); await sleep(400);
    ok(`téléphone, Technique « ${tb} » : pas de défilement horizontal`, (await wide()) <= 1, await wide());
  }
  await tab("boxes", tel);
  ok("téléphone : le tableau des boîtiers devient des cartes (titres des colonnes cachés)", await tel.$eval("#rs-boitiers table.bx-table thead", x => getComputedStyle(x).display === "none"));
  await shot("v512-09-tel-technique", tel);
  const op = await device("op", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "operateur.html", "op@test.be");
  ok("appli opérateur : pas de page Technique", await op.evaluate(() => !BA.Shell.ctx.views.some(v => v.id === "technique") && !document.querySelector("[data-view=technique]")));

  ok("aucune erreur dans les pages", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT EST BON");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
