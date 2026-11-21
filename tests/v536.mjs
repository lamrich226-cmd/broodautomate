// AUDIT (v5.32.3) — « Remplir » sur une machine de 18 tiroirs de 3 pains, tous vides (comme la machine d'essai), sur téléphone.
//  Inventaire « Oui », rien à retirer, chargement avec « + » puis « Tout remplir » : 54 pains dans la machine à la fin.
// node v536.mjs <dossier du site> <dossier des captures>
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
  await p.evaluate(() => { const s = BA.Store.get(), m = s.machines[0]; });
  const adm = p; p = await ctx.newPage(); p.on("pageerror", e => errs.push("opérateur : " + e.message));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(URL0 + "operateur.html"); await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  await p.evaluate(() => { BA.MachineView.setMode("machine"); BA.Actions.deleteEvents && 0; });
  // la vraie machine #3 : 18 tiroirs de 3 pains, tous vides (état fabriqué dans la page)
  await p.evaluate(nums => {
    const m = BA.Store.get().machines[0];
    BA.Store.update(s => { const mm = s.machines[0]; mm.sels = nums.map(n => ({ n, cap: 3, lots: [], type: "blanc", price: 2.5 })); });
  }, [11, 15, 19, 21, 25, 29, 31, 35, 39, 41, 45, 49, 51, 55, 59, 61, 65, 69]);
  await p.evaluate(() => BA.Wizard.open(1)); await p.waitForSelector("#wz-mv"); await sleep(400);
  await p.screenshot({ path: path.join(OUT, "tel-18-etape1.png") });
  await p.click("#mvw-inv-yes"); await p.waitForSelector("#mvw-rm-next, #mvw-rm-yes, #mvw-rm-ok"); await sleep(300);
  await p.screenshot({ path: path.join(OUT, "tel-18-etape2.png") });
  await p.click("#mvw-rm-next"); await p.waitForSelector("#mvw-ld-ok"); await sleep(300);
  await p.screenshot({ path: path.join(OUT, "tel-18-etape3.png") });
  await p.click("#mvt-1-11"); await sleep(250);
  await p.screenshot({ path: path.join(OUT, "tel-18-etape3-tiroir.png") });
  await p.click("[id^=mvl-][id$=-p]"); await p.click("[id^=mvl-][id$=-p]");
  await p.keyboard.press("Escape"); await sleep(200);
  const t3 = await p.$eval("#mvl-total", e => e.textContent);
  ok("chargement : le total suit les « + » (2 pains) : " + t3.trim(), /2/.test(t3), t3);
  await p.click("#mvw-ld-full"); await sleep(200);
  const t4 = await p.$eval("#mvl-total", e => e.textContent);
  ok("« tout remplir » : 54 pains annoncés : " + t4.trim(), /54/.test(t4), t4);
  await p.click("#mvw-ld-ok"); await p.waitForSelector("#wz-close"); await sleep(300);
  await p.screenshot({ path: path.join(OUT, "tel-18-fin.png") });
  const tot = await p.evaluate(() => BA.Store.get().machines[0].sels.reduce((a, x) => a + x.lots.reduce((b, l) => b + l.qty, 0), 0));
  ok("fin : 54 pains dans la machine", tot === 54, tot);
  await p.click("#wz-close"); await sleep(300);
  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.36 : " + ko + " ÉCHEC(S)" : "v5.36 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
