// ============================================================
// BROODAUTOMATE v5.6 — Sauvegardes (BA.Backup) — admin seulement (reprise de la version test 4.8.9)
// Les sauvegardes « dans le logiciel » restent dans CE navigateur (cet ordinateur) ; pour les garder ailleurs : fichier .json.
// Sauvegarde et retour en arrière des RÉGLAGES de prévision :
//   • besoins par machine (profils réglés à la main : s.profileManual / profileManualAt / profileTypes),
//   • historique des ventes par jour et par machine (8 semaines par défaut), au choix de la période,
//   • réglages généraux, calendrier et décisions de jours (toutes les machines seulement).
// Jamais restaurés : stock, lots, missions, interventions, alertes (ils reflètent les vraies machines).
// Deux endroits : dans le logiciel (clé « -backups », séparée des données de l'appli) ou fichier .json sur le PC.
// Une sauvegarde AUTOMATIQUE (besoins + réglages) est faite avant chaque changement ; avant une restauration,
// l'état actuel des éléments touchés est gardé (« Avant restauration ») : on peut annuler.
// Restaurer ne remplace QUE les machines, éléments et jours choisis : tout le reste n'est pas touché.
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model, U = BA.UI, F = U.F, E = U.E, FC = BA.Forecast;
  const t = (k, v) => BA.I18n.t(k, v);
  const st = () => BA.Shell.state;

  const KEY = BA_CONFIG.storageKey + "-backups";
  const MAX_AUTO = 20, MAX_PRE = 10, MAX_BYTES = 1500000;
  const DAYS_DEFAULT = 56;                         // 8 semaines
  const KEYRE = /^\d{4}-\d{2}-\d{2}$/;
  const clone = x => x == null ? null : JSON.parse(JSON.stringify(x));
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

  // ---------- Stockage ----------
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && Array.isArray(o.list)) return o.list.filter(b => b && b.id && b.data);
    } catch (e) { /* rien */ }
    return [];
  }
  function save(list) {
    try {
      const txt = JSON.stringify({ v: 1, list });
      if (txt.length > MAX_BYTES) return false;
      localStorage.setItem(KEY, txt);
      return true;
    } catch (e) { return false; }
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const yesterday = s => FC.addDays(M.dayKey(s.now), -1);

  // ---------- Contenu d'une sauvegarde ----------
  // o = { machines: [numéros], parts: { needs, hist, gen }, from, to }
  function capture(s, o) {
    const d = {};
    if (o.parts.needs) {
      d.needs = {};
      o.machines.forEach(n => { d.needs[n] = { man: clone((s.profileManual || {})[n]), at: clone((s.profileManualAt || {})[n]), types: clone((s.profileTypes || {})[n]) }; });
    }
    if (o.parts.hist) {
      const days = {}, set = new Set(o.machines);
      Object.keys(s.daily).forEach(k => {
        if (k < o.from || k > o.to) return;
        Object.keys(s.daily[k]).forEach(n => { if (set.has(Number(n))) (days[k] = days[k] || {})[n] = clone(s.daily[k][n]); });
      });
      d.hist = { days };
    }
    if (o.parts.set) d.settings = clone(s.settings);
    if (o.parts.gen) d.gen = { settings: clone(s.settings), calendar: clone(s.calendar), dayDecisions: clone(s.dayDecisions) };
    return d;
  }
  function make(s, o, kind, label) {
    const all = M_all(s, o.machines);
    return {
      id: newId(), at: s.now, real: Date.now(), kind, label: String(label || "").slice(0, 60),
      machines: o.machines.slice(), all, parts: { needs: !!o.parts.needs, hist: !!o.parts.hist, gen: !!o.parts.gen, set: !!o.parts.set },
      period: o.parts.hist ? { from: o.from, to: o.to } : null,
      data: capture(s, o)
    };
  }
  const M_all = (s, machines) => s.machines.every(m => machines.includes(m.num));

  // ---------- Liste : ajout, ménage ----------
  function add(b) {
    let list = load();
    list.push(b);
    const prune = (kind, max) => {
      const mine = list.filter(x => x.kind === kind).sort((a, c) => c.real - a.real);
      const drop = new Set(mine.slice(max).map(x => x.id));
      list = list.filter(x => !drop.has(x.id));
    };
    prune("auto", MAX_AUTO); prune("pre", MAX_PRE);
    return save(list) ? list : null;
  }

  // Sauvegarde automatique AVANT un changement de besoins ou de réglages (appelée par BA.Actions).
  // Rien n'est enregistré si l'état est identique à la dernière sauvegarde automatique, ou si la dernière date de moins de 3 s
  // (un même clic sur « Enregistrer » change plusieurs réglages).
  let lastAuto = 0;
  function auto() {
    try {
      if (Date.now() - lastAuto < 3000) return;
      const s = BA.Store.get();
      const o = { machines: s.machines.map(m => m.num), parts: { needs: true, hist: false, gen: false, set: true }, from: "", to: "" };
      const b = make(s, o, "auto", "");                // besoins + réglages généraux (sans calendrier)
      const last = load().filter(x => x.kind === "auto").sort((a, c) => c.real - a.real)[0];
      if (last && same(last.data, b.data)) return;
      lastAuto = Date.now();
      add(b);
    } catch (e) { console.warn("Sauvegarde automatique impossible :", e); }
  }

  // ---------- Différences avec l'état actuel (aperçu) et restauration ----------
  function periodKeys(from, to, max) {
    const out = [];
    if (!KEYRE.test(from || "") || !KEYRE.test(to || "")) return out;
    for (let k = from, i = 0; k <= to && i < (max || 800); k = FC.addDays(k, 1), i++) out.push(k);
    return out;
  }
  // sel = { machines, parts: { needs, hist, gen }, from, to } (déjà limité à ce que la sauvegarde contient)
  function plan(s, b, sel) {
    const have = new Set(s.machines.map(m => m.num));
    const ms = sel.machines.filter(n => have.has(n) && b.machines.includes(n));
    const r = { ms, needs: [], hist: 0, histDays: 0, gen: false, set: false };
    if (sel.parts.needs && b.data.needs) {
      ms.forEach(n => {
        const x = b.data.needs[n]; if (!x) return;
        if (!same(x.man, (s.profileManual || {})[n]) || !same(x.types, (s.profileTypes || {})[n])) r.needs.push(n);
      });
    }
    if (sel.parts.hist && b.data.hist) {
      const to = sel.to < yesterday(s) ? sel.to : yesterday(s);
      periodKeys(sel.from, to).forEach(k => {
        const src = b.data.hist.days[k] || {}, cur = s.daily[k] || {};
        let changed = false;
        ms.forEach(n => { if (!same(src[n], cur[n])) { r.hist++; changed = true; } });
        if (changed) r.histDays++;
      });
    }
    if (sel.parts.set && b.data.settings && b.all) r.set = !same(b.data.settings, s.settings);
    if (sel.parts.gen && b.data.gen && b.all) {
      r.gen = !same(b.data.gen.settings, s.settings) || !same(b.data.gen.calendar, s.calendar) || !same(b.data.gen.dayDecisions, s.dayDecisions || {});
    }
    return r;
  }
  function restore(b, sel) {
    const s0 = BA.Store.get();
    const p = plan(s0, b, sel);
    // 1. l'état actuel de ce qui va être remplacé est gardé (« Avant restauration »)
    const to = sel.to < yesterday(s0) ? sel.to : yesterday(s0);
    const pre = make(s0, { machines: p.ms, parts: { needs: !!(sel.parts.needs && b.data.needs), hist: !!(sel.parts.hist && b.data.hist), gen: !!(sel.parts.gen && b.data.gen && b.all), set: !!(sel.parts.set && b.data.settings && b.all) }, from: sel.from, to }, "pre", "");
    if (!add(pre)) return { err: "bk_err_full" };
    // 2. on remplace seulement ce qui a été choisi
    BA.Store.update(s => {
      const setOrDel = (obj, n, v) => { if (v == null) delete obj[n]; else obj[n] = clone(v); };
      if (sel.parts.needs && b.data.needs) {
        s.profileManual = s.profileManual || {}; s.profileManualAt = s.profileManualAt || {}; s.profileTypes = s.profileTypes || {};
        p.ms.forEach(n => {
          const x = b.data.needs[n]; if (!x) return;
          setOrDel(s.profileManual, n, x.man); setOrDel(s.profileTypes, n, x.types);
          // les jours réglés repartent d'aujourd'hui (sinon un réglage ancien expirerait tout de suite : 8 semaines)
          if (x.man) { const at = {}; x.man.forEach((v, wd) => { if (v != null) at[wd] = s.now; }); if (Object.keys(at).length) s.profileManualAt[n] = at; else delete s.profileManualAt[n]; }
          else delete s.profileManualAt[n];
        });
      }
      if (sel.parts.hist && b.data.hist) {
        const lim = yesterday(s);
        periodKeys(sel.from, sel.to < lim ? sel.to : lim).forEach(k => {
          const src = b.data.hist.days[k] || {};
          p.ms.forEach(n => {
            if (src[n]) (s.daily[k] = s.daily[k] || {})[n] = clone(src[n]);
            else if (s.daily[k]) { delete s.daily[k][n]; if (!Object.keys(s.daily[k]).length) delete s.daily[k]; }
          });
        });
        s.histRev = (s.histRev || 0) + 1;
      }
      if (sel.parts.set && b.data.settings && b.all) s.settings = Object.assign({}, s.settings, clone(b.data.settings));
      if (sel.parts.gen && b.data.gen && b.all) {
        s.settings = Object.assign({}, s.settings, clone(b.data.gen.settings));
        s.calendar = clone(b.data.gen.calendar) || s.calendar;
        s.dayDecisions = clone(b.data.gen.dayDecisions) || {};
      }
    });
    return { ok: true, plan: p };
  }

  // ---------- Fichier ----------
  function toFile(b) {
    return JSON.stringify({ format: "ba-backup", version: 1, app: BA_CONFIG.app.version, created: new Date().toISOString(), backup: b }, null, 1);
  }
  function download(b) {
    const d = new Date(b.at), p = M.pad;
    const name = "broodautomate-sauvegarde-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
    const url = URL.createObjectURL(new Blob([toFile(b)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
  }
  // Lit un fichier de sauvegarde (texte) ; renvoie la sauvegarde nettoyée, ou null
  function parseFile(text) {
    try {
      const o = JSON.parse(text), b = o && o.format === "ba-backup" && o.backup;
      if (!b || typeof b !== "object" || !b.data || typeof b.data !== "object") return null;
      const machines = (Array.isArray(b.machines) ? b.machines : []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n < 100000);
      if (!machines.length) return null;
      const out = { id: newId(), at: Number(b.at) || Date.now(), real: Date.now(), kind: "file", label: String(b.label || "").slice(0, 60), machines, all: !!b.all, parts: { needs: !!b.parts && !!b.parts.needs && !!b.data.needs, hist: !!b.parts && !!b.parts.hist && !!(b.data.hist && b.data.hist.days), gen: !!b.parts && !!b.parts.gen && !!b.data.gen, set: !!b.parts && !!b.parts.set && !!b.data.settings && typeof b.data.settings === "object" }, period: null, data: {} };
      if (out.parts.needs) {
        out.data.needs = {};
        machines.forEach(n => { const x = b.data.needs[n]; if (x) out.data.needs[n] = { man: Array.isArray(x.man) ? x.man.map(v => v == null ? null : Math.max(0, Math.min(400, Math.round(Number(v) || 0)))) : null, at: null, types: x.types && typeof x.types === "object" ? clone(x.types) : null }; });
      }
      if (out.parts.hist) {
        const days = {}, set = new Set(machines);
        Object.keys(b.data.hist.days).forEach(k => {
          if (!KEYRE.test(k)) return;
          Object.keys(b.data.hist.days[k] || {}).forEach(n => { if (set.has(Number(n)) && b.data.hist.days[k][n] && typeof b.data.hist.days[k][n] === "object") (days[k] = days[k] || {})[n] = clone(b.data.hist.days[k][n]); });
        });
        out.data.hist = { days };
        const from = b.period && KEYRE.test(b.period.from) ? b.period.from : Object.keys(days).sort()[0], to = b.period && KEYRE.test(b.period.to) ? b.period.to : Object.keys(days).sort().pop();
        if (!from || !to) out.parts.hist = false, delete out.data.hist; else out.period = { from, to };
      }
      if (out.parts.gen) out.data.gen = { settings: clone(b.data.gen.settings) || {}, calendar: Array.isArray(b.data.gen.calendar) ? clone(b.data.gen.calendar) : [], dayDecisions: clone(b.data.gen.dayDecisions) || {} };
      if (out.parts.set) out.data.settings = clone(b.data.settings);
      if (!out.parts.needs && !out.parts.hist && !out.parts.gen && !out.parts.set) return null;
      return out;
    } catch (e) { return null; }
  }

  // ---------- Textes ----------
  function contentText(b) {
    const who = b.all ? t("bk_all_short") : t("bk_n_machines", { n: b.machines.length });
    const p = [];
    if (b.parts.needs) p.push(t("bk_c_needs"));
    if (b.parts.set) p.push(t("bk_c_gen_short"));
    if (b.parts.hist && b.period) p.push(t("bk_c_hist", { a: F.keyShort(b.period.from), b: F.keyShort(b.period.to) }));
    if (b.parts.gen) p.push(t("bk_c_gen"));
    return who + " · " + p.join(" + ");
  }
  const kindText = b => t("bk_kind_" + b.kind);

  // ---------- Écran « Sauvegardes » ----------
  function form(s) {
    const f = st().bk = Object.assign({ scope: "all", sel: [], needs: true, hist: true, gen: false, name: "", msg: "", err: "" }, st().bk || {});
    const to = yesterday(s);
    if (!KEYRE.test(f.to || "")) f.to = to;
    if (!KEYRE.test(f.from || "")) f.from = FC.addDays(f.to, -(DAYS_DEFAULT - 1));
    return f;
  }
  function render(el) {
    const s = BA.Store.get(), f = form(s), list = load().sort((a, b) => b.real - a.real);
    el.innerHTML = `
      <h2>💾 ${t("bk_title")}</h2>
      <p class="note">${t("bk_intro")}</p>
      ${f.msg ? `<div class="alert info">✅ ${E(f.msg)}</div>` : ""}${f.err ? `<div class="alert err">⚠️ ${E(f.err)}</div>` : ""}
      <div class="card bk-card"><h3>➕ ${t("bk_new")}</h3>
        <div class="bk-block"><b>${t("bk_scope")}</b>
          <label class="case"><input type="radio" name="bk-scope" value="all" ${f.scope === "all" ? "checked" : ""}> ${t("bk_scope_all")}</label>
          <label class="case"><input type="radio" name="bk-scope" value="some" ${f.scope === "some" ? "checked" : ""}> ${t("bk_scope_some")}</label>
          ${f.scope === "some" ? `<div class="bk-machines">${s.machines.map(m => `<label class="case"><input type="checkbox" class="bk-m" value="${m.num}" ${f.sel.includes(m.num) ? "checked" : ""}> #${m.num}</label>`).join("")}</div>` : ""}
        </div>
        <div class="bk-block"><b>${t("bk_parts")}</b>
          <label class="case"><input type="checkbox" id="bk-needs" ${f.needs ? "checked" : ""}> ${t("bk_part_needs")}</label>
          <label class="case"><input type="checkbox" id="bk-hist" ${f.hist ? "checked" : ""}> ${t("bk_part_hist")}</label>
          ${f.hist ? `<div class="bk-period"><label>${t("bk_from")} <input type="date" id="bk-from" value="${E(f.from)}" max="${E(yesterday(s))}"></label>
            <label>${t("bk_to")} <input type="date" id="bk-to" value="${E(f.to)}" max="${E(yesterday(s))}"></label>
            <div class="petit">${t("bk_period_help")}</div></div>` : ""}
          <label class="case ${f.scope === "all" ? "" : "off"}"><input type="checkbox" id="bk-gen" ${f.gen && f.scope === "all" ? "checked" : ""} ${f.scope === "all" ? "" : "disabled"}> ${t("bk_part_gen")}</label>
        </div>
        <label class="field-row">${t("bk_name")} <input type="text" id="bk-name" class="txt-in" maxlength="60" value="${E(f.name)}"></label>
        <div class="bk-actions"><button class="btn" id="bk-save">💾 ${t("bk_save_local")}</button>
          <button class="btn secondary" id="bk-file">⬇ ${t("bk_save_file")}</button></div>
      </div>
      <div class="card bk-card"><h3>🗂 ${t("bk_list")}</h3>
        ${list.length ? `<div class="table-scroll"><table class="compact"><thead><tr><th>${t("bk_col_when")}</th><th>${t("bk_col_kind")}</th><th>${t("bk_col_content")}</th><th></th></tr></thead>
          <tbody>${list.map(b => `<tr data-bk="${b.id}"><td class="nowrap">${F.dt(b.at)}</td><td><span class="tag ${b.kind === "manual" ? "c-ok" : "c-kept"}">${kindText(b)}</span>${b.label ? `<div class="petit">${E(b.label)}</div>` : ""}</td>
            <td class="petit">${E(contentText(b))}</td>
            <td class="nowrap"><button class="btn petit" data-bk-act="restore" data-id="${b.id}">↩ ${t("bk_restore")}</button>
              <button class="btn petit secondary" data-bk-act="dl" data-id="${b.id}" title="${E(t("bk_download"))}">⬇</button>
              <button class="btn petit secondary" data-bk-act="del" data-id="${b.id}" title="${E(t("bk_delete"))}">🗑</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="note">${t("bk_none")}</p>`}
        <div class="bk-actions"><button class="btn secondary" id="bk-import">📂 ${t("bk_import")}</button>
          <input type="file" id="bk-import-file" accept=".json,application/json" hidden></div>
      </div>`;
    f.msg = ""; f.err = "";
    bind(el, s);
  }

  function readForm(el) {
    const f = st().bk;
    f.scope = (el.querySelector('input[name="bk-scope"]:checked') || {}).value || "all";
    if (f.scope === "some") f.sel = Array.from(el.querySelectorAll(".bk-m:checked")).map(i => Number(i.value));
    f.needs = el.querySelector("#bk-needs").checked;
    f.hist = el.querySelector("#bk-hist").checked;
    const g = el.querySelector("#bk-gen"); f.gen = !!(g && g.checked && f.scope === "all");
    const a = el.querySelector("#bk-from"), z = el.querySelector("#bk-to");
    if (a && a.value) f.from = a.value; if (z && z.value) f.to = z.value;
    f.name = el.querySelector("#bk-name").value;
    return f;
  }
  // Construit la sauvegarde demandée, ou renvoie { err }
  function build(s, f) {
    const machines = f.scope === "all" ? s.machines.map(m => m.num) : f.sel.slice().sort((a, b) => a - b);
    if (!machines.length) return { err: "bk_err_machines" };
    if (!f.needs && !f.hist && !(f.gen && f.scope === "all")) return { err: "bk_err_parts" };
    const lim = yesterday(s);
    let from = f.from, to = f.to < lim ? f.to : lim;
    if (f.hist && (!KEYRE.test(from) || !KEYRE.test(to) || from > to)) return { err: "bk_err_period" };
    return { b: make(s, { machines, parts: { needs: f.needs, hist: f.hist, gen: f.gen && f.scope === "all" }, from, to }, "manual", f.name) };
  }

  function bind(el, s) {
    const redraw = () => render(el);
    el.querySelectorAll('input[name="bk-scope"], #bk-hist').forEach(i => i.onchange = () => { readForm(el); redraw(); });
    el.querySelectorAll("#bk-needs, #bk-gen, .bk-m, #bk-from, #bk-to, #bk-name").forEach(i => i.onchange = () => readForm(el));
    el.querySelector("#bk-save").onclick = () => {
      const f = readForm(el), r = build(BA.Store.get(), f);
      if (r.err) { f.err = t(r.err); redraw(); return; }
      if (!add(r.b)) { f.err = t("bk_err_full"); redraw(); return; }
      f.msg = t("bk_saved"); f.name = ""; redraw();
    };
    el.querySelector("#bk-file").onclick = () => {
      const f = readForm(el), r = build(BA.Store.get(), f);
      if (r.err) { f.err = t(r.err); redraw(); return; }
      download(r.b); f.msg = t("bk_downloaded"); redraw();
    };
    el.querySelector("#bk-import").onclick = () => el.querySelector("#bk-import-file").click();
    el.querySelector("#bk-import-file").onchange = e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const b = parseFile(String(rd.result || ""));
        const f = st().bk;
        if (!b) { f.err = t("bk_err_file"); redraw(); return; }
        if (!add(b)) { f.err = t("bk_err_full"); redraw(); return; }
        f.msg = t("bk_imported"); redraw();
        restoreDialog(el, b.id);
      };
      rd.readAsText(file);
    };
    el.querySelectorAll("[data-bk-act]").forEach(btn => btn.onclick = () => {
      const id = btn.dataset.id, b = load().find(x => x.id === id); if (!b) return;
      if (btn.dataset.bkAct === "restore") restoreDialog(el, id);
      else if (btn.dataset.bkAct === "dl") download(b);
      else U.confirmDialog({ title: "🗑 " + t("bk_delete"), html: `<p>${t("bk_confirm_delete", { d: F.dt(b.at) })}</p>`, ok: "🗑 " + t("bk_delete"), danger: true,
        onOk: () => { save(load().filter(x => x.id !== id)); render(el); } });
    });
  }

  // ---------- Fenêtre « Restaurer » ----------
  function restoreDialog(el, id) {
    const b = load().find(x => x.id === id); if (!b) return;
    const s = BA.Store.get(), root = document.getElementById("modal-root");
    const have = new Set(s.machines.map(m => m.num));
    const ms = b.machines.filter(n => have.has(n));
    const lim = yesterday(s);
    const pFrom = b.period ? b.period.from : "", pTo = b.period ? (b.period.to < lim ? b.period.to : lim) : "";
    const back = document.activeElement;
    const key = e => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const close = () => { document.removeEventListener("keydown", key, true); root.innerHTML = ""; if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); };
    root.innerHTML = `<div class="modal-back dlg-back"><div class="modal bk-modal" role="dialog" aria-modal="true" aria-labelledby="bk-rs-title">
      <div class="modal-head"><div><h2 id="bk-rs-title">↩ ${t("bk_rs_title")}</h2>
        <div class="petit">${t("bk_rs_from", { d: F.dt(b.at), k: kindText(b) })} — ${E(contentText(b))}</div></div></div>
      <p class="note">${t("bk_rs_help")}</p>
      <div class="bk-block"><b>${t("bk_rs_machines")}</b>
        <div class="bk-machines">${ms.map(n => `<label class="case"><input type="checkbox" class="rs-m" value="${n}" checked> #${n}</label>`).join("")}</div>
        <div class="petit"><button class="link-btn" id="rs-all">${t("bk_rs_all")}</button> · <button class="link-btn" id="rs-none">${t("bk_rs_none")}</button></div></div>
      <div class="bk-block"><b>${t("bk_rs_parts")}</b>
        ${b.parts.needs ? `<label class="case"><input type="checkbox" id="rs-needs" checked> ${t("bk_part_needs")}</label>` : ""}
        ${b.parts.hist ? `<label class="case"><input type="checkbox" id="rs-hist" checked> ${t("bk_part_hist")}</label>
          <div class="bk-period"><label>${t("bk_from")} <input type="date" id="rs-from" value="${E(pFrom)}" min="${E(pFrom)}" max="${E(pTo)}"></label>
            <label>${t("bk_to")} <input type="date" id="rs-to" value="${E(pTo)}" min="${E(pFrom)}" max="${E(pTo)}"></label>
            <div class="petit">${t("bk_rs_period_help", { a: F.key(pFrom), b: F.key(pTo) })}</div></div>` : ""}
        ${b.parts.set && b.all ? `<label class="case"><input type="checkbox" id="rs-set" checked> ${t("bk_part_set")}</label>` : ""}
        ${b.parts.gen && b.all ? `<label class="case"><input type="checkbox" id="rs-gen" checked> ${t("bk_part_gen")}</label>` : ""}
      </div>
      <div class="bk-block"><b>${t("bk_rs_preview")}</b><div id="rs-preview" class="bk-prev"></div></div>
      <p class="petit">${t("bk_rs_safe")}</p><div id="rs-err"></div>
      <div class="wz-actions"><button class="btn big" id="rs-ok">↩ ${t("bk_rs_ok")}</button>
        <button class="btn big secondary" id="rs-cancel">${t("btn_cancel_short")}</button></div></div></div>`;
    document.addEventListener("keydown", key, true);
    const val = () => {
      const q = sel => root.querySelector(sel);
      const sel = {
        machines: Array.from(root.querySelectorAll(".rs-m:checked")).map(i => Number(i.value)),
        parts: { needs: !!(q("#rs-needs") && q("#rs-needs").checked), hist: !!(q("#rs-hist") && q("#rs-hist").checked), gen: !!(q("#rs-gen") && q("#rs-gen").checked), set: !!(q("#rs-set") && q("#rs-set").checked) },
        from: q("#rs-from") ? q("#rs-from").value : "", to: q("#rs-to") ? q("#rs-to").value : ""
      };
      if (sel.parts.hist && (!KEYRE.test(sel.from) || !KEYRE.test(sel.to) || sel.from > sel.to)) sel.parts.hist = false, sel.bad = true;
      return sel;
    };
    const preview = () => {
      const sel = val(), p = plan(BA.Store.get(), b, sel), lines = [];
      if (sel.parts.needs) lines.push(p.needs.length ? t("bk_pv_needs", { n: p.needs.length }) : t("bk_pv_needs0"));
      if (sel.parts.hist) lines.push(p.hist ? t("bk_pv_hist", { n: p.hist, d: p.histDays }) : t("bk_pv_hist0"));
      if (sel.parts.set) lines.push(p.set ? t("bk_pv_set") : t("bk_pv_set0"));
      if (sel.parts.gen) lines.push(p.gen ? t("bk_pv_gen") : t("bk_pv_gen0"));
      const nothing = (!sel.machines.length && !sel.parts.set && !sel.parts.gen) || (!sel.parts.needs && !sel.parts.hist && !sel.parts.gen && !sel.parts.set);
      root.querySelector("#rs-preview").innerHTML = nothing ? `<span class="petit">${t("bk_pv_choose")}</span>`
        : lines.map(x => `<div>• ${x}</div>`).join("") + (!p.needs.length && !p.hist && !p.gen && !p.set ? `<div class="petit">${t("bk_pv_none")}</div>` : "");
      root.querySelector("#rs-ok").disabled = nothing;
      root.querySelector("#rs-err").innerHTML = sel.bad ? `<div class="alert err">${t("bk_err_period")}</div>` : "";
    };
    root.querySelectorAll("input").forEach(i => i.onchange = preview);
    root.querySelector("#rs-all").onclick = () => { root.querySelectorAll(".rs-m").forEach(i => i.checked = true); preview(); };
    root.querySelector("#rs-none").onclick = () => { root.querySelectorAll(".rs-m").forEach(i => i.checked = false); preview(); };
    root.querySelector("#rs-cancel").onclick = close;
    root.querySelector(".dlg-back").onclick = e => { if (e.target.classList.contains("dlg-back")) close(); };
    root.querySelector("#rs-ok").onclick = () => {
      const sel = val();
      if (sel.bad) { preview(); return; }
      const r = restore(b, sel);
      if (r.err) { root.querySelector("#rs-err").innerHTML = `<div class="alert err">${t(r.err)}</div>`; return; }
      close();
      st().bk = Object.assign(st().bk || {}, { msg: t("bk_restored") });
      U.toast("✅ " + t("bk_restored"));
      BA.Shell.renderView();
    };
    preview();
  }

  BA.Backup = { render, auto, capture, plan, restore, load, parseFile, toFile, clearAll() { try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } } };
})();
