// ============================================================
// BROODAUTOMATE v5 — Données partagées réelles (BA.Store)
// Remplace le stockage de la version test : store.js garde le
// modèle (BA.Model : lots datés FIFO, alertes, commande…), ce
// fichier garde les données.
//
// - Toutes les données (machines, lots, ventes, alertes, missions,
//   calendrier, réglages…) forment un seul « document », comme dans
//   la version test.
// - MODE RÉEL : le document est dans Supabase, table « ba_state »
//   (ligne « main » = le présent, ligne « hist » = les jours passés),
//   partagé par l'admin et l'appli opérateur (PC, téléphone).
//   Chaque modification est faite tout de suite sur cet appareil puis
//   envoyée. Si un autre appareil a écrit entre-temps, la modification
//   est refaite sur la version la plus récente : rien n'est perdu.
//   Une copie reste sur l'appareil (réseau coupé : on continue, et
//   tout part dès que le réseau revient).
// - MODE LOCAL (Supabase non configuré) : le document reste dans ce
//   navigateur (comme la version test).
// - Premier démarrage : les machines, produits et ventes de la v3
//   (tables machines / products / sales) sont repris automatiquement.
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG, M = BA.Model;
  const H = M.H, DAY = M.DAY;
  const LKEY = C.storageKey;                       // copie sur cet appareil
  const LOCAL_DB = LKEY + "-local";                // base du mode local
  const CLOUD = !!(BA.DB && BA.DB.isReady && BA.DB.isReady());

  // ---------------- Outils ----------------
  const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn("Stockage impossible (" + k + ") :", e.message); return false; } };
  const clone = o => JSON.parse(JSON.stringify(o));
  // JSON avec les clés triées : la base (jsonb) peut changer l'ordre des clés
  function stable(v) {
    if (v === null || typeof v !== "object") return v === undefined ? "null" : JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(x => (x === undefined || typeof x === "function") ? "null" : stable(x)).join(",") + "]";
    return "{" + Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== "function").sort()
      .map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }

  // ---------------- Numéros uniques entre appareils ----------------
  // Chaque modification reçoit un bloc de 1024 numéros (lots, alertes, mouvements…) propre à cette page :
  // si elle doit être refaite (un autre appareil a écrit entre-temps), elle redonne exactement les mêmes numéros.
  // Le compteur est partagé par les onglets du navigateur, le « tag » est tiré au hasard pour chaque page.
  const T0 = Date.UTC(2026, 0, 1) / 1000;
  const secs = () => Math.floor(Date.now() / 1000 - T0);
  const tag = Math.floor(Math.random() * 4096);
  let counter = 0;
  function newBlock() {
    counter = Math.max(counter + 1, secs(), (Number(lsGet(LKEY + "-cnt")) || 0) + 1);
    lsSet(LKEY + "-cnt", counter);
    return (counter * 4096 + tag) * 1024;
  }

  // ---------------- Découpage en deux parties (comme la version test) ----------------
  // Le présent (quelques dizaines de Ko) est réécrit à chaque modification ; les jours passés
  // (historique) sont dans une 2e partie, réécrite seulement quand elle change.
  const JOURNAL_DAYS = 62, JOURNAL_MAX = 20000, J_RECENT_MAX = 300, J_RECENT_KEEP = 100;
  function split(s) {
    const cut = M.dayKey(s.now - 2 * DAY), recent = {}, hist = {};
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
    const main = Object.assign({}, s, { daily: recent, journal: jRecent, h: sig });
    delete main.now;
    // « en ligne » est recalculé à l'affichage ; les copies de stock d'une intervention terminée ne servent plus
    main.machines = s.machines.map(m => { const c = Object.assign({}, m); delete c.online; return c; });
    main.interventions = (s.interventions || []).map(it => (it.status === "open" || !it.snaps) ? it : Object.assign({}, it, { snaps: undefined }));
    return { main, hist: { sig, days: hist, jold: jOld } };
  }
  // Remet les deux parties ensemble
  function assemble(main, hist) {
    const o = clone(main);
    if (hist && hist.days) {
      o.daily = Object.assign({}, hist.days, o.daily);
      const ids = new Set((o.journal || []).map(e => e.i));
      o.journal = (hist.jold || []).filter(e => !ids.has(e.i)).concat(o.journal || []);
    }
    delete o.h;
    fixup(o);
    o.now = Date.now();
    return o;
  }
  // Jours passés : a = lu dans la base (prioritaire), b = copie de cet appareil.
  // Si la copie de la base ne correspond pas au présent (deux appareils ont écrit au même moment),
  // on réunit les deux : aucun jour ni mouvement ne se perd.
  function pickHist(a, sig, b) {
    if (a && a.sig === sig) return a;
    if (!a) return b || null;
    if (!b) return a;
    const ids = new Set((a.jold || []).map(e => e.i));
    return {
      sig: a.sig, days: Object.assign({}, b.days || {}, a.days || {}),
      jold: (b.jold || []).filter(e => !ids.has(e.i)).concat(a.jold || []).sort((x, y) => (x.i || 0) - (y.i || 0))
    };
  }
  // Champs indispensables (données anciennes ou incomplètes)
  function fixup(o) {
    ["machines", "events", "journal", "interventions", "missions", "orders", "customTypes", "calendar"].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
    ["daily", "dayDecisions", "profileManual"].forEach(k => { if (!o[k] || typeof o[k] !== "object") o[k] = {}; });
    o.settings = Object.assign(clone(C.defaults), o.settings || {});
    o.settings.forecast = Object.assign({}, C.defaults.forecast, o.settings.forecast || {});
    o.machines.forEach(m => { if (!Array.isArray(m.sels)) m.sels = []; m.sels.forEach(sel => { if (!Array.isArray(sel.lots)) sel.lots = []; M.sortLots(sel); }); });
    if (!(o.seq >= 1)) o.seq = 1;
  }

  // ---------------- Données de départ ----------------
  function emptyState() {
    const now = Date.now();
    const s = {
      v: 1, hv: 2, seq: 1, now, epoch: Math.random().toString(36).slice(2, 10), thr48: true,
      real: { v: 5, created: now },
      settings: clone(C.defaults),
      machines: [], events: [], journal: [], daily: {}, interventions: [], missions: [], orders: [], customTypes: [],
      calendar: [], dayDecisions: {}, profileManual: {}
    };
    s.calendar = BA.Forecast.seedCalendar(now);
    s.calendar.forEach(e => { e.id = s.seq++; });
    return s;
  }

  // Une machine réelle (mêmes champs que dans la version test, sans simulateur)
  function newMachine(o) {
    return {
      num: Number(o.num), id: o.id || null, street: o.street || "", city: o.city || "", region: o.region === "bxl" ? "bxl" : "vl",
      serial: o.serial || "", link: false, door: false, power: false, powerUntil: null,
      temp: o.temp != null && isFinite(o.temp) ? Number(o.temp) : null, tempUntil: null,
      lastSale: null, lastSeen: o.lastSeen || null, nextSale: null, sels: []
    };
  }

  // Type de pain d'après le nom d'un produit de la v3
  function typeFromName(s, name) {
    const n = String(name || "").toLowerCase();
    if (/blanc|wit\b|witbrood|white/.test(n)) return "blanc";
    if (/gris|grijs|grey|gray/.test(n)) return "gris";
    if (/complet|volkoren|wholemeal|whole/.test(n)) return "complet";
    if (/maya/.test(n)) return "maya";
    if (/sandwich|pistolet/.test(n)) return "sandwich";
    return M.ensureType(s, String(name || "").trim() || "Pain") || "blanc";
  }
  // Bruxelles (calendrier scolaire de la Fédération Wallonie-Bruxelles) ou Flandre
  const BXL = /brux|brussel|ixelles|elsene|molenbeek|schaerbeek|schaarbeek|anderlecht|jette|etterbeek|uccle|ukkel|forest|vorst|evere|ganshoren|koekelberg|laeken|laken|saint-gilles|sint-gillis|saint-josse|woluwe|watermael|auderghem|oudergem|berchem-sainte|haren|neder-over/i;
  const regionOf = city => BXL.test(String(city || "")) ? "bxl" : "vl";

  // Événements de départ (sélections vides…)
  function startEvents(s) {
    s.machines.forEach(m => {
      m.sels.forEach(sel => { if (M.qty(sel) === 0) M.addEvent(s, m.num, "SEL_EMPTY", { sel: sel.n, type: sel.type }); });
      if (m.sels.length && m.sels.every(x => M.qty(x) === 0)) M.addEvent(s, m.num, "MACHINE_EMPTY", {});
    });
  }

  // ---------------- Reprise des données de la v3 (Supabase) ----------------
  async function fromV3() {
    const s = emptyState();
    const sb = BA.DB.raw();
    const rows = await BA.DB.getAllMachines();
    const since = new Date(Date.now() - 400 * DAY).toISOString();
    let num = 0;
    for (const row of rows) {
      num++;
      const m = newMachine({
        num, id: row.id, street: row.name || row.id, city: row.city || "", region: regionOf(row.city),
        serial: row.serial || String(row.id || "").replace(/^FAS-/i, ""), temp: row.temp_c,
        lastSeen: row.last_seen ? Date.parse(row.last_seen) || null : null
      });
      const products = (await BA.DB.getProducts(row.id)).slice().sort((a, b) => Number(a.selection) - Number(b.selection));
      products.forEach(p => {
        const n = Number(p.selection);
        if (!Number.isInteger(n) || n < 1 || n > 999 || M.sel(m, n)) return;
        const cap = Math.max(1, Math.min(50, Math.round(Number(p.capacity) || 6)));
        const qty = Math.max(0, Math.min(cap, Math.round(Number(p.qty) || 0)));
        const price = Number(p.price);
        const sel = { n, type: typeFromName(s, p.name), cap, price: isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : s.settings.salePrice, lots: [] };
        // date de livraison inconnue : « (estimé) », à corriger dans Détails machine
        if (qty > 0) sel.lots.push({ id: s.seq++, qty, date: M.lastDelivery(s.now), kept: false, estimated: true });
        m.sels.push(sel);
      });
      s.machines.push(m);
      // ventes enregistrées par la v3 → résumé par jour (statistiques, prévisions)
      const typeOf = {}; m.sels.forEach(x => { typeOf[x.n] = x.type; });
      for (let a = 0; a < 200000; a += 1000) {
        const res = await sb.from("sales").select("created_at, selection, price").eq("machine_id", row.id)
          .gte("created_at", since).order("id", { ascending: true }).range(a, a + 999);
        if (res.error) throw new Error(res.error.message);
        const list = res.data || [];
        list.forEach(v => {
          const t = Date.parse(v.created_at); if (!t) return;
          const k = M.dayKey(t), day = s.daily[k] || (s.daily[k] = {});
          const r = day[num] || (day[num] = { s: 0, r: 0, l: 0, x: 0, c: 0 });
          r.s += 1; r.r = Math.round((r.r + (Number(v.price) || 0)) * 100) / 100;
          const ty = typeOf[Number(v.selection)];
          if (ty) { r.y = r.y || {}; r.y[ty] = (r.y[ty] || 0) + 1; }
        });
        if (list.length < 1000) break;
      }
    }
    startEvents(s);
    s.real.importedV3 = { at: s.now, machines: rows.length };
    return s;
  }

  // ================= Où sont gardées les données =================
  // Supabase : table ba_state (id, version, data, updated_at, updated_by)
  const SetupError = function (msg) { this.message = msg; this.setup = true; };
  const tableMissing = err => /ba_state/i.test(err && err.message || "") && /(does not exist|could not find|schema cache|relation)/i.test(err.message || "");
  const Cloud = {
    sb() { return BA.DB.raw(); },
    check(res) {
      if (res.error) {
        if (tableMissing(res.error)) throw new SetupError(res.error.message);
        throw new Error(res.error.message || String(res.error));
      }
      return res.data;
    },
    async load() {
      const rows = this.check(await this.sb().from("ba_state").select("id, version, data").in("id", ["main", "hist"])) || [];
      return { main: rows.find(r => r.id === "main") || null, hist: rows.find(r => r.id === "hist") || null };
    },
    async fetchMain() { return this.check(await this.sb().from("ba_state").select("id, version, data").eq("id", "main").maybeSingle()); },
    async fetchHist() { const r = this.check(await this.sb().from("ba_state").select("id, version, data").eq("id", "hist").maybeSingle()); return r ? r.data : null; },
    async version() { const r = this.check(await this.sb().from("ba_state").select("version").eq("id", "main").maybeSingle()); return r ? Number(r.version) : 0; },
    // Création (premier démarrage) : faux si un autre appareil l'a créée juste avant
    async create(main, hist) {
      const now = new Date().toISOString();
      const res = await this.sb().from("ba_state").insert([
        { id: "hist", version: 1, data: hist, updated_at: now, updated_by: String(tag) },
        { id: "main", version: 1, data: main, updated_at: now, updated_by: String(tag) }
      ]);
      if (res.error) {
        if (res.error.code === "23505" || /duplicate|unique/i.test(res.error.message || "")) return false;
        this.check(res);
      }
      return true;
    },
    async saveHist(hist) {
      this.check(await this.sb().from("ba_state").upsert({ id: "hist", version: 1, data: hist, updated_at: new Date().toISOString(), updated_by: String(tag) }));
    },
    // Écriture seulement si personne n'a écrit depuis la version « version »
    async saveMain(version, main) {
      const rows = this.check(await this.sb().from("ba_state")
        .update({ data: main, version: version + 1, updated_at: new Date().toISOString(), updated_by: String(tag) })
        .eq("id", "main").eq("version", version).select("version")) || [];
      return rows.length === 1 ? { ok: true, version: Number(rows[0].version) } : { ok: false };
    },
    subscribe(onChange) {
      try {
        this.sb().channel("broodautomate-v5")
          .on("postgres_changes", { event: "*", schema: "public", table: "ba_state" }, p => {
            // (une ligne très grande peut arriver sans ses colonnes : on vérifie alors la version)
            const row = (p && p.new) || {};
            if (row.id && row.id !== "main") return;
            if (row.id && String(row.updated_by) === String(tag) && Number(row.version) <= base.version) return;     // notre propre écriture
            onChange();
          })
          .subscribe();
      } catch (e) { console.warn("Temps réel indisponible :", e.message); }
    }
  };
  // Mode local : la même chose dans le navigateur
  const Local = {
    read() { return lsGet(LOCAL_DB); },
    async load() { const d = this.read(); return d ? { main: { version: d.version, data: d.main }, hist: { data: d.hist } } : { main: null, hist: null }; },
    async fetchMain() { const d = this.read(); return d ? { id: "main", version: d.version, data: d.main } : null; },
    async fetchHist() { const d = this.read(); return d ? d.hist : null; },
    async version() { const d = this.read(); return d ? d.version : 0; },
    async create(main, hist) { if (this.read()) return false; return lsSet(LOCAL_DB, { version: 1, main, hist }); },
    async saveHist(hist) { const d = this.read() || { version: 0 }; d.hist = hist; if (!lsSet(LOCAL_DB, d)) throw new Error("plus de place dans le navigateur"); },
    async saveMain(version, main) {
      const d = this.read();
      if (!d || d.version !== version) return { ok: false };
      d.version = version + 1; d.main = main;
      if (!lsSet(LOCAL_DB, d)) throw new Error("plus de place dans le navigateur");
      return { ok: true, version: d.version };
    },
    subscribe(onChange) { window.addEventListener("storage", e => { if (e.key === LOCAL_DB) onChange(); }); }
  };

  // ================= État et synchronisation =================
  let state = null;
  let backend = null;
  let base = { version: 0, stable: "", histSig: null };   // dernière version connue de la base
  let histCache = null;                                    // dernière partie « jours passés » lue / écrite
  let pending = [];                                         // modifications pas encore confirmées par la base
  let pushing = false, pushAgain = false, pullAgain = false;
  let pushTimer = null, retryMs = 2000;
  const subs = [];
  const status = { mode: CLOUD ? "cloud" : "local", sync: "ok", error: "", lastSync: 0, lost: null };

  function notify() { subs.forEach(f => { try { f(state); } catch (e) { console.error(e); } }); }
  function setSync(v, err) {
    const changed = status.sync !== v || status.error !== (err || "");
    status.sync = v; status.error = err || "";
    if (v === "ok") status.lastSync = Date.now();
    if (changed && BA.Shell && BA.Shell.refreshChrome && BA.Shell.ctx) { try { BA.Shell.refreshChrome(); } catch (e) { /* rien */ } }
  }

  // Copie sur cet appareil (sert si le réseau est coupé au démarrage)
  function writeCache() {
    if (!state) return;
    const sp = split(state);
    lsSet(LKEY, { url: CLOUD ? C.supabase.url : "local", version: base.version, dirty: pending.length > 0, main: sp.main, hist: sp.hist, at: Date.now() });
  }

  // Une modification : faite tout de suite ici, refaite à l'identique si elle doit l'être sur une version plus récente
  function runOp(s, op) {
    const prev = s.seq || 0;
    s.now = op.t;
    s.seq = op.first;
    let res;
    try { res = op.fn(s); }
    catch (e) { console.error("Modification impossible :", e); }
    finally {
      s.seq = Math.max(prev, s.seq || 0); s.now = Date.now();
      s.applied = (Array.isArray(s.applied) ? s.applied : []).concat(op.first).slice(-APPLIED_MAX);
    }
    return res;
  }
  const APPLIED_MAX = 300;

  // Modifications faites hors ligne lors d'une visite précédente (page fermée avant l'envoi)
  let orphan = null;
  function resumeDirty(cache) {
    const op = { fn: () => {}, t: Date.now(), first: newBlock() };     // repère : « cette copie a bien été envoyée »
    runOp(state, op);
    pending.push(op);
    orphan = { cache, first: op.first };
  }
  function markLost(cache) {
    status.lost = Date.now();
    lsSet(LKEY + "-perdu", Object.assign({}, cache, { lostAt: status.lost }));
    console.warn("Modifications hors ligne non envoyées : copie gardée dans", LKEY + "-perdu");
    // découvert après le démarrage : message tout de suite (au démarrage, c'est BA.Boot qui l'affiche)
    if (BA.Shell && BA.Shell.ctx && BA.UI && BA.UI.toast) BA.UI.toast(BA.I18n.t("sync_lost"), 20000);
  }

  function schedulePush(ms) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, ms || 0);
  }

  async function push() {
    if (!backend) return;
    if (pushing) { pushAgain = true; return; }
    if (!pending.length) return;
    pushing = true;
    setSync("sending");
    try {
      for (let guard = 0; guard < 8 && pending.length; guard++) {
        const batch = pending.slice();
        const sent = () => { pending = pending.filter(op => !batch.includes(op)); };
        const sp = split(state);
        const st = stable(sp.main);
        if (st === base.stable && sp.hist.sig === base.histSig) { sent(); break; }     // rien n'a changé
        if (sp.hist.sig !== base.histSig) { await backend.saveHist(sp.hist); histCache = sp.hist; base.histSig = sp.hist.sig; }
        const r = await backend.saveMain(base.version, sp.main);
        if (r.ok) {
          base = { version: r.version, stable: st, histSig: sp.hist.sig };
          sent();
          orphan = null;
        } else {
          await rebase();          // un autre appareil a écrit : nos modifications sont refaites sur sa version
        }
      }
      retryMs = 2000;
      setSync(pending.length ? "sending" : "ok");
      writeCache();
    } catch (e) {
      console.warn("Envoi impossible :", e.message);
      setSync("offline", e.message);
      writeCache();
      schedulePush(retryMs);
      retryMs = Math.min(60000, retryMs * 2);
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(0); }
      else if (pullAgain) { pullAgain = false; pull(); }
    }
  }

  // Dernière version de la base + nos modifications pas encore envoyées
  async function rebase() {
    const row = await backend.fetchMain();
    if (!row) throw new Error("données introuvables");
    let hist = histCache;
    if (!hist || hist.sig !== row.data.h) hist = pickHist(await backend.fetchHist(), row.data.h, histCache);
    histCache = hist;
    const s = assemble(row.data, hist);
    // déjà dans la base (envoyées, mais la réponse s'était perdue) : pas refaites
    const done = new Set(Array.isArray(row.data.applied) ? row.data.applied : []);
    pending = pending.filter(op => !done.has(op.first));
    if (orphan) { if (!done.has(orphan.first)) markLost(orphan.cache); orphan = null; }
    pending.forEach(op => runOp(s, op));
    state = s;
    base = { version: Number(row.version), stable: stable(row.data), histSig: hist ? hist.sig : null };
    notify();
  }

  // Un autre appareil a écrit : on prend sa version (et on y refait nos modifications en attente)
  let pullTimer = null;
  async function pull() {
    if (!backend || !state) return;
    if (pushing) { pullAgain = true; return; }
    try {
      const v = await backend.version();
      if (v <= base.version) return;
      if (pushing) { pullAgain = true; return; }
      await rebase();
      writeCache();
      if (pending.length) schedulePush(0);
      setSync(pending.length ? "sending" : "ok");
    } catch (e) {
      setSync("offline", e.message);
    }
  }
  const pullSoon = () => { clearTimeout(pullTimer); pullTimer = setTimeout(pull, 300); };
  function listen() {
    backend.subscribe(pullSoon);
    setInterval(pull, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pullSoon(); });
    window.addEventListener("online", () => { pullSoon(); if (pending.length) schedulePush(0); });
  }

  // ================= BA.Store (même usage que dans la version test) =================
  const Store = {
    status() { return Object.assign({ pending: pending.length }, status); },
    ready() { return !!state; },

    // Chargement au démarrage (après la connexion)
    async init() {
      backend = CLOUD ? Cloud : Local;
      const cache = lsGet(LKEY);
      const cacheOk = cache && cache.main && cache.url === (CLOUD ? C.supabase.url : "local");
      let remote;
      try {
        remote = await backend.load();
      } catch (e) {
        if (e.setup) throw e;                               // table « ba_state » pas encore créée
        if (!cacheOk) throw e;                              // pas de réseau et rien sur cet appareil
        // réseau coupé : on repart de la copie de cet appareil
        state = assemble(cache.main, cache.hist);
        histCache = cache.hist || null;
        base = { version: cache.version || 0, stable: stable(cache.main), histSig: !cache.dirty && cache.hist ? cache.hist.sig : null };
        if (cache.dirty) resumeDirty(cache);              // modifications pas encore envoyées : elles partiront dès le retour du réseau
        setSync("offline", e.message);
        writeCache();
        listen();
        if (pending.length) schedulePush(retryMs);
        return state;
      }
      if (!remote.main) {
        // Premier démarrage de la v5 : reprise des données de la v3
        const s = CLOUD ? await fromV3() : emptyState();
        const sp = split(s);
        const created = await backend.create(sp.main, sp.hist);
        if (created) {
          state = s; histCache = sp.hist;
          base = { version: 1, stable: stable(sp.main), histSig: sp.hist.sig };
        } else {
          remote = await backend.load();
        }
      }
      if (!state) {
        histCache = pickHist(remote.hist ? remote.hist.data : null, remote.main.data.h, cacheOk ? cache.hist : null);
        state = assemble(remote.main.data, histCache);
        base = { version: Number(remote.main.version), stable: stable(remote.main.data), histSig: remote.hist && remote.hist.data ? remote.hist.data.sig : null };
        // modifications faites hors ligne sur cet appareil (page fermée avant l'envoi)
        if (cacheOk && cache.dirty && cache.main) {
          if (Number(cache.version) === base.version) {          // personne n'a écrit depuis : on les envoie maintenant
            state = assemble(cache.main, pickHist(cache.hist, cache.main.h, histCache));
            resumeDirty(cache);
          } else markLost(cache);                                // un autre appareil a écrit entre-temps : copie gardée
        }
      }
      setSync(pending.length ? "sending" : "ok");
      writeCache();
      listen();
      if (pending.length) schedulePush(0);
      return state;
    },

    get() {
      if (state) {
        state.now = Date.now();
        if (BA.Live && BA.Live.derive) BA.Live.derive(state);
      }
      return state;
    },

    // Lecture-modification : fait tout de suite sur cet appareil, puis envoyé
    update(fn, silent) {
      if (!state) throw new Error("Données pas encore chargées.");
      const op = { fn, t: Date.now(), first: newBlock() };
      const res = runOp(state, op);
      if (BA.Live && BA.Live.derive) BA.Live.derive(state);
      pending.push(op);
      writeCache();
      if (!silent) notify();
      schedulePush(0);
      return res;
    },

    subscribe(f) { subs.push(f); },
    // Redessiner sans rien changer (heure, « il y a … »)
    ping() { if (state) { state.now = Date.now(); notify(); } },
    // Pour les tests et le bouton « Actualiser »
    pull,
    flush() { return push(); },
    pendingCount() { return pending.length; },

    // utilisés par la connexion RS232 et la reprise des données
    newMachine, regionOf, typeFromName, startEvents,
    _split: split, _stable: stable, SetupError
  };

  BA.Store = Store;
})();
