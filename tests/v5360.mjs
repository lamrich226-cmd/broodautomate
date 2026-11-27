// v5.36.0 — « Choisir mes notifications » : on coupe ou on garde les ventes, ruptures de pain, pannes, porte, boîtier (par appareil)
// node v5360.mjs <dossier du site> <dossier des captures>
// Données inventées + faux Supabase : aucune vraie donnée n'est lue ni modifiée, aucun vrai service de notification n'est appelé.
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "x.js"));
const { chromium } = require("playwright");
const { FakeSupabase } = require("./fake_supabase_server");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v5360")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const LIBTXT = Object.fromEntries(Object.entries(LIB).map(([u, f]) => [u, fs.readFileSync(path.join(NM, f), "utf8")]));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) BroodautomateOperateurApp BAPush";
const JETON_TEL = "jeton-firebase-de-test-0123456789";
const CLE_PUB = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
const b = await chromium.launch();
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---------- 0. Fichiers ----------
console.log("== 0. Fichiers : version, textes, mêmes catégories que la fonction du serveur");
ok("version 5.36.0 dans config.js", /version: "5\.36\.0"/.test(lire("js/config.js")));
ok("index.html et operateur.html chargent js/i18n-v5360.js (après v5350)", [lire("index.html"), lire("operateur.html")].every(h => /i18n-v5350\.js\?v=5\.36\.0[\s\S]*i18n-v5360\.js\?v=5\.36\.0/.test(h)));
const ts = lire("supabase/functions/ingest/index.ts");
const mCat = /const CATEGORIES: Record<string, string> = (\{[^}]*\});/.exec(ts);
const catServeur = mCat ? new Function("return " + mCat[1])() : null;

