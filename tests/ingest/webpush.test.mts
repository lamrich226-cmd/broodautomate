// v5.34.6 — Notifications web (iPhone, ordinateur) : chiffrement Web Push, signature VAPID, envoi par la fonction « ingest »
// node --experimental-strip-types --no-warnings tests/ingest/webpush.test.mts
// Le chiffrement est vérifié par une AUTRE bibliothèque (http_ece, celle de web-push) : si les deux se comprennent, Apple/Google aussi.
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { createRequire } from "node:module";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const ece = require(path.join(ICI, "../node_modules/http_ece"));
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/ingest/index.ts"), "utf8");
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };

// ---------- A. Logique pure ----------
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "ba-wp-"));
fs.writeFileSync(path.join(dossier, "pur.ts"), src.slice(a, b) + "\nexport { chiffrerWebPush, enteteVapid, nouvellesClesVapid, deB64url, b64url };\n");
const { chiffrerWebPush, enteteVapid, nouvellesClesVapid, deB64url, b64url } = await import(path.join(dossier, "pur.ts"));
const bu = (x: Buffer | Uint8Array) => Buffer.from(x).toString("base64url");

// un « navigateur » : sa paire de clés et son secret d'authentification (ce que donne pushManager.subscribe)
function navigateur() {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, abo: { endpoint: "https://web.push.apple.com/QWERTY", keys: { p256dh: bu(ecdh.getPublicKey()), auth: bu(auth) } } };
}
const nav = navigateur();
const msg = JSON.stringify({ titre: "Machine 12 : porte ouverte", texte: "Ouverte à 01:27 — é à ü ✓", vue: "alerts" });
const corps = await chiffrerWebPush(nav.abo, new TextEncoder().encode(msg));
const clair = ece.decrypt(Buffer.from(corps), { version: "aes128gcm", privateKey: nav.ecdh, authSecret: bu(nav.auth) }).toString("utf8");
ok("message chiffré par ingest, déchiffré par http_ece (bibliothèque de web-push) : identique, accents compris", clair === msg, clair);
ok("en-tête aes128gcm : salt 16 + taille 4096 + clé 65 octets", corps[20] === 65 && new DataView(corps.buffer, corps.byteOffset).getUint32(16) === 4096, [corps[20]]);
const corps2 = await chiffrerWebPush(nav.abo, new TextEncoder().encode(msg));
ok("deux envois du même texte donnent deux corps différents (sel et clé éphémère neufs)", bu(corps) !== bu(corps2));
let refus = ""; try { await chiffrerWebPush(nav.abo, new Uint8Array(3600)); } catch (e) { refus = String(e); }
ok("message trop long (> 3500 octets) refusé", /trop long/.test(refus), refus);
refus = ""; try { await chiffrerWebPush({ keys: { p256dh: "AAAA", auth: "AAAA" } }, new Uint8Array(5)); } catch (e) { refus = String(e); }
ok("abonnement invalide refusé", /invalide/.test(refus), refus);
ok("deB64url : toutes les longueurs", [1, 2, 3, 4, 5, 16, 65].every(n => { const x = crypto.randomBytes(n); return Buffer.from(deB64url(bu(x))).equals(x); }));

