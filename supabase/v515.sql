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
