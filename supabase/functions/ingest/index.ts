// ============================================================
// Broodautomate — fonction « ingest » (v5.9) : reçoit les envois des boîtiers 4G (LILYGO)
// et envoie les NOTIFICATIONS (cloche de la page admin + appli Android).
// Supabase → Edge Functions → ingest → Code → remplacer TOUT le code par celui-ci → Deploy.
// « Verify JWT » (ou « Enforce JWT verification ») reste DÉSACTIVÉ : le boîtier
// s'identifie avec SA clé secrète (table devices), pas avec un compte.
//
// Ce que fait la fonction :
// 1. vérifie la clé du boîtier (seule son empreinte SHA-256 est dans la base) ;
// 2. note « vu à » et l'état du boîtier (signal, version, état de la lecture, porte) ;
// 3. garde le relevé EVA-DTS (s'il y en a un) dans la table device_reports ;
// 4. NOUVEAU : repère les NOUVEAUX événements du relevé (pannes, coupures, froid, produit épuisé…)
//    → table ba_notifications (cloche de la page) + notification sur les téléphones (Firebase) ;
// 5. NOUVEAU : appel {"veille":1} toutes les 15 min (tâche pg_cron) : boîtier muet depuis 2 h,
//    porte restée ouverte 15 min, notifications pas encore envoyées ;
// 6. répond {"ok":true,"t":<heure UTC>} : le boîtier se met à l'heure avec « t ».
// Broodautomate (PC ou téléphone) traite ensuite les relevés comme un relevé par câble.
//
// Notifications sur Android : secret « FCM_SERVICE_ACCOUNT » (Edge Functions → Secrets) =
// tout le contenu du fichier JSON « compte de service » de Firebase. Sans ce secret, la cloche
// de la page marche quand même ; seuls les téléphones ne sonnent pas.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

