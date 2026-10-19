// ============================================================
// BROODAUTOMATE — Simulateur FAS Power Lift (v3.1)
// Simule des ventes, la température et des erreurs
// Permet de tester l'application SANS la machine physique
// (mode local uniquement : en mode réel les boutons sont cachés)
// ============================================================

window.BA = window.BA || {};

BA.Simulator = {
  running:   false,
  saleTimer: null,
  teleTimer: null,

  // ---------- Produits fictifs (utilisés si Supabase pas encore configuré) ----------
_localProducts: [
    { id: 1, selection: 11, name: "Pain blanc",    price: 2.50, qty: 8, capacity: 10, machine_id: "FAS-202166085" },
    { id: 2, selection: 12, name: "Pain gris",     price: 2.50, qty: 8, capacity: 10, machine_id: "FAS-202166085" },
    { id: 3, selection: 13, name: "Pain complet",  price: 2.50, qty: 8, capacity: 10, machine_id: "FAS-202166085" },
    { id: 4, selection: 14, name: "Pain MAYA",     price: 2.50, qty: 8, capacity: 10, machine_id: "FAS-202166085" },
    { id: 5, selection: 21, name: "Sandwich",      price: 2.50, qty: 8, capacity: 10, machine_id: "FAS-202166085" },
    { id: 6, selection: 22, name: "",              price: 2.50, qty: 0, capacity: 10, machine_id: "FAS-202166085" }
  ],

  _localSales:   [],
  _localEvents:  [],
  _localMachine: {
    id: "FAS-202166085",
    brand: "FAS International S.p.A.",
    model: "POWER LIFT AREA 8L 1T 1050 0 18 65P CO2",
    code: "981064MMAA021",
    serial: "202166085",
    year: 2021,
    status: "unknown",
    temp_c: null,
    last_seen: null,
    location: "À définir",
    electrical:  { voltage: 230, frequency: 50, power: 480, current: 2.5 },
    refrigerant: { type: "R744 (CO2)", charge_g: 390, class: "N", kind: "K" },
    serial_port: { baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1, dtr: true },
    protocol:    "EVA-DTS",
    selections:  70
  },

  // ---------- Démarrage ----------
  async start(onRefresh) {
    if (this.running) return;
    this.running   = true;
    this._onRefresh = onRefresh;

    this._localMachine.status    = "online";
    this._localMachine.last_seen = new Date().toISOString();
    this._localMachine.temp_c    = BA_CONFIG.simulator.targetTempC;

    this._addLocalEvent("info", "SIM_START", "Simulateur démarré");

    if (BA.DB.isReady()) {
      await BA.DB.updateMachine(this._localMachine.id, {
        status:    "online",
        last_seen: new Date().toISOString(),
        temp_c:    BA_CONFIG.simulator.targetTempC
      });
      await BA.DB.addEvent(this._localMachine.id, "info", "SIM_START", "Simulateur démarré");
    }

    this.saleTimer = setInterval(() => this.tickSale(), BA_CONFIG.simulator.saleIntervalMs);
    this.teleTimer = setInterval(() => this.tickTelemetry(), BA_CONFIG.simulator.telemetryIntervalMs);

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Arrêt ----------
  async stop() {
    clearInterval(this.saleTimer);
    clearInterval(this.teleTimer);
    this.running = false;

    this._localMachine.status = "offline";
    this._addLocalEvent("info", "SIM_STOP", "Simulateur arrêté");

    if (BA.DB.isReady()) {
      await BA.DB.updateMachine(this._localMachine.id, { status: "offline" });
      await BA.DB.addEvent(this._localMachine.id, "info", "SIM_STOP", "Simulateur arrêté");
    }

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Tick vente ----------
  async tickSale() {
    const id        = this._localMachine.id;
    const products  = BA.DB.isReady() ? await BA.DB.getProducts(id) : this._localProducts;
    const available = products.filter(p => p.qty > 0);

    if (!available.length) {
      this._addLocalEvent("error", "ALL_EMPTY", "Tous les produits sont épuisés");
      if (BA.DB.isReady()) await BA.DB.addEvent(id, "error", "ALL_EMPTY", "Tous les produits sont épuisés");
      if (this._onRefresh) this._onRefresh();
      return;
    }

    const p      = available[Math.floor(Math.random() * available.length)];
    const newQty = p.qty - 1;

    // Mise à jour locale
    const local = this._localProducts.find(x => x.selection === p.selection);
    if (local) local.qty = newQty;

    // Ajout vente locale
    this._localSales.unshift({
      id:         Date.now(),
      machine_id: id,
      selection:  p.selection,
      name:       p.name,
      price:      p.price,
      created_at: new Date().toISOString()
    });

    // Supabase si prêt
    if (BA.DB.isReady()) {
      await BA.DB.addSale(id, { selection: p.selection, name: p.name, price: p.price });
      await BA.DB.updateProduct(p.id, { qty: newQty });
    }

    if (newQty === 0) {
      this._addLocalEvent("error", `SOLD_OUT_${p.selection}`, `Épuisé : ${p.name}`);
      if (BA.DB.isReady()) await BA.DB.addEvent(id, "error", `SOLD_OUT_${p.selection}`, `Épuisé : ${p.name}`);
    } else if (newQty <= BA_CONFIG.lowStockThreshold) {
      this._addLocalEvent("warn", `LOW_${p.selection}`, `Stock faible : ${p.name} (${newQty} restant)`);
      if (BA.DB.isReady()) await BA.DB.addEvent(id, "warn", `LOW_${p.selection}`, `Stock faible : ${p.name} (${newQty} restant)`);
    }

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Tick télémétrie ----------
  async tickTelemetry() {
    const tempC = +(BA_CONFIG.simulator.targetTempC + (Math.random() - 0.5) * 1.5).toFixed(1);
    this._localMachine.temp_c    = tempC;
    this._localMachine.last_seen = new Date().toISOString();

    const erreurs = [
      ["E_LIFT",  "Erreur ascenseur (lift)"],
      ["E_PHOTO", "Photocellule obstruée"],
      ["E_TEMP",  "Température hors plage"],
      ["E_DOOR",  "Porte ouverte"]
    ];

    if (Math.random() < BA_CONFIG.simulator.errorProbability) {
      const [code, msg] = erreurs[Math.floor(Math.random() * erreurs.length)];
      this._localMachine.status = "error";
      this._addLocalEvent("error", code, msg);
      if (BA.DB.isReady()) {
        await BA.DB.updateMachine(this._localMachine.id, { status: "error", temp_c: tempC, last_seen: new Date().toISOString() });
        await BA.DB.addEvent(this._localMachine.id, "error", code, msg);
      }
    } else {
      this._localMachine.status = "online";
      if (BA.DB.isReady()) {
        await BA.DB.updateMachine(this._localMachine.id, { status: "online", temp_c: tempC, last_seen: new Date().toISOString() });
      }
    }

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Événements locaux ----------
  _addLocalEvent(level, code, message) {
    this._localEvents.unshift({
      id:         Date.now() + Math.random(),
      machine_id: this._localMachine.id,
      level,
      code,
      message,
      created_at: new Date().toISOString()
    });
    if (this._localEvents.length > 100) this._localEvents.length = 100;
  },

  // ---------- Générateur trame EVA-DTS (même forme qu'un audit FAS) ----------
  // Compteurs cumulés VA1 / LA1 (LA105) / PA2, événements EA1 + EA2,
  // G85 calculé comme la machine (CRC-16 de ST… à la ligne avant G85), SE exact.
  generateEvaDts(machine, products, sales, events) {
    const d     = new Date();
    const date  = d.toISOString().slice(2, 10).replace(/-/g, "");
    const time  = d.toTimeString().slice(0, 5).replace(":", "");
    const cents = v => Math.round(Number(v) * 100);

    const totalSales = sales.length;
    const totalValue = sales.reduce((a, s) => a + Number(s.price), 0);

    const lignes = [
      `DXS*FAS000000001*VA*V1/6*1`,
      `ST*001*0001`,
      `ID1*FAS000000001*SIMULATEUR*0091* *+120*`,
      `ID4*2*39`,
      `ID5*${date}*${time}`,
      `VA1*${cents(totalValue)}*${totalSales}*${cents(totalValue)}*${totalSales}*0**0`
    ];

    for (const p of products) {
      const ventesSel = sales.filter(s => s.selection === p.selection);
      const valSel    = ventesSel.reduce((a, s) => a + Number(s.price), 0);
      lignes.push(`PA1*${p.selection}*0*${p.selection * 100}*0**1**0*99`);
      lignes.push(`PA2*${ventesSel.length}*${cents(valSel)}*${ventesSel.length}`);
    }
    for (const p of products) {
      const n = sales.filter(s => s.selection === p.selection).length;
      if (n) lignes.push(`LA1*0*${p.selection}*0*${n}*${n}`);
    }

    events
      .filter(e => e.level === "error")
      .slice(0, 10)
      .forEach(e => {
        const code = String(e.code).replace(/[^A-Z0-9_]/gi, "").slice(0, 20) || "EJZ";
        lignes.push(`EA1*${code}*${date}*${time}***+120`);
        lignes.push(`EA2*${code}****1`);
      });

    lignes.push(`G85*0000`);
    const iSt = lignes.indexOf("ST*001*0001");
    lignes.push(`SE*${lignes.length - iSt + 1}*001*0001`, `DXE*1*1`);
    let texte = lignes.join("\r\n") + "\r\n";
    const g85 = BA.EvaDts.calculerG85(texte);
    return texte.replace("G85*0000", "G85*" + g85);
  }
};