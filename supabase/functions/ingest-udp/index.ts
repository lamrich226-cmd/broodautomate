// ============================================================
// Broodautomate — fonction « ingest-udp » (v5.28) : reçoit, par le webhook « Cloud Integrator » de 1NCE, les messages UDP des
// boîtiers (signal de vie, relevés), recolle les morceaux, puis transmet le message complet à la fonction « ingest » (même traitement
// qu'un envoi HTTPS). UDP ne confirme rien : le boîtier envoie les morceaux sous la forme « U1|<séquence>|<n° du morceau>|<nombre de
// morceaux>|<texte> » ; quand tous sont là, le message est traité UNE seule fois (même si 1NCE réessaie ou si le boîtier renvoie).
//
// Supabase → Edge Functions → Deploy a new function → nom « ingest-udp » → coller ce code → Deploy.
// « Verify JWT » : DÉSACTIVÉ (1NCE ne connaît pas de compte Supabase ; le secret ci-dessous protège la fonction).
// Secrets (Edge Functions → Secrets), créés par Amor lui-même (jamais envoyés dans un chat) :
//   INGEST_UDP_SECRET = mot de passe long (≥ 32 caractères), le MÊME dans l'en-tête « x-ba-udp » du webhook 1NCE ET dans la fonction « ingest »
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
const reponse = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

// ==== DÉBUT LOGIQUE PURE (testée hors Supabase) ====
const MAX_MORCEAUX = 40;            // 40 × 440 octets = 17 Ko : plus que le plus gros relevé permis
const MAX_TOTAL_OCTETS = 20000;

// comparaison à durée constante
function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Texte du paquet UDP : 1NCE le donne en « STRING » (valeur directe) ou en base64 (« encoding »). Les deux sont acceptés.
// deno-lint-ignore no-explicit-any
function texteDuPaquet(corps: any): string | null {
  const p = corps && corps.payload;
  if (!p || typeof p.value !== "string") return null;
  if (p.encoding === "base64") {
    try { const bin = atob(p.value); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return new TextDecoder("utf-8", { fatal: false }).decode(o); } catch (_e) { return null; }
  }
  return p.value;
}

// « U1|12|0|3|…texte… » → { seq: 12, idx: 0, total: 3, data: "…texte…" } ; autre chose (ex. « OUVERT v1.5.2 … ») → null
function lireMorceau(t: string | null): { seq: number; idx: number; total: number; data: string } | null {
  if (!t) return null;
  const m = /^U1\|(\d{1,9})\|(\d{1,3})\|(\d{1,3})\|([\s\S]*)$/.exec(t);
  if (!m) return null;
  const seq = Number(m[1]), idx = Number(m[2]), total = Number(m[3]);
  if (!(total >= 1 && total <= MAX_MORCEAUX) || idx >= total || m[4].length > 1200) return null;
  return { seq, idx, total, data: m[4] };
}

// Les morceaux (dans n'importe quel ordre, doublons possibles) → le message, ou null s'il en manque
function recoller(morceaux: { idx: number; total: number; data: string }[]): string | null {
  if (!morceaux.length) return null;
  const total = morceaux[0].total;
  const par = new Map<number, string>();
  for (const m of morceaux) { if (m.total !== total) return null; par.set(m.idx, m.data); }
  if (par.size !== total) return null;
  let o = "";
  for (let i = 0; i < total; i++) { const d = par.get(i); if (d === undefined) return null; o += d; }
  return o.length <= MAX_TOTAL_OCTETS ? o : null;
}

