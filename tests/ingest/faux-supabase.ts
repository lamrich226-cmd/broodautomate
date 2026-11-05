// Faux client Supabase en mémoire (juste ce que « ingest » utilise)
export const DB: Record<string, any[]> = { devices: [], device_reports: [], ba_notifications: [], ba_push_tokens: [] };
let seq = 1;
class Q {
  t: string; op = "select"; payload: any = null; f: ((r: any) => boolean)[] = []; opts: any = {}; one = false; head = false; ret = false; lim = 0;
  constructor(t: string) { this.t = t; }
  select(_c?: string, o?: any) { if (this.op === "select") { this.opts = o || {}; this.head = !!(o && o.head); } else this.ret = true; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o: any) { this.op = "upsert"; this.payload = p; this.opts = o; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  is(k: string, v: any) { this.f.push(r => (r[k] ?? null) === v); return this; }
  gt(k: string, v: any) { this.f.push(r => String(r[k]) > String(v)); return this; }
  lt(k: string, v: any) { this.f.push(r => String(r[k]) < String(v)); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  order() { return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; }
  run() {
    const T = DB[this.t]; const m = T.filter(r => this.f.every(f => f(r)));
    if (this.op === "select") { const d = this.lim ? m.slice(0, this.lim) : m; return this.head ? { count: m.length, error: null } : { data: this.one ? (d[0] ? { ...d[0] } : null) : d.map(r => ({ ...r })), error: null }; }
    if (this.op === "update") { m.forEach(r => Object.assign(r, structuredClone(this.payload))); return { error: null }; }
    if (this.op === "delete") { DB[this.t] = T.filter(r => !m.includes(r)); return { error: null }; }
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload]; const out: any[] = [];
    for (const r0 of rows) { const r = { id: seq++, cree_at: new Date().toISOString(), envoye_at: null, silencieux: false, ...r0 };
      if (this.op === "upsert" && T.some(x => x.cle === r.cle)) continue; T.push(r); out.push(r); }
    return { data: out, error: null };
  }
  then(res: any, rej: any) { try { res(this.run()); } catch (e) { rej(e); } }
}
export function createClient() { return { from: (t: string) => new Q(t) }; }
