// ============================================================
// BROODAUTOMATE TEST — Actions (BA.Actions)
// Toutes les modifications passent par ici, pour l'admin
// comme pour l'opérateur (une seule « base » partagée).
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, Store = BA.Store;
  const TRASH_DAYS = 30, TRASH_MS = TRASH_DAYS * 86400000;      // v5.30 : durée de la corbeille des alertes

  function findLot(m, selN, lotId) {
    const sel = M.sel(m, selN);
    if (!sel) return {};
    const i = sel.lots.findIndex(l => l.id === Number(lotId));
    return { sel, lot: i >= 0 ? sel.lots[i] : null, i };
  }

  // ---- Déplacement d'un lot (voir BA.Actions.moveLot) ----
  // Un lot peut changer de numéro quand deux lots de même date se rejoignent : une demande retient donc la date.
  function moveLotByDate(sel, date, kept) {
    const same = sel.lots.filter(l => Math.floor(l.date / M.MIN) === Math.floor(date / M.MIN));
    return same.find(l => !!l.kept === !!kept) || same[0] || null;
  }
  function checkMove(s, m, fromN, toN, lot, qty) {
    const from = M.sel(m, fromN), to = M.sel(m, toN);
    if (!from || !to || from === to) return { err: "err_sel_missing" };
    if (from.type !== to.type) return { err: "mv_err_type" };
    if (!lot) return { err: "mv_err_gone" };
    if (lot.kept && M.isMandatory(s, lot)) return { err: "mv_err_invalid" };
    const q = Math.round(Number(qty));
    if (!(q >= 1) || q > lot.qty) return { err: "mv_err_qty" };
    if (q > to.cap - M.qty(to)) return { err: "mv_err_space" };
    return { qty: q, from, to };
  }
  function applyMove(s, m, fromN, toN, lot, qty, fromRequest) {
    const chk = checkMove(s, m, fromN, toN, lot, qty);
    if (chk.err) return chk;
    const { from, to, qty: q } = chk;
    lot.qty -= q;
    to.lots.push({ id: s.seq++, qty: q, date: lot.date, kept: !!lot.kept, estimated: !!lot.estimated, ...(lot.kept ? { keptAt: lot.keptAt || s.now } : {}) });
    from.lots = from.lots.filter(l => l.qty > 0);
    M.sortLots(from); M.sortLots(to);
    M.log(s, { k: "mv", n: m.num, s: from.n, s2: to.n, y: from.type, q, l: lot.date, r: fromRequest ? "req" : "" });
    if (M.qty(from) === 0) M.addEvent(s, m.num, "SEL_EMPTY", { sel: from.n, type: from.type });
    if (m.sels.every(x => M.qty(x) === 0)) M.addEvent(s, m.num, "MACHINE_EMPTY", {});
    return { ok: true, qty: q };
  }

  // Restauration des lots d'une machine : seulement pour un « Remplir » commencé avant la v5.34.4 (copie « snaps »)
  function restoreLots(m, snap) {
    if (!snap) return;
    m.sels.forEach(sel => { if (snap[sel.n]) sel.lots = JSON.parse(JSON.stringify(snap[sel.n])); });
  }

  // ---- v5.34.4 : « Remplir » sûr avec plusieurs appareils ----
  // Qui et quel appareil a commencé un Remplir (montré si un autre appareil le reprend)
  function appareil() {
    let id = "?";
    try { id = localStorage.getItem("ba-appareil") || ""; if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem("ba-appareil", id); } } catch (e) { id = "?"; }
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const type = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : "PC";
    return { id, type };
  }
  BA.Appareil = appareil;
  // Une étape ne s'applique qu'à un Remplir OUVERT et à la BONNE étape (avant : sur un Remplir annulé ailleurs, ou deux fois).
  // Un Remplir fermé automatiquement (oublié ?) reprend si quelqu'un y travaille encore (action faite hors ligne, par ex.),
  // seulement s'il n'y a pas d'autre Remplir ouvert sur la machine.
  function itOpen(s, itId, step) {
    const it = s.interventions.find(x => x.id === itId); if (!it) return null;
    if (it.status !== "open") {
      const autre = s.interventions.some(x => x !== it && x.num === it.num && x.status === "open");
      if (!it.auto || autre) return null;
      it.status = "open"; it.end = null; it.auto = false;
    }
    if (it.step !== step) return null;
    it.seen = s.now;
    return it;
  }
  // Défaire une étape par ÉCARTS : ce qu'elle a retiré est remis, ce qu'elle a ajouté est enlevé. Les ventes arrivées
  // pendant le Remplir restent comptées (avant : le stock d'avant était recopié et ces ventes disparaissaient du stock).
  const sameMin = (a, b) => Math.floor(a / M.MIN) === Math.floor(b / M.MIN);
  function rendre(sel, before, k) {
    const l = sel.lots.find(x => x.id === before.id) || sel.lots.find(x => sameMin(x.date, before.date) && !!x.kept === !!before.kept);
    if (l) {
      l.qty += k;
      ["kept", "keptAt", "estimated"].forEach(f => { if (f in before) l[f] = before[f]; else delete l[f]; });
    } else if (k > 0) sel.lots.push(Object.assign({}, before, { qty: k }));
  }
  function undoInventory(s, m, it) {
    if (Array.isArray(it.u1)) {
      it.u1.slice().reverse().forEach(r => {
        const sel = M.sel(m, r.s); if (!sel) return;
        if (r.add) {
          const l = sel.lots.find(x => x.id === r.id) || sel.lots.find(x => sameMin(x.date, r.d));
          if (l) { l.qty -= Math.min(l.qty, r.add); if (l.qty <= 0) sel.lots.splice(sel.lots.indexOf(l), 1); }
        }
        (r.take || []).slice().reverse().forEach(p => rendre(sel, p.lot, p.k));
        M.sortLots(sel);
      });
    } else if (it.snaps && it.snaps[1]) restoreLots(m, it.snaps[1]);
    else return false;          // rien pour défaire (Remplir d'une ancienne version) : on ne touche à rien
    s.events = s.events.filter(e => !(e.num === m.num && e.code === "STOCK_GAP" && e.key === "i" + it.id));
    s.journal = (s.journal || []).filter(e => !(e.it === it.id && e.st === 1));
    if (it.unk) M.addEvent(s, m.num, "STOCK_UNKNOWN", { sels: it.unk });     // l'alerte effacée par cet inventaire revient
    it.inv = []; it.invSkipped = false; it.step = 1;
    delete it.u1; delete it.unk; if (it.snaps) delete it.snaps[1];
    return true;
  }
  function undoRemoval(s, m, it) {
    if (Array.isArray(it.u2)) {
      it.u2.slice().reverse().forEach(r => { const sel = M.sel(m, r.s); if (sel) { rendre(sel, r.lot, r.removed); M.sortLots(sel); } });
    } else if (it.snaps && it.snaps[2]) restoreLots(m, it.snaps[2]);
    else return false;
    if (it.remTotal) M.addDaily(s, it.remAt || s.now, m.num, { x: -it.remTotal });
    s.journal = (s.journal || []).filter(e => !(e.it === it.id && e.st === 2));
    it.rem = []; it.remMode = null; it.remTotal = 0; it.step = 2;
    delete it.u2; if (it.snaps) delete it.snaps[2];
    return true;
  }

  // Dates du calendrier qui tombent ce jour-là : confirmées avec le jour
  function confirmEntriesOn(s, k) {
    (s.calendar || []).forEach(e => { if (e.from <= k && e.to >= k) e.confirmed = true; });
  }

  function checkEntry(v) {
    if (!v.name || !String(v.name).trim()) return "err_cal_name";
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(v.from || "") || (v.to && !re.test(v.to)) || (v.to && v.to < v.from)) return "err_cal_dates";
    const n = Number(v.effect);
    if (!isFinite(n) || n < -100 || n > 300) return "err_cal_effect";
    if (!BA.Forecast.KINDS.includes(v.kind)) return "err_cal_kind";
    if (v.scope === "list" && !(v.machines || []).length) return "err_cal_machines";
    return null;
  }

  BA.Actions = {
    // ---------- Porte ----------
    setDoor(num, open) {
      Store.update(s => {
        const m = M.machine(s, num); if (!m) return;
        m.door = !!open;
        if (open) M.addEvent(s, m.num, "DOOR_OPEN", {});
        else M.resolveEvents(s, m.num, "DOOR_OPEN");
      });
    },

    // ---------- Lots ----------
    setLotDate(num, selN, lotId, ms) {
      if (!isFinite(ms)) return;
      Store.update(s => {
        const m = M.machine(s, num); const { sel, lot } = findLot(m, selN, lotId);
        if (!lot || lot.date === ms) return;
        M.log(s, { k: "date", n: m.num, s: sel.n, y: sel.type, q: lot.qty, l: lot.date, l2: ms });
        lot.date = ms; lot.estimated = false;
        // pain en fait frais : plus de sursis ; encore trop vieux : il reste « gardé une fois » (invalide au jour suivant)
        if (lot.kept && !(s.now - ms > s.settings.thrHours * M.H)) { lot.kept = false; delete lot.keptAt; }
        M.sortLots(sel);
      });
    },
    // Sépare n pains d'un lot et leur donne une autre date de livraison (date par pain, pas seulement par lot)
    splitLot(num, selN, lotId, n, ms) {
      n = Math.round(Number(n));
      if (!isFinite(ms) || !(n >= 1)) return false;
      return Store.update(s => {
        const m = M.machine(s, num); const { sel, lot } = findLot(m, selN, lotId);
        if (!lot) return false;
        n = Math.min(n, lot.qty);
        lot.qty -= n;
        const still = lot.kept && s.now - ms > s.settings.thrHours * M.H;    // (même règle que pour la date du lot)
        sel.lots.push(Object.assign({ id: s.seq++, qty: n, date: ms, kept: !!still, estimated: false }, still ? { keptAt: lot.keptAt } : {}));
        M.log(s, { k: "date", n: m.num, s: sel.n, y: sel.type, q: n, l: lot.date, l2: ms });
        M.sortLots(sel);
        return true;
      });
    },
    keepLot(num, selN, lotId) {
      Store.update(s => {
        const m = M.machine(s, num); const { sel, lot } = findLot(m, selN, lotId);
        if (!lot || lot.kept) return;                    // déjà gardé une fois : pas de 2e fois
        // « encore bon » : gardé une fois, valable jusqu'au jour suivant (ensuite invalide)
        lot.kept = true; lot.keptAt = s.now;
        M.log(s, { k: "keep", n: m.num, s: sel.n, y: sel.type, q: lot.qty, l: lot.date });
      });
    },
    // Retirer des pains au choix (admin ou opérateur) : items = [{ lotId, qty }], raison, note.
    // Ils sortent du stock, comptent comme invendus (retours) et sont enregistrés dans l'historique.
    // Renvoie { removed } ou { err }.
    removeBread(num, selN, items, reason, note) {
      return Store.update(s => {
        const m = M.machine(s, num), sel = m && M.sel(m, selN);
        if (!sel) return { err: "err_sel_missing" };
        let total = 0;
        (items || []).forEach(x => {
          const lot = sel.lots.find(l => l.id === Number(x.lotId));
          const k = lot ? Math.max(0, Math.min(lot.qty, Math.round(Number(x.qty) || 0))) : 0;
          if (!k) return;
          lot.qty -= k; total += k;
          M.log(s, { k: "rm", n: m.num, s: sel.n, y: sel.type, q: k, l: lot.date, r: reason || "other", x: String(note || "").trim().slice(0, 80) });
        });
        if (!total) return { err: "rm_err" };
        sel.lots = sel.lots.filter(l => l.qty > 0);
        M.addDaily(s, s.now, m.num, { x: total });
        if (M.qty(sel) === 0) M.addEvent(s, m.num, "SEL_EMPTY", { sel: sel.n, type: sel.type });
        if (m.sels.every(x => M.qty(x) === 0)) M.addEvent(s, m.num, "MACHINE_EMPTY", {});
        return { removed: total };
      });
    },

    // ---------- Déplacer du pain d'une sélection à une autre (même produit) ----------
    // Règles : même type de pain ; de la place dans la sélection d'arrivée ; un pain invalide (gardé une fois, délai
    // dépassé) ne se déplace pas, il se retire. FIFO : le pain garde SA date de livraison (et son « gardé une fois »,
    // sans nouveau sursis) et il est rangé par date : le plus ancien sort toujours en premier.
    // L'admin peut déplacer directement, ou demander à l'opérateur (requestMove) qui confirme sur place (doMove).
    moveLot(num, fromN, toN, lotId, qty) {
      return Store.update(s => {
        const m = M.machine(s, num); if (!m) return { err: "err_sel_missing" };
        const { lot } = findLot(m, fromN, lotId);
        return applyMove(s, m, fromN, toN, lot, qty, false);
      });
    },
    // Demande de déplacement (l'opérateur la voit sur la machine et la fait sur place)
    requestMove(num, fromN, toN, lotId, qty) {
      return Store.update(s => {
        const m = M.machine(s, num); if (!m) return { err: "err_sel_missing" };
        const { sel, lot } = findLot(m, fromN, lotId);
        const chk = checkMove(s, m, fromN, toN, lot, qty);
        if (chk.err) return chk;
        s.moves = s.moves || [];
        s.moves.push({ id: s.seq++, num: m.num, from: Number(fromN), to: Number(toN), date: lot.date, kept: !!lot.kept, type: sel.type, qty: chk.qty, at: s.now, by: M.who() });
        return { ok: true, qty: chk.qty };
      });
    },
    // L'opérateur confirme qu'il a fait le déplacement demandé
    doMove(reqId) {
      return Store.update(s => {
        const r = (s.moves || []).find(x => x.id === Number(reqId)); if (!r) return { err: "mv_err_gone" };
        const m = M.machine(s, r.num); if (!m) return { err: "err_sel_missing" };
        const from = M.sel(m, r.from);
        const lot = from && moveLotByDate(from, r.date, r.kept);
        const to = M.sel(m, r.to);
        if (lot && to && to.cap - M.qty(to) < 1) return { err: "mv_err_space" };
        const q = lot && to ? Math.min(r.qty, lot.qty, Math.max(0, to.cap - M.qty(to))) : 0;
        const res = applyMove(s, m, r.from, r.to, lot, q, true);
        if (!res.err) s.moves = s.moves.filter(x => x.id !== r.id);
        return res;
      });
    },
    cancelMove(reqId) {
      Store.update(s => { s.moves = (s.moves || []).filter(x => x.id !== Number(reqId)); });
    },

    // ---------- Alertes ----------
    TRASH_DAYS,
    archiveEvent(id, value) {
      Store.update(s => { const e = s.events.find(x => x.id === Number(id)); if (e) e.archived = !!value; });
    },
    // archive plusieurs alertes d'un coup (celles affichées) ; renvoie le nombre archivé
    archiveEvents(ids) {
      const want = new Set((ids || []).map(Number));
      return Store.update(s => { let n = 0; s.events.forEach(e => { if (want.has(e.id) && !e.archived) { e.archived = true; n++; } }); return n; });
    },
    // v5.30 : CORBEILLE. « Supprimer » = l'alerte disparaît partout (elle est aussi marquée archivée, donc cachée comme une archivée)
    // et reste 30 jours dans Alertes → Corbeille (e.deleted = date de suppression). Passé 30 jours, elle est effacée pour de bon.
    deleteEvents(ids) {
      const want = new Set((ids || []).map(Number));
      return Store.update(s => { let n = 0; s.events.forEach(e => { if (want.has(e.id) && !e.deleted) { e.deleted = s.now || Date.now(); e.archived = true; n++; } }); return n; });
    },
    // remet des alertes de la corbeille dans « Actives » / « Résolues » (comme avant leur suppression)
    restoreEvents(ids) {
      const want = new Set((ids || []).map(Number));
      return Store.update(s => { let n = 0; s.events.forEach(e => { if (want.has(e.id) && e.deleted) { e.deleted = null; e.archived = false; n++; } }); return n; });
    },
    // efface pour de bon des alertes qui sont dans la corbeille (jamais une alerte qui n'y est pas)
    purgeEvents(ids) {
      const want = new Set((ids || []).map(Number));
      return Store.update(s => { const n0 = s.events.length; s.events = s.events.filter(e => !(want.has(e.id) && e.deleted)); return n0 - s.events.length; });
    },
    // effacement final des alertes de la corbeille depuis plus de 30 jours (appelé à l'ouverture de l'appli puis toutes les 6 h) ; renvoie le nombre effacé
    purgeTrash() {
      const dueNow = (s, now) => s.events.some(e => e.deleted && now - e.deleted >= TRASH_MS);
      const cur = Store.get();
      if (!cur || !Array.isArray(cur.events) || !dueNow(cur, Date.now())) return 0;        // rien à faire : aucune écriture
      return Store.update(s => { const now = Date.now(), n0 = s.events.length; s.events = s.events.filter(e => !(e.deleted && now - e.deleted >= TRASH_MS)); return n0 - s.events.length; });
    },

    // ---------- Paramètres ----------
    saveSettings(values) {
      if (BA.Backup) BA.Backup.auto();            // sauvegarde automatique avant le changement (admin)
      Store.update(s => { Object.assign(s.settings, values); });
    },
    // Frais fixes mensuels par machine : map = { numéro: euros | null (null = valeur par défaut) }
    setFixedCosts(map) {
      Store.update(s => {
        s.machines.forEach(m => {
          if (!(String(m.num) in map)) return;
          const v = map[m.num];
          if (v == null) delete m.fixed; else m.fixed = Math.max(0, Math.round(Number(v) * 100) / 100);
        });
      });
    },
    // ---------- Sélections (admin et opérateur) ----------
    // Renvoie null si tout va bien, sinon la clé du message d'erreur.
    updateSelection(num, selN, values) {
      return Store.update(s => {
        const m = M.machine(s, num); const sel = m && M.sel(m, selN);
        if (!sel) return "err_sel_missing";
        // v5.33 : tout est contrôlé AVANT de changer quoi que ce soit : une valeur refusée ne laisse plus
        // la sélection à moitié modifiée (avant : numéro ou type déjà changé, puis « capacité refusée »)
        const n = values.n != null ? Number(values.n) : null;
        if (n != null) {
          if (!Number.isInteger(n) || n < 1 || n > 999) return "err_sel_number";
          if (n !== sel.n && M.sel(m, n)) return "err_sel_exists";
        }
        const c = values.cap != null ? Math.round(Number(values.cap)) : null;
        if (c != null) {
          if (!(c >= 1 && c <= 50)) return "err_cap";
          if (c < M.qty(sel)) return "err_cap_stock";
        }
        if (values.newType != null && values.newType !== "" && !String(values.newType).trim()) return "err_type";
        if (values.newType) { const id = M.ensureType(s, values.newType); if (!id) return "err_type"; sel.type = id; }
        else if (values.type) sel.type = values.type;
        if (n != null && n !== sel.n) {
          // (les déplacements demandés qui parlent de cette sélection suivent son nouveau numéro)
          (s.moves || []).forEach(r => { if (r.num === m.num) { if (r.from === sel.n) r.from = n; if (r.to === sel.n) r.to = n; } });
          sel.n = n;
          m.sels.sort((a, b) => a.n - b.n);
        }
        if (c != null) sel.cap = c;
        if (values.price != null && values.price !== "" && Number(values.price) >= 0 && isFinite(Number(values.price))) {
          const p0 = sel.price, p1 = Math.round(Number(values.price) * 100) / 100;
          sel.price = p1;
          // v5.11.1 : l'opérateur peut aussi changer le prix ; chaque changement est noté dans l'Historique (qui, quand, avant → après)
          if (p1 !== p0) M.log(s, { k: "price", n: m.num, s: sel.n, y: sel.type, p: p1, p0 });
          // v5.33.1 : un relevé plus ancien que ce changement ne remet pas l'ancien prix (voir BA.Reel, prix de la machine)
          if (p1 !== p0) sel.pt = s.now;
        }
        return null;
      });
    },
    addSelection(num, values) {
      return Store.update(s => {
        const m = M.machine(s, num); if (!m) return "err_sel_missing";
        const n = Number(values.n);
        if (!Number.isInteger(n) || n < 1 || n > 999) return "err_sel_number";
        if (M.sel(m, n)) return "err_sel_exists";
        const c = Math.round(Number(values.cap));
        if (!(c >= 1 && c <= 50)) return "err_cap";
        let type = values.type;
        if (type === "__new") { type = M.ensureType(s, values.newType); if (!type) return "err_type"; }
        if (!type) return "err_type";
        const price = values.price != null && values.price !== "" && Number(values.price) >= 0 && isFinite(Number(values.price)) ? Number(values.price) : s.settings.salePrice;
        m.sels.push({ n, type, cap: c, price: Math.round(price * 100) / 100, lots: [] });
        m.sels.sort((a, b) => a.n - b.n);
        M.addEvent(s, m.num, "SEL_EMPTY", { sel: n, type });
        M.log(s, { k: "seladd", n: m.num, s: n, y: type, c });
        return null;
      });
    },
    // Supprime une sélection, même s'il reste du pain dedans (la fenêtre de confirmation prévient avant) :
    // ce pain sort du stock et compte comme invendu (retour), comme le bouton « Retirer » d'un lot.
    removeSelection(num, selN) {
      return Store.update(s => {
        const m = M.machine(s, num); const sel = m && M.sel(m, selN);
        if (!sel) return "err_sel_missing";
        if (m.sels.length <= 1) return "err_sel_last";
        const q = M.qty(sel);
        if (q > 0) M.addDaily(s, s.now, m.num, { x: q });
        M.log(s, { k: "seldel", n: m.num, s: sel.n, y: sel.type, q: q || null, l: sel.lots.length ? sel.lots[0].date : null });
        m.sels = m.sels.filter(x => x !== sel);
        s.moves = (s.moves || []).filter(r => !(r.num === m.num && (r.from === sel.n || r.to === sel.n)));
        M.resolveEvents(s, m.num, "SEL_EMPTY", e => e.data.sel === sel.n);
        M.resolveEvents(s, m.num, "OLD_BREAD", e => e.data.sel === sel.n);
        return null;
      });
    },

    // ---------- Tests (admin) ----------
    simulatePower(num) {
      Store.update(s => {
        const m = M.machine(s, num); if (!m) return;
        m.power = true; m.powerUntil = s.now + 10 * M.MIN;
        M.addEvent(s, m.num, "POWER_CUT", {});
      });
    },
    simulateFas(num) {
      Store.update(s => { M.addEvent(s, Number(num), "FAS_45", { until: s.now + 45 * M.MIN }); });
    },
    simulateTemp(num) {
      Store.update(s => {
        const m = M.machine(s, num); if (!m) return;
        m.temp = +(s.settings.tempMax + 2.4).toFixed(1); m.tempUntil = s.now + 60 * M.MIN;
        M.addEvent(s, m.num, "TEMP_HIGH", { temp: m.temp });
      });
    },

    // ================= Prévisions & calendrier (admin) =================
    // Décision sur un jour : num = null → toutes les machines ; dec = null → effacer
    // dec = { st: "ok" (confirmé) | "mod" (modifié, pct) | "norm" (jour normal 100 %), pct, ref }
    setDayDecision(k, num, dec) {
      Store.update(s => {
        const all = s.dayDecisions || (s.dayDecisions = {});
        const d = all[k] || (all[k] = {});
        if (num == null) {
          if (dec) d.all = Object.assign({ at: s.now }, dec); else delete d.all;
          if (dec && dec.st !== "norm") confirmEntriesOn(s, k);   // le jour accepté confirme aussi ses dates du calendrier
        }
        else {
          d.m = d.m || {};
          if (dec) d.m[num] = Object.assign({ at: s.now }, dec); else delete d.m[num];
        }
        // on oublie les décisions de plus de 30 jours
        const old = BA.Forecast.addDays(M.dayKey(s.now), -30);
        Object.keys(all).forEach(x => { if (x < old) delete all[x]; });
      });
    },
    confirmDays(list) {   // list = [{ k, ref }] → « confirmé » pour toutes les machines
      Store.update(s => {
        const all = s.dayDecisions || (s.dayDecisions = {});
        list.forEach(x => { const d = all[x.k] || (all[x.k] = {}); d.all = { st: "ok", ref: x.ref, at: s.now }; confirmEntriesOn(s, x.k); });
      });
    },
    // Tendance d'une machine appliquée sur les jours prévus (décisions « modifié » pour cette machine)
    applyTrend(num, list) {   // list = [{ k, pct, ref }]
      Store.update(s => {
        const all = s.dayDecisions || (s.dayDecisions = {});
        list.forEach(x => {
          const d = all[x.k] || (all[x.k] = {});
          d.m = d.m || {};
          d.m[num] = { st: "mod", pct: x.pct, ref: x.ref, at: s.now, why: "trend" };
        });
      });
    },

    // v4.8.6 : « Utiliser l'an dernier » : décisions « modifié » par machine et par jour. list = [{ num, k, pct, ref }]
    // Renvoie les anciennes décisions (pour pouvoir annuler).
    applyLastYear(list) {
      let prev = [];
      Store.update(s => {
        prev = [];
        const all = s.dayDecisions || (s.dayDecisions = {});
        list.forEach(x => {
          const d = all[x.k] || (all[x.k] = {});
          d.m = d.m || {};
          prev.push({ k: x.k, num: x.num, old: d.m[x.num] ? JSON.parse(JSON.stringify(d.m[x.num])) : null });
          d.m[x.num] = { st: "mod", pct: x.pct, ref: x.ref, at: s.now, why: "ly" };
        });
      });
      return prev;
    },
    undoLastYear(prev) {
      Store.update(s => {
        const all = s.dayDecisions || (s.dayDecisions = {});
        (prev || []).forEach(x => {
          const d = all[x.k] || (all[x.k] = {});
          d.m = d.m || {};
          if (x.old) d.m[x.num] = x.old; else delete d.m[x.num];
        });
      });
    },

    // Renvoie null si tout va bien, sinon la clé du message d'erreur
    calendarAdd(v) {
      return Store.update(s => {
        const err = checkEntry(v);
        if (err) return err;
        const e = BA.Forecast.makeEntry({
          id: s.seq++, kind: v.kind, from: v.from, to: v.to || v.from, name: String(v.name).trim().slice(0, 60),
          scope: v.scope, machines: v.scope === "list" ? v.machines.map(Number) : [], effect: Math.round(Number(v.effect) || 0),
          confirmed: true, source: "user"
        });
        s.calendar.push(e);
        BA.Forecast.sortCal(s.calendar);
        return null;
      });
    },
    calendarUpdate(id, v) {
      return Store.update(s => {
        const e = s.calendar.find(x => x.id === Number(id));
        if (!e) return "err_cal_missing";
        // v5.33 : contrôles d'abord (une date refusée ne garde plus l'effet changé juste avant)
        const n = v.effect != null ? Number(v.effect) : null;
        if (n != null && (!isFinite(n) || n < -100 || n > 300)) return "err_cal_effect";
        const dates = v.from != null || v.to != null;
        const from = v.from || e.from, to = v.to || e.to;
        if (dates && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)) return "err_cal_dates";
        if (n != null) { e.effect = Math.round(n); e.perMachine = null; }
        if (dates) { e.from = from; e.to = to; BA.Forecast.sortCal(s.calendar); }
        if (v.confirmed != null) e.confirmed = !!v.confirmed;
        return null;
      });
    },
    calendarDelete(id) {
      Store.update(s => { s.calendar = s.calendar.filter(x => x.id !== Number(id)); });
    },
    // Effets appris sur l'historique de l'an dernier (suggestion de l'assistant)
    calendarLearn(id, fleet, per) {
      Store.update(s => {
        const e = s.calendar.find(x => x.id === Number(id));
        if (!e) return;
        e.effect = Math.max(-100, Math.min(300, Math.round(fleet)));
        e.perMachine = {};
        Object.keys(per || {}).forEach(n => { e.perMachine[n] = Math.max(-100, Math.min(300, Math.round(per[n]))); });
        e.confirmed = true; e.source = "learned";
      });
    },
    // Ajoute les jours fériés belges (et veilles de fête) d'une année, s'ils manquent
    addYearHolidays(y) {
      return Store.update(s => {
        let n = 0;
        BA.Forecast.holidayEntries(y).forEach(e => {
          if (s.calendar.some(x => x.key === e.key)) return;
          e.id = s.seq++; e.confirmed = false;
          s.calendar.push(e); n++;
        });
        BA.Forecast.sortCal(s.calendar);
        return n;
      });
    },
    // Profil manuel d'une machine (7 valeurs en %, dimanche → samedi), null = automatique
    setProfileManual(num, vals) {
      if (BA.Backup) BA.Backup.auto();            // sauvegarde automatique avant le changement (admin)
      Store.update(s => {
        s.profileManual = s.profileManual || {};
        if (s.profileTypes) delete s.profileTypes[num];
        s.profileManualAt = s.profileManualAt || {};
        if (vals) { s.profileManual[num] = vals.map(v => Math.max(0, Math.min(400, Math.round(Number(v) || 0)))); s.profileManualAt[num] = {}; for (let i = 0; i < 7; i++) s.profileManualAt[num][i] = s.now; }
        else { delete s.profileManual[num]; delete s.profileManualAt[num]; }
      });
    },
    // Un jour de semaine d'une machine réglé à la main, par type de pain : perType = { type: pains par jour }
    // Le total du jour devient le profil (en % d'une journée normale) ; la répartition par type sert à la commande.
    setProfileDay(num, wd, perType) {
      if (BA.Backup) BA.Backup.auto();            // sauvegarde automatique avant le changement (admin)
      Store.update(s => {
        const p = BA.Forecast.context(s).prof[num]; if (!p) return;
        const clean = {}; let total = 0;
        Object.keys(perType).forEach(ty => { const v = Math.max(0, Math.round((Number(perType[ty]) || 0) * 10) / 10); clean[ty] = v; total += v; });
        s.profileManual = s.profileManual || {};
        let man = s.profileManual[num];
        if (!man || man.length !== 7) man = s.profileManual[num] = [null, null, null, null, null, null, null];
        s.profileTypes = s.profileTypes || {};
        (s.profileTypes[num] = s.profileTypes[num] || {})[wd] = clean;
        s.profileManualAt = s.profileManualAt || {};
        (s.profileManualAt[num] = s.profileManualAt[num] || {})[wd] = s.now;
        const hist = p.samples && p.samples.some(a => a && a.length);
        if (p.base > 0 && (hist || !(s.profileBase || {})[num])) {
          man[wd] = Math.max(0, Math.min(400, Math.round(total / p.base * 100)));
        } else {
          // v5.11 : machine sans historique de ventes : la « journée normale » est la moyenne des jours réglés à la main
          // (en pains), et chaque jour réglé est recalculé par rapport à elle
          const tots = {};
          Object.keys(s.profileTypes[num]).forEach(d => { if (man[d] != null || Number(d) === wd) tots[d] = Object.values(s.profileTypes[num][d]).reduce((a, v) => a + (Number(v) || 0), 0); });
          const list = Object.values(tots).filter(v => v > 0);
          const base = list.length ? list.reduce((a, v) => a + v, 0) / list.length : 0;
          s.profileBase = s.profileBase || {};
          if (base > 0) s.profileBase[num] = Math.round(base * 10) / 10; else delete s.profileBase[num];
          Object.keys(tots).forEach(d => { man[d] = base > 0 ? Math.max(0, Math.min(400, Math.round(tots[d] / base * 100))) : 0; });
        }
      });
    },
    // Remet un jour de semaine d'une machine en automatique
    resetProfileDay(num, wd) {
      if (BA.Backup) BA.Backup.auto();            // sauvegarde automatique avant le changement (admin)
      Store.update(s => {
        const man = (s.profileManual || {})[num];
        if (man) { man[wd] = null; if (!man.some(v => v != null)) delete s.profileManual[num]; }
        if ((s.profileManualAt || {})[num]) delete s.profileManualAt[num][wd];
        const pt = (s.profileTypes || {})[num];
        if (pt) { delete pt[wd]; if (!Object.keys(pt).length) delete s.profileTypes[num]; }
        if (s.profileBase && !((s.profileManual || {})[num])) delete s.profileBase[num];
      });
    },
    saveForecastSettings(values) {
      if (BA.Backup) BA.Backup.auto();            // sauvegarde automatique avant le changement (admin)
      Store.update(s => { s.settings.forecast = Object.assign({}, BA_CONFIG.defaults.forecast, s.settings.forecast || {}, values); });
    },

    // ---------- Commande : envoyer le plan à l'opérateur ----------
    createMissions(plan, opts) {
      return Store.update(s => {
        // les anciennes missions encore ouvertes sont remplacées
        s.missions.forEach(x => { if (x.status === "open") x.status = "replaced"; });
        const created = s.now;
        plan.perMachine.forEach(pm => {
          if (pm.load === 0 && pm.remove === 0) return;
          s.missions.push({
            id: s.seq++, num: pm.num, created, status: "open",
            removeBefore: opts.withRemoval ? plan.removeBefore : null,
            passageAt: plan.passage, remove: pm.remove, mandatory: pm.mandatory || 0, load: pm.load,
            // charge conseillée par sélection (plus petite que « remplir à fond » si l'admin l'a choisi)
            reduced: !!pm.adjusted, lines: pm.lines.map(l => ({ sel: l.sel, full: l.full, load: l.load }))
          });
        });
        s.orders.unshift({ id: s.seq++, t: created, withRemoval: !!opts.withRemoval, removeBefore: plan.removeBefore || null, passageAt: plan.passage,
          marginPct: opts.marginPct || 0, perType: plan.perType.map(t => ({ type: t.type, qty: t.orderWithMargin })) });
        if (s.orders.length > 30) s.orders.length = 30;
        if (s.missions.length > 400) s.missions = s.missions.slice(-400);
        return s.missions.filter(x => x.status === "open").length;
      });
    },

    // ================= Processus opérateur « Remplir » =================
    startIntervention(num) {
      return Store.update(s => {
        const m = M.machine(s, num); if (!m) return null;
        let it = s.interventions.find(x => x.num === m.num && x.status === "open");
        if (!it) {
          const a = appareil();
          it = { id: s.seq++, num: m.num, start: s.now, end: null, status: "open", inv: [], rem: [], load: [], delivery: null, step: 1,
            by: { u: (BA.DB && BA.DB.email) || null, d: a.id, t: a.type } };     // v5.34.4 : qui l'a commencé, sur quel appareil
          s.interventions.unshift(it);
          if (s.interventions.length > 300) s.interventions.length = 300;
        }
        it.seen = s.now;         // v5.34.4 : dernière activité (la règle « oublié depuis 1 h » compte à partir d'ici)
        m.door = true;
        M.addEvent(s, m.num, "DOOR_OPEN", {});
        return it.id;
      });
    },

    // Étape 1 : inventaire. counts = { sélection: quantité comptée }
    applyInventory(itId, counts, skipped) {
      return Store.update(s => {
        const it = itOpen(s, itId, 1); if (!it) return false;
        const m = M.machine(s, it.num); if (!m) return false;
        let lost = 0, gained = 0;
        const und = [];            // v5.34.4 : ce qu'il faut défaire pour revenir en arrière (par écarts, voir undoInventory)
        it.inv = m.sels.map(sel => {
          const exp = M.qty(sel);
          // v5.33 : une valeur qui n'est pas un nombre (vide, texte…) = « pas compté » (avant : NaN enregistré)
          const c = counts && counts[sel.n] != null && counts[sel.n] !== "" ? Number(counts[sel.n]) : NaN;
          const real = skipped || !isFinite(c) ? exp : Math.max(0, Math.min(sel.cap, Math.round(c)));
          const diff = real - exp;
          if (diff < 0) {
            M.sortLots(sel); const l0 = sel.lots[0];
            const take = []; let left = -diff;           // les pains qui sortent (les plus anciens), gardés pour pouvoir les remettre
            for (const l of sel.lots) { if (left <= 0) break; const k = Math.min(l.qty, left); if (k > 0) { take.push({ lot: Object.assign({}, l), k }); left -= k; } }
            M.takeOldest(sel, -diff); lost += -diff; und.push({ s: sel.n, take });
            M.log(s, { k: "inv", n: m.num, s: sel.n, y: sel.type, q: diff, l: l0 ? l0.date : null, it: it.id, st: 1 });
          }
          if (diff > 0) {
            M.sortLots(sel);
            const last = sel.lots[sel.lots.length - 1];
            if (last) { last.qty += diff; und.push({ s: sel.n, add: diff, id: last.id, d: last.date }); }
            else { const nl = { id: s.seq++, qty: diff, date: s.now, kept: false, estimated: true }; sel.lots.push(nl); und.push({ s: sel.n, add: diff, id: nl.id, d: nl.date }); }
            gained += diff;
            M.log(s, { k: "inv", n: m.num, s: sel.n, y: sel.type, q: diff, l: last ? last.date : s.now, it: it.id, st: 1 });
          }
          return { sel: sel.n, type: sel.type, exp, real };
        });
        it.invSkipped = !!skipped;
        it.u1 = und;
        if (!skipped) {
          const unk = s.events.find(e => e.num === m.num && e.code === "STOCK_UNKNOWN" && !e.resolved);
          if (unk) { it.unk = (unk.data && unk.data.sels) || []; M.resolveEvents(s, m.num, "STOCK_UNKNOWN"); }
        }
        it.invAt = s.now;           // v5.33 : heure de l'inventaire (relevé 4G pris avant, traité après : déjà compté, voir reel.js)
        if (lost || gained) M.addEvent(s, m.num, "STOCK_GAP", { lost, gained, key: "i" + it.id });
        it.step = 2;
        return true;
      });
    },

    // Étape 2 : retrait. rows = [{ sel, lotId, planned, removed, keep }] ; mode : "all" | "none" | "edit"
    // Règle « gardé une seule fois » : un pain gardé une fois et devenu invalide (commande suivante passée)
    // est retiré dans tous les cas ; un pain trop vieux qui reste dans la machine est « gardé une fois »
    // (invalide au jour suivant). Un pain déjà gardé pendant cette tournée (annuler puis relancer
    // « Remplir ») n'est pas encore obligatoire : s'il reste, il garde sa date « gardé le » (pas de nouveau sursis).
    applyRemoval(itId, rows, mode) {
      return Store.update(s => {
        const it = itOpen(s, itId, 2); if (!it) return false;
        const m = M.machine(s, it.num); if (!m) return false;
        let total = 0;
        const und = [];            // v5.34.4 : pour défaire par écarts (voir undoRemoval)
        it.rem = rows.map(r => {
          const { sel, lot, i } = findLot(m, r.sel, r.lotId);
          if (!lot) return { sel: r.sel, lotDate: r.date, planned: r.planned, removed: 0, kept: false };
          const before = Object.assign({}, lot);
          const mand = M.isMandatory(s, lot);
          const want = Number(r.removed);       // v5.33 : pas un nombre → rien retiré (avant : stock NaN)
          const removed = mand ? lot.qty : mode === "none" || !isFinite(want) ? 0 : Math.max(0, Math.min(lot.qty, Math.round(want)));
          const lotDate = lot.date;
          lot.qty -= removed; total += removed;
          if (removed) M.log(s, { k: "rm", n: m.num, s: sel.n, y: sel.type, q: removed, l: lotDate, r: mand ? "kept2" : "old", it: it.id, st: 2 });
          let kept = false;
          if (lot.qty <= 0) sel.lots.splice(i, 1);
          else {
            kept = true;
            if (!lot.kept) {
              lot.kept = true; lot.keptAt = s.now;
              M.log(s, { k: "keep", n: m.num, s: sel.n, y: sel.type, q: lot.qty, l: lotDate, it: it.id, st: 2 });
            }
          }
          und.push({ s: sel.n, lot: before, removed });
          return { sel: r.sel, type: sel.type, lotDate, planned: r.planned, removed, kept, mandatory: mand };
        });
        it.remMode = mode;
        it.u2 = und;
        if (total) M.addDaily(s, s.now, m.num, { x: total });
        it.remTotal = total; it.remAt = s.now;
        it.step = 3;
        return true;
      });
    },

    // Étape 3 : chargement. loads = { sélection: quantité } (une seule date : deliveryMs)
    // ou { sélection: [ { qty, date }, ... ] } (plusieurs dates de livraison pour une même sélection)
    applyLoad(itId, loads, deliveryMs) {
      return Store.update(s => {
        const it = itOpen(s, itId, 3); if (!it) return false;
        const m = M.machine(s, it.num); if (!m) return false;
        const P = s.settings.purchase;
        let n = 0, cost = 0;
        const dates = [];
        it.load = m.sels.map(sel => {
          const before = M.qty(sel);
          let parts = loads ? loads[sel.n] : 0;
          if (!Array.isArray(parts)) parts = [{ qty: parts || 0, date: deliveryMs }];
          let room = sel.cap - before, q = 0;
          parts.forEach(p => {
            if (!p) return;
            const v = Number(p.qty);       // v5.33 : pas un nombre → 0 (avant : lot de NaN pains)
            const k = isFinite(v) ? Math.max(0, Math.min(room, Math.round(v))) : 0;
            if (k <= 0) return;
            const d = isFinite(p.date) ? p.date : isFinite(deliveryMs) ? deliveryMs : s.now;
            sel.lots.push({ id: s.seq++, qty: k, date: d, kept: false });
            M.log(s, { k: "load", n: m.num, s: sel.n, y: sel.type, q: k, l: d, it: it.id, st: 3 });
            room -= k; q += k; dates.push(d);
          });
          if (q > 0) { M.sortLots(sel); n += q; cost += q * (P[sel.type] || 0); }
          return { sel: sel.n, type: sel.type, cap: sel.cap, before, qty: q };
        });
        if (n) M.addDaily(s, s.now, m.num, { l: n, c: Math.round(cost * 100) / 100 });
        it.delivery = dates.length ? Math.min.apply(null, dates) : isFinite(deliveryMs) ? deliveryMs : null;
        it.deliveries = dates.filter((d, i) => dates.indexOf(d) === i).sort((a, b) => a - b);
        it.end = s.now; it.status = "done"; it.step = 4;
        m.door = false;
        M.resolveEvents(s, m.num, "DOOR_OPEN");
        s.missions.forEach(x => { if (x.num === m.num && x.status === "open") { x.status = "done"; x.doneAt = s.now; } });
        delete it.u1; delete it.u2; delete it.unk;     // terminé : plus besoin de quoi défaire
        return true;
      });
    },

    // Retour arrière : annule l'étape déjà validée (stock remis par écarts) pour la refaire
    undoToStep(itId, toStep) {
      return Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it || it.status !== "open") return false;
        const m = M.machine(s, it.num); if (!m) return false;
        // (les mouvements de l'étape annulée sont retirés de l'historique : ils n'ont pas eu lieu)
        while (it.step > toStep && it.step > 1) {
          const ok = it.step === 3 ? undoRemoval(s, m, it) : it.step === 2 ? undoInventory(s, m, it) : false;
          if (!ok) return false;
        }
        it.seen = s.now;
        return true;
      });
    },

    // « Annuler » : tout ce qui a été validé dans ce Remplir est défait (par écarts : les ventes arrivées entre-temps restent).
    // S'il n'y a pas de quoi défaire (Remplir d'une ancienne version), les étapes validées restent (« partiel »).
    cancelIntervention(itId) {
      return Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it) return false;
        const m = M.machine(s, it.num);
        if (it.status === "open") {
          while (m && it.step > 1) {
            const ok = it.step === 3 ? undoRemoval(s, m, it) : it.step === 2 ? undoInventory(s, m, it) : false;
            if (!ok) break;
          }
          it.status = it.step > 1 ? "partial" : "cancelled"; it.end = s.now;
        }
        if (m) { m.door = false; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
        return true;
      });
    }
  };

  // v5.25 : chaque action garde son nom et ses valeurs avec la modification qu'elle fait. Si l'appli est fermée avant
  // que le réseau revienne, l'action est refaite au démarrage suivant (store-reel.js), même si un autre appareil a écrit.
  Object.keys(BA.Actions).forEach(name => {
    const f = BA.Actions[name];
    if (typeof f !== "function") return;
    BA.Actions[name] = function () {
      const args = Array.prototype.slice.call(arguments);
      return Store.track ? Store.track(name, args, () => f.apply(BA.Actions, args)) : f.apply(BA.Actions, args);
    };
  });
})();
