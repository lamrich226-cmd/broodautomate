// Test de « ingest-udp » (envoi des boîtiers par UDP via le webhook 1NCE) : logique pure + fonction complète avec faux Supabase,
// fausse fonction « ingest ». Données inventées.  node --experimental-strip-types --no-warnings tests/ingest/ingestudp.test.mts
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/ingest-udp/index.ts"), "utf8");
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-udp-"));
fs.writeFileSync(path.join(dir, "pur.ts"), src.slice(a, b) + "\nexport { egal, texteDuPaquet, lireMorceau, recoller, accuser };\n");
const { egal, texteDuPaquet, lireMorceau, recoller, accuser } = await import(path.join(dir, "pur.ts"));
const ICCID = "89882280666680646327", SECRET = "s".repeat(40);
ok("comparaison de secrets", egal("abc", "abc") && !egal("abc", "abd") && !egal("abc", "abcd"));
ok("paquet en texte direct ou en base64", texteDuPaquet({ payload: { type: "STRING", value: "U1|1|0|1|x" } }) === "U1|1|0|1|x" && texteDuPaquet({ payload: { value: btoa("U1|2|0|1|é"), encoding: "base64" } }) !== null && texteDuPaquet({}) === null);
ok("morceau lu : séquence, n°, total, texte (le texte peut contenir des | )", JSON.stringify(lireMorceau("U1|12|1|3|a|b")) === JSON.stringify({ seq: 12, idx: 1, total: 3, data: "a|b" }));
ok("autres messages ignorés (OUVERT…, RECU…, n° hors limites)", lireMorceau("OUVERT v1.5.2 port 3000 signal 31") === null && lireMorceau("RECU lire 14") === null && lireMorceau("U1|1|3|3|x") === null && lireMorceau("U1|1|0|0|x") === null && lireMorceau("U1|1|0|99|x") === null && lireMorceau(null) === null);
ok("recollage dans le désordre, avec un doublon", recoller([{ idx: 2, total: 3, data: "C" }, { idx: 0, total: 3, data: "A" }, { idx: 1, total: 3, data: "B" }, { idx: 0, total: 3, data: "A" }]) === "ABC");
ok("recollage : il en manque → null ; totaux incohérents → null", recoller([{ idx: 0, total: 3, data: "A" }, { idx: 2, total: 3, data: "C" }]) === null && recoller([{ idx: 0, total: 2, data: "A" }, { idx: 1, total: 3, data: "B" }]) === null);

const nce0: any[] = []; const fnce = (async (url: string, init: any) => { nce0.push([String(url), init.body]); return String(url).endsWith("/oauth/token") ? new Response(JSON.stringify({ access_token: "J" })) : new Response("{}", { status: 202 }); }) as unknown as typeof fetch;
ok("accusé : jeton puis « ok 12 » en UDP port 3000, Send now", (await accuser(fnce, "u", "p", ICCID, 12)) === true && nce0.length === 2 && JSON.parse(nce0[1][1]).payload === "ok 12" && JSON.parse(nce0[1][1]).port === 3000 && JSON.parse(nce0[1][1]).requestMode === "SEND_NOW" && nce0[1][0].endsWith("/v1/integrate/devices/" + ICCID + "/actions/UDP"), nce0);
// faux Supabase minimal (tables en mémoire, clés composées)
const T: Record<string, any[]> = { ba_udp_morceaux: [], ba_udp_faits: [], devices: [{ id: "d1", iccid: "89882280666680646327" }], ba_demandes: [{ id: 77, device_id: "d1", statut: "attente" }, { id: 78, device_id: "autre", statut: "attente" }, { id: 79, device_id: "d1", statut: "faite" }] };
class Q { t: string; op = "select"; p: any = null; f: ((r: any) => boolean)[] = []; one = false; conflict = "";
  constructor(t: string) { this.t = t; }
  update(p: any) { this.op = "update"; this.p = p; return this; } in(k: string, vs: any[]) { this.f.push(r => vs.includes(r[k])); return this; }
  select() { return this; } insert(p: any) { this.op = "insert"; this.p = p; return this; } upsert(p: any, o: any) { this.op = "upsert"; this.p = p; this.conflict = o.onConflict; return this; } delete() { this.op = "delete"; return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; } lt(k: string, v: any) { this.f.push(r => String(r[k]) < String(v)); return this; } maybeSingle() { this.one = true; return this; }
  then(res: any) { const tab = T[this.t]; const m = tab.filter(r => this.f.every(g => g(r)));
    if (this.op === "update") { m.forEach(r => Object.assign(r, this.p)); return res({ error: null }); }
    if (this.op === "delete") { T[this.t] = tab.filter(r => !m.includes(r)); return res({ error: null }); }
    if (this.op === "insert") { const keys = Object.keys(this.p).filter(k => k === "iccid" || k === "seq"); if (tab.some(r => keys.every(k => r[k] === this.p[k]))) return res({ error: { message: "doublon" } }); tab.push({ fait_at: new Date().toISOString(), ...this.p }); return res({ error: null }); }
    if (this.op === "upsert") { const ks = this.conflict.split(","); const i = tab.findIndex(r => ks.every(k => r[k] === this.p[k])); const ligne = { recu_at: new Date().toISOString(), ...this.p }; if (i >= 0) tab[i] = ligne; else tab.push(ligne); return res({ error: null }); }
    return res({ data: this.one ? (m[0] ?? null) : m, error: null }); } }
