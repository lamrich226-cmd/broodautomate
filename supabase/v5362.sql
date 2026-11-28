-- ============================================================
-- Broodautomate v5.36.2 (audit du 28/11/2026) : DEUX PETITS RÉGLAGES DU SERVEUR — facultatifs
-- L'éditeur SQL de Supabase : copie UNE commande (une ligne qui finit par « ; »), colle-la dans
-- SQL Editor → Run → « Success », puis la suivante. Les lignes qui commencent par « -- » sont des explications.
-- Rien ici n'efface ni ne change tes données (pains, ventes, machines, alertes, réglages).
-- ============================================================

-- 1. Tâche « veille » (toutes les 15 min) : attendre la réponse de la fonction 15 s au lieu de 5 s.
--    La fonction met souvent 4 à 6 s (démarrage à froid) : elle FAIT son travail, mais la tâche notait
--    « Timeout of 5000 ms reached » (environ 1 appel sur 10). Ce n'était qu'une fausse erreur dans le journal.
--    Même adresse, même message, même horaire : seule l'attente change.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'ba-veille'), command := $c$select net.http_post(url := 'https://ujvihkryzjrawamekwpu.supabase.co/functions/v1/ingest', body := '{"veille":1}'::jsonb, timeout_milliseconds := 15000)$c$);

-- 2. Conseil « performance » de Supabase (auth_rls_initplan) : la règle de lecture des notifications et des copies de
--    sécurité relisait le compte connecté pour CHAQUE ligne ; maintenant une seule fois par lecture. Même règle :
--    les comptes opérateur ne lisent toujours ni les notifications ni les copies de sécurité.
alter policy notifs_lecture_admin on public.ba_notifications using (((select auth.jwt()) -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- 3.
alter policy copies_lecture_admin on public.ba_state_backup using (((select auth.jwt()) -> 'app_metadata' ->> 'role') is distinct from 'operator');

-- 4. Vérification (lecture seule) : la tâche doit montrer « timeout_milliseconds := 15000 » et les deux règles « (select auth.jwt()) »
select jobname, command from cron.job where jobname = 'ba-veille';
