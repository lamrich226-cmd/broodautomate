// ============================================================
// BROODAUTOMATE v5.24 (design-test) — Vue machine : étages, tiroirs, et pour CHAQUE pain ses heures et sa date de livraison.
// Affichage seulement : aucune donnée n'est changée ici. Les boutons « Retirer » appellent les boutons déjà présents
// dans le tableau des lots (même fonctionnement qu'avant).
// Étage = dizaine du numéro de sélection (11, 13, 15 → étage 1).
// ============================================================
window.BA = window.BA || {};
(function () {
  const M = BA.Model, U = BA.UI, E = U.E, H = M.H;
  const t = (k, v) => BA.I18n.t(k, v);
  const pad = n => String(n).padStart(2, "0");
  const dd = ms => { const d = new Date(ms); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  const MAXSLOTS = 4;     // jusqu'à 4 pains par tiroir : un dessin par pain ; au-delà : une puce par livraison

  function layout(m) {
    const by = {};
    m.sels.forEach(sel => { const e = Math.floor(sel.n / 10); (by[e] = by[e] || []).push(sel); });
    const keys = Object.keys(by).map(Number).sort((a, b) => a - b);
    keys.forEach(k => by[k].sort((a, b) => a.n - b.n));
    return { rows: keys.map(k => ({ e: k, sels: by[k] })), cols: Math.max(1, ...keys.map(k => by[k].length)) };
  }

  // Les pains d'une sélection, du plus ancien au plus récent
  function breads(s, m, sel) {
    const mission = M.openMission(s, m.num);
    const lots = sel.lots.slice().sort((a, b) => a.date - b.date || a.id - b.id);
    const out = [];
    lots.forEach(l => {
      const must = !!l.kept && M.isMandatory(s, l), kept = !!l.kept && !must;
      const old = !l.kept && M.mustRemove(s, l, mission);
      for (let i = 0; i < l.qty; i++) out.push({ lot: l, h: Math.max(0, Math.floor((s.now - l.date) / H)), d: dd(l.date), old, must, kept });
    });
    return out;
  }

  function status(list, cap) {
    const q = list.length;
    if (!q) return { k: "empty", txt: t("mv_empty") };
    const must = list.filter(b => b.must).length, old = list.filter(b => b.old).length, kept = list.filter(b => b.kept).length;
    if (must) return { k: "must", txt: "⛔ " + t("mv_must", { n: must }) };
    if (old) return { k: "old", txt: "⚠ " + t("mv_remove", { n: old }) };
    if (kept) return { k: "kept", txt: "⏳ " + t("mv_kept", { n: kept }) };
    return { k: "ok", txt: "✔ " + q + "/" + cap };
  }

  function drawer(s, m, sel, compact, on) {
    const list = breads(s, m, sel), st = status(list, sel.cap), q = list.length;
    const flag = b => (b.must ? " must" : b.old ? " old" : b.kept ? " kept" : "");
    if (compact) return `<span class="mv-c st-${st.k} ty-${E(sel.type)}" title="${sel.n} · ${U.prod(sel.type)} · ${q}/${sel.cap}"></span>`;
    let body;
    if (sel.cap <= MAXSLOTS) {
      body = `<div class="mv-slots" style="--n:${sel.cap}">${Array.from({ length: sel.cap }, (_, i) => {
        const b = list[i];
        return `<span class="mv-sw"><span class="mv-loaf${b ? " f ty-" + E(sel.type) + flag(b) : ""}"></span><span class="mv-h${b && (b.old || b.must) ? " old" : ""}">${b ? t("mv_ago", { h: b.h }) : ""}</span><span class="mv-d">${b ? b.d : ""}</span></span>`;
      }).join("")}</div>`;
    } else {
      const lots = sel.lots.slice().sort((a, b) => a.date - b.date);
      body = `<div class="mv-bar"><span style="width:${Math.min(100, Math.round(q / sel.cap * 100))}%"></span></div>
        <div class="mv-chips">${lots.map(l => { const o = list.find(b => b.lot === l) || {}; return `<span class="mv-chip${o.must ? " must" : o.old ? " old" : o.kept ? " kept" : ""}">${t("mv_n", { n: l.qty })} · ${t("mv_ago", { h: Math.max(0, Math.floor((s.now - l.date) / H)) })} · ${dd(l.date)}</span>`; }).join("") || ""}</div>`;
    }
    return `<button type="button" class="mv-d-box st-${st.k}${on ? " sel" : ""}" data-mv-sel="${sel.n}">
      <span class="mv-top"><b>${sel.n}</b><span>${U.prod(sel.type)}</span></span>${body}<span class="mv-st ${st.k}">${st.txt}</span></button>`;
  }

  function grid(s, m, o) {
    o = o || {};
    const L = layout(m);
    if (!L.rows.length) return "";
    if (o.compact) return `<div class="mv-compact" aria-hidden="true">${L.rows.map(r => `<div class="mv-crow">${r.sels.map(sel => drawer(s, m, sel, true)).join("")}</div>`).join("")}</div>`;
    return `<div class="mv-grid" style="--cols:${L.cols}">${L.rows.map(r => `<div class="mv-etage"><div class="mv-lvl">${r.e}</div>${r.sels.map(sel => drawer(s, m, sel, false, o.sel === sel.n)).join("")}</div>`).join("")}</div>`;
  }

  function legend(s) {
    return `<div class="mv-legend"><span class="mv-lg"><i class="mv-loaf f old"></i>${t("mv_legend_old", { h: s.settings.thrHours })}</span><span class="mv-lg"><i class="mv-loaf"></i>${t("mv_legend_empty")}</span></div>`;
  }

  function panel(s, m, selN, o) {
    const sel = M.sel(m, selN);
    if (!sel) return `<div class="mv-panel petit">${t("mv_pick")}</div>`;
    const lots = sel.lots.slice().sort((a, b) => a.date - b.date || a.id - b.id), q = M.qty(sel), mission = M.openMission(s, m.num);
    return `<div class="mv-panel"><h4>${t("mv_sel", { n: sel.n })} · ${U.prod(sel.type)}</h4>
      <div class="mv-kv"><span>${t("mv_inside")}</span><b>${q} / ${sel.cap}</b></div>
      ${lots.map(l => {
        const must = !!l.kept && M.isMandatory(s, l), kept = !!l.kept && !must, old = !l.kept && M.mustRemove(s, l, mission), h = Math.max(0, Math.floor((s.now - l.date) / H));
        return `<div class="mv-lotline"><span>${t("mv_lot", { d: dd(l.date) })} · <b class="${old || must ? "old" : ""}">${t("mv_ago", { h })}</b>${must ? " · ⛔ " + t("mv_lot_must") : old ? " · ⚠ " + t("mv_lot_old") : kept ? " · ⏳ " + t("mv_lot_kept") : ""}</span>
          <span class="mv-lq">${t("mv_n", { n: l.qty })}${o && o.actions ? ` <button type="button" class="btn petit secondary" data-mv-rm="${sel.n}" data-lot="${l.id}">➖ ${t("mv_btn_rm")}</button>` : ""}</span></div>`;
      }).join("") || `<div class="petit">${t("mv_empty")}</div>`}</div>`;
  }

  // Bloc complet (titre, note, grille, légende, panneau). o.actions : boutons « Retirer » (renvoient vers le tableau des lots)
  function block(s, m, o) {
    o = o || {};
    const st = BA.Shell.state;
    let sel = o.sel != null ? o.sel : (st.mvSel && st.mvSel.num === m.num ? st.mvSel.n : null);
    if (sel == null && o.preselect !== false) {   // par défaut : le premier tiroir avec un pain à retirer, sinon le premier
      const L = layout(m).rows.flatMap(r => r.sels), bad = L.find(x => breads(s, m, x).some(b => b.old || b.must));
      sel = (bad || L[0] || {}).n != null ? (bad || L[0]).n : null;
    }
    return `<div class="mv-wrap" data-mv-num="${m.num}">
      ${o.title === false ? "" : `<h3>🧩 ${t("mv_title")}</h3>`}<p class="note">${t("mv_note")}</p>
      <div class="mv-cols"><div class="mv-machine"><div class="mv-glass">${grid(s, m, { sel })}</div>${legend(s)}</div>
      <div class="mv-side" id="mv-side">${panel(s, m, sel, o)}</div></div></div>`;
  }

  function bind(el, m, o) {
    const wrap = el.querySelector(".mv-wrap");
    if (!wrap) return;
    const redraw = n => {
      const s = BA.Store.get(), mm = M.machine(s, m.num) || m;
      BA.Shell.state.mvSel = { num: m.num, n };
      wrap.querySelectorAll("[data-mv-sel]").forEach(b => b.classList.toggle("sel", Number(b.dataset.mvSel) === n));
      wrap.querySelector("#mv-side").innerHTML = panel(s, mm, n, o);
    };
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-mv-sel]");
      if (b) { redraw(Number(b.dataset.mvSel)); return; }
      const r = e.target.closest("[data-mv-rm]");
      if (r && o && o.proxy) {   // même bouton que dans le tableau des lots : le fonctionnement ne change pas
        const real = o.proxy.querySelector(`[data-act="rm-bread"][data-sel="${r.dataset.mvRm}"][data-lot="${r.dataset.lot}"]`);
        if (real) real.click();
      }
    });
    const cur = BA.Shell.state.mvSel;
    if (cur && cur.num === m.num) wrap.querySelectorAll("[data-mv-sel]").forEach(b => b.classList.toggle("sel", Number(b.dataset.mvSel) === cur.n));
  }

  BA.MachineView = { grid, block, bind, panel, legend };
})();
