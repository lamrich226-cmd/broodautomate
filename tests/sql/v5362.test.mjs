import { PGlite } from "@electric-sql/pglite";
// v5.36.2 — Essaie supabase/v5362.sql dans une vraie base PostgreSQL en mémoire : les deux règles de lecture réécrites
// (« (select auth.jwt()) », conseil performance de Supabase) gardent EXACTEMENT le même effet : l'admin lit les notifications
// et les copies de sécurité, un compte opérateur ne lit rien, sans compte rien non plus. La tâche « veille » : même appel, attente 15 s.
// node tests/sql/v5362.test.mjs
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of [
  "create role anon", "create role authenticated", "create role service_role bypassrls", "create schema auth",
  "grant usage on schema public to anon, authenticated, service_role",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
  "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$",
  "create table public.devices (id uuid primary key default gen_random_uuid())",
]) await q(s);
// les deux tables et leurs règles d'AVANT (telles qu'installées en production), puis v5362.sql
const AVANT = [
  "create table public.ba_notifications (id bigint generated always as identity primary key, cle text not null unique, device_id uuid references public.devices(id) on delete cascade, titre text, texte text)",
  "alter table public.ba_notifications enable row level security",
  `create policy "notifs_lecture_admin" on public.ba_notifications for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator')`,
  "grant select on public.ba_notifications to authenticated",
  "create table public.ba_state_backup (jour date not null, ligne text not null, version bigint, data jsonb not null, cree_at timestamptz not null default now(), primary key (jour, ligne))",
  "alter table public.ba_state_backup enable row level security",
  `create policy "copies_lecture_admin" on public.ba_state_backup for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator')`,
  "grant select on public.ba_state_backup to authenticated"];
for (const c of AVANT) await q(c);
await q("insert into public.ba_notifications (cle, titre, texte) values ('a', 'Vente', 'Pain gris vendu'), ('b', 'Porte', 'Porte ouverte')");
await q(`insert into public.ba_state_backup (jour, ligne, data) values (current_date, 'main', '{}'), (current_date, 'hist', '{}')`);
const lus = async claims => {
  await q("set request.jwt.claims = '" + claims + "'"); await q("set role authenticated");
  const n = (await q("select count(*)::int n from public.ba_notifications")).rows[0].n, c = (await q("select count(*)::int n from public.ba_state_backup")).rows[0].n;
  await q("reset role"); return n + "/" + c;
};
const ADMIN = `{"app_metadata":{"role":"admin"}}`, SANS_ROLE = `{"sub":"x"}`, OPE = `{"app_metadata":{"role":"operator"}}`, VIDE = "";
const avant = [await lus(ADMIN), await lus(SANS_ROLE), await lus(OPE), await lus(VIDE)];

const fichier = fs.readFileSync(RACINE + "/supabase/v5362.sql", "utf8");
const SQL = fichier.split("\n").filter(l => /^alter policy/i.test(l.trim()));
for (const c of SQL) await q(c);
ok("v5362.sql : les 2 règles réécrites passent", SQL.length === 2, SQL.length);
for (const c of SQL) await q(c);
ok("les rejouer une 2e fois ne casse rien", true);
const pol = (await q("select policyname, qual from pg_policies where policyname in ('notifs_lecture_admin', 'copies_lecture_admin') order by 1")).rows;
ok("les deux règles lisent le compte UNE fois par lecture (« SELECT auth.jwt() »)", pol.length === 2 && pol.every(p => /SELECT auth\.jwt\(\)/i.test(p.qual)), pol);
const apres = [await lus(ADMIN), await lus(SANS_ROLE), await lus(OPE), await lus(VIDE)];
ok("même effet qu'avant : admin 2 notifications / 2 copies, compte sans rôle pareil, opérateur 0 / 0", JSON.stringify(apres) === JSON.stringify(avant) && JSON.stringify(apres) === JSON.stringify(["2/2", "2/2", "0/0", "2/2"]), { avant, apres });
// (« sans compte » = jeton vide : la base réelle ne donne la lecture qu'aux comptes connectés — grant à authenticated seulement)
let refus = ""; try { await q("set role anon"); await q("select count(*) from public.ba_notifications"); } catch (e) { refus = e.message; } await q("reset role");
ok("visiteur sans compte (anon) : lecture refusée", /permission denied/i.test(refus), refus);

// tâche « veille » : même adresse, même message, attente 15 s ; l'installation neuve (notifications-sauvegarde.sql) fait pareil
const cmd = (fichier.match(/command := \$c\$(.+?)\$c\$/) || [])[1] || "";
ok("veille : même adresse et même message {\"veille\":1}, attente 15 000 ms", /functions\/v1\/ingest'/.test(cmd) && /body := '\{"veille":1\}'::jsonb/.test(cmd) && /timeout_milliseconds := 15000/.test(cmd), cmd);
ok("veille : on change SEULEMENT la commande (pas l'horaire), par son nom « ba-veille »", /cron\.alter_job\(job_id := \(select jobid from cron\.job where jobname = 'ba-veille'\), command :=/.test(fichier) && !/schedule :=/.test(fichier));
const neuf = fs.readFileSync(RACINE + "/supabase/notifications-sauvegarde.sql", "utf8");
ok("installation neuve : même commande de veille (15 s) et mêmes règles « (select auth.jwt()) »", neuf.includes(cmd) && (neuf.match(/using \(\(\(select auth\.jwt\(\)\) -> 'app_metadata' ->> 'role'\) is distinct from 'operator'\)/g) || []).length === 2);
ok("v5362.sql n'efface ni ne modifie aucune donnée (pas de delete / update / insert / drop / truncate)", !/^\s*(delete|update|insert|drop|truncate)\b/im.test(fichier));
console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST OK"); process.exit(ko ? 1 : 0);
