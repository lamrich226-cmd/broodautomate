// ============================================================
// BROODAUTOMATE — FAS Adapter (connexion RS232 réelle)
// Utilise Web Serial API — fonctionne sur Chrome et Edge
// Paramètres doc FAS : 9600 baud, 8N1, DTR haut
// ⚠️ À valider sur la machine réelle
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

  // Connexion à la machine
  async connect(config, onData, onStatus) {
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

      // DTR haut = demande de transfert EVA-DTS à la machine
      await this.port.setSignals({ dataTerminalReady: true });

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

            self.buffer += value;

            // Une trame EVA-DTS complète se termine par "DXE"
            if (self.buffer.includes("DXE")) {
              const trame = self.buffer;
              self.buffer = "";
              onData(trame);
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