(globalThis as any).__fake = { createClient: () => ({ from: (t: string) => new Q(t) }) };
const env: Record<string, string> = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', INGEST_UDP_SECRET: SECRET };
let handler: any = null; (globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
const transmis: { url: string; secret: string; corps: any }[] = [];
const nce: { url: string; corps: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (String(url).includes("api.1nce.com")) { nce.push({ url: String(url), corps: String(url).endsWith("/oauth/token") ? init.body : JSON.parse(init.body) }); return String(url).endsWith("/oauth/token") ? new Response(JSON.stringify({ access_token: "J" }), { status: 200 }) : new Response("{}", { status: 202 }); }
  transmis.push({ url: String(url), secret: init.headers["x-ba-udp"], corps: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
env.NCE_API_USER = "u"; env.NCE_API_PASSWORD = "p";
fs.writeFileSync(path.join(dir, "fn.ts"), src.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";/m, "const { createClient } = (globalThis as any).__fake;"));
await import(path.join(dir, "fn.ts"));
const envoyer = async (texte: string, opts: { secret?: string; base64?: boolean; iccid?: string | null } = {}) => {
  const corps = { type: "TELEMETRY_DATA", source: "UDP", id: "m" + Math.random(), received: String(Date.now()), version: 1, payload: opts.base64 ? { type: "STRING", value: btoa(unescape(encodeURIComponent(texte))), encoding: "base64" } : { type: "STRING", value: texte }, device: { iccid: opts.iccid === undefined ? ICCID : opts.iccid, imsi: "1", ip: "10.0.0.1" } };
  const r = await handler(new Request("https://x/functions/v1/ingest-udp", { method: "POST", headers: { "x-ba-udp": opts.secret ?? SECRET }, body: JSON.stringify(corps) }));
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const msg = JSON.stringify({ k: "ne-doit-pas-passer", fw: "1.6 1NCE", seq: 5, st: "ok é", stok: true, raw: "DXS*x\r\nDXE*1" });
let x = await envoyer("U1|7|0|1|" + msg);
ok("message en un seul paquet : transmis à ingest avec le secret et le n° de carte, la clé du boîtier retirée", x.s === 200 && transmis.length === 1 && transmis[0].url.endsWith("/functions/v1/ingest") && transmis[0].secret === SECRET && transmis[0].corps.iccid === ICCID && transmis[0].corps.k === undefined && transmis[0].corps.raw === "DXS*x\r\nDXE*1", [x, transmis]);
ok("accusé « ok 7 » renvoyé au boîtier après le traitement", nce.some(n => n.corps && n.corps.payload === "ok 7"), nce);
const nAcc = nce.filter(n => n.corps && n.corps.payload === "ok 7").length;
x = await envoyer("U1|7|0|1|" + msg);
ok("même séquence reçue une 2e fois (1NCE réessaie) : traitée UNE seule fois, mais l'accusé est renvoyé", x.s === 200 && x.j.deja === true && transmis.length === 1 && nce.filter(n => n.corps && n.corps.payload === "ok 7").length === nAcc + 1, [x, transmis.length]);
const m2 = JSON.stringify({ fw: "1.6", seq: 8, st: "ok", raw: "DXS*" + "é".repeat(30) + "\r\nDXE*1" }), c = [m2.slice(0, 30), m2.slice(30, 60), m2.slice(60)];
x = await envoyer("U1|8|2|3|" + c[2], { base64: true }); const x1 = await envoyer("U1|8|0|3|" + c[0]);
ok("3 morceaux, 2 reçus (dans le désordre) : en attente, rien transmis", x.j.attente === "1/3" && x1.j.attente === "2/3" && transmis.length === 1, [x, x1]);
x = await envoyer("U1|8|1|3|" + c[1]);
ok("3e morceau : recollé et transmis une seule fois, texte accentué intact", x.s === 200 && transmis.length === 2 && JSON.stringify(transmis[1].corps) === JSON.stringify({ ...JSON.parse(m2), iccid: ICCID }) && T.ba_udp_morceaux.length === 0, [x, transmis.length, T.ba_udp_morceaux.length]);
x = await envoyer("OUVERT v1.6 port 3000 signal 31"); const nb = transmis.length;
ok("message « OUVERT … » ignoré (200, rien transmis)", x.s === 200 && x.j.ignore && transmis.length === nb, x);
x = await envoyer("U1|9|0|1|" + msg, { secret: "faux" + "x".repeat(40) });
ok("mauvais secret → 401, rien enregistré", x.s === 401 && transmis.length === nb && T.ba_udp_faits.every(r => r.seq !== 9), x);
x = await envoyer("U1|9|0|1|" + msg, { iccid: null });
ok("sans n° de carte → ignoré", x.s === 200 && x.j.ignore === "pas de carte" && transmis.length === nb, x);
x = await envoyer("U1|10|0|1|pas du json");
ok("message recollé mais illisible → ignoré sans erreur", x.s === 200 && x.j.ignore === "message illisible" && transmis.length === nb, x);
T.ba_udp_faits[0].fait_at = new Date(Date.now() - 20 * 60000).toISOString();
x = await envoyer("U1|7|0|1|" + msg);
ok("boîtier redémarré (séquence 7 vue il y a plus de 15 min) : accepté de nouveau", x.s === 200 && transmis.length === nb + 1, [x, transmis.length]);
// v5.28.1 : résultat de « Lire maintenant » dans le message UDP (fait / dok / dmsg)
x = await envoyer("U1|20|0|1|" + JSON.stringify({ fw: "1.6.1", seq: 20, fait: 77, dok: true, dmsg: "" }));
ok("résultat « fait » : la demande n°77 de CE boîtier passe à « faite »", x.s === 200 && T.ba_demandes[0].statut === "faite" && typeof T.ba_demandes[0].fini_at === "string", T.ba_demandes[0]);
x = await envoyer("U1|21|0|1|" + JSON.stringify({ fw: "1.6.1", seq: 21, fait: 78, dok: false, dmsg: "x" }));
ok("la demande d'un AUTRE boîtier n'est jamais touchée", T.ba_demandes[1].statut === "attente", T.ba_demandes[1]);
x = await envoyer("U1|22|0|1|" + JSON.stringify({ fw: "1.6.1", seq: 22, fait: 79, dok: false, dmsg: "tard" }));
ok("une demande déjà terminée ne change plus", T.ba_demandes[2].statut === "faite" && !T.ba_demandes[2].message, T.ba_demandes[2]);
T.ba_demandes.push({ id: 80, device_id: "d1", statut: "prise" });
x = await envoyer("U1|23|0|1|" + JSON.stringify({ fw: "1.6.1", seq: 23, fait: 80, dok: false, dmsg: "La machine ne répond pas" }));
ok("échec avec sa raison : statut « echec » et message gardé", T.ba_demandes[3].statut === "echec" && T.ba_demandes[3].message === "La machine ne répond pas", T.ba_demandes[3]);
delete env.INGEST_UDP_SECRET; x = await envoyer("U1|11|0|1|" + msg);
ok("secret non configuré → 401 (jamais ouvert par défaut)", x.s === 401, x);
ok("aucun secret écrit dans le code", !/INGEST_UDP_SECRET\s*=\s*["']/.test(src));
if (ko) { console.log("\n" + ko + " ÉCHEC(S)"); process.exit(1); } else console.log("\nTOUT EST OK");
