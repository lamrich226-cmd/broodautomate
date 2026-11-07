// Simulation complète du boîtier sur ordinateur : programme boitier.cpp tel quel,
// modem A7670 simulé (commandes AT, réseau, heure, HTTPS) et machine FAS simulée (DDCMP).
#include "Arduino.h"
uint32_t g_millis = 0;
HardwareSerial Serial(0);
EspClass ESP;
static int g_restarts = 0;
void EspClass::restart() { g_restarts++; }
#include SKETCH_CPP
#include <fstream>
#include <sstream>
#include <map>

static const uint32_t EPOCH0 = 1793330340u;     // 30/10/2026 03:19:00 UTC
static std::string g_releve;

// ---------------- Modem simulé ----------------
struct FauxModem : Port {
  std::string ligne; bool data = false; size_t attendus = 0; std::string corps;
  bool nitz = true, ntp = true, reseau = true, serveur = true; int code = 200;
  std::vector<std::string> envois; int httpOuverts = 0; int actions = 0;
  std::string reponse, url, entete;
  // fonction ba_boitier (bouton « Lire maintenant ») : demandes en attente, appels reçus
  bool brutImpair = false; std::deque<uint32_t> demandes; std::vector<std::string> appelsRpc; bool rpcAbsente = false; int rpcSansCle = 0;
  uint32_t ecoute = 0;   // réglage « Lire maintenant » envoyé par ba_boitier (« ec », secondes ; 0 = pas réglé)
  void rep(const std::string& t, uint32_t apres = 2) { envoyer(t, apres); }
  static std::string deux(int v) { char b[4]; snprintf(b, sizeof b, "%02d", v); return b; }
  std::string cclk(bool utc) {
    uint32_t u = EPOCH0 + g_millis / 1000;
    uint32_t l = utc ? u : u + 3600;
    int y, m, d; ba::horloge::dateDepuisJours((int32_t)(l / 86400), y, m, d);
    uint32_t s = l % 86400;
    return "\r\n+CCLK: \"" + deux(y % 100) + "/" + deux(m) + "/" + deux(d) + "," + deux(s / 3600) + ":" + deux(s / 60 % 60) + ":" + deux(s % 60) + (utc ? "+00" : "+04") + "\"\r\n\r\nOK\r\n";
  }
  bool ntpFait = false; uint32_t demandeSuivante = 7;
  void recu(const uint8_t* b, size_t n) override {
    for (size_t i = 0; i < n; i++) {
      if (data) { corps += (char)b[i]; if (corps.size() == attendus) { data = false; envois.push_back(corps); rep("\r\nOK\r\n", 20); } continue; }
      ligne += (char)b[i];
      if (ligne.size() >= 2 && ligne.substr(ligne.size() - 2) == "\r\n") { std::string c = ligne.substr(0, ligne.size() - 2); ligne.clear(); commande(c); }
    }
  }
  void commande(const std::string& c) {
    auto commence = [&](const char* p) { return c.compare(0, strlen(p), p) == 0; };
    if (commence("AT+HTTPPARA=\"URL\",\"")) { url = c.substr(19, c.size() - 20); rep("\r\nOK\r\n"); return; }
    if (commence("AT+HTTPPARA=\"USERDATA\",\"")) { entete = c.substr(24, c.size() - 25); rep("\r\nOK\r\n"); return; }
    if (c == "AT" || c == "ATE0" || commence("AT+CMEE") || commence("AT+CTZU") || commence("AT+CFUN") || commence("AT+CDNSCFG") || commence("AT+COPS=") || commence("AT+CNMP") || commence("AT+CEREG=") || commence("AT+CGDCONT") || commence("AT+CSSLCFG") || commence("AT+HTTPPARA")) rep("\r\nOK\r\n");
    else if (c == "AT+CGMR") rep("\r\n+CGMR: A011B07A7670M7_F\r\n\r\nOK\r\n");
    else if (c == "AT+CPIN?") rep("\r\n+CPIN: READY\r\n\r\nOK\r\n");
    else if (c == "AT+CEREG?" || c == "AT+CGREG?" || c == "AT+CREG?") rep(std::string("\r\n") + c.substr(2, c.size() - 3) + ": 0," + (reseau ? "1" : "2") + "\r\n\r\nOK\r\n");
    else if (c == "AT+CSQ") rep("\r\n+CSQ: 21,99\r\n\r\nOK\r\n");
    else if (c == "AT+COPS?") rep("\r\n+COPS: 0,0,\"Proximus\",7\r\n\r\nOK\r\n");
    else if (c == "AT+CGACT?") rep("\r\n+CGACT: 1,1\r\n\r\nOK\r\n");
    else if (c == "AT+CGPADDR=1") rep("\r\n+CGPADDR: 1,10.71.3.12\r\n\r\nOK\r\n");
    else if (c == "AT+CCLK?") rep((nitz || ntpFait) ? cclk(ntpFait && !nitz) : std::string("\r\n+CCLK: \"70/01/01,00:00:12+00\"\r\n\r\nOK\r\n"));
    else if (commence("AT+CNTP=")) rep("\r\nOK\r\n");
    else if (c == "AT+CNTP") { rep("\r\nOK\r\n"); if (ntp) { ntpFait = true; rep("\r\n+CNTP: 0\r\n", 1500); } else rep("\r\n+CNTP: 1\r\n", 1500); }
    else if (c == "AT+HTTPTERM") rep(httpOuverts ? (httpOuverts = 0, "\r\nOK\r\n") : "\r\nERROR\r\n");
    else if (c == "AT+HTTPINIT") { httpOuverts = 1; url.clear(); entete.clear(); rep("\r\nOK\r\n"); }
    else if (commence("AT+HTTPDATA=")) { attendus = (size_t)atol(c.c_str() + 12); corps.clear(); data = true; rep("\r\nDOWNLOAD\r\n"); }
    else if (c == "AT+HTTPACTION=1") {
      actions++;
      rep("\r\nOK\r\n");
      if (!reseau || !serveur) { rep("\r\n+HTTPACTION: 1,706,0\r\n", 3000); reponse.clear(); return; }
      if (url.find("/rest/v1/rpc/ba_boitier") != std::string::npos) {     // base de données (PostgREST)
        std::string corpsRpc = envois.empty() ? "" : envois.back(); envois.pop_back();
        appelsRpc.push_back(corpsRpc);
        int cr = 200;
        if (rpcAbsente) { cr = 404; reponse = "{\"code\":\"PGRST202\",\"message\":\"Could not find the function public.ba_boitier\"}"; }
        else if (entete.find("apikey: sb_publishable_") != 0) { cr = 401; rpcSansCle++; reponse = "{\"message\":\"No API key found in request\"}"; }
        else {
          uint32_t d = 0; if (!demandes.empty() && demandes.front() <= g_millis / 60000) { demandes.pop_front(); d = demandeSuivante++; }
          // comme json_build_object : des espaces autour des deux-points
          reponse = "{\"ok\" : " + std::string(code == 200 ? "true" : "false") + ", \"t\" : " + std::to_string(EPOCH0 + g_millis / 1000) + ", \"dem\" : " + std::to_string(d) + ", \"brut\" : " + std::string(brutImpair && d && (d % 2) ? "true" : "false") + ", \"fait\" : 0" + (ecoute ? ", \"ec\" : " + std::to_string(ecoute) : std::string("")) + "}";
        }
        rep("\r\n+HTTPACTION: 1," + std::to_string(cr) + "," + std::to_string(reponse.size()) + "\r\n", 1500);
        return;
      }
      reponse = code == 200 ? "{\"ok\":true,\"t\":" + std::to_string(EPOCH0 + g_millis / 1000) + "}" : "{\"ok\":false,\"error\":\"clé inconnue\"}";
      rep("\r\n+HTTPACTION: 1," + std::to_string(code) + "," + std::to_string(reponse.size()) + "\r\n", 1800);
    }
    else if (commence("AT+HTTPREAD=")) rep("\r\nOK\r\n\r\n+HTTPREAD: " + std::to_string(reponse.size()) + "\r\n" + reponse + "\r\n+HTTPREAD: 0\r\n");
    else rep("\r\nERROR\r\n");
  }
};

