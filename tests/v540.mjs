// Essais de la v5.33 — heure de récupération du pain (Paramètres), vraie appli dans Chromium, faux Supabase, données inventées.
//  Tournée de nuit : un « Remplir » à 03:59 propose la date de la VEILLE à 19 h (avant : la veille à 06:00, le pain neuf
//  affichait déjà « 22 h » juste après le chargement). L'heure se change dans Paramètres (admin) et l'appli opérateur la suit.
// node v540.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v540");
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

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  { const _nc = browser.newContext.bind(browser); browser.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } }); return c; }; }     // v5.41 : les pages sont en 3D par défaut ; ces essais vérifient la vue à plat (2D)
  // nuit du 15 au 16 novembre 2026, 03:59 à Bruxelles
  const NUIT = new Date("2026-11-16T03:59:00+01:00").getTime(), H = 3600000;
  const sel = n => ({ n, cap: 3, lots: [], type: n % 2 ? "blanc" : "gris", price: 2.5 });
  // anciennes données : pas encore de « deliveryHour » dans les réglages (valeur par défaut : 19 h)
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NUIT - 70 * 86400000 }, epoch: "essai540", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-540000001", num: 3, street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null, sels: [11, 15, 19, 21, 25, 29].map(sel) }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date(NUIT).toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 390, height: 844 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  await ctx.clock.setFixedTime(NUIT);
  const login = async (p, page) => {
    p.on("pageerror", e => errs.push(page + " : " + e.message));
    await p.goto(URL0 + page);
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }).catch(async () => {
      await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
      await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    });
    await sleep(1500);
  };

  console.log("== 1. Calcul de la date proposée");
  const op = await ctx.newPage(); await login(op, "operateur.html");
  const calc = await op.evaluate(() => {
    const M = BA.Model, f = ms => BA.UI.F.toInput(ms), at = s => new Date(s).getTime();
    return {
      defaut: M.deliveryHour(BA.Store.get()),
      nuit19: f(M.lastDelivery(at("2026-11-16T03:59:00+01:00"), 19)), soir19: f(M.lastDelivery(at("2026-11-16T20:30:00+01:00"), 19)),
      pile19: f(M.lastDelivery(at("2026-11-16T19:00:00+01:00"), 19)), nuit6: f(M.lastDelivery(at("2026-11-16T03:59:00+01:00"), 6)),
      sans: f(M.lastDelivery(at("2026-11-16T03:59:00+01:00")))
    };
  });
  ok("anciennes données sans réglage : 19 h par défaut", calc.defaut === 19, calc);
  ok("03:59 → la veille à 19:00", calc.nuit19 === "2026-11-15T19:00", calc);
  ok("20:30 → le jour même à 19:00 ; 19:00 pile → 19:00", calc.soir19 === "2026-11-16T19:00" && calc.pile19 === "2026-11-16T19:00", calc);
  ok("réglé sur 6 h : 03:59 → la veille à 06:00 (comme avant) ; sans heure : 6 h", calc.nuit6 === "2026-11-15T06:00" && calc.sans === "2026-11-15T06:00", calc);

  console.log("== 2. « Remplir » à 03:59 (vue Machine) : pain daté de la veille à 19 h");
  await op.evaluate(() => { BA.MachineView.setMode("machine"); BA.Shell.go("fill"); }); await sleep(400);
  await op.click("[data-fill]"); await op.waitForSelector("#mvw-inv-yes");
  await op.click("#mvw-inv-yes"); await op.waitForSelector("#mvw-rm-next"); await op.click("#mvw-rm-next"); await op.waitForSelector("#mvl-date");
  const d3 = await op.$eval("#mvl-date", e => e.value);
  ok("étape 3 : « Date de livraison » proposée = 15/11 19:00", d3 === "2026-11-15T19:00", d3);
  await op.click("#mvw-ld-full"); await sleep(200); await op.click("#mvw-ld-ok"); await op.waitForSelector("#wz-close"); await sleep(300);
  await op.screenshot({ path: path.join(OUT, "remplir-nuit-19h.png") });
  const lots = await op.evaluate(() => { const m = BA.Store.get().machines[0]; return m.sels.map(z => z.lots.map(l => BA.UI.F.toInput(l.date) + "×" + l.qty).join(",")); });
  ok("6 tiroirs pleins, tous datés du 15/11 19:00", lots.every(x => x === "2026-11-15T19:00×3"), lots);
  const age = await op.evaluate(() => { const m = BA.Store.get().machines[0], l = m.sels[0].lots[0]; return Math.round((Date.now() - l.date) / 3600000); });
  ok("le pain neuf a 9 h juste après le chargement (avant : 22 h)", age === 9, age);
  const vieux = await op.evaluate(() => { const s = BA.Store.get(), m = s.machines[0]; return m.sels.some(z => z.lots.some(l => BA.Model.isOld(s, l))); });
  ok("aucun pain « à retirer » juste après le remplissage", !vieux, vieux);
  await op.click("#wz-close"); await sleep(200);

  console.log("== 3. Paramètres (admin) : l'heure se change, l'appli opérateur suit");
  const ad = await ctx.newPage(); await login(ad, "index.html");
  await ad.evaluate(() => BA.Shell.go("settings")); await sleep(500);
  const champ = await ad.$eval("#set-deliv-h", e => ({ v: e.value, lab: e.closest("label").textContent.trim() }));
  ok("Paramètres : « Heure de récupération du pain » = 19 h", champ.v === "19" && /récupération du pain/.test(champ.lab), champ);
  await ad.$eval("#set-deliv-h", e => e.scrollIntoView({ block: "center" })); await sleep(200);
  await ad.screenshot({ path: path.join(OUT, "parametres.png") });
  await ad.fill("#set-deliv-h", "7"); await ad.click("#set-save"); await sleep(600);
  ok("enregistré : 7 h", await ad.evaluate(() => BA.Store.get().settings.deliveryHour) === 7);
  await ad.fill("#set-deliv-h", "99"); await ad.click("#set-save"); await sleep(400);
  ok("valeur hors limites (99) ramenée à 23 h", await ad.evaluate(() => BA.Store.get().settings.deliveryHour) === 23);
  await ad.fill("#set-deliv-h", "7"); await ad.click("#set-save"); await sleep(600);
  await op.evaluate(() => BA.Store.pull && BA.Store.pull()); await sleep(1500);
  const d7 = await op.evaluate(() => BA.UI.F.toInput(BA.Model.lastDelivery(Date.now(), BA.Model.deliveryHour(BA.Store.get()))));
  ok("appli opérateur : la nouvelle heure arrive (03:59 → la veille à 07:00)", d7 === "2026-11-15T07:00", d7);
  for (const [l, re] of [["nl", /opgehaald/], ["en", /pick-up/]]) {
    await ad.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build(); BA.Shell.go("settings"); }, l); await sleep(400);
    const lab = await ad.$eval("#set-deliv-h", e => e.closest("label").textContent.trim());
    ok(l.toUpperCase() + " : « " + lab.replace(/\s+/g, " ").slice(0, 50) + " »", re.test(lab), lab);
  }

  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.40 : " + ko + " ÉCHEC(S)" : "v5.40 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
