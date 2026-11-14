#!/bin/bash
# v1.5 : essais de l'écoute UDP (carte 1NCE) sur le simulateur, avec un relevé INVENTÉ (aucune donnée réelle).
#   bash essai_udp.sh        (depuis n'importe quel dossier)
# Vérifie, pour les 5 formats possibles des messages du modem : « lire » reçu → lecture tout de suite → relevé envoyé
# à Supabase même sans changement ; message reçu pendant un envoi HTTPS pas perdu ; liaison fermée par le modem → réouverte.
cd "$(dirname "$0")"
if ! command -v g++ > /dev/null; then echo "g++ absent : essai UDP sauté"; exit 0; fi
KO=0
ok() { if [ "$2" = "1" ]; then echo "  OK     $1"; else echo "  ÉCHEC  $1 → $3"; KO=$((KO+1)); fi; }
compte() { grep -c "$2" "build_$1/console.txt"; }
for s in udp udp_ipd udp_ipd_seul udp_brut udp_manuel; do
  UDP=1 RELEVE=/dev/null bash lancer.sh $s 0 > /dev/null 2> /tmp/essai_udp_$s.txt || { ok "$s : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_$s.txt)"; continue; }
  if [ $s = udp ]; then attendu_recus=4; attendu_lus=3; else attendu_recus=1; attendu_lus=1; fi
  r=$(compte $s "MESSAGE REÇU"); l=$(compte $s "terminée : le relevé part"); e=$(compte $s "Reçu par Supabase")
  ok "$s : $attendu_recus message(s) reçu(s)" $([ "$r" = "$attendu_recus" ] && echo 1) "$r"
  ok "$s : $attendu_lus lecture(s) faite(s) à la demande « lire »" $([ "$l" = "$attendu_lus" ] && echo 1) "$l"
  ok "$s : relevés bien reçus par Supabase (≥ $((attendu_lus+1)))" $([ "$e" -ge $((attendu_lus+1)) ] && echo 1) "$e"
  ok "$s : le boîtier répond à 1NCE (« OUVERT », « RECU lire »)" $(grep -q "^OUVERT v1.6" build_$s/udp.txt && grep -q "^RECU lire" build_$s/udp.txt && echo 1) "$(tr '\n' '|' < build_$s/udp.txt)"
  ok "$s : aucun redémarrage, aucune trame interdite" $(grep -q "restarts=0" /tmp/essai_udp_$s.txt && ! grep -q "INTERDITE" build_$s/console.txt && echo 1) "$(tail -1 /tmp/essai_udp_$s.txt)"
