// ============================================================
// BROODAUTOMATE v5.3 — Boîtiers 4G (LILYGO T-A7670E) : BA.Boitiers
//
// Le boîtier, branché sur la prise RS232 de la machine, la lit tout seul
// (liste 2, comme le câble : chaque heure, et juste après chaque envoi de la
// machine — télémétrie) et envoie les relevés à Supabase par la 4G
// (fonction « ingest » → table device_reports).
// v5.2 : bouton « 📡 Lire maintenant » (table ba_demandes ; le boîtier v1.1
// regarde régulièrement s'il y a une demande, par la fonction ba_boitier : 2 min au départ, puis le délai réglé ici).
// v5.3 : bouton « 📡 Lire toutes les machines » (Commander, Dashboard,
// Boîtiers 4G) : une demande par boîtier d'un coup, avant une commande.
// Ici :
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
// - page Technique → « Boîtiers 4G » (v5.12, avant : onglet Connexion RS232) :
//   ajouter un boîtier (clé secrète créée ici, seule son empreinte SHA-256 va
//   dans Supabase), commandes SQL une par une, code de la fonction « ingest »,
//   détail de chaque boîtier et données 4G estimées ;
// - v5.12 : la page « Connexion RS232 » ne montre plus que les boîtiers et leur
//   état (combien, lesquels, en ligne / hors ligne, machine lue ou pas).
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
    "grant all on public.devices, public.device_reports to service_role;",
    // v5.2 : bouton « Lire maintenant » (commandes 10 à 17)
    "create table if not exists public.ba_demandes (id bigint generated always as identity primary key, device_id uuid not null references public.devices(id) on delete cascade, machine_id text not null, statut text not null default 'attente', message text, cree_at timestamptz not null default now(), prise_at timestamptz, fini_at timestamptz);",
    "create index if not exists ba_demandes_device on public.ba_demandes (device_id, statut, id);",
    "alter table public.ba_demandes enable row level security;",
    "create policy \"ba_demandes_authenticated\" on public.ba_demandes for all to authenticated using (true) with check (true);",
    "grant select, insert, update, delete on public.ba_demandes to authenticated;",
    "grant all on public.ba_demandes to service_role;",
    "create or replace function public.ba_boitier(k text, fait bigint default 0, ok boolean default true, msg text default '') returns json language sql security definer set search_path = '' as $$ with d as (update public.devices set last_seen = now() where key_hash = encode(sha256(convert_to(k, 'UTF8')), 'hex') returning id), f as (update public.ba_demandes set statut = case when ok then 'faite' else 'echec' end, fini_at = now(), message = left(coalesce(msg, ''), 240) where fait > 0 and id = fait and statut in ('attente', 'prise') and device_id in (select id from d) returning id), p as (update public.ba_demandes set statut = 'prise', prise_at = now() where id = (select id from public.ba_demandes where statut = 'attente' and cree_at > now() - interval '1 hour' and id <> coalesce(fait, 0) and device_id in (select id from d) order by id limit 1) returning id) select json_build_object('ok', exists (select 1 from d), 't', floor(extract(epoch from now()))::bigint, 'dem', coalesce((select id from p), 0), 'fait', (select count(*) from f), 'ec', coalesce((select case when (data -> 'settings' ->> 'ecouteMin') in ('15', '30', '60') then (data -> 'settings' ->> 'ecouteMin')::int * 60 else 0 end from public.ba_state where id = 'main'), 0)) $$;",
    "grant execute on function public.ba_boitier(text, bigint, boolean, text) to anon;"
  ];
  const SQL_DEM = 9;            // les commandes 10 à 17 (index 9 à 16) : bouton « Lire maintenant »
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
  // Bouton « Lire maintenant »
  const DEM_TIMEOUT = 10 * MIN;  // sans réponse du boîtier après 10 min : « pas de réponse »
  let demandes = new Map();      // n° du boîtier → sa dernière demande (ligne de ba_demandes)
  let demInstalled = null;       // null : pas vérifié ; false : commandes 10 à 17 pas encore faites ; true
  let watchT = null, demCheck = 0, demForce = false;
  const DEM_COLS = "id, device_id, machine_id, statut, message, cree_at, prise_at, fini_at";
  const demMissing = err => /ba_demandes/i.test(err && err.message || "") && /(does not exist|could not find|schema cache|relation)/i.test(err.message || "");
  const demAt = d => Date.parse(d && d.cree_at || "") || 0;
  const pending = d => !!d && (d.statut === "attente" || d.statut === "prise") && Date.now() - demAt(d) < DEM_TIMEOUT;
  const fwOk = d => { const v = parseFloat(d && d.info && d.info.fw); return isFinite(v) && v >= 1.1; };
  const machines = () => (BA.Store.get() || { machines: [] }).machines;
  // v5.10 : délai de « Lire maintenant » réglé ici (15 min, 30 min ou 1 h), envoyé aux boîtiers par ba_boitier
  const ECOUTE = [15, 30, 60];
  const ecouteMin = () => { const v = Number((((BA.Store.get() || {}).settings) || {}).ecouteMin); return ECOUTE.includes(v) ? v : 0; };
  const duree = m => m >= 60 ? t("bx_ec_1h") : t("bx_ec_min", { n: m });
  const delai = () => ecouteMin() ? duree(ecouteMin()) : t("bx_ec_min", { n: 3 });
  const nomM = m => m ? "#" + m.num + " — " + (m.street || m.id) + (m.city ? ", " + m.city : "") : "—";
  const seenMs = d => d && d.last_seen ? Date.parse(d.last_seen) || 0 : 0;
  // Boîtier « vivant » : vu depuis moins de 2 signaux de vie (+ 5 min), et au moins 45 min
  const limitMs = d => Math.max(Number(C.onlineMinutes) || 45, (Number(d && d.info && d.info.hb) || 30) * 2 + 5) * MIN;
  const isAlive = (d, now) => !!seenMs(d) && (now || Date.now()) - seenMs(d) < limitMs(d);
  // v5.11 : le boîtier a-t-il vraiment LU la machine il y a peu ? (mode normal, dernière lecture réussie récente).
  // Un boîtier qui répond mais n'est pas branché sur la machine (mode essai, câble absent) ne la met pas « en ligne ».
  const lectureRecente = (d, now) => {
    const i = (d && d.info) || {};
    if (Number(i.mode || 0) !== 0 || i.stok !== true) return false;
    const lok = Number(i.lok) || 0;                        // heure UTC (secondes) de la dernière lecture réussie
    if (!(lok > 0)) return true;                           // programme qui ne la donne pas : on se fie à « lecture réussie »
    const rd = Number(i.rd) || 60;                         // le boîtier relit la machine toutes les rd minutes
    return (now || Date.now()) - lok * 1000 < Math.max(2 * rd + 15, Number(C.onlineMinutes) || 45) * MIN;
  };
  const dernier = id => { const l = devices.filter(d => d.machine_id === id); return l.length ? l.slice().sort((a, b) => seenMs(b) - seenMs(a))[0] : null; };
  // Texte court : 4G 10:47 / 4G muet / boîtier en mode essai / machine pas lue
  function etatTxt(d, now) {
    if (!isAlive(d, now)) return t("bx_tag_silent");
    const i = d.info || {};
    if (Number(i.mode || 0) !== 0) return t("bx_tag_test");
    if (!lectureRecente(d, now)) return t("bx_tag_notread", { h: U().F.time(seenMs(d)) });
    return t("bx_tag_ok", { h: U().F.time(seenMs(d)) });
  }

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

  // Le relevé contient-il toutes les sélections du relevé de départ, avec des totaux qui n'ont pas baissé ?
  function couvre(ancien, audit) {
    const have = new Set((audit.selections || []).map(s => String(s.selection)));
    return (ancien.selections || []).every(s => have.has(String(s.selection))) && Number(audit.total_count) >= Number(ancien.total_count);
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
    const audit = analyse.type === "audit" ? BA.EvaDts.toAudit(analyse) : null;
    const ancien = audit ? await baseline(m0) : null;
    // Envoi de la machine (télémétrie) avec des compteurs incomplets (quelques sélections seulement) : ses événements
    // sont repris, mais il ne devient pas le relevé de départ (sinon le relevé complet suivant compterait de fausses
    // ventes) ; les ventes arrivent avec la lecture que le boîtier fait juste après
    const partiel = !!audit && R.role === "machine" && !!ancien && !couvre(ancien, audit);
    if (!audit || partiel) {                                 // envoi de la machine sans compteurs : événements seulement
      BA.Store.update(s => { const x = pick(s); if (!x || !free(x)) return; BA.Reel.applyEvents(s, x.num, { t: tm, src: "4g", analyse: lite }); x.g4 = Object.assign({}, x.g4, { rid: R.id }); });
      return "ok";
    }
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
      if (same) { BA.Reel.touch(s, x.num, tm, "4g"); BA.Reel.setTotals(s, x.num, audit, tm); }      // v5.13 : le total est mis à jour même sans vente
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
    if (demInstalled) {                                      // demandes « Lire maintenant » de plus de 7 jours
      const r2 = await sb().from("ba_demandes").delete().lt("cree_at", new Date(Date.now() - 7 * 24 * 60 * MIN).toISOString());
      if (r2.error) console.warn("Ménage des demandes de lecture :", r2.error.message);
    }
  }

  // ---------------- Bouton « 📡 Lire maintenant » ----------------
  // L'appli écrit une demande (ba_demandes, statut « attente ») ; le boîtier la voit au plus tard 2 min après
  // (fonction ba_boitier), la marque « prise », lit la machine, envoie le relevé, puis la marque « faite »
  // (ou « echec » avec la raison). Pendant l'attente, l'appli regarde où en est la demande toutes les 10 s.
  const fixDem = d => (d && typeof d.message === "string" ? Object.assign({}, d, { message: fixUtf8(d.message) }) : d);
  // Lignes lues dans ba_demandes : la plus récente par boîtier est gardée ; une demande que cet appareil voyait
  // en cours et qui vient de se terminer est annoncée (« lecture reçue » ou « lecture impossible »).
  // tout = true : toutes les demandes récentes (sinon : seulement celles en cours)
  function merge(rows, tout) {
    let fini = false;
    const m = tout ? new Map() : new Map(demandes);
    const enCours = x => !!x && (x.statut === "attente" || x.statut === "prise");
    const finie = x => x.statut === "faite" || x.statut === "echec";
    (rows || []).forEach(d0 => {
      const d = fixDem(d0), cur = m.get(d.device_id), old = demandes.get(d.device_id);
      // demande de « Lire toutes les machines » : suivie par son numéro, même si une autre demande du même
      // boîtier est plus récente (ex. une ancienne demande restée en attente, donnée au boîtier après)
      if (inLot(d)) {
        const avant = lot.rows.get(d.device_id);
        if (enCours(avant) && finie(d)) fini = true;
        lot.rows.set(d.device_id, d);
      }
      if (cur && cur.id > d.id && (tout || cur.id !== d.id)) return;      // une demande plus récente existe
      // (demandes de « Lire toutes les machines » : un seul message à la fin, pas un par boîtier)
      if (old && old.id === d.id && enCours(old) && finie(d)) { fini = true; if (!inLot(d)) announce(d); }
      m.set(d.device_id, d);
    });
    // une demande créée ici à l'instant, pas encore relue : gardée
    if (tout) demandes.forEach((d, k) => { if (!m.has(k) || m.get(k).id < d.id) m.set(k, d); });
    demandes = m;
    return fini;
  }
  async function loadDemandes() {
    const since = new Date(Date.now() - 24 * 60 * MIN).toISOString();
    const res = await sb().from("ba_demandes").select(DEM_COLS).gt("cree_at", since).order("id", { ascending: false }).limit(200);
    if (res.error) {
      if (demMissing(res.error)) { demInstalled = false; demandes = new Map(); return false; }
      throw new Error(res.error.message);
    }
    demInstalled = true;
    const fini = merge(res.data, true);
    if (!lot) guessLot(res.data);
    return fini;
  }
  // Demandes en cours (dernière de chaque boîtier + celles de « Lire toutes les machines »)
  function enAttente() {
    const out = new Map();
    demandes.forEach(d => { if (pending(d)) out.set(d.id, d); });
    if (lot) lot.rows.forEach(d => { if (pending(d)) out.set(d.id, d); });
    return [...out.values()];
  }
  // Pendant qu'une demande est en cours : où en est-elle ? (toutes les 10 s)
  function watch() {
    clearTimeout(watchT); watchT = null;
    if (!CLOUD() || !enAttente().length) return;
    watchT = setTimeout(async () => {
      watchT = null;
      const open = enAttente();
      if (!open.length) { showDem(); return; }
      let fini = false;
      try {
        const res = await sb().from("ba_demandes").select(DEM_COLS).in("id", open.map(d => d.id));
        if (res.error) throw new Error(res.error.message);
        fini = merge(res.data, false);
      } catch (e) { console.warn("Lire maintenant :", e.message); }
      if (fini) await refresh(true);                         // le relevé de la demande est traité tout de suite
      else { showDem(); watch(); }
    }, 10000);
  }
  function announce(d) {
    const b = devices.find(x => x.id === d.device_id);
    const n = b ? b.name : "";
    if (d.statut === "faite") U().toast("✅ " + t("bx_read_done", { b: n }), 6000);
    else U().toast("⚠️ " + t("bx_read_failed", { b: n, e: d.message || "—" }), 9000);
  }
  // opts.brut (v5.15, onglet Technique → Flux brut) : le boîtier envoie le relevé COMPLET, sans le filtre de la v1.3.
  // Renvoie la demande créée (ou null si elle n'a pas pu l'être).
  async function readNow(id, opts) {
    const d = devices.find(x => x.id === id); if (!d) return null;
    if (pending(demandes.get(id))) { U().toast("⏳ " + t("bx_read_wait")); return null; }
    const brut = !!(opts && opts.brut);
    const res = await sb().from("ba_demandes").insert(brut ? { device_id: d.id, machine_id: d.machine_id, brut: true } : { device_id: d.id, machine_id: d.machine_id }).select(DEM_COLS);
    if (res.error) { U().toast("⚠️ " + t("bx_error", { e: res.error.message })); return null; }
    const row = (res.data || [])[0] || { id: 0, device_id: d.id, machine_id: d.machine_id, statut: "attente", cree_at: new Date().toISOString() };
    demandes.set(d.id, row);
    U().toast("📡 " + t("bx_read_sent", { d: delai() }), 6000);
    showDem();
    watch();
    return row;
  }
  // Texte d'état de la dernière demande d'un boîtier
  function demText(d) {
    const x = demandes.get(d.id); if (!x) return "";
    const F = U().F, at = v => F.time(Date.parse(v) || Date.now());
    if (x.statut === "attente" || x.statut === "prise") {
      if (!pending(x)) return "⌛ " + t("bx_read_timeout", { h: at(x.cree_at) });
      return x.statut === "prise" ? "📥 " + t("bx_read_taken", { h: at(x.prise_at || x.cree_at) }) : "⏳ " + t("bx_read_waiting", { h: at(x.cree_at), d: delai() });
    }
    if (x.statut === "faite") return "✅ " + t("bx_read_ok", { h: at(x.fini_at || x.cree_at) });
    return "⚠️ " + t("bx_read_ko", { h: at(x.fini_at || x.cree_at), e: x.message || "—" });
  }
  // Bouton (désactivé : ancien programme, boîtier hors ligne, demande en cours)
  function readBtn(d) {
    if (demInstalled !== true) return "";
    if (!fwOk(d)) return `<span class="petit">⬆️ ${E(t("bx_read_fw"))}</span>`;
    const st = btnState(d);
    return `<button class="btn petit" data-bxread="${E(d.id)}" ${st.disabled ? "disabled" : ""} title="${E(st.title)}">${E(st.label)}</button>`;
  }
  function btnState(d) {
    if (pending(demandes.get(d.id))) return { disabled: true, label: "⏳ " + t("bx_read_btn"), title: t("bx_read_wait") };
    if (!isAlive(d)) return { disabled: true, label: "📡 " + t("bx_read_btn"), title: t("bx_read_offline") };
    return { disabled: false, label: "📡 " + t("bx_read_btn"), title: t("bx_read_title", { d: delai() }) };
  }
  // Met à jour les boutons et les états affichés (onglet Connexion RS232, page Détails, cartes « Lire toutes
  // les machines ») sans tout redessiner
  function showDem() {
    document.querySelectorAll("[data-bxdem]").forEach(el => { const d = devices.find(x => x.id === el.dataset.bxdem); if (d) el.textContent = demText(d); });
    document.querySelectorAll("button[data-bxread]").forEach(b => {
      const d = devices.find(x => x.id === b.dataset.bxread); if (!d) return;
      const st = btnState(d); b.disabled = st.disabled; b.title = st.title; b.textContent = st.label;
    });
    checkLot();
    const slots = document.querySelectorAll("[data-bxall]");
    if (!slots.length) return;
    // pas pendant un clic (le bouton serait remplacé sous la souris) : un peu plus tard
    if (BA.Shell && BA.Shell.clicking && BA.Shell.clicking()) { clearTimeout(slotT); slotT = setTimeout(showDem, 600); return; }
    slots.forEach(el => { el.innerHTML = slotHtml(Number(el.dataset.bxall) || 0); });
  }
  // Page Détails (admin) : boîtier de la machine + bouton
  function detail(m) {
    if (!m || !m.id || !CLOUD()) return "";
    const list = devices.filter(d => d.machine_id === m.id);
    if (!list.length) return "";
    const d = list.slice().sort((a, b) => seenMs(b) - seenMs(a))[0];
    return `<div class="bx-detail">📡 <b>${E(d.name)}</b> · <span class="petit">${E(etatTxt(d))}</span>
      ${readBtn(d)} <span class="petit" data-bxdem="${E(d.id)}">${E(demText(d))}</span></div>`;
  }

  // ---------------- Bouton « 📡 Lire toutes les machines » (v5.3) ----------------
  // Avant une commande : une demande par boîtier, toutes d'un coup (une seule écriture dans ba_demandes).
  // Chaque boîtier lit SA machine dans les 2 à 3 min. La carte (Commander, Dashboard, Boîtiers 4G) montre
  // l'avancement, puis le résultat : machines lues, et celles qui ne l'ont pas été (pas de boîtier, boîtier hors
  // ligne, ancien programme, lecture impossible), avec l'heure de leur dernière lecture (= date de leur stock).
  // Une machine compte comme « lue » quand son relevé est traité ici (stock à jour), pas seulement envoyé.
  // lot = { at, dem: Map(n° du boîtier → n° de sa demande), rows: Map(n° du boîtier → ligne de cette demande),
  //         fini, finiAt, guess }
  let lot = null;
  let listOpen = false;          // détail par machine ouvert (gardé quand la carte est redessinée)
  let slotT = null;
  const boxOf = m => {
    const l = m && m.id ? devices.filter(d => d.machine_id === m.id) : [];
    return l.length ? l.slice().sort((a, b) => seenMs(b) - seenMs(a))[0] : null;
  };
  const inLot = d => !!lot && !!d && lot.dem.get(d.device_id) === d.id;
  const finAt = x => Date.parse(x && (x.fini_at || x.prise_at || x.cree_at) || "") || 0;
  // relevé d'une demande « faite » déjà traité ici ? (sinon : on attend le tour suivant, 1 min au plus)
  const traite = (m, x) => !!m && ((m.lastSeen || 0) >= (Date.parse(x.prise_at || x.cree_at || "") || 0) - 2000 || Date.now() - finAt(x) > 90000);

  // État de chaque machine pour la carte
  function allRows() {
    const now = Date.now();
    return machines().map(m => {
      const d = boxOf(m);
      const mine = !!lot && !!d && lot.rows.has(d.id);
      const x = mine ? lot.rows.get(d.id) : d ? demandes.get(d.id) : null;
      let st;
      if (mine && pending(x)) st = x.statut === "prise" ? "taken" : "wait";
      else if (mine && x.statut === "faite") st = traite(m, x) ? "ok" : "taken";
      else if (mine && x.statut === "echec") st = "ko";
      else if (mine) st = "timeout";
      else if (!d) st = "nobox";
      else if (!fwOk(d)) st = "fw";
      else if (!isAlive(d, now)) st = "off";
      else if (pending(x)) st = x.statut === "prise" ? "taken" : "wait";
      else st = "idle";
      return { m, d, x, st, mine };
    });
  }
  const lotDone = () => !!lot && allRows().filter(r => r.mine).every(r => r.st !== "wait" && r.st !== "taken");
  // Fin de la lecture : un seul message (après le traitement des relevés : le stock est à jour)
  function checkLot() {
    if (!lot || lot.fini || !lotDone()) return;
    lot.fini = true; lot.finiAt = Date.now();
    if (lot.guess) return;
    const rows = allRows(), ok = rows.filter(r => r.mine && r.st === "ok").length;
    U().toast((ok === rows.length ? "✅ " : "⚠️ ") + t("bx_all_done", { k: ok, n: rows.length, h: U().F.time(lot.finiAt) }), 9000);
  }
  // Page rechargée (ou autre appareil) pendant / juste après une lecture de toutes les machines :
  // les demandes écrites ensemble (même heure) sont reprises comme un seul lot
  function guessLot(rows) {
    const list = (rows || []).map(fixDem);
    if (list.length < 2) return;
    const last = Math.max(...list.map(demAt));
    if (Date.now() - last > 15 * MIN) return;
    // la plus récente de chaque boîtier, parmi les demandes écrites ensemble
    const par = new Map();
    list.filter(d => Math.abs(demAt(d) - last) < 5000).forEach(d => { const c = par.get(d.device_id); if (!c || c.id < d.id) par.set(d.device_id, d); });
    const same = [...par.values()];
    if (same.length < 2) return;
    lot = { at: last, dem: new Map(same.map(d => [d.device_id, d.id])), rows: new Map(same.map(d => [d.device_id, d])), fini: false, finiAt: 0, guess: false };
    if (lotDone()) { lot.fini = true; lot.guess = true; lot.finiAt = Math.max(...same.map(finAt)); }
  }

  async function readAll() {
    if (!CLOUD() || demInstalled !== true) return;
    if (lot && !lot.fini) { U().toast("⏳ " + t("bx_all_running")); return; }
    const now = Date.now(), dem = new Map(), rws = new Map(), todo = [];
    machines().forEach(m => {
      const d = boxOf(m);
      if (!d || !fwOk(d) || !isAlive(d, now)) return;
      const x = demandes.get(d.id);
      if (pending(x)) { dem.set(d.id, x.id); rws.set(d.id, x); }   // demande déjà en cours pour ce boîtier : on l'attend
      else todo.push(d);
    });
    if (!todo.length && !dem.size) { U().toast("⚠️ " + t("bx_all_none"), 7000); return; }
    if (todo.length) {
      const res = await sb().from("ba_demandes").insert(todo.map(d => ({ device_id: d.id, machine_id: d.machine_id }))).select(DEM_COLS);
      if (res.error) { U().toast("⚠️ " + t("bx_error", { e: res.error.message })); return; }
      const rows = res.data || [];
      todo.forEach(d => {
        const row = rows.find(r => r.device_id === d.id) || { id: 0, device_id: d.id, machine_id: d.machine_id, statut: "attente", cree_at: new Date().toISOString() };
        demandes.set(d.id, row); dem.set(d.id, row.id); rws.set(d.id, row);
      });
    }
    lot = { at: now, dem, rows: rws, fini: false, finiAt: 0, guess: false };
    U().toast("📡 " + t("bx_all_sent", { n: dem.size, d: delai() }), 7000);
    showDem();
    watch();
  }

  // Heure d'une lecture : « 14:05 » aujourd'hui, sinon « 01/11 19:40 »
  function quand(ms) {
    if (!ms) return t("bx_all_never");
    const F = U().F;
    return M.dayKey(ms) === M.dayKey(Date.now()) ? F.time(ms) : F.dt(ms);
  }
  function rowText(r) {
    const F = U().F, x = r.x, last = quand(r.m.lastSeen);
    switch (r.st) {
      case "ok": return "✅ " + t("bx_read_ok", { h: F.time(finAt(x)) });
      case "wait": return "⏳ " + t("bx_all_st_wait", { d: delai() });
      case "taken": return "📥 " + t("bx_all_st_taken");
      case "ko": return "⚠️ " + t("bx_all_st_ko", { e: x.message || "—", h: last });
      case "timeout": return "⌛ " + t("bx_all_st_timeout", { h: last });
      case "nobox": return t("bx_all_st_nobox", { h: last });
      case "fw": return "⬆️ " + t("bx_all_st_fw", { h: last });
      case "off": return t("bx_all_st_off", { s: quand(seenMs(r.d)), h: last });
      default: return t("bx_all_st_idle", { h: last });
    }
  }
  const pourquoi = r => t("bx_all_w_" + r.st) + " · " + t("bx_all_stock_at", { h: quand(r.m.lastSeen) });

  function allInner(planAt) {
    if (demInstalled !== true) return demInstalled === false ? `<p class="petit">📡 ${E(t("bx_all_install"))}</p>` : `<p class="petit">⏳ ${E(t("loading"))}</p>`;
    const rows = allRows(), n = rows.length;
    const ready = rows.filter(r => r.d && fwOk(r.d) && isAlive(r.d)).length;
    const running = !!lot && !lot.fini;
    let head, extra = "";
    if (running) {
      const mine = rows.filter(r => r.mine), got = mine.filter(r => r.st !== "wait" && r.st !== "taken").length;
      head = `<b>⏳ ${E(t("bx_all_progress", { k: got, n: mine.length }))}</b>
        <progress max="${mine.length}" value="${got}"></progress> <span class="petit">${E(t("bx_all_wait", { d: delai() }))}</span>`;
    } else if (lot) {
      const ok = rows.filter(r => r.mine && r.st === "ok").length;
      head = `<b>${ok === n ? "✅" : "⚠️"} ${E(t("bx_all_done", { k: ok, n, h: quand(lot.finiAt) }))}</b>`;
      const miss = rows.filter(r => !(r.mine && r.st === "ok"));
      if (miss.length) extra += `<div class="bx-all-miss petit">${E(t("bx_all_missing"))}<ul>${miss.map(r => `<li><b>#${E(r.m.num)}</b> ${E(r.m.street || "")} — ${E(pourquoi(r))}</li>`).join("")}</ul></div>`;
      if (planAt && planAt < lot.finiAt && ok) extra += `<div class="alert warn">🔄 ${E(t("bx_all_plan_old", { b: t("btn_calc") }))}</div>`;
    } else {
      const fresh = rows.filter(r => r.m.lastSeen && Date.now() - r.m.lastSeen < 15 * MIN).length;
      head = `${E(t("bx_all_hint"))} <span class="petit">${E(t("bx_all_idle", { a: fresh, n }))}</span>`;
    }
    const titre = running ? t("bx_all_running") : ready ? t("bx_all_title", { d: delai() }) : t("bx_all_none");
    const btn = `<button class="btn" data-bxreadall ${running || !ready ? "disabled" : ""} title="${E(titre)}">${running ? "⏳ " + E(t("bx_all_running_btn")) : "📡 " + E(t(lot ? "bx_all_again" : "bx_all_btn"))}</button>`;
    const list = `<details class="bx-all-list" ${listOpen ? "open" : ""}><summary>${E(t("bx_all_detail"))}</summary>
      <ul>${rows.map(r => `<li><b>#${E(r.m.num)}</b> ${E(r.m.street || "")} — ${E(rowText(r))}</li>`).join("")}</ul></details>`;
    return `<div class="bx-all-head">${btn}<div class="bx-all-txt">${head}</div></div>${extra}${list}`;
  }
  // Carte à mettre dans une page (planAt : heure du calcul de la commande affichée, pour dire de la recalculer).
  // L'emplacement est toujours là : la carte y apparaît dès que les boîtiers sont chargés (showDem).
  function slotHtml(planAt) {
    if (!CLOUD() || installed !== true || !devices.length) return "";
    return `<div class="bx-all">${allInner(planAt)}</div>`;
  }
  function allCard(opts) {
    const planAt = Number(opts && opts.planAt) || 0;
    return `<div class="bx-all-slot" data-bxall="${planAt}">${slotHtml(planAt)}</div>`;
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
        // les demandes d'abord : le relevé d'une demande « faite » est déjà arrivé, il est traité juste après
        // (commandes SQL 10 à 17 pas encore faites : revérifié toutes les 15 min, ou après « J'ai fini : vérifier »)
        if (demInstalled !== false || demForce || Date.now() - demCheck > 15 * MIN) {
          demCheck = Date.now(); demForce = false;
          try { await loadDemandes(); } catch (e) { console.warn("Lire maintenant :", e.message); }
        }
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
      showDem();
      watch();
    }
  }

  function start() {
    if (timer || !CLOUD()) return;
    setTimeout(() => refresh(true), 2500);
    timer = setInterval(() => refresh(false), 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastCheck > 20000) refresh(false); });
    // bouton « Lire maintenant » : onglet Connexion RS232 et page Détails
    document.addEventListener("click", e => {
      const b = e.target && e.target.closest && e.target.closest("button[data-bxread]");
      if (b && !b.disabled) { b.disabled = true; readNow(b.dataset.bxread).finally(() => showDem()); }
      // « Lire toutes les machines » : Commander, Dashboard, onglet Boîtiers 4G
      const a = e.target && e.target.closest && e.target.closest("button[data-bxreadall]");
      if (a && !a.disabled) { a.disabled = true; readAll().catch(err => U().toast("⚠️ " + t("bx_error", { e: err.message }))).finally(() => showDem()); }
    });
    // détail par machine ouvert ou fermé : gardé quand la carte est redessinée
    document.addEventListener("toggle", e => {
      if (!e.target || !e.target.matches) return;
      if (e.target.matches("details.bx-all-list")) listOpen = e.target.open;
      // v5.12 : détail d'un boîtier (page Technique)
      if (e.target.matches("details.bx-more")) { const id = e.target.dataset.bxmore; if (e.target.open) openDet.add(id); else openDet.delete(id); }
    }, true);
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
    return " · 📡 " + etatTxt(d);
  }

  // ---------------- v5.12 : détail d'un boîtier (page Technique → Boîtiers 4G) ----------------
  // « toutes les heures », « toutes les 2 h », « toutes les 15 min »
  const every = m => { m = Number(m) || 0; return m === 60 ? t("every_hour") : m > 60 && m % 60 === 0 ? t("every_h", { n: m / 60 }) : t("every_min", { n: m }); };
  // Réseau 4G : le boîtier donne le code de l'opérateur (pays 206 = Belgique)
  const RESEAUX = { "20601": "Proximus", "20610": "Orange", "20620": "BASE / Telenet" };
  const reseau = op => { const c = String(op || "").replace(/\D/g, ""); return RESEAUX[c] ? RESEAUX[c] + " (" + c + ")" : String(op || ""); };
  function dur(ms) {
    const m = Math.floor(Math.max(0, ms) / MIN), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (h < 1) return t("dur_min", { m });
    if (d < 2) return t("dur_h", { h, m: String(m % 60).padStart(2, "0") });
    return t("dur_d", { d, h: h % 24 });
  }
  // Données 4G : ESTIMATION à partir de ce que le boîtier dit de lui-même (programme v1.1 et plus) :
  // seq = envois à Supabase depuis son démarrage, up = secondes depuis le démarrage, ec = délai (s) entre deux
  // vérifications « Lire maintenant », lu = lectures de la machine. Un échange HTTPS coûte environ 5 à 9 Ko
  // (connexion sécurisée comprise) ; un relevé complet de la Power Lift ajoute environ 2,8 Ko (2 791 octets).
  // Le chiffre exact n'est que sur l'appli de la carte SIM.
  const KO_MIN = 5, KO_MAX = 9, KO_RELEVE = 2.8;
  function estimate(d) {
    const i = (d && d.info) || {};
    const seq = Number(i.seq), up = Number(i.up);
    if (i.seq == null || i.up == null || !(seq >= 0) || !(up > 0)) return null;
    const ec = Number(i.ec) >= 60 ? Number(i.ec) : 120;              // 120 s : délai du programme tant qu'il n'a pas reçu le réglage
    const polls = Math.floor(up / ec);
    const releves = Math.min(seq, Math.max(0, Number(i.lu) || 0));   // au plus un relevé envoyé par lecture
    const calls = seq + polls;
    const lo = (calls * KO_MIN + releves * KO_RELEVE) / 1024, hi = (calls * KO_MAX + releves * KO_RELEVE) / 1024;   // Mo
    const f = up >= 3600 ? 30 * 86400 / up : 0;                       // projection sur 30 jours au même rythme (après 1 h)
    return { seq, polls, releves, up, lo, hi, moisLo: f ? lo * f : null, moisHi: f ? hi * f : null };
  }
  const mo = v => U().F.num(v, v < 10 ? 1 : 0);
  const openDet = new Set(); let detInit = false;               // détails ouverts (gardés quand la liste est redessinée)
  function htmlDetail(d) {
    const F = U().F, i = d.info || {}, m = machines().find(x => x.id === d.machine_id) || null;
    const mode = Number(i.mode) === 1 ? t("bx_mode_test") : Number(i.mode) === 2 ? t("bx_mode_loop") : t("bx_mode_normal");
    const lok = Number(i.lok) > 0 ? Number(i.lok) * 1000 : 0;
    const est = estimate(d);
    const temp = m && m.temp != null && m.temp !== "" && isFinite(m.temp) ? " · " + t("bx_det_temp", { t: F.num(m.temp, 1) }) : "";
    const ecMin = Number(i.ec) >= 60 ? Math.round(Number(i.ec) / 60) : 2;
    const rows = [
      ["fw", t("bx_det_fw"), i.fw ? "v" + i.fw + (fwOk(d) ? "" : " — " + t("bx_det_fw_old")) : "—"],
      ["mode", t("bx_det_mode"), mode],
      ["up", t("bx_det_up"), Number(i.up) > 0 ? dur(Number(i.up) * 1000) : "—"],
      ["seen", t("bx_det_seen"), ago(seenMs(d))],
      ["sig", t("bx_det_signal"), signal(i.rssi) + (i.op ? " · " + reseau(i.op) : "")],
      ["mach", t("machine"), (m ? nomM(m) : t("bx_unknown_machine", { id: d.machine_id })) + temp],
      ["tot", t("bx_det_tot"), m && m.tot ? t("bx_det_tot_v", { v: F.eur(m.tot.v), n: F.num(m.tot.n), d: F.dt(m.tot.t) }) + (m.tot.cv != null ? " · " + t("bx_det_tot_card", { c: F.eur(m.tot.cv) }) : "") : "—"],
      ["lok", t("bx_det_lok"), lok ? ago(lok) : i.stok === true ? "✅" : t("bx_never")],
      ["reads", t("bx_det_reads"), i.lu != null ? t("bx_det_reads_v", { n: i.lu, k: i.ko || 0 }) : "—"],
      ["rd", t("bx_det_rd"), Number(i.rd) > 0 ? every(i.rd) : "—"],
      ["hb", t("bx_det_hb"), Number(i.hb) > 0 ? every(i.hb) : "—"],
      ["ec", t("bx_det_ec"), every(ecMin)],
      ["msg", t("bx_det_msg"), i.st || "—"],
      ["door", t("bx_det_door"), i.porte ? (i.porte.ouverte ? t("bx_door_open", { d: i.porte.depuis ? F.dt(Date.parse(i.porte.depuis)) : "—" }) : t("bx_door_closed")) : "—"],
      ["data", t("bx_det_data"), !est ? t("bx_det_data_na") : t("bx_det_data_v", { a: mo(est.lo), b: mo(est.hi), c: est.seq, p: est.polls })],
      ["month", t("bx_det_month"), !est ? "—" : est.moisLo == null ? t("bx_det_data_soon") : t("bx_det_data_m", { a: mo(est.moisLo), b: mo(est.moisHi) })]
    ];
    return `<details class="bx-more" data-bxmore="${E(d.id)}" ${openDet.has(d.id) ? "open" : ""}>
      <summary>🔎 ${E(t("bx_det_title", { n: d.name }))} <span class="petit">· ${E(etatTxt(d))}</span></summary>
      <dl class="bx-dl">${rows.map(([k, l, v]) => `<div data-k="${k}"><dt>${E(l)}</dt><dd>${E(v)}</dd></div>`).join("")}</dl></details>`;
  }
  function htmlDetails() {
    if (!devices.length) return "";
    if (!detInit) { detInit = true; if (devices.length === 1) openDet.add(devices[0].id); }   // un seul boîtier : détail ouvert
    const all = devices.map(estimate).filter(e => e && e.moisLo != null);
    const total = all.length ? `<p class="note bx-data-total">📶 ${E(t("bx_data_total", { a: mo(all.reduce((x, e) => x + e.moisLo, 0)), b: mo(all.reduce((x, e) => x + e.moisHi, 0)), n: all.length }))}</p>` : "";
    return `<h3>🔎 ${E(t("bx_det_head"))}</h3><div class="bx-details">${devices.map(htmlDetail).join("")}</div>
      ${total}<p class="note">${E(t("bx_det_data_note"))}</p>`;
  }

  // ---------------- v5.12 : page « Connexion RS232 » — seulement les boîtiers et leur état ----------------
  let _sum = null, sumT = null, sumAt = 0;
  function sumRow(d, now) {
    const i = d.info || {}, alive = isAlive(d, now);
    const essai = Number(i.mode || 0) !== 0, lue = alive && !essai && lectureRecente(d, now);
    const lok = Number(i.lok) > 0 ? Number(i.lok) * 1000 : 0;
    let mtxt;
    if (!alive) mtxt = "⚪ " + t("bxs_m_unknown");
    else if (essai) mtxt = "🧪 " + t("bx_tag_test");
    else if (lue) mtxt = "✅ " + t("bxs_m_read", { h: quand(lok || seenMs(d)) });
    else mtxt = "⚠️ " + t("bxs_m_notread") + (i.st ? " — " + i.st : "");
    return { d, m: machines().find(x => x.id === d.machine_id) || null, alive, lue, essai, mtxt };
  }
  function summaryHtml() {
    const head = `<h2>🔌 ${E(t("nav_rs232"))}</h2><p class="note">${E(t("bxs_intro"))}</p>`;
    const go = (tab, label) => `<div class="carte-actions"><button type="button" class="btn secondary" data-go-tech="${tab}">${(BA.UI && BA.UI.NAV_ICONS && BA.UI.NAV_ICONS.technique) || "🔧"} ${E(label)}</button></div>`;
    if (!CLOUD()) return head + `<div class="alert info">${E(t("bx_local"))}</div>` + go("cable", t("bxs_open_tech"));
    if (installed === null) return head + `<p class="note">⏳ ${E(t("loading"))}</p>`;
    if (installed === false) return head + `<div class="alert warn">${E(t("bxs_not_installed"))}</div>` + go("boxes", t("bxs_open_tech"));
    const err = lastError ? `<div class="alert err">${E(t("bx_error", { e: lastError }))}</div>` : "";
    if (!devices.length) return head + err + `<div class="card bx-sum-empty"><p>${E(t("bx_none"))}</p><p class="note">${E(t("bxs_add_hint"))}</p>${go("boxes", t("bxs_add_btn"))}</div>`;
    const now = Date.now(), rows = devices.map(d => sumRow(d, now));
    const on = rows.filter(r => r.alive).length, off = rows.length - on, lues = rows.filter(r => r.lue).length;
    const card = (cls, label, value) => `<div class="card stat ${cls}"><div class="label">${E(label)}</div><div class="value">${E(value)}</div></div>`;
    return head + err + `<div class="cards summary-cards bx-sum-cards">
        ${card("", t("bxs_boxes"), rows.length)}
        ${card(on ? "c-ok" : "", "🟢 " + t("bxs_online"), on)}
        ${card(off ? "c-empty" : "", "⚪ " + t("bxs_offline"), off)}
        ${card(lues === rows.length ? "c-ok" : "c-remove", t("bxs_read"), lues + " / " + rows.length)}
      </div>
      <ul class="bx-sum-list">${rows.map(r => `<li class="bx-sum ${r.alive ? "on" : "off"}" data-bxsum="${E(r.d.id)}">
        <div class="bx-sum-top"><b>📡 ${E(r.d.name)}</b>${r.alive ? `<span class="tag c-ok">🟢 ${E(t("bxs_online"))}</span>` : `<span class="tag">⚪ ${E(t("bxs_offline"))}</span>`}</div>
        <div class="bx-sum-m">${E(r.m ? nomM(r.m) : t("bx_unknown_machine", { id: r.d.machine_id }))}</div>
        <div class="bx-sum-st">${E(r.mtxt)}</div>
        <div class="petit">${E(t("bxs_last", { d: ago(seenMs(r.d)) }))}</div></li>`).join("")}</ul>
      ${go("boxes", t("bxs_open_tech"))}`;
  }
  function drawSummary() {
    if (!_sum || !document.contains(_sum)) return;
    if (BA.Shell && BA.Shell.clicking && BA.Shell.clicking()) { clearTimeout(sumT); sumT = setTimeout(drawSummary, 600); return; }
    clearTimeout(sumT);
    sumAt = Date.now();
    _sum.innerHTML = summaryHtml();
    _sum.querySelectorAll("[data-go-tech]").forEach(b => b.onclick = () => { if (BA.Technique) BA.Technique.tab(b.dataset.goTech); BA.Shell.go("technique"); });
  }
  function summary(el) {
    _sum = el; drawSummary();
    if (CLOUD() && (installed !== true || Date.now() - lastCheck > 20000)) refresh(true);
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
    return `<div class="table-scroll"><table class="compact bx-table tbl-tel">
      <thead><tr><th>${E(t("bx_col_box"))}</th><th>${E(t("machine"))}</th><th>${E(t("bx_col_seen"))}</th><th>${E(t("bx_col_signal"))}</th><th>${E(t("bx_col_state"))}</th><th></th></tr></thead>
      <tbody>${devices.map(d => {
        const i = d.info || {};
        const alive = isAlive(d);
        const st = Number(i.mode) === 1 ? t("bx_mode_test") : Number(i.mode) === 2 ? t("bx_mode_loop") : (i.st || "—");
        const L = k => `data-label="${E(t(k))}"`;
        return `<tr data-bxid="${E(d.id)}">
          <td data-label=""><b>${E(d.name)}</b><div class="petit">${i.fw ? "v" + E(i.fw) : ""}${i.op ? " · " + E(reseau(i.op)) : ""}${Number(i.ec) >= 60 ? " · ⏱ " + E(t("bx_ec_box", { d: duree(Math.round(Number(i.ec) / 60)) })) : ""}</div></td>
          <td ${L("machine")}><select class="auto-w" data-bxm="${E(d.id)}">${ms.filter(m => m.id).map(m => `<option value="${E(m.id)}" ${m.id === d.machine_id ? "selected" : ""}>${E(nomM(m))}</option>`).join("")}
            ${ms.some(m => m.id === d.machine_id) ? "" : `<option value="${E(d.machine_id)}" selected>${E(t("bx_unknown_machine", { id: d.machine_id }))}</option>`}</select></td>
          <td ${L("bx_col_seen")}>${alive ? `<span class="tag c-ok">🟢 ${E(t("online"))}</span>` : `<span class="tag">${E(t("offline"))}</span>`}<div class="petit">${E(ago(seenMs(d)))}</div></td>
          <td class="nowrap" ${L("bx_col_signal")}>${E(signal(i.rssi))}</td>
          <td ${L("bx_col_state")}>${i.stok === true ? "✅ " : i.stok === false && Number(i.mode || 0) === 0 ? "⚠️ " : ""}${E(st)}${i.lu != null ? `<div class="petit">${E(t("bx_reads", { n: i.lu, k: i.ko || 0 }))}</div>` : ""}
            ${demInstalled === true ? `<div class="bx-read">${readBtn(d)} <span class="petit" data-bxdem="${E(d.id)}">${E(demText(d))}</span></div>` : ""}</td>
          <td class="nowrap bx-act" data-label=""><button class="btn petit secondary" data-bxkey="${E(d.id)}" title="${E(t("bx_newkey"))}">🔑</button><button class="btn petit secondary" data-bxdel="${E(d.id)}" title="${E(t("bx_del"))}">🗑</button></td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function htmlEcoute() {
    const cur = ecouteMin();
    return `<div class="bx-ecoute"><label>⏱ ${E(t("bx_ec_label"))}
      <select id="bx-ec" class="auto-w">${cur ? "" : `<option value="" selected disabled>${E(t("bx_ec_unset"))}</option>`}
        ${ECOUTE.map(m => `<option value="${m}" ${m === cur ? "selected" : ""}>${E(duree(m))}</option>`).join("")}</select></label>
      <p class="note">${E(t("bx_ec_note"))}</p>
      <label class="check-row"><input type="checkbox" id="bx-porte-notif" ${((BA.Store.get() || {}).settings || {}).porteNotif === true ? "checked" : ""}> 🚪 ${E(t("bx_porte_notif"))}</label>
      <p class="note">${E(t("bx_porte_notif_note"))}</p></div>`;
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
  // v5.12 (page Technique) : d'abord les boîtiers et leur détail ; l'installation (faite une fois) est repliée en bas
  function html() {
    if (!CLOUD()) return `<div class="alert info">${E(t("bx_local"))}</div>`;
    let body;
    if (installed === null) body = `<p class="note">⏳ ${E(t("loading"))}</p>`;
    else if (installed === false) body = `<div class="alert warn">${E(t("bx_not_installed"))}</div>
      <div class="carte-actions wrap-actions"><button class="btn" data-bx="sql">📋 ${E(t("bx_sql_btn"))}</button><button class="btn secondary" data-bx="check">🔄 ${E(t("bx_check"))}</button></div>`;
    else body = `${demInstalled === false ? `<div class="alert info">📡 ${E(t("bx_read_install"))} <button class="btn petit secondary" data-bx="sql">📋 ${E(t("bx_sql_btn"))}</button></div>` : ""}
      ${htmlList()}${htmlDetails()}
      ${demInstalled === true ? htmlEcoute() + allCard() : ""}
      <h3>➕ ${E(t("bx_add_title"))}</h3><p class="note">${E(t("bx_add_note"))}</p>${htmlAdd()}`;
    const done = installed === true && devices.length > 0;
    const install = `<p class="note">${E(t("bx_intro"))}</p>${htmlSteps()}`;
    return `${done ? "" : install}
      ${lastError ? `<div class="alert err">${E(t("bx_error", { e: lastError }))}</div>` : ""}
      <div class="card">${body}</div>
      ${done ? `<details class="rs-more bx-install"><summary>🛠 ${E(t("bx_install_title"))}</summary>${install}</details>` : ""}`;
  }

  function mount(el) { _el = el; redraw(true); if (installed !== true || Date.now() - lastCheck > 20000) refresh(true); }
  function redraw(force) {
    drawSummary();                                            // v5.12 : page « Connexion RS232 » (si elle est affichée)
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
        <div class="alert info">${E(t("bx_sql_new"))}</div>
        <ol class="sql-steps">${SQL.map((q, i) => `<li>${i === SQL_DEM ? `<b class="bx-new">🆕 ${E(t("bx_sql_new_tag"))}</b>` : ""}<code>${E(q)}</code><button class="btn petit" data-copy-sql="${i}">📋 ${E(t("bx_copy"))}</button></li>`).join("")}</ol>
        <p class="note">${E(t("bx_sql_note"))}</p>`,
      ok: "✔ " + t("bx_sql_done"), cancel: t("bx_close"),
      onOk: () => { demForce = true; refresh(true); }
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
      else if (a === "check") { demForce = true; refresh(true); }
    });
    const add = el.querySelector("#bx-add"); if (add) add.onclick = () => addBox();
    el.querySelectorAll("[data-bxdel]").forEach(b => b.onclick = () => delBox(b.dataset.bxdel));
    el.querySelectorAll("[data-bxkey]").forEach(b => b.onclick = () => renewKey(b.dataset.bxkey));
    el.querySelectorAll("[data-bxm]").forEach(s => s.onchange = () => moveBox(s.dataset.bxm, s.value));
    const pn = el.querySelector("#bx-porte-notif");
    if (pn) pn.onchange = () => { BA.Actions.saveSettings({ porteNotif: pn.checked }); U().toast("🚪 " + t(pn.checked ? "bx_porte_notif_on" : "bx_porte_notif_off"), 6000); };
    const ec = el.querySelector("#bx-ec");
    if (ec) ec.onchange = () => {
      const v = Number(ec.value);
      if (!ECOUTE.includes(v)) return;
      BA.Actions.saveSettings({ ecouteMin: v });
      U().toast("⏱ " + t("bx_ec_saved", { d: duree(v) }), 7000);
      redraw(true);
    };
  }

  BA.Boitiers = {
    SQL, SQL_DEM, start, refresh, mount, redraw, tag, detail, readNow, readAll, allCard,
    // v5.12 : page « Connexion RS232 » (boîtiers et leur état seulement), redessinée au plus toutes les 30 s
    summary, tickSummary() { if (Date.now() - sumAt > 30000) drawSummary(); },
    // v5.15 (onglet Flux brut) : liste des boîtiers, en ligne ?, dernière demande d'un boîtier, délai affiché
    liste: () => devices.slice(), enLigne(id) { const d = devices.find(x => x.id === id); return !!d && isAlive(d); },
    demandeDe: id => demandes.get(id) || null, delai,
    estimate, nom(id) { const d = devices.find(x => x.id === id); return d ? d.name : ""; },
    lastError: () => lastError,
    demandes: () => new Map(demandes), demInstalled: () => demInstalled,
    lot: () => lot && { at: lot.at, n: lot.dem.size, fini: lot.fini, finiAt: lot.finiAt },
    alive(id, now) { return !!id && devices.some(d => d.machine_id === id && isAlive(d, now)); },
    // v5.11 : la machine est-elle vraiment lue par son boîtier ? (pas seulement le boîtier qui répond)
    machineLue(id, now) { return !!id && devices.some(d => d.machine_id === id && isAlive(d, now) && lectureRecente(d, now)); },
    etat(id, now) { const d = dernier(id); if (!d) return null; const i = d.info || {}; return { alive: isAlive(d, now), essai: Number(i.mode || 0) !== 0, lue: isAlive(d, now) && lectureRecente(d, now), st: i.st || "" }; },
    has(id) { return !!id && devices.some(d => d.machine_id === id); },
    devices: () => devices.slice(),
    installed: () => installed,
    // pour les essais
    _sha256: sha256, _lastKey: () => lastKey, _process: processReports,
    _rows: () => allRows().map(r => ({ num: r.m.num, st: r.st, mine: r.mine, x: r.x && { id: r.x.id, statut: r.x.statut, prise: r.x.prise_at, fini: r.x.fini_at }, d: r.d && r.d.id, seen: r.m.lastSeen })),
    _lotDem: () => lot ? [...lot.dem] : null
  };
})();
