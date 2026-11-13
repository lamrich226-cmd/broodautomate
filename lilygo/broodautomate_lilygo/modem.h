// ============================================================
// BROODAUTOMATE — Modem 4G SIMCom A7670E de la carte LILYGO (commandes AT)
// Allumage (séquence LILYGO), réseau, heure, envoi HTTPS (pile du modem).
// Pendant chaque attente, idle() est appelée : la liaison avec la machine
// continue d'être servie (la machine peut ouvrir une session à tout moment).
// ============================================================
#pragma once
#include <Arduino.h>
#include <string>
#include "config.h"
#include "horloge.h"

namespace ba {

class Modem {
 public:
  explicit Modem(HardwareSerial& s) : s_(s) {}
  void (*idle)() = nullptr;           // appelée pendant les attentes
  bool pret = false;                  // le modem répond aux commandes AT
  bool reseau = false;                // enregistré sur le réseau 4G et données actives
  int csq = 99;                       // qualité du signal 0…31 (99 = inconnue)
  String operateur, ip, derniereErreur, opBon;

  // ---------- Allumage ----------
  bool demarrer() {
    s_.setRxBufferSize(2048);
    s_.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
    pret = reseau = false;
    Serial.println(F("[4G] Allumage du modem…"));
    // Alimentation du modem (obligatoire sur la T-A7670)
    pinMode(BOARD_POWERON_PIN, OUTPUT); digitalWrite(BOARD_POWERON_PIN, HIGH);
    // Remise à zéro (niveau actif = HAUT sur la T-A7670) : bas 100 ms, haut 2,6 s, puis BAS (modem libéré)
    pinMode(MODEM_RESET_PIN, OUTPUT);
    digitalWrite(MODEM_RESET_PIN, LOW);  attendre(100);
    digitalWrite(MODEM_RESET_PIN, HIGH); attendre(2600);
    digitalWrite(MODEM_RESET_PIN, LOW);
    // Impulsion sur PWRKEY (allumage)
    impulsion(100);
    for (int i = 0; i < 45; i++) {                 // le modem met 10 à 20 s à démarrer
      if (at("AT", "OK", 700)) {
        at("ATE0"); at("AT+CMEE=2");
        pret = true;
        at("AT+CGMR", "OK", 1500);
        String v = extrait("+CGMR:");
        Serial.println("[4G] Modem prêt" + (v.length() ? " (logiciel " + v + ")" : String("")) + ".");
        return true;
      }
      if (i == 15 || i == 30) { Serial.println(F("[4G] Pas de réponse : nouvelle impulsion d'allumage.")); impulsion(1000); }
      attendre(300);
    }
    derniereErreur = "le modem ne répond pas";
    Serial.println(F("[4G] ✖ Le modem ne répond pas. Vérifie : alimentation USB 5 V / 2 A, interrupteur de la carte, broches dans config.h."));
    return false;
  }