done
ok "udp : « lire » reçu PENDANT un envoi HTTPS n'est pas perdu (lecture à 18 min)" $(grep -q "^\[18:2.\] \[UDP\] ✔✔ MESSAGE REÇU" build_udp/console.txt && echo 1) "$(grep 'MESSAGE REÇU' build_udp/console.txt | tr '\n' '|')"
ok "udp : liaison fermée par le modem → réouverte" $(grep -q "a fermé la liaison UDP" build_udp/console.txt && [ "$(grep -c '✔ Le boîtier écoute le port 3000' build_udp/console.txt)" = 2 ] && echo 1) "$(grep -c 'écoute le port' build_udp/console.txt)"
ok "udp : un autre message (« Hello world ») est seulement affiché, sans lecture" $(grep -q "^RECU hello world" build_udp/udp.txt && echo 1) "$(tr '\n' '|' < build_udp/udp.txt)"
ok "udp : la version annoncée à Supabase dit « 1NCE »" $(grep -q '"fw":"1.6.1 1NCE"' build_udp/envois.txt && echo 1) "$(head -c 160 build_udp/envois.txt)"
# v1.5.1 : le vrai modem « colle » une liaison qui a envoyé à 1NCE et refuse ensuite le « lire » : les envois partent par la liaison 1
ok "udp : aucun message refusé par le modem (envois par une liaison à part)" $(grep -q "^udpRefuses=0" /tmp/essai_udp_udp.txt && echo 1) "$(grep udpRefuses /tmp/essai_udp_udp.txt)"
ok "udp : liaison d'envoi (1) ouverte, aucun repli" $(! grep -q "Liaison d'envoi (1) impossible" build_udp/console.txt && echo 1)
UDP=1 RELEVE=/dev/null bash lancer.sh udp_repli 0 > /dev/null 2> /tmp/essai_udp_repli.txt || ok "udp_repli : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_repli.txt)"
ok "udp_repli : liaison 1 impossible → avertissement et repli sur la liaison 0, rien ne plante" $(grep -q "Liaison d'envoi (1) impossible" build_udp_repli/console.txt && grep -q "restarts=0" /tmp/essai_udp_repli.txt && echo 1) "$(tail -2 /tmp/essai_udp_repli.txt)"
# v1.5.2 : « lire 77 » = la demande n°77 du bouton « Lire maintenant » : lecture tout de suite, résultat rendu à Supabase sous ce numéro
UDP=1 RELEVE=/dev/null bash lancer.sh udp_dem 0 > /dev/null 2> /tmp/essai_udp_dem.txt || ok "udp_dem : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_dem.txt)"
ok "udp_dem : « lire 77 » et « lire 78 b » reconnus comme les demandes n°77 et n°78 (la 2e en flux brut)" $(grep -q "demande une lecture maintenant (n°77)" build_udp_dem/console.txt && grep -q "demande une lecture maintenant (n°78, flux brut complet)" build_udp_dem/console.txt && echo 1) "$(grep 'demande une lecture' build_udp_dem/console.txt | head -3)"
ok "udp_dem : les lectures n°77 et n°78 sont rendues à Supabase (fait=77, fait=78)" $(grep -q '"fait":77' build_udp_dem/rpc.txt && grep -q '"fait":78' build_udp_dem/rpc.txt && echo 1) "$(head -c 300 build_udp_dem/rpc.txt)"
ok "udp_dem : « lire 99x » n'est pas une demande de Broodautomate (lecture simple, pas de n°99)" $(! grep -q "n°99" build_udp_dem/console.txt && echo 1)
ok "udp_dem : aucun redémarrage" $(grep -q "restarts=0" /tmp/essai_udp_dem.txt && echo 1) "$(tail -1 /tmp/essai_udp_dem.txt)"
# v1.6 : envoi par UDP (ENVOI_UDP 1) : morceaux « U1|n°|i|total| », confirmation « ok n° », 2e essai, puis repli HTTPS
for s in udp_envoi udp_envoi2 udp_envoi0; do
  ENVOI=1 UDP=1 RELEVE=/dev/null bash lancer.sh $s 0 > /dev/null 2> /tmp/essai_udp_$s.txt || { ok "$s : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_$s.txt)"; continue; }
  ok "$s : aucun redémarrage, aucune trame interdite" $(grep -q "restarts=0" /tmp/essai_udp_$s.txt && ! grep -q "INTERDITE" build_$s/console.txt && echo 1) "$(tail -1 /tmp/essai_udp_$s.txt)"
  ok "$s : message découpé en morceaux numérotés, sans la clé du boîtier" $(grep -q '^U1|1|0|2|{"fw":"1.6.1 1NCE UDP"' build_$s/udp.txt && ! grep -q 0123456789abcdef build_$s/udp.txt && echo 1) "$(head -c 200 build_$s/udp.txt)"
  ok "$s : aucun paquet UDP de plus de 508 octets" $(awk 'length($0) > 505 { m=1 } END { exit m }' build_$s/udp.txt && echo 1) "paquet trop long"