// ---------- Faux serveur ----------
const fake = new FakeSupabase({ machines: [], products: [], sales: [], users: [
  { id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" },
  { id: "99999999-2222-3333-4444-555555555555", email: "op@test.be", password: "Secret-456", meta: { role: "operator" } }] });
const il = (min) => new Date(Date.now() - min * 60000).toISOString();
const departNotifs = () => [
  { id: 1, cle: "a", type: "panne", titre: "Machine 12 : Ascenseur bloqué", texte: "Erreur 45/54", silencieux: false, cree_at: il(50) },
  { id: 2, cle: "b", type: "vente", titre: "3 ventes", texte: "3 × pain gris — 4,20 €", silencieux: false, cree_at: il(40) },
  { id: 3, cle: "c", type: "stock", titre: "plus de pain gris", texte: "Les sélections 11, 12 sont toutes vides.", silencieux: false, cree_at: il(30) },
  { id: 4, cle: "d", type: "porte", titre: "Machine 4 : porte ouverte", texte: "Ouverte à 01:27", silencieux: false, cree_at: il(20) },
  { id: 5, cle: "e", type: "muet", titre: "Machine 7 : boîtier muet", texte: "Plus de nouvelles depuis 2 h", silencieux: false, cree_at: il(10) }];
let suite = 100;
const ajoute = (type, titre) => { fake.t.ba_notifications.push({ id: ++suite, cle: "x" + suite, type, titre, texte: "", silencieux: false, cree_at: new Date().toISOString() }); };

// Un appareil : faux téléphone (ou navigateur), journal des appels « ba_prefs », réglages gardés « sur le serveur »
async function appareil(nom, o = {}) {
  fake.t.ba_notifications = departNotifs();
  const ctx = await b.newContext({ viewport: o.viewport || { width: 375, height: 800 }, isMobile: !o.bureau, hasTouch: !o.bureau, deviceScaleFactor: 2, locale: "fr-BE", timezoneId: "Europe/Brussels", serviceWorkers: "block", ...(o.android ? { userAgent: ANDROID } : {}), ...(o.ctx || {}) });
  for (const [u, t] of Object.entries(LIBTXT)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: t }));
  await fake.attach(ctx, nom);
  const j = { ecrites: [], lues: [], urls: [], jeton: [], erreurs: [] };
  const etat = { srv: o.srv || {}, panne: false, absente: !!o.sansFonction };
  await ctx.route("**/rest/v1/rpc/ba_jeton", async r => { j.jeton.push(JSON.parse(r.request().postData() || "{}")); await r.fulfill({ status: 204, body: "" }); });
  await ctx.route("**/rest/v1/rpc/ba_vapid_public", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CLE_PUB) }));
  await ctx.route("**/rest/v1/rpc/ba_prefs_lire", async r => {
    const c = JSON.parse(r.request().postData() || "{}"); j.lues.push(c);
    if (etat.absente) return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.ba_prefs_lire" }) });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(etat.srv) });
  });
  await ctx.route("**/rest/v1/rpc/ba_prefs", async r => {
    const c = JSON.parse(r.request().postData() || "{}"); j.ecrites.push(c);
    if (etat.absente || etat.panne) return r.fulfill({ status: etat.absente ? 404 : 500, contentType: "application/json", body: JSON.stringify({ message: "panne de test" }) });
    etat.srv = c.p; await r.fulfill({ status: 204, body: "" });
  });
  if (o.android) await ctx.addInitScript((tok) => {
    window.Capacitor = { Plugins: { PushNotifications: {
      createChannel: async () => {}, checkPermissions: async () => ({ receive: "granted" }), requestPermissions: async () => ({ receive: "granted" }),
      addListener: async (n, f) => { window.__ecoute = window.__ecoute || {}; window.__ecoute[n] = f; return { remove() {} }; },
      register: async () => { setTimeout(() => window.__ecoute.registration({ value: tok }), 50); } } } };
  }, JETON_TEL);
  if (o.sansPush) await ctx.addInitScript(() => { delete window.PushManager; });                  // navigateur sans notifications : aucun jeton
  if (o.prefsLocales) await ctx.addInitScript(({ k, v }) => { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch (e) { /* rien */ } }, { k: "broodautomate-v5-notifs-prefs", v: JSON.stringify(o.prefsLocales) });
  const ouvrir = async (fichier, email, pass) => {
    const p = await ctx.newPage(); p.on("pageerror", e => j.erreurs.push(e.message));
    p.on("request", q => { if (/\/rest\/v1\/ba_notifications/.test(q.url())) j.urls.push(decodeURIComponent(q.url())); });
    await p.goto(U + fichier);
    await p.waitForSelector("#login-email", { timeout: 20000 }); await p.fill("#login-email", email || "amor@test.be"); await p.fill("#login-pass", pass || "Secret-123"); await p.click("#login-go");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    return p;
  };
  return { ctx, j, etat, ouvrir };
}
const cloche = async p => { await p.waitForSelector("#notif-btn", { timeout: 15000 }); await p.click("#notif-btn"); await p.waitForSelector("#notif-panel"); };
const cases = p => p.$$eval("#notif-panel .np-prefs input[data-cat]", l => Object.fromEntries(l.map(i => [i.dataset.cat, i.checked])));
const titres = p => p.$$eval("#notif-panel .np-list li b", l => l.map(x => x.textContent));
const badge = p => p.evaluate(() => { const x = document.querySelector("#notif-btn .notif-n"); return x ? x.textContent : ""; });
const prefsLocales = p => p.evaluate(() => localStorage.getItem("broodautomate-v5-notifs-prefs"));
const attend = async (cond, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await sleep(100); } return false; };
const toutes5 = { vente: true, stock: true, alertes: true, porte: true, boitier: true };

