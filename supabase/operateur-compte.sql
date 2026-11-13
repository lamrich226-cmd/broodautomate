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
-- Étape 2 : comptes « operator » : boîtiers 4G en LECTURE seule, demandes « Lire maintenant » fermées (une commande à la fois) :
-- (ton compte admin n'a pas de rôle « operator » : il garde tous ses droits)

-- v5.25 : l'opérateur peut LIRE les boîtiers et leurs relevés (sinon son appli ne voit plus les ventes quand la page
-- admin est fermée : stock pas à jour, machines « hors ligne », ventes comptées deux fois après un « Remplir »),
-- mais il ne peut rien y ajouter, changer ni effacer (trois règles : ajout, modification, effacement).
-- Les relevés ne lui apprennent rien de plus que ce que l'appli lui montre déjà (stock et ventes de chaque machine).

create policy "pas_operateur_devices_ajout" on public.devices as restrictive for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_devices_modif" on public.devices as restrictive for update to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_devices_effacer" on public.devices as restrictive for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_releves_ajout" on public.device_reports as restrictive for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_releves_modif" on public.device_reports as restrictive for update to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_releves_effacer" on public.device_reports as restrictive for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

create policy "pas_operateur_demandes" on public.ba_demandes as restrictive for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator') with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- Étape 3 : un compte « operator » ne peut jamais EFFACER les données partagées (il peut les lire et les modifier : stock, missions)

create policy "pas_operateur_effacer_state" on public.ba_state as restrictive for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- Pour retirer ces règles plus tard (une commande à la fois) :
-- drop policy "pas_operateur_devices_ajout" on public.devices;
-- drop policy "pas_operateur_devices_modif" on public.devices;
-- drop policy "pas_operateur_devices_effacer" on public.devices;
-- drop policy "pas_operateur_releves_ajout" on public.device_reports;
-- drop policy "pas_operateur_releves_modif" on public.device_reports;
-- drop policy "pas_operateur_releves_effacer" on public.device_reports;
-- (anciennes règles v5.8, si elles avaient été créées : elles empêchaient aussi la LECTURE — à retirer)
-- drop policy "pas_operateur_devices" on public.devices;
-- drop policy "pas_operateur_device_reports" on public.device_reports;
-- drop policy "pas_operateur_demandes" on public.ba_demandes;
-- drop policy "pas_operateur_effacer_state" on public.ba_state;
