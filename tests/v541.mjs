// v5.41 (design-test) : la 3D dans les pages (Détail machine, Remplir de l'opérateur), dans la fenêtre d'un tiroir, couleurs des pains par état, machine plus grande
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "x.js"))("playwright");
const ROOT = path.resolve(here, process.argv[2] || ".."), OUT = path.resolve(process.argv[3] || path.join(here, "captures-v541")); fs.mkdirSync(OUT, { recursive: true });
const NM = path.join(here, "node_modules");
const LIB = { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js": "@supabase/supabase-js/dist/umd/supabase.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js": "chart.js/dist/chart.umd.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": f.endsWith(".js") ? "application/javascript; charset=utf-8" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const U = "http://127.0.0.1:" + srv.address().port + "/";
let bad = 0; const ok = (n, c, d) => { console.log((c ? "  OK     " : "  ÉCHEC  ") + n + (c ? "" : " → " + JSON.stringify(d))); if (!c) bad++; };
const b = await chromium.launch(), errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(name, page, opt, pre) {
  const ctx = await b.newContext({ locale: "fr-BE", ...opt });
  if (pre) await ctx.addInitScript(pre);
  for (const [u, f] of Object.entries(LIB)) await ctx.route(u, r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, f), "utf8") }));
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(name + ": " + e.message));
  await p.goto(U + page + "?demo&tick=0"); await p.waitForSelector("#app-nav button, #app-tabbar button", { state: "attached", timeout: 30000 }); await p.waitForTimeout(1800);
  return p;
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png") });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, pc = { viewport: { width: 1366, height: 800 } };
const pick = p => p.evaluate(() => { const s = BA.Store.get(), M = BA.Model; const m = s.machines.find(x => !x.door && !x.power && M.removalList(s, x, null).length >= 2 && x.sels.some(z => M.qty(z) >= 2) && x.sels.some(z => z.cap - M.qty(z) >= 2)); return m.num; });

