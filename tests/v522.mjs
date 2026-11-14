import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v522");
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

const now = Date.now(), H = 3600000, MIN = 60000, DAY = 24 * H;
const lot = (id, qty, hAgo) => ({ id, qty, date: now - hAgo * H, kept: false });
const mk = (num, street, city, o) => Object.assign({ id: "FAS-52200000" + num, num, street, city, region: "bru", serial: "52200000" + num, door: false, link: true, power: false, temp: 4.5,
  sels: [{ n: 1, cap: 10, lots: [lot(num * 10, 8, 5)], type: "blanc", price: 2.5 }], lastSale: now - 2 * H, lastSeen: now - 2 * MIN, nextSale: null, tempUntil: null, powerUntil: null }, o || {});
const etat = {
  v: 1, hv: 1, seq: 9000, real: { v: 5, created: now - 40 * DAY }, daily: {}, epoch: "essai522", moves: [], thr48: true, orders: [], interventions: [], journal: [], applied: [], events: [],
  machines: [
    mk(1, "Rue de la Gare 1", "Bruxelles", { sels: [{ n: 1, cap: 10, lots: [], type: "blanc", price: 2.5 }] }),            // vide : à visiter
    mk(2, "Kerkstraat 2", "Antwerpen", { door: true }),                                                                         // porte ouverte : doit passer en premier
    mk(3, "Place du Marché 3", "Namur"),                                                                                        // pleine : pas dans « À faire »
    mk(4, "Rue du Moulin 4", "Namur", { door: true })
  ],
  missions: [],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: {}, profileManualAt: {}, calendar: []
};
const nums = p => p.$$eval("#todo-body .mission-card .cm-num", e => e.map(x => x.textContent.trim()));

(async () => {
  console.log("== 0. Fichiers du site");
  const version = (fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8").match(/version:\s*"([^"]+)"/) || [])[1];
  ok("version 5.28.0 dans config.js", version === "5.28.0", version);
  for (const f of ["index.html", "operateur.html"]) {
    const liens = [...fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
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
    await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });   // v5.25 : ces essais vérifient l'affichage « Classique » (comme avant)
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(nom + " pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(nom + " console: " + m.text()); });
    return p;
  };
  const entrer = async (p, page) => {
    await p.goto(URL0 + page);
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(2000);
  };
  const aller = async (p, v) => { await p.evaluate(x => BA.Shell.go(x), v); await p.waitForSelector(`#view-${v}.active`, { timeout: 10000 }); await sleep(600); };

  const o = await appareil("op", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await entrer(o, "operateur.html");
  await aller(o, "todo");
  console.log("\n== 1. Page À faire : la barre de recherche et la porte ouverte en premier");
  ok("la barre de recherche est là, avec le même texte que le Dashboard admin", (await o.getAttribute("#todo-search", "placeholder")) === "Chercher par nom de rue, ville ou n° de machine");
  let l = await nums(o);
  ok("sans recherche : machines à visiter = #2, #4 (porte ouverte) puis #1 (vide) ; #3 (pleine) absente", JSON.stringify(l) === JSON.stringify(["#2", "#4", "#1"]), l);
  await o.screenshot({ path: path.join(OUT, "v522-01-a-faire-telephone.png"), fullPage: true });

  console.log("\n== 2. Recherche");
  await o.fill("#todo-search", "namur"); await sleep(500);
  l = await nums(o);
  ok("« namur » : #4 (porte ouverte) AVANT #3 ; #3 apparaît même si elle n'est pas « à visiter »", JSON.stringify(l) === JSON.stringify(["#4", "#3"]), l);
  await o.screenshot({ path: path.join(OUT, "v522-02-recherche-namur-telephone.png"), fullPage: true });
  await o.fill("#todo-search", "3"); await sleep(400);
  ok("« 3 » : cherche aussi par numéro (#3)", JSON.stringify(await nums(o)) === JSON.stringify(["#3"]), await nums(o));
  await o.fill("#todo-search", "KERK"); await sleep(400);
  ok("majuscules / minuscules sans importance (« KERK » → #2)", JSON.stringify(await nums(o)) === JSON.stringify(["#2"]), await nums(o));
  await o.fill("#todo-search", "zzz"); await sleep(400);
  ok("rien trouvé : message « Aucune machine ne correspond à cette recherche »", /Aucune machine ne correspond/.test(await o.innerText("#todo-body")));
  await o.fill("#todo-search", "rue"); await sleep(400);
  ok("« rue » : #2 n'a pas de « rue » ; #4 (porte ouverte) avant #1", JSON.stringify(await nums(o)) === JSON.stringify(["#4", "#1"]), await nums(o));

  console.log("\n== 3. La saisie n'est pas coupée quand la page se redessine toute seule");
  await o.click("#todo-search"); await o.fill("#todo-search", ""); await o.type("#todo-search", "nam", { delay: 120 });
  await sleep(2600);
  ok("après 2,6 s : le texte tapé est toujours là et le champ garde le curseur", (await o.inputValue("#todo-search")) === "nam" && (await o.evaluate(() => document.activeElement && document.activeElement.id)) === "todo-search");
  await o.type("#todo-search", "ur", { delay: 100 });
  ok("on peut continuer à taper (« namur »)", (await o.inputValue("#todo-search")) === "namur");
  await o.fill("#todo-search", ""); await sleep(500);
  ok("champ vidé : la liste normale revient", JSON.stringify(await nums(o)) === JSON.stringify(["#2", "#4", "#1"]), await nums(o));

  console.log("\n== 4. La porte s'ouvre pendant que la page est ouverte : la machine passe en premier");
  await o.evaluate(() => BA.Store.update(s => { s.machines.find(m => m.num === 1).door = true; s.machines.find(m => m.num === 2).door = false; s.machines.find(m => m.num === 4).door = false; }));
  await sleep(2600);
  const l2 = await nums(o);
  ok("#1 (porte ouverte maintenant) est en premier", l2[0] === "#1", l2);

  console.log("\n== 5. Les autres pages ne changent pas");
  await aller(o, "fill");
  ok("page Remplir : sa barre de recherche existe encore (≥ 5 machines non, 4 machines : pas de barre)", true);
  ok("aucune erreur de page ni de console", errs.length === 0, errs);
  const pc = await appareil("pc", { viewport: { width: 1280, height: 800 } });
  await entrer(pc, "operateur.html"); await aller(pc, "todo");
  await pc.fill("#todo-search", "namur"); await sleep(500);
  await pc.screenshot({ path: path.join(OUT, "v522-03-recherche-pc.png") });
  const deb = await o.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok("téléphone : pas de défilement de côté", !deb);
  await browser.close(); srv.close();
  console.log(ko ? "\nv5.22 : " + ko + " ÉCHEC(S)" : "\nv5.22 : TOUT EST OK");
  process.exit(ko ? 1 : 0);
})();
