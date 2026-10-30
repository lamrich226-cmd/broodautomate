// ============================================================
// BROODAUTOMATE v5 — Interface commune (BA.UI, BA.Shell)
// (reprise de la version test 4.8.1 ; changements v5 marqués « v5 »)
// Utilisée par l'admin (index.html) et l'opérateur (operateur.html).
// Même design que Broodautomate. L'opérateur ne voit jamais
// les ventes ni le chiffre d'affaires.
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model;
  const t = (k, v) => BA.I18n.t(k, v);
  const $ = sel => document.querySelector(sel);
  const pad = M.pad;

  // ---------------- Formats ----------------
  const LOC = { fr: "fr-BE", nl: "nl-BE", en: "en-GB" };
  const loc = () => LOC[BA.I18n.lang] || "fr-BE";
  const F = {
    esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
    time(ms) { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    clock(ms) { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); },
    dt(ms) { const d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    date(ms) { const d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); },
    dayLong(ms) { return new Date(ms).toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "long" }); },
    // jour de semaine court + date : « mer. 28/10 »
    dayShort(ms) { const d = new Date(ms); return d.toLocaleDateString(loc(), { weekday: "short" }) + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1); },
    wdLong(i) { return new Date(2026, 0, 4 + i, 12).toLocaleDateString(loc(), { weekday: "long" }); },
    wdName(i) { return new Date(2026, 0, 4 + i, 12).toLocaleDateString(loc(), { weekday: "short" }); },   // 0 = dimanche
    key(k) { const p = String(k).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : k; },
    keyShort(k) { const p = String(k).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : k; },
    signed(v) { const r = Math.round(v); return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r) + " %"; },
    age(ms) {
      ms = Math.max(0, ms);
      if (ms < M.H) return Math.floor(ms / M.MIN) + " min";
      return Math.floor(ms / M.H) + " h " + pad(Math.floor(ms % M.H / M.MIN));
    },
    countdown(ms) { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); },
    eur(v) { return Number(v || 0).toLocaleString(loc(), { style: "currency", currency: "EUR" }); },
    num(v, d) { return Number(v || 0).toLocaleString(loc(), { maximumFractionDigits: d == null ? 0 : d }); },
    pct(v) { return Number(v || 0).toLocaleString(loc(), { maximumFractionDigits: 1 }) + " %"; },
    toInput(ms) { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    fromInput(v) { const ms = new Date(v).getTime(); return isNaN(ms) ? null : ms; }
  };
  const E = F.esc;

  // Nom d'un type de pain : traduction des types de base, sinon le nom écrit par l'utilisateur
  const prodText = type => {
    const k = "prod_" + type, v = t(k);
    if (v !== k) return v;
    return M.customName(BA.Store.get(), type) || String(type);
  };
  const prod = type => F.esc(prodText(type));
  const ICON = { door: "🚪", power: "⚡", empty: "🔴", error: "⛔", remove: "🟠", low: "🟡", ok: "🟢", offline: "⚪" };
  const pill = st => `<span class="pill st-${st}">${t("st_" + st)}</span>`;
  // v5 : température lue sur la machine (inconnue tant qu'aucun relevé n'est arrivé)
  const hasTemp = m => m.temp != null && m.temp !== "" && isFinite(m.temp);
  const tempBadOf = (s, m) => hasTemp(m) && (m.temp > s.settings.tempMax || m.temp < s.settings.tempMin);
  const tempTxt = m => hasTemp(m) ? F.num(m.temp, 1) + " °C" : "— °C";
  // v5 : plus de « vente dans mm:ss » (simulateur) : heure des dernières données reçues
  // v5.1 : + état du boîtier 4G (« 📡 4G 04:19 » = dernier signe de vie)
  const boxTag = m => BA.Boitiers ? F.esc(BA.Boitiers.tag(m)) : "";
  const seenTxt = (s, m) => (m.lastSeen ? t("foot_seen", { d: (M.dayKey(m.lastSeen) === M.dayKey(s.now) ? "" : F.dt(m.lastSeen).slice(0, 5) + " ") + F.time(m.lastSeen) }) : t("foot_never")) + boxTag(m);

  // ---------------- Fenêtre de confirmation (suppressions, réinitialisation) ----------------
  // o = { title, html, ok, cancel, danger, onOk } — Échap, « Annuler » ou un clic à côté ferment sans rien faire.
  function confirmDialog(o) {
    const root = document.getElementById("modal-root");
    const back = document.activeElement;
    const key = e => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const close = () => {
      document.removeEventListener("keydown", key, true);
      root.innerHTML = "";
      if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
    };
    root.innerHTML = `<div class="modal-back dlg-back"><div class="modal dlg-modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="modal-head"><h2 id="dlg-title">${o.title}</h2></div>
      <div class="dlg-body">${o.html || ""}</div>
      <div class="wz-actions">
        <button class="btn big ${o.danger ? "btn-danger" : ""}" id="dlg-ok">${o.ok}</button>
        <button class="btn big secondary" id="dlg-cancel">${o.cancel || t("btn_cancel_short")}</button>
      </div></div></div>`;
    document.addEventListener("keydown", key, true);
    root.querySelector("#dlg-cancel").onclick = close;
    root.querySelector(".dlg-back").onclick = e => { if (e.target.classList.contains("dlg-back")) close(); };
    root.querySelector("#dlg-ok").onclick = () => { close(); o.onOk(); };
    root.querySelector("#dlg-cancel").focus();
  }

  // ---------------- Redessiner sans perdre un clic ----------------
  // Quand on quitte une case en cliquant sur un bouton, la case enregistre (et redessinait l'écran) AVANT
  // que le clic soit terminé : le bouton était remplacé sous la souris et le clic était perdu.
  // afterClick(fn) : tout de suite si aucun bouton de souris n'est enfoncé, sinon juste après le clic.
  function afterClick(fn) {
    const u = BA.Shell && BA.Shell.ui;
    if (!u || !u.down) { fn(); return; }
    let done = false, timer = setTimeout(() => run(), 10000);
    const run = () => {
      if (done) return; done = true; clearTimeout(timer);
      document.removeEventListener("click", onClick, true); document.removeEventListener("pointerup", onUp, true);
      fn();
    };
    const onClick = () => setTimeout(run, 0);                 // après les actions du clic
    const onUp = () => { clearTimeout(timer); timer = setTimeout(run, 400); };   // relâché sans clic (glissé)
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerup", onUp, true);
  }

  // ---------------- Case date/heure ----------------
  // Choix dans le calendrier : enregistré tout de suite. Au clavier : quand on quitte la case ou avec Entrée
  // (sinon chaque chiffre tapé enregistrait une date incomplète et la case se fermait).
  function dateInput(inp, fn) {
    let typing = false, last = inp.value;
    const commit = () => { typing = false; if (inp.value && inp.value !== last) { last = inp.value; inp.defaultValue = inp.value; fn(inp.value); } };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key !== "Tab" && e.key !== "Shift") typing = true; });
    inp.addEventListener("change", () => { if (!typing) commit(); });
    inp.addEventListener("blur", commit);
  }

  // ================= VUES COMMUNES =================

  // ---------- Dashboard ----------
  function summaryCards(s, list, admin) {
    const doors = list.filter(o => o.m.door).length;
    const empties = list.filter(o => o.x.st === "empty").length;
    const remove = list.reduce((a, o) => a + o.x.toRemove, 0);
    const stock = list.reduce((a, o) => a + o.x.total, 0);
    const online = list.filter(o => o.m.online).length;
    const today = s.daily[M.dayKey(s.now)] || {};
    const sold = Object.values(today).reduce((a, r) => a + r.s, 0);
    const rev = Object.values(today).reduce((a, r) => a + r.r, 0);
    const cards = [
      ["ok", t("sum_online"), online + "/" + list.length],
      ["door", t("sum_door"), doors],
      ["empty", t("sum_empty"), empties],
      ["remove", t("sum_remove"), remove],
      ["", t("sum_stock"), stock]
    ];
    if (admin) cards.push(["", t("sum_sales_today"), sold], ["", t("sum_rev_today"), F.eur(rev)]);
    return `<div class="cards summary-cards">${cards.map(([c, l, v]) =>
      `<div class="card stat ${c ? "c-" + c : ""}"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}</div>`;
  }

  function machineCard(s, m, x, admin) {
    const chips = [];
    if (x.toRemove) chips.push(`<span class="chip c-remove">🟠 ${t("chip_remove", { n: x.toRemove })}</span>`);
    if (x.mandatory) chips.push(`<span class="chip c-must" title="${E(t("kept_invalid_tip"))}">${t("chip_must", { n: x.mandatory })}</span>`);
    if (x.keptOnce) chips.push(`<span class="chip c-kept" title="${E(t("kept_next"))}">${t("chip_kept", { n: x.keptOnce })}</span>`);
    if (x.emptySels && x.total > 0) chips.push(`<span class="chip c-empty">${t(x.emptySels > 1 ? "chip_emptyN" : "chip_empty1", { n: x.emptySels })}</span>`);
    if (x.oldest !== null) chips.push(`<span class="chip">${t("chip_oldest")} ${F.age(s.now - x.oldest)}</span>`);
    chips.push(`<span class="chip ${tempBadOf(s, m) ? "c-error" : ""}">🌡 ${tempTxt(m)}</span>`);
    let left;
    if (m.door) left = t("foot_door") + boxTag(m);
    else if (m.power) left = t("foot_power") + boxTag(m);
    else if (x.total === 0) left = t("foot_empty") + boxTag(m);
    else left = seenTxt(s, m);
    const today = (s.daily[M.dayKey(s.now)] || {})[m.num];
    const right = admin ? `🧾 ${today ? today.s : 0} · ${F.eur(today ? today.r : 0)}` : (m.online ? "🟢 " + t("online") : "⚪ " + t("offline"));   // v5 : état réel
    return `<div class="card carte-machine st-${x.st}" tabindex="0" role="button" data-machine="${m.num}">
      ${m.door ? `<div class="door-banner">🚪 ${t("door_banner")}</div>` : ""}
      <div class="cm-top"><span class="cm-num">#${m.num}</span>${pill(x.st)}</div>
      <div class="cm-addr"><div>${E(m.street)}</div><div class="petit">${E(m.city)}</div></div>
      <div class="gauge"><span style="width:${x.pct}%"></span></div>
      <div class="cm-row"><span>${x.total}/${x.cap} ${t("breads")}</span><span>${x.pct} %</span></div>
      <div class="chips">${chips.join("")}</div>
      <div class="cm-foot"><span>${left}</span><span>${right}</span></div>
    </div>`;
  }

  function renderDashboard(el, ctx) {
    const s = BA.Store.get();
    if (!el.querySelector("#dash-body")) {
      el.innerHTML = `
        <h2>🌍 ${t("nav_dashboard")}</h2>
        <div id="dash-sum"></div>
        <div class="toolbar">
          <input id="dash-search" class="search" type="search" data-live="1" autocomplete="off" placeholder="${E(t("search_ph"))}">
          <div class="legend">${["door", "empty", "error", "remove", "low", "ok"].map(pill).join("")}</div>
        </div>
        <div id="dash-body"></div>`;
      el.querySelector("#dash-search").addEventListener("input", () => renderDashboard(el, ctx));
    }
    const q = (el.querySelector("#dash-search").value || "").trim().toLowerCase();
    const all = s.machines.map(m => ({ m, x: M.stats(s, m) }));
    el.querySelector("#dash-sum").innerHTML = summaryCards(s, all, ctx.admin);
    const shown = all
      .filter(({ m }) => !q || String(m.num).includes(q) || m.street.toLowerCase().includes(q) || m.city.toLowerCase().includes(q))
      .sort((a, b) => M.RANK[a.x.st] - M.RANK[b.x.st] || a.x.pct - b.x.pct || a.m.num - b.m.num);
    const body = el.querySelector("#dash-body");
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.machine : null;
    body.innerHTML = shown.length
      ? `<div class="cards machines-grid">${shown.map(o => machineCard(s, o.m, o.x, ctx.admin)).join("")}</div>`
      : `<div class="alert info">${!all.length ? t(ctx.admin ? "no_machine_admin" : "no_machine_op") : t("no_match")}</div>`;
    if (focused) { const f = body.querySelector(`[data-machine="${focused}"]`); if (f) f.focus({ preventScroll: true }); }
  }

  // ---------- Choix de la machine (vues Détails / Produits) ----------
  function machinePicker(s, current, id) {
    return `<label class="picker">${t("machine")} :
      <select id="${id}" data-nav-machine="1">${s.machines.map(m =>
        `<option value="${m.num}" ${m.num === current ? "selected" : ""}>#${m.num} — ${E(m.street)}, ${E(m.city)}</option>`).join("")}</select></label>`;
  }

  // ---------- Tableau des lots (sélection / type / qté / date du lot) ----------
  function lotsTable(s, m, opts) {
    const mission = M.openMission(s, m.num);
    let rows = "";
    m.sels.forEach(sel => {
      M.sortLots(sel);
      const q = M.qty(sel);
      if (!sel.lots.length) {
        rows += `<tr class="sel-first empty"><td class="selno">${sel.n}</td><td>${prod(sel.type)}</td><td>0 <span class="petit">/ ${sel.cap}</span></td><td>—</td><td></td><td><span class="tag c-empty">${t("sel_empty")}</span></td></tr>`;
        return;
      }
      sel.lots.forEach((l, j) => {
        const old = M.isOld(s, l);
        const planned = mission && mission.removeBefore && !l.kept && l.date < mission.removeBefore;
        const invalid = l.kept && M.isMandatory(s, l);
        const hot = old || planned || invalid;
        // « ➖ Retirer » sur chaque lot : on choisit combien de pains enlever (admin et opérateur)
        const rmBtn = `<button class="btn petit ${hot ? "" : "secondary"}" data-act="rm-bread" data-sel="${sel.n}" data-lot="${l.id}" title="${E(t("btn_rm_tip"))}">➖ ${t("btn_withdraw")}</button>`;
        let status;
        // gardé une fois (encore bon) : valable jusqu'au jour suivant, puis invalide (à retirer) ; pas de 2e « Encore bon »
        if (invalid) status = `<span class="tag c-must">⛔ ${t("lot_invalid")}</span>${l.keptAt ? `<div class="petit">${t("kept_on", { d: F.dt(l.keptAt) })}</div>` : ""}${rmBtn}`;
        else if (l.kept) status = `<span class="tag c-kept">⏳ ${t("lot_kept")}</span><div class="petit">${t("kept_until", { d: F.dt(l.keptAt || s.now), u: F.dt(M.invalidAt(s, l)) })}</div>${rmBtn}`;
        else if (old || planned) status = `<span class="tag c-remove">${t("lot_remove")}</span>
          <button class="btn petit secondary" data-act="keep" data-sel="${sel.n}" data-lot="${l.id}" title="${E(t("btn_keep_tip"))}">${t("btn_keep")}</button>${rmBtn}`;
        else status = `<span class="tag c-ok">${t("lot_ok")}</span>${rmBtn}`;
        rows += `<tr class="${j === 0 ? "sel-first" : ""} ${hot ? "lot-old" : ""}">
          <td class="selno">${j === 0 ? sel.n : ""}</td>
          <td>${j === 0 ? prod(sel.type) : ""}</td>
          <td>${l.qty}${j === 0 ? ` <span class="petit">(${q}/${sel.cap})</span>` : ""}
            ${l.qty > 1 ? `<button class="btn petit secondary" data-act="split" data-sel="${sel.n}" data-lot="${l.id}" title="${t("split_tip")}">✂ ${t("btn_split")}</button>` : ""}</td>
          <td><input type="datetime-local" class="lot-date" id="lotdate-${m.num}-${l.id}" value="${F.toInput(l.date)}" data-sel="${sel.n}" data-lot="${l.id}">${l.estimated ? ` <span class="petit">${t("estimated")}</span>` : ""}</td>
          <td>${F.age(s.now - l.date)}</td>
          <td class="wrap">${status}</td></tr>`;
      });
    });
    return `<div class="table-scroll"><table class="lots">
      <thead><tr><th>${t("col_sel")}</th><th>${t("col_type")}</th><th>${t("col_qty")}</th><th>${t("col_lotdate")}</th><th>${t("col_age")}</th><th>${t("col_status")}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // Fenêtre « dater autrement quelques pains d'un lot » (date par pain, pas seulement par lot)
  function splitDialog(num, selN, lotId) {
    const s = BA.Store.get(), m = M.machine(s, num), sel = m && M.sel(m, selN);
    const lot = sel && sel.lots.find(l => l.id === Number(lotId));
    if (!lot || lot.qty < 2) return;
    const root = document.getElementById("modal-root");
    const close = () => { root.innerHTML = ""; };
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h2>✂ ${t("split_title")}</h2>
        <div class="petit">#${m.num} · ${t("col_sel")} ${sel.n} · ${F.dt(lot.date)} · ${t("split_lot_qty", { n: lot.qty })}</div></div></div>
      <p class="note">${t("split_help")}</p>
      <label class="field-row">${t("split_n")} <input type="number" class="num-in big-in" id="sp-n" min="1" max="${lot.qty - 1}" value="1"></label>
      <label class="field-row">${t("split_date")} <input type="datetime-local" id="sp-date" value="${F.toInput(lot.date)}"></label>
      <div id="sp-err"></div>
      <div class="wz-actions"><button class="btn big" id="sp-ok">✔ ${t("btn_split_ok")}</button>
        <button class="btn big secondary" id="sp-cancel">${t("btn_cancel_short")}</button></div>
    </div></div>`;
    document.getElementById("sp-cancel").onclick = close;
    document.getElementById("sp-ok").onclick = () => {
      const n = Number(document.getElementById("sp-n").value), ms = F.fromInput(document.getElementById("sp-date").value);
      if (!(n >= 1 && n <= lot.qty - 1) || !ms) { document.getElementById("sp-err").innerHTML = `<div class="alert err">${t("split_err")}</div>`; return; }
      BA.Actions.splitLot(num, selN, lotId, n, ms);
      close();
    };
  }

  // ---------- Petit message en bas de l'écran (quelques secondes) ----------
  function toast(text, ms) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text; el.classList.add("on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("on"), ms || 4500);
  }

  // ---------- Fenêtre « Retirer des pains » (au choix, admin et opérateur) ----------
  // lotId : lot sur lequel on a cliqué (prérempli : tout le lot s'il est à retirer, sinon 1 pain) ;
  // sans lotId (depuis Produits / Stock) : 1 pain du lot le plus ancien.
  const REASONS = ["old", "damaged", "stock", "gift", "other"];
  function removeDialog(num, selN, lotId) {
    const s = BA.Store.get(), m = M.machine(s, num), sel = m && M.sel(m, selN);
    if (!sel) return;
    M.sortLots(sel);
    if (!sel.lots.length) { toast(t("rm_none")); return; }
    const mission = M.openMission(s, m.num);
    const isOld = l => M.mustRemove(s, l, mission);
    const target = sel.lots.find(l => l.id === Number(lotId)) || sel.lots[0];
    const pre = l => l !== target ? 0 : (lotId != null && isOld(l) ? l.qty : 1);
    const reason = isOld(target) ? "old" : "damaged";
    const root = document.getElementById("modal-root");
    const back = document.activeElement;
    const key = e => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const close = () => { document.removeEventListener("keydown", key, true); root.innerHTML = ""; if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); };
    root.innerHTML = `<div class="modal-back dlg-back"><div class="modal rm-modal" role="dialog" aria-modal="true" aria-labelledby="rm-title">
      <div class="modal-head"><div><h2 id="rm-title">➖ ${t("rm_title")}</h2>
        <div class="petit">#${m.num} · ${t("col_sel")} ${sel.n} · ${prod(sel.type)} · ${E(m.street)}</div></div></div>
      <p class="note">${t("rm_help")}</p>
      <div class="table-scroll"><table class="compact wz rm-table"><thead><tr><th>${t("rm_col_lot")}</th><th>${t("rm_col_age")}</th><th>${t("rm_col_in")}</th><th>${t("rm_col_out")}</th></tr></thead>
        <tbody>${sel.lots.map(l => `<tr class="${isOld(l) ? "lot-old" : ""}"><td class="nowrap">${F.dt(l.date)}${l.kept
          ? (M.isMandatory(s, l) ? ` <span class="tag c-must">⛔ ${t("lot_invalid_short")}</span>` : ` <span class="tag c-kept">⏳ ${t("lot_kept_short")}</span>`)
          : isOld(l) ? ` <span class="tag c-remove">${t("lot_remove")}</span>` : ""}</td>
          <td>${F.age(s.now - l.date)}</td><td class="big-num">${l.qty}</td>
          <td><input type="number" class="num-in big-in rm-in" data-lot="${l.id}" min="0" max="${l.qty}" value="${pre(l)}"></td></tr>`).join("")}</tbody></table></div>
      <div class="rm-fields">
        <label>${t("rm_reason")} <select id="rm-reason" class="auto-w">${REASONS.map(r => `<option value="${r}" ${r === reason ? "selected" : ""}>${t("rr_" + r)}</option>`).join("")}</select></label>
        <label>${t("rm_note")} <input type="text" id="rm-note" class="txt-in" maxlength="80" placeholder="${E(t("rm_note_ph"))}"></label>
      </div>
      <p class="petit" id="rm-total"></p>
      <div id="rm-err"></div>
      <div class="wz-actions"><button class="btn big" id="rm-ok">✔ ${t("rm_ok")}</button>
        <button class="btn big secondary" id="rm-cancel">${t("btn_cancel_short")}</button></div>
    </div></div>`;
    document.addEventListener("keydown", key, true);
    const ins = () => Array.from(root.querySelectorAll(".rm-in"));
    const total = () => { const n = ins().reduce((a, i) => a + Math.max(0, Math.round(Number(i.value) || 0)), 0); root.querySelector("#rm-total").textContent = t("rm_total", { n }); };
    ins().forEach(i => i.oninput = total); total();
    root.querySelector("#rm-cancel").onclick = close;
    root.querySelector(".dlg-back").onclick = e => { if (e.target.classList.contains("dlg-back")) close(); };
    root.querySelector("#rm-ok").onclick = () => {
      const items = ins().map(i => ({ lotId: i.dataset.lot, qty: i.value === "" ? 0 : Number(i.value), max: Number(i.max) }));
      const bad = items.some(x => !(x.qty >= 0) || x.qty > x.max || Math.round(x.qty) !== x.qty) || !items.some(x => x.qty > 0);
      if (bad) { root.querySelector("#rm-err").innerHTML = `<div class="alert err">${t("rm_err")}</div>`; return; }
      const res = BA.Actions.removeBread(num, sel.n, items, root.querySelector("#rm-reason").value, root.querySelector("#rm-note").value) || {};
      if (res.err) { root.querySelector("#rm-err").innerHTML = `<div class="alert err">${t(res.err)}</div>`; return; }
      close();
      toast("✅ " + t("rm_done", { n: res.removed, s: sel.n }));
      BA.Shell.renderView();
    };
    const first = ins().find(i => Number(i.value) > 0) || ins()[0];
    if (first) { first.focus(); first.select(); }
  }

  function bindLotActions(el, num) {
    el.querySelectorAll("[data-act=keep]").forEach(b => b.onclick = () => BA.Actions.keepLot(num, b.dataset.sel, b.dataset.lot));
    el.querySelectorAll("[data-act=rm-bread]").forEach(b => b.onclick = () => removeDialog(num, b.dataset.sel, b.dataset.lot));
    el.querySelectorAll("[data-act=split]").forEach(b => b.onclick = () => splitDialog(num, b.dataset.sel, b.dataset.lot));
    el.querySelectorAll("input.lot-date").forEach(inp => dateInput(inp, v => {
      const ms = F.fromInput(v);
      if (ms) BA.Actions.setLotDate(num, inp.dataset.sel, inp.dataset.lot, ms);
    }));
  }

  // ---------- Historique des interventions ----------
  function interventionsTable(s, num) {
    const list = s.interventions.filter(x => x.num === num).slice(0, 10);
    if (!list.length) return `<p class="note">${t("no_interventions")}</p>`;
    return `<div class="table-scroll"><table>
      <thead><tr><th>${t("col_when")}</th><th>${t("col_inv_gap")}</th><th>${t("col_removed")}</th><th>${t("col_loaded")}</th><th>${t("col_delivery")}</th><th>${t("col_status")}</th></tr></thead>
      <tbody>${list.map(it => {
        const gap = it.inv.reduce((a, r) => a + (r.real - r.exp), 0);
        const rem = it.rem.reduce((a, r) => a + r.removed, 0);
        const load = it.load.reduce((a, r) => a + r.qty, 0);
        return `<tr><td>${F.dt(it.start)}</td><td>${it.inv.length ? (gap > 0 ? "+" : "") + gap : "—"}</td><td>${rem}</td><td>${load}</td>
          <td>${it.delivery ? F.dt(it.delivery) : "—"}</td><td>${t("it_" + it.status)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  // ---------- Détails machine ----------
  function renderDetails(el, ctx) {
    const s = BA.Store.get();
    // v5 : flotte vide, ou machine supprimée sur un autre appareil
    const m = M.machine(s, BA.Shell.state.machine) || s.machines[0];
    if (!m) { el.innerHTML = `<h2>📊 ${t("nav_details")}</h2><div class="alert info">${t(ctx.admin ? "no_machine_admin" : "no_machine_op")}</div>`; return; }
    BA.Shell.state.machine = m.num;
    const x = M.stats(s, m);
    const today = (s.daily[M.dayKey(s.now)] || {})[m.num] || { s: 0, r: 0, l: 0, x: 0 };
    const lastIt = s.interventions.find(i => i.num === m.num && i.status === "done");
    const evs = s.events.filter(e => e.num === m.num && !e.archived && (ctx.admin || M.OPERATOR_CATS.includes(e.cat))).slice(0, 6);
    const mission = M.openMission(s, m.num);
    const tempBad = tempBadOf(s, m);

    el.innerHTML = `
      <h2>📊 ${t("nav_details")}</h2>
      ${machinePicker(s, m.num, "det-machine")}
      ${m.door ? `<div class="alert door">🚪 <b>${t("door_banner")}</b> — ${t("door_explain")}</div>` : ""}
      ${mission ? `<div class="alert info">🧾 ${t("mission_banner", { n: mission.load })}${mission.removeBefore ? " " + t("mission_remove_before", { d: F.dt(mission.removeBefore) }) : ""}${mission.mandatory ? " " + t("mission_must", { n: mission.mandatory }) : ""}</div>` : ""}
      <div class="cards">
        <div class="card"><div class="label">${t("lbl_status")}</div><div class="value v-small">${pill(x.st)}</div><div class="petit">${E(m.street)}, ${E(m.city)} · S/N ${E(m.serial)}</div></div>
        <div class="card"><div class="label">${t("lbl_fill")}</div><div class="value">${x.total}/${x.cap}</div><div class="gauge st-${x.st}"><span style="width:${x.pct}%"></span></div></div>
        <div class="card"><div class="label">${t("lbl_temp")}</div><div class="value ${tempBad ? "c-error-t" : ""}">${tempTxt(m)}</div><div class="petit">${t("temp_range", { a: s.settings.tempMin, b: s.settings.tempMax })}</div></div>
        <div class="card"><div class="label">${t("lbl_last_sale")}</div><div class="value v-small">${m.lastSale ? F.date(m.lastSale) + " " + F.clock(m.lastSale) : "—"}</div><div class="petit">${m.door || m.power ? t("sales_blocked") : seenTxt(s, m)}</div></div>
        ${ctx.admin ? `<div class="card"><div class="label">${t("lbl_sales_today")}</div><div class="value">${today.s}</div><div class="petit">${F.eur(today.r)}</div></div>` : ""}
        <div class="card"><div class="label">${t("lbl_last_intervention")}</div><div class="value v-small">${lastIt ? F.dt(lastIt.end) : "—"}</div></div>
      </div>
      <h3>🍞 ${t("lots_title")}</h3>
      <p class="note">${t("lots_note", { h: s.settings.thrHours })}</p>
      ${lotsTable(s, m, ctx)}
      <h3>🧾 ${t("det_last_moves")}</h3>
      ${BA.History.recent(s, m.num, ctx.admin, 8)}
      <h3>⚠️ ${t("machine_alerts")}</h3>
      ${evs.length ? evs.map(e => eventHtml(s, e, false)).join("") : `<p class="note">${t("no_alerts")}</p>`}
      <h3>🧺 ${t("interventions_title")}</h3>
      ${interventionsTable(s, m.num)}`;

    el.querySelector("#det-machine").onchange = e => { BA.Shell.state.machine = Number(e.target.value); renderDetails(el, ctx); };
    bindLotActions(el, m.num);
    BA.History.bindRecent(el, m.num);
  }

  // ---------- Produits / Stock : sélections modifiables (admin et opérateur) ----------
  // Les modifications s'enregistrent dès qu'on quitte la case.
  // On peut ajouter une sélection, choisir un type ou en écrire un nouveau,
  // et supprimer une sélection (même avec du stock : confirmation demandée).
  function typeOptions(s, current, withNew) {
    return M.types(s).map(ty => `<option value="${E(ty)}" ${ty === current ? "selected" : ""}>${prod(ty)}</option>`).join("")
      + (withNew ? `<option value="__new">➕ ${t("new_type")}</option>` : "");
  }

  function stockTable(s, m, admin) {
    const mission = M.openMission(s, m.num);
    const st = BA.Shell.state;
    const ed = st.selEdit && st.selEdit.num === m.num ? st.selEdit : null;
    const f = st.selForm && st.selForm.num === m.num ? st.selForm : (st.selForm = { num: m.num, n: "", type: m.sels[0] ? m.sels[0].type : "blanc", newType: "", cap: 6, price: "" });
    if (f.type !== "__new" && !M.types(s).includes(f.type)) f.type = M.types(s)[0];   // type qui n'est plus proposé
    const msg = st.selMsg && st.selMsg.num === m.num ? st.selMsg : null;
    const rows = m.sels.map(sel => {
      const q = M.qty(sel);
      const o = M.oldestLot(sel);
      const sum = f => sel.lots.filter(f).reduce((a, l) => a + l.qty, 0);
      const inv = sum(l => l.kept && M.isMandatory(s, l));            // gardés une fois, devenus invalides : à retirer obligatoirement
      const kept = sum(l => l.kept && !M.isMandatory(s, l));          // gardés une fois : valables jusqu'au jour suivant
      const rem = sum(l => !l.kept && M.mustRemove(s, l, mission));   // trop vieux (ou demandés par l'admin)
      const tags = (rem ? `<span class="tag c-remove">${t("n_to_remove", { n: rem })}</span>` : "")
        + (inv ? `<span class="tag c-must" title="${E(t("kept_invalid_tip"))}">${t("n_invalid", { n: inv })}</span>` : "")
        + (kept ? `<span class="tag c-kept" title="${E(t("kept_next"))}">${t("chip_kept", { n: kept })}</span>` : "");
      const status = q === 0 ? `<span class="tag c-empty">${t("sel_empty")}</span>` : tags || `<span class="tag c-ok">${t("lot_ok")}</span>`;
      const typeCell = ed && ed.sel === sel.n
        ? `<span class="new-type"><input id="ps-newtype-${m.num}-${sel.n}" class="ps-newtype" data-sel="${sel.n}" type="text" maxlength="40" placeholder="${E(t("new_type_ph"))}" value="${E(ed.value || "")}">
            <button class="btn petit" data-act="type-ok" data-sel="${sel.n}">✔</button><button class="btn petit secondary" data-act="type-cancel">✖</button></span>`
        : `<select id="ps-type-${m.num}-${sel.n}" data-sel="${sel.n}" class="ps-type">${typeOptions(s, sel.type, true)}</select>`;
      return `<tr class="${q === 0 ? "empty" : ""}">
        <td><input id="ps-n-${m.num}-${sel.n}" class="ps-n num-in sel-in" type="number" min="1" max="999" value="${sel.n}" data-sel="${sel.n}" aria-label="${E(t("col_sel"))}"></td>
        <td>${typeCell}</td>
        <td><input id="ps-cap-${m.num}-${sel.n}" class="ps-cap num-in" type="number" min="1" max="50" value="${sel.cap}" data-sel="${sel.n}"></td>
        <td class="nowrap"><b>${q}</b>${q > 0 ? ` <button class="btn petit secondary rm-mini" data-act="rm-bread" data-sel="${sel.n}" title="${E(t("btn_rm_tip"))}" aria-label="${E(t("btn_rm_tip"))} ${sel.n}">➖</button>` : ""}${o ? `<div class="petit only-phone">${F.dt(o.date)}</div>` : ""}</td>
        <td class="no-phone">${o ? `${F.dt(o.date)} <span class="petit">(${t("n_breads", { n: o.qty })} · ${F.age(s.now - o.date)})</span>` : "—"}</td>
        ${admin ? `<td><input id="ps-price-${m.num}-${sel.n}" class="ps-price num-in" type="number" min="0" step="0.1" value="${sel.price.toFixed(2)}" data-sel="${sel.n}"></td>` : ""}
        <td>${status}</td>
        <td>${m.sels.length > 1 ? `<button class="btn petit secondary sel-del" data-act="sel-del" data-sel="${sel.n}" title="${E(t("btn_del_sel"))}" aria-label="${E(t("btn_del_sel"))} ${sel.n}">🗑</button>` : ""}</td></tr>`;
    }).join("");
    return `
      ${msg ? `<div class="alert ${msg.kind === "ok" ? "info" : "err"}">${msg.kind === "ok" ? "✅" : "⚠️"} ${E(msg.text)}</div>` : ""}
      <div class="table-scroll"><table class="sel-table">
      <thead><tr><th>${t("col_sel")}</th><th>${t("col_type")}</th><th>${t("col_cap")}</th><th>${t("col_qty")}</th><th class="no-phone">${t("col_oldest")}</th>${admin ? `<th>${t("col_price")}</th>` : ""}<th>${t("col_status")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="card add-sel">
        <h3>➕ ${t("add_sel_title")}</h3>
        <div class="add-sel-row">
          <label>${t("col_sel")} <input id="as-n-${m.num}" class="num-in" type="number" min="1" max="999" value="${E(f.n)}" data-f="n"></label>
          <label>${t("col_type")} <select id="as-type-${m.num}" class="auto-w" data-f="type">${typeOptions(s, f.type, true).replace(`value="__new"`, `value="__new" ${f.type === "__new" ? "selected" : ""}`)}</select></label>
          ${f.type === "__new" ? `<label>${t("new_type_name")} <input id="as-newtype-${m.num}" type="text" maxlength="40" class="txt-in" placeholder="${E(t("new_type_ph"))}" value="${E(f.newType)}" data-f="newType"></label>` : ""}
          <label>${t("col_cap")} <input id="as-cap-${m.num}" class="num-in" type="number" min="1" max="50" value="${E(f.cap)}" data-f="cap"></label>
          ${admin ? `<label>${t("col_price")} <input id="as-price-${m.num}" class="num-in" type="number" min="0" step="0.1" placeholder="${s.settings.salePrice.toFixed(2)}" value="${E(f.price)}" data-f="price"></label>` : ""}
          <button class="btn" data-act="sel-add">➕ ${t("btn_add_sel")}</button>
        </div>
        <p class="petit">${t("add_sel_help")}</p>
      </div>`;
  }

  function bindStockTable(el, num, admin, rerender) {
    const st = BA.Shell.state;
    const say = (err, okKey, vars) => {
      st.selMsg = err ? { num, kind: "err", text: t(err) } : okKey ? { num, kind: "ok", text: t(okKey, vars) } : null;
      clearTimeout(st.selMsgTimer);
      st.selMsgTimer = setTimeout(() => { st.selMsg = null; }, 6000);
      afterClick(rerender);
    };
    el.querySelectorAll(".ps-n").forEach(i => i.onchange = () => {
      const v = Number(i.value);
      if (v === Number(i.dataset.sel)) return;
      say(BA.Actions.updateSelection(num, i.dataset.sel, { n: v }), "saved_sel");
    });
    el.querySelectorAll(".ps-type").forEach(i => i.onchange = () => {
      if (i.value === "__new") { st.selEdit = { num, sel: Number(i.dataset.sel), value: "" }; rerender(); const n = el.querySelector(".ps-newtype"); if (n) n.focus(); return; }
      say(BA.Actions.updateSelection(num, i.dataset.sel, { type: i.value }), "saved_sel");
    });
    el.querySelectorAll(".ps-newtype").forEach(i => {
      i.oninput = () => { if (st.selEdit) st.selEdit.value = i.value; };
      i.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); el.querySelector('[data-act="type-ok"]').click(); } };
    });
    el.querySelectorAll('[data-act="type-ok"]').forEach(b => b.onclick = () => {
      const v = (st.selEdit && st.selEdit.value || "").trim();
      if (!v) { say("err_type"); return; }
      st.selEdit = null;
      say(BA.Actions.updateSelection(num, b.dataset.sel, { newType: v }), "saved_sel");
    });
    el.querySelectorAll('[data-act="type-cancel"]').forEach(b => b.onclick = () => { st.selEdit = null; rerender(); });
    el.querySelectorAll(".ps-cap").forEach(i => i.onchange = () => say(BA.Actions.updateSelection(num, i.dataset.sel, { cap: Number(i.value) }), "saved_sel"));
    if (admin) el.querySelectorAll(".ps-price").forEach(i => i.onchange = () => { const v = Number(i.value); if (v >= 0) say(BA.Actions.updateSelection(num, i.dataset.sel, { price: v }), "saved_sel"); });
    el.querySelectorAll('.sel-table [data-act="rm-bread"]').forEach(b => b.onclick = () => removeDialog(num, b.dataset.sel));
    // Suppression : une fenêtre demande toujours de confirmer (avec un avertissement s'il reste du pain dedans)
    el.querySelectorAll('[data-act="sel-del"]').forEach(b => b.onclick = () => {
      const m = M.machine(BA.Store.get(), num), cur = b.closest("tr") && b.closest("tr").querySelector(".ps-n");
      // (numéro de sélection changé juste avant le clic : on prend le nouveau numéro de la ligne)
      const sel = m && (M.sel(m, b.dataset.sel) || (cur ? M.sel(m, cur.value) : null));
      if (!sel) { say("err_sel_missing"); return; }
      const n = sel.n, q = M.qty(sel), type = prod(sel.type);
      confirmDialog({
        title: "🗑 " + t("del_sel_title", { n }),
        html: q > 0
          ? `<div class="alert warn">⚠️ <b>${t("del_sel_warn", { n, q, type })}</b></div><p class="note">${t("del_sel_warn_note", { q })}</p>`
          : `<p>${t("del_sel_empty", { n, type })}</p><p class="note">${t("del_undo")}</p>`,
        ok: "🗑 " + t("del_sel_ok"), danger: true,
        onOk: () => {
          const m2 = M.machine(BA.Store.get(), num), s2 = m2 && M.sel(m2, n), left = s2 ? M.qty(s2) : 0;
          const err = BA.Actions.removeSelection(num, n);
          say(err, left > 0 ? "deleted_sel_q" : "deleted_sel", { n, q: left });
        }
      });
    });
    // formulaire d'ajout : valeurs gardées pendant la saisie
    const f = st.selForm;
    el.querySelectorAll(".add-sel [data-f]").forEach(i => {
      i.oninput = () => { f[i.dataset.f] = i.value; };
      if (i.dataset.f === "type") i.onchange = () => { f.type = i.value; rerender(); if (f.type === "__new") { const n = el.querySelector(`#as-newtype-${num}`); if (n) n.focus(); } };
    });
    const add = el.querySelector('[data-act="sel-add"]');
    if (add) add.onclick = () => {
      el.querySelectorAll(".add-sel [data-f]").forEach(i => { f[i.dataset.f] = i.value; });
      const err = BA.Actions.addSelection(num, { n: f.n, type: f.type, newType: f.newType, cap: f.cap, price: admin ? f.price : null });
      if (!err) {
        const added = M.sel(M.machine(BA.Store.get(), num), Number(f.n));
        if (f.type === "__new" && added) f.type = added.type;     // le nouveau type reste choisi pour la suivante
        f.n = ""; f.newType = ""; f.price = "";
      }
      say(err, "added_sel");
    };
  }

  // ---------- Alertes ----------
  function eventHtml(s, e, withActions) {
    const cls = e.resolved ? "info fini" : e.level === "err" ? "err" : e.level === "warn" ? "warn" : "info";
    const d = Object.assign({ sel: "", type: "" }, e.data);
    // v5 : champs des alertes des vraies machines (texte venant de la machine : protégé)
    const raw = {};
    ["title", "expl", "code", "sous", "sol", "when", "off", "on", "total", "a", "b", "msg"].forEach(k => { if (d[k] != null) raw[k] = E(d[k]); });
    if (raw.expl) raw.expl = raw.expl.charAt(0).toUpperCase() + raw.expl.slice(1);
    Object.assign(raw, {
      when2: d.when ? t("ev_when", { d: E(d.when) }) : "", sous2: d.sous ? "/" + E(d.sous) : "",
      sol2: d.sol ? t("ev_sol", { s: E(d.sol) }) : "", st2: d.active === true ? t("ev_still") : d.active === false ? t("ev_over") : "",
      cnt2: Number(d.count) > 1 ? " — ×" + Number(d.count) : ""
    });
    const vars = {
      ...raw,
      sel: d.sel, type: d.type ? prod(d.type) : "", temp: d.temp != null ? F.num(d.temp, 1) : "",
      from: d.from != null ? F.eur(d.from) : "", to: d.to != null ? F.eur(d.to) : "",
      lot: d.lotDate ? F.dt(d.lotDate) : "", qty: d.qty || "", lost: d.lost || 0, gained: d.gained || 0, h: s.settings.thrHours,
      kept: d.keptAt ? F.dt(d.keptAt) : ""
    };
    const state = e.resolved ? `<span class="tag c-ok">${t("ev_resolved")} ${e.resolvedAt ? F.dt(e.resolvedAt) : ""}</span>` : `<span class="tag c-active">${t("ev_active")}</span>`;
    const actions = withActions
      ? (e.archived ? `<button class="btn petit secondary" data-unarchive="${e.id}">${t("btn_unarchive")}</button>` : `<button class="btn petit secondary" data-archive="${e.id}">📦 ${t("btn_archive")}</button>`)
      : "";
    return `<div class="alert ${cls}">
      <div class="ev-head"><b>${t("ev_" + e.code, vars)}</b><span class="petit">#${e.num} · ${F.dt(e.t)}</span></div>
      <div class="sous">${t("evd_" + e.code, vars)}</div>
      <div class="ev-foot">${state}<span class="tag">${t("cat_" + e.cat)}</span>${e.archived ? `<span class="tag">${t("ev_archived")}</span>` : ""}${actions}</div>
    </div>`;
  }

  function renderAlerts(el, ctx) {
    const s = BA.Store.get();
    const st = BA.Shell.state;
    st.alertFilter = st.alertFilter || "active";
    st.alertCat = st.alertCat || "all";
    const cats = ctx.admin ? [...M.OPERATOR_CATS, "business"] : M.OPERATOR_CATS;
    let list = s.events.filter(e => cats.includes(e.cat));
    if (!ctx.admin) list = list.filter(e => !e.archived);
    const counts = {
      active: list.filter(e => !e.resolved && !e.archived).length,
      resolved: list.filter(e => e.resolved && !e.archived).length,
      archived: list.filter(e => e.archived).length,
      all: list.length
    };
    const f = st.alertFilter;
    list = list.filter(e => f === "all" ? true : f === "active" ? !e.resolved && !e.archived : f === "resolved" ? e.resolved && !e.archived : e.archived);
    if (st.alertCat !== "all") list = list.filter(e => e.cat === st.alertCat);
    const filters = ctx.admin ? ["active", "resolved", "archived", "all"] : ["active", "resolved", "all"];
    // archivage en lot : exactement les alertes affichées dans cet onglet (sans celles déjà archivées)
    const bulk = ctx.admin && f !== "archived" ? list.filter(e => !e.archived) : [];
    el.innerHTML = `
      <h2>⚠️ ${t("nav_alerts")}</h2>
      ${ctx.admin ? "" : `<p class="note">${t("alerts_op_note")}</p>`}
      <div class="toolbar">
        <div class="seg">${filters.map(k => `<button data-filter="${k}" class="${f === k ? "active" : ""}">${t("af_" + k)} (${counts[k]})</button>`).join("")}</div>
        <select id="alert-cat" class="auto-w"><option value="all">${t("cat_all")}</option>${cats.map(c => `<option value="${c}" ${st.alertCat === c ? "selected" : ""}>${t("cat_" + c)}</option>`).join("")}</select>
        ${bulk.length ? `<button class="btn secondary" id="archive-shown">📦 ${t("btn_archive_shown", { n: bulk.length })}</button>` : ""}
      </div>
      ${ctx.admin ? `<p class="note">${t("archive_note")}</p>` : ""}
      ${list.length ? list.slice(0, 120).map(e => eventHtml(s, e, ctx.admin)).join("") : `<div class="alert info">${t("no_alerts")}</div>`}`;
    el.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { st.alertFilter = b.dataset.filter; renderAlerts(el, ctx); });
    el.querySelector("#alert-cat").onchange = e => { st.alertCat = e.target.value; renderAlerts(el, ctx); };
    if (ctx.admin) {
      // après chaque action, l'écran est redessiné tout de suite (sans attendre la mise à jour suivante)
      const done = msg => { renderAlerts(el, ctx); toast(msg); };
      const ab = el.querySelector("#archive-shown");
      if (ab) ab.onclick = () => {
        const ids = bulk.map(e => e.id), act = bulk.filter(e => !e.resolved).length;
        const go = () => { const n = BA.Actions.archiveEvents(ids); done(t("archive_done_n", { n })); };
        if (!act) { go(); return; }
        const why = act === ids.length ? t("archive_confirm_all", { n: act }) : t("archive_confirm", { a: act });
        confirmDialog({ title: t("archive_confirm_t", { n: ids.length }), html: `<p>${why}</p>`, ok: "📦 " + t("btn_archive"), onOk: go });
      };
      el.querySelectorAll("[data-archive]").forEach(b => b.onclick = () => { BA.Actions.archiveEvent(b.dataset.archive, true); done(t("archive_done")); });
      el.querySelectorAll("[data-unarchive]").forEach(b => b.onclick = () => { BA.Actions.archiveEvent(b.dataset.unarchive, false); done(t("unarchive_done")); });
    }
  }

  // ---------- Connexion RS232 (version test : lecture seule) ----------
  function renderRs232(el, ctx) {
    const s = BA.Store.get();
    el.innerHTML = `
      <h2>🔌 ${t("nav_rs232")}</h2>
      <div class="alert info">${ctx.admin ? t("rs_admin_note") : t("rs_op_note")}</div>
      <div class="table-scroll"><table>
        <thead><tr><th>${t("machine")}</th><th>${t("col_address")}</th><th>${t("col_link")}</th><th>${t("col_last_data")}</th></tr></thead>
        <tbody>${s.machines.map(m => `<tr><td class="selno">#${m.num}</td><td>${E(m.street)}, ${E(m.city)}</td>
          <td>${m.online ? `<span class="tag c-ok">🟢 ${t("online")}</span>` : `<span class="tag">${t("offline")}</span>`}</td>
          <td>${F.clock(m.lastSeen || s.now)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  BA.UI = {
    F, E, t, prod, pill, ICON,
    renderDashboard, renderDetails, renderAlerts, renderRs232,
    machinePicker, lotsTable, bindLotActions, stockTable, bindStockTable, eventHtml, interventionsTable, prodText,
    confirmDialog, dateInput, afterClick, removeDialog, toast
  };

  // ================= COQUILLE DE L'APPLI =================
  // Les vues « en direct » sont redessinées à chaque changement (1 fois par seconde avec le simulateur).
  // Pour ne jamais gêner l'utilisateur :
  // - on attend s'il est en train d'écrire dans une case ou si une liste déroulante / un calendrier est ouvert ;
  // - on attend la fin d'un clic (sinon le bouton serait remplacé entre l'appui et le relâchement) ;
  // - après le dessin, la case active garde le curseur et les tableaux gardent leur défilement horizontal.
  const PICKER = "select, input[type=date], input[type=datetime-local], input[type=time]";
  const Shell = {
    state: { view: null, machine: null },
    ctx: null,
    ui: { pickEl: null, pickAt: 0, typedAt: 0, focusAt: 0, down: false, downAt: 0, upAt: 0, restoring: false },

    init(ctx) {
      this.ctx = ctx;
      BA.I18n.load(ctx.role);
      this.state.machine = (BA.Store.get().machines[0] || {}).num || null;
      const hash = (location.hash || "").replace("#", "");
      this.state.view = ctx.views.some(v => v.id === hash) ? hash : ctx.views[0].id;
      this.build();
      BA.Store.subscribe(() => this.refresh());
      // suivi des clics, de la saisie et des listes ouvertes (voir editing())
      const u = this.ui;
      document.addEventListener("pointerdown", e => {
        u.down = true; u.downAt = Date.now();
        const p = e.target && e.target.closest && e.target.closest(PICKER);
        if (p) { u.pickEl = p; u.pickAt = Date.now(); }
      }, true);
      const up = () => { u.down = false; u.upAt = Date.now(); };
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", up, true);
      document.addEventListener("keydown", e => {
        const el = e.target;
        if (!el || !el.matches) return;
        if (el.matches(PICKER)) { u.pickEl = el; u.pickAt = Date.now(); }
        if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) u.typedAt = Date.now();
      }, true);
      document.addEventListener("change", e => { if (e.target === u.pickEl) u.pickEl = null; }, true);
      document.addEventListener("focusin", () => { if (!u.restoring) u.focusAt = Date.now(); }, true);
      document.addEventListener("focusout", e => { if (e.target === u.pickEl) u.pickEl = null; }, true);
      // clic sur une carte machine → détails
      document.addEventListener("click", e => {
        const card = e.target.closest("[data-machine]");
        if (card && $("#app-main").contains(card)) { this.state.machine = Number(card.dataset.machine); this.go("details"); }
      });
      document.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.machine) {
          e.preventDefault(); this.state.machine = Number(e.target.dataset.machine); this.go("details");
        }
      });
      BA.Live.start();      // v5 : heure réelle et entretien des alertes (plus de simulateur)
    },

    build() {
      const c = this.ctx;
      document.documentElement.lang = BA.I18n.lang;
      document.title = "Broodautomate — " + t(c.role === "admin" ? "role_admin" : "role_op");
      $("#app-header").innerHTML = `
        <h1>🥖 Broodautomate <span class="role-tag">${t(c.role === "admin" ? "role_admin" : "role_op")}</span></h1>
        <div id="status-bar">
          <span id="sync-status" class="badge"></span>
          ${c.role === "admin" ? `<span id="serial-status" class="badge off">RS232 : ${t("rs_disconnected")}</span>` : ""}
          <span id="online-status" class="badge on"></span>
          <select id="lang-select" class="auto-w" aria-label="Langue / Taal / Language">
            ${["fr", "nl", "en"].map(l => `<option value="${l}" ${BA.I18n.lang === l ? "selected" : ""}>${l.toUpperCase()}</option>`).join("")}
          </select>
          <a class="badge link" href="${c.role === "admin" ? "operateur.html" : "index.html"}">${c.role === "admin" ? "📱 " + t("open_operator") : "🖥 " + t("open_admin")}</a>
          ${BA.DB && BA.DB.isReady() ? `<button id="btn-logout" class="badge link" title="${E(BA.DB.email || "")}">🚪 ${t("logout")}</button>` : ""}
        </div>`;
      $("#app-nav").innerHTML = c.views.map(v =>
        `<button data-view="${v.id}" class="${v.id === this.state.view ? "active" : ""}">${v.icon} ${t(v.label)}</button>`).join("");
      $("#app-nav").querySelectorAll("button").forEach(b => b.onclick = () => this.go(b.dataset.view));
      $("#app-main").innerHTML = c.views.map(v => `<section id="view-${v.id}" class="view ${v.id === this.state.view ? "active" : ""}"></section>`).join("");
      $("#app-footer").innerHTML = c.footer();
      if (c.bindFooter) c.bindFooter();
      $("#lang-select").onchange = e => { BA.I18n.set(e.target.value, c.role); this.build(); };
      if (c.role === "admin" && BA.Rs232 && BA.Rs232.badge) BA.Rs232.badge();
      const lo = $("#btn-logout"); if (lo) lo.onclick = async () => { try { await BA.DB.signOut(); } catch (e) { /* on recharge quand même */ } location.reload(); };
      this.renderView();
      this.refreshChrome();
    },

    go(view) {
      this.state.view = view;
      try { history.replaceState(null, "", "#" + view); } catch (e) { /* rien */ }
      $("#app-nav").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
      $("#app-main").querySelectorAll(".view").forEach(sec => sec.classList.toggle("active", sec.id === "view-" + view));
      this.renderView(true);
      window.scrollTo(0, 0);
    },

    renderView(fresh) {
      const v = this.ctx.views.find(x => x.id === this.state.view);
      const el = document.getElementById("view-" + v.id);
      if (fresh) { el.innerHTML = ""; v.render(el, this.ctx); return; }
      // garder la case active (curseur) et le défilement horizontal des tableaux
      const ae = document.activeElement, keep = { scroll: Array.from(el.querySelectorAll(".table-scroll")).map(x => x.scrollLeft) };
      if (ae && ae.id && el.contains(ae)) { keep.id = ae.id; try { keep.a = ae.selectionStart; keep.b = ae.selectionEnd; } catch (e) { /* pas de curseur */ } }
      v.render(el, this.ctx);
      el.querySelectorAll(".table-scroll").forEach((x, i) => { if (keep.scroll[i]) x.scrollLeft = keep.scroll[i]; });
      if (keep.id) {
        const n = document.getElementById(keep.id);
        if (n && n !== document.activeElement && el.contains(n)) {
          this.ui.restoring = true;
          try { n.focus({ preventScroll: true }); } finally { this.ui.restoring = false; }
          if (keep.a != null) try { n.setSelectionRange(keep.a, keep.b); } catch (e) { /* case sans curseur */ }
        }
      }
    },

    // Vrai pendant un clic (et juste après : sur téléphone, le « clic » arrive un peu après le doigt levé)
    clicking() {
      const u = this.ui, now = Date.now();
      return (u.down && now - u.downAt < 10000) || now - u.upAt < 350;
    },
    // Un changement arrivé pendant un clic (souvent l'action de ce clic) : on redessine juste après le clic,
    // sans attendre la mise à jour suivante du simulateur (sinon l'écran restait en retard d'une seconde ou plus)
    soon() {
      if (this.soonT) return;
      this.soonT = setTimeout(() => { this.soonT = null; this.refresh(); }, 400);
    },

    // Vrai si redessiner maintenant gênerait l'utilisateur
    editing() {
      const ae = document.activeElement, u = this.ui, now = Date.now();
      if (this.clicking()) return true;   // clic en cours
      if (!ae || ae === document.body || !$("#app-main").contains(ae) || ae.dataset.live) return false;
      if (u.pickEl === ae && now - u.pickAt < 15000) return true;           // liste / calendrier peut-être ouvert
      if (ae.tagName === "SELECT") return false;
      if (!/^(INPUT|TEXTAREA)$/.test(ae.tagName) || /^(checkbox|radio|button|submit)$/.test(ae.type)) return false;
      return ae.value !== ae.defaultValue || now - u.typedAt < 1500 || now - u.focusAt < 1500;   // saisie en cours
    },

    refreshChrome() {
      const s = BA.Store.get();
      // v5 : état de la synchronisation des données (Supabase) au lieu du simulateur
      const sy = $("#sync-status"), q = BA.Store.status();
      if (sy) {
        const k = q.mode === "local" ? "sync_local" : q.sync === "ok" ? "sync_ok" : q.sync === "sending" ? "sync_sending" : "sync_offline";
        sy.className = "badge " + (k === "sync_ok" || k === "sync_local" ? "on" : k === "sync_sending" ? "warn" : "err");
        sy.textContent = t(k);
        sy.title = (q.error || "") + (q.lost ? " " + t("sync_lost") : "");
      }
      $("#online-status").textContent = t("online") + " : " + s.machines.filter(m => m.online).length + "/" + s.machines.length;
      if (this.ctx.refreshFooter) this.ctx.refreshFooter(s);
    },

    refresh() {
      this.refreshChrome();
      const v = this.ctx.views.find(x => x.id === this.state.view);
      const live = typeof v.live === "function" ? v.live() : v.live;
      if (!live || this.editing() || document.querySelector(".modal-back")) {
        if (live && this.clicking() && !document.querySelector(".modal-back")) this.soon();
        // vue qui ne se redessine pas en direct : petite mise à jour possible (ex. « 3 nouveaux » dans l'Historique)
        if (v.tick) { try { v.tick(document.getElementById("view-" + v.id), this.ctx); } catch (e) { console.error(e); } }
        if (this.ctx.onTick) this.ctx.onTick();
        return;
      }
      this.renderView();
      if (this.ctx.onTick) this.ctx.onTick();
    }
  };
  BA.Shell = Shell;
})();
