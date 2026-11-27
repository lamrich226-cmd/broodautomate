// v5.34.6 — Notifications sur iPhone (appli ajoutée à l'écran d'accueil) et ordinateur, appli fermée (Web Push)
// node v5346.mjs <dossier du site> <dossier des captures>
// Données inventées + faux Supabase : aucune vraie donnée n'est lue ni modifiée, aucun vrai service de notification n'est appelé.
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "x.js"));
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v5346")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const LIBTXT = Object.fromEntries(Object.entries(LIB).map(([u, f]) => [u, fs.readFileSync(path.join(NM, f), "utf8")]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CLE_PUB = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");           // fausse clé publique VAPID (65 octets)
const b = await chromium.launch();

// ---------- 0. Fichiers ----------
console.log("== 0. Fichiers : manifest, service worker, balises iPhone, version");
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
ok("manifest admin : plein écran (standalone), départ index.html, portée ./", man.display === "standalone" && man.start_url === "index.html" && man.scope === "./", man);
ok("manifest admin : icônes 192 et 512 existent", man.icons.every(i => fs.existsSync(path.join(ROOT, i.src))) && man.icons.length === 2);
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
ok("index.html : lien manifest + icône écran d'accueil + apple-mobile-web-app-capable + nom « Brood Admin »", /rel="manifest" href="manifest\.webmanifest"/.test(html) && /rel="apple-touch-icon"/.test(html) && /apple-mobile-web-app-capable" content="yes"/.test(html) && /apple-mobile-web-app-title" content="Brood Admin"/.test(html));
const ope = fs.readFileSync(path.join(ROOT, "operateur.html"), "utf8");
ok("index.html et operateur.html chargent js/i18n-v5346.js", /i18n-v5346\.js\?v=5\.36\.1/.test(html) && /i18n-v5346\.js\?v=5\.36\.1/.test(ope));
const cfg = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
ok("version 5.36.1 dans config.js", /version: "5\.36\.1"/.test(cfg));

