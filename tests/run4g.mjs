// Essais de bout en bout des boîtiers 4G (Broodautomate v5.1) : vraie appli dans Chromium,
// faux Supabase, et la VRAIE fonction « ingest » (supabase/functions/ingest/index.ts) qui reçoit
// les envois du boîtier. node --experimental-strip-types run4g.mjs <site> <captures>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]);
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname);
const AUDIT = fs.readFileSync(process.env.BA_AUDIT || path.join(TESTS, "donnees", "AUDIT_FASTER_170824020354.dat")).toString("latin1").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
const NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": path.join(NM, "@supabase/supabase-js/dist/umd/supabase.js"),
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": path.join(NM, "chart.js/dist/chart.umd.js"),
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": path.join(NM, "xlsx/dist/xlsx.full.min.js")
};
const INGEST_TMP = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ba-ingest-")), "_ingest.ts");
const LIBTXT = {}; for (const [u, f] of Object.entries(LIB)) LIBTXT[u] = fs.readFileSync(f, "utf8");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ts": "text/plain; charset=utf-8", ".sql": "text/plain; charset=utf-8" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + srv.address().port + "/";

const fails = []; const errors = [];
const ok = (n, c, i) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (!c && i !== undefined ? "  → " + JSON.stringify(i).slice(0, 500) : "")); if (!c) fails.push(n); return !!c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;

// ---------------- données de la v3 ----------------
function v3Data() {
  return {
    machines: [
      { id: "FAS-202164170", name: "Gare du Midi", city: "Bruxelles", serial: "202164170", status: "online", temp_c: 16.4, last_seen: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "FAS-202166085", name: "Antwerpen Centraal", city: "Antwerpen", serial: "202166085", status: "unknown", temp_c: null, last_seen: null, created_at: "2026-01-02T00:00:00Z" }
    ],
    products: [
      { id: 1, machine_id: "FAS-202164170", selection: 11, name: "Pain blanc", price: 2.5, qty: 8, capacity: 10 },
      { id: 2, machine_id: "FAS-202164170", selection: 19, name: "Pain gris", price: 3.0, qty: 6, capacity: 10 },
      { id: 3, machine_id: "FAS-202166085", selection: 21, name: "Volkoren brood", price: 3.2, qty: 5, capacity: 8 }
    ],
    sales: []
  };
}
const fake = new FakeSupabase(Object.assign({ baState: [] }, v3Data()));
// v5.19 : tables des notifications (commandes SQL de la v5.9 déjà passées, comme sur le vrai Supabase)
fake.t.ba_notifications = []; fake.t.ba_push_tokens = [];

