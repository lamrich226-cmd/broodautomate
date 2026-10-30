// ============================================================
// BROODAUTOMATE — Boîtier 4G LILYGO T-A7670E (programme principal, v1.0)
// Lit la machine FAS en RS232 (EVA-DTS DDCMP, lecture seule, comme le câble
// de Broodautomate) et envoie les relevés à Supabase par la 4G (HTTPS).
// Réglages : config.h (le seul fichier à modifier).
// ============================================================
#include <Arduino.h>
#include <deque>
#include <string>
#include "config.h"
#include "ddcmp_moteur.h"
#include "horloge.h"
#include "envoi.h"
#include "modem.h"

#define FW_VERSION "1.0"

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
struct Releve { std::string texte; bool machineMaitre; uint8_t liste; };
static std::deque<Releve> file;
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

// ---------------- Liaison avec la machine (UART 2 → module MAX3232) ----------------
struct MachineIo : MoteurDdcmp::Io {
  int available() override { return MachineSerial.available(); }
  int read() override { return MachineSerial.read(); }
  void write(const uint8_t* b, size_t n) override { MachineSerial.write(b, n); MachineSerial.flush(); }
  uint32_t ms() override { return millis(); }
  void wait(uint32_t m) override { delay(m); }
};
static void ajouterReleve(const std::string& texte, bool machineMaitre, int liste);

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
    ajouterReleve(texte, machineMaitre, liste);
  }
  void etat(const char* t) override {}
  void lectureFinie(bool ok, bool cede, const std::string& erreur) override {
    if (ok) {
      statut = "ok"; statutOk = true; utcDerniereLectureOk = horlogeOk ? utcMaintenant() : 0;
    } else {
      nbEchecs++; statutOk = false;
      statut = String(erreur.c_str());
      Serial.println("[RS232] ✖ Lecture impossible : " + statut);
    }
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
static void pompe() { moteur.poll(); }

// Relevé reçu : gardé pour l'envoi (les relevés de contrôle identiques au précédent ne sont pas renvoyés)
static void ajouterReleve(const std::string& texte, bool machineMaitre, int liste) {
  if (!envoi::releveComplet(texte)) { Serial.println(F("[Relevé] Texte reçu incomplet (sans DXS … DXE) : ignoré.")); return; }
  if (!machineMaitre) {
    uint32_t e = envoi::empreinte(texte);
    if (empreinteConnue && e == derniereEmpreinte) { Serial.println(F("[Relevé] Aucun changement depuis le relevé précédent : rien à envoyer.")); return; }
    derniereEmpreinte = e; empreinteConnue = true;
  }
  // place limitée : on enlève d'abord les anciens relevés de contrôle (le suivant contient les mêmes compteurs)
  while (file.size() >= 8 || octetsEnFile + texte.size() > 65000) {
    auto it = file.begin();
    while (it != file.end() && it->machineMaitre) ++it;
    if (it == file.end()) it = file.begin();
    if (it == file.end()) break;
    octetsEnFile -= it->texte.size();
    file.erase(it);
  }
  file.push_back({texte, machineMaitre, (uint8_t)liste});
  octetsEnFile += texte.size();
  Serial.printf("[Relevé] %u octets %s → à envoyer (%u en attente).\n", (unsigned)texte.size(), machineMaitre ? "envoyés par la machine" : "lus (liste 2)", (unsigned)file.size());
}

// ---------------- Envoi vers Supabase ----------------
static bool envoyer(const Releve* r) {
  std::string b;
  b.reserve(512 + (r ? r->texte.size() * 11 / 10 : 0));
  b += "{\"k\":"; envoi::json(b, DEVICE_KEY);
  b += ",\"fw\":\"" FW_VERSION "\",\"mode\":" + std::to_string(MODE);
  b += ",\"seq\":" + std::to_string(++seq);
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

// ---------------- Moniteur série : commandes de dépannage ----------------
static void afficherEtat() {
  Serial.println(F("------------------------------------------------------------"));
  Serial.printf("Broodautomate boîtier 4G v%s — mode %d (%s)\n", FW_VERSION, MODE, MODE == 0 ? "normal" : MODE == 1 ? "essai 4G" : "essai liaison RS232");
  Serial.printf("Modem : %s ; réseau : %s ; signal %d/31 ; opérateur %s\n", modem.pret ? "prêt" : "non", modem.reseau ? "oui" : "non", modem.csq, modem.operateur.c_str());
  if (horlogeOk) { HeureLocale h = horloge::bruxelles(utcMaintenant()); Serial.printf("Heure belge : %02u/%02u/20%02u %02u:%02u:%02u\n", h.jour, h.mois, h.annee2, h.heure, h.minute, h.seconde); }
  else Serial.println(F("Heure : pas encore connue"));
  Serial.printf("Machine : %s ; lectures %u, échecs %u ; relevés en attente : %u\n", statut.c_str(), (unsigned)nbLectures, (unsigned)nbEchecs, (unsigned)file.size());
  Serial.printf("Envois réussis %u, ratés %u ; dernier envoi réussi il y a %lu s\n", (unsigned)nbEnvois, (unsigned)nbEnvoisRates, dernierEnvoiOk ? (unsigned long)((millis() - dernierEnvoiOk) / 1000) : 0UL);
  Serial.println(F("Commandes : etat, lire, envoi, aide, ou une commande AT (ex. AT+CSQ)"));
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
    if (m == "etat" || m == "état" || m == "aide" || m == "help") afficherEtat();
    else if (m == "lire") { lectureDemandee = true; Serial.println(F("[Console] Lecture de la machine demandée.")); }
    else if (m == "envoi") { dernierPing = 0; prochainEssaiEnvoi = 0; dernierEnvoiOk = millis() - (uint32_t)HEARTBEAT_MIN * 60000UL - 1; Serial.println(F("[Console] Signal de vie demandé.")); }
    else if (m.startsWith("at")) {
      if (MODE == 2) { Serial.println(F("[Console] Modem éteint en mode 2.")); continue; }
      Serial.println("[Console] " + cmd + " →");
      Serial.println(modem.passerelle(cmd));
    } else Serial.println(F("[Console] Commande inconnue. Tape : etat, lire, envoi ou une commande AT."));
  }
}

// ============================================================
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println(F("============================================================"));
  Serial.printf("Broodautomate — boîtier 4G LILYGO v%s\n", FW_VERSION);
  Serial.printf("Mode %d : %s\n", MODE, MODE == 0 ? "NORMAL (lecture de la machine + envoi)" : MODE == 1 ? "ESSAI 4G sans machine" : "ESSAI de la liaison RS232 (sans 4G)");
  Serial.println(F("============================================================"));
  MachineSerial.setRxBufferSize(4096);
  MachineSerial.begin(MACHINE_BAUD, SERIAL_8N1, MACHINE_RX_PIN, MACHINE_TX_PIN);
  if (MODE == 2) {
    Serial.println(F("[Essai] Pont entre les broches 18 et 19 (ou entre les broches 2 et 3 de la prise du module) : « OK » doit s'afficher."));
    return;
  }
  if (strstr(DEVICE_KEY, "COLLE_ICI") || strlen(DEVICE_KEY) < 16)
    Serial.println(F("[Config] ⚠ DEVICE_KEY n'est pas remplie dans config.h : Supabase refusera les envois."));
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
  uint32_t now = millis();

  // Réseau : reconnexion (1 min, puis de plus en plus espacé jusqu'à 10 min)
  if (!modem.reseau && now - dernierEssaiReseau >= delaiReseau) {
    dernierEssaiReseau = now;
    if (modem.connecter()) { delaiReseau = 60000; if (!horlogeOk) synchroHeure(); }
    else delaiReseau = delaiReseau < 600000UL ? delaiReseau * 2 : 600000UL;
  }
  // Heure : au démarrage puis toutes les 6 heures
  if (modem.reseau && (!horlogeOk || now - derniereSynchro > 6UL * 3600000UL) && now - dernierEssaiHeure > 120000UL) synchroHeure();

  // Lecture de contrôle de la machine (liste 2)
  if (MODE == 0) {
    bool due = READ_EVERY_MIN > 0 && now - derniereLecture >= (uint32_t)READ_EVERY_MIN * 60000UL;
    if ((lectureDemandee || due) && horlogeOk && !moteur.occupe() && !moteur.lectureEnAttente()) {
      lectureDemandee = false; derniereLecture = now; nbLectures++;
      Serial.println(F("[RS232] Lecture de contrôle (liste 2)…"));
      moteur.lire(2);
    }
  } else if (statut == "démarrage") statut = "essai sans machine";

  // Envois : relevés en attente, puis signal de vie (au moins toutes les HEARTBEAT_MIN, ou si l'état change)
  if (now >= prochainEssaiEnvoi || (int32_t)(prochainEssaiEnvoi - now) > 900000) {
    bool aEnvoyer = !file.empty();
    uint32_t hb = (MODE == 1 ? 2UL : (uint32_t)HEARTBEAT_MIN) * 60000UL;
    bool ping = premierEnvoi || dernierEnvoiOk == 0 || now - dernierEnvoiOk >= hb || (statut != dernierStatutEnvoye && now - dernierPing > 120000UL);
    if ((aEnvoyer || ping) && !moteur.occupe()) {
      if (!modem.reseau || !modem.encoreConnecte()) {
        prochainEssaiEnvoi = now + 30000;
      } else {
        bool ok;
        if (aEnvoyer) { ok = envoyer(&file.front()); if (ok) { octetsEnFile -= file.front().texte.size(); file.pop_front(); } }
        else { dernierPing = now; ok = envoyer(nullptr); }
        uint32_t attente = ok ? 1000 : (echecsSuite < 3 ? 60000UL : echecsSuite < 6 ? 180000UL : 600000UL);
        prochainEssaiEnvoi = millis() + attente;
        if (echecsSuite == 3 || echecsSuite == 6) { Serial.println(F("[4G] Plusieurs échecs : reconnexion au réseau.")); modem.reseau = false; dernierEssaiReseau = 0; }
        if (echecsSuite == 9) { Serial.println(F("[4G] Toujours en échec : redémarrage du modem.")); modem.pret = false; modem.reseau = false; dernierEssaiReseau = 0; }
      }
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