// ---------- 1. Le service worker (sw.js) lu dans un faux environnement ----------
console.log("== 1. sw.js : réception et toucher d'une notification");
function monSW(clients = [], opts = {}) {
  const ecoute = {}, affichees = [], ouvertes = [], msgs = []; let attendu = [];
  const self = { addEventListener: (n, f) => { ecoute[n] = f; }, skipWaiting() {}, clients: { claim: async () => {}, matchAll: async () => clients.map(c => ({ ...c, focus: async () => { c.focused = true; return c; }, postMessage: m => msgs.push(m) })), openWindow: async u => { ouvertes.push(u); } },
    registration: { showNotification: async (t, o) => { affichees.push({ t, o }); } } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), { self, Promise, JSON, String, RegExp });
  const lance = async (nom, ev) => { attendu = []; ev.waitUntil = p => attendu.push(p); await ecoute[nom](ev); await Promise.all(attendu); };
  return { ecoute, affichees, ouvertes, msgs, lance };
}
let sw = monSW();
ok("sw.js : écoute install, activate, push, notificationclick — et PAS « fetch » (aucune page mise en cache, l'appli se met à jour comme avant)", Object.keys(sw.ecoute).sort().join() === "activate,install,notificationclick,push", Object.keys(sw.ecoute));
await sw.lance("push", { data: { json: () => ({ titre: "Machine 12 : porte ouverte", texte: "Ouverte à 01:27", vue: "alerts", page: "operateur.html" }), text: () => "" } });
ok("push JSON : notification affichée avec titre, texte, icône ; le toucher rouvrira operateur.html", sw.affichees.length === 1 && sw.affichees[0].t === "Machine 12 : porte ouverte" && sw.affichees[0].o.body === "Ouverte à 01:27" && sw.affichees[0].o.icon === "icons/icon-192.png" && sw.affichees[0].o.data.page === "operateur.html", sw.affichees);
await sw.lance("push", { data: { json: () => { throw new Error("pas du JSON"); }, text: () => "Texte simple" } });
ok("push en texte simple : affichée quand même (iPhone exige une notification à CHAQUE message)", sw.affichees[1].o.body === "Texte simple" && sw.affichees[1].t === "Broodautomate", sw.affichees[1]);
await sw.lance("push", { data: null });
ok("push sans contenu : notification générique affichée (jamais de message silencieux)", sw.affichees.length === 3 && sw.affichees[2].t === "Broodautomate" && !!sw.affichees[2].o.body, sw.affichees[2]);
await sw.lance("push", { data: { json: () => ({ titre: "x".repeat(500), texte: "y".repeat(2000), page: "https://evil.example/x.html" }) } });
ok("titre et texte trop longs coupés ; page étrangère remplacée par index.html", sw.affichees[3].t.length === 120 && sw.affichees[3].o.body.length === 400 && sw.affichees[3].o.data.page === "index.html");
let ferme = 0; const notif = (page) => ({ close: () => ferme++, data: { vue: "alerts", page } });
sw = monSW([{ id: "c1" }]);
await sw.lance("notificationclick", { notification: notif("index.html") });
ok("toucher, appli déjà ouverte : elle passe devant et reçoit l'ordre d'aller aux Alertes (aucune nouvelle fenêtre)", ferme === 1 && sw.msgs.length === 1 && sw.msgs[0].ba === "aller" && sw.msgs[0].vue === "alerts" && sw.ouvertes.length === 0, { ferme, msgs: sw.msgs, o: sw.ouvertes });
sw = monSW([]);
await sw.lance("notificationclick", { notification: notif("operateur.html") });
ok("toucher, appli fermée : ouvre operateur.html#alerts (la même appli que celle de l'abonnement)", sw.ouvertes.length === 1 && sw.ouvertes[0] === "operateur.html#alerts", sw.ouvertes);

// ---------- 2. Dans le navigateur : abonnement (iPhone simulé) ----------
const fake = new FakeSupabase({ machines: [], products: [], sales: [], users: [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }] });
async function appareil(nom, o = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "fr-BE", timezoneId: "Europe/Brussels", serviceWorkers: "block", ...(o.ctx || {}) });
  for (const [u, t] of Object.entries(LIBTXT)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: t }));
  await fake.attach(ctx, nom);
  const journal = { jeton: [], retirer: [], vapid: 0, subscribe: [], requestPermission: 0, notifs: 0, unsub: 0 };
  const etatVapid = { cle: CLE_PUB };
  await ctx.route("**/rest/v1/rpc/ba_vapid_public", async r => { journal.vapid++; await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(etatVapid.cle) }); });
  await ctx.route("**/rest/v1/rpc/ba_jeton", async r => { journal.jeton.push(JSON.parse(r.request().postData() || "{}")); await r.fulfill({ status: 204, body: "" }); });
  await ctx.route("**/rest/v1/rpc/ba_jeton_retirer", async r => { journal.retirer.push(JSON.parse(r.request().postData() || "{}")); await r.fulfill({ status: 204, body: "" }); });
  // Le navigateur de test n'a pas de service Apple/Google : on simule l'autorisation et l'abonnement (état gardé dans localStorage pour survivre au rechargement)
  await ctx.addInitScript(({ sans, sansPush, perm0 }) => {
    const L = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
    if (sans) { delete window.Notification; return; }
    if (L("__perm") === null) L("__perm", perm0);
    window.__req = 0; window.__sub = []; window.__unsub = 0; window.__notifs = 0;
    function N(t, o) { window.__notifs++; }
    Object.defineProperty(N, "permission", { get: () => L("__perm") });
    N.requestPermission = async () => { window.__req++; L("__perm", "granted"); return "granted"; };
    window.Notification = N;
    if (sansPush) { delete window.PushManager; return; }
    const sub = () => { const e = L("__sub"); if (!e) return null; const o = JSON.parse(e); return { endpoint: o.endpoint, toJSON: () => o, unsubscribe: async () => { window.__unsub++; L("__sub", null); return true; } }; };
    window.PushManager = window.PushManager || function () {};
    window.PushManager.prototype.getSubscription = async () => sub();
    window.PushManager.prototype.subscribe = async function (opts) {
      window.__sub.push({ ok: opts.userVisibleOnly, key: Array.from(new Uint8Array(opts.applicationServerKey)) });
      L("__sub", JSON.stringify({ endpoint: "https://web.push.apple.com/ENDPOINT-TEST", expirationTime: null, keys: { p256dh: "BPUBLIC-" + "A".repeat(80), auth: "AUTH-" + "B".repeat(18) } }));
      return sub();
    };
  }, { sans: !!o.sans, sansPush: !!o.sansPush, perm0: o.perm || "default" });
  const errors = [];
  const ouvrir = async (fichier, email, pass) => {
    const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message));
    await p.goto(U + fichier);
    await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", email || "amor@test.be"); await p.fill("#login-pass", pass || "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    return p;
  };
  return { ctx, journal, errors, ouvrir, etatVapid };
}
const cloche = async p => { await p.waitForSelector("#notif-btn", { timeout: 15000 }); await p.click("#notif-btn"); await p.waitForSelector("#notif-panel"); };
fake.t.ba_notifications = [{ id: 1, cle: "a", type: "panne", titre: "Machine 12 : Ascenseur bloqué", texte: "Erreur 45/54", silencieux: false, cree_at: new Date().toISOString() }];

