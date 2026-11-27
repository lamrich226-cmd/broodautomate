// Faux client Supabase en mémoire (juste ce que « ingest » utilise)
export const DB: Record<string, any[]> = { devices: [], device_reports: [], ba_notifications: [], ba_push_tokens: [], ba_vapid: [] };
// v5.36.0 : fonctions SQL appelées par « rpc » (nom → fonction ; absente = « function does not exist » comme avant la mise en place des commandes SQL)
export const RPC: Record<string, (args: any) => any> = {};
// colonnes qui n'existent pas encore (table → colonnes) : les lire donne l'erreur de PostgREST, comme avant la mise en place des commandes SQL
export const COLONNES_ABSENTES: Record<string, string[]> = {};
const comparer = (a: any, b: any) => typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
// v5.34.5 : colonnes demandées à chaque lecture (pour vérifier que la fonction ne télécharge pas plus que nécessaire)
export const lectures: { t: string; cols: string }[] = [];
// Comme PostgREST : « alias:colonne->a->b » (valeur JSON) ou « colonne->>a » (texte) ; colonnes ordinaires gardées telles quelles
function projeter(r: any, cols: string): any {
  const out: any = {};
  for (const part of cols.split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf(":"), alias = i > 0 ? part.slice(0, i) : null, expr = i > 0 ? part.slice(i + 1) : part;
    const morceaux = expr.split(/->>?/), col = morceaux[0], cles = morceaux.slice(1);
    let v = r[col];
    for (const k of cles) v = v == null ? null : (v[k] ?? null);
    if (/->>/.test(expr) && v != null) v = typeof v === "string" ? v : JSON.stringify(v);
    out[alias || (cles.length ? cles[cles.length - 1] : col)] = v === undefined ? null : v;
  }
  return out;
}
let seq = 1;
class Q {
  t: string; op = "select"; payload: any = null; f: ((r: any) => boolean)[] = []; opts: any = {}; one = false; head = false; ret = false; lim = 0; cols = "*"; ord: { k: string; asc: boolean } | null = null;
  constructor(t: string) { this.t = t; }
  select(c?: string, o?: any) { if (this.op === "select") { this.cols = c || "*"; this.opts = o || {}; this.head = !!(o && o.head); lectures.push({ t: this.t, cols: this.cols }); } else this.ret = true; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o: any) { this.op = "upsert"; this.payload = p; this.opts = o; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  is(k: string, v: any) { this.f.push(r => (r[k] ?? null) === v); return this; }
  gt(k: string, v: any) { this.f.push(r => comparer(r[k], v) > 0); return this; }
  lt(k: string, v: any) { this.f.push(r => comparer(r[k], v) < 0); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  order(k?: string, o?: any) { if (k) this.ord = { k, asc: !(o && o.ascending === false) }; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; }
  run() {
    const T = DB[this.t]; if (!T) return { data: null, error: { message: 'relation "' + this.t + '" does not exist' } };
    const absentes = COLONNES_ABSENTES[this.t] || [];
    if (this.op === "select" && absentes.some(c => new RegExp("(^|[ ,])" + c + "($|[ ,])").test(this.cols))) return { data: null, error: { message: "column " + this.t + "." + absentes.find(c => this.cols.includes(c)) + " does not exist" } };
    let m = T.filter(r => this.f.every(f => f(r)));
    if (this.ord) { const o = this.ord; m = [...m].sort((a, b) => (o.asc ? 1 : -1) * comparer(a[o.k], b[o.k])); }
    const copie = (r: any) => this.cols.trim() === "*" ? { ...r } : projeter(r, this.cols);   // comme PostgREST : seulement les colonnes demandées
    if (this.op === "select") { const d = this.lim ? m.slice(0, this.lim) : m; return this.head ? { count: m.length, error: null } : { data: this.one ? (d[0] ? copie(d[0]) : null) : d.map(copie), error: null }; }
    if (this.op === "update") { m.forEach(r => Object.assign(r, structuredClone(this.payload))); return { error: null }; }
    if (this.op === "delete") { DB[this.t] = T.filter(r => !m.includes(r)); return { error: null }; }
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload]; const out: any[] = [];
    for (const r0 of rows) { const r = { id: seq++, cree_at: new Date().toISOString(), received_at: new Date().toISOString(), envoye_at: null, silencieux: false, ...r0 };
      if (this.op === "upsert" && T.some(x => x.cle === r.cle)) continue; T.push(r); out.push(r); }
    return { data: out, error: null };
  }
  then(res: any, rej: any) { try { res(this.run()); } catch (e) { rej(e); } }
}
export function createClient() {
  return { from: (t: string) => new Q(t),
    rpc: async (nom: string, args: any) => RPC[nom] ? { data: await RPC[nom](args), error: null } : { data: null, error: { message: "Could not find the function public." + nom } } };
}
