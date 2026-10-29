// ============================================================
// BROODAUTOMATE TEST — Données partagées (BA.Model, BA.Store)
// - Une seule « base » dans le navigateur (localStorage), lue par
//   l'interface admin ET l'appli opérateur (synchro entre onglets).
// - Les pains sont suivis par LOTS datés (date de livraison) :
//   le plus ancien est toujours vendu en premier (FIFO).
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG;
  const H = 3600000, DAY = 86400000, MIN = 60000;
  const pad = n => String(n).padStart(2, "0");

  function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  // 06:00 du jour (moins n jours) : heure de livraison habituelle
  // Dernière livraison de pain de 06:00 déjà passée à cet instant (avant 06:00 : celle d'hier)
  function lastDelivery(ms) {
    const d = delivery6(ms, 0);
    return d <= ms ? d : delivery6(ms, 1);
  }
  function delivery6(ms, daysBack) {
    const d = new Date(ms);
    d.setDate(d.getDate() - (daysBack || 0));
    d.setHours(6, 0, 0, 0);
    return d.getTime();
  }
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // Ajoute des heures « d'horloge » (10:00 + 24 h = 10:00 le lendemain, même au changement d'heure)
  function addHoursLocal(ms, h) { const d = new Date(ms); d.setHours(d.getHours() + h); return d.getTime(); }

  // ---------------- Catalogue des événements ----------------
  // cat : door, stock, fresh, temp, power, price, tech, business
  // L'opérateur voit tout sauf « business » (données commerciales).
  const EVENTS = {
    DOOR_OPEN:     { cat: "door",     level: "warn" },
    SEL_EMPTY:     { cat: "stock",    level: "warn" },
    MACHINE_EMPTY: { cat: "stock",    level: "err"  },
    OLD_BREAD:     { cat: "fresh",    level: "warn" },
    KEPT_BREAD:    { cat: "fresh",    level: "warn" },
    TEMP_HIGH:     { cat: "temp",     level: "err"  },
    TEMP_LOW:      { cat: "temp",     level: "warn" },
    POWER_CUT:     { cat: "power",    level: "err"  },
    PRICE_CHANGED: { cat: "price",    level: "info" },
    FAS_45:        { cat: "tech",     level: "err"  },
    FAS_33:        { cat: "tech",     level: "err"  },
    STOCK_GAP:     { cat: "business", level: "warn" }
  };
  const OPERATOR_CATS = ["door", "stock", "fresh", "temp", "power", "price", "tech"];

  // Priorité d'affichage sur le Dashboard
  const RANK = { door: 0, power: 1, empty: 2, error: 3, remove: 4, low: 5, ok: 6, offline: 7 };

  // ================= MODÈLE =================
  const Model = {
    H, DAY, MIN, pad, dayKey, delivery6, lastDelivery, rnd, addHoursLocal, EVENTS, OPERATOR_CATS, RANK,

    // Frais fixes mensuels d'une machine : valeur propre à la machine, sinon valeur par défaut des paramètres
    fixedOf(s, m) { return m && m.fixed != null && isFinite(m.fixed) ? Number(m.fixed) : Number(s.settings.fixedMonthly) || 0; },
    qty(sel) { return sel.lots.reduce((a, l) => a + l.qty, 0); },
    // Trie les lots du plus ancien au plus récent et réunit sur une seule
    // ligne les lots qui ont la même date de livraison (même lot).
    sortLots(sel) {
      sel.lots.sort((a, b) => a.date - b.date || a.id - b.id);
      for (let i = sel.lots.length - 1; i > 0; i--) {
        const a = sel.lots[i - 1], b = sel.lots[i];
        if (Math.floor(a.date / MIN) === Math.floor(b.date / MIN) && !!a.kept === !!b.kept) {
          a.qty += b.qty;
          a.estimated = !!(a.estimated && b.estimated);
          if (b.kept && (!a.keptAt || (b.keptAt && b.keptAt < a.keptAt))) a.keptAt = b.keptAt;
          sel.lots.splice(i, 1);
        }
      }
      for (let i = sel.lots.length - 1; i >= 0; i--) if (sel.lots[i].qty <= 0) sel.lots.splice(i, 1);
    },

    // ---- Types de pain : types de base + types ajoutés par l'utilisateur ----
    // Dans les listes : un type ajouté à la main n'apparaît que s'il est encore utilisé par une sélection
    // (après la suppression de sa dernière sélection, il disparaît ; on le retrouve en réécrivant son nom).
    types(s) {
      const used = new Set();
      s.machines.forEach(m => m.sels.forEach(x => used.add(x.type)));
      return C.productTypes.concat((s.customTypes || []).map(x => x.id).filter(id => used.has(id)));
    },
    customName(s, id) { const c = (s.customTypes || []).find(x => x.id === id); return c ? c.name : null; },
    // Ajoute un type écrit à la main (ou retrouve le même nom) et renvoie son identifiant
    ensureType(s, name) {
      name = String(name || "").trim().slice(0, 40);
      if (!name) return null;
      const low = name.toLowerCase();
      s.customTypes = s.customTypes || [];
      // le nom d'un type de base (« Pain blanc ») renvoie ce type, pas un doublon
      const base = C.productTypes.find(ty => [ty, ...["fr", "nl", "en"].map(l => ((BA.I18n.dicts[l] || {})["prod_" + ty] || ""))].some(x => x.toLowerCase() === low));
      if (base) return base;
      const ex = s.customTypes.find(x => x.name.toLowerCase() === low);
      const id = ex ? ex.id : "c" + (s.seq++);
      if (!ex) s.customTypes.push({ id, name });
      const p = s.settings.purchase;
      if (p[id] == null) {
        const vals = Object.values(p).filter(v => isFinite(v));
        p[id] = vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length * 100) / 100 : 1;
      }
      return id;
    },

    // Ventes moyennes par jour d'une machine (7 derniers jours complets)
    dailyRate(s, num) {
      let sum = 0, n = 0;
      for (let d = 1; d <= 7; d++) {
        const r = (s.daily[dayKey(s.now - d * DAY)] || {})[num];
        if (r) { sum += r.s; n++; }
      }
      return n ? sum / n : 0;
    },
    machine(s, num) { return s.machines.find(m => m.num === Number(num)); },
    sel(m, n) { return m.sels.find(x => x.n === Number(n)); },

    isOld(s, lot) { return !lot.kept && (s.now - lot.date) > s.settings.thrHours * H; },

    // ---- Règle « gardé une seule fois » ----
    // Un pain trop vieux encore bon peut être gardé UNE fois (lot.kept ; lot.keptAt = quand).
    // Il reste valable jusqu'à la COMMANDE SUIVANTE : une commande envoyée depuis l'onglet Commander
    // après lot.keptAt, ou au plus tard l'heure habituelle de la commande (paramètre, 15 h) qui suit.
    // En pratique : gardé pendant la tournée du soir → invalide le lendemain, après la commande.
    // Ensuite il est INVALIDE : au passage, il doit être retiré obligatoirement (pas de 2e fois).
    // Pendant la même tournée (annuler puis relancer « Remplir »), l'opérateur peut encore choisir.
    // Heure à laquelle commence le « jour suivant » (4 h par défaut)
    dayHour(s) {
      const v = s.settings.dayHour, h = Math.round(Number(v));
      return v != null && v !== "" && isFinite(h) && h >= 0 && h <= 23 ? h : 4;
    },
    // Prochain changement de jour après ms
    nextDayAt(s, ms) {
      const d = new Date(ms);
      d.setHours(Model.dayHour(s), 0, 0, 0);
      if (d.getTime() <= ms) d.setDate(d.getDate() + 1);
      return d.getTime();
    },
    // Moment où un pain gardé une fois devient invalide : le jour suivant (un seul passage de sursis)
    invalidAt(s, lot) {
      if (!lot.kept) return null;
      return Model.nextDayAt(s, lot.keptAt || s.now);
    },

    isMandatory(s, lot) { return !!lot.kept && s.now >= Model.invalidAt(s, lot); },

    // Lot dans la liste « à retirer » (étape 2 de « Remplir ») : un pain gardé une fois y est toujours
    // (obligatoire s'il est invalide ; sinon, même tournée, l'opérateur peut encore choisir) ;
    // les autres : date limite de la mission, sinon seuil
    mustRemove(s, lot, mission) {
      if (lot.kept) return true;
      if (mission && mission.removeBefore) return lot.date < mission.removeBefore;
      return Model.isOld(s, lot);
    },

    stats(s, m) {
      let total = 0, cap = 0, emptySels = 0, toRemove = 0, mandatory = 0, keptOnce = 0, oldest = null;
      m.sels.forEach(sel => {
        const q = Model.qty(sel);
        total += q; cap += sel.cap;
        if (q === 0) emptySels++;
        sel.lots.forEach(l => {
          if (l.kept) {
            if (Model.isMandatory(s, l)) { toRemove += l.qty; mandatory += l.qty; }   // invalide : à retirer obligatoirement
            else keptOnce += l.qty;                                                    // gardé une fois : valable jusqu'au jour suivant
          } else if (Model.isOld(s, l)) toRemove += l.qty;
          if (oldest === null || l.date < oldest) oldest = l.date;
        });
      });
      const pct = cap ? Math.round(total / cap * 100) : 0;
      const techActive = s.events.some(e => e.num === m.num && !e.resolved && (e.cat === "tech" || e.cat === "temp"));
      let st = "ok";
      if (!m.online) st = "offline";
      else if (m.door) st = "door";
      else if (m.power) st = "power";
      else if (pct <= s.settings.emptyPct) st = "empty";
      else if (techActive) st = "error";
      else if (toRemove > 0) st = "remove";
      else if (emptySels > 0) st = "low";
      return { total, cap, pct, emptySels, toRemove, mandatory, keptOnce, oldest, st };
    },

    // Plus ancien lot (date + quantité) d'une sélection
    oldestLot(sel) {
      if (!sel.lots.length) return null;
      Model.sortLots(sel);
      return sel.lots[0];
    },

    addDaily(s, at, num, add) {
      const k = dayKey(at);
      const day = s.daily[k] || (s.daily[k] = {});
      const r = day[num] || (day[num] = { s: 0, r: 0, l: 0, x: 0, c: 0 });
      for (const f in add) r[f] = Math.round((r[f] + add[f]) * 100) / 100;
    },

    // Ventes par type de pain (pour les profils par type) : r.y = { blanc: 7, gris: 2, ... }
    addType(s, at, num, type, n) {
      const r = (s.daily[dayKey(at)] || {})[num]; if (!r) return;
      r.y = r.y || {}; r.y[type] = (r.y[type] || 0) + (n || 1);
    },

    addEvent(s, num, code, data) {
      data = data || {};
      const def = EVENTS[code];
      const key = data.key != null ? data.key : (data.sel != null ? "s" + data.sel : "");
      const exists = s.events.find(e => e.num === num && e.code === code && !e.resolved && e.key === key);
      if (exists) return exists;
      const e = {
        id: s.seq++, t: s.now, num, code, cat: def.cat, level: def.level,
        key, data, resolved: false, resolvedAt: null, archived: false
      };
      s.events.unshift(e);
      Model.trimEvents(s);
      return e;
    },

    resolveEvents(s, num, code, filter) {
      s.events.forEach(e => {
        if (e.num === num && e.code === code && !e.resolved && (!filter || filter(e))) {
          e.resolved = true; e.resolvedAt = s.now;
        }
      });
    },

    trimEvents(s) {
      if (s.events.length <= 400) return;
      // on supprime d'abord les plus anciennes alertes archivées / résolues
      for (let i = s.events.length - 1; i >= 0 && s.events.length > 400; i--) {
        if (s.events[i].archived || s.events[i].resolved) s.events.splice(i, 1);
      }
      if (s.events.length > 400) s.events.length = 400;
    },

    // ---- Journal (historique) : chaque mouvement avec la date et l'heure exactes ----
    // k : sale (vente) · rm (retrait) · load (chargement) · inv (écart d'inventaire) · keep (encore bon)
    //     date (date du lot changée) · seladd / seldel (sélection ajoutée / supprimée)
    // n machine · s sélection · y type de pain · q quantité · p prix · l date du lot · l2 nouvelle date
    // r raison · x note · b qui (sim = distributeur, admin, op = opérateur) · it / st : intervention et étape · i : numéro
    who() { return (BA.Shell && BA.Shell.ctx && BA.Shell.ctx.role) || "admin"; },
    log(s, e) {
      const o = Object.assign({ t: s.now, b: Model.who() }, e, { i: s.seq++ });
      Object.keys(o).forEach(k => { if (o[k] == null || o[k] === "") delete o[k]; });
      (s.journal || (s.journal = [])).push(o);
      return o;
    },

    // ---- Une vente : le pain le plus ancien de la sélection part en premier ----
    sellOne(s, m, at) {
      if (!m.online || m.door || m.power) return false;
      const avail = m.sels.filter(x => Model.qty(x) > 0);
      if (!avail.length) return false;
      const sel = avail[Math.floor(Math.random() * avail.length)];
      Model.sortLots(sel);
      const lot = sel.lots[0];
      lot.qty--;
      const lotDate = lot.date;
      if (lot.qty <= 0) sel.lots.shift();
      Model.log(s, { t: at, k: "sale", n: m.num, s: sel.n, y: sel.type, q: 1, p: sel.price, l: lotDate, b: "sim" });
      Model.addDaily(s, at, m.num, { s: 1, r: sel.price });
      Model.addType(s, at, m.num, sel.type, 1);
      m.lastSale = at;
      if (Model.qty(sel) === 0) Model.addEvent(s, m.num, "SEL_EMPTY", { sel: sel.n, type: sel.type });
      if (m.sels.every(x => Model.qty(x) === 0)) Model.addEvent(s, m.num, "MACHINE_EMPTY", {});
      return true;
    },

    openMission(s, num) {
      return s.missions.find(x => x.num === num && x.status === "open") || null;
    },

    // Liste des pains à retirer pour une machine (étape 2)
    // mandatory : gardé une fois et invalide (à retirer obligatoirement) ;
    // kept sans mandatory : gardé une fois pendant cette tournée (l'opérateur peut encore choisir)
    removalList(s, m, mission) {
      const out = [];
      m.sels.forEach(sel => {
        Model.sortLots(sel);
        sel.lots.forEach(l => {
          if (l.qty > 0 && Model.mustRemove(s, l, mission)) {
            const mandatory = Model.isMandatory(s, l);
            out.push({ sel: sel.n, type: sel.type, lotId: l.id, date: l.date, qty: l.qty, mandatory, kept: !!l.kept,
              keptAt: l.keptAt || null, until: l.kept && !mandatory ? Model.invalidAt(s, l) : null });
          }
        });
      });
      return out;
    },

    // Retire n pains d'une sélection en commençant par les plus anciens
    takeOldest(sel, n) {
      Model.sortLots(sel);
      let left = n;
      while (left > 0 && sel.lots.length) {
        const l = sel.lots[0];
        const k = Math.min(l.qty, left);
        l.qty -= k; left -= k;
        if (l.qty <= 0) sel.lots.shift();
      }
      return n - left;
    },

    avgPurchase(s, m) {
      const p = s.settings.purchase;
      const caps = m.sels.reduce((a, x) => a + x.cap, 0);
      return m.sels.reduce((a, x) => a + (p[x.type] || 0) * x.cap, 0) / (caps || 1);
    },

    // Calcule les besoins de réapprovisionnement (onglet Commander), dans cet ordre :
    // 1. stock actuel, lot par lot ;
    // 2. on retire les ventes prévues jusqu'au passage (profil du jour × calendrier, confirmés
    //    par l'admin), en commençant par le lot le plus ancien ;
    // 3. sur ce qui reste, on compte « à retirer » les lots trop vieux À L'HEURE DU PASSAGE
    //    (livrés avant « passage − seuil », ou avant la date choisie par l'admin) ;
    // 4. place libre (« remplir à fond ») = capacité − stock estimé au passage + à retirer ;
    // 5. à charger, SELON LE BESOIN (par défaut) : ventes prévues entre ce passage et le suivant
    //    (part de la sélection) + marge de sécurité − pains qui restent, sans dépasser la place libre ;
    //    ou « remplir à fond » (choix de l'admin, pour toutes les machines ou machine par machine) ;
    // 6. à commander = total à charger (+ marge de la commande).
    // En plus : « capacité insuffisante » (jours forts) et « vide avant le passage » (ventes perdues).
    orderPlan(s, opts) {
      const FC = BA.Forecast;
      const ctx = opts.ctx || FC.context(s);
      const passage = Math.max(s.now, opts.passageAt || s.now);
      const next = Math.max(passage + H, opts.nextAt || addHoursLocal(passage, ctx.F.nextVisitHours || 24));
      const hours = (passage - s.now) / H;
      const removeBefore = opts.withRemoval
        ? (opts.removeBefore != null ? opts.removeBefore : passage - s.settings.thrHours * H)
        : null;
      // le pain neuf est livré le matin du passage (06:00) et devient « à retirer » après le seuil
      const delivery = lastDelivery(passage);
      const coverEnd = Math.min(next, delivery + s.settings.thrHours * H);
      const safety = Math.max(0, Number(ctx.F.safetyPct) || 0) / 100;
      const loadMode = opts.loadMode === "full" ? "full" : "need";
      const loadAdj = opts.loadAdj || {};
      const perMachine = [], perType = {};
      const T = type => perType[type] || (perType[type] = { type, cap: 0, stock: 0, forecast: 0, after: 0, remove: 0, mandatory: 0, order: 0, full: 0 });
      Model.types(s).forEach(T);
      s.machines.forEach(m => {
        const p = ctx.prof[m.num] || { base: 0 };
        const machineSales = opts.salesFn ? opts.salesFn(m, s.now, passage) : FC.salesBetween(ctx, m, s.now, passage);
        const normalSales = opts.salesFn ? machineSales : FC.salesBetween(ctx, m, s.now, passage, true);
        const cover = opts.coverFn ? opts.coverFn(m, passage, coverEnd) : FC.salesBetween(ctx, m, passage, coverEnd);
        const totCap = m.sels.reduce((a, x) => a + x.cap, 0) || 1;
        // Ventes prévues de la machine (arrondies), réparties entre les sélections selon la part de
        // chaque type de pain (historique ou profil réglé à la main), puis selon la capacité
        // (méthode des plus forts restes), sans dépasser le stock.
        const share = {};
        const selW = FC.selShares(ctx, m);
        const total = Math.round(machineSales);
        const parts = m.sels.map(sel => { const raw = total * selW[sel.n]; return { sel, raw, n: Math.floor(raw) }; });
        let restN = total - parts.reduce((a, x) => a + x.n, 0);
        parts.slice().sort((a, b) => (b.raw - b.n) - (a.raw - a.n)).forEach(x => { if (restN > 0) { x.n++; restN--; } });
        parts.forEach(x => { share[x.sel.n] = x.n; });
        const lines = m.sels.map(sel => {
          Model.sortLots(sel);
          const q = Model.qty(sel);
          const forecast = Math.min(q, share[sel.n] || 0);
          let left = forecast;
          const after = [];
          sel.lots.forEach(l => {
            const k = Math.min(l.qty, left);
            left -= k;
            if (l.qty - k > 0) after.push({ date: l.date, qty: l.qty - k, kept: l.kept });
          });
          const qAfter = after.reduce((a, l) => a + l.qty, 0);
          // pains gardés une fois et pas vendus d'ici le passage : cette commande est la « commande suivante »,
          // ils seront donc invalides au passage → toujours à retirer (même sans retrait demandé)
          const mand = after.filter(l => l.kept).reduce((a, l) => a + l.qty, 0);
          const rem = mand + (removeBefore == null ? 0 : after.filter(l => !l.kept && l.date < removeBefore).reduce((a, l) => a + l.qty, 0));
          const full = Math.max(0, sel.cap - (qAfter - rem));
          return { sel: sel.n, type: sel.type, cap: sel.cap, qty: q, forecast, after: qAfter, remove: rem, mandatory: mand, full, load: full };
        });
        const sum = f => lines.reduce((a, x) => a + x[f], 0);
        const full = sum("full"), keep = sum("after") - sum("remove");
        // Charge SELON LE BESOIN, sélection par sélection : ventes prévues entre ce passage et le suivant
        // (part de la sélection) + marge de sécurité − pains qui restent valables, sans dépasser la place libre.
        // Une sélection qui serait vide reçoit au moins 1 pain (si des ventes sont prévues).
        const perSel = {};
        lines.forEach(l => {
          const keepSel = l.after - l.remove;
          l.cover = cover * (selW[l.sel] || 0);
          let v = Math.max(0, Math.min(l.full, Math.ceil(l.cover * (1 + safety) - 1e-6) - keepSel));
          if (v === 0 && keepSel <= 0 && l.full > 0 && cover > 0) v = 1;
          perSel[l.sel] = l.need = v;
        });
        const need = Object.values(perSel).reduce((a, v) => a + v, 0);
        // Conseils de l'assistant pour cette machine
        const advice = [];
        if (need < full) advice.push({ kind: "less", advised: need, full, cover, keep, perSel, waste: Math.max(0, Math.round(full + keep - cover)) });
        if (cover > totCap) advice.push({ kind: "short", cover, cap: totCap });
        // Jour de grosse vente : la machine sera vide AVANT le passage (ventes perdues)
        const stockNow = sum("qty");
        if (!opts.salesFn && machineSales >= stockNow + 1 && passage > s.now) {
          let lo = s.now, hi = passage;
          for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (FC.salesBetween(ctx, m, s.now, mid) >= stockNow) hi = mid; else lo = mid; }
          advice.push({ kind: "empty", at: hi, lost: Math.round(machineSales - stockNow), stock: stockNow });
        }
        // Charge retenue : « selon le besoin » (par défaut) ou « remplir à fond », pour toutes les machines
        // (opts.loadMode) ou pour une machine (loadAdj[num] = "need" / "full") ; ou des quantités
        // choisies à la main (par sélection, ou un total réparti).
        const adj = loadAdj[m.num];
        const mode = adj === "full" || adj === "need" ? adj : adj != null ? "manual" : loadMode;
        if (mode === "need") lines.forEach(l => { l.load = l.need; });
        else if (mode === "full") lines.forEach(l => { l.load = l.full; });
        else if (typeof adj === "object") {
          lines.forEach(l => { l.load = Math.max(0, Math.min(l.full, adj[l.sel] != null ? Math.round(adj[l.sel]) : l.full)); });
        } else {
          const target = Math.max(0, Math.min(full, Math.round(adj)));
          const ps = lines.map(l => { const raw = full ? target * l.full / full : 0; return { l, raw, n: Math.floor(raw) }; });
          let rest = target - ps.reduce((a, x) => a + x.n, 0);
          ps.slice().sort((a, b) => (b.raw - b.n) - (a.raw - a.n)).forEach(x => { if (rest > 0 && x.n < x.l.full) { x.n++; rest--; } });
          ps.forEach(x => { x.l.load = x.n; });
        }
        const loadTot = sum("load");
        lines.forEach(l => {
          const t = T(l.type);
          t.cap += l.cap; t.stock += l.qty; t.forecast += l.forecast; t.after += l.after; t.remove += l.remove; t.mandatory += l.mandatory; t.order += l.load; t.full += l.full;
        });
        perMachine.push({
          num: m.num, street: m.street, city: m.city, rate: p.base, base: p.base, lines,
          effect: normalSales > 0 ? machineSales / normalSales - 1 : 0,
          forecast: sum("forecast"), remove: sum("remove"), mandatory: sum("mandatory"), load: loadTot, full, need, cover, mode, adjusted: loadTot < full, advice
        });
      });
      const margin = Math.max(0, Number(opts.marginPct) || 0) / 100;
      Object.values(perType).forEach(t => { t.orderWithMargin = Math.ceil(t.order * (1 + margin)); });
      return { perMachine, perType: Object.values(perType).filter(t => t.cap > 0), passage, hours, removeBefore, next, coverEnd, delivery, loadMode, safetyPct: Math.round(safety * 100) };
    }
  };

  // ================= DONNÉES DE DÉPART =================
  function createState() {
    const now = Date.now();
    const sim = C.simulator;
    const s = {
      v: 1, hv: 2, seq: 1, now, epoch: Math.random().toString(36).slice(2, 10),
      sim: { running: true, speed: 1, lastReal: now },
      settings: JSON.parse(JSON.stringify(C.defaults)),
      machines: [], events: [], journal: [], daily: {}, interventions: [], missions: [], orders: [], customTypes: [],
      calendar: [], dayDecisions: {}, profileManual: {}
    };
    const P = s.settings;

    C.machines.forEach((cm, i) => {
      const m = {
        num: cm.num, street: cm.street, city: cm.city, region: cm.region || "vl", zone: cm.zone || "center",
        serial: "2021" + String(64000 + cm.num * 7),
        online: true, door: false, power: false, powerUntil: null,
        temp: +(15.5 + Math.random()).toFixed(1), tempUntil: null,
        lastSale: null, lastSeen: now,
        nextSale: now + i * sim.offsetSec * 1000 + 5000,
        sels: C.selections.map(x => ({ n: x.n, type: x.type, cap: x.cap, price: P.salePrice, lots: [] }))
      };
      // Stock de départ : lots livrés aujourd'hui, hier et avant-hier à 06:00
      if (cm.num !== 113) {
        m.sels.forEach(sel => {
          if (cm.num === 107 && sel.n !== 22) return;            // #107 presque vide
          const d2 = Math.random() < 0.05 ? rnd(1, 2) : 0;       // lot d'avant-hier (> 35 h)
          const d1 = rnd(0, 2);                                    // lot d'hier
          const d0 = Math.max(0, rnd(Math.ceil(sel.cap / 2), sel.cap) - d2 - d1);
          const last = lastDelivery(now);                          // dernière livraison déjà passée (avant 06:00 : celle d'hier)
          if (d2) sel.lots.push({ id: s.seq++, qty: d2, date: delivery6(last, 2), kept: false });
          if (d1) sel.lots.push({ id: s.seq++, qty: d1, date: delivery6(last, 1), kept: false });
          if (d0) sel.lots.push({ id: s.seq++, qty: d0, date: last, kept: false });
        });
      }
      if (cm.num === 104) m.door = true;                        // #104 porte ouverte
      s.machines.push(m);
    });

    // Événements de départ
    s.machines.forEach(m => {
      if (m.door) Model.addEvent(s, m.num, "DOOR_OPEN", {});
      m.sels.forEach(sel => { if (Model.qty(sel) === 0) Model.addEvent(s, m.num, "SEL_EMPTY", { sel: sel.n, type: sel.type }); });
      if (m.sels.every(x => Model.qty(x) === 0)) Model.addEvent(s, m.num, "MACHINE_EMPTY", {});
    });

    // Calendrier (fériés belges, vacances scolaires, veilles de fête) et historique inventé
    s.calendar = BA.Forecast.seedCalendar(now);
    s.calendar.forEach(e => { e.id = s.seq++; });
    BA.Simulator.history(s, now);    // #113 et #115 : peu de ventes ; #120 : 3 semaines d'historique
    return s;
  }

  // Données d'une version précédente (v4.1) : on ajoute le calendrier et les réglages de
  // prévision, et on refait l'historique inventé avec un vrai profil par jour.
  // v4.2.1 : plus de « boulanger livre / fermé » (il livre 7 j/7)
  // v4.3 : un réglage de profil fait à la main expire après N semaines (8 par défaut)
  function cleanManual(o) {
    const W = ((o.settings && o.settings.forecast && o.settings.forecast.manualWeeks) || 8) * 7 * 86400000;
    const at = o.profileManualAt || {};
    Object.keys(o.profileManual || {}).forEach(n => {
      const man = o.profileManual[n]; if (!Array.isArray(man)) return;
      for (let wd = 0; wd < 7; wd++) {
        const a = (at[n] || {})[wd];
        if (man[wd] != null && a && o.now - a > W) { man[wd] = null; if (at[n]) delete at[n][wd]; if (o.profileTypes && o.profileTypes[n]) delete o.profileTypes[n][wd]; }
      }
      if (!man.some(v => v != null)) { delete o.profileManual[n]; if (o.profileTypes) delete o.profileTypes[n]; delete at[n]; }
    });
  }

  // v4.5 : le seuil « à retirer » passe de 35 h à 48 h (une seule fois ; ensuite il reste modifiable)
  function cleanThreshold(o) {
    if (!o.thr48) { o.thr48 = true; if (o.settings && Number(o.settings.thrHours) === 35) o.settings.thrHours = 48; }
  }

  function cleanCalendar(o) {
    (o.calendar || []).forEach(e => { if (e.kind === "closed") e.kind = "event"; if ("bakery" in e) delete e.bakery; });
  }

  function migrate(o) {
    o.settings.forecast = Object.assign({}, C.defaults.forecast, o.settings.forecast || {});
    o.machines.forEach(m => {
      const cm = C.machines.find(x => x.num === m.num) || {};
      m.region = m.region || cm.region || "vl";
      m.zone = m.zone || cm.zone || "center";
    });
    if (!Array.isArray(o.calendar)) {
      o.calendar = BA.Forecast.seedCalendar(o.now);
      o.calendar.forEach(e => { e.id = o.seq++; });
    }
    o.dayDecisions = o.dayDecisions || {};
    o.profileManual = o.profileManual || {};
    BA.Simulator.history(o, o.now);
    o.hv = 2;
  }

  // ================= STOCKAGE PARTAGÉ =================
  const KEY = C.storageKey;
  let state = null;
  const subs = [];

  // Lecture du texte enregistré, puis analyse (avec les mises à jour de données d'anciennes versions)
  function readRaw() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function parse(raw) {
    try {
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.v === 1 && Array.isArray(o.machines)) {
          o.customTypes = o.customTypes || [];
          // (v4.7.1 : plus de lien avec l'intervention « Remplir » ; le pain gardé reste valable jusqu'au jour suivant)
          o.machines.forEach(m => m.sels.forEach(sel => { Model.sortLots(sel); sel.lots.forEach(l => { if (l.kept && !l.keptAt) l.keptAt = o.now; delete l.keptIt; }); }));
          // v4.6 : journal (historique). Les 300 dernières ventes d'avant sont reprises.
          if (!Array.isArray(o.journal)) o.journal = (o.sales || []).slice().reverse()
            .map(x => ({ t: x.t, k: "sale", n: x.num, s: x.sel, y: x.type, q: 1, p: x.price, l: x.lot, b: "sim", i: o.seq++ }));
          delete o.sales;
          mergeHist(o);
          cleanCalendar(o); cleanManual(o); cleanThreshold(o);
          if (o.hv !== 2) { migrate(o); write(o); }
          return o;
        }
      }
    } catch (e) { /* stockage indisponible */ }
    return null;
  }
  function read() { return parse(readRaw()); }

  // ----- Enregistrement en deux parties -----
  // Les jours passés (historique, ~800 Ko) ne changent presque jamais : ils sont gardés dans une clé à part,
  // réécrite seulement quand elle change. Le reste (quelques dizaines de Ko) est réécrit à chaque vente :
  // l'écriture est donc très courte, et le risque que deux onglets (admin + opérateur) s'écrasent est minime.
  const KEY_H = C.storageKey + "-hist";
  const TAB = Math.random().toString(36).slice(2, 8);
  let wcount = 0;
  let histCache = null;                       // { sig, days, jold } déjà lu / écrit par cet onglet
  const histCut = s => M_dayKey(s.now - 2 * DAY);
  const M_dayKey = ms => dayKey(ms);
  // Journal : 62 jours de détail au plus (20 000 mouvements) ; avant, il reste le résumé par jour (statistiques).
  // La clé principale doit rester légère (sinon deux onglets qui écrivent en même temps risquent de s'écraser) :
  // elle garde au plus les 300 derniers mouvements. Quand il y en a plus, les plus anciens (tous sauf les 100
  // derniers) partent avec l'historique des jours (clé à part, réécrite seulement à ce moment-là).
  // La limite (s.jcut = numéro du dernier mouvement rangé) fait partie des données : tous les onglets rangent pareil.
  const JOURNAL_DAYS = 62, JOURNAL_MAX = 20000, J_RECENT_MAX = 300, J_RECENT_KEEP = 100;
  function splitDaily(s) {
    const cut = histCut(s), recent = {}, hist = {};
    Object.keys(s.daily).forEach(k => { (k < cut ? hist : recent)[k] = s.daily[k]; });
    const keys = Object.keys(hist).sort();
    const jMin = s.now - JOURNAL_DAYS * DAY;
    let j = s.journal || [];
    if (j.length > JOURNAL_MAX || j.some(e => e.t < jMin)) { j = j.filter(e => e.t >= jMin).slice(-JOURNAL_MAX); s.journal = j; }
    let jcut = s.jcut || 0;
    const fresh = j.filter(e => (e.i || 0) > jcut);
    if (fresh.length > J_RECENT_MAX) {
      const ids = fresh.map(e => e.i || 0).sort((x, y) => x - y);
      jcut = s.jcut = ids[ids.length - J_RECENT_KEEP - 1];
    }
    const jOld = [], jRecent = [];
    let ck = 0;
    j.forEach(e => { if ((e.i || 0) <= jcut) { jOld.push(e); ck = (ck + e.t + (e.i || 0)) % 1e9; } else jRecent.push(e); });
    const sig = keys.length + "|" + (keys[0] || "") + "|" + (keys[keys.length - 1] || "") + "|" + (s.histRev || 0) + "|j" + jOld.length + "|" + ck;
    return { recent, hist, jOld, jRecent, sig };
  }
  function mergeHist(o) {
    if (!o.h) return o;                       // ancienne forme : tout est dans la clé principale
    if (!histCache || histCache.sig !== o.h) {
      try {
        const h = JSON.parse(localStorage.getItem(KEY_H) || "null");
        if (h && h.days) histCache = { sig: h.sig, days: h.days, jold: h.jold || [] };
      } catch (e) { /* rien */ }
    }
    if (histCache) {
      o.daily = Object.assign({}, histCache.days, o.daily);
      // (sans doublon si un autre onglet vient de ranger les mouvements d'hier)
      const ids = new Set((o.journal || []).map(e => e.i));
      o.journal = (histCache.jold || []).filter(e => !ids.has(e.i)).concat(o.journal || []);
    }
    return o;
  }
  function serialize(s) {
    let sp = splitDaily(s);
    if (!histCache || histCache.sig !== sp.sig) {
      for (let tries = 0; tries < 4; tries++) {
        try {
          localStorage.setItem(KEY_H, JSON.stringify({ sig: sp.sig, days: sp.hist, jold: sp.jOld }));
          histCache = { sig: sp.sig, days: sp.hist, jold: sp.jOld };
          break;
        } catch (e) {
          // plus de place dans le navigateur : on garde moins de mouvements anciens et on réessaie
          if (!sp.jOld.length) { console.warn("Stockage impossible :", e); break; }
          const drop = new Set(sp.jOld.slice(0, Math.ceil(sp.jOld.length / 2)).map(x => x.i));
          s.journal = s.journal.filter(x => !drop.has(x.i));
          sp = splitDaily(s);
        }
      }
    }
    return JSON.stringify(Object.assign({}, s, { daily: sp.recent, journal: sp.jRecent, h: sp.sig }));
  }
  function write(s) {
    try { localStorage.setItem(KEY, serialize(s)); }
    catch (e) { console.warn("Stockage impossible :", e); }
  }
  function notify() { subs.forEach(f => { try { f(state); } catch (e) { console.error(e); } }); }

  const Store = {
    get() {
      if (!state) { state = read(); if (!state) { state = createState(); write(state); } }
      return state;
    },
    // Lecture-modification-écriture : toujours repartir de la dernière version
    // Plusieurs onglets (admin + opérateur) écrivent dans le même stockage. Deux protections :
    // 1. si un autre onglet a écrit entre notre lecture et notre écriture, on recommence ;
    // 2. chaque écriture laisse une trace (s.wl) ; 80 ms plus tard on vérifie qu'elle est toujours là.
    //    Si un autre onglet l'a écrasée (le stockage met quelques ms à se propager d'un onglet à l'autre),
    //    on refait la modification sur la version la plus récente. Rien n'est donc perdu.
    update(fn, silent, retry) {
      let s, res, out;
      const id = TAB + ":" + (++wcount);
      for (let tries = 0; ; tries++) {
        const raw0 = readRaw();
        s = parse(raw0) || Store.get();
        res = fn(s);
        s.wl = (s.wl || []).concat(id).slice(-400);
        out = serialize(s);
        if (tries >= 8 || readRaw() === raw0) break;
      }
      state = s;
      try { localStorage.setItem(KEY, out); } catch (e) { console.warn("Stockage impossible :", e); }
      if (!silent) notify();
      // vérifications 0,08 s, 0,45 s, 1,5 s et 4 s après : si un autre onglet a écrasé cette modification
      // (par exemple un onglet occupé quelques instants qui écrit ensuite des données périmées), on la refait (une seule fois)
      const epoch = s.epoch;
      let redone = false;
      const check = () => {
        if (redone) return;
        let o = null;
        try { o = JSON.parse(readRaw() || "null"); } catch (e) { /* rien */ }
        if (o && o.epoch === epoch && !(o.wl || []).includes(id)) { redone = true; Store.update(fn, silent, (retry || 0) + 1); }
      };
      if ((retry || 0) < 3) [80, 450, 1500, 4000].forEach(ms => setTimeout(check, ms));
      return res;
    },
    subscribe(f) { subs.push(f); },
    reset() { state = createState(); write(state); notify(); },
    refreshFromStorage() { const s = read(); if (s) { state = s; notify(); } }
  };

  window.addEventListener("storage", e => { if (e.key === KEY) Store.refreshFromStorage(); });

  BA.Model = Model;
  BA.Store = Store;
})();