console.log("== 2. iPhone (appli ajoutée à l'écran d'accueil) : bouton, autorisation, abonnement");
const iph = await appareil("iphone", { ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
let p = await iph.ouvrir("index.html");
await cloche(p);
let txt = await p.innerText("#notif-panel");
ok("panneau 🔔 : bouton « Recevoir les alertes sur cet appareil, même appli fermée » (et pas le bouton « ordinateur »)", !!(await p.$(".np-web")) && /même appli fermée/.test(await p.innerText(".np-web")) && !(await p.$(".np-perm")), txt);
await p.screenshot({ path: path.join(OUT, "iphone-1-bouton.png") });
await p.click(".np-web");
await p.waitForSelector(".np-web-on", { timeout: 10000 });
ok("autorisation demandée UNE fois, par le geste (1er appel après le toucher)", (await p.evaluate(() => window.__req)) === 1);
ok("clé publique demandée au serveur (ba_vapid_public), une fois", iph.journal.vapid === 1, iph.journal.vapid);
const sub = await p.evaluate(() => window.__sub);
ok("abonnement : userVisibleOnly = true (obligatoire sur iPhone) et clé du serveur transmise (65 octets, identique)", sub.length === 1 && sub[0].ok === true && Buffer.from(sub[0].key).toString("base64url") === CLE_PUB, sub);
const jt = iph.journal.jeton.at(-1) || {}, tj = (() => { try { return JSON.parse(jt.t); } catch (e) { return {}; } })();
ok("inscription (ba_jeton) : appareil « web-ios », abonnement complet, page index.html", jt.appareil === "web-ios" && tj.endpoint === "https://web.push.apple.com/ENDPOINT-TEST" && !!tj.keys.p256dh && !!tj.keys.auth && tj.page === "index.html", jt);
ok("le panneau annonce « Alertes actives… » avec un bouton Désactiver ; plus de bouton Activer", /Alertes actives/.test(await p.innerText("#notif-panel")) && !!(await p.$(".np-web-off")) && !(await p.$(".np-web")));
await p.screenshot({ path: path.join(OUT, "iphone-2-actif.png") });
ok("le service worker est inscrit (sw.js, portée = dossier de l'appli)", await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r && /\/sw\.js$/.test((r.active || r.installing || r.waiting).scriptURL) && /\/$/.test(r.scope); }));
// nouvelle alerte quand l'appli est ouverte : le service worker l'affiche, la page ne doit PAS en afficher une deuxième
fake.t.ba_notifications.push({ id: 2, cle: "b", type: "porte", titre: "Machine 4 : porte ouverte", texte: "Ouverte à 01:27", silencieux: false, cree_at: new Date().toISOString() });
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await p.waitForFunction(() => /🔔/.test((document.getElementById("toast") || {}).innerText || ""), null, { timeout: 10000 });
ok("appli ouverte + abonné : message dans l'appli, mais pas de DEUXIÈME notification faite par la page (pas de doublon)", (await p.evaluate(() => window.__notifs)) === 0);
// rechargement : déjà autorisé et abonné → réinscrit sans rien redemander
const nbJeton = iph.journal.jeton.length;
await p.reload(); await p.waitForSelector("#app-nav button", { state: "attached", timeout: 40000 }); await p.waitForFunction(() => document.getElementById("notif-btn"), null, { timeout: 15000 });
await sleep(1500);
ok("rechargement : l'appareil se réinscrit tout seul (même abonnement), sans redemander l'autorisation", iph.journal.jeton.length > nbJeton && iph.journal.jeton.at(-1).t === jt.t && (await p.evaluate(() => window.__req)) === 0, { n: iph.journal.jeton.length, avant: nbJeton });
await cloche(p);
ok("après rechargement : « Alertes actives » tout de suite", /Alertes actives/.test(await p.innerText("#notif-panel")));
// toucher une notification quand l'appli est ouverte (message du service worker) → page Alertes
await p.evaluate(() => { document.getElementById("notif-panel") && document.getElementById("notif-panel").remove(); navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { ba: "aller", vue: "alerts" } })); });
await p.waitForSelector("#view-alerts.active", { timeout: 10000 });
ok("toucher une notification (message du service worker) : la page Alertes s'ouvre", true);
// désactiver
await cloche(p); await p.click(".np-web-off"); await p.waitForSelector(".np-web", { timeout: 10000 });
ok("Désactiver : l'abonnement du navigateur est supprimé ET retiré du serveur (ba_jeton_retirer avec le même jeton)", (await p.evaluate(() => window.__unsub)) === 1 && iph.journal.retirer.at(-1) && iph.journal.retirer.at(-1).t === jt.t, iph.journal.retirer);
// déconnexion
await p.click(".np-web"); await p.waitForSelector(".np-web-on");
await p.evaluate(() => BA.Notifs.retirer());
ok("déconnexion (retirer) : le jeton web est retiré du serveur", iph.journal.retirer.length === 2 && iph.journal.retirer.at(-1).t.includes("ENDPOINT-TEST"), iph.journal.retirer);
ok("aucune erreur JavaScript sur la page iPhone", iph.errors.length === 0, iph.errors);
await iph.ctx.close();

