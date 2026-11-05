// Faux serveur Supabase pour les essais de Broodautomate v5 (Playwright).
// La vraie bibliothèque supabase-js 2.117.2 tourne dans la page ; ce module répond à ses requêtes
// (PostgREST, connexion GoTrue, temps réel par WebSocket) avec une base en mémoire partagée par
// plusieurs « appareils » (contextes de navigateur : PC admin, téléphone opérateur…).
"use strict";

const REF = "ujvihkryzjrawamekwpu";
const BASE = `https://${REF}.supabase.co`;

const b64u = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const sha256 = t => require("crypto").createHash("sha256").update(t).digest("hex");
const clone = o => JSON.parse(JSON.stringify(o));

class FakeSupabase {
  constructor(opts = {}) {
    this.t = {
      machines: clone(opts.machines || []),
      products: clone(opts.products || []),
      sales: clone(opts.sales || []),
      events: [],
      audits: clone(opts.audits || [])
    };
    if (opts.boitiers) this.run4gSql();
    this.baState = opts.baState === false ? null : [];       // null : table pas encore créée
    this.users = opts.users || [{ id: "11111111-2222-3333-4444-555555555555", email: "amor@test.be", password: "Secret-123" }];
    this.seq = 5000;
    this.devices = {};                                        // nom → { offline, dropNext, log: [] }
    this.sockets = [];                                        // { ws, device, joins: [{ topic, joinRef, id }] }
    this.requests = [];
    this.realtimeId = 4242;
  }