  // ---------- Réseau ----------
  // Enregistrement sur le réseau + données actives (jusqu'à 2 minutes)
  bool connecter() {
    reseau = false;
    if (!pret && !demarrer()) return false;
    if (!at("AT", "OK", 1000)) { pret = false; if (!demarrer()) return false; }
    at("AT+CTZU=1");                                // heure fournie par l'opérateur
    // Carte SIM
    if (!at("AT+CPIN?", "OK", 5000)) {
      derniereErreur = "carte SIM absente ou illisible";
      Serial.println("[4G] ✖ Carte SIM : " + nettoie(rep_) + " → vérifie qu'elle est bien enfoncée (puce vers la carte), modem éteint.");
      return false;
    }
    if (rep_.indexOf("SIM PIN") >= 0) {
      if (strlen(SIM_PIN) == 0) { derniereErreur = "la carte SIM demande un code PIN"; Serial.println(F("[4G] ✖ La carte SIM demande un code PIN : enlève le code PIN dans un téléphone, ou écris-le dans config.h (SIM_PIN).")); return false; }
      at(String("AT+CPIN=\"") + SIM_PIN + "\"", "OK", 5000);
      attendre(3000);
    } else if (rep_.indexOf("READY") < 0) {
      derniereErreur = "carte SIM : " + nettoie(rep_);
      Serial.println("[4G] ✖ Carte SIM : " + nettoie(rep_));
      return false;
    }
    at(String("AT+CGDCONT=1,\"IP\",\"") + APN + "\"", "OK", 3000);
    // Réglages « sans surprise » : radio allumée, choix automatique de l'opérateur et du type de réseau
    at("AT+CFUN=1", "OK", 10000);
    at("AT+COPS=0", "OK", 15000);
    at("AT+CNMP=2", "OK", 3000);
    at("AT+CEREG=0", "OK", 2000);
    Serial.print(F("[4G] Recherche du réseau"));
    // Phase 1 : choix automatique de l'opérateur (60 s)
    bool ok = attendreReseau(60);
    // Phase 2 : si rien, on force chaque opérateur belge l'un après l'autre (dernier opérateur qui a marché en premier)
    if (!ok) {
      String liste[3] = { "20620", "20601", "20610" };   // Telenet/BASE, Proximus, Orange
      if (opBon.length()) { for (int k = 0; k < 3; k++) if (liste[k] == opBon) { String t = liste[0]; liste[0] = liste[k]; liste[k] = t; } }
      for (int k = 0; k < 3 && !ok; k++) {
        Serial.print("\n[4G] Essai de l'opérateur " + liste[k] + " ");
        at(String("AT+COPS=1,2,\"") + liste[k] + "\"", "OK", 60000);
        ok = attendreReseau(30);
        if (ok) opBon = liste[k];
      }
      if (!ok) { Serial.print(F("\n[4G] Retour au choix automatique ")); at("AT+COPS=0", "OK", 15000); ok = attendreReseau(40); }
    }
    Serial.println();
    signal();
    if (!ok) {
      // Diagnostic pour comprendre pourquoi (à copier si ça se reproduit)
      at("AT+CPIN?", "OK", 3000);  Serial.println("[4G] Diagnostic SIM     : " + nettoie(rep_));
      at("AT+CEREG?", "OK", 3000); Serial.println("[4G] Diagnostic 4G      : " + nettoie(rep_) + "  (0,2 = cherche ; 0,3 = refusé ; 0,0 = arrêt)");
      at("AT+CGREG?", "OK", 3000); Serial.println("[4G] Diagnostic 2G/3G   : " + nettoie(rep_));
      at("AT+COPS?", "OK", 3000);  Serial.println("[4G] Diagnostic opérateur: " + nettoie(rep_));
      at("AT+CPSI?", "OK", 3000);  Serial.println("[4G] Diagnostic cellule : " + nettoie(rep_));
      derniereErreur = "pas de réseau 4G (signal " + String(csq) + "/31)";
      Serial.println("[4G] ✖ Pas de réseau. Signal : " + String(csq) + "/31 (99 = aucun). Vérifie l'antenne 4G (prise « LTE ») et la carte SIM.");
      return false;
    }
    if (at("AT+COPS?", "OK", 3000)) operateur = extraitGuillemets("+COPS:");
    // Données (contexte PDP n°1). Si l'APN de config.h ne donne pas d'adresse, on essaie les APN belges courants.
    const char* apns[4] = { APN, "web.be", "mworld.be", "internet.proximus.be" };
    ip = "";
    for (int k = 0; k < 4 && (!ip.length() || ip == "0.0.0.0"); k++) {
      if (k > 0) {
        if (String(apns[k]) == String(APN)) continue;
        Serial.println(String("[4G] Pas d'adresse avec l'APN précédent : essai de l'APN « ") + apns[k] + " »");
        at("AT+CGACT=0,1", "OK", 10000);
        at(String("AT+CGDCONT=1,\"IP\",\"") + apns[k] + "\"", "OK", 3000);
      }
      if (!(at("AT+CGACT?", "OK", 3000) && rep_.indexOf("+CGACT: 1,1") >= 0)) at("AT+CGACT=1,1", "OK", 30000);
      at("AT+CDNSCFG=\"8.8.8.8\",\"1.1.1.1\"", "OK", 3000);   // serveurs DNS publics (évite l'erreur 713 « DNS impossible »)
      if (at("AT+CGPADDR=1", "OK", 3000)) { String a = extrait("+CGPADDR:"); int v = a.indexOf(','); ip = v >= 0 ? a.substring(v + 1) : a; ip.replace("\"", ""); }
      if (ip.length() && ip != "0.0.0.0" && k > 0) Serial.println(String("[4G] ✔ L'APN « ") + apns[k] + " » fonctionne : écris-le dans config.h (APN).");
    }
    if (!ip.length() || ip == "0.0.0.0") {
      derniereErreur = "réseau trouvé mais pas de données (APN ?)";
      Serial.println(F("[4G] ✖ Réseau trouvé mais pas d'accès aux données : vérifie l'APN dans config.h et le forfait de la carte SIM."));
      return false;
    }
    reseau = true;
    Serial.println("[4G] ✔ Réseau : " + (operateur.length() ? operateur : String("?")) + ", signal " + String(csq) + "/31, adresse " + ip);
    return true;
  }
  // Attend l'inscription sur le réseau (secondes) ; affiche le signal toutes les 10 s
  bool attendreReseau(int secondes) {
    for (int i = 0; i < secondes; i++) {
      if (enregistre("AT+CEREG?", "+CEREG:") || enregistre("AT+CGREG?", "+CGREG:") || enregistre("AT+CREG?", "+CREG:")) return true;
      if (i % 10 == 0) { signal(); Serial.print(" [" + String(i) + " s, signal " + String(csq) + "]"); }
      else if (i % 2 == 0) Serial.print('.');
      attendre(1000);
    }
    return false;
  }
  bool encoreConnecte() {
    if (!reseau) return false;
    if (!at("AT", "OK", 1500)) { reseau = false; pret = false; return false; }
    if (enregistre("AT+CEREG?", "+CEREG:") || enregistre("AT+CGREG?", "+CGREG:")) return true;
    reseau = false;
    return false;
  }
  int signal() {
    csq = 99;
    if (at("AT+CSQ", "OK", 2000)) { String v = extrait("+CSQ:"); if (v.length()) csq = v.toInt(); }
    return csq;
  }

