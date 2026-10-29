// ============================================================
// BROODAUTOMATE — Liaison RS232 EVA-DTS « Enhanced DDCMP » (v3.1)
// D'après la norme EVA-DTS 6.1.2, chapitres 3 et 6 (p.51-103, p.177-200).
//
// Trame de contrôle (8 octets) : 05 TYPE 40 b4 b5 ADRESSE CRC(2)
//   START 05 06 40 00 mbd sadd   STACK 05 07 40 sbd mbd sadd
//   ACK   05 01 40 rr  00  sadd   NACK  05 02 (40+code) rr 00 sadd
//   3e octet : bit 7 « select » TOUJOURS 0 (p.77), bit 6 « quick sync » TOUJOURS 1.
// Message de données : 81 nn mm rr xx sadd CRC(2) + DONNÉES + CRC(2)
//   mm : bit 7 = select (dernier bloc d'un fichier de longueur inconnue),
//        bit 6 = 1, 6 bits bas = poids fort de la longueur.
//   rr = n° du dernier message bien reçu, xx = n° de ce message.
//   Numérotation remise à 0 par chaque START ; le 1er message porte le n° 1.
// CRC-16 : polynôme réfléchi 0xA001, valeur initiale 0, octet faible d'abord.
//
// Deux façons de recevoir les données :
//   • le PC est MAÎTRE : START → STACK → Who Are You → Read Data (liste 2
//     par défaut : lecture qui ne remet rien à zéro) → blocs → FINISH → ACK ;
//   • la MACHINE est MAÎTRE (commande 90 « télémétrie » = 1, ou bouton
//     « envoyer un événement ») : elle envoie START, Who Are You, Write Data,
//     ses blocs, puis FINISH. Le PC répond STACK, 88 E0 01, 88 E3 01 et ACK.
//
// SÉCURITÉ : le PC n'envoie QUE START, STACK, ACK, NACK, Who Are You (codes
// de sécurité 00 00 00 00), Read Data (listes 1 ou 2), FINISH, et les
// réponses 88 E0 01 / 88 E3 01 / refus 88 Ex 00. Toute autre trame est
// bloquée avant l'envoi (BA.DDCMP.autorise). Aucune commande d'écriture
// ni d'effacement vers la machine.
// ============================================================

window.BA = window.BA || {};

