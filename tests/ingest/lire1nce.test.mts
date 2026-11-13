// Test de la fonction « lire-1nce » (bouton « Lire maintenant » instantané, carte 1NCE) : logique pure + fonction complète
// avec un faux Supabase et une fausse API 1NCE (aucun vrai identifiant, aucun appel réseau).
// node --experimental-strip-types --no-warnings tests/ingest/lire1nce.test.mts
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/lire-1nce/index.ts"), "utf8");
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-nce-"));
fs.writeFileSync(path.join(dir, "pur.ts"), src.slice(a, b) + "\nexport { iccidValable, messageBoitier, verifier, envoyerUdp, enBasic };\n");
const { iccidValable, messageBoitier, verifier, envoyerUdp } = await import(path.join(dir, "pur.ts"));
const ICCID = "89882280666680646327", DEV = "dev-1", MAINT = Date.parse("2026-11-13T15:00:00Z");
ok("ICCID : 18 à 20 chiffres", iccidValable(ICCID) && iccidValable("8988228066668064") === false && iccidValable("8988228066668064632a") === false && iccidValable(null) === false);
ok("message : « lire 42 » et « lire 42 b » (flux brut)", messageBoitier({ id: 42 }) === "lire 42" && messageBoitier({ id: 42, brut: true }) === "lire 42 b" && messageBoitier({ id: 42.9 }) === "lire 42");
const dem = { id: 42, device_id: DEV, statut: "attente", cree_at: "2026-11-13T14:59:30Z" };
ok("contrôle : demande en attente, récente, ICCID présent → rien à redire", verifier(dem, { id: DEV, iccid: ICCID }, DEV, MAINT) === "");
ok("contrôle : ICCID manquant", verifier(dem, { id: DEV, iccid: null }, DEV, MAINT) === "iccid manquant");
ok("contrôle : demande d'un autre boîtier / déjà traitée / trop ancienne / inconnue",
  verifier({ ...dem, device_id: "autre" }, { id: DEV, iccid: ICCID }, DEV, MAINT) === "demande d'un autre boîtier" &&
  verifier({ ...dem, statut: "faite" }, { id: DEV, iccid: ICCID }, DEV, MAINT) === "demande déjà traitée" &&
  verifier({ ...dem, cree_at: "2026-11-13T14:50:00Z" }, { id: DEV, iccid: ICCID }, DEV, MAINT) === "demande trop ancienne" &&
  verifier(null, { id: DEV, iccid: ICCID }, DEV, MAINT) === "demande inconnue");

// fausse API 1NCE
type Appel = { url: string; init: any };
function faux(opts: { jeton?: number; udp?: number } = {}) {
  const appels: Appel[] = [];
  const f = async (url: string, init: any) => {
    appels.push({ url: String(url), init });
    if (String(url).endsWith("/oauth/token")) return new Response(JSON.stringify(opts.jeton && opts.jeton !== 200 ? { error: "x" } : { access_token: "JETON_FAUX", expires_in: 3600 }), { status: opts.jeton || 200 });
    return new Response(JSON.stringify({ id: "trx1", message: "ok" }), { status: opts.udp || 202 });
  };
  return { f: f as unknown as typeof fetch, appels };
}
let m = faux(); let r = await envoyerUdp(m.f, "utilisateur", "motdepasse", ICCID, "lire 42");
ok("API 1NCE : jeton puis envoi UDP port 3000 « Send now » à l'ICCID", r.ok && r.id === "trx1" && m.appels.length === 2 && m.appels[0].url.endsWith("/oauth/token") &&
  m.appels[0].init.headers.Authorization === "Basic " + btoa("utilisateur:motdepasse") && m.appels[1].url.endsWith("/v1/integrate/devices/" + ICCID + "/actions/UDP") &&
  m.appels[1].init.headers.Authorization === "Bearer JETON_FAUX" && JSON.parse(m.appels[1].init.body).payload === "lire 42" && JSON.parse(m.appels[1].init.body).port === 3000 && JSON.parse(m.appels[1].init.body).requestMode === "SEND_NOW", m.appels.map(x => x.url));
