// ============================================================
// BROODAUTOMATE v5 — Vraies machines (BA.Reel, BA.Live)
// Remplace le simulateur de la version test :
// - BA.Reel : ce qu'un relevé de la machine (câble RS232 ou clé USB)
//   change dans les données : ventes (le pain le plus ancien sort en
//   premier), porte, température, coupures de courant, erreurs FAS et
//   événements EVA-DTS (titre + explication du catalogue des alertes) ;
//   ajouter / modifier / supprimer une machine.
// - BA.Live : l'heure réelle (l'écran se met à jour toutes les 30 s),
//   « en ligne » / « hors ligne », et l'entretien des alertes
//   (vieux pain, sélections vides, alertes réglées).
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG, M = BA.Model;
  const H = M.H, MIN = M.MIN, DAY = M.DAY;

  // ---------------- Nouvelles alertes (en plus de celles de la version test) ----------------
  Object.assign(M.EVENTS, {
    MACHINE_EVENT: { cat: "tech",  level: "warn" },   // événement EVA-DTS (catalogue des alertes)
    FAS_ERROR:     { cat: "tech",  level: "err"  },   // erreur FAS (MA5*ERROR) avec la solution du manuel
    POWER_LOG:     { cat: "power", level: "warn" },   // coupure de courant enregistrée par la machine (MA5 POW OFF / ON)
    READ_FIRST:    { cat: "tech",  level: "info" },   // premier relevé d'une machine (point de départ)
    COUNTERS_DOWN: { cat: "tech",  level: "warn" },   // compteurs plus bas qu'au relevé précédent
    READ_FAIL:     { cat: "tech",  level: "warn" },   // lecture par câble impossible
    READ_BAD:      { cat: "tech",  level: "warn" },   // relevé abîmé (contrôle G85 faux)
    SEL_UNKNOWN:   { cat: "stock", level: "warn" }    // vente sur une sélection absente de Produits / Stock
  });

  const DOOR_OPEN_CODE = "EGS", DOOR_CLOSED_CODE = "EGT";
  const ERR_H = () => Math.max(1, Number(C.machineErrorHours) || 6) * H;

  // Ajoute des heures (machine vide « e », coupure « o ») aux jours concernés : servent à écarter les jours
  // anormaux des prévisions, comme dans la version test
  function addSpan(s, num, from, to, field) {
    if (!(to > from)) return;
    let a = from;
    for (let g = 0; a < to && g < 400; g++) {
      const d = new Date(a); d.setHours(24, 0, 0, 0);
      const b = Math.min(to, d.getTime());
      const k = M.dayKey(a), day = s.daily[k] || (s.daily[k] = {});
      const r = day[num] || (day[num] = { s: 0, r: 0, l: 0, x: 0, c: 0 });
      r[field] = Math.round(((r[field] || 0) + (b - a) / H) * 100) / 100;
      a = b;
    }
  }

  // « 220325 » + « 1404 » (horloge de la machine) → millisecondes (heure locale), ou null
  function machineMs(date, time) {
    const k = BA.EvaDts.cleDate(date, time);
    if (!k) return null;
    const ms = new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10) || 0, +k.slice(10, 12) || 0).getTime();
    return isFinite(ms) ? ms : null;
  }
  const when = (date, time) => BA.EvaDts.formatDate(date, time) || "";

  // Répartit un montant en n prix (au centime), comme la v3
  function spread(n, total) {
    const cents = Math.round(total * 100), b = Math.floor(cents / n);
    let rest = cents - b * n;
    const out = [];
    for (let i = 0; i < n; i++) { out.push((b + (rest > 0 ? 1 : 0)) / 100); if (rest > 0) rest--; }
    return out;
  }

  // ---------------- Alertes d'un relevé ----------------
  // Chaque événement de la machine va dans les Alertes avec son titre et son explication (catalogue des alertes).
  // Simple information (gravité « i ») et journal repris au premier relevé (hist) : affichés comme réglés
  // (onglets « Résolues » / « Toutes » des Alertes).
  function machineEvent(s, m, e, hist) {
    if (e.code === DOOR_OPEN_CODE || e.code === DOOR_CLOSED_CODE) return;          // la porte a son propre suivi (alerte « Porte ouverte »)
    const d = BA.Alertes.decrire(e.code);
    const info = d.gravite === "i" || !!hist;
    const ev = M.addEvent(s, m.num, "MACHINE_EVENT", {
      code: e.code, title: d.titre, expl: d.expl, gr: d.gravite, active: e.active, count: e.nouveaux || e.count || 1,
      when: when(e.date, e.time), until: e.active === true ? null : s.now + ERR_H(),
      key: "m" + e.code + "|" + (e.date || "") + "|" + (e.time || "")
    });
    ev.level = info ? "info" : d.gravite === "p" && e.active !== false ? "err" : "warn";
    if ((info || e.active === false) && !ev.resolved) { ev.resolved = true; ev.resolvedAt = s.now; }
  }
  function fasEvent(s, m, e, hist) {
    const d = BA.Alertes.fas(e.code, e.sous);
    const ev = M.addEvent(s, m.num, "FAS_ERROR", {
      code: e.code, sous: e.sous || "", title: d.titre, expl: d.expl, sol: (d.solution || []).join(" "), count: e.nouveaux || e.count || 1,
      when: when(e.date, e.time), until: s.now + ERR_H(),
      key: "f" + e.code + "/" + (e.sous || "") + "|" + (e.date || "") + "|" + (e.time || "")
    });
    if (hist && !ev.resolved) { ev.level = "info"; ev.resolved = true; ev.resolvedAt = s.now; }
  }
  function powerEvent(s, m, p, hist) {
    const [d1, h1] = String(p.off || "").split(" "), [d2, h2] = String(p.on || "").split(" ");
    const ev = M.addEvent(s, m.num, "POWER_LOG", { off: when(d1, h1) || "?", on: when(d2, h2) || "?", key: "p" + (p.off || "") + "|" + (p.on || "") });
    if (!ev.resolved) { ev.resolved = true; ev.resolvedAt = s.now; }
    const a = machineMs(d1, h1), b = machineMs(d2, h2);
    if (!hist && a && b && b > a && b - a < 7 * DAY) addSpan(s, m.num, a, b, "o");
  }
  // Mêmes événements (même code, même date et heure) regroupés : « ×2 »
  function grouper(list, key) {
    const o = new Map();
    list.forEach(e => {
      const k = key(e), x = o.get(k), n = e.nouveaux || Math.max(1, Number(e.count) || 1);
      if (x) x.nouveaux += n; else o.set(k, Object.assign({}, e, { nouveaux: n }));
    });
    return [...o.values()];
  }
  function tempEvent(s, m, c, w) {
    const st = s.settings;
    if (c > st.tempMax) M.addEvent(s, m.num, "TEMP_HIGH", { temp: c, when: w });
    else if (c < st.tempMin) M.addEvent(s, m.num, "TEMP_LOW", { temp: c, when: w });
  }
  // Porte : état EVA-DTS « EGS » (porte ouverte) actif ou non
  function doorState(s, m, events) {
    const e = (events || []).filter(x => x.code === DOOR_OPEN_CODE && x.active != null).pop();
    if (!e) return;
    const busy = s.interventions.some(x => x.num === m.num && x.status === "open");
    if (e.active && !m.door) { m.door = true; M.addEvent(s, m.num, "DOOR_OPEN", {}); }
    else if (!e.active && m.door && !busy) { m.door = false; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
  }
  // Événements terminés d'après la machine
  function closeFinished(s, m, events) {
    (events || []).forEach(e => {
      if (e.active === false) M.resolveEvents(s, m.num, "MACHINE_EVENT", x => x.data.code === e.code);
    });
  }
  // src : "usb" (clé USB : la machine n'est pas pour autant reliée) ou "rs232"
  function seen(s, m, t, src) {
    if (src !== "usb") m.link = true;
    m.lastSeen = Math.max(m.lastSeen || 0, t);
    M.resolveEvents(s, m.num, "READ_FAIL");
    M.resolveEvents(s, m.num, "READ_BAD");
  }

  const Reel = {
    machineMs, addSpan,

    // ---------- Relevé avec compteurs (VA1…) ----------
    // x = { t, analyse (sans le texte brut), audit, ancien, diff, nv } : données figées → refaites à l'identique si besoin
    // Renvoie { message, ventes }
    applyAudit(s, num, x) {
      const m = M.machine(s, num); if (!m) return { message: "machine introuvable", ventes: 0 };
      const { diff, nv, audit, analyse } = x;
      seen(s, m, x.t, x.src);
      // température : la plus récente
      const temps = (audit.errors || []).filter(e => e.type === "temp")
        .sort((a, b) => BA.EvaDts.cleDate(b.date, b.time).localeCompare(BA.EvaDts.cleDate(a.date, a.time)));
      if (temps[0]) m.temp = Number(temps[0].c);
      if (x.src !== "usb") doorState(s, m, analyse.events);     // clé USB : fichier exporté porte ouverte, importé plus tard
      closeFinished(s, m, analyse.events);

      let ventes = 0, valeur = 0;
      const appliquer = !diff.baseline && !diff.anomalies && !diff.identique;
      if (diff.baseline) {
        const ev = M.addEvent(s, m.num, "READ_FIRST", { total: audit.total_count, key: "b" + x.t });
        ev.resolved = true; ev.resolvedAt = s.now;
        if (temps[0]) tempEvent(s, m, Number(temps[0].c), when(temps[0].date, temps[0].time));
        // journal de la machine au premier relevé (erreurs, coupures) : repris dans les Alertes comme historique (réglé),
        // avec titre et explication ; seuls les événements suivants deviennent des alertes actives
        grouper(nv.eva, e => e.code + "|" + e.date + "|" + e.time).forEach(e => machineEvent(s, m, e, true));
        grouper(nv.fas, e => e.code + "/" + e.sous + "|" + e.date + "|" + e.time).forEach(e => fasEvent(s, m, e, true));
        nv.pow.forEach(p => powerEvent(s, m, p, true));
      } else if (diff.anomalies) {
        const ev = M.addEvent(s, m.num, "COUNTERS_DOWN", { a: x.ancien ? x.ancien.total_count : "?", b: audit.total_count, key: "d" + x.t });
        ev.resolved = true; ev.resolvedAt = s.now;
      }
      if (appliquer) {
        // ventes depuis le relevé précédent, sélection par sélection (compteurs cumulés)
        const moyen = diff.deltaCount > 0 && diff.deltaValue > 0 ? diff.deltaValue / diff.deltaCount : 0;
        const sell = (sel, nSel, price) => {
          let lotDate = null;
          if (sel) {
            M.sortLots(sel);
            const lot = sel.lots[0];
            if (lot) { lotDate = lot.date; lot.qty--; if (lot.qty <= 0) sel.lots.shift(); }
          }
          M.log(s, { t: x.t, k: "sale", n: m.num, s: nSel, y: sel ? sel.type : null, q: 1, p: price, l: lotDate, b: "sim" });
          M.addDaily(s, x.t, m.num, { s: 1, r: price });
          if (sel) M.addType(s, x.t, m.num, sel.type, 1);
          ventes++; valeur += price;
        };
        diff.parSelection.forEach(d => {
          if (!(d.delta > 0)) return;
          const n = Number(d.selection);
          const sel = Number.isFinite(n) ? M.sel(m, n) : null;
          let prix;
          if (d.deltaValue != null && d.deltaValue > 0) prix = spread(d.delta, d.deltaValue);
          else if (sel && sel.price != null) prix = new Array(d.delta).fill(Number(sel.price));
          else prix = spread(d.delta, moyen * d.delta);
          prix.forEach(p => sell(sel, Number.isFinite(n) ? n : null, p));
          if (!sel) M.addEvent(s, m.num, "SEL_UNKNOWN", { sel: d.selection, qty: d.delta, key: "u" + d.selection });
          else if (M.qty(sel) === 0) M.addEvent(s, m.num, "SEL_EMPTY", { sel: sel.n, type: sel.type });
        });
        if (diff.ecartSelections > 0) spread(diff.ecartSelections, moyen * diff.ecartSelections).forEach(p => sell(null, null, p));
        if (ventes) m.lastSale = x.t;
        if (m.sels.length && m.sels.every(z => M.qty(z) === 0)) M.addEvent(s, m.num, "MACHINE_EMPTY", {});
      }
      if (!diff.baseline) {
        grouper(nv.eva, e => e.code + "|" + e.date + "|" + e.time).concat(nv.activations).forEach(e => machineEvent(s, m, e));
        grouper(nv.fas, e => e.code + "/" + e.sous + "|" + e.date + "|" + e.time).forEach(e => fasEvent(s, m, e));
        nv.pow.forEach(p => powerEvent(s, m, p));
        nv.temp.forEach(tt => tempEvent(s, m, Number(tt.c), when(tt.date, tt.time)));
      }
      const nouveaux = diff.baseline ? 0 : nv.eva.length + nv.fas.length + nv.pow.length + nv.activations.length;
      let message;
      if (diff.baseline) message = BA.I18n.t("rs_msg_first");
      else if (diff.anomalies) message = BA.I18n.t("rs_msg_down");
      else if (appliquer) message = BA.I18n.t("rs_msg_sales", { n: ventes, v: BA.UI ? BA.UI.F.eur(valeur) : valeur.toFixed(2) + " €" });
      else message = BA.I18n.t("rs_msg_nosale");
      if (nouveaux) message += " ; " + BA.I18n.t("rs_msg_events", { n: nouveaux });
      if (temps[0]) message += " ; " + BA.I18n.t("rs_msg_temp", { c: BA.UI ? BA.UI.F.num(temps[0].c, 1) : temps[0].c });
      return { message, ventes };
    },

    // ---------- Envoi de la machine sans compteurs : événements seulement ----------
    // x = { t, analyse } ; les événements déjà vus (même code, date, heure) ne sont pas repris
    applyEvents(s, num, x) {
      const m = M.machine(s, num); if (!m) return { message: "machine introuvable", n: 0 };
      const a = x.analyse;
      seen(s, m, x.t, x.src);
      m.seen = Array.isArray(m.seen) ? m.seen : [];
      const known = new Set(m.seen);
      const fresh = k => { if (known.has(k)) return false; known.add(k); m.seen.push(k); return true; };
      let n = 0;
      doorState(s, m, a.events);
      closeFinished(s, m, a.events);
      a.events.forEach(e => { if (fresh("eva|" + e.code + "|" + e.date + "|" + e.time + "|" + e.active + "|" + e.count)) { machineEvent(s, m, e); n++; } });
      a.fasErrors.forEach(e => { if (fresh("fas|" + e.code + "/" + e.sous + "|" + e.date + "|" + e.time)) { fasEvent(s, m, e); n++; } });
      (a.temperatures || []).forEach(tt => { if (fresh("temp|" + tt.date + "|" + tt.time)) { tempEvent(s, m, tt.celsius, when(tt.date, tt.time)); n++; } });
      if (a.temperatures && a.temperatures.length) m.temp = a.temperatures[0].celsius;
      if (m.seen.length > 300) m.seen = m.seen.slice(-300);
      return { message: a.type === "vide" ? BA.I18n.t("rs_msg_empty") : n ? BA.I18n.t("rs_msg_events", { n }) : BA.I18n.t("rs_msg_known"), n };
    },

    // Relevé identique au précédent : seulement « vu à … »
    touch(s, num, t, src) { const m = M.machine(s, num); if (m) seen(s, m, t, src); },
    // Lecture impossible / câble débranché
    readFailed(s, num, msg, offline) {
      const m = M.machine(s, num); if (!m) return;
      M.addEvent(s, m.num, "READ_FAIL", { msg: String(msg || "").slice(0, 200) });
      if (offline) m.link = false;
    },
    unlink(s, num) { const m = M.machine(s, num); if (m) m.link = false; },
    readBad(s, num) { const m = M.machine(s, num); if (m) M.addEvent(s, m.num, "READ_BAD", {}); },

    // ---------- Machines ----------
    // o = { num, id, street, city, region, serial } ; renvoie null ou la clé du message d'erreur
    addMachine(s, o) {
      const num = Number(o.num);
      if (!Number.isInteger(num) || num < 1 || num > 99999) return "rs_err_num";
      if (M.machine(s, num)) return "rs_err_num_used";
      if (o.id && s.machines.some(m => String(m.id || "").toUpperCase() === String(o.id).toUpperCase())) return "rs_err_exists";
      s.machines.push(BA.Store.newMachine(o));
      s.machines.sort((a, b) => a.num - b.num);
      return null;
    },
    updateMachine(s, num, v) {
      const m = M.machine(s, num); if (!m) return "rs_err_missing";
      if (v.num != null && Number(v.num) !== m.num) {
        const n = Number(v.num);
        if (!Number.isInteger(n) || n < 1 || n > 99999) return "rs_err_num";
        if (M.machine(s, n)) return "rs_err_num_used";
        // le numéro sert de lien partout : alertes, missions, interventions, historique, statistiques
        const old = m.num;
        s.events.forEach(e => { if (e.num === old) e.num = n; });
        s.missions.forEach(e => { if (e.num === old) e.num = n; });
        s.interventions.forEach(e => { if (e.num === old) e.num = n; });
        (s.journal || []).forEach(e => { if (e.n === old) e.n = n; });
        Object.values(s.daily).forEach(d => { if (d[old]) { d[n] = d[old]; delete d[old]; } });
        (s.calendar || []).forEach(e => { if (Array.isArray(e.machines)) e.machines = e.machines.map(x => x === old ? n : x); if (e.perMachine && e.perMachine[old] != null) { e.perMachine[n] = e.perMachine[old]; delete e.perMachine[old]; } });
        Object.values(s.dayDecisions || {}).forEach(d => { if (d.m && d.m[old]) { d.m[n] = d.m[old]; delete d.m[old]; } });
        ["profileManual", "profileManualAt", "profileTypes"].forEach(k => { const o = s[k]; if (o && o[old] != null) { o[n] = o[old]; delete o[old]; } });
        m.num = n;
        s.machines.sort((a, b) => a.num - b.num);
      }
      if (v.street != null) m.street = String(v.street).trim().slice(0, 80);
      if (v.city != null) m.city = String(v.city).trim().slice(0, 60);
      if (v.region != null) m.region = v.region === "bxl" ? "bxl" : "vl";
      return null;
    },
    removeMachine(s, num) {
      const m = M.machine(s, num); if (!m) return "rs_err_missing";
      s.machines = s.machines.filter(x => x !== m);
      s.missions.forEach(x => { if (x.num === m.num && x.status === "open") x.status = "replaced"; });
      s.events.forEach(e => { if (e.num === m.num && !e.resolved) { e.resolved = true; e.resolvedAt = s.now; } });
      return null;
    }
  };

  // ---------------- BA.Live : heure réelle et entretien ----------------
  const onlineNow = (s, m) => !!(m.link && m.lastSeen && s.now - m.lastSeen < (Number(C.onlineMinutes) || 45) * MIN);
  function housekeeping(s, m) {
    const st = s.settings;
    // La porte n'est connue que par les relevés : sans données récentes (câble débranché, machine hors ligne),
    // elle n'est plus affichée ouverte — sauf pendant « Remplir » (porte ouverte par l'opérateur)
    if (m.door && !onlineNow(s, m) && !s.interventions.some(x => x.num === m.num && x.status === "open")) m.door = false;
    if (!m.door) M.resolveEvents(s, m.num, "DOOR_OPEN");
    if (m.temp != null && isFinite(m.temp)) {
      if (m.temp <= st.tempMax) M.resolveEvents(s, m.num, "TEMP_HIGH");
      if (m.temp >= st.tempMin) M.resolveEvents(s, m.num, "TEMP_LOW");
    }
    // erreurs de la machine sans état : réglées après quelques heures
    ["MACHINE_EVENT", "FAS_ERROR"].forEach(c => M.resolveEvents(s, m.num, c, e => e.data.until && s.now >= e.data.until));
    M.resolveEvents(s, m.num, "SEL_UNKNOWN", e => !!M.sel(m, e.data.sel));
    // stock : vide / plus vide
    m.sels.forEach(sel => { if (M.qty(sel) > 0) M.resolveEvents(s, m.num, "SEL_EMPTY", e => e.data.sel === sel.n); });
    M.resolveEvents(s, m.num, "SEL_EMPTY", e => !M.sel(m, e.data.sel));
    if (m.sels.some(x => M.qty(x) > 0) || !m.sels.length) {
      s.events.filter(e => e.num === m.num && e.code === "MACHINE_EMPTY" && !e.resolved).forEach(e => addSpan(s, m.num, e.t, s.now, "e"));
      M.resolveEvents(s, m.num, "MACHINE_EMPTY");
    }
    // Vieux pain (comme dans la version test) : une alerte par lot qui dépasse le seuil ;
    // pain gardé une fois et toujours là au jour suivant : alerte « invalide, à retirer obligatoirement »
    const lotIds = new Set(), keptIds = new Set();
    m.sels.forEach(sel => sel.lots.forEach(l => {
      if (M.isOld(s, l)) {
        lotIds.add("l" + l.id);
        M.addEvent(s, m.num, "OLD_BREAD", { sel: sel.n, type: sel.type, lotDate: l.date, qty: l.qty, key: "l" + l.id });
      } else if (l.kept && M.isMandatory(s, l)) {
        keptIds.add("k" + l.id);
        const ev = M.addEvent(s, m.num, "KEPT_BREAD", { sel: sel.n, type: sel.type, lotDate: l.date, qty: l.qty, keptAt: l.keptAt, key: "k" + l.id });
        if (ev.data.qty !== l.qty) ev.data.qty = l.qty;
      }
    }));
    M.resolveEvents(s, m.num, "OLD_BREAD", e => !lotIds.has(e.key));
    M.resolveEvents(s, m.num, "KEPT_BREAD", e => !keptIds.has(e.key));
  }
  function housekeepAll(s) {
    s.machines.forEach(m => housekeeping(s, m));
    // alertes de machines supprimées
    const nums = new Set(s.machines.map(m => m.num));
    s.events.forEach(e => { if (!nums.has(e.num) && !e.resolved) { e.resolved = true; e.resolvedAt = s.now; } });
  }

  let timer = null, last = 0;
  const Live = {
    derive(s) {
      s.machines.forEach(m => { m.online = onlineNow(s, m); });
    },
    // Entretien seulement s'il change quelque chose (sinon rien n'est envoyé)
    check() {
      const s = BA.Store.get(); if (!s) return;
      const c = JSON.parse(JSON.stringify(s)); c.now = s.now;
      housekeepAll(c);
      const doors = x => x.machines.map(m => m.door ? 1 : 0).join("");
      if (JSON.stringify(c.events) !== JSON.stringify(s.events) || doors(c) !== doors(s) || JSON.stringify(c.daily[M.dayKey(s.now)]) !== JSON.stringify(s.daily[M.dayKey(s.now)])) {
        BA.Store.update(housekeepAll);
      } else BA.Store.ping();
    },
    start() {
      if (timer) return;
      const loop = () => {
        try { Live.check(); } catch (e) { console.error(e); }
        last = Date.now();
      };
      setTimeout(loop, 1500);
      timer = setInterval(loop, 30000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - last > 5000) loop(); });
    },
    _housekeepAll: housekeepAll
  };

  BA.Reel = Reel;
  BA.Live = Live;
})();