// VAPID : clé publique brute de 65 octets, JWT ES256 vérifiable avec elle, aud = serveur d'Apple, durée < 24 h, sujet = adresse https
const cles = await nouvellesClesVapid();
ok("clé VAPID publique : 65 octets (0x04…) en base64url", deB64url(cles.pub).length === 65 && deB64url(cles.pub)[0] === 4, cles.pub.length);
ok("clé VAPID privée : JWK ECDSA P-256 avec 'd'", cles.priv.kty === "EC" && cles.priv.crv === "P-256" && typeof cles.priv.d === "string");
const SUJET = "https://lamrich226-cmd.github.io/broodautomate/";
const maintenant = Math.floor(Date.now() / 1000);
const ent = await enteteVapid(nav.abo.endpoint, cles, SUJET, maintenant);
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(ent);
ok("en-tête « vapid t=…, k=… »", !!m && m[4] === cles.pub, ent.slice(0, 40));
if (m) {
  const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: bu(deB64url(cles.pub).slice(1, 33)), y: bu(deB64url(cles.pub).slice(33, 65)) }, format: "jwk" });
  const signe = crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), { key: pubKey, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url"));
  const c = JSON.parse(Buffer.from(m[2], "base64url").toString()), h = JSON.parse(Buffer.from(m[1], "base64url").toString());
  ok("signature ES256 vérifiée avec la clé publique (format JWT : r‖s, 64 octets)", signe && Buffer.from(m[3], "base64url").length === 64 && h.alg === "ES256" && h.typ === "JWT");
  ok("aud = https://web.push.apple.com, sub = adresse https, expire dans 12 h (Apple refuse plus de 24 h)", c.aud === "https://web.push.apple.com" && c.sub === SUJET && c.exp - maintenant === 12 * 3600, c);
}

// ---------- B. La fonction « ingest » de bout en bout (faux Supabase + faux services de notification) ----------
const tmp = path.join(dossier, "ingest.ts");
fs.writeFileSync(tmp, src.replace('import { createClient } from "jsr:@supabase/supabase-js@2";', 'import { createClient } from "' + path.join(ICI, "faux-supabase.ts") + '";'));
let handler: any; const env: Record<string, string> = {};
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
const appels: { url: string; headers: Record<string, string>; body: any }[] = []; const statut: Record<string, number> = {};
(globalThis as any).fetch = async (url: string, o: any) => {
  appels.push({ url, headers: o.headers, body: o.body });
  const s = statut[url] ?? 201; return new Response(s >= 400 ? "gone" : "", { status: s });
};
const { DB } = await import(path.join(ICI, "faux-supabase.ts"));
await import(tmp);
const post = async (b: any) => { const r = await handler(new Request("https://x/ingest", { method: "POST", body: JSON.stringify(b) })); return { s: r.status, j: await r.json() }; };
const neuve = (titre: string) => DB.ba_notifications.push({ id: DB.ba_notifications.length + 100, cle: "t|" + titre + Math.random(), type: "panne", titre, texte: "détail", silencieux: false, cree_at: new Date().toISOString(), envoye_at: null });
const ios = navigateur(), bureau = navigateur(), operateur = navigateur(), mort = navigateur();
ios.abo.endpoint = "https://web.push.apple.com/IPHONE"; bureau.abo.endpoint = "https://fcm.googleapis.com/fcm/send/BUREAU"; operateur.abo.endpoint = "https://web.push.apple.com/OPERATEUR"; mort.abo.endpoint = "https://web.push.apple.com/MORT";
statut[mort.abo.endpoint] = 410;
const jeton = (n: any) => JSON.stringify(n.abo);

// B1. Table ba_vapid pas encore créée (commandes SQL pas faites) : rien ne casse, rien n'est envoyé, la notification reste en attente
DB.ba_push_tokens.push({ token: jeton(ios), appareil: "web-ios", operateur: false });
delete (DB as any).ba_vapid;
neuve("Machine 12 : panne");
let r = await post({ veille: 1 });
ok("B1 table ba_vapid absente : la veille répond ok, aucun envoi web, notification gardée pour plus tard", r.s === 200 && appels.length === 0 && DB.ba_notifications.every((n: any) => !n.envoye_at), { r, n: appels.length });