// ---------- 1. Appli Android (administrateur) : le cœur du sujet ----------
console.log("== 1. Appli Android (admin) : « Choisir mes notifications » dans la cloche");
const A = await appareil("android", { android: true });
let p = await A.ouvrir("index.html");
await p.waitForFunction(() => window.BA && BA.Notifs && BA.Notifs._st.actif, null, { timeout: 15000 });
await attend(() => A.j.lues.length > 0);
ok("mêmes catégories dans l'appli (js/notifs.js) et dans la fonction du serveur (ingest/index.ts)", !!catServeur && JSON.stringify(Object.entries(await p.evaluate(() => BA.Notifs.CATEGORIES)).sort()) === JSON.stringify(Object.entries(catServeur).sort()), { catServeur });
ok("le téléphone est inscrit (ba_jeton) puis lit ses réglages sur le serveur (ba_prefs_lire) avec le même jeton", A.j.jeton.at(-1) && A.j.jeton.at(-1).t === JETON_TEL && A.j.lues.at(-1).t === JETON_TEL, { jeton: A.j.jeton, lues: A.j.lues });
ok("rien à écrire au serveur tant qu'on n'a rien changé (réglages vides des deux côtés)", A.j.ecrites.length === 0, A.j.ecrites);
await cloche(p);
ok("la cloche a une section repliée « ⚙️ Choisir mes notifications »", (await p.$eval("#notif-panel .np-prefs summary", s => s.textContent)).includes("Choisir mes notifications") && (await p.$eval("#notif-panel .np-prefs", d => !d.open)));
ok("5 cases, toutes cochées au départ ; aucune mention « coupée »", JSON.stringify(await cases(p)) === JSON.stringify(toutes5) && !/coupée/.test(await p.$eval("#notif-panel .np-prefs summary", s => s.textContent)), await cases(p));
ok("la liste montre les 5 notifications (vente 💶 et rupture 🍞 comprises)", (await titres(p)).length === 5 && /💶/.test(await p.innerText("#notif-panel")) && /🍞/.test(await p.innerText("#notif-panel")), await titres(p));
await p.click("#notif-panel .np-prefs summary");
ok("toucher le titre déplie les cases", await p.$eval("#notif-panel .np-prefs", d => d.open));
await p.evaluate(() => { document.getElementById("notif-panel").scrollTop = 0; });
await p.screenshot({ path: path.join(OUT, "01-cloche-reglages.png") });
// libellés en français
const lib = await p.$$eval("#notif-panel .np-prefs label.case", l => l.map(x => x.textContent.replace(/\s+/g, " ").trim()));
ok("libellés clairs en français", /Chaque vente/.test(lib[0]) && /Rupture de pain/.test(lib[1]) && /Pannes/.test(lib[2]) && /Porte ouverte/.test(lib[3]) && /Boîtier muet/.test(lib[4]), lib);
// nouvelles notifications : 2 ventes + 1 panne
await p.keyboard.press("Escape").catch(() => {});
ajoute("vente", "1 vente (neuve)"); ajoute("panne", "Machine 3 : panne (neuve)"); ajoute("vente", "2 ventes (neuves)");
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
ok("3 nouvelles notifications → pastille « 3 » sur la cloche", await attend(async () => (await badge(p)) === "3"), await badge(p));
// on coupe les ventes
await p.click('#notif-panel input[data-cat="vente"]');
ok("décocher « Chaque vente » → le téléphone prévient le serveur (ba_prefs avec SON jeton et {vente:false})", await attend(() => A.j.ecrites.length === 1) && A.j.ecrites[0].t === JETON_TEL && JSON.stringify(A.j.ecrites[0].p) === JSON.stringify({ vente: false }), A.j.ecrites);
ok("la section reste dépliée et annonce « (1 coupée(s)) »", await attend(async () => /1 coupée/.test(await p.$eval("#notif-panel .np-prefs summary", s => s.textContent))) && await p.$eval("#notif-panel .np-prefs", d => d.open));
ok("plus aucune vente dans la liste (ni 💶) ; le reste est là", await attend(async () => !(await titres(p)).some(x => /vente/i.test(x))) && (await titres(p)).length === 5 && !/💶/.test(await p.innerText("#notif-panel .np-list")), await titres(p));
ok("la pastille tombe de 3 à 1 (seule la panne compte)", await attend(async () => (await badge(p)) === "1"), await badge(p));
ok("la liste est relue SANS les ventes côté serveur (type=not.in.(vente)) : elles ne sont même pas téléchargées", await attend(async () => A.j.urls.some(u => /type=not\.in\.\(vente\)/.test(u))), A.j.urls.slice(-3));
ok("réglage gardé aussi dans l'appareil (il survit à la fermeture de l'appli)", (await prefsLocales(p)) === '{"vente":false}', await prefsLocales(p));
await p.evaluate(() => { document.getElementById("notif-panel").scrollTop = 0; });
await p.screenshot({ path: path.join(OUT, "02-ventes-coupees.png") });
// nouvelle vente quand c'est coupé : aucun message ; nouvelle porte : message
await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.textContent = ""; });
ajoute("vente", "Vente cachée n°9");
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await sleep(1800);
ok("une nouvelle vente arrive alors que c'est coupé : aucun message dans l'appli", !/Vente cachée/.test(await p.evaluate(() => (document.getElementById("toast") || {}).innerText || "")));
ajoute("porte", "Machine 9 : porte ouverte (neuve)");
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
ok("une nouvelle porte ouverte arrive : le message s'affiche normalement", await attend(async () => /porte ouverte \(neuve\)/.test(await p.evaluate(() => (document.getElementById("toast") || {}).innerText || ""))));
// rechargement : tout est retenu, rien n'est réécrit au serveur
const nbEcr = A.j.ecrites.length;
await p.reload(); await p.waitForSelector("#app-nav button", { state: "attached", timeout: 40000 }); await p.waitForFunction(() => document.getElementById("notif-btn"), null, { timeout: 15000 });
await attend(() => A.j.lues.length >= 2);
await cloche(p);
ok("après rechargement : « Chaque vente » est toujours décochée, les 4 autres cochées", JSON.stringify(await cases(p)) === JSON.stringify({ ...toutes5, vente: false }), await cases(p));
ok("après rechargement : le serveur avait déjà le même choix, rien n'est réécrit", A.j.ecrites.length === nbEcr, A.j.ecrites);
// on remet les ventes
await p.click("#notif-panel .np-prefs summary");
await p.click('#notif-panel input[data-cat="vente"]');
ok("recocher « Chaque vente » → le serveur reçoit {} (tout est de nouveau permis)", await attend(() => A.j.ecrites.length === nbEcr + 1) && JSON.stringify(A.j.ecrites.at(-1).p) === "{}", A.j.ecrites.at(-1));
ok("les ventes réapparaissent dans la liste", await attend(async () => (await titres(p)).some(x => /vente/i.test(x))), await titres(p));
// le serveur est en panne pendant qu'on décoche une autre catégorie
A.etat.panne = true;
await p.click('#notif-panel input[data-cat="stock"]');
ok("serveur en panne : le choix s'applique quand même sur l'appareil et un message clair l'explique", await attend(async () => /pas encore enregistré/.test(await p.innerText("#notif-panel"))) && !(await titres(p)).some(x => /plus de pain gris/.test(x)), await p.innerText("#notif-panel"));
await p.evaluate(() => { document.getElementById("notif-panel").scrollTop = 0; });
await p.screenshot({ path: path.join(OUT, "03-serveur-en-panne.png") });
A.etat.panne = false;
await p.click('#notif-panel input[data-cat="stock"]');
ok("serveur revenu : on recoche, le message disparaît", await attend(async () => !/pas encore enregistré/.test(await p.innerText("#notif-panel"))) && JSON.stringify(await cases(p)) === JSON.stringify(toutes5), await cases(p));
// 375 px : pas de débordement, cibles tactiles assez grandes
const g = await p.evaluate(() => {
  const r = document.getElementById("notif-panel").getBoundingClientRect(), tailles = [...document.querySelectorAll("#notif-panel .np-prefs summary, #notif-panel .np-prefs label.case")].map(e => Math.round(e.getBoundingClientRect().height));
  return { l: r.left, r: r.right, vw: innerWidth, sw: document.documentElement.scrollWidth, pw: document.getElementById("notif-panel").scrollWidth, cw: document.getElementById("notif-panel").clientWidth, tailles };
});
ok("téléphone 375 px : le panneau tient dans l'écran, rien ne déborde", g.l >= 0 && g.r <= g.vw && g.sw <= g.vw + 1 && g.pw <= g.cw + 1, g);
ok("cibles tactiles : titre et 5 cases font au moins 44 px de haut", g.tailles.length === 6 && g.tailles.every(x => x >= 44), g.tailles);
ok("aucune erreur JavaScript (Android admin)", A.j.erreurs.length === 0, A.j.erreurs);
await A.ctx.close();