// ---------------- Machine FAS simulée (un message à la fois, après l'ACK) ----------------
struct FausseMachine : Port {
  std::string rapport, evenement; bool active = true, echo = false, envoiApresLecture = false;
  uint8_t mTx = 0, lastPcXx = 0; std::deque<std::vector<uint8_t>> file; bool attendAck = false; uint8_t xxAttendu = 0;
  int lectures = 0, sessionsMachine = 0; bool esclave = false; int sondesDex = 0;
  void ctrl(uint8_t type, uint8_t b4, uint8_t b5) { std::vector<uint8_t> f = {5, type, 0x40, b4, b5, 1}; ba::ddcmp::avecCrc(f); envoyer(std::string(f.begin(), f.end()), 3); }
  void msg(const std::vector<uint8_t>& body) { mTx++; auto m = ba::ddcmp::message(body, lastPcXx, mTx, 1); envoyer(std::string(m.begin(), m.end()), 3); }
  void pousser(const std::vector<uint8_t>& b) { file.push_back(b); if (!attendAck) suivant(); }
  void suivant() { if (file.empty()) { attendAck = false; return; } auto b = file.front(); file.pop_front(); msg(b); attendAck = true; xxAttendu = mTx; }
  void blocs(const std::string& t) { uint8_t nb = 0; for (size_t i = 0; i < t.size(); i += 250) { std::vector<uint8_t> bl = {0x99, ++nb}; for (size_t k = i; k < i + 250 && k < t.size(); k++) bl.push_back((uint8_t)t[k]); pousser(bl); } }
  const std::string& texteMachine() const { return evenement.empty() ? rapport : evenement; }
  void ouvrirSession() { mTx = 0; lastPcXx = 0; esclave = true; sessionsMachine++; file.clear(); attendAck = false; ctrl(6, 0, 0); }
  void recu(const uint8_t* b, size_t n) override {
    if (echo) { envoyer(std::string((const char*)b, n), 2); return; }
    if (!active) return;
    if (n == 1 && (b[0] == 5 || b[0] == 4)) { sondesDex++; return; }      // v1.4 : reconnaissance DEX (un seul octet), sans effet sur une Power Lift
    if (!ba::ddcmp::autorise(b, n)) { printf("!!! TRAME INTERDITE ENVOYÉE À LA MACHINE\n"); exit(3); }
    if (n == 8 && b[0] == 5) {
      if (b[1] == 6) { mTx = 0; lastPcXx = 0; file.clear(); attendAck = false; esclave = false; ctrl(7, 0, 0); }
      else if (b[1] == 7) { if (esclave) pousser({0x77, 0xE0, 0, 0, 0, 0, 0, 0x30, 0x10, 0x26, 0x04, 0x19, 0x00, 'F', 'A', 0x0B}); }
      else if (b[1] == 1) { if (attendAck && b[3] == xxAttendu) { attendAck = false; suivant(); if (!attendAck && esclave && file.empty() && finBlocs) { finBlocs = false; pousser({0x77, 0xFF}); } } }
      return;
    }
    lastPcXx = b[4];
    const uint8_t* c = b + 8;
    if (c[0] == 0x77 && c[1] == 0xE0) pousser({0x88, 0xE0, 1, 0, 0, 0, 0, '2', '0', '2', '1', '6', '4', '1', '7', 1, 2, 0, 0, 1, 0});
    else if (c[0] == 0x77 && c[1] == 0xE2) { lectures++; uint16_t L = rapport.size(); pousser({0x88, 0xE2, 1, c[3], 1, 0, 0, (uint8_t)(L >> 8), (uint8_t)(L & 255)}); blocs(rapport); }
    else if (c[0] == 0x77 && c[1] == 0xFF) { ctrl(1, lastPcXx, 0); if (envoiApresLecture && !esclave) envoiPrevu = g_millis + 2000; }
    else if (c[0] == 0x88 && c[1] == 0xE0) { ctrl(1, lastPcXx, 0); uint16_t L = texteMachine().size(); pousser({0x77, 0xE3, 0, 2, (uint8_t)(L >> 8), (uint8_t)(L & 255)}); }
    else if (c[0] == 0x88 && c[1] == 0xE3) { ctrl(1, lastPcXx, 0); blocs(texteMachine()); finBlocs = true; }
  }
  bool finBlocs = false; uint32_t envoiPrevu = 0;
};


