// ============================================================
// BROODAUTOMATE — Configuration
// ============================================================
// MODE RÉEL  : url + key remplies  → connexion Supabase (données en ligne)
// MODE LOCAL : mettre "REMPLACER_ICI" dans url ET key → simulateur de démo
// La clé "publishable" peut être dans le code. NE JAMAIS y mettre
// la clé "secret" ni "service_role".
// ============================================================

const BA_CONFIG = {
  app: { name: "Broodautomate Flotte", version: "3.1.0" },
  currency: "EUR",
  lowStockThreshold: 3,

  supabase: {
    url: "https://ujvihkryzjrawamekwpu.supabase.co",
    key: "sb_publishable_s6F8C6S_gDlh68L5BfJ47Q_coFMjWKI"
  },

  // Câble RS232 (valeurs par défaut ; chaque PC garde ses propres réglages
  // dans l'onglet « Connexion RS232 »)
  rs232: {
    vitesse: 9600,              // la même que dans la commande 90 de la machine
    intervalleMin: 15,          // lecture automatique (désactivée tant qu'elle n'est pas cochée)
    identifiantPc: "00000001",  // n° que le PC donne quand la machine demande « Who Are You »
    signaux: true               // DTR et RTS levés (sans effet avec un câble 3 fils 2-3-5)
  },

  // Machines de démonstration (utilisées uniquement en MODE LOCAL)
  machines: [
    { id: "FAS-202166085", name: "Bruxelles Centre", city: "Bruxelles", serial: "202166085" },
    { id: "FAS-002", name: "Anvers Gare", city: "Anvers" },
    { id: "FAS-003", name: "Liège Place", city: "Liège" },
    { id: "FAS-004", name: "Namur Station", city: "Namur" }
  ],

  simulator: {
    saleIntervalMs: 10000,
    telemetryIntervalMs: 5000,
    errorProbability: 0.02,
    targetTempC: 4.0
  }
};
