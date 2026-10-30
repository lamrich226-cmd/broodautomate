// ============================================================
// BROODAUTOMATE — Liaison RS232 EVA-DTS « Enhanced DDCMP » pour le boîtier 4G
// Copie fidèle, en C++, du moteur de serial.js (Broodautomate v3.2 / v5) :
// mêmes trames, mêmes délais, mêmes réponses, même liste de sécurité.
//
//   • le BOÎTIER est MAÎTRE : START → STACK → Who Are You → Read Data (liste 2 :
//     lecture de contrôle, rien n'est remis à zéro) → blocs → FINISH → ACK ;
//   • la MACHINE est MAÎTRE (commande 90 « télémétrie » = 1, ou bouton
//     « envoyer un événement ») : elle envoie START, Who Are You, Write Data,
//     ses blocs, puis FINISH. Le boîtier répond STACK, 88 E0 01, 88 E3 01 et ACK.
//
// SÉCURITÉ : le boîtier n'envoie QUE START, STACK, ACK, NACK, Who Are You (codes
// de sécurité 00 00 00 00), Read Data (listes 1 ou 2), FINISH, et les réponses
// 88 E0 01 / 88 E3 01 / refus 88 Ex 00. Toute autre trame est bloquée avant
// l'envoi (autorise()). Aucune commande d'écriture ni d'effacement.
//
// Ce fichier ne dépend pas d'Arduino : il est essayé sur ordinateur.
// ============================================================
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
#include <string>
#include <vector>

namespace ba {

struct HeureLocale { uint8_t jour, mois, annee2, heure, minute, seconde; };

// ---------------- Outils DDCMP (BA.DDCMP de serial.js) ----------------
namespace ddcmp {
typedef std::vector<uint8_t> Octets;
static const uint8_t ENQ = 0x05, SOH = 0x81;
static const uint8_t ACK = 1, NACK = 2, START = 6, STACK = 7;

inline uint16_t crc16(const uint8_t* d, size_t n) {
  uint16_t c = 0;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int k = 0; k < 8; k++) c = (c & 1) ? (uint16_t)((c >> 1) ^ 0xA001) : (uint16_t)(c >> 1);
  }
  return c;
}
inline void avecCrc(Octets& o) { uint16_t c = crc16(o.data(), o.size()); o.push_back(c & 0xFF); o.push_back(c >> 8); }

// Trame de contrôle : 05 TYPE (40|code) b4 b5 ADRESSE CRC(2)
inline Octets controle(uint8_t type, uint8_t b4, uint8_t b5, uint8_t sadd, uint8_t code = 0) {
  Octets o = {ENQ, type, (uint8_t)(0x40 | (code & 0x3F)), b4, b5, sadd};
  avecCrc(o);
  return o;
}
inline Octets start(uint8_t sadd, uint8_t mbd = 0) { return controle(START, 0, mbd, sadd); }
inline Octets stack(uint8_t sbd, uint8_t mbd, uint8_t sadd) { return controle(STACK, sbd, mbd, sadd); }
inline Octets ack(uint8_t rr, uint8_t sadd) { return controle(ACK, rr, 0, sadd); }
inline Octets nack(uint8_t rr, uint8_t code, uint8_t sadd) { return controle(NACK, rr, 0, sadd, code); }

// Message de données : 81 nn mm rr xx sadd CRC(2) + DONNÉES + CRC(2)
inline Octets message(const Octets& corps, uint8_t rr, uint8_t xx, uint8_t sadd, bool select = false) {
  size_t n = corps.size();
  Octets o = {SOH, (uint8_t)(n & 0xFF), (uint8_t)((select ? 0x80 : 0) | 0x40 | ((n >> 8) & 0x3F)), rr, xx, sadd};
  avecCrc(o);
  o.insert(o.end(), corps.begin(), corps.end());
  uint16_t c = crc16(corps.data(), n);
  o.push_back(c & 0xFF); o.push_back(c >> 8);
  return o;
}

inline uint8_t bcd(int n) { return (uint8_t)((((n / 10) % 10) << 4) | (n % 10)); }

// Who Are You : 77 E0 00 S2 S1 P2 P1 JJ MM AA HH MM SS U2 U1 A
// Codes de sécurité et de passe TOUJOURS à 0 (un code non nul serait enregistré comme nouveau mot de passe).
inline Octets whoAreYou(const HeureLocale& h, const char* utilisateur = "BA", uint8_t type = 0x0B) {
  char u0 = (utilisateur && utilisateur[0]) ? utilisateur[0] : ' ';
  char u1 = (utilisateur && utilisateur[0] && utilisateur[1]) ? utilisateur[1] : ' ';
  return Octets{0x77, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00,
                bcd(h.jour), bcd(h.mois), bcd(h.annee2 % 100), bcd(h.heure), bcd(h.minute), bcd(h.seconde),
                (uint8_t)(u0 & 0x7F), (uint8_t)(u1 & 0x7F), (uint8_t)(type == 0x0C ? 0x0C : 0x0B)};
}
// Read Data : 77 E2 00 liste 01 (enregistrement) 00 00 (décalage) 00 00 (tout)
inline Octets readData(uint8_t liste) { return Octets{0x77, 0xE2, 0x00, liste, 0x01, 0x00, 0x00, 0x00, 0x00}; }
inline Octets finish() { return Octets{0x77, 0xFF}; }
// Who Are You accepté : 88 E0 01 S2 S1 P2 P1 #8…#1 V1 M1 rd 00 msdb lsdb
inline Octets reponseWay(const char* serie8) {
  std::string s = serie8 ? serie8 : "";
  for (auto& ch : s) if ((unsigned char)ch < 0x20 || (unsigned char)ch > 0x7E) ch = '0';
  if (s.size() < 8) s = std::string(8 - s.size(), '0') + s;
  s = s.substr(s.size() - 8);
  Octets o = {0x88, 0xE0, 0x01, 0x00, 0x00, 0x00, 0x00};
  for (char ch : s) o.push_back((uint8_t)ch);
  for (int i = 0; i < 6; i++) o.push_back(0);
  return o;
}
inline Octets reponseWrite() { return Octets{0x88, 0xE3, 0x01}; }
inline Octets refus(uint8_t commande) { return commande == 0xE5 ? Octets{0x88, 0xE5, 0x00, 0x00} : Octets{0x88, commande, 0x00}; }

