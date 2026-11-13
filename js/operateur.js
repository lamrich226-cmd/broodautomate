// ============================================================
// BROODAUTOMATE v5 — Appli OPÉRATEUR (operateur.html)
// (reprise de la version test 4.8.1 ; changements v5 marqués « v5 »)
// Reçoit les ordres et les infos du logiciel admin.
// Pas de ventes ni de chiffre d'affaires.
// Processus « Remplir » en 3 étapes :
//   1. Inventaire  2. Retrait des anciens pains  3. Chargement
// ============================================================

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E;
  const t = (k, v) => BA.I18n.t(k, v);
  const st = () => BA.Shell.state;

  // Carte d'une machine : un seul gros bouton « Remplir » (+ « Détails »)
  function machineCard(s, m, extra, goLabel) {
    const x = M.stats(s, m);
    return `<div class="card mission-card st-${x.st}" data-q="${E((m.num + " " + m.street + " " + m.city).toLowerCase())}">
      <div class="cm-top"><span class="cm-num">#${m.num}</span>${U.pill(x.st)}</div>
      <div class="cm-addr"><div>${E(m.street)}</div><div class="petit">${E(m.city)}</div></div>
      <div class="gauge"><span style="width:${x.pct}%"></span></div>
      <div class="cm-row"><span>${t("op_fill_pct", { q: x.total, c: x.cap })}</span><span>${x.pct} %</span></div>
      ${extra}
      <div class="cm-actions"><button class="btn big" data-fill="${m.num}">🧺 ${goLabel || t("btn_start_fill")}</button>
        <button class="btn secondary" data-det="${m.num}">${t("op_fill_details")}</button></div>
    </div>`;
  }
  function bindCards(el) {
    el.querySelectorAll("[data-fill]").forEach(b => b.onclick = e => { e.stopPropagation(); Wizard.open(Number(b.dataset.fill)); });
    el.querySelectorAll("[data-det]").forEach(b => b.onclick = e => { e.stopPropagation(); st().machine = Number(b.dataset.det); BA.Shell.go("details"); });
  }

  // ================= Missions (ordres de l'admin) =================
  // o.todo = page « À faire » (v5.10) : titre, résumé en pastilles, machines urgentes, pas de message « aucune mission »
  function renderMissions(el, o) {
    o = o && o.todo ? o : {};
    const s = BA.Store.get();
    if (o.todo && !s.machines.length) { el.innerHTML = `<h2>📋 ${t("op_todo_title")}</h2><div class="alert info">${t("no_machine_op")}</div>`; return; }
    const open = s.missions.filter(x => x.status === "open");
    const card = (m, extra) => machineCard(s, m, extra);
    // v5.22 : page « À faire » = titre + pastilles + barre de recherche (comme le Dashboard admin) + liste.
    // Le haut de page reste en place (la saisie n'est pas coupée quand la liste se redessine chaque seconde).
    let host = el, q = "";
    if (o.todo) {
      if (!el.querySelector("#todo-body")) {
        el.innerHTML = `<h2>📋 ${t("op_todo_title")}</h2><div id="todo-sum"></div>
          <div class="toolbar"><input id="todo-search" class="search" type="search" data-live="1" autocomplete="off" placeholder="${E(t("search_ph"))}" value="${E(st().todoQ || "")}"></div>
          <div id="todo-body"></div>`;
        el.querySelector("#todo-search").addEventListener("input", e => { st().todoQ = e.target.value; renderMissions(el, o); });
      }
      el.querySelector("#todo-sum").innerHTML = resume(s);
      q = (el.querySelector("#todo-search").value || "").trim().toLowerCase();
      host = el.querySelector("#todo-body");
    }
    let html = o.todo ? "" : `<h2>🧾 ${t("nav_missions")}</h2>`;
    // Déplacements de pain demandés par l'admin (d'une sélection à l'autre, même produit)
    const mvs = q ? [] : s.machines.filter(m => U.openMoves(s, m).length);
    if (mvs.length) html += `<h3>⇄ ${t("mv_todo_title")}</h3>` + mvs.map(m => `<div class="mv-machine"><b>#${m.num}</b> <span class="petit">${E(m.street)}</span>${U.moveRequests(s, m)}</div>`).join("");
    if (q) {
      // Recherche : toutes les machines qui correspondent (n°, rue ou ville), porte ouverte en premier
      const found = s.machines.filter(m => (m.num + " " + m.street + " " + m.city).toLowerCase().includes(q))
        .map(m => ({ m, x: M.stats(s, m) }))
        .sort((a, b) => (a.x.st === "offline") - (b.x.st === "offline") || M.RANK[a.x.st] - M.RANK[b.x.st] || a.x.pct - b.x.pct || a.m.num - b.m.num);
      html += found.length ? `<div class="cards machines-grid">${found.map(z => card(z.m, z.x.st === "offline" ? `<div class="chips">${U.pill(M.stats(s, z.m, { stock: true }).st)}</div>` : "")).join("")}</div>` : `<div class="alert info">${t("no_match")}</div>`;
    } else if (open.length) {
      html += `<p class="note">${t("missions_note", { n: open.length })}</p>
        <div class="cards machines-grid">${open.map(ms => {
          const m = M.machine(s, ms.num);
          const list = M.removalList(s, m, ms), qty = f => list.filter(f).reduce((a, r) => a + r.qty, 0);
          const must = qty(r => r.mandatory), keptN = qty(r => r.kept && !r.mandatory);
          const rem = qty(r => !r.kept) + must;
          return card(m, `<div class="chips">
            <span class="chip">${t("mission_from", { d: F.dt(ms.created) })}</span>
            ${rem ? `<span class="chip c-remove">🟠 ${t("chip_remove", { n: rem })}</span>` : ""}
            ${must ? `<span class="chip c-must" title="${E(t("kept_invalid_tip"))}">${t("chip_must", { n: must })}</span>` : ""}
            ${keptN ? `<span class="chip c-kept" title="${E(t("kept_next"))}">${t("chip_kept", { n: keptN })}</span>` : ""}
            <span class="chip">${t("mission_load", { n: ms.load })}</span>
            ${ms.removeBefore ? `<span class="chip">${t("mission_remove_before", { d: F.dt(ms.removeBefore) })}</span>` : ""}</div>`);
        }).join("")}</div>`;
    } else {
      const urgent = o.todo ? ["door", "power", "empty", "error", "remove", "low"] : ["empty", "remove", "low"];
      // v5.19 : une machine HORS LIGNE (pas de boîtier, ou boîtier muet) reste « à visiter » si le stock noté dans
      // Broodautomate le demande (pains trop vieux à retirer, sélection vide…) : sa carte montre « Hors ligne » + la raison.
      // Avant, elle disparaissait de la liste et la page disait « Rien d'urgent : toutes les machines sont en ordre ».
      const todo = s.machines.map(m => { const x = M.stats(s, m); return { m, x, y: x.st === "offline" ? M.stats(s, m, { stock: true }) : x }; })
        .filter(z => urgent.includes(z.y.st))
        .sort((a, b) => (a.x.st === "offline") - (b.x.st === "offline") || M.RANK[a.y.st] - M.RANK[b.y.st] || a.y.pct - b.y.pct);
      const raison = z => z.x.st === "offline" ? `<div class="chips">${U.pill(z.y.st)}</div>` : "";
      html += o.todo
        ? `<h3>${t("op_todo_need")}</h3>${todo.length ? `<div class="cards machines-grid">${todo.map(z => card(z.m, raison(z))).join("")}</div>` : `<div class="alert ok">✔ ${t("op_todo_ok")}</div>`}`
        : `<div class="alert info">${t("no_missions")}</div>
        <h3>💡 ${t("suggested_title")}</h3>
        ${todo.length ? `<div class="cards machines-grid">${todo.map(z => card(z.m, raison(z))).join("")}</div>` : `<p class="note">${t("nothing_to_do")}</p>`}`;
    }
    host.innerHTML = html;
    bindCards(host);
    U.bindMoves(host);
  }

  // Résumé en pastilles : seulement ce qui demande une action (rien si tout va bien)
  function resume(s) {
    const n = k => s.machines.filter(m => M.stats(s, m).st === k).length;
    const parts = ["door", "power", "empty", "error", "remove", "offline"].map(k => [k, n(k)]).filter(z => z[1] > 0);
    return parts.length ? `<div class="op-resume">${parts.map(([k, v]) => `<span class="op-res">${U.pill(k)}<b>${v}</b></span>`).join("")}</div>` : "";
  }

  // ================= v5.10 : Remplir (choisir la machine) =================
  function renderFill(el) {
    const s = BA.Store.get();
    if (!s.machines.length) { el.innerHTML = `<h2>🧺 ${t("op_fill_title")}</h2><div class="alert info">${t("no_machine_op")}</div>`; return; }
    const list = s.machines.map(m => ({ m, x: M.stats(s, m) })).sort((a, b) => M.RANK[a.x.st] - M.RANK[b.x.st] || a.x.pct - b.x.pct);
    const q = st().fillQ || "";
    el.innerHTML = `<h2>🧺 ${t("op_fill_title")}</h2>
      ${list.length > 4 ? `<input type="search" id="fill-q" class="search" placeholder="${E(t("search_ph"))}" value="${E(q)}">` : ""}
      <p class="note">${t("op_fill_pick")}</p>
      <div class="cards machines-grid">${list.map(z => machineCard(s, z.m, "", t("op_fill_go"))).join("")}</div>`;
    bindCards(el);
    const f = el.querySelector("#fill-q");
    const filtre = () => { const v = (f ? f.value : "").trim().toLowerCase(); st().fillQ = v; el.querySelectorAll(".mission-card").forEach(c => { c.style.display = !v || c.dataset.q.includes(v) ? "" : "none"; }); };
    if (f) { f.oninput = filtre; filtre(); }
  }

  // ================= v5.10 : Plus (pages moins utilisées + réglages) =================
  function renderMore(el) {
    const item = (view, ico, title, sub) => `<button type="button" class="op-more-item" data-go="${view}"><span class="omi-i" aria-hidden="true">${ico}</span>
      <span class="omi-t"><b>${E(title)}</b><small>${E(sub)}</small></span><span class="omi-c" aria-hidden="true">›</span></button>`;
    const light = BA.Theme && BA.Theme.get() === "light";
    el.innerHTML = `<h2>☰ ${t("op_more_title")}</h2>
      <div class="op-more">
        ${item("details", "📊", t("op_more_details"), t("op_more_details_t"))}
        ${item("products", "🍞", t("op_more_stock"), t("op_more_stock_t"))}
        ${item("history", "🧾", t("op_more_history"), t("op_more_history_t"))}
        ${item("rs232", "🔌", t("op_more_link"), t("op_more_link_t"))}
      </div>
      <h3>⚙️ ${t("op_more_settings")}</h3>
      <div class="op-more-set">
        <label>🌐 <select id="more-lang" class="auto-w" aria-label="Langue / Taal / Language">${["fr", "nl", "en"].map(l => `<option value="${l}" ${BA.I18n.lang === l ? "selected" : ""}>${{ fr: "Français", nl: "Nederlands", en: "English" }[l]}</option>`).join("")}</select></label>
        <button type="button" id="more-theme" class="btn secondary">${light ? "🌙" : "☀️"} ${E(BA.Theme ? BA.Theme.label() : "")}</button>
        ${document.getElementById("btn-logout") ? `<button type="button" id="more-logout" class="btn secondary">🚪 ${t("logout")}</button>` : ""}
        ${BA.IN_APP ? "" : `<a class="btn secondary" href="index.html">🖥 ${t("open_admin")}</a>`}
      </div>`;
    el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => BA.Shell.go(b.dataset.go));
    el.querySelector("#more-lang").onchange = e => { BA.I18n.set(e.target.value, "op"); BA.Shell.build(); };
    el.querySelector("#more-theme").onclick = () => { const h = document.getElementById("theme-toggle"); if (h) h.click(); renderMore(el); };
    const lo = el.querySelector("#more-logout"); if (lo) lo.onclick = () => { const h = document.getElementById("btn-logout"); if (h) h.click(); };
  }

  // Pages ouvertes depuis « Plus » : bouton « Retour » en haut
  // v5.11.1 : le cadre (bouton Retour + .op-sub) est gardé d'un dessin à l'autre. Avant, chaque mise à jour
  // créait un nouveau .op-sub : les boutons de la page redessinaient l'ancien (détaché) et le message
  // « ✅ enregistré » (prix, capacité, sélection ajoutée…) n'apparaissait jamais chez l'opérateur.
  const sousPage = render => (el, ctx) => {
    let back = el.querySelector(":scope > .op-back"), sub = el.querySelector(":scope > .op-sub");
    if (!back || !sub) {
      el.innerHTML = `<button type="button" class="btn secondary petit op-back"></button><div class="op-sub"></div>`;
      back = el.querySelector(".op-back"); sub = el.querySelector(".op-sub");
    }
    back.textContent = "‹ " + t("op_back_more");
    back.onclick = () => BA.Shell.go("more");
    render(sub, ctx);
  };

  // ================= Produits / Stock =================
  function renderProducts(el) {
    const s = BA.Store.get();
    const m = M.machine(s, st().machine) || s.machines[0];
    if (!m) { el.innerHTML = `<h2>🍞 ${t("nav_products")}</h2><div class="alert info">${t("no_machine_op")}</div>`; return; }   // v5 : flotte vide
    st().machine = m.num;
    el.innerHTML = `
      <h2>🍞 ${t("nav_products")}</h2>
      ${U.machinePicker(s, m.num, "prod-machine")}
      <div class="carte-actions"><button class="btn big" id="fill-btn">🧺 ${t("btn_fill")}</button>
        <button class="btn big secondary" id="add-sel-go">➕ ${t("add_sel_title")}</button></div>
      <p class="note" data-aide="1">${t("op_sel_help")}</p>
      ${BA.MachineView ? BA.MachineView.modeSwitch() : ""}
      ${BA.MachineView && BA.MachineView.on() ? BA.MachineView.block(s, m) : ""}
      ${BA.MachineView ? BA.MachineView.foldOpen("stock", `🍞 ${t("mv_table_title")}`, U.stockTable(s, m, false)) : U.stockTable(s, m, false)}
      <p class="note">${t("products_op_note", { h: s.settings.thrHours })}</p>`;
    el.querySelector("#prod-machine").onchange = e => { st().machine = Number(e.target.value); renderProducts(el); };
    el.querySelector("#fill-btn").onclick = () => Wizard.open(m.num);
    // v5.11.1 : le formulaire d'ajout est en bas de la page : ce bouton y va directement
    el.querySelector("#add-sel-go").onclick = () => { const f = el.querySelector(".add-sel"); if (!f) return; f.scrollIntoView({ behavior: "smooth", block: "center" }); const n = f.querySelector("input"); if (n) setTimeout(() => n.focus({ preventScroll: true }), 350); };
    U.bindStockTable(el, m.num, false, () => renderProducts(el));
    if (BA.MachineView && BA.MachineView.on()) BA.MachineView.bind(el, m);
  }

  // Cellule « sélection + type de pain » (compacte pour le téléphone)
  const selCell = (n, type) => `<td><span class="selno-big">${n}</span><div class="petit">${U.prod(type)}</div></td>`;

  // ================= Assistant « Remplir » =================
  const Wizard = {
    w: null,

    open(num) {
      const itId = BA.Actions.startIntervention(num);
      const s = BA.Store.get();
      const it = s.interventions.find(x => x.id === itId);
      this.w = { itId, num, step: it ? Math.min(it.step, 3) : 1, mode: "view", cancelArmed: false, error: "" };
      this.render();
    },

    close() {
      if (this.w) clearTimeout(this.w.cancelTimer);
      this.w = null;
      document.getElementById("modal-root").innerHTML = "";
      BA.Shell.renderView();
    },

    // On peut revenir en arrière si l'étape précédente a été validée avec une copie du stock
    canBack(s, step) {
      const it = s.interventions.find(x => x.id === this.w.itId);
      return !!(it && it.snaps && it.snaps[step - 1]);
    },
    backBtn(id) { return `<button class="btn big secondary" id="${id}">${t("btn_back")}</button>`; },

    stepper(step) {
      return `<div class="stepper">${[1, 2, 3].map(n =>
        `<div class="step ${n === step ? "on" : n < step ? "done" : ""}"><span>${n < step ? "✔" : n}</span>${t("step" + n)}</div>`).join("")}</div>`;
    },

    render() {
      const w = this.w; if (!w) return;
      const s = BA.Store.get();
      const m = M.machine(s, w.num);
      let body = "";
      // v5.24 (design-test) : « Machine » (on touche les tiroirs) ou « Tableau » (comme avant) ; mêmes actions derrière
      const mach = !!BA.MachineView && this.vue() === "machine";
      if (w._ms !== w.step) { w._ms = w.step; w.mvOpen = false; }     // nouvelle étape : fenêtre du tiroir fermée
      if (w.step === 1) body = mach ? this.mStep(s, m) : this.step1(s, m);
      else if (w.step === 2) body = mach ? this.mStep(s, m) : this.step2(s, m);
      else if (w.step === 3) body = mach ? this.mStep(s, m) : this.step3(s, m);
      else body = this.summary(s, m) + (mach ? this.mAfter(s, m) : "");
      document.getElementById("modal-root").innerHTML = `
        <div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div><h2>🧺 ${t("fill_title", { n: m.num })}</h2><div class="petit">${E(m.street)}, ${E(m.city)} · 🚪 ${t("door_open_now")}</div></div>
            ${w.step <= 3 ? `<button class="danger" id="wz-cancel">${w.cancelArmed ? "⚠️ " + t("btn_cancel_confirm") : "✖ " + t("btn_cancel")}</button>` : ""}
          </div>
          ${w.step <= 3 ? this.stepper(w.step) : ""}
          ${w.error ? `<div class="alert err">${w.error}</div>` : ""}
          ${w.step <= 3 && BA.MachineView ? this.vueSwitch() : ""}
          ${body}
        </div></div>`;
      this.bind();
      if (mach && w.step <= 3) this.mBind();
    },

    // ---------- Étape 1 : inventaire ----------
    step1(s, m) {
      const edit = this.w.mode === "edit";
      return `
        <h3>${t("step1_title")}</h3>
        <p class="note">${t("step1_help")}</p>
        <div class="table-scroll"><table class="wz">
          <thead><tr><th>${t("col_sel")}</th><th>${t("col_recorded")}</th><th>${t("col_counted")}</th></tr></thead>
          <tbody>${m.sels.map(sel => {
            const q = M.qty(sel);
            return `<tr>${selCell(sel.n, sel.type)}<td class="big-num">${q}</td>
              <td><input type="number" class="num-in big-in" id="inv-${sel.n}" data-sel="${sel.n}" min="0" max="${sel.cap}" value="${edit && this.w.inv && this.w.inv[sel.n] != null ? this.w.inv[sel.n] : q}" ${edit ? "" : "disabled"}> <span class="petit">/ ${sel.cap}</span></td></tr>`;
          }).join("")}</tbody></table></div>
        ${edit
          ? `<div class="wz-actions">${this.backBtn("inv-back")}<button class="btn big" id="inv-validate">✔ ${t("btn_validate_inv")}</button></div>`
          : `<div class="q-title">${t("step1_question")}</div>
             <div class="wz-actions">
               <button class="btn big" id="inv-yes">✔ ${t("btn_inv_yes")}</button>
               <button class="btn big secondary" id="inv-edit">✏ ${t("btn_inv_no")}</button>
               <button class="btn secondary" id="inv-skip">⏭ ${t("btn_skip")}</button>
             </div>`}`;
    },

    // ---------- Étape 2 : retrait des anciens produits ----------
    // Règle « gardé une seule fois » : les pains gardés une fois et devenus invalides (le jour suivant
    // est passée, ⛔) sont retirés dans tous les cas ; les pains déjà gardés pendant cette tournée (annuler
    // puis relancer « Remplir », ⏳) ne sont pas encore obligatoires : l'opérateur peut encore choisir ;
    // les autres peuvent rester une fois (invalides au jour suivant).
    step2(s, m) {
      const mission = M.openMission(s, m.num);
      const rows = M.removalList(s, m, mission);
      this.w.rows = rows;
      const edit = this.w.mode === "edit";
      const must = rows.filter(r => r.mandatory), nMust = must.reduce((a, r) => a + r.qty, 0), nOpt = rows.length - must.length;
      const again = rows.filter(r => r.kept && !r.mandatory), nAgain = again.reduce((a, r) => a + r.qty, 0);
      const nNew = rows.filter(r => !r.kept).length;     // pains trop vieux pas encore gardés (le message ⏳ du bas les concerne)
      const mustCell = r => r.mandatory
        ? `<div><span class="tag c-must">⛔ ${t("must_tag")}</span></div>${r.keptAt ? `<div class="petit">${t("kept_on", { d: F.dt(r.keptAt) })}</div>` : ""}`
        : r.kept ? `<div><span class="tag c-kept">⏳ ${t("lot_kept_short")}</span></div>${r.keptAt ? `<div class="petit">${t("kept_on", { d: F.dt(r.keptAt) })}</div>` : ""}` : "";
      const rule = mission && mission.removeBefore
        ? t("step2_rule_mission", { d: F.dt(mission.removeBefore) })
        : t("step2_rule_thr", { h: s.settings.thrHours });
      if (!rows.length) {
        return `<h3>${t("step2_title")}</h3>
          <p class="note">${rule}</p>
          <div class="alert info">✅ ${t("step2_none")}</div>
          <div class="wz-actions">${this.canBack(s, 2) ? this.backBtn("wz-back") : ""}<button class="btn big" id="rm-next">${t("btn_next")} →</button></div>`;
      }
      return `
        <h3>${t("step2_title")}</h3>
        <p class="note">${rule} ${t("step2_help")}</p>
        ${nMust ? `<div class="alert err">${t("step2_must_alert", { n: nMust })}</div>` : ""}
        ${nAgain ? `<div class="alert info">${t("step2_again_alert", { n: nAgain, d: F.dt(Math.min.apply(null, again.map(r => r.until))) })}</div>` : ""}
        <div class="table-scroll"><table class="wz">
          <thead><tr><th>${t("col_sel")}</th><th>${t("col_lotdate")}</th><th>${t("col_to_remove")}</th>
            ${edit ? `<th>${t("col_removed_real")}</th><th>${t("col_still_good")}</th>` : ""}</tr></thead>
          <tbody>${rows.map((r, i) => `<tr class="${r.mandatory ? "must-row" : r.kept ? "kept-row" : ""}">${selCell(r.sel, r.type)}<td>${F.dt(r.date)}<div class="petit">${F.age(s.now - r.date)}</div>${mustCell(r)}</td><td class="big-num">${r.qty}</td>
            ${edit ? (r.mandatory
              ? `<td><input type="number" class="num-in big-in" id="rm-${i}" data-i="${i}" value="${r.qty}" disabled></td><td><span class="tag c-must">⛔ ${t("must_tag")}</span></td>`
              : `<td><input type="number" class="num-in big-in" id="rm-${i}" data-i="${i}" min="0" max="${r.qty}" value="${this.rmDraft(r)}"></td>
              <td><label class="case"><input type="checkbox" id="keep-${i}" data-i="${i}"${this.rmDraft(r) === 0 && r.qty > 0 ? " checked" : ""}> ${t("keep_label")}</label></td>`) : ""}</tr>`).join("")}</tbody></table></div>
        <p class="petit">${t("step2_total", { n: rows.reduce((a, r) => a + r.qty, 0) })}</p>
        ${nNew ? `<div class="alert info">⏳ ${t("step2_keep_note", { d: F.dt(M.nextDayAt(s, s.now)) })}</div>` : ""}
        ${edit
          ? `<div class="wz-actions">${this.backBtn("rm-back")}<button class="btn big" id="rm-validate">✔ ${t("btn_validate_rm")}</button></div>`
          : nOpt === 0
          ? `<div class="q-title">${t("step2_question_must")}</div>
             <div class="wz-actions">${this.canBack(s, 2) ? this.backBtn("wz-back") : ""}<button class="btn big" id="rm-yes">✔ ${t("btn_rm_must")}</button></div>`
          : `<div class="q-title">${t("step2_question")}</div>
             <div class="wz-actions">
               ${this.canBack(s, 2) ? this.backBtn("wz-back") : ""}
               <button class="btn big" id="rm-yes">✔ ${t("btn_rm_yes")}</button>
               <button class="btn big secondary" id="rm-no">✖ ${t(nMust ? "btn_rm_only_must" : "btn_rm_no")}</button>
               <button class="btn big secondary" id="rm-edit">✏ ${t("btn_modify")}</button>
             </div>`}`;
    },

    // ---------- Étape 3 : chargement ----------
    // v5.19 : remplissage SPONTANÉ (sans mission de l'admin, sans commande) → 0 pain par défaut partout :
    // l'opérateur saisit lui-même ce qu'il charge. Remplissage d'une MISSION (commande envoyée par l'admin)
    // → la quantité de la mission (corrigée avec le stock réel) est déjà écrite ; l'opérateur peut la changer.
    step3(s, m) {
      const { mission, advised, reduced, L } = this.loadCtx(s, m);
      return `
        <h3>${t("step3_title")}</h3>
        <p class="note">${t(mission ? "step3_help" : "step3_help_free")}</p>
        <div class="alert warn">🔁 ${t("fifo_reminder")}</div>
        ${reduced ? `<div class="alert info">📈 ${t("op_reduced_load")}</div>` : ""}
        <label class="field-row">${t("ld_date_all")} <input type="datetime-local" id="ld-date" value="${F.toInput(this.w.delivery)}"></label>
        <div class="table-scroll"><table class="wz">
          <thead><tr><th>${t("col_sel")}</th><th class="no-phone">${t("col_target")}</th><th class="no-phone">${t("col_left")}</th><th>${t("col_to_load")}</th></tr></thead>
          <tbody>${m.sels.map(sel => {
            const q = M.qty(sel), need = sel.cap - q;
            const lines = L[sel.n] || [];
            return `<tr>${selCell(sel.n, sel.type).replace("</td>", `<div class="petit only-phone">${t("col_target")} ${sel.cap} · ${t("col_left")} ${q}</div></td>`)}<td class="big-num no-phone">${sel.cap}</td><td class="big-num no-phone">${q}</td>
              <td>${lines.map((x, i) => `<div class="ld-line">
                  <input type="number" class="num-in big-in" id="ld-${sel.n}-${i}" data-sel="${sel.n}" data-i="${i}" min="0" max="${need}" value="${x.qty}"> <span class="petit">${t("ld_units")}</span>
                  <input type="datetime-local" id="ldd-${sel.n}-${i}" data-sel="${sel.n}" data-i="${i}" value="${F.toInput(x.date)}">
                  ${lines.length > 1 ? `<button class="btn petit secondary ld-del" data-sel="${sel.n}" data-i="${i}" title="${t("ld_remove_line")}">✖</button>` : ""}
                </div>`).join("")}
                <div class="petit">${t("max_n", { n: need })}${mission && advised(sel) > 0 ? " · " + t("op_advised") + " : " + advised(sel) : ""}
                  ${need > 0 ? `<button class="btn petit secondary ld-add" data-sel="${sel.n}">${t("ld_add_date")}</button>` : ""}</div></td></tr>`;
          }).join("")}</tbody></table></div>
        <p class="petit" id="ld-total">${t("step3_total", { n: m.sels.reduce((a, sel) => a + (L[sel.n] || []).reduce((b, x) => b + (Number(x.qty) || 0), 0), 0) })}</p>
        <div class="wz-actions">${this.canBack(s, 3) ? this.backBtn("wz-back") : ""}<button class="btn big" id="ld-validate">✔ ${t("btn_validate_load")}</button></div>`;
    },

    loadCtx(s, m) {
      const def = M.lastDelivery(s.now);
      if (!this.w.delivery) this.w.delivery = def;
      // Charge envoyée par l'admin « selon le besoin » (ventes prévues jusqu'au prochain passage + marge) :
      // on propose la quantité de la mission, corrigée avec le stock réel (pas forcément « remplir à fond »)
      const mission = M.openMission(s, m.num);
      const fewer = sel => {
        const l = mission && mission.reduced && (mission.lines || []).find(x => x.sel === sel.n);
        return l ? Math.max(0, l.full - l.load) : 0;
      };
      const advised = sel => Math.max(0, sel.cap - M.qty(sel) - fewer(sel));
      const reduced = m.sels.some(sel => fewer(sel) > 0);
      // lignes de chargement : une ou plusieurs dates de livraison par sélection
      // (une sélection ajoutée pendant l'intervention reçoit aussi sa ligne)
      if (!this.w.lines) this.w.lines = {};
      m.sels.forEach(sel => { if (!this.w.lines[sel.n]) this.w.lines[sel.n] = [{ qty: mission ? advised(sel) : 0, date: this.w.delivery }]; });
      return { mission, advised, reduced, L: this.w.lines };
    },

    summary(s, m) {
      const it = s.interventions.find(x => x.id === this.w.itId) || { inv: [], rem: [], load: [] };
      const gap = it.inv.reduce((a, r) => a + (r.real - r.exp), 0);
      const rem = it.rem.reduce((a, r) => a + r.removed, 0);
      const kept = it.rem.filter(r => r.kept).length;
      const load = it.load.reduce((a, r) => a + r.qty, 0);
      return `
        <div class="alert info">✅ <b>${t("done_title")}</b> — ${t("done_door")}</div>
        <div class="cards">
          <div class="card"><div class="label">${t("step1")}</div><div class="value v-small">${it.invSkipped ? t("skipped") : gap === 0 ? t("inv_ok") : t("inv_gap", { n: (gap > 0 ? "+" : "") + gap })}</div></div>
          <div class="card"><div class="label">${t("step2")}</div><div class="value v-small">${t("removed_n", { n: rem })}${kept ? " · " + t("kept_n", { n: kept }) : ""}</div></div>
          <div class="card"><div class="label">${t("step3")}</div><div class="value v-small">${t("loaded_n", { n: load })}</div><div class="petit">${t("delivery_date")} : ${(it.deliveries || []).length > 1 ? t("ld_several", { n: it.deliveries.length }) + " (" + it.deliveries.map(d => F.dt(d)).join(" · ") + ")" : it.delivery ? F.dt(it.delivery) : "—"}</div></div>
        </div>
        <div class="wz-actions"><button class="btn big" id="wz-close">${t("btn_close")}</button></div>`;
    },

    // Validation du chargement (vue Tableau et vue Machine) : mêmes contrôles qu'avant, puis applyLoad
    doLoad() {
      const w = this.w;
      const s = BA.Store.get(), m = M.machine(s, w.num);
      const loads = {}; let bad = false;
      m.sels.forEach(sel => {
        const need = sel.cap - M.qty(sel), L = w.lines[sel.n] || [];
        let sum = 0;
        loads[sel.n] = L.map(x => {
          const v = Number(x.qty);
          if (x.qty === "" || !(v >= 0) || v > need || (v > 0 && !isFinite(x.date))) bad = true;
          sum += v || 0;
          return { qty: v || 0, date: x.date };
        });
        if (sum > need) bad = true;
      });
      if (bad) { w.error = t("err_load"); this.render(); return; }
      BA.Actions.applyLoad(w.itId, loads, w.delivery);
      w.step = 4; w.error = ""; this.render();
    },

    // ================= v5.24 (design-test) : « Remplir » en touchant les tiroirs =================
    // Les trois étapes appellent les MÊMES actions qu'avec le tableau (applyInventory, applyRemoval, applyLoad),
    // avec les mêmes valeurs. Seule la façon de les saisir change : − / + sur chaque tiroir.
    // Le choix « Machine / Classique » est le même partout (Dashboard, Détail, Produits, Remplir)
    vue() { return BA.MachineView && BA.MachineView.on() ? "machine" : "table"; },
    vueSwitch() { return `<div class="wz-vue">${BA.MachineView.modeSwitch()}</div>`; },
    // Changer d'affichage sans perdre ce qui a déjà été saisi (le choix lui-même est déjà enregistré)
    modeChanged(mode) {
      const w = this.w; if (!w) return;
      const v = mode === "classic" ? "table" : "machine";
      const s = BA.Store.get(), m = M.machine(s, w.num);
      if (v === "machine") this.syncFromTable();
      else if (m) {     // vers le tableau : les corrections faites sur la machine s'ouvrent en mode « modifier »
        if (w.step === 1 && w.inv && m.sels.some(sel => w.inv[sel.n] != null && w.inv[sel.n] !== M.qty(sel))) w.mode = "edit";
        if (w.step === 2 && (w.rows || []).some(r => !r.mandatory && this.rmDraft(r) !== r.qty)) w.mode = "edit";
      }
      w.mvOpen = false;
      this.render();
    },
    rmKey(r) { return r.sel + "-" + r.lotId; },
    // nombre de pains retirés d'un lot (par défaut : tout le lot, comme « Oui, retirer »)
    rmDraft(r) {
      if (r.mandatory) return r.qty;
      const v = this.w && this.w.rmd ? this.w.rmd[this.rmKey(r)] : null;
      return v != null ? Math.max(0, Math.min(r.qty, v)) : r.qty;
    },
    syncFromTable() {
      const w = this.w, q = id => document.getElementById(id);
      if (w.step === 1 && w.mode === "edit") {
        w.inv = w.inv || {};
        document.querySelectorAll(".modal [id^=inv-][data-sel]").forEach(i => { const v = Number(i.value); if (i.value !== "" && v >= 0) w.inv[i.dataset.sel] = Math.round(v); });
      }
      if (w.step === 2 && w.mode === "edit") {
        w.rmd = w.rmd || {};
        (w.rows || []).forEach((r, i) => {
          const inp = q("rm-" + i), cb = q("keep-" + i); if (r.mandatory || !inp) return;
          const v = Number(inp.value);
          w.rmd[this.rmKey(r)] = cb && cb.checked ? 0 : inp.value !== "" && v >= 0 ? Math.min(r.qty, Math.round(v)) : r.qty;
        });
      }
      if (w.step === 3 && w.lines) {
        document.querySelectorAll(".modal [id^=ld-][data-sel]").forEach(i => { const L = w.lines[i.dataset.sel]; if (L && L[i.dataset.i]) L[i.dataset.i].qty = i.value === "" ? "" : Number(i.value); });
        document.querySelectorAll(".modal [id^=ldd-][data-sel]").forEach(i => { const L = w.lines[i.dataset.sel], v = F.fromInput(i.value); if (L && L[i.dataset.i] && v) L[i.dataset.i].date = v; });
      }
      w.mode = "view";
    },

    mStep(s, m) {
      const w = this.w;
      let head;
      if (w.step === 1) head = `<h3>${t("step1_title")}</h3><p class="note">${t("mv_inv_help")}</p>`;
      else if (w.step === 2) {
        const mission = M.openMission(s, m.num);
        const rule = mission && mission.removeBefore ? t("step2_rule_mission", { d: F.dt(mission.removeBefore) }) : t("step2_rule_thr", { h: s.settings.thrHours });
        head = `<h3>${t("step2_title")}</h3><p class="note">${rule} ${t("mv_rm_help")}</p>`;
      } else {
        const c = this.loadCtx(s, m);
        head = `<h3>${t("step3_title")}</h3>
          <p class="note">${t(c.mission ? "step3_help" : "step3_help_free")} ${t("mv_ld_help")}</p>
          <div class="alert warn">🔁 ${t("fifo_reminder")}</div>
          ${c.reduced ? `<div class="alert info">📈 ${t("op_reduced_load")}</div>` : ""}
          <label class="field-row">${t("ld_date_all")} <input type="datetime-local" id="mvl-date" value="${F.toInput(w.delivery)}"></label>`;
      }
      return `${head}<div id="wz-mv">${this.mInner(s, m)}</div>`;
    },

    // Un tiroir touché ouvre une fenêtre pop-up (w.mvOpen) : la machine reste en place, rien ne s'élargit ni ne descend
    mInner(s, m) {
      const w = this.w, V = BA.MachineView;
      const o = w.step === 1 ? this.mInv(s, m) : w.step === 2 ? this.mRm(s, m) : this.mLoad(s, m);
      const sel = w.mvOpen && w.mvKey != null ? M.sel(m, Number(w.mvKey)) : null;
      if (w.mvOpen && !sel) w.mvOpen = false;
      const key = sel ? String(sel.n) : null;
      const grid = V.grid(s, m, { list: o.list, stat: o.stat, key, free: true, freeClick: false });
      return `<div class="mv-machine"><div class="mv-glass">${grid}</div>${V.legend(s, o.mode)}</div>${sel ? V.pop(V.big(s, m, sel, o.list, o.stat) + o.panel(sel)) : ""}${o.footer}`;
    },

    // compteur − / + (grands boutons pour le doigt)
    mCounter(label, v, min, max, attrs, idBase) {
      return `<div class="mv-count"><span class="mv-count-l">${label}</span>
        <button type="button" class="btn secondary mv-pm" id="${idBase}-m" ${attrs} data-d="-1" aria-label="${E(t("mv_minus"))}"${v <= min ? " disabled" : ""}>−</button>
        <output class="mv-num" aria-live="polite">${v}</output>
        <button type="button" class="btn secondary mv-pm" id="${idBase}-p" ${attrs} data-d="1" aria-label="${E(t("mv_plus"))}"${v >= max ? " disabled" : ""}>+</button></div>`;
    },
    mHead(sel) { return `<h4>${t("mv_sel", { n: sel.n })} · ${U.prod(sel.type)}</h4>`; },

    // ---------- Étape 1 : inventaire ----------
    mInv(s, m) {
      const w = this.w, V = BA.MachineView, C = w.inv || (w.inv = {});
      const cnt = sel => (C[sel.n] != null ? C[sel.n] : M.qty(sel));
      const changed = m.sels.filter(sel => cnt(sel) !== M.qty(sel)).length;
      return {
        mode: "inv",
        list: sel => V.items.inv(s, m, sel, C[sel.n]),
        stat: (sel, l) => V.status.inv(sel, l, M.qty(sel), C[sel.n]),
        first: m.sels[0] ? m.sels[0].n : null,
        panel: sel => {
          const e = M.qty(sel), c = cnt(sel), d = c - e;
          return `<div class="mv-panel">${this.mHead(sel)}
            <div class="mv-kv"><span>${t("col_recorded")}</span><b>${e} / ${sel.cap}</b></div>
            ${this.mCounter(t("col_counted"), c, 0, sel.cap, `data-mvi="${sel.n}"`, "mvi")}
            ${d < 0 ? `<p class="petit mv-warn">${t("mv_inv_less", { n: -d })}</p>` : d > 0 ? `<p class="petit">${t("mv_inv_more", { n: d })}</p>` : ""}
            ${d ? `<div class="mv-btns"><button type="button" class="btn secondary" id="mvi-r" data-mvi-r="${sel.n}">↺ ${t("mv_inv_reset_one")}</button></div>` : ""}</div>`;
        },
        footer: changed
          ? `<p class="petit">${t("mv_inv_changed", { n: changed })}</p>
             <div class="wz-actions"><button class="btn big" id="mvw-inv-ok">✔ ${t("btn_validate_inv")}</button><button class="btn big secondary" id="mvw-inv-reset">↺ ${t("mv_reset")}</button></div>`
          : `<div class="q-title">${t("step1_question")}</div>
             <div class="wz-actions"><button class="btn big" id="mvw-inv-yes">✔ ${t("btn_inv_yes")}</button><button class="btn secondary" id="mvw-inv-skip">⏭ ${t("btn_skip")}</button></div>`
      };
    },

    // ---------- Étape 2 : retrait ----------
    mRm(s, m) {
      const w = this.w, V = BA.MachineView, mission = M.openMission(s, m.num);
      const rows = M.removalList(s, m, mission);
      w.rows = rows;
      const remOf = r => this.rmDraft(r);
      const nOut = rows.reduce((a, r) => a + remOf(r), 0), nKeep = rows.reduce((a, r) => a + r.qty - remOf(r), 0);
      const changed = rows.some(r => !r.mandatory && remOf(r) !== r.qty);
      const must = rows.filter(r => r.mandatory), nMust = must.reduce((a, r) => a + r.qty, 0), nOpt = rows.length - must.length;
      const again = rows.filter(r => r.kept && !r.mandatory), nAgain = again.reduce((a, r) => a + r.qty, 0);
      const back = this.canBack(s, 2) ? `<button class="btn big secondary" id="mvw-back">${t("btn_back")}</button>` : "";
      const footer = !rows.length
        ? `<div class="alert info">✅ ${t("step2_none")}</div><div class="wz-actions">${back}<button class="btn big" id="mvw-rm-next">${t("btn_next")} →</button></div>`
        : `${nMust ? `<div class="alert err">${t("step2_must_alert", { n: nMust })}</div>` : ""}
           ${nAgain ? `<div class="alert info">${t("step2_again_alert", { n: nAgain, d: F.dt(Math.min.apply(null, again.map(r => r.until))) })}</div>` : ""}
           <p class="petit">${t("mv_rm_sum", { n: nOut, k: nKeep })}</p>
           ${nKeep ? `<div class="alert info">⏳ ${t("step2_keep_note", { d: F.dt(M.nextDayAt(s, s.now)) })}</div>` : ""}
           <div class="wz-actions">${back}${changed
             ? `<button class="btn big" id="mvw-rm-ok">✔ ${t("btn_validate_rm")}</button><button class="btn big secondary" id="mvw-rm-reset">↺ ${t("mv_reset")}</button>`
             : `<button class="btn big" id="mvw-rm-yes">✔ ${t(nOpt === 0 ? "btn_rm_must" : "btn_rm_yes")}</button>${nOpt > 0 ? `<button class="btn big secondary" id="mvw-rm-no">✖ ${t(nMust ? "btn_rm_only_must" : "btn_rm_no")}</button>` : ""}`}</div>`;
      return {
        mode: "rm",
        list: sel => V.items.rm(s, m, sel, rows, remOf),
        stat: (sel, l) => V.status.rm(sel, l),
        first: rows.length ? rows[0].sel : m.sels[0] ? m.sels[0].n : null,
        panel: sel => {
          const mine = rows.filter(r => r.sel === sel.n);
          const lots = sel.lots.slice().sort((a, b) => a.date - b.date || a.id - b.id).map(l => {
            const r = mine.find(x => x.lotId === l.id);
            const head = `<span>${t("mv_lot", { d: V.dd(l.date) })} · <b class="${r ? "old" : ""}">${t("mv_ago", { h: V.hrs(s, l.date) })}</b> · ${t("mv_n", { n: l.qty })}</span>`;
            if (!r) return `<div class="mv-lotline">${head}<span class="mv-ok">✔ ${t("mv_good")}</span></div>`;
            if (r.mandatory) return `<div class="mv-lotline">${head}<span class="mv-must">⛔ ${t("must_tag")} · ${t("mv_out_n", { n: r.qty })}</span></div>`;
            const k = this.rmKey(r), v = remOf(r);
            return `<div class="mv-lotline mv-rmline">${head}
              ${r.kept && r.keptAt ? `<span class="petit">⏳ ${t("kept_on", { d: F.dt(r.keptAt) })}</span>` : ""}
              ${this.mCounter(t("mv_rm_out"), v, 0, r.qty, `data-mvr="${k}"`, "mvr-" + k)}
              <div class="mv-btns"><button type="button" class="btn ${v === r.qty ? "" : "secondary"}" id="mvr-a-${k}" data-mvr-set="${k}" data-v="${r.qty}">✖ ${t("mv_rm_all")}</button>
                <button type="button" class="btn ${v === 0 ? "" : "secondary"}" id="mvr-k-${k}" data-mvr-set="${k}" data-v="0" title="${E(t("btn_keep_tip"))}">⏳ ${t("btn_keep")}</button></div></div>`;
          }).join("");
          return `<div class="mv-panel">${this.mHead(sel)}${mine.length ? "" : `<p class="petit">✅ ${t("mv_rm_none_sel")}</p>`}${lots || `<p class="petit">${t("mv_empty")}</p>`}</div>`;
        },
        footer
      };
    },

    // ---------- Étape 3 : chargement ----------
    mLoad(s, m) {
      const w = this.w, V = BA.MachineView, c = this.loadCtx(s, m), L = c.L;
      const sum = n => (L[n] || []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
      const total = m.sels.reduce((a, sel) => a + sum(sel.n), 0);
      const back = this.canBack(s, 3) ? `<button class="btn big secondary" id="mvw-back">${t("btn_back")}</button>` : "";
      const firstSel = m.sels.find(sel => sel.cap - M.qty(sel) > 0) || m.sels[0];
      return {
        mode: "load",
        list: sel => V.items.load(s, m, sel, L[sel.n]),
        stat: (sel, l) => V.status.load(sel, l),
        first: firstSel ? firstSel.n : null,
        panel: sel => {
          const q = M.qty(sel), need = sel.cap - q, lines = L[sel.n] || [], used = sum(sel.n);
          return `<div class="mv-panel">${this.mHead(sel)}
            <div class="mv-kv"><span>${t("mv_inside")}</span><b>${q} / ${sel.cap}</b></div>
            <div class="mv-kv"><span>${t("mv_ld_free")}</span><b>${need}</b></div>
            ${c.mission && c.advised(sel) > 0 ? `<div class="mv-kv"><span>${t("op_advised")}</span><b>${c.advised(sel)}</b></div>` : ""}
            ${need <= 0 ? `<p class="petit">✔ ${t("mv_full_sel")}</p>` : lines.map((x, i) => {
              const v = Number(x.qty) || 0, room = need - (used - v);
              return `<div class="mv-ldline">${this.mCounter(t("mv_ld_add"), v, 0, room, `data-mvl="${sel.n}" data-i="${i}"`, `mvl-${sel.n}-${i}`)}
                <label class="mv-ld-date">${t("mv_ld_date")} <input type="datetime-local" id="mvl-d-${sel.n}-${i}" data-mvld="${sel.n}" data-i="${i}" value="${F.toInput(x.date)}"></label>
                ${lines.length > 1 ? `<button type="button" class="btn petit secondary" id="mvl-x-${sel.n}-${i}" data-mvl-del="${sel.n}" data-i="${i}" title="${E(t("ld_remove_line"))}" aria-label="${E(t("ld_remove_line"))}">✖</button>` : ""}</div>`;
            }).join("")}
            ${need > 0 ? `<div class="mv-btns"><button type="button" class="btn secondary" id="mvl-f-${sel.n}" data-mvl-full="${sel.n}">⬆ ${t("mv_ld_full")}</button>
              <button type="button" class="btn secondary" id="mvl-z-${sel.n}" data-mvl-zero="${sel.n}">0</button>
              <button type="button" class="btn secondary" id="mvl-a-${sel.n}" data-mvl-add="${sel.n}">${t("ld_add_date")}</button></div>` : ""}</div>`;
        },
        footer: `<p class="petit" id="mvl-total">${t("step3_total", { n: total })}</p>
          <div class="wz-actions">${back}<button class="btn big secondary" id="mvw-ld-full">⬆ ${t("mv_ld_all_full")}</button><button class="btn big" id="mvw-ld-ok">✔ ${t("btn_validate_load")}</button></div>`
      };
    },

    // Après le remplissage : la machine telle qu'elle est maintenant (lecture seule)
    mAfter(s, m) {
      return `<h3>🧩 ${t("mv_after")}</h3><div class="mv-glass">${BA.MachineView.grid(s, m, { ro: true, free: true })}</div>${BA.MachineView.legend(s, "view")}`;
    },

    // Redessine seulement la machine et les boutons (le défilement de la fenêtre ne bouge pas)
    mRefresh(focusId) {
      const w = this.w, box = document.getElementById("wz-mv"); if (!w || !box) return;
      const s = BA.Store.get(), m = M.machine(s, w.num); if (!m) return;
      const ae = document.activeElement, id = focusId || (ae && box.contains(ae) ? ae.id : null);
      box.innerHTML = this.mInner(s, m);
      this.mBindInner();
      if (id) { const n = document.getElementById(id); if (n && !n.disabled) n.focus({ preventScroll: true }); }
    },
    mBindInner() {
      const w = this.w;
      document.querySelectorAll("#wz-mv [data-mvld]").forEach(inp => U.dateInput(inp, val => {
        const v = F.fromInput(val), L = w.lines && w.lines[inp.dataset.mvld];
        if (!v || !L || !L[inp.dataset.i]) return;
        L[inp.dataset.i].date = v; this.mRefresh();
      }));
    },
    mBind() {
      const w = this.w, box = document.getElementById("wz-mv"); if (!box) return;
      const A = BA.Actions;
      const go = step => { w.step = step; w.mode = "view"; w.error = ""; w.mvKey = null; w.mvOpen = false; this.render(); };
      const all = document.getElementById("mvl-date");
      if (all) U.dateInput(all, val => {
        const v = F.fromInput(val); if (!v) return;
        w.delivery = v;
        Object.keys(w.lines || {}).forEach(k => w.lines[k].forEach(x => { x.date = v; }));
        this.mRefresh();
      });
      this.mBindInner();
      box.onclick = e => {
        if (e.target.dataset && e.target.dataset.mvBackdrop != null) { w.mvOpen = false; return this.mRefresh(w.mvKey != null ? "mvt-" + w.num + "-" + w.mvKey : null); }
        const b = e.target.closest("button");
        if (!b || !box.contains(b) || b.disabled) return;
        const s = BA.Store.get(), m = M.machine(s, w.num); if (!m) return;
        const d = b.dataset;
        if (d.mvClose != null) { w.mvOpen = false; return this.mRefresh(w.mvKey != null ? "mvt-" + m.num + "-" + w.mvKey : null); }
        if (d.mvSel != null) { w.mvKey = String(d.mvSel); w.mvOpen = true; this.mRefresh("mv-pop-x"); return; }
        // étape 1 : nombre compté
        if (d.mvi != null || d.mviR != null) {
          const sel = M.sel(m, Number(d.mvi != null ? d.mvi : d.mviR)); if (!sel) return;
          const C = w.inv || (w.inv = {}), exp = M.qty(sel), c = C[sel.n] != null ? C[sel.n] : exp;
          const v = d.mviR != null ? exp : Math.max(0, Math.min(sel.cap, c + Number(d.d)));
          if (v === exp) delete C[sel.n]; else C[sel.n] = v;
          return this.mRefresh(d.mviR != null ? "mvt-" + m.num + "-" + sel.n : b.id);
        }
        // étape 2 : pains retirés d'un lot (le reste est gardé une fois)
        if (d.mvr != null || d.mvrSet != null) {
          const k = d.mvr != null ? d.mvr : d.mvrSet, r = (w.rows || []).find(x => this.rmKey(x) === k);
          if (!r || r.mandatory) return;
          const R = w.rmd || (w.rmd = {}), v0 = this.rmDraft(r);
          R[k] = Math.max(0, Math.min(r.qty, d.mvrSet != null ? Number(d.v) : v0 + Number(d.d)));
          if (d.mvrSet != null) { w.mvOpen = false; return this.mRefresh("mvt-" + m.num + "-" + r.sel); }   // « Tout retirer » / « Encore bon » : choix fait, la fenêtre se ferme
          return this.mRefresh(b.id);
        }
        // étape 3 : pains chargés (une ou plusieurs dates de livraison par tiroir, comme dans le tableau)
        const lineOf = n => { const sel = M.sel(m, Number(n)), L = w.lines && w.lines[n]; return sel && L ? { sel, L, need: sel.cap - M.qty(sel) } : null; };
        if (d.mvl != null) {
          const o = lineOf(d.mvl); if (!o || !o.L[d.i]) return;
          const others = o.L.reduce((a, x, j) => a + (j === Number(d.i) ? 0 : Number(x.qty) || 0), 0);
          o.L[d.i].qty = Math.max(0, Math.min(o.need - others, (Number(o.L[d.i].qty) || 0) + Number(d.d)));
          return this.mRefresh(b.id);
        }
        if (d.mvlFull != null) { const o = lineOf(d.mvlFull); if (!o) return; o.L[0].qty = Math.max(0, o.need - o.L.slice(1).reduce((a, x) => a + (Number(x.qty) || 0), 0)); return this.mRefresh(b.id); }
        if (d.mvlZero != null) { const o = lineOf(d.mvlZero); if (!o) return; o.L.forEach(x => { x.qty = 0; }); return this.mRefresh(b.id); }
        if (d.mvlAdd != null) {     // même règle que « + autre date » du tableau
          const o = lineOf(d.mvlAdd); if (!o) return;
          const sum = o.L.reduce((a, x) => a + (Number(x.qty) || 0), 0);
          let qty = 1;
          if (sum + 1 > o.need) { const big = o.L.reduce((a, x) => (x.qty > a.qty ? x : a), o.L[0]); if (big && big.qty > 1) big.qty -= 1; else qty = 0; }
          o.L.push({ qty, date: w.delivery });
          return this.mRefresh(b.id);
        }
        if (d.mvlDel != null) { const o = lineOf(d.mvlDel); if (!o || o.L.length < 2) return; o.L.splice(Number(d.i), 1); return this.mRefresh(); }
        const rowsAll = () => (w.rows || []).map(r => ({ sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: r.qty, keep: false }));
        switch (b.id) {
          case "mvw-inv-yes": A.applyInventory(w.itId, {}, false); return go(2);
          case "mvw-inv-skip": A.applyInventory(w.itId, {}, true); return go(2);
          case "mvw-inv-reset": w.inv = {}; return this.mRefresh();
          case "mvw-inv-ok": {
            const counts = {};
            m.sels.forEach(sel => { counts[sel.n] = w.inv && w.inv[sel.n] != null ? w.inv[sel.n] : M.qty(sel); });
            A.applyInventory(w.itId, counts, false); return go(2);
          }
          case "mvw-rm-next": A.applyRemoval(w.itId, [], "none"); return go(3);
          case "mvw-rm-yes": A.applyRemoval(w.itId, rowsAll(), "all"); return go(3);
          case "mvw-rm-no": A.applyRemoval(w.itId, rowsAll(), "none"); return go(3);
          case "mvw-rm-reset": w.rmd = {}; return this.mRefresh();
          case "mvw-rm-ok": {
            const list = (w.rows || []).map(r => {
              const v = this.rmDraft(r);
              return { sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: v, keep: !r.mandatory && v === 0 };
            });
            A.applyRemoval(w.itId, list, "edit"); return go(3);
          }
          case "mvw-ld-full":
            m.sels.forEach(sel => { const L = w.lines && w.lines[sel.n]; if (!L || !L.length) return; L[0].qty = Math.max(0, sel.cap - M.qty(sel) - L.slice(1).reduce((a, x) => a + (Number(x.qty) || 0), 0)); });
            return this.mRefresh(b.id);
          case "mvw-ld-ok": return this.doLoad();
          case "mvw-back": { const to = w.step - 1; A.undoToStep(w.itId, to); w.lines = null; w.inv = null; w.rmd = null; return go(to); }
        }
      };
    },

    bind() {
      const w = this.w, q = id => document.getElementById(id);
      const go = (step) => { w.step = step; w.mode = "view"; w.error = ""; this.render(); };
      // v5.19 : « Annuler » demande une confirmation pendant 4 s. Avant, le délai redessinait toute la fenêtre
      // (les chiffres tapés pas encore validés étaient effacés) et un délai d'un « Remplir » précédent pouvait
      // désarmer le suivant (le 2e clic n'annulait pas). Maintenant : seul le texte du bouton change, et le délai
      // ne concerne que cette fenêtre.
      const c = q("wz-cancel");
      if (c) c.onclick = () => {
        if (!w.cancelArmed) {
          w.cancelArmed = true; c.textContent = "⚠️ " + t("btn_cancel_confirm");
          clearTimeout(w.cancelTimer);
          w.cancelTimer = setTimeout(() => {
            if (this.w !== w || !w.cancelArmed) return;
            w.cancelArmed = false;
            const b = q("wz-cancel"); if (b) b.textContent = "✖ " + t("btn_cancel");
          }, 4000);
          return;
        }
        clearTimeout(w.cancelTimer);
        BA.Actions.cancelIntervention(w.itId); this.close();
      };
      if (q("wz-close")) q("wz-close").onclick = () => this.close();

      // retour arrière (annule l'étape déjà validée)
      const back = (to) => { BA.Actions.undoToStep(w.itId, to); w.lines = null; w.inv = null; w.rmd = null; go(to); };
      if (q("wz-back")) q("wz-back").onclick = () => back(w.step - 1);
      if (q("inv-back")) q("inv-back").onclick = () => { w.mode = "view"; w.error = ""; this.render(); };
      if (q("rm-back")) q("rm-back").onclick = () => { w.mode = "view"; w.error = ""; this.render(); };

      // étape 1
      if (q("inv-yes")) q("inv-yes").onclick = () => { BA.Actions.applyInventory(w.itId, {}, false); go(2); };
      if (q("inv-skip")) q("inv-skip").onclick = () => { BA.Actions.applyInventory(w.itId, {}, true); go(2); };
      if (q("inv-edit")) q("inv-edit").onclick = () => { w.mode = "edit"; this.render(); const f = document.querySelector(".modal input[type=number]"); if (f) f.focus(); };
      if (q("inv-validate")) q("inv-validate").onclick = () => {
        const counts = {}; let bad = false;
        document.querySelectorAll(".modal [id^=inv-][data-sel]").forEach(i => {
          const v = Number(i.value), max = Number(i.max);
          if (!(v >= 0) || v > max || i.value === "") bad = true;
          counts[i.dataset.sel] = v;
        });
        if (bad) { w.error = t("err_inv"); this.render(); return; }
        BA.Actions.applyInventory(w.itId, counts, false); go(2);
      };

      // étape 2
      if (q("rm-next")) q("rm-next").onclick = () => { BA.Actions.applyRemoval(w.itId, [], "none"); go(3); };
      const rows = () => (w.rows || []).map(r => ({ sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: r.qty, keep: false }));
      if (q("rm-yes")) q("rm-yes").onclick = () => { BA.Actions.applyRemoval(w.itId, rows(), "all"); go(3); };
      if (q("rm-no")) q("rm-no").onclick = () => { BA.Actions.applyRemoval(w.itId, rows(), "none"); go(3); };
      if (q("rm-edit")) q("rm-edit").onclick = () => { w.mode = "edit"; this.render(); };
      document.querySelectorAll(".modal [id^=keep-]").forEach(cb => cb.onchange = () => {
        const inp = q("rm-" + cb.dataset.i);
        if (cb.checked) inp.value = 0;
      });
      if (q("rm-validate")) q("rm-validate").onclick = () => {
        let bad = false;
        const list = (w.rows || []).map((r, i) => {
          if (r.mandatory) return { sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: r.qty, keep: false };
          const inp = q("rm-" + i), v = Number(inp.value);
          if (!(v >= 0) || v > r.qty || inp.value === "") bad = true;
          return { sel: r.sel, lotId: r.lotId, date: r.date, planned: r.qty, removed: v, keep: q("keep-" + i).checked };
        });
        if (bad) { w.error = t("err_rm"); this.render(); return; }
        BA.Actions.applyRemoval(w.itId, list, "edit"); go(3);
      };

      // étape 3
      const readLines = () => {
        document.querySelectorAll(".modal [id^=ld-][data-sel]").forEach(i => {
          const L = w.lines[i.dataset.sel]; if (L && L[i.dataset.i]) L[i.dataset.i].qty = i.value === "" ? "" : Number(i.value);
        });
        document.querySelectorAll(".modal [id^=ldd-][data-sel]").forEach(i => {
          const L = w.lines[i.dataset.sel], v = F.fromInput(i.value); if (L && L[i.dataset.i] && v) L[i.dataset.i].date = v;
        });
      };
      // v5.19 : le « Total à charger » suit ce que l'opérateur tape (ou les boutons − / +) ;
      // avant, il restait au chiffre du premier affichage (0) jusqu'à la validation.
      const total = q("ld-total");
      if (total) document.querySelectorAll(".modal [id^=ld-][data-sel]").forEach(i => i.addEventListener("input", () => {
        readLines();
        const n = Object.keys(w.lines).reduce((a, k) => a + w.lines[k].reduce((b, x) => b + (Number(x.qty) || 0), 0), 0);
        total.textContent = t("step3_total", { n });
      }));
      // date pour toutes les lignes : on met à jour les cases sans redessiner la fenêtre
      // (un clic sur « Valider » juste après avoir tapé la date n'est donc pas perdu)
      if (q("ld-date")) U.dateInput(q("ld-date"), val => {
        const v = F.fromInput(val); if (!v) return;
        readLines(); w.delivery = v;
        Object.keys(w.lines).forEach(k => w.lines[k].forEach(x => { x.date = v; }));
        document.querySelectorAll(".modal [id^=ldd-][data-sel]").forEach(i => { i.value = F.toInput(v); i.defaultValue = i.value; });
      });
      document.querySelectorAll(".modal .ld-add").forEach(b => b.onclick = () => {
        readLines();
        const sel = M.sel(M.machine(BA.Store.get(), w.num), Number(b.dataset.sel)), L = w.lines[b.dataset.sel];
        const need = sel.cap - M.qty(sel), sum = L.reduce((a, x) => a + (Number(x.qty) || 0), 0);
        let qty = 1;
        if (sum + 1 > need) {                       // plus de place : on prend 1 pain sur la plus grande ligne
          const big = L.reduce((a, x) => (x.qty > a.qty ? x : a), L[0]);
          if (big && big.qty > 1) big.qty -= 1; else qty = 0;
        }
        L.push({ qty, date: w.delivery });
        this.render();
      });
      document.querySelectorAll(".modal .ld-del").forEach(b => b.onclick = () => {
        readLines(); w.lines[b.dataset.sel].splice(Number(b.dataset.i), 1); this.render();
      });
      if (q("ld-validate")) q("ld-validate").onclick = () => { readLines(); this.doLoad(); };
    }
  };
  BA.Wizard = Wizard;

  // ================= v5.10 : confort sur téléphone =================
  // • tableaux → cartes (une ligne = une carte, chaque valeur avec son titre) — CSS pour les écrans étroits ;
  // • boutons − / + autour des nombres de l'assistant « Remplir » (plus besoin de taper au clavier) ;
  // • longues explications repliées derrière « ℹ️ Aide » (téléphone).
  // Rien ne change dans les données : seulement l'affichage.
  const Confort = {
    raf: 0,
    init() {
      const mo = new MutationObserver(() => { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.apply()); });
      ["app-main", "modal-root"].forEach(id => { const n = document.getElementById(id); if (n) mo.observe(n, { childList: true, subtree: true }); });
    },
    apply() {
      document.querySelectorAll("#app-main table:not([data-cartes])").forEach(tb => {
        tb.setAttribute("data-cartes", "1");
        if (tb.querySelector("td[rowspan], th[colspan], td[colspan]")) return;          // tableau trop compliqué : on le garde
        const ths = Array.from(tb.querySelectorAll("thead th")).map(th => th.textContent.trim());
        if (!ths.length) return;
        tb.classList.add("tbl-cartes");
        tb.querySelectorAll("tbody tr").forEach(tr => Array.from(tr.children).forEach((td, i) => { if (!td.hasAttribute("data-label")) td.setAttribute("data-label", ths[i] || ""); }));
      });
      document.querySelectorAll("#modal-root .modal input[type=number]:not([data-pm])").forEach(inp => {
        inp.setAttribute("data-pm", "1");
        const box = document.createElement("span"); box.className = "pm";
        inp.parentNode.insertBefore(box, inp);
        const bouton = (txt, d) => {
          const b = document.createElement("button"); b.type = "button"; b.className = "pm-b"; b.textContent = txt;
          b.setAttribute("aria-label", d > 0 ? "+1" : "−1"); b.disabled = inp.disabled || inp.readOnly;
          b.onclick = () => {
            const min = inp.min === "" ? -Infinity : Number(inp.min), max = inp.max === "" ? Infinity : Number(inp.max);
            inp.value = String(Math.min(max, Math.max(min, (Number(inp.value) || 0) + d)));
            inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
          };
          return b;
        };
        box.appendChild(bouton("−", -1)); box.appendChild(inp); box.appendChild(bouton("+", 1));
      });
      if (!window.matchMedia || !window.matchMedia("(max-width: 700px)").matches) return;
      document.querySelectorAll("#app-main p.note:not([data-aide])").forEach(p => {
        p.setAttribute("data-aide", "1");
        if (p.textContent.trim().length < 160 || p.closest("details, .modal")) return;
        const d = document.createElement("details"); d.className = "op-aide";
        d.innerHTML = `<summary>ℹ️ ${E(t("op_help"))}</summary>`;
        p.parentNode.insertBefore(d, p); d.appendChild(p);
      });
    }
  };
  Confort.init();
  BA.Confort = Confort;

  // ================= Démarrage =================
  BA.Boot.start({
    role: "op",
    admin: false,
    // v5.10 : 4 onglets seulement (À faire, Remplir, Alertes, Plus) ; les autres pages s'ouvrent depuis « Plus »
    views: [
      { id: "todo",      icon: "📋", label: "op_nav_todo",   render: el => renderMissions(el, { todo: true }), live: true },
      { id: "fill",      icon: "🧺", label: "op_nav_fill",   render: renderFill,        live: true },
      { id: "alerts",    icon: "⚠️", label: "op_nav_alerts", render: U.renderAlerts,    live: true },
      { id: "more",      icon: "☰",  label: "op_nav_more",   render: renderMore,        live: false },
      { id: "details",   icon: "📊", label: "nav_details",   render: sousPage(U.renderDetails),   live: true, hidden: true, parent: "more" },
      { id: "products",  icon: "🍞", label: "nav_products",  render: sousPage(renderProducts),    live: true, hidden: true, parent: "more" },
      { id: "history",   icon: "🧾", label: "nav_history",   render: sousPage(BA.History.render), live: false, tick: BA.History.tick, hidden: true, parent: "more" },
      { id: "rs232",     icon: "🔌", label: "nav_rs232",     render: sousPage(el => BA.Rs232.renderOp(el)), live: true, hidden: true, parent: "more" },
      { id: "dashboard", icon: "🌍", label: "nav_dashboard", render: U.renderDashboard, live: true, hidden: true, parent: "todo" },
      { id: "missions",  icon: "🧾", label: "nav_missions",  render: renderMissions,    live: true, hidden: true, parent: "todo" }
    ],
    footer() {
      return `<span id="sim-clock" class="sim-clock"></span><span id="version">${BA_CONFIG.app.name} v${BA_CONFIG.app.version} — ${t("role_op")}</span>`;
    },
    refreshFooter(s) {
      const c = document.getElementById("sim-clock");
      if (c) c.textContent = "🕒 " + F.dayLong(s.now) + " " + F.time(s.now);
    }
  });
})();
