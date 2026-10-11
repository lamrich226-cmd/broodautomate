// ============================================================
// BROODAUTOMATE — Configuration
// ============================================================
// MODE RÉEL  : url + key remplies  → connexion Supabase (données en ligne)
// MODE LOCAL : mettre "REMPLACER_ICI" dans url ET key → simulateur de démo
// La clé "publishable" peut être dans le code. NE JAMAIS y mettre
// la clé "secret" ni "service_role".
// ============================================================

const BA_CONFIG = {
  app: { name: "Broodautomate Flotte", version: "3.0.0" },
  currency: "EUR",
  lowStockThreshold: 3,

  supabase: {
    url: "https://ujvihkryzjrawamekwpu.supabase.co",
    key: "sb_publishable_s6F8C6S_gDlh68L5BfJ47Q_coFMjWKI"
  },

  // Machines de démonstration (utilisées uniquement en MODE LOCAL)
  machines: [
    { id: "FAS-202166085", name: "Bruxelles Centre", city: "Bruxelles" },
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