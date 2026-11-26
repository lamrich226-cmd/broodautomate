import { PGlite } from "@electric-sql/pglite";
// v5.34.6 — Essaie supabase/web-push.sql dans une vraie base PostgreSQL en mémoire : la clé privée reste illisible pour les comptes de l'appli
// node tests/sql/web-push.test.mjs
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
const refuse = async (role, sql) => { let r = ""; try { await q("set role " + role); await q(sql); } catch (e) { r = e.message; } await q("reset role"); return r; };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of ["create role anon", "create role authenticated", "create role service_role bypassrls", "grant usage on schema public to anon, authenticated, service_role"]) await q(s);
await db.exec(fs.readFileSync(RACINE + "/supabase/web-push.sql", "utf8"));
ok("web-push.sql passe dans PostgreSQL", true);
await db.exec(fs.readFileSync(RACINE + "/supabase/web-push.sql", "utf8"));
ok("le rejouer une 2e fois ne casse rien (create if not exists / or replace)", true);

// la fonction « ingest » (clé serveur = service_role) écrit la paire de clés
await q("set role service_role");
await q("insert into public.ba_vapid (id, pub, priv) values (1, 'PUBLIQUE-65-octets', '{\"kty\":\"EC\",\"d\":\"SECRET-PRIVE\"}') on conflict (id) do nothing");
await q("insert into public.ba_vapid (id, pub, priv) values (1, 'AUTRE', 'AUTRE') on conflict (id) do nothing");
const lignes = (await q("select pub from public.ba_vapid")).rows; await q("reset role");
ok("service_role écrit la paire de clés ; un 2e envoi ne la remplace pas (1 ligne, 1re clé gardée)", lignes.length === 1 && lignes[0].pub === "PUBLIQUE-65-octets", lignes);
const trop = await refuse("service_role", "insert into public.ba_vapid (id, pub, priv) values (2, 'x', 'y')");
ok("une 2e ligne (id ≠ 1) est refusée : une seule paire de clés", /check|violat/i.test(trop), trop);

for (const role of ["authenticated", "anon"]) {
  ok(role + " ne peut PAS lire la table des clés (clé privée)", /permission denied/i.test(await refuse(role, "select priv from public.ba_vapid")));
  ok(role + " ne peut PAS écrire dans la table des clés", /permission denied/i.test(await refuse(role, "update public.ba_vapid set priv = 'x'")));
}
// la clé PUBLIQUE, seulement pour un compte connecté
await q("set role authenticated"); const pub = (await q("select public.ba_vapid_public() p")).rows[0].p; await q("reset role");
ok("un compte connecté obtient la clé PUBLIQUE par ba_vapid_public()", pub === "PUBLIQUE-65-octets", pub);
ok("un visiteur non connecté (anon) n'a pas le droit d'appeler ba_vapid_public()", /permission denied/i.test(await refuse("anon", "select public.ba_vapid_public()")));
ok("la clé publique renvoyée ne contient pas la clé privée", !/SECRET-PRIVE/.test(String(pub)));
console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
