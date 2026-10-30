// ============================================================
// BROODAUTOMATE — Heure du boîtier
// L'heure UTC vient du réseau 4G (heure de l'opérateur ou serveur NTP) ou,
// à défaut, de la réponse de Supabase. L'heure belge (été / hiver, règle
// européenne) en est déduite : c'est elle qui part dans le « Who Are You »,
// comme l'heure du PC avec le câble.
// Ce fichier ne dépend pas d'Arduino (il est essayé sur ordinateur).
// ============================================================
#pragma once
#include <stdint.h>
#include "ddcmp_moteur.h"

namespace ba {
namespace horloge {

// Jours depuis le 1/1/1970 (algorithme « days from civil », calendrier grégorien)
inline int32_t joursDepuis1970(int y, int m, int d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int32_t)doe - 719468;
}
inline void dateDepuisJours(int32_t z, int& y, int& m, int& d) {
  z += 719468;
  const int32_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  d = (int)(doy - (153 * mp + 2) / 5 + 1);
  m = (int)(mp < 10 ? mp + 3 : mp - 9);
  y = (int)(yoe + era * 400 + (m <= 2));
}
inline uint32_t epoch(int y, int mo, int d, int h, int mi, int s) {
  return (uint32_t)((int64_t)joursDepuis1970(y, mo, d) * 86400 + h * 3600 + mi * 60 + s);
}
// Jour de la semaine : 0 = dimanche
inline int jourSemaine(int y, int m, int d) { int32_t z = joursDepuis1970(y, m, d); return (int)(((z % 7) + 11) % 7); }
inline int dernierDimanche(int y, int m) {
  static const int nb[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  int jours = nb[m - 1] + (m == 2 && ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) ? 1 : 0);
  return jours - jourSemaine(y, m, jours);
}
// Heure d'été européenne : du dernier dimanche de mars 01:00 UTC au dernier dimanche d'octobre 01:00 UTC
inline bool heureEte(uint32_t utc) {
  int y, m, d; dateDepuisJours((int32_t)(utc / 86400), y, m, d);
  uint32_t debut = epoch(y, 3, dernierDimanche(y, 3), 1, 0, 0);
  uint32_t fin = epoch(y, 10, dernierDimanche(y, 10), 1, 0, 0);
  return utc >= debut && utc < fin;
}
// Heure de Bruxelles
inline HeureLocale bruxelles(uint32_t utc) {
  uint32_t l = utc + (heureEte(utc) ? 7200 : 3600);
  int y, m, d; dateDepuisJours((int32_t)(l / 86400), y, m, d);
  uint32_t s = l % 86400;
  HeureLocale h;
  h.jour = (uint8_t)d; h.mois = (uint8_t)m; h.annee2 = (uint8_t)(y % 100);
  h.heure = (uint8_t)(s / 3600); h.minute = (uint8_t)(s / 60 % 60); h.seconde = (uint8_t)(s % 60);
  return h;
}
// Heure plausible (le modem donne 1970, 1980 ou 2070 tant qu'il ne connaît pas l'heure)
inline bool plausible(uint32_t utc) { return utc >= 1767225600u /* 1/1/2026 */ && utc < 2524608000u /* 1/1/2050 */; }

// « 26/10/30,04:19:00+04 » (AT+CCLK) → UTC ; le décalage est en quarts d'heure
inline bool depuisCclk(const char* p, uint32_t& utc) {
  int y, mo, d, h, mi, s, q = 0; char signe = '+';
  int n = sscanf(p, "%d/%d/%d,%d:%d:%d%c%d", &y, &mo, &d, &h, &mi, &s, &signe, &q);
  if (n < 6 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return false;
  if (n < 8) { q = 0; signe = '+'; }
  int64_t l = (int64_t)epoch(2000 + y, mo, d, h, mi, s);
  int64_t dec = (int64_t)q * 15 * 60;
  int64_t u = signe == '-' ? l + dec : l - dec;
  if (u < 0 || !plausible((uint32_t)u)) return false;
  utc = (uint32_t)u;
  return true;
}

}  // namespace horloge
}  // namespace ba
