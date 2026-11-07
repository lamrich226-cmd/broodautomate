// Essais de la lecture DEX (FAS 480/5) sur ordinateur : fausse machine DEX, sonde, filtre.
//   g++ -std=gnu++17 -I../broodautomate_lilygo test_dex.cpp -o t_dex && ./t_dex [relevé réel facultatif]
// Sans argument : relevé INVENTÉ (aucune donnée réelle dans le dépôt).
#include "dex_moteur.h"
#include "filtre.h"
#include <cstdio>
#include <deque>
#include <fstream>
#include <sstream>
#include <iostream>
using namespace ba;

static int fautes = 0;
#define VERIF(c, m) do { if (!(c)) { printf("  ECHEC  %s\n", m); fautes++; } else printf("  OK     %s\n", m); } while (0)

// ---------- fausse machine FAS 480 en mode 6 (esclave puis maître) ----------
struct FausseMachine {
  std::deque<uint8_t> versBoitier; uint32_t t = 0;
  std::string releve; int phase = 0; std::string bufRecu; size_t bloc = 0; std::vector<std::string> blocs; int abime = 0; bool muette = false; bool nakSeul = false;
  void pousse(std::initializer_list<uint8_t> l) { for (auto b : l) versBoitier.push_back(b); }
  void blocPousse(const std::string& d, bool dernier) {
    std::vector<uint8_t> z(d.begin(), d.end()); z.push_back(dernier ? 3 : 0x17);
    uint16_t c = dex::crc16(z); if (abime > 0) { c ^= 0x55; abime--; }
    versBoitier.push_back(0x10); versBoitier.push_back(2);
    for (char x : d) versBoitier.push_back((uint8_t)x);
    versBoitier.push_back(0x10); versBoitier.push_back(dernier ? 3 : 0x17); versBoitier.push_back(c & 255); versBoitier.push_back(c >> 8);
  }
  void recoit(const uint8_t* b, size_t n) {
    if (muette) return;
    for (size_t i = 0; i < n; i++) {
      uint8_t c = b[i];
      if (nakSeul) { if (c == 5) pousse({0x15}); continue; }
      if (phase == 0) { if (c == 5) { pousse({0x10, '0'}); phase = 1; bufRecu.clear(); } }
      else if (phase == 1) {
        if (c == 4) { phase = 0; continue; }                         // EOT : sonde
        bufRecu += (char)c;
        if (bufRecu.size() >= 4 && (uint8_t)bufRecu[bufRecu.size() - 4] == 0x10 && (uint8_t)bufRecu[bufRecu.size() - 3] == 3) { pousse({0x10, '1'}); phase = 2; }
      } else if (phase == 2) { if (c == 4) { pousse({5}); phase = 3; } }
      else if (phase == 3) {                                             // ACK 0 : identification
        if (c == 0x30) {
          std::vector<uint8_t> id; std::string s = "00FAS00000001R01L01"; id.assign(s.begin(), s.end());
          std::vector<uint8_t> z = id; z.push_back(3); uint16_t cr = dex::crc16(z);
          pousse({0x10, 1}); for (auto x : id) versBoitier.push_back(x); pousse({0x10, 3, (uint8_t)(cr & 255), (uint8_t)(cr >> 8)}); phase = 4;
        }
      } else if (phase == 4) { if (c == 0x31) { pousse({4, 5}); phase = 5; } }   // ACK 1 → EOT puis ENQ des données
      else if (phase == 5) {
        if (c == 0x30) { blocs.clear(); for (size_t p = 0; p < releve.size(); p += 200) blocs.push_back(releve.substr(p, 200)); bloc = 0; blocPousse(blocs[0], blocs.size() == 1); bloc = 1; phase = 6; }
      } else if (phase == 6) {
        if (c == 0x15) { /* NAK : on renvoie le dernier bloc */ bloc--; blocPousse(blocs[bloc], bloc + 1 == blocs.size()); bloc++; }
        else if (c == 0x30 || c == 0x31) {
          if (bloc < blocs.size()) { blocPousse(blocs[bloc], bloc + 1 == blocs.size()); bloc++; } else { pousse({4}); phase = 0; }
        }
      }
    }
  }
};
struct IoFaux {
  FausseMachine& m; uint32_t& ms_;
  IoFaux(FausseMachine& mm, uint32_t& t) : m(mm), ms_(t) {}
  int available() { return (int)m.versBoitier.size(); }
  int read() { int b = m.versBoitier.front(); m.versBoitier.pop_front(); return b; }
  void write(const uint8_t* b, size_t n) { m.recoit(b, n); }
  uint32_t ms() { return ms_; }
  void wait(uint32_t d) { ms_ += d; }
};

