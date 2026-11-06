-- ============================================================
-- BROODAUTOMATE v5.13 — porte ouverte en direct
-- À coller UNE FOIS dans Supabase (SQL Editor) après la v5.12. Rien n'est supprimé, on peut le recoller sans risque.
-- La fonction ba_portes donne, pour chaque machine, si la porte est ouverte et depuis quand.
-- Réponse minuscule quand rien n'a changé ({"v": 123}). Réservée aux comptes connectés (pas aux visiteurs anonymes).
-- ============================================================
create or replace function public.ba_portes(vu bigint default 0) returns json
language sql stable security definer set search_path = '' as $$
  with p as (
    select machine_id, (info -> 'porte' ->> 'ouverte')::boolean as o, info -> 'porte' ->> 'depuis' as d
    from public.devices where info -> 'porte' is not null and machine_id is not null
  ), v as (
    select coalesce(max((extract(epoch from d::timestamptz) * 1000)::bigint), 0) as v from p
  )
  select case when (select v from v) = coalesce(vu, 0) then json_build_object('v', (select v from v))
    else json_build_object('v', (select v from v),
      'l', coalesce((select json_agg(json_build_object('m', machine_id, 'o', o, 'd', d)) from p), '[]'::json)) end
$$;
revoke execute on function public.ba_portes(bigint) from public, anon;
grant execute on function public.ba_portes(bigint) to authenticated;

-- ============================================================
-- Consommation : data de chaque boîtier (carte SIM) mois par mois + taille de la base
-- Les relevés détaillés sont effacés après 30 jours ; ce petit tableau garde le total de chaque mois (quelques lignes par boîtier).
-- ============================================================
create table if not exists public.ba_conso_mois (
  mois text not null, machine_id text not null, n integer not null default 0, octets bigint not null default 0,
  primary key (mois, machine_id)
);
alter table public.ba_conso_mois enable row level security;     -- personne n'y touche directement : seulement par la fonction ba_conso

create or replace function public.ba_conso_maj() returns void
language sql security definer set search_path = '' as $$
  insert into public.ba_conso_mois (mois, machine_id, n, octets)
  select to_char(received_at at time zone 'UTC', 'YYYY-MM'), machine_id, count(*), sum(length(raw))
  from public.device_reports group by 1, 2
  on conflict (mois, machine_id) do update set n = greatest(public.ba_conso_mois.n, excluded.n), octets = greatest(public.ba_conso_mois.octets, excluded.octets)
$$;
revoke execute on function public.ba_conso_maj() from public, anon, authenticated;

create or replace function public.ba_conso() returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ba_conso_maj();
  return json_build_object(
    'db', pg_database_size(current_database()),
    'rel_n', (select count(*) from public.device_reports),
    'rel_o', (select coalesce(sum(length(raw)), 0) from public.device_reports),
    'mois', coalesce((select json_agg(json_build_object('mo', mois, 'm', machine_id, 'n', n, 'o', octets) order by mois desc, machine_id) from public.ba_conso_mois), '[]'::json));
end $$;
revoke execute on function public.ba_conso() from public, anon;
grant execute on function public.ba_conso() to authenticated;

-- une fois par jour, on garde le total du mois même si personne n'ouvre la page (extension pg_cron déjà activée en v5.9)
select cron.schedule('ba-conso', '10 3 * * *', $$select public.ba_conso_maj()$$);
