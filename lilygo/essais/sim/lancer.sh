#!/bin/bash
# lancer.sh <scénario> <mode>
set -e
SC=$1; MODE=$2
D=build_$SC; rm -rf $D; mkdir -p $D/sketch
cp ../../broodautomate_lilygo/*.h ../../broodautomate_lilygo/*.cpp $D/sketch/
sed -i "s/^#define MODE  [0-9]/#define MODE  $MODE/; s/COLLE_ICI_LA_CLE_DU_BOITIER/0123456789abcdef0123456789abcdef/" $D/sketch/config.h
case "$SC" in mqtt*) sed -i "s/COLLE_ICI_L_ADRESSE_DU_CLUSTER/essai.s1.eu.hivemq.cloud/; s/COLLE_ICI_LE_MOT_DE_PASSE_MQTT/motdepasse1234/" $D/sketch/config.h;; esac
g++ -std=gnu++17 -O1 -I. -I$D/sketch -DSKETCH_CPP="\"$D/sketch/boitier.cpp\"" -o $D/sim sim.cpp 2>&1 | grep -E "error|warning" | head -20
cd $D && ./sim ${RELEVE:-../../../../scripts/releve_21oct.txt} $SC > console.txt
