// ============================================================
// Broodautomate — fonction « lire-1nce » (v5.26) : bouton « Lire maintenant » INSTANTANÉ pour les boîtiers à carte 1NCE.
// L'appli écrit la demande dans ba_demandes (comme avant), puis appelle cette fonction. Elle envoie au boîtier, par
// l'API 1NCE (Device Controller, UDP, port 3000, « Send now »), le message « lire <n° de la demande> » (« b » en plus
// pour le relevé complet). Le boîtier lit la machine tout de suite et rend le résultat à la demande n° <n>.
// Si ce message se perd (1NCE ne confirme jamais la réception d'un message UDP), la demande reste en attente et le
// boîtier la prend à son prochain passage habituel (15 min, 30 min ou 1 h) : rien n'est perdu.
//
// Supabase → Edge Functions → Deploy a new function → nom « lire-1nce » → coller ce code → Deploy.
// « Verify JWT » reste ACTIVÉ (l'appli envoie le jeton du compte connecté).
// Secrets (Edge Functions → Secrets), à créer par Amor lui-même (jamais envoyés dans un chat) :
//   NCE_API_USER      = « Client ID » créé dans le portail 1NCE (Account → Management API Access)
//   NCE_API_PASSWORD  = « Client secret » de ce même couple
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
const PORT_BOITIER = 3000;
const ATTENTE_MAX_MS = 5 * 60 * 1000;                       // une demande plus vieille n'est plus envoyée par UDP (le boîtier la prendra à son passage)

// ICCID : 18 à 20 chiffres (1NCE : 89882280…)
const iccidValable = (s: unknown): s is string => typeof s === "string" && /^\d{18,20}$/.test(s);

// Message envoyé au boîtier : « lire 42 » (ou « lire 42 b » pour le flux brut). Fabriqué ICI à partir de la demande lue dans la base :
// l'appli ne peut pas faire envoyer autre chose.
function messageBoitier(d: { id: number; brut?: boolean | null }): string {
  return "lire " + Math.floor(Number(d.id)) + (d.brut ? " b" : "");
}

// Contrôle de la demande avant l'envoi : renvoie un texte d'erreur, ou "" si tout va bien
function verifier(dem: { id?: number; device_id?: string; statut?: string; cree_at?: string } | null, dev: { id?: string; iccid?: string | null } | null, deviceId: string, maintenant: number): string {
  if (!dev) return "boîtier inconnu";
  if (!iccidValable(dev.iccid)) return "iccid manquant";
  if (!dem) return "demande inconnue";
  if (dem.device_id !== deviceId) return "demande d'un autre boîtier";
  if (dem.statut !== "attente") return "demande déjà traitée";
  const age = maintenant - Date.parse(String(dem.cree_at || ""));
  if (!Number.isFinite(age) || age > ATTENTE_MAX_MS) return "demande trop ancienne";
  return "";
}

const enBasic = (u: string, p: string) => "Basic " + btoa(u + ":" + p);

// Appel de l'API 1NCE : jeton OAuth (client_credentials), puis action UDP. fetchFn est injectable pour les essais.
async function envoyerUdp(fetchFn: typeof fetch, user: string, pass: string, iccid: string, texte: string): Promise<{ ok: boolean; id?: string; erreur?: string }> {
  let jeton = "";
  try {
    const r = await fetchFn(API_NCE + "/oauth/token", { method: "POST", headers: { Authorization: enBasic(user, pass), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.access_token !== "string") return { ok: false, erreur: "jeton 1NCE refusé (" + r.status + ")" };
    jeton = j.access_token;
  } catch (e) { return { ok: false, erreur: "1NCE injoignable (jeton)" }; }
  try {
    const r = await fetchFn(API_NCE + "/v1/integrate/devices/" + iccid + "/actions/UDP", { method: "POST", headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ payload: texte, payloadType: "STRING", port: PORT_BOITIER, requestMode: "SEND_NOW" }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 202 || r.status === 200 || r.status === 201) return { ok: true, id: typeof j.id === "string" ? j.id : "" };
    return { ok: false, erreur: "envoi UDP refusé (" + r.status + ")" };
  } catch (e) { return { ok: false, erreur: "1NCE injoignable (envoi)" }; }
}
// ==== FIN LOGIQUE PURE ====

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement" }, 405);
  // Un VRAI compte connecté est exigé (le jeton « anon » de l'appli ne suffit pas)
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = jeton ? await admin.auth.getUser(jeton) : null;
  if (!u || u.error || !u.data || !u.data.user) return reponse({ ok: false, error: "connexion requise" }, 401);
  let b: { device?: string; demande?: number } = {};
  try { b = await req.json(); } catch (_e) { return reponse({ ok: false, error: "demande illisible" }, 400); }
  const deviceId = String(b.device || ""), demId = Number(b.demande);
  if (!deviceId || !Number.isFinite(demId)) return reponse({ ok: false, error: "boîtier ou demande manquant" }, 400);

  const { data: dev } = await admin.from("devices").select("id, iccid").eq("id", deviceId).maybeSingle();
  const { data: dem } = await admin.from("ba_demandes").select("id, device_id, statut, cree_at, brut").eq("id", demId).maybeSingle();
  const erreur = verifier(dem, dev, deviceId, Date.now());
  if (erreur) return reponse({ ok: false, error: erreur }, erreur === "iccid manquant" ? 409 : 400);

  const user = Deno.env.get("NCE_API_USER") ?? "", pass = Deno.env.get("NCE_API_PASSWORD") ?? "";
  if (!user || !pass) return reponse({ ok: false, error: "identifiants 1NCE absents" }, 503);
  const r = await envoyerUdp(fetch, user, pass, String(dev.iccid), messageBoitier(dem));
  return reponse(r.ok ? { ok: true, id: r.id || "" } : { ok: false, error: r.erreur || "échec" }, r.ok ? 200 : 502);
});
