// ============================================================
// BROODAUTOMATE v5.24 (design-test) — MODE DÉMO : 20 machines inventées, tout reste dans la page.
// Ne fait RIEN sans « ?demo » dans l'adresse (index.html?demo ou operateur.html?demo).
// En démo : (1) le stockage de la page est remplacé par une mémoire temporaire (ta vraie session et tes vraies
// données ne sont ni lues ni écrites), (2) les appels vers Supabase sont interceptés et répondus par une base
// inventée en mémoire : rien ne sort de la page, (3) des ventes inventées arrivent toutes les ~15 secondes.
// Doit être chargé AVANT supabase-js.
// ============================================================
(function () {
  if (!/[?&]demo\b/.test(location.search) && !window.BA_FORCE_DEMO) return;
  window.BA_DEMO = true;

  // ---------- 1. Stockage temporaire (sauf les petites préférences d'affichage « ba_… ») ----------
  const mem = {}; const real = window.localStorage;
  const store = {
    getItem: k => /^ba_/.test(k) ? real.getItem(k) : (k in mem ? mem[k] : null),
    setItem: (k, v) => { if (/^ba_/.test(k)) real.setItem(k, v); else mem[k] = String(v); },
    removeItem: k => { if (/^ba_/.test(k)) real.removeItem(k); else delete mem[k]; },
    clear: () => { Object.keys(mem).forEach(k => delete mem[k]); },
    key: i => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  try { Object.defineProperty(window, "localStorage", { value: store, configurable: true }); } catch (e) { /* tant pis */ }

  // ---------- 2. Données inventées ----------
  const REF = "ujvihkryzjrawamekwpu", BASE = "https://" + REF + ".supabase.co";
  const H = 3600000, D = 24 * H, MIN = 60000, now = Date.now();
  const rnd = (() => { let x = 20261113; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
  const pick = a => a[Math.floor(rnd() * a.length)];
  const LIEUX = [["Kerkstraat 12","Antwerpen"],["Molenstraat 4","Kasterlee"],["Schoolstraat 8","Linkeroever"],["Stationsplein 1","Brussel"],["Dorpsstraat 22","Turnhout"],["Havenlaan 9","Antwerpen"],["Markt 3","Mechelen"],["Bosweg 15","Lier"],
    ["Kasteelstraat 7","Kontich"],["Heistraat 31","Mol"],["Leuvensesteenweg 90","Brussel"],["Pastorijstraat 2","Geel"],["Sportlaan 5","Herentals"],["Nijverheidslaan 18","Boom"],["Vaartstraat 44","Lommel"],
    ["Koningsstraat 6","Brussel"],["Zandstraat 13","Hasselt"],["Bredabaan 120","Brasschaat"],["Veldstraat 9","Gent"],["Kerkplein 1","Oud-Turnhout"]];
  const TYPES = ["blanc", "gris", "complet", "maya", "sandwich"], PRIX = { blanc: 2.5, gris: 2.8, complet: 3.2, maya: 3.5, sandwich: 4.2 };
  const dk = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  const machines = LIEUX.map(([street, city], i) => {
    const num = 101 + i, etages = i % 5 === 4 ? 5 : 6, sels = [];
    for (let e = 1; e <= etages; e++) for (let c = 0; c < 3; c++) {
      const type = TYPES[(e + c + i) % 5], lots = [];
      const r = rnd();
      if (i === 3 && r < 0.97) { /* #104 : presque vide */ }
      else if (r > 0.12) {
        const q = 1 + Math.floor(rnd() * 3);
        const age = pick([6, 8, 12, 12, 14, 20, 32, 36, 54, 60, 84]);
        if (rnd() < 0.2 && q > 1) { lots.push({ id: 100000 + num * 100 + e * 3 + c, qty: 1, date: now - (age + 24) * H, kept: false }); lots.push({ id: 200000 + num * 100 + e * 3 + c, qty: q - 1 > 0 ? Math.min(2, q) : 1, date: now - 8 * H, kept: false }); }
        else lots.push({ id: 100000 + num * 100 + e * 3 + c, qty: q, date: now - age * H, kept: false });
      }
      sels.push({ n: e * 10 + 1 + c * 2, cap: 3, type, price: PRIX[type], lots });
    }
    return { id: "FAS-2021" + (60000 + num), num, street, city, region: city === "Brussel" ? "bxl" : "vl", serial: "2021" + (60000 + num), link: true, door: i === 2 || i === 12, doorAt: i === 2 ? now - 25 * MIN : i === 12 ? now - 3 * H : undefined,
      power: i === 5, powerUntil: null, temp: [4.5,5.1,6.2,4.8,4.4,5.5,4.9,13.5][i % 8], tempUntil: null, lastSale: now - (i + 1) * 17 * MIN, lastSeen: now - (i % 7) * 3 * MIN, nextSale: null, sels };
  });
  const daily = {};
  for (let d = 60; d >= 0; d--) { const k = dk(now - d * D); daily[k] = {}; const wd = new Date(now - d * D).getDay();
    machines.forEach((m, i) => { if (d === 0) return; const base = 14 + (i * 3) % 13 + ((d * 7 + i * 5) % 9) + (wd === 5 || wd === 6 ? 6 : 0), l = base + 3 + (i % 3);
      daily[k][m.num] = { s: base, r: Math.round(base * 2.9 * 100) / 100, l, x: l - base, c: Math.round(base * 1.1 * 100) / 100, y: { blanc: Math.round(base * .35), gris: Math.round(base * .25), complet: Math.round(base * .2), maya: Math.round(base * .1), sandwich: base - Math.round(base * .9) }, e: 0, o: 0 }; }); }
  const etat = { v: 1, hv: 2, seq: 900000, real: { v: 5, created: now - 70 * D }, daily, epoch: "demo", moves: [], thr48: true, orders: [], missions: [], interventions: [], journal: [], applied: [], events: [], customTypes: [], dayDecisions: {}, profileManual: {}, calendar: [],
    machines, settings: { dayHour: 4, tempMax: 18, tempMin: 2, emptyPct: 0, thrHours: 48, ecouteMin: 15, salePrice: 2.5, cardFeePct: 1.5, fixedMonthly: 150, returnTargetPct: 5,
      forecast: { weeks: 8, hourly: "typical", source: "auto", minWeeks: 4, safetyPct: 15, weighting: "recent", manualWeeks: 8, anomalyHours: 3, excludeSpecial: true, nextVisitHours: 24, excludeAnomalies: true } } };

  const T = { machines: machines.map(m => ({ id: m.id, name: m.street, city: m.city, serial: m.serial, model: null, status: "unknown", temp_c: m.temp, last_seen: null, created_at: "2026-10-27T10:00:00Z" })),
    products: [], sales: [], events: [], audits: [], devices: [], device_reports: [], ba_demandes: [] };
  const baState = [{ id: "main", version: 3, data: etat, updated_at: new Date().toISOString() }];
  const devices = () => machines.filter(m => m.num !== 107).map((m, i) => ({ id: "d0000000-0000-0000-0000-0000000000" + String(10 + i), name: "Boîtier " + m.num, machine_id: m.id, key_hash: "a".repeat(64),
    last_seen: new Date(Date.now() - 2 * MIN).toISOString(), created_at: "2026-10-27T10:00:00Z",
    info: { fw: "1.2", mode: 0, stok: true, st: "lecture réussie", hb: 30, rd: 60, ec: 900, lok: Math.floor((Date.now() - 5 * MIN) / 1000), rssi: 18, op: "20601", seq: 10, up: 7200, lu: 2, ko: 0 } }));

  // ---------- 3. Faux Supabase (réponses aux requêtes de supabase-js) ----------
  const b64u = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const USER = { id: "11111111-2222-3333-4444-555555555555", aud: "authenticated", role: "authenticated", email: "demo@broodautomate.test", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const sec = Math.floor(Date.now() / 1000);
  const session = () => ({ access_token: b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ aud: "authenticated", exp: sec + 86400 * 3650, iat: sec, iss: BASE + "/auth/v1", sub: USER.id, email: USER.email, role: "authenticated" }) + ".c2lnbmF0dXJl",
    token_type: "bearer", expires_in: 86400 * 3650, expires_at: sec + 86400 * 3650, refresh_token: "demo-refresh", user: USER });
  try { store.setItem("sb-" + REF + "-auth-token", JSON.stringify(session())); } catch (e) { /* */ }
  const clone = o => JSON.parse(JSON.stringify(o));
  function parseFilters(sp) {
    const f = [];
    for (const [k, v] of sp.entries()) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      const m = /^(eq|neq|gt|gte|lt|lte|in|is)\.([\s\S]*)$/.exec(v); if (!m) continue;
      let val = m[2]; if (m[1] === "in") val = val.replace(/^\(|\)$/g, "").split(",").map(x => x.replace(/^"|"$/g, ""));
      f.push({ col: k, op: m[1], val });
    }
    return f;
  }
  const match = (row, filters) => filters.every(({ col, op, val }) => { const x = row[col], sx = x == null ? null : String(x);
    switch (op) { case "eq": return sx === val; case "neq": return sx !== val; case "in": return val.includes(sx); case "is": return val === "null" ? x == null : String(x) === val;
      default: { const a = typeof x === "number" ? x : String(x), b = typeof x === "number" ? Number(val) : val; return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b; } } });
  const project = (rows, select) => { if (!select || select === "*") return clone(rows); const cols = select.split(",").map(s => s.trim()).filter(Boolean); return rows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] === undefined ? null : clone(r[c]); }); return o; }); };
  let seq = 5000;
  function rest(method, u, body, prefer) {
    const name = u.pathname.replace("/rest/v1/", "");
    if (name.startsWith("rpc/")) return { status: 404, body: { code: "PGRST202", message: "Could not find the function public." + name.slice(4) } };
    const tab = name === "ba_state" ? baState : name === "devices" ? (T.devices = devices()) : T[name];
    if (!tab) return { status: 404, body: { code: "PGRST205", message: "Could not find the table 'public." + name + "' in the schema cache" } };
    const sp = u.searchParams, filters = parseFilters(sp), wantRows = /return=representation/.test(prefer || ""), nowIso = new Date().toISOString();
    if (method === "GET" || method === "HEAD") {
      let rows = tab.filter(r => match(r, filters)); const order = sp.get("order");
      if (order) { const parts = order.split(",").map(o => { const [c, d] = o.split("."); return { c, desc: d === "desc" }; });
        rows = rows.slice().sort((a, b) => { for (const { c, desc } of parts) { if (a[c] < b[c]) return desc ? 1 : -1; if (a[c] > b[c]) return desc ? -1 : 1; } return 0; }); }
      const off = Number(sp.get("offset") || 0), lim = sp.get("limit") != null ? Number(sp.get("limit")) : Infinity;
      return { status: 200, body: project(rows.slice(off, off + lim), sp.get("select")) };
    }
    if (method === "POST") {
      const items = [].concat(JSON.parse(body || "[]")), upsert = /resolution=merge-duplicates/.test(prefer || ""), out = [];
      for (const it of items) { const row = clone(it); if (row.id == null) row.id = ++seq; if (name !== "ba_state" && !row.created_at) row.created_at = nowIso;
        const i = tab.findIndex(r => String(r.id) === String(row.id));
        if (i >= 0 && upsert) { tab[i] = Object.assign({}, tab[i], row); out.push(tab[i]); } else if (i >= 0) return { status: 409, body: { code: "23505", message: "duplicate key" } }; else { tab.push(row); out.push(row); } }
      return { status: 201, body: wantRows ? project(out, sp.get("select")) : undefined };
    }
    if (method === "PATCH") { const vals = JSON.parse(body || "{}"), rows = tab.filter(r => match(r, filters)); rows.forEach(r => Object.assign(r, clone(vals))); return { status: wantRows ? 200 : 204, body: wantRows ? project(rows, sp.get("select")) : undefined }; }
    if (method === "DELETE") { const keep = tab.filter(r => !match(r, filters)); const gone = tab.length - keep.length; tab.length = 0; keep.forEach(r => tab.push(r)); return { status: wantRows ? 200 : 204, body: wantRows ? [] : undefined, gone }; }
    return { status: 405, body: { message: "démo : méthode " + method } };
  }
  function handle(method, url, body, headers) {
    const u = new URL(url), p = u.pathname;
    if (p.startsWith("/auth/v1/")) {
      const a = p.replace("/auth/v1/", "");
      if (a === "token") return { status: 200, body: session() };
      if (a === "user") return { status: 200, body: USER };
      if (a === "logout") return { status: 204 };
      return { status: 404, body: { msg: "démo : " + a } };
    }
    if (p.startsWith("/rest/v1/")) return rest(method, u, body, headers.get("prefer"));
    return { status: 404, body: {} };
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (!url.startsWith(BASE)) return realFetch(input, init);
    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const headers = new Headers((init && init.headers) || (input && input.headers) || {});
    const body = init && init.body != null ? String(init.body) : null;
    const res = handle(method, url, body, headers);
    return Promise.resolve(new Response(res.status === 204 || res.body === undefined ? null : JSON.stringify(res.body), { status: res.status, headers: { "content-type": "application/json" } }));
  };
  // Temps réel : un faux canal qui répond « ok » à tout
  const RealWS = window.WebSocket;
  window.WebSocket = function (url, proto) {
    if (!/supabase\.co\/realtime/.test(String(url))) return new RealWS(url, proto);
    const ws = { readyState: 0, send(msg) { let arr; try { arr = JSON.parse(msg); } catch (e) { return; }
        const [joinRef, ref, topic, ev] = arr; if (!ref) return;
        setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify([joinRef, ref, topic, ev === "heartbeat" ? "phx_reply" : "phx_reply", { status: "ok", response: ev === "phx_join" ? { postgres_changes: [] } : {} }]) }), 5); },
      close() { ws.readyState = 3; ws.onclose && ws.onclose({ code: 1000 }); }, addEventListener() {}, removeEventListener() {} };
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen({}); }, 5);
    return ws;
  };
  window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;

  // ---------- 4. Bandeau + ventes inventées ----------
  window.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div"); b.className = "demo-banner"; b.id = "demo-banner";
    const txt = () => (window.BA && BA.I18n && BA.I18n.t && BA.I18n.dicts.fr.mv_demo ? BA.I18n.t("mv_demo") : "Mode démo : 20 machines inventées. Rien n'est envoyé à Supabase.");
    b.textContent = txt(); document.body.prepend(b); setTimeout(() => { b.textContent = txt(); }, 1500);
  });
  window.addEventListener("load", () => {
    if (/[?&]tick=0\b/.test(location.search)) return;     // essais automatiques : pas de ventes inventées
    setInterval(() => {
      try {
        if (!(window.BA && BA.Store && BA.Store.update)) return;
        BA.Store.update(s => {
          s.machines.forEach(m => { m.lastSeen = s.now; m.link = true; });
          for (let k = 0; k < 2; k++) {
            const m = s.machines[Math.floor(Math.random() * s.machines.length)]; if (!m || m.door || m.power) continue;
            const full = m.sels.filter(x => x.lots.length); if (!full.length) continue;
            const sel = full[Math.floor(Math.random() * full.length)]; BA.Model.sortLots(sel);
            const lot = sel.lots[0]; lot.qty -= 1; if (lot.qty <= 0) sel.lots.shift();     // FIFO : le plus ancien part en premier
            m.lastSale = s.now;
            BA.Model.addDaily(s, s.now, m.num, { s: 1, r: sel.price });
          }
        }, false, { derived: true });
      } catch (e) { /* démo : on ignore */ }
    }, 15000);
  });
})();
