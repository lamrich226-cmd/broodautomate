// ============================================================
// BROODAUTOMATE v5 — Interface ADMIN (index.html)
// (reprise de la version test 4.8.1 ; changements v5 marqués « v5 »)
// Dashboard, Détails machine, Produits / Stock, Commander ou
// Extraction, Statistiques & rentabilité, Alertes, RS232, Paramètres
// ============================================================

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E;
  const t = (k, v) => BA.I18n.t(k, v);
  const st = () => BA.Shell.state;

  // ================= Produits / Stock =================
  function renderProducts(el) {
    const s = BA.Store.get();
    const m = M.machine(s, st().machine) || s.machines[0];
    if (!m) { el.innerHTML = `<h2>🍞 ${t("nav_products")}</h2><div class="alert info">${t("no_machine_admin")}</div>`; return; }   // v5 : flotte vide
    st().machine = m.num;
    const per = {};
    s.machines.forEach(mm => mm.sels.forEach(sel => {
      const r = per[sel.type] || (per[sel.type] = { cap: 0, qty: 0, rem: 0, where: [] });
      r.cap += sel.cap; r.qty += M.qty(sel);
      r.rem += sel.lots.filter(l => M.isOld(s, l) || M.isMandatory(s, l)).reduce((a, l) => a + l.qty, 0);   // trop vieux, ou gardé une fois et devenu invalide
      r.where.push({ num: mm.num, n: sel.n });
    }));
    // « Où ? » : les sélections qui ont ce type (cliquables) — pratique pour retrouver un type ajouté à la main
    const where = r => r.where.length <= 6
      ? r.where.map(w => `<button class="link-btn" data-goto="${w.num}">#${w.num} · ${t("sel_short", { n: w.n })}</button>`).join(" ")
      : `<span class="petit">${t("fleet_where_many", { s: r.where.length, m: new Set(r.where.map(w => w.num)).size })}</span>`;
    el.innerHTML = `
      <h2>🍞 ${t("nav_products")}</h2>
      ${U.machinePicker(s, m.num, "prod-machine")}
      <p class="note">${t("products_admin_note")}</p>
      ${U.stockTable(s, m, true)}
      <h3>🧮 ${t("fleet_stock_title")}</h3>
      <div class="table-scroll"><table>
        <thead><tr><th>${t("col_type")}</th><th>${t("x_in_machines")}</th><th>${t("x_cap_total")}</th><th>${t("x_to_remove")}</th><th>${t("lbl_fill")}</th><th>${t("fleet_where")}</th></tr></thead>
        <tbody>${Object.keys(per).map(ty => {
          const r = per[ty];
          return `<tr><td>${U.prod(ty)}</td><td>${r.qty}</td><td>${r.cap}</td><td>${r.rem}</td><td>${Math.round(r.qty / r.cap * 100)} %</td><td>${where(r)}</td></tr>`;
        }).join("")}</tbody></table></div>`;
    el.querySelector("#prod-machine").onchange = e => { st().machine = Number(e.target.value); renderProducts(el); };
    el.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => { st().machine = Number(b.dataset.goto); renderProducts(el); window.scrollTo(0, 0); });
    U.bindStockTable(el, m.num, true, () => renderProducts(el));
  }

  // ================= Commander / Extraction =================
  function stockOverview(s) {
    return `<div class="table-scroll"><table class="compact">
      <thead><tr><th>${t("machine")}</th><th>${t("col_sel")}</th><th>${t("col_type")}</th><th>${t("col_qty")}</th><th>${t("col_oldest")}</th><th>${t("x_lots")}</th><th>${t("x_to_remove")}</th></tr></thead>
      <tbody>${s.machines.map(m => m.sels.map((sel, j) => {
        M.sortLots(sel);
        const q = M.qty(sel), o = sel.lots[0];
        const rem = sel.lots.filter(l => M.isOld(s, l)).reduce((a, l) => a + l.qty, 0);
        // gardés une fois : cette commande est la « commande suivante » → invalides au passage, à retirer obligatoirement
        const must = sel.lots.filter(l => l.kept).reduce((a, l) => a + l.qty, 0);
        return `<tr class="${j === 0 ? "sel-first" : ""} ${q === 0 ? "empty" : ""}">
          <td class="selno">${j === 0 ? "#" + m.num : ""}</td><td>${sel.n}</td><td>${U.prod(sel.type)}</td><td>${q}/${sel.cap}</td>
          <td>${o ? F.dt(o.date) + " (" + o.qty + ")" : "—"}</td>
          <td class="petit">${sel.lots.map(l => `${l.qty}× ${F.dt(l.date)}`).join(" · ") || "—"}</td>
          <td>${rem ? `<span class="tag c-remove">${rem}</span>` : ""}${must ? `<span class="tag c-must" title="${E(t("kept_order_tip"))}">⛔ ${must}</span>` : ""}</td></tr>`;
      }).join("")).join("")}</tbody></table></div>`;
  }

  function yesNo(name, value) {
    return `<div class="yesno">
      <button class="btn ${value === true ? "" : "secondary"}" data-q="${name}" data-v="1">✔ ${t("yes")}</button>
      <button class="btn ${value === false ? "" : "secondary"}" data-q="${name}" data-v="0">✖ ${t("no")}</button></div>`;
  }

  // Heure de passage proposée : dans 2 heures, arrondie à l'heure suivante
  function defaultPassage(now) {
    const d = new Date(now + 2 * M.H);
    if (d.getMinutes() || d.getSeconds()) { d.setHours(d.getHours() + 1); }
    d.setMinutes(0, 0, 0);
    return d.getTime();
  }

  function renderOrder(el) {
    const s = BA.Store.get();
    const o = st().order = st().order || { tab: "order", q1: null, q2: null, passageAt: null, removeBefore: null, rbManual: false, margin: 0, plan: null, sent: null, msg: "", fc: false };
    // heure de passage déjà dépassée (page restée ouverte) : nouvelle proposition, en le disant
    if (o.passageAt && o.passageAt < s.now) { o.passageMoved = o.passageAt; o.passageAt = null; o.plan = null; }
    if (!o.passageAt) o.passageAt = defaultPassage(s.now);
    if (!o.rbManual) o.removeBefore = o.passageAt - s.settings.thrHours * M.H;
    BA.AdminFC.ensureOrderState(s, o);
    // chargement : « selon le besoin » par défaut, ou « remplir à fond » (toutes les machines ; exceptions dans loadAdj)
    if (o.loadMode !== "full") o.loadMode = "need";
    const opts = () => ({ withRemoval: o.q2 === true, removeBefore: o.removeBefore, marginPct: o.margin, passageAt: o.passageAt, nextAt: o.nextAt, loadMode: o.loadMode, loadAdj: o.loadAdj });
    const calcPlan = () => {
      o.plan = M.orderPlan(BA.Store.get(), opts());
      o.planAt = BA.Store.get().now; o.sent = null; o.sentMsg = "";
    };

    let body = "";
    if (o.tab === "stock") {
      body = `
        <p class="note">${t("stock_check_note")}</p>
        <div class="carte-actions wrap-actions"><button class="btn" id="x-stock">📥 ${t("btn_excel_stock")}</button>
          <button class="btn secondary" id="go-history">🧾 ${t("hist_link")}</button></div>
        ${o.msg ? `<div class="alert info">${o.msg}</div>` : ""}
        ${stockOverview(s)}`;
    } else {
      body = `
        <div class="card q-card">
          <div class="q-title">${t("q1")}</div>
          ${yesNo("q1", o.q1)}
          <p class="petit">${t("q1_help")}</p>
        </div>`;
      if (o.q1 === false) {
        body += `<div class="alert info">${t("q1_no")}</div>
          <button class="btn secondary" id="go-stock">📋 ${t("tab_stock")}</button>`;
      }
      if (o.q1 === true) {
        body += `
        <div class="card q-card">
          <div class="q-title">🚐 ${t("passage_title")}</div>
          <label class="field-row">${t("passage_label")} <input type="datetime-local" id="passage-at" value="${F.toInput(o.passageAt)}"></label>
          <p class="petit">${t("passage_help", { h: F.num((o.passageAt - s.now) / M.H, 1) })}</p>
          ${o.passageMoved ? `<div class="alert warn">⏰ ${t("passage_moved", { d: F.dt(o.passageMoved), n: F.dt(o.passageAt) })}</div>` : ""}
        </div>
        <div class="card q-card">
          <div class="q-title">${t("q2")}</div>
          ${yesNo("q2", o.q2)}
          ${o.q2 === true ? `
            <label class="field-row">${t("q2_date")}
              <input type="datetime-local" id="rm-before" value="${F.toInput(o.removeBefore)}"></label>
            <p class="petit">${o.rbManual ? t("q2_date_manual") : t("q2_date_help", { h: s.settings.thrHours })}</p>` : ""}
          <p class="petit">${t("q2_help")}</p>
        </div>`;
      }
      if (o.q1 === true && o.q2 !== null) {
        body += `
        <div class="card q-card">
          <label class="field-row">${t("margin")} <input type="number" id="margin" class="num-in" min="0" max="50" value="${o.margin}"> %</label>
          <ol class="rule-list">
            <li>${t("rule1")}</li><li>${t("rule2_fc")}</li><li>${t("rule3", { h: s.settings.thrHours })}</li><li>${t("rule_must")}</li><li>${t("rule4")}</li>
          </ol>
          <p class="petit">${t("rule_fifo")}</p>
          ${o.fc ? "" : `<button class="btn" id="calc">📅 ${t("btn_prepare_fc")}</button>`}
        </div>`;
        if (o.fc) body += BA.AdminFC.forecastSection(s, o);
      }
      if (o.plan) body += planHtml(o);
    }

    el.innerHTML = `
      <h2>📦 ${t("nav_order")}</h2>
      <div class="seg tabs">
        <button data-tab="order" class="${o.tab === "order" ? "active" : ""}">🛒 ${t("tab_order")}</button>
        <button data-tab="stock" class="${o.tab === "stock" ? "active" : ""}">📋 ${t("tab_stock")}</button>
      </div>
      ${body}
      ${lastOrders(s)}`;

    el.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { o.tab = b.dataset.tab; o.msg = ""; renderOrder(el); });
    el.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
      o[b.dataset.q] = b.dataset.v === "1"; o.plan = null; o.sent = null;
      if (b.dataset.q === "q1" && !o[b.dataset.q]) o.q2 = null;
      renderOrder(el);
    });
    const go = el.querySelector("#go-stock"); if (go) go.onclick = () => { o.tab = "stock"; renderOrder(el); };
    // (redessiner après le clic éventuel : sinon un clic sur un bouton juste après avoir tapé serait perdu)
    const pa = el.querySelector("#passage-at"); if (pa) U.dateInput(pa, val => {
      const v = F.fromInput(val);
      if (v && v >= BA.Store.get().now) { o.passageAt = v; o.passageMoved = null; }
      o.plan = null; U.afterClick(() => renderOrder(el));
    });
    const rb = el.querySelector("#rm-before"); if (rb) U.dateInput(rb, val => { const v = F.fromInput(val); if (v) { o.removeBefore = v; o.rbManual = true; } o.plan = null; U.afterClick(() => renderOrder(el)); });
    const mg = el.querySelector("#margin"); if (mg) mg.onchange = () => { o.margin = Math.max(0, Math.min(50, Number(mg.value) || 0)); if (o.plan) { calcPlan(); U.afterClick(() => renderOrder(el)); } };
    // 1) préparer la prévision (écran de confirmation)
    const calc = el.querySelector("#calc"); if (calc) calc.onclick = () => {
      if (mg) o.margin = Math.max(0, Math.min(50, Number(mg.value) || 0));
      o.fc = true; o.plan = null; o.sent = null;
      renderOrder(el);
      const f = el.querySelector("#fc"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "start" });
    };
    if (o.fc) BA.AdminFC.bindForecast(el, o, () => renderOrder(el));
    // 2) calculer la commande avec les jours confirmés
    const fcc = el.querySelector("#fc-calc"); if (fcc) fcc.onclick = () => {
      if (mg) o.margin = Math.max(0, Math.min(50, Number(mg.value) || 0));
      o.loadAdj = {}; o.advDone = {};
      calcPlan();
      renderOrder(el);
      const r = el.querySelector("#plan"); if (r && r.scrollIntoView) r.scrollIntoView({ block: "start" });
    };
    if (o.plan) BA.AdminFC.bindAdvice(el, o, () => { calcPlan(); renderOrder(el); });
    // chargement selon le besoin / à fond : toutes les machines, ou une seule
    el.querySelectorAll("[data-lm]").forEach(b => b.onclick = () => {
      if (b.dataset.lm === o.loadMode) return;
      o.loadMode = b.dataset.lm === "full" ? "full" : "need"; o.loadAdj = {};
      calcPlan(); renderOrder(el);
    });
    el.querySelectorAll("[data-lmm]").forEach(b => b.onclick = () => {
      const n = Number(b.dataset.lmm), pm = o.plan && o.plan.perMachine.find(x => x.num === n);
      const want = pm && pm.mode === "full" ? "need" : "full";
      if (want === o.loadMode) delete o.loadAdj[n]; else o.loadAdj[n] = want;
      calcPlan(); renderOrder(el);
    });
    const gh = el.querySelector("#go-history"); if (gh) gh.onclick = () => BA.Shell.go("history");
    const xs = el.querySelector("#x-stock"); if (xs) xs.onclick = () => {
      o.msg = BA.Excel.exportStock(BA.Store.get()) ? t("excel_ok") : t("excel_missing");
      renderOrder(el);
    };
    const xo = el.querySelector("#x-order"); if (xo) xo.onclick = () => {
      const s2 = BA.Store.get();
      o.sentMsg = BA.Excel.exportOrder(s2, o.plan, Object.assign(opts(), { fcRows: BA.AdminFC.exportRows(s2, o) })) ? t("excel_ok") : t("excel_missing");
      renderOrder(el);
    };
    const send = el.querySelector("#send"); if (send) send.onclick = () => {
      o.sent = BA.Actions.createMissions(o.plan, opts());
      renderOrder(el);
    };
  }

  function planHtml(o) {
    const p = o.plan;
    const sum = f => p.perType.reduce((a, r) => a + (r[f] || 0), 0);
    // « à retirer » avec la part obligatoire (pains déjà gardés une fois)
    const mustTxt = (n, m) => `${n}${m ? ` <span class="tag c-must" title="${E(t("kept_order_tip"))}">⛔ ${m}</span>` : ""}`;
    return `
      <h3 id="plan">🛒 ${t("order_result", { d: F.dt(o.planAt) })}</h3>
      <p class="note">${t("plan_summary", { d: F.dt(p.passage), h: F.num(p.hours, 1) })}${p.removeBefore ? " " + t("plan_removal", { d: F.dt(p.removeBefore) }) : " " + t("plan_no_removal")} ${t("plan_next", { d: F.dt(p.next) })}</p>
      ${sum("mandatory") ? `<div class="alert warn">${t("plan_must_note", { n: sum("mandatory") })}</div>` : ""}
      <div class="card q-card load-mode">
        <div class="lm-row"><span class="q-title">🧺 ${t("load_mode")}</span>
          <div class="seg"><button data-lm="need" class="${p.loadMode === "need" ? "active" : ""}">📈 ${t("load_need")}</button><button data-lm="full" class="${p.loadMode === "full" ? "active" : ""}">⬆ ${t("load_full")}</button></div></div>
        <p class="petit">${t(p.loadMode === "need" ? "load_need_help" : "load_full_help", { p: p.safetyPct })}</p>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>${t("col_type")}</th><th>${t("x_cap_total")}</th><th>${t("x_stock_now")}</th><th>${t("x_forecast")}</th><th>${t("x_stock_est")}</th><th>${t("x_to_remove")}</th><th>${t("x_to_order")}</th><th>${t("x_with_margin")}</th></tr></thead>
        <tbody>${p.perType.map(r => `<tr><td>${U.prod(r.type)}</td><td>${r.cap}</td><td>${r.stock}</td><td>${r.forecast ? "−" + r.forecast : 0}</td><td>${r.after}</td><td>${mustTxt(r.remove, r.mandatory)}</td><td>${r.order}</td><td><b>${r.orderWithMargin}</b></td></tr>`).join("")}
        <tr class="total-row"><td>${t("x_total")}</td><td>${sum("cap")}</td><td>${sum("stock")}</td><td>${sum("forecast") ? "−" + sum("forecast") : 0}</td><td>${sum("after")}</td><td>${mustTxt(sum("remove"), sum("mandatory"))}</td><td>${sum("order")}</td><td><b>${sum("orderWithMargin")}</b></td></tr></tbody></table></div>
      <h3>🚐 ${t("tour_title")}</h3>
      <div class="table-scroll"><table class="compact">
        <thead><tr><th>${t("machine")}</th><th>${t("col_address")}</th><th>${t("x_rate")}</th><th>${t("x_effect")}</th><th>${t("x_forecast")}</th><th>${t("x_to_remove")}</th><th>${t("adv_col_cover")}</th><th>${t("x_to_load")}</th><th>${t("tour_detail")}</th></tr></thead>
        <tbody>${p.perMachine.filter(pm => pm.load || pm.remove || pm.full).map(pm => `<tr data-tour="${pm.num}"><td class="selno">#${pm.num}</td><td>${E(pm.street)}, ${E(pm.city)}</td>
          <td>${F.num(pm.base, 1)}</td><td><span class="${pm.effect <= -0.15 ? "down" : pm.effect >= 0.15 ? "up" : ""}">${F.signed(pm.effect * 100)}</span></td>
          <td>${pm.forecast}</td><td>${pm.remove ? mustTxt(pm.remove, pm.mandatory) : ""}</td>
          <td>≈ ${F.num(pm.cover)}</td>
          <td class="ld-cell"><b>${pm.load}</b>${pm.adjusted ? ` <span class="tag c-mod" title="${E(t("load_less_tip", { n: pm.full - pm.load, f: pm.full }))}">📈 −${pm.full - pm.load}</span>` : ""}
            ${pm.need < pm.full ? `<div><button class="link-btn" data-lmm="${pm.num}">${pm.mode === "full" ? t("load_btn_need", { n: pm.need }) : t("load_btn_full", { n: pm.full })}</button></div>` : ""}</td>
          <td class="petit">${pm.lines.filter(l => l.load || l.remove).map(l => `${l.sel}: ${l.remove ? "−" + l.remove + (l.mandatory ? "⛔" : "") + " " : ""}+${l.load}`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>
      ${BA.AdminFC.adviceHtml(o)}
      <div class="carte-actions wrap-actions">
        <button class="btn" id="send">📤 ${t("btn_send_operator")}</button>
        <button class="btn secondary" id="x-order">📥 ${t("btn_excel_order")}</button>
      </div>
      ${o.sent != null ? `<div class="alert info">✅ ${t("sent_ok", { n: o.sent })}</div>` : ""}
      ${o.sentMsg ? `<div class="alert info">${o.sentMsg}</div>` : ""}
      <p class="note">${t("order_note")}</p>`;
  }

  function lastOrders(s) {
    if (!s.orders.length) return "";
    return `<h3>🗂 ${t("last_orders")}</h3>
      <div class="table-scroll"><table class="compact"><thead><tr><th>${t("col_when")}</th><th>${t("x_removal")}</th><th>${t("x_to_order")}</th></tr></thead>
      <tbody>${s.orders.slice(0, 5).map(od => `<tr><td>${F.dt(od.t)}${od.passageAt ? `<div class="petit">${t("passage_short", { d: F.dt(od.passageAt) })}</div>` : ""}</td><td>${od.withRemoval ? t("x_removal_before", { d: F.dt(od.removeBefore) }) : t("no")}</td>
        <td class="petit">${od.perType.map(x => `${U.prod(x.type)} ${x.qty}`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  // ================= Statistiques & rentabilité =================
  let chart = null, chart2 = null;

  function bucketKey(dateStr, period) {
    const d = new Date(dateStr + "T12:00:00");
    if (period === "day") return dateStr;
    if (period === "month") return dateStr.slice(0, 7);
    if (period === "year") return dateStr.slice(0, 4);
    // semaine : lundi de la semaine
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return M.dayKey(d.getTime());
  }
  function bucketLabel(k, period) {
    if (period === "day") return k.slice(8, 10) + "/" + k.slice(5, 7);
    if (period === "week") return t("week_of", { d: k.slice(8, 10) + "/" + k.slice(5, 7) });
    if (period === "month") return k.slice(5, 7) + "/" + k.slice(0, 4);
    return k;
  }

  function aggregate(s, period, machineNum) {
    const fixedOf = {}; s.machines.forEach(m => { fixedOf[m.num] = M.fixedOf(s, m) * 12 / 365; });
    const todayKey = M.dayKey(s.now);
    const startToday = new Date(s.now); startToday.setHours(0, 0, 0, 0);
    const todayFrac = Math.min(1, (s.now - startToday.getTime()) / M.DAY);
    const fee = s.settings.cardFeePct / 100;
    const buckets = {};
    const perMachine = {};
    Object.keys(s.daily).sort().forEach(day => {
      const k = bucketKey(day, period);
      const b = buckets[k] || (buckets[k] = { k, loaded: 0, sold: 0, returned: 0, rev: 0, cost: 0, fixed: 0, fees: 0, days: new Set() });
      b.days.add(day);
      // aujourd'hui : frais fixes au prorata de l'heure
      Object.entries(s.daily[day]).forEach(([num, r]) => {
        num = Number(num);
        const fixedFull = fixedOf[num] || 0;
        const fixedDay = day === todayKey ? fixedFull * todayFrac : fixedFull;
        const pm = (perMachine[k] = perMachine[k] || {});
        const x = pm[num] || (pm[num] = { loaded: 0, sold: 0, returned: 0, rev: 0, cost: 0, fixed: 0, fees: 0 });
        x.loaded += r.l; x.sold += r.s; x.returned += r.x; x.rev += r.r; x.cost += r.c; x.fixed += fixedDay; x.fees += r.r * fee;
        if (machineNum && num !== machineNum) return;
        b.loaded += r.l; b.sold += r.s; b.returned += r.x; b.rev += r.r; b.cost += r.c; b.fixed += fixedDay; b.fees += r.r * fee;
      });
    });
    const list = Object.values(buckets).sort((a, b) => a.k < b.k ? -1 : 1);
    list.forEach(b => { b.profit = b.rev - b.cost - b.fixed - b.fees; b.waste = b.loaded ? b.returned / b.loaded * 100 : 0; });
    Object.values(perMachine).forEach(pm => Object.values(pm).forEach(x => { x.profit = x.rev - x.cost - x.fixed - x.fees; x.waste = x.loaded ? x.returned / x.loaded * 100 : 0; }));
    return { list, perMachine };
  }

  const METRICS = ["loaded", "sold", "returned", "rev", "profit"];

  function renderStats(el) {
    const s = BA.Store.get();
    const o = st().stats = st().stats || { machine: 0, period: "day", view: "numbers", metric: "rev", which: "last" };
    const { list, perMachine } = aggregate(s, o.period, o.machine);
    // « dernière période complète » (hier, semaine passée…) ou « période en cours »
    const iCur = o.which === "current" ? list.length - 1 : list.length - 2;
    const cur = list[iCur] || { loaded: 0, sold: 0, returned: 0, rev: 0, cost: 0, fixed: 0, fees: 0, profit: 0, waste: 0, k: "" };
    const prev = o.which === "current" ? null : list[iCur - 1];
    const nShow = { day: 30, week: 26, month: 12, year: 5 }[o.period];
    const shown = list.slice(-nShow);

    // inv = true : une hausse est une mauvaise nouvelle (pertes, coûts)
    const delta = (a, b, inv) => {
      if (!prev || !b) return "";
      const d = (a - b) / Math.abs(b) * 100;
      const good = inv ? d <= 0 : d >= 0;
      return `<div class="petit ${good ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${F.num(Math.abs(d), 1)} % ${t("vs_prev")}</div>`;
    };
    const card = (label, val, raw, praw, cls, inv) => `<div class="card ${cls || ""}"><div class="label">${label}</div><div class="value">${val}</div>${delta(raw, praw, inv)}</div>`;

    let main = "";
    if (o.view === "numbers") {
      const P = prev || {};
      main = `<div class="cards">
        ${card(t("m_loaded"), F.num(cur.loaded), cur.loaded, P.loaded)}
        ${card(t("m_sold"), F.num(cur.sold), cur.sold, P.sold)}
        ${card(t("m_returned"), F.num(cur.returned), cur.returned, P.returned, "", true)}
        ${card(t("m_waste"), F.pct(cur.waste), cur.waste, P.waste, "", true)}
        ${card(t("m_rev"), F.eur(cur.rev), cur.rev, P.rev)}
        ${card(t("m_costs"), F.eur(cur.cost + cur.fixed + cur.fees), cur.cost + cur.fixed + cur.fees, P.cost != null ? P.cost + P.fixed + P.fees : 0, "", true)}
        ${card(t("m_profit"), F.eur(cur.profit), cur.profit, P.profit, cur.profit >= 0 ? "c-ok-b" : "c-empty-b")}
        <div class="card ${cur.profit >= 0 ? "c-ok-b" : "c-empty-b"}"><div class="label">${t("verdict")}</div><div class="value v-small">${cur.profit >= 0 ? "✔ " + t("profitable") : "✖ " + t("not_profitable")}</div></div>
      </div>
      <p class="note">${t("costs_detail", { a: F.eur(cur.cost), b: F.eur(cur.fixed), c: F.eur(cur.fees) })}</p>`;
    } else {
      main = `<div class="chart-box"><canvas id="stat-chart"></canvas></div>${o.view === "pie" ? `<div class="chart-box"><canvas id="stat-chart2"></canvas></div>` : ""}`;
    }

    // Rentabilité par machine sur la période en cours
    const pm = perMachine[cur.k] || {};
    const rows = s.machines.map(m => ({ m, x: pm[m.num] || { loaded: 0, sold: 0, returned: 0, rev: 0, cost: 0, fixed: 0, fees: 0, profit: 0, waste: 0 } }))
      .sort((a, b) => b.x.profit - a.x.profit);

    el.innerHTML = `
      <h2>📈 ${t("nav_stats")}</h2>
      <div class="toolbar stats-controls">
        <label>${t("machine")} <select id="st-machine" class="auto-w"><option value="0">${t("all_machines")}</option>
          ${s.machines.map(m => `<option value="${m.num}" ${o.machine === m.num ? "selected" : ""}>#${m.num} — ${E(m.street)}</option>`).join("")}</select></label>
        <label>${t("period")} <select id="st-period" class="auto-w">${["day", "week", "month", "year"].map(p => `<option value="${p}" ${o.period === p ? "selected" : ""}>${t("p_" + p)}</option>`).join("")}</select></label>
        <label>${t("which")} <select id="st-which" class="auto-w">${["last", "current"].map(w => `<option value="${w}" ${o.which === w ? "selected" : ""}>${t("which_" + w)}</option>`).join("")}</select></label>
        <label>${t("display")} <select id="st-view" class="auto-w">${["numbers", "line", "bar", "pie"].map(v => `<option value="${v}" ${o.view === v ? "selected" : ""}>${t("v_" + v)}</option>`).join("")}</select></label>
        ${o.view === "line" || o.view === "bar" ? `<label>${t("metric")} <select id="st-metric" class="auto-w">${METRICS.map(k => `<option value="${k}" ${o.metric === k ? "selected" : ""}>${t("m_" + k)}</option>`).join("")}</select></label>` : ""}
      </div>
      <p class="note">${t("stats_period_now", { p: bucketLabel(cur.k, o.period) })}${o.which === "current" ? " · " + t("current_note") : ""} · ${t("stats_note")}</p>
      ${main}
      <h3>💶 ${t("profit_by_machine", { p: bucketLabel(cur.k, o.period) })}</h3>
      <div class="table-scroll"><table class="compact">
        <thead><tr><th>${t("machine")}</th><th>${t("m_loaded")}</th><th>${t("m_sold")}</th><th>${t("m_returned")}</th><th>${t("m_waste")}</th><th>${t("m_rev")}</th><th>${t("m_costs")}</th><th>${t("m_profit")}</th><th>${t("verdict")}</th></tr></thead>
        <tbody>${rows.map(({ m, x }) => `<tr class="${o.machine === m.num ? "hl" : ""} ${x.profit < 0 ? "neg" : ""}">
          <td class="selno">#${m.num}</td><td>${F.num(x.loaded)}</td><td>${F.num(x.sold)}</td><td>${F.num(x.returned)}</td><td>${F.pct(x.waste)}</td>
          <td>${F.eur(x.rev)}</td><td>${F.eur(x.cost + x.fixed + x.fees)}</td><td><b>${F.eur(x.profit)}</b></td>
          <td>${!x.rev && !x.loaded ? `<span class="tag">${t("no_activity")}</span>` : x.profit >= 0 ? `<span class="tag c-ok">✔ ${t("profitable")}</span>` : `<span class="tag c-empty">✖ ${t("not_profitable")}</span>`}</td></tr>`).join("")}</tbody></table></div>`;

    el.querySelector("#st-machine").onchange = e => { o.machine = Number(e.target.value); renderStats(el); };
    el.querySelector("#st-period").onchange = e => { o.period = e.target.value; renderStats(el); };
    el.querySelector("#st-view").onchange = e => { o.view = e.target.value; renderStats(el); };
    el.querySelector("#st-which").onchange = e => { o.which = e.target.value; renderStats(el); };
    const me = el.querySelector("#st-metric"); if (me) me.onchange = e => { o.metric = e.target.value; renderStats(el); };

    if (chart) { chart.destroy(); chart = null; }
    if (chart2) { chart2.destroy(); chart2 = null; }
    if (o.view === "numbers") return;
    if (typeof Chart === "undefined") {
      el.querySelector(".chart-box").innerHTML = `<div class="alert warn">${t("chart_missing")}</div>`;
      return;
    }
    Chart.defaults.color = "#cbd5e1";
    Chart.defaults.borderColor = "#334155";
    const isMoney = o.metric === "rev" || o.metric === "profit";
    if (o.view === "line" || o.view === "bar") {
      chart = new Chart(el.querySelector("#stat-chart"), {
        type: o.view,
        data: {
          labels: shown.map(b => bucketLabel(b.k, o.period)),
          datasets: [{
            label: t("m_" + o.metric) + (o.machine ? " — #" + o.machine : " — " + t("all_machines")),
            data: shown.map(b => Math.round(b[o.metric] * 100) / 100),
            borderColor: "#3b82f6", backgroundColor: o.view === "bar" ? shown.map(b => o.metric === "profit" && b.profit < 0 ? "#ef4444" : "#3b82f6") : "rgba(59,130,246,.18)",
            fill: o.view === "line", tension: 0.25, pointRadius: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: true }, tooltip: { callbacks: { label: c => isMoney ? F.eur(c.parsed.y) : F.num(c.parsed.y) } } },
          scales: { y: { beginAtZero: true, ticks: { callback: v => isMoney ? F.eur(v) : F.num(v) } } }
        }
      });
    } else {
      chart = new Chart(el.querySelector("#stat-chart"), {
        type: "doughnut",
        data: { labels: [t("m_sold"), t("m_returned")], datasets: [{ data: [cur.sold, cur.returned], backgroundColor: ["#16a34a", "#f59e0b"], borderColor: "#1e293b" }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { title: { display: true, text: t("pie_bread", { p: bucketLabel(cur.k, o.period) }) } } }
      });
      const money = [Math.max(0, cur.cost), Math.max(0, cur.fixed), Math.max(0, cur.fees), Math.max(0, cur.profit)];
      chart2 = new Chart(el.querySelector("#stat-chart2"), {
        type: "doughnut",
        data: { labels: [t("pie_purchase"), t("pie_fixed"), t("pie_fees"), t("m_profit")], datasets: [{ data: money.map(v => Math.round(v * 100) / 100), backgroundColor: ["#64748b", "#a855f7", "#0ea5e9", "#16a34a"], borderColor: "#1e293b" }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { title: { display: true, text: t("pie_money", { r: F.eur(cur.rev) }) }, tooltip: { callbacks: { label: c => c.label + " : " + F.eur(c.parsed) } } } }
      });
    }
  }

  // ================= Paramètres =================
  function renderSettings(el) {
    const s = BA.Store.get(), P = s.settings;
    const msg = st().settingsMsg || "", err = st().settingsErr || "";
    st().settingsErr = "";
    el.innerHTML = `
      <h2>⚙️ ${t("nav_settings")}</h2>
      <div class="settings-grid">
        <div class="card"><h3>🍞 ${t("set_bread")}</h3>
          <label class="field-row">${t("set_thr")} <input id="set-thr" class="num-in" type="number" min="1" max="200" value="${P.thrHours}"> h</label>
          <p class="petit">${t("set_thr_help")}</p>
          <label class="field-row">${t("set_day_hour")} <input id="set-day-h" class="num-in" type="number" min="0" max="23" step="1" value="${M.dayHour(s)}"> h</label>
          <p class="petit">${t("set_day_hour_help")}</p>
          <label class="field-row">${t("set_empty")} <input id="set-empty" class="num-in" type="number" min="0" max="50" value="${P.emptyPct}"> %</label>
          <p class="petit">${t("set_empty_help")}</p>
        </div>
        <div class="card"><h3>🌡 ${t("set_temp")}</h3>
          <label class="field-row">${t("set_tmin")} <input id="set-tmin" class="num-in" type="number" step="0.5" value="${P.tempMin}"> °C</label>
          <label class="field-row">${t("set_tmax")} <input id="set-tmax" class="num-in" type="number" step="0.5" value="${P.tempMax}"> °C</label>
        </div>
        <div class="card"><h3>💶 ${t("set_money")}</h3>
          ${M.types(s).map(ty => `<label class="field-row">${t("set_purchase", { p: U.prod(ty) })} <input id="set-pp-${ty}" class="num-in" type="number" step="0.05" min="0" value="${P.purchase[ty] != null ? P.purchase[ty] : 1}"> €</label>`).join("")}
          <label class="field-row">${t("set_fixed_default")} <input id="set-fixed" class="num-in" type="number" min="0" value="${P.fixedMonthly}"> €</label>
          <div class="field-row"><button class="btn secondary" id="set-fixed-open">🏷 ${t("set_fixed_open")}</button>
            <span class="petit">${t("set_fixed_sum", { n: F.eur(s.machines.reduce((a, m) => a + M.fixedOf(s, m), 0)) })}</span></div>
          <label class="field-row">${t("set_fee")} <input id="set-fee" class="num-in" type="number" step="0.1" min="0" value="${P.cardFeePct}"> %</label>
          <label class="field-row">${t("set_price")} <input id="set-price" class="num-in" type="number" step="0.1" min="0" value="${P.salePrice}"> €</label>
          <label class="case"><input type="checkbox" id="set-price-all"> ${t("set_price_all")}</label>
        </div>
        ${BA.AdminFC.settingsCard(s)}
      </div>
      ${err ? `<div class="alert err">⚠️ ${err}</div>` : ""}
      <button class="btn" id="set-save">💾 ${t("btn_save")}</button>
      ${msg ? `<span class="saved">✅ ${msg}</span>` : ""}`;
    el.querySelector("#set-fixed-open").onclick = () => fixedModal(() => renderSettings(el));
    el.querySelector("#set-save").onclick = () => {
      const P2 = BA.Store.get().settings;
      // case vide ou illisible : on garde la valeur actuelle (avant, une case vide devenait 0)
      const n = (id, cur, min, max) => {
        const i = el.querySelector(id), v = Number(i && i.value);
        if (!i || i.value.trim() === "" || !isFinite(v)) return cur;
        return Math.max(min, Math.min(max, v));
      };
      const purchase = Object.assign({}, P2.purchase);   // les prix des types qui ne sont pas affichés sont gardés
      M.types(BA.Store.get()).forEach(ty => { const i = el.querySelector("#set-pp-" + ty); if (i) purchase[ty] = n("#set-pp-" + ty, P2.purchase[ty] != null ? P2.purchase[ty] : 1, 0, 1000); });
      const values = {
        thrHours: Math.round(n("#set-thr", P2.thrHours, 1, 200)),
        dayHour: Math.round(n("#set-day-h", M.dayHour(BA.Store.get()), 0, 23)),
        emptyPct: n("#set-empty", P2.emptyPct, 0, 50),
        tempMin: n("#set-tmin", P2.tempMin, -30, 60), tempMax: n("#set-tmax", P2.tempMax, -30, 60),
        purchase, fixedMonthly: n("#set-fixed", P2.fixedMonthly, 0, 100000), cardFeePct: n("#set-fee", P2.cardFeePct, 0, 100),
        salePrice: n("#set-price", P2.salePrice, 0, 1000)
      };
      if (values.tempMin >= values.tempMax) { st().settingsErr = t("set_err_temp"); st().settingsMsg = ""; renderSettings(el); return; }
      st().settingsErr = "";
      BA.Actions.saveSettings(values);
      const fc = BA.AdminFC.readSettingsCard(el);
      if (fc) BA.Actions.saveForecastSettings(fc);
      if (el.querySelector("#set-price-all").checked) {
        BA.Store.update(s2 => s2.machines.forEach(m => m.sels.forEach(sel => { sel.price = values.salePrice; })));
      }
      st().settingsMsg = t("saved");
      renderSettings(el);
      setTimeout(() => { st().settingsMsg = ""; }, 3000);
    };
  }

  // ---- Frais fixes mensuels : fenêtre avec toutes les machines ----
  function fixedModal(done) {
    const s = BA.Store.get(), root = document.getElementById("modal-root");
    const def = Number(s.settings.fixedMonthly) || 0;
    const close = () => { root.innerHTML = ""; };
    root.innerHTML = `<div class="modal-back"><div class="modal fx-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h2>🏷 ${t("fx_title")}</h2></div></div>
      <p class="note">${t("fx_help", { d: F.eur(def) })}</p>
      <div class="table-scroll fx-scroll"><table class="compact"><thead><tr><th>${t("machine")}</th><th>${t("fx_col")}</th></tr></thead>
        <tbody>${s.machines.map(m => `<tr><td class="selno">#${m.num}<div class="petit">${E(m.city)}</div></td>
          <td><input type="number" class="num-in fx-in" data-fx="${m.num}" min="0" step="1" placeholder="${def}" value="${m.fixed != null ? m.fixed : ""}"> €</td></tr>`).join("")}
          <tr class="tot-row"><td><b>${t("fx_total")}</b></td><td id="fx-total"></td></tr></tbody></table></div>
      <div id="fx-err"></div>
      <div class="wz-actions"><button class="btn" id="fx-save">💾 ${t("btn_save")}</button>
        <button class="btn secondary" id="fx-cancel">${t("btn_cancel")}</button>
        <button class="btn secondary" id="fx-all">${t("fx_all", { d: F.eur(def) })}</button></div>
    </div></div>`;
    const ins = () => Array.from(root.querySelectorAll(".fx-in"));
    const total = () => { document.getElementById("fx-total").innerHTML = `<b>${F.eur(ins().reduce((a, i) => a + (i.value === "" ? def : Math.max(0, Number(i.value) || 0)), 0))}</b>`; };
    ins().forEach(i => i.oninput = total); total();
    document.getElementById("fx-cancel").onclick = close;
    document.getElementById("fx-all").onclick = () => { ins().forEach(i => { i.value = ""; }); total(); };
    document.getElementById("fx-save").onclick = () => {
      if (ins().some(i => i.value !== "" && !(Number(i.value) >= 0))) { document.getElementById("fx-err").innerHTML = `<div class="alert err">${t("fx_err")}</div>`; return; }
      const map = {}; ins().forEach(i => { map[i.dataset.fx] = i.value === "" ? null : Number(i.value); });
      BA.Actions.setFixedCosts(map);
      st().settingsMsg = t("saved");
      close(); if (done) done();
      setTimeout(() => { st().settingsMsg = ""; }, 3000);
    };
  }

  // ================= Démarrage =================
  BA.Boot.start({
    role: "admin",
    admin: true,
    views: [
      { id: "dashboard", icon: "🌍", label: "nav_dashboard", render: U.renderDashboard, live: true },
      { id: "details",   icon: "📊", label: "nav_details",   render: U.renderDetails,   live: true },
      { id: "products",  icon: "🍞", label: "nav_products",  render: renderProducts,    live: true },
      // « Commander » ne bouge pas pendant qu'on prépare la commande ; l'onglet « Vérifier l'état de stock » suit en direct
      { id: "order",     icon: "📦", label: "nav_order",     render: renderOrder,       live: () => !!st().order && st().order.tab === "stock" },
      { id: "forecast",  icon: "📅", label: "nav_forecast",  render: BA.AdminFC.renderForecastView, live: false },
      { id: "stats",     icon: "📈", label: "nav_stats",     render: renderStats,       live: false },
      { id: "history",   icon: "🧾", label: "nav_history",   render: BA.History.render, live: false, tick: BA.History.tick },
      { id: "alerts",    icon: "⚠️", label: "nav_alerts",    render: U.renderAlerts,    live: true },
      // v5 : l'onglet garde les fonctions de la v3.2 (câble, relevés, machines) ; mis à jour par morceaux
      { id: "rs232",     icon: "🔌", label: "nav_rs232",     render: el => BA.Rs232.render(el), live: false, tick: () => BA.Rs232.tick() },
      { id: "settings",  icon: "⚙️", label: "nav_settings",  render: renderSettings,    live: false }
    ],
    footer() {
      return `
        <span id="sim-clock" class="sim-clock"></span>
        <span id="version">${BA_CONFIG.app.name} v${BA_CONFIG.app.version}</span>`;
    },
    afterInit() { BA.Rs232.init().catch(e => console.warn("Reconnexion du câble :", e.message)); },
    refreshFooter(s) {
      const c = document.getElementById("sim-clock");
      if (c) c.textContent = "🕒 " + F.dayLong(s.now) + " " + F.time(s.now);
    }
  });
})();