// ---------- Liste blanche : la seule protection contre une mauvaise commande ----------
inline bool autorise(const uint8_t* o, size_t len) {
  if (!o || len < 8) return false;
  if (o[0] == ENQ) {
    if (len != 8 || (o[2] & 0x80)) return false;                  // select toujours à 0
    return o[1] == ACK || o[1] == NACK || o[1] == START || o[1] == STACK;
  }
  if (o[0] != SOH) return false;
  size_t n = o[1] | ((o[2] & 0x3F) << 8);
  if (len != 10 + n) return false;
  const uint8_t* c = o + 8;
  auto zero = [&](size_t d, size_t f) { for (size_t k = d; k < f; k++) if (k >= n || c[k] != 0) return false; return true; };
  if (n >= 2 && c[0] == 0x77) {
    if (c[1] == 0xE0) return n == 16 && zero(2, 7);                // Who Are You, codes à 0
    if (c[1] == 0xE2) return n == 9 && c[2] == 0 && (c[3] == 1 || c[3] == 2) && c[4] == 1 && zero(5, 9);
    if (c[1] == 0xFF) return n == 2;                               // Finish
    return false;                                                  // écriture / effacement : interdit
  }
  if (n >= 3 && c[0] == 0x88) {
    if (c[1] == 0xE0 && c[2] == 0x01) return n == 21 && zero(3, 7);
    if (c[1] == 0xE3 && c[2] == 0x01) return n == 3;
    if (c[2] == 0x00) {
      if (c[1] == 0xE0 || c[1] == 0xE1 || c[1] == 0xE2 || c[1] == 0xE3 || c[1] == 0xE4 || c[1] == 0xE6) return n == 3;
      return c[1] == 0xE5 && n == 4;
    }
    return false;
  }
  return false;
}

inline std::string hex(const uint8_t* o, size_t n, size_t max = 64) {
  std::string s; char b[4];
  for (size_t i = 0; i < n && i < max; i++) { snprintf(b, sizeof b, i ? " %02X" : "%02X", o[i]); s += b; }
  if (n > max) { char e[32]; snprintf(e, sizeof e, " … (%u octets)", (unsigned)n); s += e; }
  return s;
}

// ---------- Réponses de la machine ----------
struct Way { bool valide = false, acceptee = false; std::string serie; uint8_t version = 0, fabricant = 0, lecturesEnPlus = 0; unsigned tampon = 256; };
inline Way lireWay(const Octets& c) {
  Way w;
  if (c.size() < 3 || c[0] != 0x88 || c[1] != 0xE0) return w;
  w.valide = true;
  if (c[2] != 0x01) return w;
  w.acceptee = true;
  if (c.size() >= 15) {
    std::string s;
    for (size_t i = 7; i < 15; i++) if (c[i] >= 0x20 && c[i] <= 0x7E) s += (char)c[i];
    size_t a = s.find_first_not_of(' '), b = s.find_last_not_of(' ');
    w.serie = a == std::string::npos ? "" : s.substr(a, b - a + 1);
  }
  if (c.size() > 15) w.version = c[15];
  if (c.size() > 16) w.fabricant = c[16];
  if (c.size() > 17) w.lecturesEnPlus = c[17];
  unsigned t = c.size() >= 21 ? (unsigned)((c[19] << 8) | c[20]) : 0;
  w.tampon = t == 0 ? 256 : t;
  return w;
}
struct ReadRep { bool valide = false, acceptee = false; uint8_t liste = 0; uint32_t longueur = 0xFFFF; };
inline ReadRep lireReadData(const Octets& c) {
  ReadRep r;
  if (c.size() < 3 || c[0] != 0x88 || c[1] != 0xE2) return r;
  r.valide = true;
  if (c[2] != 0x01) return r;
  r.acceptee = true;
  r.liste = c.size() > 3 ? c[3] : 0;
  uint32_t l = c.size() >= 9 ? (uint32_t)((c[7] << 8) | c[8]) : 0xFFFF;
  r.longueur = l == 0 ? 0xFFFF : l;
  return r;
}
struct WriteCmd { bool valide = false; uint8_t liste = 0; uint32_t longueur = 0xFFFF; };
inline WriteCmd lireWriteData(const Octets& c) {
  WriteCmd w;
  if (c.size() < 4 || c[0] != 0x77 || c[1] != 0xE3) return w;
  w.valide = true; w.liste = c[3];
  uint32_t l = c.size() >= 6 ? (uint32_t)((c[4] << 8) | c[5]) : 0xFFFF;
  w.longueur = l == 0 ? 0xFFFF : l;
  return w;
}
inline const char* nomCommande(uint8_t b) {
  switch (b) {
    case 0xE0: return "Who Are You"; case 0xE1: return "Program Slave Device"; case 0xE2: return "Read Data";
    case 0xE3: return "Write Data"; case 0xE4: return "Delete Data"; case 0xE5: return "Program Module";
    case 0xE6: return "Read Memory"; case 0xFF: return "Finish"; default: return nullptr;
  }
}
inline std::string nomMessage(const Octets& c) {
  if (c.empty()) return "message vide";
  char b[96];
  if (c[0] == 0x77 && c.size() > 1) {
    const char* n = nomCommande(c[1]);
    if (n) snprintf(b, sizeof b, "commande « %s »", n); else snprintf(b, sizeof b, "commande « 0x%02X »", c[1]);
    return b;
  }
  if (c[0] == 0x88 && c.size() > 2) {
    const char* n = nomCommande(c[1]);
    char nb[8]; snprintf(nb, sizeof nb, "0x%02X", c[1]);
    snprintf(b, sizeof b, "réponse « %s » %s", n ? n : nb, c[2] == 0x01 ? "acceptée" : "refusée");
    return b;
  }
  if (c[0] == 0x99 && c.size() > 1) { snprintf(b, sizeof b, "bloc de données n°%u (%u octets)", c[1], (unsigned)(c.size() - 2)); return b; }
  return "message " + hex(c.data(), c.size() < 4 ? c.size() : 4);
}

