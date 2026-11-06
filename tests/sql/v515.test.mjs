import { PGlite } from "@electric-sql/pglite";
// Essaie supabase/v513.sql + v515.sql (effacement automatique des relevés bruts) dans une vraie base PostgreSQL en mémoire.
// node tests/sql/v515.test.mjs   (pg_cron n'existe que chez Supabase : sa commande est sautée, le SQL de la tâche est essayé directement)
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of ["create role anon", "create role authenticated", "create role service_role", "create schema auth",
  "create table public.devices (id uuid primary key default gen_random_uuid(), machine_id text, info jsonb)",
  "create table public.device_reports (id bigint generated always as identity primary key, device_id uuid, machine_id text not null, raw text not null, role text, received_at timestamptz not null default now())",
]) await q(s);
// fichiers SQL : on découpe par commande (séparées par « ; » en fin de ligne), sans les commandes pg_cron
const commandes = f => fs.readFileSync(f, "utf8").replace(/^--.*$/gm, "").split(/;\s*(?:\n|$)/).map(x => x.trim()).filter(x => x && !/cron\.schedule/i.test(x));
// les fonctions contiennent des « ; » : on exécute chaque fichier d'un bloc, moins les lignes cron
const bloc = f => fs.readFileSync(f, "utf8").split("\n").filter(l => !/cron\.schedule/i.test(l)).join("\n");
await db.exec(bloc(RACINE + "/supabase/v513.sql"));
await db.exec(bloc(RACINE + "/supabase/v515.sql"));
ok("v513.sql et v515.sql passent dans PostgreSQL", true);

const m = "FAS000000001";
for (const [jours, n] of [[45, 3], [31, 2], [29, 4], [1, 5]])
  for (let i = 0; i < n; i++) await q("insert into public.device_reports (machine_id, raw, received_at) values ($1, $2, now() - ($3 || ' days')::interval)", [m, "x".repeat(1000), String(jours)]);
const avant = (await q("select count(*)::int c from public.device_reports")).rows[0].c;
const n = (await q("select public.ba_purge() n")).rows[0].n;
const reste = (await q("select count(*)::int c from public.device_reports")).rows[0].c;
ok("14 relevés au départ", avant === 14, avant);
ok("5 relevés de plus de 30 jours effacés", Number(n) === 5 && reste === 9, { n, reste });
ok("les relevés récents (29 jours et 1 jour) sont gardés", (await q("select count(*)::int c from public.device_reports where received_at > now() - interval '30 days'")).rows[0].c === 9);
const mois = (await q("select sum(n)::int n, sum(octets)::int o from public.ba_conso_mois")).rows[0];
ok("le total de data des relevés effacés est gardé par mois (14 relevés, 14 000 octets)", mois.n === 14 && mois.o === 14000, mois);
const n2 = (await q("select public.ba_purge() n")).rows[0].n;
ok("2e passage : rien de plus à effacer, totaux inchangés", Number(n2) === 0 && (await q("select sum(n)::int n from public.ba_conso_mois")).rows[0].n === 14);
// personne d'autre que la base elle-même ne peut lancer l'effacement
let refus = false; try { await q("set role authenticated"); await q("select public.ba_purge()"); } catch (e) { refus = /permission denied/i.test(e.message); }
await q("reset role");
ok("un compte connecté ne peut pas lancer l'effacement (permission refusée)", refus);
console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nTOUT EST BON");
process.exit(ko ? 1 : 0);
