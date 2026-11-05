// ============================================================
// Broodautomate — fonction « ordre » (v5.11) : réveille un boîtier 4G tout de suite (MQTT)
// quand on clique « Lire maintenant ». Supabase → Edge Functions → New function → nom « ordre » → coller ce code → Deploy.
// « Verify JWT » (ou « Enforce JWT verification ») reste DÉSACTIVÉ : elle est appelée par la base de données
// (déclencheur ba_demandes_ordre, voir supabase/mqtt.sql) et ne fait que ceci :
//   1. elle vérifie qu'une demande de lecture récente attend vraiment (statut « attente », moins de 5 min) ;
//   2. elle envoie UN message « 1 » sur le canal du boîtier (« ba/ » + 16 premiers caractères de l'empreinte de sa clé) ;
//   3. le boîtier, connecté en permanence, va chercher la demande chez Supabase (fonction ba_boitier) et lit la machine.
// Elle ne transporte aucune donnée : même si quelqu'un l'appelait au hasard, il ne se passerait rien (pas de demande en attente = rien envoyé).
// Secrets à créer (Edge Functions → Secrets) : MQTT_HOST (adresse du cluster), MQTT_USER (« serveur »), MQTT_PASS, MQTT_PORT (facultatif, 8883).
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
const reponse = (o: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

// ==== DÉBUT LOGIQUE PURE (testée hors Supabase) ====
// Un client MQTT 3.1.1 minimal : se connecter, envoyer un message, se déconnecter (qualité 0).
const enc = new TextEncoder();
function longueurRestante(n: number): number[] {            // codage MQTT de la longueur (1 à 4 octets)
  const o: number[] = [];
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0);
  return o;
}
function texteMqtt(s: string): number[] { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }

function paquetConnect(clientId: string, user: string, pass: string, keepalive: number): Uint8Array {
  const corps = [...texteMqtt("MQTT"), 4, 0xC2, keepalive >> 8, keepalive & 255, ...texteMqtt(clientId), ...texteMqtt(user), ...texteMqtt(pass)];
  // 0xC2 = identifiant + mot de passe + session propre
  return Uint8Array.from([0x10, ...longueurRestante(corps.length), ...corps]);
}
function paquetPublish(canal: string, texte: string): Uint8Array {
  const t = enc.encode(texte);
  const corps = [...texteMqtt(canal), ...t];                 // qualité 0 : pas d'identifiant de paquet
  return Uint8Array.from([0x30, ...longueurRestante(corps.length), ...corps]);
}
const DECONNEXION = Uint8Array.from([0xE0, 0x00]);
// Réponse du serveur : 20 02 00 00 = accepté ; code 4 ou 5 = identifiant ou mot de passe refusé
function lireConnack(b: Uint8Array): { ok: boolean; texte: string } {
  if (b.length < 4 || b[0] !== 0x20) return { ok: false, texte: "réponse inattendue du serveur MQTT" };
  if (b[3] === 0) return { ok: true, texte: "" };
  const t: Record<number, string> = { 1: "version refusée", 2: "identifiant client refusé", 3: "serveur indisponible", 4: "identifiant ou mot de passe incorrect", 5: "non autorisé" };
  return { ok: false, texte: t[b[3]] || "refus " + b[3] };
}
async function empreinte16(cle: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(cle));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
// ==== FIN LOGIQUE PURE ====

// Lit exactement n octets (ou échoue au bout de ms)
async function lire(conn: Deno.Conn, n: number, ms: number): Promise<Uint8Array> {
  const buf = new Uint8Array(n); let got = 0;
  const fin = Date.now() + ms;
  while (got < n) {
    const reste = fin - Date.now();
    if (reste <= 0) throw new Error("pas de réponse du serveur MQTT (délai dépassé)");
    const r = await Promise.race([conn.read(buf.subarray(got)), new Promise<null>((ok) => setTimeout(() => ok(null), reste))]);
    if (r === null) throw new Error("pas de réponse du serveur MQTT (délai dépassé)");
    got += r as number;
  }
  return buf;
}

async function publier(canal: string): Promise<void> {
  const hote = Deno.env.get("MQTT_HOST") ?? "", user = Deno.env.get("MQTT_USER") ?? "", pass = Deno.env.get("MQTT_PASS") ?? "";
  const port = Number(Deno.env.get("MQTT_PORT") ?? "8883") || 8883;
  if (!hote || !user || !pass) throw new Error("secrets MQTT_HOST, MQTT_USER et MQTT_PASS pas créés");
  const conn = await Deno.connectTls({ hostname: hote, port });
  try {
    await conn.write(paquetConnect("ba-ordre-" + crypto.randomUUID().slice(0, 8), user, pass, 30));
    const c = lireConnack(await lire(conn, 4, 8000));
    if (!c.ok) throw new Error("MQTT : " + c.texte);
    await conn.write(paquetPublish(canal, "1"));
    await conn.write(DECONNEXION);
  } finally {
    try { conn.close(); } catch (_e) { /* déjà fermée */ }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement" }, 405);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse(await req.text()); } catch (_e) { return reponse({ ok: false, error: "JSON invalide" }, 400); }
  const dem = Number(b && b.dem);
  if (!Number.isFinite(dem) || dem <= 0) return reponse({ ok: false, error: "demande absente" }, 400);
  try {
    const { data: d, error } = await admin.from("ba_demandes").select("id, statut, cree_at, device_id").eq("id", dem).maybeSingle();
    if (error) return reponse({ ok: false, error: "base de données : " + error.message }, 500);
    if (!d || d.statut !== "attente" || Date.now() - Date.parse(d.cree_at) > 5 * 60000) return reponse({ ok: true, envoye: false });
    const { data: bo } = await admin.from("devices").select("key_hash").eq("id", d.device_id).maybeSingle();
    if (!bo || !bo.key_hash) return reponse({ ok: true, envoye: false });
    await publier("ba/" + String(bo.key_hash).slice(0, 16));
    return reponse({ ok: true, envoye: true });
  } catch (e) {
    console.error("ordre", e);
    return reponse({ ok: false, error: String(e).slice(0, 200) }, 500);
  }
});
