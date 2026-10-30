// Compare le moteur du boîtier aux vecteurs produits par serial.js
#include "../broodautomate_lilygo/ddcmp_moteur.h"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <map>
using namespace std; using namespace ba;
static vector<uint8_t> unhex(const string& h) { vector<uint8_t> v; for (size_t i = 0; i + 1 < h.size(); i += 2) v.push_back((uint8_t)stoi(h.substr(i, 2), nullptr, 16)); return v; }
static string hx(const vector<uint8_t>& a) { string s; char b[3]; for (auto x : a) { snprintf(b, 3, "%02x", x); s += b; } return s; }
int main(int, char** argv) {
  ifstream f(argv[1]); string line; int n = 0, bad = 0; map<char, int> cnt;
  HeureLocale h{30, 10, 26, 4, 19, 7};
  map<string, vector<uint8_t>> B = {
    {"start", ddcmp::start(1, 0)}, {"stack", ddcmp::stack(0, 4, 1)},
    {"way", ddcmp::message(ddcmp::whoAreYou(h, "BA"), 0, 1, 1)}, {"read2", ddcmp::message(ddcmp::readData(2), 1, 2, 1)},
    {"read1", ddcmp::message(ddcmp::readData(1), 3, 4, 1)}, {"finish", ddcmp::message(ddcmp::finish(), 5, 3, 1)},
    {"repway", ddcmp::message(ddcmp::reponseWay("00000001"), 1, 1, 1)}, {"repwrite", ddcmp::message(ddcmp::reponseWrite(), 2, 2, 1)}};
  for (int i = 0; i < 300; i += 37) { B["ack" + to_string(i)] = ddcmp::ack(i & 255, 1); B["nack" + to_string(i)] = ddcmp::nack(i & 255, i % 3 ? 2 : 17, 1); }
  for (int c : {0xE1, 0xE2, 0xE4, 0xE5, 0xE6}) B["refus" + to_string(c)] = ddcmp::message(ddcmp::refus((uint8_t)c), 2, 3, 1);
  while (getline(f, line)) {
    istringstream is(line); string k; is >> k; n++; cnt[k[0]]++;
    if (k == "B") { string nom, hexa; is >> nom >> hexa; if (!B.count(nom) || hx(B[nom]) != hexa) { bad++; printf("TRAME %s : %s / attendu %s\n", nom.c_str(), B.count(nom) ? hx(B[nom]).c_str() : "?", hexa.c_str()); } }
    else if (k == "A") { string hexa, att; is >> hexa >> att; auto v = unhex(hexa); bool r = ddcmp::autorise(v.data(), v.size()); if ((r ? "1" : "0") != att) { bad++; if (bad < 10) printf("AUTORISE %s : %d / attendu %s\n", hexa.c_str(), r, att.c_str()); } }
    else if (k == "X") {
      string hexa, tr, er, reste; is >> hexa >> tr >> er >> reste; auto v = unhex(hexa);
      auto r = ddcmp::extraire(v);
      string t2, e2;
      for (auto& t : r.trames) { if (!t2.empty()) t2 += ";"; char b[64];
        if (t.ctrl) { snprintf(b, sizeof b, "c%u,%u,%d,%u,%u,%u", t.type, t.code, t.select ? 1 : 0, t.b4, t.b5, t.sadd); t2 += b; }
        else { snprintf(b, sizeof b, "d%u,%u,%u,%d,", t.rr, t.xx, t.sadd, t.select ? 1 : 0); t2 += b; t2 += hx(t.corps); } }
      for (auto& e : r.erreurs) { if (!e2.empty()) e2 += ";"; e2 += e.type == 0 ? "i" + to_string(e.n) : e.type == 1 ? string("f") : "x" + to_string(e.xx); }
      if (t2.empty()) t2 = "-"; if (e2.empty()) e2 = "-";
      string re2 = to_string(v.size() - r.consommes);
      if (t2 != tr || e2 != er || re2 != reste) { bad++; if (bad < 10) printf("EXTRAIRE %s\n  C++ %s | %s | %s\n  JS  %s | %s | %s\n", hexa.c_str(), t2.c_str(), e2.c_str(), re2.c_str(), tr.c_str(), er.c_str(), reste.c_str()); }
    }
    else if (k == "E") { string hexa, att; is >> hexa >> att; auto v = unhex(hexa); string s(v.begin(), v.end()); bool r = ddcmp::finitParDxe(s); if ((r ? "1" : "0") != att) { bad++; if (bad < 10) printf("DXE « %s » : %d / attendu %s\n", hexa.c_str(), r, att.c_str()); } }
  }
  printf("%d vecteurs (trames %d, liste de sécurité %d, découpe %d, fin DXE %d) : %s\n", n, cnt['B'], cnt['A'], cnt['X'], cnt['E'], bad ? "DIFFÉRENCES" : "identique à serial.js");
  return bad ? 1 : 0;
}