// ---------- relevé inventé (de la même forme que celui d'une 480) ----------
static std::string inventer() {
  std::vector<std::string> l = {"ST*001*0001", "ID1*FAS00000001* 480 TEST  *0280", "ID4*2*39", "ID5*121019*0930", "VA1*100000*400*100000*400", "VA3*0*0*0*0",
    "CA2*100000*400*90000*350", "PA1*1*270*0", "PA2***10", "PA1*2*270*0", "PA2***20", "PA1*3*270*0", "PA2***0", "EA3*0*121019*0930****", "MA5*CMECMDB*5*0*0*2000"};
  int h = 9, m = 30; for (int i = 0; i < 96; i++) { char b[40]; snprintf(b, sizeof b, "MA5*TEMP*%02d%02d*%d", h, m, 17 + i % 3); l.push_back(b); m += 15; if (m >= 60) { m -= 60; h = (h + 1) % 24; } }
  l.push_back("MA5*ERROR*070111*1630*10*0"); l.push_back("MA5*ERROR*100116*2117*2*5"); l.push_back("MA5*ERROR*070111*1141*10*0"); l.push_back("MA5*ERROR*070111*1141*10*0");
  std::string z; for (auto& x : l) z += x + "\r\n";
  char g[8]; snprintf(g, sizeof g, "%04X", filtre::crc16(z));
  std::string r = "DXS*1234567890*VA*V1/1\r\n" + z + "G85*" + g + "\r\nSE*" + std::to_string(l.size() + 1) + "*0001\r\nDXE*1*1\r\n";
  return r;
}

static std::string remplacer(std::string s, const std::string& a, const std::string& b) { size_t p = s.find(a); if (p != std::string::npos) s.replace(p, a.size(), b); return s; }
// recalcule G85 et SE après une modification des lignes (pour fabriquer un 2e relevé)
static std::string refaire(const std::string& src) {
  std::vector<std::string> l; std::string cur; for (char c : src) { if (c == '\n') { if (!cur.empty() && cur.back() == '\r') cur.pop_back(); l.push_back(cur); cur.clear(); } else cur += c; }
  size_t st = 0, g = 0, se = 0; for (size_t i = 0; i < l.size(); i++) { if (!st && l[i].compare(0, 3, "ST*") == 0) st = i; if (l[i].compare(0, 4, "G85*") == 0) g = i; if (l[i].compare(0, 3, "SE*") == 0) se = i; }
  l[se] = "SE*" + std::to_string(se - st + 1) + "*0001"; l[g] = "G85*" + filtre::g85De(l, st, g);
  std::string o; for (auto& x : l) o += x + "\r\n"; return o;
}
static int lignes(const std::string& s, const char* debut) { int n = 0; size_t p = 0; while ((p = s.find(debut, p)) != std::string::npos) { n++; p += 1; } return n; }

