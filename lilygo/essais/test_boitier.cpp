// Essais sur ordinateur du boîtier 4G : moteur DDCMP (contre une fausse machine FAS),
// heure belge, préparation des envois. g++ -std=gnu++17 -O1 test_boitier.cpp -o t && ./t releve.txt
#include "../broodautomate_lilygo/ddcmp_moteur.h"
#include "../broodautomate_lilygo/horloge.h"
#include "../broodautomate_lilygo/envoi.h"
#include <cstdio>
#include <deque>
#include <fstream>
#include <sstream>
#include <vector>
using namespace std;
using namespace ba;

static int echecs = 0, verifs = 0;
#define VERIF(c, m) do { verifs++; if (c) printf("  OK  %s\n", m); else { printf("  ÉCHEC  %s\n", m); echecs++; } } while (0)

typedef vector<uint8_t> V;
static uint16_t crc(const V& d, size_t a, size_t n) { return ddcmp::crc16(d.data() + a, n); }

// ---------------- Fausse machine FAS ----------------
// Comme une vraie machine : un message à la fois, le suivant seulement après l'accusé (ACK) du boîtier.
struct Machine : MoteurDdcmp::Io {
  uint32_t t = 1000; deque<uint8_t> q; string rapport;
  // modes : 0 normale, 1 muette, 2 répond START par START (télémétrie), 3 bloc abîmé une fois,
  //         4 la machine ouvre la session (Write Data) et envoie FINISH, 5 idem sans FINISH,
  //         6 la machine renvoie un bloc (ACK perdu), 7 lecture : la machine demande une lecture en plus
  int mode = 0;
  uint8_t mTx = 0, lastPcXx = 0;
  int acks = 0, nacks = 0, stacksEnvoyes = 0, lecturesDemandees = 0, interdites = 0; bool finishVu = false, corrompu = false, renvoye = false;
  vector<V> envoyes;
  deque<V> sortie; bool attendAck = false; uint8_t xxAttendu = 0; V dernierCorps; int blocNo = 0;
  bool esclave = false;

  int available() override { return (int)q.size(); }
  int read() override { if (q.empty()) return -1; int b = q.front(); q.pop_front(); return b; }
  uint32_t ms() override { return t; }
  void wait(uint32_t m) override { t += m ? m : 1; }

  void ctrl(uint8_t type, uint8_t b4, uint8_t b5) {
    V f = {5, type, 0x40, b4, b5, 1}; uint16_t c = crc(f, 0, 6); f.push_back(c & 255); f.push_back(c >> 8);
    for (auto b : f) q.push_back(b);
  }
  void msg(const V& body, bool abime = false) {
    uint16_t n = body.size(); mTx++;
    V f = {0x81, (uint8_t)(n & 255), (uint8_t)(0x40 | (n >> 8)), lastPcXx, mTx, 1};
    uint16_t c = crc(f, 0, 6); f.push_back(c & 255); f.push_back(c >> 8);
    for (auto b : body) f.push_back(b);
    c = crc(body, 0, n); f.push_back(c & 255); f.push_back(c >> 8);
    if (abime) f[10] ^= 0x55;
    for (auto b : f) q.push_back(b);
  }
  void pousser(const V& body) { sortie.push_back(body); if (!attendAck) suivant(); }
  void suivant() {
    if (sortie.empty()) { attendAck = false; return; }
    V b = sortie.front(); sortie.pop_front();
    bool estBloc = b[0] == 0x99; if (estBloc) blocNo++;
    bool ab = mode == 3 && estBloc && blocNo == 2 && !corrompu; if (ab) corrompu = true;
    msg(b, ab);
    attendAck = true; xxAttendu = mTx; dernierCorps = b;
    if (mode == 6 && estBloc && blocNo == 1 && !renvoye) { renvoye = true; mTx--; msg(b); }   // même n° renvoyé
  }
  void blocs() { uint8_t nb = 0; for (size_t i = 0; i < rapport.size(); i += 250) { V bl = {0x99, ++nb}; for (size_t k = i; k < i + 250 && k < rapport.size(); k++) bl.push_back(rapport[k]); pousser(bl); } }
  // La machine ouvre elle-même une session (télémétrie = 1)
  void ouvrirSession() { mTx = 0; lastPcXx = 0; esclave = true; ctrl(6, 0, 0); }