// ---- 1. par défaut : les pages restent à plat (2D), avec le choix « 2D | 3D 360° »
console.log("\n== 1. Défaut = 2D, choix 2D | 3D dans les pages");
let a = await open("pc-defaut", "index.html", pc);
const numA = await pick(a);
await a.evaluate(n => { BA.Shell.state.machine = n; BA.Shell.go("details"); }, numA); await a.waitForSelector(".mv-wrap"); await sleep(400);
ok("Détail machine : à plat par défaut + bouton « 2D | 3D 360° »", !!(await a.$("#view-details .mv-grid")) && !(await a.$("#view-details .m3-stage")) && !!(await a.$('#view-details [data-m3="on"][data-m3c]')));
await a.click('#view-details [data-m3="on"][data-m3c]'); await sleep(600);
ok("« 3D 360° » : la machine apparaît en 3D dans la page", !!(await a.$("#view-details .m3-inline .m3-stage")) && (await a.$$("#view-details .m3-loaf")).length >= 10);
const st1 = await a.evaluate(() => { const s = document.querySelector("#view-details .m3-stage"), r = s.getBoundingClientRect(); const bx = document.querySelector("#view-details .m3-front").getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), bw: Math.round(bx.width), bh: Math.round(bx.height) }; });
ok("la machine 3D remplit bien l'espace (au moins 80 % de la hauteur ou de la largeur)", st1.bh >= st1.h * .8 || st1.bw >= st1.w * .8, st1);
await a.locator("#view-details .m3-stage").scrollIntoViewIfNeeded(); await sleep(200);
await shot(a, "pc-detail-3d");
// couleurs : pains tous de la même couleur sauf états
const cols = await a.evaluate(() => { const o = {}; document.querySelectorAll("#view-details .m3-loaf:not(.m3-ghost)").forEach(l => { const k = l.className.replace(/m3-loaf|ty-\S+/g, "").trim() || "normal"; const c = getComputedStyle(l.querySelector(".m3-f.fr")).backgroundColor; o[k] = c; }); return o; });
console.log("   couleurs :", JSON.stringify(cols));
ok("aucune couleur par type de pain (plus de classe ty-)", await a.evaluate(() => !document.querySelector("#view-details .m3-loaf[class*='ty-']")));
ok("à retirer = rouge, frais = vert, bientôt à retirer = orange", cols["k-old"] === "rgb(229, 72, 77)" && cols["k-ok a-fresh"] === "rgb(82, 194, 122)" && cols["k-ok a-late"] === "rgb(240, 146, 43)", cols);
ok("un pain « normal » est doré (même couleur pour tous les types)", await a.evaluate(() => { const l = document.createElement("div"); l.className = "m3-loaf k-ok"; l.innerHTML = '<i class="m3-f fr"></i>'; document.querySelector("#view-details .m3-box").appendChild(l); const c = getComputedStyle(l.firstChild).backgroundColor; l.remove(); return c; }) === "rgb(217, 164, 65)");
// tourner et zoomer dans la page
const bx = await a.locator("#view-details .m3-stage").boundingBox();
await a.mouse.move(bx.x + bx.width / 2, bx.y + bx.height * .8); await a.mouse.down(); await a.mouse.move(bx.x + bx.width / 2 + 120, bx.y + bx.height * .8, { steps: 6 }); await a.mouse.up(); await sleep(200);
ok("glisser tourne la machine, sans ouvrir de tiroir", await a.evaluate(() => BA.Shell.state.m3.ry > -20) && !(await a.$(".mv-pop")));
await a.click('#view-details [data-m3="zin"]'); await sleep(100);
ok("bouton ＋ : zoom", await a.evaluate(() => BA.Shell.state.m3.z > 1.1));
await a.click('#view-details [data-m3="front"]'); await sleep(100);
// angles : rien de coupé
for (const [rx, ry, nom] of [[-4, 0, "face"], [-8, 90, "cote"], [-10, 150, "arriere"], [-45, -30, "dessus"]]) {
  await a.evaluate(([rx, ry]) => { BA.Shell.state.m3 = { rx, ry, z: 1, spin: false }; window.dispatchEvent(new Event("resize")); }, [rx, ry]); await sleep(150);
  await a.locator("#view-details .m3-stage").screenshot({ path: path.join(OUT, "pc-detail-3d-" + nom + ".png") });
}
await a.evaluate(() => { BA.Shell.state.m3 = { rx: -10, ry: -30, z: 1, spin: false }; window.dispatchEvent(new Event("resize")); }); await sleep(150);
// toucher une sélection → fenêtre avec le tiroir 3D ; modification
const selN = await a.evaluate(() => document.querySelector("#view-details .m3-cell[data-mv-sel]").dataset.mvSel);
await a.click(`#view-details .m3-cell[data-mv-sel="${selN}"]`); await sleep(500);
ok("toucher une sélection : la fenêtre montre le tiroir en 3D (pains l'un derrière l'autre)", !!(await a.$(".mv-pop .m3-mini .m3-loaf")) && (await a.$$(".mv-pop .m3-mini .m3-loaf")).length >= 1);
const dz = await a.evaluate(() => [...new Set([...document.querySelectorAll(".mv-pop .m3-mini .m3-loaf")].map(l => /translate3d\([^,]+,[^,]+,([^)]+)\)/.exec(l.style.transform)[1]))].length);
ok("… avec plusieurs profondeurs", dz >= 2, dz);
ok("… et le formulaire de modification est toujours là", !!(await a.$(".mv-pop .mv-form [data-mvx-save]")));
await shot(a, "pc-selection-3d");
const mb = await a.locator(".mv-pop .m3-mini").boundingBox();
await a.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await a.mouse.down(); await a.mouse.move(mb.x + mb.width / 2 + 80, mb.y + mb.height / 2, { steps: 5 }); await a.mouse.up(); await sleep(200);
ok("on peut tourner le tiroir seul (sans tourner la machine)", await a.evaluate(() => BA.Shell.state.m3d.ry > -36 + 15 && BA.Shell.state.m3.ry === -30));
await a.keyboard.press("Escape"); await sleep(200);
await a.click('#view-details [data-m3="flat"][data-m3c]'); await sleep(500);
ok("retour en « 2D » : l'ancienne grille est de retour", !!(await a.$("#view-details .mv-grid")) && !(await a.$("#view-details .m3-stage")));
await a.click(`#view-details [data-mv-sel="${selN}"]`); await sleep(300);
ok("en 2D, la fenêtre d'un tiroir est comme avant (pas de 3D)", !!(await a.$(".mv-pop .mv-big .mv-d-box")) && !(await a.$(".mv-pop .m3-mini")));
await a.keyboard.press("Escape");

