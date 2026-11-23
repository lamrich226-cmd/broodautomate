// AUDIT (v5.33) — « fuzz » des actions : des milliers d'actions au hasard (avec des valeurs justes ET fausses)
// sur les 20 machines du mode démo, avec la vraie logique de l'appli (BA.Actions). Après CHAQUE action :
//   • rien d'impossible (stock négatif, NaN, plus de pains que de places, lot ou alerte en double…) ;
//   • le stock a bougé exactement comme l'action le dit (retrait : − retirés ; chargement : + chargés ;
//     déplacement : total inchangé ; retour arrière : stock remis comme avant ; annuler : rien ne bouge…) ;
//   • « Remplir » : inventaire compté = stock après l'étape 1, etc.
// node v538.mjs <dossier du site> [nombre d'actions par graine]
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(process.argv[2] || ".."), N = Number(process.argv[3]) || 1500;
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
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 1500))); if (!c) ko++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch();
  { const _nc = browser.newContext.bind(browser); browser.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } }); return c; }; }     // v5.41 : les pages sont en 3D par défaut ; ces essais vérifient la vue à plat (2D)
  for (const [page, seed] of [["index.html", 11], ["operateur.html", 22], ["index.html", 33]]) {
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1200, height: 900 } });
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    const p = await ctx.newPage(); const pe = []; p.on("pageerror", e => pe.push(e.message));
    await p.goto(URL0 + page + "?demo&tick=0");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(1500);
    await p.addScriptTag({ path: path.join(TESTS, "audit-page.js") });
    const r = await p.evaluate(async ({ N, seed }) => {
      let x = seed; const rnd = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const pick = a => a[Math.floor(rnd() * a.length)], int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
      const A = BA.Actions, M = BA.Model, S = BA.Store, out = { faits: {}, pb: [], refus: 0 };
      const tot = m => m.sels.reduce((a, z) => a + M.qty(z), 0);
      const mach = n => M.machine(S.get(), n);
      const weird = () => pick([undefined, null, "", "abc", -3, 0, 1, 2, 3, 7, 2.5, 99, NaN, Infinity, "2"]);
      const fail = (op, msg, extra) => { if (out.pb.length < 25) out.pb.push({ op, msg, extra }); };
      const OPS = {
        rmBread() { const m = pick(S.get().machines), sel = pick(m.sels); if (!sel) return; const l = sel.lots.length ? pick(sel.lots) : null;
          const t0 = tot(m), q = rnd() < .7 ? int(0, l ? l.qty + 1 : 2) : weird();
          const res = A.removeBread(m.num, sel.n, l ? [{ lotId: l.id, qty: q }] : [], pick(["old", "damaged", "other"]), "fuzz") || {};
          const t1 = tot(mach(m.num)); if (res.err) { if (t1 !== t0) fail("rmBread", "refusé mais le stock a changé", { t0, t1 }); out.refus++; }
          else if (t1 !== t0 - res.removed) fail("rmBread", "stock ≠ avant − retirés", { t0, t1, res }); },
        move() { const m = pick(S.get().machines), a = pick(m.sels), b = pick(m.sels); if (!a || !b || !a.lots.length) return;
          const t0 = tot(m), qa = M.qty(a), qb = M.qty(b), q = rnd() < .7 ? int(1, 3) : weird();
          const res = A.moveLot(m.num, a.n, b.n, pick(a.lots).id, q) || {};
          const m1 = mach(m.num), t1 = tot(m1);
          if (t1 !== t0) fail("move", "le déplacement a changé le total de la machine", { t0, t1, res });
          if (!res.err && (M.qty(M.sel(m1, a.n)) !== qa - res.qty || M.qty(M.sel(m1, b.n)) !== qb + res.qty)) fail("move", "quantités départ / arrivée fausses", { qa, qb, res }); },
        reqMove() { const m = pick(S.get().machines), a = pick(m.sels), b = pick(m.sels); if (!a || !b || !a.lots.length) return; A.requestMove(m.num, a.n, b.n, pick(a.lots).id, int(1, 2)); },
        doMove() { const mv = (S.get().moves || []); if (!mv.length) return; const r0 = pick(mv), m = mach(r0.num), t0 = m ? tot(m) : 0;
          const res = (rnd() < .8 ? A.doMove(r0.id) : (A.cancelMove(r0.id), {})) || {}; if (m && tot(mach(r0.num)) !== t0) fail("doMove", "total de la machine changé", { t0, res }); },
        keep() { const m = pick(S.get().machines), sel = pick(m.sels); if (!sel || !sel.lots.length) return; const t0 = tot(m); A.keepLot(m.num, sel.n, pick(sel.lots).id); if (tot(mach(m.num)) !== t0) fail("keep", "stock changé"); },
        split() { const m = pick(S.get().machines), sel = pick(m.sels); if (!sel || !sel.lots.length) return; const t0 = tot(m);
          A.splitLot(m.num, sel.n, pick(sel.lots).id, rnd() < .8 ? int(1, 3) : weird(), rnd() < .9 ? Date.now() - int(0, 90) * 3600000 : weird());
          if (tot(mach(m.num)) !== t0) fail("split", "stock changé", { t0, t1: tot(mach(m.num)) }); },
        date() { const m = pick(S.get().machines), sel = pick(m.sels); if (!sel || !sel.lots.length) return; const t0 = tot(m);
          A.setLotDate(m.num, sel.n, pick(sel.lots).id, rnd() < .85 ? Date.now() - int(0, 120) * 3600000 : weird()); if (tot(mach(m.num)) !== t0) fail("date", "stock changé"); },
        selEdit() { const m = pick(S.get().machines), sel = pick(m.sels); if (!sel) return; const t0 = tot(m), before = JSON.stringify(sel);
          const v = pick([{ cap: rnd() < .6 ? int(1, 6) : weird() }, { price: weird() }, { type: pick(M.types(S.get())) }, { n: rnd() < .5 ? int(1, 120) : weird() }, { cap: int(1, 6), price: weird() }, { n: int(1, 99), cap: weird() }]);
          const err = A.updateSelection(m.num, sel.n, v);
          const m1 = mach(m.num); if (tot(m1) !== t0) fail("selEdit", "stock changé", v);
          if (err && M.sel(m1, sel.n) && JSON.stringify(M.sel(m1, sel.n)) !== before) fail("selEdit", "refusé (" + err + ") mais la sélection a quand même changé", { v, before, after: M.sel(m1, sel.n) }); },
        selAdd() { const m = pick(S.get().machines); A.addSelection(m.num, { n: rnd() < .7 ? int(1, 120) : weird(), type: pick(M.types(S.get())), cap: rnd() < .7 ? int(1, 6) : weird(), price: weird() }); },
        selDel() { if (rnd() < .7) return; const m = pick(S.get().machines), sel = pick(m.sels); if (!sel) return; const t0 = tot(m), q = M.qty(sel);
          const err = A.removeSelection(m.num, sel.n); const t1 = tot(mach(m.num)); if (!err && t1 !== t0 - q) fail("selDel", "stock ≠ avant − pains de la sélection", { t0, t1, q }); if (err && t1 !== t0) fail("selDel", "refusé mais stock changé"); },
        // « Remplir » complet ou interrompu, avec retour arrière
        fill() {
          const m = pick(S.get().machines), num = m.num, snap0 = JSON.stringify(m.sels.map(z => z.lots));
          const id = A.startIntervention(num); const it0 = () => S.get().interventions.find(z => z.id === id);
          if (it0().step !== 1) { A.cancelIntervention(id); return; }
          const counts = {}; mach(num).sels.forEach(z => { if (rnd() < .5) counts[z.n] = rnd() < .85 ? int(0, z.cap + 1) : weird(); });
          const skipped = rnd() < .15;
          A.applyInventory(id, counts, skipped);
          const m1 = mach(num), exp1 = mach(num).sels.map(z => z.n);
          const it1 = it0();
          it1.inv.forEach(r => { const z = M.sel(m1, r.sel); if (z && M.qty(z) !== r.real) fail("fill", "après l'inventaire, stock ≠ compté", { sel: r.sel, real: r.real, qty: M.qty(z), counts: counts[r.sel] }); });
          if (rnd() < .2) { A.undoToStep(id, 1); const back = JSON.stringify(mach(num).sels.map(z => z.lots)); if (back !== snap0) fail("fill", "retour à l'étape 1 : stock pas remis comme avant", {}); A.cancelIntervention(id); return; }
          const rows = M.removalList(S.get(), mach(num), M.openMission(S.get(), num)).map(r => ({ sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: rnd() < .8 ? int(0, r.qty) : weird(), keep: false }));
          const t1 = tot(mach(num)), snap1 = JSON.stringify(mach(num).sels.map(z => z.lots));
          A.applyRemoval(id, rows, pick(["all", "none", "edit"]));
          const it2 = it0(), t2 = tot(mach(num));
          if (t2 !== t1 - (it2.remTotal || 0)) fail("fill", "après le retrait, stock ≠ avant − retirés", { t1, t2, rem: it2.remTotal });
          if (rnd() < .25) { A.undoToStep(id, 2); const back = JSON.stringify(mach(num).sels.map(z => z.lots)); if (back !== snap1) fail("fill", "retour à l'étape 2 : stock pas remis comme avant", {}); if (rnd() < .5) { A.cancelIntervention(id); return; } A.applyRemoval(id, [], "none"); }
          if (rnd() < .15) { A.cancelIntervention(id); if (JSON.stringify(mach(num).sels.map(z => z.lots)) !== snap0) fail("fill", "annuler à l'étape 3 : stock pas remis comme avant le Remplir (v5.34.3)"); return; }
          const loads = {}; mach(num).sels.forEach(z => { loads[z.n] = rnd() < .2 ? [{ qty: int(0, 2), date: Date.now() - 3600000 }, { qty: rnd() < .8 ? int(0, 3) : weird(), date: rnd() < .9 ? Date.now() : weird() }] : (rnd() < .85 ? int(0, z.cap + 2) : weird()); });
          const t3 = tot(mach(num));
          A.applyLoad(id, loads, Date.now() - int(0, 20) * 3600000);
          const it3 = it0(), t4 = tot(mach(num)), loaded = (it3.load || []).reduce((a, r) => a + r.qty, 0);
          if (t4 !== t3 + loaded) fail("fill", "après le chargement, stock ≠ avant + chargés", { t3, t4, loaded });
          if (it3.status !== "done") fail("fill", "intervention pas terminée", it3.status);
          mach(num).sels.forEach(z => { if (M.qty(z) > z.cap) fail("fill", "plus de pains que de places après le chargement", { sel: z.n, q: M.qty(z), cap: z.cap }); });
        },
        events() { const ev = S.get().events; if (!ev.length) return; const ids = [pick(ev).id, pick(ev).id];
          pick([() => A.archiveEvents(ids), () => A.deleteEvents(ids), () => A.restoreEvents(ids), () => A.purgeEvents(ids), () => A.archiveEvent(ids[0], rnd() < .5)])(); },
        sim() { const m = pick(S.get().machines); pick([() => A.simulatePower(m.num), () => A.simulateTemp(m.num), () => A.simulateFas(m.num), () => A.setDoor(m.num, rnd() < .5)])(); },
        mission() { const s = S.get(); try { const plan = M.orderPlan(s, { withRemoval: rnd() < .5, passageAt: Date.now() + 3 * 3600000, marginPct: int(0, 20), loadMode: pick(["need", "full"]) }); A.createMissions(plan, { withRemoval: rnd() < .5, marginPct: 5 }); } catch (e) { fail("mission", "plan impossible : " + e.message); } },
        house() { BA.Live.check(); }
      };
      const names = Object.keys(OPS), weights = { fill: 6, rmBread: 4, move: 3, house: 2 };
      const bag = []; names.forEach(n => { for (let i = 0; i < (weights[n] || 1); i++) bag.push(n); });
      for (let i = 0; i < N; i++) {
        const op = pick(bag);
        try { OPS[op](); out.faits[op] = (out.faits[op] || 0) + 1; }
        catch (e) { fail(op, "exception : " + e.message, (e.stack || "").split("\n").slice(0, 3).join(" | ")); }
        if (i % 25 === 0 || op === "fill") { const inv = __A.inv(); if (inv.length) { fail(op, "données impossibles", inv.slice(0, 5)); break; } }
      }
      const inv = __A.inv(); if (inv.length) fail("fin", "données impossibles", inv.slice(0, 5));
      out.errs = __A.take().errs;
      return out;
    }, { N, seed });
    console.log("== " + page + " graine " + seed + " : " + JSON.stringify(r.faits));
    ok("aucun problème après " + N + " actions au hasard (" + r.refus + " refusées comme prévu)", r.pb.length === 0, r.pb);
    ok("aucune erreur JavaScript", !pe.length && !r.errs.length, pe.concat(r.errs).slice(0, 5));
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(ko ? "v5.38 (fuzz) : " + ko + " ÉCHEC(S)" : "v5.38 (fuzz) : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