// ---------- 2. Langues ----------
console.log("== 2. Néerlandais et anglais");
for (const [code, attendu] of [["nl", [/Elke verkoop/, /Brood op/, /Open deur/, /Mijn meldingen kiezen/]], ["en", [/Every sale/, /Bread running out/, /Door open/, /Choose my notifications/]]]) {
  const L = await appareil("langue-" + code, { android: true });
  p = await L.ouvrir("index.html");
  await p.waitForSelector("#lang-select", { timeout: 15000, state: "attached" }).catch(() => {});
  if (await p.$("#lang-select")) await p.selectOption("#lang-select", code, { force: true }); else await p.evaluate(c => { BA.I18n.set(c, "admin"); BA.Shell.build(); }, code);
  await p.waitForFunction(c => BA.I18n.lang === c, code, { timeout: 5000 });
  await cloche(p); await p.click("#notif-panel .np-prefs summary");
  const t = await p.innerText("#notif-panel");
  ok("langue " + code + " : textes des réglages traduits", attendu.every(r => r.test(t)), t.slice(0, 400));
  await p.click('#notif-panel input[data-cat="stock"]'); await sleep(300);
  ok("langue " + code + " : « (… coupée) » traduit dans le titre repliable", new RegExp(code === "nl" ? "1 uitgeschakeld" : "1 off").test(await p.$eval("#notif-panel .np-prefs summary", s => s.textContent)));
  await L.ctx.close();
}

