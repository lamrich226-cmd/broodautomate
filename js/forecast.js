// ============================================================
// BROODAUTOMATE TEST — Prévisions (BA.Forecast)
// - Profil par jour de semaine : pour chaque machine (et pour
//   toutes les machines), les ventes moyennes du lundi, du mardi…
//   sur l'historique choisi (8 semaines par défaut).
// - Calendrier : jours fériés belges, vacances scolaires (Flandre /
//   Bruxelles), fêtes et dates ajoutées par l'admin, avec un effet
//   en % sur les ventes. Les dates proposées sont à confirmer.
// - Décisions : l'admin confirme, modifie ou ignore chaque jour
//   (pour toutes les machines ou une seule).
// - Suggestions « assistant » : version de test, faite de règles.
//   Dans la vraie version, ce sera l'IA qui proposera, et l'admin
//   validera toujours.
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG;
  const M = BA.Model;
  const DAY = M.DAY, dayKey = M.dayKey;

  // ---------------- Dates (clé "AAAA-MM-JJ", heure locale) ----------------
  function parts(k) { const p = k.split("-"); return [+p[0], +p[1] - 1, +p[2]]; }
  function keyMs(k) { const p = parts(k); return new Date(p[0], p[1], p[2]).getTime(); }   // minuit local
  function addDays(k, n) { const p = parts(k); return dayKey(new Date(p[0], p[1], p[2] + n, 12).getTime()); }
  function wday(k) { const p = parts(k); return new Date(p[0], p[1], p[2], 12).getDay(); }   // 0 = dimanche
  function diffDays(a, b) { return Math.round((keyMs(b) - keyMs(a)) / DAY); }                // b − a
  const R = v => Math.round(v * 100);                                                        // coefficient → %

  // Pâques (calendrier grégorien)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayKey(new Date(y, month - 1, day, 12).getTime());
  }
  // Les 10 jours fériés légaux en Belgique
  function publicHolidays(y) {
    const e = easter(y);
    return [
      ["new_year", y + "-01-01"], ["easter_monday", addDays(e, 1)], ["labour", y + "-05-01"],
      ["ascension", addDays(e, 39)], ["whit_monday", addDays(e, 50)], ["national", y + "-07-21"],
      ["assumption", y + "-08-15"], ["all_saints", y + "-11-01"], ["armistice", y + "-11-11"], ["christmas", y + "-12-25"]
    ];
  }

  // Effet proposé au départ (à confirmer, puis à corriger avec l'historique)
  const DEF_EFFECT = { holiday: -40, school: -15, feast: 20, event: 0 };
  const KINDS = ["holiday", "school", "feast", "event"];

  function makeEntry(o) {
    return Object.assign({ id: 0, key: null, group: null, kind: "event", from: "", to: "", name: null, nameKey: null,
      scope: "all", machines: [], effect: 0, perMachine: null, confirmed: false, source: "user" }, o);
  }
  function holidayEntries(y) {
    const out = publicHolidays(y).map(([k, d]) => makeEntry({ key: "be_" + k + "_" + y, group: "be_" + k, kind: "holiday", from: d, to: d,
      nameKey: "hol_" + k, effect: DEF_EFFECT.holiday, source: "be" }));
    [["christmas_eve", y + "-12-24"], ["new_year_eve", y + "-12-31"]].forEach(([k, d]) => out.push(makeEntry({
      key: "eve_" + k + "_" + y, group: "eve_" + k, kind: "feast", from: d, to: d, nameKey: "hol_" + k, effect: DEF_EFFECT.feast, source: "be" })));
    return out;
  }
  function schoolEntries() {
    return C.schoolHolidays.map(sh => makeEntry({ key: "sch_" + sh.region + "_" + sh.key + "_" + sh.from.slice(0, 4), group: "sch_" + sh.region + "_" + sh.key,
      kind: "school", from: sh.from, to: sh.to, nameKey: "sch_" + sh.key, scope: sh.region, effect: DEF_EFFECT.school, source: "school" }));
  }
  // Calendrier de départ : historique (400 jours) + l'année à venir
  function seedCalendar(nowMs) {
    const y = new Date(nowMs).getFullYear(), today = dayKey(nowMs);
    let out = [];
    [y - 1, y, y + 1].forEach(yy => { out = out.concat(holidayEntries(yy)); });
    out = out.concat(schoolEntries());
    const min = addDays(today, -(C.simulator.historyDays + 5)), max = addDays(today, 430);
    out = out.filter(e => e.to >= min && e.from <= max);
    out.forEach(e => { e.confirmed = e.to < today; });       // les dates passées sont acquises
    return sortCal(out);
  }
  function sortCal(list) { return list.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : (a.id || 0) - (b.id || 0)); }

  function applies(e, m) {
    if (e.scope === "all") return true;
    if (e.scope === "list") return (e.machines || []).includes(m.num);
    return m.region === e.scope;
  }
  function effectFor(e, num) { const pm = e.perMachine; return pm && pm[num] != null ? pm[num] : e.effect; }

  // ================= CONTEXTE DE CALCUL =================
  // Calculé une fois par écran : profils de toutes les machines + calendrier indexé par jour
  function context(s) {
    const F = Object.assign({}, C.defaults.forecast, s.settings.forecast || {});
    const ctx = { s, F, today: dayKey(s.now), cal: s.calendar || [], byDay: {}, prof: {}, fleet: null, cache: {}, flat: F.hourly === "flat" };
    ctx.cal.forEach(e => {
      for (let k = e.from, g = 0; k && k <= e.to && g < 450; k = addDays(k, 1), g++) (ctx.byDay[k] = ctx.byDay[k] || []).push(e);
    });
    const sum = C.hourlyTypical.reduce((a, v) => a + v, 0);
    ctx.curve = C.hourlyTypical.map(v => v / sum);
    s.machines.forEach(m => { ctx.prof[m.num] = rawProfile(ctx, m, ctx.today, F.weeks, true); });
    ctx.fleet = fleetProfile(ctx);
    s.machines.forEach(m => resolveProfile(ctx, m));
    return ctx;
  }

  const isAnomaly = (ctx, r) => (r.e || 0) + (r.o || 0) >= ctx.F.anomalyHours;

  // Profil « brut » d'une machine : ventes moyennes par jour de semaine sur W semaines avant endKey
  function rawProfile(ctx, m, endKey, W, useSettings) {
    const F = ctx.F, s = ctx.s;
    const exclSpecial = useSettings ? F.excludeSpecial : true, exclAnom = useSettings ? F.excludeAnomalies : true;
    const recent = useSettings && F.weighting === "recent";
    const sums = [0, 0, 0, 0, 0, 0, 0], ws = [0, 0, 0, 0, 0, 0, 0], samples = [[], [], [], [], [], [], []];
    const excluded = [];
    let nDays = 0;
    for (let i = 1; i <= W * 7; i++) {
      const k = addDays(endKey, -i), d = s.daily[k], r = d && d[m.num];
      if (!r) continue;
      nDays++;
      if (exclAnom && isAnomaly(ctx, r)) { excluded.push({ k, why: "anomaly", h: Math.round(((r.e || 0) + (r.o || 0)) * 10) / 10, v: r.s }); continue; }
      const sp = (ctx.byDay[k] || []).filter(e => applies(e, m));
      if (exclSpecial && sp.length) { excluded.push({ k, why: "special", v: r.s }); continue; }
      const week = Math.ceil(i / 7), w = recent ? 0.5 + 0.5 * (W - week + 1) / W : 1;
      const wd = wday(k);
      sums[wd] += r.s * w; ws[wd] += w; samples[wd].push({ k, v: r.s });
    }
    const avg = sums.map((v, i) => ws[i] ? v / ws[i] : null);
    const have = avg.filter(v => v != null);
    const base = have.length ? have.reduce((a, v) => a + v, 0) / have.length : 0;
    return { num: m.num, avg, base, samples, excluded, nDays, weeksData: nDays / 7, full: have.length === 7 };
  }

  // Profil de toutes les machines : somme des moyennes par jour des machines qui ont assez d'historique
  function fleetProfile(ctx) {
    const avg = [0, 0, 0, 0, 0, 0, 0];
    const ok = ctx.s.machines.filter(m => { const p = ctx.prof[m.num]; return p.full && p.weeksData >= ctx.F.minWeeks && p.base > 0; });
    ok.forEach(m => ctx.prof[m.num].avg.forEach((v, i) => { avg[i] += v; }));
    const base = avg.reduce((a, v) => a + v, 0) / 7;
    return { idx: base ? avg.map(v => v / base) : [1, 1, 1, 1, 1, 1, 1], base, n: ok.length, avg };
  }

  function relLevel(arr) {
    const n = arr.length;
    if (n < 3) return 0;
    const mean = arr.reduce((a, x) => a + x.v, 0) / n;
    if (!mean) return 0;
    const sd = Math.sqrt(arr.reduce((a, x) => a + (x.v - mean) * (x.v - mean), 0) / n);
    const cv = sd / mean;
    if (n >= 6 && cv < 0.25) return 2;
    if (n >= 3 && cv < 0.45) return 1;
    return 0;
  }

  // Réglages manuels encore valables (ceux de plus de N semaines sont ignorés : retour à l'historique)
  function manualState(ctx, num, wd) {
    const man = (ctx.s.profileManual || {})[num];
    if (!man || man[wd] == null) return { set: false };
    const at = ((ctx.s.profileManualAt || {})[num] || {})[wd];
    if (!at) return { set: true, at: null, until: null };
    const until = at + (ctx.F.manualWeeks || 8) * 7 * 86400000;
    return ctx.s.now > until ? { set: false, expired: true } : { set: true, at, until };
  }
  function activeManual(ctx, num) {
    const man = (ctx.s.profileManual || {})[num];
    if (!man || man.length !== 7) return man;
    return man.map((v, wd) => manualState(ctx, num, wd).set ? v : null);
  }

  // Choisit le profil utilisé (machine, toutes les machines ou manuel) et la « journée normale »
  function resolveProfile(ctx, m) {
    const p = ctx.prof[m.num], F = ctx.F, fl = ctx.fleet;
    const manual = activeManual(ctx, m.num);
    const own = p.full && p.weeksData >= F.minWeeks && p.base > 0;
    let src;
    if (manual && manual.length === 7 && manual.some(v => v != null)) src = "manual";
    else if (F.source === "all") src = "all";
    else if (F.source === "machine") src = p.full && p.base > 0 ? "machine" : "all";
    else src = own ? "machine" : "all";
    let idx;
    if (src === "manual") idx = manual.map((v, i) => v == null ? (p.full && p.base > 0 ? p.avg[i] / p.base : fl.idx[i]) : Math.max(0, Number(v) || 0) / 100);
    else if (src === "machine") idx = p.avg.map(v => v / p.base);
    else idx = fl.idx.slice();
    p.ownIdx = p.full && p.base > 0 ? p.avg.map(v => v / p.base) : null;
    if (src !== "machine") {
      // journée normale : chaque jour vendu est « redressé » par l'indice de son jour de semaine
      let a = 0, n = 0;
      p.samples.forEach((arr, wd) => arr.forEach(x => { if (idx[wd] > 0) { a += x.v / idx[wd]; n++; } }));
      p.base = n ? a / n : (fl.n ? fl.base / fl.n : 0);
    }
    p.src = src; p.idx = idx; p.short = !own && src !== "manual";
    p.relWd = p.samples.map(relLevel);
    if (src === "manual") p.rel = "manual";
    else if (p.short) p.rel = "low";
    else { const a = p.relWd.reduce((x, v) => x + v, 0) / 7; p.rel = a >= 1.6 ? "good" : a >= 0.8 ? "medium" : "low"; }
    p.trend = trend(ctx, m, p);
    p.anomalies = p.excluded.filter(x => x.why === "anomaly");
  }

  // Tendance : ventes « redressées » des 14 derniers jours comparées aux 28 jours d'avant
  function trend(ctx, m, p) {
    const s = ctx.s, rec = [], prev = [];
    for (let i = 1; i <= 42; i++) {
      const k = addDays(ctx.today, -i), d = s.daily[k], x = d && d[m.num];
      if (!x || isAnomaly(ctx, x)) continue;
      if ((ctx.byDay[k] || []).some(e => applies(e, m))) continue;
      const v = x.s / (p.idx[wday(k)] || 1);
      (i <= 14 ? rec : prev).push(v);
    }
    if (rec.length < 7 || prev.length < 10) return null;
    const a = rec.reduce((x, y) => x + y, 0) / rec.length, b = prev.reduce((x, y) => x + y, 0) / prev.length;
    return b > 0 ? a / b - 1 : null;
  }

  // ================= COEFFICIENTS PAR JOUR =================
  // auto : indice du jour × effets du calendrier (avant décision de l'admin)
  function auto(ctx, m, k) {
    const ck = "a" + m.num + "|" + k;
    if (ctx.cache[ck]) return ctx.cache[ck];
    const p = ctx.prof[m.num];
    const ents = (ctx.byDay[k] || []).filter(e => applies(e, m));
    let f = 1;
    ents.forEach(e => { f *= Math.max(0, 1 + effectFor(e, m.num) / 100); });
    const wdi = p.idx[wday(k)] != null ? p.idx[wday(k)] : 1;
    return (ctx.cache[ck] = { wd: wdi, ents, cal: f, auto: wdi * f });
  }
  function weighted(ctx, fn) {
    let a = 0, b = 0;
    ctx.s.machines.forEach(m => { const p = ctx.prof[m.num]; if (p.base > 0) { a += p.base * fn(m); b += p.base; } });
    return b ? a / b : 1;
  }
  function fleetAuto(ctx, k) {
    const ck = "fa|" + k;
    if (ctx.cache[ck] == null) ctx.cache[ck] = weighted(ctx, m => auto(ctx, m, k).auto);
    return ctx.cache[ck];
  }
  function fleetWd(ctx, k) { return weighted(ctx, m => auto(ctx, m, k).wd); }

  // Décision enregistrée pour un jour : d'abord celle de la machine, sinon celle de toutes les machines.
  // Une décision devient « à reconfirmer » si la proposition a changé depuis (calendrier modifié…).
  function machineDecision(ctx, m, k) {
    const dd = (ctx.s.dayDecisions || {})[k], d = dd && dd.m && dd.m[m.num];
    if (!d) return null;
    const stale = d.st !== "norm" && Math.abs(R(auto(ctx, m, k).auto) - d.ref) >= 2;
    return Object.assign({ level: "machine", stale }, d);
  }
  function fleetDecision(ctx, k) {
    const dd = (ctx.s.dayDecisions || {})[k], d = dd && dd.all;
    if (!d) return null;
    const stale = d.st !== "norm" && Math.abs(R(fleetAuto(ctx, k)) - d.ref) >= 2;
    return Object.assign({ level: "all", stale }, d);
  }

  // Coefficient utilisé pour la commande (1 = journée normale de la machine)
  function final(ctx, m, k) {
    const ck = "f" + m.num + "|" + k;
    if (ctx.cache[ck] != null) return ctx.cache[ck];
    const a = auto(ctx, m, k).auto;
    let v = a;
    const md = machineDecision(ctx, m, k);
    if (md && !md.stale) v = md.st === "mod" ? md.pct / 100 : md.st === "norm" ? 1 : a;
    else {
      const fd = fleetDecision(ctx, k);
      if (fd && !fd.stale) {
        const fa = fleetAuto(ctx, k);
        v = fd.st === "norm" ? 1 : fd.st === "mod" ? (fa > 0 ? a * (fd.pct / 100) / fa : fd.pct / 100) : a;
      }
    }
    return (ctx.cache[ck] = Math.max(0, v));
  }
  function fleetFinal(ctx, k) { return weighted(ctx, m => final(ctx, m, k)); }

  // Part des ventes d'une journée qui tombe entre a et b
  function dayFraction(ctx, d0, d1, a, b) {
    if (b <= a) return 0;
    if (ctx.flat) return (b - a) / (d1 - d0);
    const dt = new Date(d0), y = dt.getFullYear(), mo = dt.getMonth(), da = dt.getDate();
    let f = 0;
    for (let h = 0; h < 24; h++) {
      const hs = new Date(y, mo, da, h).getTime(), he = h === 23 ? d1 : new Date(y, mo, da, h + 1).getTime();
      const ov = Math.min(b, he) - Math.max(a, hs);
      if (ov > 0 && he > hs) f += ctx.curve[h] * ov / (he - hs);
    }
    return f;
  }

  // Ventes prévues d'une machine entre deux moments (normal = true : sans effet des jours)
  function salesBetween(ctx, m, a, b, normal) {
    if (!(b > a)) return 0;
    const p = ctx.prof[m.num];
    let total = 0;
    for (let k = dayKey(a), g = 0; g < 60; k = addDays(k, 1), g++) {
      const d0 = keyMs(k), d1 = keyMs(addDays(k, 1));
      if (d0 >= b) break;
      const fr = dayFraction(ctx, d0, d1, Math.max(a, d0), Math.min(b, d1));
      if (fr > 0) total += p.base * (normal ? 1 : final(ctx, m, k)) * fr;
    }
    return total;
  }

  // ================= HISTORIQUE (pour l'écran de confirmation) =================
  function lastYearMatch(ctx, e) {
    if (!e.group) return null;
    let best = null, bd = 0;
    ctx.cal.forEach(x => {
      if (x === e || x.group !== e.group || x.scope !== e.scope) return;
      const d = diffDays(x.from, e.from);
      if (d >= 300 && d <= 430 && (!best || d < bd)) { best = x; bd = d; }
    });
    return best;
  }
  // Même jour l'an dernier : la même fête / les mêmes vacances, sinon le même jour de semaine 52 semaines avant
  function lastYearKey(ctx, k, ents) {
    for (const e of ents) {
      const ly = lastYearMatch(ctx, e);
      if (ly) { const kk = addDays(ly.from, diffDays(e.from, k)); if (kk <= ly.to) return { k: kk, e: ly }; }
    }
    return { k: addDays(k, -364), e: null };
  }
  function lastSame(ctx, k, n, getV) {
    const out = [], wd = wday(k);
    for (let i = 1; i <= 70 && out.length < n; i++) {
      const kk = addDays(ctx.today, -i);
      if (wday(kk) !== wd) continue;
      const v = getV(kk);
      if (v != null) out.push({ k: kk, v: v.v, flag: v.flag });
    }
    return out;
  }
  function fleetValue(ctx, k) {
    const d = ctx.s.daily[k];
    if (!d) return null;
    let v = 0, any = false;
    ctx.s.machines.forEach(m => { const r = d[m.num]; if (r) { v += r.s; any = true; } });
    return any ? { v, flag: (ctx.byDay[k] || []).length ? "special" : null } : null;
  }
  function machineValue(ctx, m, k) {
    const d = ctx.s.daily[k], r = d && d[m.num];
    if (!r) return null;
    return { v: r.s, flag: isAnomaly(ctx, r) ? "anomaly" : (ctx.byDay[k] || []).some(e => applies(e, m)) ? "special" : null };
  }

  // Lignes du tableau « Prévision à confirmer » (num = null : toutes les machines)
  function dayRows(ctx, from, passage, next, num) {
    const rows = [];
    const m = num != null ? M.machine(ctx.s, num) : null;
    for (let k = dayKey(from), g = 0; g < 21; k = addDays(k, 1), g++) {
      const d0 = keyMs(k), d1 = keyMs(addDays(k, 1));
      if (d0 >= next) break;
      const before = Math.min(passage, d1) > Math.max(from, d0);
      const after = Math.min(next, d1) > Math.max(passage, d0);
      const row = { k, wd: wday(k), part: before && after ? "both" : before ? "before" : "after" };
      if (m) {
        const a = auto(ctx, m, k), p = ctx.prof[m.num];
        row.wdIdx = a.wd; row.ents = a.ents.map(e => ({ e, eff: effectFor(e, m.num) })); row.auto = a.auto;
        row.final = final(ctx, m, k);
        row.dec = machineDecision(ctx, m, k) || fleetDecision(ctx, k);
        row.expected = p.base * row.final;
        row.hist = lastSame(ctx, k, 4, kk => machineValue(ctx, m, kk));
        const ly = lastYearKey(ctx, k, a.ents);
        row.ly = { k: ly.k, e: ly.e, v: (machineValue(ctx, m, ly.k) || {}).v };
        row.rel = p.rel === "manual" ? "manual" : p.short ? "low" : ["low", "medium", "good"][p.relWd[row.wd]];
      } else {
        row.wdIdx = fleetWd(ctx, k);
        const seen = new Set();
        row.ents = [];
        ctx.s.machines.forEach(mm => auto(ctx, mm, k).ents.forEach(e => {
          if (seen.has(e)) return;
          seen.add(e);
          const n = ctx.s.machines.filter(x => applies(e, x)).length;
          row.ents.push({ e, eff: e.effect, per: !!e.perMachine, n });
        }));
        row.auto = fleetAuto(ctx, k);
        row.final = fleetFinal(ctx, k);
        row.dec = fleetDecision(ctx, k);
        row.expected = ctx.s.machines.reduce((a, mm) => a + ctx.prof[mm.num].base * final(ctx, mm, k), 0);
        row.hist = lastSame(ctx, k, 4, kk => fleetValue(ctx, kk));
        const ly = lastYearKey(ctx, k, row.ents.map(x => x.e));
        row.ly = { k: ly.k, e: ly.e, v: (fleetValue(ctx, ly.k) || {}).v };
        // fiabilité : moyenne (pondérée par les ventes) des machines pour ce jour de semaine
        const lv = weighted(ctx, mm => { const p = ctx.prof[mm.num]; return p.short ? 0 : p.rel === "manual" ? 2 : p.relWd[row.wd]; });
        row.rel = lv >= 1.6 ? "good" : lv >= 0.8 ? "medium" : "low";
      }
      // fenêtres réellement comptées : avant le passage (retirées du stock) et après (pour le prochain passage)
      const bA = Math.max(from, d0), bB = Math.min(passage, d1), aA = Math.max(passage, d0), aB = Math.min(next, d1);
      row.wb = before ? [bA, bB, dayFraction(ctx, d0, d1, bA, bB) * row.expected] : null;
      row.wa = after ? [aA, aB, dayFraction(ctx, d0, d1, aA, aB) * row.expected] : null;
      row.d1 = d1;
      row.pending = !row.dec || row.dec.stale;
      rows.push(row);
    }
    return rows;
  }

  // ================= APPRENTISSAGE (« l'an dernier ») =================
  // Effet réel d'une date du calendrier, mesuré sur la même période l'an dernier,
  // pour chaque machine concernée et pour toutes les machines.
  function learnEntry(ctx, e) {
    const ck = "L|" + (e.id || e.key);
    if (ctx.cache[ck] !== undefined) return ctx.cache[ck];
    const ly = lastYearMatch(ctx, e);
    let res = null;
    if (ly) {
      const keys = [];
      for (let k = ly.from; k <= ly.to && keys.length < 21; k = addDays(k, 1)) keys.push(k);
      const per = {};
      let A = 0, B = 0;
      ctx.s.machines.forEach(m => {
        if (!applies(e, m)) return;
        const ref = rawProfile(ctx, m, ly.from, 6, false);
        if (!ref.full || !ref.base) return;
        let a = 0, b = 0;
        keys.forEach(k => {
          const d = ctx.s.daily[k], r = d && d[m.num];
          if (!r || isAnomaly(ctx, r)) return;
          let f = 1;
          (ctx.byDay[k] || []).forEach(o => { if (o !== ly && applies(o, m)) f *= Math.max(0, 1 + effectFor(o, m.num) / 100); });
          const exp = ref.avg[wday(k)] * f;
          if (exp > 0) { a += r.s; b += exp; }
        });
        if (b > 0) { per[m.num] = Math.round((a / b - 1) * 100); A += a; B += b; }
      });
      if (B > 0) res = { ly, fleet: Math.round((A / B - 1) * 100), per, n: keys.length };
    }
    ctx.cache[ck] = res;
    return res;
  }

  // ================= SUGGESTIONS DE L'ASSISTANT (simulation) =================
  function suggestions(ctx, from, passage, next) {
    const out = [];
    const k0 = dayKey(from), k1 = dayKey(next - 1);
    const ents = ctx.cal.filter(e => e.to >= k0 && e.from <= k1);
    ents.forEach(e => {
      const L = learnEntry(ctx, e);
      if (L) {
        const diffs = Object.keys(L.per).map(Number).filter(n => Math.abs(L.per[n] - effectFor(e, n)) >= 8);
        if (diffs.length || !e.confirmed) out.push({ id: "learn:" + e.id, kind: "learn", sev: "info", e, L, diffs });
      } else if (!e.confirmed) out.push({ id: "confirm:" + e.id, kind: "confirm", sev: "info", e });
    });
    // jours calmes / forts pour l'ensemble des machines
    for (let k = k0, g = 0; k <= k1 && g < 21; k = addDays(k, 1), g++) {
      const v = fleetFinal(ctx, k);
      if (v > 0.8 && v < 1.2) continue;
      const weak = v <= 0.8;
      const list = ctx.s.machines.map(m => ({ m, v: final(ctx, m, k), a: auto(ctx, m, k) }))
        .sort((x, y) => weak ? x.v - y.v : y.v - x.v).slice(0, 4);
      out.push({ id: "day:" + k, kind: weak ? "weak" : "strong", sev: "info", k, v, list });
    }
    // tendances
    ctx.s.machines.forEach(m => {
      const p = ctx.prof[m.num];
      if (p.trend != null && Math.abs(p.trend) >= 0.18) out.push({ id: "trend:" + m.num, kind: "trend", sev: "info", m, v: p.trend });
    });
    // jours exclus de l'historique (machine vide / coupure)
    const anom = ctx.s.machines.filter(m => ctx.prof[m.num].anomalies.length >= 4)
      .map(m => ({ m, n: ctx.prof[m.num].anomalies.length }));
    if (anom.length) out.push({ id: "anomaly", kind: "anomaly", sev: "info", list: anom });
    // historique trop court
    const short = ctx.s.machines.filter(m => ctx.prof[m.num].short);
    if (short.length) out.push({ id: "short", kind: "short", sev: "info", list: short.map(m => ({ m, w: ctx.prof[m.num].weeksData })) });
    return out;
  }

  // ================= PROFIL PAR TYPE DE PAIN =================
  // Part de chaque type dans les ventes d'une journée : r.y si elle existe, sinon selon la capacité
  function capShares(m) {
    const cap = {}, tot = m.sels.reduce((a, x) => a + x.cap, 0) || 1;
    m.sels.forEach(x => { cap[x.type] = (cap[x.type] || 0) + x.cap; });
    const sh = {}; Object.keys(cap).forEach(ty => { sh[ty] = cap[ty] / tot; });
    return sh;
  }
  // Pour une machine : types, historique moyen par jour de semaine et par type (même filtres que le profil)
  function typeDetail(ctx, m) {
    ctx.td = ctx.td || {};
    if (ctx.td[m.num]) return ctx.td[m.num];
    const p = ctx.prof[m.num], s = ctx.s, cs = capShares(m), types = Object.keys(cs);
    const sw = Array.from({ length: 7 }, () => ({ s: 0, t: {} })), all = { s: 0, t: {} };
    p.samples.forEach((arr, wd) => arr.forEach(x => {
      const r = (s.daily[x.k] || {})[m.num]; if (!r || !r.s) return;
      const ys = r.y ? Object.values(r.y).reduce((a, v) => a + v, 0) : 0;
      types.forEach(ty => {
        const n = ys > 0 ? (r.y[ty] || 0) / ys * r.s : cs[ty] * r.s;
        sw[wd].t[ty] = (sw[wd].t[ty] || 0) + n; all.t[ty] = (all.t[ty] || 0) + n;
      });
      sw[wd].s += r.s; all.s += r.s;
    }));
    const frac = o => { const f = {}; types.forEach(ty => { f[ty] = o.s > 0 ? (o.t[ty] || 0) / o.s : cs[ty]; }); return f; };
    const shareWd = sw.map(frac), shareAll = frac(all);
    const have = p.avg.filter(v => v != null);
    const ownBase = have.length ? have.reduce((a, v) => a + v, 0) / have.length : 0;
    const base = ownBase > 0 ? ownBase : p.base;
    const hist = p.avg.map((v, wd) => { const o = {}; types.forEach(ty => { o[ty] = (v || 0) * shareWd[wd][ty]; }); return o; });
    const normal = {}; types.forEach(ty => { normal[ty] = base * shareAll[ty]; });
    const man = {};
    Object.keys((s.profileTypes || {})[m.num] || {}).forEach(wd => { if (manualState(ctx, m.num, Number(wd)).set) man[wd] = s.profileTypes[m.num][wd]; });
    const used = Array.from({ length: 7 }, (_, wd) => {
      if (man[wd]) return Object.assign({}, man[wd]);
      const o = {}; types.forEach(ty => { o[ty] = p.base * (p.idx[wd] || 0) * shareWd[wd][ty]; }); return o;
    });
    return (ctx.td[m.num] = { types, hist, normal, used, shareWd, shareAll, ownBase: base, manualDays: Object.keys(man).map(Number) });
  }
  // Part de chaque sélection dans les ventes de la machine : type (historique ou réglé à la main) puis capacité
  function selShares(ctx, m) {
    const d = typeDetail(ctx, m), man = {};
    Object.keys((ctx.s.profileTypes || {})[m.num] || {}).forEach(wd => { if (manualState(ctx, m.num, Number(wd)).set) man[wd] = ctx.s.profileTypes[m.num][wd]; });
    const sh = {};
    d.types.forEach(ty => {
      let a = 0;
      for (let wd = 0; wd < 7; wd++) {
        const mw = man[wd];
        if (mw) { const tot = Object.values(mw).reduce((x, v) => x + v, 0); a += tot > 0 ? (mw[ty] || 0) / tot : d.shareWd[wd][ty]; }
        else a += d.shareWd[wd][ty];
      }
      sh[ty] = a / 7;
    });
    const capOf = {};
    m.sels.forEach(x => { capOf[x.type] = (capOf[x.type] || 0) + x.cap; });
    const out = {}; let tot = 0;
    m.sels.forEach(x => { out[x.n] = (sh[x.type] || 0) * x.cap / capOf[x.type]; tot += out[x.n]; });
    if (!(tot > 0)) { const t0 = m.sels.reduce((a, x) => a + x.cap, 0) || 1; m.sels.forEach(x => { out[x.n] = x.cap / t0; }); }
    else m.sels.forEach(x => { out[x.n] /= tot; });
    return out;
  }

  BA.Forecast = {
    typeDetail, selShares, manualState,
    KINDS, DEF_EFFECT,
    keyMs, addDays, wday, diffDays, easter, publicHolidays, holidayEntries, schoolEntries, seedCalendar, sortCal, makeEntry,
    applies, effectFor, context, auto, final, fleetAuto, fleetFinal, fleetWd, salesBetween, dayRows,
    machineDecision, fleetDecision, learnEntry, lastYearMatch, suggestions, rawProfile
  };
})();