  void write(const uint8_t* b, size_t n) override {
    envoyes.push_back(V(b, b + n));
    if (!ddcmp::autorise(b, n)) interdites++;
    if (mode == 1) return;
    if (n == 8 && b[0] == 5) {
      if (b[1] == 6) { if (mode == 2) ctrl(6, 0, 0); else { mTx = 0; lastPcXx = 0; sortie.clear(); attendAck = false; blocNo = 0; ctrl(7, 0, 0); } }
      else if (b[1] == 7) {                               // STACK du boîtier : la machine continue sa session
        stacksEnvoyes++;
        if (esclave) pousser({0x77, 0xE0, 0, 0, 0, 0, 0, 0x30, 0x10, 0x26, 0x04, 0x19, 0x00, 'F', 'A', 0x0B});
      }
      else if (b[1] == 1) { acks++; if (attendAck && b[3] == xxAttendu) { attendAck = false; suivant(); if (!attendAck && esclave && mode == 4 && blocNo > 0 && sortie.empty() && !finishVu) { finishVu = true; pousser({0x77, 0xFF}); } } }
      else if (b[1] == 2) { nacks++; if (attendAck && b[3] == (uint8_t)(xxAttendu - 1)) { mTx--; msg(dernierCorps); } }
      return;
    }
    if (b[0] != 0x81) return;
    lastPcXx = b[4];
    const uint8_t* c = b + 8;
    if (c[0] == 0x77 && c[1] == 0xE0) {
      pousser({0x88, 0xE0, 1, 0, 0, 0, 0, '2', '0', '2', '1', '6', '4', '1', '7', 1, 2, (uint8_t)(mode == 7 ? 1 : 0), 0, 1, 0});
    } else if (c[0] == 0x77 && c[1] == 0xE2) {
      lecturesDemandees++; blocNo = 0;
      uint16_t L = rapport.size();
      pousser({0x88, 0xE2, 1, c[3], 1, 0, 0, (uint8_t)(L >> 8), (uint8_t)(L & 255)});
      blocs();
    } else if (c[0] == 0x77 && c[1] == 0xFF) {
      if (!esclave) finishVu = true; else finishBoitier = true;
      ctrl(1, lastPcXx, 0);
    } else if (c[0] == 0x88 && c[1] == 0xE0 && c[2] == 1) {     // réponse du boîtier au Who Are You de la machine
      ctrl(1, lastPcXx, 0);
      uint16_t L = rapport.size();
      pousser({0x77, 0xE3, 0, 2, (uint8_t)(L >> 8), (uint8_t)(L & 255)});
    } else if (c[0] == 0x88 && c[1] == 0xE3 && c[2] == 1) {     // Write Data accepté → blocs
      ctrl(1, lastPcXx, 0);
      blocNo = 0;
      blocs();
    }
  }
  bool finishBoitier = false;
};

struct Ecoute : MoteurDdcmp::Ecouteur {
  vector<string> rapports; vector<bool> maitres; string journalTxt; int finies = 0; bool ok = false, cede = false; string erreur; int bloquees = 0;
  void journal(const std::string& t, char n) override { journalTxt += t + "\n"; if (t.find("bloquée") != string::npos) bloquees++; }
  void rapport(const std::string& texte, bool m, int, const std::string&) override { rapports.push_back(texte); maitres.push_back(m); }
  void lectureFinie(bool o, bool c, const std::string& e) override { finies++; ok = o; cede = c; erreur = e; }
  bool heure(HeureLocale& h) override { h = {30, 10, 26, 4, 19, 0}; return true; }
};

static void tourner(Machine& m, MoteurDdcmp& mo, uint32_t ms) { uint32_t fin = m.t + ms; while (m.t < fin) { mo.poll(); m.t++; } }