done
ok "udp_envoi : 3 envois confirmés par UDP, aucun HTTPS d'envoi" $([ "$(grep -c 'Confirmé par Supabase (UDP)' build_udp_envoi/console.txt)" = 3 ] && [ "$(grep -c 'Reçu par Supabase' build_udp_envoi/console.txt)" = 0 ] && echo 1) "$(grep -c 'Confirmé' build_udp_envoi/console.txt)"
ok "udp_envoi2 : 1er essai sans réponse → 2e essai → confirmé, toujours pas d'HTTPS" $(grep -q "Pas de confirmation après 30 s (essai 1/2)" build_udp_envoi2/console.txt && grep -q 'Confirmé par Supabase (UDP)' build_udp_envoi2/console.txt && ! grep -q 'Reçu par Supabase' build_udp_envoi2/console.txt && echo 1) "$(grep -c essai build_udp_envoi2/console.txt)"
ok "udp_envoi0 : jamais de confirmation, 50 min → AUCUN envoi HTTPS : les relevés sont gardés, essais d'UDP toutes les 10 min" $(grep -q "le relevé est gardé, nouvel essai dans 10 min" build_udp_envoi0/console.txt && [ "$(grep -c 'Reçu par Supabase' build_udp_envoi0/console.txt)" = 0 ] && [ ! -s build_udp_envoi0/envois.txt ] && echo 1) "$(tail -1 /tmp/essai_udp_udp_envoi0.txt)"
# v1.6.0 : passage à l'HTTPS seulement après 2 h d'UDP muet ET si l'HTTPS marche ; retour à l'UDP dès qu'il remarche
UDP=1 ENVOI=1 RELEVE=/dev/null bash lancer.sh udp_envoi0l 0 > /dev/null 2> /tmp/essai_udp_udp_envoi0l.txt || ok "udp_envoi0l : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_udp_envoi0l.txt)"
ok "udp_envoi0l : rien en HTTPS avant 2 h, puis vérification HTTPS et repli (« REPLI » annoncé, clé présente)" $(grep -q "UDP muet depuis 12. min : vérification par HTTPS" build_udp_envoi0l/console.txt && grep -q "le problème vient de l'UDP (1NCE ou son webhook)" build_udp_envoi0l/console.txt && grep -q '"k":"0123456789abcdef' build_udp_envoi0l/envois.txt && grep -q '1NCE REPLI' build_udp_envoi0l/envois.txt && ! grep -q "\[[0-9]:\|\[[0-9][0-9]:.*Reçu par Supabase" build_udp_envoi0l/console.txt && echo 1) "$(grep -c 'Reçu par Supabase' build_udp_envoi0l/console.txt)"
ok "udp_envoi0l : le premier HTTPS part après 120 min (jamais avant)" $(awk '/Reçu par Supabase/ { split($1,t,/[\[:\]]/); if (t[2]+0 < 120) m=1 } END { exit m }' build_udp_envoi0l/console.txt && echo 1) "$(grep -m1 'Reçu par Supabase' build_udp_envoi0l/console.txt)"
ok "udp_envoi0l : en repli, l'UDP est retenté et le boîtier y revient dès qu'il remarche" $(grep -q "L'UDP remarche : retour à l'envoi par UDP" build_udp_envoi0l/console.txt && echo 1) "$(grep -c 'remarche' build_udp_envoi0l/console.txt)"
ok "udp_envoi0l : aucun redémarrage" $(grep -q "restarts=0" /tmp/essai_udp_udp_envoi0l.txt && echo 1) "$(tail -1 /tmp/essai_udp_udp_envoi0l.txt)"
UDP=1 ENVOI=1 RELEVE=/dev/null bash lancer.sh udp_envoi0r 0 > /dev/null 2> /tmp/essai_udp_udp_envoi0r.txt || ok "udp_envoi0r : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_udp_envoi0r.txt)"
ok "udp_envoi0r : UDP muet ET HTTPS en panne → c'est le réseau : on reste en UDP, jamais de repli" $(grep -q "c'est le réseau, pas l'UDP. On reste en UDP" build_udp_envoi0r/console.txt && ! grep -q "REPLI\|problème vient de l'UDP" build_udp_envoi0r/console.txt && echo 1) "$(grep -c 'réseau' build_udp_envoi0r/console.txt)"
# v1.6.1 : « Lire maintenant » 100 % UDP : ni vérification HTTPS ni appel ba_boitier ; le résultat repart par UDP (fait / dok)
ENVOI=1 UDP=1 RELEVE=/dev/null bash lancer.sh udp_envoi_dem 0 > /dev/null 2> /tmp/essai_udp_udp_envoi_dem.txt || ok "udp_envoi_dem : simulation lancée" 0 "$(tail -3 /tmp/essai_udp_udp_envoi_dem.txt)"
ok "udp_envoi_dem : AUCUN appel HTTPS du tout (ni vérification, ni résultat, ni relevé)" $(grep -q " http=0 rpc=0 " /tmp/essai_udp_udp_envoi_dem.txt && [ ! -s build_udp_envoi_dem/rpc.txt ] && [ ! -s build_udp_envoi_dem/envois.txt ] && echo 1) "$(tail -1 /tmp/essai_udp_udp_envoi_dem.txt)"
ok "udp_envoi_dem : « lire 77 » et « lire 78 b » reconnus, leurs résultats (fait=77, fait=78) partent en UDP" $(grep -q '"fait":77,"dok":true' build_udp_envoi_dem/udp.txt && grep -q '"fait":78,"dok":true' build_udp_envoi_dem/udp.txt && ! grep -q 'n°99' build_udp_envoi_dem/console.txt && echo 1) "$(grep -o '"fait":[0-9]*' build_udp_envoi_dem/udp.txt | tr '\n' ' ')"
ok "udp_envoi_dem : aucun redémarrage" $(grep -q "restarts=0" /tmp/essai_udp_udp_envoi_dem.txt && echo 1) "$(tail -1 /tmp/essai_udp_udp_envoi_dem.txt)"
rm -rf build_udp_envoi_dem build_udp_envoi build_udp_envoi2 build_udp_envoi0 build_udp_envoi0l build_udp_envoi0r build_udp_dem build_udp_repli build_udp build_udp_ipd build_udp_ipd_seul build_udp_brut build_udp_manuel
if [ $KO = 0 ]; then echo "Essai UDP : TOUT EST OK"; else echo "Essai UDP : $KO ÉCHEC(S)"; exit 1; fi
