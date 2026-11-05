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

// Position de la valeur d'une clé dans une réponse JSON. Accepte les espaces autour des deux-points :
// la fonction ingest répond {"ok":true,"t":1761794340}, la base de données {"ok" : true, "t" : 1761794340}.
inline size_t apresCle(const std::string& r, const char* cle) {
  std::string k = std::string("\"") + cle + "\"";
  size_t p = 0;
  while ((p = r.find(k, p)) != std::string::npos) {
    size_t q = p + k.size();
    while (q < r.size() && (r[q] == ' ' || r[q] == '\t')) q++;
    if (q < r.size() && r[q] == ':') {
      q++;
      while (q < r.size() && (r[q] == ' ' || r[q] == '\t')) q++;
      return q;
    }
    p = q;
  }
  return std::string::npos;
}
// {"t":1761794340} → t (heure UTC du serveur) ; {"dem":12} → n° de la demande de lecture
inline bool lireNombre(const std::string& r, const char* cle, uint32_t& v) {
  size_t p = apresCle(r, cle);
  if (p == std::string::npos) return false;
  uint64_t x = 0; size_t d = p;
  while (p < r.size() && r[p] >= '0' && r[p] <= '9' && p - d < 12) { x = x * 10 + (uint64_t)(r[p] - '0'); p++; }
  if (p == d || x > 0xFFFFFFFFull) return false;
  v = (uint32_t)x;
  return true;
}
inline bool lireBool(const std::string& r, const char* cle, bool& v) {
  size_t p = apresCle(r, cle);
  if (p == std::string::npos) return false;
  if (r.compare(p, 4, "true") == 0) { v = true; return true; }
  if (r.compare(p, 5, "false") == 0) { v = false; return true; }
  return false;
}
inline bool reponseOk(const std::string& r) { bool v = false; return lireBool(r, "ok", v) && v; }

// SHA-256 (texte hexadécimal en minuscules). Sert à fabriquer, à partir de DEVICE_KEY, le nom du « canal » MQTT
// du boîtier : « ba/ » + 16 premiers caractères de l'empreinte. Supabase calcule la même chose (devices.key_hash).
inline std::string sha256hex(const std::string& msg) {
  static const uint32_t K[64] = {
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };
  uint32_t h[8] = { 0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19 };
  std::string m = msg;
  uint64_t bits = (uint64_t)msg.size() * 8;
  m += (char)0x80;
  while (m.size() % 64 != 56) m += (char)0;
  for (int i = 7; i >= 0; i--) m += (char)((bits >> (i * 8)) & 0xFF);
  auto rotd = [](uint32_t x, int n) { return (x >> n) | (x << (32 - n)); };
  for (size_t off = 0; off < m.size(); off += 64) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++)
      w[i] = ((uint32_t)(unsigned char)m[off + i * 4] << 24) | ((uint32_t)(unsigned char)m[off + i * 4 + 1] << 16) | ((uint32_t)(unsigned char)m[off + i * 4 + 2] << 8) | (uint32_t)(unsigned char)m[off + i * 4 + 3];
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotd(w[i - 15], 7) ^ rotd(w[i - 15], 18) ^ (w[i - 15] >> 3);
      uint32_t s1 = rotd(w[i - 2], 17) ^ rotd(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t S1 = rotd(e, 6) ^ rotd(e, 11) ^ rotd(e, 25), ch = (e & f) ^ (~e & g);
      uint32_t t1 = hh + S1 + ch + K[i] + w[i];
      uint32_t S0 = rotd(a, 2) ^ rotd(a, 13) ^ rotd(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
      uint32_t t2 = S0 + mj;
      hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  std::string o;
  for (int i = 0; i < 8; i++) { char b[9]; snprintf(b, sizeof b, "%08x", h[i]); o += b; }
  return o;
}
// Canal MQTT d'un boîtier : « ba/ » + 16 premiers caractères de SHA-256(clé du boîtier)
inline std::string canalMqtt(const std::string& cle) { return "ba/" + sha256hex(cle).substr(0, 16); }

}  // namespace envoi
}  // namespace ba