// ---------- Découpe du flux reçu (extraire de serial.js) ----------
struct Trame { bool ctrl; uint8_t type = 0, code = 0, b4 = 0, b5 = 0, sadd = 0, rr = 0, xx = 0; bool select = false; Octets corps, octets; };
struct ErreurTrame { int type; uint32_t n = 0; uint8_t xx = 0; };          // 0 ignorés, 1 format, 2 crc des données
struct Extraction { std::vector<Trame> trames; std::vector<ErreurTrame> erreurs; size_t consommes = 0; };

inline Extraction extraire(const Octets& t) {
  Extraction r;
  size_t i = 0; uint32_t ignores = 0;
  auto fin = [&]() { if (ignores) { ErreurTrame e; e.type = 0; e.n = ignores; r.erreurs.push_back(e); ignores = 0; } };
  while (i < t.size()) {
    uint8_t b = t[i];
    if (b != ENQ && b != SOH) { ignores++; i++; continue; }
    if (i + 8 > t.size()) break;                                   // en-tête pas encore complet
    const uint8_t* e = t.data() + i;
    if (crc16(e, 6) != (uint16_t)(e[6] | (e[7] << 8))) { ignores++; i++; continue; }   // faux début ou en-tête abîmé
    if (b == ENQ) {
      fin();
      Trame tr; tr.ctrl = true; tr.type = e[1]; tr.code = e[2] & 0x3F; tr.select = e[2] & 0x80;
      tr.b4 = e[3]; tr.b5 = e[4]; tr.sadd = e[5]; tr.octets.assign(e, e + 8);
      r.trames.push_back(tr);
      i += 8; continue;
    }
    size_t n = e[1] | ((e[2] & 0x3F) << 8);
    if (n == 0) { fin(); ErreurTrame er; er.type = 1; r.erreurs.push_back(er); i += 8; continue; }
    if (i + 8 + n + 2 > t.size()) break;                           // données pas encore complètes
    fin();
    const uint8_t* corps = t.data() + i + 8;
    uint16_t crc = (uint16_t)(t[i + 8 + n] | (t[i + 9 + n] << 8));
    if (crc16(corps, n) != crc) {
      ErreurTrame er; er.type = 2; er.xx = e[4]; r.erreurs.push_back(er);
    } else {
      Trame tr; tr.ctrl = false; tr.rr = e[3]; tr.xx = e[4]; tr.sadd = e[5]; tr.select = e[2] & 0x80;
      tr.corps.assign(corps, corps + n); tr.octets.assign(e, e + 10 + n);
      r.trames.push_back(tr);
    }
    i += 10 + n;
  }
  fin();
  r.consommes = i;
  return r;
}

// Fin d'un fichier de longueur inconnue : /(^|\n)DXE\*[^\r\n]*\r?\n?$/
inline bool finitParDxe(const std::string& s) {
  size_t L = s.size();
  if (L && s[L - 1] == '\n') L--;
  if (L && s[L - 1] == '\r') L--;
  size_t d = s.rfind('\n', L ? L - 1 : 0);
  size_t debut = (d == std::string::npos || d >= L) ? 0 : d + 1;
  if (L < debut + 4 || s.compare(debut, 4, "DXE*") != 0) return false;
  for (size_t k = debut; k < L; k++) if (s[k] == '\r' || s[k] == '\n') return false;
  return true;
}
}  // namespace ddcmp

