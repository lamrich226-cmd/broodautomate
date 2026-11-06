// Essai du filtre du boîtier (filtre.h) : le relevé allégé doit être lu par Broodautomate
// EXACTEMENT comme l'original (mêmes ventes, carte, sélections, événements, erreurs, coupures, température),
// avec un contrôle G85 et un nombre de lignes SE corrects.
//   node test_filtre.mjs        (demande g++ ; toutes les données ci-dessous sont inventées)
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const ici = dirname(fileURLToPath(import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), "filtre-"));
const exe = join(dossier, "filtre_outil");
execFileSync("g++", ["-std=gnu++17", "-O1", "-I" + join(ici, "../broodautomate_lilygo"), join(ici, "filtre_outil.cpp"), "-o", exe]);

const ctx = { window: {}, console };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext("var BA = window.BA = {};", ctx);
vm.runInContext(readFileSync(join(ici, "../../js/evadts-parser.js"), "utf8"), ctx);
const P = vm.runInContext("BA.EvaDts", ctx);

// ---- relevé inventé, avec tout le « bruit » qu'une vraie machine envoie ----
function fabriquer(opts = {}) {
  const eol = opts.lf ? "\n" : "\r\n";
  const corps = [
    "ST*001*0001",
    "ID1*FAS000000001* FASTER     *0091* !\"f*+120*",
    "ID4*2*39", "ID5*261201*0930",
    "VA1*125050*501*0*7*0**0", "VA2**0**0", "VA3*0*0*0*0", "BA1***", "CA1***", "CA2*0*14*0*7",
    ...[5, 10, 20, 50, 100, 200].map((c) => `CA11*${c}*0*0*0*0*0*0`),
    ...[0, 1, 2].map((i) => `CA17*${i}*${5 * (i + 1)}*0***0`),
    "TA2*0*0*0*0", "DA1*00000001    *SELF/2000   *0216", "DA2*125050*480*0*3", "DA4*0*0", "MA1**0",
    "PA1*11*100*1100*0**1**0*99", "PA2*50*5000*7",
    "PA1*14*0*1400*0**1**0*99", "PA2*0*0*0",
    "PA1*19*250*1900*0**1**0*99", "PA2*60*15000*3",
    "LA1*0*11*100*7*50", "LA1*0*15*0*4*20", "LA1*0*19*250*3*60",
    "EA1*EGS*261201*0925***+120", "EA2*EGS****0", "EA1*EGT*261201*0926***+120", "EA2*EGT****1",
    "EA1*ECF_38*261201*0800***+120", "EA2*ECF_38****1",
    "EA3*0*261201*0931**261201*0925***12*0", "EA7*2*5",
    "MA5*ERROR*261201*0800*16*38", "MA5*INDXPR*1*2*3", "MA5*LIGHT*1",
    "MA5*POW OFF*261130*1010", "MA5*POW ON*261130*1015",
    "MA5*TEMPER*261201*0804*+170", "MA5*TEMPER*261201*0819*+171", "MA5*TEMPER*261201*0834*+172",
    "MA5*TEMPER*261201*0849*+173", "MA5*TEMPER*261201*0904*+174", "MA5*TEMPER*261201*0919*+175",
  ];
  const sansSe = corps.slice();
  const g = P.calculerG85(["DXS", ...sansSe].join("\r\n"));
  const lignes = ["DXS*FAS000000001*VA*V1/6*1", ...corps, "G85*" + (opts.g85Faux ? "0000" : g)];
  const nSe = lignes.length - 1 + 1;                                   // de ST à SE incluse
  lignes.push(`SE*${nSe}*001*0001`, "DXE*1*1");
  return lignes.join(eol) + eol;
}

