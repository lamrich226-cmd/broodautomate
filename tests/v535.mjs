// AUDIT (v5.32.3) — « Remplir » de l'appli opérateur poussé dans ses coins, vraie appli dans Chromium, faux Supabase, données inventées :
const invYes = async (pg, mv, how) => { const y = mv ? "#mvw-inv-yes" : "#inv-yes", e = mv ? "#mvw-inv-ok" : "#inv-empty"; await pg.waitForSelector(y + ", " + e); const act = x => how === "tap" ? pg.tap(x) : how === "dbl" ? pg.dblclick(x) : pg.click(x); if (await pg.$(y)) await act(y); else { await pg.evaluate(() => { const w = BA.Wizard.w; BA.Actions.applyInventory(w.itId, {}, false); w.step = 2; w.mode = "view"; BA.Wizard.render(); }); await pg.waitForTimeout(300); } };   // v5.34.3 : machine « vide » → pas de bouton Oui
//  tiroirs de 3 à 6 pains, vue Machine et compteurs − / + (bornés à la capacité), retour en arrière entre les étapes,
//  double appui, annuler puis rouvrir, chargement complet ; le stock final est vérifié à chaque fois.
// node v535.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v535");
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
  const now = Date.now();
  const H = 3600000;
  const lot = (id, qty, ageH, extra) => Object.assign({ id, qty, date: now - ageH * H, kept: false }, extra || {});
  const sel = (n, cap, lots) => ({ n, cap, lots, type: "blanc", price: 2.5 });
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * 86400000 }, epoch: "essai535", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-535000001", num: 1, street: "Rue 1", city: "Bruxelles", region: "bxl", serial: "535000001", door: false, link: false, power: false, temp: 5,
      sels: [sel(11, 5, [lot(1, 2, 60), lot(2, 1, 10)]), sel(15, 6, [lot(3, 3, 5)]), sel(19, 3, []), sel(21, 4, [lot(4, 4, 70)])] }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 400, height: 900 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  let p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  const Q = () => p.evaluate(() => { const m = BA.Store.get().machines[0]; return Object.fromEntries(m.sels.map(x => [x.n, x.lots.reduce((a, l) => a + l.qty, 0)])); });
  const IT = () => p.evaluate(() => BA.Store.get().interventions.map(i => ({ id: i.id, status: i.status, step: i.step })));
  await p.setViewportSize({ width: 390, height: 800 });
  await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(500);
  ok("départ : 11→3, 15→3, 19→0, 21→4 pains", JSON.stringify(await Q()) === JSON.stringify({ 11: 3, 15: 3, 19: 0, 21: 4 }), await Q());

  console.log("== 1. Inventaire en vue Machine, tiroirs de 4 à 6 pains");
  await p.evaluate(() => BA.MachineView.setMode("machine"));
  const adm = p; p = await ctx.newPage(); p.on("pageerror", e => errs.push("opérateur : " + e.message));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(URL0 + "operateur.html"); await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  await p.evaluate(() => BA.MachineView.setMode("machine"));
  await p.evaluate(() => BA.Wizard.open(1)); await p.waitForSelector("#wz-mv");
  const cells = await p.$$eval("#wz-mv [data-mv-sel]", l => l.map(x => x.dataset.mvSel).join());
  ok("la fenêtre montre les 4 tiroirs", cells === "11,15,19,21", cells);
  // tiroir 15 (cap 6) : compter 5 au lieu de 3 ; tiroir 11 (cap 5) : compter 5 (3 → 5)
  await p.click("#mvt-1-15"); await sleep(250);
  const slots6 = await p.$$eval(".mv-pop .mv-slots .mv-sw", e => e.length);
  ok("le tiroir 15 (6 pains max) dessine 6 emplacements dans sa fenêtre", slots6 === 6, slots6);
  await p.click("#mvi-p"); await p.click("#mvi-p"); await p.click("#mvi-p");   // 3 → 6
  const v6 = await p.$eval(".mv-pop .mv-num", e => e.textContent);
  ok("le compteur s'arrête à la capacité (6) et « + » se grise", v6.trim() === "6" && await p.$eval("#mvi-p", e => e.disabled), v6);
  await p.keyboard.press("Escape"); await sleep(200);
  await p.click("#mvt-1-11"); await sleep(250);
  await p.click("#mvi-m"); await p.click("#mvi-m"); await p.click("#mvi-m");
  const v0 = await p.$eval(".mv-pop .mv-num", e => e.textContent);
  ok("le compteur s'arrête à 0 et « − » se grise", v0.trim() === "0" && await p.$eval("#mvi-m", e => e.disabled), v0);
  await p.click("#mvi-p"); await p.click("#mvi-p");     // 11 : compté 2 (au lieu de 3)
  await p.keyboard.press("Escape"); await sleep(200);
  await p.screenshot({ path: path.join(OUT, "tel-inventaire-4-6.png") });
  await p.click("#mvw-inv-ok"); await p.waitForSelector("#mvw-rm-yes, #mvw-rm-ok, #mvw-rm-next");
  let q = await Q();
  ok("inventaire : 11 passe de 3 à 2 (le plus vieux part), 15 de 3 à 6", q[11] === 2 && q[15] === 6 && q[19] === 0 && q[21] === 4, q);
  const lots11 = await p.evaluate(() => BA.Store.get().machines[0].sels[0].lots.map(l => l.qty + "@" + Math.round((Date.now() - l.date) / 3600000)).join());
  ok("le pain manquant du tiroir 11 est pris sur le lot le plus VIEUX (60 h : 2→1)", /^1@6\d,1@(9|10|11)$/.test(lots11), lots11);

  console.log("== 2. Retrait : 11 a 1 pain de 60 h, 21 a 4 pains de 70 h");
  await p.click("#mvt-1-21"); await sleep(250);
  for (let k = 0; k < 2; k++) await p.click("[id^=mvr-][id$=-m]");     // retirer 2 sur 4
  await p.keyboard.press("Escape"); await sleep(200);
  await p.click("#mvw-rm-ok"); await p.waitForSelector("#mvw-ld-ok");
  q = await Q();
  ok("retrait : 21 passe de 4 à 2 (gardés une fois), 11 de 2 à 1", q[21] === 2 && q[11] === 1, q);

  console.log("== 3. Retour arrière puis on recommence : le stock revient exactement comme avant");
  await p.click("#mvw-back"); await p.waitForSelector("#mvw-rm-yes, #mvw-rm-ok, #mvw-rm-next");
  q = await Q();
  ok("retour à l'étape 2 : stock d'après l'inventaire (11→2, 15→6, 21→4)", q[11] === 2 && q[15] === 6 && q[21] === 4, q);
  await p.click("#mvw-back"); await p.waitForSelector("#mvw-inv-yes, #mvw-inv-ok");
  q = await Q();
  ok("retour à l'étape 1 : stock d'origine (11→3, 15→3, 21→4)", q[11] === 3 && q[15] === 3 && q[19] === 0 && q[21] === 4, q);
  const jr = await p.evaluate(() => (BA.Store.get().journal || []).filter(e => e.it).length);
  ok("le journal ne garde rien des étapes annulées", jr === 0, jr);

  console.log("== 4. Double-tap sur « Oui, c'est bon » : une seule étape doit être validée");
  await invYes(p, true, "dbl"); await sleep(600);
  const stp = await p.evaluate(() => ({ step: BA.Wizard.w.step, it: BA.Store.get().interventions[0].step, q: Object.fromEntries(BA.Store.get().machines[0].sels.map(x => [x.n, x.lots.reduce((a, l) => a + l.qty, 0)])) }));
  ok("après un double-tap : on est à l'étape 2, rien n'a été retiré (stock inchangé)", stp.step === 2 && stp.it === 2 && stp.q[11] === 3 && stp.q[21] === 4, stp);

  console.log("== 5. Annuler à l'étape 2 puis recommencer");
  await p.click("#wz-cancel"); await p.click("#wz-cancel"); await sleep(500);
  const its = await IT();
  ok("l'intervention annulée est « annulée » (v5.34.3 : tout ce qui était validé est défait) et la porte est refermée", its.length === 1 && its[0].status === "cancelled" && !(await p.evaluate(() => BA.Store.get().machines[0].door)), its);
  await p.evaluate(() => BA.Wizard.open(1)); await p.waitForSelector("#wz-mv"); await sleep(300);
  const its2 = await IT();
  ok("« Remplir » à nouveau : une nouvelle intervention à l'étape 1", its2.length === 2 && its2[0].status === "open" && its2[0].step === 1, its2);

  console.log("== 6. Chargement jusqu'à pleine capacité (cap 5 et 6) puis fin");
  await invYes(p, true); await p.waitForSelector("#mvw-rm-yes, #mvw-rm-ok, #mvw-rm-next");
  await p.click("#mvw-rm-no"); await p.waitForSelector("#mvw-ld-ok");
  await p.click("#mvw-ld-full"); await sleep(200);
  const tot = await p.$eval("#mvl-total", e => e.textContent);
  await p.click("#mvw-ld-ok"); await p.waitForTimeout(300); if (!(await p.$("#wz-close"))) await p.click("#mvw-ld-ok"); await p.waitForSelector("#wz-close");
  q = await Q();
  ok("chargement : tous les tiroirs sont pleins (11→5, 15→6, 19→3, 21→4) — total annoncé : " + tot.trim(), q[11] === 5 && q[15] === 6 && q[19] === 3 && q[21] === 4, q);
  const apres = await p.evaluate(() => { const m = BA.Store.get().machines[0]; return { door: m.door, over: m.sels.filter(x => x.lots.reduce((a, l) => a + l.qty, 0) > x.cap).length, neg: m.sels.filter(x => x.lots.some(l => l.qty <= 0)).length }; });
  ok("fin : porte fermée, aucun tiroir au-dessus de sa capacité, aucun lot vide", !apres.door && apres.over === 0 && apres.neg === 0, apres);
  await p.click("#wz-close"); await sleep(300);
  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.35 : " + ko + " ÉCHEC(S)" : "v5.35 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