// Réglages du moteur (mêmes valeurs que serial.js)
struct ReglagesDdcmp {
  uint8_t  sadd = 1;                  // adresse : 1 = point à point (commande 90)
  uint32_t startIntervalleMs = 300;   // norme : au moins 250 ms entre deux START
  int      startMax = 10;             // norme : 10 START au maximum
  uint32_t ackDelaiMs = 300;          // norme : 170 ms (+ marge)
  int      essaisMax = 5;             // norme : 5 essais par message
  uint32_t lienDelaiMs = 5000;        // norme : 5 s sans rien = fin de session
  uint32_t lienDelaiDonneesMs = 15000;// norme : 15 s pendant Read / Write Data
  uint32_t retournementMs = 40;       // norme : 40 ms entre réception et émission
  uint32_t interCaractereMs = 200;    // norme : 65 ms (+ marge) ; trame coupée = abandonnée
  uint32_t attenteFinishMs = 2000;    // machine maître : attente de son FINISH avant d'envoyer le nôtre
  int      cederMax = 2;              // nombre de fois où le boîtier laisse la main avant d'abandonner une lecture
  const char* identifiantPc = "00000001";
  const char* utilisateur = "BA";
};

// ============================================================
// Moteur de session DDCMP (BA.MoteurDdcmp de serial.js)
// ============================================================
class MoteurDdcmp {
 public:
  struct Io {                                         // fourni par le programme principal
    virtual int available() = 0;
    virtual int read() = 0;
    virtual void write(const uint8_t* b, size_t n) = 0;
    virtual uint32_t ms() = 0;
    virtual void wait(uint32_t ms) = 0;
    virtual ~Io() {}
  };
  struct Ecouteur {
    // niveau : 't' envoi, 'r' réception, 'o' ok, 'w' attention, 'e' erreur, 'i' information
    virtual void journal(const std::string& texte, char niveau) = 0;
    virtual void brut(bool /*envoi*/, const uint8_t* /*o*/, size_t /*n*/) {}
    virtual void rapport(const std::string& texte, bool machineMaitre, int liste, const std::string& serie) = 0;
    virtual void etat(const char* /*texte*/) {}
    virtual void lectureFinie(bool ok, bool cede, const std::string& erreur) = 0;
    virtual bool heure(HeureLocale& h) = 0;             // heure locale (Bruxelles) pour le Who Are You
    virtual ~Ecouteur() {}
  };
  typedef ReglagesDdcmp Reglages;

  MoteurDdcmp(Io& io, Ecouteur& ec) : io_(io), ec_(ec), r_() { reinit_(); }
  MoteurDdcmp(Io& io, Ecouteur& ec, const ReglagesDdcmp& r) : io_(io), ec_(ec), r_(r) { reinit_(); }

  // À appeler très souvent (boucle principale, et pendant les attentes du modem)
  void poll() {
    uint8_t b[256]; size_t n = 0;
    while (n < sizeof b && io_.available() > 0) { int v = io_.read(); if (v < 0) break; b[n++] = (uint8_t)v; }
    if (n) recevoir_(b, n);
    minuteries_();
  }

  bool occupe() const { return mode_ != AUCUN; }
  bool lectureEnAttente() const { return dem_.active; }

  // Lecture à la demande (liste 2 = contrôle, rien n'est remis à zéro). Faux si une lecture est déjà demandée.
  bool lire(int liste = 2) {
    if (liste != 1 && liste != 2) { ec_.lectureFinie(false, false, "Seules les listes 1 et 2 sont permises."); return false; }
    if (dem_.active) return false;
    dem_ = Demande(); dem_.active = true; dem_.liste = liste;
    if (mode_ != AUCUN) { log_("La machine est en train d'envoyer ses données : la lecture partira après.", 'i'); return true; }
    ouvrir_();
    return true;
  }

  // Arrêt complet
  void arreter() {
    for (auto& m : min_) m.actif = false;
    reouvrir_.actif = false;
    bool d = dem_.active;
    dem_ = Demande();
    attente_.actif = false;
    reinit_();
    tampon_.clear();
    if (d) ec_.lectureFinie(false, false, "Liaison arrêtée.");
  }

 private:
  enum Mode { AUCUN, MAITRE, ESCLAVE };
  enum Phase { P_AUCUNE, P_START, P_WAY, P_READ, P_BLOCS, P_FIN, P_SESSION };
  enum Suite { S_AUCUNE, S_WAY, S_READ, S_FINISH };
  enum { T_START, T_ACK, T_LIEN, T_FINISH, T_N };
  struct Minuterie { bool actif = false; uint32_t echeance = 0; };
  struct Attente { bool actif = false; uint8_t xx = 0; ddcmp::Octets corps; int essais = 0; std::string texte; Suite suite = S_AUCUNE; };
  struct Transfert { bool actif = false; uint8_t liste = 0; uint32_t longueur = 0xFFFF, recu = 0; std::string texte; int dernierBloc = -1; bool termine = false; };
  struct Demande { bool active = false; int liste = 2; bool enCours = false; int cede = 0; };