BA.DDCMP = {
  ENQ: 0x05, SOH: 0x81,
  ACK: 1, NACK: 2, START: 6, STACK: 7,
  CODES_VITESSE: { 1200: 1, 2400: 2, 4800: 3, 9600: 4, 19200: 5, 38400: 6, 57600: 7, 115200: 8 },

  crc16(octets) {
    let c = 0;
    for (let i = 0; i < octets.length; i++) {
      c ^= octets[i] & 0xFF;
      for (let k = 0; k < 8; k++) c = (c & 1) ? ((c >>> 1) ^ 0xA001) : (c >>> 1);
    }
    return c & 0xFFFF;
  },

  avecCrc(octets) {
    const c = this.crc16(octets);
    return octets.concat([c & 0xFF, c >>> 8]);
  },

  // ---------- Trames de contrôle ----------
  controle(type, b4 = 0, b5 = 0, sadd = 1, code = 0) {
    return Uint8Array.from(this.avecCrc([this.ENQ, type, 0x40 | (code & 0x3F), b4 & 0xFF, b5 & 0xFF, sadd & 0xFF]));
  },
  start(sadd = 1, mbd = 0)          { return this.controle(this.START, 0, mbd, sadd); },
  stack(sbd = 0, mbd = 0, sadd = 1) { return this.controle(this.STACK, sbd, mbd, sadd); },
  ack(rr, sadd = 1)                 { return this.controle(this.ACK, rr, 0, sadd); },
  nack(rr, code = 0, sadd = 1)      { return this.controle(this.NACK, rr, 0, sadd, code); },

  // ---------- Message de données ----------
  message(corps, rr, xx, sadd = 1, select = false) {
    const n = corps.length;
    const entete = this.avecCrc([this.SOH, n & 0xFF, (select ? 0x80 : 0) | 0x40 | ((n >>> 8) & 0x3F), rr & 0xFF, xx & 0xFF, sadd & 0xFF]);
    const c = this.crc16(corps);
    return Uint8Array.from([...entete, ...corps, c & 0xFF, c >>> 8]);
  },

  bcd(n) { return ((Math.floor(n / 10) % 10) << 4) | (n % 10); },

  // ---------- Commandes et réponses (contenu des messages de données) ----------
  // Who Are You : 77 E0 00 S2 S1 P2 P1 JJ MM AA HH MM SS U2 U1 A
  // Codes de sécurité et de passe TOUJOURS à 0 : un code non nul serait
  // enregistré par la machine comme nouveau mot de passe (norme 6.1.6).
  whoAreYou(date = new Date(), utilisateur = "BA", type = 0x0B) {
    const u = String(utilisateur || "BA").padEnd(2, " ").slice(0, 2);
    return [0x77, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00,
            this.bcd(date.getDate()), this.bcd(date.getMonth() + 1), this.bcd(date.getFullYear() % 100),
            this.bcd(date.getHours()), this.bcd(date.getMinutes()), this.bcd(date.getSeconds()),
            u.charCodeAt(0) & 0x7F, u.charCodeAt(1) & 0x7F, type === 0x0C ? 0x0C : 0x0B];
  },

  // Read Data : 77 E2 00 liste 01 (enregistrement) 00 00 (décalage) 00 00 (tout)
  readData(liste = 2) { return [0x77, 0xE2, 0x00, liste & 0xFF, 0x01, 0x00, 0x00, 0x00, 0x00]; },

  finish() { return [0x77, 0xFF]; },

  // Who Are You accepté : 88 E0 01 S2 S1 P2 P1 #8…#1 V1 M1 rd 00 msdb lsdb (tampon 0000 = 256 octets)
  reponseWay(serie8 = "00000001") {
    const s = String(serie8).replace(/[^\x20-\x7E]/g, "0").padStart(8, "0").slice(-8);
    return [0x88, 0xE0, 0x01, 0x00, 0x00, 0x00, 0x00, ...Array.from(s, c => c.charCodeAt(0)),
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  },
  reponseWrite() { return [0x88, 0xE3, 0x01]; },
  // Refus poli d'une commande que le PC ne veut pas exécuter
  refus(commande) { return commande === 0xE5 ? [0x88, 0xE5, 0x00, 0x00] : [0x88, commande & 0xFF, 0x00]; },

  // ---------- Lecture des réponses de la machine ----------
  lireWay(c) {
    if (c.length < 3 || c[0] !== 0x88 || c[1] !== 0xE0) return null;
    if (c[2] !== 0x01) return { acceptee: false, code: c[3] };
    const serie = c.length >= 15 ? this.versTexte(c.slice(7, 15)).replace(/[^\x20-\x7E]/g, "").trim() : "";
    const tampon = c.length >= 21 ? ((c[19] << 8) | c[20]) : 0;
    return { acceptee: true, serie, version: c[15], fabricant: c[16], lecturesEnPlus: c[17] || 0,
             tampon: tampon === 0 ? 256 : tampon };
  },
  lireReadData(c) {
    if (c.length < 3 || c[0] !== 0x88 || c[1] !== 0xE2) return null;
    if (c[2] !== 0x01) return { acceptee: false };
    const longueur = c.length >= 9 ? ((c[7] << 8) | c[8]) : 0xFFFF;
    return { acceptee: true, liste: c[3], longueur: longueur === 0 ? 0xFFFF : longueur };
  },
  lireWriteData(c) {
    if (c.length < 4 || c[0] !== 0x77 || c[1] !== 0xE3) return null;
    const longueur = c.length >= 6 ? ((c[4] << 8) | c[5]) : 0xFFFF;
    return { liste: c[3], longueur: longueur === 0 ? 0xFFFF : longueur };
  },

  NOMS: { 0xE0: "Who Are You", 0xE1: "Program Slave Device", 0xE2: "Read Data", 0xE3: "Write Data",
          0xE4: "Delete Data", 0xE5: "Program Module", 0xE6: "Read Memory", 0xFF: "Finish" },

  nomMessage(c) {
    if (!c || !c.length) return "message vide";
    if (c[0] === 0x77) return "commande « " + (this.NOMS[c[1]] || ("0x" + this.hex([c[1]]))) + " »";
    if (c[0] === 0x88) return "réponse « " + (this.NOMS[c[1]] || ("0x" + this.hex([c[1]]))) + " » " + (c[2] === 0x01 ? "acceptée" : "refusée");
    if (c[0] === 0x99) return "bloc de données n°" + c[1] + " (" + (c.length - 2) + " octets)";
    return "message " + this.hex(c.slice(0, 4));
  },

  // ---------- Découpe du flux reçu ----------
  // Retourne { trames, reste, erreurs } ; reste = octets d'une trame pas encore complète
  extraire(tampon) {
    const trames = [], erreurs = [];
    let i = 0, ignores = 0;
    const fin = () => { if (ignores) { erreurs.push({ type: "ignores", n: ignores }); ignores = 0; } };

    while (i < tampon.length) {
      const b = tampon[i];
      if (b !== this.ENQ && b !== this.SOH) { ignores++; i++; continue; }
      if (i + 8 > tampon.length) break;                 // en-tête pas encore complet
      const entete = tampon.subarray(i, i + 8);
      if (this.crc16(entete.subarray(0, 6)) !== (entete[6] | (entete[7] << 8))) {
        // faux début (octet 05 ou 81 au milieu de données) ou en-tête abîmé
        ignores++; i++; continue;
      }
      if (b === this.ENQ) {
        fin();
        trames.push({ genre: "ctrl", type: entete[1], code: entete[2] & 0x3F, select: !!(entete[2] & 0x80),
                      b4: entete[3], b5: entete[4], sadd: entete[5], octets: entete.slice() });
        i += 8;
        continue;
      }
      // Message de données
      const n = entete[1] | ((entete[2] & 0x3F) << 8);
      if (n === 0) { fin(); erreurs.push({ type: "format" }); i += 8; continue; }
      if (i + 8 + n + 2 > tampon.length) break;          // données pas encore complètes
      fin();
      const corps = tampon.subarray(i + 8, i + 8 + n);
      const crc = tampon[i + 8 + n] | (tampon[i + 9 + n] << 8);
      const info = { rr: entete[3], xx: entete[4], sadd: entete[5], select: !!(entete[2] & 0x80) };
      if (this.crc16(corps) !== crc) {
        erreurs.push(Object.assign({ type: "crc_donnees" }, info));
      } else {
        trames.push(Object.assign({ genre: "data", corps: corps.slice(), octets: tampon.slice(i, i + 10 + n) }, info));
      }
      i += 10 + n;
    }
    fin();
    return { trames, reste: tampon.slice(i), erreurs };
  },

  // ---------- Liste blanche : la seule protection contre une mauvaise commande ----------
  autorise(o) {
    if (!o || o.length < 8) return false;
    if (o[0] === this.ENQ) {
      if (o.length !== 8 || (o[2] & 0x80)) return false;           // select toujours à 0
      return [this.ACK, this.NACK, this.START, this.STACK].indexOf(o[1]) >= 0;
    }
    if (o[0] !== this.SOH) return false;
    const n = o[1] | ((o[2] & 0x3F) << 8);
    if (o.length !== 10 + n) return false;
    const c = o.subarray(8, 8 + n);
    const zero = (d, f) => { for (let k = d; k < f; k++) if (c[k] !== 0) return false; return true; };
    if (c[0] === 0x77) {
      if (c[1] === 0xE0) return n === 16 && zero(2, 7);              // Who Are You, codes à 0
      if (c[1] === 0xE2) return n === 9 && c[2] === 0 && (c[3] === 1 || c[3] === 2) && c[4] === 1 && zero(5, 9);
      if (c[1] === 0xFF) return n === 2;                              // Finish
      return false;                                                   // écriture / effacement : interdit
    }
    if (c[0] === 0x88) {
      if (c[1] === 0xE0 && c[2] === 0x01) return n === 21 && zero(3, 7);
      if (c[1] === 0xE3 && c[2] === 0x01) return n === 3;
      if (c[2] === 0x00) return [0xE0, 0xE1, 0xE2, 0xE3, 0xE4, 0xE6].indexOf(c[1]) >= 0 ? n === 3 : (c[1] === 0xE5 && n === 4);
      return false;
    }
    return false;
  },

  versTexte(octets) {
    let s = "";
    for (let i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
    return s;
  },

  hex(octets) {
    return Array.from(octets, b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  },

  // Description lisible d'une trame (pour le journal)
  decrire(o) {
    if (!o || !o.length) return "";
    if (o[0] === this.ENQ) {
      const noms = { 1: "ACK", 2: "NACK", 3: "REP", 6: "START", 7: "STACK" };
      let t = (noms[o[1]] || "contrôle " + o[1]);
      if (o[1] === this.ACK || o[1] === this.NACK) t += " n°" + o[3];
      if (o[1] === this.NACK && (o[2] & 0x3F)) t += " (code " + (o[2] & 0x3F) + ")";
      return t;
    }
    if (o[0] === this.SOH && o.length >= 10) return "n°" + o[4] + " " + this.nomMessage(o.subarray(8, o.length - 2));
    return this.hex(o.slice(0, 8));
  }
};

// ============================================================
// Moteur de session DDCMP — indépendant du navigateur (testable).
// options : envoyer(octets) -> Promise ; horloge { now, setTimeout,
// clearTimeout, attendre(ms) } ; journal(texte, niveau) ; brut(sens, octets) ;
// rapport({ texte, role, liste, serieMachine }) ; etat(texte) ; reglages.
// ============================================================
BA.MoteurDdcmp = class {

  constructor(options) {
    const o = options || {};
    this.envoyer = o.envoyer;
    this.h       = o.horloge;
    this.log     = o.journal || (() => {});
    this.brut    = o.brut    || (() => {});
    this.surRapport = o.rapport || (() => {});
    this.surEtat    = o.etat    || (() => {});
    this.r = Object.assign({
      sadd:               1,      // adresse : 1 = point à point (commande 90)
      startIntervalleMs:  300,    // norme : au moins 250 ms entre deux START
      startMax:           10,     // norme : 10 START au maximum
      ackDelaiMs:         300,    // norme : 170 ms (+ marge pour l'adaptateur USB)
      essaisMax:          5,      // norme : 5 essais par message
      lienDelaiMs:        5000,   // norme : 5 s sans rien = fin de session
      lienDelaiDonneesMs: 15000,  // norme : 15 s pendant Read / Write Data
      retournementMs:     40,     // norme : 40 ms entre réception et émission
      interCaractereMs:   200,    // norme : 65 ms (+ marge USB) ; trame coupée = abandonnée
      attenteFinishMs:    2000,   // machine maître : attente de son FINISH avant d'envoyer le nôtre
      cederMax:           2,      // nombre de fois où le PC laisse la main avant d'abandonner une lecture
      identifiantPc:      "00000001",
      utilisateur:        "BA"
    }, o.reglages || {});

    this.file = Promise.resolve();
    this.tampon = new Uint8Array(0);
    this.dernierRx = -1e9;
    this.minuteries = {};
    this.lectureDemandee = null;   // { liste, resolve, enCours, cede }
    this.compteurIgnores = 0;
    this._reinit();
  }

  // ---------- Outils ----------
  _reinit() {
    this._effacerMinuteries(["start", "ack", "lien", "finish"]);
    this.mode = null;            // null | "maitre" | "esclave"
    this.phase = null;
    this.saddSession = this.r.sadd;
    this.txProchain = 1;         // n° du prochain message envoyé (1 après START)
    this.rx = 0;                 // n° du dernier message bien reçu (0 après START)
    this.attente = null;         // message envoyé qui attend son accusé
    this.nackEnvoye = false;
    this.transfert = null;
    this.essaisStart = 0;
    this.serieMachine = null;
    this.lecturesRestantes = 0;
    this.listeEnCours = null;
    this.textes = [];
    this.erreurLecture = null;
  }

  _minuterie(nom, ms, fn) {
    this._effacerMinuteries([nom]);
    const id = this.h.setTimeout(() => {
      if (this.minuteries[nom] !== id) return;
      delete this.minuteries[nom];
      this._enFile(fn);
    }, ms);
    this.minuteries[nom] = id;
  }

  _effacerMinuteries(noms) {
    (noms || Object.keys(this.minuteries)).forEach(n => {
      if (this.minuteries[n] !== undefined) { this.h.clearTimeout(this.minuteries[n]); delete this.minuteries[n]; }
    });
  }

  // Tout passe par cette file : un seul traitement à la fois, dans l'ordre.
  // Règle : une tâche de la file n'attend JAMAIS un message de la machine
  // (sinon blocage) ; les suites sont appelées quand l'accusé arrive.
  _enFile(fn) {
    this.file = this.file.then(fn).catch(err => this.log("Erreur interne : " + (err && err.message || err), "err"));
    return this.file;
  }

  occupe() { return this.mode !== null; }

  // ---------- Émission ----------
  async _ecrire(octets) {
    if (!BA.DDCMP.autorise(octets)) {
      this.log("⛔ Trame bloquée par la liste de sécurité (non envoyée) : " + BA.DDCMP.hex(octets), "err");
      return false;
    }
    const reste = this.dernierRx + this.r.retournementMs - this.h.now();
    if (reste > 0) await this.h.attendre(reste);
    this.brut("TX", octets);
    await this.envoyer(octets);
    return true;
  }

  async _controle(octets, texte) {
    if (texte) this.log("→ " + texte, "tx");
    return this._ecrire(octets);
  }

  // Envoie un message de données ; suite(ok) est appelée à l'accusé ou après le dernier essai
  async _donnees(corps, texte, suite) {
    const xx = this.txProchain & 0xFF;
    const octets = BA.DDCMP.message(corps, this.rx, xx, this.saddSession);
    this.attente = { xx, corps, essais: 1, texte, suite: suite || null };
    this.log("→ n°" + xx + " " + texte, "tx");
    const ok = await this._ecrire(octets);
    if (!ok) { this.attente = null; if (suite) await suite(false); return; }
    this._minuterie("ack", this.r.ackDelaiMs + octets.length, () => this._delaiAck());
  }

  async _delaiAck() {
    const a = this.attente;
    if (!a) return;
    if (a.essais >= this.r.essaisMax) {
      this.log("⚠ Pas d'accusé de réception après " + a.essais + " essais : " + a.texte, "warn");
      this.attente = null;
      this.txProchain = (this.txProchain + 1) & 0xFF;   // norme : on incrémente même en cas d'échec
      if (a.suite) await a.suite(false);
      if (this.mode) await this._abandon("La machine n'accuse plus réception des messages.");
      return;
    }
    a.essais++;
    this.log("→ nouvel essai " + a.essais + "/" + this.r.essaisMax + " : " + a.texte, "tx");
    const octets = BA.DDCMP.message(a.corps, this.rx, a.xx, this.saddSession);
    await this._ecrire(octets);
    this._minuterie("ack", this.r.ackDelaiMs + octets.length, () => this._delaiAck());
  }

  // Un accusé (ACK, NACK ou message de données) porte rr : notre message n° rr est bien arrivé
  async _accuse(rr) {
    const a = this.attente;
    if (!a || rr !== a.xx) return false;
    this._effacerMinuteries(["ack"]);
    this.attente = null;
    this.txProchain = (this.txProchain + 1) & 0xFF;
    if (a.suite) await a.suite(true);
    return true;
  }

  _rearmerLien() {
    const ms = (this.transfert && !this.transfert.termine) ? this.r.lienDelaiDonneesMs : this.r.lienDelaiMs;
    this._minuterie("lien", ms, () => this._abandon("Plus rien reçu de la machine depuis " + Math.round(ms / 1000) + " s."));
  }

  // ---------- Réception ----------
  recevoir(octets) {
    const maintenant = this.h.now();
    return this._enFile(async () => {
      if (this.tampon.length && maintenant - this.dernierRx > this.r.interCaractereMs) {
        this.log("⚠ Trame incomplète abandonnée (" + this.tampon.length + " octets, trop d'attente entre deux caractères).", "warn");
        this.tampon = new Uint8Array(0);
      }
      this.dernierRx = maintenant;
      const t = new Uint8Array(this.tampon.length + octets.length);
      t.set(this.tampon, 0);
      t.set(octets, this.tampon.length);
      const r = BA.DDCMP.extraire(t);
      this.tampon = r.reste;
      for (const e of r.erreurs) await this._erreurTrame(e);
      for (const tr of r.trames) await this._trame(tr);
    });
  }

  async _erreurTrame(e) {
    if (e.type === "ignores") {
      this.compteurIgnores += e.n;
      if (this.compteurIgnores >= 32) {
        this.log("⚠ " + this.compteurIgnores + " octets illisibles reçus (vitesse différente de la machine ? mauvais protocole ?).", "warn");
        this.compteurIgnores = 0;
      }
      return;
    }
    if (!this.mode) return;
    const code = e.type === "crc_donnees" ? 2 : 17;
    this.log(e.type === "crc_donnees" ? "⚠ Message n°" + e.xx + " abîmé (CRC des données faux)." : "⚠ En-tête de message incorrect.", "warn");
    if (!this.nackEnvoye) {
      this.nackEnvoye = true;
      await this._controle(BA.DDCMP.nack(this.rx, code, this.saddSession), "NACK n°" + this.rx + " (code " + code + ")");
    }
  }

  async _trame(t) {
    this.brut("RX", t.octets);
    if (t.genre === "ctrl") return this._trameControle(t);
    return this._trameDonnees(t);
  }

  async _trameControle(t) {
    const D = BA.DDCMP;
    if (t.type === D.START) return this._startRecu(t);
    if (t.type === D.STACK) {
      if (this.mode === "maitre" && this.phase === "start") {
        this._effacerMinuteries(["start"]);
        this.log("← STACK : la machine répond, session ouverte (PC maître).", "ok");
        this.phase = "way";
        this._rearmerLien();
        await this._donnees(D.whoAreYou(new Date(), this.r.utilisateur), "Who Are You (codes de sécurité 0000)",
          async ok => { if (!ok && this.mode === "maitre") await this._abandon("Pas de réponse au Who Are You."); });
      }
      return;
    }
    if (!this.mode) return;
    this._rearmerLien();
    if (t.type === D.ACK) {
      this.log("← ACK n°" + t.b4, "rx");
      await this._accuse(t.b4);
      return;
    }
    if (t.type === D.NACK) {
      this.log("← NACK n°" + t.b4 + (t.code ? " (code " + t.code + ")" : ""), "rx");
      // NACK portant le n° de notre message = il a bien été reçu (notre ACK précédent s'était perdu)
      if (await this._accuse(t.b4)) return;
      if (this.attente) {
        this._effacerMinuteries(["ack"]);
        await this._delaiAck();
      }
    }
  }

  // La machine envoie START : elle ouvre une session (télémétrie, ou réponse à notre START)
  async _startRecu(t) {
    const D = BA.DDCMP;
    const demande = this.lectureDemandee;
    if (this.mode === "maitre") {
      this.log("← START : la machine ouvre elle-même une session, le PC lui laisse la main.", "info");
      if (demande) { demande.enCours = false; demande.cede = (demande.cede || 0) + 1; }
    } else if (this.mode === "esclave") {
      this.log("← START : nouvelle session de la machine (la précédente est abandonnée).", "info");
    } else {
      this.log("← START (la machine ouvre une session)", "rx");
    }
    if (this.attente) { const a = this.attente; this.attente = null; if (a.suite) a.suite = null; }
    this._reinit();
    this.mode = "esclave";
    this.phase = "session";
    this.saddSession = t.sadd || this.r.sadd;
    this.surEtat("Session ouverte par la machine");
    await this._controle(D.stack(0, t.b5, this.saddSession), "STACK");
    this._rearmerLien();
  }

  async _trameDonnees(t) {
    const D = BA.DDCMP;
    if (!this.mode) {
      this.log("Message reçu hors session (ignoré) : " + D.nomMessage(t.corps), "warn");
      return;
    }
    this._rearmerLien();
    await this._accuse(t.rr);                    // accusé « porté » par le message de la machine
    if (!this.mode) return;
    const attendu = (this.rx + 1) & 0xFF;
    if (t.xx === attendu) {
      this.rx = t.xx;
      this.nackEnvoye = false;
      this.log("← n°" + t.xx + " " + D.nomMessage(t.corps), "rx");
      await this._controle(D.ack(this.rx, this.saddSession), "ACK n°" + this.rx);
      await this._message(t.corps, t.select);
    } else if (t.xx === this.rx) {
      this.log("← n°" + t.xx + " reçu une 2e fois (notre ACK s'est perdu) : ACK renvoyé, message ignoré.", "warn");
      await this._controle(D.ack(this.rx, this.saddSession), "ACK n°" + this.rx);
    } else if (!this.nackEnvoye) {
      this.nackEnvoye = true;
      this.log("⚠ Message n°" + t.xx + " hors séquence (attendu n°" + attendu + ").", "warn");
      await this._controle(D.nack(this.rx, 0, this.saddSession), "NACK n°" + this.rx);
    }
  }

  // ---------- Traitement du contenu ----------
  async _message(c, select) {
    const D = BA.DDCMP;

    // Blocs de données (Read Data du PC, ou Write Data de la machine)
    if (c[0] === 0x99) {
      if (!this.transfert || this.transfert.termine) {
        this.log("Bloc de données inattendu (ignoré).", "warn");
        return;
      }
      await this._bloc(c, select);
      return;
    }

    if (this.mode === "maitre") {
      if (this.phase === "way") {
        const w = D.lireWay(c);
        if (!w) return;
        if (!w.acceptee) {
          this.log("✖ La machine refuse le Who Are You (codes de sécurité différents de 0000 ?).", "err");
          this.erreurLecture = "La machine refuse l'accès (codes de sécurité).";
          await this._envoyerFinish();
          return;
        }
        this.serieMachine = w.serie;
        this.lecturesRestantes = 1 + Math.min(3, w.lecturesEnPlus || 0);
        this.log("← Who Are You accepté : n° « " + (w.serie || "?") + " », version " + w.version + ", tampon " + w.tampon + " octets.", "ok");
        await this._demanderLecture();
        return;
      }
      if (this.phase === "read") {
        const r = D.lireReadData(c);
        if (!r) return;
        if (!r.acceptee) {
          this.log("✖ La machine refuse la lecture de la liste " + this.listeEnCours + ".", "err");
          this.erreurLecture = "La machine refuse la lecture de la liste " + this.listeEnCours + ".";
          await this._envoyerFinish();
          return;
        }
        this.transfert = { liste: r.liste, longueur: r.longueur, recu: 0, morceaux: [], dernierBloc: null, termine: false };
        this.phase = "blocs";
        this.log("← Lecture acceptée (" + (r.longueur === 0xFFFF ? "longueur inconnue" : r.longueur + " octets") + ").", "ok");
        this.surEtat("Lecture : réception des données…");
        this._rearmerLien();
        return;
      }
      return;
    }

    // Mode esclave : la machine commande
    if (c[0] !== 0x77) return;
    this._effacerMinuteries(["finish"]);
    switch (c[1]) {
      case 0xE0:
        await this._donnees(D.reponseWay(this.r.identifiantPc), "Who Are You accepté (88 E0 01)");
        break;
      case 0xE3: {
        const w = D.lireWriteData(c);
        this.transfert = { liste: w.liste, longueur: w.longueur, recu: 0, morceaux: [], dernierBloc: null, termine: false };
        this.phase = "blocs";
        this.log("La machine envoie des données (liste " + w.liste + ", " +
                 (w.longueur === 0xFFFF ? "longueur inconnue" : w.longueur + " octets") + ").", "info");
        this.surEtat("Réception des données de la machine…");
        await this._donnees(D.reponseWrite(), "Write Data accepté (88 E3 01)");
        this._rearmerLien();
        break;
      }
      case 0xFF:
        this.log("← FINISH de la machine : session terminée proprement.", "ok");
        await this._finSession();
        break;
      default:
        this.log("Commande de la machine refusée par sécurité : " + D.nomMessage(c), "warn");
        if ([0xE1, 0xE2, 0xE4, 0xE5, 0xE6].indexOf(c[1]) >= 0) await this._donnees(D.refus(c[1]), "refus (88 " + D.hex([c[1]]) + " 00)");
        break;
    }
  }

  async _bloc(c, select) {
    const tr = this.transfert;
    const numero = c[1];
    if (tr.dernierBloc !== null && numero === tr.dernierBloc) {
      this.log("Bloc n°" + numero + " déjà reçu (ignoré).", "warn");
      return;
    }
    tr.dernierBloc = numero;
    const donnees = c.subarray(2);
    tr.morceaux.push(BA.DDCMP.versTexte(donnees));
    tr.recu += donnees.length;
    const texte = tr.morceaux.join("");
    const fini = select ||
      (tr.longueur !== 0xFFFF && tr.recu >= tr.longueur) ||
      (tr.longueur === 0xFFFF && /(^|\n)DXE\*[^\r\n]*\r?\n?$/.test(texte));
    this.surEtat("Réception : " + tr.recu + " octets…");
    if (!fini) return;

    tr.termine = true;
    this.textes.push(texte);
    this.log("Données complètes : " + tr.recu + " octets reçus.", "ok");
    try { this.surRapport({ texte, role: this.mode, liste: tr.liste, serieMachine: this.serieMachine }); }
    catch (e) { this.log("Erreur pendant le traitement du relevé : " + e.message, "err"); }

    if (this.mode === "maitre") {
      this.lecturesRestantes--;
      if (this.lecturesRestantes > 0) await this._demanderLecture();
      else await this._envoyerFinish();
    } else {
      this.phase = "session";
      this._rearmerLien();
      // La machine (maître) doit envoyer FINISH ; sinon le PC le fait (comportement vu sur la machine)
      this._minuterie("finish", this.r.attenteFinishMs, async () => {
        if (this.mode !== "esclave" || this.phase !== "session" || this.attente) return;
        this.log("La machine n'envoie pas FINISH : le PC termine la session.", "info");
        await this._envoyerFinish();
      });
    }
  }

  async _demanderLecture() {
    this.phase = "read";
    this.transfert = null;
    await this._donnees(BA.DDCMP.readData(this.listeEnCours), "Read Data liste " + this.listeEnCours +
      (this.listeEnCours === 2 ? " (lecture de contrôle : rien n'est remis à zéro)" : " (audit standard)"),
      async ok => { if (!ok && this.mode === "maitre") await this._abandon("Pas de réponse à la demande de lecture."); });
  }

  async _envoyerFinish() {
    this.phase = "fin";
    await this._donnees(BA.DDCMP.finish(), "FINISH", async ok => {
      if (ok) { this.log("← ACK du FINISH.", "rx"); await this._finSession(); }
      else if (this.mode) await this._abandon("Pas d'accusé pour le FINISH.");
    });
  }

  // ---------- Fin de session ----------
  async _finSession() {
    if (!this.mode) return;
    const role = this.mode, textes = this.textes.slice(), erreur = this.erreurLecture;
    this.log(role === "maitre" ? "Session terminée." : "Session de la machine terminée.", "ok");
    const demande = this.lectureDemandee;
    this._reinit();
    this.surEtat("En écoute");
    this._suiteDemande(role, demande, textes.length ? { ok: true, textes } : { ok: false, erreur: erreur || "Aucune donnée reçue." });
  }

  async _abandon(raison) {
    const demande = this.lectureDemandee;
    if (!this.mode && !(demande && demande.enCours)) return;
    const role = this.mode;
    this.log("✖ Session abandonnée : " + raison + " Rien n'est enregistré pour cette session.", "err");
    if (this.attente) { this.attente = null; }
    this._reinit();
    this.surEtat("En écoute");
    this._suiteDemande(role, demande, { ok: false, erreur: raison });
  }

  // Après une session : répondre à la lecture demandée, ou la lancer si elle attendait
  _suiteDemande(role, demande, resultat) {
    if (!demande) return;
    if (demande.enCours) {
      this.lectureDemandee = null;
      demande.resolve(resultat);
      return;
    }
    // La lecture attendait (la machine avait la main)
    if ((demande.cede || 0) > this.r.cederMax) {
      this.lectureDemandee = null;
      demande.resolve({ ok: false, cede: true,
        erreur: "La machine reprend la main à chaque essai (elle répond à START par START) : lecture impossible ; ses envois sont bien reçus." });
      return;
    }
    this.h.setTimeout(() => this._enFile(() => this._ouvrir()), 1000);
  }

  // ---------- Lecture à la demande (le PC est maître) ----------
  lire(liste = 2) {
    if (liste !== 1 && liste !== 2) return Promise.resolve({ ok: false, erreur: "Seules les listes 1 et 2 sont permises." });
    if (this.lectureDemandee) return Promise.resolve({ ok: false, erreur: "Une lecture est déjà en cours." });
    return new Promise(resolve => {
      this.lectureDemandee = { liste, resolve, enCours: false, cede: 0 };
      this._enFile(() => {
        if (this.mode) {
          this.log("La machine est en train d'envoyer ses données : la lecture partira après.", "info");
          return;
        }
        return this._ouvrir();
      });
    });
  }

  async _ouvrir() {
    const d = this.lectureDemandee;
    if (!d || d.enCours || this.mode) return;
    this._reinit();
    d.enCours = true;
    this.mode = "maitre";
    this.phase = "start";
    this.listeEnCours = d.liste;
    this.essaisStart = 0;
    this.surEtat("Lecture : ouverture de la session…");
    await this._envoyerStart();
  }

  async _envoyerStart() {
    if (this.mode !== "maitre" || this.phase !== "start") return;
    if (this.essaisStart >= this.r.startMax) {
      await this._abandon("La machine ne répond pas (" + this.r.startMax + " START sans réponse). Vérifier le câble (droit 2-2, 3-3, 5-5), la vitesse et la commande 90 (EVA-DTS DDCMP, sortie RS232, adresse 1).");
      return;
    }
    this.essaisStart++;
    this.txProchain = 1;
    this.rx = 0;
    await this._controle(BA.DDCMP.start(this.saddSession, 0), "START" + (this.essaisStart > 1 ? " (essai " + this.essaisStart + "/" + this.r.startMax + ")" : ""));
    this._minuterie("start", this.r.startIntervalleMs, () => this._envoyerStart());
  }

  // Arrêt complet (déconnexion du câble)
  arreter() {
    this._effacerMinuteries();
    const d = this.lectureDemandee;
    this.lectureDemandee = null;
    this.attente = null;
    this._reinit();
    this.tampon = new Uint8Array(0);
    if (d) d.resolve({ ok: false, erreur: "Câble déconnecté." });
  }
};


// ============================================================
// BROODAUTOMATE — Port série du navigateur (Web Serial, Chrome / Edge)
// ============================================================
BA.Serial = {
  port:      null,
  reader:    null,
  moteur:    null,
  connected: false,
  _ecriture: Promise.resolve(),

  supported() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  },

  // Ports déjà autorisés dans ce navigateur (reconnexion sans clic)
  async portsAutorises() {
    if (!this.supported()) return [];
    try { return await navigator.serial.getPorts(); } catch (e) { return []; }
  },

  // Horloge du navigateur. Onglet caché : les minuteries de Chrome sont
  // ralenties (1 s) ; l'attente de 40 ms se fait alors en boucle active.
  horloge: {
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: id => clearTimeout(id),
    attendre(ms) {
      if (typeof document !== "undefined" && document.hidden) {
        const fin = this.now() + ms;
        while (this.now() < fin) { /* attente active courte (≤ 40 ms) */ }
        return Promise.resolve();
      }
      return new Promise(r => setTimeout(r, ms));
    }
  },

  // rappels : { journal(texte, niveau), brut(sens, octets), rapport(r), etat(texte), statut(texte) }
  async connect(reglages, rappels, portExistant) {
    if (!this.supported()) throw new Error("Web Serial non disponible — utilise Google Chrome ou Microsoft Edge");
    if (this.connected) await this.disconnect();
    const r = reglages || {};
    const cb = rappels || {};
    this._cb = cb;

    const port = portExistant || await navigator.serial.requestPort();
    await port.open({
      baudRate: Number(r.baudRate) || 9600,
      dataBits: 8, parity: "none", stopBits: 1,
      bufferSize: 16384
    });
    this.port = port;
    if (r.signaux !== false) {
      try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); }
      catch (e) { if (cb.journal) cb.journal("Signaux DTR/RTS non appliqués : " + e.message, "warn"); }
    }

    this.moteur = new BA.MoteurDdcmp({
      envoyer: o => this._ecrire(o),
      horloge: this.horloge,
      journal: cb.journal, brut: cb.brut, rapport: cb.rapport, etat: cb.etat,
      reglages: r.ddcmp || {}
    });
    this.connected = true;
    if (cb.statut) cb.statut("connecté");
    if (cb.etat) cb.etat("En écoute");
    this._boucle(port);

    if (!this._ecouteDeconnexion && navigator.serial.addEventListener) {
      this._ecouteDeconnexion = true;
      navigator.serial.addEventListener("disconnect", e => {
        if (this.port && e.target === this.port) {
          if (this._cb && this._cb.journal) this._cb.journal("Câble USB débranché.", "err");
          this.disconnect();
        }
      });
    }
    return port;
  },

  // Boucle de lecture (modèle recommandé pour Web Serial : une erreur passagère
  // — parité, débordement — donne un nouveau lecteur ; « done » = port fermé)
  async _boucle(port) {
    while (this.port === port && port.readable) {
      let reader;
      try { reader = port.readable.getReader(); } catch (e) { break; }
      this.reader = reader;
      let fini = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) { fini = true; break; }
          if (value && value.length && this.moteur) this.moteur.recevoir(value);
        }
      } catch (err) {
        if (this.port === port && this._cb && this._cb.journal) this._cb.journal("Erreur de lecture du port (passagère ?) : " + err.message, "warn");
      } finally {
        try { reader.releaseLock(); } catch (e) { /* déjà libéré */ }
        if (this.reader === reader) this.reader = null;
      }
      if (fini) break;
    }
    // Le port ne donne plus rien alors qu'on ne l'a pas fermé nous-mêmes (adaptateur débranché ?)
    if (this.port === port) {
      if (this._cb && this._cb.journal) this._cb.journal("Le port ne répond plus (adaptateur USB débranché ?).", "err");
      await this.disconnect("erreur : port perdu");
    }
  },

  _ecrire(octets) {
    this._ecriture = this._ecriture.then(async () => {
      if (!this.port || !this.port.writable) return;
      const w = this.port.writable.getWriter();
      try { await w.write(octets); } finally { w.releaseLock(); }
    }).catch(err => {
      if (this._cb && this._cb.journal) this._cb.journal("Écriture impossible : " + err.message, "err");
    });
    return this._ecriture;
  },

  // Lecture à la demande : liste 2 (par défaut) ou 1
  lire(liste = 2) {
    if (!this.connected || !this.moteur) return Promise.resolve({ ok: false, erreur: "Câble non connecté." });
    return this.moteur.lire(liste);
  },

  occupe() { return !!(this.moteur && (this.moteur.occupe() || this.moteur.lectureDemandee)); },

  async disconnect(statutFinal) {
    const port = this.port;
    if (this.moteur) this.moteur.arreter();
    this.moteur = null;
    this.port = null;
    this.connected = false;
    try { if (this.reader) await this.reader.cancel(); } catch (e) { /* rien */ }
    try { await this._ecriture; } catch (e) { /* rien */ }
    try { if (port) await port.close(); } catch (e) { /* déjà fermé */ }
    if (this._cb && this._cb.statut) this._cb.statut(statutFinal || "déconnecté");
    if (this._cb && this._cb.etat) this._cb.etat("Déconnecté");
  }
};
