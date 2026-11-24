import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "x.js"))("playwright");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v5345")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": f.endsWith(".js") ? "application/javascript; charset=utf-8" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";

// v5.34.5 : alerte « Machine X : plus de pain gris » (rupture d'un TYPE de pain) au lieu de « Sélection N vide ».
// Une sélection vide n'est pas un problème tant qu'une autre sélection du même pain en a encore.
// Données inventées (mode démo) : aucune vraie donnée n'est lue ni modifiée.
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const b = await chromium.launch(), errs = [];
const ctx = await b.newContext({ locale: "fr-BE", viewport: { width: 1366, height: 860 } });
for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
await p.goto(U + "index.html?demo&tick=0"); await p.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await p.waitForTimeout(2000);

// Une machine du démo (porte fermée, courant OK). Disposition fixe : 3 × gris, 2 × blanc, 1 × MAYA (une seule sélection), le reste en complet.
const num = await p.evaluate(() => BA.Store.get().machines.find(x => !x.door && !x.power && x.sels.length >= 12).num);
const sels = await p.evaluate(n => BA.Store.get().machines.find(x => x.num === n).sels.map(x => x.n), num);
const G = sels.slice(0, 3), BL = sels.slice(3, 5), MA = sels[5];
const selAvant = await p.evaluate(() => BA.Store.get().events.filter(e => e.code === "SEL_EMPTY").map(e => e.id));
// stock : { numéro de sélection: quantité } (2 pains par défaut)
const setup = stock => p.evaluate(([n, stock]) => BA.Store.update(s => {
  const m = s.machines.find(x => x.num === n);
  m.door = false; m.power = false; m.link = true; m.lastSeen = s.now;
  m.sels.forEach((sel, i) => {
    sel.type = i < 3 ? "gris" : i < 5 ? "blanc" : i === 5 ? "maya" : "complet";
    const q = stock && stock[sel.n] != null ? stock[sel.n] : 2;
    sel.lots = q > 0 ? [{ id: s.seq++, qty: q, date: s.now - 3600000, kept: false }] : [];
  });
  s.events = s.events.filter(e => e.num !== n);           // départ propre pour cette machine (alertes inventées du démo)
  s.interventions = s.interventions.filter(x => x.num !== n);
}), [num, stock || {}]);
// Ventes reçues de la machine (comme un relevé du boîtier) : { sélection: nombre }
const vend = (ventes, dt = 60000) => p.evaluate(([n, ventes, dt]) => BA.Store.update(s => {
  s.now += dt;
  const par = Object.entries(ventes).map(([sel, k]) => ({ selection: String(sel), delta: k, deltaValue: 2.5 * k }));
  const tot = par.reduce((a, x) => a + x.delta, 0);
  BA.Reel.applyAudit(s, n, { t: s.now, src: "4g", analyse: { events: [] }, audit: { errors: [], total_count: 1000 + tot }, ancien: { total_count: 1000 },
    diff: { baseline: false, anomalies: false, identique: false, deltaCount: tot, deltaValue: 2.5 * tot, parSelection: par, ecartSelections: 0 }, nv: { eva: [], fas: [], pow: [], activations: [], temp: [] } });
}), [num, ventes, dt]);
const entretien = () => p.evaluate(() => BA.Store.update(s => BA.Live._housekeepAll(s), false, { derived: true }));
const alertes = () => p.evaluate(n => BA.Store.get().events.filter(e => e.num === n && !e.resolved).map(e => ({ code: e.code, type: e.data && e.data.type, sels: e.data && e.data.sels })), num);
const ouvertes = async code => (await alertes()).filter(e => e.code === code);
const etat = () => p.evaluate(n => { const s = BA.Store.get(), x = BA.Model.stats(s, s.machines.find(m => m.num === n)); return { st: x.st, out: x.typesOut }; }, num);
const texte = code => p.evaluate(([n, code]) => { const s = BA.Store.get(), e = s.events.find(x => x.num === n && x.code === code && !x.resolved); if (!e) return null;
  const d = document.createElement("div"); d.innerHTML = BA.UI.eventHtml(s, e, false); return { titre: BA.UI.evTitle(s, e), tout: d.innerText }; }, [num, code]);
