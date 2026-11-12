// Essais de la v5.19 :
//   1. Remplissage SPONTANÉ (sans commande) : 0 pain par défaut ; remplissage d'une MISSION : quantités de la commande déjà écrites ;
//      « Total à charger » qui suit la saisie.
//   2. Contrôle général : chaque écran (admin sur PC et sur téléphone, opérateur sur téléphone), 3 langues, 2 thèmes :
//      aucune erreur JavaScript, aucun texte manquant (aussi dans les infobulles / aria-label / placeholder),
//      aucun « undefined », « NaN », « Invalid Date », « [object Object] », pas de défilement horizontal sur téléphone.
//   3. Contrôles des fichiers : les deux pages chargent les mêmes textes, chaque fichier js existe et sert, version.
// node v519.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v519");
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

// ---------- données inventées ----------
const now = Date.now(), H = 3600000, MIN = 60000;
const lot = (id, qty, hAgo) => ({ id, qty, date: now - hAgo * H, kept: false });
const etat = {
  v: 1, hv: 1, seq: 9000, real: { v: 5, created: now - 40 * 24 * H }, daily: {}, epoch: "essai519", moves: [], thr48: true, orders: [], interventions: [], journal: [], applied: [], events: [],
  machines: [
    // #1 : mission « remplir à fond » (sél. 1 : 4/10 → 6 à charger ; sél. 2 pleine → 0)
    { id: "FAS-519000001", num: 1, street: "Rue de la Gare 1", city: "Bruxelles", region: "bru", serial: "519000001", door: false, link: false, power: false, temp: 4.5,
      sels: [{ n: 1, cap: 10, lots: [lot(1, 4, 5)], type: "blanc", price: 2.5 }, { n: 2, cap: 8, lots: [lot(2, 8, 5)], type: "gris", price: 3 }],
      lastSale: now - 2 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null },
    // #2 : mission « selon le besoin » (sél. 1 : 2/10, plein = 8, commande = 5 → 5 à charger)
    { id: "FAS-519000002", num: 2, street: "Kerkstraat 2", city: "Antwerpen", region: "vl", serial: "519000002", door: false, link: false, power: false, temp: 5,
      sels: [{ n: 1, cap: 10, lots: [lot(3, 2, 5)], type: "blanc", price: 2.5 }],
      lastSale: now - 3 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null },
    // #3 : AUCUNE mission (remplissage spontané)
    { id: "FAS-519000003", num: 3, street: "Place du Marché 3", city: "Namur", region: "wal", serial: "519000003", door: false, link: false, power: false, temp: 4,
      sels: [{ n: 1, cap: 6, lots: [lot(4, 1, 5)], type: "blanc", price: 2.5 }, { n: 4, cap: 6, lots: [], type: "gris", price: 3 }],
      lastSale: now - 4 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null },
    // #4 : hors ligne (pas de boîtier), 3 pains chargés il y a 60 h (plus de 48 h : à retirer), aucune mission
    { id: "FAS-519000004", num: 4, street: "Grote Markt 4", city: "Leuven", region: "vl", serial: "519000004", door: false, link: false, power: false, temp: 4,
      sels: [{ n: 1, cap: 8, lots: [lot(5, 3, 60)], type: "blanc", price: 2.5 }],
      lastSale: now - 70 * H, lastSeen: now - 70 * H, nextSale: null, tempUntil: null, powerUntil: null }
  ],
  missions: [
    { id: 101, num: 1, created: now - 6 * H, status: "open", removeBefore: null, passageAt: now + 2 * H, remove: 0, mandatory: 0, load: 6, reduced: false,
      lines: [{ sel: 1, full: 6, load: 6 }, { sel: 2, full: 0, load: 0 }] },
    { id: 102, num: 2, created: now - 6 * H, status: "open", removeBefore: null, passageAt: now + 2 * H, remove: 0, mandatory: 0, load: 5, reduced: true,
      lines: [{ sel: 1, full: 8, load: 5 }] }
  ],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: {}, calendar: []
};