// ---------- 3. Reprise des réglages du serveur / de l'appareil ----------
console.log("== 3. Nouvel appareil, ancien appareil, fonction du serveur pas encore installée");
let C = await appareil("serveur-d-abord", { android: true, srv: { porte: false } });
p = await C.ouvrir("index.html"); await p.waitForFunction(() => BA.Notifs._st.actif, null, { timeout: 15000 });
ok("appareil sans réglage local, serveur avec {porte:false} : l'appareil reprend le choix du serveur", await attend(async () => (await prefsLocales(p)) === '{"porte":false}'), await prefsLocales(p));
await cloche(p);
ok("… et la case « Porte ouverte » est décochée, la porte n'est pas listée", (await cases(p)).porte === false && !(await titres(p)).some(x => /porte ouverte/.test(x)), { c: await cases(p), t: await titres(p) });
await C.ctx.close();
C = await appareil("appareil-d-abord", { android: true, srv: { vente: false }, prefsLocales: { stock: false } });
p = await C.ouvrir("index.html"); await p.waitForFunction(() => BA.Notifs._st.actif, null, { timeout: 15000 });
ok("appareil avec un choix local {stock:false} et serveur différent : l'appareil fait foi, le serveur est mis à jour", await attend(() => C.j.ecrites.length === 1) && JSON.stringify(C.j.ecrites[0].p) === '{"stock":false}' && JSON.stringify(C.etat.srv) === '{"stock":false}', { ecrites: C.j.ecrites, srv: C.etat.srv });
await C.ctx.close();
C = await appareil("sans-sql", { android: true, sansFonction: true });
p = await C.ouvrir("index.html"); await p.waitForFunction(() => BA.Notifs._st.actif, null, { timeout: 15000 });
await cloche(p); await p.click("#notif-panel .np-prefs summary");
ok("commande SQL pas encore faite (fonctions absentes) : aucun message d'erreur au démarrage, les cases marchent sur l'appareil", !/pas encore enregistré/.test(await p.innerText("#notif-panel")) && JSON.stringify(await cases(p)) === JSON.stringify(toutes5));
await p.click('#notif-panel input[data-cat="vente"]');
ok("… et décocher masque quand même les ventes ici (message « pas encore enregistré » car le serveur ne sait pas encore)", await attend(async () => /pas encore enregistré/.test(await p.innerText("#notif-panel"))) && !(await titres(p)).some(x => /3 ventes/.test(x)));
await C.ctx.close();
// ordinateur sans notifications du navigateur : pas de jeton → seule la cloche est concernée, aucun appel au serveur
C = await appareil("ordinateur", { bureau: true, sansPush: true, viewport: { width: 1280, height: 860 }, ctx: { isMobile: false, hasTouch: false } });
p = await C.ouvrir("index.html"); await cloche(p); await p.click("#notif-panel .np-prefs summary");
await p.click('#notif-panel input[data-cat="vente"]'); await sleep(600);
ok("ordinateur sans notifications du navigateur : la cloche obéit, aucun appel au serveur (pas de jeton)", C.j.ecrites.length === 0 && C.j.lues.length === 0 && !(await titres(p)).some(x => /3 ventes/.test(x)) && (await prefsLocales(p)) === '{"vente":false}');
await p.screenshot({ path: path.join(OUT, "04-ordinateur.png") });
await C.ctx.close();

