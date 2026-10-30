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
  String operateur, ip, derniereErreur;

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
    bool ok = false;
    for (int i = 0; i < 150 && !ok; i++) {
      ok = enregistre("AT+CEREG?", "+CEREG:") || enregistre("AT+CGREG?", "+CGREG:") || enregistre("AT+CREG?", "+CREG:");
      if (!ok) {
        if (i % 10 == 0) { signal(); Serial.print(" [" + String(i) + " s, signal " + String(csq) + "]"); }
        else if (i % 2 == 0) Serial.print('.');
        attendre(1000);
      }
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
    // Données (contexte PDP n°1)
    if (!(at("AT+CGACT?", "OK", 3000) && rep_.indexOf("+CGACT: 1,1") >= 0)) at("AT+CGACT=1,1", "OK", 30000);
    ip = "";
    if (at("AT+CGPADDR=1", "OK", 3000)) { String a = extrait("+CGPADDR:"); int v = a.indexOf(','); ip = v >= 0 ? a.substring(v + 1) : a; ip.replace("\"", ""); }
    if (!ip.length() || ip == "0.0.0.0") {
      derniereErreur = "réseau trouvé mais pas de données (APN ?)";
      Serial.println(F("[4G] ✖ Réseau trouvé mais pas d'accès aux données : vérifie l'APN dans config.h et le forfait de la carte SIM."));
      return false;
    }
    reseau = true;
    Serial.println("[4G] ✔ Réseau : " + (operateur.length() ? operateur : String("?")) + ", signal " + String(csq) + "/31, adresse " + ip);
    return true;
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
  // Renvoie le code HTTP (200 = bon), ou un code d'erreur du modem (7xx), ou -1
  int post(const std::string& corps, std::string& reponse) {
    reponse.clear();
    at("AT+HTTPTERM", "OK", 2000);
    if (!at("AT+HTTPINIT", "OK", 15000)) { derniereErreur = "HTTPINIT : " + nettoie(rep_); Serial.println("[4G] ✖ " + derniereErreur); return -1; }
    at("AT+CSSLCFG=\"sslversion\",0,4", "OK", 2000);
    at("AT+CSSLCFG=\"authmode\",0,0", "OK", 2000);
    at("AT+CSSLCFG=\"enableSNI\",0,1", "OK", 2000);
    at("AT+HTTPPARA=\"SSLCFG\",0", "OK", 2000);
    if (!at(String("AT+HTTPPARA=\"URL\",\"") + SERVER_URL + "\"", "OK", 5000)) { derniereErreur = "URL refusée"; terminer(); return -1; }
    at("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);
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

  bool envoyer(const String& cmd, const char* attendu, uint32_t delai, bool ligne) {
    while (s_.available()) s_.read();
    s_.print(cmd); s_.print("\r\n");
    rep_ = "";
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
    uint32_t t0 = millis();
    while (millis() - t0 < delai) {
      while (s_.available()) rep_ += (char)s_.read();
      int p = rep_.indexOf(attendu);
      if (p >= 0) {
        if (!ligne) { attendre(5); while (s_.available()) rep_ += (char)s_.read(); return true; }
        if (rep_.indexOf('\n', p) > p) return true;
      }
      if (rep_.indexOf("ERROR") >= 0 && strcmp(attendu, "ERROR") != 0) { attendre(20); while (s_.available()) rep_ += (char)s_.read(); return false; }
      if (rep_.length() > 6000) rep_ = rep_.substring(rep_.length() - 3000);
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
