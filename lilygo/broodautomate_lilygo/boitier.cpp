// ============================================================
// BROODAUTOMATE — Boîtier 4G LILYGO T-A7670E (programme principal, v1.6)
// Lit la machine FAS en RS232 (lecture seule, comme le câble de Broodautomate) et envoie
// les relevés à Supabase par la 4G (HTTPS).
//   • v1.6 : MODE 3 = essai d'une machine ancienne (FAS 480 TOP, logiciel 1.x, sans DEX) : sans 4G, le boîtier écoute
//     la machine, allume / coupe la broche 7 de sa prise (4e fil) pour voir si elle envoie toute seule, essaie DEX et
//     DDCMP (lecture seule), attend l'appui sur le bouton d'envoi de la carte mère et affiche tout ce qui arrive + un bilan.
//     Les modes 0, 1 et 2 ne changent pas.
//   • v1.5 : carte 1NCE (ECOUTE_UDP 1) : le boîtier écoute un port UDP ; le Device Controller de 1NCE lui envoie « lire »
//     → lecture et envoi tout de suite (« Lire maintenant » instantané). Sans ECOUTE_UDP (Digi…) : tout est comme en v1.4.
//   • v1.4 : UN SEUL programme pour deux familles de machines, reconnues toutes seules au branchement :
//     Power Lift (EVA-DTS DDCMP) et FAS 480/5 (DEX-UCS, commande 90 = 6 sortie RS232). Rien à choisir.
//     Une 480 ne prévient pas quand elle vend : le boîtier la lit toutes les DEX_LECTURE_SEC secondes sur le
//     câble (gratuit) et n'envoie en 4G que ce qui a changé (vente, erreur nouvelle), en relevé allégé.
//   • v1.3 : surveillance des ventes : lecture de la machine toutes les SURVEILLE_VENTES_SEC secondes sur le câble
//     (gratuit) ; un relevé n'est envoyé que s'il y a du nouveau (vente, porte, erreur), sinon au moins
//     toutes les READ_EVERY_MIN minutes (températures) ;
//   • v1.3 : le relevé est allégé avant l'envoi (filtre.h : seulement les lignes utilisées par Broodautomate) ;
//   • la machine peut envoyer elle-même (télémétrie = 1 : vente, porte…) : son envoi
//     part tout de suite, puis le boîtier relit la machine pour mettre les ventes à jour ;
//   • bouton « Lire maintenant » de Broodautomate : toutes les DEMANDE_EVERY_SEC
//     secondes, le boîtier demande à Supabase s'il y a une demande de lecture.
// Réglages : config.h (le seul fichier à modifier).
// ============================================================
#include <Arduino.h>
#include <deque>
#include <string>
#include "config.h"
#include "ddcmp_moteur.h"
#include "horloge.h"
#include "envoi.h"
#include "filtre.h"
#include "dex_moteur.h"
#include "modem.h"

#define FW_VERSION "1.6"

// v1.3 : si ton config.h date d'avant la v1.3 (il n'a pas cette ligne), la valeur par défaut est prise : tu peux garder ton config.h tel quel
#ifndef SURVEILLE_VENTES_SEC
#define SURVEILLE_VENTES_SEC 30
#endif

// v1.4 : réglages ajoutés (si ton config.h date d'avant la v1.4, ces valeurs par défaut sont prises)
#ifndef PROTOCOLE
#define PROTOCOLE 0              // 0 = reconnaissance automatique (conseillé), 1 = Power Lift, 2 = FAS 480 (DEX)
#endif
#ifndef DEX_LECTURE_SEC
#define DEX_LECTURE_SEC 300      // FAS 480 : lecture de la machine toutes les N secondes sur le câble (gratuit)
#endif
#ifndef DEX_RECAP_MIN
#define DEX_RECAP_MIN 120        // FAS 480 : relevé de contrôle envoyé au moins toutes les N minutes même sans changement
#endif

// v1.5 : carte 1NCE : le boîtier écoute un port UDP (« Lire maintenant » instantané via le Device Controller de 1NCE).
// Si ton config.h date d'avant la v1.5, ces valeurs par défaut sont prises : pas d'écoute, tout marche comme la v1.4.
#ifndef ECOUTE_UDP
#define ECOUTE_UDP 0             // 1 = écoute UDP (carte 1NCE) ; 0 = comme avant (Digi, Proximus…)
#endif
#ifndef UDP_PORT_ECOUTE
#define UDP_PORT_ECOUTE 3000     // port UDP écouté par le boîtier (à indiquer dans le Device Controller de 1NCE)
#endif
#ifndef UDP_VIVANT_MIN
#define UDP_VIVANT_MIN 0         // petit message « vivant » vers 1NCE toutes les N minutes (0 = jamais : le signal de vie HTTPS suffit)
#endif

// v1.6 : MODE 3 (machine ancienne) : broche de l'ESP32 reliée par un 4e fil à la broche 7 (DTR) de la prise de la machine.
// Si ton config.h date d'avant la v1.6, cette valeur est prise. -1 = pas de 4e fil.
#ifndef BROCHE7_PIN
#define BROCHE7_PIN 21
#endif
#ifndef BROCHE7_PIN_BIS
#define BROCHE7_PIN_BIS 22       // même rôle (le 4e fil peut aller sur l'une ou l'autre) ; -1 = pas utilisée
#endif

using namespace ba;

static HardwareSerial ModemSerial(1);
static HardwareSerial MachineSerial(2);
static Modem modem(ModemSerial);

// ---------------- Heure (UTC, gardée par millis() entre deux mises à l'heure) ----------------
static bool horlogeOk = false;
static uint32_t utcBase = 0, msBase = 0, derniereSynchro = 0, dernierEssaiHeure = 0;
static uint32_t utcMaintenant() { return utcBase + (millis() - msBase) / 1000; }
static void reglerHeure(uint32_t utc, const char* source) {
  if (!horloge::plausible(utc)) return;
  bool premier = !horlogeOk;
  int32_t ecart = horlogeOk ? (int32_t)(utc - utcMaintenant()) : 0;
  utcBase = utc; msBase = millis(); horlogeOk = true; derniereSynchro = millis();
  if (premier || ecart > 60 || ecart < -60) {
    HeureLocale h = horloge::bruxelles(utc);
    Serial.printf("[Heure] %02u/%02u/20%02u %02u:%02u:%02u (heure belge, source : %s)\n", h.jour, h.mois, h.annee2, h.heure, h.minute, h.seconde, source);
  }
}

// ---------------- État ----------------
// no : numéro du relevé dans la file ; dem : n° de la demande « Lire maintenant » à laquelle il répond (0 = lecture ordinaire)
struct Releve { std::string texte; bool machineMaitre; uint8_t liste; uint32_t dem; uint32_t no; };
static std::deque<Releve> file;
static uint32_t numeroReleve = 0;
static size_t octetsEnFile = 0;
static bool premierEnvoi = true, empreinteConnue = false;
static uint32_t derniereEmpreinte = 0;
static String statut = "démarrage";
static bool statutOk = false;              // dernière lecture de la machine réussie
static String dernierStatutEnvoye = "";
static uint32_t nbLectures = 0, nbEchecs = 0, nbEnvois = 0, nbEnvoisRates = 0, seq = 0;
static uint32_t derniereLecture = 0, dernierEnvoiOk = 0, prochainEssaiEnvoi = 0, dernierEssaiReseau = 0;
static uint32_t delaiReseau = 0, echecsSuite = 0, dernierPing = 0;
static bool lectureDemandee = true;       // première lecture dès que l'heure est connue
static uint32_t utcDerniereLectureOk = 0;
// Bouton « Lire maintenant » de Broodautomate
static uint32_t demandeId = 0;            // demande reçue, lecture pas encore lancée ou en cours
static uint32_t lectureDem = 0;           // demande à laquelle répond la lecture en cours
static bool demandeBrutOn = false, lectureBrut = false;   // v1.3 : onglet « Flux brut » : relevé complet, sans filtre
static uint32_t demandeFaite = 0;         // demande terminée, résultat pas encore annoncé à Supabase
// v1.5 : « lire » reçu en UDP (Device Controller de 1NCE) : lecture tout de suite, relevé envoyé même sans changement
static bool udpLire = false;              // reçu, lecture pas encore lancée
static bool lectureForcee = false;        // la lecture en cours répond à « lire »
// v1.2 : délai réglé à distance dans Broodautomate (admin → Boîtiers 4G : 15 min, 30 min ou 1 h),
// reçu à chaque passage chez ba_boitier (« ec » en secondes). Tant que rien n'est réglé : DEMANDE_EVERY_SEC.
static uint32_t ecouteSec = DEMANDE_EVERY_SEC;
static bool demandeOk = true;
static String demandeMsg = "";
static uint32_t prochaineDemande = 0, demandesRatees = 0;
// Envoi fait par la machine (télémétrie) : lecture de contrôle juste après
static uint32_t lireApres = 0, envoiMachineA = 0, finDerniereLecture = 0;
// v1.3 : surveillance des ventes
static uint32_t echecsSurveillance = 0;   // lectures de surveillance ratées de suite (machine dans son menu, éteinte…)
static uint32_t dernierReleveEnFile = 0;  // moment du dernier relevé de contrôle mis dans la file
static std::string temperatureVue;        // clé « AAMMJJhhmm » de la dernière température envoyée
// v1.4 : protocole de la machine branchée
enum { PROTO_INCONNU = 0, PROTO_DDCMP = 1, PROTO_DEX = 2 };
static int proto = PROTO_DDCMP;
static filtre::ContexteDex ctxDex;        // FAS 480 : erreurs déjà vues
static uint32_t derniereSonde = 0;

