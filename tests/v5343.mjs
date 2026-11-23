import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "x.js"))("playwright");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v5343")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": f.endsWith(".js") ? "application/javascript; charset=utf-8" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";


// v5.34.3 : « Remplir » sécurisé. Cause du signalement : un chargement non enregistré avait laissé le stock de l'appli à 0 ;
// « Oui, c'est correct » proposait 0 ; « Annuler » gardait cet inventaire.
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const b = await chromium.launch(), errs = [];
const ctx = await b.newContext({ locale: "fr-BE", viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
await p.goto(U + "operateur.html?demo&tick=0"); await p.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await p.waitForTimeout(2000);
await p.evaluate(() => BA.MachineView.setMode("classic"));
const qtyOf = n => p.evaluate(n => { const m = BA.Store.get().machines.find(x => x.num === n); return m.sels.map(s => BA.Model.qty(s)); }, n);
const num = await p.evaluate(() => BA.Store.get().machines[0].num);

console.log("== C : « Annuler » défait tout ce qui était validé");
const avant = await qtyOf(num);
const itC = await p.evaluate(n => { const id = BA.Actions.startIntervention(n); const m = BA.Store.get().machines.find(x => x.num === n); const c = {}; m.sels.forEach(s => { c[s.n] = 0; }); BA.Actions.applyInventory(id, c, false); BA.Actions.applyRemoval(id, [], "none"); return id; }, num);
const milieu = await qtyOf(num);
ok("inventaire à 0 validé : stock à 0 (comme dans le signalement)", milieu.every(x => x === 0), milieu);
await p.evaluate(id => BA.Actions.cancelIntervention(id), itC);
const apres = await qtyOf(num);
const stC = await p.evaluate(id => { const s = BA.Store.get(), it = s.interventions.find(x => x.id === id); return { st: it.status, j: (s.journal || []).filter(e => e.it === id).length, door: !!s.machines.find(m => m.num === it.num).door }; }, itC);
ok("après « Annuler » : stock remis comme avant", JSON.stringify(apres) === JSON.stringify(avant), { avant, apres });
ok("« Annuler » : statut annulé, plus de lignes d'historique, porte pas bloquée", stC.st === "cancelled" && stC.j === 0 && !stC.door, stC);

console.log("== E : « Remplir » ouvert par erreur / formation = ignoré");
const E = await p.evaluate(n => {
  const id1 = BA.Actions.startIntervention(n);
  BA.Store.update(s => { const it = s.interventions.find(x => x.id === id1); it.start = s.now - 70 * 60000; it.seen = it.start; });
  const r0 = BA.Store.get().machines.find(x => x.num === n).sels.map(s => BA.Model.qty(s));
  BA.Store.update(s => BA.Live._housekeepAll(s));
  const s1 = BA.Store.get(), it1 = s1.interventions.find(x => x.id === id1), m1 = s1.machines.find(x => x.num === n);
  const out = { id1: { st: it1.status, auto: !!it1.auto, door: !!m1.door, same: JSON.stringify(m1.sels.map(s => BA.Model.qty(s))) === JSON.stringify(r0) } };
  // 40 min : encore ouvert
  const id2 = BA.Actions.startIntervention(n);
  BA.Store.update(s => { const it = s.interventions.find(x => x.id === id2); it.start = s.now - 40 * 60000; it.seen = it.start; BA.Live._housekeepAll(s); });
  out.id2 = BA.Store.get().interventions.find(x => x.id === id2).status;
  // inventaire validé + 70 min : gardé ouvert (admin), puis > 4 h : clos partiel
  BA.Store.update(s => { const it = s.interventions.find(x => x.id === id2); it.start = s.now - 70 * 60000; it.seen = it.start; });
  const m = BA.Store.get().machines.find(x => x.num === n); const c = {}; m.sels.forEach(s => { c[s.n] = BA.Model.qty(s); }); BA.Actions.applyInventory(id2, c, false);
  BA.Store.update(s => BA.Live._housekeepAll(s));
  out.id2b = BA.Store.get().interventions.find(x => x.id === id2).status;
  BA.Store.update(s => { const it = s.interventions.find(x => x.id === id2); it.start = s.now - 5 * 3600000; it.seen = it.start; BA.Live._housekeepAll(s); });
  out.id2c = BA.Store.get().interventions.find(x => x.id === id2).status;
  return out;
}, num);
ok("rien validé depuis 70 min : annulé automatiquement, stock inchangé, porte pas bloquée", E.id1.st === "cancelled" && E.id1.auto && !E.id1.door && E.id1.same, E);
ok("40 min : encore ouvert (délai pas atteint)", E.id2 === "open", E);
ok("inventaire déjà validé + 70 min : pas ignoré (reste pour l'admin)", E.id2b === "open", E);
ok("plus de 4 h : clos (« partiel »), comme avant", E.id2c === "partial", E);

console.log("== B : inventaire quand l'appli croit la machine vide");
await p.evaluate(n => { BA.Store.update(s => { const m = s.machines.find(x => x.num === n); m.sels.forEach(sel => { sel.lots = []; }); }); }, num);
await p.evaluate(n => BA.Wizard.open(n), num); await p.waitForTimeout(600);
await p.screenshot({ path: path.join(OUT, "1-inventaire-vide.png") });
const B = await p.evaluate(() => ({ yes: !!document.getElementById("inv-yes"), skip: !!document.getElementById("inv-skip"), alerte: (document.querySelector(".modal .alert.err") || {}).textContent || "", val: !!document.getElementById("inv-validate"), vides: Array.from(document.querySelectorAll(".modal input[id^=inv-][data-sel]")).every(i => i.value === ""), vrai: !!document.getElementById("inv-empty") }));
ok("plus de bouton « Oui, c'est correct » ni « Passer »", !B.yes && !B.skip, B);
ok("avertissement visible, cases vides à remplir, « Valider » présent", /vide/.test(B.alerte) && B.vides && B.val, B);
await p.click("#inv-validate"); await p.waitForTimeout(300);
ok("valider sans rien taper : refusé (message d'erreur)", await p.evaluate(() => !!document.querySelector(".modal .alert.err") && !!document.getElementById("inv-validate")), "");
await p.evaluate(() => document.querySelectorAll(".modal input[id^=inv-][data-sel]").forEach(i => { i.value = String(Math.min(6, Number(i.max))); }));
await p.click("#inv-validate"); await p.waitForTimeout(400);
const st2 = await p.evaluate(n => ({ step: BA.Wizard.w.step, q: BA.Store.get().machines.find(x => x.num === n).sels.map(s => BA.Model.qty(s)) }), num);
ok("chiffres tapés : inventaire validé, stock = chiffres tapés", st2.step === 2 && st2.q.every(x => x > 0 && x <= 6), st2);
await p.evaluate(() => BA.Actions.cancelIntervention(BA.Wizard.w.itId)); await p.evaluate(() => BA.Wizard.close());

console.log("== B' : « La machine est vraiment vide » demande une confirmation");
await p.evaluate(n => { BA.Store.update(s => { const m = s.machines.find(x => x.num === n); m.sels.forEach(sel => { sel.lots = []; }); }); BA.Wizard.open(n); }, num); await p.waitForTimeout(500);
await p.click("#inv-empty"); await p.waitForTimeout(300);
ok("1er appui : rien n'est validé, le bouton demande de confirmer", await p.evaluate(() => BA.Wizard.w.step === 1 && /confirmer/i.test(document.getElementById("inv-empty").textContent)), "");
await p.click("#inv-empty"); await p.waitForTimeout(400);
ok("2e appui : inventaire « vide » validé (étape 2)", await p.evaluate(() => BA.Wizard.w.step === 2), "");

console.log("== A : chargement à 0 quand la machine est vide");
await p.evaluate(() => { const w = BA.Wizard.w; BA.Actions.applyRemoval(w.itId, [], "none"); w.step = 3; w.lines = null; BA.Wizard.render(); }); await p.waitForTimeout(500);
await p.click("#ld-validate"); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(OUT, "2-chargement-zero.png") });
const A1 = await p.evaluate(() => ({ step: BA.Wizard.w.step, err: (document.querySelector(".modal .alert.err") || {}).textContent || "" }));
ok("rien chargé + machine vide : bloqué avec message « sera notée VIDE »", A1.step === 3 && /VIDE/.test(A1.err), A1);
await p.click("#ld-validate"); await p.waitForTimeout(400);
ok("2e appui = confirmation explicite : chargement validé", await p.evaluate(() => BA.Wizard.w.step === 4), "");
await p.evaluate(() => BA.Wizard.close());

