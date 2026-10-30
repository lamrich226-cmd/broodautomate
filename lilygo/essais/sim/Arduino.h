// Petit simulateur Arduino / ESP32 pour essayer boitier.cpp sur ordinateur (modem et machine simulés).
#pragma once
#include <string>
#include <cstring>
#include <cstdio>
#include <cstdarg>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <vector>
#define F(x) (x)
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define SERIAL_8N1 0x800001c
extern uint32_t g_millis;
void simTick();                                   // fait avancer les appareils simulés d'1 ms
inline uint32_t millis() { return g_millis; }
inline void delay(uint32_t ms) { for (uint32_t i = 0; i < ms; i++) { g_millis++; simTick(); } }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}

class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& x) : s(x) {}
  String(char c) : s(1, c) {}
  String(int v) : s(std::to_string(v)) {}
  String(unsigned v) : s(std::to_string(v)) {}
  String(long v) : s(std::to_string(v)) {}
  String(unsigned long v) : s(std::to_string(v)) {}
  const char* c_str() const { return s.c_str(); }
  unsigned length() const { return (unsigned)s.size(); }
  String& operator+=(const String& o) { s += o.s; return *this; }
  String& operator+=(const char* o) { s += o; return *this; }
  String& operator+=(char c) { s += c; return *this; }
  friend String operator+(const String& a, const String& b) { return String(a.s + b.s); }
  friend String operator+(const String& a, const char* b) { return String(a.s + b); }
  friend String operator+(const char* a, const String& b) { return String(std::string(a) + b.s); }
  friend String operator+(const String& a, char b) { return String(a.s + b); }
  bool operator==(const String& o) const { return s == o.s; }
  bool operator==(const char* o) const { return s == o; }
  bool operator!=(const String& o) const { return s != o.s; }
  bool operator!=(const char* o) const { return s != o; }
  int indexOf(const char* x, unsigned from = 0) const { size_t p = s.find(x, from); return p == std::string::npos ? -1 : (int)p; }
  int indexOf(const String& x, unsigned from = 0) const { return indexOf(x.c_str(), from); }
  int indexOf(char c, unsigned from = 0) const { size_t p = s.find(c, from); return p == std::string::npos ? -1 : (int)p; }
  int lastIndexOf(char c) const { size_t p = s.rfind(c); return p == std::string::npos ? -1 : (int)p; }
  String substring(unsigned a) const { return a >= s.size() ? String() : String(s.substr(a)); }
  String substring(unsigned a, unsigned b) const { if (a >= s.size() || b <= a) return String(); return String(s.substr(a, b - a)); }
  long toInt() const { return atol(s.c_str()); }
  void trim() { size_t a = s.find_first_not_of(" \t\r\n"); if (a == std::string::npos) { s.clear(); return; } size_t b = s.find_last_not_of(" \t\r\n"); s = s.substr(a, b - a + 1); }
  void replace(const char* a, const char* b) { std::string x(a), y(b); if (x.empty()) return; size_t p = 0; while ((p = s.find(x, p)) != std::string::npos) { s.replace(p, x.size(), y); p += y.size(); } }
  void toLowerCase() { for (auto& c : s) c = (char)tolower((unsigned char)c); }
  bool startsWith(const char* p) const { return s.compare(0, strlen(p), p) == 0; }
};

struct Port {                                     // appareil branché sur un port série simulé
  virtual void recu(const uint8_t* b, size_t n) = 0;    // ce que l'ESP32 envoie
  std::deque<std::pair<uint32_t, uint8_t>> sortie;      // ce que l'appareil envoie (avec l'heure d'arrivée)
  void envoyer(const std::string& t, uint32_t apres = 0) { uint32_t at = g_millis + apres; if (!sortie.empty() && sortie.back().first > at) at = sortie.back().first; for (unsigned char c : t) sortie.push_back({at, c}); }
  virtual ~Port() {}
};
class HardwareSerial {
 public:
  int num; Port* port = nullptr; std::string console;
  explicit HardwareSerial(int n) : num(n) {}
  void begin(unsigned long, uint32_t = 0, int = -1, int = -1) {}
  void setRxBufferSize(size_t) {}
  int available() { if (!port) return (int)console.size(); int n = 0; for (auto& p : port->sortie) { if (p.first > g_millis) break; n++; } return n; }
  int read() {
    if (!port) { if (console.empty()) return -1; int c = (unsigned char)console[0]; console.erase(0, 1); return c; }
    if (port->sortie.empty() || port->sortie.front().first > g_millis) return -1;
    int c = port->sortie.front().second; port->sortie.pop_front(); return c;
  }
  size_t write(const uint8_t* b, size_t n) { if (port) port->recu(b, n); else fwrite(b, 1, n, stdout); return n; }
  size_t write(uint8_t c) { return write(&c, 1); }
  void flush() {}
  size_t print(const char* t) { return write((const uint8_t*)t, strlen(t)); }
  size_t print(const String& t) { return print(t.c_str()); }
  size_t print(char c) { return write((uint8_t)c); }
  size_t println(const char* t) { size_t n = print(t); return n + print("\n"); }
  size_t println(const String& t) { return println(t.c_str()); }
  size_t println() { return print("\n"); }
  int printf(const char* f, ...) { char b[1024]; va_list a; va_start(a, f); int n = vsnprintf(b, sizeof b, f, a); va_end(a); print(b); return n; }
};
extern HardwareSerial Serial;
struct EspClass { void restart(); };
extern EspClass ESP;
