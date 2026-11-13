import { PGlite } from "@electric-sql/pglite";
// Essai du fichier PRÉPARÉ supabase/preuve-livraison-securite.sql (verrou après 5 mots de passe faux), dans une vraie base
// PostgreSQL en mémoire : les fonctions actuelles de l'appli « Preuve de livraison » sont recréées telles qu'elles sont, puis remplacées.
// node tests/sql/preuve-livraison.test.mjs
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of ["create role anon", "create role authenticated",
  "create table public.pl_accounts (username text primary key, password text not null, role text not null)",
  "insert into public.pl_accounts values ('Admin', 'Bon-Admin-1', 'admin'), ('Tour Lier', 'chauffeur1', 'driver')",
  // les fonctions telles qu'elles sont aujourd'hui dans Supabase (lues le 13/11/2026)
  "create function public.pl_is_admin(a_user text, a_pass text) returns boolean language sql security definer set search_path to 'public' as $$ select exists(select 1 from pl_accounts where lower(username)=lower(trim(a_user)) and password=a_pass and role='admin'); $$",
  "create function public.pl_login(p_user text, p_pass text) returns text language sql security definer set search_path to 'public' as $$ select role from pl_accounts where lower(username)=lower(trim(p_user)) and password=p_pass; $$",
  "create function public.pl_admin_list(a_user text, a_pass text) returns table(username text, password text, role text) language plpgsql security definer set search_path to 'public' as $$ begin if not pl_is_admin(a_user,a_pass) then raise exception 'Accès refusé'; end if; return query select a.username, a.password, a.role from pl_accounts a order by a.role, a.username; end $$"]) await q(s);
const sql = fs.readFileSync(RACINE + "/supabase/preuve-livraison-securite.sql", "utf8").replace(/^--.*$/gm, "");
const cmds = sql.split(/;\s*\n(?=\s*(?:create|alter|revoke|grant)\b)|\$\$;\s*\n/).map(c => c.trim()).filter(Boolean).map(c => /\$\$/.test(c) && !/\$\$;?$/.test(c) ? c + "$$" : c);
for (const c of cmds) await q(c.replace(/;$/, ""));
ok("le fichier préparé passe (" + cmds.length + " commandes)", cmds.length === 9, cmds.length);
const login = async (u, p) => (await q("select public.pl_login($1, $2) r", [u, p])).rows[0].r;
const liste = async (u, p) => { try { return (await q("select * from public.pl_admin_list($1, $2)", [u, p])).rows.length; } catch (e) { return "refusé"; } };
ok("bon mot de passe du chauffeur : connecté (comme avant)", await login("tour lier", "chauffeur1") === "driver");
ok("mauvais mot de passe : refusé (comme avant)", await login("Tour Lier", "x") === null);
for (let i = 0; i < 4; i++) await login("Tour Lier", "faux" + i);
ok("après 5 essais faux : même le BON mot de passe est refusé (15 min)", await login("Tour Lier", "chauffeur1") === null);
ok("les autres comptes ne sont pas bloqués", await liste("Admin", "Bon-Admin-1") === 2);
await q("update public.pl_essais set bloque_jusqua = now() - interval '1 minute'");
ok("15 minutes plus tard : le bon mot de passe remarche", await login("Tour Lier", "chauffeur1") === "driver");
ok("admin : mauvais mot de passe → liste vide (essai compté)", await liste("Admin", "devine0") === 0);
for (let i = 1; i < 5; i++) await liste("Admin", "devine" + i);
ok("admin : 5 essais faux → liste des mots de passe bloquée, même avec le bon", await liste("Admin", "Bon-Admin-1") === 0);
await q("select public.pl_admin_add('Admin', 'devine9', 'Pirate', 'x')");
ok("admin bloqué : impossible d'ajouter un chauffeur", (await q("select count(*)::int n from public.pl_accounts where username = 'Pirate'")).rows[0].n === 0);
await q("update public.pl_essais set bloque_jusqua = now() - interval '1 minute'");
await q("select public.pl_admin_add('Admin', 'Bon-Admin-1', 'Tour Gent', 'gent1')");
ok("admin, bon mot de passe : ajoute un chauffeur, voit la liste (3 comptes)", await liste("Admin", "Bon-Admin-1") === 3);
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
