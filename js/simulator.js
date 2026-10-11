// ============================================================
// BROODAUTOMATE — Simulateur FAS Power Lift
// Simule des ventes, la température et des erreurs
// Permet de tester l'application SANS la machine physique
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
      await BA.DB.updateMachine({
        status:    "online",
        last_seen: new Date().toISOString(),
        temp_c:    BA_CONFIG.simulator.targetTempC
      });
      await BA.DB.addEvent("info", "SIM_START", "Simulateur démarré");
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
      await BA.DB.updateMachine({ status: "offline" });
      await BA.DB.addEvent("info", "SIM_STOP", "Simulateur arrêté");
    }

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Tick vente ----------
  async tickSale() {
    const products  = BA.DB.isReady() ? await BA.DB.getProducts() : this._localProducts;
    const available = products.filter(p => p.qty > 0);

    if (!available.length) {
      this._addLocalEvent("error", "ALL_EMPTY", "Tous les produits sont épuisés");
      if (BA.DB.isReady()) await BA.DB.addEvent("error", "ALL_EMPTY", "Tous les produits sont épuisés");
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
      machine_id: BA_CONFIG.machines[0].id,
      selection:  p.selection,
      name:       p.name,
      price:      p.price,
      created_at: new Date().toISOString()
    });

    // Supabase si prêt
    if (BA.DB.isReady()) {
      await BA.DB.addSale({ selection: p.selection, name: p.name, price: p.price });
      await BA.DB.updateProduct(p.id, { qty: newQty });
    }

    if (newQty === 0) {
      this._addLocalEvent("error", `SOLD_OUT_${p.selection}`, `Épuisé : ${p.name}`);
      if (BA.DB.isReady()) await BA.DB.addEvent("error", `SOLD_OUT_${p.selection}`, `Épuisé : ${p.name}`);
    } else if (newQty <= BA_CONFIG.lowStockThreshold) {
      this._addLocalEvent("warn", `LOW_${p.selection}`, `Stock faible : ${p.name} (${newQty} restant)`);
      if (BA.DB.isReady()) await BA.DB.addEvent("warn", `LOW_${p.selection}`, `Stock faible : ${p.name} (${newQty} restant)`);
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
        await BA.DB.updateMachine({ status: "error", temp_c: tempC, last_seen: new Date().toISOString() });
        await BA.DB.addEvent("error", code, msg);
      }
    } else {
      this._localMachine.status = "online";
      if (BA.DB.isReady()) {
        await BA.DB.updateMachine({ status: "online", temp_c: tempC, last_seen: new Date().toISOString() });
      }
    }

    if (this._onRefresh) this._onRefresh();
  },

  // ---------- Événements locaux ----------
  _addLocalEvent(level, code, message) {
    this._localEvents.unshift({
      id:         Date.now() + Math.random(),
      machine_id: BA_CONFIG.machines[0].id,
      level,
      code,
      message,
      created_at: new Date().toISOString()
    });
    if (this._localEvents.length > 100) this._localEvents.length = 100;
  },

  // ---------- Générateur trame EVA-DTS ----------
  generateEvaDts(machine, products, sales, events) {
    const d     = new Date();
    const date  = d.toISOString().slice(2, 10).replace(/-/g, "");
    const time  = d.toTimeString().slice(0, 5).replace(":", "");
    const cents = v => Math.round(Number(v) * 100);

    const totalSales = sales.length;
    const totalValue = sales.reduce((a, s) => a + Number(s.price), 0);

    const lines = [
      `DXS*FAS*VA*V0/6*1`,
      `ST*001*0001`,
      `ID1*${machine.serial}*${(machine.model || "").split(" ").slice(0, 2).join("_")}`,
      `ID4*2*EUR`,
      `ID5*${date}*${time}`,
      `VA1*${cents(totalValue)}*${totalSales}*${cents(totalValue)}*${totalSales}`
    ];

    for (const p of products) {
      const ventesSel = sales.filter(s => s.selection === p.selection);
      const valSel    = ventesSel.reduce((a, s) => a + Number(s.price), 0);
      lines.push(`PA1*${p.selection}*${cents(p.price)}`);
      lines.push(`PA2*${ventesSel.length}*${cents(valSel)}*${ventesSel.length}*0`);
    }

    events
      .filter(e => e.level === "error")
      .slice(0, 10)
      .forEach(e => lines.push(`EA1*${e.code}*${date}*${time}`));

    lines.push(`G85*0000`, `SE*${lines.length + 2}*0001`, `DXE*1*1`);
    return lines.join("\r\n");
  }
};