int main(int argc, char** argv) {
  ifstream f(argv[1], ios::binary); stringstream ss; ss << f.rdbuf(); string releve = ss.str();
  // relevé comme la machine : fins de ligne \r\n
  string rel; for (char c : releve) { if (c == '\n' && (rel.empty() || rel.back() != '\r')) rel += '\r'; rel += c; }

  printf("Cas 1 : lecture normale (le boîtier est maître, liste 2)\n");
  { Machine m; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    VERIF(mo.lire(2), "lecture acceptée");
    tourner(m, mo, 8000);
    VERIF(e.finies == 1 && e.ok, "lecture terminée sans erreur");
    VERIF(e.rapports.size() == 1 && e.rapports[0] == rel, "texte reçu identique au relevé (octet par octet)");
    VERIF(!e.maitres.empty() && !e.maitres[0], "relevé marqué « lu par le boîtier »");
    VERIF(m.finishVu, "FINISH envoyé");
    VERIF(m.nacks == 0, "aucun NACK");
    VERIF(m.interdites == 0 && e.bloquees == 0, "aucune trame hors liste de sécurité");
    VERIF(m.lecturesDemandees == 1, "une seule demande de lecture");
    VERIF(!mo.occupe() && !mo.lectureEnAttente(), "moteur libre après la session");
    // trames attendues : WAY avec l'heure belge en BCD et codes 0000
    bool way = false; for (auto& o : m.envoyes) if (o.size() == 26 && o[0] == 0x81 && o[8] == 0x77 && o[9] == 0xE0) way = o[10] == 0 && o[11] == 0 && o[12] == 0 && o[13] == 0 && o[14] == 0 && o[15] == 0x30 && o[16] == 0x10 && o[17] == 0x26 && o[18] == 0x04 && o[19] == 0x19 && o[21] == 'B' && o[22] == 'A' && o[23] == 0x0B;
    VERIF(way, "Who Are You : codes 0000, date 30/10/26 04:19:00 en BCD, « BA »");
    bool rd = false; for (auto& o : m.envoyes) if (o.size() == 19 && o[8] == 0x77 && o[9] == 0xE2) rd = o[10] == 0 && o[11] == 2 && o[12] == 1 && o[13] == 0 && o[14] == 0 && o[15] == 0 && o[16] == 0;
    VERIF(rd, "Read Data : liste 2, enregistrement 1, tout"); }

  printf("Cas 2 : machine muette\n");
  { Machine m; m.mode = 1; Ecoute e; MoteurDdcmp mo(m, e);
    mo.lire(2); tourner(m, mo, 6000);
    VERIF(e.finies == 1 && !e.ok && e.erreur.find("ne répond pas") != string::npos, "« La machine ne répond pas » après 10 START");
    int st = 0; for (auto& o : m.envoyes) if (o.size() == 8 && o[1] == 6) st++;
    VERIF(st == 10, "exactement 10 START");
    VERIF(m.interdites == 0, "aucune trame hors liste"); }

  printf("Cas 3 : la machine répond START par START (télémétrie = 1)\n");
  { Machine m; m.mode = 2; Ecoute e; MoteurDdcmp mo(m, e);
    mo.lire(2); tourner(m, mo, 40000);
    VERIF(e.finies == 1 && !e.ok && e.cede, "lecture abandonnée après avoir laissé la main 3 fois (comme serial.js)");
    VERIF(m.stacksEnvoyes >= 3, "le boîtier répond STACK à chaque START de la machine");
    VERIF(m.interdites == 0, "aucune trame hors liste"); }

  printf("Cas 4 : un bloc abîmé (CRC faux) puis renvoyé\n");
  { Machine m; m.mode = 3; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    mo.lire(2); tourner(m, mo, 10000);
    VERIF(m.nacks >= 1, "NACK envoyé pour le message abîmé");
    VERIF(e.rapports.size() == 1 && e.rapports[0] == rel, "texte final exact après le renvoi");
    VERIF(e.ok, "lecture terminée"); }

  printf("Cas 5 : la machine ouvre la session et envoie ses données (Write Data) puis FINISH\n");
  { Machine m; m.mode = 4; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    m.ouvrirSession(); tourner(m, mo, 8000);
    VERIF(e.rapports.size() == 1 && e.rapports[0] == rel, "données de la machine reçues à l'identique");
    VERIF(!e.maitres.empty() && e.maitres[0], "relevé marqué « envoyé par la machine »");
    bool r88 = false; for (auto& o : m.envoyes) if (o.size() == 31 && o[8] == 0x88 && o[9] == 0xE0 && o[10] == 1) r88 = string((const char*)&o[15], 8) == "00000001";
    VERIF(r88, "réponse 88 E0 01 avec l'identifiant 00000001 (comme le PC)");
    bool w = false; for (auto& o : m.envoyes) if (o.size() == 13 && o[8] == 0x88 && o[9] == 0xE3 && o[10] == 1) w = true;
    VERIF(w, "Write Data accepté (88 E3 01)");
    VERIF(m.finishVu && !m.finishBoitier, "la machine envoie FINISH, le boîtier n'en envoie pas");
    VERIF(!mo.occupe(), "session terminée");
    VERIF(m.interdites == 0, "aucune trame hors liste"); }

  printf("Cas 6 : la machine envoie ses données sans FINISH\n");
  { Machine m; m.mode = 5; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    m.ouvrirSession(); tourner(m, mo, 8000);
    VERIF(e.rapports.size() == 1 && e.rapports[0] == rel, "données reçues");
    VERIF(m.finishBoitier, "le boîtier termine la session (FINISH) après 2 s");
    VERIF(!mo.occupe(), "session terminée"); }

  printf("Cas 7 : lecture demandée pendant une session de la machine\n");
  { Machine m; m.mode = 4; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    m.ouvrirSession(); tourner(m, mo, 30);
    VERIF(mo.occupe(), "session de la machine en cours");
    mo.lire(2);
    tourner(m, mo, 12000);
    VERIF(e.rapports.size() == 2 && e.maitres[0] && !e.maitres[1], "la lecture part après la session de la machine");
    VERIF(e.finies == 1 && e.ok, "lecture terminée"); }

  printf("Cas 8 : un bloc reçu deux fois (ACK perdu)\n");
  { Machine m; m.mode = 6; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    mo.lire(2); tourner(m, mo, 10000);
    VERIF(e.rapports.size() == 1 && e.rapports[0] == rel, "bloc en double ignoré, texte exact");
    VERIF(e.journalTxt.find("reçu une 2e fois") != string::npos, "doublon reconnu"); }

  printf("Cas 9 : la machine demande une lecture en plus (Who Are You rd = 1)\n");
  { Machine m; m.mode = 7; m.rapport = rel; Ecoute e; MoteurDdcmp mo(m, e);
    mo.lire(2); tourner(m, mo, 12000);
    VERIF(m.lecturesDemandees == 2 && e.rapports.size() == 2, "deux lectures dans la même session (comme serial.js)");
    VERIF(e.ok && m.finishVu, "FINISH après la 2e lecture"); }

  printf("Cas 10 : liste de sécurité\n");
  { V wr = ddcmp::message({0x77, 0xE3, 0, 2, 0, 10}, 0, 1, 1); V del = ddcmp::message({0x77, 0xE4, 0, 2}, 0, 1, 1);
    V prog = ddcmp::message({0x77, 0xE1, 0, 0}, 0, 1, 1); V rd3 = ddcmp::message({0x77, 0xE2, 0, 3, 1, 0, 0, 0, 0}, 0, 1, 1);
    V wayCode = ddcmp::message({0x77, 0xE0, 0, 0x12, 0x34, 0, 0, 1, 1, 26, 0, 0, 0, 'B', 'A', 0x0B}, 0, 1, 1);
    V sel = ddcmp::controle(1, 0, 0, 1); sel[2] |= 0x80;
    VERIF(!ddcmp::autorise(wr.data(), wr.size()), "Write Data du boîtier : bloqué");
    VERIF(!ddcmp::autorise(del.data(), del.size()), "Delete Data : bloqué");
    VERIF(!ddcmp::autorise(prog.data(), prog.size()), "Program : bloqué");
    VERIF(!ddcmp::autorise(rd3.data(), rd3.size()), "Read Data liste 3 : bloqué");
    VERIF(!ddcmp::autorise(wayCode.data(), wayCode.size()), "Who Are You avec un code non nul : bloqué");
    VERIF(!ddcmp::autorise(sel.data(), sel.size()), "trame de contrôle avec « select » : bloquée"); }

  printf("Cas 11 : heure belge (été / hiver)\n");
  { auto H = [](uint32_t u) { HeureLocale h = horloge::bruxelles(u); char b[32]; snprintf(b, sizeof b, "%02u/%02u/%02u %02u:%02u:%02u", h.jour, h.mois, h.annee2, h.heure, h.minute, h.seconde); return string(b); };
    VERIF(H(horloge::epoch(2026, 10, 25, 0, 59, 59)) == "25/10/26 02:59:59", "25/10/2026 00:59:59 UTC → 02:59:59 (été)");
    VERIF(H(horloge::epoch(2026, 10, 25, 1, 0, 0)) == "25/10/26 02:00:00", "25/10/2026 01:00 UTC → 02:00 (hiver)");
    VERIF(H(horloge::epoch(2026, 3, 29, 0, 59, 59)) == "29/03/26 01:59:59", "29/03/2026 00:59:59 UTC → 01:59:59 (hiver)");
    VERIF(H(horloge::epoch(2026, 3, 29, 1, 0, 0)) == "29/03/26 03:00:00", "29/03/2026 01:00 UTC → 03:00 (été)");
    VERIF(H(horloge::epoch(2026, 10, 30, 3, 19, 0)) == "30/10/26 04:19:00", "30/10/2026 03:19 UTC → 04:19");
    VERIF(H(horloge::epoch(2028, 2, 29, 23, 30, 0)) == "01/03/28 00:30:00", "année bissextile");
    uint32_t u = 0;
    VERIF(horloge::depuisCclk("26/10/30,04:19:00+04\"", u) && u == horloge::epoch(2026, 10, 30, 3, 19, 0), "AT+CCLK « 26/10/30,04:19:00+04 » → 03:19 UTC");
    VERIF(horloge::depuisCclk("26/07/01,14:00:00+08\"", u) && u == horloge::epoch(2026, 7, 1, 12, 0, 0), "AT+CCLK en été (+08)");
    VERIF(!horloge::depuisCclk("70/01/01,00:00:05+00\"", u), "heure 1970 du modem refusée");
    VERIF(!horloge::depuisCclk("80/01/06,00:00:00+00\"", u), "heure 1980 du modem refusée"); }

  printf("Cas 12 : préparation des envois\n");
  { string j; envoi::json(j, string("A\"B\\C\r\nD") + (char)0xE9 + (char)0x01);
    VERIF(j == "\"A\\\"B\\\\C\\r\\nD\\u00e9\\u0001\"", "texte JSON (guillemets, retours à la ligne, octets non ASCII)");
    string a = rel, b = rel;
    size_t p = b.find("ID5*"); b.replace(p, 15, "ID5*191028*1100");
    p = b.find("EA3*"); b[p + 4] = '9';
    VERIF(envoi::empreinte(a) == envoi::empreinte(b), "empreinte : heure du relevé et nombre de lectures ignorés");
    string c = rel; p = c.find("VA1*637720"); c.replace(p, 10, "VA1*637970");
    VERIF(envoi::empreinte(a) != envoi::empreinte(c), "empreinte : une vente change l'empreinte");
    VERIF(envoi::releveComplet(rel) && !envoi::releveComplet("ST*001") && !envoi::releveComplet(rel.substr(0, 300)), "relevé complet = DXS … DXE");
    uint32_t t = 0;
    VERIF(envoi::lireNombre("{\"ok\":true,\"t\":1793330340}", "t", t) && t == 1793330340u && envoi::reponseOk("{\"ok\":true,\"t\":1}"), "lecture de l'heure du serveur dans la réponse"); }

  printf(echecs ? "\n%d ÉCHEC(S) sur %d vérifications\n" : "\nTOUT EST BON (%d vérifications)\n", echecs ? echecs : verifs, verifs);
  return echecs ? 1 : 0;
}
