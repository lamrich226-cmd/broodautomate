// Essais de la v5.21 : carte SIM du boîtier (Digi / 1NCE) et programme complet du boîtier à télécharger (.zip prêt à téléverser)
// node v521.mjs <dossier du site> <dossier des captures>      (données inventées : aucune vraie donnée ici)
//   - Technique → Boîtiers 4G → « Ajouter un boîtier » : choix de la carte SIM (Digi par défaut, comme avant).
//   - Fenêtre de la clé : choix Digi / 1NCE, bouton « Télécharger le programme complet » → .zip valide, dossier
//     broodautomate_lilygo + 9 fichiers ; config.h rempli (MODE 0, clé de CE boîtier, APN de la carte, écoute UDP pour 1NCE) ;
//     les 8 autres fichiers identiques à ceux du dépôt ; le config.h obtenu se compile (simulateur g++).
//   - Nouvelle clé (🔑) : la carte annoncée par le boîtier (« 1NCE » dans sa version) est proposée d'office.
//   - L'ancienne méthode (ligne DEVICE_KEY à copier) reste là. 3 langues, 2 thèmes, téléphone, aucune erreur.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v521");
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
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const LILY = path.join(ROOT, "lilygo", "broodautomate_lilygo");
const FICHIERS = ["broodautomate_lilygo.ino", "config.h", "boitier.cpp", "modem.h", "envoi.h", "filtre.h", "horloge.h", "ddcmp_moteur.h", "dex_moteur.h"];

// Ouvre un .zip avec Python (module zipfile) : noms, contrôle d'intégrité, empreinte de chaque fichier, texte de config.h
function lireZip(fichier) {
  const py = `import zipfile, hashlib, json, sys
z = zipfile.ZipFile(sys.argv[1])
out = {"names": z.namelist(), "test": z.testzip(), "sha": {}, "config": ""}
for n in z.namelist():
    if n.endswith("/"): continue
    b = z.read(n); out["sha"][n] = hashlib.sha256(b).hexdigest()
    if n.endswith("/config.h"): out["config"] = b.decode("utf-8")
print(json.dumps(out))`;
  return JSON.parse(execFileSync("python3", ["-c", py, fichier]).toString());
}
// Le config.h du .zip se compile-t-il avec le programme ? (simulateur Arduino du dépôt, g++)
function compile(fichierZip) {
  try { execFileSync("g++", ["--version"], { stdio: "ignore" }); } catch (e) { return "g++ absent"; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba521-"));
  execFileSync("python3", ["-c", "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", fichierZip, dir]);
  const sim = path.join(ROOT, "lilygo", "essais", "sim");
  try {
    execFileSync("g++", ["-std=gnu++17", "-fsyntax-only", "-I" + sim, `-DSKETCH_CPP="${path.join(dir, "broodautomate_lilygo", "boitier.cpp")}"`, path.join(sim, "sim.cpp")], { stdio: "pipe" });
    return "ok";
  } catch (e) { return String(e.stderr || e.message).slice(0, 400); }
}

const now = Date.now(), H = 3600000, MIN = 60000;
const DEV = { A: "d0000000-0000-0000-0000-00000000000a", B: "d0000000-0000-0000-0000-00000000000b" };
const etat = {
  v: 1, hv: 1, seq: 5000, real: { v: 5, created: now - 9 * 24 * H }, daily: {}, epoch: "essai521", moves: [], thr48: true, orders: [], missions: [], interventions: [], journal: [], applied: [], events: [],
  machines: [{ id: "FAS-202160521", num: 1, street: "Teststraat 1", city: "Antwerpen", region: "vl", serial: "202160521", door: false, link: false, power: false, temp: 4.5,
    sels: [{ n: 1, cap: 10, lots: [], type: "blanc", price: 2.5 }], lastSale: null, lastSeen: now - 30 * MIN, nextSale: null, tempUntil: null, powerUntil: null }],
  settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 60, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
    forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } },
  customTypes: [], dayDecisions: {}, profileManual: {}, calendar: []
};

