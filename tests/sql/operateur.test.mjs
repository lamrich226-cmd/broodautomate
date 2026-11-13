import { PGlite } from "@electric-sql/pglite";
// v5.25 : règles du compte OPÉRATEUR (supabase/operateur-compte.sql) dans une vraie base PostgreSQL en mémoire (PGlite).
// L'opérateur doit pouvoir LIRE les boîtiers et leurs relevés (sinon son appli ne voit plus les ventes), mais ni ajouter,
// ni modifier, ni effacer ; « Lire maintenant » lui reste fermé ; il ne peut pas effacer les données partagées.
// node tests/sql/operateur.test.mjs
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
const essai = async (s, p) => { try { const r = await db.query(s, p); return { ok: true, n: /^\s*select/i.test(s) ? r.rows.length : (r.affectedRows != null ? r.affectedRows : r.rows.length), rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of ["create role anon", "create role authenticated", "create role service_role", "create schema auth",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
  "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$",
  "grant usage on schema auth to authenticated", "grant execute on all functions in schema auth to authenticated"]) await q(s);
const lignes = f => fs.readFileSync(RACINE + "/supabase/" + f, "utf8").split("\n").filter(l => /^(create|alter|grant)/i.test(l.trim()) && !/^grant .* to anon|extension/i.test(l));
for (const c of lignes("ba_state.sql").concat(lignes("4g-boitiers.sql"))) await q(c);
// données de départ (comme le compte admin)
await q(`insert into public.ba_state (id, data) values ('main', '{"v":1}')`);
const dev = (await q("insert into public.devices (name, machine_id, key_hash) values ('Boîtier 1', 'FAS-1', 'abc') returning id")).rows[0].id;
await q("insert into public.device_reports (device_id, machine_id, raw) values ($1, 'FAS-1', 'DXS*X\r\nDXE*1*1')", [dev]);
await q("insert into public.ba_demandes (device_id, machine_id) values ($1, 'FAS-1')", [dev]);
// règles de l'opérateur
const regles = lignes("operateur-compte.sql").filter(l => /^create policy/i.test(l));
for (const c of regles) await q(c);
ok("règles du compte opérateur : " + regles.length + " commandes passent", regles.length === 8, regles.length);
await q("grant usage on schema public to authenticated");
const comme = async role => { await q("reset role"); await q(`set request.jwt.claims = '${JSON.stringify({ app_metadata: role ? { role } : {} })}'`); await q("set role authenticated"); };

await comme("operator");
let r = await essai("select id from public.devices"); ok("opérateur : voit les boîtiers", r.ok && r.n === 1, r);
r = await essai("select id from public.device_reports"); ok("opérateur : voit les relevés (ventes à jour même page admin fermée)", r.ok && r.n === 1, r);
r = await essai("update public.devices set name = 'x'"); ok("opérateur : ne peut pas modifier un boîtier", !r.ok || r.n === 0, r);
r = await essai("insert into public.devices (name, machine_id, key_hash) values ('pirate', 'FAS-9', 'zzz')"); ok("opérateur : ne peut pas ajouter de boîtier", !r.ok, r);
r = await essai("delete from public.device_reports"); ok("opérateur : ne peut pas effacer de relevé", !r.ok || r.n === 0, r);
r = await essai("insert into public.device_reports (device_id, machine_id, raw) values ($1, 'FAS-1', 'faux')", [dev]); ok("opérateur : ne peut pas inventer un relevé", !r.ok, r);
r = await essai("select id from public.ba_demandes"); ok("opérateur : « Lire maintenant » fermé (rien à lire)", r.ok && r.n === 0, r);
r = await essai("insert into public.ba_demandes (device_id, machine_id) values ($1, 'FAS-1')", [dev]); ok("opérateur : ne peut pas demander de lecture", !r.ok, r);
r = await essai("update public.ba_state set version = version + 1 where id = 'main'"); ok("opérateur : peut enregistrer son travail (stock, Remplir)", r.ok && r.n === 1, r);
r = await essai("delete from public.ba_state"); ok("opérateur : ne peut pas effacer les données partagées", !r.ok || r.n === 0, r);

await comme(null);
r = await essai("select id from public.ba_demandes"); ok("admin : voit les demandes « Lire maintenant »", r.ok && r.n === 1, r);
r = await essai("update public.devices set name = 'Boîtier 1 bis'"); ok("admin : peut modifier un boîtier", r.ok && r.n === 1, r);
r = await essai("delete from public.device_reports"); ok("admin : peut faire le ménage des relevés", r.ok && r.n === 1, r);
await q("reset role");
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