  // ---------- Heure ----------
  // Heure UTC : celle de l'opérateur (AT+CCLK), sinon un serveur de temps (AT+CNTP)
  bool heureUtc(uint32_t& utc) {
    if (lireCclk(utc)) { Serial.println(F("[4G] Heure donnée par l'opérateur.")); return true; }
    if (!reseau) return false;
    Serial.println(F("[4G] Heure de l'opérateur absente : serveur de temps (NTP)…"));
    at("AT+CNTP=\"pool.ntp.org\",0", "OK", 3000);
    if (atLigne("AT+CNTP", "+CNTP:", 40000) && rep_.indexOf("+CNTP: 0") >= 0 && lireCclk(utc)) {
      Serial.println(F("[4G] Heure donnée par le serveur de temps."));
      return true;
    }
    return false;
  }

  // ---------- HTTPS POST (pile HTTP du modem) ----------
  // Renvoie le code HTTP (200 = bon), ou un code d'erreur du modem (7xx), ou -1.
  // url : fonction ingest (par défaut) ou base de données ; entete : en-tête en plus (ex. « apikey: … »)
  int post(const std::string& corps, std::string& reponse, const char* url = SERVER_URL, const char* entete = nullptr) {
    reponse.clear();
    at("AT+HTTPTERM", "OK", 2000);
    if (!at("AT+HTTPINIT", "OK", 15000)) { derniereErreur = "HTTPINIT : " + nettoie(rep_); Serial.println("[4G] ✖ " + derniereErreur); return -1; }
    at("AT+CSSLCFG=\"sslversion\",0,4", "OK", 2000);
    at("AT+CSSLCFG=\"authmode\",0,0", "OK", 2000);
    at("AT+CSSLCFG=\"enableSNI\",0,1", "OK", 2000);
    at("AT+HTTPPARA=\"SSLCFG\",0", "OK", 2000);
    if (!at(String("AT+HTTPPARA=\"URL\",\"") + url + "\"", "OK", 5000)) { derniereErreur = "URL refusée"; terminer(); return -1; }
    at("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);
    if (entete && entete[0] && !at(String("AT+HTTPPARA=\"USERDATA\",\"") + entete + "\"", "OK", 2000))
      Serial.println("[4G] ⚠ Le modem refuse l'en-tête HTTP en plus : " + nettoie(rep_));
    int code = -1;
    if (!at("AT+HTTPDATA=" + String((unsigned)corps.size()) + ",30", "DOWNLOAD", 8000)) {
      derniereErreur = "HTTPDATA : " + nettoie(rep_); Serial.println("[4G] ✖ " + derniereErreur); terminer(); return -1;
    }
    for (size_t i = 0; i < corps.size(); i += 512) {
      size_t n = corps.size() - i < 512 ? corps.size() - i : 512;
      s_.write((const uint8_t*)corps.data() + i, n);
      if (idle) idle();
    }
    if (!attendreTexte("OK", 15000)) { derniereErreur = "envoi des données au modem"; terminer(); return -1; }
    if (!at("AT+HTTPACTION=1", "OK", 5000)) { derniereErreur = "HTTPACTION : " + nettoie(rep_); terminer(); return -1; }
    if (attendreTexte("+HTTPACTION:", 120000, true)) {
      int p = rep_.indexOf("+HTTPACTION:");
      int v1 = rep_.indexOf(',', p), v2 = v1 >= 0 ? rep_.indexOf(',', v1 + 1) : -1;
      if (v1 > 0) code = rep_.substring(v1 + 1).toInt();
      int lon = v2 > 0 ? rep_.substring(v2 + 1).toInt() : 0;
      if (lon > 0 && lon < 3000 && at("AT+HTTPREAD=0," + String(lon), "+HTTPREAD: 0", 10000)) {
        int a = rep_.indexOf('{'), b = rep_.lastIndexOf('}');
        if (a >= 0 && b > a) reponse = rep_.substring(a, b + 1).c_str();
      }
    } else derniereErreur = "pas de réponse du serveur (délai dépassé)";
    terminer();
    if (code != 200 && code > 0) derniereErreur = "réponse " + String(code) + (reponse.size() ? " " + String(reponse.c_str()) : String(""));
    return code;
  }

  // ---------- v1.5 : UDP (carte 1NCE : le boîtier écoute un port) ----------
  // Le modem ouvre un port UDP local et l'écoute : le Device Controller de 1NCE peut alors lui envoyer un petit
  // message (ex. « lire ») sans que le boîtier ait rien demandé. Un message qui arrive pendant une autre commande
  // du modem (envoi HTTPS…) est gardé de côté : il n'est pas perdu. Tout est affiché dans le Moniteur série.
  bool udpPret = false;
  // v1.5.1 : DEUX liaisons. La liaison 0 ne fait QU'ÉCOUTER le port 3000 : si on envoie avec elle, le modem la « colle »
  // à l'adresse de 1NCE (10.60.8.90:4445) et refuse ensuite le « lire » du Device Controller, qui vient d'une autre
  // adresse (constaté sur un vrai boîtier : « lire » reçu seulement après AT+CIPCLOSE=0 + AT+CIPOPEN, sans envoi).
  // Les messages vers 1NCE partent par la liaison 1 (port local 3001). Si la liaison 1 ne s'ouvre pas, repli sur la 0.
  int udpLienEnvoi = 0;
  bool udpOuvrir(int portLocal) {
    udpPret = false; udpBuf_.clear(); udpLigne_.clear(); udpDepuis_ = 0; udpManuel_ = false; udpLienEnvoi = 0;
    at("AT+CIPCLOSE=0", "OK", 3000);                                   // ancienne liaison éventuelle (une erreur ici est normale)
    at("AT+CIPCLOSE=1", "OK", 3000);
    at("AT+CSOCKSETPN=1", "OK", 3000);                                 // contexte de données n°1 (celui de l'APN)
    at("AT+CIPRXGET=0", "OK", 2000);                                   // les messages reçus sont donnés tout seuls
    at("AT+CIPSRIP=1", "OK", 2000);                                    // avec l'adresse de l'expéditeur (« RECV FROM: »)
    at("AT+CIPHEAD=1", "OK", 2000);                                    // et la longueur du message (« +IPD »)
    atLigne("AT+NETOPEN", "+NETOPEN:", 30000);
    Serial.println("[UDP] NETOPEN → " + nettoie(rep_));
    if (rep_.indexOf("+NETOPEN: 0") < 0 && rep_.indexOf("already") < 0) { derniereErreur = "NETOPEN : " + nettoie(rep_); return false; }
    atLigne(String("AT+CIPOPEN=0,\"UDP\",,,") + String(portLocal), "+CIPOPEN:", 15000);
    Serial.println("[UDP] CIPOPEN → " + nettoie(rep_));
    if (rep_.indexOf("+CIPOPEN: 0,0") < 0) { derniereErreur = "CIPOPEN : " + nettoie(rep_); return false; }
    atLigne(String("AT+CIPOPEN=1,\"UDP\",,,") + String(portLocal + 1), "+CIPOPEN:", 15000);   // liaison d'envoi vers 1NCE
    if (rep_.indexOf("+CIPOPEN: 1,0") >= 0) udpLienEnvoi = 1;
    else Serial.println("[UDP] ⚠ Liaison d'envoi (1) impossible : " + nettoie(rep_) + " — repli : envoi par la liaison d'écoute (le « lire » pourra être refusé après le premier envoi).");
    udpPret = true;
    return true;
  }
  // Adresse IP d'un nom (ex. udp.os.1nce.com)
  bool udpResoudre(const char* hote, String& ipOut) {
    atLigne(String("AT+CDNSGIP=\"") + hote + "\"", "+CDNSGIP:", 20000);
    std::string s(rep_.c_str());
    size_t p = s.find("+CDNSGIP: 1");
    if (p == std::string::npos) { Serial.println("[UDP] DNS → " + nettoie(rep_)); return false; }
    size_t e = s.find('\n', p); if (e == std::string::npos) e = s.size();
    size_t q2 = s.rfind('"', e), q1 = (q2 == std::string::npos || q2 == 0) ? std::string::npos : s.rfind('"', q2 - 1);
    if (q1 == std::string::npos || q2 <= q1 + 1 || q1 < p) return false;
    ipOut = String(s.substr(q1 + 1, q2 - q1 - 1).c_str());
    return true;
  }
  // Envoie un petit message UDP (508 octets au plus chez 1NCE)
  bool udpEnvoyer(const String& ip, int port, const String& texte) {
    if (!udpPret) return false;
    if (!at(String("AT+CIPSEND=") + String(udpLienEnvoi) + "," + String((unsigned)texte.length()) + ",\"" + ip + "\"," + String(port), ">", 5000)) { derniereErreur = "CIPSEND : " + nettoie(rep_); return false; }
    s_.print(texte);
    if (!attendreTexte("+CIPSEND:", 10000, true)) { derniereErreur = "CIPSEND (pas de confirmation)"; return false; }
    return rep_.indexOf("ERROR") < 0;
  }
  // Lit ce que le modem donne tout seul. Vrai si un message UDP est arrivé (donnees = le message, depuis = « adresse:port »).
  // Formats acceptés : « RECV FROM:ip:port » puis « +IPD<n> » ou « +RECEIVE,<lien>,<n> » puis le message ;
  // « RECV FROM » suivi directement du message ; ou « +CIPRXGET: 1,… » (le message est alors demandé au modem).
  bool udpRecu(std::string& donnees, std::string& depuis) {
    const size_t NP = std::string::npos;
    while (s_.available()) garderUdp((char)s_.read(), true);
    if (udpBuf_.find("+CIPEVENT") != NP || udpBuf_.find("+IPCLOSE") != NP) {
      Serial.println(F("[UDP] ⚠ Le modem a fermé la liaison UDP : réouverture dans 1 minute."));
      udpPret = false; udpBuf_.clear(); udpDepuis_ = 0; return false;
    }
    if (udpManuel_) {                                                  // mode « à la demande » : on réclame le message au modem
      udpManuel_ = false;
      if (atLigne("AT+CIPRXGET=2,0,1400", "+CIPRXGET: 2,", 5000)) {
        attendre(30); while (s_.available()) rep_ += (char)s_.read();
        std::string s(rep_.c_str());
        size_t p = s.find("+CIPRXGET: 2,"), e = p == NP ? NP : s.find('\n', p);
        if (e != NP) {
          size_t v1 = s.find(',', p + 13), v2 = v1 == NP ? NP : s.find(',', v1 + 1);   // +CIPRXGET: 2,<lien>,<lu>,<reste>
          int lon = (v1 != NP && v2 != NP && v2 < e) ? atoi(s.c_str() + v1 + 1) : 0;
          if (lon > 0 && e + 1 + (size_t)lon <= s.size()) { donnees = s.substr(e + 1, (size_t)lon); depuis.clear(); return true; }
        }
      }
      return false;
    }
    size_t d0 = marqueur(udpBuf_, 0);
    if (d0 == NP) { if (udpBuf_.size() > 1500) udpBuf_.erase(0, udpBuf_.size() - 200); return false; }
    if (d0 > 0) udpBuf_.erase(0, d0);
    if (!udpDepuis_) { udpDepuis_ = millis(); if (!udpDepuis_) udpDepuis_ = 1; }
    bool tropVieux = millis() - udpDepuis_ > 2000;                    // message resté incomplet : abandonné
    depuis.clear();
    size_t pos = 0;
    if (udpBuf_.compare(0, 10, "RECV FROM:") == 0) {
      size_t e = udpBuf_.find('\n');
      if (e == NP) { if (tropVieux) { udpBuf_.clear(); udpDepuis_ = 0; } return false; }
      depuis = udpBuf_.substr(10, e - 10);
      while (!depuis.empty() && (depuis.back() == '\r' || depuis.back() == ' ')) depuis.pop_back();
      pos = e + 1;
      while (pos < udpBuf_.size() && (udpBuf_[pos] == '\r' || udpBuf_[pos] == '\n')) pos++;
    }
    int lon = -1; size_t dp = NP;
    if (udpBuf_.compare(pos, 4, "+IPD") == 0 || udpBuf_.compare(pos, 9, "+RECEIVE,") == 0) {
      size_t e = udpBuf_.find('\n', pos);
      if (e == NP) { if (tropVieux) { udpBuf_.clear(); udpDepuis_ = 0; } return false; }
      if (udpBuf_[pos + 1] == 'I') lon = atoi(udpBuf_.c_str() + pos + 4);
      else { size_t v = udpBuf_.find(',', pos + 9); lon = (v != NP && v < e) ? atoi(udpBuf_.c_str() + v + 1) : 0; }
      dp = e + 1;
    } else {
      // « RECV FROM » sans longueur : le message est ce qui suit (300 ms pour qu'il arrive en entier)
      if (pos == 0) { udpBuf_.erase(0, 1); udpDepuis_ = 0; return false; }
      if (millis() - udpDepuis_ < 300) return false;
      size_t fin = marqueur(udpBuf_, pos); if (fin == NP) fin = udpBuf_.size();
      donnees = udpBuf_.substr(pos, fin - pos);
      while (!donnees.empty() && (donnees.back() == '\r' || donnees.back() == '\n')) donnees.pop_back();
      udpBuf_.erase(0, fin); udpDepuis_ = 0;
      return !donnees.empty();
    }
    if (lon <= 0 || lon > 1460) { udpBuf_.erase(0, dp); udpDepuis_ = 0; return false; }
    if (udpBuf_.size() < dp + (size_t)lon) { if (tropVieux) { udpBuf_.erase(0, dp); udpDepuis_ = 0; } return false; }
    donnees = udpBuf_.substr(dp, (size_t)lon);
    udpBuf_.erase(0, dp + (size_t)lon); udpDepuis_ = 0;
    return true;
  }

  // ---------- Commande tapée dans le Moniteur série (dépannage) ----------
  String passerelle(const String& cmd, uint32_t delai = 8000) {
    at(cmd, "OK", delai);
    return rep_;
  }

  // ---------- Commande AT ----------
  bool at(const String& cmd, const char* attendu = "OK", uint32_t delai = 2000) { return envoyer(cmd, attendu, delai, false); }
  // Même chose, mais attend la ligne complète qui contient le texte attendu
  bool atLigne(const String& cmd, const char* attendu, uint32_t delai) { return envoyer(cmd, attendu, delai, true); }

 private:
  HardwareSerial& s_;
  String rep_;
  std::string udpBuf_;                // v1.5 : ce que le modem a donné tout seul (messages UDP reçus)
  std::string udpLigne_;              // v1.5 : ligne en cours de ce qui arrive tout seul (pour le diagnostic)
  uint32_t udpDepuis_ = 0;            // v1.5 : début de l'attente d'un message incomplet
  bool udpManuel_ = false;            // v1.5 : le modem garde le message et attend qu'on le lui demande
  size_t repVu_ = 0;                  // v1.5 : partie de rep_ déjà regardée pour les messages UDP
  bool repMiroir_ = false;            // v1.5 : un message UDP a commencé dans rep_ : la suite est gardée aussi
  static size_t marqueur(const std::string& b, size_t de) {
    size_t m = std::string::npos;
    for (const char* k : { "RECV FROM:", "+IPD", "+RECEIVE," }) { size_t x = b.find(k, de); if (x < m) m = x; }
    return m;
  }
  // v1.5 : un octet donné tout seul par le modem (hors commande, ou pendant une commande) : gardé pour l'écoute UDP.
  // Les lignes spontanées inconnues qui parlent de la liaison sont affichées (diagnostic du premier essai).
  void garderUdp(char c, bool horsCommande) {
    if (!udpPret) return;
    udpBuf_ += c;
    if (!horsCommande) return;
    if (c != '\n') { if (udpLigne_.size() < 120) udpLigne_ += c; return; }
    std::string l = udpLigne_; udpLigne_.clear();
    while (!l.empty() && (l.back() == '\r' || l.back() == ' ')) l.pop_back();
    if (l.compare(0, 12, "+CIPRXGET: 1") == 0) { udpManuel_ = true; return; }
    if ((l.compare(0, 4, "+CIP") == 0 || l.compare(0, 4, "+IPC") == 0 || l.compare(0, 4, "+NET") == 0) && l.compare(0, 9, "+CIPSEND:") != 0)
      Serial.println(String("[UDP] (modem) ") + String(l.c_str()));
  }
  // v1.5 : à la fin d'une commande, ce qui ressemble à un message UDP reçu pendant l'attente est gardé de côté
  void repVersUdp() {
    if (!udpPret) return;
    std::string r(rep_.c_str());
    if (repVu_ > r.size()) repVu_ = 0;
    if (!repMiroir_) {
      size_t m = marqueur(r, repVu_);
      if (m == std::string::npos) { repVu_ = r.size() > 12 ? r.size() - 12 : 0; return; }   // un marqueur peut être coupé en deux
      repMiroir_ = true; repVu_ = m;
    }
    for (size_t i = repVu_; i < r.size(); i++) udpBuf_ += r[i];
    repVu_ = r.size();
  }

  bool envoyer(const String& cmd, const char* attendu, uint32_t delai, bool ligne) {
    while (s_.available()) garderUdp((char)s_.read(), true);            // v1.5 : un message UDP arrivé juste avant n'est pas jeté
    s_.print(cmd); s_.print("\r\n");
    rep_ = ""; repVu_ = 0; repMiroir_ = false;
    return attendreTexte(attendu, delai, ligne);
  }
  void attendre(uint32_t ms) { uint32_t t0 = millis(); while (millis() - t0 < ms) { if (idle) idle(); delay(1); } }
  void impulsion(uint32_t ms) {
    pinMode(MODEM_PWRKEY_PIN, OUTPUT);
    digitalWrite(MODEM_PWRKEY_PIN, LOW);  attendre(100);
    digitalWrite(MODEM_PWRKEY_PIN, HIGH); attendre(ms);
    digitalWrite(MODEM_PWRKEY_PIN, LOW);
  }
  // Attend un texte dans la réponse ; ligne complète si demandé. Faux sur « ERROR » ou délai dépassé.
  bool attendreTexte(const char* attendu, uint32_t delai, bool ligne = false) {
    bool r = attendreTexte0(attendu, delai, ligne);
    repVersUdp();                                                       // v1.5 : message UDP reçu pendant l'attente → gardé
    return r;
  }
  bool attendreTexte0(const char* attendu, uint32_t delai, bool ligne) {
    uint32_t t0 = millis();
    while (millis() - t0 < delai) {
      while (s_.available()) rep_ += (char)s_.read();
      int p = rep_.indexOf(attendu);
      if (p >= 0) {
        if (!ligne) { attendre(5); while (s_.available()) rep_ += (char)s_.read(); return true; }
        if (rep_.indexOf('\n', p) > p) return true;
      }
      if (rep_.indexOf("ERROR") >= 0 && strcmp(attendu, "ERROR") != 0) { attendre(20); while (s_.available()) rep_ += (char)s_.read(); return false; }
      if (rep_.length() > 6000) { repVersUdp(); rep_ = rep_.substring(rep_.length() - 3000); repVu_ = rep_.length(); }
      if (idle) idle();
      delay(1);
    }
    return false;
  }
  void terminer() { at("AT+HTTPTERM", "OK", 3000); }
  // Valeur après « +XXX: » (jusqu'à la fin de la ligne)
  String extrait(const char* cle) {
    int p = rep_.indexOf(cle); if (p < 0) return "";
    int a = p + strlen(cle), b = rep_.indexOf('\n', a);
    String v = rep_.substring(a, b < 0 ? rep_.length() : b); v.trim();
    return v;
  }
  String extraitGuillemets(const char* cle) {
    String v = extrait(cle); int a = v.indexOf('"'), b = a >= 0 ? v.indexOf('"', a + 1) : -1;
    return (a >= 0 && b > a) ? v.substring(a + 1, b) : "";
  }
  static String nettoie(String r) { r.replace("\r", " "); r.replace("\n", " "); r.trim(); while (r.indexOf("  ") >= 0) r.replace("  ", " "); return r.length() > 80 ? r.substring(0, 80) : r; }
  // +CEREG: n,stat : 1 = réseau de l'opérateur, 5 = itinérance
  bool enregistre(const char* cmd, const char* cle) {
    if (!at(cmd, "OK", 2000)) return false;
    String v = extrait(cle); int c = v.indexOf(',');
    if (c < 0) return false;
    int stat = v.substring(c + 1).toInt();
    return stat == 1 || stat == 5;
  }
  bool lireCclk(uint32_t& utc) {
    if (!at("AT+CCLK?", "OK", 2000)) return false;
    int p = rep_.indexOf("+CCLK: \"");
    if (p < 0) return false;
    return horloge::depuisCclk(rep_.c_str() + p + 8, utc);
  }
};

}  // namespace ba