// ---------------- Liaison avec la machine (UART 2 → module MAX3232) ----------------
struct MachineIo : MoteurDdcmp::Io {
  int available() override { return MachineSerial.available(); }
  int read() override { return MachineSerial.read(); }
  void write(const uint8_t* b, size_t n) override { MachineSerial.write(b, n); MachineSerial.flush(); }
  uint32_t ms() override { return millis(); }
  void wait(uint32_t m) override { delay(m); }
};
static void ajouterReleve(const std::string& texte, bool machineMaitre, int liste, uint32_t dem, bool brut = false);
static void empiler(const std::string& aEnvoyer, bool machineMaitre, int liste, uint32_t dem);
static void demandeTerminee(uint32_t d, bool ok, const String& msg);
static bool demandeEnFile(uint32_t d) { for (auto& r : file) if (r.dem == d) return true; return false; }

struct Ecoute : MoteurDdcmp::Ecouteur {
  void journal(const std::string& t, char n) override {
    if (!DETAILS_DDCMP && (n == 't' || n == 'r')) return;
    Serial.print("[RS232] "); Serial.println(t.c_str());
  }
  void brut(bool envoi, const uint8_t* o, size_t n) override {
#if DETAILS_DDCMP
    Serial.print(envoi ? "[RS232]    → " : "[RS232]    ← "); Serial.println(ddcmp::hex(o, n, 24).c_str());
#endif
  }
  void rapport(const std::string& texte, bool machineMaitre, int liste, const std::string& serie) override {
    ajouterReleve(texte, machineMaitre, liste, machineMaitre ? 0 : lectureDem, !machineMaitre && lectureDem && lectureBrut);
    // La machine a envoyé d'elle-même (vente, porte, erreur…) : relire ses compteurs juste après,
    // sauf si cet envoi suit de près notre propre lecture (il en est sans doute la conséquence)
    if (machineMaitre && LIRE_APRES_ENVOI_MACHINE && MODE == 0) {
      if (finDerniereLecture && millis() - finDerniereLecture < 20000UL)
        Serial.println(F("[RS232] (envoi de la machine juste après notre lecture : pas de nouvelle lecture)"));
      else { lireApres = millis() + 5000UL; envoiMachineA = millis(); }
    }
  }
  void etat(const char* t) override {}
  void lectureFinie(bool ok, bool cede, const std::string& erreur) override {
    finDerniereLecture = millis();
    bool surveillance = !lectureDem;      // lecture automatique (pas celle du bouton « Lire maintenant »)
    if (ok) {
      echecsSurveillance = 0;
      statut = "ok"; statutOk = true; utcDerniereLectureOk = horlogeOk ? utcMaintenant() : 0;
      // cette lecture a commencé après l'envoi de la machine : ses compteurs sont déjà à jour
      if (lireApres && (int32_t)(derniereLecture - envoiMachineA) >= 0) lireApres = 0;
    } else if (surveillance && SURVEILLE_VENTES_SEC > 0 && echecsSurveillance < 2) {
      // la machine peut être dans son menu quelques minutes : on ne le signale qu'à la 3e lecture ratée de suite
      echecsSurveillance++;
      Serial.println("[RS232] (surveillance : la machine n'a pas répondu, nouvel essai plus tard)");
    } else {
      if (!surveillance || echecsSurveillance == 2) nbEchecs++;
      if (surveillance) echecsSurveillance++;
      statutOk = false;
      statut = String(erreur.c_str());
      Serial.println("[RS232] ✖ Lecture impossible : " + statut);
    }
    // Lecture demandée par Broodautomate : si aucun relevé n'attend d'être envoyé pour elle,
    // le résultat (échec) est annoncé tout de suite ; sinon il le sera après l'envoi du relevé
    uint32_t d = lectureDem; lectureDem = 0;
    if (d && !demandeEnFile(d)) demandeTerminee(d, false, ok ? String("relevé reçu incomplet") : statut);
    if (lectureForcee) { lectureForcee = false; Serial.println(ok ? F("[UDP] Lecture demandée par « lire » terminée : le relevé part tout de suite.") : F("[UDP] ✖ Lecture demandée par « lire » impossible (voir ci-dessus).")); }
  }
  bool heure(HeureLocale& h) override {
    if (!horlogeOk) return false;
    h = horloge::bruxelles(utcMaintenant());
    return true;
  }
};
static MachineIo machineIo;
static Ecoute ecoute;
static MoteurDdcmp::Reglages reglagesDdcmp() { MoteurDdcmp::Reglages r; r.identifiantPc = "00000001"; r.utilisateur = "BA"; return r; }
static MoteurDdcmp moteur(machineIo, ecoute, reglagesDdcmp());
// En DEX, c'est le boîtier qui interroge la machine : le moteur DDCMP ne doit pas lire les octets à sa place
static void pompe() { if (MODE != 3 && proto != PROTO_DEX) moteur.poll(); }   // v1.6 : en MODE 3, l'essai lit lui-même

// Relevé reçu : gardé pour l'envoi (les relevés de contrôle identiques au précédent ne sont pas renvoyés,
// sauf celui d'une lecture demandée avec « Lire maintenant » : Broodautomate attend sa réponse)
static void ajouterReleve(const std::string& texte, bool machineMaitre, int liste, uint32_t dem, bool brut) {
  if (!envoi::releveComplet(texte)) { Serial.println(F("[Relevé] Texte reçu incomplet (sans DXS … DXE) : ignoré.")); return; }
  std::string aEnvoyer = texte;
  if (machineMaitre) {
    // v1.3 : un envoi de la machine identique au précédent (même événement, même minute) n'est pas renvoyé :
    // sans cela, une machine qui répète son message après chacune de nos lectures ferait une rafale d'envois 4G
    static bool machineVue = false; static uint32_t derniereMachine = 0;
    uint32_t e = envoi::empreinte(texte);
    if (machineVue && e == derniereMachine) { Serial.println(F("[Relevé] Envoi de la machine déjà reçu à l'identique : ignoré.")); return; }
    machineVue = true; derniereMachine = e;
  } else {
    uint32_t e = envoi::empreinte(texte);
    bool pareil = empreinteConnue && e == derniereEmpreinte;
    // relevé de contrôle au moins toutes les READ_EVERY_MIN minutes, même sans changement (températures)
    bool recap = READ_EVERY_MIN > 0 && (!dernierReleveEnFile || millis() - dernierReleveEnFile >= (uint32_t)READ_EVERY_MIN * 60000UL);
    derniereEmpreinte = e; empreinteConnue = true;
    if (pareil && !dem && !recap && !lectureForcee) { if (SURVEILLE_VENTES_SEC <= 0) Serial.println(F("[Relevé] Aucun changement depuis le relevé précédent : rien à envoyer.")); return; }
    dernierReleveEnFile = millis(); if (!dernierReleveEnFile) dernierReleveEnFile = 1;
    // v1.3 : on n'envoie que les lignes utiles (la data 4G se paie à l'octet)
    // (demande « Flux brut » de Broodautomate : le relevé part complet, tel que la machine l'a donné)
    if (!brut) aEnvoyer = filtre::alleger(texte, temperatureVue);
    if (aEnvoyer.size() < texte.size()) Serial.printf("[Relevé] Allégé : %u → %u octets.\n", (unsigned)texte.size(), (unsigned)aEnvoyer.size());
  }
  empiler(aEnvoyer, machineMaitre, liste, dem);
}
static void empiler(const std::string& aEnvoyer, bool machineMaitre, int liste, uint32_t dem) {
  // place limitée : on enlève d'abord les anciens relevés de contrôle (le suivant contient les mêmes compteurs)
  while (file.size() >= 8 || octetsEnFile + aEnvoyer.size() > 65000) {
    auto it = file.begin();
    while (it != file.end() && (it->machineMaitre || it->dem)) ++it;
    if (it == file.end()) it = file.begin();
    if (it == file.end()) break;
    octetsEnFile -= it->texte.size();
    file.erase(it);
  }
  file.push_back({aEnvoyer, machineMaitre, (uint8_t)liste, dem, ++numeroReleve});
  octetsEnFile += aEnvoyer.size();
  Serial.printf("[Relevé] %u octets %s → à envoyer (%u en attente).\n", (unsigned)aEnvoyer.size(), machineMaitre ? "envoyés par la machine" : dem ? "lus à la demande de Broodautomate" : "lus (liste 2)", (unsigned)file.size());
}

