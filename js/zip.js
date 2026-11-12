// ============================================================
// BROODAUTOMATE v5.21 — Petit fabricant de fichiers .zip (sans compression)
// Sert à donner le programme du boîtier 4G tout prêt (dossier « broodautomate_lilygo » à ouvrir dans Arduino IDE).
// Le fichier est fabriqué dans le navigateur : rien n'est envoyé sur Internet.
// ============================================================
(function () {
  "use strict";
  const BA = window.BA = window.BA || {};
  let TABLE = null;
  // Contrôle CRC-32 (le même que celui des fichiers .zip)
  function crc32(u8) {
    if (!TABLE) {
      TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // files : [{ name: "dossier/fichier.h" (un dossier se termine par « / »), data: Uint8Array ou texte }] → Uint8Array (.zip)
  function make(files, date) {
    const enc = new TextEncoder(), d = date || new Date();
    const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const jour = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const morceaux = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nom = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : (f.data || new Uint8Array(0));
      const crc = crc32(data), dossier = f.name.endsWith("/");
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, heure, true); lh.setUint16(12, jour, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nom.length, true); lh.setUint16(28, 0, true);
      morceaux.push(new Uint8Array(lh.buffer), nom, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, heure, true); ch.setUint16(14, jour, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nom.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, dossier ? 0x10 : 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nom);
      offset += 30 + nom.length + data.length;
    }
    const taille = central.reduce((a, x) => a + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, files.length, true); fin.setUint16(10, files.length, true);
    fin.setUint32(12, taille, true); fin.setUint32(16, offset, true);
    const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
    const out = new Uint8Array(tout.reduce((a, x) => a + x.length, 0));
    let p = 0;
    for (const x of tout) { out.set(x, p); p += x.length; }
    return out;
  }
  BA.Zip = { make, crc32 };
})();