// Accusé de réception : « ok <séquence> » renvoyé au boîtier par l'API 1NCE (même chemin que « lire », mêmes secrets NCE_API_USER / NCE_API_PASSWORD).
// Sans accusé, le boîtier renvoie son message, puis se rabat sur HTTPS : rien ne se perd.
const API_NCE = "https://api.1nce.com/management-api";
async function accuser(fetchFn: typeof fetch, user: string, pass: string, iccid: string, seq: number): Promise<boolean> {
  try {
    const r = await fetchFn(API_NCE + "/oauth/token", { method: "POST", headers: { Authorization: "Basic " + btoa(user + ":" + pass), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "grant_type=client_credentials" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.access_token !== "string") return false;
    const u = await fetchFn(API_NCE + "/v1/integrate/devices/" + iccid + "/actions/UDP", { method: "POST", headers: { Authorization: "Bearer " + j.access_token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ payload: "ok " + Math.floor(seq), payloadType: "STRING", port: 3000, requestMode: "SEND_NOW" }) });
    return u.status === 200 || u.status === 201 || u.status === 202;
  } catch (_e) { return false; }
}
// ==== FIN LOGIQUE PURE ====

async function accuserSiPossible(iccid: string, seq: number): Promise<void> {
  const u = Deno.env.get("NCE_API_USER") ?? "", p = Deno.env.get("NCE_API_PASSWORD") ?? "";
  if (u && p) await accuser(fetch, u, p, iccid, seq);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement" }, 405);
  const secret = Deno.env.get("INGEST_UDP_SECRET") ?? "";
  if (secret.length < 32 || !egal(req.headers.get("x-ba-udp") || "", secret)) return reponse({ ok: false, error: "secret refusé" }, 401);
  // deno-lint-ignore no-explicit-any
  let corps: any;
  try { corps = await req.json(); } catch (_e) { return reponse({ ok: true, ignore: "illisible" }); }
  const iccid = corps && corps.device && corps.device.iccid;
  if (typeof iccid !== "string" || !/^\d{18,20}$/.test(iccid)) return reponse({ ok: true, ignore: "pas de carte" });
  const m = lireMorceau(texteDuPaquet(corps));
  if (!m) return reponse({ ok: true, ignore: "pas un envoi du boîtier" });   // « OUVERT … », « RECU … » : rien à faire

  // déjà traité ? (1NCE réessaie jusqu'à 5 fois, le boîtier peut renvoyer)
  // (la mémoire des séquences traitées ne dure que 6 h : un boîtier redémarré repart de 0 sans être pris pour un doublon)
  const sixH = new Date(Date.now() - 6 * 3600000).toISOString();
  await admin.from("ba_udp_faits").delete().eq("iccid", iccid).eq("seq", m.seq).lt("fait_at", sixH);
  const { data: fait } = await admin.from("ba_udp_faits").select("seq").eq("iccid", iccid).eq("seq", m.seq).maybeSingle();
  if (fait) { await accuserSiPossible(iccid, m.seq); return reponse({ ok: true, deja: true }); }
  const { error: e1 } = await admin.from("ba_udp_morceaux").upsert({ iccid, seq: m.seq, idx: m.idx, total: m.total, data: m.data }, { onConflict: "iccid,seq,idx" });
  if (e1) return reponse({ ok: false, error: "base de données : " + e1.message }, 500);
  const { data: tous, error: e2 } = await admin.from("ba_udp_morceaux").select("idx, total, data").eq("iccid", iccid).eq("seq", m.seq);
  if (e2) return reponse({ ok: false, error: "base de données : " + e2.message }, 500);
  const message = recoller(tous || []);
  if (message === null) return reponse({ ok: true, attente: (tous || []).length + "/" + m.total });

  // complet : marqué « fait » AVANT de traiter (un réessai de 1NCE ne double rien), puis transmis à « ingest »
  const { error: e3 } = await admin.from("ba_udp_faits").insert({ iccid, seq: m.seq });
  if (e3) return reponse({ ok: true, deja: true });
  await admin.from("ba_udp_morceaux").delete().eq("iccid", iccid).eq("seq", m.seq);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse(message); } catch (_e) { return reponse({ ok: true, ignore: "message illisible" }); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return reponse({ ok: true, ignore: "message illisible" });
  delete b.k; b.iccid = iccid;
  const r = await fetch((Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1/ingest", { method: "POST", headers: { "Content-Type": "application/json", "x-ba-udp": secret }, body: JSON.stringify(b) });
  // v5.28.1 : le résultat d'un « Lire maintenant » (fait / dok / dmsg) voyage dans le message UDP : on le note dans ba_demandes,
  // seulement pour une demande de CE boîtier encore en attente (même règle que la fonction SQL ba_boitier).
  if (r.ok && Number.isInteger(b.fait) && b.fait > 0) {
    try {
      const { data: dev } = await admin.from("devices").select("id").eq("iccid", iccid).maybeSingle();
      if (dev) await admin.from("ba_demandes").update({ statut: b.dok === false ? "echec" : "faite", fini_at: new Date().toISOString(), message: String(b.dmsg ?? "").slice(0, 240) })
        .eq("id", b.fait).eq("device_id", dev.id).in("statut", ["attente", "prise"]);
    } catch (_e) { /* le résultat est aussi redemandé en HTTPS en cas de repli */ }
  }
  if (r.ok) await accuserSiPossible(iccid, m.seq);
  // nettoyage des vieux morceaux et des vieilles séquences (une fois de temps en temps)
  if (m.seq % 20 === 0) {
    const limite = new Date(Date.now() - 86400000).toISOString();
    await admin.from("ba_udp_morceaux").delete().lt("recu_at", limite);
    await admin.from("ba_udp_faits").delete().lt("fait_at", sixH);
  }
  return reponse({ ok: r.ok, ingest: r.status });
});
