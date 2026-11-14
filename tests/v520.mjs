// Essais de la v5.20 : « 🤖 Demander conseil à une IA »
//   - la carte est sous « Préparer une commande » (onglet Commander), avec les boutons Claude et ChatGPT et « Copier pour l'IA » ;
//   - un clic sur Claude / ChatGPT : le résumé est copié ET le site s'ouvre (dans un nouvel onglet) ;
//   - le résumé contient les 8 semaines de ventes, les commandes passées, les réglages à la main, le calcul du logiciel ;
//     il ne contient AUCUNE adresse de rue ni secret ;
//   - 3 langues, téléphone et ordinateur : aucun texte manquant, pas de défilement de côté.
// node v520.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v520");
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
const now = Date.now(), H = 3600000, MIN = 60000, DAY = 24 * H;
const lot = (id, qty, hAgo) => ({ id, qty, date: now - hAgo * H, kept: false });
const etat = {
  v: 1, hv: 1, seq: 9000, real: { v: 5, created: now - 40 * DAY }, daily: {}, epoch: "essai520", moves: [], thr48: true, orders: [], interventions: [], journal: [], applied: [], events: [],
  machines: [
    { id: "FAS-520000001", num: 1, street: "Rue de la Gare 1", city: "Bruxelles", region: "bru", serial: "520000001", door: false, link: false, power: false, temp: 4.5,
      sels: [{ n: 1, cap: 10, lots: [lot(1, 4, 5)], type: "blanc", price: 2.5 }, { n: 2, cap: 8, lots: [lot(2, 6, 5)], type: "gris", price: 3 }],
      lastSale: now - 2 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null },
    { id: "FAS-520000002", num: 2, street: "Kerkstraat 2", city: "Antwerpen", region: "vl", serial: "520000002", door: false, link: false, power: false, temp: 5,
      sels: [{ n: 1, cap: 10, lots: [lot(3, 2, 5)], type: "blanc", price: 2.5 }],
      lastSale: now - 3 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null },
    // #3 : seulement 6 jours de ventes (historique court) + réglage à la main
    { id: "FAS-520000003", num: 3, street: "Place du Marché 3", city: "Namur", region: "wal", serial: "520000003", door: false, link: false, power: false, temp: 4,
      sels: [{ n: 1, cap: 6, lots: [lot(4, 3, 5)], type: "blanc", price: 2.5 }],
      lastSale: now - 4 * H, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null }
  ],
  missions: [],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: { 3: [80, 100, 100, 100, 110, 130, 60] }, profileManualAt: { 3: [now, now, now, now, now, now, now] }, calendar: []
};

// 8 semaines de ventes : machines 1 et 2 sur 56 jours, machine 3 sur 6 jours seulement
const REMPLIR_DONNEES = `() => BA.Store.update(s => {
  const M = BA.Model, DAY = 86400000, now = s.now;
  for (let d = 56; d >= 1; d--) {
    const at = now - d * DAY;
    s.machines.forEach(m => {
      if (m.num === 3 && d > 6) return;
      const n = 3 + ((d * 7 + m.num * 3) % 6);
      M.addDaily(s, at, m.num, { s: n, r: n * 2.6, l: d % 2 ? 0 : n, x: d % 5 ? 0 : 1, c: d % 2 ? 0 : n * 1.1 });
      M.addType(s, at, m.num, "blanc", n - 1); M.addType(s, at, m.num, "gris", 1);
    });
  }
  s.orders.unshift({ id: s.seq++, t: now - 30 * 3600000, withRemoval: false, removeBefore: null, passageAt: now - 6 * 3600000, marginPct: 10, perType: [{ type: "blanc", qty: 47 }, { type: "gris", qty: 12 }] });
  s.orders.unshift({ id: s.seq++, t: now - 6 * 3600000, withRemoval: false, removeBefore: null, passageAt: now + 18 * 3600000, marginPct: 5, perType: [{ type: "blanc", qty: 51 }] });
})`;

