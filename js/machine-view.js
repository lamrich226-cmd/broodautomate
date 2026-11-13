// ============================================================
// BROODAUTOMATE v5.24 (design-test) — Vue machine : étages, tiroirs, et pour CHAQUE pain ses heures et sa date de livraison.
// v2 : places libres « Non utilisé » (les toucher = ajouter une sélection), prix sur chaque tiroir, panneau pour
// modifier la sélection (pain, capacité, prix, suppression), et briques utilisées par « Remplir » (inventaire,
// retrait, chargement en touchant les tiroirs).
// Rien n'est calculé autrement qu'avant : les changements passent par les mêmes actions (BA.Actions.*, fenêtre
// « Retirer » de BA.UI) et avec les mêmes valeurs que le tableau.
// Étage = dizaine du numéro de sélection (11, 15, 19 → étage 1).
// ============================================================
window.BA = window.BA || {};
(function () {
  const M = BA.Model, U = BA.UI, E = U.E, F = U.F, H = M.H;
  const t = (k, v) => BA.I18n.t(k, v);
  const st = () => BA.Shell.state;
  const pad = n => String(n).padStart(2, "0");
  const dd = ms => { const d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  const hrs = (s, ms) => Math.max(0, Math.floor((s.now - ms) / H));
  const MAXSLOTS = 4;     // jusqu'à 4 pains par tiroir : un dessin par pain ; au-delà : une barre et une puce par livraison
  const isWide = () => !!(window.matchMedia && window.matchMedia("(min-width: 900px)").matches);

  // ---------------- Plan de la machine ----------------
  // Positions habituelles des tiroirs sur un étage de n tiroirs (FAS : 1-5-9, 1-4-6-9…)
  function pattern(n) {
    n = Math.max(1, Math.min(9, n));
    if (n === 1) return [5];
    const out = [];
    for (let i = 0; i < n; i++) { const p = Math.round(1 + i * 8 / (n - 1)); if (!out.includes(p)) out.push(p); }
    for (let p = 1; out.length < n && p <= 9; p++) if (!out.includes(p)) out.push(p);
    return out.sort((a, b) => a - b);
  }

  // Étages × tiroirs. Avec « free » : au moins 6 étages et autant de cases par étage que l'étage le plus rempli
  // (3 au minimum) ; une case sans sélection est une place libre « Non utilisé », avec un numéro proposé
  // (les positions déjà utilisées sur les autres étages d'abord).
  function layout(m, free) {
    const by = {}, freq = {};
    m.sels.forEach(sel => {
      const e = Math.floor(sel.n / 10); (by[e] = by[e] || []).push(sel);
      const p = sel.n % 10; freq[p] = (freq[p] || 0) + 1;
    });
    const keys = new Set(Object.keys(by).map(Number));
    const cols = Math.max(3, ...Object.keys(by).map(k => by[k].length));
    if (free) for (let e = 1; e <= 6; e++) keys.add(e);
    const pref = Object.keys(freq).map(Number).sort((a, b) => freq[b] - freq[a] || a - b);
    const rows = [...keys].sort((a, b) => a - b).map(e => {
      const sels = (by[e] || []).slice().sort((a, b) => a.n - b.n);
      const cells = sels.map(sel => ({ sel, n: sel.n, key: String(sel.n) }));
      const want = free ? cols - sels.length : 0;
      if (want > 0) {
        const used = new Set(sels.map(x => x.n)), cand = [];
        const tryP = p => { const n = e * 10 + p; if (n >= 1 && n <= 999 && !used.has(n) && !cand.includes(n)) cand.push(n); };
        pref.forEach(tryP); pattern(cols).forEach(tryP);
        for (let p = 0; p <= 9; p++) tryP(p);
        cand.slice(0, want).forEach(n => cells.push({ free: true, n, key: "f" + n }));
        cells.sort((a, b) => a.n - b.n);
      }
      return { e, cells };
    });
    return { rows, cols };
  }

  // ---------------- Pains ----------------
  // Pains d'une sélection, du plus ancien au plus récent : { lot, k, h (heures depuis la livraison), d (jj/mm) }
  // k : ok | old (à retirer) | must (gardé une fois, devenu invalide) | kept (gardé une fois)
  function breads(s, m, sel) {
    const mission = M.openMission(s, m.num);
    const lots = sel.lots.slice().sort((a, b) => a.date - b.date || a.id - b.id);
    const out = [];
    lots.forEach(l => {
      const must = !!l.kept && M.isMandatory(s, l), kept = !!l.kept && !must, old = !l.kept && M.mustRemove(s, l, mission);
      const k = must ? "must" : old ? "old" : kept ? "kept" : "ok";
      for (let i = 0; i < l.qty; i++) out.push({ lot: l, k, h: hrs(s, l.date), d: dd(l.date) });
    });
    return out;
  }

  // Ce que montre chaque tiroir selon l'étape (même règle que les actions) :
  const items = {
    view: (s, m, sel) => breads(s, m, sel),
    // inventaire : compté en moins → les plus anciens sortent (M.takeOldest) ; en plus → ajoutés à la dernière livraison
    inv(s, m, sel, c) {
      const B = breads(s, m, sel), exp = B.length;
      if (c == null || c === exp) return B;
      if (c < exp) return B.map((b, i) => (i < exp - c ? Object.assign({}, b, { k: "miss" }) : b));
      const last = exp ? B[exp - 1].lot : null, date = last ? last.date : s.now;
      return B.concat(Array.from({ length: c - exp }, () => ({ k: "extra", h: hrs(s, date), d: dd(date) })));
    },
    // retrait : dans chaque lot à retirer, les « remOf » premiers pains sortent, les autres restent (gardés une fois)
    rm(s, m, sel, rows, remOf) {
      const seen = {};
      return breads(s, m, sel).map(b => {
        const r = rows.find(x => x.sel === sel.n && x.lotId === b.lot.id);
        if (!r) return b;
        const i = seen[b.lot.id] = (seen[b.lot.id] || 0) + 1;
        return Object.assign({}, b, { k: i <= remOf(r) ? (r.mandatory ? "gonemust" : "gone") : "keep" });
      });
    },
    // chargement : les nouveaux pains se mettent derrière les anciens
    load(s, m, sel, lines) {
      const B = breads(s, m, sel);
      (lines || []).forEach(x => {
        const q = Math.max(0, Math.round(Number(x.qty) || 0)), date = isFinite(x.date) ? x.date : s.now;
        for (let i = 0; i < q; i++) B.push({ k: "new", h: hrs(s, date), d: dd(date) });
      });
      return B;
    }
  };

  // Ligne d'état en bas du tiroir (toujours un texte : la couleur ne parle jamais seule)
  const status = {
    view(sel, list) {
      const q = list.length, n = k => list.filter(b => b.k === k).length;
      if (!q) return { k: "empty", txt: "✖ " + t("mv_empty") };
      if (n("must")) return { k: "must", txt: "⛔ " + t("mv_must", { n: n("must") }) };
      if (n("old")) return { k: "old", txt: "⚠ " + t("mv_remove", { n: n("old") }) };
      if (n("kept")) return { k: "kept", txt: "⏳ " + t("mv_kept", { n: n("kept") }) };
      return { k: "ok", txt: "✔ " + q + "/" + sel.cap };
    },
    inv(sel, list, exp, c) {
      if (c == null || c === exp) return status.view(sel, list);
      return { k: "edit", txt: "✏ " + exp + " → " + c };
    },
    rm(sel, list) {
      const g = list.filter(b => b.k === "gone" || b.k === "gonemust").length, must = list.filter(b => b.k === "gonemust").length;
      const kp = list.filter(b => b.k === "keep").length;
      if (g) return { k: must ? "must" : "old", txt: "✖ " + t("mv_remove", { n: g }) + (kp ? " · ⏳ " + kp : "") };
      if (kp) return { k: "kept", txt: "⏳ " + t("mv_kept", { n: kp }) };
      return status.view(sel, list);
    },
    load(sel, list) {
      const add = list.filter(b => b.k === "new").length, q = list.length - add;
      if (add) return { k: "new", txt: "＋ " + add + (q + add >= sel.cap ? " · " + t("mv_full") : "") };
      if (q >= sel.cap) return { k: "ok", txt: "✔ " + t("mv_full") };
      return q ? { k: "ok", txt: "✔ " + q + "/" + sel.cap } : { k: "empty", txt: "✖ " + t("mv_empty") };
    }
  };

  // ---------------- Dessin ----------------
  function slots(sel, list) {
    if (sel.cap <= MAXSLOTS) {
      return `<span class="mv-slots" style="--n:${sel.cap}">${Array.from({ length: sel.cap }, (_, i) => {
        const b = list[i];
        if (!b) return `<span class="mv-sw"><span class="mv-loaf"></span><span class="mv-h"></span><span class="mv-d"></span></span>`;
        return `<span class="mv-sw"><span class="mv-loaf f ty-${E(sel.type)} k-${b.k}"></span><span class="mv-h k-${b.k}">${b.k === "new" ? "＋" : t("mv_ago", { h: b.h })}</span><span class="mv-d">${b.d}</span></span>`;
      }).join("")}</span>`;
    }
    const groups = [];
    list.forEach(b => { const g = groups.find(x => x.k === b.k && x.d === b.d && x.h === b.h); if (g) g.q++; else groups.push({ k: b.k, d: b.d, h: b.h, q: 1 }); });
    const inside = list.filter(b => !/^(gone|gonemust|miss)$/.test(b.k)).length;
    return `<span class="mv-bar"><span style="width:${Math.min(100, Math.round(inside / sel.cap * 100))}%"></span></span>
      <span class="mv-chips">${groups.map(g => `<span class="mv-chip k-${g.k}">${g.k === "new" ? "＋" : ""}${t("mv_n", { n: g.q })}${g.k === "new" ? "" : " · " + t("mv_ago", { h: g.h })} · ${g.d}</span>`).join("")}</span>`;
  }

  function tile(m, sel, list, stt, o) {
    const tag = o.ro ? "div" : "button";
    return `<${tag}${o.ro ? "" : ` type="button" data-mv-sel="${sel.n}" id="mvt-${m.num}-${sel.n}" aria-pressed="${!!o.on}"`} class="mv-d-box st-${stt.k}${o.on ? " sel" : ""}${o.ro ? " ro" : ""}">
      <span class="mv-top"><span class="mv-nm"><b>${sel.n}</b><span class="mv-ty">${U.prod(sel.type)}</span></span><span class="mv-pr">${F.eur(sel.price)}</span></span>
      ${slots(sel, list)}
      <span class="mv-st ${stt.k}">${stt.txt}</span></${tag}>`;
  }

  function freeTile(m, n, o) {
    const tag = o.ro ? "div" : "button";
    return `<${tag}${o.ro ? "" : ` type="button" data-mv-free="${n}" id="mvf-${m.num}-${n}" aria-pressed="${!!o.on}"`} class="mv-d-box mv-free${o.on ? " sel" : ""}${o.ro ? " ro" : ""}">
      <span class="mv-top"><span class="mv-nm"><b>${n}</b><span class="mv-ty">${t("mv_unused")}</span></span></span>
      <span class="mv-plus" aria-hidden="true">${o.ro ? "" : "＋"}</span>
      <span class="mv-st">${o.ro ? "" : t("mv_add_short")}</span></${tag}>`;
  }

  // o : { list(sel) → pains, stat(sel, pains) → { k, txt }, key : case choisie (« 13 » ou « f61 »),
  //       free : montrer les places libres, freeClick : places libres cliquables, ro : lecture seule,
  //       panel : panneau à glisser sous l'étage de la case choisie (téléphone), compact : version Dashboard }
  function grid(s, m, o) {
    o = o || {};
    if (o.compact) return compact(s, m);
    const L = layout(m, o.free !== false);
    const list = o.list || (sel => items.view(s, m, sel)), stat = o.stat || ((sel, l) => status.view(sel, l));
    return `<div class="mv-grid" style="--cols:${L.cols}">${L.rows.map((r, i) => {
      const row = `<div class="mv-etage${i === L.rows.length - 1 ? " last" : ""}"><div class="mv-lvl" title="${E(t("mv_floor", { n: r.e }))}">${r.e}</div>${r.cells.map(c => {
        if (c.free) return freeTile(m, c.n, { on: o.key === c.key, ro: o.ro || !o.freeClick });
        const l = list(c.sel);
        return tile(m, c.sel, l, stat(c.sel, l), { on: o.key === c.key, ro: o.ro });
      }).join("")}</div>`;
      return row + (o.panel && r.cells.some(c => c.key === o.key) ? `<div class="mv-inline">${o.panel}</div>` : "");
    }).join("")}</div>`;
  }

  // Version réduite (cartes du Dashboard) : une case par tiroir, couleur du pain, contour selon l'état
  function compact(s, m) {
    const L = layout(m, true);
    return `<div class="mv-compact" aria-hidden="true">${L.rows.map(r => `<div class="mv-crow">${r.cells.map(c => c.free
      ? `<span class="mv-c st-free"></span>`
      : `<span class="mv-c st-${status.view(c.sel, breads(s, m, c.sel)).k} ty-${E(c.sel.type)}"></span>`).join("")}</div>`).join("")}</div>`;
  }

  function legend(s, mode) {
    const it = (cls, txt) => `<span class="mv-lg"><i class="mv-loaf ${cls}"></i>${txt}</span>`;
    const free = `<span class="mv-lg"><i class="mv-lg-free"></i>${t("mv_unused")}</span>`;
    const L = {
      view: [it("f k-old", t("mv_legend_old", { h: s.settings.thrHours })), it("f k-kept", t("mv_lg_kept")), it("", t("mv_legend_empty")), free],
      inv: [it("f k-miss", t("mv_lg_miss")), it("f k-extra", t("mv_lg_extra")), it("", t("mv_legend_empty"))],
      rm: [it("f k-gone", t("mv_lg_gone")), it("f k-keep", t("mv_lg_keep")), it("f k-gonemust", t("mv_lg_must"))],
      load: [it("f k-new", t("mv_lg_new")), it("", t("mv_legend_empty"))]
    }[mode || "view"];
    return `<div class="mv-legend">${L.join("")}</div>`;
  }

  // ---------------- Détail machine / Produits : panneau du tiroir choisi ----------------
  function typeOpts(s, cur) {
    return M.types(s).map(ty => `<option value="${E(ty)}"${ty === cur ? " selected" : ""}>${U.prod(ty)}</option>`).join("")
      + `<option value="__new"${cur === "__new" ? " selected" : ""}>➕ ${t("new_type")}</option>`;
  }
  function msgHtml(num) {
    const g = st().mvMsg;
    return g && g.num === num ? `<div class="alert ${g.kind === "ok" ? "info" : "err"}">${g.kind === "ok" ? "✅" : "⚠️"} ${E(g.text)}</div>` : "";
  }
  function say(num, err, okKey, vars) {
    const S = st();
    S.mvMsg = err ? { num, kind: "err", text: t(err) } : okKey ? { num, kind: "ok", text: t(okKey, vars) } : null;
    clearTimeout(S.mvMsgT);
    S.mvMsgT = setTimeout(() => { S.mvMsg = null; }, 6000);
  }
  // prix proposé pour une nouvelle sélection : celui du même pain dans cette machine, sinon le prix par défaut
  const priceFor = (s, m, ty) => { const x = m.sels.find(z => z.type === ty); return Number(x ? x.price : s.settings.salePrice) || 0; };

  function panelSel(s, m, sel) {
    const S = st(), mission = M.openMission(s, m.num), q = M.qty(sel);
    let ed = S.mvEdit;
    if (!ed || ed.num !== m.num || ed.n !== sel.n || !ed.dirty) {
      ed = S.mvEdit = { num: m.num, n: sel.n, type: sel.type, newType: "", cap: String(sel.cap), price: Number(sel.price || 0).toFixed(2), dirty: false };
    }
    const lots = sel.lots.slice().sort((a, b) => a.date - b.date || a.id - b.id).map(l => {
      const must = !!l.kept && M.isMandatory(s, l), kept = !!l.kept && !must, old = !l.kept && M.mustRemove(s, l, mission);
      const tag = must ? `⛔ ${t("mv_lot_must")}` : old ? `⚠ ${t("mv_lot_old")}` : kept ? `⏳ ${t("mv_lot_kept")}` : "";
      return `<div class="mv-lotline"><span>${t("mv_lot", { d: dd(l.date) })} · <b class="${old || must ? "old" : ""}">${t("mv_ago", { h: hrs(s, l.date) })}</b>${tag ? " · " + tag : ""}${l.estimated ? ` <span class="petit">${t("estimated")}</span>` : ""}</span>
        <span class="mv-lq">${t("mv_n", { n: l.qty })}
          ${old ? `<button type="button" class="btn petit secondary" data-mv-keep="${sel.n}" data-lot="${l.id}" title="${E(t("btn_keep_tip"))}">${t("btn_keep")}</button>` : ""}
          <button type="button" class="btn petit ${old || must ? "" : "secondary"}" data-mv-rm="${sel.n}" data-lot="${l.id}" title="${E(t("btn_rm_tip"))}">➖ ${t("btn_withdraw")}</button></span></div>`;
    }).join("");
    const id = k => `mvx-${k}-${m.num}`;
    return `<div class="mv-panel">${msgHtml(m.num)}
      <div class="mv-ph"><h4>${t("mv_sel", { n: sel.n })} · ${U.prod(sel.type)}</h4><b class="mv-price-big">${F.eur(sel.price)}</b></div>
      <div class="mv-kv"><span>${t("mv_inside")}</span><b>${q} / ${sel.cap}</b></div>
      ${lots || `<div class="petit">${t("mv_empty")}</div>`}
      <div class="mv-form">
        <div class="mv-form-t">✏ ${t("mv_edit_title")}</div>
        <label for="${id("type")}">${t("col_type")}</label><select id="${id("type")}" data-mvx="type">${typeOpts(s, ed.type)}</select>
        ${ed.type === "__new" ? `<label for="${id("newtype")}">${t("new_type_name")}</label><input id="${id("newtype")}" data-mvx="newType" type="text" maxlength="40" placeholder="${E(t("new_type_ph"))}" value="${E(ed.newType)}">` : ""}
        <label for="${id("cap")}">${t("col_cap")}</label><input id="${id("cap")}" data-mvx="cap" type="number" min="1" max="50" inputmode="numeric" value="${E(ed.cap)}">
        <label for="${id("price")}">${t("mv_price_eur")}</label><input id="${id("price")}" data-mvx="price" type="number" min="0" step="0.1" inputmode="decimal" value="${E(ed.price)}">
        <div class="mv-btns"><button type="button" class="btn" data-mvx-save="${sel.n}">✔ ${t("mv_save")}</button>
          ${m.sels.length > 1 ? `<button type="button" class="btn secondary" data-mvx-del="${sel.n}">🗑 ${t("btn_del_sel")}</button>` : ""}</div>
        <p class="petit">${t("mv_price_note")}</p>
      </div></div>`;
  }

  function panelFree(s, m, slot) {
    const S = st();
    let f = S.mvAdd;
    if (!f || f.num !== m.num || f.slot !== slot) {
      const count = k => { const c = {}; m.sels.forEach(x => { c[x[k]] = (c[x[k]] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
      f = S.mvAdd = { num: m.num, slot, n: String(slot), type: count("type") || M.types(s)[0], newType: "", cap: count("cap") || "3", price: "", priceSet: false };
    }
    const price = f.priceSet ? f.price : priceFor(s, m, f.type).toFixed(2);
    const id = k => `mva-${k}-${m.num}`;
    return `<div class="mv-panel mv-panel-add">${msgHtml(m.num)}
      <h4>➕ ${t("mv_add_title", { n: E(f.n || slot) })}</h4>
      <p class="petit">${t("mv_add_help")}</p>
      <div class="mv-form">
        <label for="${id("n")}">${t("col_sel")}</label><input id="${id("n")}" data-mva="n" type="number" min="1" max="999" inputmode="numeric" value="${E(f.n)}">
        <label for="${id("type")}">${t("col_type")}</label><select id="${id("type")}" data-mva="type">${typeOpts(s, f.type)}</select>
        ${f.type === "__new" ? `<label for="${id("newtype")}">${t("new_type_name")}</label><input id="${id("newtype")}" data-mva="newType" type="text" maxlength="40" placeholder="${E(t("new_type_ph"))}" value="${E(f.newType)}">` : ""}
        <label for="${id("cap")}">${t("col_cap")}</label><input id="${id("cap")}" data-mva="cap" type="number" min="1" max="50" inputmode="numeric" value="${E(f.cap)}">
        <label for="${id("price")}">${t("mv_price_eur")}</label><input id="${id("price")}" data-mva="price" type="number" min="0" step="0.1" inputmode="decimal" value="${E(price)}">
        <div class="mv-btns"><button type="button" class="btn" data-mva-go="1">➕ ${t("btn_add_sel")}</button></div>
        <p class="petit">${t("mv_price_note")}</p>
      </div></div>`;
  }

  function area(s, m) {
    const S = st(), L = layout(m, true), cells = L.rows.flatMap(r => r.cells);
    let key = S.mvSel && S.mvSel.num === m.num ? S.mvSel.key : null;
    if (key != null && !cells.some(c => c.key === key)) key = null;     // tiroir supprimé, place prise…
    if (key == null) {     // par défaut : le premier tiroir avec un pain à retirer, sinon le premier tiroir
      const bad = cells.find(c => !c.free && breads(s, m, c.sel).some(b => b.k === "old" || b.k === "must"));
      key = (bad || cells.find(c => !c.free) || cells[0] || {}).key || null;
    }
    const cell = cells.find(c => c.key === key);
    const panel = !cell ? `<div class="mv-panel petit">${t("mv_pick")}</div>` : cell.free ? panelFree(s, m, cell.n) : panelSel(s, m, cell.sel);
    const wide = isWide();
    const g = grid(s, m, { key, free: true, freeClick: true, panel: wide ? "" : panel });
    return `<div class="mv-cols"><div class="mv-machine"><div class="mv-glass">${g}</div>${legend(s, "view")}</div>${wide ? `<div class="mv-side">${panel}</div>` : ""}</div>`;
  }

  // Bloc complet (Détail machine, Produits / Stock)
  function block(s, m, o) {
    o = o || {};
    return `<div class="mv-wrap" data-mv-num="${m.num}">
      ${o.title === false ? "" : `<h3>🧩 ${t("mv_title")}</h3>`}<p class="note">${t("mv_note")}</p>
      <div class="mv-area">${area(s, m)}</div></div>`;
  }

  function bind(el, m0) {
    const wrap = el.querySelector(`.mv-wrap[data-mv-num="${m0.num}"]`);
    if (!wrap) return;
    const num = m0.num, S = st(), A = BA.Actions;
    const cur = () => { const s = BA.Store.get(); return { s, m: M.machine(s, num) }; };
    const redraw = focusId => {
      const { s, m } = cur(); if (!m || !document.body.contains(wrap)) return;
      wrap.querySelector(".mv-area").innerHTML = area(s, m);
      bindInputs();
      if (focusId) { const n = document.getElementById(focusId); if (n) n.focus({ preventScroll: true }); }
    };
    const later = () => U.afterClick(() => redraw());
    function bindInputs() {
      wrap.querySelectorAll("[data-mvx]").forEach(i => {
        const f = () => { const e = S.mvEdit; if (!e || e.num !== num) return; e[i.dataset.mvx] = i.value; e.dirty = true; };
        i.addEventListener("input", f);
        if (i.tagName === "SELECT") i.addEventListener("change", () => { f(); redraw(i.value === "__new" ? `mvx-newtype-${num}` : i.id); });
      });
      wrap.querySelectorAll("[data-mva]").forEach(i => {
        const f = () => { const a = S.mvAdd; if (!a || a.num !== num) return; a[i.dataset.mva] = i.value; if (i.dataset.mva === "price") a.priceSet = true; };
        i.addEventListener("input", f);
        if (i.tagName === "SELECT") i.addEventListener("change", () => { f(); redraw(i.value === "__new" ? `mva-newtype-${num}` : i.id); });
      });
    }
    bindInputs();

    // Enregistrer : mêmes contrôles et mêmes messages que le tableau Produits / Stock
    function save(n) {
      const { m } = cur(), sel = m && M.sel(m, n), e = S.mvEdit;
      if (!sel || !e || e.num !== num || e.n !== n) return;
      let err = null, other = false, p = null;
      if (e.type === "__new") { const v = String(e.newType || "").trim(); err = v ? A.updateSelection(num, n, { newType: v }) : "err_type"; other = true; }
      else if (e.type && e.type !== sel.type) { err = A.updateSelection(num, n, { type: e.type }); other = true; }
      if (!err && Number(e.cap) !== sel.cap) { err = A.updateSelection(num, n, { cap: Number(e.cap) }); other = true; }
      if (!err) {
        const v = Number(e.price);
        if (e.price === "" || !(v >= 0) || !isFinite(v)) err = "err_price";
        else if (Math.round(v * 100) !== Math.round(Number(sel.price) * 100)) { p = v; err = A.updateSelection(num, n, { price: v }); }
      }
      if (!err) S.mvEdit = null;
      say(num, err, p != null && !other ? "saved_price" : "saved_sel", { n, p: F.eur(p) });
      later();
    }
    // Supprimer : la même fenêtre de confirmation que le tableau (avertissement s'il reste du pain)
    function del(n) {
      const { m } = cur(), sel = m && M.sel(m, n); if (!sel) return;
      const q = M.qty(sel), type = U.prod(sel.type);
      U.confirmDialog({
        title: "🗑 " + t("del_sel_title", { n }),
        html: q > 0
          ? `<div class="alert warn">⚠️ <b>${t("del_sel_warn", { n, q, type })}</b></div><p class="note">${t("del_sel_warn_note", { q })}</p>`
          : `<p>${t("del_sel_empty", { n, type })}</p><p class="note">${t("del_undo")}</p>`,
        ok: "🗑 " + t("del_sel_ok"), danger: true,
        onOk: () => {
          const m2 = M.machine(BA.Store.get(), num), s2 = m2 && M.sel(m2, n), left = s2 ? M.qty(s2) : 0;
          const err = A.removeSelection(num, n);
          if (!err) { S.mvSel = null; S.mvEdit = null; }
          say(num, err, left > 0 ? "deleted_sel_q" : "deleted_sel", { n, q: left });
          later();
        }
      });
    }
    function add() {
      const { s, m } = cur(), f = S.mvAdd;
      if (!m || !f || f.num !== num) return;
      const price = f.priceSet ? f.price : priceFor(s, m, f.type);
      const err = A.addSelection(num, { n: f.n, type: f.type, newType: f.newType, cap: f.cap, price });
      if (!err) { S.mvSel = { num, key: String(Number(f.n)) }; S.mvAdd = null; S.mvEdit = null; }
      say(num, err, "added_sel");
      later();
    }

    wrap.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b || !wrap.contains(b) || b.disabled) return;
      const d = b.dataset;
      if (d.mvSel != null) { S.mvSel = { num, key: String(d.mvSel) }; S.mvEdit = null; redraw(b.id); return scrollPanel(wrap); }
      if (d.mvFree != null) { S.mvSel = { num, key: "f" + d.mvFree }; S.mvAdd = null; redraw(b.id); return scrollPanel(wrap); }
      if (d.mvRm != null) return U.removeDialog(num, d.mvRm, d.lot);
      if (d.mvKeep != null) return A.keepLot(num, d.mvKeep, d.lot);
      if (d.mvxSave != null) return save(Number(d.mvxSave));
      if (d.mvxDel != null) return del(Number(d.mvxDel));
      if (d.mvaGo != null) return add();
    });
  }

  // Téléphone : le panneau s'ouvre sous l'étage touché ; on le fait apparaître s'il est caché
  function scrollPanel(root) {
    if (isWide()) return;
    const p = root.querySelector(".mv-inline");
    if (p && p.scrollIntoView) p.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  BA.MachineView = { layout, breads, items, status, grid, compact, legend, block, bind, isWide, scrollPanel, dd, hrs };
})();