// ---------------- la vraie fonction « ingest », branchée sur le faux Supabase ----------------
function client() {
  const q = table => {
    const st = { filters: [], op: "select", vals: null };
    // v5.19 : aussi is / gt / in / upsert / select(…, { head }) (utilisés par les notifications d'ingest) :
    // avant, ces appels donnaient « … is not a function » dans la sortie des tests (sans faire échouer le test)
    const garde = (r, [c, v, k]) => k === "is" ? (v === null ? r[c] == null : r[c] === v) : k === "gt" ? String(r[c]) > String(v)
      : k === "in" ? v.map(String).includes(String(r[c])) : String(r[c]) === String(v);
    const run = () => {
      const tab = fake.t[table];
      if (!tab) return { data: null, error: { message: `relation "public.${table}" does not exist` } };
      const rows = tab.filter(r => st.filters.every(f => garde(r, f)));
      if (st.op === "select") return st.head ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null };
      if (st.op === "update") { rows.forEach(r => Object.assign(r, JSON.parse(JSON.stringify(st.vals)))); return { error: null }; }
      if (st.op === "insert") { tab.push(Object.assign({ id: ++fake.seq, received_at: new Date().toISOString() }, st.vals)); return { error: null }; }
      if (st.op === "upsert") {
        const ajoutes = [];
        [].concat(st.vals).forEach(v => { if (st.conflit && tab.some(r => r[st.conflit] === v[st.conflit])) return; const r = Object.assign({ id: ++fake.seq, cree_at: new Date().toISOString(), envoye_at: null }, v); tab.push(r); ajoutes.push(r); });
        return { data: ajoutes, error: null };
      }
      if (st.op === "delete") { fake.t[table] = tab.filter(r => !rows.includes(r)); return { error: null }; }
    };
    const api = {
      select(cols, o) { if (st.op !== "upsert") st.op = "select"; st.head = !!(o && o.head); return api; }, update(v) { st.op = "update"; st.vals = v; return api; },
      insert(v) { st.op = "insert"; st.vals = v; return Promise.resolve(run()); },
      upsert(v, o) { st.op = "upsert"; st.vals = v; st.conflit = o && o.onConflict; return api; },
      delete() { st.op = "delete"; return api; },
      eq(c, v) { st.filters.push([c, v]); return api; },
      is(c, v) { st.filters.push([c, v, "is"]); return api; }, gt(c, v) { st.filters.push([c, v, "gt"]); return api; },
      in(c, v) { st.filters.push([c, v, "in"]); return api; }, order() { return api; }, limit() { return api; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data ? r.data[0] || null : null, error: r.error || null }); },
      then(a, b) { return Promise.resolve(run()).then(a, b); }
    };
    return api;
  };
  return { from: q };
}
globalThis.__fake = { createClient: () => client() };
let ingest = null;
globalThis.Deno = { env: { get: k => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })[k] }, serve: h => { ingest = h; } };
fs.writeFileSync(INGEST_TMP, fs.readFileSync(path.join(ROOT, "supabase/functions/ingest/index.ts"), "utf8").replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";/m, "const { createClient } = globalThis.__fake;"));
await import(INGEST_TMP);
// le boîtier envoie (comme le firmware : JSON, octets non ASCII en \u00XX)
async function boitier(key, extra) {
  const body = Object.assign({ k: key, fw: "1.0", mode: 0, rssi: 21, op: "Proximus", st: "ok", stok: true, hb: 30, rd: 5, lu: 1, ko: 0 }, extra || {});
  const r = await ingest(new Request("https://x/functions/v1/ingest", { method: "POST", body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
}

// ---------------- navigateur ----------------
const browser = await chromium.launch();
async function device(name, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, locale: "fr-BE", timezoneId: "Europe/Brussels", permissions: ["clipboard-read", "clipboard-write"] }, opts));
  for (const u of Object.keys(LIBTXT)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: LIBTXT[u] }));
  await fake.attach(ctx, name);
  const d = { ctx, name, errs: [], http: [] };
  ctx.on("page", p => {
    p.on("pageerror", e => { d.errs.push(e.message); errors.push(name + ": " + e.message); });
    p.on("console", m => {
      if (m.type() !== "error") return;
      const t = m.text(), loc = (m.location() || {}).url || "";
      if (/supabase\.co/.test(loc) && /status of (400|404)/.test(t)) { d.http.push(loc); return; }
      d.errs.push(t); errors.push(name + ": " + t);
    });
  });
  return d;
}
async function open(d, file) { const p = await d.ctx.newPage(); await p.goto(URL0 + file); return p; }
async function login(p) { await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go"); }
const ready = p => p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
// v5.11 : barre latérale (PC) ou onglets du bas (téléphone) ; v5.12 : la gestion des boîtiers est dans la page Technique (onglet « Boîtiers 4G »)
const view = async (p, v) => {
  if (v === "technique") await p.evaluate(() => BA.Technique && BA.Technique.tab("boxes"));
  const b = [`#app-nav button[data-view='${v}']`, `#app-tabbar button[data-view='${v}']`];
  if (await p.isVisible(b[0])) await p.click(b[0]); else if (await p.isVisible(b[1])) await p.click(b[1]); else await p.evaluate(x => BA.Shell.go(x), v);
  await p.mouse.move(900, 300); await p.waitForSelector(`#view-${v}.active`); await sleep(450);
};   // v5.4 : la souris quitte le menu flottant
const synced = (p, ms) => p.waitForFunction(() => BA.Store.status().pending === 0 && BA.Store.status().sync === "ok", null, { timeout: ms || 20000 });
const ev = (p, f) => p.evaluate(f);
const qty = (p, num, sel) => p.evaluate(([n, s]) => { const m = BA.Store.get().machines.find(x => x.num === n); const x = m && BA.Model.sel(m, s); return x ? BA.Model.qty(x) : null; }, [num, sel]);
const salesToday = p => p.evaluate(() => { const d = BA.Store.get().daily[BA.Model.dayKey(Date.now())] || {}; return d[1] ? d[1].s : 0; });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
// relevé modifié : + n ventes sur la sélection 11 (comme une vraie machine) ; G85 recalculé dans la page
async function audit(p, txt, plus11, plus19) {
  return p.evaluate(([t, a, b]) => {
    let l = t.split("\r\n");
    const idx = q => l.findIndex(x => x.startsWith(q));
    const i = idx("VA1*"); const f = l[i].split("*");
    f[1] = String(+f[1] + 250 * a + 300 * b); f[2] = String(+f[2] + a + b); f[3] = String(+f[3] + 250 * a + 300 * b); f[4] = String(+f[4] + a + b); l[i] = f.join("*");
    const pa = (sel, n, cents) => { const j = idx("PA1*" + sel + "*"); const k = l.findIndex((x, y) => y > j && x.startsWith("PA2*")); const g = l[k].split("*"); g[1] = String(+g[1] + n); g[2] = String(+g[2] + cents); if (g[3]) g[3] = String(+g[3] + n); l[k] = g.join("*"); };
    if (a) pa(11, a, 250 * a); if (b) pa(19, b, 300 * b);
    const la = (sel, n) => { const j = idx("LA1*0*" + sel + "*"); const g = l[j].split("*"); g[4] = String(+g[4] + n); g[5] = String(+g[5] + n); l[j] = g.join("*"); };
    if (a) la(11, a); if (b) la(19, b);
    let s = l.join("\r\n");
    s = s.replace(/G85\*[0-9A-F]{4}/, "G85*" + BA.EvaDts.calculerG85(s));
    return s;
  }, [txt, plus11, plus19 || 0]);
}

try {
  console.log("== 1. Ouverture : boîtiers pas encore installés dans Supabase");
  const pc = await device("pc");
  const a = await open(pc, "index.html");
  await login(a); await ready(a);
  ok("pied de page : version 5.20.0", (await a.innerText("#app-footer")).includes("5.20.0"));
  await view(a, "technique");
  await a.waitForSelector("#rs-boitiers .alert.warn", { timeout: 15000 });
  ok("section « Boîtiers 4G » : pas encore installés + bouton des commandes SQL", (await a.innerText("#rs-boitiers")).includes("pas encore installés") && !!(await a.$("#rs-boitiers [data-bx=sql]")));
  await a.click("#rs-boitiers [data-bx=sql]");
  await a.waitForSelector(".dlg-modal .sql-steps");
  const codes = await a.$$eval(".dlg-modal .sql-steps code", l => l.map(x => x.textContent));
  const SQLFILE = fs.readFileSync(path.join(ROOT, "supabase/4g-boitiers.sql"), "utf8").split("\n").filter(l => l.trim() && !l.startsWith("--"));
  ok("17 commandes, une par ligne, identiques au fichier supabase/4g-boitiers.sql", codes.length === 17 && SQLFILE.length === 17 && codes.every((c, i) => c === SQLFILE[i]), [codes.length, SQLFILE.length]);
  ok("aucune commande refusée par l'éditeur de Supabase (pas de DO, pas de publication, une seule commande)", codes.every(c => !/\bdo\s+\$\$|publication/i.test(c) && c.trim().split(";").filter(x => x.trim()).length === 1));
  await a.click(".dlg-modal [data-copy-sql='0']");
  await sleep(200);
  ok("bouton « Copier » : commande 1 dans le presse-papiers", (await a.evaluate(() => navigator.clipboard.readText())) === codes[0]);
  await shot(a, "4g-01-commandes-sql");
  await (await a.$(".dlg-modal")).screenshot({ path: path.join(OUT, "z-sql.png") });
  fake.run4gSql();
  await a.click("#dlg-ok");
  try { await a.waitForSelector("#bx-add", { timeout: 15000 }); }
  catch (e) {
    console.log("DEBUG", JSON.stringify(await a.evaluate(() => ({ inst: BA.Boitiers.installed(), act: document.activeElement && (document.activeElement.tagName + "#" + document.activeElement.id), clk: BA.Shell.clicking && BA.Shell.clicking(), modal: !!document.querySelector(".modal-back"), html: (document.querySelector("#rs-boitiers") || {}).innerText }))));
    console.log("DEBUG fake", !!fake.t.devices, fake.requests.filter(r => /devices/.test(r.url)).map(r => r.status + " " + r.url).slice(-5));
    throw e;
  }
  ok("après les commandes : formulaire « Ajouter un boîtier »", true);
  ok("commandes 10 à 17 pas encore faites : message « Nouveau : bouton Lire maintenant »", (await a.innerText("#rs-boitiers")).includes("10 à 17"));

  console.log("\n== 2. Ajouter un boîtier : clé secrète, empreinte dans Supabase");
  await a.fill("#bx-name", "Boîtier Midi");
  await a.selectOption("#bx-machine", "FAS-202164170");
  await a.click("#bx-add");
  await a.waitForSelector("#bx-key-line");
  const line = await a.innerText("#bx-key-line");
  const key = (/"([0-9a-f]{32})"/.exec(line) || [])[1];
  ok("clé affichée une fois, prête pour config.h (#define DEVICE_KEY \"…\")", !!key && line.startsWith("#define DEVICE_KEY"), line);
  const dev = fake.t.devices[0];
  ok("Supabase : seulement l'empreinte SHA-256 de la clé, jamais la clé", dev && dev.key_hash === crypto.createHash("sha256").update(key).digest("hex") && !JSON.stringify(fake.t.devices).includes(key), dev);
  ok("boîtier rattaché à la machine #1", dev.machine_id === "FAS-202164170" && dev.name === "Boîtier Midi");
  await shot(a, "4g-02-cle-du-boitier");
  await (await a.$(".dlg-modal")).screenshot({ path: path.join(OUT, "z-cle.png") });
  await a.click("#dlg-ok");
  // v5.12 : une fois un boîtier ajouté, l'installation (commandes, fonction) est repliée en bas
  await a.click("#rs-boitiers details.bx-install > summary");
  await a.click("#rs-boitiers [data-bx=fn]");
  await a.waitForSelector("#bx-fn-code");
  ok("fenêtre « fonction ingest » : code complet + étapes (Verify JWT désactivé)", (await a.inputValue("#bx-fn-code")).includes("Deno.serve") && (await a.innerText(".dlg-modal")).includes("Verify JWT"));
  await a.click("#dlg-ok");

  console.log("\n== 3. Le boîtier envoie : signal de vie, premier relevé, ventes");
  let r = await boitier(key, { st: "démarrage", stok: false, premier: true });
  ok("signal de vie accepté par la fonction (200)", r.status === 200 && r.body.ok, r);
  r = await boitier("ffffffffffffffffffffffffffffffff", { raw: AUDIT });
  ok("mauvaise clé refusée (401), rien enregistré", r.status === 401 && fake.t.device_reports.length === 0, r);
  r = await boitier(key, { raw: AUDIT, role: "boitier", liste: 2, lu: 1 });
  ok("premier relevé reçu (device_reports)", r.status === 200 && fake.t.device_reports.length === 1, r);
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await synced(a);
  let m1 = await ev(a, () => { const m = BA.Store.get().machines.find(x => x.num === 1); return { g4: m.g4, online: m.online, lastSeen: m.lastSeen, ev: BA.Store.get().events.filter(e => e.num === 1).map(e => e.code + (e.resolved ? "-r" : "")) }; });
  ok("1er relevé = point de départ (alerte « Premier relevé », pas de vente)", m1.ev.includes("READ_FIRST-r") && (await salesToday(a)) === 0, m1.ev);
  ok("machine #1 en ligne par la 4G", m1.online === true && !!m1.lastSeen, m1);
  ok("relevé noté comme traité (machine.g4)", m1.g4 && m1.g4.rid === fake.t.device_reports[0].id && m1.g4.base === "r" + fake.t.device_reports[0].id, m1.g4);
  const q11 = await qty(a, 1, 11), q19 = await qty(a, 1, 19);
  const A2 = await audit(a, AUDIT, 3, 1);
  r = await boitier(key, { raw: A2, lu: 2 });
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await synced(a);
  ok("2e relevé : 4 ventes comptées (3 × sél. 11, 1 × sél. 19)", (await salesToday(a)) === 4, await salesToday(a));
  ok("stock : pris dans les lots (11 : −3, 19 : −1)", (await qty(a, 1, 11)) === q11 - 3 && (await qty(a, 1, 19)) === q19 - 1, [q11, await qty(a, 1, 11), q19, await qty(a, 1, 19)]);
  ok("table audits : relevé 4G gardé (source 4g, +4 ventes)", fake.t.audits.some(x => x.source === "4g" && x.delta_count === 4), fake.t.audits.map(x => x.source + ":" + x.delta_count));
  // le même relevé reçu deux fois (réponse perdue, le boîtier renvoie)
  r = await boitier(key, { raw: A2, lu: 3 });
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await synced(a);
  ok("même relevé reçu 2 fois : aucune vente en plus", (await salesToday(a)) === 4, await salesToday(a));

  console.log("\n== 4. PC et téléphone ouverts en même temps : jamais de double comptage");
  const tel = await device("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const o = await open(tel, "operateur.html");
  await login(o); await ready(o);
  await o.waitForFunction(() => BA.Boitiers && BA.Boitiers.installed() === true, null, { timeout: 15000 });
  const A3 = await audit(a, A2, 2, 0);
  await boitier(key, { raw: A3, lu: 4 });
  const A4 = await audit(a, A3, 1, 0);
  await boitier(key, { raw: A4, lu: 5 });
  await Promise.all([a.evaluate(() => BA.Boitiers.refresh(true)), o.evaluate(() => BA.Boitiers.refresh(true))]);
  await Promise.all([synced(a, 30000), synced(o, 30000)]);
  await sleep(1500);
  await Promise.all([a.evaluate(() => BA.Store.pull()), o.evaluate(() => BA.Store.pull())]);
  await sleep(500);
  const sA = await salesToday(a), sO = await salesToday(o);
  ok("relevés traités en même temps par le PC et le téléphone : 4 + 3 = 7 ventes, pas plus", sA === 7 && sO === 7, [sA, sO]);
  ok("stock sél. 11 identique sur les deux appareils (−6 en tout)", (await qty(a, 1, 11)) === q11 - 6 && (await qty(o, 1, 11)) === q11 - 6, [await qty(a, 1, 11), await qty(o, 1, 11)]);
  await o.evaluate(() => BA.Boitiers.refresh(true));
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await synced(a); await synced(o);
  ok("nouveau passage : toujours 7 ventes", (await salesToday(a)) === 7, await salesToday(a));

  console.log("\n== 5. Relevé abîmé, envoi de la machine (télémétrie), câble après la 4G");
  const bad = A4.replace(/VA1\*(\d+)/, (x, v) => "VA1*" + (Number(v) + 999));
  await boitier(key, { raw: bad, lu: 6 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  let evs = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1).map(e => e.code + (e.resolved ? "-r" : "")));
  ok("relevé abîmé (G85 faux) : alerte « Relevé abîmé », aucune vente", evs.includes("READ_BAD") && (await salesToday(a)) === 7, evs);
  const A5 = await audit(a, A4, 1, 0);
  await boitier(key, { raw: A5, lu: 7 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  evs = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1 && e.code === "READ_BAD" && !e.resolved).length);
  ok("relevé suivant correct : +1 vente (comparé au dernier bon relevé), alerte réglée", (await salesToday(a)) === 8 && evs === 0, [await salesToday(a), evs]);
  const pad = n => String(n).padStart(2, "0"), d = new Date();
  const ds = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()), hs = pad(d.getHours()) + pad(d.getMinutes());
  let push = "DXS*FAS000000001*VA*V1/6*1\r\nST*001*0001\r\nEA1*ELA_19*" + ds + "*" + hs + "***+120\r\nEA2*ELA_19****1\r\nG85*0000\r\nSE*5*001*0001\r\nDXE*1*1\r\n";
  push = push.replace("G85*0000", "G85*" + await a.evaluate(t => BA.EvaDts.calculerG85(t), push));
  await boitier(key, { raw: push, role: "machine" });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  evs = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1 && e.code === "MACHINE_EVENT").map(e => e.data.code));
  ok("envoi de la machine (événement ELA_19) : alerte avec titre et explication", evs.includes("ELA_19"), evs);
  ok("table device_reports : rôle « machine » gardé", fake.t.device_reports.some(x => x.role === "machine"));
  // boîtier déplacé sur une autre machine sans le dire : le n° de la machine dans le relevé ne correspond pas
  const regen = async t => t.replace(/G85\*[0-9A-F]{4}/, "G85*" + await a.evaluate(x => BA.EvaDts.calculerG85(x), t));
  const autre = await regen((await audit(a, A5, 5, 0)).replace(/FAS000000001/g, "FAS202166085"));
  await boitier(key, { raw: autre, lu: 8 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  evs = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1 && e.code === "BOX_WRONG" && !e.resolved).length);
  ok("relevé d'une AUTRE machine (n° FAS202166085) : rien compté, alerte « relevé d'une autre machine »", evs === 1 && (await salesToday(a)) === 8, [evs, await salesToday(a)]);
  const bon = await regen((await audit(a, A5, 1, 0)).replace(/FAS000000001/g, "FAS202164170"));
  await boitier(key, { raw: bon, lu: 9 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  evs = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1 && e.code === "BOX_WRONG" && !e.resolved).length);
  ok("relevé suivant de la bonne machine : +1 vente (depuis le dernier bon relevé), alerte réglée", (await salesToday(a)) === 9 && evs === 0, [await salesToday(a), evs]);

  console.log("\n== 6. Boîtier muet, lecture impossible, en ligne sans nouveau relevé");
  // le boîtier ne répond plus depuis 3 h
  fake.t.devices[0].last_seen = new Date(Date.now() - 3 * 3600000).toISOString();
  await a.evaluate(() => BA.Store.update(s => { const m = s.machines.find(x => x.num === 1); m.lastSeen = Date.now() - 3 * 3600000; }));
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  let st1 = await ev(a, () => { const s = BA.Store.get(); const m = s.machines.find(x => x.num === 1); return { online: m.online, ev: s.events.filter(e => e.num === 1 && !e.resolved).map(e => e.code) }; });
  ok("boîtier muet depuis 3 h : machine hors ligne + alerte « Boîtier 4G muet »", st1.online === false && st1.ev.includes("BOX_SILENT"), st1);
  await boitier(key, { st: "La machine ne répond pas (10 START sans réponse).", stok: false, lu: 9, ko: 1 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  st1 = await ev(a, () => { const s = BA.Store.get(); const m = s.machines.find(x => x.num === 1); return { online: m.online, ev: s.events.filter(e => e.num === 1 && !e.resolved).map(e => e.code) }; });
  ok("signal de vie : « muet » réglé ; le boîtier répond mais ne lit pas la machine → machine hors ligne (v5.11)", st1.online === false && !st1.ev.includes("BOX_SILENT"), st1);
  ok("le boîtier dit que la machine ne répond pas : alerte « lecture impossible »", st1.ev.includes("BOX_FAIL"), st1);
  await view(a, "alerts");
  const txt = await a.innerText("#view-alerts");
  ok("page Alertes : titre + explication du boîtier", txt.includes("Boîtier 4G : lecture de la machine impossible") && txt.includes("La machine ne répond pas"), txt.slice(0, 300));
  await shot(a, "4g-03-alertes");
  await a.screenshot({ path: path.join(OUT, "z-alertes.png") });
  await boitier(key, { st: "ok", stok: true, lu: 10 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  st1 = await ev(a, () => BA.Store.get().events.filter(e => e.num === 1 && !e.resolved).map(e => e.code));
  ok("lecture de nouveau bonne : alerte réglée", !st1.includes("BOX_FAIL"), st1);
  await a.waitForFunction(() => BA.Store.get().machines.find(x => x.num === 1).online === true, null, { timeout: 5000 }).catch(() => {});
  ok("lecture de nouveau bonne : machine en ligne (le boîtier la lit)", await a.evaluate(() => BA.Store.get().machines.find(x => x.num === 1).online === true));

  console.log("\n== 7. Affichage (Dashboard, onglet RS232, téléphone, langues)");
  await view(a, "dashboard");
  const dash = await a.innerText("#view-dashboard");
  ok("Dashboard : « 📡 4G hh:mm » sur la carte de la machine", /📡 4G \d\d:\d\d/.test(dash), dash.slice(0, 400));
  await (await a.$("#view-dashboard .carte-machine")).screenshot({ path: path.join(OUT, "z-carte.png") });
  await view(a, "technique");
  await a.waitForSelector(".bx-table");
  const tab = await a.innerText("#rs-boitiers");
  ok("liste des boîtiers : nom, en ligne, signal, état, version", tab.includes("Boîtier Midi") && tab.includes("En ligne") && /excellent \(21\/31\)/.test(tab) && tab.includes("v1.0"), tab.slice(0, 400));
  await shot(a, "4g-04-onglet-boitiers");
  await (await a.$("#rs-boitiers")).screenshot({ path: path.join(OUT, "z-section.png") });
  // v5.12 : la page « Connexion RS232 » ne montre plus que les boîtiers et leur état
  await view(a, "rs232");
  await a.waitForSelector("#view-rs232 .bx-sum-list", { timeout: 15000 });
  const sumTxt = await a.innerText("#view-rs232");
  ok("page Connexion RS232 : le boîtier, « En ligne : 1 », machine lue, sans câble ni commandes", sumTxt.includes("Boîtier Midi") && /En ligne\s*1/i.test(sumTxt) && /Machine lue/.test(sumTxt) && !(await a.$("#view-rs232 #btn-rs-connecter")) && !(await a.$("#view-rs232 [data-bx=sql]")), sumTxt.slice(0, 500));
  await shot(a, "4g-04b-connexion-rs232");
  await o.evaluate(() => BA.Boitiers.refresh(true));
  await view(o, "rs232");
  ok("téléphone (onglet Connexion) : 📡 4G sur la machine", /📡|4G/.test(await o.innerText("#view-rs232")));
  await shot(o, "4g-05-telephone");
  for (const lang of ["nl", "en"]) {
    await a.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build ? BA.Shell.build() : null; }, lang);
    await view(a, "technique"); await sleep(300);
    const raw = await a.evaluate(() => { const k = new Set(Object.keys(BA.I18n.dicts.fr)); return (document.body.innerText.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).filter(w => k.has(w) || /^bx_/.test(w)); });
    ok("langue " + lang + " : section boîtiers sans texte manquant", raw.length === 0, raw);
  }
  await a.evaluate(() => { BA.I18n.set("fr", "admin"); if (BA.Shell.build) BA.Shell.build(); });

  console.log("\n== 7b. Bouton « Lire maintenant » (commandes SQL 10 à 17, programme v1.1)");
  const rpc = (k, fait, okv, msg) => fake.boitierRpc(k, fait || 0, okv !== false, msg || "").body;
  await view(a, "technique"); await a.waitForSelector(".bx-table");
  let sec = await a.innerText("#rs-boitiers");
  ok("avant les commandes 10 à 17 : pas de bouton, message pour les installer", sec.includes("10 à 17") && !(await a.$("button[data-bxread]")), sec.slice(0, 300));
  ok("boîtier sans la fonction : réponse 404 (le boîtier l'écrit dans le Moniteur série)", fake.boitierRpc(key).status === 404);
  await a.click("#rs-boitiers .alert [data-bx=sql]");
  await a.waitForSelector(".dlg-modal .sql-steps");
  const idxNew = await a.$$eval(".dlg-modal .sql-steps li", l => l.findIndex(x => !!x.querySelector(".bx-new")));
  ok("fenêtre des commandes SQL : « 🆕 Nouveau » devant la commande 10 + explication", idxNew === 9 && (await a.innerText(".dlg-modal")).includes("commence directement à la 10"), idxNew);
  await (await a.$(".dlg-modal")).screenshot({ path: path.join(OUT, "z-sql-17.png") });
  fake.runDemandesSql();
  await a.click("#dlg-ok");
  await a.waitForFunction(() => BA.Boitiers.demInstalled() === true, null, { timeout: 15000 });
  await a.waitForFunction(() => /\(v1\.1\)/.test((document.querySelector("#rs-boitiers") || {}).innerText || ""), null, { timeout: 15000 }).catch(() => {});
  sec = await a.innerText("#rs-boitiers");
  ok("boîtier avec l'ancien programme (v1.0) : « mets à jour le programme du boîtier (v1.1) » au lieu du bouton", sec.includes("(v1.1)") && !(await a.$("button[data-bxread]")), sec.slice(0, 500));
  await boitier(key, { fw: "1.1", lu: 11 });
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await a.waitForSelector("button[data-bxread]:not([disabled])", { timeout: 15000 });
  ok("programme v1.1, boîtier en ligne : bouton « 📡 Lire maintenant » actif", (await a.innerText("button[data-bxread]")).includes("Lire maintenant"));
  // v5.10 : délai de « Lire maintenant » réglable à distance (15 min, 30 min, 1 h)
  ok("réglage « Lire maintenant » affiché, pas encore réglé (2 min)", !!(await a.$("#bx-ec")) && (await a.$eval("#bx-ec", x => x.value)) === "" && /2 min \(pas encore réglé\)/.test(await a.innerText("#bx-ec")));
  ok("pas encore réglé : ba_boitier donne ec = 0 (le boîtier garde son délai)", rpc(key).ec === 0);
  await a.selectOption("#bx-ec", "15");
  await a.waitForFunction(() => BA.Store.get().settings.ecouteMin === 15, null, { timeout: 10000 });
  await synced(a);
  ok("réglé sur 15 min : transmis aux boîtiers (ec = 900)", rpc(key).ec === 900, rpc(key));
  ok("bouton : « 15 min au plus »", /15 min au plus/.test(await a.getAttribute("button[data-bxread]", "title")), await a.getAttribute("button[data-bxread]", "title"));
  await boitier(key, { fw: "1.2", ec: 900, lu: 11 });
  await a.evaluate(() => BA.Boitiers.refresh(true));
  await a.waitForFunction(() => /écoute toutes les 15 min/.test((document.querySelector(".bx-table") || {}).innerText || ""), null, { timeout: 15000 }).catch(() => {});
  ok("liste des boîtiers : « écoute toutes les 15 min » (le boîtier a reçu le réglage)", /écoute toutes les 15 min/.test(await a.innerText(".bx-table")));
  await (await a.$("#rs-boitiers .bx-ecoute")).screenshot({ path: path.join(OUT, "z-reglage-ecoute.png") });
  await a.selectOption("#bx-ec", "60"); await synced(a);
  ok("réglé sur 1 h : ec = 3600", rpc(key).ec === 3600);
  await a.selectOption("#bx-ec", "15"); await synced(a);
  const avant = await salesToday(a);
  await a.click("button[data-bxread]");
  await sleep(1000);
  const dm = (fake.t.ba_demandes || [])[0];
  ok("clic : demande enregistrée (attente, bon boîtier, bonne machine)", dm && dm.statut === "attente" && dm.device_id === fake.t.devices[0].id && dm.machine_id === "FAS-202164170", dm);
  sec = await a.innerText("#rs-boitiers");
  ok("affichage : « Demande envoyée à hh:mm » + bouton désactivé", /Demande envoyée à \d\d:\d\d/.test(sec) && !!(await a.$("button[data-bxread][disabled]")), sec.slice(0, 600));
  await shot(a, "4g-06-lire-maintenant");
  await (await a.$("#rs-boitiers .bx-table")).screenshot({ path: path.join(OUT, "z-lire-attente.png") });
  await a.evaluate(id => BA.Boitiers.readNow(id), fake.t.devices[0].id);
  await sleep(300);
  ok("2e demande pendant la première : refusée (une seule à la fois)", fake.t.ba_demandes.length === 1, fake.t.ba_demandes.length);
  let r1 = rpc("ffffffffffffffffffffffffffffffff");
  ok("fonction ba_boitier, mauvaise clé : ok false, aucune demande donnée", r1.ok === false && r1.dem === 0 && fake.t.ba_demandes[0].statut === "attente", r1);
  r1 = rpc(key);
  ok("le boîtier (passage toutes les 2 min) reçoit la demande → « prise »", r1.ok && r1.dem === dm.id && fake.t.ba_demandes[0].statut === "prise", r1);
  ok("passage suivant : rien de plus", rpc(key).dem === 0);
  await a.waitForFunction(() => /lit la machine/.test(document.querySelector("#rs-boitiers").innerText), null, { timeout: 20000 });
  ok("l'appli suit la demande toute seule (10 s) : « Le boîtier lit la machine… »", true);
  const A6 = await audit(a, bon, 2, 0);
  await boitier(key, { raw: A6, fw: "1.1", lu: 12 });
  r1 = rpc(key, dm.id, true, "");
  ok("le boîtier envoie le relevé puis annonce la lecture faite", r1.fait === 1 && fake.t.ba_demandes[0].statut === "faite", r1);
  let vu = true;
  try { await a.waitForFunction(n => { const d = BA.Store.get().daily[BA.Model.dayKey(Date.now())] || {}; return !!d[1] && d[1].s === n; }, avant + 2, { timeout: 25000 }); } catch (e) { vu = false; }
  const toastTxt = await a.evaluate(() => document.body.innerText);
  ok("sans rien toucher : l'appli voit la demande faite, compte les 2 ventes, et le dit", vu && /lecture reçue/.test(toastTxt), [vu, await salesToday(a)]);
  await sleep(300);
  sec = await a.innerText("#rs-boitiers");
  ok("affichage : « ✅ Lue à hh:mm » + bouton de nouveau actif", /Lue à \d\d:\d\d/.test(sec) && !!(await a.$("button[data-bxread]:not([disabled])")), sec.slice(0, 600));
  await (await a.$("#rs-boitiers .bx-table")).screenshot({ path: path.join(OUT, "z-lire-faite.png") });
  // page Détails : même bouton ; échec annoncé par le boîtier (accents envoyés en \u00XX, comme le boîtier)
  await view(a, "details");
  await a.waitForSelector("#view-details .bx-detail button[data-bxread]", { timeout: 10000 });
  ok("page Détails : boîtier, dernier contact, bouton « Lire maintenant », dernière lecture", /Boîtier Midi/.test(await a.innerText("#view-details .bx-detail")) && /Lue à/.test(await a.innerText("#view-details .bx-detail")));
  await a.click("#view-details button[data-bxread]");
  await sleep(1000);
  const dm2 = fake.t.ba_demandes[fake.t.ba_demandes.length - 1];
  ok("clic dans Détails : 2e demande", fake.t.ba_demandes.length === 2 && dm2.statut === "attente", fake.t.ba_demandes.map(x => x.statut));
  rpc(key);
  rpc(key, dm2.id, false, "La machine ne r\u00c3\u00a9pond pas (10 START sans r\u00c3\u00a9ponse).");
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);
  let det = await a.innerText("#view-details .bx-detail");
  ok("échec : « Lecture impossible (hh:mm) : La machine ne répond pas… » (accents corrects)", /Lecture impossible \(\d\d:\d\d\) : La machine ne répond pas/.test(det), det);
  await (await a.$("#view-details .bx-detail")).screenshot({ path: path.join(OUT, "z-lire-details.png") });
  // demande restée sans réponse plus de 10 min
  fake.t.ba_demandes.push({ id: 9001, device_id: fake.t.devices[0].id, machine_id: "FAS-202164170", statut: "attente", message: null, cree_at: new Date(Date.now() - 11 * 60000).toISOString(), prise_at: null, fini_at: null });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);
  det = await a.innerText("#view-details .bx-detail");
  ok("sans réponse depuis plus de 10 min : « Pas de réponse du boîtier depuis hh:mm » et bouton de nouveau actif", /Pas de réponse du boîtier depuis \d\d:\d\d/.test(det) && !!(await a.$("#view-details button[data-bxread]:not([disabled])")), det);
  // boîtier hors ligne : bouton désactivé
  fake.t.devices[0].last_seen = new Date(Date.now() - 3 * 3600000).toISOString();
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(500);
  ok("boîtier hors ligne : bouton désactivé (il ne verrait pas la demande)", !!(await a.$("#view-details button[data-bxread][disabled]")));
  await boitier(key, { fw: "1.1", lu: 13 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(300);
  ok("téléphone de l'opérateur : pas de bouton « Lire maintenant »", !(await o.$("button[data-bxread]")));

  console.log("\n== 7c. Envois de la machine (télémétrie) : partiels ignorés pour les ventes, complets comptés");
  const avant2 = await salesToday(a);
  const base0 = await ev(a, () => BA.Store.get().machines.find(x => x.num === 1).g4.base);
  const plein1 = await audit(a, A6, 1, 0);
  const partiel = await a.evaluate(t => {
    const out = []; let keep = true;
    for (const x of t.split("\r\n")) {
      if (x.startsWith("PA1*")) keep = x.startsWith("PA1*11*");
      else if (!x.startsWith("PA")) keep = true;
      if (x.startsWith("PA") && !keep) continue;
      if (x.startsWith("LA1*") && !x.startsWith("LA1*0*11*")) continue;
      out.push(x);
    }
    let s = out.join("\r\n");
    return s.replace(/G85\*[0-9A-F]{4}/, "G85*" + BA.EvaDts.calculerG85(s));
  }, plein1);
  const info = await a.evaluate(([p, f]) => { const ap = BA.EvaDts.parse(p), af = BA.EvaDts.parse(f); return { type: ap.type, n: BA.EvaDts.toAudit(ap).selections.length, nf: BA.EvaDts.toAudit(af).selections.length, g85: ap.g85.ok }; }, [partiel, plein1]);
  ok("(essai) relevé partiel : compteurs VA1 + une seule sélection", info.type === "audit" && info.n === 1 && info.nf > 1 && info.g85, info);
  await boitier(key, { raw: partiel, role: "machine", fw: "1.1" });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  const base1 = await ev(a, () => BA.Store.get().machines.find(x => x.num === 1).g4.base);
  ok("envoi PARTIEL de la machine : aucune vente comptée, relevé de départ inchangé", (await salesToday(a)) === avant2 && base1 === base0, [await salesToday(a), avant2, base0, base1]);
  await boitier(key, { raw: plein1, fw: "1.1" });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  ok("lecture complète du boîtier juste après : +1 vente exactement (pas de fausses ventes)", (await salesToday(a)) === avant2 + 1, [await salesToday(a), avant2]);
  const plein2 = await audit(a, plein1, 0, 1);
  await boitier(key, { raw: plein2, role: "machine", fw: "1.1" });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await synced(a);
  ok("envoi COMPLET de la machine (toutes les sélections) : +1 vente comptée tout de suite", (await salesToday(a)) === avant2 + 2, [await salesToday(a), avant2]);
  for (const lang of ["nl", "en"]) {
    await a.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build ? BA.Shell.build() : null; }, lang);
    for (const v of ["technique", "details"]) {
      await view(a, v); await sleep(300);
      const raw = await a.evaluate(() => { const k = new Set(Object.keys(BA.I18n.dicts.fr)); return (document.body.innerText.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).filter(w => k.has(w) || /^bx_/.test(w)); });
      ok("langue " + lang + ", " + v + " : « Lire maintenant » sans texte manquant", raw.length === 0 && !!(await a.$("button[data-bxread]")), raw);
    }
  }
  await a.evaluate(() => { BA.I18n.set("fr", "admin"); if (BA.Shell.build) BA.Shell.build(); });

  console.log("\n== 7d. « Lire toutes les machines » (Commander, Dashboard, Boîtiers 4G)");
  const toasts = async p => p.evaluate(() => (window.__toasts || []).slice());
  const spyToasts = p => p.evaluate(() => { window.__toasts = []; if (!BA.UI.__spy) { const f = BA.UI.toast; BA.UI.toast = (x, ms) => { window.__toasts.push(x); return f(x, ms); }; BA.UI.__spy = true; } });
  // 2e boîtier, sur la machine #2, encore avec l'ancien programme (v1.0)
  await view(a, "technique"); await a.waitForSelector("#bx-add");
  await a.fill("#bx-name", "Boîtier Anvers");
  await a.selectOption("#bx-machine", "FAS-202166085");
  await a.click("#bx-add");
  await a.waitForSelector("#bx-key-line");
  const keyB = (/"([0-9a-f]{32})"/.exec(await a.innerText("#bx-key-line")) || [])[1];
  await a.click("#dlg-ok");
  const devB = fake.t.devices.find(d => d.machine_id === "FAS-202166085");
  await boitier(keyB, { fw: "1.0", lu: 1 });
  await boitier(key, { fw: "1.1", lu: 14 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(300);
  ok("(essai) 2 boîtiers : A v1.1 sur la machine #1, B v1.0 sur la machine #2", !!keyB && !!devB && fake.t.devices.length === 2, fake.t.devices.map(d => d.machine_id));
  await a.waitForSelector("#rs-boitiers .bx-all button[data-bxreadall]", { timeout: 10000 });
  ok("onglet Boîtiers 4G : bouton « Lire toutes les machines »", /Lire toutes les machines/.test(await a.innerText("#rs-boitiers .bx-all")));
  await view(a, "dashboard");
  await a.waitForSelector("#dash-bx .bx-all button[data-bxreadall]:not([disabled])", { timeout: 10000 });
  ok("Dashboard : carte « Avant une commande : lis toutes les machines » + bouton actif", /Avant une commande/.test(await a.innerText("#dash-bx")));
  await shot(a, "4g-07-dashboard-lire-tout");
  await view(a, "order");
  await a.waitForSelector("#view-order .bx-all button[data-bxreadall]:not([disabled])", { timeout: 10000 });
  let card = await a.innerText("#view-order .bx-all");
  ok("Commander : carte en haut, « 1 sur 2 machines lues il y a moins de 15 min » (#2 jamais lue)", /Avant une commande/.test(card) && /1 sur 2 machines lues il y a moins de 15 min/.test(card), card);
  await (await a.$("#view-order .bx-all")).screenshot({ path: path.join(OUT, "z-lire-tout-avant.png") });
  await spyToasts(a);
  const nDem0 = fake.t.ba_demandes.length, avant3 = await salesToday(a);
  await a.click("#view-order button[data-bxreadall]");
  await sleep(1000);
  const lot1 = fake.t.ba_demandes.slice(nDem0);
  ok("clic : une demande pour le boîtier A (v1.1, en ligne), aucune pour B (v1.0)", lot1.length === 1 && lot1[0].device_id === fake.t.devices[0].id && lot1[0].statut === "attente", lot1);
  card = await a.innerText("#view-order .bx-all");
  ok("carte : « Lecture en cours : 0 sur 1 machine… » + bouton désactivé + message « Demande envoyée à 1 boîtier »", /Lecture en cours : 0 sur 1 machine…/.test(card) && !!(await a.$("#view-order button[data-bxreadall][disabled]")) && (await toasts(a)).some(x => /Demande envoyée à 1 boîtier :/.test(x)), [card, await toasts(a)]);
  await (await a.$("#view-order .bx-all")).screenshot({ path: path.join(OUT, "z-lire-tout-en-cours.png") });
  await a.evaluate(() => BA.Boitiers.readAll()); await sleep(300);
  ok("2e clic pendant la lecture : rien de plus (une lecture à la fois)", fake.t.ba_demandes.length === nDem0 + 1, fake.t.ba_demandes.length);
  r1 = rpc(key);
  ok("le boîtier A prend la demande", r1.dem === lot1[0].id, r1);
  const A7 = await audit(a, plein2, 1, 0);
  await boitier(key, { raw: A7, fw: "1.1", lu: 15 });
  rpc(key, lot1[0].id, true, "");
  await a.waitForFunction(() => /Lecture terminée/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 30000 });
  card = await a.innerText("#view-order .bx-all");
  ok("fin, toute seule : « Lecture terminée à hh:mm : 1 sur 2 machines lues » + #2 pas lue (programme à mettre à jour, jamais lue)", /Lecture terminée à \d\d:\d\d : 1 sur 2 machines lues/.test(card) && /#2[^\n]*programme du boîtier à mettre à jour · dernière lecture : jamais/.test(card), card);
  ok("la vente est déjà comptée quand la carte dit « terminée » (stock à jour)", (await salesToday(a)) === avant3 + 1, [await salesToday(a), avant3]);
  let tt = await toasts(a);
  ok("un seul message à la fin (« ⚠️ Lecture terminée… 1 sur 2 »), pas de « lecture reçue » boîtier par boîtier", tt.filter(x => /Lecture terminée/.test(x)).length === 1 && tt.some(x => /^⚠️ Lecture terminée à \d\d:\d\d : 1 sur 2 machines lues/.test(x)) && !tt.some(x => /lecture reçue/.test(x)), tt);
  await (await a.$("#view-order .bx-all")).screenshot({ path: path.join(OUT, "z-lire-tout-fini.png") });
  // commande calculée AVANT la lecture suivante : la carte dit de la recalculer
  await a.click("[data-q=q1][data-v='1']");
  await a.click("[data-q=q2][data-v='0']");
  await a.click("#calc");
  await a.waitForSelector("#fc-calc", { timeout: 10000 });
  if (await a.$("#fc-all")) await a.click("#fc-all");
  await a.waitForSelector("#fc-calc:not([disabled])", { timeout: 10000 });
  await a.click("#fc-calc");
  await a.waitForSelector("#send", { timeout: 10000 });
  ok("commande calculée : la carte de lecture est toujours en haut", !!(await a.$("#view-order .bx-all [data-bxreadall]")) && Number(await a.getAttribute("#view-order [data-bxall]", "data-bxall")) > 0);
  // B passe au programme v1.1 → « Relire toutes les machines » : 2 demandes écrites ensemble
  await boitier(keyB, { fw: "1.1", lu: 2 });
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(300);
  await spyToasts(a);
  const nDem1 = fake.t.ba_demandes.length;
  await a.waitForSelector("#view-order button[data-bxreadall]:not([disabled])", { timeout: 10000 });
  ok("bouton « Relire toutes les machines » après une lecture", /Relire toutes les machines/.test(await a.innerText("#view-order button[data-bxreadall]")));
  await a.click("#view-order button[data-bxreadall]");
  await sleep(1000);
  const lot2 = fake.t.ba_demandes.slice(nDem1);
  ok("2 demandes (A et B), écrites en une fois", lot2.length === 2 && new Set(lot2.map(x => x.device_id)).size === 2 && lot2[0].cree_at === lot2[1].cree_at, lot2);
  // un autre onglet ouvert pendant la lecture : il reprend la lecture en cours
  const a2 = await open(pc, "index.html");
  await a2.waitForSelector("#login-email, #app-nav button", { timeout: 40000 });
  if (await a2.$("#login-email")) await login(a2);
  await ready(a2);
  await view(a2, "order");
  let vu2 = true;
  try { await a2.waitForFunction(() => /Lecture en cours : 0 sur 2 machines/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 20000 }); } catch (e) { vu2 = false; }
  ok("autre onglet (ou PC + téléphone de l'admin) : « Lecture en cours : 0 sur 2 machines » repris", vu2, vu2 ? "" : await a2.innerText("#view-order").catch(() => "?"));
  // A : lecture faite (rien de vendu) ; B : prise puis plus de réponse (plus de 10 min)
  rpc(key); rpc(keyB);
  await a.waitForFunction(() => /0 sur 2 machines/.test((document.querySelector("#view-order .bx-all") || {}).innerText || "") && /lit la machine/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 20000 }).catch(() => {});
  await boitier(key, { raw: A7, fw: "1.1", lu: 16 });
  rpc(key, lot2.find(x => x.device_id === fake.t.devices[0].id).id, true, "");
  await a.waitForFunction(() => /1 sur 2 machines/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 25000 }).catch(() => {});
  card = await a.innerText("#view-order .bx-all");
  ok("A lue, B en cours : « Lecture en cours : 1 sur 2 machines… »", /Lecture en cours : 1 sur 2 machines…/.test(card), card);
  fake.t.ba_demandes.find(x => x.device_id === devB.id && x.id === lot2.find(y => y.device_id === devB.id).id).cree_at = new Date(Date.now() - 11 * 60000).toISOString();
  await a.waitForFunction(() => /Lecture terminée/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 30000 });
  card = await a.innerText("#view-order .bx-all");
  ok("B sans réponse : « Lecture terminée … 1 sur 2 » + « #2 … pas de réponse du boîtier »", /Lecture terminée à \d\d:\d\d : 1 sur 2 machines lues/.test(card) && /#2[^\n]*pas de réponse du boîtier/.test(card), card);
  ok("commande calculée avant cette lecture : « clique de nouveau sur « Calculer la commande » »", /calculée avant cette lecture : clique de nouveau sur « Calculer la commande »/.test(card), card);
  await a.click("#view-order .bx-all-list summary"); await sleep(200);
  card = await a.innerText("#view-order .bx-all");
  ok("« Détail par machine » : #1 lue à hh:mm, #2 pas de réponse", /#1[^\n]*Lue à \d\d:\d\d/.test(card) && /#2[^\n]*pas de réponse du boîtier/.test(card), card);
  await (await a.$("#view-order .bx-all")).screenshot({ path: path.join(OUT, "z-lire-tout-recalculer.png") });
  await shot(a, "4g-08-commander-lire-tout");
  await a.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  await (await a.$("#view-order .bx-all")).screenshot({ path: path.join(OUT, "z-lire-tout-telephone.png") });
  const tient = await a.evaluate(() => { const r = document.querySelector("#view-order .bx-all").getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; });
  ok("largeur téléphone (390 px) : la carte tient dans l'écran", tient);
  await a.setViewportSize({ width: 1280, height: 900 }); await sleep(300);
  await a.waitForFunction(() => /Lecture terminée/.test((document.querySelector("#view-order .bx-all") || {}).innerText || ""), null, { timeout: 20000 }).catch(() => {});
  ok("l'autre onglet voit aussi la fin", /Lecture terminée à \d\d:\d\d : 1 sur 2 machines lues/.test(await a2.innerText("#view-order .bx-all").catch(() => "")), await a2.innerText("#view-order .bx-all").catch(() => "?"));
  await a2.close();
  await a.click("#fc-calc").catch(() => {});
  await sleep(500);
  ok("commande recalculée : plus d'avertissement", !/calculée avant cette lecture/.test(await a.innerText("#view-order .bx-all")));
  ok("téléphone de l'opérateur : pas de bouton « Lire toutes les machines »", !(await o.$("[data-bxreadall]")));
  for (const lang of ["nl", "en"]) {
    await a.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build ? BA.Shell.build() : null; }, lang);
    for (const v of ["order", "dashboard", "technique"]) {
      await view(a, v); await sleep(300);
      const raw = await a.evaluate(() => { const k = new Set(Object.keys(BA.I18n.dicts.fr)); return (document.body.innerText.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).filter(w => k.has(w) || /^bx_/.test(w)); });
      ok("langue " + lang + ", " + v + " : « Lire toutes les machines » sans texte manquant", raw.length === 0 && !!(await a.$(`#view-${v} [data-bxreadall]`)), raw);
    }
  }
  await a.evaluate(() => { BA.I18n.set("fr", "admin"); if (BA.Shell.build) BA.Shell.build(); });
  // ménage : le boîtier B est retiré (la suite des essais n'a qu'un boîtier)
  fake.t.ba_demandes = fake.t.ba_demandes.filter(x => x.device_id !== devB.id);
  fake.t.device_reports = fake.t.device_reports.filter(x => x.device_id !== devB.id);
  fake.t.devices = fake.t.devices.filter(x => x.id !== devB.id);
  await a.evaluate(() => BA.Boitiers.refresh(true)); await sleep(300);

  console.log("\n== 7e. Barre latérale (design de la version test 4.8.6) et « Copier pour l'IA »");
  await view(a, "dashboard"); await a.mouse.move(700, 450); await sleep(500);
  const R = () => a.evaluate(() => { const n = document.getElementById("app-side"), m = document.querySelector("#app-main"), l = n.querySelector("button[data-view=alerts] span"); const r = n.getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left), mainLeft: Math.round(m.getBoundingClientRect().left), lab: +getComputedStyle(l).opacity, items: n.querySelectorAll("#app-nav button[data-view]").length, pinned: document.documentElement.classList.contains("side-pinned") }; });
  let rr = await R();
  ok("barre latérale : repliée sur les icônes (76 px), à gauche, 10 menus (v5.12 : + Technique)", rr.w === 76 && rr.left === 0 && rr.items === 10 && rr.lab === 0 && rr.mainLeft >= 76, rr);
  await shot(a, "4g-09-menu-replie");
  await a.mouse.move(40, 450); await sleep(800);
  const rr2 = await R();
  ok("souris dessus : le menu s'ouvre (280 px, noms visibles) par-dessus la page, le contenu ne bouge pas", rr2.w === 280 && rr2.lab === 1 && rr2.mainLeft === rr.mainLeft, [rr, rr2]);
  await shot(a, "4g-10-menu-ouvert");
  await (await a.$("#app-side")).screenshot({ path: path.join(OUT, "z-menu-ouvert.png") });
  await a.mouse.move(900, 450); await sleep(800);
  rr = await R();
  ok("souris partie : le menu se replie", rr.w === 76 && rr.lab === 0, rr);
  await a.click("#app-nav button[data-view=alerts]"); await sleep(300);
  ok("clic sur une icône : la page Alertes s'affiche, le bouton est « page courante »", (await a.getAttribute("#app-nav button[data-view=alerts]", "aria-current")) === "page" && !!(await a.$("#view-alerts.active")));
  await a.mouse.move(900, 450); await sleep(600);
  await a.click("#side-pin"); await a.mouse.move(900, 450); await sleep(700);
  rr = await R();
  ok("clic sur le logo : menu gardé ouvert, le contenu est poussé (pas caché)", rr.pinned && rr.w === 280 && rr.mainLeft >= 280, rr);
  await shot(a, "4g-11-menu-epingle");
  ok("choix mémorisé sur l'appareil", (await a.evaluate(() => localStorage.getItem("ba_rail_pinned"))) === "1");
  await a.click("#side-pin"); await a.mouse.move(900, 450); await sleep(700);
  rr = await R();
  ok("re-clic sur le logo : menu replié à nouveau", !rr.pinned && rr.w === 76, rr);
  await a.focus("#app-nav button[data-view=stats]"); await a.keyboard.press("Shift+Tab"); await a.keyboard.press("Tab"); await sleep(600);
  rr = await R();
  ok("clavier (Tab) : le menu s'ouvre aussi", rr.w === 280 && rr.lab === 1, rr);
  await a.keyboard.press("Escape"); await a.evaluate(() => document.activeElement && document.activeElement.blur()); await a.mouse.move(900, 450); await sleep(500);
  ok("téléphone de l'opérateur : pas de barre latérale visible, ses 4 onglets en bas", !(await o.isVisible("#app-side")) && (await o.$$eval("#app-tabbar button[data-view]", b => b.length)) === 4 && (await o.isVisible("#app-tabbar")));
  // téléphone (390 px) : bouton ☰ (tiroir), onglets en bas
  await a.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  const P = () => a.evaluate(() => { const n = document.getElementById("app-side"), tb = document.getElementById("app-tabbar"), mb = document.getElementById("menu-btn"); const r = n.getBoundingClientRect(); return { open: document.body.classList.contains("side-open"), vis: getComputedStyle(n).visibility, btn: !!mb && getComputedStyle(mb).display !== "none", tabs: getComputedStyle(tb).display !== "none", left: Math.round(r.left), right: Math.round(r.right), mainLeft: Math.round(document.querySelector("#app-main").getBoundingClientRect().left), over: document.scrollingElement.scrollWidth > window.innerWidth + 1 }; });
  let pp = await P();
  ok("téléphone : menu caché, bouton ☰ et onglets du bas visibles, contenu pleine largeur, pas de défilement de côté", !pp.open && pp.vis === "hidden" && pp.btn && pp.tabs && pp.mainLeft <= 16 && !pp.over, pp);
  await a.click("#menu-btn"); await sleep(500);
  pp = await P();
  ok("téléphone : ☰ ouvre le tiroir avec les noms, dans l'écran", pp.open && pp.vis === "visible" && pp.left >= 0 && pp.right <= 390, pp);
  await shot(a, "4g-12-menu-telephone");
  await a.click("#app-nav button[data-view=products]"); await sleep(500);
  pp = await P();
  ok("téléphone : un menu choisi → la page change et le tiroir se ferme", !pp.open && !!(await a.$("#view-products.active")), pp);
  await a.click("#app-tabbar button[data-view=alerts]"); await sleep(400);
  ok("téléphone : onglet du bas « Alertes »", !!(await a.$("#view-alerts.active")) && (await a.getAttribute("#app-tabbar button[data-view=alerts]", "aria-current")) === "page");
  await a.setViewportSize({ width: 1280, height: 900 }); await sleep(400);
  // « Copier pour l'IA »
  await view(a, "order");
  await a.waitForSelector("#view-order [data-ia-copy]", { timeout: 10000 });
  ok("Commander : carte « 🤖 Copier pour l'IA » + liens Claude / ChatGPT", /Copier pour l'IA/.test(await a.innerText("#view-order .ia-card")) && /Claude/.test(await a.innerText("#view-order .ia-card")) && /ChatGPT/.test(await a.innerText("#view-order .ia-card")));
  await a.evaluate(() => navigator.clipboard.writeText("avant"));
  await a.click("#view-order [data-ia-copy]"); await sleep(800);
  const iaTxt = await a.evaluate(() => navigator.clipboard.readText());
  ok("clic : le résumé est dans le presse-papiers (contexte, machines, stock, ventes par jour, calendrier, consigne)", /# Aide à la commande de pain/.test(iaTxt) && /### #1 — /.test(iaTxt) && /- Stock : \d+\/\d+/.test(iaTxt) && /Ventes moyennes par jour de la semaine|Ventes : aujourd'hui/.test(iaTxt) && /Jours spéciaux dans les 14 prochains jours/.test(iaTxt) && /tu ne passes aucune commande/i.test(iaTxt) && /## Ce que je te demande/.test(iaTxt), iaTxt.slice(0, 400));
  ok("le résumé contient les 2 machines, et reste court (moins de 30 000 caractères)", /### #1 — /.test(iaTxt) && /### #2 — /.test(iaTxt) && iaTxt.length < 30000, iaTxt.length);
  ok("aucun secret dans le résumé (clés, mots de passe, adresse e-mail)", !/sb_publishable|sb_secret|apikey|password|mot de passe|@test\.be|DEVICE_KEY/i.test(iaTxt), iaTxt.length);
  ok("le texte copié est aussi affiché (pour vérifier ou copier à la main)", (await a.inputValue("#view-order .ia-card textarea")) === iaTxt && (await a.$eval("#view-order .ia-card details", d => d.open)));
  await (await a.$("#view-order .ia-card")).screenshot({ path: path.join(OUT, "z-ia-carte.png") });
  await shot(a, "4g-13-commander-ia");
  console.log("--- extrait du résumé ---\n" + iaTxt.split("\n").slice(0, 30).join("\n") + "\n--- (" + iaTxt.length + " caractères) ---");
  for (const lang of ["nl", "en"]) {
    await a.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build ? BA.Shell.build() : null; }, lang);
    await view(a, "order"); await sleep(300);
    const raw = await a.evaluate(() => { const k = new Set(Object.keys(BA.I18n.dicts.fr)); return (document.body.innerText.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi) || []).filter(w => k.has(w) || /^(nav|ia)_/.test(w)); });
    const lab = await a.evaluate(() => document.getElementById("side-pin").getAttribute("aria-label") || "");
    ok("langue " + lang + " : menu et carte IA sans texte manquant", raw.length === 0 && lab.length > 3, [raw, lab]);
  }
  await a.evaluate(() => { BA.I18n.set("fr", "admin"); if (BA.Shell.build) BA.Shell.build(); });
  await a.mouse.move(900, 450);

  console.log("\n== 8. Nouvelle clé, changer de machine, supprimer");
  await view(a, "technique"); await a.waitForSelector(".bx-table");
  await a.click("[data-bxkey]"); await a.click("#dlg-ok");
  await a.waitForSelector("#bx-key-line");
  const key2 = (/"([0-9a-f]{32})"/.exec(await a.innerText("#bx-key-line")) || [])[1];
  await a.click("#dlg-ok");
  ok("nouvelle clé : l'ancienne est refusée, la nouvelle acceptée", (await boitier(key)).status === 401 && (await boitier(key2)).status === 200 && key2 !== key);
  await a.selectOption("[data-bxm]", "FAS-202166085");
  await sleep(800);
  ok("boîtier déplacé sur la machine #2", fake.t.devices[0].machine_id === "FAS-202166085");
  await a.waitForSelector("[data-bxdel]");
  await a.click("[data-bxdel]"); await a.click("#dlg-ok");
  await sleep(800);
  ok("boîtier supprimé (et ses relevés, et ses demandes)", fake.t.devices.length === 0 && fake.t.device_reports.length === 0 && fake.t.ba_demandes.length === 0, [fake.t.devices.length, fake.t.device_reports.length, fake.t.ba_demandes.length]);
  const ventes = await salesToday(a);
  ok("les ventes déjà comptées restent", ventes === 14, ventes);

  const http404 = pc.http.concat(tel.http);
  ok("réponses d'erreur de Supabase : seulement « table absente » avant les commandes SQL (devices, puis ba_demandes)", http404.every(u => /\/(devices|ba_demandes|ba_notifications)|\/rpc\/ba_(portes|conso)/.test(u)) && http404.filter(u => /devices/.test(u)).length <= 2 && http404.filter(u => /ba_demandes/.test(u)).length <= 3, http404.map(u => u.replace(/\?.*/, "")));
  ok("aucune erreur JavaScript (PC + téléphone)", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.log("ARRÊT : " + (e.stack || e));
  fails.push("arrêt : " + e.message.split("\n")[0]);
}
await browser.close(); srv.close();
try { fs.unlinkSync(INGEST_TMP); } catch (e) { /* rien */ }
console.log("\n" + (fails.length ? fails.length + " ÉCHEC(S) :\n - " + fails.join("\n - ") : "TOUT EST BON"));
process.exit(fails.length ? 1 : 0);
