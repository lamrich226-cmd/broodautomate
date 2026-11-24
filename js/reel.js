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
    SEL_UNKNOWN:   { cat: "stock", level: "warn" },   // vente sur une sélection absente de Produits / Stock
    SELS_FROM_MACHINE: { cat: "stock", level: "info" } // v5.33.1 : sélections créées d'après la machine (1re connexion)
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
  // « ECF_38 » (EA1) et « 16/38 » (MA5) sont le MÊME événement écrit de deux façons : on garde seulement l'erreur FAS
  function sansDoublonFas(evs, fasList) {
    return (evs || []).filter(e => {
      const o = BA.Alertes && BA.Alertes.observee ? BA.Alertes.observee(e.code) : null;
      return !(o && (fasList || []).some(f => String(f.code) === o.fas && String(f.sous || "") === o.sous && (!e.date || !f.date || (f.date === e.date && f.time === e.time))));
    });
  }
  function fasEvent(s, m, e, hist) {
    const d = BA.Alertes.fas(e.code, e.sous);
    const ev = M.addEvent(s, m.num, "FAS_ERROR", {
      code: e.code, sous: e.sous || "", title: d.titre, expl: d.expl, sol: (d.terrain ? [d.terrain] : []).concat(d.solution || []).join(" "), count: e.nouveaux || e.count || 1,
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
    // v5.34.2 : le capteur de la machine fait foi. Relevé « porte fermée » = porte fermée, même si un « Remplir » est encore ouvert
    // (avant, un « Remplir » commencé puis oublié gardait la machine « porte ouverte » jusqu'à 4 h alors que la porte était fermée)
    if (e.active && !m.door) { m.door = true; m.doorAt = s.now; M.addEvent(s, m.num, "DOOR_OPEN", {}); }
    else if (!e.active && m.door) { m.door = false; delete m.doorAt; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
  }
  // v5.13 : porte vue par le serveur (fonction ba_portes) : ce qui change pour chaque machine (sans rien modifier)
  // v5.34.2 : le capteur fait foi, même pendant un « Remplir » ouvert (le « Remplir » reste ouvert, seule la porte suit le capteur)
  // list : [{ m: n° de la machine (id), o: ouverte ?, d: heure du changement (ISO) }]
  function portesPlan(s, list) {
    const out = [];
    (list || []).forEach(p => {
      const m = s.machines.find(x => x.id === p.m); if (!m) return;
      const at = Date.parse(p.d) || 0;
      if (p.o && !m.door) out.push({ num: m.num, open: true, at });
      else if (p.o && m.door && at && Math.abs((m.doorAt || 0) - at) > 1000) out.push({ num: m.num, open: true, at });     // même porte, heure exacte
      else if (!p.o && m.door && at + 5 * 60000 >= (m.doorAt || 0)) out.push({ num: m.num, open: false, at });        // le serveur dit « fermée » : l'appli suit (marge 5 min : l'appli note l'heure de SON import du relevé)
    });
    return out;
  }
  // Événements terminés d'après la machine
  function closeFinished(s, m, events) {
    (events || []).forEach(e => {
      if (e.active === false) M.resolveEvents(s, m.num, "MACHINE_EVENT", x => x.data.code === e.code);
    });
  }
  // src : "usb" (clé USB : la machine n'est pas pour autant reliée), "rs232" ou "4g" (boîtier 4G)
  function seen(s, m, t, src) {
    if (src !== "usb") m.link = true;
    m.lastSeen = Math.max(m.lastSeen || 0, t);
    M.resolveEvents(s, m.num, "READ_FAIL");
    M.resolveEvents(s, m.num, "READ_BAD");
  }

  // ---------------- v5.29 : numéro de machine et historique ----------------
  // Le numéro d'une machine est le lien de tout son historique (alertes, missions, interventions, journal, ventes par jour,
  // calendrier, profils). Avant la v5.29, une machine supprimée laissait son historique sous son numéro : la machine suivante
  // qui prenait ce numéro en héritait (ex. alertes et ventes d'une autre machine). Désormais l'historique d'une machine
  // supprimée part sous un numéro FANTÔME (k × 100000 + ancien numéro, jamais un numéro de machine) : les statistiques de la
  // flotte restent, mais aucune machine ne le reprend.
  const FANTOME = 100000;
  const estFantome = n => Number(n) >= FANTOME;
  const numObj = o => (o && typeof o === "object" ? o : {});
  // Tous les numéros cités par l'historique
  function numerosCites(s) {
    const set = new Set(), add = n => { const v = Number(n); if (Number.isInteger(v) && v > 0) set.add(v); };
    ["events", "missions", "interventions", "moves"].forEach(k => (s[k] || []).forEach(e => add(e.num)));
    (s.journal || []).forEach(e => add(e.n));
    Object.values(numObj(s.daily)).forEach(d => Object.keys(numObj(d)).forEach(add));
    (s.calendar || []).forEach(e => { (Array.isArray(e.machines) ? e.machines : []).forEach(add); Object.keys(numObj(e.perMachine)).forEach(add); });
    Object.values(numObj(s.dayDecisions)).forEach(d => Object.keys(numObj(d && d.m)).forEach(add));
    ["profileManual", "profileManualAt", "profileTypes"].forEach(k => Object.keys(numObj(s[k])).forEach(add));
    return set;
  }
  function fantomePour(s, old) {
    const pris = numerosCites(s);
    let k = 1; while (pris.has(k * FANTOME + old)) k++;
    return k * FANTOME + old;
  }
  // Renumérotation d'une machine (son historique la suit)
  function deplacerNum(s, old, n) {
    ["events", "missions", "interventions", "moves"].forEach(k => (s[k] || []).forEach(e => { if (e.num === old) e.num = n; }));
    (s.journal || []).forEach(e => { if (e.n === old) e.n = n; });
    Object.values(numObj(s.daily)).forEach(d => { if (d && d[old]) { d[n] = d[old]; delete d[old]; } });
    (s.calendar || []).forEach(e => { if (Array.isArray(e.machines)) e.machines = e.machines.map(x => x === old ? n : x); if (e.perMachine && e.perMachine[old] != null) { e.perMachine[n] = e.perMachine[old]; delete e.perMachine[old]; } });
    Object.values(numObj(s.dayDecisions)).forEach(d => { if (d && d.m && d.m[old]) { d.m[n] = d.m[old]; delete d.m[old]; } });
    ["profileManual", "profileManualAt", "profileTypes"].forEach(k => { const o = s[k]; if (o && o[old] != null) { o[n] = o[old]; delete o[old]; } });
    s.histRev = (s.histRev || 0) + 1;                       // les jours passés (2e partie des données) seront réécrits
  }
  // Détache l'historique du numéro « old » (machine supprimée) vers un numéro fantôme. avant (ms) : seulement ce qui est plus
  // ancien que cet instant (réparation d'une machine qui a hérité de l'historique d'une autre). Rend le nombre d'éléments détachés.
  function detacher(s, old, avant) {
    const g = fantomePour(s, old), vieux = t => avant == null || (Number(t) || 0) < avant;
    const jourMax = avant == null ? null : M.dayKey(avant);
    let n = 0;
    const evs = (s.events || []).filter(e => e.num === old && vieux(e.t));
    if (evs.length) { s.events = s.events.filter(e => !evs.includes(e)); n += evs.length; }      // ses alertes sont effacées
    const mv = (s.moves || []).filter(e => e.num === old && vieux(e.at));
    if (mv.length) { s.moves = s.moves.filter(e => !mv.includes(e)); n += mv.length; }          // pains à déplacer : plus rien à faire
    (s.missions || []).forEach(e => { if (e.num === old && vieux(e.created)) { e.num = g; n++; } });
    (s.interventions || []).forEach(e => { if (e.num === old && vieux(e.start)) { e.num = g; n++; } });
    (s.journal || []).forEach(e => { if (e.n === old && vieux(e.t)) { e.n = g; n++; } });
    Object.keys(numObj(s.daily)).forEach(k => { const d = s.daily[k]; if (d && d[old] && (jourMax == null || k < jourMax)) { d[g] = d[old]; delete d[old]; n++; } });
    if (avant == null) {                                     // réglages propres à cette machine : effacés
      (s.calendar || []).forEach(e => { if (Array.isArray(e.machines) && e.machines.includes(old)) { e.machines = e.machines.filter(x => x !== old); n++; } if (e.perMachine && e.perMachine[old] != null) { delete e.perMachine[old]; n++; } });
      Object.values(numObj(s.dayDecisions)).forEach(d => { if (d && d.m && d.m[old]) { delete d.m[old]; n++; } });
      ["profileManual", "profileManualAt", "profileTypes"].forEach(k => { const o = s[k]; if (o && o[old] != null) { delete o[old]; n++; } });
    }
    if (n) s.histRev = (s.histRev || 0) + 1;
    return n;
  }
  // Réparation (au chargement, sans effet si tout est en ordre) : 1) historique d'un numéro sans machine (machine supprimée
  // avant la v5.29) → fantôme ; 2) machine créée en v5.29 ou après (m.cree) : ce qui est plus vieux qu'elle (1 h de marge,
  // horloges des appareils) appartenait à une autre machine → fantôme.
  function reparerNumeros(s) {
    let n = 0;
    const machines = new Set((s.machines || []).map(m => m.num));
    numerosCites(s).forEach(num => { if (!estFantome(num) && !machines.has(num)) n += detacher(s, num, null); });
    (s.machines || []).forEach(m => { if (Number(m.cree) > 0) n += detacher(s, m.num, Number(m.cree) - H); });
    return n;
  }
  // La même réparation, sur une copie : y a-t-il quelque chose à réparer ?
  const aReparer = s => { try { return reparerNumeros(JSON.parse(JSON.stringify(s))) > 0; } catch (e) { return false; } };
  // « #2 » ou « #2 (supprimée) » pour un numéro fantôme
  M.numTxt = n => estFantome(n) ? "#" + (Number(n) % FANTOME) + " " + BA.I18n.t("num_supprimee") : "#" + n;

  // ---------------- v5.33.1 : sélections et prix annoncés par la machine ----------------
  // Chaque relevé donne, pour chaque sélection, son numéro et le prix gardé dans la machine (ligne PA1).
  // Champs ajoutés à une sélection : mp = dernier prix de la machine vu (centimes), mpt = heure de ce relevé,
  // pt = heure du dernier prix fixé (par un relevé ou à la main) : un relevé plus ancien ne le remplace pas.
  const plusFrequent = vals => {
    const c = {}; let best = null, n = 0;
    vals.forEach(v => { if (v == null || v === "") return; const k = String(v); c[k] = (c[k] || 0) + 1; if (c[k] > n) { n = c[k]; best = v; } });
    return best;
  };
  // Nouveau prix de vente d'une sélection. w : « m » = prix réglé dans la machine, « v » = prix payé à la dernière vente.
  // Noté dans l'Historique (« Distributeur ») ; un changement de prix dans la machine est aussi gardé dans les Alertes (déjà réglé).
  function prixAuto(s, m, sel, prix, t, w, alerte) {
    sel.pt = t;
    const p0 = Number(sel.price), p1 = Math.round(Number(prix) * 100) / 100;
    if (!(p1 >= 0) || Math.round(p0 * 100) === Math.round(p1 * 100)) return false;
    sel.price = p1;
    M.log(s, { t, k: "price", n: m.num, s: sel.n, y: sel.type, p: p1, p0: isFinite(p0) ? p0 : null, b: "sim", w });
    if (alerte) {
      const ev = M.addEvent(s, m.num, "PRICE_CHANGED", { sel: sel.n, type: sel.type, from: isFinite(p0) ? p0 : null, to: p1, key: "p" + sel.n + "-" + t });
      ev.resolved = true; ev.resolvedAt = s.now;
    }
    return true;
  }
  // audit : relevé (toAudit) ; t : heure du relevé
  function selsMachine(s, m, audit, t) {
    const liste = ((audit && audit.selections) || []).map(x => ({
      n: Number(x.selection), sold: Number(x.sold) || 0,
      p: x.price == null || x.price === "" || !isFinite(Number(x.price)) ? null : Number(x.price)
    })).filter(x => Number.isInteger(x.n) && x.n >= 1 && x.n <= 999);
    if (!liste.length) return;
    // 1) Première connexion : la plateforme n'a encore aucune sélection pour cette machine → celles que la machine annonce
    //    (seulement celles qui ont déjà vendu, s'il y en a : les autres ne sont souvent pas utilisées), avec le type de pain
    //    et la capacité les plus courants pour ce numéro dans les autres machines. L'admin vérifie (alerte).
    if (!m.sels.length) {
      const vendues = liste.filter(x => x.sold > 0), choix = vendues.length ? vendues : liste;
      const autres = [];
      s.machines.forEach(o => { if (o !== m) (o.sels || []).forEach(x => autres.push(x)); });
      const types = M.types(s);
      const faites = [];
      choix.forEach(x => {
        if (M.sel(m, x.n)) return;
        const memes = autres.filter(o => o.n === x.n);
        const type = [plusFrequent(memes.map(o => o.type)), plusFrequent(autres.map(o => o.type)), types[0]].find(v => v && types.includes(v)) || "blanc";
        const cap = Math.max(1, Math.min(50, Math.round(Number(plusFrequent(memes.map(o => o.cap)) || plusFrequent(autres.map(o => o.cap)) || 3))));
        const prix = x.p > 0 ? x.p : Number(plusFrequent(memes.map(o => o.price)) || s.settings.salePrice) || 0;
        m.sels.push({ n: x.n, type, cap, price: Math.round(prix * 100) / 100, lots: [] });
        M.log(s, { t, k: "seladd", n: m.num, s: x.n, y: type, c: cap, b: "sim" });
        faites.push(x.n);
      });
      if (faites.length) {
        m.sels.sort((a, b) => a.n - b.n);
        M.addEvent(s, m.num, "SELS_FROM_MACHINE", { total: faites.length, msg: faites.join(", "), key: "sm" });
      }
    }
    // 2) Prix réglé dans la machine : repris à la première lecture de la sélection et à chaque changement.
    //    0 € = prix tenu par le système de paiement : la plateforme garde le sien (corrigé par le prix payé, voir applyAudit).
    liste.forEach(x => {
      const sel = M.sel(m, x.n);
      if (!sel || x.p == null || x.p < 0) return;
      if (sel.mpt != null && t < sel.mpt) return;                       // relevé plus ancien (clé USB importée plus tard)
      const c = Math.round(x.p * 100), premier = sel.mp == null, change = premier || c !== sel.mp;
      sel.mp = c; sel.mpt = t;
      if (!change || c <= 0) return;
      if (sel.pt != null && t < sel.pt) return;                         // prix changé à la main après ce relevé : il reste
      prixAuto(s, m, sel, c / 100, t, "m", !premier);
    });
  }

  const Reel = {
    machineMs, addSpan,

    portesPlan,
    portes(s, list) {
      const plan = portesPlan(s, list);
      plan.forEach(c => {
        const m = M.machine(s, c.num); if (!m) return;
        if (c.open) { if (!m.door) M.addEvent(s, m.num, "DOOR_OPEN", {}); m.door = true; m.doorAt = c.at || s.now; }
        else { m.door = false; delete m.doorAt; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
      });
      return plan.length;
    },

    // v5.13 : totaux de la machine depuis sa mise en service (chiffre d'affaires, nombre de ventes, part payée par carte)
    // gardés dans la machine avec la date du relevé ; un relevé plus ancien (clé USB) ne remplace pas un plus récent
    setTotals(s, num, audit, t) {
      const m = M.machine(s, num); if (!m || !audit || audit.total_count == null) return;
      selsMachine(s, m, audit, t);                // v5.33.1 : aussi quand rien n'est vendu (prix changé dans la machine)
      if (m.tot && m.tot.t > t) return;
      m.tot = { t, n: Number(audit.total_count), v: Number(audit.total_value) || 0,
        cn: audit.cashless_count == null ? null : Number(audit.cashless_count), cv: audit.cashless_value == null ? null : Number(audit.cashless_value) };
    },

    // ---------- Relevé avec compteurs (VA1…) ----------
    // x = { t, analyse (sans le texte brut), audit, ancien, diff, nv } : données figées → refaites à l'identique si besoin
    // Renvoie { message, ventes }
    applyAudit(s, num, x) {
      const m = M.machine(s, num); if (!m) return { message: "machine introuvable", ventes: 0 };
      const { diff, nv, audit, analyse } = x;
      const prevTot = m.tot ? Object.assign({}, m.tot) : null;        // v5.13 : totaux du relevé d'avant (carte / espèces par jour)
      seen(s, m, x.t, x.src);
      selsMachine(s, m, audit, x.t);                                  // v5.33.1 : sélections (1re connexion) et prix de la machine
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
        // v5.25 : relevé reçu AVANT un inventaire fait ensuite sur cette machine, mais traité APRÈS (page admin fermée,
        // téléphone hors ligne…) : l'opérateur a déjà compté les pains restants, ces ventes y sont donc déjà. La vente est
        // notée (chiffres, historique) mais le stock n'est pas diminué une 2e fois (avant : stock trop bas et faux « manquants »).
        // v5.33 : comparé à l'heure de l'INVENTAIRE (avant : au début de « Remplir ») : un relevé pris entre le moment où l'opérateur
        // touche « Remplir » et la fin de son comptage (la porte s'ouvre, le boîtier relit la machine) est lui aussi déjà compté
        const dejaCompte = (s.interventions || []).some(it => it.num === m.num && (it.invAt || it.start) > x.t && Array.isArray(it.inv) && it.inv.length > 0 && !it.invSkipped);
        const inconnu = [];
        const vides = new Set();          // v5.34.5 : types dont une sélection est à 0 après ces ventes (rupture du type ?)
        const sell = (sel, nSel, price) => {
          let lotDate = null;
          if (sel && !dejaCompte) {
            M.sortLots(sel);
            const lot = sel.lots[0];
            if (lot) { lotDate = lot.date; lot.qty--; if (lot.qty <= 0) sel.lots.shift(); }
            else if (inconnu.indexOf(sel.n) < 0) inconnu.push(sel.n);      // v5.34.3 : vente alors que l'appli croit la sélection vide → stock faux
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
          // v5.33.1 : une seule vente sur la sélection depuis le relevé d'avant → son montant est le prix vraiment payé
          // (le seul prix connu quand la machine dit 0 €) ; plusieurs ventes : la moyenne pourrait mélanger deux prix
          if (sel && d.delta === 1 && d.deltaValue != null && d.deltaValue > 0 && !(sel.pt != null && x.t < sel.pt)) prixAuto(s, m, sel, d.deltaValue, x.t, "v", false);
          if (!sel) M.addEvent(s, m.num, "SEL_UNKNOWN", { sel: d.selection, qty: d.delta, key: "u" + d.selection });
          else if (M.qty(sel) === 0) vides.add(sel.type);
        });
        if (diff.ecartSelections > 0) spread(diff.ecartSelections, moyen * diff.ecartSelections).forEach(p => sell(null, null, p));
        if (ventes) m.lastSale = x.t;
        if (inconnu.length) {     // v5.34.4 : l'alerte retient les sélections concernées (l'inventaire demande de les compter)
          const ev = M.addEvent(s, m.num, "STOCK_UNKNOWN", { sels: [] });
          ev.data = Object.assign({}, ev.data, { sels: [...new Set(((ev.data && ev.data.sels) || []).concat(inconnu))].sort((a, b) => a - b) });
          // v5.34.5 : la machine a vendu ce pain → « plus de pain X » était faux : réglée (l'alerte « stock inconnu » prend le relais)
          const vendus = new Set(inconnu.map(n => (M.sel(m, n) || {}).type).filter(Boolean));
          M.resolveEvents(s, m.num, "TYPE_EMPTY", e => vendus.has(e.data && e.data.type));
        }
        // v5.34.5 : « Machine vide » si plus rien ; sinon « plus de pain X » quand TOUTES les sélections d'un pain sont à 0
        // (avant : une alerte par sélection vide, même s'il restait ce pain dans d'autres sélections)
        M.stockAlerts(s, m, [...vides]);
      }
      if (!diff.baseline) {
        grouper(sansDoublonFas(nv.eva, nv.fas), e => e.code + "|" + e.date + "|" + e.time).concat(nv.activations).forEach(e => machineEvent(s, m, e));
        grouper(nv.fas, e => e.code + "/" + e.sous + "|" + e.date + "|" + e.time).forEach(e => fasEvent(s, m, e));
        nv.pow.forEach(p => powerEvent(s, m, p));
        nv.temp.forEach(tt => tempEvent(s, m, Number(tt.c), when(tt.date, tt.time)));
      }
      // v5.13 : part payée par carte depuis le relevé d'avant, rangée dans la journée (rc = montant, sc = nombre)
      if (appliquer && prevTot && prevTot.cv != null && audit.cashless_value != null) {
        const dv = Math.round((audit.cashless_value - prevTot.cv) * 100) / 100, dn = audit.cashless_count - prevTot.cn;
        if (dv >= 0 && dn >= 0 && (dv || dn)) M.addDaily(s, x.t, m.num, { rc: dv, sc: dn });
      }
      Reel.setTotals(s, m.num, audit, x.t);
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
      sansDoublonFas(a.events, a.fasErrors).forEach(e => { if (fresh("eva|" + e.code + "|" + e.date + "|" + e.time + "|" + e.active + "|" + e.count)) { machineEvent(s, m, e); n++; } });
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
      const nm = BA.Store.newMachine(o);
      nm.cree = s.now || Date.now();                            // v5.29 : rien de plus ancien ne peut être à elle
      s.machines.push(nm);
      s.machines.sort((a, b) => a.num - b.num);
      return null;
    },
    updateMachine(s, num, v) {
      const m = M.machine(s, num); if (!m) return "rs_err_missing";
      if (v.num != null && Number(v.num) !== m.num) {
        const n = Number(v.num);
        if (!Number.isInteger(n) || n < 1 || n > 99999) return "rs_err_num";
        if (M.machine(s, n)) return "rs_err_num_used";
        // le numéro sert de lien partout : alertes, missions, interventions, pains à déplacer, historique, statistiques
        deplacerNum(s, m.num, n);
        m.num = n;
        s.machines.sort((a, b) => a.num - b.num);
      }
      if (v.street != null) m.street = String(v.street).trim().slice(0, 80);
      if (v.city != null) m.city = String(v.city).trim().slice(0, 60);
      if (v.region != null) m.region = v.region === "bxl" ? "bxl" : "vl";
      // v5.12 : n° de PLAQUE corrigeable (il sert à vérifier qu'un boîtier lit bien cette machine) ;
      // l'identifiant interne (m.id, lien avec Supabase et les boîtiers) ne change pas
      if (v.serial != null) {
        const p = String(v.serial).replace(/\s+/g, "").replace(/^FAS-/i, "");
        if (!p || p.length > 30 || !/^[A-Za-z0-9-]+$/.test(p)) return "rs_err_plate";
        if (/^(FAS)?0*1$/i.test(p)) return "rs_err_plate_generic";
        const norm = x => String(x || "").toUpperCase().replace(/^FAS-?/, "").replace(/[^0-9A-Z]/g, "").replace(/^0+/, "");
        if (s.machines.some(x => x !== m && x.serial && norm(x.serial) === norm(p))) return "rs_err_plate_used";
        m.serial = p;
      }
      return null;
    },
    removeMachine(s, num) {
      const m = M.machine(s, num); if (!m) return "rs_err_missing";
      s.machines = s.machines.filter(x => x !== m);
      s.missions.forEach(x => { if (x.num === m.num && x.status === "open") x.status = "replaced"; });
      detacher(s, m.num, null);          // v5.29 : son historique part sous un numéro fantôme (une autre machine ne le reprendra pas)
      return null;
    },
    reparerNumeros, aReparer, estFantome
  };

  // ---------------- BA.Live : heure réelle et entretien ----------------
  // En ligne : données de la machine reçues il y a moins de 45 min (câble ou 4G), ou boîtier 4G qui a LU la machine
  // il y a peu (v5.11 : un boîtier qui répond sans être branché sur la machine ne compte plus — mode essai, câble absent)
  const onlineNow = (s, m) => !!(m.link && m.lastSeen && s.now - m.lastSeen < (Number(C.onlineMinutes) || 45) * MIN)
    || !!(BA.Boitiers && (BA.Boitiers.machineLue ? BA.Boitiers.machineLue(m.id, s.now) : BA.Boitiers.alive(m.id, s.now)));
  function housekeeping(s, m) {
    const st = s.settings;
    // La porte n'est connue que par les relevés : sans données récentes (câble débranché, machine hors ligne),
    // elle n'est plus affichée ouverte — sauf pendant « Remplir » (porte ouverte par l'opérateur)
    if (m.door && !onlineNow(s, m) && !s.interventions.some(x => x.num === m.num && x.status === "open") && !(BA.Portes && BA.Portes.isOpen(m.id))) { m.door = false; delete m.doorAt; }
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
    // v5.34.5 : « plus de pain X » réglée dès qu'une sélection de ce pain en a de nouveau (ou qu'il n'y a plus de sélection de ce pain)
    M.resolveEvents(s, m.num, "TYPE_EMPTY", e => { const ss = m.sels.filter(x => x.type === (e.data && e.data.type)); return !ss.length || ss.some(x => M.qty(x) > 0); });
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
  // v5.25 : « Remplir » laissé ouvert trop longtemps → clos comme « Annuler » (les étapes déjà validées restent)
  const IT_IDLE = () => Math.max(0.25, Number(C.interventionIdleHours) || 1) * H;
  const IT_MAX = () => Math.max(1, Number(C.interventionMaxHours) || 4) * H;
  function closeStale(s) {
    (s.interventions || []).forEach(it => {
      if (it.status !== "open") return;
      // v5.34.4 : les délais comptent depuis la DERNIÈRE activité (ouverture, reprise, étape validée), pas depuis la création :
      // un Remplir repris par quelqu'un au bout de 55 min n'est plus annulé 5 min plus tard
      const last = Math.max(it.start || 0, it.seen || 0);
      // v5.34.3 : « Remplir » ouvert par erreur / pour une formation : rien de validé depuis ~1 h → ignoré (aucun effet sur le stock)
      const oisif = it.step <= 1 && !(it.inv && it.inv.length) && s.now - last > IT_IDLE();
      if (!oisif && !(s.now - last > IT_MAX())) return;
      it.status = it.step > 1 ? "partial" : "cancelled"; it.end = s.now; it.auto = true;
      const m = M.machine(s, it.num);
      if (m && !(BA.Portes && BA.Portes.isOpen(m.id))) { m.door = false; delete m.doorAt; M.resolveEvents(s, m.num, "DOOR_OPEN"); }
    });
  }
  function housekeepAll(s) {
    closeStale(s);
    s.machines.forEach(m => housekeeping(s, m));
    // alertes de machines supprimées
    const nums = new Set(s.machines.map(m => m.num));
    s.events.forEach(e => { if (!nums.has(e.num) && !e.resolved) { e.resolved = true; e.resolvedAt = s.now; } });
  }

  // v5.25 : copie pour l'essai de l'entretien (toutes les 30 s) : seulement ce que l'entretien peut changer (machines,
  // alertes, interventions, jours d'une machine restée vide). Avant : TOUTES les données (historique compris) étaient
  // copiées toutes les 30 s, de plus en plus lent avec les mois (surtout sur le téléphone).
  function lightCopy(s) {
    const c = Object.assign({}, s);
    c.machines = JSON.parse(JSON.stringify(s.machines));
    c.events = JSON.parse(JSON.stringify(s.events));
    c.interventions = (s.interventions || []).map(it => Object.assign({}, it));
    c.daily = Object.assign({}, s.daily);
    let from = s.now;
    s.events.forEach(e => { if (e.code === "MACHINE_EMPTY" && !e.resolved && e.t < from) from = e.t; });
    const k0 = M.dayKey(from);
    Object.keys(s.daily).forEach(k => { if (k >= k0) c.daily[k] = JSON.parse(JSON.stringify(s.daily[k])); });
    c.now = s.now;
    return c;
  }

  let timer = null, last = 0;
  const Live = {
    derive(s) {
      s.machines.forEach(m => { m.online = onlineNow(s, m); });
    },
    // Entretien seulement s'il change quelque chose (sinon rien n'est envoyé)
    check() {
      const s = BA.Store.get(); if (!s) return;
      const c = lightCopy(s);
      housekeepAll(c);
      const doors = x => x.machines.map(m => m.door ? 1 : 0).join("");
      const its = x => (x.interventions || []).map(i => i.status).join("");
      if (JSON.stringify(c.events) !== JSON.stringify(s.events) || doors(c) !== doors(s) || its(c) !== its(s) || JSON.stringify(c.daily[M.dayKey(s.now)]) !== JSON.stringify(s.daily[M.dayKey(s.now)])) {
        BA.Store.update(housekeepAll, false, { derived: true });
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
    _housekeepAll: housekeepAll,
    _lightCopy: lightCopy
  };

  BA.Reel = Reel;
  BA.Live = Live;
})();
