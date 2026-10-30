// ============================================================
// BROODAUTOMATE — Configuration (v5.1)
// Version 5 : toutes les fonctions de la version de test 4.8.1
// (Dashboard, lots datés, appli opérateur, Commander, Prévisions,
// Statistiques, Historique, FR/NL/EN), branchées sur les vraies
// machines : câble RS232 (EVA-DTS DDCMP, réglages inchangés) et
// Supabase (données partagées entre l'admin et l'opérateur).
// v5.1 : boîtiers 4G (LILYGO) qui lisent les machines à distance.
// ============================================================
// MODE RÉEL  : url + key remplies  → connexion Supabase (données en ligne)
// MODE LOCAL : mettre "REMPLACER_ICI" dans url ET key → données gardées dans ce navigateur
// La clé "publishable" peut être dans le code. NE JAMAIS y mettre
// la clé "secret" ni "service_role".
// ============================================================

const BA_CONFIG = {
  app: { name: "Broodautomate", version: "5.1.0" },
  currency: "EUR",

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

  // Copie des données sur cet appareil (sert aussi en mode local)
  storageKey: "broodautomate-v5",

  // Une machine est « en ligne » si elle a envoyé des données il y a moins de N minutes
  onlineMinutes: 45,
  // Erreur de la machine sans état « en cours / terminée » (erreurs FAS) : considérée réglée après N heures
  machineErrorHours: 6,

  // Réglages par défaut (modifiables dans l'onglet « Paramètres » de l'admin)
  defaults: {
    thrHours: 48,          // un lot devient « à retirer » après 48 h
    dayHour: 4,            // le « jour suivant » commence à 4 h : un pain gardé une fois (« encore bon »)
                           // devient invalide au jour suivant (retrait obligatoire à la tournée du lendemain)
    emptyPct: 0,           // machine « vide » (rouge) à 0 % de remplissage
    tempMin: 14,           // température normale (°C)
    tempMax: 18,
    purchase: {            // prix d'achat au boulanger, par pain (€)
      blanc: 1.00, gris: 1.05, complet: 1.15, maya: 1.30, sandwich: 1.60
    },
    salePrice: 2.50,       // prix de vente par défaut
    fixedMonthly: 150,     // frais fixes par machine et par mois (€) : emplacement, électricité, SIM…
    cardFeePct: 1.5,       // frais de paiement par carte (% du chiffre d'affaires)

    // Prévisions (onglet « Prévisions & calendrier » et « Commander »)
    forecast: {
      weeks: 8,              // historique utilisé : 8 dernières semaines
      weighting: "recent",   // "recent" : les semaines récentes comptent plus ; "equal" : toutes pareil
      source: "auto",        // "auto" : profil de la machine si assez d'historique, sinon toutes les machines
      minWeeks: 4,           // historique minimum pour utiliser le profil de la machine
      excludeSpecial: true,  // ne pas compter les fériés / vacances dans le profil par jour
      excludeAnomalies: true,// ne pas compter les jours avec machine vide ou coupure
      anomalyHours: 3,       // … à partir de 3 h de vide ou de coupure dans la journée
      hourly: "typical",     // ventes dans la journée : "typical" (matin et soir) ou "flat" (uniforme)
      nextVisitHours: 24,    // prochain passage habituel : 24 h après celui-ci
      safetyPct: 15,         // marge de sécurité sur le besoin (chargement « selon le besoin »)
      manualWeeks: 8         // un réglage fait à la main reste valable 8 semaines (puis retour à l'historique)
    }
  },

  // Répartition typique des ventes dans la journée (poids par heure, 0 h → 23 h)
  hourlyTypical: [0.3, 0.2, 0.1, 0.1, 0.2, 1, 4, 9, 9, 6, 5, 5, 6, 5, 4, 4, 5, 8, 9, 7, 4, 2, 1, 0.5],

  productTypes: ["blanc", "gris", "complet", "maya", "sandwich"],

  // Vacances scolaires (dates officielles, à confirmer dans l'appli)
  // vl = enseignement flamand (onderwijs.vlaanderen.be) ; bxl = Fédération Wallonie-Bruxelles
  schoolHolidays: [
    { key: "autumn", region: "vl",  from: "2025-10-27", to: "2025-11-02" },
    { key: "winter", region: "vl",  from: "2025-12-22", to: "2026-01-04" },
    { key: "carnival", region: "vl", from: "2026-02-16", to: "2026-02-22" },
    { key: "spring", region: "vl",  from: "2026-04-06", to: "2026-04-19" },
    { key: "ascension_bridge", region: "vl", from: "2026-05-15", to: "2026-05-15" },
    { key: "summer", region: "vl",  from: "2026-07-01", to: "2026-08-31" },
    { key: "autumn", region: "vl",  from: "2026-11-02", to: "2026-11-08" },
    { key: "winter", region: "vl",  from: "2026-12-21", to: "2027-01-03" },
    { key: "carnival", region: "vl", from: "2027-02-08", to: "2027-02-14" },
    { key: "spring", region: "vl",  from: "2027-03-29", to: "2027-04-11" },
    { key: "ascension_bridge", region: "vl", from: "2027-05-07", to: "2027-05-07" },
    { key: "summer", region: "vl",  from: "2027-07-01", to: "2027-08-31" },

    { key: "autumn", region: "bxl", from: "2025-10-20", to: "2025-11-02" },
    { key: "winter", region: "bxl", from: "2025-12-22", to: "2026-01-04" },
    { key: "carnival", region: "bxl", from: "2026-02-16", to: "2026-03-01" },
    { key: "spring", region: "bxl", from: "2026-04-27", to: "2026-05-10" },
    { key: "summer", region: "bxl", from: "2026-07-04", to: "2026-08-23" },
    { key: "autumn", region: "bxl", from: "2026-10-19", to: "2026-11-02" },
    { key: "winter", region: "bxl", from: "2026-12-21", to: "2027-01-03" },
    { key: "carnival", region: "bxl", from: "2027-02-22", to: "2027-03-07" },
    { key: "spring", region: "bxl", from: "2027-04-26", to: "2027-05-09" }
  ],

  // Calendrier : jours fériés gardés en arrière (nom hérité de la version test, il n'y a plus de simulateur)
  simulator: { historyDays: 400 }
};
