// ============================================================
// BROODAUTOMATE v5.1 — Boîtiers 4G (LILYGO T-A7670E) : BA.Boitiers
//
// Le boîtier, branché sur la prise RS232 de la machine, la lit tout seul
// (liste 2, comme le câble) et envoie les relevés à Supabase par la 4G
// (fonction « ingest » → table device_reports). Ici :
// - les relevés reçus sont traités EXACTEMENT comme un relevé par câble
//   (BA.Reel.applyAudit : ventes retirées des lots les plus anciens,
//   porte, température, coupures, erreurs → Alertes) ;
// - jamais de vente comptée deux fois, même si le PC et le téléphone
//   sont ouverts en même temps : chaque relevé est comparé au relevé
//   précédent de la MÊME chaîne (noté dans les données partagées :
//   machine.g4 = dernier relevé traité), et la modification n'est faite
//   que si personne ne l'a déjà faite (vérifié à nouveau si un autre
//   appareil a écrit entre-temps) ;
// - « en ligne » : boîtier vu récemment (signal de vie toutes les 30 min) ;
// - alertes : boîtier muet, boîtier qui n'arrive plus à lire la machine ;
// - onglet Connexion RS232 → « Boîtiers 4G » : ajouter un boîtier (clé
//   secrète créée ici, seule son empreinte SHA-256 va dans Supabase),
//   commandes SQL une par une, code de la fonction « ingest ».
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG, M = BA.Model;
  const t = (k, v) => BA.I18n.t(k, v);
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const U = () => BA.UI;
  const CLOUD = () => !!(BA.DB && BA.DB.isReady && BA.DB.isReady());
  const sb = () => BA.DB.raw();
  const MIN = 60000;

  // ---------------- Nouvelles alertes ----------------
  Object.assign(M.EVENTS, {
    BOX_FAIL:   { cat: "tech", level: "warn" },   // le boîtier n'arrive plus à lire la machine
    BOX_SILENT: { cat: "tech", level: "warn" },   // le boîtier n'envoie plus rien
    BOX_WRONG:  { cat: "tech", level: "err" }     // le relevé vient d'une autre machine (boîtier déplacé ?)
  });

  // ---------------- Commandes SQL (l'éditeur de Supabase n'en accepte qu'une par « Run ») ----------------
  const SQL = [
    "create table if not exists public.devices (id uuid primary key default gen_random_uuid(), name text not null, machine_id text not null, key_hash text not null unique, last_seen timestamptz, info jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());",
    "create table if not exists public.device_reports (id bigint generated always as identity primary key, device_id uuid references public.devices(id) on delete cascade, machine_id text not null, raw text not null, role text, received_at timestamptz not null default now());",
    "create index if not exists device_reports_machine_id on public.device_reports (machine_id, id);",
    "alter table public.devices enable row level security;",
    "alter table public.device_reports enable row level security;",
    "create policy \"devices_authenticated\" on public.devices for all to authenticated using (true) with check (true);",
    "create policy \"device_reports_authenticated\" on public.device_reports for all to authenticated using (true) with check (true);",
    "grant select, insert, update, delete on public.devices, public.device_reports to authenticated;",
    "grant all on public.devices, public.device_reports to service_role;"
  ];
  const FN_URL = () => C.supabase.url.replace(/\/+$/, "") + "/functions/v1/ingest";

  // ---------------- État ----------------
  let devices = [];             // lignes de la table devices
  let installed = null;         // null : pas encore vérifié ; false : tables absentes ; true
  let lastError = "";
  let lastCheck = 0, timer = null, lastCleanup = 0;
  const audits = new Map();     // n° de relevé → audit (relevé de départ du suivant)
  let _el = null;               // section de l'onglet Connexion RS232 (admin)
  let lastKey = null;           // clé affichée une seule fois

  const missing = err => /(devices|device_reports)/i.test(err && err.message || "") && /(does not exist|could not find|schema cache|relation)/i.test(err.message || "");
  const machines = () => (BA.Store.get() || { machines: [] }).machines;
  const nomM = m => m ? "#" + m.num + " — " + (m.street || m.id) + (m.city ? ", " + m.city : "") : "—";
  const seenMs = d => d && d.last_seen ? Date.parse(d.last_seen) || 0 : 0;
  // Boîtier « vivant » : vu depuis moins de 2 signaux de vie (+ 5 min), et au moins 45 min
  const limitMs = d => Math.max(Number(C.onlineMinutes) || 45, (Number(d && d.info && d.info.hb) || 30) * 2 + 5) * MIN;
  const isAlive = (d, now) => !!seenMs(d) && (now || Date.now()) - seenMs(d) < limitMs(d);

  // ---------------- Lecture de Supabase ----------------
  async function loadDevices() {
    const res = await sb().from("devices").select("id, name, machine_id, last_seen, info, created_at").order("created_at", { ascending: true });
    if (res.error) {
      if (missing(res.error)) { installed = false; devices = []; return false; }
      throw new Error(res.error.message);
    }
    installed = true;
    devices = (res.data || []).map(d => { if (d && d.info && typeof d.info.st === "string") d.info = Object.assign({}, d.info, { st: fixUtf8(d.info.st) }); return d; });
    return true;
  }
  // Le boîtier envoie chaque octet en \u00XX : un texte avec accents arrive en « Ã© » ; on le remet en « é »
  function fixUtf8(s) {
    if (!/[\u00C2-\u00F4][\u0080-\u00BF]/.test(s)) return s;
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  // ---------------- Relevé de départ ----------------
  async function reportAudit(rid) {
    if (audits.has(rid)) return audits.get(rid);
    const res = await sb().from("device_reports").select("id, raw").eq("id", rid).maybeSingle();
    if (res.error || !res.data) return null;
    const a = BA.EvaDts.parse(res.data.raw || "");
    const au = a.type === "audit" && !(a.g85.present && !a.g85.ok) ? BA.EvaDts.toAudit(a) : null;
    if (au) audits.set(rid, au);
    return au;
  }
  async function lastAudit(id) {
    try { return await BA.DB.getLastAudit(id); } catch (e) { return null; }
  }
  // Relevé avec lequel comparer : le relevé 4G précédent de la machine, sauf si un relevé par câble ou par clé USB
  // a été fait depuis (il est alors le point de départ) ; au tout premier relevé 4G : le dernier relevé connu
  async function baseline(m) {
    const g = m.g4 || {};
    const last = await lastAudit(m.id);
    const lastT = last ? Date.parse(last.imported_at || last.created_at || "") || 0 : 0;
    if (g.base && /^r\d+$/.test(g.base)) {
      if (last && last.source !== "4g" && lastT > (g.at || 0)) return last;
      const a = await reportAudit(Number(g.base.slice(1)));
      if (a) return a;
    }
    return last;
  }

  // ---------------- Un relevé reçu par la 4G ----------------
  // Renvoie "done" (déjà traité), "ok", "gone" (machine supprimée)
  async function applyReport(id, R) {
    const s0 = BA.Store.get();
    const m0 = s0 && s0.machines.find(x => x.id === id);
    if (!m0) return "gone";
    const g0 = m0.g4 || {};
    if ((g0.rid || 0) >= R.id) return "done";
    const expect = g0.base || "";
    const tm = Date.parse(R.received_at) || Date.now();
    const pick = s => s.machines.find(x => x.id === id) || null;
    // fait seulement si personne n'a traité ce relevé, ni changé le relevé de départ entre-temps
    const free = x => ((x.g4 && x.g4.rid) || 0) < R.id && ((x.g4 && x.g4.base) || "") === expect;
    const analyse = BA.EvaDts.parse(R.raw || "");
    const lite = Object.assign({}, analyse); delete lite.raw;

    // Sécurité : le relevé porte le n° de la machine. S'il ne correspond pas à la machine choisie pour ce boîtier
    // (boîtier déplacé sans le dire ici), rien n'est compté : sinon les compteurs d'une autre machine
    // donneraient de fausses ventes. (Certaines machines envoient un n° générique FAS000000001 : pas de contrôle.)
    const norm = v => String(v || "").toUpperCase().replace(/^FAS-?/, "").replace(/[^0-9A-Z]/g, "").replace(/^0+/, "");
    const generic = !analyse.machineId || /^FAS0*1$/i.test(analyse.machineId) || /^FAS$/i.test(analyse.machineId);
    if (!generic && m0.serial && norm(analyse.machineId) && norm(analyse.machineId) !== norm(m0.serial)) {
      BA.Store.update(s => {
        const x = pick(s); if (!x || !free(x)) return;
        BA.Model.addEvent(s, x.num, "BOX_WRONG", { msg: String(analyse.machineId).slice(0, 40), key: "w" + norm(analyse.machineId) });
        x.g4 = Object.assign({}, x.g4, { rid: R.id });
      });
      return "ok";
    }

    if (analyse.g85.present && !analyse.g85.ok) {            // texte abîmé : rien n'est compté
      BA.Store.update(s => { const x = pick(s); if (!x || !free(x)) return; BA.Reel.readBad(s, x.num); x.g4 = Object.assign({}, x.g4, { rid: R.id }); });
      return "ok";
    }
    if (analyse.type !== "audit") {                         // envoi de la machine sans compteurs : événements seulement
      BA.Store.update(s => { const x = pick(s); if (!x || !free(x)) return; BA.Reel.applyEvents(s, x.num, { t: tm, src: "4g", analyse: lite }); x.g4 = Object.assign({}, x.g4, { rid: R.id }); });
      return "ok";
    }
    const audit = BA.EvaDts.toAudit(analyse);
    const ancien = await baseline(m0);
    const diff = BA.EvaDts.compare(ancien, audit);
    const nv = BA.EvaDts.nouveautes(ancien ? ancien.errors : null, audit.errors);
    const nouveaux = diff.baseline ? 0 : nv.eva.length + nv.fas.length + nv.pow.length + nv.activations.length;
    const temps = diff.baseline ? (audit.errors || []).filter(e => e.type === "temp") : nv.temp;
    const appliquer = !diff.baseline && !diff.anomalies && !diff.identique;
    const same = diff.identique && !nouveaux && !temps.length;
    audit.source = "4g";
    audit.delta_count = appliquer ? diff.deltaCount : null;
    audit.delta_value = appliquer ? diff.deltaValue : null;
    const x0 = { t: tm, src: "4g", analyse: lite, audit, ancien: ancien ? { total_count: ancien.total_count } : null, diff, nv };
    let fait = false;
    BA.Store.update(s => {
      const x = pick(s); if (!x || !free(x)) return;
      if (same) BA.Reel.touch(s, x.num, tm, "4g");
      else BA.Reel.applyAudit(s, x.num, x0);
      BA.Model.resolveEvents(s, x.num, "BOX_WRONG");
      x.g4 = { rid: R.id, base: "r" + R.id, at: tm };
      fait = true;
    });
    audits.set(R.id, audit);
    // copie dans la table « audits » (comme un relevé par câble) : point de départ si un câble ou une clé USB sert plus tard
    if (fait && !same && BA.Rs232 && BA.Rs232.saveAudit) {
      try { await BA.Rs232.saveAudit(m0, audit); } catch (e) { console.warn("Relevé 4G → audits :", e.message); }
    }
    return "ok";
  }

  // Relevés pas encore traités, machine par machine, dans l'ordre
  async function processReports() {
    const ids = [...new Set(devices.map(d => d.machine_id))];
    let n = 0;
    for (const id of ids) {
      for (let tour = 0; tour < 20; tour++) {
        const m = machines().find(x => x.id === id);
        if (!m) break;
        const since = (m.g4 && m.g4.rid) || 0;
        const res = await sb().from("device_reports").select("*").eq("machine_id", id).gt("id", since).order("id", { ascending: true }).limit(10);
        if (res.error) throw new Error(res.error.message);
        const list = res.data || [];
        for (const R of list) { const r = await applyReport(id, R); if (r === "ok") n++; if (r === "gone") break; }
        if (list.length < 10) break;
      }
    }
    return n;
  }

  // Alertes des boîtiers : muet, ou n'arrive plus à lire la machine
  function boxAlerts() {
    const s = BA.Store.get(); if (!s) return;
    const now = Date.now();
    const todo = [];
    s.machines.forEach(m => {
      const list = devices.filter(d => d.machine_id === m.id);
      if (!list.length) return;
      const open = code => s.events.some(e => e.num === m.num && e.code === code && !e.resolved);
      const alive = list.some(d => isAlive(d, now));
      const d0 = list.slice().sort((a, b) => seenMs(b) - seenMs(a))[0];
      if (!alive && seenMs(d0) && !open("BOX_SILENT")) todo.push(st => BA.Model.addEvent(st, m.num, "BOX_SILENT", { msg: d0.name || "", when: U().F.dt(seenMs(d0)) }));
      if (alive && open("BOX_SILENT")) todo.push(st => BA.Model.resolveEvents(st, m.num, "BOX_SILENT"));
      // lecture impossible depuis plus de 30 min (le boîtier le dit dans son état)
      const info = (d0 && d0.info) || {};
      const failing = alive && info.stok === false && Number(info.mode || 0) === 0 && info.st && info.st !== "démarrage"
        && (!m.lastSeen || now - m.lastSeen > 30 * MIN);
      if (failing && !open("BOX_FAIL")) todo.push(st => BA.Model.addEvent(st, m.num, "BOX_FAIL", { msg: String(info.st).slice(0, 200) }));
      if ((!alive || info.stok === true) && open("BOX_FAIL")) todo.push(st => BA.Model.resolveEvents(st, m.num, "BOX_FAIL"));
    });
    if (todo.length) BA.Store.update(st => {
      // l'heure actuelle pour les alertes, et les machines retrouvées par leur numéro du moment
      todo.forEach(f => { try { f(st); } catch (e) { console.warn(e); } });
    });
  }

  // Ménage : relevés de plus de 30 jours déjà traités (le relevé de départ de chaque machine est gardé)
  async function cleanup() {
    if (!(BA.Shell && BA.Shell.ctx && BA.Shell.ctx.role === "admin")) return;
    if (Date.now() - lastCleanup < 24 * 60 * MIN) return;
    lastCleanup = Date.now();
    const ids = new Set(devices.map(d => d.machine_id));
    const ms = machines().filter(m => ids.has(m.id));
    if (!ms.length || ms.some(m => !m.g4)) return;
    const keep = Math.min(...ms.map(m => Math.min(m.g4.rid || 0, /^r\d+$/.test(m.g4.base || "") ? Number(m.g4.base.slice(1)) : (m.g4.rid || 0))));
    if (!(keep > 0)) return;
    const old = new Date(Date.now() - 30 * 24 * 60 * MIN).toISOString();
    const res = await sb().from("device_reports").delete().lt("received_at", old).lt("id", keep);
    if (res.error) console.warn("Ménage des relevés 4G :", res.error.message);
  }

  // ---------------- Tour complet (toutes les 60 s, et à la demande) ----------------
  // Un seul tour à la fois ; un tour demandé pendant un autre est refait juste après (rien n'est perdu).
  let current = null, queued = null;
  function refresh(force) {
    if (!CLOUD() || !BA.Store.ready()) return Promise.resolve();
    if (current) {
      if (!force) return current;
      if (!queued) queued = current.then(() => { queued = null; return refresh(true); });
      return queued;
    }
    // tables pas encore créées : on revérifie seulement de temps en temps (ou en ouvrant l'onglet)
    if (installed === false && !force && Date.now() - lastCheck < 15 * MIN) return Promise.resolve();
    current = tour().finally(() => { current = null; });
    return current;
  }
  async function tour() {
    lastCheck = Date.now();
    try {
      if (await loadDevices()) {
        await processReports();
        boxAlerts();
        await cleanup();
      }
      lastError = "";
    } catch (e) {
      lastError = e.message || String(e);
      console.warn("Boîtiers 4G :", lastError);
    } finally {
      redraw();
    }
  }

  function start() {
    if (timer || !CLOUD()) return;
    setTimeout(() => refresh(true), 2500);
    timer = setInterval(() => refresh(false), 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastCheck > 20000) refresh(false); });
  }

  // ---------------- Affichage ----------------
  function signal(rssi) {
    const v = Number(rssi);
    if (!isFinite(v) || v === 99 || v < 0) return "—";
    const k = v >= 20 ? "bx_sig_4" : v >= 15 ? "bx_sig_3" : v >= 10 ? "bx_sig_2" : "bx_sig_1";
    return t(k) + " (" + v + "/31)";
  }
  function ago(ms) {
    if (!ms) return t("bx_never");
    const F = U().F, d = Date.now() - ms;
    return (M.dayKey(ms) === M.dayKey(Date.now()) ? F.time(ms) : F.dt(ms)) + " · " + t("bx_ago", { d: F.age(d) });
  }
  // Petit texte pour les cartes des machines (Dashboard, Détails)
  function tag(m) {
    if (!m || !m.id) return "";
    const list = devices.filter(d => d.machine_id === m.id);
    if (!list.length) return "";
    const d = list.slice().sort((a, b) => seenMs(b) - seenMs(a))[0];
    return " · 📡 " + (isAlive(d) ? t("bx_tag_ok", { h: U().F.time(seenMs(d)) }) : t("bx_tag_silent"));
  }

  function htmlSteps() {
    return `<ol class="bx-steps">
      <li>${E(t("bx_step1"))} <button class="btn petit secondary" data-bx="sql">📋 ${E(t("bx_sql_btn"))}</button></li>
      <li>${E(t("bx_step2"))} <button class="btn petit secondary" data-bx="fn">📋 ${E(t("bx_fn_btn"))}</button></li>
      <li>${E(t("bx_step3"))}</li>
      <li>${E(t("bx_step4"))} <a class="btn petit secondary" href="lilygo/broodautomate_lilygo.zip" download>⬇️ ${E(t("bx_zip"))}</a> <a class="petit" href="https://github.com/lamrich226-cmd/broodautomate/blob/main/lilygo/LISEZMOI.md" target="_blank" rel="noopener">${E(t("bx_guide"))}</a></li>
    </ol>`;
  }
  function htmlList() {
    if (!devices.length) return `<p class="note">— ${E(t("bx_none"))} —</p>`;
    const ms = machines();
    return `<div class="table-scroll"><table class="compact bx-table">
      <thead><tr><th>${E(t("bx_col_box"))}</th><th>${E(t("machine"))}</th><th>${E(t("bx_col_seen"))}</th><th>${E(t("bx_col_signal"))}</th><th>${E(t("bx_col_state"))}</th><th></th></tr></thead>
      <tbody>${devices.map(d => {
        const i = d.info || {};
        const alive = isAlive(d);
        const st = Number(i.mode) === 1 ? t("bx_mode_test") : Number(i.mode) === 2 ? t("bx_mode_loop") : (i.st || "—");
        return `<tr data-bxid="${E(d.id)}">
          <td><b>${E(d.name)}</b><div class="petit">${i.fw ? "v" + E(i.fw) : ""}${i.op ? " · " + E(i.op) : ""}</div></td>
          <td><select class="auto-w" data-bxm="${E(d.id)}">${ms.filter(m => m.id).map(m => `<option value="${E(m.id)}" ${m.id === d.machine_id ? "selected" : ""}>${E(nomM(m))}</option>`).join("")}
            ${ms.some(m => m.id === d.machine_id) ? "" : `<option value="${E(d.machine_id)}" selected>${E(t("bx_unknown_machine", { id: d.machine_id }))}</option>`}</select></td>
          <td>${alive ? `<span class="tag c-ok">🟢 ${E(t("online"))}</span>` : `<span class="tag">${E(t("offline"))}</span>`}<div class="petit">${E(ago(seenMs(d)))}</div></td>
          <td class="nowrap">${E(signal(i.rssi))}</td>
          <td>${i.stok === true ? "✅ " : i.stok === false && Number(i.mode || 0) === 0 ? "⚠️ " : ""}${E(st)}${i.lu != null ? `<div class="petit">${E(t("bx_reads", { n: i.lu, k: i.ko || 0 }))}</div>` : ""}</td>
          <td class="nowrap"><button class="btn petit secondary" data-bxkey="${E(d.id)}" title="${E(t("bx_newkey"))}">🔑</button><button class="btn petit secondary" data-bxdel="${E(d.id)}" title="${E(t("bx_del"))}">🗑</button></td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function htmlAdd() {
    const ms = machines().filter(m => m.id);
    if (!ms.length) return `<div class="alert info">${E(t("rs_no_machine"))}</div>`;
    return `<div class="add-sel-row">
      <label>${E(t("bx_name"))} <input id="bx-name" class="txt-in" value="${E(t("bx_name_def", { n: devices.length + 1 }))}"></label>
      <label>${E(t("machine"))} <select id="bx-machine" class="auto-w">${ms.map(m => `<option value="${E(m.id)}">${E(nomM(m))}</option>`).join("")}</select></label>
      <button class="btn" id="bx-add">➕ ${E(t("bx_add"))}</button>
    </div>`;
  }
  function html() {
    if (!CLOUD()) return `<div class="alert info">${E(t("bx_local"))}</div>`;
    let body;
    if (installed === null) body = `<p class="note">⏳ ${E(t("loading"))}</p>`;
    else if (installed === false) body = `<div class="alert warn">${E(t("bx_not_installed"))}</div>
      <div class="carte-actions wrap-actions"><button class="btn" data-bx="sql">📋 ${E(t("bx_sql_btn"))}</button><button class="btn secondary" data-bx="check">🔄 ${E(t("bx_check"))}</button></div>`;
    else body = `${htmlList()}<h3>➕ ${E(t("bx_add_title"))}</h3><p class="note">${E(t("bx_add_note"))}</p>${htmlAdd()}`;
    return `<p class="note">${E(t("bx_intro"))}</p>
      ${htmlSteps()}
      ${lastError ? `<div class="alert err">${E(t("bx_error", { e: lastError }))}</div>` : ""}
      <div class="card">${body}</div>`;
  }

  function mount(el) { _el = el; redraw(true); if (installed !== true || Date.now() - lastCheck > 20000) refresh(true); }
  function redraw(force) {
    if (!_el || !document.contains(_el)) return;
    // pas pendant une saisie (case, liste), une fenêtre ouverte ou un clic
    const a = document.activeElement;
    const editing = a && _el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
    const busy = editing || document.querySelector(".modal-back") || (BA.Shell && BA.Shell.clicking && BA.Shell.clicking());
    if (busy && !force) { clearTimeout(redrawT); redrawT = setTimeout(() => redraw(), 600); return; }   // un peu plus tard
    clearTimeout(redrawT);
    _el.innerHTML = html();
    bind();
  }
  let redrawT = null;

  // ---------------- Fenêtres ----------------
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* rien */ }
      ta.remove();
    }
    if (btn) btn.textContent = "✅ " + t("bx_copied");
  }
  function sqlDialog() {
    U().confirmDialog({
      title: "📋 " + t("bx_sql_title"),
      html: `<p>${E(t("bx_sql_text"))}</p>
        <ol class="sql-steps">${SQL.map((q, i) => `<li><code>${E(q)}</code><button class="btn petit" data-copy-sql="${i}">📋 ${E(t("bx_copy"))}</button></li>`).join("")}</ol>
        <p class="note">${E(t("bx_sql_note"))}</p>`,
      ok: "✔ " + t("bx_sql_done"), cancel: t("bx_close"),
      onOk: () => refresh(true)
    });
    document.querySelectorAll("[data-copy-sql]").forEach(b => b.onclick = () => copy(SQL[Number(b.dataset.copySql)], b));
  }
  async function fnDialog() {
    let code = "";
    try { const r = await fetch("supabase/functions/ingest/index.ts", { cache: "no-store" }); if (r.ok) code = await r.text(); } catch (e) { /* rien */ }
    U().confirmDialog({
      title: "📋 " + t("bx_fn_title"),
      html: `<ol class="bx-steps">${["bx_fn_1", "bx_fn_2", "bx_fn_3", "bx_fn_4"].map(k => `<li>${E(t(k))}</li>`).join("")}</ol>
        ${code ? `<textarea class="zone-texte" rows="10" readonly id="bx-fn-code">${E(code)}</textarea>
        <div class="carte-actions"><button class="btn" id="bx-fn-copy">📋 ${E(t("bx_fn_copy"))}</button></div>`
          : `<div class="alert warn">${E(t("bx_fn_missing"))}</div>`}
        <p class="note">${E(t("bx_fn_url", { u: FN_URL() }))}</p>`,
      ok: "✔ OK", cancel: t("bx_close"), onOk: () => {}
    });
    const b = document.getElementById("bx-fn-copy");
    if (b) b.onclick = () => copy(code, b);
  }
  function keyDialog(name, key) {
    const line = `#define DEVICE_KEY  "${key}"`;
    U().confirmDialog({
      title: "🔑 " + t("bx_key_title", { n: name }),
      html: `<p>${E(t("bx_key_text"))}</p>
        <pre class="bx-key" id="bx-key-line">${E(line)}</pre>
        <div class="carte-actions"><button class="btn" id="bx-key-copy">📋 ${E(t("bx_copy"))}</button></div>
        <div class="alert warn">${E(t("bx_key_once"))}</div>`,
      ok: "✔ " + t("bx_key_ok"), cancel: t("bx_close"), onOk: () => {}
    });
    const b = document.getElementById("bx-key-copy");
    if (b) b.onclick = () => copy(line, b);
  }

  // ---------------- Clé secrète ----------------
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  function newKey() { const a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function sha256(txt) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt))); }

  async function addBox() {
    const name = String((document.getElementById("bx-name") || {}).value || "").replace(/[<>"'`]/g, "").trim().slice(0, 40);
    const mid = (document.getElementById("bx-machine") || {}).value;
    if (!name || !mid) { U().toast("⚠️ " + t("bx_err_fields")); return; }
    const key = newKey();
    try {
      const res = await sb().from("devices").insert({ name, machine_id: mid, key_hash: await sha256(key) }).select("id");
      if (res.error) throw new Error(res.error.message);
    } catch (e) { U().toast("⚠️ " + t("bx_error", { e: e.message })); return; }
    lastKey = key;
    await refresh(true);
    keyDialog(name, key);
  }
  async function renewKey(id) {
    const d = devices.find(x => x.id === id); if (!d) return;
    U().confirmDialog({
      title: "🔑 " + t("bx_newkey_title", { n: d.name }),
      html: `<div class="alert warn">${E(t("bx_newkey_text"))}</div>`,
      ok: "🔑 " + t("bx_newkey_ok"),
      onOk: async () => {
        const key = newKey();
        const res = await sb().from("devices").update({ key_hash: await sha256(key) }).eq("id", id);
        if (res.error) { U().toast("⚠️ " + t("bx_error", { e: res.error.message })); return; }
        keyDialog(d.name, key);
      }
    });
  }
  function delBox(id) {
    const d = devices.find(x => x.id === id); if (!d) return;
    U().confirmDialog({
      title: "🗑 " + t("bx_del_title", { n: d.name }),
      html: `<div class="alert warn">${E(t("bx_del_text"))}</div>`,
      ok: "🗑 " + t("bx_del_ok"), danger: true,
      onOk: async () => {
        const res = await sb().from("devices").delete().eq("id", id);
        if (res.error) { U().toast("⚠️ " + t("bx_error", { e: res.error.message })); return; }
        U().toast("✅ " + t("bx_deleted"));
        refresh(true);
      }
    });
  }
  async function moveBox(id, mid) {
    const res = await sb().from("devices").update({ machine_id: mid }).eq("id", id);
    if (res.error) { U().toast("⚠️ " + t("bx_error", { e: res.error.message })); return; }
    U().toast("✅ " + t("saved"));
    refresh(true);
  }

  function bind() {
    const el = _el; if (!el) return;
    el.querySelectorAll("[data-bx]").forEach(b => b.onclick = () => {
      const a = b.dataset.bx;
      if (a === "sql") sqlDialog();
      else if (a === "fn") fnDialog();
      else if (a === "check") refresh(true);
    });
    const add = el.querySelector("#bx-add"); if (add) add.onclick = () => addBox();
    el.querySelectorAll("[data-bxdel]").forEach(b => b.onclick = () => delBox(b.dataset.bxdel));
    el.querySelectorAll("[data-bxkey]").forEach(b => b.onclick = () => renewKey(b.dataset.bxkey));
    el.querySelectorAll("[data-bxm]").forEach(s => s.onchange = () => moveBox(s.dataset.bxm, s.value));
  }

  BA.Boitiers = {
    SQL, start, refresh, mount, redraw, tag,
    alive(id, now) { return !!id && devices.some(d => d.machine_id === id && isAlive(d, now)); },
    has(id) { return !!id && devices.some(d => d.machine_id === id); },
    devices: () => devices.slice(),
    installed: () => installed,
    // pour les essais
    _sha256: sha256, _lastKey: () => lastKey, _process: processReports
  };
})();