// ---------------- v1.4 : FAS 480 (DEX) ----------------
// Relevé DEX lu : ne part en 4G que s'il y a du nouveau (vente, erreur), sinon au moins toutes les DEX_RECAP_MIN minutes.
// Le relevé de la 480 fait ~3 Ko : il est allégé (filtre.h) avant l'envoi.
static void ajouterReleveDex(const std::string& texte, uint32_t dem, bool brut) {
  uint32_t e = filtre::empreinteDex(texte);
  bool pareil = empreinteConnue && e == derniereEmpreinte;
  bool recap = DEX_RECAP_MIN > 0 && (!dernierReleveEnFile || millis() - dernierReleveEnFile >= (uint32_t)DEX_RECAP_MIN * 60000UL);
  derniereEmpreinte = e; empreinteConnue = true;
  if (pareil && !dem && !recap && !lectureForcee) return;     // rien de nouveau : rien à envoyer
  dernierReleveEnFile = millis(); if (!dernierReleveEnFile) dernierReleveEnFile = 1;
  std::string a = brut ? texte : filtre::allegerDex(texte, ctxDex);
  if (a.size() < texte.size()) Serial.printf("[Relevé] Allégé : %u → %u octets.\n", (unsigned)texte.size(), (unsigned)a.size());
  empiler(a, false, 2, dem);
}
// Lecture complète de la machine en DEX (quelques secondes, le boîtier ne fait rien d'autre pendant ce temps)
static void lireDex() {
  dex::Lecteur<MachineIo> lecteur(machineIo);
  std::string texte;
  bool ok = lecteur.lire(texte);
  if (ok) ajouterReleveDex(texte, lectureDem, lectureDem && lectureBrut);
  ecoute.lectureFinie(ok, false, lecteur.erreur);
}
// Reconnaissance automatique : une machine DEX répond DLE 0 (10 30) à un ENQ (05) ; une Power Lift ne répond pas.
static void choisirProtocole(const char* quand) {
  derniereSonde = millis(); if (!derniereSonde) derniereSonde = 1;
  if (PROTOCOLE == 1) { proto = PROTO_DDCMP; return; }
  if (PROTOCOLE == 2) { proto = PROTO_DEX; return; }
  dex::Lecteur<MachineIo> lecteur(machineIo);
  int avant = proto;
  proto = lecteur.sonde() ? PROTO_DEX : PROTO_DDCMP;
  if (proto != avant || !strcmp(quand, "démarrage"))
    Serial.printf("[RS232] Reconnaissance (%s) : machine %s.\n", quand, proto == PROTO_DEX ? "FAS 480 (DEX-UCS)" : "Power Lift (EVA-DTS DDCMP)");
}

// ---------------- Bouton « Lire maintenant » ----------------
// Résultat d'une demande : annoncé à Supabase au prochain passage (tout de suite)
static void demandeTerminee(uint32_t d, bool ok, const String& msg) {
  demandeFaite = d; demandeOk = ok;
  demandeMsg = msg.length() > 200 ? msg.substring(0, 200) : msg;
  if (demandeId == d) demandeId = 0;
  prochaineDemande = millis();
  if (ok) Serial.printf("[Demande] ✔ Lecture n°%u faite et envoyée.\n", (unsigned)d);
  else Serial.printf("[Demande] ✖ Lecture n°%u impossible : %s\n", (unsigned)d, demandeMsg.c_str());
}
static void nouvelleDemande(uint32_t d, bool brut) {
  if (d == demandeId || d == lectureDem) return;            // déjà en cours
  Serial.printf("[Demande] Broodautomate demande une lecture maintenant (n°%u%s).\n", (unsigned)d, brut ? ", flux brut complet" : "");
  if (MODE != 0) { demandeTerminee(d, false, "boîtier en mode essai : il ne lit pas la machine"); return; }
  demandeId = d; demandeBrutOn = brut;
  lectureDemandee = true;
}
// Passage chez Supabase (fonction ba_boitier de la base) : annonce le résultat de la demande terminée,
// et reçoit la demande en attente s'il y en a une. Réponse : {"ok" : true, "t" : 1793330340, "dem" : 12}
static bool demander() {
  std::string b;
  b.reserve(192);
  b += "{\"k\":"; envoi::json(b, DEVICE_KEY);
  b += ",\"fait\":" + std::to_string(demandeFaite);
  b += std::string(",\"ok\":") + (demandeOk ? "true" : "false");
  b += ",\"msg\":"; envoi::json(b, demandeMsg.c_str());
  b += "}";
  std::string rep;
  int code = modem.post(b, rep, DEMANDE_URL, "apikey: " SUPABASE_KEY);
  uint32_t t;
  if (envoi::lireNombre(rep, "t", t) && (!horlogeOk || millis() - derniereSynchro > 3600000UL)) reglerHeure(t, "serveur Supabase");
  if (code == 200 && envoi::reponseOk(rep)) {
    if (demandesRatees) Serial.println(F("[Demande] ✔ Supabase répond de nouveau."));
    demandesRatees = 0;
    if (demandeFaite) {
      Serial.printf("[Demande] Résultat de la demande n°%u annoncé à Broodautomate.\n", (unsigned)demandeFaite);
      demandeFaite = 0; demandeOk = true; demandeMsg = "";
    }
    uint32_t ec = 0;
    if (envoi::lireNombre(rep, "ec", ec) && ec >= 60 && ec <= 7200 && ec != ecouteSec) {
      ecouteSec = ec;
      Serial.printf("[Demande] Réglage reçu de Broodautomate : « Lire maintenant » vérifié toutes les %u min.\n", (unsigned)(ec / 60));
    }
    uint32_t d = 0;
    bool brut = false;
    envoi::lireBool(rep, "brut", brut);
    if (envoi::lireNombre(rep, "dem", d) && d) nouvelleDemande(d, brut);
    return true;
  }
  demandesRatees++;
  if (demandesRatees == 1 || demandesRatees % 10 == 0) {
    if (code == 200) Serial.println(F("[Demande] ✖ Clé du boîtier inconnue (DEVICE_KEY) : le bouton « Lire maintenant » ne marche pas pour ce boîtier."));
    else if (code == 404) Serial.println(F("[Demande] ✖ La fonction « ba_boitier » n'existe pas encore dans Supabase : passe les nouvelles commandes SQL (Broodautomate → Connexion RS232 → Boîtiers 4G → Commandes SQL)."));
    else if (code == 401) Serial.println(F("[Demande] ✖ Supabase refuse la clé publique (SUPABASE_KEY dans config.h)."));
    else Serial.printf("[Demande] ✖ Échec (code %d) : %s\n", code, modem.derniereErreur.c_str());
  }
  return false;
}

