// Essais de la v5.34.1 — appli opérateur installable sur l'écran d'accueil (iPhone / Android) : manifeste, icônes, balises.
// Essai statique (aucun navigateur) : lit les fichiers du dossier du site.
import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve(process.argv[2] || ".."); let bad = 0;
const ok = (n, c, d) => { console.log((c ? "  OK    " : "  ÉCHEC ") + n + (c ? "" : "  → " + JSON.stringify(d))); if (!c) bad++; };
const page = fs.readFileSync(path.join(ROOT, "operateur.html"), "utf8");
const png = f => { const b = fs.readFileSync(path.join(ROOT, f)); return { sig: b.slice(0, 8).toString("hex"), w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };
console.log("== Appli opérateur sur l'écran d'accueil");
const lien = /<link rel="manifest" href="([^"]+)"/.exec(page);
ok("operateur.html : lien vers le manifeste", !!lien, null);
const manif = lien ? JSON.parse(fs.readFileSync(path.join(ROOT, lien[1]), "utf8")) : {};
ok("manifeste : démarre sur operateur.html, plein écran, fond foncé", manif.start_url === "operateur.html" && manif.display === "standalone" && /^#0b1220$/i.test(manif.background_color || ""), manif);
ok("manifeste : l'adresse de départ existe dans le dossier", fs.existsSync(path.join(ROOT, manif.start_url || "x")), manif.start_url);
ok("manifeste : nom et nom court", !!manif.name && !!manif.short_name && manif.short_name.length <= 12, [manif.name, manif.short_name]);
for (const ic of manif.icons || []) { const p = png(ic.src), [w, h] = ic.sizes.split("x").map(Number);
  ok("icône " + ic.src + " : vraie image PNG " + ic.sizes, p.sig === "89504e470d0a1a0a" && p.w === w && p.h === h, p); }
ok("manifeste : icônes 192 et 512", ["192x192", "512x512"].every(s => (manif.icons || []).some(i => i.sizes === s)), manif.icons);
const at = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(page);
ok("iPhone : apple-touch-icon présent", !!at, null);
if (at) { const p = png(at[1]); ok("iPhone : icône 180×180, sans transparence (carrée)", p.w === 180 && p.h === 180 && p.colorType === 2, p); }
ok("iPhone : ouverture en plein écran + nom court", /apple-mobile-web-app-capable" content="yes"/.test(page) && /apple-mobile-web-app-title" content="Brood"/.test(page), null);
// v5.34.6 : la page admin devient installable à son tour (nécessaire aux notifications sur iPhone) ; la page opérateur reste inchangée
{ const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok("index.html (admin) : lien vers son propre manifeste (manifest.webmanifest, pas celui de l'opérateur)", /rel="manifest" href="manifest\.webmanifest"/.test(h) && !/manifest-operateur/.test(h), null); }
console.log(bad ? "\n" + bad + " ÉCHEC(S)" : "\nv5.34.1 : TOUT EST OK"); process.exit(bad ? 1 : 0);
