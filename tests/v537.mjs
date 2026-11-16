// AUDIT COMPLET (v5.33) — toute l'appli, admin ET opérateur, dans le vrai Chromium, en mode démo (20 machines inventées,
// rien n'est envoyé nulle part). Pour chaque page :
//   • ouverture de chaque onglet en français, néerlandais et anglais, sur téléphone et sur PC ;
//   • relevé des erreurs JavaScript, des textes cassés (undefined, NaN, {variable}…), des clés de traduction manquantes,
//     des mots français oubliés en NL/EN, des pages ou fenêtres qui débordent à droite ;
//   • le « singe » (français, téléphone + PC) : clic sur chaque bouton / liste / case de chaque onglet, puis sur chaque bouton
//     de la fenêtre ouverte, avec des valeurs bizarres dans les cases (vide, -5, texte, 999999, HTML) ;
//     après chaque clic : erreurs, textes cassés, et données impossibles (stock négatif, NaN, plus de pains que de places…).
// node v537.mjs <dossier du site> <dossier des captures> [rapide]
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v537");
const RAPIDE = process.argv.includes("rapide");
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname), NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": NM + "/@supabase/supabase-js/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": NM + "/chart.js/dist/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": NM + "/xlsx/dist/xlsx.full.min.js"
};
const TY = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = new Set();
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { missing.add(p); res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ko = 0;
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 900))); if (!c) ko++; };
const findings = [];
const AUDIT = fs.readFileSync(path.join(TESTS, "audit-page.js"), "utf8");

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch();

  async function open(page, vp) {
    const ctx = await browser.newContext({ locale: "fr-BE", timezoneId: "Europe/Brussels", viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    const p = await ctx.newPage();
    const pe = []; p.on("pageerror", e => pe.push(e.message));
    p.on("dialog", d => d.accept().catch(() => {}));
    await p.goto(URL0 + page + "?demo&tick=0");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" }); await sleep(1500);
    await p.addScriptTag({ content: AUDIT });
    const en = await p.evaluate(() => __A.enrich()); await sleep(400);
    return { ctx, p, pe, en };
  }

  const combos = [];
  // « rapide » (chaîne d'essais) : singe sur téléphone en français ; NL/EN sur téléphone et FR sur PC : ouverture de chaque onglet
  for (const page of ["index.html", "operateur.html"]) for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 900 }])
    for (const lang of ["fr", "nl", "en"]) {
      if (RAPIDE && vp.width > 600 && lang !== "fr") continue;
      combos.push({ page, vp, lang, singe: (lang === "fr" || process.env.SINGE === "1") && !(RAPIDE && vp.width > 600) });
    }

  for (const c of combos) {
    const tag0 = (c.page === "index.html" ? "admin" : "op") + "-" + (c.vp.width < 600 ? "tel" : "pc") + "-" + c.lang;
    if (process.env.SEUL && !process.env.SEUL.split(",").includes(tag0)) continue;
    const tag = (c.page === "index.html" ? "admin" : "op") + "-" + (c.vp.width < 600 ? "tel" : "pc") + "-" + c.lang;
    console.log("== " + tag + (c.singe ? " (+ singe)" : ""));
    let { ctx, p, pe, en } = await open(c.page, c.vp);
    if (tag === "admin-tel-fr") ok("données de départ : alertes, remplissages, déplacement : " + JSON.stringify(en), en.events > 20 && en.its >= 3, en);
    const role = c.page === "index.html" ? "admin" : "op";
    await p.evaluate(({ l, role }) => { BA.I18n.set(l, role); BA.Shell.build(); }, { l: c.lang, role }); await sleep(300);
    const views = await p.evaluate(() => BA.Shell.ctx.views.map(v => v.id));
    const skip = [];
    for (const v of views) {
      // 1) ouverture de l'onglet : textes, débordements, traductions
      const r = await p.evaluate(async ({ v, lang }) => { await __A.go(v); await new Promise(r => setTimeout(r, 450)); const sc = __A.scan({ lang, allowNull: v === "technique" || v === "rs232" }); return { sc, t: __A.take(), n: (document.querySelector("#app-main .view.active") || {}).innerText.length }; }, { v, lang: c.lang });
      await p.screenshot({ path: path.join(OUT, tag + "-" + v + ".png"), fullPage: false });
      const add = (kind, detail) => findings.push({ tag, where: v, kind, detail });
      if (r.t.errs.length) add("erreur JS", r.t.errs);
      if (r.t.logs.length) add("console.error", r.t.logs);
      if (r.sc.bad.length) add("texte cassé", r.sc.bad);
      if (r.sc.over > 2) add("la page déborde à droite", r.sc.over + " px");
      if (r.sc.wide.length) add("élément plus large que l'écran", r.sc.wide);
      if (r.sc.fr.length) add("texte français dans une autre langue", r.sc.fr);
      if (r.n < 30) add("onglet presque vide", r.n);
      // 2) le singe
      if (c.singe) {
        const sets = [{ layout: "cards", mode: "machine", ss: "bloc" }];
        if (["dashboard", "details", "products", "fill", "todo", "missions"].includes(v)) sets.push({ layout: "list", mode: "classic", ss: "tab" });
        for (const prefs of sets) {
        let tries = 0;
        while (tries++ < 6) {
          try {
            const out = await p.evaluate(({ v, lang, skip, prefs }) => __A.monkey(v, { lang, depth2: true, max: 60, max2: 12, skip, prefs }), { v, lang: c.lang, skip, prefs });
            out.forEach(x => findings.push(Object.assign({ tag }, x)));
            const st = await p.evaluate(() => __A.stats); console.log("   " + v + " [" + prefs.mode + "] : " + st.clics + " clics, " + st.fenetres + " fenêtres ouvertes, " + st.clics2 + " clics dans les fenêtres, " + out.length + " remarque(s)");
            break;
          } catch (e) {
            // la page a été rechargée par un clic (ex. « Recharger ») : on note ce bouton et on recommence sans lui
            const last = await p.evaluate(() => sessionStorage.getItem("__last")).catch(() => null);
            findings.push({ tag, where: v, kind: "la page s'est rechargée / a changé", detail: (last || "?") + " — " + e.message.split("\n")[0] });
            try { const l = JSON.parse(last); if (l && l.sig) skip.push(l.sig); } catch (x) { skip.push("?"); }
            await ctx.close(); ({ ctx, p, pe, en } = await open(c.page, c.vp));
            await p.evaluate(({ l, role }) => { BA.I18n.set(l, role); BA.Shell.build(); }, { l: c.lang, role }); await sleep(300);
          }
        }
      }
      }
    }
    const miss = await p.evaluate(() => __A.misses.splice(0));
    const uniq = [...new Map(miss.map(m => [m.k + "|" + m.lang, m])).values()];
    if (uniq.length) findings.push({ tag, where: "traductions", kind: "clé de traduction manquante", detail: uniq.slice(0, 30) });
    if (pe.length) findings.push({ tag, where: "page", kind: "erreur JS (pageerror)", detail: [...new Set(pe)].slice(0, 10) });
    await ctx.close();
  }
  if (missing.size) findings.push({ tag: "serveur", where: "fichiers", kind: "fichier demandé mais absent", detail: [...missing] });

  // ---------- rapport ----------
  const groups = new Map();
  for (const f of findings) {
    const k = f.kind + " | " + JSON.stringify(f.detail).slice(0, 160);
    if (!groups.has(k)) groups.set(k, { kind: f.kind, detail: f.detail, where: [] });
    const g = groups.get(k); if (g.where.length < 6) g.where.push(f.tag + " : " + f.where);
  }
  const list = [...groups.values()];
  fs.writeFileSync(path.join(OUT, "rapport.json"), JSON.stringify(list, null, 1));
  console.log("\n==== " + list.length + " problème(s) différent(s) ====");
  for (const g of list) console.log("\n• " + g.kind + "\n   " + JSON.stringify(g.detail).slice(0, 700) + "\n   où : " + g.where.join(" ; "));
  const graves = list.filter(g => /erreur JS|pageerror|texte cassé|données impossibles|XSS|traduction manquante|déborde|plus large|presque vide|absent|erreur au clic/.test(g.kind));
  ok("aucun problème grave (" + graves.length + ")", graves.length === 0, graves.map(g => g.kind).slice(0, 20));
  await browser.close(); srv.close();
  console.log(ko ? "v5.37 (audit) : " + ko + " ÉCHEC(S)" : "v5.37 (audit) : TOUT EST OK"); process.exit(ko ? 1 : 0);
})();
