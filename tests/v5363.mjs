// Essais de la v5.36.3 — les Remplir terminés depuis plus de 7 jours sont rangés dans une 3e ligne « arch » (archives).
// Ce qui doit être prouvé : (1) rien ne change à l'écran ni dans l'appli (la liste des Remplir en mémoire est la même,
// toutes les pages admin et opérateur affichent exactement le même texte avant et après le rangement) ; (2) le serveur
// voit la même chose (ba_stock_machine, essayée dans PostgreSQL en mémoire, rend le même résultat) ; (3) rien ne se perd :
// appareil neuf, deux appareils dont un hors ligne avec des horloges différentes, archives absentes de l'appareil au
// démarrage sans réseau, appareil resté sur l'ancienne version, plafond de 300 Remplir.
// Vraie appli dans Chromium, faux Supabase, données inventées (aucune vraie donnée lue ni modifiée).
// node v5363.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v5363");
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname), NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": NM + "/@supabase/supabase-js/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": NM + "/chart.js/dist/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": NM + "/xlsx/dist/xlsx.full.min.js"
};
const TY = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ko = 0;
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 900))); if (!c) ko++; };
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const clone = o => JSON.parse(JSON.stringify(o));

// Vendredi 27 novembre 2026, 13:00 à Bruxelles. Machine 3 : un Remplir tous les 2 jours depuis 40 jours (un annulé, un ancien
// avec ses copies de stock « snaps »), un Remplir ouvert maintenant. Machine 7 : son DERNIER Remplir date de 12 jours (il doit
// rester dans le présent : le serveur s'en sert), les plus vieux partent aux archives.
const NOW = new Date("2026-11-27T13:00:00+01:00").getTime(), H = 3600000, DAY = 86400000, MIN = 60000;
const USERS = [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }];
function remplirs() {
  const its = []; let id = 700000;
  const add = (num, start, status, extra) => its.push(Object.assign({
    id: id++, num, start, status, step: status === "open" ? 2 : 3, delivery: start - 2 * H, invAt: start + 5 * MIN, remAt: start + 9 * MIN, remMode: "old", remTotal: 1,
    inv: [{ s: 11, exp: 2, real: 2 }, { s: 15, exp: 1, real: 0 }], rem: [{ s: 11, removed: 1 }], load: [{ s: 11, qty: 3 }, { s: 15, qty: 2 }]
  }, status === "open" ? {} : { end: start + 20 * MIN }, extra || {}));
  add(3, NOW - 30 * MIN, "open", { step: 2 });
  for (let d = 1; d <= 40; d += 2) add(3, NOW - d * DAY - 2 * H, d === 21 ? "cancelled" : "done", d === 29 ? { snaps: { 11: [{ qty: 2 }] } } : d === 33 ? { auto: true, status: "partial" } : null);
  [12, 16, 20, 24].forEach(d => add(7, NOW - d * DAY - 5 * H, "done", { inv: [{ s: 11, exp: 1, real: 1 }], load: [{ s: 11, qty: 4 }, { s: 12, qty: 2 }] }));
  return its.sort((a, b) => b.start - a.start);      // le plus récent d'abord, comme dans l'appli
}
function etat(its) {
  const mk = (n, type, lots) => ({ n, cap: 6, type, price: 2.5, lots });
  return { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 90 * DAY }, epoch: "essai5363", thr48: true, orders: [], applied: [], missions: [],
    machines: [
      { id: "FAS-536300003", num: 3, name: "Gare", street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null, g4: { base: "r40", at: NOW - 30 * H }, sels: [
        mk(11, "gris", [{ id: 1, qty: 2, date: NOW - 20 * H }]), mk(15, "gris", [{ id: 2, qty: 1, date: NOW - 10 * H }]), mk(21, "blanc", [])] },
      { id: "FAS-536300007", num: 7, name: "Place", street: "Rue 7", city: "Lier", region: "vl", serial: "", door: false, link: false, power: false, temp: null, g4: { base: "r41", at: NOW - 13 * DAY }, sels: [
        mk(11, "gris", [{ id: 3, qty: 3, date: NOW - 6 * H }]), mk(12, "blanc", [{ id: 4, qty: 2, date: NOW - 6 * H }])] }],
    events: [], journal: [], interventions: its, moves: [], daily: {}, settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
}
const ITS = remplirs();
// ce que le serveur calcule (supabase/v5360.sql, ba_stock_machine) : « ouverte » et « tmod » d'une machine
const tOf = it => it.end != null ? it.end : it.invAt != null ? it.invAt : it.start;
const serveur = (list, num) => ({ ouverte: list.some(i => i.num === num && i.status === "open"), tmod: Math.max(...list.filter(i => i.num === num && i.status !== "cancelled").map(tOf)) });
const sansSnaps = it => { const c = clone(it); if (c.status !== "open") delete c.snaps; return c; };
// attendu : aux archives = terminé depuis plus de 7 jours, sauf le dernier non annulé de sa machine
const dernier = num => ITS.filter(i => i.num === num && i.status !== "cancelled").reduce((a, i) => (!a || tOf(i) > tOf(a) ? i : a), null);
const ATTENDU_ARCH = ITS.filter(i => i.status !== "open" && tOf(i) < NOW - 7 * DAY && dernier(i.num) !== i).map(i => i.id);