function alleger(texte, vue = "") {
  const f = join(dossier, "in.txt"); writeFileSync(f, texte, "latin1");
  const r = spawnSync(exe, vue ? [f, vue] : [f], { encoding: "latin1" });
  assert.equal(r.status, 0);
  return { texte: r.stdout, vue: r.stderr };
}
const lire = (t) => JSON.parse(JSON.stringify(P.parse(t)));   // (copie : les tableaux viennent d'un autre contexte vm)
const essentiel = (a) => ({
  machineId: a.machineId, modele: a.machineModel, logiciel: a.logiciel, date: a.machineDate, va1: a.va1, da2: a.da2, selections: a.selections,
  events: a.events, fas: a.fasErrors, coupures: a.powerCuts, ea3: a.ea3, ea7: a.ea7, type: a.type, complet: a.complet,
});

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log("  ✔ " + m); };

// 1. première fois (aucune température déjà envoyée) : tout est gardé, même lecture
{
  const orig = fabriquer(), { texte, vue } = alleger(orig);
  const a = lire(orig), b = lire(texte);
  assert.deepEqual(essentiel(b), essentiel(a));
  assert.deepEqual(b.temperatures, a.temperatures);
  ok(texte.length < orig.length * 0.8, `relevé allégé (${orig.length} → ${texte.length} octets)`);
  ok(b.g85.present && b.g85.ok === true, "contrôle G85 recalculé : correct");
  ok(b.se.ok === true && b.se.compte === b.se.annonce, "nombre de lignes SE recalculé : correct");
  ok(!/\n(CA|TA2|DA1|DA4|MA1|VA2|VA3|BA1|ID4)/.test(texte) && !/MA5\*(INDXPR|LIGHT)/.test(texte), "lignes inutiles retirées");
  ok(vue === "2612010919", "clé de la température la plus récente retenue");
}
// 2. températures déjà envoyées : seulement les nouvelles
{
  const orig = fabriquer(), { texte } = alleger(orig, "2612010849");
  const b = lire(texte);
  assert.deepEqual(b.temperatures.map((t) => t.time), ["0919", "0904"]);
  ok(true, "seules les températures nouvelles partent (09:19 et 09:04)");
  assert.deepEqual(essentiel(b), essentiel(lire(orig)));
  ok(b.g85.ok === true && b.se.ok === true, "G85 et SE corrects aussi dans ce cas");
}
// 3. rien de nouveau : la température la plus récente reste (l'appli l'affiche toujours)
{
  const { texte } = alleger(fabriquer(), "2612010919");
  const b = lire(texte);
  assert.deepEqual(b.temperatures.map((t) => [t.time, t.celsius]), [["0919", 17.5]]);
  ok(b.g85.ok === true && b.se.ok === true, "aucune température nouvelle : la plus récente est gardée seule");
}
// 4. fins de ligne LF seules
{
  const orig = fabriquer({ lf: true }), { texte } = alleger(orig);
  ok(!texte.includes("\r") && lire(texte).g85.ok === true && lire(texte).se.ok === true, "fins de ligne LF respectées, G85 correct");
}
// 5. relevé abîmé (G85 faux) : envoyé tel quel, l'appli le refusera
{
  const orig = fabriquer({ g85Faux: true });
  ok(alleger(orig).texte === orig, "relevé abîmé (G85 faux) : pas touché");
}
// 6. pas un relevé complet : pas touché
{
  const orig = "DXS*X*VA*V1/6*1\r\nEA1*EGS*261201*0925***+1\r\nDXE*1*1\r\n";
  ok(alleger(orig).texte === orig, "texte sans ST/SE : pas touché");
}
// 7. petit message d'événement (comme ceux de la machine) : reste valide
{
  const lignes = ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "EA1*EGS*261201*0925***+120", "G85*", "SE*4*001*0001", "DXE*1*1"];
  lignes[3] = "G85*" + P.calculerG85(lignes.slice(0, 3).join("\r\n"));
  const orig = lignes.join("\r\n") + "\r\n";
  const { texte } = alleger(orig);
  ok(texte === orig, "petit relevé d'événement : identique");
}
console.log(`\n${n} vérifications du filtre : OK`);