m = faux({ jeton: 401 }); r = await envoyerUdp(m.f, "u", "p", ICCID, "lire 1");
ok("API 1NCE : identifiants refusés → erreur claire, aucun envoi UDP", !r.ok && /jeton/.test(r.erreur || "") && m.appels.length === 1, r);
m = faux({ udp: 500 }); r = await envoyerUdp(m.f, "u", "p", ICCID, "lire 1");
ok("API 1NCE : envoi refusé → erreur claire", !r.ok && /UDP refusé/.test(r.erreur || ""), r);

// fonction complète (faux Supabase + fausse API, identifiants de la fonction pris dans l'environnement simulé)
const DB: Record<string, any[]> = { devices: [{ id: DEV, iccid: ICCID }, { id: "sans", iccid: null }], ba_demandes: [{ id: 42, device_id: DEV, statut: "attente", cree_at: new Date().toISOString(), brut: false }, { id: 43, device_id: DEV, statut: "attente", cree_at: new Date().toISOString(), brut: true }, { id: 44, device_id: "sans", statut: "attente", cree_at: new Date().toISOString() }] };
const client = { auth: { getUser: async (j: string) => j === "BON_JETON" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "jeton invalide" } } },
  from: (t: string) => { const f: any[] = []; const q: any = { select: () => q, eq: (k: string, v: any) => { f.push((r: any) => r[k] === v); return q; }, maybeSingle: async () => ({ data: (DB[t].find(r => f.every(g => g(r))) ?? null), error: null }) }; return q; } };
(globalThis as any).__fake = { createClient: () => client };
let handler: any = null; const env: Record<string, string> = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', NCE_API_USER: "utilisateur", NCE_API_PASSWORD: "motdepasse" };
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
const api = faux(); (globalThis as any).fetch = api.f;
fs.writeFileSync(path.join(dir, "fn.ts"), src.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";/m, "const { createClient } = (globalThis as any).__fake;"));
await import(path.join(dir, "fn.ts"));
const appel = async (body: unknown, jeton = "BON_JETON", methode = "POST") => { const r = await handler(new Request("https://x/functions/v1/lire-1nce", { method: methode, headers: jeton ? { Authorization: "Bearer " + jeton } : {}, body: methode === "POST" ? JSON.stringify(body) : undefined })); return { s: r.status, j: await r.json().catch(() => ({})) }; };
let x = await appel({ device: DEV, demande: 42 });
ok("fonction : demande n°42 → 200, « lire 42 » envoyé à l'ICCID du boîtier", x.s === 200 && x.j.ok === true && JSON.parse(api.appels[1].init.body).payload === "lire 42", x);
x = await appel({ device: DEV, demande: 43 });
ok("fonction : demande en flux brut → « lire 43 b »", x.s === 200 && JSON.parse(api.appels[3].init.body).payload === "lire 43 b", x);
x = await appel({ device: DEV, demande: 42 }, "");
ok("fonction : sans compte connecté → 401, rien envoyé à 1NCE", x.s === 401 && api.appels.length === 4, x);
x = await appel({ device: DEV, demande: 42 }, "MAUVAIS");
ok("fonction : jeton invalide → 401", x.s === 401, x);
x = await appel({ device: "sans", demande: 44 });
ok("fonction : boîtier sans ICCID → 409 « iccid manquant », rien envoyé", x.s === 409 && x.j.error === "iccid manquant" && api.appels.length === 4, x);
x = await appel({ device: DEV, demande: 44 });
ok("fonction : demande d'un autre boîtier → refusée", x.s === 400 && x.j.error === "demande d'un autre boîtier", x);
x = await appel({ device: DEV });
ok("fonction : demande manquante → 400", x.s === 400, x);
delete env.NCE_API_PASSWORD; x = await appel({ device: DEV, demande: 42 });
ok("fonction : identifiants 1NCE absents → 503, rien envoyé", x.s === 503 && api.appels.length === 4, x);
x = await appel({}, "BON_JETON", "GET");
ok("fonction : GET refusé (405)", x.s === 405, x);
ok("aucun identifiant écrit dans le code de la fonction", !/NCE_API_PASSWORD\s*=\s*["']/.test(src) && !/Basic [A-Za-z0-9+/=]{16,}/.test(src));
if (ko) { console.log("\n" + ko + " ÉCHEC(S)"); process.exit(1); } else console.log("\nTOUT EST OK");
