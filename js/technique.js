// ============================================================
// BROODAUTOMATE v5.12 — Page « Technique » (BA.Technique) — admin seulement
// Tout ce qui sert au diagnostic et à l'installation, rangé en 5 onglets :
//   📡 Boîtiers 4G : chaque boîtier en détail (programme, mode, signal, lectures, message, porte,
//      données 4G estimées), ajouter / nouvelle clé / supprimer, réglage « Lire maintenant »,
//      « Lire toutes les machines », commandes SQL et fonction « ingest » (BA.Boitiers) ;
//   🏭 Machines : ajouter, renuméroter, supprimer une machine (BA.Rs232) ;
//   🔌 Câble et clé USB : câble entre ce PC et une machine, relevés reçus, journal du câble,
//      import d'un relevé de clé USB, test d'un texte EVA-DTS (BA.Rs232) ;
//   📜 Journal : ce que les boîtiers ont envoyé (texte complet et décodé de chaque envoi),
//      alertes de communication, demandes « Lire maintenant » ;
//   🖥 Système : version, connexion, sauvegarde des données, copies de nuit, notifications.
// La page « Connexion RS232 » ne garde que les boîtiers et leur état (BA.Boitiers.summary).
// Lecture seule ici (Journal, Système) : rien ne change le stock, les machines ni les réglages.
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG;
  const t = (k, v) => BA.I18n.t(k, v);
  const U = () => BA.UI;
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CLOUD = () => !!(BA.DB && BA.DB.isReady && BA.DB.isReady());
  const sb = () => BA.DB.raw();
  const MIN = 60000;
  const machines = () => (BA.Store.get() || { machines: [] }).machines;
  const nomM = m => m ? "#" + m.num + " — " + (m.street || m.id) + (m.city ? ", " + m.city : "") : "—";
  const absente = (err, table) => !!err && new RegExp(table, "i").test(err.message || "") && /(does not exist|could not find|schema cache|relation)/i.test(err.message || "");
  // « 14:05:12 » aujourd'hui, sinon « 01/11 19:40:05 » (les secondes servent à suivre un événement puis sa relecture)
  const quand = ms => { const F = U().F; return ms ? (BA.Model.dayKey(ms) === BA.Model.dayKey(Date.now()) ? F.clock(ms) : F.dt(ms) + F.clock(ms).slice(5)) : "—"; };

  // ---------------- Onglets ----------------
  const TABS = [["boxes", "📡", "tq_tab_boxes"], ["machines", "🏭", "tq_tab_machines"], ["cable", "🔌", "tq_tab_cable"], ["journal", "📜", "tq_tab_journal"], ["system", "🖥", "tq_tab_system"], ["raw", "🧾", "tq_tab_raw"]];
  let _el = null, _tab = null;                              // _tab : null tant que rien n'est choisi
  const defaut = () => !machines().length ? "machines" : CLOUD() ? "boxes" : "cable";

  function render(el) {
    _el = el;
    const tab = _tab || defaut();
    el.innerHTML = `
      <h2>🔧 ${E(t("nav_technique"))}</h2>
      <p class="note tq-intro">${E(t("tq_intro"))}</p>
      <div class="seg tabs tq-tabs" role="tablist" aria-label="${E(t("nav_technique"))}">${TABS.map(([id, ic, k]) =>
        `<button type="button" role="tab" id="tq-tab-${id}" data-tq-tab="${id}" aria-controls="tq-pane-${id}" class="${id === tab ? "active" : ""}" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}">${ic} ${E(t(k))}</button>`).join("")}</div>
      ${TABS.map(([id]) => `<section class="tq-pane" id="tq-pane-${id}" data-pane="${id}" role="tabpanel" aria-labelledby="tq-tab-${id}">${
        id === "boxes" ? `<div id="rs-boitiers"></div>` : id === "journal" ? `<div id="tq-journal"></div>` : id === "system" ? `<div id="tq-system"></div>` : id === "raw" ? `<div id="tq-raw-pane"></div>` : ""}</section>`).join("")}`;
    const bar = el.querySelector(".tq-tabs");
    bar.querySelectorAll("[data-tq-tab]").forEach(b => b.onclick = () => show(b.dataset.tqTab));
    // clavier : flèches gauche / droite, début / fin (comme des onglets)
    bar.onkeydown = e => {
      const ids = TABS.map(x => x[0]), i = ids.indexOf(_tab);
      const j = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i - 1 + ids.length) % ids.length : e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); show(ids[j]); const b = bar.querySelector(`[data-tq-tab="${ids[j]}"]`); if (b) b.focus();
    };
    BA.Rs232.renderPanes(el);                                  // onglets « Câble et clé USB » et « Machines »
    if (BA.Boitiers) BA.Boitiers.mount(el.querySelector("#rs-boitiers"));
    show(tab);
  }

  function show(tab) {
    _tab = TABS.some(x => x[0] === tab) ? tab : "boxes";
    if (!_el || !document.contains(_el)) return;
    _el.querySelectorAll("[data-tq-tab]").forEach(b => { const on = b.dataset.tqTab === _tab; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
    _el.querySelectorAll(".tq-pane").forEach(p => { p.hidden = p.dataset.pane !== _tab; });
    if (_tab === "journal") loadJournal(false);
    if (_tab === "system") loadSystem(false);
    if (_tab === "raw") drawRaw();
  }
  const visible = tab => !!_el && document.contains(_el) && _tab === tab && BA.Shell && BA.Shell.state.view === "technique";

  // ---------------- 📜 Journal ----------------
  // Les 30 derniers envois des boîtiers (table device_reports, texte complet), les alertes de communication
  // et les 20 dernières demandes « Lire maintenant ». Relu en ouvrant l'onglet, avec « Actualiser », et chaque minute.
  const J = { at: 0, busy: false, reports: null, demandes: null, err: "" };
  const parsed = new Map();                                  // n° d'envoi → résumé décodé (décodé une seule fois)
  const TECH = ["BOX_SILENT", "BOX_FAIL", "BOX_WRONG", "READ_FAIL", "READ_BAD", "READ_FIRST", "COUNTERS_DOWN"];

  async function loadJournal(force) {
    if (!CLOUD()) { drawJournal(); return; }
    if (J.busy || (!force && J.reports && Date.now() - J.at < MIN)) { drawJournal(); return; }
    // tables des boîtiers pas encore créées (commandes SQL) : rien à lire (pas de requête inutile)
    if (BA.Boitiers && BA.Boitiers.installed() === false) { J.reports = false; J.demandes = null; J.at = Date.now(); drawJournal(); return; }
    J.busy = true; drawJournal();
    try {
      const r = await sb().from("device_reports").select("id, device_id, machine_id, role, raw, received_at").order("id", { ascending: false }).limit(30);
      if (r.error) { if (absente(r.error, "device_reports")) J.reports = false; else throw new Error(r.error.message); }
      else J.reports = r.data || [];
      if (BA.Boitiers && BA.Boitiers.demInstalled() === false) J.demandes = false;
      else {
        const d = await sb().from("ba_demandes").select("id, device_id, machine_id, statut, message, cree_at, prise_at, fini_at").order("id", { ascending: false }).limit(20);
        J.demandes = d.error ? (absente(d.error, "ba_demandes") ? false : null) : (d.data || []);
      }
      J.err = "";
    } catch (e) { J.err = e.message || String(e); }
    finally { J.busy = false; J.at = Date.now(); drawJournal(); }
  }

  // Résumé d'un envoi (décodé avec le même lecteur EVA-DTS que le câble)
  function resume(R) {
    if (parsed.has(R.id)) return parsed.get(R.id);
    const a = BA.EvaDts.parse(R.raw || "");
    const nEv = (a.events || []).length + (a.fasErrors || []).length + (a.powerCuts || []).length;
    const r = { a, nEv, size: (R.raw || "").length };
    parsed.set(R.id, r);
    if (parsed.size > 200) parsed.delete(parsed.keys().next().value);
    return r;
  }
  function contenu(x) {
    const a = x.a, F = U().F;
    if (a.g85 && a.g85.present && !a.g85.ok) return "❌ " + t("tq_j_bad");
    const bits = [];
    if (a.type === "audit") bits.push("✅ " + t("tq_j_audit"), a.va1 ? t("tq_j_sales", { n: F.num(a.va1.countTotal) }) : "");
    else if (a.type === "evenements") bits.push("📨 " + t("tq_j_events"));
    else bits.push(t("tq_j_empty"));
    if (a.temperatures && a.temperatures.length) bits.push(t("tq_j_temp", { t: F.num(a.temperatures[0].celsius, 1) }));
    if (x.nEv) bits.push(t("tq_j_nev", { n: x.nEv }));
    return bits.filter(Boolean).join(" · ");
  }
  function traite(R) {
    const m = machines().find(x => x.id === R.machine_id);
    if (!m) return "🗑 " + t("tq_j_gone");
    return ((m.g4 && m.g4.rid) || 0) >= R.id ? "✅ " + t("tq_j_done") : "⏳ " + t("tq_j_wait");
  }
  const ko = n => U().F.num(n / 1024, 1) + " Ko";
  const L = k => `data-label="${E(t(k))}"`;          // téléphone : le tableau devient des cartes (titre de chaque case)

  function htmlReports() {
    if (J.reports === false || (BA.Boitiers && BA.Boitiers.installed() === false)) return `<div class="alert info">${E(t("bxs_not_installed"))}</div>`;
    if (J.reports === null) return `<p class="note">⏳ ${E(t("loading"))}</p>`;
    if (!J.reports.length) return `<p class="note">— ${E(t("tq_j_none"))} —</p>`;
    const nm = id => (BA.Boitiers && BA.Boitiers.nom(id)) || "—";
    return `<div class="table-scroll"><table class="compact tq-table tq-reports tbl-tel">
      <thead><tr><th>${E(t("tq_j_col_at"))}</th><th>${E(t("tq_j_col_box"))}</th><th>${E(t("machine"))}</th><th>${E(t("tq_j_col_origin"))}</th><th>${E(t("tq_j_col_content"))}</th><th>${E(t("tq_j_col_size"))}</th><th>${E(t("tq_j_col_done"))}</th><th></th></tr></thead>
      <tbody>${J.reports.map(R => {
        const x = resume(R), m = machines().find(y => y.id === R.machine_id);
        return `<tr data-tqr="${R.id}">
          <td class="nowrap" ${L("tq_j_col_at")}>${E(quand(Date.parse(R.received_at)))}</td>
          <td ${L("tq_j_col_box")}>${E(nm(R.device_id))}</td>
          <td ${L("machine")}>${E(m ? "#" + m.num + " " + (m.street || "") : R.machine_id)}</td>
          <td class="nowrap" ${L("tq_j_col_origin")}>${E(R.role === "machine" ? t("tq_j_from_machine") : t("tq_j_from_box"))}</td>
          <td ${L("tq_j_col_content")}>${E(contenu(x))}</td>
          <td class="nowrap" ${L("tq_j_col_size")}>${E(ko(x.size))}</td>
          <td class="nowrap" ${L("tq_j_col_done")}>${E(traite(R))}</td>
          <td data-label=""><button type="button" class="btn petit secondary" data-tqview="${R.id}">🔍 ${E(t("tq_j_view"))}</button></td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function htmlAlertes() {
    const s = BA.Store.get(), F = U().F;
    const list = s.events.filter(e => TECH.includes(e.code)).slice(0, 20);
    if (!list.length) return `<p class="note">— ${E(t("tq_j_alerts_none"))} —</p>`;
    return `<div class="table-scroll"><table class="compact tq-table tbl-tel">
      <thead><tr><th>${E(t("tq_j_col_at"))}</th><th>${E(t("machine"))}</th><th>${E(t("tq_j_col_alert"))}</th><th>${E(t("tq_j_col_state"))}</th></tr></thead>
      <tbody>${list.map(e => { const m = s.machines.find(x => x.num === e.num); return `<tr>
        <td class="nowrap" ${L("tq_j_col_at")}>${E(F.dt(e.t))}</td><td ${L("machine")}>${E(m ? "#" + m.num + " " + (m.street || "") : "#" + e.num)}</td>
        <td ${L("tq_j_col_alert")}>${E(U().evTitle(s, e))}</td>
        <td ${L("tq_j_col_state")}>${e.resolved ? `<span class="tag c-ok">${E(t("ev_resolved"))} ${E(e.resolvedAt ? F.dt(e.resolvedAt) : "")}</span>` : `<span class="tag c-active">${E(t("ev_active"))}</span>`}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function htmlDemandes() {
    if (J.demandes === false) return `<p class="note">${E(t("bx_read_install"))}</p>`;
    if (!J.demandes) return J.reports === null ? "" : `<p class="note">—</p>`;
    if (!J.demandes.length) return `<p class="note">— ${E(t("tq_j_dem_none"))} —</p>`;
    const F = U().F, at = v => v ? quand(Date.parse(v)) : "—";
    const etat = x => x.statut === "faite" ? "✅ " + t("tq_j_dem_done", { h: at(x.fini_at) })
      : x.statut === "echec" ? "⚠️ " + t("tq_j_dem_ko", { e: x.message || "—" })
      : x.statut === "prise" ? "📥 " + t("tq_j_dem_taken", { h: at(x.prise_at) })
      : "⏳ " + t("tq_j_dem_wait");
    const duree = x => { const a = Date.parse(x.cree_at), b = Date.parse(x.fini_at || ""); return a && b && b >= a ? F.age(b - a) : "—"; };
    return `<div class="table-scroll"><table class="compact tq-table tbl-tel">
      <thead><tr><th>${E(t("tq_j_col_asked"))}</th><th>${E(t("tq_j_col_box"))}</th><th>${E(t("tq_j_col_state"))}</th><th>${E(t("tq_j_col_wait"))}</th></tr></thead>
      <tbody>${J.demandes.map(x => `<tr><td class="nowrap" ${L("tq_j_col_asked")}>${E(at(x.cree_at))}</td><td ${L("tq_j_col_box")}>${E((BA.Boitiers && BA.Boitiers.nom(x.device_id)) || "—")}</td>
        <td ${L("tq_j_col_state")}>${E(etat(x))}</td><td class="nowrap" ${L("tq_j_col_wait")}>${E(duree(x))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function drawJournal() {
    const z = _el && _el.querySelector("#tq-journal"); if (!z) return;
    if (!CLOUD()) { z.innerHTML = `<div class="alert info">${E(t("tq_j_local"))}</div><h3>⚠️ ${E(t("tq_j_alerts"))}</h3>${htmlAlertes()}`; return; }
    const F = U().F;
    z.innerHTML = `
      <div class="tq-bar"><button type="button" class="btn secondary" id="tq-j-refresh" ${J.busy ? "disabled" : ""}>🔄 ${E(t("tq_j_refresh"))}</button>
        <span class="petit">${J.busy ? "⏳ " + E(t("loading")) : J.at ? E(t("tq_j_updated", { h: F.clock(J.at) })) : ""}</span></div>
      ${J.err ? `<div class="alert err">${E(t("tq_j_err", { e: J.err }))}</div>` : ""}
      <h3>📥 ${E(t("tq_j_reports"))}</h3>
      <p class="note">${E(t("tq_j_reports_note"))}</p>
      ${htmlReports()}
      <h3>⚠️ ${E(t("tq_j_alerts"))}</h3>
      <p class="note">${E(t("tq_j_alerts_note"))}</p>
      ${htmlAlertes()}
      <h3>📡 ${E(t("tq_j_dem"))}</h3>
      ${htmlDemandes()}`;
    const b = z.querySelector("#tq-j-refresh"); if (b) b.onclick = () => loadJournal(true);
    z.querySelectorAll("[data-tqview]").forEach(x => x.onclick = () => voir(Number(x.dataset.tqview)));
  }

  // Fenêtre « 🔍 Voir » : tout ce que contient un envoi, décodé, puis le texte reçu
  function voir(id) {
    const R = (J.reports || []).find(x => x.id === id); if (!R) return;
    const x = resume(R), a = x.a, F = U().F, D = BA.EvaDts;
    const m = machines().find(y => y.id === R.machine_id);
    const dte = (d, h) => (D.formatDate && D.formatDate(d, h)) || [d, h].filter(Boolean).join(" ") || "—";
    const evs = [].concat(
      (a.events || []).map(e => { const d = BA.Alertes ? BA.Alertes.decrire(e.code) : null; return { k: e.code, txt: d ? d.titre : "", when: dte(e.date, e.time), extra: e.active === true ? t("tq_j_ev_active") : e.count > 1 ? "×" + e.count : "" }; }),
      (a.fasErrors || []).map(e => { const d = BA.Alertes ? BA.Alertes.fas(e.code, e.sous) : null; return { k: "FAS " + e.code + (e.sous ? "/" + e.sous : ""), txt: d ? d.titre : "", when: dte(e.date, e.time), extra: e.count > 1 ? "×" + e.count : "" }; }),
      (a.powerCuts || []).map(c => ({ k: "⚡", txt: t("tq_j_powercut"), when: c.off ? dte(c.off.date, c.off.time) : "—", extra: c.on ? "→ " + dte(c.on.date, c.on.time) : "" })));
    const md = String(a.machineDate || "").split(" ");
    const lignes = [
      [t("tq_j_col_at"), quand(Date.parse(R.received_at))],
      [t("tq_j_col_box"), (BA.Boitiers && BA.Boitiers.nom(R.device_id)) || "—"],
      [t("machine"), m ? nomM(m) : R.machine_id],
      [t("tq_j_col_origin"), R.role === "machine" ? t("tq_j_from_machine") : t("tq_j_from_box")],
      [t("tq_j_col_content"), contenu(x)],
      [t("rs_d_id"), a.machineId || "—"],
      [t("rs_d_model"), [a.machineModel, a.logiciel].filter(Boolean).join(" / ") || "—"],
      [t("rs_d_clock"), dte(md[0], md[1])],
      [t("rs_d_sales"), a.va1 ? t("rs_total", { n: a.va1.countTotal, v: F.eur(a.va1.valueTotal) }) : "—"],
      [t("rs_d_sels"), String((a.selections || []).length)],
      [t("rs_d_temp"), a.temperatures && a.temperatures.length ? a.temperatures.slice(0, 4).map(v => F.num(v.celsius, 1) + " °C (" + dte(v.date, v.time) + ")").join(" · ") : "—"],
      [t("rs_d_g85"), a.g85 && a.g85.present ? (a.g85.ok ? "✅ " + t("rs_g85_ok") : "❌ " + t("rs_g85_bad")) : t("rs_g85_none")],
      [t("tq_j_col_size"), ko(x.size)]
    ];
    U().confirmDialog({
      title: "🔍 " + E(t("tq_j_dlg_title", { d: quand(Date.parse(R.received_at)), b: (BA.Boitiers && BA.Boitiers.nom(R.device_id)) || "—" })),   // le titre est du HTML : nom du boîtier échappé
      html: `<dl class="bx-dl tq-dl">${lignes.map(([k, v]) => `<div><dt>${E(k)}</dt><dd>${E(v)}</dd></div>`).join("")}</dl>
        <h3>${E(t("tq_j_dlg_events"))} (${evs.length})</h3>
        ${evs.length ? `<ul class="tq-evs">${evs.slice(0, 60).map(e => `<li><b>${E(e.k)}</b> ${E(e.txt)} <span class="petit">· ${E(e.when)}${e.extra ? " · " + E(e.extra) : ""}</span></li>`).join("")}</ul>` : `<p class="note">—</p>`}
        ${BA.EvaTrad && R.raw ? `<h3>${E(t("tq_j_dlg_lines"))}</h3><p class="note">${E(t("tq_j_dlg_lines_note"))}</p>
          <div class="table-scroll tq-trad"><table class="compact tq-table"><thead><tr><th>${E(t("tq_j_dlg_l_raw"))}</th><th>${E(t("tq_j_dlg_l_txt"))}</th></tr></thead>
          <tbody>${BA.EvaTrad.lignes(R.raw).map(l => `<tr><td><code>${E(l.raw)}</code></td><td>${E(l.txt)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        <h3>${E(t("tq_j_dlg_raw"))}</h3>
        <textarea class="zone-texte" rows="10" readonly id="tq-raw">${E(R.raw || "")}</textarea>
        <div class="carte-actions"><button type="button" class="btn secondary" id="tq-raw-copy">📋 ${E(t("tq_j_copy"))}</button></div>`,
      ok: "✔ OK", cancel: t("bx_close"), onOk: () => {}
    });
    const c = document.getElementById("tq-raw-copy");
    if (c) c.onclick = async () => {
      try { await navigator.clipboard.writeText(R.raw || ""); }
      catch (e) { const ta = document.getElementById("tq-raw"); if (ta) { ta.select(); try { document.execCommand("copy"); } catch (e2) { /* rien */ } } }
      c.textContent = "✅ " + t("bx_copied");
    };
  }

  // ---------------- 🧾 Flux brut (v5.15) ----------------
  // Les envois automatiques du boîtier sont allégés (seulement ce que Broodautomate utilise). Ici, à la demande :
  // un relevé COMPLET, tel que la machine l'a donné, affiché ligne par ligne avec sa traduction. Jamais automatique.
  // La demande passe par ba_demandes (comme « Lire maintenant », avec brut = vrai) ; le boîtier la prend au passage suivant.
  const FB = { dev: "", dem: null, rep: null, err: "", busy: false, lastCheck: 0 };
  const fbBoxes = () => (BA.Boitiers && BA.Boitiers.liste ? BA.Boitiers.liste() : []);
  function drawRaw() {
    const z = _el && _el.querySelector("#tq-raw-pane"); if (!z) return;
    // pas pendant un clic ni pendant qu'on lit le tableau : on ne redessine que si l'état a changé
    if (!CLOUD()) { z.innerHTML = `<p class="note">${E(t("tq_raw_local"))}</p>`; return; }
    const boxes = fbBoxes();
    if (!FB.dev || !boxes.some(b => b.id === FB.dev)) FB.dev = boxes[0] ? boxes[0].id : "";
    const dem = FB.dem && BA.Boitiers.demandeDe(FB.dev);
    const cur = dem && FB.dem && dem.id === FB.dem.id ? dem : FB.dem;
    const pend = !!cur && !FB.rep && !FB.err && (cur.statut === "attente" || cur.statut === "prise");
    const F = U().F, at = v => F.time(Date.parse(v) || Date.now());
    let etat = "";
    if (FB.err) etat = "⚠️ " + t("tq_raw_fail", { e: FB.err });
    else if (FB.rep) etat = "✅ " + t("tq_raw_done", { h: at(FB.rep.received_at), n: ko((FB.rep.raw || "").length), l: BA.EvaTrad ? BA.EvaTrad.lignes(FB.rep.raw).length : 0 });
    else if (pend) etat = cur.statut === "prise" ? "📥 " + t("tq_raw_taken") : "⏳ " + t("tq_raw_wait", { h: at(cur.cree_at), d: BA.Boitiers.delai() });
    else etat = t("tq_raw_none");
    const inst = BA.Boitiers.demInstalled();
    const vivant = !!FB.dev && BA.Boitiers.enLigne(FB.dev);
    const off = !boxes.length ? t("tq_raw_nobox") : inst !== true ? t("tq_raw_nosql") : !vivant ? t("tq_raw_offline") : "";
    const html = `
      <p class="note">${E(t("tq_raw_intro"))}</p>
      <div class="carte-actions tq-raw-bar">
        ${boxes.length > 1 ? `<label>${E(t("tq_raw_box"))} <select id="tq-raw-box">${boxes.map(b => `<option value="${E(b.id)}" ${b.id === FB.dev ? "selected" : ""}>${E(b.name)}</option>`).join("")}</select></label>` : boxes.length ? `<span class="petit">📡 ${E(boxes[0].name)}</span>` : ""}
        <button type="button" class="btn" id="tq-raw-go" ${pend || off || FB.busy ? "disabled" : ""} title="${E(off || t("tq_raw_title"))}">🧾 ${E(t("tq_raw_btn"))}</button>
        <span class="petit" id="tq-raw-state">${E(off && !FB.rep ? off : etat)}</span>
      </div>
      ${FB.rep ? `<div class="table-scroll tq-trad"><table class="compact tq-table"><thead><tr><th>${E(t("tq_j_dlg_l_raw"))}</th><th>${E(t("tq_j_dlg_l_txt"))}</th></tr></thead>
        <tbody>${BA.EvaTrad ? BA.EvaTrad.lignes(FB.rep.raw).map(l => `<tr><td><code>${E(l.raw)}</code></td><td>${E(l.txt)}</td></tr>`).join("") : ""}</tbody></table></div>
        <div class="carte-actions"><button type="button" class="btn secondary" id="tq-raw-copy">📋 ${E(t("tq_j_copy"))}</button></div>` : ""}`;
    if (z.dataset.sig === html) return;                       // rien de changé : pas de redessin (le tableau reste où on le lit)
    z.dataset.sig = html; z.innerHTML = html;
    const go = z.querySelector("#tq-raw-go"); if (go) go.onclick = askRaw;
    const sel = z.querySelector("#tq-raw-box"); if (sel) sel.onchange = () => { FB.dev = sel.value; FB.dem = null; FB.rep = null; FB.err = ""; drawRaw(); };
    const cp = z.querySelector("#tq-raw-copy");
    if (cp) cp.onclick = async () => {
      try { await navigator.clipboard.writeText(FB.rep.raw || ""); }
      catch (e) { const ta = document.createElement("textarea"); ta.value = FB.rep.raw || ""; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) { /* rien */ } ta.remove(); }
      cp.textContent = "✅ " + t("bx_copied");
    };
  }
  async function askRaw() {
    if (FB.busy || !FB.dev) return;
    FB.busy = true; FB.rep = null; FB.err = ""; drawRaw();
    try { FB.dem = await BA.Boitiers.readNow(FB.dev, { brut: true }); if (!FB.dem) FB.err = t("tq_raw_notsent"); }
    catch (e) { FB.err = e.message || String(e); }
    finally { FB.busy = false; drawRaw(); }
  }
  // Toutes les 4 s tant qu'une demande de flux brut est en cours : la demande est-elle finie ? Si oui, on lit le relevé reçu.
  async function pollRaw() {
    if (!FB.dem || FB.rep || FB.err || FB.busy || !FB.dev || Date.now() - FB.lastCheck < 4000) return;
    FB.lastCheck = Date.now();
    const d = BA.Boitiers.demandeDe(FB.dev);
    if (!d || d.id !== FB.dem.id) return;
    if (d.statut === "echec") { FB.err = d.message || "—"; drawRaw(); return; }
    if (d.statut !== "faite") { drawRaw(); return; }
    FB.busy = true;
    try {
      // le relevé complet est le plus long envoi du boîtier depuis la demande (les envois automatiques sont allégés)
      const r = await sb().from("device_reports").select("id, raw, received_at, role").eq("device_id", FB.dev).gte("received_at", FB.dem.cree_at).order("id", { ascending: false }).limit(10);
      if (r.error) throw new Error(r.error.message);
      const best = (r.data || []).filter(x => x.role !== "machine").sort((a, b) => (b.raw || "").length - (a.raw || "").length)[0];
      if (best) FB.rep = best; else FB.err = t("tq_raw_notfound");
    } catch (e) { FB.err = e.message || String(e); }
    finally { FB.busy = false; drawRaw(); }
  }

  // ---------------- 🖥 Système ----------------
  const S = { at: 0, busy: false, copies: undefined, notifs: undefined, err: "" };
  async function loadSystem(force) {
    if (!CLOUD()) { drawSystem(); return; }
    if (S.busy || (!force && S.at && Date.now() - S.at < 2 * MIN)) { drawSystem(); return; }
    S.busy = true; drawSystem();
    try {
      // une table absente (commandes SQL pas encore faites) n'est revérifiée qu'avec « Tout revérifier »
      if (force || S.copies !== false) {
        const c = await sb().from("ba_state_backup").select("jour, ligne, cree_at").order("jour", { ascending: false }).limit(40);
        S.copies = c.error ? (absente(c.error, "ba_state_backup") ? false : { err: c.error.message }) : (c.data || []);
      }
      if (force || S.notifs !== false) {
        const n = await sb().from("ba_notifications").select("id, type, titre, cree_at, envoye_at").order("id", { ascending: false }).limit(5);
        S.notifs = n.error ? (absente(n.error, "ba_notifications") ? false : { err: n.error.message }) : (n.data || []);
      }
      if (force || S.conso === undefined || (S.conso && S.conso.ok)) {
        const r = await sb().rpc("ba_conso");
        S.conso = r.error ? (absente(r.error, "ba_conso") ? false : { err: r.error.message }) : { ok: true, d: r.data || {} };
      }
      S.err = "";
    } catch (e) { S.err = e.message || String(e); }
    finally { S.busy = false; S.at = Date.now(); drawSystem(); }
  }
  function txtCopies() {
    const F = U().F, c = S.copies;
    if (c === undefined) return S.busy ? "⏳" : "—";
    if (c === false) return t("tq_s_copies_missing");
    if (c.err) return "⚠️ " + c.err;
    if (!c.length) return t("tq_s_copies_none");
    const nuits = new Set(c.map(x => x.jour)).size, last = c.reduce((a, x) => Math.max(a, Date.parse(x.cree_at) || 0), 0);
    return t("tq_s_copies_v", { n: nuits, d: last ? F.dt(last) : c[0].jour });
  }
  function txtNotifs() {
    const F = U().F, n = S.notifs;
    if (n === undefined) return S.busy ? "⏳" : "—";
    if (n === false) return t("tq_s_notif_missing");
    if (n.err) return "⚠️ " + n.err;
    if (!n.length) return t("tq_s_notif_none");
    const x = n[0];
    return t("tq_s_notif_last", { d: F.dt(Date.parse(x.cree_at)), t: x.titre }) + " · " + (x.envoye_at ? t("tq_s_notif_sent") : t("tq_s_notif_notsent"));
  }
  // ---- v5.13 : consommation (plafonds de l'offre gratuite Supabase : 5 Go de téléchargement / mois, 500 Mo de base) ----
  const GO = 1024 * 1024 * 1024, MO = 1024 * 1024;
  const fmtO = o => o >= GO ? (o / GO).toFixed(2).replace(".", ",") + " Go" : o >= MO ? (o / MO).toFixed(1).replace(".", ",") + " Mo" : Math.round(o / 1024) + " Ko";
  function consoRows() {
    const c = S.conso, a = BA.Conso ? BA.Conso.courant() : { o: 0, n: 0 };
    const j = Math.max(1, new Date().getDate()), mois = BA.Conso ? BA.Conso.mois() : "";
    const rows = [[t("tq_c_dl"), t("tq_c_dl_v", { v: fmtO(a.o), n: a.n, p: fmtO(a.o / j * 30) }), "dl"]];
    if (c === undefined) rows.push([t("tq_c_db"), S.busy ? "⏳" : "—", "db"]);
    else if (c === false) rows.push([t("tq_c_db"), t("tq_c_missing"), "db"]);
    else if (c.err) rows.push([t("tq_c_db"), "⚠️ " + c.err, "db"]);
    else {
      const d = c.d, pc = Math.round(d.db / (500 * MO) * 100);
      rows.push([t("tq_c_db"), t("tq_c_db_v", { v: fmtO(d.db), p: pc }) + (pc >= 80 ? " ⚠️ " + t("tq_c_warn") : ""), "db"]);
      rows.push([t("tq_c_rel"), t("tq_c_rel_v", { n: F0().num(d.rel_n), v: fmtO(d.rel_o) }), "rel"]);
      const par = {}; (d.mois || []).forEach(x => { (par[x.mo] = par[x.mo] || []).push(x); });
      Object.keys(par).sort().reverse().slice(0, 4).forEach(mo => {
        const tot = par[mo].reduce((q, x) => q + Number(x.o), 0);
        rows.push([mo, par[mo].map(x => x.m + " : " + fmtO(Number(x.o))).join(" · ") + (par[mo].length > 1 ? " — " + t("tq_c_total", { v: fmtO(tot) }) : ""), "mo-" + mo]);
      });
    }
    return rows;
  }
  const F0 = () => U().F;
  function dl(nom, texte) {
    const b = new Blob([texte], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function copieDonnees(btn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = "⏳";
    try {
      const out = { app: C.app.name + " v" + C.app.version, date: new Date().toISOString(), etat: BA.Store.get() };
      let rows = [], from = 0;
      for (;;) {                                                   // les relevés des machines (historique des totaux), par paquets de 1000
        const r = await sb().from("audits").select("*").order("id", { ascending: true }).range(from, from + 999);
        if (r.error) { if (!absente(r.error, "audits")) throw new Error(r.error.message); break; }
        rows = rows.concat(r.data || []); if (!r.data || r.data.length < 1000) break; from += 1000;
      }
      out.audits = rows;
      dl("broodautomate-copie-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(out));
      btn.textContent = "✅ " + t("tq_c_copied");
    } catch (e) { btn.textContent = "⚠️ " + (e.message || e); }
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 4000);
  }
  async function purge(btn) {
    if (!confirm(t("tq_c_purge_ask"))) return;
    btn.disabled = true;
    const lim = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
    const r = await sb().from("device_reports").delete().lt("received_at", lim);
    btn.textContent = r.error ? "⚠️ " + r.error.message : "✅ " + t("tq_c_purged");
    setTimeout(() => loadSystem(true), 1500);
  }
  function txtNavigateur() {
    if (BA.IN_APP) return t("tq_s_browser_app");
    if (!("Notification" in window)) return t("tq_s_browser_na");
    return Notification.permission === "granted" ? t("tq_s_browser_on") : Notification.permission === "denied" ? t("tq_s_browser_off") : t("tq_s_browser_ask");
  }
  function drawSystem() {
    const z = _el && _el.querySelector("#tq-system"); if (!z) return;
    const F = U().F, s = BA.Store.get(), q = BA.Store.status(), cloud = CLOUD();
    let taille = 0;
    try { taille = JSON.stringify(s).length; } catch (e) { /* rien */ }
    const sync = q.mode === "local" ? t("sync_local") : q.sync === "ok" ? t("sync_ok") : q.sync === "sending" ? t("sync_sending") : t("sync_offline");
    const devs = BA.Boitiers ? BA.Boitiers.devices() : [];
    const vu = devs.reduce((a, d) => Math.max(a, Date.parse(d.last_seen || "") || 0), 0);
    const oui = v => v === true ? t("tq_yes") : v === false ? t("tq_no") : "…";
    const carte = (titre, rows) => `<div class="card tq-card"><h3>${titre}</h3><dl class="bx-dl">${rows.map(([k, v, id]) => `<div${id ? ` data-k="${id}"` : ""}><dt>${E(k)}</dt><dd>${E(v)}</dd></div>`).join("")}</dl></div>`;
    z.innerHTML = `
      <div class="tq-bar"><button type="button" class="btn secondary" id="tq-s-check" ${S.busy ? "disabled" : ""}>🔄 ${E(t("tq_s_check"))}</button>
        <span class="petit">${S.busy ? "⏳ " + E(t("loading")) : S.at ? E(t("tq_j_updated", { h: F.clock(S.at) })) : ""}</span></div>
      ${S.err ? `<div class="alert err">${E(t("tq_j_err", { e: S.err }))}</div>` : ""}
      <div class="tq-grid">
      ${carte("🧩 " + E(t("tq_s_app")), [
        [t("tq_s_version"), C.app.name + " v" + C.app.version, "version"],
        [t("tq_s_lang"), String(BA.I18n.lang || "fr").toUpperCase() + " · " + (BA.Theme && BA.Theme.get() === "light" ? t("tq_s_theme_light") : t("tq_s_theme_dark"))],
        [t("tq_s_serial"), BA.Serial && BA.Serial.supported() ? t("tq_s_serial_ok") : t("tq_s_serial_no")]
      ])}
      ${carte("☁️ " + E(t("tq_s_conn")), [
        [t("tq_s_mode"), cloud ? t("tq_s_cloud") : t("tq_s_local"), "mode"],
        [t("tq_s_account"), cloud ? (BA.DB.email || "—") + " · " + t("role_admin") : "—"],
        [t("tq_s_sync"), sync + (q.lastSync ? " · " + t("tq_s_last_sync", { h: F.dt(q.lastSync) }) : "") + (q.pending ? " · " + t("tq_s_pending", { n: q.pending }) : ""), "sync"],
        [t("tq_s_size"), t("tq_s_size_v", { k: F.num(taille / 1024), m: s.machines.length, e: s.events.length, j: (s.journal || []).length }), "size"],
        [t("tq_s_ver"), q.version ? "n° " + q.version : "—"]
      ])}
      ${carte("📊 " + E(t("tq_c_title")), cloud ? consoRows() : [[t("tq_c_dl"), t("tq_s_local_na")]])}
      ${cloud ? `<div class="card tq-card"><h3>💾 ${E(t("tq_c_copy_title"))}</h3><p class="petit">${E(t("tq_c_copy_txt"))}</p>
        <div class="carte-actions"><button type="button" class="btn secondary" id="tq-c-copy">⬇️ ${E(t("tq_c_copy"))}</button>
        <button type="button" class="btn secondary" id="tq-c-purge">🧹 ${E(t("tq_c_purge"))}</button></div></div>` : ""}
      ${carte("🌙 " + E(t("tq_s_copies")), [[t("tq_s_copies_l"), cloud ? txtCopies() : t("tq_s_local_na"), "copies"]])}
      ${carte("🔔 " + E(t("tq_s_notif")), [
        [t("tq_s_notif_l"), cloud ? txtNotifs() : t("tq_s_local_na"), "notifs"],
        [t("tq_s_browser"), txtNavigateur()]
      ])}
      ${carte("📡 " + E(t("tq_tab_boxes")), [
        [t("tq_s_boxes_n"), cloud ? String(devs.length) : t("tq_s_local_na"), "boxes"],
        [t("tq_s_boxes_tables"), cloud ? oui(BA.Boitiers && BA.Boitiers.installed()) : "—"],
        [t("tq_s_boxes_read"), cloud ? oui(BA.Boitiers && BA.Boitiers.demInstalled()) : "—"],
        [t("tq_s_boxes_seen"), vu ? F.dt(vu) : "—"]
      ])}
      </div>`;
    const bc = z.querySelector("#tq-c-copy"); if (bc) bc.onclick = () => copieDonnees(bc);
    const bp = z.querySelector("#tq-c-purge"); if (bp) bp.onclick = () => purge(bp);
    const b = z.querySelector("#tq-s-check");
    if (b) b.onclick = () => { if (BA.Boitiers) BA.Boitiers.refresh(true); loadSystem(true); };
  }

  // ---------------- Tic de la page (toutes les quelques secondes, quand la page est ouverte) ----------------
  function tick() {
    if (BA.Rs232 && BA.Rs232.tick) BA.Rs232.tick();          // câble : état, relevés, prochaine lecture
    if (visible("journal") && !J.busy && Date.now() - J.at > MIN) loadJournal(true);
    if (visible("raw")) { pollRaw(); drawRaw(); }
    if (visible("system") && !S.busy && Date.now() - (S.drawn || 0) > 15000) { S.drawn = Date.now(); drawSystem(); }
  }

  BA.Technique = {
    render, tick,
    // ouvrir un onglet : « boxes », « machines », « cable », « journal », « system », « raw »
    tab(name) { if (TABS.some(x => x[0] === name)) { _tab = name; show(name); } },
    current: () => _tab,
    // pour les essais
    _journal: () => J, _system: () => S, _raw: () => FB
  };
})();
