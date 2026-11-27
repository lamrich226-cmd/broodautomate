import { PGlite } from "@electric-sql/pglite";
// v5.36.0 — Essaie supabase/v5360.sql dans une vraie base PostgreSQL en mémoire : chaque appareil ne change que SES réglages
// node tests/sql/v5360.test.mjs
import fs from "node:fs"; import path from "node:path";
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = new PGlite();
const q = async (s, p) => { try { return await db.query(s, p); } catch (e) { throw new Error(e.message + "\n  SQL: " + s.slice(0, 160)); } };
const refuse = async (role, sql) => { let r = ""; try { await q("set role " + role); await q(sql); } catch (e) { r = e.message; } await q("reset role"); return r; };
let ko = 0; const ok = (n, c, x) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
for (const s of [
  "create role anon", "create role authenticated", "create role service_role bypassrls", "create schema auth",
  "grant usage on schema public to anon, authenticated, service_role",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
  "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$",
]) await q(s);
// la table et la fonction d'inscription existent déjà (notifications-sauvegarde.sql) : on reprend leurs 3 commandes utiles
const ancien = fs.readFileSync(RACINE + "/supabase/notifications-sauvegarde.sql", "utf8").split("\n").filter(l => /^(create table if not exists public\.ba_push_tokens|alter table public\.ba_push_tokens|grant all on public\.ba_push_tokens|create or replace function public\.ba_jeton)/i.test(l.trim()));
for (const c of ancien) await q(c);
await q("create table public.ba_state (id text primary key, data jsonb not null)");   // existe déjà dans la vraie base (les données de l'appli)
await q("grant all on public.ba_state to service_role");
const cmds = f => f.split("\n").filter(l => /^(create|alter|grant|revoke)/i.test(l.trim()));
const SQL = cmds(fs.readFileSync(RACINE + "/supabase/v5360.sql", "utf8"));
for (const c of SQL) await q(c);
ok("v5360.sql : " + SQL.length + " commandes passent", SQL.length === 8, SQL.length);
for (const c of SQL) await q(c);
ok("le rejouer une 2e fois ne casse rien", true);

const A = "11111111-2222-3333-4444-555555555555", B = "99999999-2222-3333-4444-555555555555";
await q("set request.jwt.claim.sub = '" + A + "'"); await q(`set request.jwt.claims = '{"app_metadata":{"role":"admin"}}'`);
await q("set role authenticated");
await q("select public.ba_jeton('jeton-de-lappareil-A-0123456789', 'android')");
let r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
ok("un appareil neuf n'a aucun réglage ({}) : tout est activé", JSON.stringify(r) === "{}", r);
await q(`select public.ba_prefs('jeton-de-lappareil-A-0123456789', '{"vente": false, "porte": false}'::jsonb)`);
r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
ok("réglages enregistrés puis relus", r.vente === false && r.porte === false, r);
await q("select public.ba_jeton('jeton-de-lappareil-A-0123456789', 'android')");
r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
ok("la réinscription de l'appareil (à chaque démarrage de l'appli) garde ses réglages", r.vente === false, r);
await q("reset role");

// un autre compte ne lit ni ne change les réglages d'un appareil qui n'est pas le sien
await q("set request.jwt.claim.sub = '" + B + "'"); await q(`set request.jwt.claims = '{"app_metadata":{"role":"operator"}}'`);
await q("set role authenticated");
await q(`select public.ba_prefs('jeton-de-lappareil-A-0123456789', '{"vente": true}'::jsonb)`);
r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
await q("reset role");
ok("un autre compte ne peut ni lire ni changer les réglages de cet appareil", r === null, r);
const brut = (await q("select prefs from public.ba_push_tokens where token = 'jeton-de-lappareil-A-0123456789'")).rows[0].prefs;
ok("les réglages de A sont restés intacts", brut.vente === false && brut.porte === false, brut);

// valeurs absurdes : remplacées par {} (jamais d'erreur ni de tableau)
await q("set request.jwt.claim.sub = '" + A + "'"); await q(`set request.jwt.claims = '{"app_metadata":{"role":"admin"}}'`);
await q("set role authenticated");
await q(`select public.ba_prefs('jeton-de-lappareil-A-0123456789', '[1,2,3]'::jsonb)`);
r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
ok("un tableau à la place d'un objet est remplacé par {}", JSON.stringify(r) === "{}", r);
await q(`select public.ba_prefs('jeton-de-lappareil-A-0123456789', ('{"x":"' || repeat('a', 500) || '"}')::jsonb)`);
r = (await q("select public.ba_prefs_lire('jeton-de-lappareil-A-0123456789') p")).rows[0].p;
ok("un réglage trop gros est remplacé par {}", JSON.stringify(r) === "{}", r);
await q("reset role");

