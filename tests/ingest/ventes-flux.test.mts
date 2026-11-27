// v5.36.0 — La fonction « ingest » de bout en bout : ventes, ruptures de pain, réglages par appareil (faux Supabase + faux Firebase)
// node --experimental-strip-types --no-warnings tests/ingest/ventes-flux.test.mts
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { releve } from "./releves.ts";
const ICI = path.dirname(new URL(import.meta.url).pathname), SRC = path.join(ICI, "../../supabase/functions/ingest");
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "ba-vflux-"));
for (const f of ["ventes.ts", "fenetre.js", "evadts-parser.js"]) fs.copyFileSync(path.join(SRC, f), path.join(dossier, f));
fs.writeFileSync(path.join(dossier, "package.json"), '{"type":"module"}');          // comme Deno : les fichiers .js sont des modules (mode strict)
fs.writeFileSync(path.join(dossier, "index.ts"), fs.readFileSync(path.join(SRC, "index.ts"), "utf8").replace('import { createClient } from "jsr:@supabase/supabase-js@2";', 'import { createClient } from "' + path.join(ICI, "faux-supabase.ts") + '";'));
let handler: any; const env: Record<string, string> = {};
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
env.FCM_SERVICE_ACCOUNT = JSON.stringify({ client_email: "x@p.iam.gserviceaccount.com", private_key: privateKey, project_id: "projet-test" });
const pushes: any[] = [];
(globalThis as any).fetch = async (url: string, o: any) => {
  if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
  pushes.push(JSON.parse(o.body).message); return new Response("{}");
};
const { DB, RPC, COLONNES_ABSENTES } = await import(path.join(ICI, "faux-supabase.ts"));
await import(path.join(dossier, "index.ts"));
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const KEY = "cle-secrete-du-boitier-1234";
DB.devices.push({ id: "dev1", name: "Machine 12", machine_id: "FAS-2012", key_hash: sha(KEY), last_seen: new Date().toISOString(), info: {} });
// 4 appareils : un admin sans réglage, un compte opérateur, un admin qui a coupé les ventes, un admin qui a coupé les ruptures
const tels = () => DB.ba_push_tokens.reduce((o: any, t: any) => ({ ...o, [t.token]: pushes.filter((p: any) => p.token === t.token) }), {});
DB.ba_push_tokens.push({ token: "tel-admin", operateur: false }, { token: "tel-operateur", operateur: true },
  { token: "tel-sans-ventes", operateur: false, prefs: { vente: false } }, { token: "tel-sans-ruptures", operateur: false, prefs: { stock: false } });
const post = async (b: any) => { const r = await handler(new Request("https://x/ingest", { method: "POST", body: JSON.stringify(b) })); return { s: r.status, j: await r.json() }; };
const lire = (sels: Record<number, number>, role = "boitier", extra: string[] = []) => post({ k: KEY, role, raw: releve(sels, extra) });
const dernier = () => DB.device_reports[DB.device_reports.length - 1].id;
// la machine telle que l'appli la connaît (fonction SQL ba_stock_machine)
let etat: any = null;
RPC.ba_stock_machine = () => etat;
const mkEtat = (base: number, q: Record<number, number>, plus: any = {}) => ({ num: 12, nom: "Machine 12", g4: { rid: base, base: "r" + base, at: Date.now() - 3600000 }, ouverte: false, tmod: null,
  sels: [{ n: 11, type: "gris", qty: q[11] ?? 0 }, { n: 12, type: "gris", qty: q[12] ?? 0 }, { n: 21, type: "sandwich", qty: q[21] ?? 0 }, { n: 31, type: "blanc", qty: q[31] ?? 0 }], ...plus });
const notifs = (type: string) => DB.ba_notifications.filter((n: any) => n.type === type);
const DEP = { 11: 10, 12: 4, 21: 6, 31: 9 };

// 1. premier relevé : rien à comparer
etat = null;
let r = await lire(DEP);
ok("1er relevé du boîtier : accepté, ni vente ni rupture", r.s === 200 && notifs("vente").length === 0 && notifs("stock").length === 0 && pushes.length === 0, DB.ba_notifications);
const r0 = dernier();
// l'appli a compté ce relevé (stock noté : gris 2 + 1, sandwich 3, blanc 4)
etat = mkEtat(r0, { 11: 2, 12: 1, 21: 3, 31: 4 });

// 2. une vente de pain gris, il en reste
r = await lire({ ...DEP, 11: 11 });
ok("1 vente de pain gris : une notification « vente »", r.s === 200 && notifs("vente").length === 1 && /Machine 12 : 1 vente/.test(notifs("vente")[0].titre) && /Pain gris \(sélection 11\) — 1,40 €/.test(notifs("vente")[0].texte), notifs("vente"));
ok("…pas de rupture (il reste du pain gris en sélection 12)", notifs("stock").length === 0);
let T = tels();
ok("…reçue par l'admin sans réglage et par celui qui a seulement coupé les ruptures", T["tel-admin"].length === 1 && T["tel-sans-ruptures"].length === 1 && /1 vente/.test(T["tel-admin"][0].notification.title), T);
ok("…PAS par le compte opérateur (jamais de ventes aux opérateurs), PAS par celui qui a coupé les ventes", T["tel-operateur"].length === 0 && T["tel-sans-ventes"].length === 0, T);
ok("…marquée envoyée", notifs("vente")[0].envoye_at, notifs("vente")[0]);

