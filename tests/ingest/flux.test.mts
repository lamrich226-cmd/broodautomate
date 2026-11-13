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
// v5.25 : sans le vrai relevé (données privées), un relevé INVENTÉ sert à l'essai (ventes, pannes, porte, coupure)
const vrai = process.argv[2] || process.env.BA_AUDIT || path.join(ICI, "../donnees/AUDIT_FASTER_170824020354.dat");
const INVENTE = ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "ID1*FAS000000001* FASTER     *0091* !\"f*+120*", "ID5*261201*0930",
  "VA1*637720*501*0*7*0**0", "PA1*11*100*1100*0**1**0*99", "PA2*50*5000*7", "LA1*0*11*100*7*50",
  "EA1*EGS*261201*0925***+120", "EA2*EGS****0", "EA1*EGT*261201*0926***+120", "EA2*EGT****1", "EA1*ECF_38*261201*0800***+120", "EA2*ECF_38****1",
  "EA1*EOA*261201*0805***+120", "EA2*EOA****0", "EA7*2*5", "MA5*ERROR*261201*0800*16*38", "MA5*TEMPER*261201*0804*+170", "G85*0000", "SE*20*001*0001", "DXE*1*1"].join("\r\n") + "\r\n";
// (comme le vrai relevé : 3 événements anciens — 2 pannes et 1 coupure — ; « 16/38 » est la même panne que « ECF_38 »)
const dat = fs.existsSync(vrai) ? fs.readFileSync(vrai, "latin1") : INVENTE;
if (!fs.existsSync(vrai)) console.log("  (vrai relevé absent : relevé inventé)");
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
// v5.15 : porte = le plus récent de EGS / EGT, quel que soit l'ordre des lignes (le relevé ne garde que la dernière de chaque)
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*261106*1152\nEA2*EGS****1\nEA1*EGT*261106*1138\nEA2*EGT****0\nDXE" });
ok("EGS 11:52 listé avant un EGT plus ancien 11:38 : porte OUVERTE", DB.devices[0].info.porte.ouverte === true, DB.devices[0].info.porte);
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*261106*1152\nEA2*EGS****0\nEA1*EGT*261106*1153\nEA2*EGT****1\nDXE" });
ok("EGT 11:53 plus récent que EGS 11:52 : porte FERMÉE", DB.devices[0].info.porte.ouverte === false, DB.devices[0].info.porte);
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGT*261106*1160\nDXE" });
ok("un seul événement EGT : fermée", DB.devices[0].info.porte.ouverte === false);
// v5.13 : notification immédiate à l'ouverture de la porte (réglage « porteNotif », éteint par défaut)
DB.ba_state = [{ id: "main", data: { settings: {} } }];
const instant = () => DB.ba_notifications.filter(n => /: porte ouverte$/.test(n.titre)).length;
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGT*251105*0600\nEA2*EGT****0\nDXE" });
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*251105*0610\nEA2*EGS****1\nDXE" });
ok("réglage éteint : pas de notification à l'ouverture de la porte", instant() === 0, instant());
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGT*251105*0620\nEA2*EGT****0\nDXE" });
DB.ba_state[0].data.settings.porteNotif = true;
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*251105*0630\nEA2*EGS****1\nDXE" });
ok("réglage allumé : une notification « porte ouverte » tout de suite", instant() === 1, instant());
await post({ k: KEY, role: "machine", raw: "DXS\nEA1*EGS*251105*0635\nEA2*EGS****1\nDXE" });
ok("porte déjà ouverte : pas de doublon", instant() === 1, instant());
ok("relevé incomplet refusé", (await post({ k: KEY, raw: "bonjour" })).s === 400);
ok("clé inconnue refusée", (await post({ k: "x".repeat(20) })).s === 401);
ok("jeton Google demandé une seule fois (gardé 1 h)", tokenCalls === 1, tokenCalls);
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