  // ---------- jetons ----------
  token(user) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { aud: "authenticated", exp: now + 3600, iat: now, iss: BASE + "/auth/v1", sub: user.id, email: user.email, role: "authenticated", session_id: "s-" + now };
    return b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u(payload) + ".c2lnbmF0dXJl";
  }
  session(user) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: this.token(user), token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
      refresh_token: "refresh-" + user.id + "-" + now,
      user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: Object.assign({ provider: "email" }, user.meta || {}), user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
    };
  }
  userFromAuth(headers) {
    const a = headers["authorization"] || "";
    const m = /^Bearer\s+([^.]+)\.([^.]+)\./.exec(a);
    if (!m) return null;
    try {
      const p = JSON.parse(Buffer.from(m[2], "base64url").toString());
      return p.role === "authenticated" ? this.users.find(u => u.id === p.sub) || null : null;
    } catch (e) { return null; }
  }

  // ---------- appareils ----------
  device(name) { return this.devices[name] || (this.devices[name] = { offline: false, dropNext: 0, failNext: 0, log: [] }); }
  setOffline(name, v) {
    this.device(name).offline = v;
    if (v) this.sockets.filter(s => s.device === name).forEach(s => { try { s.ws.close({ code: 1006, reason: "offline" }); } catch (e) { /* déjà fermé */ } });
  }

  async attach(context, name) {
    const dev = this.device(name);
    await context.route(BASE + "/**", async route => {
      const req = route.request();
      if (dev.offline) { await route.abort("internetdisconnected"); return; }
      let res;
      try { res = this.handle(req.method(), req.url(), await req.allHeaders(), req.postData()); }
      catch (e) { res = { status: 500, body: { message: "fake: " + e.message } }; }
      this.requests.push({ device: name, method: req.method(), url: req.url().replace(BASE, ""), status: res.status });
      if (res.write && dev.dropNext > 0 && req.method() === "PATCH" && /\/ba_state/.test(req.url())) { dev.dropNext--; await route.abort("connectionreset"); return; }     // écrit, mais la réponse se perd
      await route.fulfill({
        status: res.status,
        headers: Object.assign({ "content-type": "application/json", "access-control-allow-origin": "*" }, res.headers || {}),
        body: res.body === undefined ? "" : (typeof res.body === "string" ? res.body : JSON.stringify(res.body))
      });
    });
    await context.routeWebSocket(/realtime\/v1\/websocket/, ws => {
      if (dev.offline) { ws.close({ code: 1006, reason: "offline" }); return; }
      const sock = { ws, device: name, joins: [] };
      this.sockets.push(sock);
      ws.onMessage(msg => {
        if (typeof msg !== "string") return;
        let arr; try { arr = JSON.parse(msg); } catch (e) { return; }
        const [joinRef, ref, topic, event, payload] = arr;
        if (event === "heartbeat") { ws.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }])); return; }
        if (event === "phx_join") {
          const pc = ((payload && payload.config && payload.config.postgres_changes) || []).map(f => Object.assign({ id: ++this.realtimeId }, f));
          sock.joins = sock.joins.filter(j => j.topic !== topic);
          pc.forEach(f => sock.joins.push({ topic, joinRef, id: f.id, table: f.table, event: f.event }));
          ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: pc } }]));
          return;
        }
        if (event === "phx_leave") { sock.joins = sock.joins.filter(j => j.topic !== topic); ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }])); return; }
        if (ref) ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      });
      ws.onClose(() => { this.sockets = this.sockets.filter(s => s !== sock); });
    });
  }

  // Changement dans une table → messages temps réel aux appareils abonnés
  broadcast(table, type, record, old) {
    const cols = Object.keys(record || old || {}).map(n => ({ name: n, type: n === "version" ? "int8" : n === "data" ? "jsonb" : "text" }));
    for (const s of this.sockets) {
      if (this.devices[s.device] && this.devices[s.device].offline) continue;
      s.joins.filter(j => j.table === table).forEach(j => {
        try {
          s.ws.send(JSON.stringify([j.joinRef, null, j.topic, "postgres_changes", {
            ids: [j.id],
            data: { schema: "public", table, commit_timestamp: new Date().toISOString(), type, columns: cols, record: record || {}, old_record: old || {}, errors: null }
          }]));
        } catch (e) { /* fermé */ }
      });
    }
  }

  // ---------- requêtes HTTP ----------
  handle(method, url, headers, body) {
    const u = new URL(url);
    if (u.pathname.startsWith("/auth/v1/")) return this.auth(method, u, headers, body);
    if (u.pathname.startsWith("/rest/v1/")) return this.rest(method, u, headers, body);
    return { status: 404, body: { message: "fake: inconnu " + u.pathname } };
  }

  auth(method, u, headers, body) {
    const p = u.pathname.replace("/auth/v1/", "");
    const data = body ? JSON.parse(body) : {};
    if (p === "token" && u.searchParams.get("grant_type") === "password") {
      const user = this.users.find(x => x.email === data.email && x.password === data.password);
      if (!user) return { status: 400, body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" } };
      return { status: 200, body: this.session(user) };
    }
    if (p === "token" && u.searchParams.get("grant_type") === "refresh_token") {
      const user = this.users[0];
      return { status: 200, body: this.session(user) };
    }
    if (p === "user") {
      const user = this.userFromAuth(headers);
      return user ? { status: 200, body: this.session(user).user } : { status: 401, body: { msg: "invalid JWT" } };
    }
    if (p === "logout") return { status: 204 };
    return { status: 404, body: { msg: "fake auth: " + p } };
  }

  table(name) {
    if (name === "ba_state") return this.baState;
    return this.t[name];
  }

  parseFilters(sp) {
    const f = [];
    for (const [k, v] of sp.entries()) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      const m = /^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/s.exec(v);
      if (!m) throw new Error("filtre inconnu " + k + "=" + v);
      let val = m[2];
      if (m[1] === "in") val = val.replace(/^\(|\)$/g, "").split(",").map(x => x.replace(/^"|"$/g, ""));
      f.push({ col: k, op: m[1], val });
    }
    return f;
  }
  match(row, filters) {
    return filters.every(({ col, op, val }) => {
      const x = row[col];
      const sx = x == null ? null : String(x);
      switch (op) {
        case "eq": return sx === val;
        case "neq": return sx !== val;
        case "in": return val.includes(sx);
        case "is": return val === "null" ? x == null : String(x) === val;
        case "gt": case "gte": case "lt": case "lte": {
          const a = typeof x === "number" ? x : String(x), b = typeof x === "number" ? Number(val) : val;
          return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
        }
      }
      return false;
    });
  }
  project(rows, select) {
    if (!select || select === "*") return clone(rows);
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    return rows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] === undefined ? null : clone(r[c]); }); return o; });
  }

  rest(method, u, headers, body) {
    const name = u.pathname.replace("/rest/v1/", "");
    const tab = this.table(name);
    if (!tab) return { status: 404, body: { code: "PGRST205", details: null, hint: null, message: `Could not find the table 'public.${name}' in the schema cache` } };
    const user = this.userFromAuth(headers);
    const rls = name === "ba_state" || name === "devices" || name === "device_reports" || name === "ba_demandes";
    const prefer = headers["prefer"] || "";
    const wantRows = /return=representation/.test(prefer);
    const sp = u.searchParams;
    const filters = this.parseFilters(sp);
    const now = new Date().toISOString();

    if (method === "GET" || method === "HEAD") {
      if (rls && !user) return { status: 200, body: [] };
      let rows = tab.filter(r => this.match(r, filters));
      const order = sp.get("order");
      if (order) {
        const parts = order.split(",").map(o => { const [c, d] = o.split("."); return { c, desc: d === "desc" }; });
        rows = rows.slice().sort((a, b) => {
          for (const { c, desc } of parts) { if (a[c] < b[c]) return desc ? 1 : -1; if (a[c] > b[c]) return desc ? -1 : 1; }
          return 0;
        });
      }
      const off = Number(sp.get("offset") || 0), lim = sp.get("limit") != null ? Number(sp.get("limit")) : Infinity;
      rows = rows.slice(off, off + lim);
      return { status: 200, body: this.project(rows, sp.get("select")) };
    }

    const isBa = name === "ba_state";
    if (rls && !user) return { status: 401, body: { code: "42501", details: null, hint: null, message: `new row violates row-level security policy for table "${name}"` } };

    if (method === "POST") {
      const items = [].concat(JSON.parse(body || "[]"));
      const upsert = /resolution=merge-duplicates/.test(prefer);
      const pk = "id";
      const out = [];
      // tout ou rien (comme une transaction)
      if (!upsert) for (const it of items) {
        if (it[pk] != null && tab.some(r => String(r[pk]) === String(it[pk]))) {
          return { status: 409, write: false, body: { code: "23505", details: `Key (${pk})=(${it[pk]}) already exists.`, hint: null, message: `duplicate key value violates unique constraint "${name}_pkey"` } };
        }
      }
      for (const it of items) {
        const row = clone(it);
        if (row[pk] == null) row[pk] = ++this.seq;
        if (!isBa && !row.created_at) row.created_at = now;
        if (name === "audits" && !row.imported_at) { this.lastTs = Math.max(Date.now(), (this.lastTs || 0) + 1); row.imported_at = new Date(this.lastTs).toISOString(); }
        if (name === "machines") { if (!row.status) row.status = "unknown"; }
        if (name === "devices") { if (!row.id || typeof row.id === "number") row.id = "dev-" + row.id; if (!row.info) row.info = {}; if (row.last_seen === undefined) row.last_seen = null; delete row.created_at; row.created_at = now; }
        if (name === "device_reports" && !row.received_at) row.received_at = now;
        if (name === "ba_demandes") { delete row.created_at; Object.assign(row, Object.assign({ statut: "attente", message: null, cree_at: now, prise_at: null, fini_at: null }, row)); }
        const i = tab.findIndex(r => String(r[pk]) === String(row[pk]));
        if (i >= 0) { const old = tab[i]; tab[i] = Object.assign({}, old, row); out.push(tab[i]); if (isBa) this.broadcast(name, "UPDATE", tab[i], { id: old.id }); }
        else { tab.push(row); out.push(row); if (isBa) this.broadcast(name, "INSERT", row, null); }
      }
      return { status: 201, write: true, body: wantRows ? this.project(out, sp.get("select")) : undefined };
    }
    if (method === "PATCH") {
      const vals = JSON.parse(body || "{}");
      const rows = tab.filter(r => this.match(r, filters));
      rows.forEach(r => { Object.assign(r, clone(vals)); if (isBa) this.broadcast(name, "UPDATE", r, { id: r.id }); });
      return { status: wantRows ? 200 : 204, write: true, body: wantRows ? this.project(rows, sp.get("select")) : undefined };
    }
    if (method === "DELETE") {
      const gone = tab.filter(r => this.match(r, filters));
      const keep = tab.filter(r => !this.match(r, filters));
      tab.length = 0; keep.forEach(r => tab.push(r));
      if (name === "machines") gone.forEach(m => ["products", "sales", "events", "audits"].forEach(k => { this.t[k] = this.t[k].filter(r => r.machine_id !== m.id); }));
      if (name === "devices" && this.t.device_reports) { const ids = new Set(gone.map(d => d.id)); this.t.device_reports = this.t.device_reports.filter(r => !ids.has(r.device_id)); if (this.t.ba_demandes) this.t.ba_demandes = this.t.ba_demandes.filter(r => !ids.has(r.device_id)); }
      return { status: wantRows ? 200 : 204, write: true, body: wantRows ? this.project(gone, sp.get("select")) : undefined };
    }
    return { status: 405, body: { message: "fake: méthode " + method } };
  }

  // l'utilisateur colle le script SQL dans Supabase
  runSetupSql() { if (!this.baState) this.baState = []; }
  // boîtiers 4G : les 9 commandes SQL
  run4gSql() { if (!this.t.devices) { this.t.devices = []; this.t.device_reports = []; } }
  // bouton « Lire maintenant » : commandes 10 à 17 (table ba_demandes + fonction ba_boitier)
  runDemandesSql() { if (!this.t.ba_demandes) this.t.ba_demandes = []; }
  // la fonction ba_boitier, appelée par le boîtier (même logique que le SQL, essayé à part dans PGlite)
  boitierRpc(k, fait = 0, ok = true, msg = "") {
    const t = Math.floor(Date.now() / 1000);
    if (!this.t.ba_demandes) return { status: 404, body: { code: "PGRST202", message: "Could not find the function public.ba_boitier" } };
    const d = (this.t.devices || []).find(x => x.key_hash === sha256(k));
    if (!d) return { status: 200, body: { ok: false, t, dem: 0, fait: 0 } };
    d.last_seen = new Date().toISOString();
    let n = 0;
    const f = this.t.ba_demandes.find(x => fait > 0 && x.id === fait && x.device_id === d.id && (x.statut === "attente" || x.statut === "prise"));
    if (f) { f.statut = ok ? "faite" : "echec"; f.fini_at = new Date().toISOString(); f.message = String(msg || "").slice(0, 240); n = 1; }
    const p = this.t.ba_demandes.filter(x => x.device_id === d.id && x.statut === "attente" && Date.now() - Date.parse(x.cree_at) < 3600000 && x.id !== fait).sort((a, b) => a.id - b.id)[0];
    if (p) { p.statut = "prise"; p.prise_at = new Date().toISOString(); }
    return { status: 200, body: { ok: true, t, dem: p ? p.id : 0, fait: n } };
  }
  ba(id) { return (this.baState || []).find(r => r.id === id) || null; }
}

module.exports = { FakeSupabase, BASE, REF };