const carte = async () => { await p.evaluate(() => BA.Shell.go("dashboard")); await p.waitForTimeout(400); const c = await p.$(`.carte-machine[data-machine="${num}"]`); return c ? c.innerText() : ""; };

console.log("== 1. Une sélection vide, le même pain dans d'autres sélections : PAS d'alerte");
await setup({ [G[0]]: 1 }); await vend({ [G[0]]: 1 });
ok("la sélection " + G[0] + " (gris) est à 0, les 2 autres gris ont du pain", (await p.evaluate(([n, g]) => BA.Model.qty(BA.Store.get().machines.find(x => x.num === n).sels.find(x => x.n === g)), [num, G[0]])) === 0);
ok("aucune alerte de stock (ni « sélection vide », ni « plus de pain »)", (await alertes()).filter(e => /EMPTY/.test(e.code)).length === 0, await alertes());
let e = await etat();
ok("état de la machine : OK (pas « pain en rupture »)", e.st === "ok" && e.out.length === 0, e);
ok("carte du tableau de bord : pas de puce « Plus de »", !/Plus de/.test(await carte()), await carte());

console.log("== 2. Tous les gris à 0 : UNE alerte « Plus de pain gris »");
await setup({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 }); await vend({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 });
let te = await ouvertes("TYPE_EMPTY");
ok("une seule alerte, pour le pain gris, avec ses 3 sélections", te.length === 1 && te[0].type === "gris" && JSON.stringify(te[0].sels) === JSON.stringify(G), te);
ok("pas d'alerte « Sélection N vide »", (await ouvertes("SEL_EMPTY")).length === 0);
let tx = await texte("TYPE_EMPTY");
ok("titre « Plus de pain gris »", tx && tx.titre === "Plus de pain gris", tx);
ok("détail : « Les sélections … sont toutes vides : la machine n'a plus de pain gris à vendre »", tx && tx.tout.includes("Les sélections " + G.join(", ") + " sont toutes vides : la machine n'a plus de pain gris à vendre."), tx);
e = await etat();
ok("état de la machine : « low » (pain en rupture), gris en rupture", e.st === "low" && JSON.stringify(e.out) === '["gris"]', e);
let c = await carte();
ok("carte : puce « Plus de : pain gris » et état « Pain en rupture »", /Plus de : pain gris/.test(c) && /Pain en rupture/.test(c), c);
await p.mouse.move(1350, 850); await p.waitForTimeout(500);     // souris hors du menu (il s'ouvre au survol)
const cm = await p.$(`.carte-machine[data-machine="${num}"]`); await cm.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
await cm.screenshot({ path: path.join(OUT, "1-carte-plus-de-pain-gris.png") });

console.log("== 2b. Les autres états gardent leur priorité (pains à retirer avant « pain en rupture »)");
await p.evaluate(([n, b0]) => BA.Store.update(s => { s.machines.find(x => x.num === n).sels.find(x => x.n === b0).lots.push({ id: s.seq++, qty: 1, date: s.now - 60 * 3600000, kept: false }); }), [num, BL[0]]);
e = await p.evaluate(n => { const s = BA.Store.get(), x = BA.Model.stats(s, s.machines.find(m => m.num === n)); return { st: x.st, out: x.typesOut, rm: x.toRemove }; }, num);
ok("un pain de plus de 48 h en plus : état « remove » (à retirer), le gris reste noté en rupture", e.st === "remove" && e.rm === 1 && JSON.stringify(e.out) === '["gris"]', e);
await p.evaluate(([n, b0]) => BA.Store.update(s => { const sel = s.machines.find(x => x.num === n).sels.find(x => x.n === b0); sel.lots = sel.lots.filter(l => l.date > s.now - 48 * 3600000); }), [num, BL[0]]);
e = await etat();
ok("pain trop vieux retiré : de nouveau « low » (pain en rupture)", e.st === "low", e);

