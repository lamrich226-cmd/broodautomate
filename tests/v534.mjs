// Essais de la v5.30 — vraie appli dans Chromium, faux Supabase, données inventées.
//  1) badge « RS232 : déconnecté » caché quand le câble n'est pas branché
//  2) Alertes : filtre par machine (les compteurs suivent)
//  3) Alertes : « Supprimer » → Corbeille 30 jours (restaurer, effacer pour de bon, vider) ; effacement automatique après 30 jours
//  4) appli opérateur : ni Corbeille ni boutons de suppression ; les alertes supprimées n'y sont pas
// node v534.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v534");
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
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: now - 70 * 86400000 }, epoch: "essai534", thr48: true, orders: [], applied: [], missions: [],
    machines: [{ id: "FAS-531000001", num: 1, street: "Rue 1", city: "Bruxelles", region: "bxl", serial: "531000001", door: false, link: false, power: false, temp: 5, sels: [mk(11, 3), mk(15, 3), mk(19, 3), mk(21, 3), mk(25, 3), mk(29, 3), mk(31, 3), mk(35, 3), mk(39, 3), mk(41, 3), mk(45, 3), mk(49, 3), mk(51, 3), mk(55, 3), mk(59, 3), mk(61, 3), mk(65, 3), mk(69, 3)] }],
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
  await p.setViewportSize({ width: 390, height: 800 });
  await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(1000);
  const nb = await p.$$eval(".dash-sel [data-ss]", e => e.map(x => x.dataset.ss));
  ok("le menu du Dashboard propose 3 styles (languette, bloc, coin)", nb.join() === "tab,bloc,coin", nb);
  const info = () => p.evaluate(() => { const b = document.querySelector("#dash-body"), cw = document.querySelector(".mv-cw"), cn = cw.querySelector(".mv-cn"), c = cw.querySelector(".mv-c"), rc = c.getBoundingClientRect(), rn = cn.getBoundingClientRect(); return { cls: b.className, actif: document.querySelector(".dash-sel .active").dataset.ss, txt: cn.innerText.trim(), nSel: document.querySelectorAll(".mv-cn").length, dessous: rn.top >= rc.bottom - 1, gauche: rn.right <= rc.left + rc.width * 0.5 + 4 && Math.abs(rn.top - rc.top) < rc.height, dansCoin: rn.top >= rc.top - 1 && rn.top < rc.top + 12 && rn.left < rc.left + 12 }; });
  const sc = async nom => { await p.evaluate(() => document.querySelector(".toolbar").scrollIntoView({ block: "start" })); await sleep(300); await p.screenshot({ path: path.join(OUT, "tel-dashboard-" + nom + ".png") }); };
  let i = await info();
  ok("par défaut : languette sous la case, texte « Sel 11 »", i.cls === "ss-tab" && i.actif === "tab" && i.dessous && /^Sel\s*11$/.test(i.txt), i);
  await sc("languette");
  await p.click('.dash-sel [data-ss="bloc"]'); await sleep(500); i = await info();
  ok("style bloc : le numéro (11) est à gauche, dans le même rectangle", i.cls === "ss-bloc" && i.actif === "bloc" && i.gauche && i.txt === "11", i);
  await sc("bloc");
  await p.click('.dash-sel [data-ss="coin"]'); await sleep(500); i = await info();
  ok("style coin : « Sel 11 » est dans le coin de la case", i.cls === "ss-coin" && i.actif === "coin" && i.dansCoin && /^Sel\s*11$/.test(i.txt), i);
  await sc("coin");
  await p.reload(); await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(2500);
  await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(1000); i = await info();
  ok("le choix est gardé après rechargement", i.cls === "ss-coin" && i.actif === "coin", i);
  await p.click('.dash-sel [data-ss="tab"]'); await sleep(400);
  await p.evaluate(() => localStorage.setItem("ba_dash_layout", "list")); await p.evaluate(() => BA.Shell.go("dashboard")); await sleep(800);
  const vis = await p.evaluate(() => { const e = document.querySelector(".dash-sel"); return !e || getComputedStyle(e).display === "none"; });
  ok("en affichage « Liste » le menu de style est caché", vis);
  await p.evaluate(() => localStorage.setItem("ba_dash_layout", "cards"));
  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.32 : " + ko + " ÉCHEC(S)" : "v5.32 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