  Io& io_; Ecouteur& ec_; Reglages r_;
  ddcmp::Octets tampon_;
  bool aRecu_ = false; uint32_t dernierRx_ = 0;
  Minuterie min_[T_N]; uint32_t lienSecondes_ = 5;
  Minuterie reouvrir_;
  Demande dem_;
  uint32_t compteurIgnores_ = 0;
  // état de la session (_reinit)
  Mode mode_ = AUCUN; Phase phase_ = P_AUCUNE; uint8_t saddSession_ = 1;
  uint8_t txProchain_ = 1, rx_ = 0;
  Attente attente_; bool nackEnvoye_ = false;
  Transfert transfert_; int essaisStart_ = 0; std::string serieMachine_;
  int lecturesRestantes_ = 0, listeEnCours_ = 2;
  std::vector<std::string> textes_; std::string erreurLecture_;

  // ---------- Outils ----------
  void log_(const std::string& t, char n) { ec_.journal(t, n); }
  static std::string num_(unsigned v) { char b[12]; snprintf(b, sizeof b, "%u", v); return b; }
  void reinit_() {
    effacer_(T_START); effacer_(T_ACK); effacer_(T_LIEN); effacer_(T_FINISH);
    mode_ = AUCUN; phase_ = P_AUCUNE; saddSession_ = r_.sadd;
    txProchain_ = 1; rx_ = 0; attente_ = Attente(); nackEnvoye_ = false;
    transfert_ = Transfert(); essaisStart_ = 0; serieMachine_.clear();
    lecturesRestantes_ = 0; listeEnCours_ = 2; textes_.clear(); erreurLecture_.clear();
  }
  void armer_(int nom, uint32_t ms) { min_[nom].actif = true; min_[nom].echeance = io_.ms() + ms; }
  void effacer_(int nom) { min_[nom].actif = false; }
  static bool echu_(const Minuterie& m, uint32_t now) { return m.actif && (int32_t)(now - m.echeance) >= 0; }
  void minuteries_() {
    uint32_t now = io_.ms();
    if (echu_(min_[T_START], now))  { effacer_(T_START);  envoyerStart_(); }
    now = io_.ms();
    if (echu_(min_[T_ACK], now))    { effacer_(T_ACK);    delaiAck_(); }
    now = io_.ms();
    if (echu_(min_[T_LIEN], now))   { effacer_(T_LIEN);   abandon_("Plus rien reçu de la machine depuis " + num_(lienSecondes_) + " s."); }
    now = io_.ms();
    if (echu_(min_[T_FINISH], now)) {
      effacer_(T_FINISH);
      if (mode_ == ESCLAVE && phase_ == P_SESSION && !attente_.actif) {
        log_("La machine n'envoie pas FINISH : le boîtier termine la session.", 'i');
        envoyerFinish_();
      }
    }
    now = io_.ms();
    if (echu_(reouvrir_, now)) { reouvrir_.actif = false; ouvrir_(); }
  }

  // ---------- Émission ----------
  bool ecrire_(const ddcmp::Octets& o) {
    if (!ddcmp::autorise(o.data(), o.size())) {
      log_("⛔ Trame bloquée par la liste de sécurité (non envoyée) : " + ddcmp::hex(o.data(), o.size()), 'e');
      return false;
    }
    if (aRecu_) {
      int32_t reste = (int32_t)(dernierRx_ + r_.retournementMs - io_.ms());
      if (reste > 0) io_.wait((uint32_t)reste);
    }
    ec_.brut(true, o.data(), o.size());
    io_.write(o.data(), o.size());
    return true;
  }
  bool controle_(const ddcmp::Octets& o, const std::string& texte) {
    if (!texte.empty()) log_("→ " + texte, 't');
    return ecrire_(o);
  }
  // Envoie un message de données ; la suite est faite à l'accusé ou après le dernier essai
  void donnees_(const ddcmp::Octets& corps, const std::string& texte, Suite suite) {
    uint8_t xx = txProchain_;
    ddcmp::Octets o = ddcmp::message(corps, rx_, xx, saddSession_);
    attente_.actif = true; attente_.xx = xx; attente_.corps = corps; attente_.essais = 1; attente_.texte = texte; attente_.suite = suite;
    log_("→ n°" + num_(xx) + " " + texte, 't');
    if (!ecrire_(o)) { attente_.actif = false; suite_(suite, false); return; }
    armer_(T_ACK, r_.ackDelaiMs + (uint32_t)o.size());
  }
  void delaiAck_() {
    if (!attente_.actif) return;
    if (attente_.essais >= r_.essaisMax) {
      log_("⚠ Pas d'accusé de réception après " + num_(attente_.essais) + " essais : " + attente_.texte, 'w');
      Suite s = attente_.suite;
      attente_.actif = false;
      txProchain_ = (uint8_t)(txProchain_ + 1);                  // norme : on incrémente même en cas d'échec
      suite_(s, false);
      if (mode_ != AUCUN) abandon_("La machine n'accuse plus réception des messages.");
      return;
    }
    attente_.essais++;
    log_("→ nouvel essai " + num_(attente_.essais) + "/" + num_(r_.essaisMax) + " : " + attente_.texte, 't');
    ddcmp::Octets o = ddcmp::message(attente_.corps, rx_, attente_.xx, saddSession_);
    ecrire_(o);
    armer_(T_ACK, r_.ackDelaiMs + (uint32_t)o.size());
  }
  // Un accusé (ACK, NACK ou message de données) porte rr : notre message n° rr est bien arrivé
  bool accuse_(uint8_t rr) {
    if (!attente_.actif || rr != attente_.xx) return false;
    effacer_(T_ACK);
    Suite s = attente_.suite;
    attente_.actif = false;
    txProchain_ = (uint8_t)(txProchain_ + 1);
    suite_(s, true);
    return true;
  }
  void suite_(Suite s, bool ok) {
    switch (s) {
      case S_WAY:    if (!ok && mode_ == MAITRE) abandon_("Pas de réponse au Who Are You."); break;
      case S_READ:   if (!ok && mode_ == MAITRE) abandon_("Pas de réponse à la demande de lecture."); break;
      case S_FINISH:
        if (ok) { log_("← ACK du FINISH.", 'r'); finSession_(); }
        else if (mode_ != AUCUN) abandon_("Pas d'accusé pour le FINISH.");
        break;
      default: break;
    }
  }
  void rearmerLien_() {
    uint32_t ms = (transfert_.actif && !transfert_.termine) ? r_.lienDelaiDonneesMs : r_.lienDelaiMs;
    lienSecondes_ = (ms + 500) / 1000;
    armer_(T_LIEN, ms);
  }

