// ============================================================
// BROODAUTOMATE — Catalogue des alertes (v3.1)
//
// Deux sources, et rien d'autre :
//  1. Manuel FAS « POWER LIFT GCD » Issue 01, commande 99 (tableau des
//     erreurs, codes 01 à 98, avec la solution du manuel). Les codes FAS
//     arrivent dans l'audit sous la forme MA5*ERROR*date*heure*code*sous-code.
//  2. Norme EVA-DTS 6.1.2, annexe C (liste des événements EA1 / EA2),
//     traduite en français simple. La norme ne donne pas de solution.
//
// Correspondances OBSERVÉES dans un vrai relevé (mêmes date et heure),
// mais écrites NULLE PART dans le manuel :
//     ECF_38 = erreur FAS 16/38 ; E45 = FAS 45/54 ; EOA = FAS 10/38.
// Elles sont affichées comme « observées », jamais comme certaines.
//
// Gravité : "p" = panne (rouge), "s" = à surveiller (orange),
//           "i" = information (bleu).
// ============================================================

window.BA = window.BA || {};

(function () {

  // ---------- 1. Erreurs FAS (manuel Power Lift, commande 99) ----------
  // sous : "sel" = le sous-code est le n° de sélection ; liste = sous-codes possibles
  const FAS = {
    "01": { titre: "Moteur de spirale bloqué", expl: "la spirale ne tourne pas", sous: "sel",
            solution: ["Remplacer le moteur de la spirale."] },
    "02": { titre: "La spirale ne fait pas un tour complet", expl: "la spirale s'arrête avant la fin de son tour", sous: "sel",
            solution: ["Vérifier que les produits chargés n'empêchent pas la spirale de tourner.", "Remplacer le moteur de la spirale."] },
    "04": { titre: "Erreur générale d'un moteur de spirale", expl: "défaut non précisé d'un moteur de spirale", sous: null,
            solution: ["Vérifier le fonctionnement du moteur de la spirale."] },
    "05": { titre: "Moteur de spirale débranché", expl: "le moteur de la spirale n'est plus connecté", sous: "sel",
            solution: ["Vérifier la connexion."] },
    "09": { titre: "Micro-interrupteur ou câblage d'un moteur de spirale", expl: "défaut probable du micro-interrupteur ou du câblage du moteur", sous: "sel",
            solution: ["Remplacer le moteur de la spirale.", "Vérifier le câblage."] },
    "10": { titre: "Sonde de température intérieure défectueuse", expl: "la sonde qui mesure la température dans la machine ne fonctionne pas", sous: ["38", "39"],
            solution: ["Vérifier la sonde intérieure (repère A)."] },
    "11": { titre: "Sonde de l'évaporateur défectueuse", expl: "la sonde de l'évaporateur (groupe froid) ne fonctionne pas", sous: ["38", "39"],
            solution: ["Vérifier la sonde de l'évaporateur (repère E)."] },
    "16": { titre: "Erreur de communication avec une carte", expl: "la carte principale ne communique plus avec une carte de la machine (tableau électrique)", sous: ["33", "38", "39"],
            solution: ["Vérifier les branchements des cartes.", "Vérifier l'état des câbles entre les cartes.", "Une des cartes peut être cassée."] },
    "17": { titre: "Communication coupée pendant une vente (crédit pas encaissé)", expl: "la communication entre les cartes s'est coupée pendant une vente ; le crédit n'a pas été encaissé", sous: ["38", "39"],
            solution: ["Vérifier les branchements des cartes.", "Vérifier l'état des câbles.", "La carte d'alimentation peut être cassée."] },
    "18": { titre: "Communication coupée pendant une vente (crédit encaissé)", expl: "la communication entre les cartes s'est coupée pendant une vente ; le crédit a été encaissé", sous: ["38", "39"],
            solution: ["Vérifier les branchements des cartes.", "Vérifier l'état des câbles.", "La carte d'alimentation peut être cassée."] },
    "29": { titre: "Redémarrage d'une carte (périphérique)", expl: "une carte de la machine a redémarré", sous: null,
            solution: ["Redémarrage automatique."] },
    "30": { titre: "Sécurité frigo déclenchée", expl: "la température n'a pas été respectée ; la machine protège les produits frais", sous: ["38", "39"],
            solution: ["Conditions ambiantes hors des limites de la machine : la placer à un endroit adapté.",
                       "Produits frais pas chargés à la bonne température de conservation.",
                       "Porte ouverte trop longtemps (ne pas dépasser 15 minutes).",
                       "Groupe froid en défaut : vérifier les ventilateurs, la charge de gaz, les réglages."] },
    "31": { titre: "Cellules photoélectriques en erreur après l'étalonnage", expl: "les cellules qui détectent le produit sont en erreur après leur réglage", sous: ["38", "39"],
            solution: ["Vérifier s'il y a de la buée (humidité) sur les diodes et la bande réfléchissante.", "Vérifier la carte des cellules photoélectriques."] },
    "32": { titre: "Cellules photoélectriques en erreur pendant l'étalonnage", expl: "les cellules qui détectent le produit sont en erreur pendant leur réglage", sous: ["38", "39"],
            solution: ["Vérifier s'il y a de la buée (humidité) sur les diodes et la bande réfléchissante.", "Vérifier l'état de la bande réfléchissante.", "Vérifier la carte des cellules photoélectriques."],
            note: "Le manuel français écrit « après l'étalonnage » pour 31 et 32 ; l'italien et l'anglais disent « pendant » pour 32." },
    "33": { titre: "Cellules photoélectriques débranchées pendant une vente", expl: "les cellules qui détectent le produit ne répondent plus pendant la vente", sous: ["38", "39"],
            solution: ["Vérifier la carte des cellules photoélectriques."] },
    "39": { titre: "Chariot de blocage de la cloison arrière de l'ascenseur", expl: "erreur du chariot qui verrouille la cloison arrière de l'ascenseur", sous: ["54"],
            solution: ["Vérifier le micro-interrupteur du chariot de verrouillage / déverrouillage de la cloison arrière de l'ascenseur."] },
    "40": { titre: "Erreur de l'ascenseur", expl: "un mouvement de l'ascenseur n'a pas abouti", sous: ["0", "1", "2", "3", "4", "5", "6"],
            solution: [],
            detail: { "0": "mouvement de l'ascenseur en mode manuel", "1": "position de départ (home)", "2": "position de hauteur (cote)",
                      "3": "déverrouillage de la cloison arrière", "4": "verrouillage de la cloison arrière",
                      "5": "ouverture de la trappe", "6": "fermeture de la trappe" } },
    "41": { titre: "Pas d'impulsions du codeur de l'ascenseur", expl: "la machine ne reçoit plus le signal qui mesure le déplacement de l'ascenseur", sous: ["54"],
            solution: ["Vérifier le moteur de déplacement de l'ascenseur.", "Vérifier le câblage de ce moteur.", "Vérifier la carte de l'ascenseur."] },
    "42": { titre: "Surintensité du moteur de l'ascenseur", expl: "le moteur de l'ascenseur force trop", sous: ["54"],
            solution: ["Vérifier que l'ascenseur se déplace facilement : frottements importants pendant le déplacement ?"] },
    "43": { titre: "Mauvais positionnement de l'ascenseur", expl: "l'ascenseur ne s'est pas arrêté à la bonne hauteur", sous: ["54"],
            solution: ["Problème de gestion des cotes et des rampes d'arrêt : éteindre puis rallumer la machine."] },
    "44": { titre: "Délai de positionnement de l'ascenseur dépassé", expl: "l'ascenseur a mis trop de temps pour arriver à sa position", sous: ["54"],
            solution: ["Vérifier que l'ascenseur se déplace facilement (frottements).", "Vérifier l'alimentation du moteur de l'ascenseur (pas de courant pendant le déplacement)."] },
    "45": { titre: "Ascenseur bloqué par un produit qui dépasse", expl: "un produit dépasse et gêne la montée ou la descente de l'ascenseur", sous: ["54"],
            solution: ["Ranger les produits pour qu'ils ne gênent pas le passage de l'ascenseur.", "Vérifier que les tiroirs sont bien enfoncés."] },
    "46": { titre: "Mécanisme de verrouillage de la cloison arrière de l'ascenseur", expl: "erreur du mécanisme qui verrouille ou déverrouille la cloison arrière", sous: ["54"],
            solution: ["Vérifier le micro-interrupteur du chariot de verrouillage / déverrouillage.", "Vérifier le micro-interrupteur de position de la came du moteur.", "Vérifier le moteur de verrouillage / déverrouillage de la cloison."] },
    "47": { titre: "Trappe de prélèvement en erreur", expl: "la trappe où le client prend son produit ne fonctionne pas correctement", sous: ["54"],
            solution: ["Vérifier le micro-interrupteur de la trappe de prélèvement.", "Vérifier le moteur de la trappe de prélèvement."] },
    "48": { titre: "Fin de course haute atteinte", expl: "l'ascenseur est arrivé tout en haut", sous: ["54"],
            solution: ["Une hauteur (cote) trop grande a été programmée."] },
    "50": { titre: "Le lecteur sans espèces (MDB) ne répond pas", expl: "délai de réponse du lecteur de cartes MDB dépassé", sous: null, solution: [] },
    "51": { titre: "Le lecteur de billets (MDB) ne répond pas", expl: "délai de réponse du lecteur de billets MDB dépassé", sous: null, solution: [] },
    "55": { titre: "Erreur du rendeur de monnaie", expl: "le périphérique qui rend la monnaie est en erreur", sous: null, solution: [] },
    "91": { titre: "Sélections hors service non rétablies", expl: "des sélections hors service ou pas en position n'ont pas été rétablies", sous: "sel",
            solution: ["Vérifier quelles sélections sont hors service ou pas en position, et les rétablir."] },
    "93": { titre: "Erreur de communication avec le dispositif de relevé des données", expl: "la machine n'arrive pas à communiquer avec l'appareil de relevé (télémétrie)", sous: null,
            solution: ["Si l'erreur se répète, vérifier le système de relevé des données."],
            note: "Le manuel (commande 46) dit aussi qu'une sécurité frigo non réarmée est notée « ERROR 93 » : contradiction déjà présente dans le manuel italien." },
    "98": { titre: "Blocage inattendu du logiciel", expl: "le programme de la machine s'est bloqué", sous: null,
            solution: ["Redémarrage automatique."] }
  };

  // Légende des sous-codes (manuel, commande 99)
  const SOUS_CODES = {
    "33": "cellules photoélectriques",
    "38": "carte maître (spirales)",
    "39": "carte esclave (spirales)",
    "54": "carte de l'ascenseur"
  };

  // ---------- 2. Événements EVA-DTS (annexe C) ----------
  // [préfixe, nom de la famille, nom court de l'organe, « de l'organe », lignes, génériques automatiques ?]
  const FAMILLES = [
    ["EA", "Monnayeur", "monnayeur", "du monnayeur", [
      ["EA",   "Monnayeur : défaut non précisé", "défaut général du monnayeur, sans détail", "p"],
      ["EAA",  "Entrée des pièces bloquée", "une pièce coince la goulotte d'entrée des pièces", "p"],
      ["EAB",  "Problème de rendu de la monnaie", "problème au retour de la monnaie, entre le monnayeur et la machine", "p"],
      ["EAC",  "Fausses pièces détectées", "le monnayeur voit qu'on introduit une part de fausses pièces ou de pièces étrangères", "s"],
      ["EAD",  "Validateur de pièces bloqué", "une pièce coince la partie qui reconnaît les pièces", "p"],
      ["EAE",  "Trieur de pièces bloqué", "une pièce coince la partie qui oriente les pièces", "p"],
      ["EAF",  "Distributeur de monnaie bloqué", "une pièce coince la partie qui rend la monnaie", "p"],
      ["EAG",  "Rendeur de monnaie bloqué", "une pièce coince le rendeur, à un endroit non déterminé", "p"],
      ["EAH",  "Goulotte de rejet bloquée", "une pièce coince la goulotte de rejet sous le monnayeur", "p"],
      ["EAI",  "Entrée de la caisse bloquée", "une pièce coince l'entrée de la caisse", "p"],
      ["EAJ",  "Erreur de programmation du monnayeur", "erreur pendant la programmation du monnayeur (prix)", "s"],
      ["EAK",  "Erreur de programmation de la matrice de prix", "erreur pendant la programmation de la boîte matrice (lignes de prix)", "s"],
      ["EAL",  "Validateur de pièces en panne", "panne matérielle de la partie qui reconnaît les pièces", "p"],
      ["EAM",  "Trieur de pièces en panne", "panne matérielle de la partie qui oriente les pièces", "p"],
      ["EAN",  "Distributeur de monnaie en panne", "panne matérielle de la partie qui rend la monnaie", "p"],
      ["EAO",  "Carte électronique du monnayeur en panne", "la carte de commande du monnayeur est en panne", "p"],
      ["EAP",  "Alimentation du monnayeur en panne", "l'alimentation électrique du monnayeur est en panne", "p"],
      ["EAQ",  "Afficheur de crédit en défaut", "erreur de l'afficheur du crédit du monnayeur", "p"],
      ["EAR",  "Erreur de communication du monnayeur", "le monnayeur ne communique plus correctement avec la carte de la machine", "p"],
      ["EAS",  "Pièce refusée", "la dernière pièce introduite a été refusée", "i"],
      ["EAU",  "Code d'erreur MDB du monnayeur", "erreur signalée par le monnayeur MDB ; le code après « _ » est le code MDB en hexadécimal (ex. EAU_000C = pièce coincée)", "p"],
      ["EA1A", "Cassette de pièces retirée", "la cassette de stockage des pièces a été retirée de façon inattendue", "s"]
    ], true],
    ["EB", "Gobelets", "gobelets", "du système de gobelets", [
      ["EB",  "Gobelets : défaut non précisé", "défaut général du système de gobelets", "p"],
      ["EBA", "Carrousel de gobelets en défaut", "défaut du carrousel ou de la tourelle à gobelets", "p"],
      ["EBB", "Contact « pile vide » en défaut", "défaut du contact qui détecte que la pile de gobelets est vide", "p"],
      ["EBC", "Détecteur de gobelet en défaut", "défaut du contact ou du capteur qui détecte un gobelet", "p"],
      ["EBD", "Séparateur de gobelets en défaut", "défaut de la séparation des gobelets", "p"],
      ["EBE", "Les gobelets n'arrivent pas", "les gobelets n'arrivent pas dans la zone de distribution", "p"],
      ["EBF", "Anneau de gobelets défectueux", "anneau du distributeur de gobelets défectueux", "p"],
      ["EBG", "Mauvais gobelets", "gobelets défectueux ou de mauvais modèle dans le distributeur", "s"],
      ["EBH", "Croix de Malte en défaut", "défaut de la croix de Malte (mécanisme d'avance)", "p"],
      ["EBI", "Bras de gobelet en défaut", "défaut du bras ou du transfert de gobelet", "p"],
      ["EBJ", "Plus de gobelets", "plus de gobelets dans le carrousel (EBJ_x = taille ou tourelle n° x)", "s"],
      ["EBK", "Transport des gobelets en défaut", "erreur du transport des gobelets (élévateur, tapis…)", "p"],
      ["EBM", "Moteur de chute des gobelets en défaut", "moteur ou électroaimant qui fait tomber les gobelets défectueux", "p"],
      ["EBN", "Moteur d'avance des gobelets en défaut", "défaut du moteur qui réapprovisionne la pile de gobelets", "p"]
    ], true],
    ["EC", "Commande / électronique", "électronique", "du système de commande", [
      ["EC",   "Électronique : défaut non précisé", "défaut général du système de commande", "p"],
      ["ECA",  "Alimentation électrique hors tolérance", "une alimentation donne une tension trop basse ou trop haute", "p"],
      ["ECB",  "Fusible ou protection déclenché", "un fusible ou une protection contre la surcharge a sauté", "p"],
      ["ECC",  "Transformateur hors tolérance", "un transformateur donne une tension trop basse ou trop haute", "p"],
      ["ECD",  "Carte de commande en défaut", "un défaut a été détecté sur la carte de commande", "p"],
      ["ECE",  "Carte relais / interface en défaut", "un défaut a été détecté sur la carte relais ou d'interface", "p"],
      ["ECF",  "Défaut de câblage ou de connexion", "un câble ou une connexion est en défaut", "p"],
      ["ECG",  "Cames de minuterie en défaut", "défaut d'une ou plusieurs cames de minuterie", "p"],
      ["ECH",  "Capteur optique en défaut", "défaut d'un ou plusieurs capteurs optiques", "p"],
      ["ECI",  "Contact de porte bloqué", "le contact de porte reste bloqué ouvert ou fermé", "p"],
      ["ECJ",  "Micro-interrupteur en défaut", "défaut d'un ou plusieurs micro-interrupteurs", "p"],
      ["ECK",  "Élément électrique annexe en défaut", "défaut d'un élément électrique annexe", "p"],
      ["ECL",  "Horloge en défaut", "un défaut a été détecté sur l'horloge", "p"],
      ["ECM",  "Erreur de la mémoire du programme", "erreur dans la mémoire du programme (EPROM ou FLASH)", "p"],
      ["ECN",  "Erreur de la mémoire vive (RAM)", "erreur dans la mémoire vive", "p"],
      ["ECO",  "Erreur de la mémoire permanente", "erreur dans la mémoire qui garde les données sans courant", "p"],
      ["ECP",  "File des tâches pleine", "la file d'attente des tâches du programme a débordé", "p"],
      ["ECQ",  "Circuit de sortie en défaut", "erreur d'un circuit de sortie (driver)", "p"],
      ["ECR",  "Trop de redémarrages du processeur", "le processeur de la machine a redémarré un nombre anormal de fois", "p"],
      ["ECS",  "Carte de l'afficheur en défaut", "défaut de la carte de l'afficheur des sélections (ou de la carte afficheur + boutons)", "p"],
      ["ECT",  "Relais en défaut", "défaut d'un ou plusieurs relais", "p"],
      ["ECU",  "Pile de sauvegarde faible", "la pile de sauvegarde est faible, absente ou ne se recharge pas", "s"],
      ["EC1A", "Sécurité électrique à vérifier", "la sécurité électrique pose problème", "p"],
      ["EC1B", "Panneau de sélection en défaut", "défaut du panneau, des touches ou du mécanisme de sélection", "p"],
      ["EC1C", "Sonde de température en défaut", "la sonde de température est défectueuse, débranchée ou donne une valeur hors limites", "p"],
      ["EC1D", "Plus de papier dans l'imprimante", "l'imprimante n'a plus de papier", "s"],
      ["EC1E", "Compteur de ventes en défaut", "défaut du compteur de ventes", "p"],
      ["EC1F", "Carte de sélection en défaut", "défaut de la carte de sélection", "p"],
      ["EC1G", "Carte de distribution des produits en défaut", "défaut de la carte qui commande la distribution des produits", "p"]
    ], true],
    ["ED", "Boissons chaudes", "boissons chaudes", "des boissons chaudes", [
      ["ED",   "Boissons chaudes : défaut non précisé", "défaut général du système de boissons chaudes", "p"],
      ["EDA",  "Boîte d'ingrédient en défaut", "une des boîtes d'ingrédients est défectueuse", "p"],
      ["EDB",  "Vis de dosage d'ingrédient en défaut", "défaut du mécanisme qui distribue l'ingrédient (vis / spirale)", "p"],
      ["EDC",  "Dose d'ingrédient incorrecte", "la quantité d'ingrédient distribuée n'est pas correcte", "s"],
      ["EDD",  "Moteur du mélangeur en défaut", "défaut du moteur du mélangeur d'ingrédients", "p"],
      ["EDE",  "Chambre du mélangeur défectueuse", "la chambre du mélangeur d'ingrédients est défectueuse", "p"],
      ["EDF",  "Tuyaux ou bols de mélange défectueux", "tuyaux de distribution ou bols de mélange défectueux", "p"],
      ["EDH",  "Buse d'ingrédient défectueuse", "buse de distribution d'ingrédient défectueuse", "p"],
      ["EDI",  "Électrovanne de dosage en défaut", "défaut de l'électrovanne de dosage", "p"],
      ["EDJ",  "Ingrédient épuisé", "une ou plusieurs boîtes d'ingrédients sont vides", "s"],
      ["EDK",  "Chaudière en défaut", "défaut de la chaudière (réservoir d'eau chaude)", "p"],
      ["EDL",  "Fusible de la résistance grillé", "le fusible de la résistance de la chaudière a sauté", "p"],
      ["EDM",  "Thermostat de la chaudière défectueux", "le thermostat qui règle la chaudière est défectueux", "p"],
      ["EDN",  "Sécurité de surchauffe déclenchée", "la sécurité a coupé à cause d'une ébullition excessive", "p"],
      ["EDO",  "Calcaire dans la chaudière", "il y a du calcaire dans la chaudière", "s"],
      ["EDP",  "Contrôle de niveau de la chaudière défectueux", "le contrôle du niveau d'eau de la chaudière est défectueux", "p"],
      ["EDQ",  "Trop-plein de la chaudière", "défaut du tuyau de trop-plein, ou débordement du réservoir d'eau", "p"],
      ["EDR",  "Joint de la résistance défectueux", "le joint de la résistance de chauffe est défectueux", "p"],
      ["EDS",  "Chaudière endommagée", "le réservoir de la chaudière est endommagé", "p"],
      ["EDT",  "Moulin à café en défaut", "défaut du moulin à café", "p"],
      ["EDU",  "Doseur de café défectueux", "le doseur volumétrique de café est défectueux", "p"],
      ["ED1A", "Tête de distribution en défaut", "défaut de la tête de distribution", "p"]
    ], true],
    ["EE", "Infuseur / expresso", "infuseur", "de l'infuseur / expresso", [
      ["EE",  "Infuseur : défaut non précisé", "défaut général du groupe infuseur / expresso", "p"],
      ["EEA", "Moteur de l'infuseur en défaut", "défaut du moteur de l'infuseur", "p"],
      ["EEB", "Moteur du racleur en défaut", "défaut du moteur du racleur de l'infuseur", "p"],
      ["EEC", "Plaque filtrante bouchée ou changée", "plaque filtrante bouchée, changée ou nettoyée", "s"],
      ["EED", "Papier filtre absent ou défectueux", "pas de papier filtre, ou papier filtre défectueux", "s"],
      ["EEE", "Bras du racleur en défaut", "défaut du bras du racleur de l'infuseur", "p"],
      ["EEF", "Chambre d'infusion endommagée", "la chambre d'infusion est endommagée", "p"],
      ["EEG", "Piston de l'infuseur endommagé", "le piston de l'infuseur est endommagé", "p"],
      ["EEH", "Minuterie de l'infuseur en défaut", "défaut de la minuterie de l'infuseur / expresso", "p"],
      ["EEI", "Carte électronique de l'infuseur en défaut", "défaut de la carte de l'infuseur / expresso", "p"],
      ["EEJ", "Contact du racleur défectueux", "le contact du racleur est défectueux", "p"],
      ["EEK", "Entraînement de l'infuseur en défaut", "défaut du mécanisme d'entraînement de l'infuseur / expresso", "p"],
      ["EEL", "Fuite dans l'infuseur", "fuite dans le groupe infuseur / expresso (joints)", "p"]
    ], true],
    ["EF", "Eau", "circuit d'eau", "du circuit d'eau", [
      ["EF",  "Circuit d'eau : défaut non précisé", "défaut général du circuit d'eau", "p"],
      ["EFA", "Tuyau d'arrivée d'eau en défaut", "défaut du tuyau de raccordement à l'eau", "p"],
      ["EFB", "Filtre à eau à changer", "le filtre à eau doit être changé ou a été changé", "s"],
      ["EFC", "Vanne d'arrivée d'eau défectueuse", "la vanne d'arrivée d'eau est défectueuse", "p"],
      ["EFD", "Clapet anti-retour en défaut", "défaut du clapet anti-retour", "p"],
      ["EFE", "Régulateur de pression d'eau défectueux", "le régulateur de pression d'eau est défectueux", "p"],
      ["EFF", "Réservoir d'eau en défaut", "défaut du réservoir d'eau", "p"],
      ["EFG", "Détection du niveau d'eau en erreur", "erreur du système qui détecte le niveau d'eau (flotteur)", "p"],
      ["EFH", "Vanne de distribution défectueuse", "la vanne de distribution d'eau est défectueuse", "p"],
      ["EFI", "Vanne de distribution entartrée", "la vanne doit être détartrée ou a été détartrée", "s"],
      ["EFJ", "Fuite d'eau", "fuite d'eau sur un tuyau ou un raccord", "p"],
      ["EFK", "Sondes de niveau d'eau en défaut", "défaut des sondes de niveau d'eau", "p"],
      ["EFL", "Plus d'eau", "pas d'eau (la pression d'eau est peut-être trop basse)", "p"],
      ["EFM", "Collecteur d'eau en défaut", "défaut du collecteur ou d'une dérivation de distribution d'eau", "p"],
      ["EFN", "Tête de pompe à eau défectueuse", "la tête de la pompe à eau est défectueuse", "p"],
      ["EFO", "Moteur de la pompe à eau défectueux", "le moteur de la pompe à eau est défectueux", "p"],
      ["EFP", "Problème de qualité de l'eau", "un problème de qualité de l'eau a été signalé", "s"]
    ], true],
    ["EG", "Armoire / porte", "armoire / porte", "de l'armoire / porte", [
      ["EG",  "Armoire / porte : défaut non précisé", "défaut général du meuble ou de la porte", "p"],
      ["EGA", "Meuble de la machine endommagé", "le meuble ou le châssis de la machine est endommagé", "p"],
      ["EGB", "Pieds de la machine manquants ou abîmés", "pieds de la machine manquants ou endommagés", "s"],
      ["EGC", "Serrure de porte en défaut", "la serrure ou la fermeture de la porte est en défaut", "p"],
      ["EGD", "Autocollants abîmés ou incorrects", "autocollants ou étiquettes abîmés ou incorrects", "s"],
      ["EGE", "Éclairage en panne", "les lampes ou leur alimentation ne fonctionnent pas", "s"],
      ["EGF", "Façade abîmée ou manquante", "garniture ou façade abîmée ou manquante", "s"],
      ["EGK", "Verrou de sélection", "verrou ou loquet de sélection (pas de définition dans la norme)", "s"],
      ["EGL", "Voyant", "voyant / indicateur (pas de définition dans la norme)", "s"],
      ["EGM", "Bac d'égouttage absent", "le bac d'égouttage n'est pas en place", "s"],
      ["EGN", "Bac à déchets plein", "le bac à déchets est plein (EGN_n = bac n° n)", "s"],
      ["EGP", "Ventilateur d'extraction en panne", "le ventilateur d'extraction ne fonctionne pas", "p"],
      ["EGQ", "Conduit d'extraction absent ou bouché", "le conduit d'extraction n'est pas en place ou est bouché", "p"],
      ["EGR", "Moteur d'extraction en défaut", "un défaut a été détecté sur le moteur d'extraction", "p"],
      ["EGS", "Porte ouverte", "la porte de la machine est ouverte", "i"],
      ["EGT", "Porte fermée", "la porte de la machine est fermée", "i"],
      ["EGU", "Porte ou trappe de distribution en défaut", "défaut de la porte ou de la trappe de distribution (électroaimant, moteur, blocage, position pas atteinte), portes intérieures comprises", "p"]
    ], true],
    ["EH", "Boissons froides", "boissons froides", "des boissons froides", [
      ["EH",   "Boissons froides : défaut non précisé", "défaut général du système de boissons froides", "p"],
      ["EHC",  "Réservoir du carbonateur en défaut", "fuite, défaut ou mauvais remplissage du réservoir du carbonateur", "p"],
      ["EHF",  "Pompe à sirop défectueuse ou bouchée", "la pompe à sirop est défectueuse ou bouchée", "p"],
      ["EHG",  "Vanne à sirop défectueuse ou bouchée", "la vanne à sirop est défectueuse ou bouchée", "p"],
      ["EHH",  "Tuyau de sirop défectueux ou bouché", "le tuyau de sirop est défectueux ou bouché", "p"],
      ["EHI",  "Plus de sirop", "le bidon de sirop est vide ou défectueux", "s"],
      ["EHJ",  "Joint de sirop défectueux", "joint de sirop défectueux ou qui fuit", "p"],
      ["EHK",  "Bouteille de CO2 vide ou basse", "pression de CO2 basse, bouteille vide ou défectueuse", "s"],
      ["EHL",  "Pression de CO2 hors réglage", "la pression de CO2 est hors limites : régler ou remplacer le détendeur", "s"],
      ["EHM",  "Fuite de CO2 ou d'eau", "du CO2 ou de l'eau fuit", "p"],
      ["EHN",  "Tuyau de CO2 défectueux ou bouché", "le tuyau de CO2 est défectueux ou bouché", "p"],
      ["EHO",  "Manomètre de CO2 incorrect", "l'indication de pression n'est pas correcte", "s"],
      ["EHP",  "Joint du manomètre de CO2 défectueux", "le joint du manomètre de CO2 est défectueux", "p"],
      ["EHT",  "Bain d'eau glacée trop chaud ou gelé", "le bain d'eau glacée est trop chaud ou a gelé", "p"],
      ["EHU",  "Moteur de l'agitateur du bain en panne", "le moteur de l'agitateur du bain est en panne", "p"],
      ["EH1A", "Thermostat du bain froid défectueux", "le thermostat du bain froid est défectueux", "p"],
      ["EH1B", "Niveau d'eau du bain trop bas", "le niveau d'eau du bain est trop bas", "s"],
      ["EH1C", "Pompe à eau du carbonateur défectueuse", "la pompe à eau du carbonateur est défectueuse", "p"],
      ["EH1K", "Électroaimant de la porte de la machine à glaçons", "défaut de l'électroaimant de la porte de la machine à glaçons", "p"],
      ["EH1L", "Contact de niveau de la machine à glaçons défectueux", "le contact de niveau de la machine à glaçons est défectueux", "p"],
      ["EH1M", "Vis de la machine à glaçons bloquée", "vis défectueuse ou bloquée, peut-être par de la glace", "p"],
      ["EH1N", "Vanne du carbonateur bouchée ou défectueuse", "la vanne du carbonateur est bouchée ou défectueuse", "p"],
      ["EH1O", "Capteurs de niveau du carbonateur défectueux", "défectueux : ils indiquent peut-être niveau haut et bas en même temps", "p"],
      ["EH1P", "Capteurs de niveau de la coupelle défectueux", "défectueux : ils indiquent peut-être niveau haut et bas en même temps", "p"],
      ["EH1Q", "Coupelle d'alimentation vide", "la coupelle d'alimentation contient moins d'eau que le minimum nécessaire", "s"],
      ["EH1R", "Nettoyage du circuit d'eau défectueux", "le système de nettoyage du circuit d'eau est défectueux", "p"]
    ], true],
    ["EI", "Communication", "communication", "de la communication", [
      ["EI",  "Communication : défaut non précisé", "défaut général de communication", "p"],
      ["EIA", "Pas de modem ni de radio", "aucun modem ni module radio détecté", "p"],
      ["EIB", "Ligne téléphonique en panne", "le modem détecte que la ligne ne fonctionne pas (pas de tonalité)", "p"],
      ["EIC", "Batterie du module de communication faible", "la batterie (ou le secours) de la passerelle de communication est faible", "s"],
      ["EID", "Erreur de communication du serveur distant", "le serveur distant a eu une erreur de communication (synchronisation, appels coupés…)", "s"],
      ["EIE", "Pas de réseau étendu (WAN)", "aucun réseau étendu détecté : hors couverture ou problème d'antenne", "s"],
      ["EIF", "Pas de réseau local (LAN)", "aucun réseau local détecté : hors couverture, mauvaise configuration ou antenne", "s"],
      ["EIG", "Serveur distant occupé", "le serveur distant est occupé : pas de communication possible", "s"],
      ["EIH", "Communication refusée par le réseau", "la passerelle est couverte mais le réseau refuse les transmissions", "s"],
      ["EII", "Communication refusée par le serveur", "le serveur est joignable mais refuse la communication avec la passerelle", "s"],
      ["EIJ", "Passerelle de communication non enregistrée", "la passerelle n'est pas mise en service auprès du serveur distant", "s"],
      ["EIK", "Communication peu fiable", "moins de 80 % de transmissions réussies sur les 30 derniers jours", "s"],
      ["EIL", "La machine ne répond pas à la passerelle", "la passerelle n'arrive pas à ouvrir une session de transfert avec la carte de la machine", "p"],
      ["EIM", "Prise de données de la machine non détectée", "la passerelle ne détecte pas la connexion à la prise de transfert de données de la machine", "p"],
      ["EIN", "Signal radio faible", "le signal du réseau est trop faible pour une communication fiable", "s"],
      ["EIO", "Erreur de communication machine ↔ passerelle", "la carte de la machine signale une erreur de communication avec l'appareil de relevé", "p"]
    ], true],
    ["EJ", "Distribution (snack, aliments)", "distribution", "du système de distribution", [
      ["EJ",  "Distribution : défaut non précisé", "défaut général du système de distribution (aliments, snacks, canettes)", "p"],
      ["EJA", "Porte de distribution en erreur (ancien code)", "ancien code, remplacé par EGU : défaut d'une porte (électroaimant, moteur, blocage, position)", "p"],
      ["EJB", "Moteur de distribution en erreur", "moteur bloqué, pas revenu en position de départ, accouplement, moteur défectueux ou câblage", "p"],
      ["EJC", "Spirale ou chaîne bloquée", "la spirale ou la chaîne est bloquée, ou la spirale est mal mise", "p"],
      ["EJD", "Étagère ou tiroir mal inséré", "une étagère, un tiroir ou un plateau est mal branché, mal mis ou défectueux", "p"],
      ["EJE", "Le tambour ne tourne pas correctement", "le mécanisme du tambour ne tourne pas correctement", "p"],
      ["EJF", "Moteur du tambour défectueux", "le moteur qui fait tourner le tambour est défectueux", "p"],
      ["EJG", "Trappe de retrait du produit en défaut", "la trappe où le client prend son produit ne fonctionne pas correctement", "p"],
      ["EJH", "Règles d'hygiène (température) dépassées", "la minuterie sanitaire de la zone réfrigérée s'est déclenchée ; selon les règles locales, les aliments peuvent être mis hors vente", "p"],
      ["EJI", "Ventilateur défectueux", "un des ventilateurs est défectueux", "p"],
      ["EJJ", "Froid insuffisant ou givrage", "le groupe froid n'atteint pas la température réglée, ou il est pris par le givre", "p"],
      ["EJK", "Thermostat défectueux", "le thermostat est défectueux", "p"],
      ["EJL", "Détecteur de distribution en erreur", "erreur du système qui détecte la sortie du produit (ex. cellules photoélectriques)", "p"],
      ["EJM", "Système de distribution en erreur (ascenseur, bras, tapis)", "erreur du système qui amène le produit : ascenseur, bras, tapis…", "p"],
      ["EJV", "Modifications faites sur la machine", "des modifications ont été faites sur la machine", "i"],
      ["EJW", "Aucun défaut trouvé", "la machine a été contrôlée : aucun défaut trouvé", "i"],
      ["EJX", "Vandalisme ou fraude", "défaut provoqué par un client : vandalisme ou fraude", "s"],
      ["EJY", "Entretien nécessaire", "un entretien est nécessaire", "s"],
      ["EJZ", "Autre défaut de distribution", "défaut qui n'est pas dans la liste", "p"]
    ], false],
    ["EK", "Paiement sans contact 1", "sans espèces 1", "du système sans espèces 1", [
      ["EK",  "Système sans espèces 1 : défaut non précisé", "défaut général du système de paiement sans espèces n° 1", "p"],
      ["EKA", "Lecteur de carte défectueux", "l'unité de contact du lecteur est défectueuse", "p"],
      ["EKB", "Unité de contrôle du lecteur en erreur", "erreur détectée sur l'unité de contrôle du lecteur de cartes", "p"],
      ["EKC", "Carte électronique du lecteur en panne", "la carte de commande du système sans espèces est en panne", "p"],
      ["EKD", "Alimentation du lecteur en panne", "l'alimentation du système sans espèces est en panne", "p"],
      ["EKE", "Carte refusée", "une carte a été refusée à cause d'une erreur", "i"],
      ["EKF", "Programmation du lecteur incorrecte", "les paramètres du système sans espèces sont mal programmés", "s"],
      ["EKG", "Carte non programmée", "la carte n'est pas encore programmée pour être utilisée", "i"],
      ["EKH", "Carte expirée", "la date de validité de la carte est dépassée", "i"],
      ["EKI", "Carte bloquée", "carte bloquée à cause d'erreurs ou de données corrompues", "i"],
      ["EKJ", "Carte sur liste noire", "le numéro de la carte est sur la liste noire", "i"],
      ["EKK", "Mémoire des transactions pleine", "la mémoire des transactions est pleine : relever les données", "s"],
      ["EKL", "Module de sécurité (SIM) défectueux", "la carte SIM est défectueuse ou n'est plus valable", "p"],
      ["EKM", "Erreur de communication du lecteur", "erreur de communication, ou toutes les communications sont arrêtées", "p"],
      ["EKU", "Code d'erreur MDB du lecteur", "erreur signalée par le lecteur MDB ; le code après « _ » est le code MDB en hexadécimal (ex. EKU_4X = erreur de communication)", "p"]
    ], true],
    ["EK2", "Paiement sans contact 2", "sans espèces 2", "du système sans espèces 2", [
      ["EK2",  "Système sans espèces 2 : défaut non précisé", "défaut général du système de paiement sans espèces n° 2", "p"],
      ["EK2A", "Lecteur de carte 2 défectueux", "l'unité de contact du lecteur n° 2 est défectueuse", "p"],
      ["EK2B", "Unité de contrôle du lecteur 2 en erreur", "erreur détectée sur l'unité de contrôle du lecteur n° 2", "p"],
      ["EK2C", "Carte électronique du lecteur 2 en panne", "la carte de commande du système sans espèces n° 2 est en panne", "p"],
      ["EK2D", "Alimentation du lecteur 2 en panne", "l'alimentation du système sans espèces n° 2 est en panne", "p"],
      ["EK2E", "Carte refusée (lecteur 2)", "une carte a été refusée à cause d'une erreur", "i"],
      ["EK2F", "Programmation du lecteur 2 incorrecte", "les paramètres du système sans espèces n° 2 sont mal programmés", "s"],
      ["EK2G", "Carte non programmée (lecteur 2)", "la carte n'est pas encore programmée pour être utilisée", "i"],
      ["EK2H", "Carte expirée (lecteur 2)", "la date de validité de la carte est dépassée", "i"],
      ["EK2I", "Carte bloquée (lecteur 2)", "carte bloquée à cause d'erreurs ou de données corrompues", "i"],
      ["EK2J", "Carte sur liste noire (lecteur 2)", "le numéro de la carte est sur la liste noire", "i"],
      ["EK2K", "Mémoire des transactions pleine (lecteur 2)", "la mémoire des transactions est pleine : relever les données", "s"],
      ["EK2L", "Module de sécurité (SIM) du lecteur 2 défectueux", "la carte SIM est défectueuse ou n'est plus valable", "p"],
      ["EK2M", "Erreur de communication du lecteur 2", "erreur de communication, ou toutes les communications sont arrêtées", "p"],
      ["EK2U", "Code d'erreur MDB du lecteur 2", "erreur signalée par le lecteur MDB n° 2 ; le code après « _ » est le code MDB en hexadécimal", "p"]
    ], true],
    ["EL", "Produits", "produit", "des produits", [
      ["EL",  "Produit : défaut non précisé", "défaut général lié à un produit", "p"],
      ["ELA", "Échec de distribution du produit", "la machine n'a pas réussi à distribuer le produit choisi", "p"],
      ["ELB", "Produit épuisé", "plus de produit choisi : épuisé de façon inattendue", "s"],
      ["ELC", "Quantité d'eau hors réglage", "la quantité d'eau distribuée sort de la plage réglée", "s"],
      ["ELD", "Quantité de sirop hors réglage", "la quantité de sirop distribuée sort de la plage réglée", "s"],
      ["ELE", "Produit au niveau bas", "le nombre ou le niveau du produit a atteint le seuil d'alerte", "s"]
    ], true],
    ["EM", "Micro-ondes", "micro-ondes", "du micro-ondes", [
      ["EM",  "Micro-ondes : défaut non précisé", "défaut général du micro-ondes", "p"],
      ["EMA", "Contrôle d'émission effectué", "un contrôle des émissions du micro-ondes a été fait", "i"],
      ["EMB", "Magnétron défectueux", "le magnétron du micro-ondes est défectueux", "p"],
      ["EMC", "Commande du micro-ondes défectueuse", "le système de commande du micro-ondes est défectueux", "p"]
    ], true],
    ["EN", "Lecteur de billets", "lecteur de billets", "du lecteur de billets", [
      ["EN",  "Lecteur de billets : défaut non précisé", "défaut général du lecteur de billets", "p"],
      ["ENA", "Entrée des billets bloquée", "le chemin d'entrée des billets est bloqué", "p"],
      ["ENB", "Trop de fraudes détectées", "trop de faux billets ou de tentatives de fraude détectés", "s"],
      ["ENC", "Validateur de billets bloqué", "le chemin de reconnaissance des billets est bloqué", "p"],
      ["END", "Empileur de billets bloqué", "le mécanisme qui empile les billets est bloqué", "p"],
      ["ENE", "Caisse à billets pleine", "la caisse à billets est pleine", "s"],
      ["ENF", "Caisse à billets retirée", "la caisse à billets est retirée ou mal en place", "s"],
      ["ENG", "Validateur de billets en panne", "le système de reconnaissance des billets est en panne", "p"],
      ["ENH", "Empileur de billets en panne", "le mécanisme qui empile les billets est en panne", "p"],
      ["ENI", "Carte du lecteur de billets en panne", "une erreur a été détectée sur la carte de commande du lecteur", "p"],
      ["ENJ", "Alimentation du lecteur de billets en panne", "une erreur a été détectée sur une alimentation du lecteur", "p"],
      ["ENK", "Erreur de communication du lecteur de billets", "erreur de communication, ou toutes les communications sont arrêtées", "p"],
      ["ENU", "Code d'erreur MDB du lecteur de billets", "erreur signalée par le lecteur MDB ; le code après « _ » est le code MDB en hexadécimal (ex. ENU_04 = erreur de mémoire ROM)", "p"]
    ], true],
    ["EO", "Réfrigération", "réfrigération", "de la réfrigération", [
      ["EO",  "Réfrigération : défaut non précisé", "défaut général du système de réfrigération", "p"],
      ["EOA", "Sonde de température défaillante", "la sonde est en panne ou donne une valeur fausse", "p"],
      ["EOB", "Commande du compresseur en défaut", "relais ou triac défectueux : le compresseur tourne sans arrêt ou ne démarre pas", "p"],
      ["EOC", "Compresseur en défaut", "fuite, ne tourne pas, puissance réduite ou coupure par surcharge", "p"],
      ["EOD", "Relais de démarrage du compresseur défectueux", "relais de courant ou PTC défectueux ou collé", "p"],
      ["EOE", "Sécurité de surchauffe du compresseur en défaut", "le mécanisme de coupure en cas de surchauffe est défaillant", "p"],
      ["EOF", "Condensateur du compresseur défectueux", "condensateur défectueux : le compresseur ne démarre pas", "p"],
      ["EOG", "Tube capillaire obstrué ou plié", "le tube capillaire est obstrué ou plié", "p"],
      ["EOH", "Condenseur encrassé ou qui fuit", "fuite, ou air bloqué par la saleté ou les débris", "p"],
      ["EOI", "Ventilateur du condenseur en panne", "pale tordue ou moteur du ventilateur en panne", "p"],
      ["EOJ", "Évaporateur encrassé, givré ou qui fuit", "fuite, air bloqué par la saleté, ou évaporateur pris par le givre", "p"],
      ["EOK", "Ventilateur de l'évaporateur en panne", "le moteur du ventilateur de l'évaporateur est en panne", "p"],
      ["EOL", "Détendeur défectueux", "le détendeur du circuit de froid est défectueux", "p"],
      ["EOM", "Fuite de gaz réfrigérant", "le gaz réfrigérant fuit", "p"],
      ["EON", "Commande du dégivrage en défaut", "relais ou triac du dégivrage défectueux", "p"],
      ["EOO", "Thermostat de fin de dégivrage défectueux", "le contact de fin de dégivrage est défectueux", "p"],
      ["EOP", "Résistances de dégivrage défectueuses", "les résistances de dégivrage sont défectueuses", "p"],
      ["EOQ", "Évacuation des condensats en défaut", "bac à condensats défectueux, ou tuyau d'évacuation bouché ou qui fuit", "p"]
    ], true],
    ["OA", "Opérations (saisies manuelles)", "opérations", "d'opération", [
      ["OA",   "Demande d'opération", "demande d'opération sans précision (actif = à faire, inactif = fait)", "i"],
      ["OAA",  "Maintenance", "intervention de maintenance", "i"],
      ["OAB",  "Contrôle qualité", "inspection du produit, du fonctionnement ou du service", "i"],
      ["OAC",  "Livraison de la machine", "livraison chez le client", "i"],
      ["OAD",  "Livraison et installation", "livraison et installation chez le client", "i"],
      ["OAE",  "Installation de la machine", "installation chez le client", "i"],
      ["OAF",  "Échange de la machine", "remplacement de la machine chez le client par une autre", "i"],
      ["OAG",  "Reprise de la machine", "enlèvement de la machine chez le client", "i"],
      ["OAH",  "Déplacement de la machine", "déplacement d'un endroit à un autre chez le client", "i"],
      ["OAI",  "Formation du personnel", "formation du personnel d'exploitation", "i"],
      ["OAJ",  "Désinfection de la machine", "désinfection du distributeur", "i"],
      ["OAK",  "Changement du filtre à eau", "le filtre à eau a été changé", "i"],
      ["OAL",  "Changement de prix", "changement de prix (OAL_x = produit n° x)", "i"],
      ["OAM",  "Recette ou dosage modifié", "recette ou ingrédient modifié (OAM_x = produit n° x)", "i"],
      ["OAN",  "Contrôle des doses", "contrôle des quantités d'ingrédients selon la recette", "i"],
      ["OAO",  "Changement de bouteille de CO2", "bouteille vide remplacée par une pleine", "i"],
      ["OAP",  "Contrôle de perte", "action nécessaire suite à une perte, quelle qu'elle soit", "i"],
      ["OAQ",  "Dégraissage de l'infuseur", "dégraissage de l'infuseur", "i"],
      ["OAR",  "Stérilisation", "stérilisation pour l'hygiène", "i"],
      ["OAS",  "Rapport aux autorités", "données à transmettre aux autorités nationales ou locales", "i"],
      ["OAT",  "Changement de produit", "changement de produit (OAT_x = produit n° x)", "i"],
      ["OAU",  "Début de promotion", "début d'une promotion (OAU_x = produit n° x)", "i"],
      ["OA1A", "Fin de promotion", "fin d'une promotion (OA1A_x = produit n° x)", "i"],
      ["OA1B", "Tous les produits remplis", "tous les produits ont été remplis au niveau de recharge prévu", "i"],
      ["OA1C", "Produit rempli", "un produit a été rempli au niveau prévu (OA1C_x = produit n° x)", "i"],
      ["OAV",  "Modification (opération)", "modification (pas de définition dans la norme)", "i"],
      ["OAW",  "Aucun défaut trouvé (opération)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["OAX",  "Causé par un client (opération)", "causé par un client (pas de définition dans la norme)", "i"],
      ["OAY",  "Causé par le service (opération)", "causé par le service (pas de définition dans la norme)", "i"],
      ["OAZ",  "Autre demande d'opération", "demande d'opération qui n'est pas dans la liste", "i"]
    ], false],
    ["OB", "Service / entretien", "service", "de service", [
      ["OB",  "Problème lié au service", "problème lié au service, sans précision", "s"],
      ["OBA", "Mauvais chargement", "mauvais produit, emplacement, quantité ou position de spirale…", "s"],
      ["OBB", "Porte laissée ouverte", "la porte a été laissée ouverte par erreur", "s"],
      ["OBC", "Produit bas ou épuisé", "quantité estimée insuffisante jusqu'au prochain passage (OBC_x = produit n° x)", "s"],
      ["OBD", "Gobelets bas ou épuisés", "quantité de gobelets estimée insuffisante jusqu'au prochain passage", "s"],
      ["OBE", "Produit défectueux", "emballage, qualité, ingrédients, date dépassée, température…", "s"],
      ["OBF", "Gobelets défectueux", "cassés, bloqués, mauvaise taille ou mauvais type", "s"],
      ["OBG", "CO2 bas ou épuisé", "quantité de CO2 estimée insuffisante jusqu'au prochain passage", "s"],
      ["OBH", "Seau à déchets plein ou mal placé", "le seau à déchets n'est pas en place ou doit être vidé", "s"],
      ["OBI", "Tuyau d'eaux usées mal placé", "le tuyau d'eaux usées n'est pas à la bonne position", "s"],
      ["OBJ", "Prix incorrect", "mauvais prix (OBJ_x = produit n° x)", "s"],
      ["OBK", "Monnaie absente ou incorrecte", "problème de monnaie dans le rendeur", "s"],
      ["OBL", "Montage incorrect", "mal positionné, mal monté, pas ou mal branché", "s"],
      ["OBM", "Intervention demandée", "demandée par le client, le consommateur ou l'exploitant", "s"],
      ["OBN", "Conduit d'extraction bouché", "conduit d'extraction bouché (OBN_x = produit n° x)", "s"],
      ["OBO", "Caisse pleine", "la caisse (pièces, billets ou jetons) est pleine", "s"],
      ["OBP", "Monnayeur sale", "pièces ou jetons peu, mal ou pas acceptés", "s"],
      ["OBQ", "Tuyau bouché par la saleté", "tuyau bouché par la saleté (OBQ_x = produit n° x)", "s"],
      ["OBR", "Lecteur de billets sale", "billets peu, mal ou pas acceptés", "s"],
      ["OBS", "Moyen de paiement refusé", "le lecteur sans espèces refuse les moyens de paiement de façon inattendue", "s"],
      ["OBT", "Refroidissement insuffisant", "la température des boissons, des ingrédients ou des aliments est trop haute (ou parfois trop basse)", "p"],
      ["OBV", "Modification (service)", "modification (pas de définition dans la norme)", "i"],
      ["OBW", "Aucun défaut trouvé (service)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["OBX", "Causé par un client (service)", "causé par un client (pas de définition dans la norme)", "s"],
      ["OBY", "Causé par le service (service)", "causé par le service (pas de définition dans la norme)", "s"],
      ["OBZ", "Autre action de service", "action de service qui n'est pas dans la liste", "s"]
    ], false],
    ["OC", "Causé par un client ou l'extérieur", "client / extérieur", "lié au client", [
      ["OC",  "Problème causé par un client", "problème causé par un client, sans précision", "s"],
      ["OCA", "Vol", "machine forcée ; caisse, argent ou produits volés", "p"],
      ["OCB", "Vandalisme", "pièces cassées, liquide renversé, destruction, graffitis… volontaires", "p"],
      ["OCC", "Fente à pièces bouchée", "chewing-gum, fausses pièces, saleté…", "s"],
      ["OCD", "Liquide renversé dans la machine", "soupe, café ou autre liquide renversé dans la machine", "s"],
      ["OCE", "Fente à billets bouchée", "cartes, papier…", "s"],
      ["OCF", "Hors service à cause d'une coupure de courant", "la machine est hors service à cause d'une coupure de courant", "p"],
      ["OCG", "Coupure d'eau", "les produits préparés avec de l'eau ne sont pas disponibles", "s"],
      ["OCH", "Accès à la machine obstrué", "le client, l'exploitant ou le technicien ne peut pas (bien) accéder à la machine", "s"],
      ["OCI", "Tentatives de fraude", "tentatives pour obtenir des produits gratuits ou moins chers", "s"],
      ["OCJ", "Réseau du client coupé", "pas d'accès à la base des clients (crédit / débit central), serveur arrêté…", "s"],
      ["OCK", "Réseau de communication de l'exploitant coupé", "pas de communication entre l'outil de l'exploitant et la machine", "s"],
      ["OCL", "Moyen de paiement mal programmé", "le support d'identification ou de paiement n'est pas (ou mal) programmé", "s"],
      ["OCM", "Machine pas prête : panne du système", "la machine ne peut pas vendre à cause d'une panne de son système", "p"],
      ["OCN", "Machine pas prête : erreur de configuration", "la machine ne peut pas vendre à cause d'une erreur de configuration", "p"],
      ["OCV", "Modification (client)", "modification (pas de définition dans la norme)", "i"],
      ["OCW", "Aucun défaut trouvé (client)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["OCX", "Causé par un client", "causé par un client (pas de définition dans la norme)", "s"],
      ["OCY", "Causé par le service (client)", "causé par le service (pas de définition dans la norme)", "s"],
      ["OCZ", "Autre problème causé par un client", "problème qui n'est pas dans la liste", "s"]
    ], false],
    ["OD", "Visites de retour", "visites", "de visite", [
      ["OD",  "Visite de retour", "visite de retour, sans précision", "i"],
      ["ODA", "Pièce montée", "une pièce a été montée (ODA_x = pièce x)", "i"],
      ["ODB", "Monnayeur remplacé", "le monnayeur a été remplacé", "i"],
      ["ODC", "Groupe froid remplacé", "le groupe froid a été remplacé", "i"],
      ["ODD", "Réparation après vandalisme", "réparation après vandalisme (ODD_x = réparation x)", "i"],
      ["ODE", "Visite de relations publiques", "visite de relations publiques (ODE_x = visite x)", "i"],
      ["ODF", "Contrôle d'un travail précédent", "contrôle d'un travail fait auparavant (ODF_x = travail x)", "i"],
      ["ODV", "Modification (visite)", "modification (pas de définition dans la norme)", "i"],
      ["ODW", "Aucun défaut trouvé (visite)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["ODX", "Causé par un client (visite)", "causé par un client (pas de définition dans la norme)", "i"],
      ["ODY", "Causé par le service (visite)", "causé par le service (pas de définition dans la norme)", "i"],
      ["ODZ", "Autre visite", "visite qui n'est pas dans la liste", "i"]
    ], false],
    ["OE", "Historique machine", "historique", "d'historique", [
      ["OE",  "Historique de la machine", "événement d'historique, sans précision", "i"],
      ["OEA", "Appel hors des heures de bureau", "événement détecté en dehors des heures de bureau de la société d'exploitation", "i"],
      ["OEB", "Changement de configuration des pièces", "changement de configuration des pièces du rendeur de monnaie", "i"],
      ["OEV", "Modification (historique)", "modification (pas de définition dans la norme)", "i"],
      ["OEW", "Aucun défaut trouvé (historique)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["OEX", "Causé par un client (historique)", "causé par un client (pas de définition dans la norme)", "i"],
      ["OEY", "Causé par le service (historique)", "causé par le service (pas de définition dans la norme)", "i"],
      ["OEZ", "Autre événement d'historique", "événement qui n'est pas dans la liste", "i"]
    ], false],
    ["OF", "Collecte d'argent", "collecte", "de collecte", [
      ["OF",  "Collecte d'argent", "collecte d'argent, sans précision", "i"],
      ["OFA", "Pièces vidées", "la caisse à pièces ou à jetons a été vidée", "i"],
      ["OFB", "Billets vidés", "la caisse ou l'empileur à billets a été vidé", "i"],
      ["OFC", "Données sans espèces transmises", "données d'audit transmises au centre de compensation (porte-monnaie électronique, paiement mobile)", "i"],
      ["OFD", "Tubes de monnaie vidés", "les tubes de monnaie ont été vidés", "i"],
      ["OFV", "Modification (collecte)", "modification (pas de définition dans la norme)", "i"],
      ["OFW", "Aucun défaut trouvé (collecte)", "aucun défaut trouvé (pas de définition dans la norme)", "i"],
      ["OFX", "Causé par un client (collecte)", "causé par un client (pas de définition dans la norme)", "i"],
      ["OFY", "Causé par le service (collecte)", "causé par le service (pas de définition dans la norme)", "i"],
      ["OFZ", "Autre (collecte)", "événement de collecte qui n'est pas dans la liste", "i"]
    ], false]
  ];

  // Codes V à Z communs à toutes les familles « E » (annexe C, C.2.3)
  function generiques(prefixe, nom, de) {
    return [
      [prefixe + "V", "Modification " + de, "des modifications ont été faites (" + nom + ")", "i"],
      [prefixe + "W", "Aucun défaut trouvé (" + nom + ")", "contrôle fait : aucun défaut trouvé", "i"],
      [prefixe + "X", "Défaut causé par un client (" + nom + ")", "défaut provoqué par un client", "s"],
      [prefixe + "Y", "Défaut causé par le technicien (" + nom + ")", "défaut provoqué lors d'une intervention technique", "s"],
      [prefixe + "Z", "Autre défaut " + de, "défaut qui n'est pas dans la liste", "p"]
    ];
  }

  // Index : code → description
  const INDEX = {};
  const GROUPES = [];
  FAMILLES.forEach(([prefixe, nom, court, de, lignes, auto]) => {
    const toutes = auto ? lignes.concat(generiques(prefixe, court, de)) : lignes;
    const codes = toutes.map(([code, titre, expl, g]) => {
      const d = { code, titre, expl, gravite: g, famille: nom, prefixe, source: "eva" };
      INDEX[code] = d;
      return d;
    });
    GROUPES.push({ prefixe, nom, codes });
  });

  // Codes dont la partie après « _ » est un numéro de produit (PA101)
  const AVEC_PRODUIT = ["ELA", "ELB", "ELC", "ELD", "ELE", "OAL", "OAM", "OAT", "OAU", "OA1A", "OA1C", "OBC", "OBJ", "OBN", "OBQ"];
  const AVEC_MDB = ["EAU", "EKU", "EK2U", "ENU"];

  // Correspondances observées dans un relevé réel (pas dans le manuel)
  const OBSERVEES = {
    "ECF_38": { fas: "16", sous: "38" },
    "E45":    { fas: "45", sous: "54" },
    "EOA":    { fas: "10", sous: "38" }
  };

  const GRAVITES = {
    p: { nom: "panne",       icone: "🔴", classe: "err",  niveau: "error" },
    s: { nom: "à surveiller", icone: "🟠", classe: "warn", niveau: "warn"  },
    i: { nom: "information", icone: "🔵", classe: "info", niveau: "info"  }
  };

  function fasDecrire(code, sous) {
    const c = String(code == null ? "" : code).trim().padStart(2, "0");
    const s = String(sous == null ? "" : sous).trim();
    const f = FAS[c];
    if (!f) {
      return {
        code: c, sous: s, titre: "Erreur FAS " + c + (s ? "/" + s : ""),
        expl: "code absent du tableau des erreurs du manuel Power Lift", solution: [],
        gravite: "p", source: "fas", connu: false
      };
    }
    let detail = "";
    if (f.sous === "sel" && s) detail = "sélection " + s;
    else if (f.detail && f.detail[s]) detail = f.detail[s];
    else if (SOUS_CODES[s]) detail = "signalé par la " + SOUS_CODES[s];
    return {
      code: c, sous: s, titre: f.titre,
      expl: f.expl + (detail ? " — " + detail : ""),
      solution: f.solution.slice(), note: f.note || "",
      gravite: "p", source: "fas", connu: true
    };
  }

  // Décrit un code d'événement EVA-DTS (EA1 / EA2), avec ses variantes « _x »
  function decrire(codeBrut) {
    const code = String(codeBrut == null ? "" : codeBrut).trim().toUpperCase();
    const res = (base, extra) => Object.assign({ code, base: base.code, titre: base.titre, expl: base.expl,
      gravite: base.gravite, famille: base.famille, source: "eva", connu: true, solution: [], observe: null, note: "" }, extra || {});

    let base = INDEX[code], detail = "";
    if (!base && code.indexOf("_") > 0) {
      const i = code.indexOf("_");
      const b = code.slice(0, i), d = code.slice(i + 1);
      if (INDEX[b]) {
        base = INDEX[b];
        if (AVEC_PRODUIT.indexOf(b) >= 0) detail = "sélection / produit n° " + d;
        else if (AVEC_MDB.indexOf(b) >= 0) detail = "code MDB " + d;
        else if (SOUS_CODES[d]) detail = SOUS_CODES[d];
        else detail = "élément n° " + d;
      }
    }
    if (!base && /^E[A-O]{2}\d+$/.test(code) && INDEX[code.replace(/\d+$/, "")]) {
      base = INDEX[code.replace(/\d+$/, "")];          // ex. EOA1 = groupe froid n° 1
      detail = "groupe / élément n° " + code.match(/\d+$/)[0];
    }

    // Code FAS du type E45 (seul E45 a été observé ; les autres sont une hypothèse)
    if (!base && /^E\d{2}$/.test(code)) {
      const fasCode = code.slice(1);
      const f = fasDecrire(fasCode, OBSERVEES[code] ? OBSERVEES[code].sous : "");
      return {
        code, base: code, titre: f.titre, expl: f.expl, gravite: "p", famille: "Erreurs Power Lift (FAS)",
        source: "eva", connu: f.connu, solution: f.solution,
        observe: OBSERVEES[code]
          ? "Correspondance observée dans un relevé réel : " + code + " = erreur FAS " + OBSERVEES[code].fas + "/" + OBSERVEES[code].sous + " (non écrite dans le manuel)."
          : "Code propre à FAS, non défini par la norme EVA-DTS : lu comme l'erreur FAS " + fasCode + " par analogie avec E45 (hypothèse, à confirmer).",
        note: f.note || ""
      };
    }

    if (!base) {
      return { code, base: code, titre: "Code " + (code || "vide"), expl: "code non décrit par la norme EVA-DTS (annexe C) ni par le manuel Power Lift",
               gravite: "s", famille: "Inconnu", source: "eva", connu: false, solution: [], observe: null, note: "" };
    }

    const extra = {};
    if (detail) extra.expl = base.expl + " — " + detail;
    const obs = OBSERVEES[code];
    if (obs) {
      const f = fasDecrire(obs.fas, obs.sous);
      extra.solution = f.solution;
      extra.observe = "Correspondance observée dans un relevé réel : " + code + " = erreur FAS " + obs.fas + "/" + obs.sous +
                      " (« " + f.titre + " »), non écrite dans le manuel. Solution du manuel pour l'erreur " + obs.fas + ".";
    }
    return res(base, extra);
  }

  // Recherche dans tout le catalogue (code ou mot)
  function chercher(texte) {
    const t = String(texte || "").trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const ok = d => !t || norm(d.code).indexOf(t) >= 0 || norm(d.titre).indexOf(t) >= 0 || norm(d.expl).indexOf(t) >= 0 ||
                    (d.solution && norm(d.solution.join(" ")).indexOf(t) >= 0) ||
                    (d.observes && norm(d.observes.join(" ")).indexOf(t) >= 0);
    const fas = Object.keys(FAS).map(c => {
      const f = FAS[c];
      const observes = Object.keys(OBSERVEES).filter(k => OBSERVEES[k].fas === c);
      return { code: c, titre: f.titre, expl: f.expl, solution: f.solution, gravite: "p", note: f.note || "", observes,
               sous: Array.isArray(f.sous) ? f.sous.join(", ") : (f.sous === "sel" ? "n° de sélection" : "") };
    }).filter(d => ok(d) || (/^e?\d{2}$/.test(t) && d.code === t.replace(/^e/, "")));
    const groupes = GROUPES.map(g => ({ prefixe: g.prefixe, nom: g.nom, codes: g.codes.filter(ok) }))
                           .filter(g => g.codes.length);
    return { fas, groupes };
  }

  BA.Alertes = {
    FAS, SOUS_CODES, GROUPES, GRAVITES, OBSERVEES,
    decrire,
    fas: fasDecrire,
    chercher,
    gravite: g => GRAVITES[g] || GRAVITES.s,
    nombreCodes() {
      return { fas: Object.keys(FAS).length, eva: Object.keys(INDEX).length };
    }
  };

})();