console.log("== 3. Cas particuliers");
// 3a. Le serveur n'a pas encore créé ses clés (au plus 15 min après la mise en place) : message clair, rien d'inscrit
let a = await appareil("attente", { ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
a.etatVapid.cle = null;
p = await a.ouvrir("index.html"); await cloche(p); await p.click(".np-web");
await p.waitForFunction(() => /prépare encore/.test(document.getElementById("notif-panel").innerText), null, { timeout: 10000 });
ok("clés pas encore créées : « Le serveur prépare encore… », aucun abonnement fait, rien inscrit", (await p.evaluate(() => window.__sub.length)) === 0 && a.journal.jeton.length === 0 && !!(await p.$(".np-web")));
a.etatVapid.cle = CLE_PUB; await p.click(".np-web"); await p.waitForSelector(".np-web-on", { timeout: 10000 });
ok("on réessaie plus tard : ça marche", a.journal.jeton.length === 1);
await a.ctx.close();
// 3b. Autorisation refusée
a = await appareil("refus", { perm: "denied", ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
p = await a.ouvrir("index.html"); await cloche(p);
ok("autorisation refusée sur l'appareil : explication (réglages), aucun bouton Activer", /bloque/.test(await p.innerText("#notif-panel")) && !(await p.$(".np-web")) && !(await p.$(".np-perm")));
await a.ctx.close();
// 3c. iPhone dans Safari, appli PAS encore ajoutée à l'écran d'accueil : pas de Notification → explication
a = await appareil("safari", { sans: true, ctx: { userAgent: IPHONE } });
p = await a.ouvrir("index.html"); await cloche(p);
ok("iPhone dans Safari (pas ajouté à l'écran d'accueil) : explication « ouvre depuis l'icône… », aucun bouton", /écran d'accueil/.test(await p.innerText("#notif-panel")) && !(await p.$(".np-web")) && !(await p.$(".np-perm")));
await p.screenshot({ path: path.join(OUT, "iphone-3-safari.png") });
await a.ctx.close();
// 3d. Navigateur sans Web Push (vieux) : l'ancien bouton « sur cet ordinateur » reste
a = await appareil("ancien", { sansPush: true, ctx: { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false } });
p = await a.ouvrir("index.html"); await cloche(p);
ok("navigateur sans Web Push : l'ancien bouton « sur cet ordinateur » est conservé (comportement d'avant)", !!(await p.$(".np-perm")) && !(await p.$(".np-web")));
await a.ctx.close();
// 3e. Compte opérateur (v5.34.7) : pas de cloche, mais un bouton « Activer » dans « Plus » ; l'abonnement est inscrit (page operateur.html)
a = await appareil("operateur", { ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
p = await a.ouvrir("operateur.html", "op@test.be", "Secret-456"); await sleep(1500);
ok("compte opérateur : pas de cloche, rien demandé tant qu'on n'a pas touché le bouton", !(await p.$("#notif-btn")) && a.journal.vapid === 0 && a.journal.jeton.length === 0);
await p.evaluate(() => BA.Shell.go("more")); await p.waitForSelector("#more-notif .np-web", { timeout: 10000 });
await p.click("#more-notif .np-web"); await p.waitForSelector("#more-notif .np-web-off", { timeout: 10000 });
const j3 = JSON.parse(a.journal.jeton.at(-1).t);
ok("compte opérateur : bouton Activer dans « Plus » → abonnement inscrit (page operateur.html, iPhone)", j3.page === "operateur.html" && a.journal.jeton.at(-1).appareil === "web-ios" && a.journal.vapid === 1, j3);
await p.screenshot({ path: path.join(OUT, "iphone-5-operateur-plus.png") });
await p.click("#more-notif .np-web-off"); await p.waitForSelector("#more-notif .np-web", { timeout: 10000 });
ok("compte opérateur : « Désactiver » remet le bouton Activer", true);
await a.ctx.close();
// 3f. Admin sur la page opérateur (cas des iPhones installés avec operateur.html) : même bouton, page « operateur.html » retenue
a = await appareil("admin-operateur", { ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
p = await a.ouvrir("operateur.html"); await cloche(p); await p.click(".np-web"); await p.waitForSelector(".np-web-on", { timeout: 10000 });
const j2 = JSON.parse(a.journal.jeton.at(-1).t);
ok("admin sur operateur.html : abonnement inscrit avec page « operateur.html » (toucher la notification rouvre l'appli opérateur)", j2.page === "operateur.html" && a.journal.jeton.at(-1).appareil === "web-ios", j2);
await p.screenshot({ path: path.join(OUT, "iphone-4-operateur.png") });
await p.evaluate(() => { const x = document.getElementById("notif-panel"); x && x.remove(); navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { ba: "aller", vue: "alerts" } })); });
await p.waitForSelector("#view-alerts.active", { timeout: 10000 });
ok("sur la page opérateur aussi, le toucher mène à la page Alertes", true);
await a.ctx.close();
// 3g. Appli Android (BAPush) : le chemin Firebase reste seul, pas de bouton web
a = await appareil("android", { ctx: { userAgent: "Mozilla/5.0 (Linux; Android 14) BroodautomateOperateurApp BAPush", serviceWorkers: "allow" } });
await a.ctx.addInitScript(() => { window.Capacitor = { Plugins: { PushNotifications: { createChannel: async () => {}, checkPermissions: async () => ({ receive: "granted" }), requestPermissions: async () => ({ receive: "granted" }), addListener: async () => ({ remove() {} }), register: async () => {} } } }; });
p = await a.ouvrir("operateur.html"); await cloche(p);
ok("appli Android : pas de bouton web (Firebase s'en occupe), pas de clé demandée", !(await p.$(".np-web")) && a.journal.vapid === 0);
await a.ctx.close();

// ---------- 4. Vrai navigateur : le vrai sw.js reçoit un vrai événement « push » ----------
console.log("== 4. Chromium exécute le vrai sw.js : message push reçu → notification affichée");
const ctx4 = await b.newContext({ permissions: ["notifications"], serviceWorkers: "allow" });
const p4 = await ctx4.newPage(); const cdp = await ctx4.newCDPSession(p4);
const regs = []; cdp.on("ServiceWorker.workerRegistrationUpdated", e => regs.push(...e.registrations)); await cdp.send("ServiceWorker.enable");
await p4.goto(U + "manifest.webmanifest");                                  // une page de la même origine suffit pour inscrire le service worker
const scope = await p4.evaluate(async () => { const r = await navigator.serviceWorker.register("sw.js", { scope: "./" }); await navigator.serviceWorker.ready; return r.scope; });
ok("sw.js s'inscrit et s'active dans Chromium (aucune erreur de syntaxe)", /\/$/.test(scope), scope);
await sleep(500);
const reg = regs.find(r => r.scopeURL === scope);
let sw4 = ctx4.serviceWorkers()[0]; if (!sw4) sw4 = await ctx4.waitForEvent("serviceworker", { timeout: 5000 }).catch(() => null);
if (reg && sw4) {
  // Chromium sans écran n'affiche pas de vraie bulle : on place un espion sur showNotification DANS le service worker, puis on lui livre un vrai événement « push »
  await sw4.evaluate(() => { self.__vues = []; self.registration.showNotification = async (t, o) => { self.__vues.push({ t, b: o.body, d: o.data, i: o.icon }); }; });
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: new URL(U).origin, registrationId: reg.registrationId, data: JSON.stringify({ titre: "Machine 12 : porte ouverte", texte: "Ouverte à 01:27", vue: "alerts", page: "operateur.html" }) });
  await sleep(1000);
  const vues = await sw4.evaluate(() => self.__vues);
  ok("le vrai sw.js reçoit un vrai événement push et affiche la notification (titre, texte, page à rouvrir, icône)", vues.length === 1 && vues[0].t === "Machine 12 : porte ouverte" && vues[0].b === "Ouverte à 01:27" && vues[0].d.page === "operateur.html" && vues[0].i === "icons/icon-192.png", vues);
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: new URL(U).origin, registrationId: reg.registrationId, data: "texte qui n'est pas du JSON" });
  await sleep(800);
  const v2 = await sw4.evaluate(() => self.__vues);
  ok("message qui n'est pas du JSON : une notification est quand même affichée", v2.length === 2 && v2[1].b === "texte qui n'est pas du JSON", v2);
} else ok("service worker et inscription repérés (CDP)", false, { reg: !!reg, sw: !!sw4 });
await ctx4.close();

await b.close(); srv.close();
console.log(bad ? "\n" + bad + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(bad ? 1 : 0);
