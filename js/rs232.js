// ============================================================
// BROODAUTOMATE v5 — Onglet « Connexion RS232 » (BA.Rs232)
// Les fonctions de la v3.2, sans changement de la liaison :
// - serial.js (EVA-DTS DDCMP, liste blanche des trames) n'est pas modifié ;
// - réglages du câble gardés par PC, sous le même nom qu'en v3.2
//   (« broodautomate_rs232 ») : vitesse, liste 2, lecture auto, reconnexion,
//   machine branchée ;
// - relevés comparés au relevé précédent de la machine (table « audits »
//   de Supabase, comme en v3.2) : 1er relevé = point de départ, ensuite
//   ventes = différence des compteurs CUMULÉS.
// Nouveau en v5 : les ventes sortent des lots datés (le plus ancien en
// premier), la porte, la température, les coupures et les erreurs vont
// dans les Alertes ; « Mes machines » (ajouter, modifier, supprimer) ;
// import d'un relevé de clé USB.
// ============================================================

window.BA = window.BA || {};

(function () {
  const C = BA_CONFIG, M = BA.Model;
  const t = (k, v) => BA.I18n.t(k, v);
  const $ = s => document.querySelector(s);
  const U = () => BA.UI;
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = s => String(s || "").replace(/[<>"'`]/g, "").trim();
  const CLOUD = () => !!(BA.DB && BA.DB.isReady && BA.DB.isReady());

  // ---------------- Réglages du câble (ce PC) ----------------
  const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* rien */ } };
  const CLE_RS232 = "broodautomate_rs232";
  const CLE_AUDITS = "broodautomate_audits";      // relevés du mode local (comme en v3.2)
  const RS_DEFAUT = {
    machineId: null,
    vitesse: (C.rs232 && C.rs232.vitesse) || 9600,
    liste: 2,
    lectureAuto: false,
    intervalleMin: (C.rs232 && C.rs232.intervalleMin) || 15,
    reconnexionAuto: false
  };
  let _rs = Object.assign({}, RS_DEFAUT, lire(CLE_RS232, {}));
  if (_rs.liste !== 1) _rs.liste = 2;
  const sauverRs = () => ecrire(CLE_RS232, _rs);

  let _journal = [];         // { t, texte, niveau }
  let _brut = [];
  let _octets = 0;
  let _etat = "";
  let _rapports = [];        // derniers relevés reçus (résumés)
  let _prochaine = null;     // prochaine lecture automatique
  let _dernierEchec = false;
  let _enAttente = null;     // relevé reçu sans machine choisie
  let _analyse = null;       // dernières données reçues
  let _texte = "";           // dernier texte EVA-DTS (zone « Test »)
  let _statut = "déconnecté";
  let _el = null;            // section de l'onglet (admin)

  const machines = () => (BA.Store.get() || { machines: [] }).machines;
  const parId = id => machines().find(m => m.id && String(m.id).toUpperCase() === String(id || "").toUpperCase()) || null;
  const machineCable = () => parId(_rs.machineId);
  const nomM = m => m ? "#" + m.num + " — " + (m.street || m.id) + (m.city ? ", " + m.city : "") : "—";
  const ref = m => ({ id: m.id, num: m.num });
  // Machine désignée par { id, num } (le numéro peut avoir changé entre-temps sur un autre appareil)
  const pick = (s, r) => (r.id && s.machines.find(m => m.id === r.id)) || M.machine(s, r.num);
  const hhmmss = d => d.toLocaleTimeString("fr-FR") + "." + String(d.getMilliseconds()).padStart(3, "0");

  // ---------------- Journal et flux brut ----------------
  function journalRs(texte, niveau) {
    _journal.unshift({ t: new Date(), texte, niveau: niveau || "info" });
    if (_journal.length > 400) _journal.length = 400;
    const el = $("#rs-journal"); if (el) el.innerHTML = htmlJournal();
  }
  const htmlJournal = () => _journal.length
    ? _journal.slice(0, 200).map(l => `<div class="j-${E(l.niveau)}">${hhmmss(l.t)}  ${E(l.texte)}</div>`).join("")
    : "— " + t("rs_nothing") + " —";
  function brutRs(sens, octets) {
    _octets += sens === "RX" ? octets.length : 0;
    _brut.unshift(hhmmss(new Date()) + " " + (sens === "RX" ? "← machine" : "→ PC     ") + "  " + BA.DDCMP.hex(octets.slice(0, 64)) + (octets.length > 64 ? " … (" + octets.length + " octets)" : ""));
    if (_brut.length > 300) _brut.length = 300;
    const el = $("#serial-brut"); if (el) el.textContent = _brut.join("\n");
    const nb = $("#serial-count"); if (nb) nb.textContent = _octets;
  }
  function badge() {
    const b = $("#serial-status"), s = _statut;
    if (b) {
      b.textContent = "RS232 : " + (s === "connecté" ? t("rs_connected") : String(s).startsWith("erreur") ? t("rs_error") : t("rs_disconnected"));
      b.className = "badge " + (s === "connecté" ? "on" : String(s).startsWith("erreur") ? "err" : "off");
    }
  }
  function majStatut(s) {
    _statut = s;
    badge();
    if (s !== "connecté") {
      _prochaine = null;
      const m = machineCable();
      if (m && m.link) BA.Store.update(st => { const x = pick(st, ref(m)); if (x) BA.Reel.unlink(st, x.num); });
    }
    majDyn();
  }

  // ---------------- Relevés : stockage du relevé précédent (comme en v3.2) ----------------
  async function dernierAudit(id) {
    if (CLOUD()) return await BA.DB.getLastAudit(id);
    const l = lire(CLE_AUDITS, {});
    return (l[id] || [])[0] || null;
  }
  const _lignesOk = new Set();
  async function ligneMachine(m) {
    if (!CLOUD() || _lignesOk.has(m.id)) return;
    try {
      const deja = await BA.DB.getMachine(m.id);
      if (!deja) await BA.DB.addMachine({ id: m.id, name: m.street || m.id, city: m.city || "", serial: m.serial || "" });
      _lignesOk.add(m.id);
    } catch (e) { console.warn("Machine dans Supabase :", e.message); }
  }
  async function sauverAudit(m, audit) {
    if (CLOUD()) { await ligneMachine(m); await BA.DB.addAudit(m.id, audit); return; }
    const l = lire(CLE_AUDITS, {});
    const liste = (l[m.id] || []).slice();
    liste.unshift(Object.assign({}, audit, { imported_at: new Date().toISOString() }));
    if (liste.length > 50) liste.length = 50;
    l[m.id] = liste;
    ecrire(CLE_AUDITS, l);
  }
  const tempsAudit = audit => ((audit && audit.errors) || []).filter(e => e.type === "temp");

  // Applique un relevé à une machine. source : "rs232" | "usb". Renvoie { message, annule? }
  async function traiter(m, analyse, source, interactif) {
    const r = ref(m);
    if (analyse.g85.present && !analyse.g85.ok) {
      BA.Store.update(s => { const x = pick(s, r); if (x) BA.Reel.readBad(s, x.num); });
      return { message: t("rs_rejected_g85"), rejete: true };
    }
    const tm = Date.now();
    const lite = Object.assign({}, analyse); delete lite.raw;
    if (analyse.type !== "audit") {
      const res = BA.Store.update(s => { const x = pick(s, r); return x ? BA.Reel.applyEvents(s, x.num, { t: tm, src: source, analyse: lite }) : { message: t("rs_err_missing") }; });
      return res || {};
    }
    const audit = BA.EvaDts.toAudit(analyse);
    const ancien = await dernierAudit(m.id);
    const diff = BA.EvaDts.compare(ancien, audit);
    const nv = BA.EvaDts.nouveautes(ancien ? ancien.errors : null, audit.errors);
    const nouveaux = diff.baseline ? 0 : nv.eva.length + nv.fas.length + nv.pow.length + nv.activations.length;
    const nouvellesTemps = diff.baseline ? tempsAudit(audit) : nv.temp;
    const appliquer = !diff.baseline && !diff.anomalies && !diff.identique;
    if (interactif) {
      const go = await confirmerUsb(m, audit, ancien, diff, nouveaux);
      if (!go) return { message: t("rs_cancelled"), annule: true };
    }
    if (diff.identique && !nouveaux && !nouvellesTemps.length) {
      BA.Store.update(s => { const x = pick(s, r); if (x) BA.Reel.touch(s, x.num, tm, source); });
      return { message: t("rs_msg_same"), identique: true };
    }
    audit.source = source;
    audit.delta_count = appliquer ? diff.deltaCount : null;
    audit.delta_value = appliquer ? diff.deltaValue : null;
    await sauverAudit(m, audit);          // d'abord le relevé (point de départ du suivant), ensuite les ventes
    const x0 = { t: tm, src: source, analyse: lite, audit, ancien: ancien ? { total_count: ancien.total_count } : null, diff, nv };
    const res = BA.Store.update(s => { const x = pick(s, r); return x ? BA.Reel.applyAudit(s, x.num, x0) : { message: t("rs_err_missing") }; });
    return res || {};
  }

  // Fichier de clé USB : on montre ce qui va se passer avant d'importer (comme la v3.2)
  function confirmerUsb(m, audit, ancien, diff, nouveaux) {
    return new Promise(resolve => {
      if (diff.identique && !nouveaux) { U().toast(t("usb_same", { m: nomM(m) })); resolve(false); return; }
      if (diff.identique) { resolve(true); return; }
      let html = `<p>${E(t("usb_counters", { n: audit.total_count, v: U().F.eur(audit.total_value) }))}</p>`;
      if (diff.baseline) html += `<p>${E(t("usb_baseline"))}</p>`;
      else if (diff.anomalies) html += `<div class="alert warn">⚠️ ${E(t("usb_down", { a: ancien.total_count, b: audit.total_count }))}</div>`;
      else html += `<p>${E(t("usb_sales", { n: diff.deltaCount, v: U().F.eur(diff.deltaValue) }))}</p>`;
      let done = false;
      U().confirmDialog({
        title: "📂 " + t("usb_title", { m: nomM(m) }), html, ok: "✔ " + t("usb_ok"),
        onOk: () => { done = true; resolve(true); }
      });
      // fermé sans « OK » (Annuler, Échap, clic à côté)
      const root = document.getElementById("modal-root");
      const obs = new MutationObserver(() => { if (!root.querySelector(".dlg-back")) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(root, { childList: true, subtree: true });
    });
  }

  // ---------------- Un relevé arrive par le câble ----------------
  async function recevoirRapport(r) {
    const analyse = BA.EvaDts.parse(r.texte);
    _analyse = analyse; _texte = r.texte;
    const resume = { recuA: Date.now(), role: r.role, liste: r.liste, type: analyse.type, g85: analyse.g85, info: "" };
    _rapports.unshift(resume);
    if (_rapports.length > 10) _rapports.length = 10;
    const zone = $("#eva-raw");
    if (zone && document.activeElement !== zone) zone.value = r.texte;
    const m = machineCable();
    if (!m) {
      _enAttente = { analyse, texte: r.texte, recuA: resume.recuA };
      resume.info = t("rs_waiting_info");
      journalRs(t("rs_waiting_log"), "warn");
      majDyn();
      return;
    }
    try {
      const res = await traiter(m, analyse, "rs232", false);
      resume.info = res.message || "";
      _dernierEchec = false;
      journalRs((res.rejete ? "✖ " : "✔ ") + "« " + nomM(m) + " » : " + (res.message || "") + ".", res.rejete ? "err" : "ok");
    } catch (e) {
      resume.info = t("rs_save_error");
      journalRs(t("rs_save_error") + " : " + e.message, "err");
    }
    majDyn();
  }

  const rappels = () => ({
    journal: (tx, n) => journalRs(tx, n),
    brut: (sens, o) => brutRs(sens, o),
    rapport: r => { recevoirRapport(r).catch(err => journalRs(t("rs_save_error") + " : " + err.message, "err")); },
    etat: tx => { _etat = tx; const el = $("#rs-etat"); if (el) el.textContent = (BA.Serial.connected ? "🟢 " : "⚪ ") + tx; },
    statut: s => majStatut(s)
  });

  function planifier() {
    _prochaine = (_rs.lectureAuto && BA.Serial.connected) ? Date.now() + Math.max(2, Number(_rs.intervalleMin) || 15) * 60000 : null;
    majProchaine();
  }

  async function lancerLecture(origine) {
    if (!BA.Serial.connected) {
      if (origine === "bouton") U().toast("🔌 " + t("rs_connect_first"));
      return;
    }
    if (BA.Serial.occupe()) { journalRs(t("rs_busy"), "warn"); return; }
    if (origine === "auto" && !machineCable()) return;
    journalRs(t(origine === "auto" ? "rs_read_auto" : "rs_read_asked", { l: _rs.liste }), "info");
    const r = await BA.Serial.lire(_rs.liste);
    if (r.ok) { _dernierEchec = false; return; }
    journalRs(t("rs_read_failed") + " : " + r.erreur, "err");
    const m = machineCable();
    if (m && !_dernierEchec && !r.cede && BA.Serial.connected) {
      _dernierEchec = true;
      const off = /ne répond pas/.test(r.erreur || "");
      BA.Store.update(s => { const x = pick(s, ref(m)); if (x) BA.Reel.readFailed(s, x.num, r.erreur, off); });
    }
  }
  // Lecture automatique : vérifiée toutes les 20 s
  setInterval(() => { if (_prochaine && Date.now() >= _prochaine) { planifier(); lancerLecture("auto"); } }, 20000);

  // ---------------- Affichage ----------------
  function htmlChoix() {
    return `<select id="rs-machine">
      <option value="">— ${E(t("rs_choose"))} —</option>
      ${machines().filter(m => m.id).map(m => `<option value="${E(m.id)}" ${String(m.id) === String(_rs.machineId) ? "selected" : ""}>${E(nomM(m))} — ${E(t("rs_plate"))} ${E(m.serial || "—")}</option>`).join("")}
    </select>`;
  }
  function htmlRapports() {
    if (!_rapports.length) return `<p class="note">— ${E(t("rs_no_report"))} —</p>`;
    const F = U().F;
    return `<div class="table-scroll"><table class="compact">
      <thead><tr><th>${E(t("rs_col_received"))}</th><th>${E(t("rs_col_origin"))}</th><th>${E(t("rs_col_content"))}</th><th>${E(t("rs_col_check"))}</th><th>${E(t("rs_col_result"))}</th></tr></thead>
      <tbody>${_rapports.map(r => `<tr>
        <td class="nowrap">${F.date(r.recuA)} ${F.clock(r.recuA)}</td>
        <td>${E(r.role === "esclave" ? t("rs_origin_push") : t("rs_origin_read", { l: r.liste }))}</td>
        <td>${E(r.type === "audit" ? t("rs_content_audit") : r.type === "evenements" ? t("rs_content_events") : t("rs_content_empty"))}</td>
        <td>${r.g85 && r.g85.present ? (r.g85.ok ? "✅ G85" : "❌ G85") : "—"}</td>
        <td>${E(r.info || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function htmlDetecte() {
    const a = _analyse;
    if (!a) return `<p class="note">— ${E(t("rs_no_data"))} —</p>`;
    const F = U().F;
    const total = a.va1 ? t("rs_total", { n: a.va1.countTotal, v: F.eur(a.va1.valueTotal) }) : "— " + t("rs_events_only");
    const generique = !a.machineId || /^FAS0*1$/i.test(a.machineId) || /^FAS$/i.test(a.machineId);
    const proposition = generique ? "" : String(a.machineId || "").replace(/^FAS-?/i, "").replace(/[^A-Za-z0-9-]/g, "");
    const p = String(a.machineDate || "").split(" ");
    const attente = _enAttente ? `
      <div class="alert warn">⏳ ${E(t("rs_pending"))}
        <div class="toolbar"><select id="det-rattacher" class="auto-w">${machines().filter(m => m.id).map(m => `<option value="${E(m.id)}">${E(nomM(m))}</option>`).join("")}</select>
        <button class="btn" id="det-attach">📎 ${E(t("rs_attach"))}</button></div></div>` : "";
    return `<div class="card">
      <h3>${a.type === "audit" ? "✅ " + E(t("rs_got_audit")) : "✅ " + E(t("rs_got_events"))}</h3>
      <div class="table-scroll"><table class="compact">
        <tr><th>${E(t("rs_d_id"))}</th><td>${E(a.machineId) || "—"}${generique ? ` <span class="petit">(${E(t("rs_d_generic"))})</span>` : ""}</td></tr>
        <tr><th>${E(t("rs_d_model"))}</th><td>${E(a.machineModel) || "—"} ${a.logiciel ? "/ " + E(a.logiciel) : ""}</td></tr>
        <tr><th>${E(t("rs_d_clock"))}</th><td>${E(BA.EvaDts.formatDate(p[0], p[1]) || "—")}</td></tr>
        <tr><th>${E(t("rs_d_sales"))}</th><td>${E(total)}</td></tr>
        <tr><th>${E(t("rs_d_sels"))}</th><td>${a.selections.length}</td></tr>
        <tr><th>${E(t("rs_d_events"))}</th><td>${a.events.length} / ${a.fasErrors.length} / ${a.powerCuts.length}</td></tr>
        <tr><th>${E(t("rs_d_temp"))}</th><td>${a.temperatures && a.temperatures.length ? F.num(a.temperatures[0].celsius, 1) + " °C <span class='petit'>(" + E(BA.EvaDts.formatDate(a.temperatures[0].date, a.temperatures[0].time)) + ")</span>" : "—"}</td></tr>
        <tr><th>${E(t("rs_d_g85"))}</th><td>${a.g85.present ? (a.g85.ok ? "✅ " + E(t("rs_g85_ok")) : "❌ " + E(t("rs_g85_bad"))) : E(t("rs_g85_none"))}</td></tr>
      </table></div>
      ${attente}
      <details><summary>➕ ${E(t("rs_new_from_reading"))}</summary>
        <p class="note">${E(t("rs_plate_note"))}</p>
        ${formMachine("det", proposition)}
      </details>
    </div>`;
  }
  // Formulaire « ajouter une machine » (pref = det : depuis un relevé ; man : à la main)
  function formMachine(pref, plaque) {
    const libre = machines().reduce((a, m) => Math.max(a, m.num), 0) + 1;
    return `<div class="add-sel-row rs-form">
      <label>${E(t("rs_plate"))} <input id="${pref}-id" class="txt-in" value="${E(plaque || "")}" placeholder="202164170"></label>
      <label>${E(t("rs_num"))} <input id="${pref}-num" class="num-in" type="number" min="1" max="99999" value="${libre}"></label>
      <label>${E(t("rs_street"))} <input id="${pref}-street" class="txt-in" placeholder="${E(t("rs_street_ph"))}"></label>
      <label>${E(t("rs_city"))} <input id="${pref}-city" class="txt-in" placeholder="Antwerpen"></label>
      <label>${E(t("rs_region"))} <select id="${pref}-region" class="auto-w"><option value="">${E(t("rs_region_auto"))}</option><option value="vl">${E(t("rs_region_vl"))}</option><option value="bxl">${E(t("rs_region_bxl"))}</option></select></label>
      <button class="btn" data-add="${pref}">➕ ${E(t("rs_add_btn"))}</button>
    </div>`;
  }
  function htmlMachines() {
    const s = BA.Store.get(), ms = s.machines;
    if (!ms.length) return `<div class="alert info">${E(t("rs_no_machine"))}</div>`;
    return `<div class="table-scroll"><table class="compact rs-machines">
      <thead><tr><th>${E(t("rs_num"))}</th><th>${E(t("rs_street"))}</th><th>${E(t("rs_city"))}</th><th>${E(t("rs_region"))}</th><th>${E(t("rs_plate"))}</th><th>${E(t("col_link"))}</th><th></th></tr></thead>
      <tbody>${ms.map(m => `<tr data-mnum="${m.num}">
        <td><input id="mm-num-${m.num}" class="num-in" type="number" min="1" max="99999" value="${m.num}" data-f="num"></td>
        <td><input id="mm-street-${m.num}" class="txt-in" value="${E(m.street)}" data-f="street"></td>
        <td><input id="mm-city-${m.num}" class="txt-in" value="${E(m.city)}" data-f="city"></td>
        <td><select id="mm-region-${m.num}" class="auto-w" data-f="region"><option value="vl" ${m.region !== "bxl" ? "selected" : ""}>${E(t("rs_region_vl"))}</option><option value="bxl" ${m.region === "bxl" ? "selected" : ""}>${E(t("rs_region_bxl"))}</option></select></td>
        <td class="nowrap">${E(m.serial || "—")}</td>
        <td>${m.online ? `<span class="tag c-ok">🟢 ${E(t("online"))}</span>` : `<span class="tag">${E(t("offline"))}</span>`}<div class="petit">${m.lastSeen ? U().F.date(m.lastSeen) + " " + U().F.time(m.lastSeen) : "—"}</div></td>
        <td><button class="btn petit secondary" data-mdel="${m.num}" title="${E(t("rs_del_machine"))}">🗑</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  function majProchaine() {
    const el = $("#rs-prochaine"); if (!el) return;
    el.textContent = _prochaine ? t("rs_next_read", { h: new Date(_prochaine).toLocaleTimeString(BA.I18n.lang === "nl" ? "nl-BE" : BA.I18n.lang === "en" ? "en-GB" : "fr-BE") })
      : (_rs.lectureAuto ? t("rs_auto_on_wait") : t("rs_auto_off"));
  }
  // Parties qui bougent (sans effacer ce qui est en train d'être tapé)
  function majDyn() {
    if (!_el || !document.contains(_el)) return;
    const occupe = el => el && document.activeElement && el.contains(document.activeElement);
    const zm = _el.querySelector("#rs-choix-machine"); if (zm && !occupe(zm)) { zm.innerHTML = htmlChoix(); bindChoix(); }
    const zr = _el.querySelector("#rs-rapports"); if (zr) zr.innerHTML = htmlRapports();
    const zd = _el.querySelector("#serial-detect"); if (zd && !occupe(zd)) { zd.innerHTML = htmlDetecte(); bindDetecte(); }
    const zz = _el.querySelector("#rs-machines"); if (zz && !occupe(zz) && !(BA.Shell && BA.Shell.clicking && BA.Shell.clicking())) { zz.innerHTML = htmlMachines(); bindMachines(); }
    const ze = _el.querySelector("#rs-etat"); if (ze) ze.textContent = (BA.Serial.connected ? "🟢 " : "⚪ ") + (_etat || t("rs_state_off"));
    const bc = _el.querySelector("#btn-rs-connecter"); if (bc) bc.disabled = BA.Serial.connected;
    majProchaine();
  }

  function render(el) {
    _el = el;
    const vitesses = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
    const ok = BA.Serial.supported();
    el.innerHTML = `
      <h2>🔌 ${E(t("nav_rs232"))} — ${E(t("rs_subtitle"))}</h2>
      <div class="alert ${ok ? "info" : "err"}">${ok ? "✅ " + E(t("rs_ws_ok")) : "❌ " + E(t("rs_ws_no"))}</div>

      <div class="card rs-card">
        <h3>1. ${E(t("rs_step1"))}</h3>
        <div id="rs-choix-machine">${htmlChoix()}</div>
        <p class="note">${E(t("rs_step1_note"))}</p>
      </div>

      <div class="card rs-card">
        <h3>2. ${E(t("rs_step2"))}</h3>
        <div class="add-sel-row">
          <label>${E(t("rs_speed"))} <select id="rs-vitesse" class="auto-w">${vitesses.map(v => `<option value="${v}" ${Number(_rs.vitesse) === v ? "selected" : ""}>${v} ${E(t("rs_bauds"))}</option>`).join("")}</select></label>
          <span class="petit">${E(t("rs_format"))}</span>
        </div>
        <label class="case"><input type="checkbox" id="rs-reco" ${_rs.reconnexionAuto ? "checked" : ""}> ${E(t("rs_reconnect"))}</label>
        <p class="note">${E(t("rs_cable_note1"))}<br>${E(t("rs_cable_note2"))}</p>
        <div class="carte-actions wrap-actions">
          <button class="btn" id="btn-rs-connecter" ${BA.Serial.connected ? "disabled" : ""}>🔌 ${E(t("rs_connect"))}</button>
          <button class="btn secondary" id="btn-rs-deconnecter">${E(t("rs_disconnect"))}</button>
        </div>
        <p>${E(t("rs_state"))} : <b id="rs-etat">${(BA.Serial.connected ? "🟢 " : "⚪ ") + E(_etat || t("rs_state_off"))}</b></p>
      </div>

      <div class="card rs-card">
        <h3>3. ${E(t("rs_step3"))}</h3>
        <label class="case"><input type="radio" name="rs-liste" value="2" ${_rs.liste === 2 ? "checked" : ""}> ${E(t("rs_list2"))}</label>
        <label class="case"><input type="radio" name="rs-liste" value="1" ${_rs.liste === 1 ? "checked" : ""}> ${E(t("rs_list1"))}</label>
        <div class="carte-actions"><button class="btn" id="btn-rs-lire">📥 ${E(t("rs_read_now"))}</button></div>
        <label class="case"><input type="checkbox" id="rs-auto" ${_rs.lectureAuto ? "checked" : ""}> ${E(t("rs_auto_every"))}
          <input type="number" id="rs-intervalle" class="num-in" min="2" max="1440" value="${Number(_rs.intervalleMin)}"> ${E(t("rs_minutes"))}</label>
        <p class="note" id="rs-prochaine"></p>
        <p class="note">${E(t("rs_auto_note"))}</p>
      </div>

      <h3>${E(t("rs_last_reports"))}</h3>
      <div id="rs-rapports">${htmlRapports()}</div>

      <h3>${E(t("rs_last_data"))}</h3>
      <div id="serial-detect">${htmlDetecte()}</div>

      <h3>${E(t("rs_journal"))}</h3>
      <pre id="rs-journal" class="journal">${htmlJournal()}</pre>
      <details><summary>${E(t("rs_raw"))} : <span id="serial-count">${_octets}</span></summary>
        <pre id="serial-brut">${E(_brut.join("\n")) || "— " + E(t("rs_nothing")) + " —"}</pre></details>
      <p class="note">🔒 ${E(t("rs_security"))}</p>

      <h2 class="rs-h2">🏭 ${E(t("rs_my_machines"))}</h2>
      <p class="note">${E(t("rs_my_machines_note"))}</p>
      <div id="rs-machines">${htmlMachines()}</div>
      <div class="card add-sel"><h3>➕ ${E(t("rs_add_manual"))}</h3>
        <p class="note">${E(t("rs_add_manual_note"))}</p>
        ${formMachine("man", "")}</div>

      <h2 class="rs-h2">📂 ${E(t("usb_import_title"))}</h2>
      <div class="card">
        <p class="note">${E(t("usb_import_note"))}</p>
        <div class="add-sel-row">
          <label>${E(t("machine"))} <select id="usb-machine" class="auto-w">${machines().filter(m => m.id).map(m => `<option value="${E(m.id)}" ${String(m.id) === String(_rs.machineId) ? "selected" : ""}>${E(nomM(m))}</option>`).join("")}</select></label>
          <label class="btn secondary file-btn">📂 ${E(t("usb_choose"))}<input type="file" id="usb-file" accept=".dat,.txt,*/*" hidden></label>
        </div>
      </div>

      <h2 class="rs-h2">🧪 ${E(t("eva_test_title"))}</h2>
      <p class="note">${E(t("eva_test_note"))}</p>
      <textarea id="eva-raw" rows="8" class="zone-texte" placeholder="— ${E(t("eva_paste"))} —">${E(_texte || "")}</textarea>
      <div class="carte-actions"><button class="btn secondary" id="btn-eva-parse">🔍 ${E(t("eva_parse"))}</button></div>
      <pre id="eva-parsed">— ${E(t("eva_parse_hint"))} —</pre>`;
    bind();
    majProchaine();
  }

  function bindChoix() {
    const sel = _el && _el.querySelector("#rs-machine");
    if (sel) sel.onchange = () => {
      _rs.machineId = sel.value || null; sauverRs();
      const m = machineCable();
      if (m) journalRs(t("rs_cable_machine", { m: nomM(m), p: m.serial || "—" }), "info");
      majDyn();
    };
  }
  function bindDetecte() {
    const a = _el && _el.querySelector("#det-attach");
    if (a) a.onclick = () => rattacher(_el.querySelector("#det-rattacher").value);
    bindAdd(_el && _el.querySelector("#serial-detect"));
  }
  function bindAdd(zone) {
    if (!zone) return;
    zone.querySelectorAll("[data-add]").forEach(b => b.onclick = () => ajouterMachine(b.dataset.add));
  }
  function bindMachines() {
    const zone = _el && _el.querySelector("#rs-machines"); if (!zone) return;
    zone.querySelectorAll("tr[data-mnum] [data-f]").forEach(inp => inp.onchange = () => {
      const num = Number(inp.closest("tr").dataset.mnum), f = inp.dataset.f;
      const v = {}; v[f] = f === "num" ? Number(inp.value) : inp.value;
      const err = BA.Store.update(s => BA.Reel.updateMachine(s, num, v));
      if (err) { U().toast("⚠️ " + t(err)); }
      else {
        U().toast("✅ " + t("saved"));
        const m = M.machine(BA.Store.get(), f === "num" ? Number(inp.value) : num);
        if (m && CLOUD() && m.id && (f === "street" || f === "city")) BA.DB.updateMachine(m.id, { name: m.street || m.id, city: m.city || "" }).catch(e => console.warn(e.message));
      }
      U().afterClick(majDyn);
    });
    zone.querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => {
      const m = M.machine(BA.Store.get(), Number(b.dataset.mdel)); if (!m) return;
      U().confirmDialog({
        title: "🗑 " + t("rs_del_title", { m: nomM(m) }),
        html: `<div class="alert warn">⚠️ ${E(t("rs_del_text"))}</div><p class="note">${E(t("del_undo"))}</p>`,
        ok: "🗑 " + t("rs_del_ok"), danger: true,
        onOk: async () => {
          const r = ref(m);
          BA.Store.update(s => { const x = pick(s, r); if (x) BA.Reel.removeMachine(s, x.num); });
          if (_rs.machineId === m.id) { _rs.machineId = null; sauverRs(); }
          if (CLOUD() && m.id) { try { await BA.DB.deleteMachine(m.id); } catch (e) { console.warn(e.message); } }
          U().toast("✅ " + t("rs_deleted"));
          majDyn();
        }
      });
    });
  }

  async function ajouterMachine(pref) {
    const v = k => { const el = document.getElementById(pref + "-" + k); return el ? el.value : ""; };
    const serie = clean(v("id")).replace(/\s+/g, "").replace(/^FAS-/i, "");
    if (!serie || !/^[A-Za-z0-9-]+$/.test(serie)) { U().toast("⚠️ " + t("rs_err_plate")); return; }
    if (/^FAS0*1$/i.test(serie)) { U().toast("⚠️ " + t("rs_err_generic", { p: serie })); return; }
    const id = "FAS-" + serie;
    const street = clean(v("street")).slice(0, 80) || ("Machine " + serie);
    const city = clean(v("city")).slice(0, 60);
    const region = v("region") === "bxl" ? "bxl" : (v("region") === "vl" ? "vl" : BA.Store.regionOf(city));
    const num = Number(v("num"));
    const err = BA.Store.update(s => BA.Reel.addMachine(s, { num, id, street, city, region, serial: serie }));
    if (err) { U().toast("⚠️ " + t(err)); return; }
    if (CLOUD()) {
      try { await BA.DB.addMachine({ id, name: street, city, serial: serie }); _lignesOk.add(id); }
      catch (e) { if (!/duplicate|unique|exists/i.test(e.message || "")) console.warn("Machine dans Supabase :", e.message); }
    }
    U().toast("✅ " + t("rs_added", { m: "#" + num }));
    if (pref === "det" && !machineCable()) { _rs.machineId = id; sauverRs(); }
    if (pref === "det" && _enAttente) { await rattacher(id); }
    BA.Shell.state.machine = num;
    majDyn();
  }

  async function rattacher(id) {
    if (!id || !_enAttente) return;
    const en = _enAttente; _enAttente = null;
    if (!machineCable()) { _rs.machineId = id; sauverRs(); }
    const m = parId(id); if (!m) return;
    try {
      const res = await traiter(m, en.analyse, "rs232", false);
      journalRs("✔ " + t("rs_attached", { m: nomM(m) }) + " : " + (res.message || "") + ".", res.rejete ? "err" : "ok");
      if (_rapports[0] && _rapports[0].recuA === en.recuA) _rapports[0].info = res.message || "";
    } catch (e) { journalRs(t("rs_save_error") + " : " + e.message, "err"); }
    majDyn();
  }

  function bind() {
    const el = _el;
    bindChoix(); bindDetecte(); bindMachines();
    bindAdd(el.querySelector(".add-sel"));
    el.querySelector("#rs-vitesse").onchange = e => {
      _rs.vitesse = Number(e.target.value) || 9600; sauverRs();
      if (BA.Serial.connected) journalRs(t("rs_speed_later"), "warn");
    };
    el.querySelector("#rs-reco").onchange = e => { _rs.reconnexionAuto = !!e.target.checked; sauverRs(); };
    el.querySelector("#btn-rs-connecter").onclick = () => connecter();
    el.querySelector("#btn-rs-deconnecter").onclick = async () => { await BA.Serial.disconnect(); journalRs(t("rs_port_closed"), "info"); majDyn(); };
    el.querySelectorAll("input[name=rs-liste]").forEach(r => r.onchange = () => {
      const v = Number(r.value);
      if (v === 1 && _rs.liste !== 1) {
        U().confirmDialog({ title: t("rs_list1_title"), html: `<p>${E(t("rs_list1_warn"))}</p>`, ok: t("rs_list1_ok"),
          onOk: () => { _rs.liste = 1; sauverRs(); render(el); } });
        el.querySelector("input[name=rs-liste][value='2']").checked = true;
        return;
      }
      _rs.liste = v === 1 ? 1 : 2; sauverRs();
    });
    el.querySelector("#btn-rs-lire").onclick = () => lancerLecture("bouton");
    el.querySelector("#rs-auto").onchange = e => { _rs.lectureAuto = !!e.target.checked; sauverRs(); planifier(); };
    el.querySelector("#rs-intervalle").onchange = e => { _rs.intervalleMin = Math.min(1440, Math.max(2, Math.round(Number(e.target.value) || 15))); e.target.value = _rs.intervalleMin; sauverRs(); planifier(); };
    el.querySelector("#btn-eva-parse").onclick = () => {
      const tx = (el.querySelector("#eva-raw").value || "").trim(), out = el.querySelector("#eva-parsed");
      if (!tx) { out.textContent = "— " + t("eva_parse_hint") + " —"; return; }
      _texte = tx;
      const r = BA.EvaDts.parse(tx); delete r.raw;
      out.textContent = JSON.stringify(r, null, 2);
    };
    el.querySelector("#usb-file").onchange = e => importerUsb(e.target);
  }

  async function connecter(port) {
    if (!BA.Serial.supported()) { U().toast("❌ " + t("rs_ws_no")); return; }
    try {
      await BA.Serial.connect({
        baudRate: _rs.vitesse,
        signaux: !(C.rs232 && C.rs232.signaux === false),
        ddcmp: { identifiantPc: (C.rs232 && C.rs232.identifiantPc) || "00000001" }
      }, rappels(), port && port.open ? port : undefined);
      journalRs(t("rs_port_open", { v: _rs.vitesse }), "ok");
      if (!machineCable()) journalRs("⚠ " + t("rs_choose_first"), "warn");
      planifier();
      majDyn();
    } catch (err) {
      if (err && err.name === "NotFoundError") journalRs(t("rs_no_port"), "warn");
      else journalRs(t("rs_connect_failed") + " : " + (err && err.message || err), "err");
      majStatut("erreur : " + (err && err.message || err));
    }
  }

  async function importerUsb(input) {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    const sel = _el && _el.querySelector("#usb-machine");
    const m = parId(sel ? sel.value : null);
    if (!m) { U().toast("⚠️ " + t("usb_choose_machine")); return; }
    let texte = "";
    try {
      const o = new Uint8Array(await f.arrayBuffer());       // octet par octet (Latin-1) : indispensable pour le G85
      for (let i = 0; i < o.length; i += 8192) texte += String.fromCharCode.apply(null, o.subarray(i, i + 8192));
    } catch (e) { U().toast("⚠️ " + e.message); return; }
    if (!/^\s*DXS\*/.test(texte) || !/DXE\*/.test(texte)) { U().toast("⚠️ " + t("usb_not_eva")); return; }
    const a = BA.EvaDts.parse(texte);
    if (!a.va1) { U().toast("⚠️ " + t("usb_no_va1")); return; }
    if (a.g85.present && !a.g85.ok) { U().toast("⚠️ " + t("rs_rejected_g85")); return; }
    try {
      const res = await traiter(m, a, "usb", true);
      if (!res.annule) U().toast("✅ " + (res.message || t("saved")));
    } catch (e) {
      U().toast("⚠️ " + e.message + (/audits/i.test(e.message || "") ? " — " + t("usb_audits_missing") : ""));
    }
  }

  // Reconnexion automatique du câble (ports déjà autorisés dans ce navigateur)
  async function init() {
    if (!BA.Serial.supported()) return;
    if (navigator.serial.addEventListener) {
      navigator.serial.addEventListener("connect", e => {
        if (_rs.reconnexionAuto && !BA.Serial.connected) { journalRs(t("rs_usb_back"), "info"); connecter(e.target); }
      });
    }
    if (!_rs.reconnexionAuto) return;
    const ports = await BA.Serial.portsAutorises();
    if (ports.length === 1) { journalRs(t("rs_auto_reco"), "info"); await connecter(ports[0]); }
    else if (ports.length > 1) journalRs(t("rs_several_ports"), "warn");
  }

  // ---------------- Opérateur : lecture seule (comme dans la version test) ----------------
  function renderOp(el) {
    const s = BA.Store.get(), F = U().F;
    el.innerHTML = `
      <h2>🔌 ${E(t("nav_rs232"))}</h2>
      <div class="alert info">${E(t("rs_op_note"))}</div>
      ${s.machines.length ? `<div class="table-scroll"><table>
        <thead><tr><th>${E(t("machine"))}</th><th>${E(t("col_address"))}</th><th>${E(t("col_link"))}</th><th>${E(t("col_last_data"))}</th></tr></thead>
        <tbody>${s.machines.map(m => `<tr><td class="selno">#${m.num}</td><td>${E(m.street)}, ${E(m.city)}</td>
          <td>${m.online ? `<span class="tag c-ok">🟢 ${E(t("online"))}</span>` : `<span class="tag">${E(t("offline"))}</span>`}</td>
          <td>${m.lastSeen ? F.date(m.lastSeen) + " " + F.clock(m.lastSeen) : "—"}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="alert info">${E(t("no_machine_op"))}</div>`}`;
  }

  BA.Rs232 = {
    render, renderOp, init, badge,
    tick: () => majDyn(),
    // pour les tests
    _traiter: traiter, _rs: () => _rs, _journal: () => _journal
  };
})();