  // ---------- Réception ----------
  void recevoir_(const uint8_t* o, size_t n) {
    uint32_t maintenant = io_.ms();
    if (!tampon_.empty() && aRecu_ && maintenant - dernierRx_ > r_.interCaractereMs) {
      log_("⚠ Trame incomplète abandonnée (" + num_((unsigned)tampon_.size()) + " octets, trop d'attente entre deux caractères).", 'w');
      tampon_.clear();
    }
    dernierRx_ = maintenant; aRecu_ = true;
    tampon_.insert(tampon_.end(), o, o + n);
    if (tampon_.size() > 20000) tampon_.erase(tampon_.begin(), tampon_.end() - 20000);
    ddcmp::Extraction r = ddcmp::extraire(tampon_);
    tampon_.erase(tampon_.begin(), tampon_.begin() + r.consommes);
    for (auto& e : r.erreurs) erreurTrame_(e);
    for (auto& t : r.trames) trame_(t);
  }
  void erreurTrame_(const ddcmp::ErreurTrame& e) {
    if (e.type == 0) {
      compteurIgnores_ += e.n;
      if (compteurIgnores_ >= 32) {
        log_("⚠ " + num_(compteurIgnores_) + " octets illisibles reçus (vitesse différente de la machine ? mauvais protocole ?).", 'w');
        compteurIgnores_ = 0;
      }
      return;
    }
    if (mode_ == AUCUN) return;
    uint8_t code = e.type == 2 ? 2 : 17;
    log_(e.type == 2 ? "⚠ Message n°" + num_(e.xx) + " abîmé (CRC des données faux)." : std::string("⚠ En-tête de message incorrect."), 'w');
    if (!nackEnvoye_) {
      nackEnvoye_ = true;
      controle_(ddcmp::nack(rx_, code, saddSession_), "NACK n°" + num_(rx_) + " (code " + num_(code) + ")");
    }
  }
  void trame_(const ddcmp::Trame& t) {
    ec_.brut(false, t.octets.data(), t.octets.size());
    if (t.ctrl) trameControle_(t); else trameDonnees_(t);
  }
  void trameControle_(const ddcmp::Trame& t) {
    if (t.type == ddcmp::START) { startRecu_(t); return; }
    if (t.type == ddcmp::STACK) {
      if (mode_ == MAITRE && phase_ == P_START) {
        effacer_(T_START);
        log_("← STACK : la machine répond, session ouverte (boîtier maître).", 'o');
        phase_ = P_WAY;
        rearmerLien_();
        HeureLocale h{};
        if (!ec_.heure(h)) { abandon_("Heure inconnue : lecture annulée."); return; }
        donnees_(ddcmp::whoAreYou(h, r_.utilisateur), "Who Are You (codes de sécurité 0000)", S_WAY);
      }
      return;
    }
    if (mode_ == AUCUN) return;
    rearmerLien_();
    if (t.type == ddcmp::ACK) {
      log_("← ACK n°" + num_(t.b4), 'r');
      accuse_(t.b4);
      return;
    }
    if (t.type == ddcmp::NACK) {
      log_("← NACK n°" + num_(t.b4) + (t.code ? " (code " + num_(t.code) + ")" : std::string()), 'r');
      // NACK portant le n° de notre message = il a bien été reçu (notre ACK précédent s'était perdu)
      if (accuse_(t.b4)) return;
      if (attente_.actif) { effacer_(T_ACK); delaiAck_(); }
    }
  }
  // La machine envoie START : elle ouvre une session (télémétrie, ou réponse à notre START)
  void startRecu_(const ddcmp::Trame& t) {
    if (mode_ == MAITRE) {
      log_("← START : la machine ouvre elle-même une session, le boîtier lui laisse la main.", 'i');
      if (dem_.active) { dem_.enCours = false; dem_.cede++; }
    } else if (mode_ == ESCLAVE) {
      log_("← START : nouvelle session de la machine (la précédente est abandonnée).", 'i');
    } else {
      log_("← START (la machine ouvre une session)", 'r');
    }
    attente_.actif = false;                                         // la suite éventuelle est abandonnée
    reinit_();
    mode_ = ESCLAVE;
    phase_ = P_SESSION;
    saddSession_ = t.sadd ? t.sadd : r_.sadd;
    ec_.etat("Session ouverte par la machine");
    controle_(ddcmp::stack(0, t.b5, saddSession_), "STACK");
    rearmerLien_();
  }
  void trameDonnees_(const ddcmp::Trame& t) {
    if (mode_ == AUCUN) { log_("Message reçu hors session (ignoré) : " + ddcmp::nomMessage(t.corps), 'w'); return; }
    rearmerLien_();
    accuse_(t.rr);                                                   // accusé « porté » par le message de la machine
    if (mode_ == AUCUN) return;
    uint8_t attendu = (uint8_t)(rx_ + 1);
    if (t.xx == attendu) {
      rx_ = t.xx;
      nackEnvoye_ = false;
      log_("← n°" + num_(t.xx) + " " + ddcmp::nomMessage(t.corps), 'r');
      controle_(ddcmp::ack(rx_, saddSession_), "ACK n°" + num_(rx_));
      message_(t.corps, t.select);
    } else if (t.xx == rx_) {
      log_("← n°" + num_(t.xx) + " reçu une 2e fois (notre ACK s'est perdu) : ACK renvoyé, message ignoré.", 'w');
      controle_(ddcmp::ack(rx_, saddSession_), "ACK n°" + num_(rx_));
    } else if (!nackEnvoye_) {
      nackEnvoye_ = true;
      log_("⚠ Message n°" + num_(t.xx) + " hors séquence (attendu n°" + num_(attendu) + ").", 'w');
      controle_(ddcmp::nack(rx_, 0, saddSession_), "NACK n°" + num_(rx_));
    }
  }

