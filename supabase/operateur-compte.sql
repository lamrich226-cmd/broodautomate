-- ============================================================
-- Broodautomate v5.8 : COMPTE OPÉRATEUR SÉPARÉ
-- L'éditeur SQL de Supabase n'accepte qu'UNE commande à la fois :
-- copie UNE commande (de « create » jusqu'au « ; »), colle-la dans SQL Editor → Run → « Success », puis la suivante.
--
-- Étape 0 (dans Supabase, pas en SQL) : Authentication → Users → Add user → Create new user
--         e-mail + mot de passe de l'opérateur, case « Auto Confirm User » cochée.
-- Étape 1 : donner le rôle « operator » à ce compte (remplace l'e-mail ; refais-le pour chaque opérateur) :
--
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"operator"}'::jsonb where email = 'operateur@exemple.be';
--
-- Étape 2 : fermer aux comptes « operator » les tables des boîtiers 4G (une commande à la fois) :
-- (ton compte admin n'a pas de rôle « operator » : il garde tous ses droits)

create policy "pas_operateur_devices" on public.devices as restrictive for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_device_reports" on public.device_reports as restrictive for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_demandes" on public.ba_demandes as restrictive for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- Étape 3 : un compte « operator » ne peut jamais EFFACER les données partagées (il peut les lire et les modifier : stock, missions)

create policy "pas_operateur_effacer_state" on public.ba_state as restrictive for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- Pour retirer ces règles plus tard (une commande à la fois) :
-- drop policy "pas_operateur_devices" on public.devices;
-- drop policy "pas_operateur_device_reports" on public.device_reports;
-- drop policy "pas_operateur_demandes" on public.ba_demandes;
-- drop policy "pas_operateur_effacer_state" on public.ba_state;
