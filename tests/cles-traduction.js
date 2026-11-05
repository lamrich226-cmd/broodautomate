// Vérifie que chaque t("clé") utilisée existe en fr, nl et en (et que nl/en n'oublient aucune clé fr)
const fs = require("fs"), vm = require("vm"), path = require("path");
const R = process.argv[2] || path.join(__dirname, "..");
const ctx = { window: {}, console, BA_CONFIG: {} }; ctx.window.BA = {}; ctx.BA = ctx.window.BA; vm.createContext(ctx);
const files = ["i18n.js"].concat(fs.readdirSync(path.join(R, "js")).filter(f => /^i18n-.*\.js$/.test(f)).sort());
for (const f of files) vm.runInContext(fs.readFileSync(path.join(R, "js", f), "utf8"), ctx, { filename: f });
const D = ctx.BA.I18n.dicts;
const used = new Set();
for (const f of fs.readdirSync(path.join(R, "js"))) {
  if (!f.endsWith(".js") || f.startsWith("i18n")) continue;
  const src = fs.readFileSync(path.join(R, "js", f), "utf8");
  for (const m of src.matchAll(/\bt\(\s*"([a-z][a-z0-9_]*[a-z0-9])"\s*[,)]/g)) used.add(m[1] + "|" + f);
}
const miss = [];
for (const u of used) { const [k, f] = u.split("|"); for (const l of ["fr", "nl", "en"]) if (!(k in D[l])) miss.push(l + ":" + k + " (" + f + ")"); }
const frOnly = { nl: [], en: [] };
for (const k of Object.keys(D.fr)) for (const l of ["nl", "en"]) if (!(k in D[l])) frOnly[l].push(k);
console.log("clés utilisées :", used.size, "| manquantes :", miss.length); miss.slice(0, 40).forEach(x => console.log("  " + x));
console.log("fr sans nl :", frOnly.nl.length, frOnly.nl.slice(0, 15).join(" "), "| fr sans en :", frOnly.en.length, frOnly.en.slice(0, 15).join(" "));
