// ============================================================
// BROODAUTOMATE — Couche DDCMP (EVA-DTS DDCMP sur RS232)
// Format d'après la spécification DEC DDCMP 4.0 (chapitres 4.2 à 4.3).
// Le texte EVA-DTS est transporté à l'intérieur des messages de données.
//
// Trame de contrôle (8 octets) : ENQ(5) TYPE SOUS-TYPE/FLAGS RESP/NUM FILL ADDR CRC-16(2)
// Trame de données : SOH(0x81) COUNT-bas FLAGS/COUNT-haut RESP NUM ADDR CRC-16(2) DATA CRC-16(2)
// CRC-16 : polynôme X^16+X^15+X^2+1 (0xA001 en réfléchi), initial 0,
//          envoyé octet de poids faible en premier.
// ⚠️ Le document source est une numérisation : les valeurs sont à valider
//    sur la machine réelle (le flux brut affiche tout en hexadécimal).
// ============================================================

window.BA = window.BA || {};

BA.DDCMP = {
  ENQ:      0x05,
  SOH:      0x81,
  TYPE_ACK:   1,
  TYPE_NAK:   2,
  TYPE_REP:   3,
  TYPE_STRT:  6,
  TYPE_STACK: 7,
  ADDR:       1,   // point à point, adresse 1 (menu machine « Peripheral address »)

  // CRC-16 DDCMP (réfléchi, initial 0)
  crc16(octets) {
    let c = 0;
    for (const b of octets) {
      c ^= b;
      for (let i = 0; i < 8; i++) {
        c = (c & 1) ? ((c >> 1) ^ 0xA001) : (c >> 1);
      }
    }
    return c & 0xFFFF;
  },

  // Ajoute le CRC (poids faible d'abord)
  avecCrc(octets) {
    const c = this.crc16(octets);
    return octets.concat([c & 0xFF, c >> 8]);
  },

  // Message de contrôle : ENQ TYPE (FLAGS<<6 | SOUS-TYPE) RESP NUM ADDR CRC
  controle(type, { flags = 0, resp = 0, num = 0 } = {}) {
    return Uint8Array.from(this.avecCrc([
      this.ENQ, type, ((flags & 3) << 6), resp & 0xFF, num & 0xFF, this.ADDR
    ]));
  },

  // STRT : « je démarre, réinitialise la numérotation » (les deux bits FLAGS à 1)
  strt() { return this.controle(this.TYPE_STRT, { flags: 3 }); },

  // STACK : réponse à un STRT reçu de la machine
  stack() { return this.controle(this.TYPE_STACK, { flags: 3 }); },

  // ACK : accuse réception jusqu'au numéro resp
  ack(resp) { return this.controle(this.TYPE_ACK, { resp }); },

  // Lit les messages complets présents dans le tampon.
  // Retourne { donnees: [Uint8Array...], controles: [type...], reste: Uint8Array,
  //            erreurs: nombre de trames rejetées }
  extraire(tampon) {
    const donnees   = [];
    const controles = [];
    let erreurs = 0;
    let i = 0;

    while (i < tampon.length) {
      const b = tampon[i];

      if (b === this.ENQ) {
        if (i + 8 > tampon.length) break;
        const trame = tampon.subarray(i, i + 8);
        if (this._crcOk(trame)) {
          controles.push({ type: trame[1], resp: trame[3], num: trame[4] });
          i += 8;
        } else {
          erreurs++;
          i += 1;
        }
        continue;
      }

      if (b === this.SOH) {
        if (i + 8 > tampon.length) break;
        const entete = tampon.subarray(i, i + 8);
        if (!this._crcOk(entete)) { erreurs++; i += 1; continue; }

        const compte = entete[1] | ((entete[2] & 0x3F) << 8);
        const fin    = i + 8 + compte + 2;
        if (compte === 0) { erreurs++; i += 1; continue; }
        if (fin > tampon.length) break;   // attend la suite

        const corps = tampon.subarray(i + 8, i + 8 + compte);
        const crcDonnees = tampon[i + 8 + compte] | (tampon[i + 9 + compte] << 8);
        if (this.crc16(corps) !== crcDonnees) { erreurs++; i += 1; continue; }

        donnees.push({ num: entete[4], resp: entete[3], octets: corps.slice() });
        i = fin;
        continue;
      }

      i += 1;   // octet inattendu hors trame : on passe
    }

    return { donnees, controles, reste: tampon.slice(i), erreurs };
  },

  // Vérifie le CRC d'en-tête : CRC sur les 6 premiers octets
  _crcOk(trame) {
    const c = this.crc16(trame.subarray(0, 6));
    return (trame[6] | (trame[7] << 8)) === c;
  },

  // Convertit des octets en texte (ASCII/Latin-1), pour le parseur EVA-DTS
  versTexte(octets) {
    let s = "";
    for (const b of octets) s += String.fromCharCode(b);
    return s;
  },

  // Affichage hexadécimal pour le flux brut
  hex(octets) {
    return Array.from(octets, b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }
};
// ============================================================
// BROODAUTOMATE — FAS Adapter (connexion RS232 réelle)
// Utilise Web Serial API — fonctionne sur Chrome et Edge
// Paramètres relevés sur la machine (menu audit) : 2400 baud, 8N1, EVA-DTS DDCMP
// DTR haut (broche 7 côté machine)
// ⚠️ À valider sur la machine réelle
//
// v3 : protocole DDCMP par défaut (ddcmp.js). La machine est en
// « EVA-DTS DDCMP » : on envoie STRT, on lit les messages, on accuse
// réception (ACK), et on transmet le texte EVA-DTS au parseur.
// Le flux brut affiche aussi les octets reçus en hexadécimal.
// Pour revenir au mode texte simple : config.protocole = "texte".
// ============================================================

window.BA = window.BA || {};

BA.Serial = {
  port:      null,
  reader:    null,
  buffer:    "",      // texte EVA-DTS décodé, en attente de trames complètes
  tamponBin: null,    // octets DDCMP incomplets
  protocole: "ddcmp",
  connected: false,

  // Vérifie si le navigateur supporte Web Serial
  supported() {
    return "serial" in navigator;
  },

  // Lève (true) ou baisse (false) les signaux DTR et RTS
  async signaux(etat) {
    if (!this.port) return;
    try {
      await this.port.setSignals({
        dataTerminalReady: etat,
        requestToSend:     etat
      });
    } catch (err) {
      console.warn("Signaux DTR/RTS non appliqués :", err.message);
    }
  },

  // Envoie des octets à la machine
  async envoyer(octets) {
    if (!this.port || !this.port.writable) return;
    const w = this.port.writable.getWriter();
    try {
      await w.write(octets);
    } finally {
      w.releaseLock();
    }
  },

  // Baisse puis relève les signaux : redemande l'envoi à la machine
  // (en DDCMP, renvoie aussi le message de démarrage STRT)
  async relancer(onRaw) {
    onRaw = onRaw || this._onRaw;
    await this.signaux(false);
    await new Promise(r => setTimeout(r, 300));
    await this.signaux(true);
    if (this.protocole === "ddcmp") {
      await this.demarrerDdcmp(onRaw);
    }
  },

  // Envoie STRT à la machine (démarrage DDCMP)
  async demarrerDdcmp(onRaw) {
    const strt = BA.DDCMP.strt();
    if (onRaw) onRaw("[envoi STRT DDCMP : " + BA.DDCMP.hex(strt) + "]\n");
    await this.envoyer(strt);
  },

  // Cherche une ou plusieurs trames complètes (fin = "DXE*n*n") dans le tampon texte
  extraire(onData) {
    const fin = /DXE\*\d+\*\d+/;
    let m;
    while ((m = fin.exec(this.buffer))) {
      const bout  = m.index + m[0].length;
      const trame = this.buffer.slice(0, bout);
      this.buffer = this.buffer.slice(bout).replace(/^\r?\n/, "");
      onData(trame);
    }
  },

  // Traite les octets reçus en mode DDCMP
  async traiterDdcmp(valeur, onData, onRaw) {
    // Concatène avec les octets restés en attente
    const reste = this.tamponBin || new Uint8Array(0);
    const tampon = new Uint8Array(reste.length + valeur.length);
    tampon.set(reste, 0);
    tampon.set(valeur, reste.length);

    const r = BA.DDCMP.extraire(tampon);
    this.tamponBin = r.reste;

    if (onRaw && r.erreurs) {
      onRaw("[" + r.erreurs + " trame(s) DDCMP rejetée(s) : CRC ou format]\n");
    }

    for (const c of r.controles) {
      if (onRaw) onRaw("[contrôle DDCMP reçu, type " + c.type + "]\n");
      if (c.type === BA.DDCMP.TYPE_STRT) {
        // La machine demande le démarrage : on répond STACK
        const stack = BA.DDCMP.stack();
        if (onRaw) onRaw("[réponse STACK envoyée : " + BA.DDCMP.hex(stack) + "]\n");
        await this.envoyer(stack);
      }
    }

    for (const d of r.donnees) {
      // Accusé de réception : la machine attend ACK avant d'envoyer la suite
      const ack = BA.DDCMP.ack(d.num);
      if (onRaw) onRaw("[données DDCMP n°" + d.num + " reçues (" + d.octets.length + " octets) -> ACK envoyé : " + BA.DDCMP.hex(ack) + "]\n");
      await this.envoyer(ack);
      this.buffer += BA.DDCMP.versTexte(d.octets);
      this.extraire(onData);
    }
  },

  // Connexion à la machine
  //   onData(trame)   : appelé pour chaque trame EVA-DTS complète
  //   onStatus(texte) : "connecté", "déconnecté", "erreur : ..."
  //   onRaw(texte)    : (facultatif) appelé pour tout ce qui arrive, même incomplet
  async connect(config, onData, onStatus, onRaw) {
    if (!this.supported()) {
      throw new Error(
        "Web Serial non disponible — utilise Google Chrome ou Microsoft Edge"
      );
    }

    this.protocole = (config.protocole || "ddcmp");
    this._onRaw = onRaw;

    try {
      // Demande à l'utilisateur de choisir le port COM
      this.port = await navigator.serial.requestPort();

      // Ouvre le port avec les paramètres FAS
      await this.port.open({
        baudRate: config.baudRate || 9600,
        dataBits: config.dataBits || 8,
        parity:   config.parity   || "none",
        stopBits: config.stopBits || 1
      });

      // DTR + RTS hauts = demande de transfert EVA-DTS à la machine
      await this.signaux(true);

      this.connected = true;
      this.buffer    = "";
      this.tamponBin = new Uint8Array(0);
      onStatus("connecté");

      const self = this;

      if (this.protocole === "ddcmp") {
        // Lecture brute des octets (le DDCMP est binaire)
        this.reader = this.port.readable.getReader();
        await this.demarrerDdcmp(onRaw);
      } else {
        // Mode texte simple
        const decoder = new TextDecoderStream();
        this.port.readable.pipeTo(decoder.writable);
        this.reader = decoder.readable.getReader();
      }

      // Boucle de lecture
      (async function readLoop() {
        try {
          while (true) {
            const { value, done } = await self.reader.read();
            if (done) break;
            if (!value) continue;

            if (self.protocole === "ddcmp") {
              if (onRaw) {
                try { onRaw("[" + BA.DDCMP.hex(value) + "]\n"); } catch (e) { console.warn(e); }
              }
              await self.traiterDdcmp(value, onData, onRaw);
            } else {
              if (onRaw) {
                try { onRaw(value); } catch (e) { console.warn(e); }
              }
              self.buffer += value;
              self.extraire(onData);
            }
          }
        } catch (err) {
          onStatus("erreur : " + err.message);
          self.connected = false;
        }
      })();

    } catch (err) {
      this.connected = false;
      throw err;
    }
  },

  // Déconnexion
  async disconnect(onStatus) {
    try {
      await this.signaux(false);
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("Erreur déconnexion :", err.message);
    }

    this.connected = false;
    this.buffer    = "";
    this.tamponBin = null;
    onStatus("déconnecté");
  }
};
