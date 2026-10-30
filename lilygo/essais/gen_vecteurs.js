// Vecteurs d'essai produits par serial.js (le vrai moteur du navigateur) : le moteur du boîtier doit donner la même chose.
"use strict";
const fs = require("fs"), vm = require("vm");
const ctx = { window: {}, console, Uint8Array, Promise, setTimeout, clearTimeout, performance: { now: () => 0 } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2], "utf8"), ctx);
const D = ctx.BA.DDCMP;
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = n => Math.floor(rnd() * n);
const hex = a => Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
const out = [];
// 1. constructeurs de trames
out.push(["B", "start", hex(D.start(1, 0))]);
out.push(["B", "stack", hex(D.stack(0, 4, 1))]);
for (let i = 0; i < 300; i += 37) { out.push(["B", "ack" + i, hex(D.ack(i & 255, 1))]); out.push(["B", "nack" + i, hex(D.nack(i & 255, i % 3 ? 2 : 17, 1))]); }
const way = D.whoAreYou(new Date(2026, 9, 30, 4, 19, 7), "BA");
out.push(["B", "way", hex(D.message(way, 0, 1, 1))]);
out.push(["B", "read2", hex(D.message(D.readData(2), 1, 2, 1))]);
out.push(["B", "read1", hex(D.message(D.readData(1), 3, 4, 1))]);
out.push(["B", "finish", hex(D.message(D.finish(), 5, 3, 1))]);
out.push(["B", "repway", hex(D.message(D.reponseWay("00000001"), 1, 1, 1))]);
out.push(["B", "repwrite", hex(D.message(D.reponseWrite(), 2, 2, 1))]);
[0xE1, 0xE2, 0xE4, 0xE5, 0xE6].forEach(c => out.push(["B", "refus" + c, hex(D.message(D.refus(c), 2, 3, 1))]));
// 2. liste de sécurité sur des trames proches des vraies (mutations)
const bases = [D.start(1), D.stack(0, 0, 1), D.ack(3, 1), D.nack(2, 2, 1), D.message(way, 0, 1, 1), D.message(D.readData(2), 1, 2, 1),
  D.message(D.finish(), 1, 3, 1), D.message(D.reponseWay("00000001"), 1, 1, 1), D.message(D.reponseWrite(), 2, 2, 1),
  D.message([0x77, 0xE3, 0, 2, 0, 10], 0, 1, 1), D.message([0x77, 0xE4, 0, 2], 0, 1, 1), D.message([0x88, 0xE5, 0, 0], 0, 1, 1), D.message([0x88, 0xE2, 0], 0, 1, 1)];
for (let k = 0; k < 20000; k++) {
  const b = Uint8Array.from(bases[ri(bases.length)]);
  let a = Array.from(b);
  const nm = ri(4);
  for (let j = 0; j < nm; j++) {
    const t = ri(4);
    if (t === 0) a[ri(a.length)] = ri(256);
    else if (t === 1) a[ri(a.length)] = [0, 1, 2, 0x77, 0x88, 0xE0, 0xE2, 0xE3, 0xFF, 0x80, 0x40, 0x05, 0x81][ri(13)];
    else if (t === 2 && a.length > 1) a.splice(ri(a.length), 1);
    else a.splice(ri(a.length + 1), 0, ri(256));
  }
  const u = Uint8Array.from(a);
  out.push(["A", hex(u), D.autorise(u) ? "1" : "0"]);
}
// 3. découpe d'un flux (extraire) : trames et erreurs
for (let k = 0; k < 3000; k++) {
  let s = [];
  const n = 1 + ri(5);
  for (let j = 0; j < n; j++) {
    const kind = ri(6);
    if (kind === 0) s.push(...D.ack(ri(256), 1));
    else if (kind === 1) s.push(...D.start(1));
    else if (kind === 2) { const body = Array.from({ length: 1 + ri(40) }, () => ri(256)); s.push(...D.message(body, ri(256), ri(256), 1, rnd() < 0.2)); }
    else if (kind === 3) { const body = [0x99, ri(256), ...Array.from({ length: ri(30) }, () => 32 + ri(90))]; const m = Array.from(D.message(body, 1, 2, 1)); m[8 + ri(body.length)] ^= 0x21; s.push(...m); }
    else if (kind === 4) s.push(...Array.from({ length: 1 + ri(6) }, () => ri(256)));
    else { const m = Array.from(D.message([0x88, 0xE0, 1], 1, 1, 1)); s.push(...m.slice(0, ri(m.length))); }
  }
  if (!s.length) continue;
  const r = D.extraire(Uint8Array.from(s));
  const tr = r.trames.map(t => t.genre === "ctrl" ? "c" + t.type + "," + t.code + "," + (t.select ? 1 : 0) + "," + t.b4 + "," + t.b5 + "," + t.sadd : "d" + t.rr + "," + t.xx + "," + t.sadd + "," + (t.select ? 1 : 0) + "," + hex(t.corps)).join(";");
  const er = r.erreurs.map(e => e.type === "ignores" ? "i" + e.n : e.type === "format" ? "f" : "x" + e.xx).join(";");
  out.push(["X", hex(Uint8Array.from(s)), tr || "-", er || "-", String(r.reste.length)]);
}
// 4. fin de fichier « DXE » (longueur inconnue)
const re = /(^|\n)DXE\*[^\r\n]*\r?\n?$/;
const parts = ["DXE*1*1", "\r", "\n", "\r\n", "x", "DXS*", "G85*AB", "DXE*", "\n\n", " "];
for (let k = 0; k < 4000; k++) { let t = ""; const n = 1 + ri(5); for (let j = 0; j < n; j++) t += parts[ri(parts.length)]; out.push(["E", Buffer.from(t, "latin1").toString("hex"), re.test(t) ? "1" : "0"]); }
fs.writeFileSync(process.argv[3], out.map(l => l.join(" ")).join("\n") + "\n");
console.log("vecteurs :", out.length);