// B2. Table créée : la veille crée la paire de clés (une seule fois), puis envoie
DB.ba_vapid = [];
r = await post({ veille: 1 });
ok("B2 la veille crée les clés VAPID (une ligne : clé publique 65 octets, clé privée JWK)", DB.ba_vapid.length === 1 && deB64url(DB.ba_vapid[0].pub).length === 65 && JSON.parse(DB.ba_vapid[0].priv).d, DB.ba_vapid);
const pub0 = DB.ba_vapid[0].pub;
const web = appels.filter(x => x.url === ios.abo.endpoint);
ok("B2 le message part vers le service d'Apple (1 appel), en-têtes aes128gcm / TTL / Urgency / vapid", web.length === 1 && web[0].headers["Content-Encoding"] === "aes128gcm" && web[0].headers.TTL === "86400" && web[0].headers.Urgency === "high" && /^vapid t=.+, k=.+$/.test(web[0].headers.Authorization), web.map(x => x.headers));
const lu = web[0] && ece.decrypt(Buffer.from(web[0].body), { version: "aes128gcm", privateKey: ios.ecdh, authSecret: bu(ios.auth) }).toString("utf8");
const d = lu ? JSON.parse(lu) : {};
ok("B2 le contenu déchiffré par l'iPhone : titre, texte, vue « alerts »", d.titre === "Machine 12 : panne" && d.texte === "détail" && d.vue === "alerts", d);
ok("B2 la clé « k » de l'en-tête est la clé publique enregistrée", web[0] && web[0].headers.Authorization.endsWith("k=" + pub0));
ok("B2 notification marquée envoyée", DB.ba_notifications.every((n: any) => n.envoye_at), DB.ba_notifications);

// B3. Plusieurs appareils : iPhone + ordinateur (Chrome) reçoivent ; compte opérateur non ; abonnement supprimé (410) retiré ; adresse suspecte jamais appelée
appels.length = 0;
DB.ba_push_tokens.push({ token: jeton(bureau), appareil: "web", operateur: false }, { token: jeton(operateur), appareil: "web-ios", operateur: true },
  { token: jeton(mort), appareil: "web-ios", operateur: false },
  { token: JSON.stringify({ endpoint: "https://evil.example/collecte", keys: bureau.abo.keys }), appareil: "web", operateur: false },
  { token: JSON.stringify({ endpoint: "https://web.push.apple.com.evil.example/x", keys: bureau.abo.keys }), appareil: "web", operateur: false },
  { token: "ceci n'est pas un abonnement", appareil: "web", operateur: false });
neuve("Machine 4 : porte ouverte");
r = await post({ veille: 1 });
const vers = (u: string) => appels.filter(x => x.url === u).length;
ok("B3 iPhone et ordinateur reçoivent chacun 1 message", vers(ios.abo.endpoint) === 1 && vers(bureau.abo.endpoint) === 1, appels.map(x => x.url));
ok("B3 le compte opérateur ne reçoit rien", vers(operateur.abo.endpoint) === 0);
ok("B3 une adresse hors Apple/Google/Mozilla/Microsoft n'est JAMAIS appelée (ni evil.example, ni apple.com.evil.example)", !appels.some(x => /evil\.example/.test(x.url)), appels.map(x => x.url));
ok("B3 abonnement mort (410) et jetons invalides supprimés de la table", !DB.ba_push_tokens.some((t: any) => t.token === jeton(mort) || /evil\.example|ceci n/.test(t.token)), DB.ba_push_tokens.map((t: any) => t.appareil));
ok("B3 abonnements valides et celui de l'opérateur conservés", [ios, bureau, operateur].every(n => DB.ba_push_tokens.some((t: any) => t.token === jeton(n))));
ok("B3 les clés VAPID n'ont pas changé", DB.ba_vapid.length === 1 && DB.ba_vapid[0].pub === pub0);
const lu2 = ece.decrypt(Buffer.from(appels.find(x => x.url === bureau.abo.endpoint)!.body), { version: "aes128gcm", privateKey: bureau.ecdh, authSecret: bu(bureau.auth) }).toString("utf8");
ok("B3 l'ordinateur déchiffre aussi son message", JSON.parse(lu2).titre === "Machine 4 : porte ouverte", lu2);