(async () => {
  console.log("== 0. Fichiers : version, ordre de chargement, programme du boîtier v1.5 dans le dépôt");
  const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), opx = fs.readFileSync(path.join(ROOT, "operateur.html"), "utf8");
  const version = (/version:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8")) || [])[1];
  ok("version 5.25.0 dans config.js", version === "5.25.0", version);
  const pos = s => idx.indexOf(s);
  ok("admin : zip.js puis programme.js avant boitiers.js", pos("js/zip.js?v=5.25.0") > 0 && pos("js/zip.js") < pos("js/programme.js") && pos("js/programme.js") < pos("js/boitiers.js"));
  ok("les deux pages chargent i18n-v521.js juste après i18n-v520.js", /i18n-v520\.js\?v=5\.23\.0"><\/script>\s*<script src="js\/i18n-v521\.js\?v=5\.23\.0"/.test(idx) && /i18n-v520\.js\?v=5\.23\.0"><\/script>\s*<script src="js\/i18n-v521\.js\?v=5\.23\.0"/.test(opx));
  ok("page opérateur : pas de fabrication de programme (zip.js, programme.js absents)", !/zip\.js|programme\.js/.test(opx));
  const cfgDepot = fs.readFileSync(path.join(LILY, "config.h"), "utf8");
  ok("dépôt : config.h sans vraie clé (COLLE_ICI…), MODE 1 par défaut, ECOUTE_UDP 0", /#define DEVICE_KEY\s+"COLLE_ICI_LA_CLE_DU_BOITIER"/.test(cfgDepot) && /^#define MODE\s+1\b/m.test(cfgDepot) && /^#define ECOUTE_UDP 0\b/m.test(cfgDepot) && !/"[0-9a-f]{32}"/.test(cfgDepot));
  ok("dépôt : programme du boîtier v1.5", /#define FW_VERSION "1\.5"/.test(fs.readFileSync(path.join(LILY, "boitier.cpp"), "utf8")));
  const gen = lireZip(path.join(ROOT, "lilygo", "broodautomate_lilygo.zip"));
  ok("dépôt : broodautomate_lilygo.zip = exactement les fichiers du dossier (v1.5)", gen.test === null && FICHIERS.every(f => gen.sha["broodautomate_lilygo/" + f] === sha(fs.readFileSync(path.join(LILY, f)))) && Object.keys(gen.sha).length === FICHIERS.length, Object.keys(gen.sha));

  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const fake = new FakeSupabase({ boitiers: true, users: [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }] });
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  fake.t.machines = etat.machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: 4.5, last_seen: null, created_at: "2026-11-10T10:00:00Z" }));
  const info = fw => ({ fw, mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 3600, lok: Math.floor((now - 10 * MIN) / 1000), rssi: 18, op: "20601", seq: 10, up: 7200, lu: 2, ko: 0 });
  fake.t.devices.push({ id: DEV.A, name: "Boîtier Digi", machine_id: "FAS-202160521", key_hash: "a".repeat(64), last_seen: new Date(now - 2 * MIN).toISOString(), created_at: "2026-11-10T10:00:00Z", info: info("1.4") });
  fake.t.devices.push({ id: DEV.B, name: "Boîtier Une", machine_id: "FAS-202160521", key_hash: "b".repeat(64), last_seen: new Date(now - 3 * MIN).toISOString(), created_at: "2026-11-10T10:00:00Z", info: info("1.5 1NCE") });

  const browser = await chromium.launch();
  const errs = [], requetes = [];
  const appareil = async (nom, opts) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] }, opts));
    await ctx.addInitScript(() => { try { localStorage.setItem("ba_mv_mode", "classic"); } catch (e) { /* */ } });   // v5.25 : ces essais vérifient l'affichage « Classique » (comme avant)
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    ctx.on("request", r => requetes.push(r.url() + " " + (r.postData() || "")));
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(nom + " pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) errs.push(nom + " console: " + m.text()); });
    return p;
  };
  const entrer = async p => {
    await p.goto(URL0 + "index.html");
    await p.waitForSelector("#login-email", { timeout: 20000 });
    await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(2000);
    await p.evaluate(() => { if (BA.Technique) BA.Technique.tab("boxes"); BA.Shell.go("technique"); });
    await p.waitForSelector("#bx-add", { timeout: 15000 }); await sleep(500);
  };
  const telecharger = async (p, nomFichier) => {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click("#bx-prog-dl")]);
    const f = path.join(os.tmpdir(), "ba521-" + Date.now() + "-" + dl.suggestedFilename());
    await dl.saveAs(f);
    if (nomFichier) fs.copyFileSync(f, path.join(OUT, nomFichier));
    return { f, nom: dl.suggestedFilename() };
  };
  const verifierZip = (z, attendu) => {
    const r = lireZip(z.f), c = r.config;
    const autres = FICHIERS.filter(f => f !== "config.h").every(f => r.sha["broodautomate_lilygo/" + f] === sha(fs.readFileSync(path.join(LILY, f))));
    const une = re => (c.match(re) || []).length === 1;
    return {
      valide: r.test === null && r.names[0] === "broodautomate_lilygo/" && r.names.length === 10 && FICHIERS.every(f => r.names.includes("broodautomate_lilygo/" + f)),
      autres,
      mode0: une(/^#define MODE\s+0\s*$/mg) && !/^#define MODE\s+[12]/m.test(c),
      cle: une(new RegExp(`^#define DEVICE_KEY\\s+"${attendu.key}"\\s*$`, "m")) && !/COLLE_ICI/.test(c) && (c.match(/^#define DEVICE_KEY/mg) || []).length === 1,
      apn: une(new RegExp(`^#define APN\\s+"${attendu.apn.replace(/\./g, "\\.")}"`, "m")) && (c.match(/^#define APN\b/mg) || []).length === 1,
      udp: une(new RegExp(`^#define ECOUTE_UDP ${attendu.udp}\\b`, "m")) && (c.match(/^#define ECOUTE_UDP/mg) || []).length === 1,
      entete: c.startsWith("// ==== Programme préparé par Broodautomate le ") && c.includes("« " + attendu.nom + " »") && c.includes("Carte SIM : " + attendu.sim),
      reste: c.includes("#define SERVER_URL") && c.includes("#define MACHINE_RX_PIN     18") && c.includes("#define SIM_PIN  \"\""),
      config: c
    };
  };

  console.log("\n== 1. Ajouter un boîtier : choix de la carte SIM");
  const a = await appareil("pc", { viewport: { width: 1280, height: 900 } });
  await entrer(a);
  const opts = await a.$$eval("#bx-sim option", o => o.map(x => ({ v: x.value, t: x.textContent.trim(), s: x.selected })));
  ok("liste « Carte SIM » : Digi (choisie par défaut, comme avant) et 1NCE", JSON.stringify(opts) === JSON.stringify([{ v: "digi", t: "Digi", s: true }, { v: "1nce", t: "1NCE", s: false }]), opts);
  ok("v5.23 : plus de phrase d'aide sous « Ajouter un boîtier » (le formulaire reste)", !/programme complet du boîtier, prêt à téléverser/.test(await a.innerText("#view-technique")));
  await a.fill("#bx-name", "Boîtier essai 1NCE");
  await a.selectOption("#bx-sim", "1nce");
  await a.selectOption("#bx-machine", "FAS-202160521"); await sleep(200);
  await a.$eval("#bx-add", e => e.scrollIntoView({ block: "center" })); await sleep(300);
  await a.screenshot({ path: path.join(OUT, "v521-01-ajouter-boitier-carte-sim.png") });
  await a.click("#bx-add");
  await a.waitForSelector("#bx-key-line", { timeout: 10000 });
  const key = (/"([0-9a-f]{32})"/.exec(await a.innerText("#bx-key-line")) || [])[1];
  const ajoute = fake.t.devices.find(d => d.name === "Boîtier essai 1NCE");
  ok("boîtier créé dans Supabase avec l'empreinte de la clé (jamais la clé elle-même)", !!key && !!ajoute && ajoute.key_hash === sha(key) && !JSON.stringify(fake.t.devices).includes(key), ajoute && ajoute.key_hash);
  const choix = await a.$$eval("input[name=bx-sim-dlg]", r => r.map(x => ({ v: x.value, c: x.checked })));
  ok("fenêtre : la carte choisie (1NCE) est cochée ; Digi proposée aussi", JSON.stringify(choix) === JSON.stringify([{ v: "digi", c: false }, { v: "1nce", c: true }]), choix);
  ok("fenêtre : bouton « Télécharger le programme complet », ligne DEVICE_KEY toujours là (ancienne méthode), avertissement « une seule fois »",
    /Télécharger le programme complet/.test(await a.innerText("#bx-prog-dl")) && await a.isVisible("#bx-key-copy") && /n'est montrée qu'une fois/.test(await a.innerText(".dlg-body")));
  await sleep(700);                                   // fenêtre complètement affichée (fin de l'animation)
  await a.screenshot({ path: path.join(OUT, "v521-02-fenetre-programme-pc.png") });

  console.log("\n== 2. Programme 1NCE téléchargé : .zip complet, config.h rempli");
  const z1 = await telecharger(a, "exemple-programme-1nce-cle-inventee.zip");
  ok("nom du fichier : broodautomate_lilygo_boitier-essai-1nce_1nce.zip", z1.nom === "broodautomate_lilygo_boitier-essai-1nce_1nce.zip", z1.nom);
  const v1 = verifierZip(z1, { key, apn: "iot.1nce.net", udp: 1, nom: "Boîtier essai 1NCE", sim: "1NCE" });
  ok("zip valide : dossier broodautomate_lilygo + les 9 fichiers (nom attendu par Arduino IDE)", v1.valide);
  ok("les 8 autres fichiers sont identiques à ceux du dépôt (même programme pour tous)", v1.autres);
  ok("config.h : MODE 0 (normal)", v1.mode0, v1.config.slice(0, 900));
  ok("config.h : la clé de CE boîtier, une seule fois, plus de « COLLE_ICI »", v1.cle);
  ok("config.h : APN iot.1nce.net", v1.apn);
  ok("config.h : ECOUTE_UDP 1 (écoute du port UDP)", v1.udp);
  ok("config.h : en-tête « préparé par Broodautomate » avec le nom du boîtier et la carte", v1.entete, v1.config.slice(0, 400));
  ok("config.h : les autres réglages sont intacts (Supabase, broches, code PIN)", v1.reste);
  ok("ce config.h se compile avec le programme (simulateur g++)", compile(z1.f) === "ok", compile(z1.f));
  ok("après téléchargement : le bouton passe à « Téléchargé » (v5.23 : plus de texte d'explication)", /Téléchargé/.test(await a.innerText("#bx-prog-dl")) && !(await a.$("#bx-prog-note")));

  console.log("\n== 3. Même boîtier, carte Digi : rien d'autre ne change");
  await a.check("input[name=bx-sim-dlg][value=digi]");
  const z2 = await telecharger(a);
  ok("nom du fichier : …_digi.zip", z2.nom === "broodautomate_lilygo_boitier-essai-1nce_digi.zip", z2.nom);
  const v2 = verifierZip(z2, { key, apn: "internet", udp: 0, nom: "Boîtier essai 1NCE", sim: "Digi" });
  ok("Digi : zip valide, 8 fichiers identiques, MODE 0, même clé, APN « internet », ECOUTE_UDP 0", v2.valide && v2.autres && v2.mode0 && v2.cle && v2.apn && v2.udp && v2.entete && v2.reste, v2.config.slice(0, 900));
  ok("Digi : se compile aussi", compile(z2.f) === "ok");
  const diff = v1.config.split("\n").filter((l, i) => l !== v2.config.split("\n")[i]);
  ok("entre Digi et 1NCE, seules 3 lignes changent : la carte (en-tête), l'APN et ECOUTE_UDP", diff.length === 3 && /^\/\/ Carte SIM : 1NCE/.test(diff[0]) && /^#define APN\s+"iot\.1nce\.net"/.test(diff[1]) && /^#define ECOUTE_UDP 1/.test(diff[2]), diff);
  await a.click("#dlg-ok"); await sleep(600);

  console.log("\n== 4. 🔑 Nouvelle clé : la carte du boîtier est proposée d'office");
  for (const [id, nom, attendu] of [[DEV.B, "Boîtier Une", "1nce"], [DEV.A, "Boîtier Digi", "digi"]]) {
    await a.click(`[data-bxkey="${id}"]`); await a.waitForSelector("#dlg-ok"); await a.click("#dlg-ok");
    await a.waitForSelector("#bx-key-line", { timeout: 10000 });
    const c = await a.$eval("input[name=bx-sim-dlg]:checked", r => r.value);
    const k2 = (/"([0-9a-f]{32})"/.exec(await a.innerText("#bx-key-line")) || [])[1];
    const d = fake.t.devices.find(x => x.id === id);
    ok(`« ${nom} » (version ${attendu === "1nce" ? "1.5 1NCE" : "1.4"}) : carte ${attendu} cochée, nouvelle clé enregistrée`, c === attendu && !!k2 && d.key_hash === sha(k2), { c, h: d.key_hash });
    if (attendu === "1nce") {
      const z3 = await telecharger(a);
      const v3 = verifierZip(z3, { key: k2, apn: "iot.1nce.net", udp: 1, nom, sim: "1NCE" });
      ok("programme avec la NOUVELLE clé", v3.valide && v3.cle && v3.udp && v3.apn, v3.config.slice(0, 600));
    }
    await a.click("#dlg-ok"); await sleep(500);
  }

  console.log("\n== 5. Trois langues et deux thèmes : aucun texte manquant");
  const DEFAUTS = () => {
    const keys = new Set(Object.keys(BA.I18n.dicts.fr));
    const out = { keys: [], bad: [] };
    const txt = document.body.innerText;
    (txt.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) || []).forEach(w => { if (keys.has(w) || /^(bx|ia|rs)_/.test(w)) out.keys.push(w); });
    document.querySelectorAll("body *").forEach(el => {
      if (el.children.length || !(el.offsetWidth || el.offsetHeight) || el.closest("pre, code, textarea")) return;
      const m = el.textContent.match(/\bundefined\b|\bNaN\b|\[object Object\]|\{[a-z]+\}/);
      if (m) out.bad.push(m[0] + " ← " + el.textContent.trim().slice(0, 60));
    });
    return out;
  };
  const MOTS = { fr: "Télécharger le programme complet", nl: "Volledig programma downloaden", en: "Download the complete program" };
  for (const lang of ["fr", "nl", "en"]) {
    for (const theme of ["light", "dark"]) {
      await a.evaluate(([l, th]) => { BA.I18n.set(l, "admin"); BA.Theme.apply(th); if (BA.Technique) BA.Technique.tab("boxes"); BA.Shell.go("technique"); }, [lang, theme]);
      await a.waitForSelector("#bx-add"); await sleep(300);
      await a.click(`[data-bxkey="${DEV.A}"]`); await a.waitForSelector("#dlg-ok"); await a.click("#dlg-ok");
      await a.waitForSelector("#bx-prog-dl", { timeout: 10000 }); await sleep(700);
      const d = await a.evaluate(DEFAUTS);
      const fond = await a.evaluate(() => getComputedStyle(document.querySelector(".bx-prog")).backgroundColor);
      ok(`thème ${theme} bien appliqué (${fond})`, (theme === "dark" ? /rgb\((\d{1,2}|1[0-9]{2}), /.test(fond) && parseInt(fond.slice(4)) < 80 : parseInt(fond.slice(4)) > 200), fond);
      const bouton = await a.innerText("#bx-prog-dl");
      ok(`langue ${lang} / thème ${theme} : fenêtre traduite, aucun texte manquant`, bouton.includes(MOTS[lang]) && !d.keys.length && !d.bad.length, { bouton, d });
      if (lang === "fr" && theme === "dark") await a.screenshot({ path: path.join(OUT, "v521-03-fenetre-programme-sombre.png") });
      await a.click("#dlg-cancel"); await sleep(300);
    }
  }
  await a.evaluate(() => { BA.I18n.set("fr", "admin"); BA.Theme.apply("light"); }); await sleep(300);

  console.log("\n== 6. Téléphone : la fenêtre tient dans l'écran, choix et bouton faciles à toucher");
  const t = await appareil("tel", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await entrer(t);
  ok("téléphone : la liste « Carte SIM » est là", !!(await t.$("#bx-sim")));
  await t.click(`[data-bxkey="${DEV.B}"]`); await t.waitForSelector("#dlg-ok"); await t.click("#dlg-ok");
  await t.waitForSelector("#bx-prog-dl", { timeout: 10000 }); await sleep(300);
  const geo = await t.evaluate(() => {
    const r = e => { const q = e.getBoundingClientRect(); return { l: Math.round(q.left), r: Math.round(q.right), h: Math.round(q.height) }; };
    const b = document.getElementById("bx-prog-dl");
    return { opts: [...document.querySelectorAll(".bx-sim-opt")].map(r), dl: r(b), deborde: b.scrollWidth > b.clientWidth + 1, over: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok("téléphone : 2 choix de carte et le bouton dans l'écran (390 px), hauts de 44 px ou plus, sans défilement de côté",
    geo.opts.length === 2 && geo.opts.every(o => o.l >= 0 && o.r <= 390 && o.h >= 44) && geo.dl.l >= 0 && geo.dl.r <= 390 && geo.dl.h >= 44 && !geo.deborde && !geo.over, geo);
  await sleep(500);
  await t.screenshot({ path: path.join(OUT, "v521-04-fenetre-programme-telephone.png") });
  const z4 = await telecharger(t);
  ok("téléphone : le téléchargement marche aussi (1NCE coché d'office)", /_1nce\.zip$/.test(z4.nom) && verifierZip(z4, { key: (/"([0-9a-f]{32})"/.exec(await t.innerText("#bx-key-line")) || [])[1], apn: "iot.1nce.net", udp: 1, nom: "Boîtier Une", sim: "1NCE" }).cle);

  console.log("\n== 7. Sécurité : la clé ne part nulle part");
  ok("aucune requête réseau ne contient la clé du boîtier (seule son empreinte part ; le .zip est fabriqué dans le navigateur)", requetes.length > 20 && !requetes.some(r => r.includes(key)) && requetes.some(r => r.includes(sha(key))), requetes.length);

  ok("aucune erreur JavaScript pendant tout l'essai", errs.length === 0, errs.slice(0, 5));
  await browser.close(); srv.close();
  console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT EST OK");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
