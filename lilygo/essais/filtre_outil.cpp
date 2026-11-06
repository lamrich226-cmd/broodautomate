// Outil d'essai : filtre un relevé (fichier) comme le fait le boîtier et l'écrit sur la sortie standard.
//   g++ -std=gnu++17 -I../broodautomate_lilygo filtre_outil.cpp -o filtre_outil && ./filtre_outil releve.txt [clé de la dernière température déjà envoyée]
#include "filtre.h"
#include <fstream>
#include <sstream>
#include <iostream>
int main(int argc, char** argv) {
  if (argc < 2) return 2;
  std::ifstream f(argv[1], std::ios::binary); std::stringstream ss; ss << f.rdbuf();
  std::string vue = argc > 2 ? argv[2] : "";
  std::cout << ba::filtre::alleger(ss.str(), vue);
  std::cerr << vue;                                    // clé de la température la plus récente, pour le test
  return 0;
}