(async () => {
  console.log("== 0. Fichiers");
  ok("version 5.36.3 dans config.js", /version: "5\.36\.3"/.test(lire("js/config.js")));
  ok("index.html et operateur.html : tous les fichiers en ?v=5.36.3", [lire("index.html"), lire("operateur.html")].every(h => /\?v=5\.36\.3/.test(h) && !/\?v=5\.36\.2/.test(h)));
  const sr = lire("js/store-reel.js");
  ok("store-reel.js : 3e ligne « arch », écrite avec contrôle de version, relue et réunie (rien ne se perd)",
    /in\("id", \["main", "hist", "arch"\]\)/.test(sr) && /async saveArch\(version, arch\)/.test(sr) && /\.eq\("id", "arch"\)\.eq\("version", version\)/.test(sr) && /function pickArch\(/.test(sr) && /async function reloadArch\(/.test(sr));
  ok("technique.js : la liste des copies de nuit lit 60 lignes (3 par nuit)", /ba_state_backup"\)\.select\("jour, ligne, cree_at"\)\.order\("jour", \{ ascending: false \}\)\.limit\(60\)/.test(lire("js/technique.js")));
  ok("données inventées : " + ITS.length + " Remplir, " + ATTENDU_ARCH.length + " attendus aux archives (dont 3 de la machine 7 mais PAS son dernier, de 12 jours)",
    ATTENDU_ARCH.length > 10 && !ATTENDU_ARCH.includes(dernier(7).id) && ITS.filter(i => i.num === 7 && ATTENDU_ARCH.includes(i.id)).length === 3);

  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  async function appareil(fake, nom, o = {}) {
    const tel = !!o.tel;
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: tel ? { width: 390, height: 844 } : { width: 1280, height: 860 }, isMobile: tel, hasTouch: tel });
    await ctx.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } });
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    await fake.attach(ctx, nom);
    await ctx.clock.setFixedTime(o.now || NOW);
    return ctx;
  }
  async function ouvrir(ctx, nom, page, login) {
    const p = await ctx.newPage(); p.on("pageerror", e => errs.push(nom + " : " + e.message));
    await p.goto(URL0 + page);
    if (login !== false) {
      const champ = await p.waitForSelector("#login-email, #app-nav button", { timeout: 20000, state: "attached" });
      if (await champ.evaluate(e => e.id === "login-email")) {
        await p.fill("#login-email", page === "index.html" ? "amor@test.be" : "op@test.be"); await p.fill("#login-pass", page === "index.html" ? "Secret-123" : "Secret-456"); await p.click("#login-go");
      }
    }
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(1500);
    return p;
  }
  const nouveau = its => { const f = new FakeSupabase({ users: USERS }); f.baState = [{ id: "main", version: 3, data: etat(clone(its || ITS)), updated_at: new Date(NOW).toISOString() }]; return f; };
  const attendre = async (p, f, ms = 10000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await p.evaluate(f).catch(() => false)) return true; await sleep(200); } return false; };
  const memoire = p => p.evaluate(() => BA.Store.get().interventions);
  const ids = l => l.map(i => i.id);
  const ecrire = p => p.evaluate(() => BA.Actions.saveSettings({ thrHours: BA.Store.get().settings.thrHours }));   // une modification sans effet : déclenche un envoi

  console.log("\n== 1. Découpage (dans la page, sans réseau)");
  {
    const fake = nouveau(), ctx = await appareil(fake, "logique"), p = await ouvrir(ctx, "logique", "index.html");
    const r = await p.evaluate(() => {
      const S = BA.Store, s = JSON.parse(JSON.stringify(S.get())), sp = S._split(s);
      const back = S._assemble(sp.main, sp.hist, sp.arch);
      const vide = S._split(Object.assign({}, s, { interventions: [] })).arch.sig;
      const plus2 = S._split(Object.assign({}, s, { now: s.now + 2 * 86400000 })).arch.sig;
      const renum = JSON.parse(JSON.stringify(s)); renum.interventions.filter(i => i.num === 7).forEach(i => { i.num = 100007; });
      const cap = JSON.parse(JSON.stringify(s)); cap.interventions.length = cap.interventions.length - 1;
      const big = Array.from({ length: 290 }, (_, k) => ({ id: k + 1, num: 3, start: 1e12 - k * 1000, status: "done" }));
      const old = Array.from({ length: 20 }, (_, k) => ({ id: 1000 + k, num: 3, start: 1e12 - 290000 - k * 1000, status: "done" }));
      const dup = [{ id: 5, num: 3, start: 1e12 - 4000, status: "done", note: "main" }];
      return { keep: sp.main.interventions.map(i => ({ id: i.id, snaps: "snaps" in i && i.snaps !== undefined })), arch: sp.arch.its.map(i => i.id), archSnaps: sp.arch.its.some(i => i.snaps !== undefined),
        sig: sp.arch.sig, ha: sp.main.ha, again: S._split(JSON.parse(JSON.stringify(s))).arch.sig, vide, VIDE: S.ARCH_VIDE, plus2, renum: S._split(renum).arch.sig, cap: S._split(cap).arch.sig,
        back: back.interventions, hasHa: "ha" in back, merged: S._mergeIts(big, old).length, dedup: S._mergeIts(dup, [{ id: 5, num: 3, start: 1e12 - 4000, status: "done", note: "arch" }]).map(i => i.note) };
    });
    const garder = ITS.filter(i => !ATTENDU_ARCH.includes(i.id)).map(i => i.id);
    ok("aux archives : exactement les Remplir terminés depuis plus de 7 jours (" + r.arch.length + "), dans le même ordre", JSON.stringify(r.arch) === JSON.stringify(ATTENDU_ARCH), { arch: r.arch, attendu: ATTENDU_ARCH });
    ok("dans le présent : le Remplir ouvert, ceux des 7 derniers jours et le dernier de la machine 7 (12 jours), dans le même ordre", JSON.stringify(r.keep.map(x => x.id)) === JSON.stringify(garder) && r.keep.some(x => x.id === dernier(7).id), r.keep);
    ok("copies de stock « snaps » d'un Remplir terminé : jamais écrites (présent comme archives)", !r.keep.some(x => x.snaps) && !r.archSnaps);
    ok("signature : stable, notée dans le présent (main.ha)", r.sig === r.again && r.ha === r.sig);
    ok("signature : « vide » quand rien n'est à ranger (" + r.VIDE + ")", r.vide === r.VIDE);
    ok("signature : change quand deux jours passent (un Remplir de plus aux archives), quand une machine change de numéro, quand le plafond enlève le plus vieux",
      r.plus2 !== r.sig && r.renum !== r.sig && r.cap !== r.sig, { sig: r.sig, plus2: r.plus2, renum: r.renum, cap: r.cap });
    ok("remis ensemble : la même liste qu'avant (mêmes Remplir, même ordre, même contenu), sans « ha »",
      JSON.stringify(r.back) === JSON.stringify(ITS.map(sansSnaps)) && !r.hasHa);
    ok("réunion présent + archives : au plus 300 Remplir (comme le plafond de l'appli) ; un Remplir des deux côtés → celui du présent", r.merged === 300 && JSON.stringify(r.dedup) === JSON.stringify(["main"]), r);
    const mainIts = r.keep.map(x => ITS.find(i => i.id === x.id));
    ok("serveur : « Remplir ouvert » et « dernière modification du stock » identiques avec le présent seul, pour chaque machine",
      [3, 7].every(n => JSON.stringify(serveur(mainIts, n)) === JSON.stringify(serveur(ITS, n))), [3, 7].map(n => [serveur(mainIts, n), serveur(ITS, n)]));
    await ctx.close();
  }

  console.log("\n== 2. Premier envoi après la mise à jour : les vieux Remplir partent aux archives, rien ne change en mémoire");
  const fake = nouveau();
  let mainAvant, mainApres;
  {
    const ctx = await appareil(fake, "pc"), p = await ouvrir(ctx, "pc", "index.html");
    mainAvant = clone(fake.ba("main").data);
    ok("au départ (données d'avant la v5.36.3) : pas de ligne « arch », " + mainAvant.interventions.length + " Remplir dans le présent", !fake.ba("arch") && mainAvant.interventions.length === ITS.length);
    ok("appli ouverte : les " + ITS.length + " Remplir en mémoire, rien d'écrit tant que rien ne change", JSON.stringify(ids(await memoire(p))) === JSON.stringify(ids(ITS)) && !fake.ba("arch"));
    await ecrire(p);
    ok("première modification envoyée", await attendre(p, () => BA.Store.pendingCount() === 0));
    const arch = fake.ba("arch"), main = fake.ba("main");
    mainApres = clone(main.data);
    ok("ligne « arch » créée (version 1) avec les " + ATTENDU_ARCH.length + " vieux Remplir", arch && arch.version === 1 && JSON.stringify(ids(arch.data.its)) === JSON.stringify(ATTENDU_ARCH), arch && { v: arch.version, its: ids(arch.data.its) });
    ok("le présent ne garde que " + main.data.interventions.length + " Remplir, et note la signature des archives", main.data.interventions.length === ITS.length - ATTENDU_ARCH.length && main.data.ha === arch.data.sig);
    const tailles = { avant: JSON.stringify(mainAvant).length, apres: JSON.stringify(mainApres).length };
    ok("le présent est plus léger (" + Math.round(tailles.avant / 1024 * 10) / 10 + " Ko → " + Math.round(tailles.apres / 1024 * 10) / 10 + " Ko)", tailles.apres < tailles.avant * 0.75, tailles);
    const mem = await memoire(p), k = mem.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(ITS[i]));
    ok("en mémoire : toujours les mêmes " + ITS.length + " Remplir, même ordre, même contenu", k < 0 && mem.length === ITS.length, k < 0 ? mem.length : { i: k, memoire: mem[k], attendu: ITS[k] });
    const a = await p.evaluate(() => BA.Store._arch());
    ok("l'appareil connaît la version des archives (1) et leur signature", a.ver === 1 && a.sig === arch.data.sig && !a.missing, a);
    await ecrire(p); await attendre(p, () => BA.Store.pendingCount() === 0);
    ok("modification suivante : les archives ne sont PAS réécrites (rien n'a changé dans les vieux Remplir)", fake.ba("arch").version === 1);
    await ctx.close();
  }

  console.log("\n== 3. Serveur : ba_stock_machine (la vraie fonction SQL, dans PostgreSQL en mémoire) rend la même chose avant et après");
  {
    const { PGlite } = await import(NM + "/@electric-sql/pglite/dist/index.js");
    const db = new PGlite();
    const q = async (s, prm) => { try { return await db.query(s, prm); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
    for (const s of ["create role anon", "create role authenticated", "create role service_role bypassrls", "create schema auth",
      "grant usage on schema public to anon, authenticated, service_role",
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
      "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$"]) await q(s);
    for (const c of lire("supabase/notifications-sauvegarde.sql").split("\n").filter(l => /^(create table if not exists public\.ba_push_tokens|alter table public\.ba_push_tokens|grant all on public\.ba_push_tokens|create or replace function public\.ba_jeton)/i.test(l.trim()))) await q(c);
    await q("create table public.ba_state (id text primary key, data jsonb not null)"); await q("grant all on public.ba_state to service_role");
    for (const c of lire("supabase/v5360.sql").split("\n").filter(l => /^(create|alter|grant|revoke)/i.test(l.trim()))) await q(c);
    const appel = async data => {
      await q("delete from public.ba_state"); await q("insert into public.ba_state values ('main', $1::jsonb)", [JSON.stringify(data)]);
      await q("set role service_role");
      const r = []; for (const mid of ["FAS-536300003", "FAS-536300007"]) r.push((await q("select public.ba_stock_machine($1) j", [mid])).rows[0].j);
      await q("reset role"); return r;
    };
    const avant = await appel(mainAvant), apres = await appel(mainApres);
    ok("machine 3 : même résultat (Remplir ouvert = oui, stock, dernière modification)", JSON.stringify(avant[0]) === JSON.stringify(apres[0]) && avant[0].ouverte === true, { avant: avant[0], apres: apres[0] });
    ok("machine 7 : même résultat (son dernier Remplir de 12 jours compte toujours)", JSON.stringify(avant[1]) === JSON.stringify(apres[1]) && Number(apres[1].tmod) === tOf(dernier(7)), { avant: avant[1], apres: apres[1] });
    await db.close();
  }

  console.log("\n== 4. Appareil neuf : il lit le présent ET les archives, toutes les pages affichent exactement la même chose qu'avant");
  // « avant » = une appli ouverte sur les données d'avant le rangement (tout dans le présent) ; « après » = sur les données rangées
  const PAGES = { "index.html": ["dashboard", "details:3", "details:7", "products", "order", "stats", "history", "alerts", "settings"], "operateur.html": ["dashboard", "todo", "fill", "details:3", "details:7", "products", "history", "missions", "more"] };
  const texte = async (p, v) => {
    const [id, num] = v.split(":");
    await p.evaluate(([id, num]) => { if (num) BA.Shell.state.machine = Number(num); BA.Shell.go(id); }, [id, num]); await sleep(500);
    await p.evaluate(() => document.querySelectorAll("#app-main details:not([open])").forEach(d => d.open = true)); await sleep(250);
    return p.evaluate(() => document.getElementById("app-main").innerText.replace(/[ \t]+/g, " "));
  };
  for (const page of Object.keys(PAGES)) {
    const fAvant = nouveau(), cA = await appareil(fAvant, "avant-" + page, { tel: page !== "index.html" }), pA = await ouvrir(cA, "avant", page);
    const cB = await appareil(fake, "apres-" + page, { tel: page !== "index.html" }), pB = await ouvrir(cB, "apres", page);
    ok((page === "index.html" ? "admin" : "opérateur") + " : appareil neuf → les " + ITS.length + " Remplir en mémoire (présent + archives), même ordre",
      JSON.stringify(await memoire(pB)) === JSON.stringify(ITS.map(sansSnaps)) && JSON.stringify(ids(await memoire(pA))) === JSON.stringify(ids(ITS)));
    const diff = [];
    for (const v of PAGES[page]) { const a = await texte(pA, v), b = await texte(pB, v); if (a !== b) { const la = a.split("\n"), lb = b.split("\n"); const i = la.findIndex((x, k) => x !== lb[k]); diff.push(v + " : « " + (la[i] || "").slice(0, 80) + " » / « " + (lb[i] || "").slice(0, 80) + " »"); } }
    ok((page === "index.html" ? "admin" : "opérateur") + " : " + PAGES[page].length + " pages identiques au caractère près avant et après le rangement (dont les Remplir de chaque machine)", diff.length === 0, diff);
    if (page === "index.html") {
      await texte(pB, "details:3");
      const lignes = await pB.evaluate(() => [...document.querySelectorAll("#app-main table")].map(t => t.innerText).find(x => /Inventaire|Remplir|Livraison/i.test(x)) || "");
      ok("Détails machine 3 : le tableau des Remplir montre bien des Remplir rangés aux archives (plus de 7 jours)", (lignes.match(/\d\d\/11/g) || []).some(d => Number(d.slice(0, 2)) < 20), lignes.slice(0, 300));
      await pB.screenshot({ path: path.join(OUT, "v5363-details-3.png"), fullPage: true });
    }
    await cA.close(); await cB.close();
  }

  console.log("\n== 5. Deux appareils, horloges différentes, l'un hors ligne : rien ne se perd");
  {
    const cY = await appareil(fake, "y"), cX = await appareil(fake, "x", { tel: true });
    const pY = await ouvrir(cY, "y", "index.html"), pX = await ouvrir(cX, "x", "operateur.html");
    fake.setOffline("x", true); await sleep(300);
    await cY.clock.setFixedTime(NOW + 3 * DAY);                        // 3 jours plus tard sur l'ordinateur : d'autres Remplir vieillissent
    await pY.evaluate(() => BA.Store.ping());
    await ecrire(pY); await attendre(pY, () => BA.Store.pendingCount() === 0);
    const v2 = fake.ba("arch");
    ok("ordinateur (3 jours plus tard) : plus de Remplir aux archives, version 2", v2.version === 2 && v2.data.its.length > ATTENDU_ARCH.length, { v: v2.version, n: v2.data.its.length });
    // téléphone hors ligne : un Remplir complet sur la machine 7
    const nouvelId = await pX.evaluate(() => { const id = BA.Actions.startIntervention(7); BA.Actions.applyInventory(id, {}, true); BA.Actions.applyRemoval(id, [], "none"); BA.Actions.applyLoad(id, { 11: 1 }, Date.now()); return id; });
    ok("téléphone hors ligne : Remplir fait sur la machine 7, en attente d'envoi", await pX.evaluate(() => BA.Store.pendingCount() > 0));
    fake.setOffline("x", false);
    await pX.evaluate(() => window.dispatchEvent(new Event("online")));
    ok("téléphone de retour : tout est envoyé", await attendre(pX, () => BA.Store.pendingCount() === 0, 20000));
    await pY.evaluate(() => BA.Store.pull()); await sleep(800);
    const dbIds = [...new Set(ids(fake.ba("main").data.interventions.concat(fake.ba("arch").data.its)))];
    ok("dans la base (présent + archives réunis) : les " + (ITS.length + 1) + " Remplir, dont celui du téléphone", dbIds.length === ITS.length + 1 && ITS.every(i => dbIds.includes(i.id)) && dbIds.includes(nouvelId), { n: dbIds.length });
    const [mx, my] = [await memoire(pX), await memoire(pY)];
    ok("les deux appareils ont la même liste en mémoire (" + mx.length + " Remplir, aucun en double)", JSON.stringify(ids(mx)) === JSON.stringify(ids(my)) && mx.length === ITS.length + 1 && new Set(ids(mx)).size === mx.length, { x: mx.length, y: my.length });
    const it = mx.find(i => i.id === nouvelId);
    ok("le Remplir du téléphone est complet (terminé, 1 pain chargé, sélection 11)", it && it.status === "done" && it.load.reduce((a, r) => a + r.qty, 0) === 1, it);
    await cX.close(); await cY.close();
  }

  console.log("\n== 6. Démarrage SANS réseau avec les archives de l'appareil illisibles : elles ne sont jamais vidées");
  {
    const ctx = await appareil(fake, "z"), p = await ouvrir(ctx, "z", "index.html");
    const nArch = fake.ba("arch").data.its.length, vArch = fake.ba("arch").version;
    await p.evaluate(() => new Promise(res => { const r = indexedDB.open("broodautomate-v5-copie", 1); r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); tx.objectStore("kv").delete("arch"); tx.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => res(); }));
    await p.close();
    fake.setOffline("z", true);
    const p2 = await ouvrir(ctx, "z", "index.html", false);
    const off = await p2.evaluate(() => ({ n: BA.Store.get().interventions.length, a: BA.Store._arch(), sync: BA.Store.status().sync }));
    ok("hors ligne, archives de l'appareil illisibles : l'appli s'ouvre (" + off.n + " Remplir visibles, archives « à relire »)", off.sync === "offline" && off.a.missing === true, off);
    await ecrire(p2);
    fake.setOffline("z", false);
    await p2.evaluate(() => window.dispatchEvent(new Event("online")));
    ok("retour du réseau : modification envoyée", await attendre(p2, () => BA.Store.pendingCount() === 0, 20000));
    const apres = fake.ba("arch");
    ok("les archives de la base n'ont PAS été vidées (" + nArch + " → " + apres.data.its.length + ")", apres.data.its.length === nArch && apres.version >= vArch, { avant: nArch, apres: apres.data.its.length });
    const unionDb = new Set(ids(fake.ba("main").data.interventions.concat(fake.ba("arch").data.its)));
    ok("l'appareil a retrouvé tous les Remplir (" + (await memoire(p2)).length + " = présent + archives réunis)", (await memoire(p2)).length === unionDb.size && ids(await memoire(p2)).every(i => unionDb.has(i)));
    await ctx.close();
  }

  console.log("\n== 7. Appareil resté sur l'ancienne version (il ne connaît pas « arch ») : il n'abîme rien");
  {
    const nArch = fake.ba("arch").data.its.length, vArch = fake.ba("arch").version;
    // ce que l'ancienne version écrit : SES Remplir (ceux du présent) + un nouveau, et garde la vieille signature « ha »
    const m = fake.ba("main"), d = clone(m.data);
    d.interventions.unshift({ id: 799999, num: 3, start: NOW + 60 * MIN, end: NOW + 80 * MIN, invAt: NOW + 65 * MIN, status: "done", step: 3, delivery: NOW, inv: [], rem: [], load: [{ s: 11, qty: 2 }] });
    m.data = d; m.version += 1;
    const ctx = await appareil(fake, "w"), p = await ouvrir(ctx, "w", "index.html");
    const l = await memoire(p);
    const unionDb = new Set(ids(d.interventions.concat(fake.ba("arch").data.its)));
    ok("appareil à jour : le Remplir écrit par l'ancienne version + tous les autres (" + l.length + " = présent + archives réunis)", l[0].id === 799999 && l.length === unionDb.size && new Set(ids(l)).size === l.length, { n: l.length, union: unionDb.size });
    ok("les archives sont intactes (" + nArch + ", version " + vArch + ")", fake.ba("arch").data.its.length === nArch && fake.ba("arch").version === vArch);
    await ctx.close();
  }

  console.log("\n== 8. Plafond de 300 Remplir : le plus vieux sort, il ne revient jamais");
  {
    const its = Array.from({ length: 300 }, (_, k) => ({ id: 600000 + k, num: 3, start: NOW - (k + 1) * 3 * H, end: NOW - (k + 1) * 3 * H + 20 * MIN, invAt: NOW - (k + 1) * 3 * H + 5 * MIN,
      status: "done", step: 3, delivery: NOW - (k + 1) * 3 * H, inv: [], rem: [], load: [{ s: 11, qty: 1 }] }));
    const f = nouveau(its), ctx = await appareil(f, "cap"), p = await ouvrir(ctx, "cap", "index.html");
    await ecrire(p); await attendre(p, () => BA.Store.pendingCount() === 0);
    const n0 = f.ba("arch").data.its.length;
    await p.evaluate(() => BA.Actions.startIntervention(3)); await attendre(p, () => BA.Store.pendingCount() === 0);
    const tous = ids(f.ba("main").data.interventions.concat(f.ba("arch").data.its));
    ok("300 Remplir (dont " + n0 + " aux archives) + 1 nouveau → 300, le plus vieux (" + (600299) + ") est sorti", tous.length === 300 && !tous.includes(600299) && tous.includes(600298), { n: tous.length });
    const c2 = await appareil(f, "cap2"), p2 = await ouvrir(c2, "cap2", "index.html");
    ok("un autre appareil qui ouvre : 300 Remplir, le plus vieux ne revient pas", (await memoire(p2)).length === 300 && !ids(await memoire(p2)).includes(600299));
    await ctx.close(); await c2.close();
  }

  console.log("\n== 9. Horloges décalées puis redémarrage SANS réseau : un Remplir « vieux » pour l'un, « récent » pour l'autre ne se perd pas");
  {
    // le Remplir K (machine 3, il y a 7 jours et 1 h 40) : récent pour une horloge en retard de 2 h, vieux pour une horloge à l'heure
    const K = ITS.find(i => i.num === 3 && Math.abs(tOf(i) - (NOW - 7 * DAY - 100 * MIN)) < MIN);
    const f = nouveau(), cB = await appareil(f, "retard", { now: NOW - 2 * H }), pB = await ouvrir(cB, "retard", "index.html");
    await ecrire(pB); await attendre(pB, () => BA.Store.pendingCount() === 0);
    ok("horloge en retard de 2 h : K reste dans le présent de la base, pas aux archives", K && f.ba("main").data.interventions.some(i => i.id === K.id) && !f.ba("arch").data.its.some(i => i.id === K.id));
    await cB.close();
    const cA = await appareil(f, "heure"), pA = await ouvrir(cA, "heure", "index.html");      // à l'heure : lit la base, n'écrit rien
    ok("horloge à l'heure : rien d'écrit à l'ouverture (archives toujours version 1)", f.ba("arch").version === 1 && (await pA.evaluate(() => BA.Store.pendingCount())) === 0);
    await pA.close();
    f.setOffline("heure", true);
    const pA2 = await ouvrir(cA, "heure", "index.html", false);                                // rouverte SANS réseau
    await ecrire(pA2);
    f.setOffline("heure", false);
    await pA2.evaluate(() => window.dispatchEvent(new Event("online")));
    ok("retour du réseau : modification envoyée", await attendre(pA2, () => BA.Store.pendingCount() === 0, 20000));
    const dansMain = f.ba("main").data.interventions.some(i => i.id === K.id), dansArch = f.ba("arch").data.its.some(i => i.id === K.id);
    ok("K est toujours dans la base (" + (dansMain ? "présent" : "") + (dansMain && dansArch ? " + " : "") + (dansArch ? "archives" : "") + ")", dansMain || dansArch, { dansMain, dansArch });
    const cC = await appareil(f, "neuf"), pC = await ouvrir(cC, "neuf", "index.html");
    ok("un appareil neuf voit les " + ITS.length + " Remplir, K compris", (await memoire(pC)).length === ITS.length && ids(await memoire(pC)).includes(K.id));
    await cA.close(); await cC.close();
  }

  ok("aucune erreur JavaScript dans les pages", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ARRÊT :", e); process.exit(1); });