// textes qui ressemblent à une clé de traduction (texte manquant)
const DEFAUTS = `() => {
  const keys = new Set(Object.keys(BA.I18n.dicts.fr));
  const PREF = /^(ev|evd|rs|usb|eva|sync|login|setup|btn|nav|col|st|sum|cat|fc|cal|sg|kind|rel|mv|hk|by|it|af|per|rr|op|tq|bx|step|ld|mission|chip|nt|cs|x|adv|load|ia|th)_/;
  const out = { keys: new Set(), attrs: new Set(), bad: new Set() };
  const txt = document.body.innerText;
  (txt.match(/\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b/gi) || []).forEach(w => { if (keys.has(w) || PREF.test(w)) out.keys.add(w); });
  document.querySelectorAll("[aria-label],[title],[placeholder]").forEach(el => {
    ["aria-label", "title", "placeholder"].forEach(a => { const v = (el.getAttribute(a) || "").trim(); if (v && (keys.has(v) || /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(v))) out.attrs.add(a + "=" + v); });
  });
  document.querySelectorAll("body *").forEach(el => {
    if (el.children.length || !(el.offsetWidth || el.offsetHeight) || el.closest("pre, code, textarea, .raw")) return;
    const m = el.textContent.match(/\\bundefined\\b|\\bNaN\\b|Invalid Date|\\[object Object\\]|\\{[a-z]+\\}/);
    if (m) out.bad.add(m[0] + " ← « " + el.textContent.trim().slice(0, 80) + " »");
  });
  return { keys: [...out.keys], attrs: [...out.attrs], bad: [...out.bad] };
}`;