// ---------------- Machine FAS 480 simulée (DEX-UCS, commande 90 = 6) ----------------
struct FausseMachineDex : Port {
  std::string releve; int phase = 0; std::string buf; size_t bloc = 0; std::vector<std::string> blocs; bool active = true; int lectures = 0;
  void pousse(std::initializer_list<uint8_t> l, uint32_t apres = 12) { std::string t; for (auto b : l) t += (char)b; envoyer(t, apres); }
  void blocPousse(const std::string& d, bool dernier) {
    std::vector<uint8_t> z(d.begin(), d.end()); z.push_back(dernier ? 3 : 0x17); uint16_t c = ba::dex::crc16(z);
    std::string t = "\x10\x02" + d; t += (char)0x10; t += (char)(dernier ? 3 : 0x17); t += (char)(c & 255); t += (char)(c >> 8); envoyer(t, 15);
  }
  void recu(const uint8_t* b, size_t n) override {
    if (!active) return;
    for (size_t i = 0; i < n; i++) {
      uint8_t c = b[i];
      if (phase == 0) { if (c == 5) { pousse({0x10, '0'}); phase = 1; buf.clear(); } }
      else if (phase == 1) {
        if (c == 4) { phase = 0; continue; }
        buf += (char)c;
        if (buf.size() >= 4 && (uint8_t)buf[buf.size() - 4] == 0x10 && (uint8_t)buf[buf.size() - 3] == 3) { pousse({0x10, '1'}); phase = 2; }
      } else if (phase == 2) { if (c == 4) { pousse({5}, 40); phase = 3; } }
      else if (phase == 3) {
        if (c == 0x30) {
          std::string s = "00FAS00000001R01L01"; std::vector<uint8_t> id(s.begin(), s.end()), z = id; z.push_back(3); uint16_t cr = ba::dex::crc16(z);
          std::string t = "\x10\x01" + s; t += (char)0x10; t += (char)3; t += (char)(cr & 255); t += (char)(cr >> 8); envoyer(t, 20); phase = 4;
        }
      } else if (phase == 4) { if (c == 0x31) { pousse({4, 5}, 30); phase = 5; } }
      else if (phase == 5) {
        if (c == 0x30) { lectures++; blocs.clear(); for (size_t p = 0; p < releve.size(); p += 200) blocs.push_back(releve.substr(p, 200)); bloc = 1; blocPousse(blocs[0], blocs.size() == 1); phase = 6; }
      } else if (phase == 6) {
        if (c == 0x30 || c == 0x31) { if (bloc < blocs.size()) { blocPousse(blocs[bloc], bloc + 1 == blocs.size()); bloc++; } else { pousse({4}); phase = 0; } }
      }
    }
  }
};
// relevé INVENTÉ, de la forme de celui d'une 480 (aucune donnée réelle)
static std::string inventerDex(int ventes, bool erreurNouvelle) {
  std::vector<std::string> l = {"ST*001*0001", "ID1*FAS00000001* 480 TEST  *0280", "ID4*2*39", "ID5*121019*0930", "VA1*" + std::to_string(100000 + 270 * ventes) + "*" + std::to_string(400 + ventes) + "*100000*400",
    "PA1*1*270*0", "PA2***" + std::to_string(10 + ventes), "PA1*2*270*0", "PA2***20", "EA3*0*121019*0930****"};
  int h = 9, m = 30; for (int i = 0; i < 96; i++) { char b[40]; snprintf(b, sizeof b, "MA5*TEMP*%02d%02d*%d", h, m, 17 + i % 3); l.push_back(b); m += 15; if (m >= 60) { m -= 60; h = (h + 1) % 24; } }
  l.push_back("MA5*ERROR*070111*1630*10*0"); l.push_back("MA5*ERROR*100116*2117*2*5");
  if (erreurNouvelle) l.push_back("MA5*ERROR*121019*1010*2*3");
  std::string z; for (auto& x : l) z += x + "\r\n";
  char g[8]; snprintf(g, sizeof g, "%04X", ba::filtre::crc16(z));
  return "DXS*1234567890*VA*V1/1\r\n" + z + "G85*" + g + "\r\nSE*" + std::to_string(l.size() + 1) + "*0001\r\nDXE*1*1\r\n";
}
static FausseMachineDex machineDex;