// Clé « secret » du projet : fournie par Supabase à la fonction (jamais écrite dans le code)
function cleServeur(): string {
  try {
    const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const k = o.default ?? Object.values(o)[0];
    if (typeof k === "string" && k) return k;
  } catch (_e) { /* ancienne clé ci-dessous */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", cleServeur(), { auth: { persistSession: false, autoRefreshToken: false } });

const reponse = (o: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
async function sha256(t: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const texte = (v: unknown, max: number) => (v == null ? "" : String(v)).slice(0, max);
const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ==== DÉBUT LOGIQUE PURE (testée hors Supabase) ====
// Textes des codes : repris du catalogue de la page Alertes (js/alertes.js), gravité p = panne, s = à surveiller, i = information
const CODES_EVA: Record<string, [string, string]> = {"EA":["Monnayeur : défaut non précisé","p"],"EAA":["Entrée des pièces bloquée","p"],"EAB":["Problème de rendu de la monnaie","p"],"EAC":["Fausses pièces détectées","s"],"EAD":["Validateur de pièces bloqué","p"],"EAE":["Trieur de pièces bloqué","p"],"EAF":["Distributeur de monnaie bloqué","p"],"EAG":["Rendeur de monnaie bloqué","p"],"EAH":["Goulotte de rejet bloquée","p"],"EAI":["Entrée de la caisse bloquée","p"],"EAJ":["Erreur de programmation du monnayeur","s"],"EAK":["Erreur de programmation de la matrice de prix","s"],"EAL":["Validateur de pièces en panne","p"],"EAM":["Trieur de pièces en panne","p"],"EAN":["Distributeur de monnaie en panne","p"],"EAO":["Carte électronique du monnayeur en panne","p"],"EAP":["Alimentation du monnayeur en panne","p"],"EAQ":["Afficheur de crédit en défaut","p"],"EAR":["Erreur de communication du monnayeur","p"],"EAS":["Pièce refusée","i"],"EAU":["Code d'erreur MDB du monnayeur","p"],"EA1A":["Cassette de pièces retirée","s"],"EAV":["Modification du monnayeur","i"],"EAW":["Aucun défaut trouvé (monnayeur)","i"],"EAX":["Défaut causé par un client (monnayeur)","s"],"EAY":["Défaut causé par le technicien (monnayeur)","s"],"EAZ":["Autre défaut du monnayeur","p"],"EB":["Gobelets : défaut non précisé","p"],"EBA":["Carrousel de gobelets en défaut","p"],"EBB":["Contact « pile vide » en défaut","p"],"EBC":["Détecteur de gobelet en défaut","p"],"EBD":["Séparateur de gobelets en défaut","p"],"EBE":["Les gobelets n'arrivent pas","p"],"EBF":["Anneau de gobelets défectueux","p"],"EBG":["Mauvais gobelets","s"],"EBH":["Croix de Malte en défaut","p"],"EBI":["Bras de gobelet en défaut","p"],"EBJ":["Plus de gobelets","s"],"EBK":["Transport des gobelets en défaut","p"],"EBM":["Moteur de chute des gobelets en défaut","p"],"EBN":["Moteur d'avance des gobelets en défaut","p"],"EBV":["Modification du système de gobelets","i"],"EBW":["Aucun défaut trouvé (gobelets)","i"],"EBX":["Défaut causé par un client (gobelets)","s"],"EBY":["Défaut causé par le technicien (gobelets)","s"],"EBZ":["Autre défaut du système de gobelets","p"],"EC":["Électronique : défaut non précisé","p"],"ECA":["Alimentation électrique hors tolérance","p"],"ECB":["Fusible ou protection déclenché","p"],"ECC":["Transformateur hors tolérance","p"],"ECD":["Carte de commande en défaut","p"],"ECE":["Carte relais / interface en défaut","p"],"ECF":["Défaut de câblage ou de connexion","p"],"ECG":["Cames de minuterie en défaut","p"],"ECH":["Capteur optique en défaut","p"],"ECI":["Contact de porte bloqué","p"],"ECJ":["Micro-interrupteur en défaut","p"],"ECK":["Élément électrique annexe en défaut","p"],"ECL":["Horloge en défaut","p"],"ECM":["Erreur de la mémoire du programme","p"],"ECN":["Erreur de la mémoire vive (RAM)","p"],"ECO":["Erreur de la mémoire permanente","p"],"ECP":["File des tâches pleine","p"],"ECQ":["Circuit de sortie en défaut","p"],"ECR":["Trop de redémarrages du processeur","p"],"ECS":["Carte de l'afficheur en défaut","p"],"ECT":["Relais en défaut","p"],"ECU":["Pile de sauvegarde faible","s"],"EC1A":["Sécurité électrique à vérifier","p"],"EC1B":["Panneau de sélection en défaut","p"],"EC1C":["Sonde de température en défaut","p"],"EC1D":["Plus de papier dans l'imprimante","s"],"EC1E":["Compteur de ventes en défaut","p"],"EC1F":["Carte de sélection en défaut","p"],"EC1G":["Carte de distribution des produits en défaut","p"],"ECV":["Modification du système de commande","i"],"ECW":["Aucun défaut trouvé (électronique)","i"],"ECX":["Défaut causé par un client (électronique)","s"],"ECY":["Défaut causé par le technicien (électronique)","s"],"ECZ":["Autre défaut du système de commande","p"],"ED":["Boissons chaudes : défaut non précisé","p"],"EDA":["Boîte d'ingrédient en défaut","p"],"EDB":["Vis de dosage d'ingrédient en défaut","p"],"EDC":["Dose d'ingrédient incorrecte","s"],"EDD":["Moteur du mélangeur en défaut","p"],"EDE":["Chambre du mélangeur défectueuse","p"],"EDF":["Tuyaux ou bols de mélange défectueux","p"],"EDH":["Buse d'ingrédient défectueuse","p"],"EDI":["Électrovanne de dosage en défaut","p"],"EDJ":["Ingrédient épuisé","s"],"EDK":["Chaudière en défaut","p"],"EDL":["Fusible de la résistance grillé","p"],"EDM":["Thermostat de la chaudière défectueux","p"],"EDN":["Sécurité de surchauffe déclenchée","p"],"EDO":["Calcaire dans la chaudière","s"],"EDP":["Contrôle de niveau de la chaudière défectueux","p"],"EDQ":["Trop-plein de la chaudière","p"],"EDR":["Joint de la résistance défectueux","p"],"EDS":["Chaudière endommagée","p"],"EDT":["Moulin à café en défaut","p"],"EDU":["Doseur de café défectueux","p"],"ED1A":["Tête de distribution en défaut","p"],"EDV":["Modification des boissons chaudes","i"],"EDW":["Aucun défaut trouvé (boissons chaudes)","i"],"EDX":["Défaut causé par un client (boissons chaudes)","s"],"EDY":["Défaut causé par le technicien (boissons chaudes)","s"],"EDZ":["Autre défaut des boissons chaudes","p"],"EE":["Infuseur : défaut non précisé","p"],"EEA":["Moteur de l'infuseur en défaut","p"],"EEB":["Moteur du racleur en défaut","p"],"EEC":["Plaque filtrante bouchée ou changée","s"],"EED":["Papier filtre absent ou défectueux","s"],"EEE":["Bras du racleur en défaut","p"],"EEF":["Chambre d'infusion endommagée","p"],"EEG":["Piston de l'infuseur endommagé","p"],"EEH":["Minuterie de l'infuseur en défaut","p"],"EEI":["Carte électronique de l'infuseur en défaut","p"],"EEJ":["Contact du racleur défectueux","p"],"EEK":["Entraînement de l'infuseur en défaut","p"],"EEL":["Fuite dans l'infuseur","p"],"EEV":["Modification de l'infuseur / expresso","i"],"EEW":["Aucun défaut trouvé (infuseur)","i"],"EEX":["Défaut causé par un client (infuseur)","s"],"EEY":["Défaut causé par le technicien (infuseur)","s"],"EEZ":["Autre défaut de l'infuseur / expresso","p"],"EF":["Circuit d'eau : défaut non précisé","p"],"EFA":["Tuyau d'arrivée d'eau en défaut","p"],"EFB":["Filtre à eau à changer","s"],"EFC":["Vanne d'arrivée d'eau défectueuse","p"],"EFD":["Clapet anti-retour en défaut","p"],"EFE":["Régulateur de pression d'eau défectueux","p"],"EFF":["Réservoir d'eau en défaut","p"],"EFG":["Détection du niveau d'eau en erreur","p"],"EFH":["Vanne de distribution défectueuse","p"],"EFI":["Vanne de distribution entartrée","s"],"EFJ":["Fuite d'eau","p"],"EFK":["Sondes de niveau d'eau en défaut","p"],"EFL":["Plus d'eau","p"],"EFM":["Collecteur d'eau en défaut","p"],"EFN":["Tête de pompe à eau défectueuse","p"],"EFO":["Moteur de la pompe à eau défectueux","p"],"EFP":["Problème de qualité de l'eau","s"],"EFV":["Modification du circuit d'eau","i"],"EFW":["Aucun défaut trouvé (circuit d'eau)","i"],"EFX":["Défaut causé par un client (circuit d'eau)","s"],"EFY":["Défaut causé par le technicien (circuit d'eau)","s"],"EFZ":["Autre défaut du circuit d'eau","p"],"EG":["Armoire / porte : défaut non précisé","p"],"EGA":["Meuble de la machine endommagé","p"],"EGB":["Pieds de la machine manquants ou abîmés","s"],"EGC":["Serrure de porte en défaut","p"],"EGD":["Autocollants abîmés ou incorrects","s"],"EGE":["Éclairage en panne","s"],"EGF":["Façade abîmée ou manquante","s"],"EGK":["Verrou de sélection","s"],"EGL":["Voyant","s"],"EGM":["Bac d'égouttage absent","s"],"EGN":["Bac à déchets plein","s"],"EGP":["Ventilateur d'extraction en panne","p"],"EGQ":["Conduit d'extraction absent ou bouché","p"],"EGR":["Moteur d'extraction en défaut","p"],"EGS":["Porte ouverte","i"],"EGT":["Porte fermée","i"],"EGU":["Porte ou trappe de distribution en défaut","p"],"EGV":["Modification de l'armoire / porte","i"],"EGW":["Aucun défaut trouvé (armoire / porte)","i"],"EGX":["Défaut causé par un client (armoire / porte)","s"],"EGY":["Défaut causé par le technicien (armoire / porte)","s"],"EGZ":["Autre défaut de l'armoire / porte","p"],"EH":["Boissons froides : défaut non précisé","p"],"EHC":["Réservoir du carbonateur en défaut","p"],"EHF":["Pompe à sirop défectueuse ou bouchée","p"],"EHG":["Vanne à sirop défectueuse ou bouchée","p"],"EHH":["Tuyau de sirop défectueux ou bouché","p"],"EHI":["Plus de sirop","s"],"EHJ":["Joint de sirop défectueux","p"],"EHK":["Bouteille de CO2 vide ou basse","s"],"EHL":["Pression de CO2 hors réglage","s"],"EHM":["Fuite de CO2 ou d'eau","p"],"EHN":["Tuyau de CO2 défectueux ou bouché","p"],"EHO":["Manomètre de CO2 incorrect","s"],"EHP":["Joint du manomètre de CO2 défectueux","p"],"EHT":["Bain d'eau glacée trop chaud ou gelé","p"],"EHU":["Moteur de l'agitateur du bain en panne","p"],"EH1A":["Thermostat du bain froid défectueux","p"],"EH1B":["Niveau d'eau du bain trop bas","s"],"EH1C":["Pompe à eau du carbonateur défectueuse","p"],"EH1K":["Électroaimant de la porte de la machine à glaçons","p"],"EH1L":["Contact de niveau de la machine à glaçons défectueux","p"],"EH1M":["Vis de la machine à glaçons bloquée","p"],"EH1N":["Vanne du carbonateur bouchée ou défectueuse","p"],"EH1O":["Capteurs de niveau du carbonateur défectueux","p"],"EH1P":["Capteurs de niveau de la coupelle défectueux","p"],"EH1Q":["Coupelle d'alimentation vide","s"],"EH1R":["Nettoyage du circuit d'eau défectueux","p"],"EHV":["Modification des boissons froides","i"],"EHW":["Aucun défaut trouvé (boissons froides)","i"],"EHX":["Défaut causé par un client (boissons froides)","s"],"EHY":["Défaut causé par le technicien (boissons froides)","s"],"EHZ":["Autre défaut des boissons froides","p"],"EI":["Communication : défaut non précisé","p"],"EIA":["Pas de modem ni de radio","p"],"EIB":["Ligne téléphonique en panne","p"],"EIC":["Batterie du module de communication faible","s"],"EID":["Erreur de communication du serveur distant","s"],"EIE":["Pas de réseau étendu (WAN)","s"],"EIF":["Pas de réseau local (LAN)","s"],"EIG":["Serveur distant occupé","s"],"EIH":["Communication refusée par le réseau","s"],"EII":["Communication refusée par le serveur","s"],"EIJ":["Passerelle de communication non enregistrée","s"],"EIK":["Communication peu fiable","s"],"EIL":["La machine ne répond pas à la passerelle","p"],"EIM":["Prise de données de la machine non détectée","p"],"EIN":["Signal radio faible","s"],"EIO":["Erreur de communication machine ↔ passerelle","p"],"EIV":["Modification de la communication","i"],"EIW":["Aucun défaut trouvé (communication)","i"],"EIX":["Défaut causé par un client (communication)","s"],"EIY":["Défaut causé par le technicien (communication)","s"],"EIZ":["Autre défaut de la communication","p"],"EJ":["Distribution : défaut non précisé","p"],"EJA":["Porte de distribution en erreur (ancien code)","p"],"EJB":["Moteur de distribution en erreur","p"],"EJC":["Spirale ou chaîne bloquée","p"],"EJD":["Étagère ou tiroir mal inséré","p"],"EJE":["Le tambour ne tourne pas correctement","p"],"EJF":["Moteur du tambour défectueux","p"],"EJG":["Trappe de retrait du produit en défaut","p"],"EJH":["Règles d'hygiène (température) dépassées","p"],"EJI":["Ventilateur défectueux","p"],"EJJ":["Froid insuffisant ou givrage","p"],"EJK":["Thermostat défectueux","p"],"EJL":["Détecteur de distribution en erreur","p"],"EJM":["Système de distribution en erreur (ascenseur, bras, tapis)","p"],"EJV":["Modifications faites sur la machine","i"],"EJW":["Aucun défaut trouvé","i"],"EJX":["Vandalisme ou fraude","s"],"EJY":["Entretien nécessaire","s"],"EJZ":["Autre défaut de distribution","p"],"EK":["Système sans espèces 1 : défaut non précisé","p"],"EKA":["Lecteur de carte défectueux","p"],"EKB":["Unité de contrôle du lecteur en erreur","p"],"EKC":["Carte électronique du lecteur en panne","p"],"EKD":["Alimentation du lecteur en panne","p"],"EKE":["Carte refusée","i"],"EKF":["Programmation du lecteur incorrecte","s"],"EKG":["Carte non programmée","i"],"EKH":["Carte expirée","i"],"EKI":["Carte bloquée","i"],"EKJ":["Carte sur liste noire","i"],"EKK":["Mémoire des transactions pleine","s"],"EKL":["Module de sécurité (SIM) défectueux","p"],"EKM":["Erreur de communication du lecteur","p"],"EKU":["Code d'erreur MDB du lecteur","p"],"EKV":["Modification du système sans espèces 1","i"],"EKW":["Aucun défaut trouvé (sans espèces 1)","i"],"EKX":["Défaut causé par un client (sans espèces 1)","s"],"EKY":["Défaut causé par le technicien (sans espèces 1)","s"],"EKZ":["Autre défaut du système sans espèces 1","p"],"EK2":["Système sans espèces 2 : défaut non précisé","p"],"EK2A":["Lecteur de carte 2 défectueux","p"],"EK2B":["Unité de contrôle du lecteur 2 en erreur","p"],"EK2C":["Carte électronique du lecteur 2 en panne","p"],"EK2D":["Alimentation du lecteur 2 en panne","p"],"EK2E":["Carte refusée (lecteur 2)","i"],"EK2F":["Programmation du lecteur 2 incorrecte","s"],"EK2G":["Carte non programmée (lecteur 2)","i"],"EK2H":["Carte expirée (lecteur 2)","i"],"EK2I":["Carte bloquée (lecteur 2)","i"],"EK2J":["Carte sur liste noire (lecteur 2)","i"],"EK2K":["Mémoire des transactions pleine (lecteur 2)","s"],"EK2L":["Module de sécurité (SIM) du lecteur 2 défectueux","p"],"EK2M":["Erreur de communication du lecteur 2","p"],"EK2U":["Code d'erreur MDB du lecteur 2","p"],"EK2V":["Modification du système sans espèces 2","i"],"EK2W":["Aucun défaut trouvé (sans espèces 2)","i"],"EK2X":["Défaut causé par un client (sans espèces 2)","s"],"EK2Y":["Défaut causé par le technicien (sans espèces 2)","s"],"EK2Z":["Autre défaut du système sans espèces 2","p"],"EL":["Produit : défaut non précisé","p"],"ELA":["Échec de distribution du produit","p"],"ELB":["Produit épuisé","s"],"ELC":["Quantité d'eau hors réglage","s"],"ELD":["Quantité de sirop hors réglage","s"],"ELE":["Produit au niveau bas","s"],"ELV":["Modification des produits","i"],"ELW":["Aucun défaut trouvé (produit)","i"],"ELX":["Défaut causé par un client (produit)","s"],"ELY":["Défaut causé par le technicien (produit)","s"],"ELZ":["Autre défaut des produits","p"],"EM":["Micro-ondes : défaut non précisé","p"],"EMA":["Contrôle d'émission effectué","i"],"EMB":["Magnétron défectueux","p"],"EMC":["Commande du micro-ondes défectueuse","p"],"EMV":["Modification du micro-ondes","i"],"EMW":["Aucun défaut trouvé (micro-ondes)","i"],"EMX":["Défaut causé par un client (micro-ondes)","s"],"EMY":["Défaut causé par le technicien (micro-ondes)","s"],"EMZ":["Autre défaut du micro-ondes","p"],"EN":["Lecteur de billets : défaut non précisé","p"],"ENA":["Entrée des billets bloquée","p"],"ENB":["Trop de fraudes détectées","s"],"ENC":["Validateur de billets bloqué","p"],"END":["Empileur de billets bloqué","p"],"ENE":["Caisse à billets pleine","s"],"ENF":["Caisse à billets retirée","s"],"ENG":["Validateur de billets en panne","p"],"ENH":["Empileur de billets en panne","p"],"ENI":["Carte du lecteur de billets en panne","p"],"ENJ":["Alimentation du lecteur de billets en panne","p"],"ENK":["Erreur de communication du lecteur de billets","p"],"ENU":["Code d'erreur MDB du lecteur de billets","p"],"ENV":["Modification du lecteur de billets","i"],"ENW":["Aucun défaut trouvé (lecteur de billets)","i"],"ENX":["Défaut causé par un client (lecteur de billets)","s"],"ENY":["Défaut causé par le technicien (lecteur de billets)","s"],"ENZ":["Autre défaut du lecteur de billets","p"],"EO":["Réfrigération : défaut non précisé","p"],"EOA":["Sonde de température défaillante","p"],"EOB":["Commande du compresseur en défaut","p"],"EOC":["Compresseur en défaut","p"],"EOD":["Relais de démarrage du compresseur défectueux","p"],"EOE":["Sécurité de surchauffe du compresseur en défaut","p"],"EOF":["Condensateur du compresseur défectueux","p"],"EOG":["Tube capillaire obstrué ou plié","p"],"EOH":["Condenseur encrassé ou qui fuit","p"],"EOI":["Ventilateur du condenseur en panne","p"],"EOJ":["Évaporateur encrassé, givré ou qui fuit","p"],"EOK":["Ventilateur de l'évaporateur en panne","p"],"EOL":["Détendeur défectueux","p"],"EOM":["Fuite de gaz réfrigérant","p"],"EON":["Commande du dégivrage en défaut","p"],"EOO":["Thermostat de fin de dégivrage défectueux","p"],"EOP":["Résistances de dégivrage défectueuses","p"],"EOQ":["Évacuation des condensats en défaut","p"],"EOV":["Modification de la réfrigération","i"],"EOW":["Aucun défaut trouvé (réfrigération)","i"],"EOX":["Défaut causé par un client (réfrigération)","s"],"EOY":["Défaut causé par le technicien (réfrigération)","s"],"EOZ":["Autre défaut de la réfrigération","p"],"OA":["Demande d'opération","i"],"OAA":["Maintenance","i"],"OAB":["Contrôle qualité","i"],"OAC":["Livraison de la machine","i"],"OAD":["Livraison et installation","i"],"OAE":["Installation de la machine","i"],"OAF":["Échange de la machine","i"],"OAG":["Reprise de la machine","i"],"OAH":["Déplacement de la machine","i"],"OAI":["Formation du personnel","i"],"OAJ":["Désinfection de la machine","i"],"OAK":["Changement du filtre à eau","i"],"OAL":["Changement de prix","i"],"OAM":["Recette ou dosage modifié","i"],"OAN":["Contrôle des doses","i"],"OAO":["Changement de bouteille de CO2","i"],"OAP":["Contrôle de perte","i"],"OAQ":["Dégraissage de l'infuseur","i"],"OAR":["Stérilisation","i"],"OAS":["Rapport aux autorités","i"],"OAT":["Changement de produit","i"],"OAU":["Début de promotion","i"],"OA1A":["Fin de promotion","i"],"OA1B":["Tous les produits remplis","i"],"OA1C":["Produit rempli","i"],"OAV":["Modification (opération)","i"],"OAW":["Aucun défaut trouvé (opération)","i"],"OAX":["Causé par un client (opération)","i"],"OAY":["Causé par le service (opération)","i"],"OAZ":["Autre demande d'opération","i"],"OB":["Problème lié au service","s"],"OBA":["Mauvais chargement","s"],"OBB":["Porte laissée ouverte","s"],"OBC":["Produit bas ou épuisé","s"],"OBD":["Gobelets bas ou épuisés","s"],"OBE":["Produit défectueux","s"],"OBF":["Gobelets défectueux","s"],"OBG":["CO2 bas ou épuisé","s"],"OBH":["Seau à déchets plein ou mal placé","s"],"OBI":["Tuyau d'eaux usées mal placé","s"],"OBJ":["Prix incorrect","s"],"OBK":["Monnaie absente ou incorrecte","s"],"OBL":["Montage incorrect","s"],"OBM":["Intervention demandée","s"],"OBN":["Conduit d'extraction bouché","s"],"OBO":["Caisse pleine","s"],"OBP":["Monnayeur sale","s"],"OBQ":["Tuyau bouché par la saleté","s"],"OBR":["Lecteur de billets sale","s"],"OBS":["Moyen de paiement refusé","s"],"OBT":["Refroidissement insuffisant","p"],"OBV":["Modification (service)","i"],"OBW":["Aucun défaut trouvé (service)","i"],"OBX":["Causé par un client (service)","s"],"OBY":["Causé par le service (service)","s"],"OBZ":["Autre action de service","s"],"OC":["Problème causé par un client","s"],"OCA":["Vol","p"],"OCB":["Vandalisme","p"],"OCC":["Fente à pièces bouchée","s"],"OCD":["Liquide renversé dans la machine","s"],"OCE":["Fente à billets bouchée","s"],"OCF":["Hors service à cause d'une coupure de courant","p"],"OCG":["Coupure d'eau","s"],"OCH":["Accès à la machine obstrué","s"],"OCI":["Tentatives de fraude","s"],"OCJ":["Réseau du client coupé","s"],"OCK":["Réseau de communication de l'exploitant coupé","s"],"OCL":["Moyen de paiement mal programmé","s"],"OCM":["Machine pas prête : panne du système","p"],"OCN":["Machine pas prête : erreur de configuration","p"],"OCV":["Modification (client)","i"],"OCW":["Aucun défaut trouvé (client)","i"],"OCX":["Causé par un client","s"],"OCY":["Causé par le service (client)","s"],"OCZ":["Autre problème causé par un client","s"],"OD":["Visite de retour","i"],"ODA":["Pièce montée","i"],"ODB":["Monnayeur remplacé","i"],"ODC":["Groupe froid remplacé","i"],"ODD":["Réparation après vandalisme","i"],"ODE":["Visite de relations publiques","i"],"ODF":["Contrôle d'un travail précédent","i"],"ODV":["Modification (visite)","i"],"ODW":["Aucun défaut trouvé (visite)","i"],"ODX":["Causé par un client (visite)","i"],"ODY":["Causé par le service (visite)","i"],"ODZ":["Autre visite","i"],"OE":["Historique de la machine","i"],"OEA":["Appel hors des heures de bureau","i"],"OEB":["Changement de configuration des pièces","i"],"OEV":["Modification (historique)","i"],"OEW":["Aucun défaut trouvé (historique)","i"],"OEX":["Causé par un client (historique)","i"],"OEY":["Causé par le service (historique)","i"],"OEZ":["Autre événement d'historique","i"],"OF":["Collecte d'argent","i"],"OFA":["Pièces vidées","i"],"OFB":["Billets vidés","i"],"OFC":["Données sans espèces transmises","i"],"OFD":["Tubes de monnaie vidés","i"],"OFV":["Modification (collecte)","i"],"OFW":["Aucun défaut trouvé (collecte)","i"],"OFX":["Causé par un client (collecte)","i"],"OFY":["Causé par le service (collecte)","i"],"OFZ":["Autre (collecte)","i"]};
const CODES_FAS: Record<string, string> = {"10":"Sonde de température intérieure défectueuse","11":"Sonde de l'évaporateur défectueuse","16":"Erreur de communication avec une carte","17":"Communication coupée pendant une vente (crédit pas encaissé)","18":"Communication coupée pendant une vente (crédit encaissé)","29":"Redémarrage d'une carte (périphérique)","30":"Sécurité frigo déclenchée","31":"Cellules photoélectriques en erreur après l'étalonnage","32":"Cellules photoélectriques en erreur pendant l'étalonnage","33":"Cellules photoélectriques débranchées pendant une vente","39":"Chariot de blocage de la cloison arrière de l'ascenseur","40":"Erreur de l'ascenseur","41":"Pas d'impulsions du codeur de l'ascenseur","42":"Surintensité du moteur de l'ascenseur","43":"Mauvais positionnement de l'ascenseur","44":"Délai de positionnement de l'ascenseur dépassé","45":"Ascenseur bloqué par un produit qui dépasse","46":"Mécanisme de verrouillage de la cloison arrière de l'ascenseur","47":"Trappe de prélèvement en erreur","48":"Fin de course haute atteinte","50":"Le lecteur sans espèces (MDB) ne répond pas","51":"Le lecteur de billets (MDB) ne répond pas","55":"Erreur du rendeur de monnaie","91":"Sélections hors service non rétablies","93":"Erreur de communication avec le dispositif de relevé des données","98":"Blocage inattendu du logiciel","01":"Moteur de spirale bloqué","02":"La spirale ne fait pas un tour complet","04":"Erreur générale d'un moteur de spirale","05":"Moteur de spirale débranché","09":"Micro-interrupteur ou câblage d'un moteur de spirale"};
const CODES_VUS: Record<string, { fas: string; sous: string }> = {"ECF_38":{"fas":"16","sous":"38"},"E45":{"fas":"45","sous":"54"},"EOA":{"fas":"10","sous":"38"}};
type Evenement = { cle: string; type: string; titre: string; texte: string };
type Lecture = { evs: Evenement[]; porte: boolean | null };

// Codes jamais notifiés : la porte a son propre suivi (alerte « porte restée ouverte 15 min »)
const SANS_NOTIF = new Set(["EGS", "EGT", "EGU"]);

function heureCourte(hhmm: string): string {
  const h = String(hhmm || "").replace(/\D/g, "");
  return h.length >= 4 ? " à " + h.slice(0, 2) + ":" + h.slice(2, 4) : "";
}

function libelle(code: string): [string, string] {
  if (CODES_EVA[code]) return CODES_EVA[code];
  const vu = CODES_VUS[code];
  if (vu && CODES_FAS[vu.fas]) return [CODES_FAS[vu.fas], "p"];
  const morceaux = code.split("_");
  const base = morceaux[0], suite = morceaux.slice(1).join("_");
  const fas = /^E(\d{2})$/.exec(base);
  if (fas && CODES_FAS[fas[1]]) return [CODES_FAS[fas[1]], "p"];
  const b = CODES_EVA[base];
  if (b) return [b[0] + (suite ? " (n° " + suite + ")" : ""), b[1]];
  const famille = CODES_EVA[code.slice(0, 2)];
  if (famille) return [famille[0] + " (" + code + ")", famille[1]];
  return ["Événement machine " + code, "s"];
}

// Lit un relevé EVA-DTS : événements à notifier + état de la porte (null = le relevé n'en dit rien)
function lireReleve(raw: string): Lecture {
  const evs: Evenement[] = [];
  let porte: boolean | null = null;
  const vus = new Set<string>();
  const datesEa1 = new Set<string>();
  const lignes = String(raw || "").split(/\r?\n/).map((l) => l.trim().split("*"));
  for (const f of lignes) {
    const seg = f[0], code = (f[1] || "").trim();
    if (seg === "EA1" && code) {
      if (code === "EGS") porte = true;
      else if (code === "EGT") porte = false;
      if (SANS_NOTIF.has(code)) continue;
      const [titre, grav] = libelle(code);
      if (grav === "i") continue;
      const cle = "EA1|" + code + "|" + (f[2] || "") + "|" + (f[3] || "");
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (/^E\d{2}/.test(code)) datesEa1.add((f[2] || "") + "|" + (f[3] || ""));
      evs.push({ cle, type: grav === "p" ? "panne" : "alerte", titre, texte: "Code " + code + heureCourte(f[3]) });
    } else if (seg === "EA2" && code === "EGS") {
      let actif = (f[5] || "").trim();
      if (actif === "" && /^[01]$/.test((f[4] || "").trim())) actif = (f[4] || "").trim();
      if (actif === "1") porte = true;
      else if (actif === "0") porte = false;
    } else if (seg === "MA5" && code === "ERROR") {
      const n = (f[4] || "").trim(), sous = (f[5] || "").trim();
      if (!n) continue;
      if (datesEa1.has((f[2] || "") + "|" + (f[3] || ""))) continue;   // même erreur déjà vue en « E45 »
      const cle = "MA5|" + (f[2] || "") + "|" + (f[3] || "") + "|" + n + "|" + sous;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const nn = n.padStart(2, "0");
      evs.push({ cle, type: "panne", titre: CODES_FAS[nn] || "Erreur machine " + n, texte: "Erreur " + n + (sous ? "/" + sous : "") + heureCourte(f[3]) });
    } else if (seg === "EA7") {
      const n = Number((f[1] || "").trim());
      if (!Number.isFinite(n) || n <= 0) continue;
      const cle = "EA7|" + n;
      if (vus.has(cle)) continue;
      vus.add(cle);
      evs.push({ cle, type: "coupure", titre: "Coupure de courant", texte: "La machine a redémarré après une coupure (" + n + " en tout)" });
    }
  }
  // les erreurs « MA5 » sont souvent écrites AVANT la ligne EA1 du même moment : 2e passage
  return { evs: evs.filter((e) => !(e.cle.startsWith("MA5|") && datesEa1.has(e.cle.split("|")[1] + "|" + e.cle.split("|")[2]))), porte };
}

// Une seule notification de téléphone pour plusieurs événements d'un coup
function resume(liste: { titre: string; texte: string }[]): { titre: string; texte: string } {
  if (liste.length === 1) return { titre: liste[0].titre, texte: liste[0].texte };
  const textes = liste.slice(0, 3).map((x) => x.titre).join(" · ");
  return { titre: "Broodautomate : " + liste.length + " alertes", texte: textes + (liste.length > 3 ? " …" : "") };
}

function b64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Jeton signé (RS256) demandé par Google pour envoyer des notifications Firebase
async function jwtGoogle(sa: { client_email: string; private_key: string }, maintenant: number): Promise<string> {
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const tete = enc({ alg: "RS256", typ: "JWT" });
  const corps = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: maintenant, exp: maintenant + 3600 });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cle = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(tete + "." + corps)));
  return tete + "." + corps + "." + b64url(sig);
}
// ==== FIN LOGIQUE PURE ====