// ---------------- Envoi vers Supabase ----------------
static bool envoyer(const Releve* r) {
  std::string b;
  b.reserve(512 + (r ? r->texte.size() * 11 / 10 : 0));
  b += "{\"k\":"; envoi::json(b, DEVICE_KEY);
  b += std::string(",\"fw\":\"" FW_VERSION) + (proto == PROTO_DEX ? " DEX" : "") + (ECOUTE_UDP ? " 1NCE" : "") + "\",\"mode\":" + std::to_string(MODE);
  b += ",\"seq\":" + std::to_string(++seq);
  b += ",\"ec\":" + std::to_string(ecouteSec);
  b += ",\"up\":" + std::to_string(millis() / 1000);
  b += ",\"rssi\":" + std::to_string(modem.csq);
  b += ",\"op\":"; envoi::json(b, modem.operateur.c_str());
  b += ",\"st\":"; envoi::json(b, statut.c_str());
  b += std::string(",\"stok\":") + (statutOk ? "true" : "false");
  b += ",\"lok\":" + std::to_string(utcDerniereLectureOk);
  b += ",\"hb\":" + std::to_string(HEARTBEAT_MIN) + ",\"rd\":" + std::to_string(READ_EVERY_MIN);
  b += ",\"lu\":" + std::to_string(nbLectures) + ",\"ko\":" + std::to_string(nbEchecs);
  b += std::string(",\"premier\":") + (premierEnvoi ? "true" : "false");
  if (r) {
    b += std::string(",\"role\":\"") + (r->machineMaitre ? "machine" : "boitier") + "\",\"liste\":" + std::to_string(r->liste);
    b += ",\"raw\":"; envoi::json(b, r->texte);
  }
  b += "}";
  Serial.printf("[Envoi] %s (%u octets)…\n", r ? "Relevé" : "Signal de vie", (unsigned)b.size());
  std::string rep;
  int code = modem.post(b, rep);
  uint32_t t;
  if (envoi::lireNombre(rep, "t", t) && (!horlogeOk || millis() - derniereSynchro > 3600000UL)) reglerHeure(t, "serveur Supabase");
  if (code == 200 && envoi::reponseOk(rep)) {
    nbEnvois++; echecsSuite = 0; premierEnvoi = false;
    dernierEnvoiOk = millis(); dernierStatutEnvoye = statut;
    Serial.println(F("[Envoi] ✔ Reçu par Supabase (réponse 200)."));
    return true;
  }
  nbEnvoisRates++; echecsSuite++;
  Serial.printf("[Envoi] ✖ Échec (code %d) : %s\n", code, modem.derniereErreur.c_str());
  if (code == 401) Serial.println(F("[Envoi]   → Clé refusée : vérifie DEVICE_KEY dans config.h (clé donnée par Broodautomate pour CE boîtier)."));
  else if (code == 404) Serial.println(F("[Envoi]   → Fonction « ingest » introuvable : déploie-la dans Supabase (Edge Functions)."));
  else if (code == 713) Serial.println(F("[Envoi]   → DNS impossible (le modem ne trouve pas l'adresse de Supabase) : signal faible ou réseau instable, nouvel essai plus tard."));
  else if (code >= 700) Serial.println(F("[Envoi]   → Erreur de connexion du modem (réseau ou HTTPS) : nouvel essai plus tard."));
  return false;
}

static void synchroHeure() {
  dernierEssaiHeure = millis();
  uint32_t utc;
  if (modem.heureUtc(utc)) reglerHeure(utc, "réseau 4G");
  else if (!horlogeOk) Serial.println(F("[Heure] Pas encore d'heure : elle viendra avec la première réponse de Supabase."));
}

// ---------------- Essai de la liaison RS232 (MODE 2) ----------------
static void essaiBoucle() {
  static uint32_t dernier = 0;
  if (millis() - dernier < 2000) return;
  dernier = millis();
  while (MachineSerial.available()) MachineSerial.read();
  MachineSerial.print("TEST"); MachineSerial.flush();
  delay(200);
  String r;
  while (MachineSerial.available()) r += (char)MachineSerial.read();
  if (r == "TEST") Serial.println(F("[Essai] ✔ OK : « TEST » est revenu. La liaison fonctionne."));
  else Serial.println("[Essai] ✖ PAS DE RETOUR, reçu : '" + r + "'");
}

// ---------------- v1.6 : essai d'une machine ancienne (MODE 3) ----------------
// Manuel FAS 480 TOP (commande 90) : en 1, 2 ou 3, la machine envoie un TEXTE (1 = totaux, 2 = + ventes par sélection,
// 3 = + températures 24 h, coupures, erreurs) à 9600 bauds, 8 bits, sans parité ; l'envoi est « réglé par le signal DTR
// (actif haut) donné par l'appareil qui relève » = broche 7 de sa prise ; il part quand on appuie sur « envoi des données ».
// L'essai : 1) écoute, broche 7 coupée ; 2) broche 7 allumée ; 3) broche 7 coupée puis rallumée (3 fois) ;
// 4) questions DEX (ENQ) et DDCMP (START), les seules choses que le boîtier envoie : rien ne peut effacer ;
// 5) l'utilisateur appuie sur le bouton (broche 7 allumée) ; 6) il rappuie, broche 7 coupée ; 7) écoute libre.
// Tout ce qui arrive est affiché dans le Moniteur série, puis un bilan. Pas de 4G dans ce mode (modem éteint).
static const uint32_t ANC_VITESSES[] = {9600, 4800, 2400, 19200, 1200};
static const int ANC_NB_VITESSES = 5;
static const char* const ANC_NOMS[8] = {"",
  "1 / 7 : j'écoute la machine, broche 7 COUPÉE (20 s)",
  "2 / 7 : broche 7 ALLUMÉE, comme un lecteur branché (45 s)",
  "3 / 7 : broche 7 coupée 3 s puis rallumée, 3 fois (70 s)",
  "4 / 7 : questions DEX et DDCMP, lecture seule (15 s)",
  "5 / 7 : À TOI ! Appuie sur le bouton d'envoi des données de la carte mère",
  "6 / 7 : rappuie sur le bouton : cette fois la broche 7 est COUPÉE (90 s)",
  "7 / 7 : écoute libre, broche 7 allumée (appuie quand tu veux)"};
struct AncResultat { bool recu = false; bool lisible = false; uint32_t octets = 0; uint32_t vitesse = 0; };
static AncResultat ancRes[8];
static int ancEtape = 0, ancVitesse = 0, ancEssaisVitesse = 0, ancActions = 0;
static uint32_t ancDebutEtape = 0, ancDernierOctet = 0, ancDebutCap = 0, ancRappel = 0;
static bool ancBroche7 = false, ancDex = false, ancDdcmp = false, ancConseilsDonnes = false;
static std::string ancCap;
static int ancCapEtape = 0;
static bool ancCapBroche7 = false;
static uint32_t ancRallumer = 0;                    // étape 7 : rallumer la broche 7 à cette heure (0 = rien de prévu)

