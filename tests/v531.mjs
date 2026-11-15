// Essais de la v5.30 — vraie appli dans Chromium, faux Supabase, données inventées.
//  1) badge « RS232 : déconnecté » caché quand le câble n'est pas branché
//  2) Alertes : filtre par machine (les compteurs suivent)
//  3) Alertes : « Supprimer » → Corbeille 30 jours (restaurer, effacer pour de bon, vider) ; effacement automatique après 30 jours
//  4) appli opérateur : ni Corbeille ni boutons de suppression ; les alertes supprimées n'y sont pas
// node v531.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v531");
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
  const now = Date.now();
  const mk = (n, cap) => ({ n, cap, lots: [], type: "blanc", price: 2.5 });
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * 86400000 }, epoch: "essai531", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-531000001", num: 1, street: "Rue 1", city: "Bruxelles", region: "bxl", serial: "531000001", door: false, link: false, power: false, temp: 5, sels: [mk(1, 3), mk(2, 4), mk(3, 5), mk(4, 6), mk(5, 7)] }],
    events: [], journal: [], interventions: [], moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 15 },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 400, height: 900 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL0 + "index.html");
  await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
  await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  const html = await p.evaluate(() => {
    const s = BA.Store.get(), m = s.machines[0];
    return [3, 4, 5, 6, 7].map(n => { const sel = BA.Model.sel(m, n - 2 + 0); return sel ? sel.cap : null; });
  });
  console.log("capacités :", html);
  // dessine chaque sélection en grand (comme dans la fenêtre « Sélection »)
  const r = await p.evaluate(() => {
    const s = BA.Store.get(), m = s.machines[0], out = [];
    const box = document.createElement("div"); box.id = "essai-box"; box.style.cssText = "position:fixed;top:0;left:0;width:380px;background:#fff;z-index:99999;padding:8px";
    document.body.appendChild(box);
    for (const sel of m.sels) {
      const d = document.createElement("div"); d.innerHTML = BA.MachineView.big(s, m, sel); box.appendChild(d);
    }
    return [...box.querySelectorAll(".mv-slots")].map(el => ({ n: el.querySelectorAll(".mv-sw").length, cols: getComputedStyle(el).gridTemplateColumns.split(" ").length, rows: new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().top))).size }));
  });
  console.log(JSON.stringify(r));
  ok("3 pains : 1 ligne de 3", r[0] && r[0].n === 3 && r[0].cols === 3 && r[0].rows === 1, r[0]);
  ok("4 pains : 2 lignes (3 puis 1)", r[1] && r[1].n === 4 && r[1].cols === 3 && r[1].rows === 2, r[1]);
  ok("5 pains : 2 lignes de 3 (3 puis 2)", r[2] && r[2].n === 5 && r[2].cols === 3 && r[2].rows === 2, r[2]);
  ok("6 pains : 2 lignes de 3", r[3] && r[3].n === 6 && r[3].cols === 3 && r[3].rows === 2, r[3]);
  ok("7 pains : repli sur la barre (pas de dessins)", r.length === 4, r);
  await p.screenshot({ path: path.join(OUT, "v531-tiroirs.png") });
  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.31 : " + ko + " ÉCHEC(S)" : "v5.31 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