// ventes, chargements, alertes de chaque sorte : pour que chaque écran ait quelque chose à montrer
const REMPLIR_DONNEES = `() => BA.Store.update(s => {
  const M = BA.Model, DAY = 86400000, now = s.now;
  for (let d = 34; d >= 0; d--) {
    const at = now - d * DAY;
    s.machines.forEach(m => {
      const n = 3 + ((d * 7 + m.num * 3) % 6);
      M.addDaily(s, at, m.num, { s: n, r: n * 2.6, l: d % 2 ? 0 : n, x: d % 5 ? 0 : 1, c: d % 2 ? 0 : n * 1.1 });
      M.addType(s, at, m.num, "blanc", n - 1); M.addType(s, at, m.num, "gris", 1);
      for (let i = 0; i < Math.min(n, 3); i++) M.log(s, { t: at - i * 3600000, k: "sale", n: m.num, s: 1, y: "blanc", q: 1, p: 2.5, l: at - 86400000, b: "sim" });
    });
  }
  M.log(s, { k: "load", n: 1, s: 1, y: "blanc", q: 4, l: now - 5 * 3600000, b: "op" });
  M.log(s, { k: "rm", n: 2, s: 1, y: "blanc", q: 1, l: now - 60 * 3600000, r: "old", b: "op" });
  M.log(s, { k: "inv", n: 3, s: 1, y: "blanc", q: -1, l: now - 5 * 3600000, b: "op" });
  const data = { sel: 1, type: "blanc", msg: "TEST", code: 45, sub: 54, temp: 21.5, n: 2, lost: 1, gained: 0, min: 20, max: 18, at: now - 600000 };
  Object.keys(M.EVENTS).forEach((code, i) => { const e = M.addEvent(s, 1 + (i % 3), code, Object.assign({}, data, { key: "t" + i })); e.t = now - i * 7 * 60000; });
  s.orders.unshift({ id: s.seq++, t: now - 6 * 3600000, withRemoval: false, removeBefore: null, passageAt: now + 2 * 3600000, marginPct: 10, perType: [{ type: "blanc", qty: 11 }] });
})`;

// textes qui ressemblent à une clé de traduction (texte manquant), dans le texte ET dans les infobulles
const DEFAUTS = `() => {
  const keys = new Set(Object.keys(BA.I18n.dicts.fr));
  const PREF = /^(ev|evd|rs|usb|eva|sync|login|setup|btn|nav|col|st|sum|cat|fc|cal|sg|kind|rel|mv|hk|by|it|af|per|rr|op|tq|bx|step|ld|mission|chip|nt|cs|x|adv|load|ia|th)_/;
  const out = { keys: new Set(), attrs: new Set(), bad: new Set() };
  const vu = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const txt = document.body.innerText;
  (txt.match(/\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b/gi) || []).forEach(w => { if (keys.has(w) || PREF.test(w)) out.keys.add(w); });
  document.querySelectorAll("[aria-label],[title],[placeholder]").forEach(el => {
    ["aria-label", "title", "placeholder"].forEach(a => { const v = (el.getAttribute(a) || "").trim(); if (v && (keys.has(v) || /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(v))) out.attrs.add(a + "=" + v); });
  });
  // « undefined », « NaN »… dans le texte visible (hors relevés bruts affichés tels quels)
  document.querySelectorAll("body *").forEach(el => {
    if (el.children.length || !vu(el) || el.closest("pre, code, textarea, .raw, .tq-raw")) return;
    const t = el.textContent;
    const m = t.match(/\\bundefined\\b|\\bNaN\\b|Invalid Date|\\[object Object\\]|\\{[a-z]+\\}/);
    if (m) out.bad.add(m[0] + " ← « " + t.trim().slice(0, 80) + " »");
  });
  return { keys: [...out.keys], attrs: [...out.attrs], bad: [...out.bad] };
}`;