// ---------- Notifications : table ba_notifications + téléphones (Firebase) ----------
const MUET_MS = 2 * 3600 * 1000;          // boîtier sans nouvelles depuis 2 h
const PORTE_MS = 15 * 60 * 1000;          // porte encore ouverte après 15 min
const RETRY_MS = 6 * 3600 * 1000;         // on réessaie d'envoyer pendant 6 h

type CompteFirebase = { client_email: string; private_key: string; project_id: string };
function compteFirebase(): CompteFirebase | null {
  try {
    const o = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "");
    if (o && o.client_email && o.private_key && o.project_id) return o;
  } catch (_e) { /* pas configuré */ }
  return null;
}
let acces: { t: string; fin: number } | null = null;
async function accesGoogle(sa: CompteFirebase): Promise<string> {
  if (acces && acces.fin > Date.now() + 60000) return acces.t;
  const jwt = await jwtGoogle(sa, Math.floor(Date.now() / 1000));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + jwt,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google : " + JSON.stringify(j).slice(0, 200));
  acces = { t: j.access_token, fin: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return acces.t;
}

// Envoie une notification à tous les téléphones des comptes admin. Rend true si au moins un l'a reçue.
async function pousser(titre: string, texte: string): Promise<boolean> {
  const sa = compteFirebase();
  if (!sa) return false;
  const { data: tels } = await admin.from("ba_push_tokens").select("token").eq("operateur", false);
  if (!tels || !tels.length) return false;
  const t = await accesGoogle(sa);
  let ok = false;
  for (const { token } of tels) {
    const r = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
      method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title: titre, body: texte },
        android: { priority: "HIGH", notification: { channel_id: "alertes", sound: "default" } }, data: { vue: "alerts" } } }),
    });
    if (r.ok) { ok = true; continue; }
    const err = await r.text();
    if (r.status === 404 || /UNREGISTERED/.test(err)) await admin.from("ba_push_tokens").delete().eq("token", token);   // téléphone désinstallé
    else console.error("Firebase", r.status, err.slice(0, 300));
  }
  return ok;
}

