#!/bin/bash
# v1.6 : essais du MODE 3 (machine ancienne, FAS 480 TOP logiciel 1.x) sur le simulateur, avec un texte INVENTÉ
# (aucune donnée réelle).   bash essai_ancienne.sh        (depuis n'importe quel dossier)
# Vérifie : la machine qui n'envoie qu'avec le bouton (et la broche 7 allumée), celle qui envoie même broche 7 coupée,
# celle qui envoie toute seule quand la broche 7 s'allume, celle qui parle à 4800 bauds, celle qui ne dit rien,
# une 480/5 (DEX) et une Power Lift (DDCMP) ; le boîtier n'envoie à la machine que ENQ et START (lecture seule),
# le modem reste éteint (aucune data 4G).
cd "$(dirname "$0")"
if ! command -v g++ > /dev/null; then echo "g++ absent : essai machine ancienne sauté"; exit 0; fi
KO=0
ok() { if [ "$2" = "1" ]; then echo "  OK     $1"; else echo "  ÉCHEC  $1 → $3"; KO=$((KO+1)); fi; }
a() { grep -q -- "$2" "build_$1/console.txt" && echo 1; }                 # la console contient ce texte
n() { grep -c -- "$2" "build_$1/console.txt"; }
for s in anc_bouton anc_sansdtr anc_front anc_4800 anc_muette anc_dex anc_pl; do
  RELEVE=/dev/null bash lancer.sh $s 3 > /dev/null 2> /tmp/essai_anc_$s.txt || { ok "$s : simulation lancée" 0 "$(tail -3 /tmp/essai_anc_$s.txt)"; continue; }
  r=$(tail -1 /tmp/essai_anc_$s.txt)
  ok "$s : modem éteint (aucun octet vers le modem, aucun envoi 4G), aucun redémarrage" $(echo "$r" | grep -q "envois=0 .*restarts=0 http=0 .*atModem=0" && echo 1) "$r"
  ok "$s : aucune trame interdite" $(! grep -q "INTERDITE" build_$s/console.txt && echo 1)
done
# Ce que le boîtier envoie à la machine ancienne : seulement 3 ENQ (05) et 3 START DDCMP (05 06 40 00 00 01 5C 55), éventuellement EOT (04)
for s in anc_bouton anc_4800 anc_muette; do
  reste=$(sed 's/05 06 40 00 00 01 5C 55 //g; s/05 //g; s/04 //g' build_$s/machine_recu.hex)
  ok "$s : le boîtier n'envoie à la machine que ENQ et START (lecture seule)" $([ -z "$reste" ] && [ "$(grep -o '05 06 40 00 00 01 5C 55' build_$s/machine_recu.hex | wc -l)" = 3 ] && echo 1) "$(cat build_$s/machine_recu.hex)"
done
s=anc_bouton
ok "$s : étapes 1 à 4 automatiques, puis « À TOI » vers 2 min 30" $(grep -q "^\[02:2.\] \[Ancienne\] ===== Étape 5 / 7 : À TOI" build_$s/console.txt && echo 1)
ok "$s : rien avant le bouton (étapes 1 à 4 : rien reçu)" $(grep -q "^\[02:29\]   Broche 7 coupée puis rallumée      : rien reçu" build_$s/console.txt && echo 1)
ok "$s : texte reçu avec le bouton, lisible, affiché ligne par ligne" $([ "$(a $s 'REÇU pendant l.étape 5 : 741 octets')" = 1 ] && [ "$(a $s '│ Software ver. V.1.8')" = 1 ] && [ "$(a $s '│ Sel. 11 : 23')" = 1 ] && echo 1)
ok "$s : étape 6 (broche 7 coupée) : rien → « 4e fil nécessaire »" $([ "$(a $s 'Rien reçu avec la broche 7 coupée')" = 1 ] && [ "$(a $s 'le 4e fil (broche 7) est nécessaire')" = 1 ] && echo 1)
ok "$s : étape 7 : texte reçu, puis broche 7 coupée 5 s et rallumée (lecteur « débranché »)" $([ "$(a $s 'REÇU pendant l.étape 7')" = 1 ] && grep -q "^\[06:0.\] \[Ancienne\] Broche 7 ALLUMÉE" build_$s/console.txt && echo 1)
ok "$s : la commande « bilan » du Moniteur série redonne le bilan" $(grep -q "^\[07:00\] \[Ancienne\] ===================== BILAN" build_$s/console.txt && echo 1)
ok "$s : conclusion « seulement avec le bouton »" $([ "$(a $s "La machine n'envoie qu'avec le bouton")" = 1 ] && [ "$(a $s 'envoie SANS bouton')" != 1 ] && echo 1)
s=anc_sansdtr
ok "$s : texte reçu même broche 7 coupée → « 4e fil pas nécessaire »" $([ "$(a $s 'REÇU pendant l.étape 6')" = 1 ] && [ "$(a $s "le 4e fil n'est pas nécessaire")" = 1 ] && echo 1)
s=anc_front
ok "$s : la machine envoie quand la broche 7 s'allume → « SANS bouton (étape 2) »" $([ "$(a $s 'REÇU pendant l.étape 2')" = 1 ] && [ "$(a $s 'La machine envoie SANS bouton (étape 2)')" = 1 ] && echo 1)
ok "$s : aussi à chaque fois que la broche 7 est rallumée (étape 3, 3 fois)" $([ "$(n $s 'REÇU pendant l.étape 3')" = 3 ] && echo 1) "$(n $s 'REÇU pendant l.étape 3')"
s=anc_4800
ok "$s : texte illisible à 9600 → le boîtier passe à 4800 et demande de rappuyer" $([ "$(a $s 'lisible à 0 %')" = 1 ] && [ "$(a $s "Vitesse d'écoute : 4800 bauds")" = 1 ] && [ "$(a $s 'Rappuie sur le bouton de la carte mère.')" = 1 ] && echo 1)
ok "$s : puis texte lisible à 4800 bauds" $([ "$(a $s 'REÇU pendant l.étape 5 : 741 octets en 0.0 s, à 4800 bauds')" = 1 ] && [ "$(a $s 'texte lisible, 4800 bauds')" = 1 ] && echo 1)
s=anc_muette
ok "$s : rien reçu : rappel chaque minute, puis conseils (fils 2/3, commande 90, 4e fil) après 5 min" $([ "$(n $s "J'attends le texte de la machine")" -ge 5 ] && [ "$(a $s 'échangeant les deux fils des broches 2 et 3')" = 1 ] && echo 1)
s=anc_dex
ok "$s : une 480/5 répond au DEX → « remets MODE 0 »" $([ "$(a $s 'RÉPOND au DEX')" = 1 ] && [ "$(a $s 'remets MODE 0, le boîtier la lira tout seul (comme la 480/5)')" = 1 ] && echo 1)
s=anc_pl
ok "$s : une Power Lift répond au DDCMP → « remets MODE 0 »" $([ "$(a $s 'RÉPOND au DDCMP')" = 1 ] && [ "$(a $s 'comme la Power Lift')" = 1 ] && echo 1)
rm -rf build_anc_*
if [ $KO = 0 ]; then echo "Essai machine ancienne : TOUT EST OK"; else echo "Essai machine ancienne : $KO ÉCHEC(S)"; exit 1; fi
