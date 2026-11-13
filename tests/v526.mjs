// Essais de la v5.26 : « Lire maintenant » INSTANTANÉ pour un boîtier à carte 1NCE (ICCID) — vraie appli dans Chromium, faux Supabase,
// fausse fonction « lire-1nce » (aucun appel réseau, données inventées).
//  1) boîtier AVEC ICCID : le bouton écrit la demande puis appelle lire-1nce avec (boîtier, n° de demande) ; message « ⚡ tout de suite »
//  2) boîtier SANS ICCID : comme avant (demande en attente, « dans 15 min au plus »), aucun appel à lire-1nce
//  3) la fonction échoue : la demande reste en attente + message « prochain passage » (rien n'est perdu)
//  4) saisie de l'ICCID dans le détail : refus d'un faux numéro, enregistrement d'un bon
//  5) formulaire « Ajouter un boîtier » : champ ICCID
// node v526.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v526");
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
const ICCID = "89882280666680646327";

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  const now = Date.now(), DAY = 86400000;
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * DAY }, daily: {}, epoch: "essai526", moves: [], thr48: true, orders: [], interventions: [], journal: [], applied: [], events: [], missions: [],
    machines: [{ id: "FAS-526000001", num: 1, street: "Rue de la Gare 1", city: "Bruxelles", region: "bxl", serial: "526000001", door: false, link: false, power: false, temp: 4.5, sels: [{ n: 1, cap: 10, lots: [], type: "blanc", price: 2.5 }], lastSale: now - 2 * 3600000, lastSeen: now - 30 * 60000 },
                { id: "FAS-526000002", num: 2, street: "Kerkstraat 2", city: "Antwerpen", region: "vl", serial: "526000002", door: false, link: false, power: false, temp: 5, sels: [{ n: 1, cap: 10, lots: [], type: "gris", price: 2.8 }], lastSale: now - 3 * 3600000, lastSeen: now - 30 * 60000 }],
    settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15 }, customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({ boitiers: true });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.runDemandesSql();
  const dev = (id, name, machine, iccid) => ({ id, name, machine_id: machine, key_hash: "x".repeat(64), last_seen: new Date().toISOString(), created_at: new Date(now - DAY).toISOString(), iccid, info: { fw: "1.5.2", mode: 0 } });
  fake.t.devices = [dev("dev-A", "Boîtier 1NCE", "FAS-526000001", ICCID), dev("dev-B", "Boîtier Digi", "FAS-526000002", null)];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const appels = []; let panne = false;
  await ctx.route(/functions\/v1\/lire-1nce/, async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    appels.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ status: panne ? 502 : 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(panne ? { ok: false, error: "1NCE injoignable" } : { ok: true, id: "t1" }) });
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|WebSocket|net::ERR|status of 50\d/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2000);
  const toasts = () => p.evaluate(() => [...document.querySelectorAll(".toast, #toasts > *, [role=status]")].map(e => e.textContent));
  const ouvrirMachine = async num => { await p.evaluate(n => { BA.Shell && BA.Shell.go ? BA.Shell.go("details") : 0; BA.Store.update && 0; }, num); };

  console.log("== 1. Boîtier avec ICCID : ordre instantané");
  const a = await p.evaluate(async () => { await BA.Boitiers.refresh(true); return BA.Boitiers.readNow("dev-A"); });
  await sleep(800);
  ok("demande écrite dans ba_demandes", !!a && a.id > 0 && fake.t.ba_demandes.some(x => x.id === a.id && x.device_id === "dev-A" && x.statut === "attente"), a);
  ok("lire-1nce appelée une fois avec (boîtier, n° de la demande)", appels.length === 1 && appels[0].device === "dev-A" && appels[0].demande === a.id, appels);
  ok("message « ⚡ lit la machine tout de suite » (pas « dans 15 min »)", (await toasts()).some(x => /tout de suite/.test(x)) && !(await toasts()).some(x => /15 min/.test(x)), await toasts());
  fake.t.ba_demandes.forEach(x => { x.statut = "faite"; x.fini_at = new Date().toISOString(); }); await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);

  console.log("== 2. Boîtier sans ICCID : comme avant");
  const n0 = appels.length;
  const b = await p.evaluate(() => BA.Boitiers.readNow("dev-B")); await sleep(800);
  ok("demande écrite, AUCUN appel à lire-1nce", !!b && b.id > 0 && appels.length === n0, appels);
  ok("message habituel « dans 15 min au plus »", (await toasts()).some(x => /15 min au plus/.test(x)), await toasts());
  fake.t.ba_demandes.forEach(x => { x.statut = "faite"; x.fini_at = new Date().toISOString(); }); await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);

  console.log("== 3. La fonction échoue : rien n'est perdu");
  panne = true; const c = await p.evaluate(() => BA.Boitiers.readNow("dev-A")); await sleep(1200);
  ok("demande toujours en attente (le boîtier la prendra à son passage)", fake.t.ba_demandes.some(x => x.id === c.id && x.statut === "attente"));
  ok("message « l'ordre instantané n'est pas parti … prochain passage (15 min au plus) »", (await toasts()).some(x => /pas parti/.test(x) && /15 min/.test(x)), await toasts());
  panne = false; fake.t.ba_demandes.forEach(x => { x.statut = "faite"; x.fini_at = new Date().toISOString(); }); await p.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);

  console.log("== 4. Saisie de l'ICCID dans le détail de la machine");
  await p.evaluate(() => { BA.Technique && BA.Technique.tab("boxes"); }); await sleep(800);
  const dans = await p.evaluate(() => BA.Boitiers.detail({ id: "FAS-526000002" }));
  ok("détail machine : champ « N° de la carte SIM (ICCID) » + bouton 💾", /data-bxiccid="dev-B"/.test(dans) && /data-bxiccid-save="dev-B"/.test(dans) && /N° de la carte SIM/.test(dans), dans.slice(0, 300));
  await p.evaluate(() => { document.body.insertAdjacentHTML("beforeend", '<div id="zz">' + BA.Boitiers.detail({ id: "FAS-526000002" }) + "</div>"); });
  await p.fill('#zz input[data-bxiccid="dev-B"]', "123");
  await p.click('#zz button[data-bxiccid-save="dev-B"]'); await sleep(500);
  ok("faux numéro (3 chiffres) refusé, rien enregistré", !fake.t.devices.find(d => d.id === "dev-B").iccid && (await toasts()).some(x => /18 à 20 chiffres/.test(x)), await toasts());
  await p.fill('#zz input[data-bxiccid="dev-B"]', "8988 2280 6666 8064 6328");
  await p.click('#zz button[data-bxiccid-save="dev-B"]'); await sleep(600);
  ok("bon numéro (espaces ignorés) enregistré dans devices.iccid", fake.t.devices.find(d => d.id === "dev-B").iccid === "89882280666680646328", fake.t.devices.find(d => d.id === "dev-B"));
  const n1 = appels.length; const e = await p.evaluate(() => BA.Boitiers.readNow("dev-B")); await sleep(800);
  ok("ensuite : « Lire maintenant » de ce boîtier est instantané aussi", appels.length === n1 + 1 && appels[n1].device === "dev-B", appels);

  console.log("== 5. Formulaire « Ajouter un boîtier »");
  const f = "";
  await p.evaluate(() => { BA.Technique && BA.Technique.tab("boxes"); BA.Shell.go("technique"); }); await p.waitForSelector("#view-technique.active"); await sleep(800);
  ok("champ « ICCID » présent dans le formulaire (facultatif)", !!(await p.$("#bx-iccid")), f);
  if (await p.$("#bx-iccid")) { await p.screenshot({ path: path.join(OUT, "v526-formulaire.png") }); }
  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  if (ko) { console.log("\n" + ko + " ÉCHEC(S)"); process.exit(1); } else console.log("\nTOUT EST OK");
})().catch(e => { console.error(e); process.exit(1); });
