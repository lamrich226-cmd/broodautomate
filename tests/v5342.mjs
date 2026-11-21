import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "x.js"))("playwright");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v5342")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": f.endsWith(".js") ? "application/javascript; charset=utf-8" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";

// v5.34.2 : le capteur de la machine fait foi pour la porte, même pendant un « Remplir » encore ouvert.
// Avant : un « Remplir » commencé puis oublié gardait la machine « porte ouverte » (jusqu'à 4 h) alors que la porte était fermée.
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const b = await chromium.launch(), errs = [];
const ctx = await b.newContext({ locale: "fr-BE", viewport: { width: 1366, height: 800 } });
for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
await p.goto(U + "index.html?demo&tick=0"); await p.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await p.waitForTimeout(2000);
console.log("== Porte : le capteur fait foi");
// machine du démo sans porte ouverte au départ
const num = await p.evaluate(() => { const s = BA.Store.get(); const m = s.machines.find(x => !x.door); BA.Actions.startIntervention(m.num); return m.num; });
const etat = () => p.evaluate(n => { const s = BA.Store.get(), m = s.machines.find(x => x.num === n); return { door: !!m.door, open: s.interventions.some(i => i.num === n && i.status === "open"), alertes: s.events.filter(e => e.num === n && e.code === "DOOR_OPEN" && !e.resolved).length, id: m.id }; }, num);
const e0 = await etat();
ok("« Remplir » commencé : porte notée ouverte, intervention ouverte, 1 alerte", e0.door && e0.open && e0.alertes === 1, e0);
const serveur = (o) => p.evaluate(([n, o]) => { const s0 = BA.Store.get(), m = s0.machines.find(x => x.num === n); return BA.Store.update(st => BA.Reel.portes(st, [{ m: m.id, o, d: new Date().toISOString() }]), false, { derived: true }); }, [num, o]);
await serveur(false);
const e1 = await etat();
ok("le serveur (capteur) dit « fermée » : porte fermée MÊME avec le « Remplir » ouvert", !e1.door && e1.open, e1);
ok("l'alerte « Porte ouverte » est résolue, le « Remplir » reste ouvert", e1.alertes === 0 && e1.open, e1);
await serveur(true);
const e2 = await etat();
ok("le capteur dit « ouverte » : porte ouverte de nouveau, 1 alerte", e2.door && e2.alertes === 1 && e2.open, e2);
await serveur(false);
const e3 = await etat();
ok("refermée par le capteur : fermée, 0 alerte, « Remplir » toujours ouvert", !e3.door && e3.alertes === 0 && e3.open, e3);
// lecture complète (RS232 / 4G) avec « porte fermée » : même règle
await p.evaluate(n => BA.Store.update(st => { const m = st.machines.find(x => x.num === n); m.door = true; BA.Model.addEvent(st, n, "DOOR_OPEN", {}); }), num);
const plan = await p.evaluate(n => { const s = BA.Store.get(), m = s.machines.find(x => x.num === n); return BA.Reel.portesPlan(s, [{ m: m.id, o: false, d: new Date().toISOString() }]).map(c => c.open); }, num);
ok("plan : fermer la porte même avec un « Remplir » ouvert", plan.length === 1 && plan[0] === false, plan);
ok("aucune erreur JavaScript", errs.length === 0, errs);
await b.close(); srv.close();
console.log(bad ? "\nv5.34.2 : " + bad + " ÉCHEC(S)" : "\nv5.34.2 : TOUT EST OK"); process.exit(bad ? 1 : 0);