  // ---------- Traitement du contenu ----------
  void message_(const ddcmp::Octets& c, bool select) {
    if (c.empty()) return;
    // Blocs de données (Read Data du boîtier, ou Write Data de la machine)
    if (c[0] == 0x99) {
      if (!transfert_.actif || transfert_.termine) { log_("Bloc de données inattendu (ignoré).", 'w'); return; }
      bloc_(c, select);
      return;
    }
    if (mode_ == MAITRE) {
      if (phase_ == P_WAY) {
        ddcmp::Way w = ddcmp::lireWay(c);
        if (!w.valide) return;
        if (!w.acceptee) {
          log_("✖ La machine refuse le Who Are You (codes de sécurité différents de 0000 ?).", 'e');
          erreurLecture_ = "La machine refuse l'accès (codes de sécurité).";
          envoyerFinish_();
          return;
        }
        serieMachine_ = w.serie;
        lecturesRestantes_ = 1 + (w.lecturesEnPlus < 3 ? w.lecturesEnPlus : 3);
        log_("← Who Are You accepté : n° « " + (w.serie.empty() ? std::string("?") : w.serie) + " », version " + num_(w.version) + ", tampon " + num_(w.tampon) + " octets.", 'o');
        demanderLecture_();
        return;
      }
      if (phase_ == P_READ) {
        ddcmp::ReadRep r = ddcmp::lireReadData(c);
        if (!r.valide) return;
        if (!r.acceptee) {
          log_("✖ La machine refuse la lecture de la liste " + num_(listeEnCours_) + ".", 'e');
          erreurLecture_ = "La machine refuse la lecture de la liste " + num_(listeEnCours_) + ".";
          envoyerFinish_();
          return;
        }
        transfert_ = Transfert(); transfert_.actif = true; transfert_.liste = r.liste; transfert_.longueur = r.longueur;
        phase_ = P_BLOCS;
        log_(std::string("← Lecture acceptée (") + (r.longueur == 0xFFFF ? std::string("longueur inconnue") : num_(r.longueur) + " octets") + ").", 'o');
        ec_.etat("Lecture : réception des données…");
        rearmerLien_();
        return;
      }
      return;
    }
    // Mode esclave : la machine commande
    if (c[0] != 0x77 || c.size() < 2) return;
    effacer_(T_FINISH);
    switch (c[1]) {
      case 0xE0:
        donnees_(ddcmp::reponseWay(r_.identifiantPc), "Who Are You accepté (88 E0 01)", S_AUCUNE);
        break;
      case 0xE3: {
        ddcmp::WriteCmd w = ddcmp::lireWriteData(c);
        if (!w.valide) { log_("Commande Write Data incomplète (ignorée).", 'w'); break; }
        transfert_ = Transfert(); transfert_.actif = true; transfert_.liste = w.liste; transfert_.longueur = w.longueur;
        phase_ = P_BLOCS;
        log_("La machine envoie des données (liste " + num_(w.liste) + ", " +
             (w.longueur == 0xFFFF ? std::string("longueur inconnue") : num_(w.longueur) + " octets") + ").", 'i');
        ec_.etat("Réception des données de la machine…");
        donnees_(ddcmp::reponseWrite(), "Write Data accepté (88 E3 01)", S_AUCUNE);
        rearmerLien_();
        break;
      }
      case 0xFF:
        log_("← FINISH de la machine : session terminée proprement.", 'o');
        finSession_();
        break;
      default:
        log_("Commande de la machine refusée par sécurité : " + ddcmp::nomMessage(c), 'w');
        if (c[1] == 0xE1 || c[1] == 0xE2 || c[1] == 0xE4 || c[1] == 0xE5 || c[1] == 0xE6) {
          char t[40]; snprintf(t, sizeof t, "refus (88 %02X 00)", c[1]);
          donnees_(ddcmp::refus(c[1]), t, S_AUCUNE);
        }
        break;
    }
  }

