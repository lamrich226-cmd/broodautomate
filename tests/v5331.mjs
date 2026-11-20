// Essais de la v5.33.1 — prix et sélections annoncés par la machine. Vraie appli dans Chromium, faux Supabase,
// relevés INVENTÉS au format des vraies machines (ligne PA1 = n° de sélection et prix gardé dans la machine) :
//  - Power Lift payée par carte : prix machine 0 € → la plateforme garde son prix, puis prend le prix PAYÉ à la vente ;
//  - prix changé dans la machine (0 € → 3,10 €, 0,10 €…) : repris tout de suite, même sans vente (Historique + Alertes) ;
//  - FAS 480 (DEX) : 2,70 € repris à la première lecture ;
//  - première connexion d'une machine sans sélection : ses sélections sont créées (type et capacité les plus courants) ;
//  - un relevé plus ancien ne remplace pas un prix plus récent, ni un prix changé à la main après lui.
// node v5331.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server.js");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v5331");
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

// Relevé inventé : sels = [{ n, p (prix machine en centimes ; undefined = champ absent), c (ventes cumulées), v (montant cumulé, centimes) }]
function releve(id, sels) {
  const tc = sels.reduce((a, x) => a + (x.c || 0), 0), tv = sels.reduce((a, x) => a + (x.v || 0), 0);
  const L = ["DXS*" + id + "*VA*V1/6*1", "ST*001*0001", "ID1*" + id + "*FASTER*0091", "VA1*" + tv + "*" + tc + "*0*0"];
  sels.forEach(x => {
    L.push(x.p === undefined ? "PA1*" + x.n : "PA1*" + x.n + "*" + x.p + "*" + x.n + "00");
    L.push(x.v === null ? "PA2***" + (x.c || 0) : "PA2*" + (x.c || 0) + "*" + (x.v || 0) + "*" + (x.c || 0) + "*" + (x.v || 0));
  });
  L.push("SE*" + (L.length - 1) + "*0001", "DXE*1*1");
  return L.join("\r\n") + "\r\n";
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch(); const errs = [];
  const NOW = new Date("2026-11-20T11:00:00+01:00").getTime(), MIN = 60000;
  const sel = (n, type, cap, price) => ({ n, type, cap, price, lots: [] });
  const etat = { v: 1, hv: 2, seq: 9000, real: { v: 5, created: NOW - 70 * 86400000 }, epoch: "essai5331", thr48: true, orders: [], applied: [], missions: [],
    machines: [
      { id: "FAS-533100003", num: 3, street: "Rue 3", city: "Antwerpen", region: "vl", serial: "", door: false, link: false, power: false, temp: null,
        sels: [sel(11, "gris", 3, 2.5), sel(19, "blanc", 3, 2.5), sel(21, "maya", 2, 3.5)] },
      { id: "FAS-533100004", num: 4, street: "Rue 4", city: "Kasterlee", region: "vl", serial: "", door: false, link: false, power: false, temp: null, sels: [] },
      { id: "FAS-533100005", num: 5, street: "Rue 5", city: "Mol", region: "vl", serial: "", door: false, link: false, power: false, temp: null,
        sels: [sel(11, "gris", 3, 2.9), sel(19, "complet", 2, 2.5), sel(21, "maya", 3, 3.5)] }
    ],
    events: [], journal: [], interventions: [], moves: [], daily: {},
    settings: { dayHour: 4, tempMax: 18, tempMin: 14, emptyPct: 0, thrHours: 48, salePrice: 2.5, fixedMonthly: 150, ecouteMin: 60, purchase: {} },
    customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [] };
  const fake = new FakeSupabase({});
  fake.baState = [{ id: "main", version: 3, data: etat, updated_at: new Date(NOW).toISOString() }];
  const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: { width: 1280, height: 900 } });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
  await fake.attach(ctx, "pc");
  await ctx.clock.setFixedTime(NOW);
  const login = async (p, page) => {
    p.on("pageerror", e => errs.push(page + " : " + e.message));
    await p.goto(URL0 + page);
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }).catch(async () => {
      await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", "amor@test.be"); await p.fill("#login-pass", "Secret-123"); await p.click("#login-go");
      await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    });
    await sleep(1500);
  };
  const ad = await ctx.newPage(); await login(ad, "index.html");
  // un relevé par le câble (vrai chemin : relevé précédent dans « audits », comparaison, ventes, prix)
  const lire = (num, txt) => ad.evaluate(async ([num, txt]) => {
    const m = BA.Store.get().machines.find(x => x.num === num);
    const r = await BA.Rs232._traiter(m, BA.EvaDts.parse(txt), "rs232", false);
    return r && r.message;
  }, [num, txt]);
  const etatSel = (num, n) => ad.evaluate(([num, n]) => { const m = BA.Store.get().machines.find(x => x.num === num); const x = m && BA.Model.sel(m, n); return x ? { price: x.price, type: x.type, cap: x.cap, mp: x.mp } : null; }, [num, n]);
  const journal = (num, k) => ad.evaluate(([num, k]) => (BA.Store.get().journal || []).filter(e => e.n === num && e.k === k).map(e => ({ s: e.s, p: e.p, p0: e.p0, w: e.w, b: e.b, y: e.y, c: e.c })), [num, k]);
  const alertes = (num, code) => ad.evaluate(([num, code]) => BA.Store.get().events.filter(e => e.num === num && e.code === code).map(e => ({ d: e.data, r: e.resolved })), [num, code]);

  console.log("== 1. Lecture du prix dans le relevé (ligne PA1)");
  const lu = await ad.evaluate(() => {
    const a = BA.EvaDts.parse(["DXS*FAS1*VA*V1/6*1", "ID1*FAS1*FASTER", "VA1*290*1*0*0", "PA1*11*10*1100*0**1**0*99", "PA2*1*290*1*290", "PA1*14*0*1400", "PA2*0*0*0", "PA1*7", "PA2*0*0*0", "DXE*1*1"].join("\r\n"));
    const d = BA.EvaDts.parse(["DXS*1234567890*VA*V1/1", "ID1*FAS00000001*480", "VA1*0*0*0*0", "PA1*1*270", "PA2***1389", "DXE*1*1"].join("\r\n"));
    const au = BA.EvaDts.toAudit(a), ad = BA.EvaDts.toAudit(d);
    return { a: au.selections.map(x => [x.selection, x.price]), d: ad.selections.map(x => [x.selection, x.price]), compat: a.selections.map(x => x.price) };
  });
  ok("Power Lift : sélection 11 à 0,10 €, sélection 14 à 0 €, champ absent → inconnu", JSON.stringify(lu.a) === JSON.stringify([["7", null], ["11", 0.1], ["14", 0]]), lu);
  ok("FAS 480 (DEX) : sélection 1 à 2,70 €", JSON.stringify(lu.d) === JSON.stringify([["1", 2.7]]), lu);
  ok("ancien champ « price » inchangé (0 € → vide)", JSON.stringify(lu.compat) === JSON.stringify([null, 0.1, null]), lu);

  console.log("== 2. Machine #4 sans sélection : première connexion");
  const m4a = await lire(4, releve("FAS202164170", [{ n: 11, p: 0, c: 164, v: 47000 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 0, c: 135, v: 39150 }]));
  const sels4 = await ad.evaluate(() => BA.Store.get().machines.find(x => x.num === 4).sels.map(x => [x.n, x.type, x.cap, x.price]));
  ok("relevé accepté (« premier relevé »)", /premier|point de départ|départ/i.test(m4a || ""), m4a);
  ok("sélections 11 et 19 créées (la 14 n'a jamais vendu : pas créée)", JSON.stringify(sels4.map(x => x[0])) === "[11,19]", sels4);
  ok("type et capacité les plus courants : 11 = gris ×3 ; 19 = blanc ×3 (1er trouvé à égalité)", JSON.stringify(sels4) === JSON.stringify([[11, "gris", 3, 2.5], [19, "blanc", 3, 2.5]]), sels4);
  const sm = await alertes(4, "SELS_FROM_MACHINE");
  ok("alerte « 2 sélections ajoutées d'après la machine (11, 19) » à vérifier", sm.length === 1 && sm[0].d.total === 2 && sm[0].d.msg === "11, 19" && sm[0].r === false, sm);
  const add4 = await journal(4, "seladd");
  ok("Historique : 2 sélections ajoutées par le « Distributeur »", add4.length === 2 && add4.every(e => e.b === "sim"), add4);
  ok("prix machine 0 € : aucun prix changé", (await journal(4, "price")).length === 0, await journal(4, "price"));

  console.log("== 3. Une vente payée 2,90 € (prix machine 0 €) et prix de la 19 changé dans la machine (3,10 €)");
  await lire(4, releve("FAS202164170", [{ n: 11, p: 0, c: 165, v: 47290 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 310, c: 135, v: 39150 }]));
  const p4 = await journal(4, "price");
  ok("sélection 11 : 2,50 → 2,90 € « prix payé à la dernière vente »", (await etatSel(4, 11)).price === 2.9 && p4.some(e => e.s === 11 && e.p === 2.9 && e.p0 === 2.5 && e.w === "v"), p4);
  ok("sélection 19 : 2,50 → 3,10 € « prix réglé dans la machine »", (await etatSel(4, 19)).price === 3.1 && p4.some(e => e.s === 19 && e.p === 3.1 && e.w === "m"), p4);
  const pc = await alertes(4, "PRICE_CHANGED");
  ok("Alertes : « Prix modifié — sélection 19 » (déjà réglée), rien pour la vente", pc.length === 1 && pc[0].d.sel === 19 && pc[0].d.from === 2.5 && pc[0].d.to === 3.1 && pc[0].r === true, pc);

  console.log("== 4. Prix changé dans la machine SANS vente (relevé identique) : 0,10 € sur la 11, puis une vente payée 2,90 €");
  await lire(4, releve("FAS202164170", [{ n: 11, p: 10, c: 165, v: 47290 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 310, c: 135, v: 39150 }]));
  ok("sélection 11 : 0,10 € tout de suite (même sans vente)", (await etatSel(4, 11)).price === 0.1, await etatSel(4, 11));
  await lire(4, releve("FAS202164170", [{ n: 11, p: 10, c: 166, v: 47580 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 310, c: 135, v: 39150 }]));
  ok("le client a payé 2,90 € : la plateforme suit le prix vraiment payé", (await etatSel(4, 11)).price === 2.9, await etatSel(4, 11));
  await lire(4, releve("FAS202164170", [{ n: 11, p: 10, c: 166, v: 47580 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 310, c: 136, v: 39460 }]));
  ok("relevé suivant, prix machine inchangé (0,10 €) : rien ne bouge (pas d'aller-retour)", (await etatSel(4, 11)).price === 2.9 && (await etatSel(4, 19)).price === 3.1, [await etatSel(4, 11), await etatSel(4, 19)]);
  await lire(4, releve("FAS202164170", [{ n: 11, p: 10, c: 168, v: 48160 }, { n: 14, p: 0, c: 0, v: 0 }, { n: 19, p: 310, c: 136, v: 39460 }]));
  ok("deux ventes d'un coup : la moyenne n'est pas prise (2,90 € reste)", (await etatSel(4, 11)).price === 2.9, await etatSel(4, 11));

  console.log("== 5. FAS 480 (DEX) déjà en service : 2,70 € repris à la première lecture");
  await lire(3, releve("FAS00000001", [{ n: 11, p: 270, c: 0, v: null }, { n: 19, p: 270, c: 0, v: null }, { n: 21, p: 350, c: 0, v: null }]));
  const s3 = [await etatSel(3, 11), await etatSel(3, 19), await etatSel(3, 21)];
  ok("sélections 11 et 19 : 2,50 → 2,70 € ; 21 : 3,50 € (déjà juste)", s3[0].price === 2.7 && s3[1].price === 2.7 && s3[2].price === 3.5, s3);
  const j3 = await journal(3, "price");
  ok("Historique : 2 lignes « prix réglé dans la machine », pas d'alerte à la première lecture", j3.length === 2 && j3.every(e => e.w === "m") && (await alertes(3, "PRICE_CHANGED")).length === 0, j3);
  ok("machine qui avait déjà ses sélections : rien n'est ajouté", (await alertes(3, "SELS_FROM_MACHINE")).length === 0 && (await ad.evaluate(() => BA.Store.get().machines.find(x => x.num === 3).sels.length)) === 3);

  console.log("== 6. Un relevé plus ancien ne remplace pas un prix plus récent");
  const vieux = await ad.evaluate(([t, txt]) => {
    BA.Store.update(s => BA.Reel.setTotals(s, 3, BA.EvaDts.toAudit(BA.EvaDts.parse(txt)), t));
    return BA.Model.sel(BA.Store.get().machines.find(x => x.num === 3), 11).price;
  }, [NOW - 30 * MIN, releve("FAS00000001", [{ n: 11, p: 250, c: 0, v: null }])]);
  ok("relevé de 30 min plus tôt (clé USB importée après) à 2,50 € : 2,70 € reste", vieux === 2.7, vieux);

  console.log("== 7. Prix changé à la main, puis relevés (machine #5, sélection 21 : 3,50 €)");
  // relevé à t (setTotals : chemin des relevés sans vente) → prix de la sélection 21 de la machine #5
  const r5 = (t, p) => ad.evaluate(([t, txt]) => {
    BA.Store.update(s => BA.Reel.setTotals(s, 5, BA.EvaDts.toAudit(BA.EvaDts.parse(txt)), t));
    return BA.Model.sel(BA.Store.get().machines.find(x => x.num === 5), 21).price;
  }, [t, releve("FAS00000005", [{ n: 21, p, c: 0, v: null }])]);
  ok("relevé à 10:40, machine à 3,50 € : rien ne change", (await r5(NOW - 20 * MIN, 350)) === 3.5);
  await ad.evaluate(() => BA.Actions.updateSelection(5, 21, { price: 3.6 }));          // à la main à 11:00
  ok("relevé de 10:55 traité APRÈS le changement à la main (4,00 € dans la machine) : 3,60 € reste", (await r5(NOW - 5 * MIN, 400)) === 3.6);
  ok("relevé de 11:10, prix machine inchangé (4,00 €) : le choix fait à la main (3,60 €) reste", (await r5(NOW + 10 * MIN, 400)) === 3.6);
  ok("prix changé de nouveau dans la machine à 11:20 (4,20 €) : repris", (await r5(NOW + 20 * MIN, 420)) === 4.2);
  const vieux2 = await r5(NOW - 60 * MIN, 100);
  ok("relevé d'1 h plus tôt (1,00 €) : ignoré", vieux2 === 4.2, vieux2);

  console.log("== 8. Écrans : Historique et Alertes (FR, NL, EN), appli opérateur");
  await ad.evaluate(() => { BA.Shell.go("history"); }); await sleep(800);
  const hist = await ad.innerText("#view-history");
  ok("Historique : « prix réglé dans la machine » et « prix payé à la dernière vente », par « Distributeur »", /prix réglé dans la machine/.test(hist) && /prix payé à la dernière vente/.test(hist) && /Distributeur/.test(hist), hist.slice(0, 600));
  await ad.screenshot({ path: path.join(OUT, "historique-prix.png") });
  await ad.evaluate(() => { BA.Shell.go("alerts"); }); await sleep(800);
  const al = await ad.innerText("#view-alerts");
  ok("Alertes : « 2 sélections ajoutées d'après la machine » avec l'explication", /2 sélections ajoutées d'après la machine/.test(al) && /11, 19/.test(al) && /Détails machine/.test(al), al.slice(0, 600));
  await ad.screenshot({ path: path.join(OUT, "alertes.png") });
  for (const [l, re1, re2] of [["nl", /prijs ingesteld in de automaat/, /selecties toegevoegd volgens de automaat/], ["en", /price set in the machine/, /selections added from the machine/]]) {
    await ad.evaluate(l => { BA.I18n.set(l, "admin"); BA.Shell.build(); BA.Shell.go("history"); }, l); await sleep(600);
    const h = await ad.innerText("#view-history");
    await ad.evaluate(() => BA.Shell.go("alerts")); await sleep(600);
    const a = await ad.innerText("#view-alerts");
    ok(l.toUpperCase() + " : Historique et Alertes traduits", re1.test(h) && re2.test(a), [h.slice(0, 200), a.slice(0, 200)]);
  }
  await ad.evaluate(() => { BA.I18n.set("fr", "admin"); BA.Shell.build(); });
  const op = await ctx.newPage(); await login(op, "operateur.html");
  ok("appli opérateur : s'ouvre normalement", await op.evaluate(() => !!BA.Shell && !!document.querySelector("#app-tabbar [data-view]")));

  ok("aucune erreur JavaScript", errs.length === 0, errs);
  await browser.close(); srv.close();
  console.log(ko ? "v5.33.1 : " + ko + " ÉCHEC(S)" : "v5.33.1 : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