// accès direct : la table reste fermée aux comptes de l'appli ; sans compte, rien ne passe
ok("authenticated ne peut PAS lire la table (ni les jetons) directement", /permission denied/i.test(await refuse("authenticated", "select prefs from public.ba_push_tokens")));
ok("anon ne peut PAS appeler ba_prefs", /permission denied/i.test(await refuse("anon", "select public.ba_prefs('x', '{}'::jsonb)")));
ok("anon ne peut PAS appeler ba_prefs_lire", /permission denied/i.test(await refuse("anon", "select public.ba_prefs_lire('x')")));
await q("set role service_role"); r = (await q("select prefs from public.ba_push_tokens")).rows; await q("reset role");
ok("la fonction « ingest » (clé serveur) lit les réglages", r.length === 1 && JSON.stringify(r[0].prefs) === "{}", r);

// ---- ba_stock_machine : ce que « ingest » lit d'UNE machine pour les notifications de rupture ----
const ETAT = { machines: [
  { id: "FAS-2012", num: 12, name: "Machine 12", g4: { rid: 40, base: "r40", at: 1000 }, sels: [
    { n: 11, type: "gris", lots: [{ qty: 3 }, { qty: 2 }] }, { n: 12, type: "gris", lots: [] }, { n: 21, type: "sandwich", lots: [{ qty: 4 }] }, { n: 22, type: "sandwich" }] },
  { id: "FAS-2099", num: 99, name: "Autre", sels: [{ n: 1, type: "blanc", lots: [{ qty: 9 }] }, { n: 2, type: "c77", lots: [{ qty: 1 }] }, { n: 3, type: "c79" }] }],
  customTypes: [{ id: "c77", name: "Pistolets" }, { id: "c78", name: "Pas dans cette machine" }, { id: "c79", name: "" }, { name: "sans identifiant" }],
  interventions: [
    { num: 12, status: "done", start: 500, invAt: 600, end: 900 }, { num: 12, status: "cancelled", start: 5000 },
    { num: 99, status: "open", start: 7000 }, { num: 12, status: "done", start: 1200, end: null, invAt: 1300 }] };
await q("insert into public.ba_state values ('main', $1::jsonb)", [JSON.stringify(ETAT)]);
await q("set role service_role");
r = (await q("select public.ba_stock_machine('FAS-2012') j")).rows[0].j;
const inconnue = (await q("select public.ba_stock_machine('FAS-0000') j")).rows[0].j;
const autre = (await q("select public.ba_stock_machine('FAS-2099') j")).rows[0].j;
await q("reset role");
ok("stock d'une machine : numéro, nom, relevé compté", r.num === 12 && r.nom === "Machine 12" && r.g4.base === "r40" && r.g4.at === 1000, r);
ok("stock par sélection = somme des lots (5, 0, 4, 0 si la liste manque)", JSON.stringify(r.sels.map(x => [x.n, x.type, Number(x.qty)])) === JSON.stringify([[11, "gris", 5], [12, "gris", 0], [21, "sandwich", 4], [22, "sandwich", 0]]), r.sels);
ok("dernière modification du stock par une intervention : la plus récente (pas l'annulée)", Number(r.tmod) === 1300, r.tmod);
ok("aucune intervention ouverte sur cette machine (l'ouverte est celle d'une AUTRE machine)", r.ouverte === false, r.ouverte);
ok("machine inconnue : rien (null)", inconnue === null, inconnue);
ok("noms des pains ajoutés dans l'appli : seulement ceux de CETTE machine, et seulement s'ils ont un nom", JSON.stringify(autre.noms) === '{"c77":"Pistolets"}', autre.noms);
ok("machine sans pain ajouté : noms vides ({})", JSON.stringify(r.noms) === "{}", r.noms);
await q("set role service_role"); await q("update public.ba_state set data = jsonb_set(data, '{interventions}', data -> 'interventions' || '[{\"num\":12,\"status\":\"open\",\"start\":9000}]'::jsonb)");
r = (await q("select public.ba_stock_machine('FAS-2012') j")).rows[0].j; await q("reset role");
ok("intervention ouverte sur cette machine : signalée", r.ouverte === true && Number(r.tmod) === 9000, r);
await q("set role service_role"); await q("update public.ba_state set data = '{}'::jsonb"); r = (await q("select public.ba_stock_machine('FAS-2012') j")).rows[0].j; await q("reset role");
ok("données vides : pas d'erreur", r === null, r);
ok("authenticated ne peut PAS appeler ba_stock_machine", /permission denied/i.test(await refuse("authenticated", "select public.ba_stock_machine('FAS-2012')")));
ok("anon ne peut PAS appeler ba_stock_machine", /permission denied/i.test(await refuse("anon", "select public.ba_stock_machine('FAS-2012')")));
console.log(ko ? "\n" + ko + " ÉCHEC(S)" : "\nv5.36.0 SQL : tout est bon"); process.exit(ko ? 1 : 0);
