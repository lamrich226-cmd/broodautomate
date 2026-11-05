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
        <div class="toolbar"><button class="btn secondary" id="fc-ly">📆 ${t("pl_from_order")}</button><span class="petit">${t("pl_from_order_help")}</span></div>
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
    const fly = el.querySelector("#fc-ly"); if (fly) fly.onclick = () => { o.lyp = { from: M.dayKey(o.passageAt), to: M.dayKey(o.nextAt) }; o.tab = "fc"; o.sub = "ly"; o.lyMode = "next"; o.lyBack = true; o.msg = ""; rerender(); };
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
      else if (act === "go-cal") { const v = forecastState(); v.tab = "cal"; v.filter = "next"; sh().orderTab = "fc"; sh().orderSub = "cal"; BA.Shell.go("order"); return; }
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

  // ================= PRÉVISIONS & CALENDRIER (v4.8.6 : dans le menu « Commander & prévisions ») =================
  // Les onglets sont ceux de Commander (cal / prof / fly) ; sh().fcv.tab vaut cal / prof / ly.
  const FCTAB = { cal: "cal", prof: "prof", fly: "ly" };
  function forecastState() {
    return (sh().fcv = Object.assign({ tab: "cal", filter: "next", form: false, msg: "", err: "", edit: null, unit: "pct" }, sh().fcv || {}));
  }
  function renderForecastPane(host, tab, rerender) {
    const s = BA.Store.get(), o = forecastState();
    o.tab = FCTAB[tab] || "cal";
    const ctx = FC.context(s);
    host.innerHTML = o.tab === "cal" ? calendarHtml(s, ctx, o) : o.tab === "ly" ? lyHtml(s, ctx, o) : profilesHtml(s, ctx, o);
    if (lyChart) { lyChart.destroy(); lyChart = null; }
    const back = () => { rerender(({ cal: "cal", prof: "prof", ly: "fly" })[o.tab] || "cal"); };
    if (o.tab === "cal") bindCalendar(host, o, back);
    else if (o.tab === "ly") bindYear(host, o, ctx, back);
    else bindProfiles(host, o, back);
  }

  // ---------------- Même période l'an dernier (v4.8.3) ----------------
  let lyChart = null;
  // v4.8.8 : le détail d'une machine s'ouvre dans une fenêtre, visible tout de suite (avant : tout en bas de la page,
  // sous les 20 machines, sans y descendre — « le bouton Détail ne fait rien »). Fermeture : ✖, Échap ou clic à côté.
  function openDetail(html, cls, bind) {
    const root = document.getElementById("modal-root");
    const back = document.activeElement;
    const key = e => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const close = () => {
      document.removeEventListener("keydown", key, true);
      if (lyChart) { lyChart.destroy(); lyChart = null; }
      root.innerHTML = "";
      if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
    };
    root.innerHTML = `<div class="modal-back det-back"><div class="modal det-modal ${cls || ""}" role="dialog" aria-modal="true" aria-labelledby="det-title">${html}</div></div>`;
    document.addEventListener("keydown", key, true);
    root.querySelector(".det-back").onclick = e => { if (e.target.classList.contains("det-back")) close(); };
    root.querySelectorAll("[data-det-close]").forEach(b => { b.onclick = close; });
    const f = root.querySelector("[data-det-close]"); if (f) f.focus({ preventScroll: true });
    if (bind) bind(root, close);
    return close;
  }
  // bouton « #105 🔍 » dans la 1re colonne : visible aussi sur téléphone, sans faire défiler le tableau
  const machBtn = (attr, num) => `<button class="mach-btn" ${attr}="${num}" title="${E(t("det_open_tip"))}">#${num} <span aria-hidden="true">🔍</span></button>`;

  const spNames = list => list.map(e => entryName(e)).join(", ");
  const diffCell = d => d == null ? "—" : Math.abs(d) < 0.005 ? "≈ 0 %" : `<span class="${d < 0 ? "down" : "up"}">${d < 0 ? "▼" : "▲"} ${F.signed(d * 100)}</span>`;
  function lyData(s, ctx, o) {
    const W = ctx.F.weeks;
    const list = s.machines.map(m => FC.yearCompare(ctx, m, W));
    if (o.ly.sort === "diff") list.sort((x, y) => (x.diff == null ? 9 : x.diff) - (y.diff == null ? 9 : y.diff) || x.num - y.num);
    return { W, list };
  }
  function lyNote(x) {
    if (!x.haveNow) return t("ly_nodata_now");
    if (!x.havePrev) return t("ly_nodata_prev");
    if (!x.enough) return t("ly_nodata", { n: x.n, m: FC.LY_MIN_DAYS });
    return x.anom ? t("ly_anom", { n: x.anom }) : "";
  }
  function lyHtml(s, ctx, o) {
    o.ly = Object.assign({ sort: "num", num: null }, o.ly || {});
    const { W, list } = lyData(s, ctx, o);
    const to = FC.addDays(ctx.today, -1), from = FC.addDays(ctx.today, -W * 7);
    const ok = list.filter(x => x.enough);
    const tot = ok.reduce((a, x) => ({ a: a.a + x.a, b: a.b + x.b }), { a: 0, b: 0 });
    const rows = list.map(x => {
      const m = M.machine(s, x.num);
      return `<tr><td class="selno">${machBtn("data-ly-open", x.num)}<div class="petit">${E(m.city)}</div></td>
        <td>${x.enough ? F.num(x.a) : "—"}</td><td>${x.enough ? F.num(x.b) : "—"}</td><td>${diffCell(x.diff)}</td>
        <td>${x.n}<span class="petit"> / ${x.days}</span></td><td class="petit">${E(lyNote(x))}</td></tr>`;
    }).join("");
    const err = o.err ? `<div class="alert err">⚠️ ${E(o.err)}</div>` : ""; o.err = "";
    return `${err}
      <p class="note">${t("ly_intro", { w: W, a: F.key(from), b: F.key(to), c: F.key(FC.addDays(from, -364)), d: F.key(FC.addDays(to, -364)) })}${ctx.F.excludeAnomalies ? " " + t("ly_intro_anom") : ""}</p>
      <div class="toolbar"><button class="btn secondary" id="ly-back">← ${t("fv_tab_prof")}</button>
        <label>${t("ly_sort")} <select id="ly-sort" class="auto-w"><option value="num" ${o.ly.sort === "num" ? "selected" : ""}>${t("ly_sort_num")}</option>
          <option value="diff" ${o.ly.sort === "diff" ? "selected" : ""}>${t("ly_sort_diff")}</option></select></label>
        <button class="btn" id="ly-x">📥 ${t("ly_export")}</button></div>
      <div class="table-scroll"><table class="compact ly-table">
        <thead><tr><th>${t("machine")}</th><th>${t("ly_col_this")}</th><th>${t("ly_col_prev")}</th><th>${t("ly_col_diff")}</th><th>${t("ly_col_days")}</th><th>${t("ly_col_note")}</th></tr></thead>
        <tbody>
          <tr class="total-row"><td>${t("ly_all", { n: ok.length })}</td><td>${F.num(tot.a)}</td><td>${F.num(tot.b)}</td><td>${diffCell(tot.b > 0 ? tot.a / tot.b - 1 : null)}</td><td colspan="2" class="petit">${t("ly_unit")}</td></tr>
          ${rows}</tbody></table></div>
      <p class="petit">🔍 ${t("det_hint")}</p>`;
  }
  function lyDetail(s, ctx, x) {
    const m = M.machine(s, x.num);
    // semaine par semaine (1 = la plus récente) : seulement les jours comparables
    const wk = {};
    x.rows.forEach(r => { const w = wk[r.wk] = wk[r.wk] || { a: 0, b: 0, n: 0, from: r.k, to: r.k }; if (r.k < w.from) w.from = r.k; if (r.k > w.to) w.to = r.k; if (r.use) { w.a += r.cur; w.b += r.prev; w.n++; } });
    const weeks = Object.keys(wk).map(Number).sort((a, b) => a - b).map(i => wk[i]);
    const types = Object.keys(x.types).sort((a, b) => (x.types[b].a + x.types[b].b) - (x.types[a].a + x.types[a].b));
    const flag = r => {
      const f = [];
      if (r.spCur.length) f.push(`🎉 ${t("ly_this")}: ${spNames(r.spCur)}`);
      if (r.spPrev.length) f.push(`🎉 ${t("ly_prev")}: ${spNames(r.spPrev)}`);
      if (r.cur == null || r.prev == null) f.push(t("ly_flag_gap"));
      else if (!r.use) f.push(t("ly_flag_anom"));
      return f.join(" · ");
    };
    return `
      <div class="ly-detail"><div class="modal-head"><h2 id="det-title">#${x.num} — ${E(m.street)}, ${E(m.city)}</h2>
        <button class="btn petit secondary" data-det-close>✖ ${t("ly_close")}</button></div>
        <p class="petit">${lyNote(x) ? E(lyNote(x)) + " · " : ""}${t("ly_cover", { n: x.haveNow, m: x.havePrev, d: x.days })}</p>
        <div class="chart-box ly-chart"><canvas id="ly-chart"></canvas></div>
        <div class="ly-cols">
          <div><h4>${t("ly_weeks")}</h4><div class="table-scroll"><table class="compact"><thead><tr><th>${t("ly_col_week")}</th><th>${t("ly_col_this")}</th><th>${t("ly_col_prev")}</th><th>${t("ly_col_diff")}</th></tr></thead>
            <tbody>${weeks.map(w => `<tr><td>${F.keyShort(w.from)} → ${F.keyShort(w.to)}<div class="petit">${w.n}/7</div></td><td>${w.n ? F.num(w.a) : "—"}</td><td>${w.n ? F.num(w.b) : "—"}</td><td>${diffCell(w.n >= 3 && w.b > 0 ? w.a / w.b - 1 : null)}</td></tr>`).join("")}</tbody></table></div></div>
          <div><h4>${t("ly_types")}</h4>${types.length ? `<div class="table-scroll"><table class="compact"><thead><tr><th>${t("col_type")}</th><th>${t("ly_col_this")}</th><th>${t("ly_col_prev")}</th><th>${t("ly_col_diff")}</th></tr></thead>
            <tbody>${types.map(ty => { const v = x.types[ty]; return `<tr><td>${U.prod(ty)}</td><td>${F.num(v.a)}</td><td>${F.num(v.b)}</td><td>${diffCell(v.b > 0 && x.enough ? v.a / v.b - 1 : null)}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="petit">—</p>`}</div>
        </div>
        <details class="ly-days ly-bytype-box" open><summary>${t("ly_bytype_days")}</summary>
          <p class="petit">${t("ly_bytype_help")}</p>
          <div class="table-scroll"><table class="compact ly-bytype">
          <thead><tr><th>${t("ly_col_day")}</th><th>${t("ly_col_dayprev")}</th>${x.tlist.map(ty => `<th>${U.prod(ty)}</th>`).join("")}<th>${t("pl_col_all")}</th></tr></thead>
          <tbody>${x.rows.slice().reverse().map(r => `<tr class="${r.use ? "" : "off"}"><td class="nowrap">${F.dayShort(FC.keyMs(r.k))}${r.spCur.length || r.spPrev.length ? ` <span title="${E(flag(r))}">🎉</span>` : ""}</td><td class="nowrap">${F.dayShort(FC.keyMs(r.kp))}/${r.kp.slice(2, 4)}</td>
            ${x.tlist.map(ty => `<td>${r.cty ? F.num(r.cty[ty]) : "—"}<div class="ly-sub" title="${E(t("ly_sub_tip"))}">↳ ${r.pty ? F.num(r.pty[ty]) : "—"}</div></td>`).join("")}
            <td><b>${r.cur == null ? "—" : r.cur}</b><div class="ly-sub">↳ ${r.prev == null ? "—" : r.prev}</div></td></tr>`).join("")}</tbody></table></div></details>
        <details class="ly-days"><summary>${t("ly_days")}</summary><div class="table-scroll"><table class="compact">
          <thead><tr><th>${t("ly_col_day")}</th><th>${t("ly_col_dayprev")}</th><th>${t("ly_col_this")}</th><th>${t("ly_col_prev")}</th><th>${t("ly_col_diff")}</th><th>${t("ly_col_note")}</th></tr></thead>
          <tbody>${x.rows.slice().reverse().map(r => `<tr class="${r.use ? "" : "off"}"><td class="nowrap">${F.dayShort(FC.keyMs(r.k))}</td><td class="nowrap">${F.dayShort(FC.keyMs(r.kp))}/${r.kp.slice(2, 4)}</td>
            <td>${r.cur == null ? "—" : r.cur}</td><td>${r.prev == null ? "—" : r.prev}</td><td>${diffCell(r.use && r.prev > 0 ? r.cur / r.prev - 1 : null)}</td><td class="petit">${E(flag(r))}</td></tr>`).join("")}</tbody></table></div></details>
      </div>`;
  }
  function lyDraw(el, s, ctx, x) {
    const box = el.querySelector(".ly-chart");
    if (!box) return;
    if (typeof Chart === "undefined") { box.innerHTML = `<div class="alert warn">${t("chart_missing")}</div>`; return; }
    // v4.8.8 : cette année en couleur, l'an dernier en gris (le contexte) ; points seulement sur les jours spéciaux
    const C = U.chartTheme();
    Chart.defaults.color = C.muted; Chart.defaults.borderColor = C.grid; Chart.defaults.font.family = C.font;
    const line = (label, data, color, special) => ({
      label, data, borderColor: color, backgroundColor: color, borderWidth: 2, cubicInterpolationMode: "monotone", spanGaps: false,
      pointRadius: special.map(v => v ? 4 : 0), pointHoverRadius: 5, pointHitRadius: 12,
      pointBackgroundColor: color, pointBorderColor: C.surface, pointBorderWidth: 2
    });
    if (lyChart) { lyChart.destroy(); lyChart = null; }
    lyChart = new Chart(el.querySelector("#ly-chart"), {
      type: "line",
      data: {
        labels: x.rows.map(r => F.dayShort(FC.keyMs(r.k))),
        datasets: [
          line(t("ly_series_this"), x.rows.map(r => r.cur), C.loaded, x.rows.map(r => r.spCur.length > 0)),
          line(t("ly_series_prev"), x.rows.map(r => r.prev), C.context, x.rows.map(r => r.spPrev.length > 0))
        ]
      },
      plugins: [U.chartCrosshair],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: { display: false },
          baCross: { color: C.muted },
          legend: { display: true, align: "start", labels: { color: C.ink, boxWidth: 18, boxHeight: 3 } },
          tooltip: { backgroundColor: C.tip, borderColor: C.axis, borderWidth: 1, cornerRadius: 8, padding: 10, titleColor: C.muted,
            bodyColor: C.ink, boxWidth: 12, boxHeight: 2, boxPadding: 5 }
        },
        scales: {
          x: { grid: { display: false }, border: { color: C.axis }, ticks: { color: C.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 18 } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: C.grid, drawTicks: false }, ticks: { color: C.muted, padding: 8, maxTicksLimit: 6 } }
        }
      }
    });
  }
  function bindYear(el, o, ctx, rerender) {
    const s = ctx.s;
    el.querySelector("#ly-back").onclick = () => { o.tab = "prof"; rerender(); };
    el.querySelector("#ly-sort").onchange = e => { o.ly.sort = e.target.value; rerender(); };
    el.querySelectorAll("[data-ly-open]").forEach(b => b.onclick = () => {
      const num = Number(b.dataset.lyOpen), m = M.machine(s, num); if (!m) return;
      const x = FC.yearCompare(ctx, m, ctx.F.weeks);
      openDetail(lyDetail(s, ctx, x), "ly-modal", root => lyDraw(root, s, ctx, x));
    });
    el.querySelector("#ly-x").onclick = () => {
      const { W, list } = lyData(s, ctx, o);
      const to = FC.addDays(ctx.today, -1), from = FC.addDays(ctx.today, -W * 7);
      const ok = BA.Excel.exportYearCompare(s, { W, from, to, fromPrev: FC.addDays(from, -364), toPrev: FC.addDays(to, -364), list: list.slice().sort((a, b) => a.num - b.num),
        note: x => lyNote(x), names: spNames });
      if (!ok) { o.err = t("excel_missing"); rerender(); }
    };
  }


  // ---------------- Commander : la période à venir vue l'an dernier (v4.8.5) ----------------
  // Choisir une période (ex. novembre, 2 semaines, un jour), voir ce que chaque machine a vendu les MÊMES jours de semaine
  // 52 semaines avant (↳ = ce que la prévision actuelle attend). Lecture seule.
  const PRESETS = [1, 7, 14, 28, 56];
  function orderLyState(s, o) {
    const st0 = o.lyp = o.lyp || {};
    const day = k => /^\d{4}-\d{2}-\d{2}$/.test(k || "");
    if (!day(st0.from)) st0.from = M.dayKey(o.passageAt || s.now);
    if (!day(st0.to) || st0.to < st0.from) st0.to = FC.addDays(st0.from, 6);
    if (FC.diffDays(st0.from, st0.to) + 1 > FC.PERIOD_MAX) st0.to = FC.addDays(st0.from, FC.PERIOD_MAX - 1);
    return st0;
  }
  // ---- « Utiliser l'an dernier » (v4.8.6) ----
  const srcSelect = p => `<label>${t("pl_src")} <select id="pl-src" class="auto-w"><option value="adj" ${p.src !== "raw" ? "selected" : ""}>${t("pl_src_adj")}</option><option value="raw" ${p.src === "raw" ? "selected" : ""}>${t("pl_src_raw")}</option></select></label>`;
  // décisions à enregistrer pour une machine : pains visés / jour de base de la machine (jours à venir, avec données l'an dernier)
  function plChanges(s, ctx, x, src) {
    const m = M.machine(s, x.num), today = M.dayKey(s.now), out = [];
    if (!(x.base > 0)) return out;
    const f = src === "raw" || x.trend == null ? 1 : 1 + x.trend;
    x.rows.forEach(r => {
      if (!r.use || r.k < today) return;
      const target = r.prev * f, pct = Math.max(0, Math.min(400, Math.round(target / x.base * 100)));
      out.push({ num: x.num, k: r.k, pct, ref: Math.round(FC.auto(ctx, m, r.k).auto * 100), now: r.exp, target });
    });
    return out;
  }
  function plDetail(s, ctx, x, p) {
    if (!x) return "";
    const m = M.machine(s, x.num), tl = x.tlist;
    const wk = [];
    x.rows.forEach((r, i) => { const w = wk[Math.floor(i / 7)] = wk[Math.floor(i / 7)] || { from: r.k, to: r.k, n: 0, t: {}, e: {} }; w.to = r.k; if (r.use) { w.n++; tl.forEach(ty => { w.t[ty] = (w.t[ty] || 0) + (r.pty[ty] || 0); w.e[ty] = (w.e[ty] || 0) + r.ety[ty]; }); } });
    const allP = tl.reduce((a, ty) => a + x.tyPrev[ty], 0) || 1;
    const cell = (a, b) => `${F.num(a)}<div class="ly-sub" title="${E(t("pl_sub_tip"))}">↳ ${F.num(b)}</div>`;
    return `<div class="ly-detail"><div class="modal-head"><h2 id="det-title">#${x.num} — ${E(m.street)}, ${E(m.city)}</h2>
        <button class="btn petit secondary" data-det-close>✖ ${t("ly_close")}</button></div>
      <p class="petit">${t("pl_det_period", { a: F.key(x.from), b: F.key(x.to), c: F.key(FC.addDays(x.from, -FC.LY_SHIFT)), d: F.key(FC.addDays(x.to, -FC.LY_SHIFT)) })}</p>
      ${x.enough ? "" : `<div class="alert warn">${t("pl_nodata")}</div>`}
      <h4>${t("pl_bytype_days")}</h4>
      <div class="table-scroll"><table class="compact ly-bytype">
        <thead><tr><th>${t("ly_col_day")}</th><th>${t("ly_col_dayprev")}</th>${tl.map(ty => `<th>${U.prod(ty)}</th>`).join("")}<th>${t("pl_col_all")}</th></tr></thead>
        <tbody>${x.rows.map(r => `<tr class="${r.use ? "" : "off"}"><td class="nowrap">${F.dayShort(FC.keyMs(r.k))}${r.spCur.length || r.spPrev.length ? ` <span title="${E(spNames(r.spCur.concat(r.spPrev)))}">🎉</span>` : ""}</td><td class="nowrap">${F.dayShort(FC.keyMs(r.kp))}/${r.kp.slice(2, 4)}</td>
          ${tl.map(ty => `<td>${r.pty ? cell(r.pty[ty], r.ety[ty]) : "—"}</td>`).join("")}
          <td><b>${r.prev == null ? "—" : F.num(r.prev)}</b><div class="ly-sub">↳ ${F.num(r.exp)}</div></td></tr>`).join("")}
          <tr class="total-row"><td colspan="2">${t("pl_total_period")}</td>${tl.map(ty => `<td><b>${F.num(x.tyPrev[ty])}</b><div class="ly-sub">↳ ${F.num(x.tyExp[ty])}</div><div class="petit">${F.num(x.tyPrev[ty] / allP * 100)} %</div></td>`).join("")}<td><b>${F.num(x.prevTotal)}</b><div class="ly-sub">↳ ${F.num(x.expTotal)}</div></td></tr></tbody></table></div>
      ${wk.length > 1 ? `<h4>${t("pl_bytype_weeks")}</h4><div class="table-scroll"><table class="compact">
        <thead><tr><th>${t("ly_col_week")}</th>${tl.map(ty => `<th>${U.prod(ty)}</th>`).join("")}</tr></thead>
        <tbody>${wk.map(w => `<tr><td>${F.keyShort(w.from)} → ${F.keyShort(w.to)}</td>${tl.map(ty => `<td>${w.n ? cell(w.t[ty], w.e[ty]) : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      <div class="pl-apply"><b>${t("pl_apply_one")}</b> <p class="petit">${t("pl_apply_one_help")}</p>
        <div class="toolbar"><button class="btn" id="pl-apply-one" data-num="${x.num}" ${x.enough && x.base > 0 ? "" : "disabled"}>✔ ${t("pl_apply_one_btn")}</button></div></div>
    </div>`;
  }
  function plConfirm(s, ctx, o, p, nums, rerender) {
    const list = s.machines.filter(m => nums.includes(m.num)).map(m => FC.periodLY(ctx, m, p.from, p.to));
    const ch = list.flatMap(x => plChanges(s, ctx, x, p.src));
    if (!ch.length) { o.msg = ""; p.err = t("pl_apply_none"); rerender(); return; }
    const rows = nums.length === 1
      ? `<table class="compact"><thead><tr><th>${t("ly_col_day")}</th><th>${t("pl_now")}</th><th>${t("pl_new")}</th></tr></thead><tbody>${ch.map(c => `<tr><td>${F.dayShort(FC.keyMs(c.k))}</td><td>${F.num(c.now)}</td><td><b>${F.num(c.target)}</b> <span class="petit">(${c.pct} %)</span></td></tr>`).join("")}</tbody></table>`
      : `<p>${t("pl_confirm_all", { m: new Set(ch.map(c => c.num)).size, d: ch.length })}</p>`;
    U.confirmDialog({
      title: "📆 " + t("pl_confirm_title"),
      html: `<p>${t("pl_confirm_text", { s: t(p.src === "raw" ? "pl_src_raw" : "pl_src_adj") })}</p>${rows}<p class="petit">${t("pl_confirm_note")}</p>`,
      ok: "✔ " + t("pl_confirm_ok"),
      onOk: () => {
        p.undo = BA.Actions.applyLastYear(ch.map(c => ({ num: c.num, k: c.k, pct: c.pct, ref: c.ref })));
        o.msg = t("pl_applied", { d: ch.length, m: new Set(ch.map(c => c.num)).size });
        rerender();
      }
    });
  }

  function orderLyHtml(s, o) {
    if (!s.machines.length) return `<div class="alert info">${t("no_machine_admin")}</div>`;     // v5 : flotte vide possible
    const p = orderLyState(s, o), ctx = FC.context(s);
    const list = s.machines.map(m => FC.periodLY(ctx, m, p.from, p.to));
    const errNow = p.err; p.err = "";
    const days = list[0].days, weekly = days > 14;
    // colonnes : un jour, ou une semaine (blocs de 7 jours)
    const cols = [];
    for (let i = 0; i < days; i += weekly ? 7 : 1) cols.push({ i0: i, i1: Math.min(days, i + (weekly ? 7 : 1)) - 1 });
    const colOf = (x, c) => {
      const r = x.rows.slice(c.i0, c.i1 + 1).filter(z => z.use);
      return { n: r.length, prev: r.reduce((a, z) => a + z.prev, 0), exp: r.reduce((a, z) => a + z.exp, 0), of: c.i1 - c.i0 + 1 };
    };
    const cell = v => v.n ? `${F.num(v.prev)}<div class="ly-sub" title="${E(t("pl_sub_tip"))}">↳ ${F.num(v.exp)}</div>${weekly && v.n < v.of ? `<div class="petit">${v.n}/${v.of}</div>` : ""}` : "—";
    const head = cols.map(c => {
      const r0 = list[0].rows[c.i0], r1 = list[0].rows[c.i1];
      const sp = new Set(); list.forEach(x => x.rows.slice(c.i0, c.i1 + 1).forEach(z => { z.spCur.concat(z.spPrev).forEach(e => sp.add(entryName(e))); }));
      const lbl = weekly ? `${F.keyShort(r0.k)} → ${F.keyShort(r1.k)}` : F.dayShort(FC.keyMs(r0.k));
      const sub = weekly ? "" : `<div class="petit">${F.dayShort(FC.keyMs(r0.kp)).split(" ")[1]}/${r0.kp.slice(2, 4)}</div>`;
      return `<th class="nowrap">${lbl}${sub}${sp.size ? ` <span title="${E([...sp].join(", "))}">🎉</span>` : ""}</th>`;
    }).join("");
    const tot = list.filter(x => x.enough).reduce((a, x) => ({ p: a.p + x.prevTotal, e: a.e + x.expTotal }), { p: 0, e: 0 });
    const fleetCells = cols.map(c => {
      const v = list.reduce((a, x) => { const z = colOf(x, c); return { n: a.n + z.n, prev: a.prev + z.prev, exp: a.exp + z.exp, of: z.of }; }, { n: 0, prev: 0, exp: 0, of: 1 });
      return `<td>${v.n ? cell({ n: 1, prev: v.prev, exp: v.exp, of: 1 }) : "—"}</td>`;
    }).join("");
    const diff = d => d == null ? "—" : Math.abs(d) < 0.005 ? "≈ 0 %" : `<span class="${d < 0 ? "down" : "up"}">${d < 0 ? "▼" : "▲"} ${F.signed(d * 100)}</span>`;
    const rows = list.map(x => {
      const m = M.machine(s, x.num);
      return `<tr><td class="selno">${machBtn("data-pl-open", x.num)}<div class="petit">${E(m.city)}</div></td>
        ${cols.map(c => `<td>${cell(colOf(x, c))}</td>`).join("")}
        <td><b>${x.enough ? F.num(x.prevTotal) : "—"}</b>${x.enough ? `<div class="ly-sub">↳ ${F.num(x.expTotal)}</div>` : ""}</td>
        <td>${x.enough ? diff(x.diff) : "—"}</td>
        <td>${x.adj != null ? `<b title="${E(t("pl_adj_tip", { p: F.signed((x.trend || 0) * 100) }))}">${F.num(x.adj)}</b>` : "—"}</td>
        <td class="petit">${x.enough ? (x.n < x.days ? t("pl_gaps", { n: x.n, d: x.days }) : "") : t("pl_nodata")}</td></tr>`;
    }).join("");
    const pre = PRESETS.map(n => `<button class="btn petit secondary ${days === n ? "active" : ""}" data-pl-n="${n}">${t("pl_n_" + n)}</button>`).join("");
    return `
      <p class="note">${t("pl_intro")}</p>
      ${errNow ? `<div class="alert err">⚠️ ${E(errNow)}</div>` : ""}
      ${o.msg ? `<div class="alert info">✅ ${o.msg}${p.undo && p.undo.length ? ` <button class="btn petit secondary" id="pl-undo">↩ ${t("pl_undo")}</button>` : ""}</div>` : ""}
      <div class="card q-card"><div class="toolbar">
        <label>${t("pl_from")} <input type="date" id="pl-from" value="${p.from}"></label>
        <label>${t("pl_to")} <input type="date" id="pl-to" value="${p.to}" min="${p.from}"></label>
        <button class="btn petit secondary" id="pl-deliv">📅 ${t("pl_deliv")}</button></div>
        <div class="toolbar">${pre}</div>
        <p class="petit">${t("pl_range", { a: F.key(p.from), b: F.key(p.to), c: F.key(FC.addDays(p.from, -FC.LY_SHIFT)), d: F.key(FC.addDays(p.to, -FC.LY_SHIFT)), n: days })}</p></div>
      <div class="toolbar">${srcSelect(p)}<button class="btn" id="pl-apply-all">✔ ${t("pl_apply_all_btn")}</button><button class="btn secondary" id="pl-x">📥 ${t("pl_export")}</button></div>
      <div class="table-scroll"><table class="compact ly-table">
        <thead><tr><th>${t("machine")}</th>${head}<th>${t("pl_col_total")}</th><th>${t("pl_col_diff")}</th><th>${t("pl_col_adj")}</th><th>${t("ly_col_note")}</th></tr></thead>
        <tbody><tr class="total-row"><td>${t("all_machines")}</td>${fleetCells}<td><b>${F.num(tot.p)}</b><div class="ly-sub">↳ ${F.num(tot.e)}</div></td><td>${diff(tot.p > 0 ? tot.e / tot.p - 1 : null)}</td><td></td><td class="petit">${t("pl_unit")}</td></tr>${rows}</tbody></table></div>
      <p class="petit">🔍 ${t("det_hint")} ${t("pl_help")}</p>`;
  }
  function bindOrderLy(el, o, rerender) {
    const s = BA.Store.get(), p = orderLyState(s, o);
    const f = el.querySelector("#pl-from"), to = el.querySelector("#pl-to");
    if (f) U.dateInput(f, v => { const len = FC.diffDays(p.from, p.to); p.from = v; p.to = FC.addDays(v, len); U.afterClick(rerender); });
    if (to) U.dateInput(to, v => { p.to = v; U.afterClick(rerender); });
    const d = el.querySelector("#pl-deliv"); if (d) d.onclick = () => { p.from = M.dayKey(o.passageAt || s.now); p.to = FC.addDays(p.from, 6); rerender(); };
    el.querySelectorAll("[data-pl-n]").forEach(b => b.onclick = () => { p.to = FC.addDays(p.from, Number(b.dataset.plN) - 1); rerender(); });
    el.querySelectorAll("[data-pl-open]").forEach(b => b.onclick = () => {
      const num = Number(b.dataset.plOpen), m = M.machine(s, num); if (!m) return;
      const c = FC.context(s), x = FC.periodLY(c, m, p.from, p.to);
      openDetail(plDetail(s, c, x, p), "pl-modal", (root, close) => {
        const a1 = root.querySelector("#pl-apply-one");
        // la fenêtre se ferme d'abord : la confirmation prend sa place
        if (a1) a1.onclick = () => { close(); plConfirm(s, c, o, p, [num], rerender); };
      });
    });
    el.querySelectorAll("#pl-src").forEach(sel => sel.onchange = () => { p.src = sel.value === "raw" ? "raw" : "adj"; rerender(); });
    const ctx2 = FC.context(s);
    const aa = el.querySelector("#pl-apply-all"); if (aa) aa.onclick = () => plConfirm(s, ctx2, o, p, s.machines.map(m => m.num), rerender);
    const un = el.querySelector("#pl-undo"); if (un) un.onclick = () => { BA.Actions.undoLastYear(p.undo); p.undo = null; o.msg = t("pl_undone"); rerender(); };
    const x = el.querySelector("#pl-x"); if (x) x.onclick = () => {
      const ctx = FC.context(s), list = s.machines.map(m => FC.periodLY(ctx, m, p.from, p.to));
      o.msg = BA.Excel.exportPeriodLY(s, { from: p.from, to: p.to, list, names: spNames }) ? t("excel_ok") : t("excel_missing"); rerender();
    };
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
    // v4.8.4 : « Année » : cette année, l'an dernier (même période, 52 semaines avant) ou les deux côte à côte
    const year = o.year = ["cur", "ly", "both"].includes(o.year) ? o.year : "cur";
    const lyCtx = year === "cur" ? null : FC.lastYearContext(s);
    const bc = year === "ly" ? lyCtx : ctx;                 // contexte affiché dans les colonnes principales
    const editable = year !== "ly";                         // l'an dernier : lecture seule
    const fl = bc.fleet, unit = o.unit;
    const sub = v => `<div class="ly-sub" title="${E(t("ly_sub_tip"))}">↳ ${v}</div>`;
    const val = (idx, base) => unit === "pct" ? pct(idx) : F.num(base * idx, 1);
    const cell = (idx, base, who, wd, lyv) => {
      const man = editable && who !== "fleet" && FC.manualState(bc, who, wd).set;
      return `<span class="idx ${editable ? "pc-click" : ""} ${idxCls(idx)} ${man ? "pc-man" : ""}" ${editable ? `role="button" tabindex="0" data-pc="${who}|${wd}" title="${E(t("pc_tip"))}"` : ""}>${val(idx, base)}</span>${lyv != null ? sub(lyv) : ""}`;
    };
    const head = WDS.map(i => `<th>${F.wdName(i)}</th>`).join("");
    const bases = c => s.machines.reduce((a, m) => a + c.prof[m.num].base, 0);
    const fleetBase = bases(bc);
    const lyFl = lyCtx && year === "both" ? lyCtx.fleet : null, lyFleetBase = lyCtx ? bases(lyCtx) : 0;
    const rows = s.machines.map(m => {
      const p = bc.prof[m.num], lp = year === "both" ? lyCtx.prof[m.num] : null;
      if (editable && o.edit === m.num) {
        const cur = p.idx;
        return `<tr class="hl"><td class="selno">#${m.num}</td>
          ${WDS.map(i => `<td><input type="number" class="num-in pm-in" data-pm="${i}" min="0" max="400" value="${R(cur[i])}"></td>`).join("")}
          <td colspan="5"><button class="btn petit" data-pm-save="${m.num}">💾 ${t("btn_save")}</button>
            ${p.src === "manual" ? `<button class="btn petit secondary" data-pm-auto="${m.num}">↺ ${t("prof_back_auto")}</button>` : ""}
            <button class="btn petit secondary" data-pm-cancel="1">✖</button></td></tr>`;
      }
      const tr = p.trend;
      return `<tr><td class="selno">#${m.num}<div class="petit">${E(m.city)}</div></td>
        ${WDS.map(i => `<td>${cell(p.idx[i], p.base, m.num, i, lp ? val(lp.idx[i], lp.base) : null)}</td>`).join("")}
        <td>${F.num(p.base, 1)}${lp ? sub(F.num(lp.base, 1)) : ""}</td>
        <td><span class="tag">${t("psrc_" + p.src)}</span>${p.short ? `<div class="petit">${t("sg_n_weeks", { n: F.num(p.weeksData, 1) })}</div>` : ""}</td>
        <td>${relTag(p.rel)}</td>
        <td>${tr == null ? "—" : Math.abs(tr) < 0.05 ? "≈ 0 %" : `<span class="${tr < -0.1 ? "down" : tr > 0.1 ? "up" : ""}">${tr < 0 ? "▼" : "▲"} ${F.signed(tr * 100)}</span>`}</td>
        <td class="petit">${t("prof_excl", { a: p.anomalies.length, b: p.excluded.length - p.anomalies.length })}</td>
        <td>${editable ? `<button class="btn petit secondary" data-pm-edit="${m.num}" title="${t("prof_manual")}">✏</button>` : ""}</td></tr>`;
    }).join("");
    const F2 = ctx.F;
    const W = F2.weeks, ly0 = FC.addDays(FC.addDays(ctx.today, -FC.LY_SHIFT), -W * 7), ly1 = FC.addDays(FC.addDays(ctx.today, -FC.LY_SHIFT), -1);
    const yearNote = year === "cur" ? "" : `<p class="note ly-note">📆 ${t(year === "ly" ? "prof_ly_note" : "prof_both_note", { a: F.key(ly0), b: F.key(ly1) })}</p>`;
    return `
      <p class="note">${t("prof_intro", { w: F2.weeks, g: t("weight_" + F2.weighting), src: t("source_" + F2.source) })}
        <button class="link-btn" id="prof-settings">⚙️ ${t("prof_settings")}</button></p>
      <div class="toolbar"><label>${t("prof_unit")} <select id="prof-unit" class="auto-w">
        <option value="pct" ${unit === "pct" ? "selected" : ""}>${t("prof_unit_pct")}</option>
        <option value="n" ${unit === "n" ? "selected" : ""}>${t("prof_unit_n")}</option></select></label>
        <label>${t("prof_year")} <select id="prof-year" class="auto-w">
        <option value="cur" ${year === "cur" ? "selected" : ""}>${t("prof_year_cur")}</option>
        <option value="ly" ${year === "ly" ? "selected" : ""}>${t("prof_year_ly")}</option>
        <option value="both" ${year === "both" ? "selected" : ""}>${t("prof_year_both")}</option></select></label></div>
      ${yearNote}
      ${editable ? `<p class="note">👆 ${t("prof_click_hint")}</p>` : ""}
      <div class="table-scroll"><table class="compact prof-table">
        <thead><tr><th>${t("machine")}</th>${head}<th>${t("prof_base")}</th><th>${t("prof_src")}</th><th>${t("fc_col_rel")}</th><th>${t("prof_trend")}</th><th>${t("prof_excluded")}</th><th></th></tr></thead>
        <tbody>
          <tr class="total-row"><td>${t("all_machines")}</td>${WDS.map(i => `<td>${cell(fl.idx[i], fleetBase, "fleet", i, lyFl ? val(lyFl.idx[i], lyFleetBase) : null)}</td>`).join("")}<td>${F.num(fleetBase)}${lyFl ? sub(F.num(lyFleetBase)) : ""}</td><td colspan="5" class="petit">${t("prof_fleet_note", { n: fl.n })}</td></tr>
          ${rows}
        </tbody></table></div>
      <p class="petit">${t("prof_help")}</p>
      <div class="card ly-cta"><button class="btn" id="prof-ly">📆 ${t("ly_btn")}</button>
        <span class="petit">${t("ly_btn_help", { w: F2.weeks })}</span></div>`;
  }
  // ---- Petite fenêtre : ventes par type de pain pour un jour de semaine (pains ou % selon « Afficher ») ----
  function profileModal(o, who, wd, rerender) {
    const s = BA.Store.get(), ctx = FC.context(s);
    let unit = o.unit === "n" ? "n" : "pct";
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
    // v5.11 : machine sans historique de ventes (toute nouvelle) : on écrit directement le nombre de pains de chaque sorte
    const noHist = !fleet && !types.some(ty => (normal[ty] || 0) > 0);
    if (noHist) unit = "n";
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
      ${noHist ? `<div class="alert info">🆕 ${t("pc_nohist", { d: F.wdLong(wd) })}</div>` : ""}
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
        ? `<b>${F.num(n, 1)}</b>${nTot > 0 ? ` <span class="petit">${t("pc_total_note", { p: Math.round(n / nTot * 100), b: F.num(nTot, 1) })}</span>` : ""}`
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
    const ly = el.querySelector("#prof-ly");
    if (ly) ly.onclick = () => { o.tab = "ly"; o.err = ""; o.msg = ""; rerender(); window.scrollTo(0, 0); };
    el.querySelectorAll("[data-pc]").forEach(c => {
      const open = () => { const [who, wd] = c.dataset.pc.split("|"); profileModal(o, who, Number(wd), rerender); };
      c.onclick = open; c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    const ps = el.querySelector("#prof-settings");
    if (ps) ps.onclick = () => BA.Shell.go("settings");
    const pu = el.querySelector("#prof-unit");
    if (pu) pu.onchange = () => { o.unit = pu.value; rerender(); };
    const py = el.querySelector("#prof-year");
    if (py) py.onchange = () => { o.year = py.value; o.edit = null; rerender(); };
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

  BA.AdminFC = { renderForecastPane, forecastSection, bindForecast, adviceHtml, bindAdvice, exportRows, settingsCard, readSettingsCard, ensureOrderState, orderLyHtml, bindOrderLy, orderLyState };
})();
