// Faux port série + machine FAS simulée (EVA-DTS DDCMP), injectés dans la page pour les essais.
// La machine est écrite séparément du code de Broodautomate (CRC, trames, numérotation d'après la norme).
(() => {
  const now = () => performance.now();
  const at = (quand, fn) => setTimeout(fn, Math.max(0, quand - now()));

  function crcM(octets) {
    let crc = 0;
    for (const data of octets) {
      let d = data;
      for (let j = 0; j < 8; j++) {
        if ((d ^ crc) & 1) { crc >>= 1; crc ^= 0xA001; } else crc >>= 1;
        d >>= 1;
      }
    }
    return crc & 0xFFFF;
  }
  const avecCrc = a => { const c = crcM(a); return [...a, c & 0xFF, c >> 8]; };
  const ctl = (type, b4, b5) => avecCrc([0x05, type, 0x40, b4, b5, 0x01]);
  const data = (corps, rr, xx, select = false) => {
    const n = corps.length;
    return [...avecCrc([0x81, n & 0xFF, (select ? 0x80 : 0) | 0x40 | (n >> 8), rr, xx, 0x01]), ...avecCrc(corps)];
  };
  const latin1 = s => Array.from(s, c => c.charCodeAt(0) & 0xFF);

  class Machine {
    constructor() {
      this.rx = 0; this.tx = 0; this.attente = null; this.tampon = []; this.trace = [];
      this.maitre = false; this.etape = null; this.libreA = 0;
      this.sessions = 0; this.listes = []; this.finis = 0; this.recus = [];
    }
    emettre(octets, raison) {
      const debut = Math.max(now() + 15, this.libreA);
      for (let i = 0; i < octets.length; i += 64) {
        const morceau = octets.slice(i, i + 64);
        at(debut + (i + morceau.length) * 0.05, () => window.__port.versPc(morceau));
      }
      this.libreA = debut + octets.length * 0.05;
      this.trace.push(Math.round(now()) + " M→PC " + raison);
    }
    recevoir(octets) {
      this.tampon.push(...octets);
      for (;;) {
        if (this.tampon.length < 8) return;
        const b = this.tampon[0];
        if (b !== 5 && b !== 0x81) { this.tampon.shift(); continue; }
        const h = this.tampon.slice(0, 8);
        if (crcM(h.slice(0, 6)) !== (h[6] | (h[7] << 8))) { this.tampon.shift(); continue; }
        if (b === 5) { this.tampon.splice(0, 8); this.controle(h); continue; }
        const n = h[1] | ((h[2] & 0x3F) << 8);
        if (this.tampon.length < 10 + n) return;
        const tout = this.tampon.splice(0, 10 + n);
        const corps = tout.slice(8, 8 + n);
        if (crcM(corps) !== (tout[8 + n] | (tout[9 + n] << 8))) continue;
        this.donnees(h, corps);
      }
    }
    controle(h) {
      const type = h[1];
      this.recus.push(["?", "ACK", "NACK", "", "", "", "START", "STACK"][type] || type);
      if (type === 6) {
        this.rx = 0; this.tx = 0; this.annuler(); this.maitre = false; this.etape = "session"; this.sessions++;
        this.emettre(ctl(7, 0, 0), "STACK");
        return;
      }
      if (type === 7 && this.maitre && this.etape === "start") {
        clearTimeout(this.minStart);
        this.rx = 0; this.tx = 0; this.etape = "way";
        this.envoyer([0x77, 0xE0, 0, 0, 0, 0, 0, 0x27, 0x08, 0x17, 0x10, 0x34, 0x00, 0, 0, 0x0B], "WAY machine");
        return;
      }
      if ((type === 1 || type === 2) && this.attente && h[3] === this.attente.xx) this.accuse();
    }
    donnees(h, corps) {
      const rr = h[3], xx = h[4];
      if (this.attente && rr === this.attente.xx) this.accuse();
      if (xx === ((this.rx + 1) & 0xFF)) {
        this.rx = xx;
        this.emettre(ctl(1, this.rx, 0), "ACK " + this.rx);
        this.commande(corps);
      } else if (xx === this.rx) {
        this.emettre(ctl(1, this.rx, 0), "ACK (doublon)");
      } else {
        this.emettre(ctl(2, this.rx, 0), "NACK");
      }
    }
    commande(c) {
      if (this.maitre) {
        if (c[0] === 0x88 && c[1] === 0xE0) setTimeout(() => this.envoyer([0x77, 0xE3, 0x00, 0x01, 0xFF, 0xFF], "Write Data"), 20);
        else if (c[0] === 0x88 && c[1] === 0xE3) { this.preparer(this.aPousser); setTimeout(() => this.bloc(), 20); }
        else if (c[0] === 0x77 && c[1] === 0xFF) { this.maitre = false; this.etape = null; this.finis++; }
        return;
      }
      if (c[0] !== 0x77) return;
      if (c[1] === 0xE0) {
        this.envoyer([0x88, 0xE0, 0x01, 0, 0, 0, 0, ...latin1("00000001"), 0x12, 0x00, 0x00, 0x00, 0x00, 0x00], "WAY accepté");
      } else if (c[1] === 0xE2) {
        this.listes.push(c[3]);
        this.preparer(window.__AUDIT__);
        this.envoyer([0x88, 0xE2, 0x01, c[3], 0x01, 0, 0, 0xFF, 0xFF], "Read accepté");
        this.apres = () => this.bloc();
      } else if (c[1] === 0xFF) {
        this.finis++;
      }
    }
    preparer(texte) {
      const o = latin1(texte);
      this.blocs = [];
      for (let i = 0, b = 0; i < o.length; i += 240, b++) this.blocs.push([0x99, b & 0xFF, ...o.slice(i, i + 240)]);
      this.i = 0;
    }
    bloc() {
      if (this.i >= this.blocs.length) {
        if (this.maitre) this.envoyer([0x77, 0xFF], "FINISH machine");
        return;
      }
      const dernier = this.i === this.blocs.length - 1;
      const b = this.blocs[this.i++];
      this.apres = () => this.bloc();
      this.envoyer(b, "bloc " + b[1], dernier);
    }
    envoyer(corps, raison, select = false) {
      this.tx = (this.tx + 1) & 0xFF;
      this.attente = { xx: this.tx, corps, select, essais: 1 };
      this.emettreAttente(raison);
    }
    emettreAttente(raison) {
      const a = this.attente;
      this.emettre(data(a.corps, this.rx, a.xx, a.select), raison);
      clearTimeout(this.minAck);
      this.minAck = setTimeout(() => {
        if (!this.attente || this.attente.essais >= 5) { this.attente = null; return; }
        this.attente.essais++;
        this.emettreAttente(raison + " (renvoi)");
      }, Math.max(0, this.libreA - now()) + 400);
    }
    accuse() {
      clearTimeout(this.minAck);
      this.attente = null;
      const f = this.apres; this.apres = null;
      if (f) setTimeout(f, 5);
    }
    annuler() { clearTimeout(this.minAck); this.attente = null; this.apres = null; }
    // La machine ouvre elle-même une session pour envoyer un événement (télémétrie)
    pousser(texte) {
      this.maitre = true; this.rx = 0; this.tx = 0; this.annuler(); this.etape = "start"; this.aPousser = texte;
      let n = 0;
      const envoyerStart = () => {
        if (this.etape !== "start" || n >= 10) return;
        n++;
        this.emettre(ctl(6, 0, 0), "START machine");
        this.minStart = setTimeout(envoyerStart, 300);
      };
      envoyerStart();
    }
  }

  class FakePort {
    constructor() { this.readable = null; this.writable = null; this.ouvertAvec = null; }
    async open(opts) {
      this.ouvertAvec = opts;
      this.readable = new ReadableStream({ start: c => { this.ctrl = c; } });
      this.writable = new WritableStream({ write: chunk => { window.__machine.recevoir(Array.from(chunk)); } });
    }
    versPc(octets) { try { if (this.ctrl) this.ctrl.enqueue(Uint8Array.from(octets)); } catch (e) { /* fermé */ } }
    async setSignals(s) { this.signaux = s; }
    getInfo() { return { usbVendorId: 0x067B, usbProductId: 0x2303 }; }
    async close() {
      try { if (this.ctrl) this.ctrl.close(); } catch (e) { /* déjà fermé */ }
      this.readable = null; this.writable = null; this.ctrl = null;
    }
  }

  window.__machine = new Machine();
  window.__port = new FakePort();
  Object.defineProperty(navigator, "serial", {
    configurable: true,
    value: {
      requestPort: async () => window.__port,
      getPorts: async () => (window.__portsAutorises ? [window.__port] : []),
      addEventListener: () => {}
    }
  });
})();
