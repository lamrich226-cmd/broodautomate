// ============================================================
// BROODAUTOMATE TEST — Export Excel (BA.Excel)
// Utilise la bibliothèque SheetJS (chargée depuis cdnjs).
// Le fichier .xlsx est enregistré dans « Téléchargements ».
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model;
  const t = (k, v) => BA.I18n.t(k, v);

  function stamp(ms) {
    const d = new Date(ms), p = M.pad;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "_" + p(d.getHours()) + "h" + p(d.getMinutes());
  }
  const dt = ms => BA.UI.F.date(ms) + " " + BA.UI.F.time(ms);
  const prod = ty => BA.UI.prodText(ty);

  // Feuille « État de stock » : une ligne par sélection
  function stockRows(s) {
    const rows = [[t("x_machine"), t("x_address"), t("col_sel"), t("col_type"), t("col_cap"), t("col_qty"),
      t("x_oldest_date"), t("x_oldest_qty"), t("x_to_remove"), t("x_kept_once"), t("x_lots")]];
    s.machines.forEach(m => m.sels.forEach(sel => {
      M.sortLots(sel);
      const o = sel.lots[0];
      // à retirer : trop vieux, ou gardé une fois et devenu invalide (⛔) ; gardés une fois encore valables : ⏳
      const rem = sel.lots.filter(l => M.isOld(s, l) || M.isMandatory(s, l)).reduce((a, l) => a + l.qty, 0);
      const must = sel.lots.filter(l => l.kept).reduce((a, l) => a + l.qty, 0);
      rows.push(["#" + m.num, m.street + ", " + m.city, sel.n, prod(sel.type), sel.cap, M.qty(sel),
        o ? dt(o.date) : "", o ? o.qty : 0, rem, must, sel.lots.map(l => l.qty + " × " + dt(l.date) + (l.kept ? (M.isMandatory(s, l) ? " ⛔" : " ⏳") : "")).join(" | ")]);
    }));
    return rows;
  }
  // Feuille « Lots (dates) » : une ligne par lot
  function lotRows(s) {
    const rows = [[t("x_machine"), t("x_address"), t("col_sel"), t("col_type"), t("col_qty"), t("col_lotdate"), t("x_age_h"), t("x_status")]];
    s.machines.forEach(m => m.sels.forEach(sel => {
      M.sortLots(sel);
      const status = l => !l.kept ? (M.isOld(s, l) ? t("lot_remove") : t("lot_ok"))
        : M.isMandatory(s, l) ? "⛔ " + t("lot_invalid") + (l.keptAt ? " (" + t("kept_on", { d: dt(l.keptAt) }) + ")" : "")
        : "⏳ " + t("lot_kept") + " — " + t("kept_until", { d: dt(l.keptAt || s.now), u: dt(M.invalidAt(s, l)) });
      sel.lots.forEach(l => rows.push(["#" + m.num, m.street + ", " + m.city, sel.n, prod(sel.type), l.qty, dt(l.date),
        Math.round((s.now - l.date) / M.H * 10) / 10, status(l)]));
    }));
    return rows;
  }
  // Feuille « Stock général » : total par type de pain
  function generalRows(s) {
    const per = {};
    s.machines.forEach(m => m.sels.forEach(sel => {
      const r = per[sel.type] || (per[sel.type] = { cap: 0, qty: 0, rem: 0 });
      r.cap += sel.cap; r.qty += M.qty(sel);
      r.rem += sel.lots.filter(l => M.isOld(s, l) || M.isMandatory(s, l)).reduce((a, l) => a + l.qty, 0);
    }));
    const rows = [[t("col_type"), t("x_cap_total"), t("x_in_machines"), t("x_to_remove"), t("x_to_fill")]];
    Object.keys(per).forEach(ty => {
      const r = per[ty];
      rows.push([prod(ty), r.cap, r.qty, r.rem, r.cap - r.qty + r.rem]);
    });
    return rows;
  }

  function sheet(rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = (widths || rows[0].map(() => 16)).map(w => ({ wch: w }));
    return ws;
  }

  function save(wb, name) {
    XLSX.writeFile(wb, name);
  }

  BA.Excel = {
    ready() { return typeof XLSX !== "undefined"; },

    exportStock(s) {
      if (!this.ready()) return false;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet(stockRows(s), [9, 28, 9, 16, 9, 9, 16, 10, 10, 14, 60]), t("x_sheet_stock"));
      XLSX.utils.book_append_sheet(wb, sheet(lotRows(s), [9, 28, 9, 16, 9, 16, 10, 64]), t("x_sheet_lots"));
      XLSX.utils.book_append_sheet(wb, sheet(generalRows(s), [18, 16, 16, 12, 14]), t("x_sheet_general"));
      save(wb, "broodautomate-stock_" + stamp(s.now) + ".xlsx");
      return true;
    },

    // Historique (une machine ou toutes) : o = { mode, num, rows, days, daysPerMachine, from, to }
    exportHistory(s, o) {
      if (!this.ready()) return false;
      const H = BA.History, F = BA.UI.F, wb = XLSX.utils.book_new();
      const iso = ms => { const d = new Date(ms), p = M.pad; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); };
      const addr = n => { const m = M.machine(s, n); return m ? m.street + ", " + m.city : ""; };
      const info = [[t("x_hist_title")], [t("machine"), o.num ? "#" + o.num + " — " + addr(o.num) : t("all_machines")], [t("hist_period"), F.key(o.from) + " → " + F.key(o.to)], [t("x_created"), dt(s.now)], []];
      if (o.mode === "detail" && o.rows) {
        const rows = info.concat([[t("hist_x_date"), t("hist_x_time"), t("x_machine"), t("x_address"), t("col_sel"), t("col_type"), t("hist_col_move"), t("hist_col_qty"),
          t("hist_col_lot"), t("hist_col_price"), t("hist_col_by"), t("hist_col_detail"), t("hist_x_stamp")]]);
        o.rows.forEach(e => rows.push([F.date(e.t), F.clock(e.t), "#" + e.n, addr(e.n), e.s != null ? e.s : "", e.y ? prod(e.y) : "", H.moveName(e), H.qtyNum(e),
          e.l ? dt(e.l) : "", e.k === "sale" && e.p != null ? e.p : "", H.byName(e), H.detailText(e), iso(e.t)]));
        XLSX.utils.book_append_sheet(wb, sheet(rows, [12, 10, 9, 28, 9, 16, 20, 9, 16, 9, 12, 40, 20]), t("x_sheet_hist"));
      }
      // résumé par jour (statistiques des jours), toujours joint
      const days = info.concat([[t("hd_day"), t("hd_sold"), t("hd_rev"), t("hd_loaded"), t("hd_returned")]]);
      (o.days || []).forEach(r => days.push([F.key(r.k), r.s, Math.round(r.r * 100) / 100, r.l, r.x]));
      XLSX.utils.book_append_sheet(wb, sheet(days, [14, 10, 12, 10, 16]), t("x_sheet_hist_day"));
      if (o.daysPerMachine) {
        const pm = [[t("hd_day"), t("x_machine"), t("x_address"), t("hd_sold"), t("hd_rev"), t("hd_loaded"), t("hd_returned")]];
        o.daysPerMachine.forEach(r => pm.push([F.key(r.k), "#" + r.num, addr(r.num), r.s, Math.round(r.r * 100) / 100, r.l, r.x]));
        XLSX.utils.book_append_sheet(wb, sheet(pm, [14, 9, 28, 10, 12, 10, 16]), t("x_sheet_hist_day_m"));
      }
      save(wb, "broodautomate-historique_" + (o.num ? o.num : t("x_hist_all_file")) + "_" + o.from + "_" + o.to + ".xlsx");
      return true;
    },

    // Comparaison avec l'an dernier (une feuille par machine résumée, une feuille jour par jour)
    exportYearCompare(s, o) {
      if (!this.ready()) return false;
      const F = BA.UI.F, wb = XLSX.utils.book_new();
      const addr = n => { const m = M.machine(s, n); return m ? m.street + ", " + m.city : ""; };
      const pc = (a, b) => b > 0 ? Math.round((a / b - 1) * 1000) / 10 : "";
      const info = [[t("x_ly_title")], [t("x_ly_period"), F.key(o.from) + " → " + F.key(o.to) + "  /  " + F.key(o.fromPrev) + " → " + F.key(o.toPrev)], [t("x_created"), dt(s.now)], [t("x_ly_help")], []];
      const sum = info.concat([[t("x_machine"), t("x_address"), t("ly_col_this"), t("ly_col_prev"), t("ly_col_diff") + " (%)", t("ly_col_days"), t("ly_col_note")]]);
      let ta = 0, tb = 0;
      o.list.forEach(x => {
        if (x.enough) { ta += x.a; tb += x.b; }
        sum.push(["#" + x.num, addr(x.num), x.enough ? x.a : "", x.enough ? x.b : "", x.enough ? pc(x.a, x.b) : "", x.n + " / " + x.days, o.note(x)]);
      });
      sum.push([t("x_total"), "", ta, tb, pc(ta, tb), "", ""]);
      XLSX.utils.book_append_sheet(wb, sheet(sum, [9, 30, 13, 13, 12, 14, 44]), t("x_sheet_ly"));
      const days = info.concat([[t("x_machine"), t("x_address"), t("ly_col_day"), t("ly_col_dayprev"), t("ly_col_this"), t("ly_col_prev"), t("ly_col_diff") + " (%)", t("ly_x_used"), t("ly_this") + " : " + t("ly_x_special"), t("ly_prev") + " : " + t("ly_x_special")]]);
      o.list.forEach(x => x.rows.forEach(r => days.push(["#" + x.num, addr(x.num), F.key(r.k), F.key(r.kp), r.cur == null ? "" : r.cur, r.prev == null ? "" : r.prev,
        r.use ? pc(r.cur, r.prev) : "", r.use ? t("yes") : t("no"), o.names(r.spCur), o.names(r.spPrev)])));
      XLSX.utils.book_append_sheet(wb, sheet(days, [9, 30, 12, 12, 11, 11, 12, 12, 30, 30]), t("x_sheet_ly_days"));
      save(wb, "broodautomate-an-dernier_" + o.from + "_" + o.to + ".xlsx");
      return true;
    },

    // La période à venir vue l'an dernier (Commander) : totaux par machine + jour par jour
    exportPeriodLY(s, o) {
      if (!this.ready()) return false;
      const F = BA.UI.F, wb = XLSX.utils.book_new(), FC = BA.Forecast;
      const addr = n => { const m = M.machine(s, n); return m ? m.street + ", " + m.city : ""; };
      const pc = (a, b) => a > 0 ? Math.round((b / a - 1) * 1000) / 10 : "";
      const info = [[t("x_pl_title")], [t("x_ly_period"), F.key(o.from) + " → " + F.key(o.to) + "  /  " + F.key(FC.addDays(o.from, -FC.LY_SHIFT)) + " → " + F.key(FC.addDays(o.to, -FC.LY_SHIFT))], [t("x_created"), dt(s.now)], [t("x_pl_help")], []];
      const sum = info.concat([[t("x_machine"), t("x_address"), t("pl_col_total"), t("pl_col_exp"), t("pl_col_diff") + " (%)", t("pl_col_adj"), t("ly_col_days")]]);
      let ta = 0, tb = 0;
      o.list.forEach(x => {
        if (x.enough) { ta += x.prevTotal; tb += x.expTotal; }
        sum.push(["#" + x.num, addr(x.num), x.enough ? x.prevTotal : "", x.enough ? Math.round(x.expTotal * 10) / 10 : "", x.enough ? pc(x.prevTotal, x.expTotal) : "", x.adj != null ? Math.round(x.adj * 10) / 10 : "", x.n + " / " + x.days]);
      });
      sum.push([t("x_total"), "", ta, Math.round(tb * 10) / 10, pc(ta, tb), "", ""]);
      XLSX.utils.book_append_sheet(wb, sheet(sum, [9, 30, 16, 16, 12, 16, 12]), t("x_sheet_pl"));
      const days = info.concat([[t("x_machine"), t("x_address"), t("ly_col_day"), t("ly_col_dayprev"), t("pl_col_total"), t("pl_col_exp"), t("ly_this") + " : " + t("ly_x_special"), t("ly_prev") + " : " + t("ly_x_special")]]);
      o.list.forEach(x => x.rows.forEach(r => days.push(["#" + x.num, addr(x.num), F.key(r.k), F.key(r.kp), r.prev == null ? "" : r.prev, Math.round(r.exp * 10) / 10, o.names(r.spCur), o.names(r.spPrev)])));
      XLSX.utils.book_append_sheet(wb, sheet(days, [9, 30, 12, 12, 14, 14, 30, 30]), t("x_sheet_pl_days"));
      save(wb, "broodautomate-commande-an-dernier_" + o.from + "_" + o.to + ".xlsx");
      return true;
    },

    // Résumé de la semaine (v4.8.9) : résumé avec la semaine d'avant, une ligne par machine, jour par jour
    exportWeekly(s, R) {
      if (!this.ready()) return false;
      const F = BA.UI.F, wb = XLSX.utils.book_new();
      const r1 = v => Math.round((v || 0) * 10) / 10, eur = v => Math.round((v || 0) * 100) / 100;
      const pc = v => v == null ? "" : Math.round(v * 1000) / 10;
      const chg = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 1000) / 10 : "";
      const costs = o => o.c + o.fixed + o.fees;
      const sum = [
        [t("x_wk_title", { a: F.key(R.w.from), b: F.key(R.w.to) })],
        [t("x_created"), dt(s.now)],
        [t("x_wk_help")],
        [],
        [t("x_wk_col_what"), t("x_wk_col_week"), t("x_wk_col_prev", { a: F.key(R.pw.from), b: F.key(R.pw.to) }), t("x_wk_col_chg")],
        [t("m_loaded"), R.tot.l, R.ptot.l, chg(R.tot.l, R.ptot.l)],
        [t("m_sold"), R.tot.s, R.ptot.s, chg(R.tot.s, R.ptot.s)],
        [t("m_returned"), R.tot.x, R.ptot.x, chg(R.tot.x, R.ptot.x)],
        [t("x_wk_rate"), pc(R.tot.rate), pc(R.ptot.rate), ""],
        [t("x_wk_lost"), r1(R.tot.lost), r1(R.ptot.lost), chg(R.tot.lost, R.ptot.lost)],
        [t("m_rev") + " (€)", eur(R.tot.r), eur(R.ptot.r), chg(R.tot.r, R.ptot.r)],
        [t("m_costs") + " (€)", eur(costs(R.tot)), eur(costs(R.ptot)), chg(costs(R.tot), costs(R.ptot))],
        [t("m_profit") + " (€)", eur(R.tot.profit), eur(R.ptot.profit), chg(R.tot.profit, R.ptot.profit)],
        [],
        [t("x_wk_target"), Math.round(R.tg * 1000) / 10],
        [t("x_wk_in_target"), R.inT + " / " + R.active],
        [t("x_wk_acc"), pc(R.acc.acc)],
        [t("x_wk_alerts"), R.alerts],
        [],
        [t("x_wk_best")]
      ];
      R.best.forEach(x => sum.push(["#" + x.num + " — " + x.addr, eur(x.profit)]));
      sum.push([], [t("x_wk_watch")]);
      if (!R.watch.length) sum.push([t("x_wk_watch_none")]);
      R.watch.forEach(x => sum.push(["#" + x.num + " — " + x.addr, pc(x.rate), R.adviceText(x.adv)]));
      XLSX.utils.book_append_sheet(wb, sheet(sum, [44, 18, 26, 14]), t("x_sheet_wk"));
      const mach = [[t("x_machine"), t("x_address"), t("m_loaded"), t("m_sold"), t("m_returned"), t("x_wk_rate"), t("x_wk_lost"),
        t("m_rev") + " (€)", t("m_profit") + " (€)", t("x_wk_acc_col"), t("x_wk_advice")]];
      R.machines.forEach(x => mach.push(["#" + x.num, x.addr, x.l, x.s, x.x, pc(x.rate), r1(x.lost), eur(x.r), eur(x.profit), x.accN >= 4 ? pc(x.acc) : "", R.adviceText(x.adv)]));
      XLSX.utils.book_append_sheet(wb, sheet(mach, [9, 30, 11, 11, 11, 16, 16, 14, 14, 18, 46]), t("x_sheet_wk_m"));
      const days = [[t("ly_col_day"), t("m_loaded"), t("m_sold"), t("m_returned"), t("x_wk_rate"), t("x_wk_lost"), t("m_rev") + " (€)", t("m_profit") + " (€)"]];
      R.perDay.forEach(d => days.push([F.key(d.k), d.l, d.s, d.x, pc(d.rate), r1(d.lost), eur(d.r), eur(d.profit)]));
      XLSX.utils.book_append_sheet(wb, sheet(days, [14, 11, 11, 11, 16, 16, 14, 14]), t("x_sheet_wk_d"));
      save(wb, "broodautomate-semaine_" + R.w.from + "_" + R.w.to + ".xlsx");
      return true;
    },

    exportOrder(s, plan, opts) {
      if (!this.ready()) return false;
      const wb = XLSX.utils.book_new();
      // chargement : selon le besoin / à fond, avec les machines qui font exception
      const modeName = md => t(md === "full" ? "load_full" : "load_need");
      const other = plan.perMachine.filter(pm => (pm.mode === "full" || pm.mode === "need") && pm.mode !== plan.loadMode);
      const head = [
        [t("x_order_title")],
        [t("x_created"), dt(s.now)],
        [t("x_removal"), plan.removeBefore ? t("x_removal_before", { d: dt(plan.removeBefore) }) : t("no")],
        [t("x_margin"), (opts.marginPct || 0) + " %"],
        [t("x_passage"), dt(plan.passage)],
        [t("x_next_passage"), plan.next ? dt(plan.next) : ""],
        [t("x_load_mode"), modeName(plan.loadMode) + (other.length ? " — " + modeName(other[0].mode) + " : " + other.map(pm => "#" + pm.num).join(", ") : "")],
        [],
        [t("col_type"), t("x_cap_total"), t("x_stock_now"), t("x_forecast"), t("x_stock_est"), t("x_to_remove"), t("x_mandatory"), t("x_to_order"), t("x_with_margin")]
      ];
      const sum = f => plan.perType.reduce((a, r) => a + (r[f] || 0), 0);
      plan.perType.forEach(r => head.push([prod(r.type), r.cap, r.stock, r.forecast, r.after, r.remove, r.mandatory || 0, r.order, r.orderWithMargin]));
      head.push([t("x_total"), sum("cap"), sum("stock"), sum("forecast"), sum("after"), sum("remove"), sum("mandatory"), sum("order"), sum("orderWithMargin")]);
      XLSX.utils.book_append_sheet(wb, sheet(head, [22, 14, 13, 13, 14, 11, 14, 13, 12]), t("x_sheet_order"));

      const tour = [[t("x_machine"), t("x_address"), t("col_sel"), t("col_type"), t("col_cap"), t("x_stock_now"), t("x_forecast"), t("x_stock_est"), t("x_to_remove"), t("x_mandatory"), t("adv_col_cover"), t("x_full_load"), t("x_to_load")]];
      plan.perMachine.forEach(pm => pm.lines.forEach(l =>
        tour.push(["#" + pm.num, pm.street + ", " + pm.city, l.sel, prod(l.type), l.cap, l.qty, l.forecast, l.after, l.remove, l.mandatory || 0,
          l.cover != null ? Math.round(l.cover * 10) / 10 : "", l.full != null ? l.full : l.load, l.load])));
      XLSX.utils.book_append_sheet(wb, sheet(tour, [9, 28, 9, 16, 9, 12, 12, 13, 10, 14, 18, 13, 10]), t("x_sheet_tour"));

      // Prévision par jour (toutes les machines, puis chaque machine)
      if (opts.fcRows && opts.fcRows.length) {
        const fc = [[t("fc_col_day"), t("x_machine"), t("fc_col_wd") + " (%)", t("fc_col_cal"), t("fc_col_auto") + " (%)", t("fc_col_dec"), t("x_fc_used") + " (%)", t("x_fc_expected")]];
        opts.fcRows.forEach(r => fc.push([r.day, r.machine, r.wd, r.cal, r.auto, r.dec, r.final, r.exp]));
        XLSX.utils.book_append_sheet(wb, sheet(fc, [18, 16, 14, 40, 12, 16, 12, 14]), t("x_sheet_fc"));
      }
      XLSX.utils.book_append_sheet(wb, sheet(stockRows(s), [9, 28, 9, 16, 9, 9, 16, 10, 10, 14, 60]), t("x_sheet_stock"));
      XLSX.utils.book_append_sheet(wb, sheet(lotRows(s), [9, 28, 9, 16, 9, 16, 10, 64]), t("x_sheet_lots"));
      save(wb, "broodautomate-commande_" + stamp(s.now) + ".xlsx");
      return true;
    }
  };
})();