static void ancBroche(bool on) {
  ancBroche7 = on;
  if (BROCHE7_PIN >= 0) digitalWrite(BROCHE7_PIN, on ? HIGH : LOW);
  if (BROCHE7_PIN_BIS >= 0) digitalWrite(BROCHE7_PIN_BIS, on ? HIGH : LOW);
  Serial.printf("[Ancienne] Broche 7 %s.\n", on ? "ALLUMÉE (3,3 V)" : "COUPÉE (0 V)");
}
static void ancRegleVitesse(int i) {
  ancVitesse = i;
  MachineSerial.updateBaudRate(ANC_VITESSES[i]);
  Serial.printf("[Ancienne] Vitesse d'écoute : %u bauds.\n", (unsigned)ANC_VITESSES[i]);
}
static void ancAller(int e) {
  ancEtape = e; ancDebutEtape = millis(); ancActions = 0; ancRappel = millis();
  Serial.println();
  Serial.printf("[Ancienne] ===== Étape %s =====\n", ANC_NOMS[e]);
  if (e == 5) {
    Serial.println(F("[Ancienne] → Appuie MAINTENANT sur le bouton d'envoi des données de la carte mère (comme avec le câble)."));
    Serial.println(F("[Ancienne]   J'attends le texte de la machine. Ne touche pas au boîtier."));
  }
  if (e == 6) Serial.println(F("[Ancienne] → Rappuie sur le bouton de la carte mère. J'attends 90 s."));
}
static bool ancContient(const std::string& d, uint8_t a, uint8_t b) {
  for (size_t i = 0; i + 1 < d.size(); i++) if ((uint8_t)d[i] == a && (uint8_t)d[i + 1] == b) return true;
  return false;
}
static std::string ancCol(const char* nom) {         // nom complété par des espaces (largeur en lettres, accents compris)
  std::string t(nom); size_t n = 0;
  for (unsigned char c : t) if ((c & 0xC0) != 0x80) n++;
  while (n < 34) { t += ' '; n++; }
  return t;
}
static void ancResultatLigne(const char* nom, int e) {
  const AncResultat& r = ancRes[e];
  std::string c = ancCol(nom);
  if (ancEtape < e && !r.recu) { Serial.printf("  %s : pas encore essayé\n", c.c_str()); return; }
  if (!r.recu) Serial.printf("  %s : rien reçu\n", c.c_str());
  else Serial.printf("  %s : REÇU %u octets (%s, %u bauds)\n", c.c_str(), (unsigned)r.octets, r.lisible ? "texte lisible" : "illisible", (unsigned)r.vitesse);
}
static void ancBilan() {
  Serial.println();
  Serial.println(F("[Ancienne] ===================== BILAN ====================="));
  ancResultatLigne("Toute seule, broche 7 coupée", 1);
  ancResultatLigne("Broche 7 allumée", 2);
  ancResultatLigne("Broche 7 coupée puis rallumée", 3);
  Serial.printf("  %s : %s\n", ancCol("Questions DEX / DDCMP").c_str(), ancEtape < 4 ? "pas encore essayé" : ancDex ? "RÉPOND au DEX" : ancDdcmp ? "RÉPOND au DDCMP" : "pas de réponse");
  ancResultatLigne("Bouton, broche 7 allumée", 5);
  ancResultatLigne("Bouton, broche 7 coupée", 6);
  if (ancRes[7].recu) ancResultatLigne("Écoute libre", 7);
  bool seule = ancRes[1].lisible || ancRes[2].lisible || ancRes[3].lisible;
  if (seule) {
    int e = ancRes[1].lisible ? 1 : ancRes[2].lisible ? 2 : 3;
    Serial.printf("  ★ La machine envoie SANS bouton (étape %d) : le boîtier pourra la lire tout seul.\n", e);
    Serial.println(F("    Envoie-moi tout ce texte : je prépare la lecture automatique de ces machines."));
  }
  if (ancDex) Serial.println(F("  ★ La machine répond au DEX : remets MODE 0, le boîtier la lira tout seul (comme la 480/5)."));
  else if (ancDdcmp) Serial.println(F("  ★ La machine répond au DDCMP : remets MODE 0, le boîtier la lira tout seul (comme la Power Lift)."));
  if (!seule && !ancDex && !ancDdcmp) {
    if (ancRes[5].lisible || ancRes[7].lisible) {
      Serial.println(F("  → La machine n'envoie qu'avec le bouton : le boîtier peut recevoir ce texte, mais il faudra appuyer à chaque visite."));
      if (ancEtape >= 7) {
        if (ancRes[6].lisible) Serial.println(F("  → Même broche 7 coupée, le texte arrive : le 4e fil n'est pas nécessaire."));
        else Serial.println(F("  → Broche 7 coupée, rien n'arrive (si tu as bien rappuyé à l'étape 6) : le 4e fil (broche 7) est nécessaire."));
      }
      Serial.println(F("    Envoie-moi tout ce texte : je verrai ce qu'on peut en tirer (ventes par sélection…)."));
    } else if (ancEtape >= 5 && (ancRes[5].recu || ancRes[7].recu)) {
      Serial.println(F("  → Texte reçu mais illisible : la vitesse n'est pas la bonne. Envoie-moi ces lignes."));
    } else if (ancEtape >= 5) {
      Serial.println(F("  → Rien reçu pour l'instant. Si tu as déjà appuyé sur le bouton :"));
      Serial.println(F("    1) vérifie les 3 fils : machine 2 → trou 3 du module, machine 3 → trou 2, machine 5 → trou 5 ;"));
      Serial.println(F("    2) essaie en échangeant les deux fils des broches 2 et 3 de la machine ;"));
      Serial.println(F("    3) vérifie la commande 90 de la machine (1, 2 ou 3) et le 4e fil : broche 7 de la machine → broche 21 (ou 22) du LILYGO."));
    }
  }
  Serial.println(F("[Ancienne] Copie tout le texte du Moniteur série et envoie-le-moi. Commandes : bilan, 7on, 7off, vitesse 4800, aide"));
  Serial.println(F("[Ancienne] ==================================================="));
}
static void ancAfficher(const std::string& d) {
  Serial.println(F("[Ancienne] ----- début du texte reçu -----"));
  std::string ligne; size_t nb = 0;
  auto sortir = [&]() { Serial.printf("│ %s\n", ligne.c_str()); ligne.clear(); nb++; };
  for (size_t i = 0; i < d.size() && nb < 400; i++) {
    uint8_t c = (uint8_t)d[i];
    if (c == '\r') { if (i + 1 < d.size() && d[i + 1] == '\n') continue; sortir(); }
    else if (c == '\n') sortir();
    else if (c == '\t') ligne += ' ';
    else if (c >= 32 && c < 127) ligne += (char)c;
    else { char h[8]; snprintf(h, sizeof h, "<%02X>", c); ligne += h; }
    if (ligne.size() >= 160) sortir();
  }
  if (!ligne.empty()) sortir();
  if (nb >= 400) Serial.println(F("│ … (texte coupé : plus de 400 lignes)"));
  Serial.println(F("[Ancienne] ----- fin du texte reçu -----"));
  std::string hex; char h[4];
  for (size_t i = 0; i < d.size() && i < 48; i++) { snprintf(h, sizeof h, "%02X ", (uint8_t)d[i]); hex += h; }
  Serial.printf("[Ancienne] Premiers octets : %s\n", hex.c_str());
}
static void ancCaptureFinie() {
  std::string d; d.swap(ancCap);
  int e = ancCapEtape;
  size_t lis = 0;
  for (unsigned char c : d) if ((c >= 32 && c < 127) || c == '\r' || c == '\n' || c == '\t') lis++;
  int pct = d.empty() ? 0 : (int)(lis * 100 / d.size());
  bool lisible = d.size() >= 20 && pct >= 85;
  bool dex = ancContient(d, 0x10, '0'), ddcmp = ancContient(d, ddcmp::ENQ, ddcmp::STACK);
  Serial.println();
  Serial.printf("[Ancienne] ✔ REÇU pendant l'étape %d : %u octets en %.1f s, à %u bauds, broche 7 %s — lisible à %d %%\n",
                e, (unsigned)d.size(), (ancDernierOctet - ancDebutCap) / 1000.0, (unsigned)ANC_VITESSES[ancVitesse], ancCapBroche7 ? "allumée" : "coupée", pct);
  if (e == 4 && dex) { ancDex = true; Serial.println(F("[Ancienne] ★ La machine répond au DEX (DLE 0).")); uint8_t eot = 4; MachineSerial.write(&eot, 1); }
  if (e == 4 && ddcmp) { ancDdcmp = true; Serial.println(F("[Ancienne] ★ La machine répond au DDCMP (STACK).")); }
  if (d.find("DXS*") != std::string::npos) Serial.println(F("[Ancienne] Le texte commence comme un relevé EVA-DTS / DEX (DXS…)."));
  ancAfficher(d);
  if (e >= 1 && e <= 7) {
    AncResultat& r = ancRes[e];
    r.recu = true; r.octets += (uint32_t)d.size(); r.vitesse = ANC_VITESSES[ancVitesse];
    if (lisible && !(e == 4 && (dex || ddcmp))) r.lisible = true;
  }
  // Étape 5 : texte illisible → autre vitesse ; texte lisible → étape 6 (même essai, broche 7 coupée)
  if (e == 5 && ancEtape == 5) {
    if (lisible) { ancBroche(false); ancAller(6); }
    else if (d.size() >= 10 && ancEssaisVitesse < ANC_NB_VITESSES - 1) {
      ancEssaisVitesse++;
      ancRegleVitesse((ancVitesse + 1) % ANC_NB_VITESSES);
      Serial.println(F("[Ancienne] Texte illisible : j'essaie une autre vitesse. → Rappuie sur le bouton de la carte mère."));
    }
  }
  if (e == 6 && ancEtape == 6) { ancBroche(true); ancAller(7); ancBilan(); }
  else if (e == 7 || (e == 5 && !lisible)) ancBilan();
  if (e == 7 && ancEtape == 7 && ancBroche7) {
    Serial.println(F("[Ancienne] Comme un lecteur qu'on débranche : broche 7 coupée 5 s (la machine peut quitter le message « débrancher »)."));
    ancBroche(false); ancRallumer = millis() + 5000;
  }
}
static void ancienneBoucle() {
  uint32_t now = millis();
  while (MachineSerial.available()) {
    int c = MachineSerial.read();
    if (c < 0) break;
    if (ancCap.empty()) { ancDebutCap = now; ancCapEtape = ancEtape; ancCapBroche7 = ancBroche7; }
    if (ancCap.size() < 20000) ancCap += (char)c;
    ancDernierOctet = now;
  }
  if (!ancCap.empty() && now - ancDernierOctet >= 2500) ancCaptureFinie();
  if (!ancCap.empty()) return;                      // un texte arrive : on ne change rien tant qu'il n'est pas fini
  uint32_t t = now - ancDebutEtape;
  switch (ancEtape) {
    case 1: if (t >= 20000) { ancBroche(true); ancAller(2); } break;
    case 2: if (t >= 45000) ancAller(3); break;
    case 3: {                                       // 3 fois : coupée 3 s, puis allumée 20 s
      uint32_t c = t % 23000;
      if (t >= 3UL * 23000UL) { ancAller(4); break; }
      if (c < 3000 && ancBroche7) ancBroche(false);
      else if (c >= 3000 && !ancBroche7) ancBroche(true);
      break;
    }
    case 4: {                                       // ENQ à 0, 2 et 4 s ; START à 6, 8 et 10 s ; réponse attendue jusqu'à 15 s
      if (ancActions < 6 && t >= (uint32_t)ancActions * 2000UL) {
        if (ancActions < 3) { uint8_t enq = ddcmp::ENQ; MachineSerial.write(&enq, 1); Serial.println(F("[Ancienne] → question DEX (ENQ)")); }
        else { ddcmp::Octets st = ddcmp::start(1); MachineSerial.write(st.data(), st.size()); Serial.println(F("[Ancienne] → question DDCMP (START)")); }
        MachineSerial.flush();
        ancActions++;
      }
      if (t >= 15000) { ancBilan(); ancAller(5); }
      break;
    }
    case 5:
      if (now - ancRappel >= 60000UL) {
        ancRappel = now;
        Serial.printf("[Ancienne] J'attends le texte de la machine (broche 7 allumée, %u bauds). Appuie sur le bouton de la carte mère.\n", (unsigned)ANC_VITESSES[ancVitesse]);
        if (t >= 300000UL && !ancConseilsDonnes) { ancConseilsDonnes = true; ancBilan(); }
      }
      break;
    case 6: if (t >= 90000UL) { Serial.println(F("[Ancienne] Rien reçu avec la broche 7 coupée.")); ancBroche(true); ancAller(7); ancBilan(); } break;
    case 7: if (ancRallumer && (int32_t)(now - ancRallumer) >= 0) { ancRallumer = 0; ancBroche(true); } break;
    default: break;
  }
}
static void ancDemarrer() {
  if (BROCHE7_PIN >= 0) { pinMode(BROCHE7_PIN, OUTPUT); digitalWrite(BROCHE7_PIN, LOW); }
  if (BROCHE7_PIN_BIS >= 0) { pinMode(BROCHE7_PIN_BIS, OUTPUT); digitalWrite(BROCHE7_PIN_BIS, LOW); }
  Serial.println(F("[Ancienne] Essai d'une machine ancienne (480 TOP, logiciel 1.x) : pas de 4G, rien n'est envoyé à Supabase."));
  Serial.println(F("[Ancienne] Fils : machine 2 → trou 3 du module, machine 3 → trou 2, machine 5 → trou 5 (comme d'habitude)."));
  if (BROCHE7_PIN >= 0 && BROCHE7_PIN_BIS >= 0) Serial.printf("[Ancienne] 4e fil : broche 7 de la machine → broche %d (ou %d) du LILYGO (sans lui, les étapes 2, 3 et 6 ne changent rien).\n", BROCHE7_PIN, BROCHE7_PIN_BIS);
  else if (BROCHE7_PIN >= 0) Serial.printf("[Ancienne] 4e fil : broche 7 de la machine → broche %d du LILYGO (sans lui, les étapes 2, 3 et 6 ne changent rien).\n", BROCHE7_PIN);
  else Serial.println(F("[Ancienne] Pas de 4e fil (BROCHE7_PIN -1) : les étapes 2, 3 et 6 ne changent rien."));
  Serial.println(F("[Ancienne] Machine : commande 90 sur 1, 2 ou 3 (3 = le plus complet). Ne touche JAMAIS à la commande 92."));
  Serial.println(F("[Ancienne] Le boîtier n'envoie à la machine que des questions de lecture (ENQ, START) : rien ne peut effacer."));
  Serial.println(F("[Ancienne] ⚠ N'appuie PAS sur le bouton de la carte mère avant le message « Étape 5 / 7 : À TOI ! » (dans 2 min 30 environ)."));
  ancRegleVitesse(0);
  ancAller(1);
}
static void ancConsole(const String& m) {
  if (m == "bilan" || m == "etat" || m == "état" || m == "aide" || m == "help") ancBilan();
  else if (m == "7on") ancBroche(true);
  else if (m == "7off") ancBroche(false);
  else if (m.startsWith("vitesse")) {
    long v = m.substring(7).toInt(); int i = -1;
    for (int k = 0; k < ANC_NB_VITESSES; k++) if ((long)ANC_VITESSES[k] == v) i = k;
    if (i >= 0) ancRegleVitesse(i); else Serial.println(F("[Console] Vitesses possibles : 9600, 4800, 2400, 19200, 1200."));
  } else Serial.println(F("[Console] Commandes du mode 3 : bilan, 7on, 7off, vitesse 4800 (ou 9600, 2400, 19200, 1200)."));
}

