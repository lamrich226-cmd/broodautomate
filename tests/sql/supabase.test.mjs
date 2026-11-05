import { PGlite } from "@electric-sql/pglite";
// Essaie les commandes SQL de Supabase (fichiers supabase/*.sql) dans une vraie base PostgreSQL en mémoire (PGlite).
// node tests/sql/supabase.test.mjs   (pg_cron et pg_net n'existent que chez Supabase : leurs commandes sont sautées,
// mais le SQL des tâches automatiques est essayé directement)
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
// ce que Supabase fournit déjà
for (const s of [
  "create role anon", "create role authenticated", "create role service_role",
  "create schema auth",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
  "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$",
]) await q(s);
// tables existantes (4g-boitiers.sql + ba_state.sql)
const base = fs.readFileSync(RACINE + "/supabase/ba_state.sql", "utf8") + "\n" + fs.readFileSync(RACINE + "/supabase/4g-boitiers.sql", "utf8");
const cmds = f => f.split("\n").filter(l => /^(create|alter|grant|revoke|select|insert|update)/i.test(l.trim()));
for (const c of cmds(base)) { if (/^grant .* to anon|^select cron|extension/i.test(c)) {} await q(c); }
ok("anciennes commandes (ba_state + boîtiers) passent", true);
const n = cmds(fs.readFileSync(RACINE + "/supabase/notifications-sauvegarde.sql", "utf8"));
let passees = 0, sautees = [];
for (const c of n) { if (/extension|cron\./i.test(c)) { sautees.push(c.slice(0, 40)); continue; } await q(c); passees++; }
ok("nouvelles commandes : " + passees + " passent (pg_cron / pg_net seulement chez Supabase : " + sautees.length + ")", passees === 18 && sautees.length === 5, { passees, sautees });
// ba_jeton : inscription d'un téléphone
await q("set request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555'");
await q(`set request.jwt.claims = '{"app_metadata":{"role":"admin"}}'`);
await q("select public.ba_jeton('jeton-firebase-0123456789abcdef', 'android')");
let r = await q("select * from public.ba_push_tokens");
ok("ba_jeton : téléphone admin inscrit", r.rows.length === 1 && r.rows[0].operateur === false && r.rows[0].appareil === "android", r.rows);
await q(`set request.jwt.claims = '{"app_metadata":{"role":"operator"}}'`);
await q("set request.jwt.claim.sub = '99999999-2222-3333-4444-555555555555'");
await q("select public.ba_jeton('jeton-firebase-0123456789abcdef', 'android')");
r = await q("select * from public.ba_push_tokens");
ok("même téléphone, compte opérateur : rôle repris du compte (operateur = vrai)", r.rows.length === 1 && r.rows[0].operateur === true, r.rows);
await q("select public.ba_jeton('court', 'x')");
ok("jeton trop court refusé", (await q("select count(*)::int n from public.ba_push_tokens")).rows[0].n === 1);
await q("select public.ba_jeton_retirer('jeton-firebase-0123456789abcdef')");
ok("déconnexion : téléphone retiré", (await q("select count(*)::int n from public.ba_push_tokens")).rows[0].n === 0);
await q("reset request.jwt.claim.sub");
await q("select public.ba_jeton('jeton-firebase-0123456789abcdef', 'android')");
ok("sans compte : rien n'est inscrit", (await q("select count(*)::int n from public.ba_push_tokens")).rows[0].n === 0);
// copie de nuit (même SQL que la tâche pg_cron)
await q(`insert into public.ba_state (id, data) values ('main', '{"settings":{"salePrice":2.5}}'), ('hist', '{"days":[]}')`);
const job = fs.readFileSync(RACINE + "/supabase/notifications-sauvegarde.sql", "utf8").match(/'ba-copie-nuit', '[^']+', \$\$(.+?)\$\$/)[1];
await q(job); await q(job);
r = await q("select jour, ligne from public.ba_state_backup order by ligne");
ok("copie de nuit : 2 lignes (main + hist), une seule par jour même lancée 2 fois", r.rows.length === 2, r.rows);
const menage = fs.readFileSync(RACINE + "/supabase/notifications-sauvegarde.sql", "utf8").match(/'ba-copie-menage', '[^']+', \$\$(.+?)\$\$/)[1];
await q("insert into public.ba_state_backup (jour, ligne, data) values (current_date - 20, 'main', '{}')");
await q(menage);
ok("ménage : copies de plus de 14 jours effacées, celle du jour gardée", (await q("select count(*)::int n from public.ba_state_backup")).rows[0].n === 2);
// ba_boitier + réglage « Lire maintenant »
const k = "cle-secrete-du-boitier-1234";
await q("insert into public.devices (name, machine_id, key_hash) values ('Boîtier 1', 'FAS-1', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [k]);
let b = (await q("select public.ba_boitier($1) j", [k])).rows[0].j;
ok("ba_boitier sans réglage : ec = 0 (le boîtier garde son délai)", b.ok === true && b.ec === 0, b);
await q(`update public.ba_state set data = jsonb_set(data, '{settings,ecouteMin}', '15') where id = 'main'`);
b = (await q("select public.ba_boitier($1) j", [k])).rows[0].j;
ok("réglé sur 15 min → ec = 900", b.ec === 900, b);
await q(`update public.ba_state set data = jsonb_set(data, '{settings,ecouteMin}', '60') where id = 'main'`);
ok("réglé sur 1 h → ec = 3600", (await q("select public.ba_boitier($1) j", [k])).rows[0].j.ec === 3600);
await q(`update public.ba_state set data = jsonb_set(data, '{settings,ecouteMin}', '7') where id = 'main'`);
ok("valeur bizarre (7) → ec = 0", (await q("select public.ba_boitier($1) j", [k])).rows[0].j.ec === 0);
ok("mauvaise clé → ok = false", (await q("select public.ba_boitier('x') j")).rows[0].j.ok === false);
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
