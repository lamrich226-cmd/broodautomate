// ============================================================
// BROODAUTOMATE TEST — Historique (BA.History)
// Chaque mouvement avec la date et l'heure exactes : ventes, retraits,
// chargements, écarts d'inventaire, dates de lots, sélections.
// - Admin : tout, résumé par jour, export Excel (une machine ou toutes).
// - Opérateur : sans les ventes ni les prix.
// Les mouvements sont enregistrés par BA.Model.log (store.js).
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E, FC = BA.Forecast;
  const t = (k, v) => BA.I18n.t(k, v);
  const st = () => BA.Shell.state;
  const PERIODS = ["today", "yesterday", "7", "30", "90", "365", "custom"];
  const ICON = { sale: "🧾", rm: "➖", load: "🧺", inv: "🔢", keep: "👍", date: "📅", seladd: "➕", seldel: "🗑" };

  // ---------- Filtres ----------
  function filters(admin) {
    const h = st().hist = Object.assign({ num: 0, period: "today", from: "", to: "", kind: "all", mode: "detail", limit: 300 }, st().hist || {});
    if (!admin) { h.mode = "detail"; if (h.kind === "sale") h.kind = "all"; }
    return h;
  }
  // Début et fin (exclue) de la période, en heure locale (les jours de changement d'heure comptent bien 23 ou 25 h)
  function range(s, h) {
    const today = M.dayKey(s.now), day = FC.keyMs;
    if (h.period === "today") return [day(today), Infinity];
    if (h.period === "yesterday") return [day(FC.addDays(today, -1)), day(today)];
    if (h.period === "custom") {
      const ok = k => /^\d{4}-\d{2}-\d{2}$/.test(k || "");
      let a = ok(h.from) ? h.from : FC.addDays(today, -6), b = ok(h.to) ? h.to : today;
      if (a > b) { const x = a; a = b; b = x; }
      return [day(a), day(FC.addDays(b, 1))];
    }
    return [day(FC.addDays(today, -(Number(h.period) - 1))), Infinity];
  }
  const isRm = e => e.k === "rm" || (e.k === "seldel" && e.q > 0);
  function kindOk(e, kind) {
    if (kind === "all") return true;
    if (kind === "rm") return isRm(e);
    if (kind === "other") return ["keep", "date", "seladd", "seldel"].includes(e.k);
    return e.k === kind;
  }
  // Mouvements filtrés, du plus récent au plus ancien
  function rows(s, h, admin) {
    const [a, b] = range(s, h);
    return (s.journal || []).filter(e => e.t >= a && e.t < b && (!h.num || e.n === h.num) && (admin || e.k !== "sale") && kindOk(e, h.kind))
      .sort((x, y) => y.t - x.t || (y.i || 0) - (x.i || 0));
  }
  // Résumé par jour (statistiques des jours) : vendus, chiffre d'affaires, chargés, retirés
  function dayRows(s, h, perMachine) {
    const [a, b] = range(s, h), out = [];
    Object.keys(s.daily).filter(k => { const ms = FC.keyMs(k); return ms >= a && ms < b; }).sort().reverse().forEach(k => {
      const d = s.daily[k], tot = { k, num: 0, s: 0, r: 0, l: 0, x: 0 };
      Object.keys(d).forEach(n => {
        if (h.num && Number(n) !== h.num) return;
        const x = d[n], row = { k, num: Number(n), s: x.s || 0, r: x.r || 0, l: x.l || 0, x: x.x || 0 };
        if (perMachine) out.push(row);
        tot.s += row.s; tot.r += row.r; tot.l += row.l; tot.x += row.x;
      });
      if (!perMachine) out.push(tot);
    });
    return out;
  }

  // ---------- Textes d'un mouvement (écran et Excel) ----------
  const moveName = e => t("mv_" + e.k);
  const byName = e => t("by_" + (e.b || "admin"));
  function qtyNum(e) {
    if (e.k === "sale") return -1;
    if (e.k === "rm" || e.k === "seldel") return e.q ? -e.q : "";
    if (e.k === "load" || e.k === "inv") return e.q;
    if (e.k === "keep" || e.k === "date") return e.q || "";
    return "";
  }
  const qtyTxt = e => { const q = qtyNum(e); if (q === "") return ""; return (e.k === "keep" || e.k === "date") ? String(q) : q > 0 ? "+" + q : "−" + Math.abs(q); };
  function detailText(e) {
    const p = [];
    if (e.k === "rm") p.push(t("rr_" + (e.r || "other")));
    if (e.k === "keep") p.push(t("hist_keep_once"));
    if (e.k === "date") p.push(t("hist_date_change", { a: F.dt(e.l), b: F.dt(e.l2) }));
    if (e.k === "seladd" && e.c) p.push(t("hist_cap", { n: e.c }));
    if (e.k === "seldel" && e.q) p.push(t("hist_seldel_q", { q: e.q }));
    if (e.x) p.push(t("hist_note", { x: e.x }));
    if (e.it) p.push(t("hist_src_fill"));
    return p.join(" · ");
  }
  const when = ms => F.date(ms) + " " + F.clock(ms);

  // Une ligne du tableau
  function rowHtml(s, e, admin, withMachine) {
    return `<tr class="mv-${e.k}">
      <td class="nowrap">${when(e.t)}</td>
      ${withMachine ? `<td class="selno">#${e.n}</td>` : ""}
      <td>${e.s != null ? e.s : ""}${e.y ? `<div class="petit only-phone">${U.prod(e.y)}</div>` : ""}</td>
      <td class="no-phone">${e.y ? U.prod(e.y) : ""}</td>
      <td><span class="tag mv mv-${e.k}">${ICON[e.k] || ""} ${moveName(e)}</span></td>
      <td class="num ${qtyNum(e) < 0 ? "down" : qtyNum(e) > 0 && e.k !== "keep" && e.k !== "date" ? "up" : ""}"><b>${qtyTxt(e)}</b></td>
      <td class="nowrap no-phone">${e.l ? F.dt(e.l) : ""}</td>
      ${admin ? `<td>${e.k === "sale" && e.p != null ? F.eur(e.p) : ""}</td>` : ""}
      <td class="no-phone">${byName(e)}</td>
      <td class="petit">${E(detailText(e))}</td></tr>`;
  }
  function tableHead(admin, withMachine) {
    return `<thead><tr><th>${t("hist_col_when")}</th>${withMachine ? `<th>${t("machine")}</th>` : ""}<th>${t("col_sel")}</th><th class="no-phone">${t("col_type")}</th>
      <th>${t("hist_col_move")}</th><th>${t("hist_col_qty")}</th><th class="no-phone">${t("hist_col_lot")}</th>${admin ? `<th>${t("hist_col_price")}</th>` : ""}
      <th class="no-phone">${t("hist_col_by")}</th><th>${t("hist_col_detail")}</th></tr></thead>`;
  }

  // ---------- Petit tableau « Derniers mouvements » (Détails machine) ----------
  function recent(s, num, admin, n) {
    const list = (s.journal || []).filter(e => e.n === num && (admin || e.k !== "sale")).sort((x, y) => y.t - x.t || (y.i || 0) - (x.i || 0)).slice(0, n || 8);
    return `${list.length ? `<div class="table-scroll"><table class="compact hist-table">${tableHead(admin, false)}<tbody>${list.map(e => rowHtml(s, e, admin, false)).join("")}</tbody></table></div>`
      : `<p class="note">${t("hist_none_machine")}</p>`}
      <button class="btn secondary" data-hist-go="${num}">🧾 ${t("det_all_history")}</button>`;
  }
  function bindRecent(el, num) {
    el.querySelectorAll("[data-hist-go]").forEach(b => b.onclick = () => {
      const h = st().hist = Object.assign({}, st().hist || {}, { num: Number(b.dataset.histGo), period: "7", kind: "all", mode: "detail", limit: 300 });
      h.seen = null;
      BA.Shell.go("history");
    });
  }

  // ---------- Écran « Historique » ----------
  function render(el, ctx) {
    const s = BA.Store.get(), admin = !!ctx.admin, h = filters(admin);
    const [a] = range(s, h);
    const first = (s.journal || []).reduce((m, e) => Math.min(m, e.t), Infinity);
    const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;
    const kinds = admin ? ["all", "sale", "rm", "load", "inv", "other"] : ["all", "rm", "load", "inv", "other"];
    let body = "";
    if (h.mode === "detail") {
      const list = rows(s, h, admin);
      h.seen = (s.journal || []).reduce((m, e) => Math.max(m, e.i || 0), 0);
      const sum = { sale: 0, rev: 0, rm: 0, load: 0 };
      list.forEach(e => {
        if (e.k === "sale") { sum.sale++; sum.rev += e.p || 0; }
        if (isRm(e)) sum.rm += e.q || 0;
        if (e.k === "load") sum.load += e.q || 0;
      });
      const shown = list.slice(0, h.limit);
      body = `<div class="cards summary-cards">
          ${admin ? `<div class="card stat c-ok"><div class="label">${t("hist_sum_sales")}</div><div class="value">${sum.sale}</div></div>
          <div class="card stat"><div class="label">${t("hist_sum_rev")}</div><div class="value">${F.eur(sum.rev)}</div></div>` : ""}
          <div class="card stat c-remove"><div class="label">${t("hist_sum_rm")}</div><div class="value">${sum.rm}</div></div>
          <div class="card stat c-door"><div class="label">${t("hist_sum_load")}</div><div class="value">${sum.load}</div></div>
        </div>
        ${first > a ? `<p class="note">ℹ️ ${t("hist_since", { d: isFinite(first) ? F.dt(first) : F.dt(s.now) })}${admin ? " " + t("hist_since_day") : ""}</p>` : ""}
        ${list.length ? `<div class="table-scroll"><table class="compact hist-table">${tableHead(admin, !h.num)}
          <tbody>${shown.map(e => rowHtml(s, e, admin, !h.num)).join("")}</tbody></table></div>
          <p class="petit">${t("hist_shown", { a: shown.length, b: list.length })}
            ${list.length > shown.length ? `<button class="btn petit secondary" id="hist-more">${t("hist_more", { n: Math.min(300, list.length - shown.length) })}</button>` : ""}</p>`
          : `<div class="alert info">${t("hist_none")}</div>`}`;
    } else {
      const dr = dayRows(s, h, false);
      const tot = dr.reduce((o, r) => { o.s += r.s; o.r += r.r; o.l += r.l; o.x += r.x; return o; }, { s: 0, r: 0, l: 0, x: 0 });
      body = `<p class="note">${t("hist_day_note")}</p>
        ${dr.length ? `<div class="table-scroll"><table class="compact hist-table">
          <thead><tr><th>${t("hd_day")}</th><th>${t("hd_sold")}</th><th>${t("hd_rev")}</th><th>${t("hd_loaded")}</th><th>${t("hd_returned")}</th></tr></thead>
          <tbody><tr class="total-row"><td>${t("x_total")} (${dr.length})</td><td>${F.num(tot.s)}</td><td>${F.eur(tot.r)}</td><td>${F.num(tot.l)}</td><td>${F.num(tot.x)}</td></tr>
            ${dr.slice(0, h.limit).map(r => `<tr><td class="nowrap">${F.dayShort(FC.keyMs(r.k))}/${r.k.slice(0, 4)}</td><td>${F.num(r.s)}</td><td>${F.eur(r.r)}</td><td>${F.num(r.l)}</td><td>${F.num(r.x)}</td></tr>`).join("")}</tbody></table></div>
          ${dr.length > h.limit ? `<button class="btn petit secondary" id="hist-more">${t("hist_more", { n: Math.min(300, dr.length - h.limit) })}</button>` : ""}`
          : `<div class="alert info">${t("hist_none")}</div>`}`;
    }
    el.innerHTML = `
      <h2>🧾 ${t("nav_history")}</h2>
      <p class="note">${admin ? t("hist_intro") : t("hist_intro_op")}</p>
      ${admin ? `<div class="seg tabs">
        <button data-hmode="detail" class="${h.mode === "detail" ? "active" : ""}">🕒 ${t("hist_mode_detail")}</button>
        <button data-hmode="day" class="${h.mode === "day" ? "active" : ""}">📆 ${t("hist_mode_day")}</button></div>` : ""}
      <div class="toolbar hist-tools">
        <label>${t("machine")} <select id="hist-machine" class="auto-w">${opt(0, h.num, t("all_machines"))}${s.machines.map(m => opt(m.num, h.num, "#" + m.num + " — " + E(m.street))).join("")}</select></label>
        <label>${t("hist_period")} <select id="hist-period" class="auto-w">${PERIODS.map(p => opt(p, h.period, t("per_" + p))).join("")}</select></label>
        ${h.period === "custom" ? `<label>${t("hist_from")} <input type="date" id="hist-from" value="${E(h.from || FC.addDays(M.dayKey(s.now), -6))}"></label>
          <label>${t("hist_to")} <input type="date" id="hist-to" value="${E(h.to || M.dayKey(s.now))}"></label>` : ""}
        ${h.mode === "detail" ? `<label>${t("hist_kind")} <select id="hist-kind" class="auto-w">${kinds.map(k => opt(k, h.kind, t("hk_" + k))).join("")}</select></label>` : ""}
        <button class="btn secondary" id="hist-refresh">🔄 ${t("hist_refresh")}</button>
        ${admin ? `<button class="btn" id="hist-x">📥 ${t("hist_export")}</button>` : ""}
      </div>
      ${h.msg ? `<div class="alert info">${h.msg}</div>` : ""}
      ${body}`;
    h.msg = "";
    const rr = () => render(el, ctx);
    const set = (k, v) => { h[k] = v; h.limit = 300; rr(); };
    el.querySelectorAll("[data-hmode]").forEach(b => b.onclick = () => set("mode", b.dataset.hmode));
    el.querySelector("#hist-machine").onchange = e => set("num", Number(e.target.value));
    el.querySelector("#hist-period").onchange = e => set("period", e.target.value);
    const hk = el.querySelector("#hist-kind"); if (hk) hk.onchange = e => set("kind", e.target.value);
    const hf = el.querySelector("#hist-from"); if (hf) U.dateInput(hf, v => { h.from = v; h.limit = 300; U.afterClick(rr); });
    const ht = el.querySelector("#hist-to"); if (ht) U.dateInput(ht, v => { h.to = v; h.limit = 300; U.afterClick(rr); });
    const more = el.querySelector("#hist-more"); if (more) more.onclick = () => { h.limit += 300; rr(); };
    el.querySelector("#hist-refresh").onclick = rr;
    const x = el.querySelector("#hist-x"); if (x) x.onclick = () => {
      const s2 = BA.Store.get(), [a2, b2] = range(s2, h);
      const last = Math.min(b2 === Infinity ? s2.now : b2 - 1, s2.now);
      const ok = BA.Excel.exportHistory(s2, {
        mode: h.mode, num: h.num, rows: h.mode === "detail" ? rows(s2, h, true) : null,
        days: dayRows(s2, h, false), daysPerMachine: h.num ? null : dayRows(s2, h, true),
        from: M.dayKey(a2), to: M.dayKey(last)
      });
      h.msg = ok ? t("excel_ok") : t("excel_missing"); rr();
    };
  }

  // Écran non redessiné en direct (on lit tranquillement) : le bouton indique les nouveaux mouvements
  function tick(el, ctx) {
    const h = st().hist, b = el.querySelector("#hist-refresh");
    if (!h || !b || h.mode !== "detail" || h.seen == null) return;
    const s = BA.Store.get(), admin = !!ctx.admin, [a, z] = range(s, h);
    const n = (s.journal || []).filter(e => (e.i || 0) > h.seen && e.t >= a && e.t < z && (!h.num || e.n === h.num) && (admin || e.k !== "sale") && kindOk(e, h.kind)).length;
    const txt = "🔄 " + t("hist_refresh") + (n ? " (" + t("hist_new_n", { n }) + ")" : "");
    if (b.textContent !== txt) { b.textContent = txt; b.classList.toggle("has-new", n > 0); }
  }

  BA.History = { render, tick, recent, bindRecent, rows, dayRows, range, moveName, byName, qtyNum, detailText };
})();
