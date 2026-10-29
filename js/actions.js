// ============================================================
// BROODAUTOMATE TEST — Actions (BA.Actions)
// Toutes les modifications passent par ici, pour l'admin
// comme pour l'opérateur (une seule « base » partagée).
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, Store = BA.Store;

  function findLot(m, selN, lotId) {
    const sel = M.sel(m, selN);
    if (!sel) return {};
    const i = sel.lots.findIndex(l => l.id === Number(lotId));
    return { sel, lot: i >= 0 ? sel.lots[i] : null, i };
  }

  // Copie / restauration des lots d'une machine (retour arrière dans « Remplir »)
  function snapLots(m) {
    const o = {};
    m.sels.forEach(sel => { o[sel.n] = JSON.parse(JSON.stringify(sel.lots)); });
    return o;
  }
  function restoreLots(m, snap) {
    if (!snap) return;
    m.sels.forEach(sel => { if (snap[sel.n]) sel.lots = JSON.parse(JSON.stringify(snap[sel.n])); });
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

    // ---------- Alertes ----------
    archiveEvent(id, value) {
      Store.update(s => { const e = s.events.find(x => x.id === Number(id)); if (e) e.archived = !!value; });
    },
    // archive plusieurs alertes d'un coup (celles affichées) ; renvoie le nombre archivé
    archiveEvents(ids) {
      const want = new Set((ids || []).map(Number));
      return Store.update(s => { let n = 0; s.events.forEach(e => { if (want.has(e.id) && !e.archived) { e.archived = true; n++; } }); return n; });
    },

    // ---------- Paramètres ----------
    saveSettings(values) {
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
        if (values.n != null) {
          const n = Number(values.n);
          if (!Number.isInteger(n) || n < 1 || n > 999) return "err_sel_number";
          if (n !== sel.n && M.sel(m, n)) return "err_sel_exists";
          sel.n = n;
          m.sels.sort((a, b) => a.n - b.n);
        }
        if (values.newType) { const id = M.ensureType(s, values.newType); if (!id) return "err_type"; sel.type = id; }
        else if (values.type) sel.type = values.type;
        if (values.cap != null) {
          const c = Math.round(Number(values.cap));
          if (!(c >= 1 && c <= 50)) return "err_cap";
          if (c < M.qty(sel)) return "err_cap_stock";
          sel.cap = c;
        }
        if (values.price != null && Number(values.price) >= 0) sel.price = Math.round(Number(values.price) * 100) / 100;
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
        const price = values.price != null && values.price !== "" && Number(values.price) >= 0 ? Number(values.price) : s.settings.salePrice;
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
        if (v.effect != null) {
          const n = Number(v.effect);
          if (!isFinite(n) || n < -100 || n > 300) return "err_cal_effect";
          e.effect = Math.round(n); e.perMachine = null;
        }
        if (v.from != null || v.to != null) {
          const from = v.from || e.from, to = v.to || e.to;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return "err_cal_dates";
          e.from = from; e.to = to;
          BA.Forecast.sortCal(s.calendar);
        }
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
      Store.update(s => {
        const p = BA.Forecast.context(s).prof[num]; if (!p) return;
        const clean = {}; let total = 0;
        Object.keys(perType).forEach(ty => { const v = Math.max(0, Math.round((Number(perType[ty]) || 0) * 10) / 10); clean[ty] = v; total += v; });
        s.profileManual = s.profileManual || {};
        let man = s.profileManual[num];
        if (!man || man.length !== 7) man = s.profileManual[num] = [null, null, null, null, null, null, null];
        man[wd] = p.base > 0 ? Math.max(0, Math.min(400, Math.round(total / p.base * 100))) : 0;
        s.profileTypes = s.profileTypes || {};
        (s.profileTypes[num] = s.profileTypes[num] || {})[wd] = clean;
        s.profileManualAt = s.profileManualAt || {};
        (s.profileManualAt[num] = s.profileManualAt[num] || {})[wd] = s.now;
      });
    },
    // Remet un jour de semaine d'une machine en automatique
    resetProfileDay(num, wd) {
      Store.update(s => {
        const man = (s.profileManual || {})[num];
        if (man) { man[wd] = null; if (!man.some(v => v != null)) delete s.profileManual[num]; }
        if ((s.profileManualAt || {})[num]) delete s.profileManualAt[num][wd];
        const pt = (s.profileTypes || {})[num];
        if (pt) { delete pt[wd]; if (!Object.keys(pt).length) delete s.profileTypes[num]; }
      });
    },
    saveForecastSettings(values) {
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
          it = { id: s.seq++, num: m.num, start: s.now, end: null, status: "open", inv: [], rem: [], load: [], delivery: null, step: 1 };
          s.interventions.unshift(it);
          if (s.interventions.length > 300) s.interventions.length = 300;
        }
        m.door = true;
        M.addEvent(s, m.num, "DOOR_OPEN", {});
        return it.id;
      });
    },

    // Étape 1 : inventaire. counts = { sélection: quantité comptée }
    applyInventory(itId, counts, skipped) {
      Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it) return;
        const m = M.machine(s, it.num);
        let lost = 0, gained = 0;
        (it.snaps = it.snaps || {})[1] = snapLots(m);   // pour pouvoir revenir en arrière
        it.inv = m.sels.map(sel => {
          const exp = M.qty(sel);
          const real = skipped || counts[sel.n] == null ? exp : Math.max(0, Math.min(sel.cap, Math.round(counts[sel.n])));
          const diff = real - exp;
          if (diff < 0) { M.sortLots(sel); const l0 = sel.lots[0]; M.takeOldest(sel, -diff); lost += -diff; M.log(s, { k: "inv", n: m.num, s: sel.n, y: sel.type, q: diff, l: l0 ? l0.date : null, it: it.id, st: 1 }); }
          if (diff > 0) {
            M.sortLots(sel);
            const last = sel.lots[sel.lots.length - 1];
            if (last) last.qty += diff;
            else sel.lots.push({ id: s.seq++, qty: diff, date: s.now, kept: false, estimated: true });
            gained += diff;
            M.log(s, { k: "inv", n: m.num, s: sel.n, y: sel.type, q: diff, l: last ? last.date : s.now, it: it.id, st: 1 });
          }
          return { sel: sel.n, type: sel.type, exp, real };
        });
        it.invSkipped = !!skipped;
        if (lost || gained) M.addEvent(s, m.num, "STOCK_GAP", { lost, gained, key: "i" + it.id });
        it.step = 2;
      });
    },

    // Étape 2 : retrait. rows = [{ sel, lotId, planned, removed, keep }] ; mode : "all" | "none" | "edit"
    // Règle « gardé une seule fois » : un pain gardé une fois et devenu invalide (commande suivante passée)
    // est retiré dans tous les cas ; un pain trop vieux qui reste dans la machine est « gardé une fois »
    // (invalide au jour suivant). Un pain déjà gardé pendant cette tournée (annuler puis relancer
    // « Remplir ») n'est pas encore obligatoire : s'il reste, il garde sa date « gardé le » (pas de nouveau sursis).
    applyRemoval(itId, rows, mode) {
      Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it) return;
        const m = M.machine(s, it.num);
        let total = 0;
        (it.snaps = it.snaps || {})[2] = snapLots(m);
        it.rem = rows.map(r => {
          const { sel, lot, i } = findLot(m, r.sel, r.lotId);
          if (!lot) return { sel: r.sel, lotDate: r.date, planned: r.planned, removed: 0, kept: false };
          const mand = M.isMandatory(s, lot);
          const removed = mand ? lot.qty : mode === "none" ? 0 : Math.max(0, Math.min(lot.qty, Math.round(r.removed)));
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
          return { sel: r.sel, type: sel.type, lotDate, planned: r.planned, removed, kept, mandatory: mand };
        });
        it.remMode = mode;
        if (total) M.addDaily(s, s.now, m.num, { x: total });
        it.remTotal = total; it.remAt = s.now;
        it.step = 3;
      });
    },

    // Étape 3 : chargement. loads = { sélection: quantité } (une seule date : deliveryMs)
    // ou { sélection: [ { qty, date }, ... ] } (plusieurs dates de livraison pour une même sélection)
    applyLoad(itId, loads, deliveryMs) {
      Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it) return;
        const m = M.machine(s, it.num);
        const P = s.settings.purchase;
        let n = 0, cost = 0;
        const dates = [];
        it.load = m.sels.map(sel => {
          const before = M.qty(sel);
          let parts = loads[sel.n];
          if (!Array.isArray(parts)) parts = [{ qty: parts || 0, date: deliveryMs }];
          let room = sel.cap - before, q = 0;
          parts.forEach(p => {
            const k = Math.max(0, Math.min(room, Math.round(p.qty || 0)));
            if (k <= 0) return;
            const d = isFinite(p.date) ? p.date : deliveryMs;
            sel.lots.push({ id: s.seq++, qty: k, date: d, kept: false });
            M.log(s, { k: "load", n: m.num, s: sel.n, y: sel.type, q: k, l: d, it: it.id, st: 3 });
            room -= k; q += k; dates.push(d);
          });
          if (q > 0) { M.sortLots(sel); n += q; cost += q * (P[sel.type] || 0); }
          return { sel: sel.n, type: sel.type, cap: sel.cap, before, qty: q };
        });
        if (n) M.addDaily(s, s.now, m.num, { l: n, c: Math.round(cost * 100) / 100 });
        it.delivery = dates.length ? Math.min.apply(null, dates) : deliveryMs;
        it.deliveries = dates.filter((d, i) => dates.indexOf(d) === i).sort((a, b) => a - b);
        it.end = s.now; it.status = "done"; it.step = 4;
        m.door = false;
        M.resolveEvents(s, m.num, "DOOR_OPEN");
        s.missions.forEach(x => { if (x.num === m.num && x.status === "open") { x.status = "done"; x.doneAt = s.now; } });
      });
    },

    // Retour arrière : annule l'étape déjà validée (stock remis comme avant) pour la refaire
    undoToStep(itId, toStep) {
      Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it || it.status !== "open") return;
        const m = M.machine(s, it.num);
        while (it.step > toStep && it.step > 1) {
          // (les mouvements de l'étape annulée sont retirés de l'historique : ils n'ont pas eu lieu)
          if (it.step === 3) {
            restoreLots(m, it.snaps && it.snaps[2]);
            if (it.remTotal) M.addDaily(s, it.remAt || s.now, m.num, { x: -it.remTotal });
            s.journal = (s.journal || []).filter(e => !(e.it === it.id && e.st === 2));
            it.rem = []; it.remMode = null; it.remTotal = 0; it.step = 2;
          } else if (it.step === 2) {
            restoreLots(m, it.snaps && it.snaps[1]);
            s.events = s.events.filter(e => !(e.num === m.num && e.code === "STOCK_GAP" && e.key === "i" + it.id));
            s.journal = (s.journal || []).filter(e => !(e.it === it.id && e.st === 1));
            it.inv = []; it.invSkipped = false; it.step = 1;
          }
        }
      });
    },

    cancelIntervention(itId) {
      Store.update(s => {
        const it = s.interventions.find(x => x.id === itId); if (!it) return;
        if (it.status === "open") { it.status = it.step > 1 ? "partial" : "cancelled"; it.end = s.now; }
        const m = M.machine(s, it.num);
        if (m) { m.door = false; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
      });
    }
  };
})();
