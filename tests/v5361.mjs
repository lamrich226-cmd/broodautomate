// Essais de la v5.36.1 — « 📅 Changer la date » d'un pain depuis Produits et stock → Stock en tableau (opérateur et admin),
// et, dans Détails machine → Lots sur téléphone, les lots d'une même sélection gardés ensemble (cadre bleu, « lot 2/2 »).
// Vraie appli dans Chromium, faux Supabase, données inventées (aucune vraie donnée lue ni modifiée).
// node v5361.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v5361");
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
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// Vendredi 27 novembre 2026, 13:00 à Bruxelles. Machine inventée n° 3 :
//  11 « gris » : 2 pains de 50 h (à retirer, seuil 48 h) + 3 pains de 10 h ; 15 « gris » : 4 pains de 30 h ; 21 « Pistolets » (pain ajouté) : vide
const NOW = new Date("2026-11-27T13:00:00+01:00").getTime(), H = 3600000, DAY = 86400000;
const L1 = NOW - 50 * H, L2 = NOW - 10 * H, L3 = NOW - 30 * H;
const USERS = [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }];
function etat() {
  const mk = (n, type, lots) => ({ n, cap: 6, type, price: 2.5, lots });
  return { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 70 * DAY }, epoch: "essai5361", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-536100001", num: 3, street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null, sels: [
      mk(11, "gris", [{ id: 1, qty: 2, date: L1 }, { id: 2, qty: 3, date: L2 }]), mk(15, "gris", [{ id: 3, qty: 4, date: L3 }]), mk(21, "c900001", [])] }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [{ id: "c900001", name: "Pistolets" }], dayDecisions: {}, profileManual: {}, calendar: [] };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  // Un appareil neuf : faux Supabase avec la machine inventée, horloge figée, connexion ; ouvre « Produits et stock »
  async function ouvrir(nom, o = {}) {
    const page = o.page || "operateur.html", tel = o.tel !== false;
    const fake = new FakeSupabase({ users: USERS });
    fake.baState = [{ id: "main", version: 3, data: etat(), updated_at: new Date(NOW).toISOString() }];
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: o.viewport || (tel ? { width: 390, height: 844 } : { width: 1280, height: 860 }),
      isMobile: tel, hasTouch: tel, deviceScaleFactor: 2 });
    await ctx.addInitScript(([lang, role]) => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); if (lang) localStorage.setItem("ba-test-lang-" + role, lang); } catch (e) { /* ok */ } },
      [o.lang || "", page === "index.html" ? "admin" : "op"]);
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    await ctx.clock.setFixedTime(NOW);
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(nom + " : " + e.message));
    await p.goto(URL0 + page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", o.email || "op@test.be"); await p.fill("#login-pass", o.pass || "Secret-456"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(1500);
    await p.evaluate(v => { BA.MachineView.setMode(v); BA.Shell.go("products"); }, o.vue || "classic");
    await p.waitForSelector(".sel-table", { timeout: 15000, state: "attached" }); await sleep(300);
    return { p, ctx, fake };
  }
  const lots = (p, n) => p.evaluate(n => BA.Store.get().machines[0].sels.find(z => z.n === n).lots.map(l => ({ id: l.id, qty: l.qty, date: l.date })), n);
  const journal = p => p.evaluate(() => BA.Store.get().journal.filter(e => e.k === "date"));
  const enInput = (p, ms) => p.evaluate(ms => BA.UI.F.toInput(ms), ms);
  const fdt = (p, ms) => p.evaluate(ms => BA.UI.F.dt(ms), ms);
  const visible = (p, sel) => p.$$eval(sel, l => l.filter(e => e.offsetParent !== null).map(e => ({ sel: e.dataset.sel, txt: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) })));
  const toast = p => p.evaluate(() => (document.getElementById("toast") || {}).textContent || "");
  const date = async (p, n) => { const l = await p.$$(`.sel-table [data-act="lot-dates"][data-sel="${n}"]`); for (const x of l) if (await x.isVisible()) { await x.click(); break; } await p.waitForSelector(".dt-modal"); };

  console.log("== 0. Fichiers");
  ok("version 5.36.2 dans config.js", /version: "5\.36\.2"/.test(lire("js/config.js")));
  ok("index.html et operateur.html chargent js/i18n-v5361.js après i18n-v5360.js", [lire("index.html"), lire("operateur.html")].every(h => /i18n-v5360\.js\?v=5\.36\.2[\s\S]*i18n-v5361\.js\?v=5\.36\.2/.test(h)));

  console.log("== 1. Opérateur sur téléphone : le bouton 📅 dans Stock en tableau");
  let { p, ctx, fake } = await ouvrir("op-tel");
  const b = await visible(p, '.sel-table [data-act="lot-dates"]');
  ok("un bouton 📅 par sélection qui a du pain (11 et 15), aucun pour la sélection vide (21)", b.map(x => x.sel).join() === "11,15", b);
  ok("le bouton montre la date du plus vieux pain de la sélection", b[0] && b[0].txt === "📅 " + await fdt(p, L1) && b[1].txt === "📅 " + await fdt(p, L3), b);
  ok("bouton assez grand pour le doigt (44 px au moins)", b.length === 2 && b.every(x => x.h >= 44), b);
  const carte = await p.$eval('.sel-table [data-act="lot-dates"][data-sel="11"]:not(.only-phone *)', e => e.closest("td").textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  ok("carte de la sélection : la ligne « plus vieux pain » garde le nombre de pains et l'âge à côté du bouton", /2 pains/.test(carte) && /50 h|2 j/.test(carte), carte);
  const deb = await p.evaluate(() => [...document.querySelectorAll(".sel-table td")].filter(td => td.offsetParent !== null && td.scrollWidth > td.clientWidth + 1).map(td => td.dataset.label + " " + td.scrollWidth + ">" + td.clientWidth));
  ok("cartes du tableau : aucune ligne ne déborde (bouton 📅 et « (2 pains · 50 h) » passent à la ligne)", !deb.length, deb);
  await (await p.$('.sel-table tbody tr')).screenshot({ path: path.join(OUT, "01-carte-selection-11.png") });
  await date(p, 11); await sleep(600);
  const d = await p.evaluate(() => {
    const m = document.querySelector(".dt-modal");
    return { titre: m.querySelector("h2").textContent, sous: m.querySelector(".modal-head .petit").textContent, aide: m.querySelector(".note").textContent,
      lignes: [...m.querySelectorAll(".dt-row")].map(r => ({ vieux: r.classList.contains("lot-old"), info: r.querySelector(".dt-info").textContent.replace(/\s+/g, " ").trim(),
        val: r.querySelector(".dt-in").value, max: r.querySelector(".dt-in").max, lot: r.querySelector(".dt-in").dataset.lot })),
      focus: document.activeElement && document.activeElement.classList.contains("dt-in"),
      deborde: m.scrollWidth > m.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      boutons: [...m.querySelectorAll(".wz-actions .btn")].map(x => Math.round(x.getBoundingClientRect().height)) };
  });
  ok("fenêtre « 📅 Changer la date » : sélection 11, pain gris, machine n° 3", d.titre === "📅 Changer la date" && /#3/.test(d.sous) && /Sélection 11/.test(d.sous) && /gris/i.test(d.sous), d);
  ok("texte court : corriger une date fausse, noté dans l'Historique", /date de livraison fausse/.test(d.aide) && /Historique/.test(d.aide), d.aide);
  ok("les 2 lots, le plus vieux d'abord, avec leur date exacte", d.lignes.length === 2 && d.lignes[0].lot === "1" && d.lignes[0].val === await enInput(p, L1) && d.lignes[1].val === await enInput(p, L2), d.lignes);
  ok("le lot de 50 h est marqué « à retirer » (rouge) ; celui de 10 h non", d.lignes[0].vieux && /2 pains/.test(d.lignes[0].info) && /retirer/i.test(d.lignes[0].info) && !d.lignes[1].vieux, d.lignes);
  ok("pas de date après maintenant dans le calendrier (max = maintenant)", d.lignes.every(x => x.max === d.lignes[0].max) && d.lignes[0].max === await enInput(p, NOW), d.lignes);
  ok("le curseur est déjà dans la première date ; rien ne déborde à 390 px ; boutons de 44 px au moins", d.focus && !d.deborde && d.boutons.every(h => h >= 44), d);
  await p.screenshot({ path: path.join(OUT, "02-fenetre-date.png") });
  // la date du plus vieux lot était fausse : livré il y a 20 h, pas 50 h
  await p.fill('.dt-in[data-lot="1"]', await enInput(p, NOW - 20 * H));
  await p.click("#dt-ok");
  await p.waitForSelector(".dt-modal", { state: "detached" });
  const l11 = await lots(p, 11), j1 = await journal(p);
  ok("date enregistrée : le lot de 2 pains a maintenant 20 h (il reste le plus vieux, devant celui de 10 h)", l11.length === 2 && l11[0].id === 1 && l11[0].date === NOW - 20 * H && l11[1].date === L2, l11);
  ok("message « ✅ Date enregistrée — sélection 11 »", /✅ Date enregistrée — sélection 11/.test(await toast(p)), await toast(p));
  ok("noté dans l'Historique : qui (opérateur), sélection 11, 2 pains, ancienne → nouvelle date", j1.length === 1 && j1[0].b === "op" && j1[0].s === 11 && j1[0].n === 3 && j1[0].q === 2 && j1[0].l === L1 && j1[0].l2 === NOW - 20 * H, j1);
  ok("le tableau montre tout de suite la nouvelle date", (await visible(p, '.sel-table [data-act="lot-dates"][data-sel="11"]'))[0].txt === "📅 " + await fdt(p, NOW - 20 * H));
  ok("le lot n'est plus « à retirer » (20 h < 48 h)", await p.evaluate(() => !document.querySelector(".sel-table tr .c-remove")));
  await sleep(1500);
  const srvLots = ((fake.baState[0] || {}).data || { machines: [{ sels: [{ lots: [] }] }] }).machines[0].sels[0].lots;
  ok("enregistré sur le serveur (faux Supabase) comme tout autre changement", srvLots.some(l => l.id === 1 && l.date === NOW - 20 * H), srvLots);
  await p.screenshot({ path: path.join(OUT, "03-tableau-apres.png") });

  console.log("== 2. Ce qui est refusé, ou ne change rien");
  const ouvre = n => date(p, n);
  const erreur = () => p.evaluate(() => { const e = document.querySelector("#dt-err .alert"); return e ? e.textContent : ""; });
  await ouvre(15);
  await p.fill('.dt-in[data-lot="3"]', await enInput(p, NOW + 2 * H)); await p.click("#dt-ok"); await sleep(200);
  ok("date dans le futur : refusée, message clair, la fenêtre reste ouverte", /ne peut pas être dans le futur/.test(await erreur()) && !!(await p.$(".dt-modal")), await erreur());
  await p.screenshot({ path: path.join(OUT, "04-date-future-refusee.png") });
  await p.fill('.dt-in[data-lot="3"]', ""); await p.click("#dt-ok"); await sleep(200);
  ok("date effacée : « Date incomplète », rien d'enregistré", /Date incomplète/.test(await erreur()) && (await lots(p, 15))[0].date === L3, await erreur());
  await p.click("#dt-cancel"); await sleep(200);
  ok("« Annuler » ferme sans rien changer", !(await p.$(".dt-modal")) && (await lots(p, 15))[0].date === L3 && (await journal(p)).length === 1);
  await ouvre(15); await p.keyboard.press("Escape"); await sleep(200);
  ok("la touche Échap ferme aussi sans rien changer", !(await p.$(".dt-modal")) && (await journal(p)).length === 1);
  await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.textContent = ""; });
  await ouvre(15); await p.click("#dt-ok"); await sleep(300);
  ok("« Enregistrer » sans rien changer : la fenêtre se ferme, aucun message, rien dans l'Historique", !(await p.$(".dt-modal")) && !(await toast(p)) && (await journal(p)).length === 1);
  // même minute qu'un autre lot : l'appli les réunit (même date = même lot), comme partout ailleurs
  await ouvre(11);
  await p.fill('.dt-in[data-lot="1"]', await enInput(p, L2)); await p.click("#dt-ok"); await sleep(300);
  const reuni = await lots(p, 11);
  ok("même date qu'un autre lot de la sélection : les deux lots n'en font plus qu'un (5 pains)", reuni.length === 1 && reuni[0].qty === 5 && reuni[0].date === L2, reuni);
  ok("aucune erreur JavaScript (opérateur, téléphone)", !errs.length, errs);
  await ctx.close();

  console.log("== 3. Vue « machine dessinée » : le tableau et son bouton 📅 restent là");
  ({ p, ctx, fake } = await ouvrir("op-machine", { vue: "machine" }));
  ok("en vue machine, « Stock en tableau » est replié (comme avant)", await p.$eval('details[data-fold="stock"]', d => !d.open));
  await p.click('details[data-fold="stock"] > summary'); await sleep(300);
  const bm = await visible(p, '.sel-table [data-act="lot-dates"]');
  ok("…une fois ouvert : boutons 📅 des sélections 11 et 15", bm.map(x => x.sel).join() === "11,15", bm);
  await date(p, 15);
  ok("…et la fenêtre s'ouvre", (await p.$$(".dt-modal .dt-row")).length === 1);
  await p.click("#dt-cancel");
  await ctx.close();

  console.log("== 4. Petit téléphone (375 px)");
  ({ p, ctx, fake } = await ouvrir("op-375", { viewport: { width: 375, height: 700 } }));
  await date(p, 11); await sleep(600);                       // fin de l'animation d'ouverture de la fenêtre (elle grandit un peu)
  const g = await p.evaluate(() => {
    const m = document.querySelector(".dt-modal"), r = m.getBoundingClientRect(), i = [...m.querySelectorAll(".dt-in")].map(x => x.getBoundingClientRect());
    return { gauche: Math.round(r.left), droite: Math.round(r.right), vw: innerWidth, sw: document.documentElement.scrollWidth, mw: m.scrollWidth, mc: m.clientWidth,
      champs: i.map(x => ({ l: Math.round(x.left), r: Math.round(x.right), h: Math.round(x.height) })) };
  });
  ok("375 px : la fenêtre tient dans l'écran, rien ne déborde", g.gauche >= 0 && g.droite <= g.vw && g.sw <= g.vw + 1 && g.mw <= g.mc + 1, g);
  ok("375 px : les cases de date tiennent dans la fenêtre et font 44 px de haut", g.champs.every(c => c.l >= g.gauche && c.r <= g.droite && c.h >= 44), g.champs);
  await p.screenshot({ path: path.join(OUT, "05-telephone-375.png") });
  await ctx.close();

  console.log("== 5. Admin sur ordinateur (index.html)");
  ({ p, ctx, fake } = await ouvrir("admin-pc", { page: "index.html", email: "amor@test.be", pass: "Secret-123", tel: false }));
  const ba = await visible(p, '.sel-table [data-act="lot-dates"]');
  ok("admin, ordinateur : bouton 📅 dans la colonne « plus vieux pain » (11 et 15)", ba.map(x => x.sel).join() === "11,15", ba);
  const cell = await p.$eval('.sel-table td.no-phone [data-act="lot-dates"][data-sel="11"]', e => e.closest("td").textContent.replace(/\s+/g, " ").trim());
  ok("…avec toujours le nombre de pains et l'âge à côté", /2 pains/.test(cell) && /50 h|2 j/.test(cell), cell);
  await p.screenshot({ path: path.join(OUT, "06-admin-ordinateur.png") });
  await date(p, 15);
  await p.fill('.dt-in[data-lot="3"]', await enInput(p, NOW - 40 * H)); await p.click("#dt-ok");
  await p.waitForSelector(".dt-modal", { state: "detached" });
  const ja = await journal(p);
  ok("admin : date changée et notée « admin » dans l'Historique", (await lots(p, 15))[0].date === NOW - 40 * H && ja.length === 1 && ja[0].b === "admin" && ja[0].l === L3, ja);
  await p.evaluate(() => BA.Shell.go("history")); await sleep(800);
  const h = await p.evaluate(() => document.querySelector("#view") ? document.querySelector("#view").innerText : document.body.innerText);
  ok("la page Historique montre le changement (ancienne → nouvelle date)", h.includes(await fdt(p, L3) + " → " + await fdt(p, NOW - 40 * H)), h.slice(0, 600));
  await p.screenshot({ path: path.join(OUT, "07-historique.png") });
  ok("aucune erreur JavaScript (admin)", !errs.length, errs);
  await ctx.close();

  console.log("== 6. Néerlandais et anglais");
  for (const [lang, titre, aide, futur] of [["nl", "📅 Datum wijzigen", /Historiek/, /toekomst/], ["en", "📅 Change the date", /History/, /in the future/]]) {
    ({ p, ctx, fake } = await ouvrir("op-" + lang, { lang }));
    await date(p, 11);
    const tx = await p.evaluate(() => ({ titre: document.querySelector(".dt-modal h2").textContent, aide: document.querySelector(".dt-modal .note").textContent }));
    await p.fill('.dt-in[data-lot="1"]', await enInput(p, NOW + 3 * H)); await p.click("#dt-ok"); await sleep(200);
    const er = await erreur();
    ok(lang + " : titre, aide et message d'erreur traduits", tx.titre === titre && aide.test(tx.aide) && futur.test(er) && !/ne peut pas/.test(er), { tx, er });
    await ctx.close();
  }
  ok("aucune erreur JavaScript (langues)", !errs.length, errs);

  console.log("== 7. Détails machine → Lots : sur téléphone, les lots d'une même sélection restent ensemble");
  ({ p, ctx, fake } = await ouvrir("op-lots"));
  await p.evaluate(() => BA.Shell.go("details")); await p.waitForSelector("table.lots tr.sel-grp", { timeout: 15000 }); await sleep(500);
  const cartes = await p.evaluate(() => {
    const css = getComputedStyle(document.documentElement).getPropertyValue("--link").trim();
    const tmp = document.createElement("span"); tmp.style.color = css; document.body.appendChild(tmp); const bleu = getComputedStyle(tmp).color; tmp.remove();
    return { bleu, lignes: [...document.querySelectorAll("table.lots tbody tr")].map(tr => {
      const r = tr.getBoundingClientRect(), cs = getComputedStyle(tr), td = tr.querySelectorAll("td");
      return { cls: tr.className.trim().replace(/\s+/g, " "), sel: td[0].innerText.replace(/\s+/g, " ").trim(), pain: td[1].innerText.trim(), haut: Math.round(r.top), bas: Math.round(r.bottom),
        bord: cs.borderLeftColor, epais: cs.borderLeftWidth, basBord: cs.borderBottomStyle, mb: cs.marginBottom };
    }) };
  });
  const L = cartes.lignes;
  ok("sélection 11 (2 lots) : 2 cartes dans un même groupe (1re et dernière marquées)", L[0] && /sel-first/.test(L[0].cls) && /sel-grp/.test(L[0].cls) && /sel-grp/.test(L[1].cls) && /sel-end/.test(L[1].cls), L.slice(0, 2));
  ok("chaque carte redit la sélection et le pain : « 11 lot 1/2 » / « 11 lot 2/2 », « Pain gris » deux fois", L[0].sel === "11 lot 1/2" && L[1].sel === "11 lot 2/2" && L[0].pain === "Pain gris" && L[1].pain === "Pain gris", L.slice(0, 2).map(x => [x.sel, x.pain]));
  ok("le groupe est entouré du bleu des numéros de sélection (2 px)", L[0].bord === cartes.bleu && L[1].bord === cartes.bleu && L[0].epais === "2px", { bleu: cartes.bleu, l: L.slice(0, 2).map(x => [x.bord, x.epais]) });
  ok("les 2 cartes se touchent (un seul bloc), séparées par un trait pointillé", Math.abs(L[0].bas - L[1].haut) <= 1 && L[0].mb === "0px" && L[0].basBord === "dashed", L.slice(0, 2));
  ok("sélection 15 (1 seul lot) : carte normale, sans « lot 1/1 » ni cadre bleu", L[2] && L[2].sel === "15" && !/sel-grp/.test(L[2].cls) && L[2].bord !== cartes.bleu, L[2]);
  ok("après le groupe, l'espace normal entre cartes revient", parseFloat(L[1].mb) >= 8 && L[2].haut - L[1].bas >= 8, { mb: L[1].mb, ecart: L[2].haut - L[1].bas });
  await (await p.$("table.lots")).screenshot({ path: path.join(OUT, "08-lots-telephone.png") });
  await ctx.close();
  ({ p, ctx, fake } = await ouvrir("admin-lots", { page: "index.html", email: "amor@test.be", pass: "Secret-123", tel: false }));
  await p.evaluate(() => BA.Shell.go("details")); await p.waitForSelector("table.lots tr.sel-grp", { timeout: 15000 }); await sleep(400);
  const pc = await p.evaluate(() => [...document.querySelectorAll("table.lots tbody tr")].slice(0, 2).map(tr => [tr.querySelector("td").innerText.trim(), tr.querySelectorAll("td")[1].innerText.trim()]));
  ok("ordinateur (vrai tableau) : rien ne change, n° et pain seulement sur la 1re ligne de la sélection", JSON.stringify(pc) === JSON.stringify([["11", "Pain gris"], ["", ""]]), pc);
  ok("aucune erreur JavaScript (lots)", !errs.length, errs);
  await ctx.close();

  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ARRÊT :", e); process.exit(1); });
