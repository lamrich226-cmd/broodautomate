// ============================================================
// BROODAUTOMATE v5.6 (reprise de la version test 4.8.9) — Objectif zéro retour, fiabilité de la prévision, résumé de la semaine
// et bloc « À faire aujourd'hui » du Dashboard (BA.Insights, v4.8.9 — admin seulement).
// Lecture seule : rien ici ne change le stock, la prévision ni les commandes.
// La seule chose réglable ici est l'objectif de retour (% maximum de pains retournés).
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E, FC = BA.Forecast;
  const t = (k, v) => BA.I18n.t(k, v);
  const sh = () => BA.Shell.state;
  const ACTIVE_H = 18;        // heures de vente dans une journée (6 h → minuit) : base de l'estimation des ventes perdues
  const MAX_LIST = 4;         // machines citées dans une ligne « À faire »
  let accChart = null;

  // ================= OUTILS =================
  const monday = k => FC.addDays(k, -((FC.wday(k) + 6) % 7));
  // n dernières semaines COMPLÈTES, du lundi au dimanche (la plus récente en dernier)
  function lastWeeks(s, n) {
    const m0 = monday(M.dayKey(s.now)), out = [];
    for (let i = n; i >= 1; i--) { const from = FC.addDays(m0, -7 * i); out.push({ from, to: FC.addDays(from, 6) }); }
    return out;
  }
  const weekLabel = w => `${F.keyShort(w.from)} → ${F.keyShort(w.to)}`;
  const target = s => { const v = Number(s.settings.returnTargetPct); return isFinite(v) && v >= 0 ? v : (BA_CONFIG.defaults.returnTargetPct || 5); };
  const pct1 = v => v == null ? "—" : F.num(v * 100, 1) + " %";
  const numList = list => list.slice(0, MAX_LIST).map(n => "#" + n).join(", ") + (list.length > MAX_LIST ? "…" : "");
  const statsState = () => (sh().stats = sh().stats || { machine: 0, period: "day", view: "numbers", metric: "rev", which: "last" });

  // Ventes perdues estimées un jour donné : la machine était vide e heures → ventes normales du jour × e / 18 h
  function lostOn(ctx, m, k, r) {
    if (!r || !(r.e > 0)) return 0;
    const p = ctx.prof[m.num];
    if (!p || !(p.base > 0)) return 0;
    const wi = p.idx[FC.wday(k)];
    return p.base * (wi != null ? wi : 1) * Math.min(1, r.e / ACTIVE_H);
  }
  // Totaux d'une machine sur une semaine (mêmes calculs que « Statistiques & rentabilité »)
  function weekOf(s, ctx, m, w) {
    const fee = (Number(s.settings.cardFeePct) || 0) / 100, fixedDay = M.fixedOf(s, m) * 12 / 365;
    const o = { l: 0, s: 0, x: 0, r: 0, c: 0, fixed: 0, fees: 0, lost: 0, days: 0 };
    for (let k = w.from; k <= w.to; k = FC.addDays(k, 1)) {
      const r = (s.daily[k] || {})[m.num];
      if (!r) continue;
      o.days++; o.l += r.l || 0; o.s += r.s || 0; o.x += r.x || 0; o.r += r.r || 0; o.c += r.c || 0;
      o.fixed += fixedDay; o.fees += (r.r || 0) * fee; o.lost += lostOn(ctx, m, k, r);
    }
    o.profit = o.r - o.c - o.fixed - o.fees;
    o.rate = o.l > 0 ? o.x / o.l : null;
    return o;
  }
  function addUp(list) {
    const a = { l: 0, s: 0, x: 0, r: 0, c: 0, fixed: 0, fees: 0, lost: 0, profit: 0, days: 0 };
    list.forEach(o => Object.keys(a).forEach(f => { a[f] += o[f] || 0; }));
    a.rate = a.l > 0 ? a.x / a.l : null;
    return a;
  }

  // Conseil pour une semaine : on conseille, on ne commande pas
  function advise(o, tg) {
    if (!o.l) return { k: "none" };
    const over = o.rate > tg, lostSig = o.lost >= Math.max(2, o.s * 0.02);
    if (over && lostSig) return { k: "both" };
    // pains en moins à charger pour revenir à l'objectif (les retours baissent d'autant)
    if (over) return { k: "less", n: Math.max(1, Math.ceil((o.x - tg * o.l) / Math.max(0.01, 1 - tg))) };
    if (lostSig) return { k: "more", n: Math.max(1, Math.round(o.lost)) };
    return { k: "ok" };
  }
  const adviceText = a => a.k === "less" ? "↓ " + t("zr_less", { n: a.n })
    : a.k === "more" ? "↑ " + t("zr_more", { n: a.n })
    : a.k === "both" ? "⇄ " + t("zr_both")
    : a.k === "ok" ? "✔ " + t("zr_ok") : t("zr_none");
  const adviceCls = a => a.k === "ok" ? "adv-ok" : a.k === "none" ? "" : "adv-act";
  // taux de retour : ✔ dans l'objectif, ⚠ jusqu'à 2 × l'objectif, ✖ au-delà (l'icône accompagne toujours la couleur)
  function rateCell(rate, tg) {
    if (rate == null) return `<span class="rt">—</span>`;
    const lvl = rate <= tg + 1e-9 ? "ok" : rate <= 2 * tg + 1e-9 ? "warn" : "bad";
    return `<span class="rt rt-${lvl}"><span aria-hidden="true">${lvl === "ok" ? "✔" : lvl === "warn" ? "⚠" : "✖"}</span> ${F.num(rate * 100, 1)} %</span>`;
  }
  // écart avec la semaine d'avant, en points (une baisse des retours est une bonne nouvelle)
  function trendCell(d) {
    if (d == null) return "—";
    if (Math.abs(d) < 0.005) return "≈";
    return `<span class="${d < 0 ? "up" : "down"}">${d < 0 ? "▼" : "▲"} ${F.num(Math.abs(d) * 100, 1)} ${t("zr_pts")}</span>`;
  }

  // ================= OBJECTIF ZÉRO RETOUR =================
  function returnsData(s, nW) {
    const ctx = FC.context(s), weeks = lastWeeks(s, nW), tg = target(s) / 100;
    const rows = s.machines.map(m => {
      const wk = weeks.map(w => weekOf(s, ctx, m, w));
      const last = wk[wk.length - 1], prev = wk.length > 1 ? wk[wk.length - 2] : null;
      const d = last.rate != null && prev && prev.rate != null ? last.rate - prev.rate : null;
      return { m, wk, last, prev, d, adv: advise(last, tg) };
    });
    const fleet = weeks.map((w, i) => addUp(rows.map(r => r.wk[i])));
    return { weeks, rows, fleet, tg };
  }
  function returnsHtml(s) {
    const o = statsState();
    o.rw = [4, 8, 12].includes(o.rw) ? o.rw : 4;
    const D = returnsData(s, o.rw), tg = D.tg, n = D.weeks.length;
    const L = D.fleet[n - 1], P = n > 1 ? D.fleet[n - 2] : null, lw = D.weeks[n - 1];
    const active = D.rows.filter(r => r.last.l > 0), inT = active.filter(r => r.last.rate <= tg + 1e-9).length;
    const dRate = L.rate != null && P && P.rate != null ? L.rate - P.rate : null;
    const card = (label, val, sub, cls) => `<div class="card stat ${cls || ""}"><div class="label">${label}</div><div class="value">${val}</div>${sub ? `<div class="petit">${sub}</div>` : ""}</div>`;
    const rows = D.rows.slice().sort((a, b) => (b.last.rate == null ? -1 : b.last.rate) - (a.last.rate == null ? -1 : a.last.rate) || a.m.num - b.m.num);
    const old = i => i < n - 1 ? "zr-old" : "";
    const head = D.weeks.map((w, i) => `<th class="nowrap ${old(i)}">${i === n - 1 ? "<b>" : ""}${t("week_of", { d: F.keyShort(w.from) })}${i === n - 1 ? "</b>" : ""}</th>`).join("");
    const body = rows.map(r => `<tr><td class="selno">#${r.m.num}<div class="petit">${E(r.m.city)}</div></td>
        ${r.wk.map((w, i) => `<td class="${old(i)}">${rateCell(w.rate, tg)}</td>`).join("")}
        <td>${trendCell(r.d)}</td><td>${r.last.l ? F.num(r.last.x) : "—"}</td><td>${r.last.l ? "≈ " + F.num(r.last.lost) : "—"}</td>
        <td class="${adviceCls(r.adv)}">${E(adviceText(r.adv))}</td></tr>`).join("");
    return `
      <p class="note">${t("zr_intro", { w: weekLabel(lw) })}</p>
      <div class="cards summary-cards zr-cards">
        ${card(t("zr_k_rate"), pct1(L.rate), (dRate == null ? "" : (Math.abs(dRate) < 0.005 ? t("zr_stable") : trendCell(dRate)) + " · ") + t("zr_k_target", { p: F.num(target(s), 1) }), L.rate != null && L.rate <= tg + 1e-9 ? "c-ok" : "c-remove")}
        ${card(t("zr_k_returned"), F.num(L.x), t("zr_k_of", { n: F.num(L.l) }))}
        ${card(t("zr_k_lost"), "≈ " + F.num(L.lost), t("zr_k_lost_sub"))}
        ${card(t("zr_k_in"), `${inT} / ${active.length}`, t("zr_k_in_sub"))}
      </div>
      <div class="toolbar">
        <label>🎯 ${t("zr_target")} <input type="number" id="zr-target" class="num-in" min="0" max="50" step="0.5" value="${target(s)}"> %</label>
        <label>${t("zr_weeks")} <select id="zr-weeks" class="auto-w">${[4, 8, 12].map(v => `<option value="${v}" ${o.rw === v ? "selected" : ""}>${t("zr_weeks_n", { n: v })}</option>`).join("")}</select></label>
      </div>
      <div class="table-scroll"><table class="compact zr-table">
        <thead><tr><th>${t("machine")}</th>${head}<th>${t("zr_col_trend")}</th><th>${t("zr_col_returned")}</th><th>${t("zr_col_lost")}</th><th>${t("zr_col_advice")}</th></tr></thead>
        <tbody><tr class="total-row"><td>${t("all_machines")}</td>${D.fleet.map((w, i) => `<td class="${old(i)}">${rateCell(w.rate, tg)}</td>`).join("")}
          <td>${trendCell(dRate)}</td><td>${F.num(L.x)}</td><td>≈ ${F.num(L.lost)}</td><td class="petit">${t("zr_fleet_note")}</td></tr>
        ${body}</tbody></table></div>
      <p class="petit">${t("zr_legend", { p: F.num(target(s), 1), q: F.num(target(s) * 2, 1) })}</p>
      <p class="petit">${t("zr_help")}</p>`;
  }
  function bindReturns(el, rerender) {
    const o = statsState();
    const tg = el.querySelector("#zr-target");
    if (tg) U.dateInput(tg, v => {
      const n = Math.max(0, Math.min(50, Math.round(Number(String(v).replace(",", ".")) * 2) / 2));
      if (isFinite(n)) BA.Actions.saveSettings({ returnTargetPct: n });
      U.afterClick(rerender);
    });
    const wk = el.querySelector("#zr-weeks");
    if (wk) wk.onchange = () => { o.rw = Number(wk.value) || 4; rerender(); };
  }

  // ================= FIABILITÉ DE LA PRÉVISION =================
  // Pour chaque jour passé : la prévision AUTOMATIQUE calculée comme la veille (historique d'avant ce jour seulement),
  // face à ce qui s'est vraiment vendu. Les jours avec machine vide ou coupure ne comptent pas (les ventes y sont
  // coupées, ce n'est pas une erreur de la prévision).
  function accuracyFor(s, days) {
    const F0 = Object.assign({}, BA_CONFIG.defaults.forecast, s.settings.forecast || {});
    const ctxs = {};
    days.forEach(k => { ctxs[k] = FC.context(s, k); });
    const rows = s.machines.map(m => {
      const pts = days.map(k => {
        const r = (s.daily[k] || {})[m.num] || null, c = ctxs[k], p = c.prof[m.num];
        const exp = p && p.base > 0 ? p.base * FC.final(c, m, k) : null;
        const anom = !!r && ((r.e || 0) + (r.o || 0)) >= F0.anomalyHours;
        const sp = (c.byDay[k] || []).filter(e => FC.applies(e, m));
        return { k, exp, act: r ? r.s : null, anom, sp, use: !!r && exp != null && !anom };
      });
      const u = pts.filter(x => x.use);
      const sa = u.reduce((a, x) => a + x.act, 0), se = u.reduce((a, x) => a + x.exp, 0), sab = u.reduce((a, x) => a + Math.abs(x.exp - x.act), 0);
      return { m, pts, n: u.length, sa, se, sab, acc: sa > 0 ? Math.max(0, 1 - sab / sa) : null, bias: sa > 0 ? (se - sa) / sa : null, mae: u.length ? sab / u.length : null };
    });
    const tot = rows.reduce((a, r) => ({ sa: a.sa + r.sa, se: a.se + r.se, sab: a.sab + r.sab, n: a.n + r.n }), { sa: 0, se: 0, sab: 0, n: 0 });
    tot.acc = tot.sa > 0 ? Math.max(0, 1 - tot.sab / tot.sa) : null;
    tot.bias = tot.sa > 0 ? (tot.se - tot.sa) / tot.sa : null;
    return { days, rows, tot };
  }
  const MIN_DAYS = 7;
  function grade(x) {
    if (x.n < MIN_DAYS || x.acc == null) return { cls: "", txt: t("fa_few") };
    if (x.acc >= 0.85) return { cls: "rt-ok", txt: "✔ " + t("fa_good") };
    if (x.acc >= 0.70) return { cls: "rt-warn", txt: "⚠ " + t("fa_mid") };
    return { cls: "rt-bad", txt: "✖ " + t("fa_low") };
  }
  function biasText(b) {
    if (b == null) return "—";
    const p = F.signed(b * 100);
    if (b > 0.10) return t("fa_bias_high", { p });
    if (b < -0.10) return t("fa_bias_low", { p });
    return t("fa_bias_ok", { p });
  }
  const biasShort = b => b == null ? "" : b > 0.10 ? t("fa_bs_high") : b < -0.10 ? t("fa_bs_low") : t("fa_bs_ok");
  function accuracyHtml(s) {
    const o = statsState();
    o.fd = [14, 28, 56].includes(o.fd) ? o.fd : 28;
    const today = M.dayKey(s.now), days = [];
    for (let i = o.fd; i >= 1; i--) days.push(FC.addDays(today, -i));
    const A = accuracyFor(s, days), T = A.tot, g = grade(T);
    const rows = A.rows.slice().sort((a, b) => (a.acc == null ? 9 : a.acc) - (b.acc == null ? 9 : b.acc) || a.m.num - b.m.num);
    const card = (label, val, sub, cls) => `<div class="card stat ${cls || ""}"><div class="label">${label}</div><div class="value">${val}</div>${sub ? `<div class="petit">${sub}</div>` : ""}</div>`;
    return `
      <p class="note">${t("fa_intro", { a: F.key(days[0]), b: F.key(days[days.length - 1]) })}</p>
      <div class="cards summary-cards">
        ${card(t("fa_k_acc"), T.acc == null ? "—" : F.num(T.acc * 100, 0) + " %", `<span class="${g.cls}">${E(g.txt)}</span>`)}
        ${card(t("fa_k_bias"), T.bias == null ? "—" : F.signed(T.bias * 100), E(biasShort(T.bias)))}
        ${card(t("fa_k_days"), F.num(T.n), t("fa_k_days_sub"))}
      </div>
      <div class="toolbar"><label>${t("fa_days")} <select id="fa-days" class="auto-w">${[14, 28, 56].map(v => `<option value="${v}" ${o.fd === v ? "selected" : ""}>${t("fa_days_n", { n: v })}</option>`).join("")}</select></label></div>
      <div class="table-scroll"><table class="compact fa-table">
        <thead><tr><th>${t("machine")}</th><th>${t("fa_col_acc")}</th><th>${t("fa_col_mae")}</th><th>${t("fa_col_bias")}</th><th>${t("fa_col_days")}</th></tr></thead>
        <tbody>${rows.map(r => { const gr = grade(r); return `<tr><td class="selno"><button class="mach-btn" data-fa-open="${r.m.num}" title="${E(t("det_open_tip"))}">#${r.m.num} <span aria-hidden="true">🔍</span></button><div class="petit">${E(r.m.city)}</div></td>
          <td><b>${r.acc == null ? "—" : F.num(r.acc * 100, 0) + " %"}</b> <span class="${gr.cls}">${E(gr.txt)}</span></td>
          <td>${r.mae == null ? "—" : "± " + F.num(r.mae, 1)}</td><td>${E(biasText(r.bias))}</td><td>${r.n}<span class="petit"> / ${days.length}</span></td></tr>`; }).join("")}</tbody></table></div>
      <p class="petit">🔍 ${t("det_hint")}</p>
      <p class="petit">${t("fa_help")}</p>`;
  }
  function accDetail(s, r) {
    const m = r.m, gr = grade(r);
    const note = x => [x.sp.length ? "🎉 " + x.sp.map(e => e.name || t(e.nameKey)).join(", ") : "", !x.act && x.act !== 0 ? t("fa_nodata") : x.anom ? t("fa_anom") : ""].filter(Boolean).join(" · ");
    return `<div class="modal-head"><h2 id="det-title">#${m.num} — ${E(m.street)}, ${E(m.city)}</h2>
        <button class="btn petit secondary" data-det-close>✖ ${t("ly_close")}</button></div>
      <p class="petit">${t("fa_det_sum", { a: r.acc == null ? "—" : F.num(r.acc * 100, 0) + " %", e: r.mae == null ? "—" : F.num(r.mae, 1), n: r.n })} <span class="${gr.cls}">${E(gr.txt)}</span> · ${E(biasText(r.bias))}</p>
      <div class="chart-box fa-chart"><canvas id="fa-chart"></canvas></div>
      <div class="table-scroll"><table class="compact">
        <thead><tr><th>${t("ly_col_day")}</th><th>${t("fa_col_exp")}</th><th>${t("fa_col_act")}</th><th>${t("fa_col_gap")}</th><th>${t("ly_col_note")}</th></tr></thead>
        <tbody>${r.pts.slice().reverse().map(x => `<tr class="${x.use ? "" : "off"}"><td class="nowrap">${F.dayShort(FC.keyMs(x.k))}</td>
          <td>${x.exp == null ? "—" : F.num(x.exp, 1)}</td><td>${x.act == null ? "—" : x.act}</td>
          <td>${x.use ? (x.exp - x.act >= 0 ? "+" : "−") + F.num(Math.abs(x.exp - x.act), 1) : "—"}</td><td class="petit">${E(note(x))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function accDraw(root, r) {
    const cv = root.querySelector("#fa-chart");
    if (!cv) return null;
    if (typeof Chart === "undefined") { cv.parentNode.innerHTML = `<div class="alert warn">${t("chart_missing")}</div>`; return null; }
    const C = U.chartTheme();
    Chart.defaults.color = C.muted; Chart.defaults.borderColor = C.grid; Chart.defaults.font.family = C.font;
    const line = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, cubicInterpolationMode: "monotone",
      spanGaps: false, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12, pointBorderColor: C.surface, pointBorderWidth: 2 });
    if (accChart) { accChart.destroy(); accChart = null; }
    accChart = new Chart(cv, {
      type: "line",
      data: {
        labels: r.pts.map(x => F.dayShort(FC.keyMs(x.k))),
        datasets: [line(t("fa_col_act"), r.pts.map(x => x.act), C.loaded), line(t("fa_col_exp"), r.pts.map(x => x.exp == null ? null : Math.round(x.exp * 10) / 10), C.context)]
      },
      plugins: [U.chartCrosshair],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { baCross: { color: C.muted }, legend: { display: true, align: "start", labels: { color: C.ink, boxWidth: 18, boxHeight: 3 } },
          tooltip: { backgroundColor: C.tip, borderColor: C.axis, borderWidth: 1, cornerRadius: 8, padding: 10, titleColor: C.muted, bodyColor: C.ink, boxWidth: 12, boxHeight: 2, boxPadding: 5 } },
        scales: {
          x: { grid: { display: false }, border: { color: C.axis }, ticks: { color: C.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 18 } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: C.grid, drawTicks: false }, ticks: { color: C.muted, padding: 8, maxTicksLimit: 6 } }
        }
      }
    });
    return () => { if (accChart) { accChart.destroy(); accChart = null; } };
  }
  function bindAccuracy(el, rerender) {
    const o = statsState(), s = BA.Store.get();
    const fd = el.querySelector("#fa-days");
    if (fd) fd.onchange = () => { o.fd = Number(fd.value) || 28; rerender(); };
    el.querySelectorAll("[data-fa-open]").forEach(b => b.onclick = () => {
      const num = Number(b.dataset.faOpen), m = M.machine(s, num);
      if (!m) return;
      const today = M.dayKey(s.now), days = [];
      for (let i = o.fd; i >= 1; i--) days.push(FC.addDays(today, -i));
      const r = accuracyFor(s, days).rows.find(x => x.m.num === num);
      U.openWindow(accDetail(s, r), "fa-modal", root => accDraw(root, r));
    });
  }

  // ================= RÉSUMÉ DE LA SEMAINE (Excel) =================
  function weekOptions(s, sel) {
    return lastWeeks(s, 8).reverse().map((w, i) => `<option value="${w.from}" ${(sel ? sel === w.from : i === 0) ? "selected" : ""}>${E(t("wk_opt", { a: F.keyShort(w.from), b: F.keyShort(w.to) }))}</option>`).join("");
  }
  function weekReport(s, w) {
    const ctx = FC.context(s), tg = target(s) / 100;
    const pw = { from: FC.addDays(w.from, -7), to: FC.addDays(w.to, -7) };
    const days = []; for (let k = w.from; k <= w.to; k = FC.addDays(k, 1)) days.push(k);
    const acc = accuracyFor(s, days);
    const machines = s.machines.map(m => {
      const o = weekOf(s, ctx, m, w), a = acc.rows.find(x => x.m.num === m.num);
      return Object.assign(o, { num: m.num, addr: m.street + ", " + m.city, adv: advise(o, tg), acc: a ? a.acc : null, accN: a ? a.n : 0 });
    });
    const tot = addUp(machines), ptot = addUp(s.machines.map(m => weekOf(s, ctx, m, pw)));
    const active = machines.filter(x => x.l > 0);
    const fee = (Number(s.settings.cardFeePct) || 0) / 100;
    const perDay = days.map(k => {
      const d = { k, l: 0, s: 0, x: 0, r: 0, profit: 0, lost: 0 };
      s.machines.forEach(m => {
        const r = (s.daily[k] || {})[m.num]; if (!r) return;
        d.l += r.l || 0; d.s += r.s || 0; d.x += r.x || 0; d.r += r.r || 0; d.lost += lostOn(ctx, m, k, r);
        d.profit += (r.r || 0) - (r.c || 0) - M.fixedOf(s, m) * 12 / 365 - (r.r || 0) * fee;
      });
      d.rate = d.l > 0 ? d.x / d.l : null;
      return d;
    });
    const t0 = FC.keyMs(w.from), t1 = FC.keyMs(FC.addDays(w.to, 1));
    const alerts = s.events.filter(e => e.t >= t0 && e.t < t1).length;
    return {
      w, pw, tot, ptot, tg, machines, perDay, alerts, acc: acc.tot,
      inT: active.filter(x => x.rate <= tg + 1e-9).length, active: active.length,
      best: machines.filter(x => x.l > 0).sort((a, b) => b.profit - a.profit).slice(0, 3),
      watch: machines.filter(x => x.l > 0 && x.rate > tg + 1e-9).sort((a, b) => b.rate - a.rate).slice(0, 3),
      adviceText
    };
  }
  function exportWeek(s, from) {
    const w = { from: from || lastWeeks(s, 1)[0].from };
    w.to = FC.addDays(w.from, 6);
    return BA.Excel.exportWeekly(s, weekReport(s, w));
  }

  // ================= DASHBOARD : « À FAIRE AUJOURD'HUI » =================
  // Ce qui demande une action, le plus urgent d'abord ; chaque ligne mène au bon écran.
  function todoHtml(s, all) {
    const items = [];
    const nums = f => all.filter(f).map(o => o.m.num);
    const must = all.reduce((a, o) => a + (o.x.mandatory || 0), 0);
    const old = all.reduce((a, o) => a + (o.x.toRemove || 0) - (o.x.mandatory || 0), 0);
    const doors = nums(o => o.m.door), off = nums(o => !o.m.online), empty = nums(o => o.x.total === 0);
    const cats = [...M.OPERATOR_CATS, "business"];
    const alerts = s.events.filter(e => cats.includes(e.cat) && !e.resolved && !e.archived).length;
    if (must) items.push(["must", "bad", "⛔", t("td_must", { n: must, m: numList(nums(o => o.x.mandatory > 0)) })]);
    if (doors.length) items.push(["door", "bad", "🚪", t("td_door", { n: doors.length, m: numList(doors) }), doors[0]]);
    if (off.length) items.push(["offline", "warn", "🔌", t("td_off", { n: off.length, m: numList(off) })]);
    if (alerts) items.push(["alerts", "warn", "⚠️", t("td_alerts", { n: alerts })]);
    if (empty.length) items.push(["empty", "warn", "📭", t("td_empty", { n: empty.length, m: numList(empty) })]);
    if (old > 0) items.push(["remove", "warn", "🟠", t("td_old", { n: old, k: nums(o => o.x.toRemove - (o.x.mandatory || 0) > 0).length })]);
    // retours de la semaine dernière face à l'objectif (calcul léger : pas de prévision ici)
    const w = lastWeeks(s, 1)[0], tg = target(s) / 100;
    let l = 0, x = 0, over = 0;
    s.machines.forEach(m => {
      let ml = 0, mx = 0;
      for (let k = w.from; k <= w.to; k = FC.addDays(k, 1)) { const r = (s.daily[k] || {})[m.num]; if (r) { ml += r.l || 0; mx += r.x || 0; } }
      l += ml; x += mx; if (ml > 0 && mx / ml > tg + 1e-9) over++;
    });
    if (l > 0) {
      const rate = x / l, ok = rate <= tg + 1e-9;
      items.push(["returns", ok ? "ok" : "warn", "🎯", t(ok ? "td_ret_ok" : "td_ret", { p: F.num(rate * 100, 1), o: F.num(target(s), 1), n: over })]);
    }
    // le lundi : le résumé de la semaine qui vient de finir
    if (FC.wday(M.dayKey(s.now)) === 1 && sh().weekDone !== w.from) items.push(["weekly", "info", "📥", t("td_week", { a: F.keyShort(w.from), b: F.keyShort(w.to) })]);
    const urgent = items.filter(i => i[1] === "bad" || i[1] === "warn").length;
    return `<div class="card todo-card"><div class="todo-head">📋 ${t("td_title")}${urgent ? "" : ` <span class="petit">· ✔ ${t("td_none")}</span>`}</div>
      <ul class="todo-list">${items.map(i => `<li><button class="todo-item td-${i[1]}" data-todo="${i[0]}" ${i[4] ? `data-num="${i[4]}"` : ""}><span aria-hidden="true">${i[2]}</span> ${E(i[3])} <span class="todo-go" aria-hidden="true">›</span></button></li>`).join("")}</ul></div>`;
  }
  function todoGo(id, num) {
    const S = sh();
    if (id === "must" || id === "remove" || id === "empty") { S.orderTab = "stock"; BA.Shell.go("order"); }
    else if (id === "door") { if (num) S.machine = Number(num); BA.Shell.go("details"); }
    else if (id === "offline") { if (BA.Rs232 && BA.Rs232.tab) BA.Rs232.tab(BA.Boitiers && BA.Boitiers.devices && BA.Boitiers.devices().length ? "boxes" : "cable"); BA.Shell.go("rs232"); }
    else if (id === "alerts") { S.alertFilter = "active"; BA.Shell.go("alerts"); }
    else if (id === "returns") { statsState().tab = "returns"; BA.Shell.go("stats"); }
    else if (id === "weekly") {
      const s = BA.Store.get(), w = lastWeeks(s, 1)[0];
      const ok = exportWeek(s, w.from);
      if (ok) S.weekDone = w.from;
      U.toast(ok ? "📥 " + t("excel_ok") : "⚠️ " + t("excel_missing"));
      BA.Shell.renderView();
    }
  }

  BA.Insights = { returnsHtml, bindReturns, accuracyHtml, bindAccuracy, weekOptions, exportWeek, weekReport, todoHtml, todoGo, lastWeeks, accuracyFor };
})();
