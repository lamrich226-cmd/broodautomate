// ============================================================
// BROODAUTOMATE v5.21 — Programme du boîtier 4G prêt à téléverser
// « Ajouter un boîtier » (ou 🔑 nouvelle clé) : un clic donne le programme COMPLET du LILYGO dans un .zip,
// avec config.h déjà rempli : MODE 0, clé secrète du boîtier, carte SIM (APN) et, pour 1NCE, l'écoute UDP.
// La clé ne quitte jamais le navigateur : le .zip est fabriqué ici, sur l'ordinateur (rien n'est envoyé).
// ============================================================
(function () {
  "use strict";
  const BA = window.BA = window.BA || {};
  const DOSSIER = "broodautomate_lilygo";
  const FICHIERS = ["broodautomate_lilygo.ino", "config.h", "boitier.cpp", "modem.h", "envoi.h", "filtre.h", "horloge.h", "ddcmp_moteur.h", "dex_moteur.h"];
  // Cartes SIM proposées. apn = adresse internet de l'opérateur ; udp = le boîtier écoute un port (Device Controller de 1NCE)
  const SIMS = {
    digi: { nom: "Digi", apn: "internet", udp: false },
    "1nce": { nom: "1NCE", apn: "iot.1nce.net", udp: true }
  };
  const pad = n => String(n).padStart(2, "0");
  function slug(n) {
    return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "boitier";
  }

  // config.h du dépôt → config.h de CE boîtier. Chaque ligne à remplacer doit exister (sinon : erreur, rien n'est donné).
  function configPour(txt, o) {
    const sim = SIMS[o.sim];
    if (!sim) throw new Error("carte SIM inconnue : " + o.sim);
    if (!/^[0-9a-f]{32}$/.test(o.key || "")) throw new Error("clé du boîtier invalide");
    const nom = String(o.name || "").replace(/[\r\n]+/g, " ").slice(0, 40);
    const d = o.date || new Date();
    const regles = [
      ["MODE", /^#define MODE[ \t]+\d+[^\n]*$/m, "#define MODE  0"],
      ["DEVICE_KEY", /^#define DEVICE_KEY[ \t]+"[^"\n]*"[^\n]*$/m, `#define DEVICE_KEY  "${o.key}"`],
      ["APN", /^#define APN[ \t]+"[^"\n]*"[^\n]*$/m, `#define APN      "${sim.apn}"   // carte SIM ${sim.nom} (choisie dans Broodautomate). Si ça ne marche pas, le boîtier essaie aussi web.be et mworld.be`],
      ["ECOUTE_UDP", /^#define ECOUTE_UDP[ \t]+\d[^\n]*\n(?:[ \t]+\/\/[^\n]*\n)?/m, `#define ECOUTE_UDP ${sim.udp ? 1 : 0}                      // ${sim.udp
        ? "carte 1NCE : le boîtier écoute le port UDP 3000 (« lire » envoyé par le Device Controller de 1NCE = lecture tout de suite)"
        : "pas d'écoute UDP : tout marche comme avant (HTTPS)"}\n`]
    ];
    let t = String(txt);
    for (const [cle, re, v] of regles) {
      if (!re.test(t)) throw new Error("config.h : ligne " + cle + " introuvable");
      t = t.replace(re, () => v);
    }
    const entete = `// ==== Programme préparé par Broodautomate le ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} pour le boîtier « ${nom} » ====\n` +
      `// Carte SIM : ${sim.nom} · MODE 0 (normal : lit la machine et envoie) · clé secrète de CE boîtier déjà écrite plus bas.\n` +
      `// Rien à modifier : ouvre broodautomate_lilygo.ino dans Arduino IDE, choisis « ESP32 Dev Module », puis Téléverser.\n` +
      `// Ne donne ce fichier à personne : il contient la clé secrète du boîtier.\n`;
    return entete + t;
  }

  // Les fichiers du programme, tels qu'ils sont sur le site (la version publiée avec ce Broodautomate)
  async function fichiers() {
    const v = (typeof BA_CONFIG !== "undefined" && BA_CONFIG.app && BA_CONFIG.app.version) ? "?v=" + encodeURIComponent(BA_CONFIG.app.version) : "";
    const out = {};
    for (const f of FICHIERS) {
      const r = await fetch("lilygo/" + DOSSIER + "/" + f + v, { cache: "no-store" });
      if (!r.ok) throw new Error(f + " (" + r.status + ")");
      out[f] = new Uint8Array(await r.arrayBuffer());
    }
    return out;
  }
  // Le .zip de CE boîtier : dossier « broodautomate_lilygo » (le nom attendu par Arduino IDE) avec les 9 fichiers
  async function zipPour(o) {
    const f = await fichiers();
    const cfg = configPour(new TextDecoder().decode(f["config.h"]), o);
    const files = [{ name: DOSSIER + "/", data: new Uint8Array(0) }];
    for (const n of FICHIERS) files.push({ name: DOSSIER + "/" + n, data: n === "config.h" ? new TextEncoder().encode(cfg) : f[n] });
    return BA.Zip.make(files, o.date);
  }
  function nomFichier(o) { return "broodautomate_lilygo_" + slug(o.name) + "_" + o.sim + ".zip"; }
  async function telecharger(o) {
    const z = await zipPour(o);
    const nom = nomFichier(o);
    const url = URL.createObjectURL(new Blob([z], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url; a.download = nom; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return nom;
  }
  BA.Programme = { SIMS, FICHIERS, DOSSIER, configPour, zipPour, telecharger, nomFichier, slug };
})();