// Après avoir changé un chiffre du relevé simulé, la machine recalcule son contrôle G85 (sinon le boîtier le jugerait abîmé)
static void refaireG85(std::string& r) {
  std::vector<std::string> l; std::string cur;
  for (char c : r) { if (c == '\n') { if (!cur.empty() && cur.back() == '\r') cur.pop_back(); l.push_back(cur); cur.clear(); } else cur += c; }
  size_t iSt = l.size(), iG = l.size();
  for (size_t i = 0; i < l.size(); i++) { if (iSt == l.size() && l[i].compare(0, 3, "ST*") == 0) iSt = i; else if (iSt != l.size() && l[i].compare(0, 4, "G85*") == 0) { iG = i; break; } }
  if (iG == l.size()) return;
  l[iG] = "G85*" + ba::filtre::g85De(l, iSt, iG);
  r.clear(); for (auto& x : l) { r += x; r += "\r\n"; }
}
static FauxModem modemSim; static FausseMachine machineSim;
static std::map<uint32_t, int> evenements;           // ms → action
static void simMachineTick();
void simTick() {
  simMachineTick();
  auto it = evenements.find(g_millis);
  if (it == evenements.end()) return;
  int a = it->second;
  if (a == 1) machineSim.ouvrirSession();
  if (a == 2) { size_t p = machineSim.rapport.find("VA1*637720*2236"); if (p != std::string::npos) { machineSim.rapport.replace(p, 15, "VA1*637970*2237"); refaireG85(machineSim.rapport); } }
  if (a == 8) machineSim.active = false;                       // la machine ne répond plus (menu de réglage)
  if (a == 9) machineSim.active = true;
  if (a == 10) { size_t p = machineSim.rapport.find("VA1*637970*2237"); if (p != std::string::npos) { machineSim.rapport.replace(p, 15, "VA1*638220*2238"); refaireG85(machineSim.rapport); } }
  if (a == 20) machineDex.releve = inventerDex(1, false);
  if (a == 21) machineDex.releve = inventerDex(1, true);
  if (a == 22) machineDex.active = false;
  if (a == 23) machineDex.active = true;
  if (a == 3) modemSim.reseau = false;
  if (a == 4) modemSim.reseau = true;
  if (a == 5) Serial.console += "etat\n";
  if (a == 6) Serial.console += "AT+CSQ\n";
  if (a == 7) Serial.console += "etat\n";
}
static void simMachineTick() { if (machineSim.envoiPrevu && g_millis >= machineSim.envoiPrevu) { machineSim.envoiPrevu = 0; machineSim.ouvrirSession(); } }

