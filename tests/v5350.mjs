// Essais de la v5.35.0 — étape FACULTATIVE « Placements » de Remplir (appli opérateur) : vraie appli dans Chromium, faux Supabase, données inventées.
const invYes = async (pg, mv, how) => { const y = mv ? "#mvw-inv-yes" : "#inv-yes", e = mv ? "#mvw-inv-ok" : "#inv-empty"; await pg.waitForSelector(y + ", " + e); const act = x => how === "tap" ? pg.tap(x) : how === "dbl" ? pg.dblclick(x) : pg.click(x); if (await pg.$(y)) await act(y); else { await pg.evaluate(() => { const w = BA.Wizard.w; BA.Actions.applyInventory(w.itId, {}, false); w.step = 2; w.mode = "view"; BA.Wizard.render(); }); await pg.waitForTimeout(300); } };   // v5.34.3 : machine « vide » → pas de bouton Oui
//  Après le retrait : conseils pour déplacer le vieux pain vers la sélection du MÊME pain qui se vend le mieux (classement du journal).
//  Toujours facultatif : « Ignorer », « Fait » ou « Continuer » ; l'écran n'apparaît que s'il y a un conseil ; l'opérateur ne voit aucun chiffre de vente.
// node v5350.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v5350");
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

// Nuit du 25 au 26 novembre 2026, 03:00 à Bruxelles. Machine inventée n° 3 : 3 sélections « gris » (11, 15, 19) et 2 « blanc » (21, 25).
const NOW = new Date("2026-11-26T03:00:00+01:00").getTime(), H = 3600000, DAY = 86400000;
const D1 = NOW - 40 * H, D2 = NOW - 10 * H;                                      // pain de 40 h (à déplacer) et pain de 10 h (trop frais)
const TYPE = { 11: "gris", 15: "gris", 19: "gris", 21: "blanc", 25: "blanc" };
// Heure h:m de « il y a `back` jours » (NOW - 3 h = minuit du 26/11 à Bruxelles) : pas de dépendance au fuseau de la machine de test
const hm = (back, h, m) => NOW - 3 * H + (h * 60 + m) * 60000 - back * DAY;
function etat(ventes, rupt) {
  const mk = (n, lots) => ({ n, cap: 6, type: TYPE[n], price: 2.5, lots });
  const journal = [];
  // ventes par sélection (sur ~3 jours) : 15 = la meilleure « gris », 21 = la meilleure « blanc »
  if (ventes) for (const [n, k] of Object.entries(ventes)) for (let i = 0; i < k; i++) journal.push({ t: NOW - 3 * DAY + Math.round(i * (3 * DAY - 2 * H) / Math.max(1, k)), k: "sale", n: 3, s: Number(n), y: TYPE[n], q: 1, p: 2.5, l: D1, b: "sim" });
  // alertes « Plus de pain X » (TYPE_EMPTY) : « gris » épuisé 5 jours de suite vers 11 h ; « blanc » seulement 2 jours
  const events = []; let eid = 100;
  const ev = (t, type, sels, num) => events.push({ id: eid++, t, num: num || 3, code: "TYPE_EMPTY", cat: "stock", level: "warn", key: "t" + type, data: { type, sels }, resolved: true, resolvedAt: t + 8 * H, archived: false });
  if (rupt) { for (const j of [1, 2, 3, 4, 5]) ev(hm(j, 11, 10 + j), "gris", [11, 15, 19]); for (const j of [1, 2]) ev(hm(j, 10, 30), "blanc", [21, 25]); }
  return { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 70 * DAY }, epoch: "essai5350", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-535000001", num: 3, street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null, sels: [
      mk(11, [{ id: 1, qty: 4, date: D1 }]), mk(15, [{ id: 2, qty: 2, date: D2 }]), mk(19, [{ id: 3, qty: 6, date: D2 }]), mk(21, [{ id: 4, qty: 3, date: D1 }]), mk(25, [{ id: 5, qty: 2, date: D1 }])] }],
    events, journal, interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
}
const VENTES = { 11: 8, 15: 40, 19: 25, 21: 30, 25: 5 };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  // Un « appareil » neuf (faux Supabase + horloge figée à 03:00) ; vue = "machine" (tiroirs) ou "classic" (tableau)
  async function ouvrir(nom, ventes, vue, viewport, opt) {
    opt = opt || {};
    const fake = new FakeSupabase({});
    fake.baState = [{ id: "main", version: 3, data: etat(ventes, opt.rupt), updated_at: new Date(NOW).toISOString() }];
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: viewport || { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } });
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, "pc");
    await ctx.clock.setFixedTime(NOW);
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(nom + " : " + e.message));
    await p.goto(URL0 + (opt.page || "operateur.html"));
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }).catch(async () => {
      await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
      await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    });
    await sleep(1500);
    await p.evaluate(([v, pg]) => { if (pg === "index.html") BA.Shell.go("order"); else { BA.MachineView.setMode(v); BA.Shell.go("fill"); } }, [vue, opt.page || "operateur.html"]); await sleep(400);
    return { p, ctx };
  }
  // Remplir jusqu'à la fin du retrait (aucun pain à retirer : tout a moins de 48 h)
  async function jusqueRetrait(p, mv) {
    await p.click("[data-fill]"); await p.waitForSelector(mv ? "#mvw-inv-yes, #mvw-inv-ok" : "#inv-yes, #inv-empty");
    await invYes(p, mv); await p.waitForSelector(mv ? "#mvw-rm-next" : "#rm-next"); await p.click(mv ? "#mvw-rm-next" : "#rm-next");
  }
  const etatW = p => p.evaluate(() => {
    const s = BA.Store.get(), m = s.machines[0], it = s.interventions.find(x => x.status === "open") || s.interventions.at(-1);
    return { q: Object.fromEntries(m.sels.map(z => [z.n, z.lots.reduce((a, l) => a + l.qty, 0)])), step: it && it.step, mv: s.journal.filter(e => e.k === "mv"),
      lots21: m.sels.find(z => z.n === 21).lots.map(l => l.qty + "@" + Math.round((s.now - l.date) / 3600000)) };
  });
  const barre = p => p.evaluate(() => { const st = [...document.querySelectorAll(".stepper .step")]; return { n: st.length, cls: !!document.querySelector(".stepper.s4"), on: st.filter(x => x.classList.contains("on")).map(x => x.textContent.replace(/\s+/g, " ").trim()), done: st.filter(x => x.classList.contains("done")).length }; });

  console.log("== 1. Logique pure : classement et règles (aucun écran)");
  { const { p, ctx } = await ouvrir("logique", VENTES, "classic");
    const r = await p.evaluate(() => {
      const P = BA.Placements, out = {}, s = () => BA.Store.get();
      const c = () => P.conseils(s(), s().machines[0]);
      const base = c(); out.base = { n: base.recos.length, niv: base.niveau, r: base.recos.map(x => [x.from, x.to, x.qty, x.type, Math.round(x.age / 3600000)]) };
      BA.Store.update(st => { st.settings.placeHours = 48; });                          out.h48 = c().recos.length;                                  // pain de 40 h : plus proposé
      BA.Store.update(st => { st.settings.placeHours = 0; st.machines[0].sels.find(z => z.n === 11).lots[0].date = st.now - 5 * 3600000; }); out.frais = c().recos.filter(x => x.from === 11).length;   // 5 h : trop frais
      BA.Store.update(st => { st.machines[0].sels.find(z => z.n === 11).lots[0].date = st.now - 40 * 3600000; st.machines[0].sels.find(z => z.n === 15).lots[0].qty = 6; });  out.plein = c().recos.filter(x => x.from === 11).length;    // 15 est pleine : pas de place
      BA.Store.update(st => { st.machines[0].sels.find(z => z.n === 15).lots[0].qty = 5; });                                          out.place1 = c().recos.filter(x => x.from === 11).map(x => x.to + "×" + x.qty);   // 1 place : 1 pain
      BA.Store.update(st => { st.machines[0].sels.find(z => z.n === 15).lots[0].qty = 2; const l = st.machines[0].sels.find(z => z.n === 11).lots[0]; l.kept = true; l.keptAt = st.now - 80 * 3600000; });   // gardé et invalide
      out.invalide = c().recos.filter(x => x.from === 11).length;
      BA.Store.update(st => { st.journal = []; });                                         const vide = c(); out.vide = { n: vide.recos.length, niv: vide.niveau };
      const mk = (jours, ventes) => ({ total: ventes, jours, par: {} });
      out.niv = [P.niveau(mk(0, 0)), P.niveau(mk(3, 108)), P.niveau(mk(10, 200)), P.niveau(mk(25, 40)), P.niveau(mk(25, 300))];
      return out;
    });
    ok("avec ventes : 2 conseils (11→15 : 4 pains « gris » de 40 h ; 25→21 : 2 pains « blanc »), historique « court »", r.base.n === 2 && r.base.niv === "low" && JSON.stringify(r.base.r) === JSON.stringify([[11, 15, 4, "gris", 40], [25, 21, 2, "blanc", 40]]), r.base);
    ok("jamais vers un autre type de pain (le « blanc » 21 vend plus que 11, mais n'est pas proposé pour du « gris »)", r.base.r.every(x => (x[3] === "gris") === (x[1] === 15)), r.base);
    ok("réglage « âge » à 48 h : le pain de 40 h n'est plus proposé", r.h48 === 0, r.h48);
    ok("pain de 5 h : trop frais, pas proposé", r.frais === 0, r.frais);
    ok("sélection d'arrivée pleine : pas de conseil", r.plein === 0, r.plein);
    ok("une seule place libre : le conseil ne porte que sur 1 pain", JSON.stringify(r.place1) === JSON.stringify(["15×1"]), r.place1);
    ok("pain « gardé une fois » devenu invalide : il se retire, il n'est pas proposé", r.invalide === 0, r.invalide);
    ok("sans aucune vente : aucun conseil, historique « none »", r.vide.n === 0 && r.vide.niv === "none", r.vide);
    ok("niveaux de l'historique : none / low (3 j) / mid (10 j) / low (25 j mais 40 ventes) / good", JSON.stringify(r.niv) === JSON.stringify(["none", "low", "mid", "low", "good"]), r.niv);
    await ctx.close(); }

  console.log("== 2. Vue Tableau : l'étape 3 « Placements » (facultative), de bout en bout");
  { const { p, ctx } = await ouvrir("tableau", VENTES, "classic", null, { rupt: true });
    await sleep(450); await p.screenshot({ path: path.join(OUT, "00-avant.png") });
    await jusqueRetrait(p, false); await p.waitForSelector("#plc-next");
    let b = await barre(p);
    ok("la barre des étapes a 4 étapes : Placements est l'étape en cours, Inventaire et Retrait sont faites", b.n === 4 && b.cls && b.on.length === 1 && /Placements/.test(b.on[0]) && b.done === 2, b);
    const txt = await p.$eval(".modal", e => e.innerText);
    ok("titre « Étape 3 — Placements (facultatif) » + explication", /Étape 3 — Placements \(facultatif\)/.test(txt) && /Tu peux tout ignorer/.test(txt));
    ok("historique court : l'écran dit que le conseil est indicatif et pas vraiment nécessaire pour l'instant", /très court/.test(txt) && /pas vraiment nécessaires/.test(txt), txt.slice(0, 400));
    const cartes = await p.$$eval(".plc-card", e => e.map(x => x.innerText.replace(/\s+/g, " ")));
    ok("2 cartes : « Déplacer 4 pains (…) de la sélection 11 vers la sélection 15 » puis 25 → 21", cartes.length === 2 && /Déplacer 4 pains/.test(cartes[0]) && /sélection 11 vers la sélection 15/.test(cartes[0]) && /Déplacer 2 pains/.test(cartes[1]) && /sélection 25 vers la sélection 21/.test(cartes[1]), cartes);
    ok("l'opérateur ne voit aucun chiffre de vente (ni nombre de ventes, ni €)", !/\b(108|40 ventes|30 ventes)\b/.test(txt) && !/€/.test(txt) && /se vend mieux/.test(cartes[0]), cartes[0]);
    let e0 = await etatW(p);
    ok("pendant les Placements, l'étape enregistrée reste 3 (rien de renuméroté) et rien n'a bougé", e0.step === 3 && e0.mv.length === 0 && e0.q[11] === 4 && e0.q[15] === 2, e0);
    await sleep(450); await p.screenshot({ path: path.join(OUT, "01-placements-tableau.png") });
    await p.click(".plc-skip");
    ok("« Ignorer » : la carte disparaît, rien n'est déplacé", (await p.$$(".plc-card")).length === 1 && (await etatW(p)).mv.length === 0);
    await p.click(".plc-do"); await p.waitForSelector("#plc-none");
    e0 = await etatW(p);
    ok("« Fait » : 25 → 21 : le tiroir 25 est vide, le 21 passe de 3 à 5 pains, une ligne « mv » est écrite au journal", e0.q[25] === 0 && e0.q[21] === 5 && e0.mv.length === 1 && e0.mv[0].s === 25 && e0.mv[0].s2 === 21 && e0.mv[0].q === 2, e0);
    ok("le pain déplacé garde SA date (40 h) : il ne rajeunit pas", e0.lots21.every(x => x.endsWith("@40")), e0.lots21);
    ok("message « 2 pains déplacés : sélection 25 → 21 » et « Plus rien à déplacer » (le conseil 11 → 15 a été ignoré)", /2 pains déplacés : sélection 25 → 21/.test(await p.$eval(".modal", e => e.innerText)) && !!(await p.$("#plc-none")));
    await sleep(450); await p.screenshot({ path: path.join(OUT, "02-apres-fait.png") });
    await p.click("#plc-next"); await p.waitForSelector("#ld-validate");
    b = await barre(p);
    ok("chargement : étape 4, Placements et les deux premières étapes sont cochées", b.n === 4 && /Chargement/.test(b.on[0]) && b.done === 3 && /Étape 4 — Chargement/.test(await p.$eval(".modal h3", e => e.innerText)), b);
    await sleep(450); await p.screenshot({ path: path.join(OUT, "03-chargement-4-etapes.png") });
    ok("« Retour » existe au chargement", !!(await p.$("#wz-back")));
    await p.click("#wz-back"); await p.waitForSelector("#plc-next");
    e0 = await etatW(p);
    ok("« Retour » rouvre les Placements sans défaire le retrait ni les déplacements (stock identique, étape enregistrée 3)", e0.step === 3 && e0.q[25] === 0 && e0.q[21] === 5 && e0.mv.length === 1, e0);
    await p.click("#plc-next"); await p.waitForSelector("#ld-validate");
    { const box = await p.$eval("#rup-box", e => e.innerText.replace(/\\s+/g, " ")).catch(() => "");
      ok("chargement : conseil « Gris épuisé 5 jours sur les 14 derniers jours, vers 11 h » + charger au maximum (6 places libres)", /Pain gris/.test(box) && /épuisé 5 jours sur les 14 derniers jours, en général vers 11 h/.test(box) && /au maximum \(11, 15, 19 : 6 places libres\)/.test(box), box);
      ok("pas de conseil pour le « blanc » (2 jours seulement) ; historique court → « conseil indicatif »", !/Pain blanc/.test(box) && /indicatif/.test(box) && /Tu peux l'ignorer/.test(box), box);
      await sleep(450); await p.screenshot({ path: path.join(OUT, "07-conseil-rupture-chargement.png") });
      await p.evaluate(() => { BA.Store.update(st => { st.machines[0].sels.filter(z => z.type === "gris").forEach(z => { z.lots = [{ id: z.n + 500, qty: 6, date: st.now - 10 * 3600000 }]; }); }); BA.Wizard.render(); });
      const plein = await p.$eval("#rup-box", e => e.innerText.replace(/\\s+/g, " "));
      ok("sélections déjà pleines : le conseil devient « ajoute une sélection de ce pain »", /déjà pleines/.test(plein) && /ajouter une sélection/.test(plein) && !/au maximum/.test(plein), plein); }
    await p.click("#ld-validate"); await p.waitForTimeout(300); if (!(await p.$("#wz-close"))) await p.click("#ld-validate"); await p.waitForSelector("#wz-close");
    ok("chargement validé : le Remplir passe à l'étape 4 (fin)", (await etatW(p)).step === 4);
    await p.click("#wz-close"); await ctx.close(); }

  console.log("== 3. Vue Machine (tiroirs) : même écran, « Fait » sur le 1er conseil, retour depuis le chargement");
  { const { p, ctx } = await ouvrir("machine", VENTES, "machine", null, { rupt: true });
    await jusqueRetrait(p, true); await p.waitForSelector("#plc-next");
    const b = await barre(p);
    ok("vue Machine : l'écran Placements est le même (4 étapes, 2 cartes, pas de bouton Machine/Tableau)", b.n === 4 && /Placements/.test(b.on[0]) && (await p.$$(".plc-card")).length === 2 && !(await p.$(".vue-switch, #wz-vue")), b);
    await p.click(".plc-do"); await p.waitForTimeout(300);
    const e = await etatW(p);
    ok("« Fait » (11 → 15) : 4 pains du tiroir 11 vers le 15 (qui passe à 6), une ligne « mv »", e.q[11] === 0 && e.q[15] === 6 && e.mv.length === 1 && e.mv[0].s === 11 && e.mv[0].s2 === 15, e);
    await p.click("#plc-next"); await p.waitForSelector("#mvl-date");
    ok("chargement en vue Machine : étape 4 en cours", /Chargement/.test((await barre(p)).on[0]));
    ok("chargement en vue Machine : le conseil de rupture est aussi là", /épuisé 5 jours/.test(await p.$eval("#rup-box", e => e.innerText).catch(() => "")));
    await sleep(450); await p.screenshot({ path: path.join(OUT, "04-chargement-machine.png") });
    await p.click("#mvw-back"); await p.waitForSelector("#plc-next");
    ok("« Retour » du chargement (vue Machine) rouvre les Placements", (await etatW(p)).step === 3 && (await etatW(p)).q[15] === 6);
    await p.click("#wz-cancel"); await p.click("#wz-cancel"); await p.waitForTimeout(500); await ctx.close(); }

  console.log("== 4. Sans historique de ventes : pas d'écran Placements, on va droit au chargement");
  { const { p, ctx } = await ouvrir("sans-historique", null, "classic");
    await jusqueRetrait(p, false); await p.waitForSelector("#ld-validate");
    const b = await barre(p);
    ok("aucun conseil : l'écran Placements n'apparaît pas (retrait → chargement)", !(await p.$("#plc-next")) && !(await p.$(".plc-card")), b);
    ok("la barre reste à 4 étapes : Placements coché, Chargement en cours", b.n === 4 && /Chargement/.test(b.on[0]) && b.done === 3, b);
    await sleep(450); await p.screenshot({ path: path.join(OUT, "05-sans-historique.png") });
    await ctx.close(); }

  console.log("== 5. Téléphone 375 px, néerlandais et anglais");
  { const { p, ctx } = await ouvrir("375", VENTES, "classic", { width: 375, height: 667 }, { rupt: true });
    await jusqueRetrait(p, false); await p.waitForSelector("#plc-next");
    const g = await p.evaluate(() => ({
      scroll: document.documentElement.scrollWidth - window.innerWidth,
      coupe: [...document.querySelectorAll(".stepper .step")].map(x => x.scrollWidth - x.clientWidth).filter(d => d > 1),
      bouton: [...document.querySelectorAll(".plc-card .btn, #plc-next")].map(x => Math.round(x.getBoundingClientRect().height)).filter(h => h < 44)
    }));
    ok("375 px : pas de défilement horizontal, aucun mot de la barre coupé, boutons de 44 px ou plus", g.scroll <= 0 && g.coupe.length === 0 && g.bouton.length === 0, g);
    await sleep(450); await p.screenshot({ path: path.join(OUT, "06-375px.png") });
    for (const [l, re, re2] of [["nl", /Stap 3 — Verplaatsen \(optioneel\)/, /Klaar, ik heb het verplaatst/], ["en", /Step 3 — Placements \(optional\)/, /Done, I moved it/]]) {
      await p.evaluate(l => { BA.I18n.set(l, "op"); BA.Wizard.render(); }, l); await sleep(300);
      const t = await p.$eval(".modal", e => e.innerText);
      ok(l.toUpperCase() + " : titre et bouton traduits", re.test(t) && re2.test(t), t.slice(0, 200));
    }
    await p.evaluate(() => { BA.I18n.set("fr", "op"); BA.Wizard.render(); });
    await p.click("#plc-next"); await p.waitForSelector("#rup-box");
    const g2 = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth - window.innerWidth, boite: (() => { const r = document.querySelector("#rup-box").getBoundingClientRect(); return r.right - window.innerWidth; })() }));
    ok("375 px : le conseil de rupture ne déborde pas de l'écran", g2.scroll <= 0 && g2.boite <= 0, g2);
    await sleep(450); await p.screenshot({ path: path.join(OUT, "09-375px-chargement-conseil.png") });
    await ctx.close(); }

  console.log("== 6. Conseil de rupture : logique pure (alertes « Plus de pain X » des 14 derniers jours)");
  { const { p, ctx } = await ouvrir("rupture-logique", VENTES, "classic", null, { rupt: true });
    const r = await p.evaluate(() => {
      const R = BA.Ruptures, s = () => BA.Store.get(), c = () => R.conseils(s(), s().machines[0]);
      const ev0 = JSON.stringify(s().events), out = {}, H = 3600000, DAY = 86400000;
      const reset = () => BA.Store.update(st => { st.events = JSON.parse(ev0); st.settings.ruptureMinDays = undefined; st.settings.ruptureBefore = undefined; });
      const hm = (back, h, m) => s().now - 3 * H + (h * 60 + m) * 60000 - back * DAY;
      const ajoute = (t, type, num) => BA.Store.update(st => { st.events.push({ id: st.seq++, t, num: num || 3, code: "TYPE_EMPTY", cat: "stock", level: "warn", key: "t" + type, data: { type, sels: [21, 25] }, resolved: true, resolvedAt: t + 8 * H, archived: false }); });
      const b = c(); out.base = { n: b.items.length, it: b.items[0], court: b.court, hist: b.histJours };
      for (const j of [1, 2, 3, 4]) ajoute(hm(j, 22, 0), "blanc");                  out.soir = c().items.map(x => x.type);
      reset(); for (const j of [1, 2, 3, 4]) ajoute(hm(j, 1, 30), "blanc");         out.nuit = c().items.map(x => x.type);
      reset(); for (const j of [1, 2, 3, 4, 5]) ajoute(hm(j, 9, 0), "blanc", 9);    out.autre = c().items.map(x => x.type);
      reset(); ajoute(hm(1, 11, 40), "gris"); ajoute(hm(1, 12, 0), "gris");          out.doublon = c().items[0].jours;
      reset(); BA.Store.update(st => { st.events.forEach(e => { e.t -= 20 * DAY; }); });  out.vieux = c().items.length;
      reset(); BA.Store.update(st => { st.settings.ruptureMinDays = 6; });           out.min6 = c().items.length;
      reset(); BA.Store.update(st => { st.settings.ruptureBefore = 10; });           out.avant10 = c().items.length;
      reset(); BA.Store.update(st => { st.journal.push({ t: st.now - 30 * DAY, k: "load", n: 3, s: 11, q: 3, i: st.seq++ }); }); out.long = c().court;
      return out;
    });
    ok("« gris » épuisé 5 jours de suite vers 11 h → 1 conseil (sélections 11, 15, 19 ; 6 places libres) ; « blanc » (2 jours) : rien", r.base.n === 1 && r.base.it.type === "gris" && r.base.it.jours === 5 && r.base.it.heure === 11 && JSON.stringify(r.base.it.sels) === "[11,15,19]" && r.base.it.libre === 6, r.base);
    ok("historique court (3 jours) → conseil « indicatif »", r.base.court === true && r.base.hist === 3, r.base);
    ok("pain épuisé le soir (22 h) : pas un problème, pas de conseil pour le « blanc »", JSON.stringify(r.soir) === '["gris"]', r.soir);
    ok("pain épuisé la nuit (1 h 30, fin de la journée de vente qui commence à 4 h) : pas de conseil", JSON.stringify(r.nuit) === '["gris"]', r.nuit);
    ok("alertes d'une autre machine : ignorées", JSON.stringify(r.autre) === '["gris"]', r.autre);
    ok("deux ruptures le même jour comptent pour un seul jour", r.doublon === 5, r.doublon);
    ok("ruptures vieilles de plus de 14 jours : ignorées", r.vieux === 0, r.vieux);
    ok("réglage « au moins 6 jours » : 5 jours ne suffisent plus ; réglage « avant 10 h » : vers 11 h n'est plus « tôt »", r.min6 === 0 && r.avant10 === 0, r);
    ok("historique de 30 jours → plus « court »", r.long === false, r.long);
    await ctx.close(); }

  console.log("== 7. Conseil de rupture dans le plan de commande (admin)");
  { const { p, ctx } = await ouvrir("rupture-admin", VENTES, "classic", { width: 1280, height: 900 }, { rupt: true, page: "index.html" });
    await p.click("[data-q=q1][data-v='1']"); await p.click("[data-q=q2][data-v='0']"); await p.click("#calc");
    await p.waitForSelector("#fc-calc", { timeout: 10000 }); if (await p.$("#fc-all")) await p.click("#fc-all");
    await p.waitForSelector("#fc-calc:not([disabled])", { timeout: 10000 }); await p.click("#fc-calc");
    await p.waitForSelector("#send", { timeout: 10000 }); await sleep(500);
    const box = await p.$eval("#rup-admin", e => e.innerText.replace(/\\s+/g, " ")).catch(() => "");
    ok("plan de commande : « #3 Rue 3, Antwerpen : Pain gris, épuisé 5 jours sur les 14 derniers jours, en général vers 11 h » + conseil", /#3 Rue 3, Antwerpen/.test(box) && /Pain gris/.test(box) && /épuisé 5 jours sur les 14 derniers jours, en général vers 11 h/.test(box) && /(à fond|« à fond »)/.test(box) && !/Pain blanc/.test(box), box);
    await sleep(300); await p.screenshot({ path: path.join(OUT, "08-conseil-rupture-admin.png") });
    await p.click("#rup-admin [data-lmm]"); await sleep(500);
    ok("« Passer #3 « à fond » » : la machine passe en chargement « à fond » et le conseil le reconnaît", /déjà chargée « à fond »/.test(await p.$eval("#rup-admin", e => e.innerText).catch(() => "")) && !(await p.$("#rup-admin [data-lmm]")));
    for (const [l, re] of [["nl", /uitverkocht in de laatste 14 dagen/], ["en", /sold out 5 days in the last 14 days/]]) {
      await p.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build(); }, l); await sleep(300);
      const t = await p.$eval("#rup-admin", e => e.innerText.replace(/\\s+/g, " ")).catch(async () => await p.evaluate(() => document.body.innerText.slice(0, 200)));
      ok(l.toUpperCase() + " : conseil de rupture traduit", re.test(t), t.slice(0, 200));
    }
    await ctx.close(); }

  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.35.0 : " + ko + " ÉCHEC(S)" : "v5.35.0 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