// ---------------- v1.5 : écoute UDP (carte 1NCE, ECOUTE_UDP 1) ----------------
// Le boîtier ouvre un port UDP et l'écoute. Le Device Controller de 1NCE peut lui envoyer « lire » : le boîtier lit
// la machine tout de suite et envoie le relevé à Supabase (comme « Lire maintenant », sans attendre). Un autre message
// est seulement affiché. Le boîtier répond à 1NCE (« RECU … », visible dans le portail 1NCE : Device Inspector).
static const char* UDP_HOTE_1NCE = "udp.os.1nce.com";
static const int UDP_PORT_1NCE = 4445;
static String udpIp1nce;
static uint32_t udpProchaineOuverture = 0, udpDernierEnvoi = 0, udpNbRecus = 0, udpNbEnvoyes = 0;
static bool udpVivantDemande = false;
static void udpEnvoyerTexte(const String& t) {
  if (!modem.udpPret) return;
  udpDernierEnvoi = millis();
  if (!udpIp1nce.length() && !modem.udpResoudre(UDP_HOTE_1NCE, udpIp1nce)) { Serial.println(F("[UDP] ✖ Adresse de udp.os.1nce.com introuvable (DNS) : envoi annulé.")); return; }
  bool ok = modem.udpEnvoyer(udpIp1nce, UDP_PORT_1NCE, t);
  if (ok) udpNbEnvoyes++;
  else udpIp1nce = "";                     // l'adresse sera redemandée la prochaine fois
  Serial.printf("[UDP] %s Envoi à 1NCE (%u octets) : « %s »%s\n", ok ? "✔" : "✖", (unsigned)t.length(), t.c_str(), ok ? "" : (" — " + modem.derniereErreur).c_str());
}
static void ecouteUdp() {
  uint32_t now = millis();
  if (!modem.reseau) { modem.udpPret = false; return; }
  if (!modem.udpPret) {
    if (udpProchaineOuverture && (int32_t)(now - udpProchaineOuverture) < 0) return;
    udpProchaineOuverture = now + 60000UL; if (!udpProchaineOuverture) udpProchaineOuverture = 1;
    Serial.printf("[UDP] Ouverture du port d'écoute %d…\n", UDP_PORT_ECOUTE);
    if (modem.udpOuvrir(UDP_PORT_ECOUTE)) {
      Serial.printf("[UDP] ✔ Le boîtier écoute le port %d. Adresse du boîtier : %s (avec 1NCE, elle commence par 10.)\n", UDP_PORT_ECOUTE, modem.ip.c_str());
      Serial.printf("[UDP] Essai : portail 1NCE → 1NCE OS → Device Controller → ta carte → UDP, port %d, texte « lire », « Send now ».\n", UDP_PORT_ECOUTE);
      udpEnvoyerTexte(String("OUVERT v") + FW_VERSION + " port " + String(UDP_PORT_ECOUTE) + " signal " + String(modem.csq));
    } else Serial.println("[UDP] ✖ Ouverture impossible : " + modem.derniereErreur + " — nouvel essai dans 1 minute.");
    return;
  }
  std::string d, de;
  while (modem.udpRecu(d, de)) {
    udpNbRecus++;
    std::string m = d;
    while (!m.empty() && (m.back() == '\r' || m.back() == '\n' || m.back() == ' ')) m.pop_back();
    while (!m.empty() && m[0] == ' ') m.erase(0, 1);
    for (auto& c : m) if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    std::string vu = d.substr(0, 60); for (auto& c : vu) if ((unsigned char)c < 0x20) c = ' ';   // affichage sur une ligne
    Serial.printf("[UDP] ✔✔ MESSAGE REÇU n°%u (après %lu s de marche) de %s : « %s » (%u octets)\n", (unsigned)udpNbRecus, (unsigned long)(millis() / 1000), de.empty() ? "1NCE" : de.c_str(), vu.c_str(), (unsigned)d.size());
    if (m == "lire" || m == "read" || m == "lees") {
      if (MODE == 0) { udpLire = true; lectureDemandee = true; Serial.println(F("[UDP] → Lecture de la machine tout de suite, puis envoi du relevé à Supabase.")); }
      else Serial.println(F("[UDP] (mode essai : le boîtier ne lit pas la machine)"));
    }
    udpEnvoyerTexte(String("RECU ") + String(m.substr(0, 40).c_str()));
  }
  if (!modem.udpPret) return;
  if (udpVivantDemande || (UDP_VIVANT_MIN > 0 && now - udpDernierEnvoi >= (uint32_t)UDP_VIVANT_MIN * 60000UL)) {
    udpVivantDemande = false;
    udpEnvoyerTexte(String("VIVANT ") + String((unsigned long)(now / 1000)) + "s signal " + String(modem.csq) + " recus " + String((unsigned long)udpNbRecus));
  }
}