// 3. les deux dernières sélections de pain gris se vident : « plus de pain gris »
pushes.length = 0;
await lire({ ...DEP, 11: 12 });                                      // gris 11 : 2 − 2 = 0, gris 12 : 1 → il reste du pain
ok("2e vente (11 vide, 12 encore à 1) : pas de rupture", notifs("stock").length === 0, notifs("stock"));
pushes.length = 0;
r = await lire({ ...DEP, 11: 12, 12: 5 });                           // 12 : 1 − 1 = 0 → tout le pain gris est parti
ok("dernier pain gris vendu : une notification « plus de pain gris » (sélections 11 et 12)", notifs("stock").length === 1 && /Machine 12 : plus de pain gris/.test(notifs("stock")[0].titre) && /sélections 11, 12/.test(notifs("stock")[0].texte), notifs("stock"));
T = tels();
ok("…l'admin reçoit UNE seule notification qui commence par la rupture", T["tel-admin"].length === 1 && /2 alertes/.test(T["tel-admin"][0].notification.title) && /^Machine 12 : plus de pain gris/.test(T["tel-admin"][0].notification.body), T["tel-admin"]);
ok("…l'opérateur reçoit la rupture SEULE (pas la vente) : c'est lui qui remplit", T["tel-operateur"].length === 1 && /plus de pain gris/.test(T["tel-operateur"][0].notification.title) && !/vente/.test(T["tel-operateur"][0].notification.body), T["tel-operateur"]);
ok("…celui qui a coupé les ventes reçoit la rupture seule", T["tel-sans-ventes"].length === 1 && /plus de pain gris/.test(T["tel-sans-ventes"][0].notification.title), T["tel-sans-ventes"]);
ok("…celui qui a coupé les ruptures reçoit la vente seule", T["tel-sans-ruptures"].length === 1 && /1 vente/.test(T["tel-sans-ruptures"][0].notification.title), T["tel-sans-ruptures"]);

// 4. pas de répétition de la rupture
pushes.length = 0;
await lire({ ...DEP, 11: 12, 12: 5, 21: 7 });
ok("vente d'un sandwich ensuite : pas de 2e « plus de pain gris »", notifs("stock").length === 1, notifs("stock"));
ok("le même relevé reçu deux fois : pas de 2e vente", (await lire({ ...DEP, 11: 12, 12: 5, 21: 7 })).s === 200 && notifs("vente").length === 4, notifs("vente").length);

// 5. un relevé partiel de la machine ne compte pas
const avant = DB.ba_notifications.length;
await lire({ ...DEP, 11: 12, 12: 5, 21: 9 }, "machine");
ok("envoi de la machine (role « machine ») : pas de vente (elles arrivent avec la lecture du boîtier)", DB.ba_notifications.length === avant, DB.ba_notifications.length - avant);
// 6. texte abîmé
await post({ k: KEY, role: "boitier", raw: releve({ ...DEP, 21: 12 }).replace("SE*20", "G85*0000\r\nSE*20") });
ok("relevé au texte abîmé (G85 faux) : rien", DB.ba_notifications.length === avant);

// 7. stock négatif : l'appli croyait la sélection vide, la machine vend → pas de rupture
etat = mkEtat(r0, { 11: 0, 12: 0, 21: 0, 31: 0 });
const nS = notifs("stock").length;
await lire({ ...DEP, 11: 12, 12: 5, 21: 9, 31: 10 });
ok("stock qui deviendrait négatif : la vente part, mais PAS de « machine vide » ni de rupture", notifs("stock").length === nS, notifs("stock"));
// 8. machine vraiment vide
etat = mkEtat(r0, { 11: 2, 12: 1, 21: 3 + 0, 31: 1 });             // vendus depuis r0 : 11: 2, 12: 1, 21: 5, 31: 1 → 21 négatif : on repart d'un état sain
etat = mkEtat(r0, { 11: 2, 12: 1, 21: 5, 31: 2 });
await lire({ ...DEP, 11: 12, 12: 5, 21: 11, 31: 11 });
ok("tout est vide après la vente : « Machine 12 : machine vide » (pas de « plus de pain » en plus)", notifs("stock").filter((n: any) => /machine vide/.test(n.titre)).length === 1 && notifs("stock").length === nS + 1, notifs("stock").map((n: any) => n.titre));

