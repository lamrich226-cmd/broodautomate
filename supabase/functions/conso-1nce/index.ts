// ============================================================
// Broodautomate — fonction « conso-1nce » (v5.27) : consommation EXACTE de la carte 1NCE d'un boîtier (Ko).
// L'appli (bouton « 📊 Consommation » dans le détail de la machine) appelle cette fonction ; elle interroge l'API 1NCE
// (usage du jour et des 7 derniers jours, volume restant) avec les MÊMES secrets que « lire-1nce » (NCE_API_USER, NCE_API_PASSWORD).
// Supabase → Edge Functions → Deploy a new function → nom « conso-1nce » → coller ce code → Deploy. « Verify JWT » reste ACTIVÉ.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

function cleServeur(): string {
  try {
    const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const k = o.default ?? Object.values(o)[0];
    if (typeof k === "string" && k) return k;
  } catch (_e) { /* ancienne clé ci-dessous */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", cleServeur(), { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reponse = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ==== DÉBUT LOGIQUE PURE (testée hors Supabase) ====
const API_NCE = "https://api.1nce.com/management-api";
const iccidValable = (s: unknown): s is string => typeof s === "string" && /^\d{18,20}$/.test(s);
const enBasic = (u: string, p: string) => "Basic " + btoa(u + ":" + p);
const jour = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// L'API donne des Mo (texte). 1 Mo = 1000 Ko pour 1NCE (carte de 500 Mo). On renvoie les Ko, arrondis à 0,1 Ko.
const enKo = (mo: unknown): number | null => { const n = Number(mo); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10 : null; };

// Réponse de /usage : { stats: [{ date, data: { volume, volume_rx, volume_tx } }] } → un tableau par jour, en Ko
function jours(j: any): { date: string; ko: number | null; rx: number | null; tx: number | null }[] {
  const st = j && Array.isArray(j.stats) ? j.stats : [];
  return st.map((s: any) => ({ date: String(s && s.date || "").slice(0, 10), ko: enKo(s && s.data && s.data.volume), rx: enKo(s && s.data && s.data.volume_rx), tx: enKo(s && s.data && s.data.volume_tx) }))
    .filter((x: { date: string }) => x.date).sort((a: { date: string }, b: { date: string }) => a.date < b.date ? 1 : -1);
}

async function interroger(fetchFn: typeof fetch, user: string, pass: string, iccid: string, maintenant: number) {
  let jeton = "";
  try {
    const r = await fetchFn(API_NCE + "/oauth/token", { method: "POST", headers: { Authorization: enBasic(user, pass), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.access_token !== "string") return { ok: false, erreur: "jeton 1NCE refusé (" + r.status + ")" };
    jeton = j.access_token;
  } catch (_e) { return { ok: false, erreur: "1NCE injoignable (jeton)" }; }
  const h = { Authorization: "Bearer " + jeton, Accept: "application/json" };
  try {
    const u = await fetchFn(API_NCE + "/v1/sims/" + iccid + "/usage?start_dt=" + jour(maintenant - 7 * 86400000) + "&end_dt=" + jour(maintenant), { headers: h });
    if (!u.ok) return { ok: false, erreur: "consommation refusée (" + u.status + ")" };
    const jr = jours(await u.json().catch(() => ({})));
    let restantKo: number | null = null, totalKo: number | null = null;
    try {
      const q = await fetchFn(API_NCE + "/v1/sims/" + iccid + "/quota/data", { headers: h });
      if (q.ok) { const qj = await q.json().catch(() => ({})); restantKo = enKo(qj.volume); totalKo = enKo(qj.total_volume); }
    } catch (_e) { /* le reste suffit */ }
    return { ok: true, jours: jr, restantKo, totalKo };
  } catch (_e) { return { ok: false, erreur: "1NCE injoignable (consommation)" }; }
}
// ==== FIN LOGIQUE PURE ====

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement" }, 405);
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = jeton ? await admin.auth.getUser(jeton) : null;
  if (!u || u.error || !u.data || !u.data.user) return reponse({ ok: false, error: "connexion requise" }, 401);
  let b: { device?: string } = {};
  try { b = await req.json(); } catch (_e) { return reponse({ ok: false, error: "demande illisible" }, 400); }
  const deviceId = String(b.device || "");
  if (!deviceId) return reponse({ ok: false, error: "boîtier manquant" }, 400);
  const { data: dev } = await admin.from("devices").select("id, iccid").eq("id", deviceId).maybeSingle();
  if (!dev) return reponse({ ok: false, error: "boîtier inconnu" }, 400);
  if (!iccidValable(dev.iccid)) return reponse({ ok: false, error: "iccid manquant" }, 409);
  const user = Deno.env.get("NCE_API_USER") ?? "", pass = Deno.env.get("NCE_API_PASSWORD") ?? "";
  if (!user || !pass) return reponse({ ok: false, error: "identifiants 1NCE absents" }, 503);
  const r = await interroger(fetch, user, pass, dev.iccid, Date.now());
  return reponse(r as Record<string, unknown>, r.ok ? 200 : 502);
});