(async () => {
  // ================= 3. Contrôles des fichiers (sans navigateur) =================
  console.log("== 0. Fichiers du site");
  const html = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const scripts = f => [...html(f).matchAll(/src="js\/([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  const sIdx = scripts("index.html"), sOp = scripts("operateur.html");
  ok("les deux pages chargent les mêmes fichiers de textes (i18n), dans le même ordre", JSON.stringify(sIdx.filter(f => /^i18n/.test(f))) === JSON.stringify(sOp.filter(f => /^i18n/.test(f))), { admin: sIdx.filter(f => /^i18n/.test(f)), op: sOp.filter(f => /^i18n/.test(f)) });
  const manquants = [...new Set([...sIdx, ...sOp])].filter(f => !fs.existsSync(path.join(ROOT, "js", f)));
  ok("chaque fichier js demandé par les pages existe", manquants.length === 0, manquants);
  const inutiles = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js") && !sIdx.includes(f) && !sOp.includes(f));
  ok("chaque fichier js du dossier sert à une page", inutiles.length === 0, inutiles);
  const version = (html("js/config.js").match(/version:\s*"([^"]+)"/) || [])[1];
  ok("version 5.21.0 dans config.js", version === "5.21.0", version);
  // v5.19 : chaque fichier js / css est demandé avec « ?v=<version> » : après une publication, un simple
  // rechargement de la page prend TOUS les nouveaux fichiers (plus de mélange ancienne / nouvelle version).
  for (const f of ["index.html", "operateur.html"]) {
    const liens = [...html(f).matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
    const mauvais = liens.filter(l => !l.endsWith("?v=" + version));
    ok(`${f} : les ${liens.length} fichiers js / css portent « ?v=${version} »`, liens.length > 10 && mauvais.length === 0, mauvais);
  }

  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: m.temp, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  const browser = await chromium.launch();
  const errs = [];
  const appareil = async (nom, opts) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts));
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(nom + " pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(nom + " console: " + m.text()); });
    p.on("dialog", d => d.accept());
    return p;
  };
  const entrer = async (p, page) => {
    await p.goto(URL0 + page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(2000);
  };
  const aller = async (p, v) => { await p.evaluate(x => BA.Shell.go(x), v); await p.waitForSelector(`#view-${v}.active`, { timeout: 10000 }); await sleep(450); };

  // ================= 1. Remplissage : spontané / mission =================
  console.log("\n== 1. Remplir : sans commande (spontané) → 0 par défaut ; avec une commande (mission) → quantités de la commande");
  const o = await appareil("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await entrer(o, "operateur.html");
  const jusquAuChargement = async num => {
    await o.evaluate(n => BA.Wizard.open(n), num);
    await o.waitForSelector("#inv-yes"); await o.click("#inv-yes");
    await o.waitForSelector("#rm-next, #rm-yes");
    if (await o.$("#rm-next")) await o.click("#rm-next"); else await o.click("#rm-no");
    await o.waitForSelector("#ld-validate"); await sleep(300);
  };
  const annuler = async () => { await o.click("#wz-cancel"); await sleep(150); await o.click("#wz-cancel"); await sleep(400); };
  const qte = (num, sel) => o.evaluate(([n, s]) => { const m = BA.Store.get().machines.find(x => x.num === n); return BA.Model.qty(BA.Model.sel(m, s)); }, [num, sel]);

  if (!process.env.BA_ECRANS_SEULS) {           // BA_ECRANS_SEULS=1 : seulement le contrôle des écrans (partie 2)
  // machine #3 : aucune mission
  await jusquAuChargement(3);
  let wz = await o.innerText(".modal");
  ok("spontané (#3, sans commande) : 0 pain par défaut sur chaque sélection", (await o.inputValue("#ld-1-0")) === "0" && (await o.inputValue("#ld-4-0")) === "0", [await o.inputValue("#ld-1-0"), await o.inputValue("#ld-4-0")]);
  ok("spontané : explication « Remplissage sans commande : tout est à 0 », pas de « conseillé »", /Remplissage sans commande/.test(wz) && !/conseillé/.test(wz), wz.slice(0, 400));
  ok("spontané : « Total à charger : 0 »", /: 0 /.test(await o.innerText("#ld-total")), await o.innerText("#ld-total"));
  await o.$eval("#ld-1-0", e => e.scrollIntoView({ block: "center" })); await sleep(200);
  await o.screenshot({ path: path.join(OUT, "v519-01-remplir-spontane-0.png") });
  // boutons + : le total suit
  const plus = await o.$$(".modal .pm-b");
  for (let i = 0; i < 3; i++) { await plus[1].click(); await sleep(80); }        // + sur la sélection 1
  await plus[3].click(); await sleep(150);                                        // + sur la sélection 4
  ok("boutons + : 3 et 1 pains, « Total à charger : 4 » mis à jour tout de suite", (await o.inputValue("#ld-1-0")) === "3" && (await o.inputValue("#ld-4-0")) === "1" && /: 4 /.test(await o.innerText("#ld-total")), [await o.inputValue("#ld-1-0"), await o.inputValue("#ld-4-0"), await o.innerText("#ld-total")]);
  await o.fill("#ld-1-0", "5"); await sleep(100);
  ok("saisie au clavier : « Total à charger : 6 »", /: 6 /.test(await o.innerText("#ld-total")), await o.innerText("#ld-total"));
  await o.$eval("#ld-total", e => e.scrollIntoView({ block: "center" })); await sleep(200);
  await o.screenshot({ path: path.join(OUT, "v519-02-remplir-spontane-saisie.png") });
  await o.click("#ld-validate"); await o.waitForSelector("#wz-close");
  ok("spontané validé : sél. 1 = 1 + 5 = 6, sél. 4 = 1", (await qte(3, 1)) === 6 && (await qte(3, 4)) === 1, [await qte(3, 1), await qte(3, 4)]);
  await o.click("#wz-close"); await sleep(400);

  // machine #1 : mission « remplir à fond »
  await jusquAuChargement(1);
  wz = await o.innerText(".modal");
  ok("mission (#1) : quantités de la commande déjà écrites (sél. 1 → 6, sél. 2 pleine → 0)", (await o.inputValue("#ld-1-0")) === "6" && (await o.inputValue("#ld-2-0")) === "0", [await o.inputValue("#ld-1-0"), await o.inputValue("#ld-2-0")]);
  ok("mission : « conseillé : 6 » et l'explication « selon les quantités indiquées »", /conseillé : 6/.test(wz) && /quantités indiquées/.test(wz) && !/sans commande/.test(wz), wz.slice(0, 400));
  ok("mission : « Total à charger : 6 »", /: 6 /.test(await o.innerText("#ld-total")), await o.innerText("#ld-total"));
  await o.$eval("#ld-1-0", e => e.scrollIntoView({ block: "center" })); await sleep(200);
  await o.screenshot({ path: path.join(OUT, "v519-03-remplir-mission.png") });
  await o.click("#ld-validate"); await o.waitForSelector("#wz-close");
  const mis = await o.evaluate(() => BA.Store.get().missions.map(x => x.num + ":" + x.status).join(" "));
  ok("mission validée : sél. 1 = 10 (plein), mission #1 terminée, mission #2 encore ouverte", (await qte(1, 1)) === 10 && /1:done/.test(mis) && /2:open/.test(mis), [await qte(1, 1), mis]);
  await o.click("#wz-close"); await sleep(400);

  // machine #2 : mission « selon le besoin » (moins que plein)
  await jusquAuChargement(2);
  wz = await o.innerText(".modal");
  ok("mission selon le besoin (#2) : 5 déjà écrit (plein = 8, commande = 5)", (await o.inputValue("#ld-1-0")) === "5", await o.inputValue("#ld-1-0"));
  ok("mission selon le besoin : message « quantités de la commande »", /quantités de la commande/.test(wz) && /conseillé : 5/.test(wz), wz.slice(0, 500));
  // « Annuler » cliqué une fois (confirmation), puis l'opérateur continue : après 4 s, ses chiffres tapés sont toujours là
  await o.fill("#ld-1-0", "4"); await o.click("#wz-cancel"); await sleep(4400);
  ok("« Annuler » une seule fois puis attente 4 s : le bouton revient, le chiffre tapé (4) reste", (await o.inputValue("#ld-1-0")) === "4" && /Annuler/.test(await o.innerText("#wz-cancel")) && !/⚠️/.test(await o.innerText("#wz-cancel")), [await o.inputValue("#ld-1-0"), await o.innerText("#wz-cancel")]);
  await annuler();
  ok("annulé : rien chargé, mission #2 toujours ouverte, porte refermée", (await qte(2, 1)) === 2 && (await o.evaluate(() => BA.Store.get().missions.some(x => x.num === 2 && x.status === "open"))) && (await o.evaluate(() => BA.Store.get().machines.find(m => m.num === 2).door)) === false);

  // langues : textes du remplissage en néerlandais et en anglais
  for (const [lang, re] of [["nl", /zonder bestelling/], ["en", /without an order/]]) {
    await o.evaluate(l => { BA.I18n.set(l, "op"); BA.Shell.build(); }, lang); await sleep(400);
    await o.evaluate(() => BA.Store.update(s => { s.missions.forEach(x => { x.status = "done"; }); }));
    await jusquAuChargement(2);
    ok(`spontané en ${lang} : explication traduite, 0 par défaut`, re.test(await o.innerText(".modal")) && (await o.inputValue("#ld-1-0")) === "0", (await o.innerText(".modal")).slice(0, 300));
    await annuler();
    ok(`${lang} : 2e « Remplir » juste après le 1er : bien annulé (porte refermée)`, (await o.evaluate(() => BA.Store.get().machines.find(m => m.num === 2).door)) === false && !(await o.$(".modal")));
  }
  await o.evaluate(() => { BA.I18n.set("fr", "op"); BA.Shell.build(); }); await sleep(300);

  // À faire : une machine HORS LIGNE avec des pains trop vieux reste « à visiter » (avant : « Rien d'urgent »)
  await aller(o, "todo");
  const af = await o.innerText("#view-todo");
  ok("À faire : #4 hors ligne avec des pains de plus de 48 h → « à visiter », avec « Hors ligne » et « Pains à retirer »", /#4/.test(af) && /Hors ligne/.test(af) && /Pains à retirer/.test(af) && !/Rien d'urgent/.test(af), af.slice(0, 600));
  ok("À faire : les machines hors ligne sans rien à faire (#1, #2, #3) ne sont pas listées", !/#1\b|#2\b|#3\b/.test(af.split("Machines à visiter")[1] || ""), af.slice(0, 600));
  await o.screenshot({ path: path.join(OUT, "v519-04-a-faire-hors-ligne.png") });
  }

  // ================= 2. Contrôle général : tous les écrans =================
  console.log("\n== 2. Tous les écrans : erreurs, textes manquants, « undefined », téléphone");
  const a = await appareil("pc", { viewport: { width: 1440, height: 900 } });
  await entrer(a, "index.html");
  await a.evaluate(new Function("return (" + REMPLIR_DONNEES + ")()"));
  await sleep(1500);
  const at = await appareil("admin-tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await entrer(at, "index.html");
  await o.reload(); await o.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  const ADMIN = ["dashboard", "details", "products", "order", "stats", "history", "alerts", "rs232", "technique", "settings"];
  const OP = ["todo", "fill", "alerts", "more", "details", "products", "history", "rs232", "dashboard", "missions"];
  const TQ = ["boxes", "machines", "cable", "journal", "system", "raw"];
  const problemes = [];
  const verifier = async (p, nom, v, tel) => {
    const d = await p.evaluate(new Function("return (" + DEFAUTS + ")()"));
    if (d.keys.length) problemes.push(`${nom} « ${v} » texte manquant : ${d.keys.join(", ")}`);
    if (d.attrs.length) problemes.push(`${nom} « ${v} » infobulle sans texte : ${d.attrs.join(", ")}`);
    if (d.bad.length) problemes.push(`${nom} « ${v} » : ${d.bad.join(" | ")}`);
    if (tel) { const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (w > 1) problemes.push(`${nom} « ${v} » : la page dépasse de ${w} px à droite`); }
  };
  let n = 0;
  for (const theme of ["dark", "light"]) {
    for (const p of [a, at, o]) await p.evaluate(th => { document.documentElement.dataset.theme = th; try { localStorage.setItem("ba_theme", th); } catch (e) {} }, theme);
    for (const lang of ["fr", "nl", "en"]) {
      for (const [p, nom, views, role, tel] of [[a, "admin PC", ADMIN, "admin", false], [at, "admin téléphone", ADMIN, "admin", true], [o, "opérateur", OP, "op", true]]) {
        await p.evaluate(([l, r]) => { BA.I18n.set(l, r); BA.Shell.build(); }, [lang, role]); await sleep(300);
        for (const v of views) {
          await aller(p, v); n++;
          await verifier(p, `${nom} ${lang} ${theme}`, v, tel);
          if (v === "technique") for (const tb of TQ) {
            const b = await p.$(`[data-tq-tab=${tb}]`); if (!b) continue;
            await b.click(); await sleep(350); n++;
            await verifier(p, `${nom} ${lang} ${theme}`, "technique/" + tb, tel);
          }
          if (lang === "fr" && (v === "dashboard" || v === "todo" || v === "fill" || v === "alerts")) await p.screenshot({ path: path.join(OUT, `v519-90-${nom.replace(/\W+/g, "-")}-${theme}-${v}.png`) });
        }
      }
    }
  }
  ok(`${n} écrans vérifiés : aucun texte manquant, aucune infobulle vide, aucun « undefined / NaN », rien qui dépasse sur téléphone`, problemes.length === 0, problemes);
  if (problemes.length) problemes.slice(0, 60).forEach(x => console.log("     · " + x));
  ok("aucune erreur JavaScript (PC, téléphone admin, téléphone opérateur)", errs.length === 0, errs.slice(0, 20));
  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST BON");
  process.exit(ko ? 1 : 0);
})();