(async () => {
  console.log("== 0. Fichiers du site");
  const html = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const scripts = f => [...html(f).matchAll(/src="js\/([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  const sIdx = scripts("index.html"), sOp = scripts("operateur.html");
  const i18n = a => a.filter(f => /^i18n/.test(f));
  ok("les deux pages chargent les mêmes fichiers de textes, dans le même ordre", JSON.stringify(i18n(sIdx)) === JSON.stringify(i18n(sOp)), { admin: i18n(sIdx), op: i18n(sOp) });
  ok("i18n-v520.js est chargé par les deux pages, après i18n-v519.js", i18n(sIdx).indexOf("i18n-v520.js") === i18n(sIdx).indexOf("i18n-v519.js") + 1 && i18n(sIdx).includes("i18n-v520.js") && i18n(sOp).includes("i18n-v520.js"), i18n(sIdx));
  const version = (html("js/config.js").match(/version:\s*"([^"]+)"/) || [])[1];
  ok("version 5.28.5 dans config.js", version === "5.28.5", version);
  for (const f of ["index.html", "operateur.html"]) {
    const liens = [...html(f).matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
    const mauvais = liens.filter(l => !l.endsWith("?v=" + version));
    ok(`${f} : les ${liens.length} fichiers js / css portent « ?v=${version} »`, liens.length > 10 && mauvais.length === 0, mauvais);
  }
  const manquants = [...new Set([...sIdx, ...sOp])].filter(f => !fs.existsSync(path.join(ROOT, "js", f)));
  ok("chaque fichier js demandé par les pages existe", manquants.length === 0, manquants);

  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: m.temp, last_seen: null, created_at: "2026-10-27T10:00:00Z" }));
  const browser = await chromium.launch();
  const errs = [], sitesOuverts = [];
  const appareil = async (nom, opts) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels", permissions: ["clipboard-read", "clipboard-write"] }, opts));
    await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });   // v5.25 : ces essais vérifient l'affichage « Classique » (comme avant)
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    // les vrais sites Claude / ChatGPT ne sont JAMAIS contactés : on note seulement l'adresse demandée
    await ctx.route(/^https:\/\/(claude\.ai|chatgpt\.com)\//, r => { sitesOuverts.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/html", body: "<title>site IA (essai)</title>" }); });
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

  console.log("\n== 1. Commander : la carte IA est SOUS la préparation de commande");
  const a = await appareil("pc", { viewport: { width: 1280, height: 900 } });
  await entrer(a, "index.html");
  await a.evaluate(eval(REMPLIR_DONNEES));
  await sleep(600);
  await aller(a, "order");
  ok("avant la commande : la carte est en bas de page avec le rappel « Prépare d'abord la commande »", /Prépare d'abord la commande/.test(await a.innerText("#view-order .ia-card")) && !!(await a.$("#view-order .ia-card .ia-hint")));
  const posAvant = await a.evaluate(() => { const c = document.querySelector("#view-order .ia-card").getBoundingClientRect().top, q = document.querySelector("#view-order .q-card").getBoundingClientRect().top; return { carte: c, question: q }; });
  ok("la carte est sous les questions (pas en haut de la page)", posAvant.carte > posAvant.question, posAvant);
  await a.click("[data-q=q1][data-v='1']");
  await a.click("[data-q=q2][data-v='0']");
  await a.click("#calc");
  await a.waitForSelector("#fc-calc", { timeout: 10000 });
  if (await a.$("#fc-all")) await a.click("#fc-all");
  await a.waitForSelector("#fc-calc:not([disabled])", { timeout: 10000 });
  await a.click("#fc-calc");
  await a.waitForSelector("#send", { timeout: 10000 });
  await sleep(500);
  const pos = await a.evaluate(() => { const c = document.querySelector("#view-order .ia-card"), p = document.querySelector("#view-order #send"); return { carteSousPlan: !!(p && c && (p.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)), hint: !!document.querySelector("#view-order .ia-hint") }; });
  ok("commande préparée : la carte vient APRÈS le plan (bouton d'envoi), sans le rappel", pos.carteSousPlan && !pos.hint, pos);
  const carte = await a.innerText("#view-order .ia-card");
  ok("carte : titre, boutons « Claude », « ChatGPT » et « Copier pour l'IA »", /Demander conseil à une IA/.test(carte) && !!(await a.$("#view-order [data-ia-open=claude]")) && !!(await a.$("#view-order [data-ia-open=chatgpt]")) && /Copier pour l'IA/.test(carte), carte);
  const liens = await a.$$eval("#view-order [data-ia-open]", els => els.map(e => e.getAttribute("href") + "|" + e.target + "|" + e.rel));
  ok("les liens vont vers claude.ai et chatgpt.com, dans un nouvel onglet, sans « opener »", liens.length === 2 && /^https:\/\/claude\.ai\/new\|_blank\|noopener/.test(liens[0]) && /^https:\/\/chatgpt\.com\/\|_blank\|noopener/.test(liens[1]), liens);
  await a.$eval("#view-order .ia-card", e => e.scrollIntoView({ block: "center" })); await sleep(250);
  await a.screenshot({ path: path.join(OUT, "v520-01-carte-sous-commande-pc.png") });

  console.log("\n== 2. Un clic sur Claude / ChatGPT : le résumé est copié ET le site s'ouvre");
  for (const [site, rx] of [["claude", /claude\.ai\/new/], ["chatgpt", /chatgpt\.com\//]]) {
    await a.evaluate(() => navigator.clipboard.writeText("avant"));
    const [nouvelOnglet] = await Promise.all([a.context().waitForEvent("page", { timeout: 8000 }).catch(() => null), a.click(`#view-order [data-ia-open=${site}]`)]);
    await sleep(900);
    const copie = await a.evaluate(() => navigator.clipboard.readText()).catch(e => "ERREUR " + e.message);
    ok(`${site} : un nouvel onglet s'ouvre sur le bon site`, !!nouvelOnglet && rx.test(nouvelOnglet.url()), nouvelOnglet && nouvelOnglet.url());
    ok(`${site} : le résumé est dans le presse-papiers (pas « avant »)`, copie !== "avant" && /# Aide à la commande de pain/.test(copie), copie.slice(0, 100));
    ok(`${site} : message « Résumé copié … colle-le (Ctrl+V) »`, /Résumé copié/.test(await a.innerText("#toast, .toast, [role=status]").catch(() => "")) || /Résumé copié/.test(await a.evaluate(() => document.body.innerText)), "");
    if (nouvelOnglet) await nouvelOnglet.close();
    await a.bringToFront();
  }
  await a.evaluate(() => navigator.clipboard.writeText("avant"));
  await a.click("#view-order [data-ia-copy]"); await sleep(700);
  const txt = await a.evaluate(() => navigator.clipboard.readText());
  ok("« Copier pour l'IA » : copie seulement, sans ouvrir de site", /# Aide à la commande de pain/.test(txt) && (await a.context().pages()).length === 1, (await a.context().pages()).length);
  ok("le texte copié est aussi affiché (pour vérifier ou copier à la main)", (await a.inputValue("#view-order .ia-card textarea")) === txt);
  ok("aucune requête vers Claude / ChatGPT depuis la page : les sites s'ouvrent seulement par les liens", sitesOuverts.every(u => /^https:\/\/(claude\.ai\/new|chatgpt\.com\/)$/.test(u)), sitesOuverts);

  console.log("\n== 3. Contenu du résumé");
  const has = (n, c, x) => ok(n, c, x === undefined ? txt.slice(0, 300) : x);
  has("contient le contexte, la situation, les machines et la demande", /# Aide à la commande de pain/.test(txt) && /## Machines/.test(txt) && /## Ce que je te demande/.test(txt));
  has("8 semaines, toutes machines : tableau « ventes · chargés · retirés » avec 8 lignes", /## Les 8 dernières semaines, toutes machines ensemble/.test(txt) && (txt.match(/^- \d\d\/\d\d : \d+ · \d+ · \d+$/gm) || []).length === 8, (txt.match(/^- \d\d\/\d\d : .*$/gm) || []).length);
  has("ventes par type de pain et par semaine (blanc, gris)", /- Ventes de .*[Bb]lanc.* par semaine : (\d+ · ){7}\d+/.test(txt) && /- Ventes de .*[Gg]ris.* par semaine : (\d+ · ){7}\d+/.test(txt));
  has("chaque machine : « Ventes par semaine » avec 8 chiffres + pains retirés", (txt.match(/- Ventes par semaine \(de la plus ancienne à la plus récente\) : (\d+ · ){7}\d+ — pains retirés sur la période : \d+/g) || []).length === 3, (txt.match(/- Ventes par semaine.*$/gm) || []));
  // contrôle indépendant des chiffres : on recompte les ventes des 56 derniers jours directement dans les données
  const attendu = await a.evaluate(() => { const s = BA.Store.get(), FC = BA.Forecast, k0 = BA.Model.dayKey(s.now); let tot = 0; const par = {}; for (let i = 1; i <= 56; i++) { const d = s.daily[FC.addDays(k0, -i)] || {}; Object.keys(d).forEach(n => { tot += d[n].s; par[n] = (par[n] || 0) + d[n].s; }); } return { tot: Math.round(tot), par }; });
  const somme = (txt.match(/^- \d\d\/\d\d : (\d+) · \d+ · \d+$/gm) || []).map(l => Number(l.split(" : ")[1].split(" · ")[0])).reduce((x, y) => x + y, 0);
  has("chiffres justes : la somme des 8 semaines (tableau de la flotte) = les ventes recomptées dans les données", somme === attendu.tot && somme > 0, { somme, attendu: attendu.tot });
  const parMach = (txt.match(/- Ventes par semaine \(de la plus ancienne à la plus récente\) : ((?:\d+ · ){7}\d+)/g) || []).map(l => l.split(" : ")[1].split(" · ").map(Number).reduce((x, y) => x + y, 0));
  has("chiffres justes : le total des 8 semaines de chaque machine = recomptage (machines 1, 2, 3)", JSON.stringify(parMach) === JSON.stringify([attendu.par[1], attendu.par[2], attendu.par[3]]), { parMach, attendu: attendu.par });
  has("machine #3 : « seulement 6 jours de ventes connus (historique court) »", /seulement 6 jours de ventes connus \(historique court\)/.test(txt));
  has("machine #3 : réglage à la main (% par jour) affiché", /Réglé à la main \(pas assez d'historique\), en % d'une journée normale : lun 100 %, mar 100 %, mer 100 %, jeu 110 %, ven 130 %, sam 60 %, dim 80 %/.test(txt), (txt.match(/Réglé à la main.*$/m) || [])[0]);
  has("mes dernières commandes : les 2 commandes inventées avec les quantités par type", /## Mes dernières commandes au boulanger/.test(txt) && /marge 5 % · .*51/.test(txt) && /marge 10 % · .*47.*12/.test(txt), (txt.match(/## Mes dernières commandes[\s\S]*?\n\n/) || [])[0]);
  has("le calcul du logiciel (tableau par type) est joint", /Calcul fait par Broodautomate pour le passage du/.test(txt) && !/Pas encore calculé/.test(txt));
  has("la demande : critiquer le calcul, tableau des quantités, commandes passées, machines à risque, répondre court", /CRITIQUE-le/.test(txt) && /type de pain · quantité conseillée à commander · différence avec le logiciel/.test(txt) && /Compare mes dernières commandes/.test(txt) && /risquent d'être vides/.test(txt) && /UNE question/.test(txt));
  has("AUCUNE adresse de rue dans le texte (seulement la ville)", !/Rue de la Gare|Kerkstraat|Place du Marché/.test(txt) && /### #1 — Bruxelles/.test(txt) && /### #2 — Antwerpen/.test(txt));
  has("aucun secret (clés, mots de passe, e-mail)", !/sb_publishable|sb_secret|apikey|password|mot de passe|@test\.be|DEVICE_KEY|FAS-520/i.test(txt));
  has("pas de « undefined », « NaN » ni « [object Object] » dans le texte", !/undefined|NaN|\[object Object\]/.test(txt));
  has("longueur raisonnable pour 3 machines (moins de 12 000 caractères)", txt.length < 12000, txt.length);
  console.log("--- extrait (historique et commandes) ---\n" + (txt.match(/## Les 8 dernières semaines[\s\S]*?## Calcul du logiciel/) || [""])[0].split("\n").slice(0, 22).join("\n") + "\n--- (" + txt.length + " caractères) ---");

  // sans commande préparée : le texte le dit
  await aller(a, "order");
  await a.evaluate(() => { BA.Shell.state.order.plan = null; });
  const txt0 = await a.evaluate(() => BA.IA.build(BA.Store.get(), BA.Shell.state.order));
  ok("sans commande préparée : « Pas encore calculé » (l'IA fait son propre calcul) et le résumé reste valide", /Pas encore calculé/.test(txt0) && /## Les 8 dernières semaines/.test(txt0));
  // sans aucun historique : pas de plantage
  const txtV = await a.evaluate(() => { const s = JSON.parse(JSON.stringify(BA.Store.get())); s.daily = {}; s.orders = []; s.profileManual = {}; return BA.IA.build(s, null); });
  ok("sans aucune vente ni commande : « Pas encore d'historique » et « Aucune commande enregistrée »", /Pas encore d'historique de ventes/.test(txtV) && /Aucune commande enregistrée/.test(txtV) && !/undefined|NaN/.test(txtV));

  console.log("\n== 4. Onglet Stock : la carte y reste ; onglet Prévision : pas de carte");
  await a.evaluate(() => BA.Shell.go("order")); await sleep(300);
  await a.click("#view-order .seg.tabs [data-tab=stock]"); await sleep(400);
  ok("Stock : la carte IA est là, en haut, sans le rappel", !!(await a.$("#view-order .ia-card")) && !(await a.$("#view-order .ia-hint")));
  await a.click("#view-order .seg.tabs [data-tab=fc]"); await sleep(400);
  ok("Prévision : pas de carte IA", !(await a.$("#view-order [data-ia]")));
  await a.click("#view-order .seg.tabs [data-tab=order]"); await sleep(300);

  console.log("\n== 5. Trois langues et deux thèmes : aucun texte manquant");
  for (const lang of ["fr", "nl", "en"]) {
    for (const theme of ["light", "dark"]) {
      await a.evaluate(([l, th]) => { BA.I18n.set(l, "admin"); try { BA.Theme && BA.Theme.set && BA.Theme.set(th); } catch (e) { /* rien */ } BA.Shell.go("order"); }, [lang, theme]);
      await sleep(400);
      await a.evaluate(() => { const o = BA.Shell.state.order; if (o && !o.plan) { /* le plan est recalculé au besoin */ } });
      const d = await a.evaluate(eval(DEFAUTS));
      const carteOk = !!(await a.$("#view-order .ia-card [data-ia-open=claude]"));
      ok(`langue ${lang} / thème ${theme} : carte présente, aucun texte manquant, aucun « undefined »`, carteOk && !d.keys.length && !d.attrs.length && !d.bad.length, d);
    }
  }
  await a.evaluate(() => BA.I18n.set("fr", "admin")); await sleep(300);

  console.log("\n== 6. Téléphone : la carte tient dans l'écran");
  const t = await appareil("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await entrer(t, "index.html");
  await t.evaluate(eval(REMPLIR_DONNEES)); await sleep(500);
  await aller(t, "order");
  await t.click("[data-q=q1][data-v='1']"); await t.click("[data-q=q2][data-v='0']"); await t.click("#calc");
  await t.waitForSelector("#fc-calc", { timeout: 10000 });
  if (await t.$("#fc-all")) await t.click("#fc-all");
  await t.waitForSelector("#fc-calc:not([disabled])", { timeout: 10000 });
  await t.click("#fc-calc"); await t.waitForSelector("#send", { timeout: 10000 }); await sleep(400);
  await t.$eval("#view-order .ia-card", e => e.scrollIntoView({ block: "center" })); await sleep(300);
  const geo = await t.evaluate(() => { const r = document.querySelector("#view-order .ia-card").getBoundingClientRect(); const bt = [...document.querySelectorAll("#view-order .ia-actions .btn")].map(b => { const q = b.getBoundingClientRect(); return { l: Math.round(q.left), r: Math.round(q.right), h: Math.round(q.height) }; }); return { l: Math.round(r.left), r: Math.round(r.right), bt, over: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
  ok("téléphone : la carte et les 3 boutons sont dans l'écran (390 px), grands (40 px ou plus), sans défilement de côté", geo.l >= 0 && geo.r <= 390 && geo.bt.length === 3 && geo.bt.every(b => b.l >= 0 && b.r <= 390 && b.h >= 40) && !geo.over, geo);
  await t.screenshot({ path: path.join(OUT, "v520-02-carte-telephone.png") });

  ok("aucune erreur JavaScript pendant tout l'essai", errs.length === 0, errs.slice(0, 5));
  await browser.close(); srv.close();
  console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT EST OK");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