console.log("== 3. Pas de doublon, MAYA (une seule sélection) : « La sélection N est vide »");
await vend({ [BL[0]]: 1 });
ok("autre vente (blanc) : toujours une seule alerte « gris »", (await ouvertes("TYPE_EMPTY")).length === 1);
await vend({ [MA]: 2 });
te = await ouvertes("TYPE_EMPTY");
ok("MAYA vendu jusqu'à 0 : 2e alerte, pour le MAYA (sélection " + MA + ")", te.length === 2 && te.some(x => x.type === "maya" && JSON.stringify(x.sels) === JSON.stringify([MA])), te);
tx = await p.evaluate(([n]) => { const s = BA.Store.get(), ev = s.events.find(x => x.num === n && x.code === "TYPE_EMPTY" && !x.resolved && x.data.type === "maya"); const d = document.createElement("div"); d.innerHTML = BA.UI.eventHtml(s, ev, false); return { titre: BA.UI.evTitle(s, ev), tout: d.innerText }; }, [num]);
ok("titre « Plus de pain MAYA » (sigle gardé en majuscules)", tx.titre === "Plus de pain MAYA", tx);
ok("détail au singulier : « La sélection " + MA + " est vide »", tx.tout.includes("La sélection " + MA + " est vide : la machine n'a plus de pain MAYA à vendre."), tx);
c = await carte();
ok("carte : « Plus de : pain gris, pain MAYA »", /Plus de : pain gris, pain MAYA/.test(c), c);
await p.evaluate(n => { BA.Shell.state.alertMachine = n; BA.Shell.go("alerts"); }, num); await p.mouse.move(1350, 850); await p.waitForTimeout(600);
const pageAl = await p.innerText("#view-alerts").catch(() => p.innerText("main"));
ok("page Alertes : les deux alertes sont listées", /Plus de pain gris/.test(pageAl) && /Plus de pain MAYA/.test(pageAl), pageAl.slice(0, 400));
await p.screenshot({ path: path.join(OUT, "2-page-alertes.png") });

console.log("== 4. Réglée dès que le pain revient");
await p.evaluate(([n, g]) => BA.Store.update(s => { const sel = s.machines.find(x => x.num === n).sels.find(x => x.n === g); sel.lots.push({ id: s.seq++, qty: 3, date: s.now, kept: false }); }), [num, G[1]]);
await entretien();
te = await ouvertes("TYPE_EMPTY");
ok("3 gris chargés dans la " + G[1] + " : « Plus de pain gris » réglée, MAYA toujours là", te.length === 1 && te[0].type === "maya", te);
ok("l'alerte gris est dans l'historique (réglée), pas effacée", await p.evaluate(n => BA.Store.get().events.some(x => x.num === n && x.code === "TYPE_EMPTY" && x.data.type === "gris" && x.resolved), num));

console.log("== 5. La machine vend un pain que l'appli croit fini : « stock inconnu » prend le relais");
await setup({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 }); await vend({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 });
ok("départ : « Plus de pain gris » ouverte", (await ouvertes("TYPE_EMPTY")).length === 1);
await vend({ [G[0]]: 1 });
const su = await ouvertes("STOCK_UNKNOWN");
ok("vente sur la " + G[0] + " (0 pour l'appli) : alerte « stock inconnu » pour cette sélection", su.length === 1 && JSON.stringify(su[0].sels) === JSON.stringify([G[0]]), su);
ok("« Plus de pain gris » réglée (la machine a prouvé qu'elle en a)", (await ouvertes("TYPE_EMPTY")).length === 0, await alertes());
await vend({ [G[1]]: 1 });
ok("vente sur une autre sélection de gris : pas de nouvelle « Plus de pain gris » tant que le stock est à vérifier", (await ouvertes("TYPE_EMPTY")).length === 0, await alertes());

