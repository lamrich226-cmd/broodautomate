// Test de la fonction « conso-1nce » (consommation exacte de la carte 1NCE) : fausse API 1NCE, aucun identifiant réel.
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/conso-1nce/index.ts"), "utf8");
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-conso-"));
fs.writeFileSync(path.join(dir, "pur.ts"), src.slice(a, b) + "\nexport { enKo, jours, interroger };\n");
const { enKo, jours, interroger } = await import(path.join(dir, "pur.ts"));
ok("Mo → Ko (0,0123 Mo = 12,3 Ko ; invalide = null)", enKo("0.0123") === 12.3 && enKo("0.00016") === 0.2 && enKo("abc") === null && enKo(-1) === null);
const usage = { stats: [{ date: "2026-11-12T00:00:00.000Z", data: { volume: "0.0100", volume_rx: "0.0040", volume_tx: "0.0060" } }, { date: "2026-11-13T00:00:00.000Z", data: { volume: "0.0521", volume_rx: "0.0200", volume_tx: "0.0321" } }] };
const j = jours(usage);
ok("jours triés du plus récent, en Ko", j.length === 2 && j[0].date === "2026-11-13" && j[0].ko === 52.1 && j[0].rx === 20 && j[0].tx === 32.1 && j[1].ko === 10, j);
ok("réponse vide ou bizarre → liste vide", jours({}).length === 0 && jours(null).length === 0);
const appels: string[] = [];
const f = (opts: { jeton?: number; usage?: number } = {}) => (async (url: string, init: any) => {
  appels.push(String(url));
  if (String(url).endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "JETON_FAUX" }), { status: opts.jeton || 200 });
  if (String(url).includes("/usage")) return new Response(JSON.stringify(usage), { status: opts.usage || 200 });
  return new Response(JSON.stringify({ volume: 499.9, total_volume: 500 }), { status: 200 });
}) as unknown as typeof fetch;
let r: any = await interroger(f(), "u", "p", "89882280666680646327", Date.parse("2026-11-13T12:00:00Z"));
ok("consommation + volume restant (Ko)", r.ok && r.jours.length === 2 && r.restantKo === 499900 && r.totalKo === 500000, r);
ok("adresses : jeton, usage du 2026-11-06 au 2026-11-13, quota", appels[0].endsWith("/oauth/token") && appels[1].endsWith("/v1/sims/89882280666680646327/usage?start_dt=2026-11-06&end_dt=2026-11-13") && appels[2].endsWith("/quota/data"), appels);
r = await interroger(f({ jeton: 401 }), "u", "p", "89882280666680646327", Date.now());
ok("identifiants refusés → erreur claire", !r.ok && /jeton/.test(r.erreur), r);
r = await interroger(f({ usage: 403 }), "u", "p", "89882280666680646327", Date.now());
ok("usage refusé → erreur claire", !r.ok && /consommation refusée \(403\)/.test(r.erreur), r);
if (ko) { console.log("\n" + ko + " ÉCHEC(S)"); process.exit(1); } else console.log("\nTOUT EST OK");
