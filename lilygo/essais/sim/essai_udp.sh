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
ok "udp : la version annoncée à Supabase dit « 1NCE »" $(grep -q '"fw":"1.5 1NCE"' build_udp/envois.txt && echo 1) "$(head -c 160 build_udp/envois.txt)"
rm -rf build_udp build_udp_ipd build_udp_ipd_seul build_udp_brut build_udp_manuel
if [ $KO = 0 ]; then echo "Essai UDP : TOUT EST OK"; else echo "Essai UDP : $KO ÉCHEC(S)"; exit 1; fi
