// Essais de la v5.13 : porte ouverte en direct (fonction ba_portes), durée et numéros sur le tableau de bord
// node v513.mjs <dossier du site> <dossier des captures>      (données inventées)
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
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: 4.5, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  fake.t.ba_demandes = [];
  const seen = ms => new Date(Date.now() - ms).toISOString();
  fake.t.devices.push(
    { id: DEV.A, name: "Boîtier Kerk", machine_id: "FAS-FAS000000001", key_hash: "a".repeat(64), last_seen: seen(MIN), created_at: "2026-10-27T10:00:00Z",
      info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), seq: 10, up: 7200, lu: 2, ko: 0, porte: { ouverte: false, depuis: seen(H), alerte: false } } },
    { id: DEV.B, name: "Boîtier Molen", machine_id: "FAS-202166085", key_hash: "b".repeat(64), last_seen: seen(MIN), created_at: "2026-10-28T10:00:00Z",
      info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((now - 10 * MIN) / 1000), seq: 5, up: 7200, lu: 2, ko: 0 } });

  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });   // v5.25 : ces essais vérifient l'affichage « Classique » (comme avant)
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

  console.log("== 1. Commande SQL v5.13 pas encore collée : l'appli continue comme avant");
  await sleep(2000);
  ok("BA.Portes présent mais « non disponible »", await p.evaluate(() => !!BA.Portes && BA.Portes.available() === false));
  ok("aucune erreur dans la console", errs.length === 0, errs);

  console.log("\n== 2. Commande collée → la porte s'affiche en moins de 20 s");
  fake.runV513Sql();
  await p.evaluate(() => BA.Portes.tick(true));        // (l'appli retente seulement au rechargement : on simule ce rechargement)
  await p.reload(); await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(3500);
  ok("fonction trouvée", await p.evaluate(() => BA.Portes.available()));
  ok("porte fermée au départ", (await door(1)).door === false);
  const depuis = Date.now() - 150000;
  fake.t.devices.find(d => d.id === DEV.A).info.porte = { ouverte: true, depuis: new Date(depuis).toISOString(), alerte: false };
  const dt = await waitDoor(1, true);
  ok("porte de la machine #1 ouverte dans l'appli en moins de 20 s (" + dt + " ms)", dt >= 0 && dt < 20000);
  const d1 = await door(1);
  ok("heure d'ouverture = celle du boîtier", Math.abs(d1.at - depuis) < 2000, d1);
  ok("événement « porte ouverte » créé une seule fois", await p.evaluate(() => BA.Store.get().events.filter(e => e.num === 1 && e.code === "DOOR_OPEN").length) === 1);
  await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(1200);
  const dash = await p.innerText("#app-main");
  ok("tableau de bord : bandeau « PORTE OUVERTE · depuis 2 min » sur la machine", /PORTE OUVERTE\s*·\s*depuis 2 min/i.test(dash), dash.slice(0, 400));
  ok("carte « Portes ouvertes » : 1 et le n° #1", /Portes ouvertes[\s\S]{0,12}1[\s\S]{0,12}#1/i.test(dash), dash.slice(0, 400));
  await shot("v513-01-porte-ouverte");
  { // même chose sur un téléphone (autre appareil, qui n'a rien ouvert : il reçoit la porte tout seul)
    const c2 = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await c2.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });   // v5.25 : ces essais vérifient l'affichage « Classique » (comme avant)
    for (const [u, f] of Object.entries(LIB)) await c2.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(c2, "phone");
    const q = await c2.newPage(); q.on("pageerror", e => errs.push("phone : " + e.message));
    await q.goto(URL0 + "index.html"); await q.waitForSelector("#login-email", { timeout: 20000 });
    await q.fill("#login-email", "amor@test.be"); await q.fill("#login-pass", "Secret-123"); await q.click("#login-go");
    await q.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(3500);
    ok("téléphone : la porte ouverte est reçue sans rien ouvrir", (await q.$$(".door-banner")).length === 1);
    await q.screenshot({ path: path.join(OUT, "v513-01b-porte-telephone.png") });
    await c2.close();
  }
  const n0 = fake.nPortes; await sleep(16000);
  ok("l'appli demande les portes toutes les ~15 s", fake.nPortes > n0, [n0, fake.nPortes]);
  ok("pas de doublon d'événement après plusieurs tours", await p.evaluate(() => BA.Store.get().events.filter(e => e.num === 1 && e.code === "DOOR_OPEN").length) === 1);

  console.log("\n== 3. Porte refermée");
  fake.t.devices.find(d => d.id === DEV.A).info.porte = { ouverte: false, depuis: new Date().toISOString(), alerte: false };
  const dt2 = await waitDoor(1, false);
  ok("porte refermée dans l'appli en moins de 20 s", dt2 >= 0 && dt2 < 20000, dt2);
  ok("événement « porte ouverte » résolu", await p.evaluate(() => BA.Store.get().events.filter(e => e.num === 1 && e.code === "DOOR_OPEN" && !e.resolved).length) === 0);
  await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(1200);
  ok("plus de bandeau", (await p.$$(".door-banner")).length === 0 && !/Porte ouverte : #1/.test(await p.innerText("#app-main")));
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  console.log("\n== 4. Total cumulé et carte / espèces (relevé inventé avec DA2)");
  const RAW2 = ["DXS*FAS202164170*VA*V1/6*1", "ST*001*0001", "ID1*FAS202164170* FASTER     *0091* *+120*", "ID5*261106*1000",
    "VA1*637720*2236*0*0*0**0", "DA2*637720*2230*100*10", "PA1*11*0*250*0**1**0*99", "DXE*1*1"].join("\r\n") + "\r\n";
  const au = await p.evaluate(raw => { const a = BA.EvaDts.toAudit(BA.EvaDts.parse(raw)); return a; }, RAW2);
  ok("le relevé donne total 6377,20 € / 2236 ventes dont carte 6377,20 € / 2230", au.total_value === 6377.2 && au.total_count === 2236 && au.cashless_value === 6377.2 && au.cashless_count === 2230, au);
  await p.evaluate(a => BA.Store.update(s => BA.Reel.setTotals(s, 1, a, Date.now() - 60000)), au);
  await p.evaluate(() => { BA.Shell.state.machine = 1; BA.Shell.go("details"); }); await sleep(1500);
  const det = (await p.innerText("#app-main")).replace(/\s+/g, " ");
  ok("Détails : « Total depuis la mise en service » 6 377,20 € et 2 236 ventes", /Total depuis la mise en service/i.test(det) && /6\s?377,20\s?€/.test(det) && /2\s?236 ventes/.test(det), det.slice(0, 500));
  ok("Détails : carte 6 377,20 € (2 230 ventes) et espèces 0,00 € (6 ventes)", /Carte\s*:\s*6\s?377,20\s?€\s*\(2\s?230 ventes\)/.test(det) && /Espèces\s*:\s*0,00\s?€\s*\(6 ventes\)/.test(det), det.slice(0, 700));
  // 2e relevé : +10 € dont 7,50 € carte → les ventes du jour se répartissent
  const au2 = Object.assign({}, au, { total_count: 2240, total_value: 6387.2, cashless_count: 2233, cashless_value: 6384.7 });
  await p.evaluate(a => BA.Store.update(s => BA.Reel.setTotals(s, 1, a, Date.now())), au2);
  await p.evaluate(() => BA.Shell.go("details")); await sleep(1200);
  const det2 = (await p.innerText("#app-main")).replace(/\s+/g, " ");
  ok("2e relevé : total 6 387,20 €, carte 6 384,70 €, espèces 2,50 €", /6\s?387,20\s?€/.test(det2) && /Carte\s*:\s*6\s?384,70/.test(det2) && /Espèces\s*:\s*2,50/.test(det2), det2.slice(0, 700));
  await shot("v513-02-total-carte-especes");
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  console.log("\n== 5. Technique → Système : consommation, copie, purge");
  await p.evaluate(() => { BA.Conso._ajoute(2.5 * 1024 * 1024, 40); BA.Shell.go("technique"); }); await sleep(900);
  await p.click("[data-tq-tab=system]"); await sleep(2500);
  await p.click("#tq-s-check"); await sleep(2500);
  const sys = (await p.innerText("#tq-system")).replace(/\s+/g, " ");
  ok("carte Consommation : téléchargé par cet appareil", /Téléchargé par cet appareil[\s\S]*Mo ce mois/.test(sys), sys.slice(0, 400));
  ok("base de données : 12,0 Mo sur 500 Mo (2 %)", /12,0 Mo sur 500 Mo \(2 %\)/.test(sys), sys);
  ok("data de chaque boîtier par mois (2026-11 et 2026-10)", /2026-11[\s\S]*FAS-FAS000000001 : 244[\s\S]*2026-10/.test(sys), sys);
  ok("boutons copie des données et effacement", !!(await p.$("#tq-c-copy")) && !!(await p.$("#tq-c-purge")));
  const [down] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click("#tq-c-copy")]);
  const fcopie = path.join(OUT, "copie.json"); await down.saveAs(fcopie);
  const cj = JSON.parse(fs.readFileSync(fcopie, "utf8"));
  ok("le fichier de copie contient l'état (3 machines) et les relevés", cj.etat && cj.etat.machines.length === 3 && Array.isArray(cj.audits), Object.keys(cj));
  await shot("v513-03-consommation");
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  console.log("\n== 6. Journal → Voir : chaque ligne reçue avec sa traduction");
  const RAW3 = ["DXS*FAS202164170*VA*V1/6*1", "ST*001*0001", "ID1*FAS202164170* FASTER     *0091* *+120*", "ID4*2*39", "ID5*261106*1138",
    "VA1*10000*40*0*0*0**0", "DA2*8000*30*0*0", "PA1*11*250*1100*0**1**0*99", "PA2*40*10000*40", "EA1*ECF_38*261106*1113***+120", "EA2*ECF_38****1",
    "EA1*EGS*261106*1137***+120", "EA2*EGS****0", "MA5*ERROR*261106*1113*16*38", "MA5*POW ON*261106*0949", "MA5*TEMPER*261106*1004*+164", "G85*1CF3", "DXE*1*1"].join("\r\n") + "\r\n";
  fake.t.device_reports.push({ id: 9001, device_id: DEV.A, machine_id: "FAS-FAS000000001", raw: RAW3, role: "boitier", received_at: new Date().toISOString() });
  await p.evaluate(() => BA.Shell.go("technique")); await sleep(800);
  await p.click("[data-tq-tab=journal]"); await sleep(1200);
  await p.click("#tq-j-refresh"); await sleep(2000);
  await p.click("#tq-journal [data-tqview='9001']"); await sleep(800);
  const dlg = (await p.innerText(".modal, dialog, [role=dialog], .dialog")).replace(/\s+/g, " ");
  ok("tableau « Ligne reçue / Ce que ça veut dire »", /Ligne reçue/i.test(dlg) && /Ce que ça veut dire/i.test(dlg), dlg.slice(0, 300));
  ok("VA1 : ventes totales 100,00 € pour 40 ventes", /VENTES TOTALES[^.]*100,00 € pour 40 ventes/.test(dlg), dlg);
  ok("DA2 : paiements par carte 80,00 € pour 30 ventes", /PAIEMENTS PAR CARTE[^.]*80,00 € pour 30 ventes/.test(dlg), dlg);
  ok("PA1 : sélection 11 prix 2,50 €", /SÉLECTION 11 : prix actuel 2,50 €/.test(dlg), dlg);
  ok("EA1 ECF_38 : événement traduit avec date", /ÉVÉNEMENT « ECF_38 »[^.]*06\/11\/2026 à 11:13/.test(dlg), dlg);
  ok("EA2 : encore actif / terminé", /ENCORE ACTIF/.test(dlg) && /terminé \/ revenu à la normale/.test(dlg), dlg);
  ok("MA5 : erreur 16/38, allumée, température 16,4 °C", /ERREUR de la machine n° 16\/38/.test(dlg) && /ALLUMÉE le 06\/11\/2026 à 09:49/.test(dlg) && /16,4 °C/.test(dlg), dlg);
  ok("le texte brut reste affiché (zone copiable)", (await p.inputValue("#tq-raw")).includes("DXS*FAS202164170"));
  ok("aucune ligne « pas utilisée » pour les lignes courantes", !/Ligne « (VA1|DA2|PA1|EA1|MA5|ID5) »/.test(dlg));
  await p.screenshot({ path: path.join(OUT, "v514-01-journal-traduit.png") });
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  console.log("\n== 6b. Porte restée « ouverte » dans l'appli alors que le serveur dit « fermée » : l'appli se corrige toute seule");
  await p.evaluate(() => BA.Store.update(s => { const m = s.machines.find(x => x.num === 1); m.door = true; m.doorAt = Date.now(); }));
  ok("(départ) la machine #1 est notée ouverte", (await door(1)).door === true);
  const dt3 = await waitDoor(1, false, 25000);
  ok("refermée dans l'appli en moins de 20 s (" + dt3 + " ms) sans nouveau relevé", dt3 >= 0 && dt3 < 20000);

  console.log("\n== 7. Erreur 16/38 + ECF_38 : une seule alerte ; messages conformes au manuel");
  const r7 = await p.evaluate(raw => {
    const an = BA.EvaDts.parse(raw);
    BA.Store.update(s => { s.events = s.events.filter(e => e.num !== 1); BA.Reel.applyEvents(s, 1, { t: Date.now(), analyse: an, src: "boitier" }); });
    const evs = BA.Store.get().events.filter(e => e.num === 1);
    const f16 = evs.filter(e => e.code === "FAS_ERROR" && String(e.code2 || e.data && e.data.code || e.sous || "") !== "");
    return { codes: evs.map(e => e.code + "|" + (e.title || "")), fas: evs.filter(e => e.code === "FAS_ERROR"), ecf: evs.filter(e => /ECF/.test(JSON.stringify(e))).length - evs.filter(e => e.code === "FAS_ERROR" && /ECF/.test(JSON.stringify(e))).length,
      a16: BA.Alertes.fas("16", "38"), a38: BA.Alertes.fas("38", "54") };
  }, RAW3);
  ok("une seule alerte pour 16/38 (pas aussi « ECF_38 »)", r7.fas.length === 1, r7.codes);
  ok("le texte de l'alerte : le pain coincé d'abord, puis les 3 points du manuel (dont « une carte peut être cassée » en dernier)", /^Constaté sur place[\s\S]*pain coincé[\s\S]*Vérifier la connexion aux cartes[\s\S]*Une des cartes peut être cassée\.$/.test(((r7.fas[0].data && r7.fas[0].data.sol) || r7.fas[0].sol || "")), r7.fas[0].sol);
  ok("16 : plus de « tableau électrique » (le manuel dit « control panel board »)", !/tableau électrique/.test(r7.a16.expl) && /panneau de commande/.test(r7.a16.expl), r7.a16.expl);
  ok("code 38 connu (chariot de la cloison arrière, hauteur de la sélection)", r7.a38.connu === true && /hauteur de la sélection/.test(r7.a38.titre), r7.a38);
  ok("pas d'erreur dans la console", errs.length === 0, errs);

  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTout est OK"); process.exit(ko ? 1 : 0);
})();
