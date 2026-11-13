// Essais de la v5.24 (design-test) : vue machine (tiroirs, prix, places « Non utilisé ») et « Remplir » en touchant les tiroirs.
// Tourne sur le MODE DÉMO (?demo&tick=0) : 20 machines inventées, aucune donnée réelle, rien n'est envoyé.
// node v524.mjs <dossier du site> <dossier des captures>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || "captures-v524");
fs.mkdirSync(OUT, { recursive: true });
const TESTS = path.dirname(new URL(import.meta.url).pathname), NM = path.join(TESTS, "node_modules");
const LIB = {
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": NM + "/@supabase/supabase-js/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": NM + "/chart.js/dist/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": NM + "/xlsx/dist/xlsx.full.min.js"
};
const TY = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TY[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ko = 0;
const ok = (n, c, x) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c || x === undefined ? "" : "  → " + JSON.stringify(x).slice(0, 400))); if (!c) ko++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await chromium.launch();
  const errs = [], sortis = [];
  const device = async (name, opts, page, vue) => {
    const ctx = await browser.newContext(Object.assign({ locale: "fr-BE", timezoneId: "Europe/Brussels", colorScheme: "light" }, opts));
    for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(f, "utf8") }));
    // le mode démo ne doit jamais laisser partir une requête vers Supabase
    await ctx.route(/supabase\.co/, r => { sortis.push(r.request().url()); r.abort(); });
    if (vue) await ctx.addInitScript(v => { try { localStorage.setItem("ba_wz_vue", v); } catch (e) { /* */ } }, vue);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(name + " : " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(name + " : " + m.text()); });
    await p.goto(URL0 + page + "?demo&tick=0");
    await p.waitForSelector("#app-nav button", { timeout: 40000, state: "attached" });
    await sleep(1500);
    return p;
  };
  const shot = async (p, n, full) => { await sleep(350); await p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: !!full }); };
  const S = (p, f, a) => p.evaluate(f, a);

  console.log("== 1. Admin (ordinateur) : Dashboard et Détail machine");
  const a = await device("pc", { viewport: { width: 1440, height: 900 } }, "index.html");
  ok("Dashboard : une petite machine sur chaque carte (20)", (await a.$$(".carte-machine .mv-compact")).length === 20);
  await S(a, () => { BA.Shell.state.machine = 105; BA.Shell.go("details"); });
  await a.waitForSelector(".mv-wrap"); await sleep(400);
  ok("#105 (5 étages) : 15 tiroirs et 3 places « Non utilisé » (étage 6)", (await a.$$(".mv-wrap [data-mv-sel]")).length === 15 && (await a.$$(".mv-wrap [data-mv-free]")).length === 3);
  ok("prix affiché sur chaque tiroir", (await a.$$eval(".mv-wrap [data-mv-sel] .mv-pr", l => l.filter(x => /\d,\d\d\s?€/.test(x.textContent)).length)) === 15);
  ok("places libres numérotées comme les autres étages (61, 63, 65)", (await a.$$eval(".mv-wrap [data-mv-free]", l => l.map(x => x.dataset.mvFree).join())) === "61,63,65");
  await a.click('[data-mv-free="63"]'); await sleep(300);
  ok("toucher « Non utilisé » ouvre le formulaire d'ajout (n° 63 proposé)", await a.$eval("#mva-n-105", i => i.value) === "63");
  await a.selectOption("#mva-type-105", "maya"); await sleep(200);
  await a.fill("#mva-cap-105", "3"); await a.fill("#mva-price-105", "3.10");
  await shot(a, "v524-01-ajout-pc");
  await a.click("[data-mva-go]"); await sleep(700);
  let sel = await S(a, () => { const m = BA.Model.machine(BA.Store.get(), 105); const x = BA.Model.sel(m, 63); return x && { type: x.type, cap: x.cap, price: x.price }; });
  ok("sélection 63 ajoutée (Pain MAYA, 3 pains, 3,10 €)", sel && sel.type === "maya" && sel.cap === 3 && sel.price === 3.1, sel);
  ok("le panneau montre la nouvelle sélection", /Sélection 63/.test(await a.innerText(".mv-side .mv-panel")));
  await a.fill("#mvx-price-105", "3.40"); await a.click("[data-mvx-save]"); await sleep(600);
  sel = await S(a, () => { const s = BA.Store.get(), x = BA.Model.sel(BA.Model.machine(s, 105), 63); const j = (s.journal || []).filter(e => e.k === "price" && e.n === 105 && e.s === 63).pop(); return { price: x.price, log: j ? [j.p0, j.p] : null }; });
  ok("prix changé dans le tiroir : 3,40 €, noté dans l'Historique (3,10 → 3,40)", sel.price === 3.4 && sel.log && sel.log[0] === 3.1 && sel.log[1] === 3.4, sel);
  ok("message « Prix de la sélection 63 : 3,40 € »", /Prix de la sélection 63 : 3,40/.test(await a.innerText(".mv-side")));
  await a.click('[data-mvx-del="63"]'); await a.waitForSelector("#dlg-ok"); await a.click("#dlg-ok"); await sleep(600);
  ok("supprimer (avec confirmation) : la place redevient « Non utilisé »", !(await S(a, () => BA.Model.sel(BA.Model.machine(BA.Store.get(), 105), 63))) && !!(await a.$('[data-mv-free="63"]')));
  const bad = await S(a, () => { const s = BA.Store.get(), m = BA.Model.machine(s, 105); const sel = m.sels.find(x => x.lots.some(l => BA.Model.isOld(s, l))); return sel ? sel.n : null; });
  if (bad) {
    await a.click(`#mvt-105-${bad}`); await sleep(300);
    await a.click(".mv-side [data-mv-rm]"); await sleep(400);
    ok("« Retirer » d'un lot ouvre la fenêtre habituelle de retrait", !!(await a.$("#modal-root .modal")));
    await a.keyboard.press("Escape"); await sleep(200);
  }
  await S(a, () => BA.Shell.go("products")); await sleep(600);
  ok("Produits / Stock : la vue machine est aussi là (avec le tableau)", !!(await a.$("#view-products .mv-wrap")) && !!(await a.$("#view-products .sel-table")));

  console.log("\n== 2. Opérateur (téléphone) : Remplir en touchant les tiroirs");
  const o = await device("tel", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "operateur.html");
  // une machine avec des pains à retirer, au moins 2 pains dans un tiroir et de la place
  const num = await S(o, () => {
    const s = BA.Store.get(), M = BA.Model;
    const m = s.machines.find(x => !x.door && !x.power && M.removalList(s, x, null).length >= 2 && x.sels.some(z => M.qty(z) >= 2) && x.sels.some(z => z.cap - M.qty(z) >= 2));
    return m.num;
  });
  await S(o, n => BA.Wizard.open(n), num); await o.waitForSelector("#wz-mv");
  ok(`#${num} : la vue « Machine » est choisie par défaut (bouton Machine / Tableau)`, !!(await o.$('.wz-vue [data-wzvue="machine"].active')) && !(await o.$("#inv-yes")));
  await shot(o, "v524-02-inventaire-tel");
  // étape 1 : un tiroir compté avec un pain de moins
  const inv = await S(o, n => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, n); const sel = m.sels.find(z => M.qty(z) >= 2); M.sortLots(sel); return { n: sel.n, q: M.qty(sel), first: { id: sel.lots[0].id, qty: sel.lots[0].qty } }; }, num);
  await o.click(`#mvt-${num}-${inv.n}`); await sleep(250);
  ok("téléphone : le panneau s'ouvre sous l'étage touché", !!(await o.$(".mv-inline .mv-panel")) && !(await o.$(".mv-side")));
  await o.click("#mvi-m"); await sleep(250);
  ok("le tiroir affiche la correction (✏ q → q−1) et un pain barré", (await o.innerText(`#mvt-${num}-${inv.n} .mv-st`)).includes(`${inv.q} → ${inv.q - 1}`) && (await o.$$(`#mvt-${num}-${inv.n} .k-miss`)).length >= 1);
  await shot(o, "v524-03-inventaire-correction-tel");
  // aller-retour vers le tableau : la correction suit
  await o.click('[data-wzvue="table"]'); await sleep(300);
  ok("bouton « Tableau » : le tableau reprend la correction (mode modifier)", await o.$eval(`#inv-${inv.n}`, i => Number(i.value)) === inv.q - 1);
  await o.click('[data-wzvue="machine"]'); await sleep(300);
  ok("retour « Machine » : la correction est toujours là", (await o.innerText(`#mvt-${num}-${inv.n} .mv-st`)).includes("→"));
  await o.click("#mvw-inv-ok"); await o.waitForSelector("#mvw-rm-yes, #mvw-rm-ok, #mvw-rm-next");
  const after1 = await S(o, a => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, a.num), sel = M.sel(m, a.n); const it = s.interventions.find(x => x.num === a.num && x.status === "open"); const l = sel.lots.find(x => x.id === a.first.id); return { q: M.qty(sel), real: it.inv.find(r => r.sel === a.n).real, lot: l ? l.qty : 0 }; }, Object.assign({ num }, inv));
  ok("inventaire enregistré : un pain en moins, pris dans le lot le plus ancien", after1.q === inv.q - 1 && after1.real === inv.q - 1 && after1.lot === inv.first.qty - 1, after1);
  // étape 2 : garder un lot une fois, retirer les autres
  const rows = await S(o, () => BA.Wizard.w.rows.map(r => ({ sel: r.sel, lotId: r.lotId, qty: r.qty, mandatory: r.mandatory })));
  const keep = rows.find(r => !r.mandatory);
  await o.click(`#mvt-${num}-${keep.sel}`); await sleep(250);
  await shot(o, "v524-04-retrait-tel");
  await o.click(`#mvr-k-${keep.sel}-${keep.lotId}`); await sleep(250);
  ok("« Encore bon » : le tiroir montre les pains gardés (⏳)", (await o.$$(`#mvt-${num}-${keep.sel} .mv-loaf.k-keep`)).length === keep.qty);
  await shot(o, "v524-05-retrait-garder-tel");
  await o.click("#mvw-rm-ok"); await o.waitForSelector("#mvw-ld-ok");
  const after2 = await S(o, a => {
    const s = BA.Store.get(), M = BA.Model, m = M.machine(s, a.num), it = s.interventions.find(x => x.num === a.num && x.status === "open");
    const lotOf = r => { const sel = M.sel(m, r.sel); return sel && sel.lots.find(l => l.id === r.lotId); };
    return { mode: it.remMode, kept: !!(lotOf(a.keep) && lotOf(a.keep).kept), gone: a.rows.filter(r => r !== a.keep && r.lotId !== a.keep.lotId).every(r => !lotOf(r)), total: it.remTotal };
  }, { num, keep, rows });
  const expOut = rows.filter(r => r.lotId !== keep.lotId).reduce((x, r) => x + r.qty, 0);
  ok("retrait enregistré : le lot gardé reste (gardé une fois), les autres sont retirés", after2.mode === "edit" && after2.kept && after2.gone && after2.total === expOut, after2);
  // étape 3 : charger 2 pains dans un tiroir
  const ld = await S(o, n => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, n); const sel = m.sels.find(z => z.cap - M.qty(z) >= 2); return { n: sel.n, q: M.qty(sel), lots: sel.lots.length, delivery: BA.Wizard.w.delivery }; }, num);
  await o.click(`#mvt-${num}-${ld.n}`); await sleep(250);
  await o.click(`#mvl-${ld.n}-0-p`); await sleep(150); await o.click(`#mvl-${ld.n}-0-p`); await sleep(250);
  ok("chargement : 2 nouveaux pains dessinés (＋) et le total suit", (await o.$$(`#mvt-${num}-${ld.n} .mv-loaf.k-new`)).length === 2 && /2 pain/.test(await o.innerText("#mvl-total")));
  await shot(o, "v524-06-chargement-tel");
  await o.click("#mvw-ld-ok"); await o.waitForSelector("#wz-close");
  const after3 = await S(o, a => { const s = BA.Store.get(), M = BA.Model, sel = M.sel(M.machine(s, a.num), a.n); const it = s.interventions.find(x => x.num === a.num); const l = sel.lots.find(x => x.date === a.delivery); return { q: M.qty(sel), load: it.load.find(r => r.sel === a.n).qty, status: it.status, lot: l ? l.qty : 0 }; }, Object.assign({ num }, ld));
  ok("chargement enregistré : +2 pains avec la date de livraison, intervention terminée", after3.q === ld.q + 2 && after3.load === 2 && after3.status === "done" && after3.lot >= 2, after3);
  ok("fin : la machine telle qu'elle est maintenant", !!(await o.$("#modal-root .mv-glass")));
  await shot(o, "v524-07-fin-tel", true);
  await o.click("#wz-close"); await sleep(300);

  console.log("\n== 3. Vue « Tableau » : le chemin d'avant fonctionne toujours");
  const t2 = await device("tel-tableau", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "operateur.html", "table");
  const n2 = await S(t2, () => BA.Store.get().machines.find(m => !m.door && !m.power).num);
  await S(t2, n => BA.Wizard.open(n), n2);
  await t2.waitForSelector("#inv-yes"); await t2.click("#inv-yes");
  await t2.waitForSelector("#rm-next, #rm-yes"); await t2.click((await t2.$("#rm-yes")) ? "#rm-yes" : "#rm-next");
  await t2.waitForSelector("#ld-validate"); await t2.click("#ld-validate"); await t2.waitForSelector("#wz-close");
  ok("tableau : inventaire → retrait → chargement, comme avant", await S(t2, n => BA.Store.get().interventions.find(x => x.num === n).status === "done", n2));

  console.log("\n== 4. Ordinateur : Remplir avec le panneau à droite");
  const p2 = await device("pc-op", { viewport: { width: 1440, height: 900 } }, "operateur.html", "machine");
  const n3 = await S(p2, () => { const s = BA.Store.get(); return s.machines.find(m => !m.door && !m.power && BA.Model.removalList(s, m, null).length).num; });
  await S(p2, n => BA.Wizard.open(n), n3); await p2.waitForSelector("#wz-mv .mv-side");
  ok("ordinateur : fenêtre large, panneau à droite", !!(await p2.$(".modal.wz-wide")) && !!(await p2.$("#wz-mv .mv-side .mv-panel")));
  await shot(p2, "v524-08-inventaire-pc");
  await p2.click("#mvw-inv-yes"); await p2.waitForSelector("#mvw-rm-yes, #mvw-rm-ok");
  await shot(p2, "v524-09-retrait-pc");
  await p2.click("#mvw-rm-yes"); await p2.waitForSelector("#mvw-ld-ok");
  await p2.click("#mvw-ld-full"); await sleep(300);
  await shot(p2, "v524-10-chargement-pc");
  const full = await S(p2, n => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, n); return m.sels.reduce((a, z) => a + z.cap - M.qty(z), 0); }, n3);
  ok("« Tout remplir à fond » : le total = toutes les places libres", (await p2.innerText("#mvl-total")).includes(String(full)));
  await p2.click("#wz-cancel"); await p2.click("#wz-cancel"); await sleep(300);

  ok("aucune requête vers Supabase en mode démo", sortis.length === 0, sortis.slice(0, 3));
  ok("aucune erreur dans les pages", errs.length === 0, errs.slice(0, 5));
  await browser.close(); srv.close();
  console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT EST BON");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