// Envoie ce qui attend (moins de 6 h), en une seule notification si plusieurs
async function envoyerEnAttente(): Promise<void> {
  const { data } = await admin.from("ba_notifications").select("id, titre, texte").is("envoye_at", null).eq("silencieux", false)
    .gt("cree_at", new Date(Date.now() - RETRY_MS).toISOString()).order("id").limit(20);
  if (!data || !data.length) return;
  const r = resume(data);
  if (await pousser(r.titre, r.texte)) await admin.from("ba_notifications").update({ envoye_at: new Date().toISOString() }).in("id", data.map((x) => x.id));
}

// deno-lint-ignore no-explicit-any
async function ajouter(lignes: any[]): Promise<number> {
  if (!lignes.length) return 0;
  const { data, error } = await admin.from("ba_notifications").upsert(lignes, { onConflict: "cle", ignoreDuplicates: true }).select("id");
  if (error) { console.error("ba_notifications", error.message); return 0; }
  return (data || []).length;
}

const nomDe = (d: { name?: string | null; machine_id?: string | null }) => (d.name || d.machine_id || "Boîtier").slice(0, 60);
const quand = (iso: string) => new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Nouveaux événements d'un relevé. Au tout premier relevé d'un boîtier, l'ancien journal de la machine
// est seulement « noté comme vu » (silencieux) : pas de pluie de notifications pour de vieilles pannes.
// deno-lint-ignore no-explicit-any
async function notifierReleve(boitier: any, evs: Evenement[]): Promise<void> {
  if (!evs.length) return;
  const { count } = await admin.from("ba_notifications").select("id", { count: "exact", head: true }).eq("device_id", boitier.id);
  const premier = !count;
  const n = await ajouter(evs.map((e) => ({ cle: boitier.id + "|" + e.cle, device_id: boitier.id, machine_id: boitier.machine_id, type: e.type,
    titre: nomDe(boitier) + " : " + e.titre, texte: e.texte, silencieux: premier })));
  if (n && !premier) console.log("nouveaux événements", n);
}

