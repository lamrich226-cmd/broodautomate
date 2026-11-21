// Essais de la v5.30 — vraie appli dans Chromium, faux Supabase, données inventées.
//  1) badge « RS232 : déconnecté » caché quand le câble n'est pas branché
//  2) Alertes : filtre par machine (les compteurs suivent)
//  3) Alertes : « Supprimer » → Corbeille 30 jours (restaurer, effacer pour de bon, vider) ; effacement automatique après 30 jours
//  4) appli opérateur : ni Corbeille ni boutons de suppression ; les alertes supprimées n'y sont pas
// node v530.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v530");
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
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 600))); if (!c) ko++; };
const ICCID = "89882280666680646327";
const pad = n => String(n).padStart(2, "0");
const cle = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };


(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  { const _nc = browser.newContext.bind(browser); browser.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } }); return c; }; }     // v5.41 : les pages sont en 3D par défaut ; ces essais vérifient la vue à plat (2D)
  const now = Date.now(), DAY = 86400000, MIN = 60000;
  const sel = (n, type) => ({ n, cap: 10, lots: [], type, price: 2.5 });
  const machine = (num, id) => ({ id, num, street: "Rue " + num, city: "Bruxelles", region: "bxl", serial: id.slice(4), door: false, link: false, power: false, temp: 5, sels: [sel(1, "blanc")] });
  const ev = (id, num, extra) => Object.assign({ id, t: now - 10 * MIN, num, code: "BOX_FAIL", cat: "tech", key: "k" + id, data: { msg: "essai " + id }, resolved: false }, extra || {});
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * DAY }, epoch: "essai530", thr48: true, orders: [], applied: [], missions: [],
    machines: [machine(1, "FAS-530000001"), machine(2, "FAS-530000002")], journal: [],
    events: [
      ev(501, 1),                                                                           // active, machine 1
      ev(502, 1, { resolved: true, resolvedAt: now - DAY, t: now - 2 * DAY }),              // résolue, machine 1
      ev(503, 2),                                                                           // active, machine 2
      ev(504, 2, { resolved: true, resolvedAt: now - DAY, t: now - 3 * DAY, archived: true }), // résolue et archivée, machine 2
      ev(505, 2, { resolved: true, t: now - 40 * DAY, archived: true, deleted: now - 31 * DAY }), // corbeille depuis 31 jours → effacée au démarrage
      ev(506, 1, { resolved: true, t: now - 35 * DAY, archived: true, deleted: now - 29 * DAY })  // corbeille depuis 29 jours → reste 1 jour
    ],
    interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15 },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|WebSocket|net::ERR|status of 50\d/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  const ids = () => p.evaluate(() => BA.Store.get().events.map(e => e.id).sort());
  const evOf = id => p.evaluate(i => { const e = BA.Store.get().events.find(x => x.id === i); return e ? { deleted: e.deleted || null, archived: !!e.archived, resolved: !!e.resolved } : null; }, id);
  const cartes = () => p.$$eval("#view-alerts .alert .ev-head .petit", l => l.map(x => x.textContent.split(" · ")[0]));
  const tabs = () => p.$$eval("#view-alerts [data-filter]", l => Object.fromEntries(l.map(b => [b.dataset.filter, Number((b.textContent.match(/\((\d+)\)/) || [])[1])])));
  const allerAlertes = async () => { await p.evaluate(() => BA.Shell.go("alerts")); await p.waitForSelector("#view-alerts.active"); await sleep(400); };

  console.log("== 1. Badge RS232");
  const bad = await p.$("#serial-status");
  ok("badge « RS232 : déconnecté » : présent dans le code mais caché quand le câble n'est pas branché", !!bad && (await bad.evaluate(e => getComputedStyle(e).display)) === "none", bad ? await bad.evaluate(e => [e.textContent, getComputedStyle(e).display]) : "absent");
  await p.evaluate(() => { BA.Serial && 0; });

  console.log("== 2. Corbeille : effacement automatique après 30 jours, au démarrage");
  ok("alerte 505 (31 jours dans la corbeille) effacée au démarrage ; 506 (29 jours) gardée ; les autres intactes", JSON.stringify(await ids()) === JSON.stringify([501, 502, 503, 504, 506]), await ids());
  ok("l'effacement est enregistré dans Supabase", !JSON.stringify(fake.ba("main").data.events).includes('"id":505'), fake.ba("main").version);

  console.log("== 3. Alertes : onglets, filtre par machine");
  await allerAlertes();
  ok("5 onglets : Actives (2), Résolues (1), Archivées (1), Toutes (4), Corbeille (1) — la corbeille n'est dans aucun autre", JSON.stringify(await tabs()) === JSON.stringify({ active: 2, resolved: 1, archived: 1, all: 4, trash: 1 }), await tabs());
  const opts = await p.$$eval("#alert-machine option", l => l.map(o => o.textContent.trim()));
  ok("menu « Machine » : toutes les machines, puis #1 et #2", opts.length === 3 && /Toutes/.test(opts[0]) && opts[1] === "#1" && opts[2] === "#2", opts);
  await p.selectOption("#alert-machine", "1"); await sleep(300);
  ok("machine #1 : compteurs et alertes de la #1 seulement (1 active, 1 résolue, 0 archivée, 2 en tout, 1 en corbeille)", JSON.stringify(await tabs()) === JSON.stringify({ active: 1, resolved: 1, archived: 0, all: 2, trash: 1 }) && (await cartes()).every(x => x === "#1"), [await tabs(), await cartes()]);
  await p.selectOption("#alert-machine", "2"); await sleep(300);
  ok("machine #2 : 1 active, 0 résolue, 1 archivée, 2 en tout, 0 en corbeille", JSON.stringify(await tabs()) === JSON.stringify({ active: 1, resolved: 0, archived: 1, all: 2, trash: 0 }) && (await cartes()).every(x => x === "#2"), [await tabs(), await cartes()]);
  await p.selectOption("#alert-machine", "all"); await sleep(300);
  ok("« Toutes les machines » : tout revient", (await tabs()).all === 4, await tabs());
  await p.screenshot({ path: path.join(OUT, "v530-alertes.png") });

  console.log("== 4. Supprimer → Corbeille");
  await p.click("#view-alerts [data-delete=\"501\"]"); await p.waitForSelector("#dlg-ok");
  const dlg = await p.innerText("#modal-root");
  ok("supprimer une alerte ENCORE ACTIVE : confirmation qui le dit, et parle de la corbeille et des 30 jours", /Supprimer 1 alerte/.test(dlg) && /corbeille/.test(dlg) && /30 jours/.test(dlg) && /encore active/.test(dlg), dlg);
  await p.click("#dlg-cancel"); await sleep(200);
  ok("« Annuler » : rien n'est supprimé", (await evOf(501)).deleted === null, await evOf(501));
  await p.click("#view-alerts [data-delete=\"501\"]"); await p.click("#dlg-ok"); await sleep(500);
  const e501 = await evOf(501);
  ok("501 supprimée : date de suppression ≈ maintenant, marquée archivée (donc cachée partout)", e501 && Math.abs(e501.deleted - Date.now()) < 60000 && e501.archived === true && e501.resolved === false, e501);
  ok("onglets : Actives 1, Archivées 1 (la supprimée n'y est pas), Toutes 3, Corbeille 2", JSON.stringify(await tabs()) === JSON.stringify({ active: 1, resolved: 1, archived: 1, all: 3, trash: 2 }), await tabs());
  ok("l'alerte supprimée a disparu de la liste « Actives »", !(await p.$("#view-alerts [data-delete=\"501\"]")));
  await p.click("#view-alerts [data-filter=resolved]"); await sleep(200);
  await p.click("#delete-shown"); await p.waitForSelector("#dlg-ok");
  const dlg2 = await p.innerText("#modal-root");
  ok("suppression en lot d'une alerte résolue : pas de mise en garde « encore active »", /Supprimer 1 alerte/.test(dlg2) && !/encore active/.test(dlg2), dlg2);
  await p.click("#dlg-ok"); await sleep(500);
  ok("502 supprimée en lot", (await evOf(502)).deleted > 0, await evOf(502));

  console.log("== 5. Corbeille : restaurer, effacer pour de bon, vider");
  await p.click("#view-alerts [data-filter=trash]"); await sleep(300);
  ok("Corbeille : 506, 501 et 502 (3 alertes), avec le nombre de jours restants ; 506 : encore 1 jour", (await cartes()).length === 3 && /encore 1 jour/.test(await p.innerText("#view-alerts")) && /encore 30 jours/.test(await p.innerText("#view-alerts")), [await cartes(), (await p.innerText("#view-alerts")).slice(0, 300)]);
  ok("Corbeille : note « reste 30 jours » et boutons Restaurer / Effacer pour de bon / Vider", /30 jours/.test(await p.innerText("#view-alerts .note")) && !!(await p.$("[data-restore=\"501\"]")) && !!(await p.$("[data-purge=\"501\"]")) && !!(await p.$("#empty-trash")));
  await p.screenshot({ path: path.join(OUT, "v530-corbeille.png") });
  await p.click("[data-restore=\"501\"]"); await sleep(500);
  const r501 = await evOf(501);
  ok("Restaurer 501 : de retour dans « Actives » comme avant (non résolue, non archivée, plus de date de suppression)", r501.deleted === null && r501.archived === false && r501.resolved === false, r501);
  await p.click("[data-purge=\"502\"]"); await p.waitForSelector("#dlg-ok");
  ok("Effacer pour de bon : confirmation « définitif »", /définitif/.test(await p.innerText("#modal-root")));
  await p.click("#dlg-ok"); await sleep(500);
  ok("502 effacée pour de bon (plus dans les données)", (await evOf(502)) === null && (await ids()).includes(506), await ids());
  await p.click("#empty-trash"); await p.waitForSelector("#dlg-ok"); await p.click("#dlg-ok"); await sleep(500);
  ok("Vider la corbeille : 506 effacée ; les alertes hors corbeille (501, 503, 504) sont intactes", JSON.stringify(await ids()) === JSON.stringify([501, 503, 504]), await ids());
  ok("Corbeille vide : message « La corbeille est vide »", /corbeille est vide/i.test(await p.innerText("#view-alerts")));
  const sv = fake.ba("main").data.events.map(e => e.id).sort();
  ok("tout est enregistré dans Supabase", JSON.stringify(sv) === JSON.stringify([501, 503, 504]), sv);

  console.log("== 6. Effacement automatique : « purgeTrash » après 30 jours pile");
  const n1 = await p.evaluate(() => { BA.Actions.deleteEvents([503]); return BA.Actions.purgeTrash(); });
  ok("alerte supprimée à l'instant : purgeTrash ne l'efface pas", n1 === 0 && (await evOf(503)).deleted > 0, n1);
  await p.evaluate(() => { BA.Store.update(s => { s.events.find(e => e.id === 503).deleted = Date.now() - 30 * 86400000 - 1000; }); });
  const n2 = await p.evaluate(() => BA.Actions.purgeTrash());
  ok("30 jours et 1 seconde : effacée pour de bon", n2 === 1 && (await evOf(503)) === null, n2);

  console.log("== 7. Appli opérateur");
  await p.evaluate(() => { BA.Actions.deleteEvents([501]); });
  const o = await ctx.newPage();
  o.on("pageerror", e => errs.push("opérateur : " + e.message));
  await o.goto(URL0 + "operateur.html");
  await o.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2000);
  await o.evaluate(() => BA.Shell.go("alerts")); await o.waitForSelector("#view-alerts.active"); await sleep(400);
  ok("opérateur : pas d'onglet Corbeille ni Archivées, pas de bouton Supprimer", !(await o.$("#view-alerts [data-filter=trash]")) && !(await o.$("#view-alerts [data-filter=archived]")) && !(await o.$("#view-alerts [data-delete]")));
  ok("opérateur : le filtre par machine est là, et l'alerte supprimée (501) n'y est plus", !!(await o.$("#alert-machine")) && !(await o.innerText("#view-alerts")).includes("essai 501"));
  await o.close();

  ok("aucune erreur JavaScript", errs.length === 0, errs.slice(0, 6));
  await browser.close(); srv.close();
  console.log(ko ? "\nv5.30 : " + ko + " ÉCHEC(S)" : "\nv5.30 : TOUT EST OK");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log("ARRÊT : " + (e.stack || e)); process.exit(1); });
