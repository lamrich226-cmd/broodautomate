// v5.28 (design-test) : plein écran en 3D (machine à 360°, pains l'un derrière l'autre, parois transparentes) + choix 2D / 3D
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "x.js"))("playwright");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v528")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": f.endsWith(".js") ? "application/javascript; charset=utf-8" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const b = await chromium.launch(), errs = [];
  { const _nc = b.newContext.bind(b); b.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { if (localStorage.getItem("ba_mv_3di") === null) localStorage.setItem("ba_mv_3di", "0"); } catch (e) { /* ok */ } }); return c; }; }     // v5.41 : les pages sont en 3D par défaut ; ces essais vérifient la vue à plat (2D)
for (const [name, page, opt, tel] of [["tel-390", "operateur.html", { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }, true], ["pc-admin", "index.html", { viewport: { width: 1366, height: 800 } }, false]]) {
  console.log("\n== " + name);
  const ctx = await b.newContext({ locale: "fr-BE", ...opt });
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(name + ": " + e.message));
  await p.goto(U + page + "?demo&tick=0"); await p.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await p.waitForTimeout(2000);
  await p.evaluate(() => BA.Shell.go("dashboard")); await p.waitForSelector(".carte-machine", { state: "attached" }); await p.waitForTimeout(800);
  const num = await p.evaluate(() => document.querySelector(".carte-machine [data-mv-open]").dataset.mvOpen);
  await p.click(`.carte-machine [data-mv-open="${num}"]`); await p.waitForTimeout(800);
  const sc = await p.evaluate(() => { const s = document.querySelector("#mv-fs-root .m3-stage"); return { stage: !!s, loaves: document.querySelectorAll("#mv-fs-root .m3-loaf").length, cells: document.querySelectorAll("#mv-fs-root .m3-cell").length, shelves: document.querySelectorAll("#mv-fs-root .m3-shelf").length, tr: s && s.firstElementChild.style.transform, switchOn: document.querySelector('#mv-fs-root [data-m3="on"]').getAttribute("aria-pressed") }; });
  ok("plein écran = 3D par défaut : scène, étagères, pains et tiroirs présents", sc.stage && sc.loaves >= 20 && sc.cells >= 15 && sc.shelves >= 5 && /rotateY/.test(sc.tr || "") && sc.switchOn === "true", sc);
  const prof = await p.evaluate(() => { const z = [...new Set([...document.querySelectorAll("#mv-fs-root .m3-loaf")].map(l => /translate3d\(([^,]+),([^,]+),([^)]+)\)/.exec(l.style.transform)).filter(Boolean).map(m => m[1] + "|" + m[2]))]; const by = {}; [...document.querySelectorAll("#mv-fs-root .m3-loaf")].forEach(l => { const m = /translate3d\(([^,]+),([^,]+),([^)]+)\)/.exec(l.style.transform); const k = m[1] + "|" + m[2]; (by[k] = by[k] || new Set()).add(m[3]); }); return Math.max(...Object.values(by).map(s => s.size)); });
  ok("les pains d'un même tiroir sont rangés l'un derrière l'autre (plusieurs profondeurs)", prof >= 2, prof);
  const clair = await p.evaluate(() => ["left", "right", "roof", "floor", "back"].every(c => { const bg = getComputedStyle(document.querySelector("#mv-fs-root .m3-" + c)).backgroundImage; return /rgba\(/.test(bg) && !/rgb\((?!.*rgba)/.test(bg.replace(/rgba\([^)]*\)/g, "")); }));
  ok("côtés, dessus, dessous et arrière sont transparents (verre)", clair);
  for (const [rx, ry, nom] of [[-4, 0, "de face"], [-8, 90, "côté gauche"], [-8, -90, "côté droit"], [-10, 180, "arrière"], [-60, -30, "dessus"]]) {
    await p.evaluate(([rx, ry]) => { BA.Shell.state.m3 = { rx, ry, z: 1, spin: false }; window.dispatchEvent(new Event("resize")); }, [rx, ry]); await p.waitForTimeout(150);
    ok("orientation " + nom + " appliquée", await p.evaluate(([rx, ry]) => { const m = /rotateX\(([-\d.]+)deg\) rotateY\(([-\d.]+)deg\)/.exec(document.querySelector("#mv-fs-root .m3-box").style.transform); return !!m && Math.abs(+m[1] - rx) < .06 && Math.abs(+m[2] - ry) < .06; }, [rx, ry]));
    await p.screenshot({ path: path.join(OUT, name + "-" + nom.replace(/ /g, "-") + ".png") });
  }
  await p.evaluate(() => { BA.Shell.state.m3 = { rx: -10, ry: -30, z: 1, spin: false }; window.dispatchEvent(new Event("resize")); }); await p.waitForTimeout(200);
  const box = await p.locator("#mv-fs-root .m3-stage").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height * .8;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 100, cy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  const g = await p.evaluate(() => BA.Shell.state.m3.ry);
  ok("glisser fait tourner la machine, sans ouvrir de tiroir", g > -30 + 20 && !(await p.$(".mv-pop")), g);
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, -300); await p.waitForTimeout(150);
  ok("molette : zoom", await p.evaluate(() => BA.Shell.state.m3.z > 1.1));
  { // v5.34.0 : le zoom vise l'endroit du curseur (la machine se décale vers l'opposé), et « Face » remet le décalage à 0
    const t1 = await p.evaluate(() => ({ z: BA.Shell.state.m3.z, tx: BA.Shell.state.m3.tx, ty: BA.Shell.state.m3.ty }));
    ok("zoom vers le curseur : la machine se décale (curseur en bas = machine vers le haut)", t1.z > 1.1 && t1.ty < -5 && Math.abs(t1.tx) < 1, t1);
    await p.click('#mv-fs-root [data-m3="front"]'); await p.waitForTimeout(100);
    await p.mouse.move(box.x + box.width * .9, box.y + box.height * .2); await p.mouse.wheel(0, -300); await p.waitForTimeout(150);
    const t2 = await p.evaluate(() => ({ tx: BA.Shell.state.m3.tx, ty: BA.Shell.state.m3.ty }));
    ok("zoom en haut à droite : la machine se décale vers la gauche et le bas", t2.tx < -5 && t2.ty > 5, t2);
    await p.mouse.wheel(0, 3000); await p.waitForTimeout(150);
    ok("dézoom à 100 % ou moins : décalage remis à 0", await p.evaluate(() => { const m = BA.Shell.state.m3; return m.z <= 1 && !m.tx && !m.ty; }));
    await p.mouse.move(cx, cy); await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
  }
  await p.click('#mv-fs-root [data-m3="front"]'); await p.waitForTimeout(150);
  ok("« Face » remet la machine de face", await p.evaluate(() => BA.Shell.state.m3.ry === 0 && BA.Shell.state.m3.z === 1 && !BA.Shell.state.m3.tx && !BA.Shell.state.m3.ty));
  await p.click('#mv-fs-root [data-m3="spin"]'); await p.waitForTimeout(700);
  const r1 = await p.evaluate(() => BA.Shell.state.m3.ry); await p.waitForTimeout(400); const r2 = await p.evaluate(() => BA.Shell.state.m3.ry);
  ok("« Tourner seul » : la machine tourne toute seule", r2 > r1 && r1 > 0, [r1, r2]);
  await p.click('#mv-fs-root [data-m3="spin"]'); await p.waitForTimeout(100);
  await p.click("#mv-fs-root .m3-cell[data-mv-sel]"); await p.waitForTimeout(400);
  ok("toucher un tiroir (sans glisser) : sa fenêtre s'ouvre par-dessus", await p.evaluate(() => { const e = document.querySelector(".mv-pop"), r = e && e.getBoundingClientRect(), t = r && document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!t && e.contains(t); }));
  await p.click(".mv-pop-x"); await p.waitForTimeout(250);
  await p.evaluate(() => BA.Store.ping()); await p.waitForTimeout(400);
  ok("mise à jour des données : toujours en 3D", !!(await p.$("#mv-fs-root .m3-stage")));
  if (tel) ok("téléphone : la machine fait exactement la taille de l'écran", await p.evaluate(() => { const f = document.querySelector("#mv-fs-root .mv-fs"); return f.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth; }));
  await p.click('#mv-fs-root [data-m3="flat"]'); await p.waitForTimeout(400);
  ok("choix « 2D » : l'ancien plein écran plat (tiroirs 2D, plus de scène 3D)", !(await p.$("#mv-fs-root .m3-stage")) && (await p.$$("#mv-fs-root .mv-d-box")).length >= 15 && await p.evaluate(() => document.querySelector('#mv-fs-root [data-m3="flat"]').getAttribute("aria-pressed") === "true"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.evaluate(() => BA.Shell.go("dashboard")); await p.waitForTimeout(200);
  await p.click(`.carte-machine [data-mv-open="${num}"]`); await p.waitForTimeout(500);
  ok("le choix 2D est gardé à la prochaine ouverture", !(await p.$("#mv-fs-root .m3-stage")));
  await p.click('#mv-fs-root [data-m3="on"]'); await p.waitForTimeout(400);
  ok("choix « 3D 360° » : retour en 3D", !!(await p.$("#mv-fs-root .m3-stage")));
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok("Échap : retour au Dashboard", !(await p.$("#mv-fs-root")) && await p.evaluate(() => BA.Shell.state.view === "dashboard"));
  await p.evaluate(() => BA.Shell.go("details")); await p.waitForTimeout(500);
  ok("Détails machine : bouton « Plein écran » toujours là, titre conservé", !!(await p.$("#view-details [data-mv-full='1']")) && !!(await p.$("#view-details .mv-wrap h3")));
  await ctx.close();
}
ok("aucune erreur dans les pages", errs.length === 0, errs.slice(0, 5));
await b.close(); srv.close(); console.log(bad ? `\n${bad} ÉCHEC(S)` : "\nTOUT EST BON"); process.exit(bad ? 1 : 0);