// Toutes les 15 min (pg_cron) : boîtiers muets, portes restées ouvertes, envois en retard
async function veille(): Promise<void> {
  const maintenant = Date.now();
  const { data: boitiers } = await admin.from("devices").select("id, name, machine_id, last_seen, info");
  // deno-lint-ignore no-explicit-any
  const lignes: any[] = [];
  for (const d of boitiers || []) {
    const vu = d.last_seen ? Date.parse(d.last_seen) : 0;
    if (vu && maintenant - vu > MUET_MS && maintenant - vu < 7 * 86400000)
      lignes.push({ cle: "muet|" + d.id + "|" + d.last_seen, device_id: d.id, machine_id: d.machine_id, type: "muet",
        titre: nomDe(d) + " : boîtier muet", texte: "Aucune nouvelle depuis le " + quand(d.last_seen) + " (courant, 4G ou antenne ?)" });
    const p = d.info && d.info.porte;
    if (p && p.ouverte && !p.alerte && p.depuis && maintenant - Date.parse(p.depuis) > PORTE_MS) {
      lignes.push({ cle: "porte|" + d.id + "|" + p.depuis, device_id: d.id, machine_id: d.machine_id, type: "porte",
        titre: nomDe(d) + " : porte ouverte depuis plus de 15 min", texte: "Ouverte depuis le " + quand(p.depuis) });
      await admin.from("devices").update({ info: Object.assign({}, d.info, { porte: Object.assign({}, p, { alerte: true }) }) }).eq("id", d.id);
    }
  }
  await ajouter(lignes);
  await envoyerEnAttente();
}