// B3b. Page d'origine (admin / opérateur) : transmise à l'appareil pour rouvrir la bonne appli ; une valeur étrangère est ignorée
appels.length = 0;
const ope2 = navigateur(), piege = navigateur(); ope2.abo.endpoint = "https://updates.push.services.mozilla.com/wpush/v2/OPE2"; piege.abo.endpoint = "https://web.push.apple.com/PIEGE";
DB.ba_push_tokens.push({ token: JSON.stringify({ ...ope2.abo, page: "operateur.html" }), appareil: "web-ios", operateur: false }, { token: JSON.stringify({ ...piege.abo, page: "https://evil.example/x.html" }), appareil: "web-ios", operateur: false });
neuve("Machine 3 : température");
r = await post({ veille: 1 });
const lire = (n: any) => JSON.parse(ece.decrypt(Buffer.from(appels.find(x => x.url === n.abo.endpoint)!.body), { version: "aes128gcm", privateKey: n.ecdh, authSecret: bu(n.auth) }).toString("utf8"));
ok("B3b appareil abonné depuis la page opérateur : le message contient page « operateur.html » (Mozilla/Firefox aussi accepté)", lire(ope2).page === "operateur.html", lire(ope2));
ok("B3b page étrangère (adresse) ignorée : aucune clé « page » dans le message", !("page" in lire(piege)), lire(piege));
ok("B3b appareil abonné sans page (ancien format) : pas de clé « page »", !("page" in lire(ios)), lire(ios));

DB.ba_push_tokens = DB.ba_push_tokens.filter((t: any) => !/OPE2|PIEGE/.test(t.token));   // (retirés : B4 suit seulement l'iPhone et l'ordinateur)

// B4. Si aucun appareil n'a reçu (service en panne : 500), la notification reste à envoyer au prochain passage
appels.length = 0; statut[ios.abo.endpoint] = 500; statut[bureau.abo.endpoint] = 500;
neuve("Machine 7 : coupure");
r = await post({ veille: 1 });
ok("B4 service de notification en panne : notification gardée (envoye_at vide) pour le prochain essai, jetons gardés", DB.ba_notifications.some((n: any) => n.titre === "Machine 7 : coupure" && !n.envoye_at) && DB.ba_push_tokens.some((t: any) => t.token === jeton(ios)), appels.length);
statut[ios.abo.endpoint] = 201; statut[bureau.abo.endpoint] = 201; appels.length = 0;
r = await post({ veille: 1 });
ok("B4 au passage suivant, elle part", vers(ios.abo.endpoint) === 1 && DB.ba_notifications.every((n: any) => n.envoye_at));

// B5. Android (Firebase) et web ensemble : les deux chemins vivent côte à côte
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
env.FCM_SERVICE_ACCOUNT = JSON.stringify({ client_email: "x@p.iam.gserviceaccount.com", private_key: privateKey, project_id: "projet-test" });
(globalThis as any).fetch = async (url: string, o: any) => {
  appels.push({ url, headers: o.headers, body: o.body });
  if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
  return new Response(url.includes("fcm.googleapis.com/v1") ? "{}" : "", { status: url.includes("fcm.googleapis.com/v1") ? 200 : 201 });
};
DB.ba_push_tokens.push({ token: "tel-android-1234567890123456", operateur: false });
appels.length = 0; neuve("Machine 9 : froid");
r = await post({ veille: 1 });
ok("B5 Android reçoit par Firebase ET iPhone par Web Push, pour la même alerte", appels.some(x => x.url.includes("fcm.googleapis.com/v1/projects/projet-test")) && vers(ios.abo.endpoint) === 1, appels.map(x => x.url));
// Firebase seul (aucun appareil web) : comme avant
DB.ba_push_tokens = DB.ba_push_tokens.filter((t: any) => !/^web/.test(t.appareil || ""));
appels.length = 0; neuve("Machine 10 : panne");
r = await post({ veille: 1 });
ok("B5 sans appareil web : seul Firebase est appelé, comme avant", appels.filter(x => x.url.includes("fcm.googleapis.com/v1")).length === 1 && !appels.some(x => /web\.push|BUREAU/.test(x.url)), appels.map(x => x.url));

console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