// 9. intervention en cours / relevé par câble : les ventes partent, pas les ruptures
etat = mkEtat(r0, { 11: 1, 12: 0, 21: 3, 31: 4 }, { ouverte: true });
const nS2 = notifs("stock").length, nV = notifs("vente").length;
await lire({ ...DEP, 11: 13, 12: 5, 21: 11, 31: 11 });
ok("intervention en cours : la vente part, pas de rupture", notifs("vente").length === nV + 1 && notifs("stock").length === nS2, [notifs("vente").length - nV, notifs("stock").length - nS2]);
etat = mkEtat(r0, { 11: 1, 12: 0, 21: 3, 31: 4 });
DB.audits = [{ machine_id: "FAS-2012", source: "rs232", imported_at: new Date().toISOString() }];
await lire({ ...DEP, 11: 14, 12: 5, 21: 11, 31: 11 });
ok("relevé par câble depuis le relevé compté : pas de rupture", notifs("stock").length === nS2, notifs("stock").length - nS2);
DB.audits = [{ machine_id: "FAS-2012", source: "4g", imported_at: new Date().toISOString() }];
etat = mkEtat(r0, { 11: 4, 12: 0, 21: 3, 31: 4 });
await lire({ ...DEP, 11: 15, 12: 5, 21: 11, 31: 11 });
ok("…les copies 4G de l'appli (source « 4g ») ne comptent pas comme un relevé par câble", notifs("stock").length === nS2, notifs("stock").length - nS2);
delete DB.audits;

// 10. fonction SQL pas encore créée : les ventes partent quand même, avec « sélection N »
delete RPC.ba_stock_machine;
const nV2 = notifs("vente").length;
await lire({ ...DEP, 11: 16, 12: 5, 21: 11, 31: 11 });
const dv = notifs("vente")[notifs("vente").length - 1];
ok("commande SQL pas faite : la vente part avec « Sélection 11 », sans rupture", notifs("vente").length === nV2 + 1 && /Sélection 11/.test(dv.texte) && notifs("stock").length === nS2, dv);

// 11. colonne « prefs » pas encore créée : tout le monde reçoit tout (sauf les ventes aux opérateurs)
COLONNES_ABSENTES.ba_push_tokens = ["prefs"];
pushes.length = 0;
await lire({ ...DEP, 11: 17, 12: 5, 21: 11, 31: 11 });
T = tels();
ok("sans la colonne « prefs » : admin ET « sans ventes » reçoivent la vente, l'opérateur non (les ventes ne vont jamais aux opérateurs)", T["tel-admin"].length === 1 && T["tel-sans-ventes"].length === 1 && T["tel-operateur"].length === 0, T);
delete COLONNES_ABSENTES.ba_push_tokens;

// 12. tout le monde a coupé les ventes : rien à envoyer, rien qui attende
DB.ba_push_tokens.forEach((t: any) => { t.prefs = { ...(t.prefs || {}), vente: false }; });
pushes.length = 0;
await lire({ ...DEP, 11: 18, 12: 5, 21: 11, 31: 11 });
const dv2 = notifs("vente")[notifs("vente").length - 1];
ok("ventes coupées sur tous les appareils : aucun envoi, et la notification n'attend pas (marquée envoyée)", pushes.length === 0 && !!dv2.envoye_at, [pushes.length, dv2]);

// 13. un envoi du boîtier n'échoue JAMAIS à cause de ces calculs
RPC.ba_stock_machine = () => { throw new Error("panne de base"); };
r = await lire({ ...DEP, 11: 19, 12: 5, 21: 11, 31: 11 });
ok("panne pendant le calcul des ventes : le boîtier reçoit quand même « ok »", r.s === 200 && r.j.ok === true, r);
// 14. pains ajoutés dans l'appli (identifiant « c… ») : les notifications donnent leur NOM, jamais l'identifiant
RPC.ba_stock_machine = () => etat;
const rB = dernier();
etat = { num: 12, nom: "Machine 12", g4: { rid: rB, base: "r" + rB, at: Date.now() - 3600000 }, ouverte: false, tmod: null, noms: { c900001: "Pistolets" },
  sels: [{ n: 11, type: "c900001", qty: 1 }, { n: 12, type: "c900001", qty: 0 }, { n: 21, type: "sandwich", qty: 3 }, { n: 31, type: "blanc", qty: 2 }] };
const nS3 = notifs("stock").length, nV3 = notifs("vente").length;
await lire({ ...DEP, 11: 20, 12: 5, 21: 11, 31: 11 });                // 1 vente en 11 : 1 − 1 = 0, et 12 est déjà à 0
const st3 = notifs("stock").slice(nS3), ve3 = notifs("vente").slice(nV3);
ok("pain ajouté dans l'appli : « Machine 12 : plus de pistolets » (son nom, jamais l'identifiant)", st3.length === 1 && /^Machine 12 : plus de pistolets$/.test(st3[0].titre) && !/c900001/.test(st3[0].titre + st3[0].texte), st3);
ok("…et la vente : « Pistolets (sélection 11) — 1,40 € »", ve3.length === 1 && /Pistolets \(sélection 11\) — 1,40 €/.test(ve3[0].texte) && !/c900001/.test(ve3[0].texte), ve3);
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