// ---------- 4. Compte opérateur : jamais de ventes ----------
console.log("== 4. Compte opérateur (page « Plus ») : pas de case « ventes »");
let O = await appareil("operateur-web", { ctx: { userAgent: IPHONE, serviceWorkers: "allow" } });
await O.ctx.addInitScript(() => {
  const L = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  function N() {} Object.defineProperty(N, "permission", { get: () => L("__perm") || "default" }); N.requestPermission = async () => { L("__perm", "granted"); return "granted"; }; window.Notification = N;
  const sub = () => { const e = L("__sub"); if (!e) return null; const o = JSON.parse(e); return { endpoint: o.endpoint, toJSON: () => o, unsubscribe: async () => { L("__sub", null); return true; } }; };
  window.PushManager = window.PushManager || function () {};
  window.PushManager.prototype.getSubscription = async () => sub();
  window.PushManager.prototype.subscribe = async function () { L("__sub", JSON.stringify({ endpoint: "https://web.push.apple.com/ENDPOINT-TEST", expirationTime: null, keys: { p256dh: "BPUBLIC-" + "A".repeat(80), auth: "AUTH-" + "B".repeat(18) } })); return sub(); };
});
p = await O.ouvrir("operateur.html", "op@test.be", "Secret-456"); await sleep(1200);
await p.evaluate(() => BA.Shell.go("more")); await p.waitForSelector("#more-notif .np-web", { timeout: 10000 });
ok("opérateur, notifications pas encore activées : le choix des notifications n'est pas proposé (il n'aurait aucun effet)", !(await p.$("#more-notif .np-prefs-op")));
await p.click("#more-notif .np-web"); await p.waitForSelector("#more-notif .np-prefs-op", { timeout: 10000 });
const caseOp = await p.$$eval("#more-notif .np-prefs-op input[data-cat]", l => l.map(i => i.dataset.cat));
ok("opérateur, notifications activées : 4 cases, SANS « Chaque vente »", caseOp.join() === "stock,alertes,porte,boitier", caseOp);
ok("opérateur : le texte ne parle pas de ventes", !/Chaque vente/.test(await p.innerText("#more-notif")), await p.innerText("#more-notif"));
await p.click('#more-notif input[data-cat="stock"]');
ok("opérateur : décocher « Rupture de pain » → le serveur reçoit {stock:false}", await attend(() => O.j.ecrites.length === 1) && JSON.stringify(O.j.ecrites[0].p) === '{"stock":false}' && /ENDPOINT-TEST/.test(O.j.ecrites[0].t), O.j.ecrites);
await p.screenshot({ path: path.join(OUT, "05-operateur-plus.png") });
const go = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, h: [...document.querySelectorAll("#more-notif label.case")].map(e => Math.round(e.getBoundingClientRect().height)) }));
ok("opérateur 375 px : rien ne déborde, cases d'au moins 44 px", go.sw <= go.vw + 1 && go.h.length === 4 && go.h.every(x => x >= 44), go);
ok("aucune erreur JavaScript (opérateur web)", O.j.erreurs.length === 0, O.j.erreurs);
await O.ctx.close();
O = await appareil("operateur-android", { android: true });
p = await O.ouvrir("operateur.html", "op@test.be", "Secret-456"); await sleep(1200);
await p.evaluate(() => BA.Shell.go("more")); await p.waitForSelector("#more-notif .np-prefs-op", { timeout: 10000 });
ok("opérateur dans l'appli Android : choix des notifications proposé d'office, sans les ventes", (await p.$$eval("#more-notif .np-prefs-op input[data-cat]", l => l.length)) === 4 && !/Chaque vente/.test(await p.innerText("#more-notif")));
await p.click('#more-notif input[data-cat="alertes"]');
ok("opérateur Android : le serveur reçoit {alertes:false} avec le jeton du téléphone", await attend(() => O.j.ecrites.length === 1) && O.j.ecrites[0].t === JETON_TEL && JSON.stringify(O.j.ecrites[0].p) === '{"alertes":false}', O.j.ecrites);
await O.ctx.close();

await b.close(); srv.close();
console.log(bad ? "\n" + bad + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(bad ? 1 : 0);