// ---------------- Moniteur série : commandes de dépannage ----------------
static void afficherEtat() {
  Serial.println(F("------------------------------------------------------------"));
  Serial.printf("Broodautomate boîtier 4G v%s — mode %d (%s)\n", FW_VERSION, MODE, MODE == 0 ? "normal" : MODE == 1 ? "essai 4G" : MODE == 2 ? "essai liaison RS232" : "essai machine ancienne");
  Serial.printf("Modem : %s ; réseau : %s ; signal %d/31 ; opérateur %s\n", modem.pret ? "prêt" : "non", modem.reseau ? "oui" : "non", modem.csq, modem.operateur.c_str());
  if (horlogeOk) { HeureLocale h = horloge::bruxelles(utcMaintenant()); Serial.printf("Heure belge : %02u/%02u/20%02u %02u:%02u:%02u\n", h.jour, h.mois, h.annee2, h.heure, h.minute, h.seconde); }
  else Serial.println(F("Heure : pas encore connue"));
  if (MODE == 0) Serial.printf("Protocole : %s\n", proto == PROTO_DEX ? "FAS 480 (DEX-UCS)" : "Power Lift (EVA-DTS DDCMP)");
  Serial.printf("Machine : %s ; lectures %u, échecs %u ; relevés en attente : %u\n", statut.c_str(), (unsigned)nbLectures, (unsigned)nbEchecs, (unsigned)file.size());
  Serial.printf("Envois réussis %u, ratés %u ; dernier envoi réussi il y a %lu s\n", (unsigned)nbEnvois, (unsigned)nbEnvoisRates, dernierEnvoiOk ? (unsigned long)((millis() - dernierEnvoiOk) / 1000) : 0UL);
  if (proto == PROTO_DEX) Serial.printf("Lecture de la 480 chaque %d s ; relevé de contrôle au moins chaque %d min ; bouton « Lire maintenant » vérifié toutes les %u s", DEX_LECTURE_SEC, DEX_RECAP_MIN, (unsigned)ecouteSec);
  else Serial.printf("Surveillance chaque %d s ; relevé de contrôle au moins chaque %d min ; bouton « Lire maintenant » vérifié toutes les %u s", SURVEILLE_VENTES_SEC, READ_EVERY_MIN, (unsigned)ecouteSec);
  if (demandeId || lectureDem) Serial.printf(" ; demande en cours n°%u", (unsigned)(lectureDem ? lectureDem : demandeId));
  if (demandesRatees) Serial.printf(" ; %u vérifications ratées", (unsigned)demandesRatees);
  Serial.println();
  if (ECOUTE_UDP) Serial.printf("Carte 1NCE, écoute UDP : port %d %s ; messages reçus %u ; envoyés à 1NCE %u\n", UDP_PORT_ECOUTE, modem.udpPret ? "ouvert" : "FERMÉ", (unsigned)udpNbRecus, (unsigned)udpNbEnvoyes);
  if (ECOUTE_UDP) Serial.println(F("Commandes : etat, lire, envoi, demande, udp, aide, ou une commande AT (ex. AT+CSQ)"));
  else Serial.println(F("Commandes : etat, lire, envoi, demande, aide, ou une commande AT (ex. AT+CSQ)"));
  Serial.println(F("------------------------------------------------------------"));
}
static void console() {
  static String ligne;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c != '\n' && c != '\r') { if (ligne.length() < 200) ligne += c; continue; }
    String cmd = ligne; ligne = ""; cmd.trim();
    if (!cmd.length()) continue;
    String m = cmd; m.toLowerCase();
    if (MODE == 3) { ancConsole(m); continue; }       // v1.6 : essai machine ancienne
    if (m == "etat" || m == "état" || m == "aide" || m == "help") afficherEtat();
    else if (m == "lire") { lectureDemandee = true; Serial.println(F("[Console] Lecture de la machine demandée.")); }
    else if (m == "envoi") { dernierPing = 0; prochainEssaiEnvoi = 0; dernierEnvoiOk = millis() - (uint32_t)HEARTBEAT_MIN * 60000UL - 1; Serial.println(F("[Console] Signal de vie demandé.")); }
    else if (m == "udp") { if (ECOUTE_UDP) { udpVivantDemande = true; Serial.println(F("[Console] Petit message de test vers 1NCE demandé.")); } else Serial.println(F("[Console] Écoute UDP désactivée (ECOUTE_UDP 0 dans config.h).")); }
    else if (m == "demande") { prochaineDemande = millis(); Serial.println(F("[Console] Je regarde tout de suite s'il y a une demande de lecture.")); }
    else if (m.startsWith("at")) {
      if (MODE == 2) { Serial.println(F("[Console] Modem éteint en mode 2.")); continue; }
      Serial.println("[Console] " + cmd + " →");
      Serial.println(modem.passerelle(cmd));
    } else Serial.println(F("[Console] Commande inconnue. Tape : etat, lire, envoi, demande ou une commande AT."));
  }
}

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println(F("============================================================"));
  Serial.printf("Broodautomate — boîtier 4G LILYGO v%s\n", FW_VERSION);
  Serial.printf("Mode %d : %s\n", MODE, MODE == 0 ? "NORMAL (lecture de la machine + envoi)" : MODE == 1 ? "ESSAI 4G sans machine" : MODE == 2 ? "ESSAI de la liaison RS232 (sans 4G)" : "ESSAI d'une machine ancienne (sans 4G)");
  if (ECOUTE_UDP && MODE != 2 && MODE != 3) Serial.printf("Carte 1NCE : le boîtier écoute le port UDP %d (« lire » envoyé par le Device Controller = lecture tout de suite)\n", UDP_PORT_ECOUTE);
  if (MODE == 0) Serial.printf("Surveillance de la machine toutes les %d s (0 = non) ; relevé de contrôle au moins chaque %d min ; « Lire maintenant » vérifié toutes les %d s\n", SURVEILLE_VENTES_SEC, READ_EVERY_MIN, DEMANDE_EVERY_SEC);
  Serial.println(F("============================================================"));
  MachineSerial.setRxBufferSize(4096);
  MachineSerial.begin(MACHINE_BAUD, SERIAL_8N1, MACHINE_RX_PIN, MACHINE_TX_PIN);
  if (MODE == 2) {
    Serial.println(F("[Essai] Pont entre les broches 18 et 19 (ou entre les broches 2 et 3 de la prise du module) : « OK » doit s'afficher."));
    return;
  }
  if (MODE == 3) { ancDemarrer(); return; }          // v1.6 : essai machine ancienne (modem éteint)
  if (strstr(DEVICE_KEY, "COLLE_ICI") || strlen(DEVICE_KEY) < 16)
    Serial.println(F("[Config] ⚠ DEVICE_KEY n'est pas remplie dans config.h : Supabase refusera les envois."));
  if (MODE == 0) choisirProtocole("démarrage");      // avant le modem : la machine est tranquille
  modem.idle = pompe;
  if (modem.demarrer() && modem.connecter()) synchroHeure();
  dernierEssaiReseau = millis();
  delaiReseau = 60000;
  afficherEtat();
}

