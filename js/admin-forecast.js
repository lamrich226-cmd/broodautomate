// ============================================================
// BROODAUTOMATE TEST — Admin : prévisions (BA.AdminFC)
// - Commander : « Prévision à confirmer » (jour par jour, toutes
//   les machines ou une seule), suggestions de l'assistant,
//   conseils de chargement après le calcul.
// - Onglet « Prévisions & calendrier » : calendrier modifiable,
//   profils par jour de chaque machine.
// - Paramètres : réglages de l'historique et des prévisions.
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E, FC = BA.Forecast;
  const t = (k, v) => BA.I18n.t(k, v);
  const R = v => Math.round(v * 100);
  const pct = v => R(v) + " %";
  const WDS = [1, 2, 3, 4, 5, 6, 0];                    // lundi → dimanche
  const KIND_ICON = { holiday: "📅", school: "🎒", feast: "🎉", event: "📍" };
  const idxCls = v => v >= 1.15 ? "idx-hi" : v <= 0.65 ? "idx-vlo" : v <= 0.85 ? "idx-lo" : "";
  const entryName = e => e.name ? E(e.name) : t(e.nameKey);
  const relTag = r => `<span class="tag rel-${r}">${t("rel_" + r)}</span>`;
  const dayLabel = k => F.dayShort(FC.keyMs(k));
  const sh = () => BA.Shell.state;

  function rangeLabel(e) {
    if (e.from === e.to) return dayLabel(e.from) + "/" + e.from.slice(0, 4);
    return F.keyShort(e.from) + " → " + F.key(e.to);
  }
  function scopeLabel(s, e) {
    if (e.scope === "all") return t("scope_all");
    if (e.scope === "list") return (e.machines || []).map(n => "#" + n).join(", ");
    return t("scope_" + e.scope) + " (" + s.machines.filter(m => m.region === e.scope).length + ")";
  }
  function entTag(s, x, fleet) {
    const e = x.e;
    return `<div class="ent"><span class="tag cal-${e.kind}">${KIND_ICON[e.kind] || ""} ${entryName(e)} ${F.signed(x.eff)}${fleet && x.per ? "*" : ""}</span>` +
      `${e.confirmed ? "" : `<span class="tag c-remove">${t("to_confirm")}</span>`}` +
      `${fleet && e.scope !== "all" ? `<span class="petit"> ${E(scopeLabel(s, e))}</span>` : ""}</div>`;
  }

  // ================= COMMANDER : PRÉVISION À CONFIRMER =================
  function ensureOrderState(s, o) {
    o.sugg = o.sugg || {}; o.loadAdj = o.loadAdj || {}; o.advDone = o.advDone || {};
    const F2 = Object.assign({}, BA_CONFIG.defaults.forecast, s.settings.forecast || {});
    // prochain passage : par défaut 24 h après celui-ci (réglable), sauf si l'admin l'a changé
    if (!o.nextManual || !o.nextAt || o.nextAt <= o.passageAt) {
      o.nextAt = M.addHoursLocal(o.passageAt, F2.nextVisitHours || 24);
      o.nextManual = false;
    }
    if (!o.fcView) o.fcView = "all";
    if (!o.fcMachine && s.machines[0]) o.fcMachine = s.machines[0].num;   // (v5 : flotte vide possible)
  }

  function histCell(r) {
    const h = r.hist.map(x => x.flag ? `<i title="${t(x.flag === "anomaly" ? "fc_flag_anomaly" : "fc_flag_special")}">${x.v}*</i>` : x.v).join(" · ");
    const ly = r.ly && r.ly.v != null
      ? `<div class="petit">${t("fc_ly", { d: F.key(r.ly.k), v: r.ly.v })}${r.ly.e ? " · " + entryName(r.ly.e) : ""}</div>` : "";
    return `<div class="petit">${t("fc_last4", { wd: F.wdName(r.wd) })}</div>${h || "—"}${ly}`;
  }

  function decCell(r, o, view) {
    const k = r.k;
    if (o.fcEdit && o.fcEdit.k === k && o.fcEdit.num === view) {
      return `<span class="dec-edit"><input type="number" class="num-in" id="fc-pct" min="0" max="400" value="${R(r.final)}"> %
        <button class="btn petit" data-fcok="${k}">OK</button><button class="btn petit secondary" data-fccancel="1">✖</button></span>`;
    }
    const d = r.dec;
    const inherited = view != null && d && d.level === "all";
    let tag = "";
    if (d && !d.stale) {
      tag = d.st === "ok" ? `<span class="tag c-ok">✔ ${t("fc_confirmed")} ${pct(r.final)}</span>`
        : d.st === "mod" ? `<span class="tag c-mod">✏ ${t("fc_modified")} ${pct(r.final)}</span>`
        : `<span class="tag c-norm">↺ ${t("fc_normal")}</span>`;
      if (inherited) tag += `<div class="petit">${t("fc_dec_all")}</div>`;
    } else if (d && d.stale) tag = `<span class="tag c-remove">⚠ ${t("fc_stale")}</span>`;
    const btns = `<div class="dec-btns"><button class="btn petit" data-fcd="ok" data-k="${k}">✔ ${t("fc_btn_ok")}</button>` +
      `<button class="btn petit secondary" data-fcd="mod" data-k="${k}" title="${t("fc_btn_mod")}">✏ ${t("fc_btn_mod")}</button>` +
      `<button class="btn petit secondary" data-fcd="norm" data-k="${k}" title="${t("fc_btn_norm_help")}">↺ 100 %</button></div>`;
    if (!d || d.stale || inherited) return tag + btns;
    return tag + ` <button class="btn petit secondary" data-fcd="clear" data-k="${k}">${t("fc_change")}</button>`;
  }

  const hm = (ms, d1) => ms >= d1 ? "24:00" : new Date(ms).toTimeString().slice(0, 5);
  function winLines(r) {
    const L = (w, key) => w ? `<div class="petit"><b>${t(key)}</b> ${hm(w[0], r.d1)} → ${hm(w[1], r.d1)} : ≈ ${F.num(w[2])}</div>` : "";
    if (!r.wb && !r.wa) return "";
    return L(r.wb, "fc_win_before") + L(r.wa, "fc_win_after");
  }
  function dayTable(ctx, rows, o, view) {
    const s = ctx.s;
    return `<div class="table-scroll"><table class="compact fc-table">
      <thead><tr><th>${t("fc_col_day")}</th><th>${t("fc_col_wd")}</th><th>${t("fc_col_cal")}</th><th>${t("fc_col_auto")}</th>
        <th>${t("fc_col_hist")}</th><th>${t("fc_col_rel")}</th><th>${t("fc_col_exp")}</th><th>${t("fc_col_dec")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.pending ? "pending" : ""}">
        <td><b>${dayLabel(r.k)}</b><div class="petit">${t("fc_part_" + r.part)}</div></td>
        <td><span class="idx ${idxCls(r.wdIdx)}">${pct(r.wdIdx)}</span></td>
        <td>${r.ents.length ? r.ents.map(x => entTag(s, x, view == null)).join("") : "—"}</td>
        <td><b class="idx ${idxCls(r.auto)}">${pct(r.auto)}</b></td>
        <td>${histCell(r)}</td>
        <td>${relTag(r.rel)}</td>
        <td>≈ ${F.num(r.expected)}<div class="petit">${t("fc_breads_day")}</div>${winLines(r)}</td>
        <td class="dec">${decCell(r, o, view)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function machineInfo(ctx, num) {
    const p = ctx.prof[num], m = M.machine(ctx.s, num);
    const src = p.src === "machine" ? t("src_machine", { w: ctx.F.weeks }) : p.src === "manual" ? t("src_manual")
      : p.short ? t("src_all_short", { w: F.num(p.weeksData, 1) }) : t("src_all");
    return `<div class="fc-minfo"><b>#${num}</b> ${E(m.street)}, ${E(m.city)} · ${t("fc_base", { n: F.num(p.base, 1) })} · ${src} · ${relTag(p.rel)}` +
      `${p.trend != null ? " · " + t("fc_trend", { v: F.signed(p.trend * 100) }) : ""}` +
      ` · ${t("fc_excluded", { a: p.anomalies.length, b: p.excluded.length - p.anomalies.length })}</div>`;
  }

  function forecastSection(s, o) {
    ensureOrderState(s, o);
    const ctx = FC.context(s);
    const fleetRows = FC.dayRows(ctx, s.now, o.passageAt, o.nextAt, null);
    const pending = fleetRows.filter(r => r.pending);
    const view = o.fcView === "machine" ? o.fcMachine : null;
    const rows = view != null ? FC.dayRows(ctx, s.now, o.passageAt, o.nextAt, view) : fleetRows;
    const sugg = FC.suggestions(ctx, s.now, o.passageAt, o.nextAt).filter(x => !o.sugg[x.id]);
    return `
      <div class="card q-card fc-card" id="fc">
        <div class="q-title">📅 ${t("fc_title")}</div>
        <p class="note">${t("fc_intro", { a: F.dt(s.now), b: F.dt(o.passageAt) })}</p>
        <label class="field-row">${t("fc_next")} <input type="datetime-local" id="next-at" value="${F.toInput(o.nextAt)}"></label>
        <p class="petit">${t("fc_next_help", { h: s.settings.thrHours })}</p>
        <div class="toolbar">
          <div class="seg"><button data-fcview="all" class="${view == null ? "active" : ""}">🌍 ${t("all_machines")}</button><button data-fcview="machine" class="${view != null ? "active" : ""}">🔎 ${t("fc_one_machine")}</button></div>
          ${view != null ? `<select id="fc-machine" class="auto-w">${s.machines.map(m => `<option value="${m.num}" ${m.num === view ? "selected" : ""}>#${m.num} — ${E(m.street)}</option>`).join("")}</select>` : ""}
          <span class="chip ${pending.length ? "c-remove" : ""}">${pending.length ? t("fc_pending_n", { n: pending.length }) : "✔ " + t("fc_all_done")}</span>
          ${pending.length ? `<button class="btn" id="fc-all">✔ ${t("fc_confirm_all")}</button>` : ""}
        </div>
        ${view != null ? machineInfo(ctx, view) + `<p class="petit">${t("fc_machine_note")}</p>` : `<p class="petit">${t("fc_fleet_note")}</p>`}
        ${dayTable(ctx, rows, o, view)}
        <p class="petit">${t("fc_legend")}</p>
      </div>
      ${suggHtml(ctx, sugg)}
      <div class="card q-card">
        ${pending.length ? `<div class="alert warn">${t("fc_need_confirm", { n: pending.length })}</div>` : ""}
        <button class="btn" id="fc-calc" ${pending.length ? "disabled" : ""}>🧮 ${t("btn_calc")}</button>
      </div>`;
  }

  // ---------------- Suggestions de l'assistant ----------------
  function machineReasons(s, x) {
    const out = [];
    x.a.ents.forEach(e => out.push(entryName(e) + " " + F.signed(FC.effectFor(e, x.m.num))));
    if (x.a.wd <= 0.85) out.push(t("sg_r_wd_low", { v: pct(x.a.wd) }));
    if (x.a.wd >= 1.15) out.push(t("sg_r_wd_high", { v: pct(x.a.wd) }));
    return out.join(", ");
  }
  function suggCard(ctx, x) {
    const s = ctx.s;
    let ic = "🤖", title = "", text = "", btns = "";
    const b = (act, label, sec) => `<button class="btn petit ${sec ? "secondary" : ""}" data-sa="${act}" data-sid="${E(x.id)}">${label}</button>`;
    const dismiss = b("dismiss", t("sg_ok"), true);
    if (x.kind === "learn") {
      const per = Object.keys(x.L.per).map(Number).sort((a, c) => x.L.per[a] - x.L.per[c]);
      const show = per.length > 8 ? per.slice(0, 5).concat(["…"], per.slice(-2)) : per;
      ic = "🧠"; title = t("sg_learn_t", { name: entryName(x.e), d: rangeLabel(x.e) });
      text = t("sg_learn", { ly: rangeLabel(x.L.ly), v: F.signed(x.L.fleet), cur: F.signed(x.e.effect) }) +
        `<div class="sg-list">${show.map(n => n === "…" ? "…" : `<span class="chip">#${n} ${F.signed(x.L.per[n])}</span>`).join(" ")}</div>` +
        `<div class="petit">${t("sg_learn_why")}</div>`;
      btns = b("learn", "✔ " + t("sg_apply")) + (x.e.confirmed ? "" : b("cal-confirm", t("sg_keep", { v: F.signed(x.e.effect) }), true)) + b("dismiss", t("sg_ignore"), true);
    } else if (x.kind === "confirm") {
      ic = "📅"; title = t("sg_confirm_t", { name: entryName(x.e), d: rangeLabel(x.e) });
      text = t("sg_confirm", { v: F.signed(x.e.effect), m: E(scopeLabel(s, x.e)) });
      btns = b("cal-confirm", "✔ " + t("fc_btn_ok")) + b("go-cal", "✏ " + t("sg_edit_cal"), true) + b("dismiss", t("sg_ignore"), true);
    } else if (x.kind === "weak" || x.kind === "strong") {
      ic = x.kind === "weak" ? "🌙" : "🔥";
      title = t(x.kind === "weak" ? "sg_weak_t" : "sg_strong_t", { d: dayLabel(x.k), v: pct(x.v) });
      text = `<div class="sg-list">${x.list.map(y => `<span class="chip">#${y.m.num} ${pct(y.v)}${machineReasons(s, y) ? " · " + machineReasons(s, y) : ""}</span>`).join(" ")}</div>` +
        (x.kind === "weak" && FC.wday(x.k) === 3 ? `<div class="petit">${t("sg_wed_hint")}</div>` : "") +
        `<div class="petit">${t(x.kind === "weak" ? "sg_weak" : "sg_strong")}</div>`;
      btns = dismiss;
    } else if (x.kind === "trend") {
      ic = x.v < 0 ? "📉" : "📈";
      title = t("sg_trend_t", { m: x.m.num, v: F.signed(x.v * 100) });
      text = t(x.v < 0 ? "sg_trend_down" : "sg_trend_up", { v: F.signed(x.v * 100) });
      btns = b("trend", "✔ " + t("sg_trend_apply")) + b("dismiss", t("sg_ignore"), true);
    } else if (x.kind === "anomaly") {
      ic = "🧹"; title = t("sg_anom_t");
      text = `<div class="sg-list">${x.list.map(y => `<span class="chip">#${y.m.num} : ${t("sg_n_days", { n: y.n })}</span>`).join(" ")}</div><div class="petit">${t("sg_anom", { h: ctx.F.anomalyHours })}</div>`;
      btns = dismiss;
    } else if (x.kind === "short") {
      ic = "🆕"; title = t("sg_short_t");
      text = `<div class="sg-list">${x.list.map(y => `<span class="chip">#${y.m.num} : ${t("sg_n_weeks", { n: F.num(y.w, 1) })}</span>`).join(" ")}</div><div class="petit">${t("sg_short", { w: ctx.F.minWeeks })}</div>`;
      btns = dismiss;
    }
    return `<div class="sugg sev-${x.sev}"><div class="sugg-ic">${ic}</div><div class="sugg-body"><b>${title}</b><div class="sugg-text">${text}</div><div class="sugg-actions">${btns}</div></div></div>`;
  }
  function suggHtml(ctx, list) {
    return `<div class="card q-card sugg-box"><div class="q-title">🤖 ${t("sg_title")}</div>
      <p class="petit">${t("sg_note")}</p>
      ${list.length ? list.map(x => suggCard(ctx, x)).join("") : `<p class="note">${t("sg_none")}</p>`}</div>`;
  }

  // Branche les boutons de l'écran « Prévision à confirmer »
  function bindForecast(el, o, rerender) {
    const reset = () => { o.plan = null; o.sent = null; };
    const view = o.fcView === "machine" ? o.fcMachine : null;
    const na = el.querySelector("#next-at");
    if (na) U.dateInput(na, val => { const v = F.fromInput(val); if (v && v > o.passageAt) { o.nextAt = v; o.nextManual = true; } reset(); U.afterClick(rerender); });
    el.querySelectorAll("[data-fcview]").forEach(b => b.onclick = () => { o.fcView = b.dataset.fcview; o.fcEdit = null; rerender(); });
    const fm = el.querySelector("#fc-machine");
    if (fm) fm.onchange = () => { o.fcMachine = Number(fm.value); o.fcEdit = null; rerender(); };
    const rowAuto = k => {
      const ctx = FC.context(BA.Store.get());
      return view != null ? FC.auto(ctx, M.machine(ctx.s, view), k).auto : FC.fleetAuto(ctx, k);
    };
    el.querySelectorAll("[data-fcd]").forEach(b => b.onclick = () => {
      const k = b.dataset.k, act = b.dataset.fcd;
      if (act === "mod") { o.fcEdit = { k, num: view }; rerender(); const i = el.querySelector("#fc-pct"); if (i) i.focus(); return; }
      if (act === "clear") BA.Actions.setDayDecision(k, view, null);
      else BA.Actions.setDayDecision(k, view, { st: act, pct: act === "norm" ? 100 : null, ref: R(rowAuto(k)) });
      reset(); rerender();
    });
    el.querySelectorAll("[data-fcok]").forEach(b => b.onclick = () => {
      const i = el.querySelector("#fc-pct"), v = Math.round(Number(i && i.value));
      if (!(v >= 0 && v <= 400)) { if (i) i.classList.add("bad"); return; }
      BA.Actions.setDayDecision(b.dataset.fcok, view, { st: "mod", pct: v, ref: R(rowAuto(b.dataset.fcok)) });
      o.fcEdit = null; reset(); rerender();
    });
    el.querySelectorAll("[data-fccancel]").forEach(b => b.onclick = () => { o.fcEdit = null; rerender(); });
    const all = el.querySelector("#fc-all");
    if (all) all.onclick = () => {
      const ctx = FC.context(BA.Store.get());
      const rows = FC.dayRows(ctx, ctx.s.now, o.passageAt, o.nextAt, null).filter(r => r.pending);
      BA.Actions.confirmDays(rows.map(r => ({ k: r.k, ref: R(r.auto) })));
      reset(); rerender();
    };
    // suggestions
    el.querySelectorAll("[data-sa]").forEach(b => b.onclick = () => {
      const ctx = FC.context(BA.Store.get());
      const x = FC.suggestions(ctx, ctx.s.now, o.passageAt, o.nextAt).find(y => y.id === b.dataset.sid);
      const act = b.dataset.sa;
      if (!x) { rerender(); return; }
      if (act === "dismiss") o.sugg[x.id] = "dismissed";
      else if (act === "learn") { BA.Actions.calendarLearn(x.e.id, x.L.fleet, x.L.per); o.sugg[x.id] = "done"; reset(); }
      else if (act === "cal-confirm") { BA.Actions.calendarUpdate(x.e.id, { confirmed: true }); o.sugg[x.id] = "done"; reset(); }
      else if (act === "go-cal") { const v = sh().fcv = sh().fcv || {}; v.tab = "cal"; v.filter = "next"; BA.Shell.go("forecast"); return; }
      else if (act === "trend") {
        const m = M.machine(ctx.s, x.m.num);
        const rows = FC.dayRows(ctx, ctx.s.now, o.passageAt, o.nextAt, m.num);
        BA.Actions.applyTrend(m.num, rows.map(r => ({ k: r.k, pct: Math.max(0, Math.round(r.auto * (1 + x.v) * 100)), ref: R(r.auto) })));
        o.sugg[x.id] = "done"; reset();
      }
      rerender();
    });
  }

  // ---------------- Après le calcul : conseils de chargement ----------------
  function adviceHtml(o) {
    const p = o.plan;
    const adv = (pm, kind) => pm.advice.find(a => a.kind === kind);
    const short = p.perMachine.filter(pm => !o.advDone["s" + pm.num] && adv(pm, "short"));
    const empty = o.advDone.empty ? [] : p.perMachine.filter(pm => adv(pm, "empty")).sort((x, y) => adv(x, "empty").at - adv(y, "empty").at);
    // charge selon le besoin : machines chargées moins qu'à fond ; ou, si « remplir à fond », ce qu'on aurait pu éviter
    const less = p.perMachine.filter(pm => pm.load < pm.full);
    const could = p.perMachine.filter(pm => pm.mode === "full" && pm.need < pm.full);
    const saved = less.reduce((a, pm) => a + pm.full - pm.load, 0);
    const couldS = could.reduce((a, pm) => a + pm.full - pm.need, 0);
    if (!less.length && !could.length && !short.length && !empty.length) return `<div class="card q-card sugg-box"><div class="q-title">🤖 ${t("adv_title")}</div><p class="note">${t("adv_none")}</p></div>`;
    return `<div class="card q-card sugg-box"><div class="q-title">🤖 ${t("adv_title")}</div>
      ${empty.length ? `<div class="sugg sev-warn"><div class="sugg-ic">⏰</div><div class="sugg-body"><b>${t("adv_empty_intro", { n: empty.length })}</b>
        <div class="table-scroll"><table class="compact adv-table">
          <thead><tr><th>${t("machine")}</th><th>${t("adv_col_stock")}</th><th>${t("adv_col_empty_at")}</th><th>${t("adv_col_lost")}</th></tr></thead>
          <tbody>${empty.map(pm => { const a = adv(pm, "empty"); return `<tr><td class="selno">#${pm.num}<div class="petit">${E(pm.street)}</div></td><td>${a.stock}</td><td><b>${a.stock ? F.dayShort(a.at) + " " + F.time(a.at) : t("adv_already_empty")}</b></td><td>≈ ${a.lost}</td></tr>`; }).join("")}</tbody></table></div>
        <div class="sugg-actions"><button class="btn petit secondary" data-adv="keep-e" data-num="0">${t("sg_ok")}</button></div></div></div>` : ""}
      <p class="petit">${t("adv_note", { d: F.dt(p.next), e: F.dt(p.coverEnd) })}</p>
      ${less.length ? `<p class="adv-intro">📈 ${t("adv_less_intro", { n: less.length, s: saved })}</p>` : ""}
      ${could.length ? `<p class="adv-intro">⬆ ${t("adv_full_intro", { n: could.length, s: couldS })}</p>` : ""}
      ${short.map(pm => { const a = adv(pm, "short"); return `<div class="sugg sev-warn"><div class="sugg-ic">🔥</div><div class="sugg-body"><b>#${pm.num} — ${E(pm.street)}</b>
          <div class="sugg-text">${t("adv_short", { c: F.num(a.cover), cap: a.cap })}</div>
          <div class="sugg-actions"><button class="btn petit secondary" data-adv="keep-s" data-num="${pm.num}">${t("sg_ok")}</button></div></div></div>`; }).join("")}
    </div>`;
  }
  function bindAdvice(el, o, recalc) {
    el.querySelectorAll("[data-adv]").forEach(b => b.onclick = () => {
      const num = Number(b.dataset.num), act = b.dataset.adv;
      if (act === "keep-s") o.advDone["s" + num] = "kept";
      else if (act === "keep-e") o.advDone.empty = true;
      recalc();
    });
  }

  // Données « prévision par jour » pour l'Excel de la commande
  function exportRows(s, o) {
    const ctx = FC.context(s);
    const out = [];
    const decTxt = d => !d ? t("fc_pending") : d.stale ? t("fc_stale") : t(d.st === "ok" ? "fc_confirmed" : d.st === "mod" ? "fc_modified" : "fc_normal");
    const add = (num, r) => out.push({
      day: F.key(r.k) + " (" + F.wdName(r.wd) + ")", machine: num == null ? t("all_machines") : "#" + num,
      wd: R(r.wdIdx), cal: r.ents.map(x => (x.e.name || t(x.e.nameKey)) + " " + F.signed(x.eff)).join(" | "),
      auto: R(r.auto), dec: decTxt(r.dec), final: R(r.final), exp: Math.round(r.expected)
    });
    FC.dayRows(ctx, s.now, o.passageAt, o.nextAt, null).forEach(r => add(null, r));
    s.machines.forEach(m => FC.dayRows(ctx, s.now, o.passageAt, o.nextAt, m.num).forEach(r => add(m.num, r)));
    return out;
  }

  // ================= ONGLET « PRÉVISIONS & CALENDRIER » =================
  function renderForecastView(el) {
    const s = BA.Store.get();
    const o = sh().fcv = Object.assign({ tab: "cal", filter: "next", form: false, msg: "", err: "", edit: null, unit: "pct" }, sh().fcv || {});
    const ctx = FC.context(s);
    el.innerHTML = `
      <h2>📅 ${t("nav_forecast")}</h2>
      <div class="seg tabs">
        <button data-fvtab="cal" class="${o.tab === "cal" ? "active" : ""}">📅 ${t("fv_tab_cal")}</button>
        <button data-fvtab="prof" class="${o.tab === "prof" ? "active" : ""}">📊 ${t("fv_tab_prof")}</button>
      </div>
      ${o.tab === "cal" ? calendarHtml(s, ctx, o) : profilesHtml(s, ctx, o)}`;
    el.querySelectorAll("[data-fvtab]").forEach(b => b.onclick = () => { o.tab = b.dataset.fvtab; o.err = ""; o.msg = ""; renderForecastView(el); });
    if (o.tab === "cal") bindCalendar(el, o, () => renderForecastView(el));
    else bindProfiles(el, o, () => renderForecastView(el));
  }

  // ---------------- Calendrier ----------------
  function calendarHtml(s, ctx, o) {
    const today = ctx.today, y = new Date(s.now).getFullYear();
    let list = s.calendar.slice();
    if (o.filter === "next") list = list.filter(e => e.to >= today);
    if (o.filter === "past") list = list.filter(e => e.to < today).reverse();
    const missingYear = [y, y + 1, y + 2].find(yy => !s.calendar.some(e => e.key === "be_new_year_" + yy));
    const pend = s.calendar.filter(e => e.to >= today && !e.confirmed).length;
    return `
      <p class="note">${t("cal_intro")}</p>
      <div class="toolbar">
        <div class="seg">${["next", "past", "all"].map(f => `<button data-calf="${f}" class="${o.filter === f ? "active" : ""}">${t("cal_f_" + f)}</button>`).join("")}</div>
        <button class="btn" id="cal-new">➕ ${t("cal_add")}</button>
        ${missingYear ? `<button class="btn secondary" id="cal-year" data-y="${missingYear}">🇧🇪 ${t("cal_add_year", { y: missingYear })}</button>` : ""}
        ${pend ? `<span class="chip c-remove">${t("cal_pending_n", { n: pend })}</span>` : ""}
      </div>
      ${o.msg ? `<div class="alert info">${o.msg}</div>` : ""}
      ${o.err ? `<div class="alert err">${t(o.err)}</div>` : ""}
      ${o.form ? calForm(s, o) : ""}
      <div class="table-scroll"><table class="compact cal-table">
        <thead><tr><th>${t("cal_col_dates")}</th><th>${t("cal_col_name")}</th><th>${t("cal_col_kind")}</th><th>${t("cal_col_scope")}</th>
          <th>${t("cal_col_effect")}</th><th>${t("cal_col_status")}</th><th>${t("cal_col_ly")}</th><th></th></tr></thead>
        <tbody>${list.length ? list.map(e => calRow(s, ctx, e, today)).join("") : `<tr><td colspan="8">${t("cal_empty")}</td></tr>`}</tbody></table></div>
      <p class="petit">${t("cal_effect_help")}</p>`;
  }
  function calRow(s, ctx, e, today) {
    const past = e.to < today, cur = e.from <= today && e.to >= today;
    const L = past ? null : FC.learnEntry(ctx, e);
    const nPer = e.perMachine ? Object.keys(e.perMachine).length : 0;
    return `<tr class="${past ? "past" : ""} ${cur ? "hl" : ""}">
      <td><b>${rangeLabel(e)}</b>${cur ? `<div class="petit">${t("cal_now")}</div>` : ""}</td>
      <td>${entryName(e)}${e.source === "user" ? "" : `<div class="petit">${t("esrc_" + e.source)}</div>`}</td>
      <td>${KIND_ICON[e.kind] || ""} ${t("kind_" + e.kind)}</td>
      <td class="petit">${E(scopeLabel(s, e))}</td>
      <td><input type="number" class="num-in" data-cal-eff="${e.id}" min="-100" max="300" value="${e.effect}"> %
        ${nPer ? `<div class="petit">${t("cal_per_machine", { n: nPer })}</div>` : ""}</td>
      <td>${e.confirmed ? `<span class="tag c-ok">✔ ${t("fc_confirmed")}</span>` : `<button class="btn petit" data-cal-ok="${e.id}">✔ ${t("fc_btn_ok")}</button>`}</td>
      <td>${L ? `${F.signed(L.fleet)} <span class="petit">(${rangeLabel(L.ly)})</span>
          ${Math.abs(L.fleet - e.effect) >= 5 || !nPer ? `<div><button class="btn petit secondary" data-cal-learn="${e.id}">🧠 ${t("cal_learn")}</button></div>` : ""}` : "—"}</td>
      <td><button class="btn petit secondary" data-cal-del="${e.id}" title="${t("btn_delete")}">🗑</button></td></tr>`;
  }
  function calForm(s, o) {
    const f = o.f = Object.assign({ name: "", kind: "event", from: M.dayKey(s.now), to: "", scope: "all", machines: [], effect: 0 }, o.f || {});
    return `<div class="card add-sel"><h3>➕ ${t("cal_add")}</h3>
      <div class="add-sel-row">
        <label>${t("cal_col_name")}<input type="text" class="txt-in" id="cf-name" maxlength="60" value="${E(f.name)}" placeholder="${t("cal_name_ph")}"></label>
        <label>${t("cal_col_kind")}<select id="cf-kind" class="auto-w">${FC.KINDS.map(k => `<option value="${k}" ${f.kind === k ? "selected" : ""}>${KIND_ICON[k]} ${t("kind_" + k)}</option>`).join("")}</select></label>
        <label>${t("cal_from")}<input type="date" id="cf-from" value="${f.from}"></label>
        <label>${t("cal_to")}<input type="date" id="cf-to" value="${f.to}"></label>
        <label>${t("cal_col_scope")}<select id="cf-scope" class="auto-w">${["all", "vl", "bxl", "list"].map(k => `<option value="${k}" ${f.scope === k ? "selected" : ""}>${t("scope_" + k)}</option>`).join("")}</select></label>
        <label>${t("cal_col_effect")} (%)<input type="number" class="num-in" id="cf-effect" min="-100" max="300" value="${f.effect}"></label>
      </div>
      ${f.scope === "list" ? `<div class="chk-grid">${s.machines.map(m => `<label class="case"><input type="checkbox" data-cf-m="${m.num}" ${f.machines.includes(m.num) ? "checked" : ""}> #${m.num} <span class="petit">${E(m.city)}</span></label>`).join("")}</div>` : ""}
      <p class="petit">${t("cal_form_help")}</p>
      <button class="btn" id="cf-save">✔ ${t("cal_add_btn")}</button> <button class="btn secondary" id="cf-cancel">✖ ${t("btn_cancel")}</button>
    </div>`;
  }
  function bindCalendar(el, o, rerender) {
    const q = id => el.querySelector(id);
    el.querySelectorAll("[data-calf]").forEach(b => b.onclick = () => { o.filter = b.dataset.calf; rerender(); });
    if (q("#cal-new")) q("#cal-new").onclick = () => { o.form = !o.form; o.err = ""; o.msg = ""; rerender(); };
    if (q("#cal-year")) q("#cal-year").onclick = () => {
      const y = Number(q("#cal-year").dataset.y);
      const n = BA.Actions.addYearHolidays(y);
      o.msg = t("cal_year_added", { n, y }); o.filter = "all"; rerender();
    };
    // formulaire
    const readForm = () => {
      const f = o.f;
      f.name = q("#cf-name").value; f.kind = q("#cf-kind").value; f.from = q("#cf-from").value; f.to = q("#cf-to").value;
      f.scope = q("#cf-scope").value; f.effect = q("#cf-effect").value;
      f.machines = Array.from(el.querySelectorAll("[data-cf-m]")).filter(c => c.checked).map(c => Number(c.dataset.cfM));
    };
    if (q("#cf-scope")) q("#cf-scope").onchange = () => { readForm(); rerender(); };
    if (q("#cf-kind")) q("#cf-kind").onchange = () => {
      readForm();
      if (String(o.f.effect) === "0" || o.f.effect === "") o.f.effect = FC.DEF_EFFECT[o.f.kind];
      rerender();
    };
    if (q("#cf-cancel")) q("#cf-cancel").onclick = () => { o.form = false; o.f = null; o.err = ""; rerender(); };
    if (q("#cf-save")) q("#cf-save").onclick = () => {
      readForm();
      const f = o.f;
      const err = BA.Actions.calendarAdd({ name: f.name, kind: f.kind, from: f.from, to: f.to || f.from, scope: f.scope, machines: f.machines,
        effect: f.effect });
      if (err) { o.err = err; rerender(); return; }
      o.form = false; o.f = null; o.err = ""; o.msg = t("cal_added"); o.filter = "next"; rerender();
    };
    // lignes
    el.querySelectorAll("[data-cal-eff]").forEach(i => i.onchange = () => {
      const err = BA.Actions.calendarUpdate(i.dataset.calEff, { effect: i.value });
      o.err = err || ""; o.msg = err ? "" : t("cal_saved"); U.afterClick(rerender);
    });
    el.querySelectorAll("[data-cal-ok]").forEach(b => b.onclick = () => { BA.Actions.calendarUpdate(b.dataset.calOk, { confirmed: true }); rerender(); });
    el.querySelectorAll("[data-cal-learn]").forEach(b => b.onclick = () => {
      const s = BA.Store.get(), ctx = FC.context(s), e = s.calendar.find(x => x.id === Number(b.dataset.calLearn));
      const L = e && FC.learnEntry(ctx, e);
      if (L) { BA.Actions.calendarLearn(e.id, L.fleet, L.per); o.msg = t("cal_learned", { v: F.signed(L.fleet), n: Object.keys(L.per).length }); }
      rerender();
    });
    // Supprimer une date : une fenêtre demande de confirmer
    el.querySelectorAll("[data-cal-del]").forEach(b => b.onclick = () => {
      const e = BA.Store.get().calendar.find(x => x.id === Number(b.dataset.calDel));
      if (!e) { rerender(); return; }
      U.confirmDialog({
        title: "🗑 " + t("cal_del_title"),
        html: `<p>${t("cal_del_text", { name: entryName(e), d: rangeLabel(e) })}</p><p class="note">${t("del_undo")}</p>`,
        ok: "🗑 " + t("del_sel_ok"), danger: true,
        onOk: () => { BA.Actions.calendarDelete(e.id); o.msg = t("cal_deleted"); rerender(); }
      });
    });
  }

  // ---------------- Profils par jour ----------------
  function profilesHtml(s, ctx, o) {
    const fl = ctx.fleet, unit = o.unit;
    const cell = (idx, base, who, wd) => {
      const man = who !== "fleet" && FC.manualState(ctx, who, wd).set;
      return `<span class="idx pc-click ${idxCls(idx)} ${man ? "pc-man" : ""}" role="button" tabindex="0" data-pc="${who}|${wd}" title="${E(t("pc_tip"))}">${unit === "pct" ? pct(idx) : F.num(base * idx, 1)}</span>`;
    };
    const head = WDS.map(i => `<th>${F.wdName(i)}</th>`).join("");
    const fleetBase = s.machines.reduce((a, m) => a + ctx.prof[m.num].base, 0);
    const rows = s.machines.map(m => {
      const p = ctx.prof[m.num];
      if (o.edit === m.num) {
        const cur = p.idx;
        return `<tr class="hl"><td class="selno">#${m.num}</td>
          ${WDS.map(i => `<td><input type="number" class="num-in pm-in" data-pm="${i}" min="0" max="400" value="${R(cur[i])}"></td>`).join("")}
          <td colspan="5"><button class="btn petit" data-pm-save="${m.num}">💾 ${t("btn_save")}</button>
            ${p.src === "manual" ? `<button class="btn petit secondary" data-pm-auto="${m.num}">↺ ${t("prof_back_auto")}</button>` : ""}
            <button class="btn petit secondary" data-pm-cancel="1">✖</button></td></tr>`;
      }
      const tr = p.trend;
      return `<tr><td class="selno">#${m.num}<div class="petit">${E(m.city)}</div></td>
        ${WDS.map(i => `<td>${cell(p.idx[i], p.base, m.num, i)}</td>`).join("")}
        <td>${F.num(p.base, 1)}</td>
        <td><span class="tag">${t("psrc_" + p.src)}</span>${p.short ? `<div class="petit">${t("sg_n_weeks", { n: F.num(p.weeksData, 1) })}</div>` : ""}</td>
        <td>${relTag(p.rel)}</td>
        <td>${tr == null ? "—" : Math.abs(tr) < 0.05 ? "≈ 0 %" : `<span class="${tr < -0.1 ? "down" : tr > 0.1 ? "up" : ""}">${tr < 0 ? "▼" : "▲"} ${F.signed(tr * 100)}</span>`}</td>
        <td class="petit">${t("prof_excl", { a: p.anomalies.length, b: p.excluded.length - p.anomalies.length })}</td>
        <td><button class="btn petit secondary" data-pm-edit="${m.num}" title="${t("prof_manual")}">✏</button></td></tr>`;
    }).join("");
    const F2 = ctx.F;
    return `
      <p class="note">${t("prof_intro", { w: F2.weeks, g: t("weight_" + F2.weighting), src: t("source_" + F2.source) })}
        <button class="link-btn" id="prof-settings">⚙️ ${t("prof_settings")}</button></p>
      <div class="toolbar"><label>${t("prof_unit")} <select id="prof-unit" class="auto-w">
        <option value="pct" ${unit === "pct" ? "selected" : ""}>${t("prof_unit_pct")}</option>
        <option value="n" ${unit === "n" ? "selected" : ""}>${t("prof_unit_n")}</option></select></label></div>
      <div class="table-scroll"><table class="compact prof-table">
        <thead><tr><th>${t("machine")}</th>${head}<th>${t("prof_base")}</th><th>${t("prof_src")}</th><th>${t("fc_col_rel")}</th><th>${t("prof_trend")}</th><th>${t("prof_excluded")}</th><th></th></tr></thead>
        <tbody>
          <tr class="total-row"><td>${t("all_machines")}</td>${WDS.map(i => `<td>${cell(fl.idx[i], fleetBase, "fleet", i)}</td>`).join("")}<td>${F.num(fleetBase)}</td><td colspan="5" class="petit">${t("prof_fleet_note", { n: fl.n })}</td></tr>
          ${rows}
        </tbody></table></div>
      <p class="petit">${t("prof_help")}</p>`;
  }
  // ---- Petite fenêtre : ventes par type de pain pour un jour de semaine (pains ou % selon « Afficher ») ----
  function profileModal(o, who, wd, rerender) {
    const s = BA.Store.get(), ctx = FC.context(s), unit = o.unit === "n" ? "n" : "pct";
    const fleet = who === "fleet", m = fleet ? null : M.machine(s, Number(who));
    let types = [], hist = {}, normal = {}, used = {}, title, isMan = false, ms = null;
    if (fleet) {
      const list = s.machines.filter(x => { const p = ctx.prof[x.num]; return p.full && p.weeksData >= ctx.F.minWeeks && p.base > 0; });
      list.forEach(x => {
        const d = FC.typeDetail(ctx, x);
        d.types.forEach(ty => {
          if (!types.includes(ty)) types.push(ty);
          hist[ty] = (hist[ty] || 0) + d.hist[wd][ty]; normal[ty] = (normal[ty] || 0) + d.normal[ty]; used[ty] = (used[ty] || 0) + d.used[wd][ty];
        });
      });
      title = t("all_machines") + " — " + F.wdLong(wd);
    } else {
      const d = FC.typeDetail(ctx, m);
      types = d.types; types.forEach(ty => { hist[ty] = d.hist[wd][ty]; normal[ty] = d.normal[ty]; used[ty] = d.used[wd][ty]; });
      ms = FC.manualState(ctx, m.num, wd); isMan = ms.set;
      title = "#" + m.num + " " + m.city + " — " + F.wdLong(wd);
    }
    const sum = o2 => types.reduce((a, ty) => a + (o2[ty] || 0), 0);
    const val = (n, ty) => unit === "n" ? Math.round(n * 10) / 10 : (normal[ty] > 0 ? Math.round(n / normal[ty] * 100) : 0);
    const fmt = v => unit === "n" ? F.num(v, 1) : v + " %";
    const nTot = sum(normal), hTot = sum(hist);
    const rowsHtml = types.map(ty => `<tr><td><b>${U.prod(ty)}</b></td><td>${fmt(val(hist[ty], ty))}${unit === "n" ? ` <span class="petit">${t("breads")}</span>` : ""}</td>
      <td><input type="number" class="num-in pc-in" data-ty="${E(ty)}" min="0" step="${unit === "n" ? "0.1" : "1"}" value="${val(used[ty], ty)}" ${fleet ? "disabled" : ""}> <span class="petit">${unit === "n" ? t("breads") : "%"}</span></td></tr>`).join("");
    const root = document.getElementById("modal-root");
    const close = () => { root.innerHTML = ""; };
    root.innerHTML = `<div class="modal-back"><div class="modal pc-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h2>${E(title)}</h2></div></div>
      <p class="note">${t(unit === "n" ? "pc_help_n" : "pc_help_pct", { d: F.wdLong(wd), w: ctx.F.weeks })}${fleet ? " " + t("pc_fleet_note") : ""}</p>
      <div class="table-scroll"><table class="compact"><thead><tr><th>${t("pc_col_type")}</th>
        <th>${t("pc_col_hist")}<div class="petit">${t(unit === "n" ? "pc_hist_n" : "pc_hist_pct", { d: F.wdName(wd), w: ctx.F.weeks })}</div></th><th>${t("pc_col_use")}</th></tr></thead>
        <tbody>${rowsHtml}
          <tr class="tot-row"><td><b>${t(unit === "n" ? "pc_total_n" : "pc_total_pct", { d: F.wdLong(wd) })}</b></td><td>${unit === "n" ? F.num(hTot, 1) : (nTot > 0 ? Math.round(hTot / nTot * 100) : 0) + " %"}</td><td id="pc-total"></td></tr></tbody></table></div>
      ${fleet ? "" : `<p class="petit">⏳ ${ms && ms.set && ms.until ? t("pc_valid", { d: F.date(ms.until) }) : t("pc_keep", { w: ctx.F.manualWeeks || 8 })}</p>`}
      <p class="petit">${t("pc_display", { u: t(unit === "n" ? "prof_unit_n" : "prof_unit_pct") })}</p>
      <div id="pc-err"></div>
      <div class="wz-actions">
        ${fleet ? "" : `<button class="btn" id="pc-ok">✔ ${t("pc_validate")}</button>`}
        <button class="btn secondary" id="pc-cancel">${fleet ? t("pc_close") : t("btn_cancel_short")}</button>
        ${!fleet && isMan ? `<button class="btn secondary" id="pc-auto">↺ ${t("prof_back_auto")}</button>` : ""}
      </div></div></div>`;
    const inputs = () => Array.from(root.querySelectorAll(".pc-in"));
    const toN = i => { const v = Math.max(0, Number(i.value) || 0); return unit === "n" ? v : v / 100 * (normal[i.dataset.ty] || 0); };
    const total = () => {
      const n = inputs().reduce((a, i) => a + toN(i), 0);
      document.getElementById("pc-total").innerHTML = unit === "n"
        ? `<b>${F.num(n, 1)}</b> <span class="petit">${t("pc_total_note", { p: nTot > 0 ? Math.round(n / nTot * 100) : 0, b: F.num(nTot, 1) })}</span>`
        : `<b>${nTot > 0 ? Math.round(n / nTot * 100) : 0} %</b>`;
    };
    inputs().forEach(i => i.oninput = total); total();
    document.getElementById("pc-cancel").onclick = close;
    const ok = document.getElementById("pc-ok");
    if (ok) ok.onclick = () => {
      if (inputs().some(i => i.value === "" || !(Number(i.value) >= 0))) { document.getElementById("pc-err").innerHTML = `<div class="alert err">${t("pc_err")}</div>`; return; }
      const per = {}; inputs().forEach(i => { per[i.dataset.ty] = toN(i); });
      BA.Actions.setProfileDay(m.num, wd, per);
      close(); o.msg = ""; rerender();
    };
    const au = document.getElementById("pc-auto");
    if (au) au.onclick = () => { BA.Actions.resetProfileDay(m.num, wd); close(); rerender(); };
  }

  function bindProfiles(el, o, rerender) {
    el.querySelectorAll("[data-pc]").forEach(c => {
      const open = () => { const [who, wd] = c.dataset.pc.split("|"); profileModal(o, who, Number(wd), rerender); };
      c.onclick = open; c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    const ps = el.querySelector("#prof-settings");
    if (ps) ps.onclick = () => BA.Shell.go("settings");
    const pu = el.querySelector("#prof-unit");
    if (pu) pu.onchange = () => { o.unit = pu.value; rerender(); };
    el.querySelectorAll("[data-pm-edit]").forEach(b => b.onclick = () => { o.edit = Number(b.dataset.pmEdit); rerender(); });
    el.querySelectorAll("[data-pm-cancel]").forEach(b => b.onclick = () => { o.edit = null; rerender(); });
    el.querySelectorAll("[data-pm-auto]").forEach(b => b.onclick = () => { BA.Actions.setProfileManual(Number(b.dataset.pmAuto), null); o.edit = null; rerender(); });
    el.querySelectorAll("[data-pm-save]").forEach(b => b.onclick = () => {
      const vals = [0, 0, 0, 0, 0, 0, 0];
      el.querySelectorAll("[data-pm]").forEach(i => { vals[Number(i.dataset.pm)] = Number(i.value); });
      BA.Actions.setProfileManual(Number(b.dataset.pmSave), vals);
      o.edit = null; rerender();
    });
  }

  // ================= PARAMÈTRES : carte « Prévisions » =================
  function settingsCard(s) {
    const P = Object.assign({}, BA_CONFIG.defaults.forecast, s.settings.forecast || {});
    const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;
    return `<div class="card"><h3>📈 ${t("set_fc")}</h3>
      <label class="field-row">${t("set_fc_weeks")} <select id="sf-weeks" class="auto-w">${[4, 8, 12, 26, 52].map(w => opt(w, P.weeks, t("n_weeks", { n: w }))).join("")}</select></label>
      <label class="field-row">${t("set_fc_weight")} <select id="sf-weight" class="auto-w">${opt("recent", P.weighting, t("weight_recent"))}${opt("equal", P.weighting, t("weight_equal"))}</select></label>
      <label class="field-row">${t("set_fc_source")} <select id="sf-source" class="auto-w">${["auto", "machine", "all"].map(v => opt(v, P.source, t("source_" + v))).join("")}</select></label>
      <label class="field-row">${t("set_fc_min")} <input id="sf-min" class="num-in" type="number" min="1" max="26" value="${P.minWeeks}"> ${t("weeks_unit")}</label>
      <label class="case"><input type="checkbox" id="sf-special" ${P.excludeSpecial ? "checked" : ""}> ${t("set_fc_special")}</label>
      <label class="case"><input type="checkbox" id="sf-anom" ${P.excludeAnomalies ? "checked" : ""}> ${t("set_fc_anom")}</label>
      <label class="field-row">${t("set_fc_anom_h")} <input id="sf-anom-h" class="num-in" type="number" min="1" max="24" value="${P.anomalyHours}"> h</label>
      <label class="field-row">${t("set_fc_hourly")} <select id="sf-hourly" class="auto-w">${opt("typical", P.hourly, t("hourly_typical"))}${opt("flat", P.hourly, t("hourly_flat"))}</select></label>
      <label class="field-row">${t("set_fc_next")} <input id="sf-next" class="num-in" type="number" min="6" max="168" value="${P.nextVisitHours}"> h</label>
      <label class="field-row">${t("set_fc_manual")} <input id="sf-manual" class="num-in" type="number" min="1" max="52" value="${P.manualWeeks}"> ${t("weeks_unit")}</label>
      <label class="field-row">${t("set_fc_safety")} <input id="sf-safety" class="num-in" type="number" min="0" max="100" value="${P.safetyPct}"> %</label>
      <p class="petit">${t("set_fc_help")}</p>
    </div>`;
  }
  function readSettingsCard(el) {
    const v = id => el.querySelector(id);
    if (!v("#sf-weeks")) return null;
    const num = (id, a, b, d) => { const n = Number(v(id).value); return isFinite(n) && v(id).value !== "" ? Math.max(a, Math.min(b, Math.round(n))) : d; };
    return {
      weeks: Number(v("#sf-weeks").value) || 8, weighting: v("#sf-weight").value, source: v("#sf-source").value,
      minWeeks: num("#sf-min", 1, 26, 4), excludeSpecial: v("#sf-special").checked, excludeAnomalies: v("#sf-anom").checked,
      anomalyHours: num("#sf-anom-h", 1, 24, 3), hourly: v("#sf-hourly").value, nextVisitHours: num("#sf-next", 6, 168, 24),
      safetyPct: num("#sf-safety", 0, 100, 15), manualWeeks: num("#sf-manual", 1, 52, 8)
    };
  }

  BA.AdminFC = { forecastSection, bindForecast, adviceHtml, bindAdvice, exportRows, renderForecastView, settingsCard, readSettingsCard, ensureOrderState };
})();
