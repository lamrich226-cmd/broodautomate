// Essais de la v5.11 : machine « en ligne » seulement si elle est lue, alertes de la page Détails regroupées et archivables,
// profils par jour d'une machine sans historique, page RS232 en onglets, thèmes nuit / clair (design de la version test 4.8.6).
// node v511.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v511");
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
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 400))); if (!c) ko++; };

// Une machine toute neuve : pas encore de ventes, 3 sélections, un boîtier 4G en mode essai, 7 « porte ouverte » résolues
const now = Date.now(), H = 3600000;
const ev = (i, code, cat, resolvedAgo, data = {}) => ({ t: now - (resolvedAgo + 1) * H, id: 1000 + i, cat, key: "", num: 1, code, data, level: "warn", archived: false, resolved: true, resolvedAt: now - resolvedAgo * H });
const etat = {
  v: 1, hv: 1, seq: 5000, real: { v: 5, created: now - 9 * 24 * H }, daily: {}, epoch: "essai511", moves: [], thr48: true, orders: [], missions: [], interventions: [], journal: [], applied: [],
  events: [...Array.from({ length: 7 }, (_, i) => ev(i, "DOOR_OPEN", "door", 2 + i * 5)), ev(8, "BOX_FAIL", "tech", 30, { msg: "La machine ne répond pas." }), ev(9, "BOX_FAIL", "tech", 40, { msg: "La machine ne répond pas." })],
  machines: [{ id: "FAS-FAS000000001", num: 1, street: "Rue de l'Essai 1", city: "Deurne", region: "vl", serial: "FAS000000001", door: false, link: false, power: false, temp: 17,
    sels: [{ n: 11, cap: 3, lots: [], type: "blanc", price: 2.5 }, { n: 14, cap: 3, lots: [], type: "c52", price: 2.8 }, { n: 15, cap: 6, lots: [], type: "blanc", price: 2.5 }],
    lastSale: null, lastSeen: now - 15 * 24 * H, nextSale: null, tempUntil: null, powerUntil: null }],
  settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [{ id: "c52", name: "Pain tigré" }], dayDecisions: {}, profileManual: {}, calendar: []
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [
    { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
    { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-123", meta: { role: "operator" } }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = [{ id: "FAS-FAS000000001", name: "Rue de l'Essai 1", city: "Deurne", serial: "FAS000000001", model: null, status: "unknown", temp_c: 17, last_seen: null, created_at: "2026-10-27T10:00:00Z" }];
  fake.t.ba_demandes = [];
  fake.t.devices.push({ id: "d0000000-0000-0000-0000-000000000001", name: "Boîtier 1", machine_id: "FAS-FAS000000001", key_hash: "x".repeat(64),
    last_seen: new Date().toISOString(), info: { fw: "1.2", mode: 1, stok: false, st: "essai sans machine", hb: 30, rd: 60, ec: 900, lok: 0 }, created_at: "2026-10-27T10:00:00Z" });
  const browser = await chromium.launch();
  const errs = [];
  const device = async (name, opts, page = "index.html", email = "amor@test.be") => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels" }, opts));
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, name);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(name + " : " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(name + " : " + m.text()); });
    await p.goto(URL0 + page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", email); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(2500);
    return p;
  };
  const p = await device("pc", { viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const go = async v => { await p.evaluate(x => BA.Shell.go(x), v); await p.mouse.move(1000, 400); await sleep(700); };
  const shot = n => p.screenshot({ path: path.join(OUT, n + ".png") });

  console.log("== 1. « En ligne » seulement si la machine est vraiment lue");
  await go("dashboard");
  ok("en-tête : « En ligne : 0/1 » (le boîtier répond, mais il est en mode essai)", /0\/1/.test(await p.innerText("#online-status")));
  const card = await p.innerText(".carte-machine");
  ok("carte : « Hors ligne » et « boîtier en mode essai (pas branché sur la machine) »", /Hors ligne/.test(card) && /mode essai/.test(card), card);
  ok("chiffres : la machine vide compte quand même comme vide", (await p.innerText(".summary-cards")).replace(/\s+/g, " ").includes("MACHINES VIDES 1"));
  ok("badge « Sauvegardé » expliqué (données, pas machines)", /Sauvegardé/.test(await p.innerText("#sync-status")) && /pas l'état des machines/.test(await p.getAttribute("#sync-status", "title")));
  await shot("v511-01-dashboard-mode-essai");
  const lue = await p.evaluate(() => {
    const d = BA.Boitiers.devices()[0], i0 = d.info, r = {};
    d.info = Object.assign({}, i0, { mode: 0, stok: true, lok: Math.floor(Date.now() / 1000) - 600 }); r.recente = BA.Boitiers.machineLue(d.machine_id, Date.now());
    d.info = Object.assign({}, i0, { mode: 0, stok: true, lok: Math.floor(Date.now() / 1000) - 4 * 3600 }); r.vieille = BA.Boitiers.machineLue(d.machine_id, Date.now());
    d.info = Object.assign({}, i0, { mode: 0, stok: false, lok: Math.floor(Date.now() / 1000) - 600 }); r.echec = BA.Boitiers.machineLue(d.machine_id, Date.now());
    d.info = i0; return r;
  });
  ok("boîtier en mode normal : lue il y a 10 min → en ligne ; il y a 4 h → non ; lecture ratée → non", lue.recente === true && lue.vieille === false && lue.echec === false, lue);

  console.log("== 2. Détails machine : alertes regroupées et archivables");
  await go("details");
  const groupes = await p.$$eval(".al-group", g => g.map(x => x.innerText.replace(/\s+/g, " ")));
  ok("les 7 « Porte ouverte » résolues tiennent sur une seule ligne ×7", groupes.length === 2 && /×7/.test(groupes[0]) && /Porte ouverte/.test(groupes[0]), groupes);
  ok("les détails sont repliés (rien ne prend de la place tant qu'on n'ouvre pas)", await p.$$eval("details.al-more", d => d.every(x => !x.open)));
  await p.evaluate(() => { const h = [...document.querySelectorAll("#view-details h3")].find(x => /Alertes/.test(x.textContent)); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
  await sleep(300); await shot("v511-02-details-alertes");
  await p.click("[data-arch-group^='DOOR_OPEN']"); await sleep(600);
  ok("📦 Archiver un groupe : les 7 « porte ouverte » sont archivées, le reste ne bouge pas", await p.evaluate(() => { const e = BA.Store.get().events; return e.filter(x => x.code === "DOOR_OPEN" && x.archived).length === 7 && e.filter(x => x.code === "BOX_FAIL" && !x.archived).length === 2; }));
  await p.click("#det-arch-done"); await sleep(600);
  ok("📦 Archiver les alertes résolues : plus rien d'affiché, lien « Voir les archivées (9) »", (await p.$$(".al-group")).length === 0 && /Voir les archivées \(9\)/.test(await p.innerText("#view-details")));
  await p.click("[data-det-archived]"); await sleep(600);
  ok("« Voir les archivées » ouvre Alertes → Archivées", !!(await p.$("#view-alerts.active")) && !!(await p.$("#view-alerts [data-filter=archived].active")));

  console.log("== 3. Profils par jour d'une machine sans historique");
  await go("order");
  await p.click("#view-order .seg.tabs [data-tab=fc]"); await sleep(400);
  await p.click("[data-sub=prof]"); await sleep(400);
  ok("le titre garde son icône quand la page se redessine elle-même", !!(await p.$("#view-order h2 .h-ic")));
  await p.selectOption("#prof-unit", "n"); await sleep(400);
  await p.click("#view-order [data-pc='1|1']"); await sleep(500);
  const modal = await p.innerText(".pc-modal");
  ok("clic sur lundi : la fenêtre par type de pain s'ouvre (pain blanc, pain tigré)", /Pain blanc/i.test(modal) && /tigré/i.test(modal), modal.slice(0, 300));
  ok("sans historique : on écrit directement les pains", /pas encore d'historique/i.test(modal) && !/journée normale de 0/.test(modal), modal.slice(0, 400));
  let ins = await p.$$(".pc-in"); await ins[0].fill("6"); await ins[1].fill("2"); await sleep(200);
  await shot("v511-03-profil-sans-historique");
  await p.click("#pc-ok"); await sleep(600);
  await p.click("#view-order [data-pc='1|5']"); await sleep(400);
  ins = await p.$$(".pc-in"); await ins[0].fill("10"); await ins[1].fill("4"); await p.click("#pc-ok"); await sleep(600);
  const cells = await p.$$eval("#view-order tbody tr:nth-child(2) [data-pc]", c => c.map(x => x.textContent.trim()));
  ok("lundi = 8 pains, vendredi = 14 (réglés à la main), les autres jours = journée normale (11)", cells[0] === "8" && cells[4] === "14" && cells[2] === "11", cells);
  const st = await p.evaluate(() => { const s = BA.Store.get(); return { base: (s.profileBase || {})[1], lun: s.profileTypes[1][1] }; });
  ok("enregistré : journée normale 11, lundi 6 blancs + 2 tigrés", st.base === 11 && st.lun.blanc === 6 && st.lun.c52 === 2, st);
  await p.click("#view-order [data-pc='1|1']"); await sleep(400);
  await p.click("#pc-auto"); await sleep(400);
  await p.click("#view-order [data-pc='1|5']"); await sleep(400);
  await p.click("#pc-auto"); await sleep(400);
  ok("↺ retour en automatique sur les 2 jours : plus de journée normale réglée à la main", await p.evaluate(() => !((BA.Store.get().profileBase || {})[1])));

  console.log("== 4. Connexion RS232 en onglets");
  await go("rs232");
  ok("4 onglets : Câble, Boîtiers 4G, Mes machines, Outils", (await p.$$eval("[data-rs-tab]", b => b.map(x => x.dataset.rsTab).join())) === "cable,boxes,machines,tools");
  ok("onglet Câble : Connecter et Lire maintenant visibles, réglages et journal repliés", (await p.isVisible("#btn-rs-connecter")) && (await p.isVisible("#btn-rs-lire")) && !(await p.isVisible("#rs-vitesse")) && !(await p.isVisible("#rs-journal")));
  await shot("v511-04-rs232-cable");
  await p.click("[data-rs-tab=boxes]"); await sleep(400);
  ok("onglet Boîtiers 4G : la liste des boîtiers", (await p.isVisible("#rs-boitiers")) && !(await p.isVisible("#btn-rs-connecter")));
  await p.click("[data-rs-tab=tools]"); await sleep(300);
  ok("onglet Outils : clé USB et test EVA-DTS", (await p.isVisible("#eva-raw")) && (await p.isVisible("#usb-machine")));
  await go("dashboard"); await go("rs232");
  ok("l'onglet choisi reste ouvert quand on revient", (await p.isVisible("#eva-raw")));

  console.log("== 5. Design : thèmes et téléphone");
  const th = await p.evaluate(() => {
    const css = n => getComputedStyle(document.body)[n], r = {};
    document.documentElement.dataset.theme = "light"; r.clair = css("backgroundColor"); r.filtre = getComputedStyle(document.documentElement).filter;
    document.documentElement.dataset.theme = "dark"; r.nuit = css("backgroundColor");
    delete document.documentElement.dataset.theme; return r;
  });
  ok("thème clair crème (#f4f0e9), thème nuit ardoise (#0f172a), sans inversion de l'écran", th.clair === "rgb(244, 240, 233)" && th.nuit === "rgb(15, 23, 42)" && (th.filtre === "none" || !th.filtre), th);
  const tel = await device("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const h = await tel.evaluate(() => ({ h: Math.round(document.getElementById("app-header").getBoundingClientRect().height), over: document.scrollingElement.scrollWidth > innerWidth + 1, titre: document.getElementById("page-title").textContent, tabs: document.querySelectorAll("#app-tabbar button").length }));
  ok("téléphone : bandeau sur une ligne avec le titre de la page, 5 onglets en bas, pas de défilement de côté", h.h <= 64 && !h.over && h.titre === "Dashboard" && h.tabs === 5, h);
  await tel.screenshot({ path: path.join(OUT, "v511-05-telephone-nuit.png") });
  console.log("== 6. Opérateur (v5.11.1) : ajouter / supprimer une sélection, changer le prix");
  const op = await device("op", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" }, "operateur.html", "op@test.be");
  await op.evaluate(() => BA.Shell.go("more")); await sleep(500);
  ok("« Plus » : « Sélections et stock » dit qu'on peut ajouter, supprimer et changer le prix", /supprimer une sélection, changer le prix/i.test(await op.innerText("#view-more")));
  await op.evaluate(() => BA.Shell.go("products")); await sleep(700);
  ok("page Sélections et stock : bouton « ➕ Ajouter une sélection » en haut et explication", (await op.isVisible("#add-sel-go")) && /changer le type de pain, la capacité et le prix/.test(await op.innerText("#view-products")));
  ok("chaque sélection : prix modifiable et bouton « 🗑 Supprimer » écrit en entier", (await op.$$("#view-products .ps-price")).length === 3 && /Supprimer/.test(await op.innerText("#view-products .sel-del")));
  await op.fill("#ps-price-1-11", "2.80"); await op.press("#ps-price-1-11", "Tab"); await sleep(700);
  const pr = await op.evaluate(() => { const s = BA.Store.get(); const sel = BA.Model.sel(s.machines[0], 11); const j = s.journal.filter(e => e.k === "price").pop(); return { p: sel.price, j: j && { p: j.p, p0: j.p0, b: j.b } }; });
  ok("opérateur : prix de la sélection 11 → 2,80 €, noté dans l'Historique (2,50 → 2,80, par l'opérateur)", pr.p === 2.8 && pr.j && pr.j.p === 2.8 && pr.j.p0 === 2.5 && pr.j.b === "op", pr);
  // v5.11.1 : le message de confirmation apparaît aussi chez l'opérateur (avant, il était dessiné dans une copie détachée de la page)
  const msgOp = await op.evaluate(() => { const x = document.querySelector("#view-products .alert.info"); return x && x.isConnected && x.offsetParent !== null ? x.textContent : null; });
  ok("opérateur : message « ✅ Prix de la sélection 11 : 2,80 € » visible", !!msgOp && /Prix de la sélection 11\s*:\s*2,80\s*€/.test(msgOp), msgOp);
  await op.fill("#ps-cap-1-11", "5"); await op.press("#ps-cap-1-11", "Tab"); await sleep(700);
  ok("opérateur : capacité changée avec son message de confirmation", await op.evaluate(() => BA.Model.sel(BA.Store.get().machines[0], 11).cap === 5 && !!document.querySelector("#view-products .alert.info")));
  await op.click("#add-sel-go"); await sleep(600);
  await op.fill("#as-n-1", "16"); await op.fill("#as-cap-1", "4"); await op.fill("#as-price-1", "3.20");
  await op.click("[data-act=sel-add]"); await sleep(700);
  const add = await op.evaluate(() => { const sel = BA.Model.sel(BA.Store.get().machines[0], 16); return sel && { cap: sel.cap, price: sel.price }; });
  ok("opérateur : sélection 16 ajoutée avec son prix (4 places, 3,20 €)", add && add.cap === 4 && add.price === 3.2, add);
  await op.screenshot({ path: path.join(OUT, "v511-06-operateur-selections.png"), fullPage: true });
  await op.click("#view-products [data-act=sel-del][data-sel='16']"); await sleep(300);
  await op.click("#dlg-ok"); await sleep(700);
  ok("opérateur : sélection 16 supprimée (après confirmation)", await op.evaluate(() => !BA.Model.sel(BA.Store.get().machines[0], 16)));
  await op.evaluate(() => BA.Shell.go("history")); await sleep(700);
  ok("Historique de l'opérateur : « 💶 Prix changé » 2,50 € → 2,80 €", /Prix changé/.test(await op.innerText("#view-history")) && /2,50\s*€\s*→\s*2,80\s*€/.test(await op.innerText("#view-history")));
  await p.evaluate(() => BA.Shell.go("history")); await sleep(1200);
  ok("le PC admin voit le changement de prix de l'opérateur", /Prix changé/.test(await p.innerText("#view-history")));
  ok("aucune erreur dans les pages", !errs.length, errs);
  console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON");
  await browser.close(); srv.close(); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
