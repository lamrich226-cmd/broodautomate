-- ============================================================
-- BROODAUTOMATE v5.15 — effacement automatique des vieux relevés bruts
-- À coller UNE FOIS dans Supabase (SQL Editor) après la v5.13. Rien d'autre n'est touché : on peut le recoller sans risque.
-- Chaque nuit, les relevés bruts (table device_reports : le texte de chaque envoi du boîtier, pour le diagnostic) de plus de 30 jours
-- sont effacés, pour ne jamais remplir les 500 Mo gratuits de Supabase.
-- Ce qui est GARDÉ pour toujours : toutes les ventes, l'historique par jour, les prévisions (ils sont dans ba_state, pas ici)
-- et le total de data de chaque boîtier mois par mois (ba_conso_mois, mis à jour juste avant l'effacement).
-- ============================================================
create or replace function public.ba_purge() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  perform public.ba_conso_maj();                       -- le total du mois est enregistré AVANT d'effacer
  delete from public.device_reports where received_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.ba_purge() from public, anon, authenticated;

select cron.schedule('ba-purge', '20 3 * * *', $$select public.ba_purge()$$);

-- ============================================================
-- « Flux brut » (onglet Technique) : une demande de lecture peut réclamer le relevé COMPLET, non filtré par le boîtier.
-- Le boîtier v1.3 filtre ses envois automatiques ; sur une demande « brut », il envoie tout ce que la machine a donné.
-- La fonction ba_boitier reste la même, avec en plus la réponse « brut » (vrai / faux) pour la demande prise.
-- ============================================================
alter table public.ba_demandes add column if not exists brut boolean not null default false;

create or replace function public.ba_boitier(k text, fait bigint default 0, ok boolean default true, msg text default '') returns json language sql security definer set search_path = '' as $$ with d as (update public.devices set last_seen = now() where key_hash = encode(sha256(convert_to(k, 'UTF8')), 'hex') returning id), f as (update public.ba_demandes set statut = case when ok then 'faite' else 'echec' end, fini_at = now(), message = left(coalesce(msg, ''), 240) where fait > 0 and id = fait and statut in ('attente', 'prise') and device_id in (select id from d) returning id), p as (update public.ba_demandes set statut = 'prise', prise_at = now() where id = (select id from public.ba_demandes where statut = 'attente' and cree_at > now() - interval '1 hour' and id <> coalesce(fait, 0) and device_id in (select id from d) order by id limit 1) returning id, brut) select json_build_object('ok', exists (select 1 from d), 't', floor(extract(epoch from now()))::bigint, 'dem', coalesce((select id from p), 0), 'brut', coalesce((select brut from p), false), 'fait', (select count(*) from f), 'ec', coalesce((select case when (data -> 'settings' ->> 'ecouteMin') in ('15', '30', '60') then (data -> 'settings' ->> 'ecouteMin')::int * 60 else 0 end from public.ba_state where id = 'main'), 0)) $$;
