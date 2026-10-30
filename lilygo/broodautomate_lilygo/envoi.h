// ============================================================
// BROODAUTOMATE — Préparation des envois vers Supabase
// (texte JSON, empreinte d'un relevé, lecture de la réponse)
// Ce fichier ne dépend pas d'Arduino (il est essayé sur ordinateur).
// ============================================================
#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string>

namespace ba {
namespace envoi {

// Texte → chaîne JSON. Les octets hors ASCII deviennent \u00XX : Broodautomate retrouve
// exactement les octets de la machine (indispensable pour le contrôle G85).
inline void json(std::string& o, const std::string& s) {
  o += '"';
  for (unsigned char c : s) {
    if (c == '"') o += "\\\"";
    else if (c == '\\') o += "\\\\";
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c < 0x20 || c > 0x7E) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += (char)c;
  }
  o += '"';
}

// Empreinte des compteurs d'un relevé : les lignes qui changent à chaque lecture
// (ID5 heure du relevé, EA3 nombre de lectures, G85 contrôle, SE fin) sont ignorées.
inline uint32_t empreinte(const std::string& s) {
  uint32_t h = 2166136261u;
  size_t i = 0;
  while (i < s.size()) {
    size_t e = s.find('\n', i); if (e == std::string::npos) e = s.size();
    size_t f = e; if (f > i && s[f - 1] == '\r') f--;
    bool ignore = s.compare(i, 3, "ID5") == 0 || s.compare(i, 3, "EA3") == 0 || s.compare(i, 3, "G85") == 0 || s.compare(i, 3, "SE*") == 0;
    if (!ignore) { for (size_t k = i; k < f; k++) { h ^= (unsigned char)s[k]; h *= 16777619u; } h ^= 0x0A; h *= 16777619u; }
    i = e + 1;
  }
  return h;
}

// Un relevé EVA-DTS complet commence par DXS et contient DXE
inline bool releveComplet(const std::string& s) {
  size_t a = s.find_first_not_of(" \r\n\t");
  return a != std::string::npos && s.compare(a, 3, "DXS") == 0 && s.find("DXE") != std::string::npos;
}

// Réponse de la fonction ingest : {"ok":true,"t":1761794340,...} → t (heure UTC du serveur)
inline bool lireNombre(const std::string& r, const char* cle, uint32_t& v) {
  std::string k = std::string("\"") + cle + "\":";
  size_t p = r.find(k);
  if (p == std::string::npos) return false;
  p += k.size();
  while (p < r.size() && r[p] == ' ') p++;
  uint64_t x = 0; size_t d = p;
  while (p < r.size() && r[p] >= '0' && r[p] <= '9' && p - d < 12) { x = x * 10 + (uint64_t)(r[p] - '0'); p++; }
  if (p == d || x > 0xFFFFFFFFull) return false;
  v = (uint32_t)x;
  return true;
}
inline bool reponseOk(const std::string& r) { return r.find("\"ok\":true") != std::string::npos; }

}  // namespace envoi
}  // namespace ba
