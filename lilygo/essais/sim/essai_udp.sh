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
  ok "$s : le boîtier répond à 1NCE (« OUVERT », « RECU lire »)" $(grep -q "^OUVERT v1.5" build_$s/udp.txt && grep -q "^RECU lire" build_$s/udp.txt && echo 1) "$(tr '\n' '|' < build_$s/udp.txt)"
  ok "$s : aucun redémarrage, aucune trame interdite" $(grep -q "restarts=0" /tmp/essai_udp_$s.txt && ! grep -q "INTERDITE" build_$s/console.txt && echo 1) "$(tail -1 /tmp/essai_udp_$s.txt)"
done
ok "udp : « lire » reçu PENDANT un envoi HTTPS n'est pas perdu (lecture à 18 min)" $(grep -q "^\[18:2.\] \[UDP\] ✔✔ MESSAGE REÇU" build_udp/console.txt && echo 1) "$(grep 'MESSAGE REÇU' build_udp/console.txt | tr '\n' '|')"
ok "udp : liaison fermée par le modem → réouverte" $(grep -q "a fermé la liaison UDP" build_udp/console.txt && [ "$(grep -c '✔ Le boîtier écoute le port 3000' build_udp/console.txt)" = 2 ] && echo 1) "$(grep -c 'écoute le port' build_udp/console.txt)"
ok "udp : un autre message (« Hello world ») est seulement affiché, sans lecture" $(grep -q "^RECU hello world" build_udp/udp.txt && echo 1) "$(tr '\n' '|' < build_udp/udp.txt)"
ok "udp : la version annoncée à Supabase dit « 1NCE »" $(grep -q '"fw":"1.5.2 1NCE"' build_udp/envois.txt && echo 1) "$(head -c 160 build_udp/envois.txt)"
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
rm -rf build_udp_dem build_udp_repli build_udp build_udp_ipd build_udp_ipd_seul build_udp_brut build_udp_manuel
if [ $KO = 0 ]; then echo "Essai UDP : TOUT EST OK"; else echo "Essai UDP : $KO ÉCHEC(S)"; exit 1; fi
