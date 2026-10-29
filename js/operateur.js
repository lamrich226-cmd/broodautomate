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

  // ================= Missions (ordres de l'admin) =================
  function renderMissions(el) {
    const s = BA.Store.get();
    const open = s.missions.filter(x => x.status === "open");
    const card = (m, extra) => {
      const x = M.stats(s, m);
      return `<div class="card mission-card st-${x.st}">
        <div class="cm-top"><span class="cm-num">#${m.num}</span>${U.pill(x.st)}</div>
        <div class="cm-addr"><div>${E(m.street)}</div><div class="petit">${E(m.city)}</div></div>
        <div class="gauge"><span style="width:${x.pct}%"></span></div>
        <div class="cm-row"><span>${x.total}/${x.cap} ${t("breads")}</span><span>${x.pct} %</span></div>
        ${extra}
        <button class="btn big" data-fill="${m.num}">🧺 ${t("btn_start_fill")}</button>
      </div>`;
    };
    let html = `<h2>🧾 ${t("nav_missions")}</h2>`;
    if (open.length) {
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
      const todo = s.machines.map(m => ({ m, x: M.stats(s, m) }))
        .filter(o => ["empty", "remove", "low"].includes(o.x.st))
        .sort((a, b) => M.RANK[a.x.st] - M.RANK[b.x.st] || a.x.pct - b.x.pct);
      html += `<div class="alert info">${t("no_missions")}</div>
        <h3>💡 ${t("suggested_title")}</h3>
        ${todo.length ? `<div class="cards machines-grid">${todo.map(o => card(o.m, "")).join("")}</div>` : `<p class="note">${t("nothing_to_do")}</p>`}`;
    }
    el.innerHTML = html;
    el.querySelectorAll("[data-fill]").forEach(b => b.onclick = e => { e.stopPropagation(); Wizard.open(Number(b.dataset.fill)); });
  }

  // ================= Produits / Stock =================
  function renderProducts(el) {
    const s = BA.Store.get();
    const m = M.machine(s, st().machine) || s.machines[0];
    if (!m) { el.innerHTML = `<h2>🍞 ${t("nav_products")}</h2><div class="alert info">${t("no_machine_op")}</div>`; return; }   // v5 : flotte vide
    st().machine = m.num;
    el.innerHTML = `
      <h2>🍞 ${t("nav_products")}</h2>
      ${U.machinePicker(s, m.num, "prod-machine")}
      <div class="carte-actions"><button class="btn big" id="fill-btn">🧺 ${t("btn_fill")}</button></div>
      ${U.stockTable(s, m, false)}
      <p class="note">${t("products_op_note", { h: s.settings.thrHours })}</p>`;
    el.querySelector("#prod-machine").onchange = e => { st().machine = Number(e.target.value); renderProducts(el); };
    el.querySelector("#fill-btn").onclick = () => Wizard.open(m.num);
    U.bindStockTable(el, m.num, false, () => renderProducts(el));
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
      if (w.step === 1) body = this.step1(s, m);
      else if (w.step === 2) body = this.step2(s, m);
      else if (w.step === 3) body = this.step3(s, m);
      else body = this.summary(s, m);
      document.getElementById("modal-root").innerHTML = `
        <div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div><h2>🧺 ${t("fill_title", { n: m.num })}</h2><div class="petit">${E(m.street)}, ${E(m.city)} · 🚪 ${t("door_open_now")}</div></div>
            ${w.step <= 3 ? `<button class="danger" id="wz-cancel">${w.cancelArmed ? "⚠️ " + t("btn_cancel_confirm") : "✖ " + t("btn_cancel")}</button>` : ""}
          </div>
          ${w.step <= 3 ? this.stepper(w.step) : ""}
          ${w.error ? `<div class="alert err">${w.error}</div>` : ""}
          ${body}
        </div></div>`;
      this.bind();
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
              <td><input type="number" class="num-in big-in" id="inv-${sel.n}" data-sel="${sel.n}" min="0" max="${sel.cap}" value="${q}" ${edit ? "" : "disabled"}> <span class="petit">/ ${sel.cap}</span></td></tr>`;
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
              : `<td><input type="number" class="num-in big-in" id="rm-${i}" data-i="${i}" min="0" max="${r.qty}" value="${r.qty}"></td>
              <td><label class="case"><input type="checkbox" id="keep-${i}" data-i="${i}"> ${t("keep_label")}</label></td>`) : ""}</tr>`).join("")}</tbody></table></div>
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
    step3(s, m) {
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
      m.sels.forEach(sel => { if (!this.w.lines[sel.n]) this.w.lines[sel.n] = [{ qty: advised(sel), date: this.w.delivery }]; });
      const L = this.w.lines;
      return `
        <h3>${t("step3_title")}</h3>
        <p class="note">${t("step3_help")}</p>
        <div class="alert warn">🔁 ${t("fifo_reminder")}</div>
        ${reduced ? `<div class="alert info">📈 ${t("op_reduced_load")}</div>` : ""}
        <label class="field-row">${t("ld_date_all")} <input type="datetime-local" id="ld-date" value="${F.toInput(this.w.delivery)}"></label>
        <div class="table-scroll"><table class="wz">
          <thead><tr><th>${t("col_sel")}</th><th class="no-phone">${t("col_target")}</th><th class="no-phone">${t("col_left")}</th><th>${t("col_to_load")}</th></tr></thead>
          <tbody>${m.sels.map(sel => {
            const q = M.qty(sel), need = sel.cap - q;
            const lines = L[sel.n] || [];
            const sum = lines.reduce((a, x) => a + (Number(x.qty) || 0), 0);
            return `<tr>${selCell(sel.n, sel.type).replace("</td>", `<div class="petit only-phone">${t("col_target")} ${sel.cap} · ${t("col_left")} ${q}</div></td>`)}<td class="big-num no-phone">${sel.cap}</td><td class="big-num no-phone">${q}</td>
              <td>${lines.map((x, i) => `<div class="ld-line">
                  <input type="number" class="num-in big-in" id="ld-${sel.n}-${i}" data-sel="${sel.n}" data-i="${i}" min="0" max="${need}" value="${x.qty}"> <span class="petit">${t("ld_units")}</span>
                  <input type="datetime-local" id="ldd-${sel.n}-${i}" data-sel="${sel.n}" data-i="${i}" value="${F.toInput(x.date)}">
                  ${lines.length > 1 ? `<button class="btn petit secondary ld-del" data-sel="${sel.n}" data-i="${i}" title="${t("ld_remove_line")}">✖</button>` : ""}
                </div>`).join("")}
                <div class="petit">${t("max_n", { n: need })}${sum < need ? " · " + t("op_advised") : ""}
                  ${need > 0 ? `<button class="btn petit secondary ld-add" data-sel="${sel.n}">${t("ld_add_date")}</button>` : ""}</div></td></tr>`;
          }).join("")}</tbody></table></div>
        <p class="petit">${t("step3_total", { n: m.sels.reduce((a, sel) => a + (L[sel.n] || []).reduce((b, x) => b + (Number(x.qty) || 0), 0), 0) })}</p>
        <div class="wz-actions">${this.canBack(s, 3) ? this.backBtn("wz-back") : ""}<button class="btn big" id="ld-validate">✔ ${t("btn_validate_load")}</button></div>`;
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

    bind() {
      const w = this.w, q = id => document.getElementById(id);
      const go = (step) => { w.step = step; w.mode = "view"; w.error = ""; this.render(); };
      const c = q("wz-cancel");
      if (c) c.onclick = () => {
        if (!w.cancelArmed) { w.cancelArmed = true; this.render(); setTimeout(() => { if (this.w) { this.w.cancelArmed = false; this.render(); } }, 4000); return; }
        BA.Actions.cancelIntervention(w.itId); this.close();
      };
      if (q("wz-close")) q("wz-close").onclick = () => this.close();

      // retour arrière (annule l'étape déjà validée)
      const back = (to) => { BA.Actions.undoToStep(w.itId, to); w.lines = null; go(to); };
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
      if (q("ld-validate")) q("ld-validate").onclick = () => {
        readLines();
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
      };
    }
  };
  BA.Wizard = Wizard;

  // ================= Démarrage =================
  BA.Boot.start({
    role: "op",
    admin: false,
    views: [
      { id: "dashboard", icon: "🌍", label: "nav_dashboard", render: U.renderDashboard, live: true },
      { id: "missions",  icon: "🧾", label: "nav_missions",  render: renderMissions,    live: true },
      { id: "details",   icon: "📊", label: "nav_details",   render: U.renderDetails,   live: true },
      { id: "products",  icon: "🍞", label: "nav_products",  render: renderProducts,    live: true },
      { id: "history",   icon: "🧾", label: "nav_history",   render: BA.History.render, live: false, tick: BA.History.tick },
      { id: "alerts",    icon: "⚠️", label: "nav_alerts",    render: U.renderAlerts,    live: true },
      { id: "rs232",     icon: "🔌", label: "nav_rs232",     render: el => BA.Rs232.renderOp(el), live: true }
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
