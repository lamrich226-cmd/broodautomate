// ============================================================
// BROODAUTOMATE — Filtre des relevés (v1.3)
// Avant l'envoi 4G, le boîtier jette les lignes que Broodautomate n'utilise pas
// (caisse CA*, jetons TA2, lecteur DA1, réglages MA5…) et ne garde des températures
// que les nouvelles. Le relevé allégé reste un vrai relevé EVA-DTS : le nombre de
// lignes (SE) et le contrôle G85 sont recalculés, Broodautomate le lit comme avant.
// Si le relevé reçu est abîmé (G85 faux) ou pas reconnu : il part tel quel, sans filtre.
// Ce fichier ne dépend pas d'Arduino (il est essayé sur ordinateur).
// ============================================================
#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string>
#include <vector>

namespace ba {
namespace filtre {

inline uint16_t crc16(const std::string& s) {
  uint16_t c = 0;
  for (unsigned char b : s) {
    c ^= b;
    for (int k = 0; k < 8; k++) c = (c & 1) ? (uint16_t)((c >> 1) ^ 0xA001) : (uint16_t)(c >> 1);
  }
  return c;
}

// Les champs d'une ligne EVA-DTS (séparés par « * »)
inline std::vector<std::string> champs(const std::string& l) {
  std::vector<std::string> f(1);
  for (char c : l) { if (c == '*') f.emplace_back(); else f.back() += c; }
  return f;
}
inline bool commence(const std::string& l, const char* t) { return l.compare(0, std::char_traits<char>::length(t), t) == 0; }

// Contrôle G85 d'un relevé : CRC-16 de la ligne ST jusqu'à la ligne avant G85, fins de ligne CRLF
inline std::string g85De(const std::vector<std::string>& l, size_t iSt, size_t iG85) {
  std::string zone;
  for (size_t i = iSt; i < iG85; i++) { zone += l[i]; zone += "\r\n"; }
  char b[8]; snprintf(b, sizeof b, "%04X", crc16(zone));
  return b;
}

// Clé « AAMMJJhhmm » d'une ligne MA5*TEMPER*AAMMJJ*hhmm*valeur (pour savoir si la température est nouvelle)
inline std::string cleTemp(const std::vector<std::string>& f) { return (f.size() > 3 ? f[2] + f[3] : std::string()); }

// Relevé allégé.  vue = clé de la dernière température déjà envoyée (vide = aucune : on les envoie toutes) ;
// elle est mise à jour avec la plus récente de ce relevé.  Les octets d'origine des lignes gardées ne changent pas.
inline std::string alleger(const std::string& src, std::string& vue) {
  const char* eol = src.find("\r\n") != std::string::npos ? "\r\n" : "\n";
  std::vector<std::string> l;
  { std::string cur; for (char c : src) { if (c == '\n') { if (!cur.empty() && cur.back() == '\r') cur.pop_back(); l.push_back(cur); cur.clear(); } else cur += c; }
    if (!cur.empty()) { if (cur.back() == '\r') cur.pop_back(); l.push_back(cur); } }
  size_t iSt = l.size(), iG85 = l.size(), iSe = l.size();
  for (size_t i = 0; i < l.size(); i++) {
    if (iSt == l.size() && commence(l[i], "ST*")) iSt = i;
    else if (iSt != l.size() && iG85 == l.size() && commence(l[i], "G85*")) iG85 = i;
    else if (iSt != l.size() && commence(l[i], "SE*")) { iSe = i; break; }
  }
  if (iSt == l.size() || iSe == l.size()) return src;                      // pas un relevé EVA-DTS complet
  if (iG85 != l.size()) {                                                  // relevé abîmé : pas touché
    std::string annonce = l[iG85].size() > 4 ? l[iG85].substr(4) : "";
    std::string bon = g85De(l, iSt, iG85), inverse = bon.substr(2) + bon.substr(0, 2);
    for (auto& c : annonce) if (c >= 'a' && c <= 'f') c = (char)(c - 32);
    while (annonce.size() < 4) annonce = "0" + annonce;
    if (annonce != bon && annonce != inverse) return src;
  }
  std::vector<std::string> sortie;
  std::string plusRecente = vue;
  int derniereTemp = -1; std::string cleDerniere;                          // la température la plus récente du relevé (gardée même si elle n'est pas nouvelle)
  for (size_t i = 0; i < l.size(); i++) {
    const std::string& ligne = l[i];
    if (i < iSt || i > iSe) { sortie.push_back(ligne); continue; }          // DXS… / DXE…
    if (i == iSt || i == iSe || i == iG85) { sortie.push_back(ligne); continue; }   // recalculés plus bas
    bool garde = false;
    if (commence(ligne, "ID1*") || commence(ligne, "ID5*") || commence(ligne, "VA1*") || commence(ligne, "DA2*") ||
        commence(ligne, "PA1*") || commence(ligne, "PA2*") || commence(ligne, "LA1*") ||
        commence(ligne, "EA1*") || commence(ligne, "EA2*") || commence(ligne, "EA3*") || commence(ligne, "EA7*")) garde = true;
    else if (commence(ligne, "MA5*")) {
      auto f = champs(ligne);
      const std::string& e = f.size() > 1 ? f[1] : std::string();
      if (e == "ERROR" || e == "POW ON" || e == "POW OFF") garde = true;
      else if (e == "TEMPER") {
        std::string k = cleTemp(f);
        if (!k.empty() && (derniereTemp < 0 || k >= cleDerniere)) { derniereTemp = (int)sortie.size(); cleDerniere = k; }
        if (vue.empty() || k > vue) garde = true;
        if (k > plusRecente) plusRecente = k;
        if (!garde) { sortie.push_back(std::string("\x01") + ligne); continue; }   // repère : retirée à la fin si une plus récente est gardée
      }
    }
    if (garde) sortie.push_back(ligne);
  }
  // températures : les nouvelles ; s'il n'y en a aucune de nouvelle, la plus récente (Broodautomate affiche toujours la température)
  bool uneTemp = false;
  for (auto& s : sortie) if (commence(s, "MA5*TEMPER")) { uneTemp = true; break; }
  std::vector<std::string> final;
  for (size_t i = 0; i < sortie.size(); i++) {
    const std::string& s = sortie[i];
    if (!s.empty() && s[0] == '\x01') { if (!uneTemp && (int)i == derniereTemp) final.push_back(s.substr(1)); continue; }
    final.push_back(s);
  }
  vue = plusRecente;
  // SE : nombre de lignes de ST à SE ; G85 : contrôle recalculé
  size_t a = 0, g = final.size(), s = final.size();
  for (size_t i = 0; i < final.size(); i++) {
    if (!a && commence(final[i], "ST*")) a = i + 1;
    if (a && g == final.size() && commence(final[i], "G85*")) g = i;
    if (a && commence(final[i], "SE*")) { s = i; break; }
  }
  if (!a || s == final.size()) return src;
  if (g != final.size()) { std::vector<std::string> tmp(final.begin(), final.end()); final[g] = "G85*" + g85De(tmp, a - 1, g); }
  { auto f = champs(final[s]); f.resize(f.size() < 4 ? 4 : f.size()); f[1] = std::to_string(s - (a - 1) + 1);
    std::string n; for (size_t k = 0; k < f.size(); k++) { if (k) n += '*'; n += f[k]; } final[s] = n; }
  std::string o;
  for (auto& x : final) { o += x; o += eol; }
  return o;
}

}  // namespace filtre
}  // namespace ba