int main(int argc, char** argv) {
  std::ifstream f(argv[1], std::ios::binary); std::stringstream ss; ss << f.rdbuf();
  std::string r; for (char c : ss.str()) { if (c == '\n' && (r.empty() || r.back() != '\r')) r += '\r'; r += c; }
  machineSim.rapport = r;
  std::string scen = argc > 2 ? argv[2] : "normal";
  uint32_t duree = 75UL * 60000UL;
  if (scen == "sans_nitz") modemSim.nitz = false;
  if (scen == "sans_heure") { modemSim.nitz = false; modemSim.ntp = false; }
  if (scen == "normal") { evenements[20UL * 60000UL] = 2; evenements[21UL * 60000UL + 10] = 1; evenements[40UL * 60000UL] = 5; evenements[41UL * 60000UL] = 6; }
  if (scen == "coupure") { evenements[3UL * 60000UL] = 3; evenements[25UL * 60000UL] = 4; evenements[10UL * 60000UL] = 2; }
  // v1.3 : surveillance des ventes : vente à 5 min 07 s, autre vente à 12 min 30 s ; la machine reste muette de 15 à 28 min (menu)
  if (scen == "vente") { evenements[5UL * 60000UL + 7000] = 2; evenements[12UL * 60000UL + 30000] = 10; evenements[15UL * 60000UL] = 8; evenements[28UL * 60000UL] = 9; duree = 40UL * 60000UL; }
  if (scen == "cle") modemSim.code = 401;
  if (scen == "boucle") { machineSim.echo = true; duree = 10000; }
  // bouton « Lire maintenant » : demande n°7 à 10 min, n°8 à 30 min (relevé identique : envoyé quand même)
  if (scen == "demande") { modemSim.demandes = {10, 30}; evenements[45UL * 60000UL] = 7; }
  // v1.3 : onglet « Flux brut » : la 1re demande (n°impair) réclame le relevé complet, la 2e est une lecture normale (allégée)
  if (scen == "brut") { modemSim.brutImpair = true; modemSim.demandes = {10, 30}; duree = 45UL * 60000UL; }
  if (scen == "demande_essai") { modemSim.demandes = {4}; duree = 15UL * 60000UL; }
  if (scen == "sql_absente") { modemSim.rpcAbsente = true; duree = 40UL * 60000UL; }
  // v1.2 : l'admin règle « Lire maintenant » sur 15 min ; une demande à 50 min est prise au passage suivant
  if (scen == "reglage") { modemSim.ecoute = 900; modemSim.demandes = {50}; duree = 95UL * 60000UL; }
  // la machine envoie elle-même un événement (vente) : envoi + lecture de contrôle juste après
  const char* EV = "DXS*FAS000000001*VA*V1/6*1\r\nST*001*0001\r\nEA1*EGS*261030*1442***+1\r\nEA2*EGS****1\r\nG85*1234\r\nSE*5*001*0001\r\nDXE*1*1\r\n";
  if (scen == "evenement") { machineSim.evenement = EV; evenements[20UL * 60000UL] = 2; evenements[20UL * 60000UL + 10] = 1; duree = 30UL * 60000UL; }
  // la machine envoie quelque chose juste après chacune de nos lectures : pas de lectures en boucle
  if (scen == "rafale") { machineSim.evenement = EV; machineSim.envoiApresLecture = true; duree = 140UL * 60000UL; }
  // v1.4 : FAS 480 (DEX) : vente à 20 min, erreur nouvelle à 35 min, machine muette de 50 à 58 min
  if (scen == "dex") { evenements[20UL * 60000UL] = 20; evenements[35UL * 60000UL] = 21; evenements[50UL * 60000UL] = 22; evenements[58UL * 60000UL] = 23; duree = 75UL * 60000UL; machineDex.releve = inventerDex(0, false); }
  ModemSerial.port = &modemSim; MachineSerial.port = (scen == "dex") ? (Port*)&machineDex : (Port*)&machineSim;
  setup();
  while (g_millis < duree) loop();
  // Résumé pour le script d'essai
  FILE* o = fopen("envois.txt", "w");
  for (auto& e : modemSim.envois) { fputs(e.c_str(), o); fputc('\n', o); }
  fclose(o);
  o = fopen("rpc.txt", "w");
  for (auto& e : modemSim.appelsRpc) { fputs(e.c_str(), o); fputc('\n', o); }
  fclose(o);
  fprintf(stderr, "RESUME scen=%s envois=%zu lectures=%d sessionsMachine=%d restarts=%d http=%d rpc=%zu rpcSansCle=%d\n", scen.c_str(), modemSim.envois.size(), machineSim.lectures, machineSim.sessionsMachine, g_restarts, modemSim.actions, modemSim.appelsRpc.size(), modemSim.rpcSansCle);
  return 0;
}