Deno.serve(async (req: Request) => {
  const t = Math.floor(Date.now() / 1000);
  if (req.method !== "POST") return reponse({ ok: false, error: "POST seulement", t }, 405);
  const brut = await req.text();
  if (brut.length > 200000) return reponse({ ok: false, error: "envoi trop gros", t }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = JSON.parse(brut); } catch (_e) { return reponse({ ok: false, error: "JSON invalide", t }, 400); }
  if (b && b.veille) {                                   // appel de la tâche pg_cron (pas de clé : ne fait que vérifier et envoyer)
    try { await veille(); } catch (e) { console.error("veille", e); return reponse({ ok: false, error: String(e).slice(0, 200), t }, 500); }
    return reponse({ ok: true, t });
  }
  if (!b || typeof b.k !== "string" || b.k.length < 16 || b.k.length > 128) return reponse({ ok: false, error: "clé absente", t }, 401);

  const { data: boitier, error: e1 } = await admin.from("devices").select("id, machine_id, name, last_seen, info").eq("key_hash", await sha256(b.k)).maybeSingle();
  if (e1) return reponse({ ok: false, error: "base de données : " + e1.message, t }, 500);
  if (!boitier) return reponse({ ok: false, error: "clé inconnue", t }, 401);

  let raw = "";
  if (typeof b.raw === "string" && b.raw.length > 0) {
    raw = b.raw.replace(/\u0000/g, "?");
    // un relevé EVA-DTS complet commence par DXS et contient DXE
    if (!/^\s*DXS/.test(raw) || raw.indexOf("DXE") < 0) return reponse({ ok: false, error: "relevé incomplet", t }, 400);
  }
  let lecture: Lecture = { evs: [], porte: null };
  try { if (raw) lecture = lireReleve(raw); } catch (e) { console.error("lecture", e); }

  // porte : on garde l'état d'avant si le relevé n'en parle pas
  const avant = (boitier.info && boitier.info.porte) || null;
  let porte = avant;
  if (lecture.porte === true && !(avant && avant.ouverte)) porte = { ouverte: true, depuis: new Date().toISOString(), alerte: false };
  else if (lecture.porte === false) porte = { ouverte: false, depuis: new Date().toISOString(), alerte: false };

  const info = {
    fw: texte(b.fw, 20), mode: nombre(b.mode), seq: nombre(b.seq), up: nombre(b.up), rssi: nombre(b.rssi),
    op: texte(b.op, 40), st: texte(b.st, 240), stok: b.stok === true, lok: nombre(b.lok),
    hb: nombre(b.hb), rd: nombre(b.rd), lu: nombre(b.lu), ko: nombre(b.ko), premier: b.premier === true, porte,
  };
  const { error: e2 } = await admin.from("devices").update({ last_seen: new Date().toISOString(), info }).eq("id", boitier.id);
  if (e2) return reponse({ ok: false, error: "mise à jour : " + e2.message, t }, 500);

  if (raw) {
    const ligne: Record<string, unknown> = { device_id: boitier.id, machine_id: boitier.machine_id, raw, role: b.role === "machine" ? "machine" : "boitier" };
    let { error: e3 } = await admin.from("device_reports").insert(ligne);
    if (e3 && /role/i.test(e3.message)) {               // table créée avant la colonne « role »
      delete ligne.role;
      ({ error: e3 } = await admin.from("device_reports").insert(ligne));
    }
    if (e3) return reponse({ ok: false, error: "enregistrement : " + e3.message, t }, 500);
  }

  // Notifications : jamais une raison de refuser l'envoi du boîtier (si la table n'existe pas encore, on continue)
  try {
    await notifierReleve(boitier, lecture.evs);
    if (avant && avant.ouverte && avant.alerte && porte && !porte.ouverte)
      await ajouter([{ cle: "porte-fermee|" + boitier.id + "|" + avant.depuis, device_id: boitier.id, machine_id: boitier.machine_id, type: "info",
        titre: nomDe(boitier) + " : porte refermée", texte: "Elle était ouverte depuis le " + quand(avant.depuis) }]);
    const vu = boitier.last_seen ? Date.parse(boitier.last_seen) : 0;
    if (vu && Date.now() - vu > MUET_MS) {
      const { count } = await admin.from("ba_notifications").select("id", { count: "exact", head: true }).eq("cle", "muet|" + boitier.id + "|" + boitier.last_seen);
      if (count) await ajouter([{ cle: "retour|" + boitier.id + "|" + boitier.last_seen, device_id: boitier.id, machine_id: boitier.machine_id, type: "info",
        titre: nomDe(boitier) + " : boîtier de nouveau en ligne", texte: "Muet depuis le " + quand(boitier.last_seen) }]);
    }
    await envoyerEnAttente();
  } catch (e) { console.error("notifications", e); }
  return reponse({ ok: true, t });
});
