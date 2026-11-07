// ============================================================
// BROODAUTOMATE — Lecture DEX-UCS (v1.4) : FAS 480/5 et autres machines « DEX »
// La machine (commande 90 = 6, sortie RS232) répond au boîtier :
//   boîtier → ENQ (05) ; machine → DLE 0 (10 30) ; boîtier → demande de lecture (DLE SOH … DLE ETX CRC) ;
//   machine → DLE 1 ; boîtier → EOT ; puis la machine devient « maître » : réponse d'identification,
//   puis les blocs de données (DLE STX … DLE ETB/ETX CRC), chacun acquitté par DLE 0 / DLE 1.
// Lecture seule : aucune écriture dans la machine, aucun compteur remis à zéro par le boîtier.
// Ce fichier ne dépend pas d'Arduino : il est essayé sur ordinateur.
// ============================================================
#pragma once
#include <stdint.h>
#include <initializer_list>
#include <string>
#include <vector>

namespace ba {
namespace dex {

enum : uint8_t { SOH = 1, STX = 2, ETX = 3, EOT = 4, ENQ = 5, DLE = 0x10, NAK = 0x15, SYN = 0x16, ETB = 0x17 };

inline uint16_t crc16(const std::vector<uint8_t>& b) {
  uint16_t c = 0;
  for (uint8_t x : b) { c ^= x; for (int i = 0; i < 8; i++) c = (c & 1) ? (uint16_t)((c >> 1) ^ 0xA001) : (uint16_t)(c >> 1); }
  return c;
}

// Trame « première poignée de main » : le boîtier demande à LIRE (R)
inline std::vector<uint8_t> demandeLecture(const std::string& identifiant, const std::string& version) {
  std::vector<uint8_t> p;
  for (char c : identifiant) p.push_back((uint8_t)c);
  p.push_back('R');
  for (char c : version) p.push_back((uint8_t)c);
  std::vector<uint8_t> z = p; z.push_back(ETX);
  uint16_t c = crc16(z);
  std::vector<uint8_t> t = {DLE, SOH};
  t.insert(t.end(), p.begin(), p.end());
  t.push_back(DLE); t.push_back(ETX); t.push_back((uint8_t)(c & 255)); t.push_back((uint8_t)(c >> 8));
  return t;
}

// IO : même forme que MoteurDdcmp::Io (available, read, write, ms, wait)
template <class IO>
class Lecteur {
 public:
  explicit Lecteur(IO& io) : io_(io) {}
  std::string erreur;          // dernière raison d'échec (en français, affichée dans Broodautomate)

  // Une machine « DEX » répond DLE 0 (10 30) à un ENQ (05). Une Power Lift ne répond rien (ou autre chose).
  bool sonde(int essais = 3) {
    for (int i = 0; i < essais; i++) {
      vider();
      envoyer({ENQ});
      int a = octet(1200);
      if (a == DLE) { int b = octet(300); if (b == '0') { envoyer({EOT}); io_.wait(300); vider(); return true; } }
      io_.wait(300);
    }
    return false;
  }

  // Lecture complète. Vrai si le texte du relevé (DXS … DXE) est complet.
  bool lire(std::string& texte, const std::string& identifiant = "BRD0000001") {
    static const char* versions[2] = {"R01L01", "R00L06"};
    for (int v = 0; v < 2; v++) {
      int etape = 0;
      if (tenter(texte, identifiant, versions[v], etape)) return true;
      // la machine n'a pas accepté la demande : on essaie l'autre version ; si elle a répondu plus loin, on n'insiste pas
      io_.wait(2500); vider();
      if (etape >= 2) break;
    }
    return false;
  }