// ---- 2. Opérateur (téléphone) : les trois étapes de « Remplir » en 3D
console.log("\n== 2. Opérateur (téléphone) : inventaire, retrait, remplissage en 3D");
const o = await open("tel", "operateur.html", phone, () => { try { localStorage.setItem("ba_mv_3di", "1"); } catch (e) { /* */ } });
const numO = await pick(o);
await o.evaluate(n => BA.Wizard.open(n), numO); await o.waitForSelector("#wz-mv"); await sleep(500);
ok("Remplir – étape 1 (inventaire) : la machine est en 3D", !!(await o.$("#wz-mv .m3-inline .m3-stage")) && (await o.$$("#wz-mv .m3-loaf")).length >= 8);
ok("… avec le choix « 2D | 3D 360° » et la légende des couleurs", !!(await o.$('#wz-mv [data-m3="flat"]')) && !!(await o.$("#wz-mv .m3-legend .m3-sw")));
await shot(o, "tel-remplir-1-inventaire-3d");
const sw = await o.evaluate(() => { const s = document.querySelector("#wz-mv .m3-stage").getBoundingClientRect(), bx = document.querySelector("#wz-mv .m3-front").getBoundingClientRect(); return { sw: Math.round(s.width), bw: Math.round(bx.width) }; });
ok("téléphone : la machine 3D prend presque toute la largeur de l'écran", sw.bw >= sw.sw * .75, sw);
// toucher un tiroir → fenêtre, compter un pain en moins
const invSel = await o.evaluate(n => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, n); return m.sels.find(z => M.qty(z) >= 2).n; }, numO);
await o.tap(`#wz-mv .m3-cell[data-mv-sel="${invSel}"]`); await sleep(500);
ok("inventaire : toucher un tiroir ouvre la fenêtre avec le tiroir en 3D", !!(await o.$(".mv-pop .m3-mini .m3-loaf")) && !!(await o.$("#mvi-m")));
await o.tap("#mvi-m"); await sleep(400);
ok("… compter un pain en moins : un pain « compté en moins » apparaît (pointillé rouge)", !!(await o.$(".mv-pop .m3-loaf.k-miss")) && !!(await o.$('#wz-mv .m3-loaf.k-miss')));
await shot(o, "tel-remplir-1-tiroir-3d");
await o.tap("#mv-pop-ok"); await sleep(300);
await o.tap("#mvw-inv-ok"); await sleep(700);
ok("étape 2 (retrait) : machine en 3D avec pains rouges", !!(await o.$("#wz-mv .m3-inline .m3-stage")) && !!(await o.$("#wz-mv .m3-loaf.k-gone, #wz-mv .m3-loaf.k-gonemust")));
await shot(o, "tel-remplir-2-retrait-3d");
const rmSel = await o.evaluate(() => document.querySelector('#wz-mv .m3-cell.st-old[data-mv-sel], #wz-mv .m3-cell.st-must[data-mv-sel]').dataset.mvSel);
await o.tap(`#wz-mv .m3-cell[data-mv-sel="${rmSel}"]`); await sleep(500);
ok("retrait : la fenêtre du tiroir montre le tiroir en 3D", !!(await o.$(".mv-pop .m3-mini")));
await shot(o, "tel-remplir-2-tiroir-3d");
await o.tap("#mv-pop-ok"); await sleep(300);
await o.evaluate(() => { document.querySelector(".modal-back").scrollTop = 1e5; }); await sleep(200);
const nxt = await o.$("#mvw-rm-yes, #mvw-rm-next, #mvw-rm-ok"); await nxt.tap(); await sleep(700);
ok("étape 3 (remplissage) : machine en 3D", !!(await o.$("#wz-mv .m3-inline .m3-stage")));
const ldSel = await o.evaluate(n => { const s = BA.Store.get(), M = BA.Model, m = M.machine(s, n); const x = m.sels.find(z => z.cap - M.qty(z) >= 2); return x ? x.n : null; }, numO);
await o.tap(`#wz-mv .m3-cell[data-mv-sel="${ldSel}"]`); await sleep(500);
const plus = await o.$('.mv-pop [id^="mvl-"][id$="-p"]'); if (plus) { await plus.tap(); await sleep(400); }
ok("remplissage : la fenêtre montre le tiroir en 3D et les nouveaux pains (bleus)", !!(await o.$(".mv-pop .m3-mini")) && !!(await o.$(".mv-pop .m3-loaf.k-new")));
await shot(o, "tel-remplir-3-tiroir-3d");
await o.tap("#mv-pop-ok"); await sleep(300);
await shot(o, "tel-remplir-3-machine-3d");
// choix 2D depuis Remplir
await o.tap('#wz-mv [data-m3="flat"]'); await sleep(500);
ok("Remplir : « 2D » remet la grille à plat, ce qui a été saisi est gardé", !!(await o.$("#wz-mv .mv-grid")) && !(await o.$("#wz-mv .m3-stage")) && await o.evaluate(() => BA.Wizard.w.step === 3));
await o.tap('#wz-mv [data-m3="on"]'); await sleep(500);

console.log("\n" + (errs.length ? "Erreurs de page : " + JSON.stringify(errs) : "Aucune erreur de page"));
if (errs.length) bad++;
await b.close(); srv.close();
console.log(bad ? "\n" + bad + " ÉCHEC(S)" : "\nTout est bon (v5.41)"); process.exit(bad ? 1 : 0);