int main(int argc, char** argv) {
  std::string releve;
  if (argc > 1) { std::ifstream f(argv[1], std::ios::binary); std::stringstream ss; ss << f.rdbuf(); releve = ss.str(); printf("(relevé réel donné en paramètre : %u octets)\n", (unsigned)releve.size()); }
  else releve = inventer();
  {
    printf("== 1. Sonde\n");
    FausseMachine m; uint32_t t = 0; IoFaux io(m, t); dex::Lecteur<IoFaux> lec(io);
    VERIF(lec.sonde(), "une machine DEX répond DLE 0 à ENQ : reconnue");
    FausseMachine m2; m2.muette = true; IoFaux io2(m2, t); dex::Lecteur<IoFaux> lec2(io2);
    VERIF(!lec2.sonde(), "machine muette (Power Lift) : pas reconnue comme DEX");
    FausseMachine m3; m3.nakSeul = true; IoFaux io3(m3, t); dex::Lecteur<IoFaux> lec3(io3);
    VERIF(!lec3.sonde(), "machine qui répond autre chose : pas reconnue comme DEX");
  }
  {
    printf("== 2. Lecture complète\n");
    FausseMachine m; m.releve = releve; uint32_t t = 0; IoFaux io(m, t); dex::Lecteur<IoFaux> lec(io);
    std::string texte; bool ok = lec.lire(texte);
    VERIF(ok, "lecture réussie");
    VERIF(texte == releve, "le texte reçu est identique, octet par octet");
    VERIF(t < 15000, "la lecture ne dépasse pas 15 s de dialogue simulé");
    printf("  (dialogue simulé : %u ms)\n", (unsigned)t);
  }
  {
    printf("== 3. Blocs abîmés, machine qui se tait\n");
    FausseMachine m; m.releve = releve; m.abime = 2; uint32_t t = 0; IoFaux io(m, t); dex::Lecteur<IoFaux> lec(io);
    std::string texte; bool ok = lec.lire(texte);
    VERIF(ok && texte == releve, "2 blocs abîmés : NAK, bloc renvoyé, lecture complète");
    FausseMachine m2; m2.releve = releve; m2.muette = true; IoFaux io2(m2, t); dex::Lecteur<IoFaux> lec2(io2);
    VERIF(!lec2.lire(texte) && !lec2.erreur.empty(), "machine muette : échec avec un message");
    printf("  message : %s\n", lec2.erreur.c_str());
  }
  {
    printf("== 4. Filtre du relevé (envoi 4G)\n");
    filtre::ContexteDex ctx;
    std::string a = filtre::allegerDex(releve, ctx);
    printf("  relevé complet %u octets → allégé %u octets\n", (unsigned)releve.size(), (unsigned)a.size());
    VERIF(a.size() < releve.size() / 3, "le relevé allégé fait moins d'un tiers de l'original");
    VERIF(lignes(a, "MA5*TEMP") == 1, "une seule température gardée");
    VERIF(lignes(a, "MA5*ERROR") == 0, "1re lecture : les vieilles erreurs ne sont pas renvoyées (référence)");
    VERIF(lignes(a, "VA1*") == 1 && lignes(a, "PA2*") >= 1 && lignes(a, "ID5*") == 1, "ventes, heure, sélections gardées");
    // G85 et SE valides
    { std::vector<std::string> l; std::string cur; for (char c : a) { if (c == '\n') { if (!cur.empty() && cur.back() == '\r') cur.pop_back(); l.push_back(cur); cur.clear(); } else cur += c; }
      size_t st = 0, g = 0, se = 0; for (size_t i = 0; i < l.size(); i++) { if (!st && l[i].compare(0, 3, "ST*") == 0) st = i; if (l[i].compare(0, 4, "G85*") == 0) g = i; if (l[i].compare(0, 3, "SE*") == 0) se = i; }
      VERIF(l[g] == "G85*" + filtre::g85De(l, st, g), "contrôle G85 du relevé allégé correct");
      VERIF(l[se].compare(0, 3, "SE*") == 0 && std::stoi(l[se].substr(3)) == (int)(se - st + 1), "nombre de lignes SE correct"); }
    // la plus récente = celle qui précède l'heure de la machine
    { auto f = filtre::champs(releve); (void)f; }
    // 2e lecture sans changement : même empreinte
    std::string b2 = refaire(remplacer(releve, "ID5*121019*0930", "ID5*121019*0945"));
    VERIF(filtre::empreinteDex(releve) == filtre::empreinteDex(b2), "l'heure qui avance ne change pas l'empreinte (rien à envoyer)");
    // une vente
    std::string v = releve; { size_t p = v.find("\nPA2*") + 1, q = v.find("\r\n", p); v.replace(p, q - p, "PA2***99999"); } v = refaire(v);   // une vente : le compteur d'une sélection change
    VERIF(filtre::empreinteDex(releve) != filtre::empreinteDex(v), "une vente change l'empreinte (relevé à envoyer)");
    // une nouvelle erreur
    std::string e = refaire(remplacer(releve, "MA5*ERROR*100116*2117*2*5", "MA5*ERROR*100116*2117*2*5\r\nMA5*ERROR*121019*1010*2*3"));
    VERIF(filtre::empreinteDex(releve) != filtre::empreinteDex(e), "une nouvelle erreur change l'empreinte");
    std::string ae = filtre::allegerDex(e, ctx);
    VERIF(lignes(ae, "MA5*ERROR") == 1 && ae.find("MA5*ERROR*121019*1010*2*3") != std::string::npos, "seule l'erreur NOUVELLE est envoyée");
    std::string ae2 = filtre::allegerDex(e, ctx);
    VERIF(lignes(ae2, "MA5*ERROR") == 0, "relue sans nouveauté : plus d'erreur renvoyée");
    // une erreur identique répétée (même ligne 2 fois)
    std::string r2 = refaire(remplacer(e, "MA5*ERROR*121019*1010*2*3", "MA5*ERROR*121019*1010*2*3\r\nMA5*ERROR*121019*1010*2*3"));
    std::string ar = filtre::allegerDex(r2, ctx);
    VERIF(lignes(ar, "MA5*ERROR") == 1, "une ligne d'erreur répétée une fois de plus : envoyée une fois");
    // relevé abîmé : tel quel
    std::string ab = releve; ab[ab.find("VA1*") + 6] = '9';
    filtre::ContexteDex c2;
    VERIF(filtre::allegerDex(ab, c2) == ab, "relevé abîmé (G85 faux) : envoyé tel quel, sans filtre");
  }
  printf("\n%s (%d faute%s)\n", fautes ? "ECHEC" : "TOUT EST BON", fautes, fautes > 1 ? "s" : "");
  return fautes ? 1 : 0;
}