console.log("== 6. Machine entièrement vide : UNE alerte « Machine vide », pas une par pain");
const vide = {}; sels.forEach(n => { vide[n] = 0; }); vide[BL[1]] = 1;
await setup(vide); await vend({ [BL[1]]: 1 });
ok("dernier pain vendu : « Machine vide »", (await ouvertes("MACHINE_EMPTY")).length === 1, await alertes());
ok("aucune alerte « Plus de pain … » en plus", (await ouvertes("TYPE_EMPTY")).length === 0, await alertes());
e = await etat();
ok("état « empty » (machine vide), pas « low »", e.st === "empty", e);

console.log("== 7. Réglages des sélections");
await setup();
let r = await p.evaluate(n => BA.Actions.addSelection(n, { n: 99, type: "sandwich", cap: 3, price: 4 }), num);
te = await ouvertes("TYPE_EMPTY");
ok("nouvelle sélection 99 « sandwich » (ce pain n'est nulle part ailleurs) : « Plus de sandwich »", !r && te.length === 1 && te[0].type === "sandwich" && JSON.stringify(te[0].sels) === "[99]", { r, te });
tx = await texte("TYPE_EMPTY");
ok("titre « Plus de sandwich »", tx && tx.titre === "Plus de sandwich", tx);
r = await p.evaluate(n => BA.Actions.removeSelection(n, 99), num); await entretien();
ok("sélection 99 supprimée : alerte réglée", !r && (await ouvertes("TYPE_EMPTY")).length === 0, { r, a: await alertes() });
r = await p.evaluate(n => BA.Actions.addSelection(n, { n: 97, type: "__new", newType: "Multiduvel", cap: 3, price: 4 }), num);
tx = await texte("TYPE_EMPTY");
ok("pain écrit par l'utilisateur (« Multiduvel ») : nom gardé tel quel, « Plus de Multiduvel »", !r && tx && tx.titre === "Plus de Multiduvel" && tx.tout.includes("La sélection 97 est vide : la machine n'a plus de Multiduvel à vendre."), { r, tx });
await p.evaluate(n => BA.Actions.removeSelection(n, 97), num); await entretien();
await p.evaluate(n => BA.Actions.addSelection(n, { n: 98, type: "gris", cap: 3, price: 3 }), num);
ok("nouvelle sélection vide d'un pain qui reste ailleurs (gris) : pas d'alerte", (await ouvertes("TYPE_EMPTY")).length === 0, await alertes());
await setup({ [BL[0]]: 0 });
r = await p.evaluate(([n, s2]) => BA.Actions.updateSelection(n, s2, { type: "complet" }), [num, BL[1]]);
te = await ouvertes("TYPE_EMPTY");
ok("la " + BL[1] + " passe de blanc à complet, la " + BL[0] + " (blanc) est vide : « Plus de pain blanc »", !r && te.length === 1 && te[0].type === "blanc", { r, te });

console.log("== 8. Anciennes alertes « Sélection N vide » : lisibles, plus jamais créées");
const vieux = await p.evaluate(n => { let id; BA.Store.update(s => { id = s.seq++; s.events.push({ id, t: s.now - 86400000, num: n, code: "SEL_EMPTY", cat: "stock", level: "warn", key: "s11", data: { sel: 11, type: "gris" }, resolved: true, resolvedAt: s.now, archived: false }); });
  const s = BA.Store.get(); return BA.UI.evTitle(s, s.events.find(x => x.id === id)); }, num);
ok("une ancienne alerte « Sélection 11 vide » s'affiche toujours", vieux === "Sélection 11 vide", vieux);
const selApres = await p.evaluate(() => BA.Store.get().events.filter(e => e.code === "SEL_EMPTY").map(e => e.id));
ok("aucune nouvelle alerte « Sélection N vide » créée pendant tout l'essai (seule celle ajoutée à la main)", selApres.filter(id => !selAvant.includes(id)).length === 1, selApres.length - selAvant.length);