console.log("== D : ventes alors que l'appli croit la sélection vide");
const D = await p.evaluate(n => {
  BA.Store.update(s => { const m = s.machines.find(x => x.num === n); m.sels.forEach(sel => { sel.lots = []; }); });
  const m = BA.Store.get().machines.find(x => x.num === n);
  const ev = () => BA.Store.get().events.filter(e => e.num === n && e.code === "STOCK_UNKNOWN" && !e.resolved).length;
  BA.Store.update(s => { BA.Model.addEvent(s, n, "STOCK_UNKNOWN", {}); });
  const cree = ev();
  const id = BA.Actions.startIntervention(n); const c = {}; m.sels.forEach(x => { c[x.n] = 4; }); BA.Actions.applyInventory(id, c, false);
  return { cree, apres: ev(), cat: BA.Model.EVENTS.STOCK_UNKNOWN.cat };
}, num);
ok("l'alerte existe (catégorie stock, visible de l'opérateur) et disparaît après un inventaire compté", D.cree === 1 && D.apres === 0 && D.cat === "stock", D);
ok("textes FR/NL/EN de l'alerte présents", await p.evaluate(() => ["fr", "nl", "en"].every(l => BA.I18n.dicts[l].ev_STOCK_UNKNOWN && BA.I18n.dicts[l].inv_suspect && BA.I18n.dicts[l].ld_zero_ask)), "");
ok("aucune erreur JavaScript", errs.length === 0, errs);
await b.close(); srv.close();
console.log(bad ? "\nv5.34.3 : " + bad + " ÉCHEC(S)" : "\nv5.34.3 : TOUT EST OK"); process.exit(bad ? 1 : 0);