  void bloc_(const ddcmp::Octets& c, bool select) {
    Transfert& tr = transfert_;
    int numero = c.size() > 1 ? c[1] : -2;
    if (tr.dernierBloc != -1 && numero == tr.dernierBloc) { log_("Bloc n°" + num_((unsigned)numero) + " déjà reçu (ignoré).", 'w'); return; }
    tr.dernierBloc = numero;
    if (c.size() > 2) tr.texte.append((const char*)c.data() + 2, c.size() - 2);
    tr.recu += c.size() > 2 ? (uint32_t)(c.size() - 2) : 0;
    bool fini = select || (tr.longueur != 0xFFFF && tr.recu >= tr.longueur) || (tr.longueur == 0xFFFF && ddcmp::finitParDxe(tr.texte));
    char et[48]; snprintf(et, sizeof et, "Réception : %u octets…", (unsigned)tr.recu);
    ec_.etat(et);
    if (!fini) return;

    tr.termine = true;
    textes_.push_back(tr.texte);
    log_("Données complètes : " + num_(tr.recu) + " octets reçus.", 'o');
    ec_.rapport(tr.texte, mode_ == ESCLAVE, tr.liste, serieMachine_);

    if (mode_ == MAITRE) {
      lecturesRestantes_--;
      if (lecturesRestantes_ > 0) demanderLecture_();
      else envoyerFinish_();
    } else if (mode_ == ESCLAVE) {
      phase_ = P_SESSION;
      rearmerLien_();
      // La machine (maître) doit envoyer FINISH ; sinon le boîtier le fait (comportement vu sur la machine)
      armer_(T_FINISH, r_.attenteFinishMs);
    }
  }
  void demanderLecture_() {
    phase_ = P_READ;
    transfert_ = Transfert();
    donnees_(ddcmp::readData((uint8_t)listeEnCours_), "Read Data liste " + num_(listeEnCours_) +
             (listeEnCours_ == 2 ? " (lecture de contrôle : rien n'est remis à zéro)" : " (audit standard)"), S_READ);
  }
  void envoyerFinish_() {
    phase_ = P_FIN;
    donnees_(ddcmp::finish(), "FINISH", S_FINISH);
  }

  // ---------- Fin de session ----------
  void finSession_() {
    if (mode_ == AUCUN) return;
    Mode role = mode_;
    size_t nb = textes_.size();
    std::string erreur = erreurLecture_;
    log_(role == MAITRE ? "Session terminée." : "Session de la machine terminée.", 'o');
    reinit_();
    ec_.etat("En écoute");
    suiteDemande_(nb > 0, false, nb > 0 ? std::string() : (erreur.empty() ? std::string("Aucune donnée reçue.") : erreur));
  }
  void abandon_(const std::string& raison) {
    if (mode_ == AUCUN && !(dem_.active && dem_.enCours)) return;
    log_("✖ Session abandonnée : " + raison + " Rien n'est enregistré pour cette session.", 'e');
    attente_.actif = false;
    reinit_();
    ec_.etat("En écoute");
    suiteDemande_(false, false, raison);
  }
  // Après une session : répondre à la lecture demandée, ou la lancer si elle attendait
  void suiteDemande_(bool ok, bool /*cede*/, const std::string& erreur) {
    if (!dem_.active) return;
    if (dem_.enCours) {
      dem_ = Demande();
      ec_.lectureFinie(ok, false, erreur);
      return;
    }
    // La lecture attendait (la machine avait la main)
    if (dem_.cede > r_.cederMax) {
      dem_ = Demande();
      ec_.lectureFinie(false, true, "La machine reprend la main à chaque essai (elle répond à START par START) : lecture impossible ; ses envois sont bien reçus.");
      return;
    }
    reouvrir_.actif = true; reouvrir_.echeance = io_.ms() + 1000;
  }

  // ---------- Lecture à la demande (le boîtier est maître) ----------
  void ouvrir_() {
    if (!dem_.active || dem_.enCours || mode_ != AUCUN) return;
    reinit_();
    dem_.enCours = true;
    mode_ = MAITRE;
    phase_ = P_START;
    listeEnCours_ = dem_.liste;
    essaisStart_ = 0;
    ec_.etat("Lecture : ouverture de la session…");
    envoyerStart_();
  }
  void envoyerStart_() {
    if (mode_ != MAITRE || phase_ != P_START) return;
    if (essaisStart_ >= r_.startMax) {
      abandon_("La machine ne répond pas (" + num_(r_.startMax) + " START sans réponse). Vérifier le module MAX3232 et ses fils, la vitesse et la commande 90 (EVA-DTS DDCMP, sortie RS232, adresse 1).");
      return;
    }
    essaisStart_++;
    txProchain_ = 1;
    rx_ = 0;
    controle_(ddcmp::start(saddSession_, 0), essaisStart_ > 1 ? "START (essai " + num_(essaisStart_) + "/" + num_(r_.startMax) + ")" : std::string("START"));
    armer_(T_START, r_.startIntervalleMs);
  }
};

}  // namespace ba
