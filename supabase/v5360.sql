-- ============================================================
-- Broodautomate v5.36.0 : CHOISIR SES NOTIFICATIONS (ventes, ruptures de pain, pannes, porte, boîtier)
-- L'éditeur SQL de Supabase : copie UNE commande (une ligne qui finit par « ; »), colle-la dans
-- SQL Editor → Run → « Success », puis la suivante. Les lignes qui commencent par « -- » sont des explications.
-- Rien ici n'efface ni ne change tes données : on AJOUTE une colonne et deux fonctions.
-- Chaque téléphone / ordinateur garde SES réglages (pas ceux des autres). Sans réglage : tout est activé.
-- ============================================================

-- 1. Les réglages de l'appareil : par exemple {"vente": false} = pas de notification pour les ventes
alter table public.ba_push_tokens add column if not exists prefs jsonb not null default '{}'::jsonb;

-- 2. L'appli enregistre les réglages de SON appareil (un compte ne peut pas changer ceux d'un autre)
create or replace function public.ba_prefs(t text, p jsonb) returns void language sql security definer set search_path = '' as $$ update public.ba_push_tokens set prefs = case when p is not null and jsonb_typeof(p) = 'object' and length(p::text) < 400 then p else '{}'::jsonb end where token = t and user_id = auth.uid(); $$;

-- 3. L'appli relit les réglages de SON appareil
create or replace function public.ba_prefs_lire(t text) returns jsonb language sql stable security definer set search_path = '' as $$ select prefs from public.ba_push_tokens where token = t and user_id = auth.uid(); $$;

-- 4.
revoke execute on function public.ba_prefs(text, jsonb), public.ba_prefs_lire(text) from public, anon;

-- 5.
grant execute on function public.ba_prefs(text, jsonb), public.ba_prefs_lire(text) to authenticated;

-- 6. Pour les notifications de rupture de pain : la fonction « ingest » lit SEULEMENT ce qu'il lui faut d'UNE machine
--    (ses sélections avec leur type et leur quantité en stock, son dernier relevé compté, ses interventions,
--    le NOM des pains ajoutés dans l'appli qu'elle utilise), pas toutes les données de l'appli
create or replace function public.ba_stock_machine(mid text) returns jsonb language sql stable security definer set search_path = '' as $$ select jsonb_build_object('num', m -> 'num', 'nom', m -> 'name', 'g4', m -> 'g4', 'sels', coalesce((select jsonb_agg(jsonb_build_object('n', s -> 'n', 'type', s -> 'type', 'qty', coalesce((select sum(coalesce((l ->> 'qty')::numeric, 0)) from jsonb_array_elements(case when jsonb_typeof(s -> 'lots') = 'array' then s -> 'lots' else '[]'::jsonb end) l), 0))) from jsonb_array_elements(case when jsonb_typeof(m -> 'sels') = 'array' then m -> 'sels' else '[]'::jsonb end) s), '[]'::jsonb), 'ouverte', exists (select 1 from jsonb_array_elements(case when jsonb_typeof(b.data -> 'interventions') = 'array' then b.data -> 'interventions' else '[]'::jsonb end) i where i ->> 'num' = m ->> 'num' and i ->> 'status' = 'open'), 'tmod', (select max(coalesce(nullif(i ->> 'end', '')::numeric, nullif(i ->> 'invAt', '')::numeric, nullif(i ->> 'start', '')::numeric)) from jsonb_array_elements(case when jsonb_typeof(b.data -> 'interventions') = 'array' then b.data -> 'interventions' else '[]'::jsonb end) i where i ->> 'num' = m ->> 'num' and coalesce(i ->> 'status', '') <> 'cancelled'), 'noms', coalesce((select jsonb_object_agg(c ->> 'id', c ->> 'name') from jsonb_array_elements(case when jsonb_typeof(b.data -> 'customTypes') = 'array' then b.data -> 'customTypes' else '[]'::jsonb end) c where coalesce(c ->> 'name', '') <> '' and c ->> 'id' in (select s2 ->> 'type' from jsonb_array_elements(case when jsonb_typeof(m -> 'sels') = 'array' then m -> 'sels' else '[]'::jsonb end) s2)), '{}'::jsonb)) from public.ba_state b cross join lateral (select e as m from jsonb_array_elements(case when jsonb_typeof(b.data -> 'machines') = 'array' then b.data -> 'machines' else '[]'::jsonb end) e where e ->> 'id' = mid limit 1) y where b.id = 'main'; $$;

-- 7.
revoke execute on function public.ba_stock_machine(text) from public, anon, authenticated;

-- 8.
grant execute on function public.ba_stock_machine(text) to service_role;
