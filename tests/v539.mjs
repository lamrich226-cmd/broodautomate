// Essais de la v5.33 (audit complet) — chaque défaut trouvé par l'audit a son essai :
//  1) une modification refusée ne change RIEN (avant : sélection à moitié modifiée : numéro ou type déjà changés, puis « capacité refusée » ;
//     fenêtre du tiroir : type enregistré même quand le prix était refusé ; calendrier : effet changé puis « dates refusées »)
//  2) « Remplir » : des valeurs qui ne sont pas des nombres ne mettent plus « NaN » dans le stock (inventaire, retrait, chargement)
//  3) relevé 4G pris APRÈS « Remplir » mais AVANT la fin de l'inventaire, traité ensuite : ventes pas retirées deux fois
//  4) téléphone : Technique › Système ne dépasse plus de l'écran (bouton « Effacer les relevés bruts… » trop long)
// node v539.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v539");
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
  const now = Date.now(), H = 3600000;
  const lot = (id, qty, ageH) => ({ id, qty, date: now - ageH * H, kept: false });
  const sel = (n, cap, lots, type) => ({ n, cap, lots, type: type || "blanc", price: 2.5 });
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * 86400000 }, epoch: "essai539", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-539000001", num: 1, street: "Rue 1", city: "Bruxelles", region: "bxl", serial: "539000001", door: false, link: false, power: false, temp: 5,
      sels: [sel(11, 3, [lot(1, 2, 10)]), sel(15, 3, [lot(2, 3, 5)]), sel(19, 3, [], "gris"), sel(21, 3, [lot(3, 1, 70)], "gris")] }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 390, height: 844 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2000);

  console.log("== 1. Une modification refusée ne change rien");
  const a = await p.evaluate(() => {
    const A = BA.Actions, M = BA.Model, S = BA.Store, m = () => S.get().machines[0], one = n => JSON.stringify(M.sel(m(), n));
    const out = {};
    let b = one(11); out.e1 = A.updateSelection(1, 11, { n: 77, cap: 0 }); out.same1 = one(11) === b && !M.sel(m(), 77);
    b = one(15); out.e2 = A.updateSelection(1, 15, { type: "gris", cap: 1 }); out.same2 = one(15) === b;          // 3 pains : capacité 1 refusée
    const nTypes = (S.get().customTypes || []).length;
    b = one(19); out.e3 = A.updateSelection(1, 19, { newType: "Pain essai", cap: 99 }); out.same3 = one(19) === b && (S.get().customTypes || []).length === nTypes;
    b = one(21); out.e4 = A.updateSelection(1, 21, { n: 15 }); out.same4 = one(21) === b;                                  // numéro déjà pris
    out.e5 = A.updateSelection(1, 21, { n: 25, cap: 2, price: 3.1 }); out.ok5 = !!M.sel(m(), 25) && M.sel(m(), 25).cap === 2 && M.sel(m(), 25).price === 3.1;
    A.updateSelection(1, 25, { n: 21, cap: 3, price: 2.5 });
    const err = A.calendarAdd({ name: "Essai", kind: BA.Forecast.KINDS[0], from: "2026-12-01", to: "2026-12-02", effect: 10, scope: "all" });
    const e = S.get().calendar.find(x => x.name === "Essai");
    out.e6 = A.calendarUpdate(e.id, { effect: 50, from: "2026-12-05", to: "2026-12-01" });
    const e2 = S.get().calendar.find(x => x.id === e.id); out.same6 = !err && e2.effect === 10 && e2.from === "2026-12-01";
    return out;
  });
  ok("numéro 77 + capacité 0 : refusé (capacité) et la sélection garde son numéro", a.e1 === "err_cap" && a.same1, a);
  ok("type « gris » + capacité plus petite que le stock : refusé et le type ne change pas", a.e2 === "err_cap_stock" && a.same2, a);
  ok("nouveau type + capacité 99 : refusé, aucun type « Pain essai » créé", a.e3 === "err_cap" && a.same3, a);
  ok("numéro déjà pris : refusé, rien ne change", a.e4 === "err_sel_exists" && a.same4, a);
  ok("modification correcte (numéro + capacité + prix ensemble) : tout est enregistré", a.e5 === null && a.ok5, a);
  ok("calendrier : effet 50 % + dates à l'envers : refusé, l'effet reste 10 %", a.e6 === "err_cal_dates" && a.same6, a);

  // fenêtre du tiroir (vue Machine) : type changé + prix vide → rien n'est enregistré
  await p.evaluate(() => { BA.MachineView.setMode("machine"); BA.Shell.state.machine = 1; BA.Shell.go("details"); }); await sleep(600);
  await p.click("#mvt-1-15"); await p.waitForSelector("#mvx-type-1");
  await p.selectOption("#mvx-type-1", "gris"); await p.fill("#mvx-price-1", ""); await p.dispatchEvent("#mvx-price-1", "input");
  await p.click("[data-mvx-save]"); await sleep(400);
  await p.screenshot({ path: path.join(OUT, "tiroir-prix-refuse.png") });
  const t1 = await p.evaluate(() => { const z = BA.Model.sel(BA.Store.get().machines[0], 15); return { type: z.type, price: z.price, msg: (document.querySelector(".mv-msg, .mv-pop .alert") || {}).textContent || "" }; });
  ok("fenêtre du tiroir : type changé + prix vide → message d'erreur, le type reste « blanc »", t1.type === "blanc" && t1.price === 2.5 && /prix/i.test(t1.msg), t1);
  await p.fill("#mvx-price-1", "2.8"); await p.dispatchEvent("#mvx-price-1", "input");
  await p.click("[data-mvx-save]"); await sleep(400);
  const t2 = await p.evaluate(() => { const z = BA.Model.sel(BA.Store.get().machines[0], 15); return { type: z.type, price: z.price }; });
  ok("prix corrigé : type et prix enregistrés ensemble", t2.type === "gris" && t2.price === 2.8, t2);
  await p.evaluate(() => { BA.Actions.updateSelection(1, 15, { type: "blanc", price: 2.5 }); BA.MachineView.closeFull && BA.MachineView.closeFull(); });
  await p.keyboard.press("Escape"); await sleep(200);

  console.log("== 2. « Remplir » : des valeurs qui ne sont pas des nombres ne cassent pas le stock");
  const b = await p.evaluate(() => {
    const A = BA.Actions, M = BA.Model, S = BA.Store, q = n => M.qty(M.sel(S.get().machines[0], n));
    const before = { 11: q(11), 15: q(15), 19: q(19), 21: q(21) };
    const id = A.startIntervention(1);
    A.applyInventory(id, { 11: "abc", 15: "", 19: NaN, 21: "1" }, false);
    const afterInv = { 11: q(11), 15: q(15), 19: q(19), 21: q(21) };
    const it = () => S.get().interventions.find(x => x.id === id);
    const invOk = it().inv.every(r => Number.isFinite(r.real));
    const rows = M.removalList(S.get(), S.get().machines[0], null).map(r => ({ sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: "x", keep: false }));
    A.applyRemoval(id, rows, "edit");
    const afterRm = { 11: q(11), 15: q(15), 19: q(19), 21: q(21) };
    A.applyLoad(id, { 11: "abc", 15: [{ qty: "2", date: Date.now() }, null, { qty: NaN }], 19: 3, 21: Infinity }, Date.now());
    const afterLd = { 11: q(11), 15: q(15), 19: q(19), 21: q(21) };
    const nan = JSON.stringify(S.get().machines[0]).includes("null,") || S.get().machines[0].sels.some(z => z.lots.some(l => !Number.isFinite(l.qty)));
    return { before, afterInv, invOk, afterRm, afterLd, nan, it: { st: it().status, load: it().load.map(r => r.qty), rem: it().remTotal } };
  });
  ok("inventaire « abc », vide ou NaN = pas compté (stock inchangé), « 1 » = 1 pain", JSON.stringify(b.afterInv) === JSON.stringify({ 11: 2, 15: 3, 19: 0, 21: 1 }) && b.invOk, b);
  ok("retrait « x » : rien retiré (avant : stock NaN)", JSON.stringify(b.afterRm) === JSON.stringify(b.afterInv) && b.it.rem === 0, b);
  ok("chargement « abc » / NaN / ligne vide : 0 ; « 2 » : 2 ; 3 : 3 ; Infinity : 0 — aucun lot NaN", JSON.stringify(b.afterLd) === JSON.stringify({ 11: 2, 15: 3, 19: 3, 21: 1 }) && !b.nan && b.it.st === "done", b);

  console.log("== 3. Relevé 4G pris pendant l'inventaire, traité après : ventes pas retirées deux fois");
  const c = await p.evaluate(async () => {
    const M = BA.Model, S = BA.Store, A = BA.Actions, num = 1, q = n => M.qty(M.sel(M.machine(S.get(), num), n));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const x = t => ({ t, src: "4g", analyse: { events: [] }, audit: { errors: [], total_count: 1001 }, ancien: { total_count: 1000 },
      diff: { baseline: false, anomalies: false, identique: false, deltaCount: 1, deltaValue: 2.5, parSelection: [{ selection: "15", delta: 1, deltaValue: 2.5 }], ecartSelections: 0 },
      nv: { eva: [], fas: [], pow: [], activations: [], temp: [] } });
    const ventes = () => { const s = S.get(); return (((s.daily[M.dayKey(Date.now())] || {})[num]) || {}).s || 0; };
    const q0 = q(15), v0 = ventes();
    const id = A.startIntervention(num);                  // l'opérateur touche « Remplir »
    await sleep(1100);
    const tReleve = Date.now();                            // la porte s'ouvre : le boîtier relit la machine (1 vente faite juste avant)
    await sleep(1100);
    A.applyInventory(id, { 15: q0 - 1 }, false);           // l'opérateur compte : la vente est déjà partie
    const qInv = q(15);
    S.update(s => BA.Reel.applyAudit(s, num, x(tReleve))); // le relevé arrive maintenant (téléphone en retard d'une minute)
    const qApres = q(15), v1 = ventes();
    A.cancelIntervention(id);
    // relevé pris APRÈS l'inventaire (vente après le remplissage) : retiré normalement
    S.update(s => BA.Reel.applyAudit(s, num, x(Date.now() + 1000)));
    return { q0, qInv, qApres, v0, v1, qFin: q(15) };
  });
  ok("stock = ce que l'opérateur a compté (la vente n'est pas retirée une 2e fois)", c.qInv === c.q0 - 1 && c.qApres === c.qInv, c);
  ok("la vente compte quand même dans les chiffres du jour", c.v1 === c.v0 + 1, c);
  ok("relevé pris après l'inventaire : vente retirée normalement", c.qFin === c.qApres - 1, c);

  console.log("== 4. Téléphone : aucune page de Technique ne dépasse de l'écran");
  await p.evaluate(() => BA.Shell.go("technique")); await sleep(500);
  const over = {};
  for (const id of await p.$$eval("[data-tq-tab]", l => l.map(b => b.dataset.tqTab))) {
    await p.click(`[data-tq-tab="${id}"]`); await sleep(450);
    over[id] = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }
  await p.click('[data-tq-tab="system"]'); await sleep(300);
  await p.screenshot({ path: path.join(OUT, "technique-systeme-tel.png"), fullPage: true });
  ok("390 px : aucun onglet de Technique ne déborde à droite " + JSON.stringify(over), Object.values(over).every(v => v <= 1), over);

  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.39 : " + ko + " ÉCHEC(S)" : "v5.39 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