void loop() {
  pompe();
  console();
  if (MODE == 2) { essaiBoucle(); delay(1); return; }
  if (MODE == 3) { ancienneBoucle(); delay(1); return; }
  uint32_t now = millis();

  // Réseau : reconnexion (1 min, puis de plus en plus espacé jusqu'à 10 min)
  if (!modem.reseau && now - dernierEssaiReseau >= delaiReseau) {
    dernierEssaiReseau = now;
    if (modem.connecter()) { delaiReseau = 60000; if (!horlogeOk) synchroHeure(); }
    else delaiReseau = delaiReseau < 600000UL ? delaiReseau * 2 : 600000UL;
  }
  if (ECOUTE_UDP) ecouteUdp();
  // Heure : au démarrage puis toutes les 6 heures
  if (modem.reseau && (!horlogeOk || now - derniereSynchro > 6UL * 3600000UL) && now - dernierEssaiHeure > 120000UL) synchroHeure();

  // La machine a envoyé d'elle-même : lecture de contrôle 5 s après (au plus une par minute)
  if (MODE == 0 && lireApres && (int32_t)(now - lireApres) >= 0 && !moteur.occupe()) {
    uint32_t cadence = SURVEILLE_VENTES_SEC > 0 ? 15000UL : 60000UL;
    if (derniereLecture && now - derniereLecture < cadence) lireApres = derniereLecture + cadence;
    else { lireApres = 0; lectureDemandee = true; Serial.println(F("[RS232] Envoi de la machine reçu : lecture de contrôle pour mettre les ventes à jour.")); }
  }

  // v1.4 : la machine ne répond plus du tout depuis longtemps → on refait la reconnaissance (menu, autre machine branchée…), au plus toutes les 15 min
  if (MODE == 0 && PROTOCOLE == 0 && echecsSurveillance >= 6 && !moteur.occupe() && now - derniereSonde > 900000UL) choisirProtocole("après échecs");

  // v1.4 : FAS 480 (DEX) : lecture toute les DEX_LECTURE_SEC secondes, à la demande, ou au démarrage
  if (MODE == 0 && proto == PROTO_DEX) {
    uint32_t pas = DEX_LECTURE_SEC > 0 ? (uint32_t)DEX_LECTURE_SEC * 1000UL * (echecsSurveillance < 3 ? 1UL : echecsSurveillance < 6 ? 2UL : 6UL) : 0UL;
    bool due = pas > 0 && now - derniereLecture >= pas;
    if ((lectureDemandee || due) && horlogeOk) {
      lectureDemandee = false; derniereLecture = now; nbLectures++;
      lectureDem = demandeId; demandeId = 0; lectureBrut = lectureDem && demandeBrutOn; demandeBrutOn = false;
      lectureForcee = udpLire; udpLire = false;
      if (lectureDem) Serial.printf("[RS232] Lecture demandée par Broodautomate (n°%u, DEX)…\n", (unsigned)lectureDem);
      else if (nbLectures % 12 == 1) Serial.println(F("[RS232] Lecture de la machine (DEX)…"));
      lireDex();
      derniereLecture = millis();
    }
  }
  // Lecture de contrôle de la machine (liste 2) : chaque heure, à la demande, ou après un envoi de la machine
  else if (MODE == 0) {
    // surveillance : toutes les SURVEILLE_VENTES_SEC s (espacée à 2 puis 5 min si la machine ne répond pas : menu, coupure…)
    uint32_t pas = SURVEILLE_VENTES_SEC > 0 ? (uint32_t)SURVEILLE_VENTES_SEC * 1000UL * (echecsSurveillance < 3 ? 1UL : echecsSurveillance < 6 ? 4UL : 10UL)
                                           : (READ_EVERY_MIN > 0 ? (uint32_t)READ_EVERY_MIN * 60000UL : 0UL);
    bool due = pas > 0 && now - derniereLecture >= pas;
    if ((lectureDemandee || due) && horlogeOk && !moteur.occupe() && !moteur.lectureEnAttente()) {
      lectureDemandee = false; derniereLecture = now; nbLectures++;
      lectureDem = demandeId; demandeId = 0; lectureBrut = lectureDem && demandeBrutOn; demandeBrutOn = false;
      lectureForcee = udpLire; udpLire = false;
      if (lectureDem) Serial.printf("[RS232] Lecture demandée par Broodautomate (n°%u, liste 2)…\n", (unsigned)lectureDem);
      else if (SURVEILLE_VENTES_SEC <= 0 || nbLectures % 20 == 1) Serial.println(F("[RS232] Lecture de contrôle (liste 2)…"));
      moteur.lire(2);
    }
  } else if (statut == "démarrage") statut = "essai sans machine";

  // Envois : relevés en attente, puis signal de vie (au moins toutes les HEARTBEAT_MIN, ou si l'état change)
  bool reseauUtilise = false;
  if (now >= prochainEssaiEnvoi || (int32_t)(prochainEssaiEnvoi - now) > 900000) {
    bool aEnvoyer = !file.empty();
    uint32_t hb = (MODE == 1 ? 2UL : (uint32_t)HEARTBEAT_MIN) * 60000UL;
    bool ping = premierEnvoi || dernierEnvoiOk == 0 || now - dernierEnvoiOk >= hb || (statut != dernierStatutEnvoye && now - dernierPing > 120000UL);
    if ((aEnvoyer || ping) && !moteur.occupe()) {
      reseauUtilise = true;
      if (!modem.reseau || !modem.encoreConnecte()) {
        prochainEssaiEnvoi = now + 30000;
      } else {
        bool ok;
        if (aEnvoyer) {
          // pendant l'envoi (quelques secondes), la machine reste servie : la file peut changer,
          // on retire donc le relevé envoyé par son numéro
          uint32_t no = file.front().no;
          ok = envoyer(&file.front());
          if (ok) {
            for (auto it = file.begin(); it != file.end(); ++it) {
              if (it->no != no) continue;
              uint32_t dem = it->dem;
              octetsEnFile -= it->texte.size();
              file.erase(it);
              if (dem && !demandeEnFile(dem)) demandeTerminee(dem, true, "");
              break;
            }
          }
        }
        else { dernierPing = now; ok = envoyer(nullptr); }
        uint32_t attente = ok ? 1000 : (echecsSuite < 3 ? 60000UL : echecsSuite < 6 ? 180000UL : 600000UL);
        prochainEssaiEnvoi = millis() + attente;
        if (echecsSuite == 3 || echecsSuite == 6) { Serial.println(F("[4G] Plusieurs échecs : reconnexion au réseau.")); modem.reseau = false; dernierEssaiReseau = 0; }
        if (echecsSuite == 9) { Serial.println(F("[4G] Toujours en échec : redémarrage du modem.")); modem.pret = false; modem.reseau = false; dernierEssaiReseau = 0; }
      }
    }
  }

  // Bouton « Lire maintenant » : regarder s'il y a une demande (toutes les DEMANDE_EVERY_SEC),
  // ou annoncer tout de suite le résultat d'une demande terminée
  if (!reseauUtilise && DEMANDE_EVERY_SEC > 0 && !strstr(DEVICE_KEY, "COLLE_ICI") && modem.reseau && !moteur.occupe() && (int32_t)(millis() - prochaineDemande) >= 0) {
    if (!modem.encoreConnecte()) prochaineDemande = millis() + 30000UL;
    else {
      bool ok = demander();
      uint32_t base = ecouteSec * 1000UL;
      uint32_t attente = ok ? (demandeFaite ? 1000UL : base)
                            : (demandesRatees < 3 ? base : demandesRatees < 6 ? (base > 600000UL ? base : 600000UL) : (base > 1800000UL ? base : 1800000UL));
      prochaineDemande = millis() + attente;
    }
  }
  // Sécurité : rien n'est passé depuis 12 heures → redémarrage complet du boîtier
  if (now > 12UL * 3600000UL && (dernierEnvoiOk == 0 || now - dernierEnvoiOk > 12UL * 3600000UL)) {
    Serial.println(F("[Boîtier] Aucun envoi réussi depuis 12 h : redémarrage."));
    delay(500);
    ESP.restart();
  }
  delay(1);
}