 private:
  IO& io_;
  void vider() { while (io_.available()) io_.read(); }
  void envoyer(std::initializer_list<uint8_t> l) { std::vector<uint8_t> v(l); io_.write(v.data(), v.size()); }
  void envoyerV(const std::vector<uint8_t>& v) { io_.write(v.data(), v.size()); }
  int octet(uint32_t ms) {
    uint32_t t0 = io_.ms();
    for (;;) {
      if (io_.available()) return io_.read();
      if ((uint32_t)(io_.ms() - t0) >= ms) return -1;
      io_.wait(1);
    }
  }
  bool attendre(std::initializer_list<uint8_t> l, uint32_t ms, const char* quoi) {
    for (uint8_t attendu : l) {
      int b = octet(ms);
      if (b < 0) { erreur = std::string("La machine n'a pas répondu (") + quoi + ")."; return false; }
      if (b != attendu) { erreur = std::string("Réponse inattendue de la machine (") + quoi + ")."; return false; }
    }
    return true;
  }
  struct Bloc { std::vector<uint8_t> data; bool dernier = false; bool crcOk = false; bool eot = false; };
  // lit « DLE SOH|STX … DLE ETB|ETX CRC CRC » ; ou un EOT seul
  bool bloc(Bloc& b, uint32_t ms) {
    b = Bloc();
    bool debut = false;
    for (;;) {
      int c = octet(ms);
      if (c < 0) { erreur = "Le relevé de la machine s'est arrêté avant la fin."; return false; }
      if (c == DLE) {
        int n = octet(ms);
        if (n < 0) { erreur = "Le relevé de la machine s'est arrêté avant la fin."; return false; }
        if (n == SYN) continue;
        if (n == SOH || n == STX) { debut = true; b.data.clear(); continue; }
        if (debut && (n == ETX || n == ETB)) {
          int c1 = octet(ms), c2 = octet(ms);
          if (c1 < 0 || c2 < 0) { erreur = "Fin de bloc incomplète."; return false; }
          std::vector<uint8_t> z = b.data; z.push_back((uint8_t)n);
          b.crcOk = crc16(z) == (uint16_t)(c1 | (c2 << 8));
          b.dernier = (n == ETX);
          return true;
        }
        continue;
      }
      if (c == EOT && !debut) { b.eot = true; return true; }
      if (debut) b.data.push_back((uint8_t)c);
    }
  }
  bool tenter(std::string& texte, const std::string& id, const char* version, int& etape) {
    erreur.clear(); texte.clear();
    vider();
    // 1. première poignée de main : nous sommes maître
    envoyer({ENQ});
    if (!attendre({DLE, '0'}, 2300, "ENQ")) return false;
    etape = 1;
    envoyerV(demandeLecture(id, version));
    if (!attendre({DLE, '1'}, 2300, "demande de lecture")) return false;
    etape = 2;
    envoyer({EOT});
    // 2. seconde poignée de main : la machine est maître
    if (!attendre({ENQ}, 5000, "début de la réponse")) return false;
    envoyer({DLE, '0'});
    Bloc b;
    if (!bloc(b, 2300)) return false;
    if (!b.crcOk) { erreur = "Identification de la machine abîmée."; return false; }
    if (b.data.size() < 2 || b.data[0] != '0' || b.data[1] != '0') { erreur = "La machine refuse la lecture (code " + std::string((const char*)b.data.data(), b.data.size() < 2 ? b.data.size() : 2) + ")."; return false; }
    envoyer({DLE, '1'});
    if (!attendre({EOT}, 3000, "fin de l'identification")) return false;
    // 3. les données
    if (!attendre({ENQ}, 5000, "début des données")) return false;
    envoyer({DLE, '0'});
    int ack = 1, nb = 0, nak = 0;
    for (;;) {
      if (!bloc(b, 2300)) return false;
      if (b.eot) { erreur = "La machine a fermé la lecture trop tôt."; return false; }
      if (!b.crcOk) {
        if (++nak > 3) { erreur = "Blocs de la machine abîmés (CRC faux)."; return false; }
        envoyer({NAK}); continue;
      }
      nak = 0;
      texte.append((const char*)b.data.data(), b.data.size());
      envoyer({DLE, (uint8_t)('0' + ack)}); ack ^= 1; nb++;
      if (b.dernier) break;
      if (nb > 60) { erreur = "Relevé de la machine trop long."; return false; }
    }
    attendre({EOT}, 3000, "fin de la lecture");   // pas bloquant si elle manque
    // un relevé DEX complet commence par DXS et finit par DXE
    if (texte.compare(0, 3, "DXS") != 0 || texte.find("DXE") == std::string::npos) { erreur = "Relevé reçu incomplet (sans DXS … DXE)."; return false; }
    return true;
  }
};

}  // namespace dex
}  // namespace ba
