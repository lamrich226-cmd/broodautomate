// Essais de la v5.25 (design-test) : corrections de la vérification complète de l'appli.
//  A. MODE DÉMO : 1) fenêtre « Déplacer » avec ses vrais titres ; 2) la fenêtre d'un tiroir garde sa position (écran
//     redessiné, + / − dans Remplir) et n'apparaît que sur sa page ; 3) « Remplir » oublié : clos tout seul, bandeau et
//     bouton dans Détail machine ; 4) ventes d'un relevé traité APRÈS un inventaire : pas retirées deux fois du stock ;
//     5) entretien des 30 s rapide même avec beaucoup d'historique.
//  B. FAUX SUPABASE (deux appareils) : 6) « Remplir » fait sans réseau, appli fermée, un autre appareil écrit entre-temps :
//     au redémarrage, le Remplir est refait et envoyé (avant : mis de côté) ; 7) historique gardé dans IndexedDB
//     (démarrage hors ligne avec tout l'historique, plus de limite de 5 Mo).
// node v525.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v525");
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
const attendre = async (p, f, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(f, arg)) return true; await sleep(200); } return false; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch();
  const errs = [];
  const libs = async ctx => { for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") })); };
  const ecoute = (p, nom) => {
    p.on("pageerror", e => errs.push(nom + " : " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|WebSocket|net::ERR/.test(m.text())) errs.push(nom + " : " + m.text()); });
  };
  const demo = async (nom, page, opts) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts));
    await libs(ctx); await ctx.route(/supabase\.co/, r => r.abort());
    const p = await ctx.newPage(); ecoute(p, nom);
    await p.goto(URL0 + page + "?demo&tick=0"); await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(1500);
    await p.mouse.move(900, 450);
    return p;
  };
  const PC = { viewport: { width: 1440, height: 900 } }, TEL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

  // ================= A. Mode démo =================
  console.log("== A1. Fenêtre « Déplacer » : ses vrais titres");
  const a = await demo("pc", "index.html", PC);
  const mv = await a.evaluate(() => {
    const s = BA.Store.get(), M = BA.Model;
    const m = s.machines.find(m => m.sels.some(x => M.qty(x) > 0 && m.sels.some(y => y !== x && y.type === x.type && y.cap - M.qty(y) > 0)));
    BA.Shell.state.machine = m.num; BA.Shell.go("details"); return m.num;
  });
  await sleep(700);
  await a.click("#view-details details.mv-fold > summary"); await sleep(300);
  await a.click("#view-details [data-act=move]"); await sleep(500);
  const txtMv = await a.evaluate(() => (document.querySelector("#modal-root .modal") || {}).innerText || "");
  ok(`#${mv} : titre « Déplacer du pain » (pas « Vue de la machine »)`, /Déplacer du pain/.test(txtMv) && !/Vue de la machine/.test(txtMv), txtMv.slice(0, 120));
  ok("aperçu « Ordre de sortie dans la sélection … » (pas « La machine maintenant »)", /Ordre de sortie dans la sélection \d+ après le déplacement/.test(txtMv) && !/La machine maintenant/.test(txtMv));
  await a.click("#mv-cancel"); await sleep(300);
  ok("la vue machine a toujours son titre « Vue de la machine »", /Vue de la machine/.test(await a.innerText("#view-details .mv-wrap h3")));

  console.log("\n== A2. Fenêtre d'un tiroir : garde sa position, seulement sur sa page");
  const t = await demo("tel", "operateur.html", { viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
  await t.evaluate(() => { BA.Shell.state.machine = 105; BA.Shell.go("details"); }); await sleep(700);
  await t.tap("#mvt-105-13"); await sleep(400);
  const avant = await t.evaluate(() => { const p = document.querySelector("#view-details .mv-pop"); p.scrollTop = 9999; return p.scrollTop; });
  await t.evaluate(() => BA.Store.ping()); await sleep(1200);
  const apres = await t.evaluate(() => { const p = document.querySelector("#view-details .mv-pop"); return p ? p.scrollTop : -1; });
  ok("écran redessiné (nouvelle donnée) : la fenêtre ne remonte plus en haut", avant > 50 && apres === avant, { avant, apres });
  await t.evaluate(() => BA.Shell.go("products")); await sleep(700);
  ok("autre page (Produits / Stock) de la même machine : la fenêtre ne s'y ouvre pas toute seule", !(await t.$("#view-products .mv-pop")));
  await t.evaluate(() => BA.Shell.go("details")); await sleep(700);
  await t.keyboard.press("Escape"); await sleep(300);
  ok("retour sur Détail : Échap ferme la fenêtre visible", !(await t.$("#view-details .mv-pop")));
  // Remplir sur un petit téléphone : + ne fait pas remonter la fenêtre
  const t2 = await demo("tel-petit", "operateur.html", { viewport: { width: 360, height: 600 }, isMobile: true, hasTouch: true });
  const n2 = await t2.evaluate(() => { const s = BA.Store.get(), M = BA.Model; const m = s.machines.find(x => !x.door && !x.power && x.sels.some(z => z.cap - M.qty(z) >= 2)); BA.Wizard.open(m.num); return m.num; });
  await sleep(300); await t2.tap("#mvw-inv-yes"); await t2.waitForSelector("#mvw-rm-yes, #mvw-rm-ok, #mvw-rm-next");
  await t2.tap((await t2.$("#mvw-rm-yes")) ? "#mvw-rm-yes" : "#mvw-rm-next"); await t2.waitForSelector("#mvw-ld-ok");
  const s2 = await t2.evaluate(n => { const M = BA.Model, m = M.machine(BA.Store.get(), n); return m.sels.find(z => z.cap - M.qty(z) >= 2).n; }, n2);
  await t2.tap(`#mvt-${n2}-${s2}`); await sleep(300);
  const h0 = await t2.evaluate(() => { const p = document.querySelector(".mv-pop"); p.scrollTop = p.scrollHeight; return p.scrollTop; });
  await t2.evaluate(s => document.getElementById(`mvl-${s}-0-p`).click(), s2); await sleep(300);
  const h1 = await t2.evaluate(() => document.querySelector(".mv-pop").scrollTop);
  ok("Remplir, petit téléphone : touche + → la fenêtre reste où elle était", h0 > 0 && h1 === h0, { h0, h1 });
  await t2.evaluate(() => { BA.Wizard.close && BA.Wizard.close(); });

  console.log("\n== A3. « Remplir » oublié (appli fermée en plein Remplir)");
  const it = await a.evaluate(() => {
    const s = BA.Store.get(), M = BA.Model, m = s.machines.find(x => !x.door && !x.power);
    const id = BA.Actions.startIntervention(m.num);
    BA.Shell.state.machine = m.num; BA.Shell.go("details");
    return { num: m.num, id };
  });
  await sleep(700);
  ok(`#${it.num} : bandeau « Remplir commencé … pas terminé » dans Détail machine`, /pas terminé/.test(await a.innerText("#view-details .it-open")));
  await a.click("#it-close"); await a.waitForSelector("#dlg-ok"); await a.click("#dlg-ok"); await sleep(500);
  const fin = await a.evaluate(o => { const s = BA.Store.get(), x = s.interventions.find(i => i.id === o.id), m = BA.Model.machine(s, o.num); return { st: x.status, porte: m.door }; }, it);
  ok("admin : « Clore ce Remplir » → clos, la machine n'est plus « porte ouverte »", fin.st === "cancelled" && fin.porte === false, fin);
  const auto = await a.evaluate(async () => {
    const s = BA.Store.get(), m = s.machines.find(x => !x.door && !x.power && x.num !== 101);
    BA.Actions.startIntervention(m.num);
    BA.Store.update(st => { const i = st.interventions.find(x => x.num === m.num && x.status === "open"); i.start -= 5 * 3600000; i.step = 2; });   // commencé il y a 5 h
    BA.Live.check(); await new Promise(r => setTimeout(r, 200));
    const s2 = BA.Store.get(), i2 = s2.interventions.find(x => x.num === m.num && x.auto);
    return { num: m.num, st: i2 && i2.status, porte: BA.Model.machine(s2, m.num).door };
  });
  ok("commencé il y a plus de 4 h : clos tout seul (« partiel » : l'inventaire fait reste), porte plus ouverte", auto.st === "partial" && auto.porte === false, auto);
  await a.evaluate(n => { BA.Shell.state.machine = n; BA.Shell.go("details"); }, auto.num); await sleep(600);
  ok("tableau des interventions : « (clos automatiquement) »", /clos automatiquement/.test(await a.innerText("#view-details")));

  console.log("\n== A4. Relevé traité APRÈS un inventaire fait plus tard : ventes pas retirées deux fois");
  const vc = await a.evaluate(() => {
    const M = BA.Model, num = 110, s0 = BA.Store.get(), m0 = M.machine(s0, num);
    const sel = m0.sels.find(z => M.qty(z) >= 2), before = M.qty(sel);
    const x = t => ({ t, src: "4g", analyse: { events: [] }, audit: { errors: [], total_count: 1000 }, ancien: { total_count: 998 },
      diff: { baseline: false, anomalies: false, identique: false, deltaCount: 2, deltaValue: 5, parSelection: [{ selection: String(sel.n), delta: 2, deltaValue: 5 }], ecartSelections: 0 },
      nv: { eva: [], fas: [], pow: [], activations: [], temp: [] } });
    const ventes = t => { const s = BA.Store.get(); return (((s.daily[M.dayKey(t)] || {})[num]) || {}).s || 0; };
    const tA = Date.now() - 2 * 3600000, v0 = ventes(tA);
    BA.Store.update(s => { s.interventions.unshift({ id: s.seq++, num, start: s.now - 3600000, end: s.now - 3000000, status: "done", inv: [{ sel: sel.n, type: sel.type, exp: before, real: before }], rem: [], load: [], step: 4 }); });
    BA.Store.update(s => BA.Reel.applyAudit(s, num, x(tA)));
    const q1 = M.qty(M.sel(M.machine(BA.Store.get(), num), sel.n)), v1 = ventes(tA);
    BA.Store.update(s => BA.Reel.applyAudit(s, num, x(Date.now())));
    const q2 = M.qty(M.sel(M.machine(BA.Store.get(), num), sel.n));
    return { before, q1, q2, v0, v1 };
  });
  ok("relevé reçu avant l'inventaire, traité après : stock inchangé, les 2 ventes sont comptées", vc.q1 === vc.before && vc.v1 === vc.v0 + 2, vc);
  ok("relevé reçu après l'inventaire : stock diminué normalement (−2)", vc.q2 === vc.before - 2, vc);

  console.log("\n== A5. Entretien des 30 s rapide avec beaucoup d'historique (35 machines × 400 jours, 20 000 mouvements)");
  const perf = await a.evaluate(() => {
    BA.Store.update(s => {
      const M = BA.Model, DAY = 86400000;
      for (let d = 3; d < 400; d++) for (let n = 101; n <= 135; n++) M.addDaily(s, s.now - d * DAY, n, { s: 9, r: 25.5, l: 9, x: 1, c: 10.2 });
      for (let i = 0; i < 20000; i++) s.journal.push({ t: s.now - (i % 60) * DAY, k: "sale", n: 101 + (i % 20), s: 11, y: "blanc", q: 1, p: 2.5, l: s.now - 2 * DAY, b: "sim", i: 1e9 + i });
    }, false, { derived: true });
    const s = BA.Store.get(), L = BA.Live, M = BA.Model;
    // même essai qu'avant / maintenant (copie + entretien + comparaison), sans le redessin de l'écran
    const essai = copie => { const c = copie(s); L._housekeepAll(c); return JSON.stringify(c.events) !== JSON.stringify(s.events) || JSON.stringify(c.daily[M.dayKey(s.now)]) !== JSON.stringify(s.daily[M.dayKey(s.now)]); };
    const mesure = copie => { essai(copie); const t0 = performance.now(); for (let i = 0; i < 5; i++) essai(copie); return (performance.now() - t0) / 5; };
    const ancien = mesure(x => JSON.parse(JSON.stringify(x))), nouveau = mesure(L._lightCopy);
    const t0 = performance.now(); for (let i = 0; i < 3; i++) L.check(); const complet = (performance.now() - t0) / 3;
    return { ancien: Math.round(ancien), nouveau: Math.round(nouveau), complet: Math.round(complet), taille: JSON.stringify(s).length };
  });
  ok(`entretien : ${perf.nouveau} ms au lieu de ${perf.ancien} ms (données : ${(perf.taille / 1e6).toFixed(1)} Mo)`, perf.nouveau * 3 < perf.ancien, perf);
  console.log(`         (avec le redessin de l'écran : ${perf.complet} ms)`);
  const rs = await a.evaluate(() => { const s = BA.Store.get(), M = BA.Model, m = s.machines[0], sel = m.sels.find(z => z.lots.length); BA.Store.update(st => { const l = M.sel(M.machine(st, m.num), sel.n).lots[0]; l.date = st.now - 80 * 3600000; l.kept = false; }); BA.Live.check(); return BA.Store.get().events.some(e => e.num === m.num && e.code === "OLD_BREAD" && !e.resolved); });
  ok("l'entretien voit toujours un pain trop vieux (alerte « à retirer »)", rs);

  // ================= B. Faux Supabase : deux appareils =================
  console.log("\n== B6. « Remplir » sans réseau, appli fermée, un autre appareil écrit entre-temps");
  const now = Date.now(), H = 3600000, DAY = 24 * H;
  const lot = (id, qty, hAgo) => ({ id, qty, date: now - hAgo * H, kept: false });
  const daily = {};
  for (let d = 3; d <= 60; d++) { const k = new Date(now - d * DAY); const key = k.getFullYear() + "-" + String(k.getMonth() + 1).padStart(2, "0") + "-" + String(k.getDate()).padStart(2, "0"); daily[key] = { 1: { s: 6, r: 15, l: 6, x: 0, c: 6.6 }, 2: { s: 4, r: 10, l: 4, x: 0, c: 4.4 } }; }
  const etat = {
    v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * DAY }, daily, epoch: "essai525", moves: [], thr48: true, orders: [], interventions: [], journal: [], applied: [], events: [], missions: [],
    machines: [
      { id: "FAS-525000001", num: 1, street: "Rue de la Gare 1", city: "Bruxelles", region: "bxl", serial: "525000001", door: false, link: false, power: false, temp: 4.5,
        sels: [{ n: 1, cap: 10, lots: [lot(1, 4, 5)], type: "blanc", price: 2.5 }], lastSale: now - 2 * H, lastSeen: now - 30 * 60000 },
      { id: "FAS-525000002", num: 2, street: "Kerkstraat 2", city: "Antwerpen", region: "vl", serial: "525000002", door: false, link: false, power: false, temp: 5,
        sels: [{ n: 1, cap: 10, lots: [lot(2, 2, 5)], type: "gris", price: 2.8 }], lastSale: now - 3 * H, lastSeen: now - 30 * 60000 }
    ],
    settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150 },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: []
  };
  const fake = new FakeSupabase({ boitiers: true });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const appareil = async (nom, opts) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts));
    await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });
    await libs(ctx); await fake.attach(ctx, nom);
    return ctx;
  };
  const ouvrir = async (ctx, nom, page, login) => {
    const p = await ctx.newPage(); ecoute(p, nom); p.on("dialog", d => d.accept());
    await p.goto(URL0 + page);
    if (login) { await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go"); }
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(1500);
    return p;
  };
  const pcCtx = await appareil("pc", PC), telCtx = await appareil("tel", TEL);
  const pc = await ouvrir(pcCtx, "pc", "index.html", true);
  let tel = await ouvrir(telCtx, "tel", "operateur.html", true);
  ok("au départ : les deux appareils voient 4 pains (machine 1)", await tel.evaluate(() => BA.Model.qty(BA.Model.machine(BA.Store.get(), 1).sels[0])) === 4);
  fake.setOffline("tel", true); await sleep(300);
  await tel.evaluate(() => {
    const id = BA.Actions.startIntervention(1);
    BA.Actions.applyInventory(id, { 1: 3 }, false);                 // compté 3 (au lieu de 4)
    BA.Actions.applyRemoval(id, [], "none");
    BA.Actions.applyLoad(id, { 1: 5 }, Date.now());                  // + 5 pains
  });
  await sleep(500);
  const hors = await tel.evaluate(() => ({ q: BA.Model.qty(BA.Model.machine(BA.Store.get(), 1).sels[0]), attente: BA.Store.pendingCount(), copie: JSON.parse(localStorage.getItem("broodautomate-v5") || "{}") }));
  ok("téléphone hors ligne : Remplir fait (3 + 5 = 8 pains), en attente d'envoi, gardé sur l'appareil avec ses actions", hors.q === 8 && hors.attente > 0 && (hors.copie.ops || []).filter(o => o.desc).length >= 4, { q: hors.q, attente: hors.attente, ops: (hors.copie.ops || []).map(o => o.desc ? o.desc.a : "?") });
  await tel.close();                                                   // appli fermée sans réseau
  await pc.evaluate(() => BA.Actions.saveSettings({ thrHours: 50 }));  // pendant ce temps, l'admin change un réglage
  ok("l'admin a écrit entre-temps (version plus récente dans la base)", await attendre(pc, () => BA.Store.pendingCount() === 0));
  fake.setOffline("tel", false);
  tel = await ouvrir(telCtx, "tel", "operateur.html", false);
  await attendre(tel, () => BA.Store.pendingCount() === 0);
  const apresTel = await tel.evaluate(() => ({ q: BA.Model.qty(BA.Model.machine(BA.Store.get(), 1).sels[0]), thr: BA.Store.get().settings.thrHours, perdu: !!localStorage.getItem("broodautomate-v5-perdu"), st: BA.Store.status(), it: BA.Store.get().interventions.filter(i => i.num === 1).map(i => i.status) }));
  ok("au retour du réseau : le Remplir est refait et envoyé (8 pains), le réglage de l'admin est gardé (50 h)", apresTel.q === 8 && apresTel.thr === 50 && apresTel.it.includes("done"), apresTel);
  ok("rien n'est « mis de côté » (pas de copie perdue), message « modifications faites sans réseau envoyées »", !apresTel.perdu && !apresTel.st.lost && apresTel.st.replayed >= 4, apresTel.st);
  await pc.evaluate(() => BA.Store.pull());
  ok("le PC de l'admin voit le Remplir du téléphone (8 pains, intervention terminée)", await attendre(pc, () => { const s = BA.Store.get(); return BA.Model.qty(BA.Model.machine(s, 1).sels[0]) === 8 && s.interventions.some(i => i.num === 1 && i.status === "done"); }));
  const journal = await pc.evaluate(() => BA.Store.get().journal.filter(e => e.n === 1 && (e.k === "load" || e.k === "inv")).map(e => e.k + e.q));
  ok("historique : chargement et inventaire notés une seule fois", journal.filter(x => x === "load5").length === 1 && journal.filter(x => x === "inv-1").length === 1, journal);

  console.log("\n== B7. Historique gardé dans IndexedDB : démarrage hors ligne avec tout l'historique");
  const idb = await tel.evaluate(async () => {
    const c = JSON.parse(localStorage.getItem("broodautomate-v5") || "{}");
    const h = await new Promise(res => { const r = indexedDB.open("broodautomate-v5-copie", 1); r.onsuccess = () => { const g = r.result.transaction("kv", "readonly").objectStore("kv").get("hist"); g.onsuccess = () => res(g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); });
    return { histDansCopie: "hist" in c, sig: c.histSig, idbSig: h && h.sig, jours: h ? Object.keys(h.days || {}).length : 0, taille: (localStorage.getItem("broodautomate-v5") || "").length, total: Object.keys(BA.Store.get().daily).length };
  });
  ok("copie de l'appareil : le présent dans le stockage habituel, l'historique dans IndexedDB (même signature)", !idb.histDansCopie && idb.sig && idb.sig === idb.idbSig && idb.jours >= 55, idb);
  fake.setOffline("tel", true);
  const tel3 = await ouvrir(telCtx, "tel", "operateur.html", false);
  const off = await tel3.evaluate(() => ({ jours: Object.keys(BA.Store.get().daily).length, sync: BA.Store.status().sync, q: BA.Model.qty(BA.Model.machine(BA.Store.get(), 1).sels[0]) }));
  ok(`démarrage SANS réseau : appli ouverte avec tout l'historique (${off.jours} jours) et le bon stock`, off.sync === "offline" && off.jours === idb.total && off.q === 8, off);
  await tel3.screenshot({ path: path.join(OUT, "v525-hors-ligne.png") });

  console.log("\n== B8. Historique de l'appareil illisible (IndexedDB vidé, écriture pas finie…) : celui de la base n'est jamais écrasé");
  const histBase = fake.ba("hist") ? Object.keys(fake.ba("hist").data.days || {}).length : 0;
  await tel3.evaluate(() => new Promise(res => { const r = indexedDB.open("broodautomate-v5-copie", 1); r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); tx.objectStore("kv").delete("hist"); tx.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => res(); }));
  await tel3.close();
  const tel4 = await ouvrir(telCtx, "tel", "operateur.html", false);
  const off4 = await tel4.evaluate(() => ({ jours: Object.keys(BA.Store.get().daily).length, sync: BA.Store.status().sync }));
  ok("démarrage SANS réseau, historique de l'appareil illisible : l'appli s'ouvre quand même", off4.sync === "offline", off4);
  await tel4.evaluate(() => { const s = BA.Store.get(), m = BA.Model.machine(s, 1), l = m.sels[0].lots[0]; BA.Actions.setLotDate(1, m.sels[0].n, l.id, l.date - 3600000); });
  fake.setOffline("tel", false);
  await tel4.evaluate(() => window.dispatchEvent(new Event("online")));
  await attendre(tel4, () => BA.Store.pendingCount() === 0);
  const histApres = fake.ba("hist") ? Object.keys(fake.ba("hist").data.days || {}).length : 0;
  const on4 = await tel4.evaluate(() => ({ jours: Object.keys(BA.Store.get().daily).length, attente: BA.Store.pendingCount() }));
  ok(`au retour du réseau : l'historique de la base est intact (${histBase} jours → ${histApres})`, histBase >= 55 && histApres >= histBase, { histBase, histApres });
  ok("l'appareil a retrouvé tout l'historique, la modification faite hors ligne est envoyée", on4.attente === 0 && on4.jours >= histBase, on4);
  await tel4.close();

  ok("aucune erreur dans les pages", errs.length === 0, errs.slice(0, 6));
  await browser.close(); srv.close();
  console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT EST BON");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
