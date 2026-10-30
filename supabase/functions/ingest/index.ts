// ============================================================
// Broodautomate — fonction « ingest » : reçoit les envois des boîtiers 4G (LILYGO)
// Supabase → Edge Functions → Deploy a new function → Via Editor → nom : ingest
// → coller ce code → Deploy. Puis, dans les réglages de la fonction :
// « Verify JWT » (ou « Enforce JWT verification ») DÉSACTIVÉ : le boîtier
// s'identifie avec SA clé secrète (table devices), pas avec un compte.
//
// Ce que fait la fonction :
// 1. vérifie la clé du boîtier (seule son empreinte SHA-256 est dans la base) ;
// 2. note « vu à » et l'état du boîtier (signal, version, état de la lecture) ;
// 3. garde le relevé EVA-DTS (s'il y en a un) dans la table device_reports ;
// 4. répond {"ok":true,"t":<heure UTC>} : le boîtier se met à l'heure avec « t ».
// Broodautomate (PC ou téléphone) traite ensuite les relevés comme un relevé par câble.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

// Clé « secret » du projet : fournie par Supabase à la fonction (jamais écrite dans le code)
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
async function sha256(t: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const texte = (v: unknown, max: number) => (v == null ? "" : String(v)).slice(0, max);
const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

Deno.serve(async (req: Request) => {
  const t = Math.floor(Date.now() / 1000);
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement", t }, 405);
  const brut = await req.text();
  if (brut.length > 200000) return reponse({ ok: false, error: "envoi trop gros", t }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse(brut); } catch (_e) { return reponse({ ok: false, error: "JSON invalide", t }, 400); }
  if (!b || typeof b.k !== "string" || b.k.length < 16 || b.k.length > 128) return reponse({ ok: false, error: "clé absente", t }, 401);

  const { data: boitier, error: e1 } = await admin.from("devices").select("id, machine_id").eq("key_hash", await sha256(b.k)).maybeSingle();
  if (e1) return reponse({ ok: false, error: "base de données : " + e1.message, t }, 500);
  if (!boitier) return reponse({ ok: false, error: "clé inconnue", t }, 401);

  const info = {
    fw: texte(b.fw, 20), mode: nombre(b.mode), seq: nombre(b.seq), up: nombre(b.up), rssi: nombre(b.rssi),
    op: texte(b.op, 40), st: texte(b.st, 240), stok: b.stok === true, lok: nombre(b.lok),
    hb: nombre(b.hb), rd: nombre(b.rd), lu: nombre(b.lu), ko: nombre(b.ko), premier: b.premier === true,
  };
  const { error: e2 } = await admin.from("devices").update({ last_seen: new Date().toISOString(), info }).eq("id", boitier.id);
  if (e2) return reponse({ ok: false, error: "mise à jour : " + e2.message, t }, 500);

  if (typeof b.raw === "string" && b.raw.length > 0) {
    const raw = b.raw.replace(/\u0000/g, "?");
    // un relevé EVA-DTS complet commence par DXS et contient DXE
    if (!/^\s*DXS/.test(raw) || raw.indexOf("DXE") < 0) return reponse({ ok: false, error: "relevé incomplet", t }, 400);
    const ligne: Record<string, unknown> = { device_id: boitier.id, machine_id: boitier.machine_id, raw, role: b.role === "machine" ? "machine" : "boitier" };
    let { error: e3 } = await admin.from("device_reports").insert(ligne);
    if (e3 && /role/i.test(e3.message)) {               // table créée avant la colonne « role »
      delete ligne.role;
      ({ error: e3 } = await admin.from("device_reports").insert(ligne));
    }
    if (e3) return reponse({ ok: false, error: "enregistrement : " + e3.message, t }, 500);
  }
  return reponse({ ok: true, t });
});
