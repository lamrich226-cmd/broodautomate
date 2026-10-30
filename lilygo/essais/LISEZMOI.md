# Essais du programme du boîtier (sur ordinateur)

Ces fichiers ne vont PAS dans le LILYGO : ils servent à vérifier le programme sur un ordinateur.

- `test_boitier.cpp` : la liaison DDCMP contre une fausse machine FAS (lecture normale, machine muette, télémétrie,
  bloc abîmé, bloc reçu deux fois, session ouverte par la machine…), l'heure belge, la préparation des envois.
  `g++ -std=gnu++17 -O1 test_boitier.cpp -o t && ./t releve.txt`
- `gen_vecteurs.js` + `test_equivalence.cpp` : compare le moteur du boîtier au moteur du logiciel (`js/serial.js`) :
  trames identiques octet par octet, même liste de sécurité, même découpe du flux.
  `node gen_vecteurs.js ../../js/serial.js v.txt && g++ -std=gnu++17 test_equivalence.cpp -o eq && ./eq v.txt`
- `sim/` : le programme complet (`boitier.cpp`) avec un modem A7670 et une machine simulés.