console.log("== 9. Néerlandais et anglais");
await setup({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 }); await vend({ [G[0]]: 1, [G[1]]: 1, [G[2]]: 1 });
const langues = await p.evaluate(n => { const s = BA.Store.get(), ev = s.events.find(x => x.num === n && x.code === "TYPE_EMPTY" && !x.resolved), out = {}, l0 = BA.I18n.lang;
  ["nl", "en", "fr"].forEach(l => { BA.I18n.lang = l; const d = document.createElement("div"); d.innerHTML = BA.UI.eventHtml(s, ev, false); out[l] = { t: BA.UI.evTitle(s, ev), d: d.innerText }; });
  BA.I18n.lang = l0; return out; }, num);
ok("NL : « Geen grijs brood meer »", langues.nl.t === "Geen grijs brood meer" && /De selecties .* zijn allemaal leeg: de automaat heeft geen grijs brood meer te verkopen\./.test(langues.nl.d), langues.nl);
ok("EN : « No brown bread left »", langues.en.t === "No brown bread left" && /Selections .* are all empty: the machine has no brown bread left to sell\./.test(langues.en.d), langues.en);
ok("textes FR/NL/EN présents", await p.evaluate(() => ["fr", "nl", "en"].every(l => ["ev_TYPE_EMPTY", "evd_TYPE_EMPTY", "chip_types_out", "st_low"].every(k => BA.I18n.dicts[l][k]))));

console.log("== 10. Opérateur (téléphone) : « À faire » et Alertes");
const ctx2 = await b.newContext({ locale: "fr-BE", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
for (const [u, f] of Object.entries(LIB)) await ctx2.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
const o = await ctx2.newPage(); o.on("pageerror", e => errs.push("opérateur : " + e.message));
await o.goto(U + "operateur.html?demo&tick=0"); await o.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await o.waitForTimeout(2000);
await o.evaluate(([n, G]) => BA.Store.update(s => {
  s.machines.forEach(m => { m.door = false; m.power = false; m.link = true; m.lastSeen = s.now; m.sels.forEach(sel => { sel.lots = [{ id: s.seq++, qty: 2, date: s.now - 3600000, kept: false }]; }); });
  s.events = []; s.interventions = [];
  const m = s.machines.find(x => x.num === n);
  m.sels.forEach((sel, i) => { sel.type = i < 3 ? "gris" : i < 5 ? "blanc" : i === 5 ? "maya" : "complet"; if (i < 3) sel.lots = [{ id: s.seq++, qty: 1, date: s.now - 3600000, kept: false }]; });
  s.now += 60000;
  BA.Reel.applyAudit(s, n, { t: s.now, src: "4g", analyse: { events: [] }, audit: { errors: [], total_count: 1003 }, ancien: { total_count: 1000 },
    diff: { baseline: false, anomalies: false, identique: false, deltaCount: 3, deltaValue: 7.5, parSelection: G.map(g => ({ selection: String(g), delta: 1, deltaValue: 2.5 })), ecartSelections: 0 }, nv: { eva: [], fas: [], pow: [], activations: [], temp: [] } });
}), [num, G]);
await o.evaluate(() => BA.Shell.go("todo")); await o.waitForTimeout(600);
const todo = await o.innerText("#view-todo").catch(() => o.innerText("main"));
ok("« À faire » : la machine #" + num + " est listée avec « Pain en rupture » et « Plus de : pain gris »", todo.includes("#" + num) && /Pain en rupture/.test(todo) && /Plus de : pain gris/.test(todo), todo.slice(0, 500));
await o.screenshot({ path: path.join(OUT, "3-operateur-a-faire.png") });
await o.evaluate(() => BA.Shell.go("alerts")); await o.waitForTimeout(600);
const alOp = await o.innerText("#view-alerts").catch(() => o.innerText("main"));
ok("Alertes de l'opérateur : « Plus de pain gris » (machine #" + num + ")", /Plus de pain gris/.test(alOp) && alOp.includes("#" + num), alOp.slice(0, 400));
await o.screenshot({ path: path.join(OUT, "4-operateur-alertes.png") });

ok("aucune erreur JavaScript", errs.length === 0, errs);
await b.close(); srv.close();
console.log(bad ? "\nv5.34.5 : " + bad + " ÉCHEC(S)" : "\nv5.34.5 : TOUT EST OK"); process.exit(bad ? 1 : 0);
