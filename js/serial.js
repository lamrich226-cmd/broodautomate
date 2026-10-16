// ============================================================
// BROODAUTOMATE — FAS Adapter (connexion RS232 réelle)
// Utilise Web Serial API — fonctionne sur Chrome et Edge
// Paramètres doc FAS : 9600 baud, 8N1, DTR haut (broche 7 côté machine)
// ⚠️ À valider sur la machine réelle
//
// v2 : on active DTR ET RTS (selon le câble, la broche 7 de la machine
// reçoit l'un ou l'autre), on remonte tout ce qui arrive (flux brut)
// et on peut relancer la demande sans se reconnecter.
// ============================================================

window.BA = window.BA || {};

BA.Serial = {
  port:      null,
  reader:    null,
  buffer:    "",
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

  // Baisse puis relève les signaux : redemande l'envoi à la machine
  async relancer() {
    await this.signaux(false);
    await new Promise(r => setTimeout(r, 300));
    await this.signaux(true);
  },

  // Cherche une ou plusieurs trames complètes (fin = "DXE*n*n") dans le tampon
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
      onStatus("connecté");

      // Lecture des données en continu
      const decoder = new TextDecoderStream();
      this.port.readable.pipeTo(decoder.writable);
      this.reader = decoder.readable.getReader();

      // Boucle de lecture
      const self = this;
      (async function readLoop() {
        try {
          while (true) {
            const { value, done } = await self.reader.read();
            if (done) break;
            if (!value) continue;

            if (onRaw) {
              try { onRaw(value); } catch (e) { console.warn(e); }
            }

            self.buffer += value;
            self.extraire(onData);
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
    onStatus("déconnecté");
  }
};
