// Test de la fonction « ingest » de bout en bout : faux Supabase (mémoire) + faux Firebase
// node --experimental-strip-types --no-warnings tests/ingest/flux.test.mts [relevé.dat]
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ba-flux-")), "ingest.ts");
fs.writeFileSync(tmp, fs.readFileSync(path.join(ICI, "../../supabase/functions/ingest/index.ts"), "utf8").replace('import { createClient } from "jsr:@supabase/supabase-js@2";', 'import { createClient } from "' + path.join(ICI, "faux-supabase.ts") + '";'));
let handler: any; const env: Record<string, string> = {};
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
env.FCM_SERVICE_ACCOUNT = JSON.stringify({ client_email: "x@p.iam.gserviceaccount.com", private_key: privateKey, project_id: "projet-test" });
const pushes: any[] = []; let tokenCalls = 0;
(globalThis as any).fetch = async (url: string, o: any) => {
  if (url.includes("oauth2")) { tokenCalls++; return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 })); }
  const body = JSON.parse(o.body); if (body.message.token === "mort") return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
  pushes.push(body.message); return new Response("{}");
};
const { DB } = await import(path.join(ICI, "faux-supabase.ts"));
await import(tmp);
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const KEY = "cle-secrete-du-boitier-1234";
DB.devices.push({ id: "dev1", name: "Machine 12", machine_id: "FAS-2012", key_hash: sha(KEY), last_seen: new Date(Date.now() - 600000).toISOString(), info: {} });
DB.ba_push_tokens.push({ token: "tel-admin", operateur: false }, { token: "tel-operateur", operateur: true }, { token: "mort", operateur: false });
const post = async (b: any) => { const r = await handler(new Request("https://x/ingest", { method: "POST", body: JSON.stringify(b) })); return { s: r.status, j: await r.json() }; };
const dat = fs.readFileSync(process.argv[2] || process.env.BA_AUDIT || path.join(ICI, "../donnees/AUDIT_FASTER_170824020354.dat"), "latin1");
let r = await post({ k: KEY, raw: dat, role: "boitier", fw: "1.2" });
ok("1er relevé accepté", r.s === 200 && r.j.ok, r);
ok("1er relevé : ancien journal noté silencieux, aucune notification", DB.ba_notifications.length === 3 && DB.ba_notifications.every(n => n.silencieux) && pushes.length === 0, DB.ba_notifications);
r = await post({ k: KEY, raw: dat });
ok("même relevé : rien de nouveau", DB.ba_notifications.length === 3 && pushes.length === 0);
r = await post({ k: KEY, role: "machine", raw: "DXS*FAS*VA*V1/6*1\nEA1*ELB_3*251105*0431\nMA5*ERROR*251105*0430*45*54\nEA1*E45*251105*0430\nDXE*1*1" });
ok("nouvelles pannes : 2 notifications (épuisé n° 3 + ascenseur)", DB.ba_notifications.filter(n => !n.silencieux).length === 2, DB.ba_notifications.filter(n => !n.silencieux).map(n => n.titre));
ok("une seule notification téléphone, seulement au compte admin", pushes.length === 1 && pushes[0].token === "tel-admin" && /2 alertes/.test(pushes[0].notification.title), pushes);
ok("téléphone désinstallé retiré", !DB.ba_push_tokens.some(t => t.token === "mort"));
ok("notifications marquées envoyées", DB.ba_notifications.filter(n => !n.silencieux).every(n => n.envoye_at));
// porte
r = await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*251105*0500\nEA2*EGS****1\nDXE" });
const d = DB.devices[0];
ok("porte ouverte notée (sans notification tout de suite)", d.info.porte && d.info.porte.ouverte === true && pushes.length === 1, d.info);
r = await post({ k: KEY, hb: 1 });
ok("signal de vie sans relevé : la porte reste ouverte", d.info.porte.ouverte === true && d.info.fw === "", d.info);
d.info.porte.depuis = new Date(Date.now() - 16 * 60000).toISOString();
r = await post({ veille: 1 });
ok("veille : porte ouverte depuis 15 min → notification", r.j.ok && pushes.length === 2 && /porte ouverte depuis plus de 15 min/.test(pushes[1].notification.title), pushes.map(p => p.notification));
r = await post({ veille: 1 });
ok("veille suivante : pas de 2e alerte porte", pushes.length === 2);
r = await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGT*251105*0520\nEA2*EGS****0\nDXE" });
ok("porte refermée → notification « porte refermée »", d.info.porte.ouverte === false && pushes.length === 3 && /refermée/.test(pushes[2].notification.title), pushes.map(p => p.notification.title));
// boîtier muet puis retour
d.last_seen = new Date(Date.now() - 3 * 3600000).toISOString();
r = await post({ veille: 1 });
ok("veille : boîtier muet depuis 2 h → notification", pushes.length === 4 && /muet/.test(pushes[3].notification.title), pushes.map(p => p.notification.title));
r = await post({ veille: 1 });
ok("pas de 2e alerte pour le même silence", pushes.length === 4);
r = await post({ k: KEY, hb: 1 });
ok("le boîtier revient → « de nouveau en ligne »", pushes.length === 5 && /de nouveau en ligne/.test(pushes[4].notification.title), pushes.map(p => p.notification.title));
// sans Firebase : la cloche marche, les téléphones attendent
delete env.FCM_SERVICE_ACCOUNT;
r = await post({ k: KEY, role: "machine", raw: "DXS\nEA7*5*1\nDXE" });
const c = DB.ba_notifications.find(n => n.type === "coupure");
ok("sans Firebase : notification gardée pour la cloche, pas envoyée", c && !c.envoye_at && pushes.length === 5, c);
ok("relevé incomplet refusé", (await post({ k: KEY, raw: "bonjour" })).s === 400);
ok("clé inconnue refusée", (await post({ k: "x".repeat(20) })).s === 401);
ok("jeton Google demandé une seule fois (gardé 1 h)", tokenCalls === 1, tokenCalls);
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
