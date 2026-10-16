// ============================================================
// BROODAUTOMATE — Parser EVA-DTS (v2, calé sur un vrai fichier FAS)
// Lit les trames / fichiers d'audit envoyés par la machine FAS
// Fonctionne aussi avec les trames du simulateur
//
// Ce que contient réellement un audit FAS (vérifié sur un vrai fichier) :
//   VA1 : ventes et chiffre d'affaires cumulés de la machine
//   LA1 : nombre de ventes cumulées PAR SÉLECTION (c'est la référence)
//   PA1/PA2 : valeur vendue par sélection (certaines sélections n'y sont pas)
//   EA1 : historique des erreurs
//   MA5 : lignes propres à FAS (coupures de courant, réglages...) — pas des erreurs
// Le fichier ne contient NI le stock NI les prix.
// ============================================================

window.BA = window.BA || {};

BA.EvaDts = {

  parse(text) {
    const result = {
      machineId:    null,
      machineModel: null,
      machineDate:  null,   // date/heure lue dans le fichier (horloge machine, peu fiable)
      va1:          null,
      selections:   [],
      events:       [],     // erreurs (lignes EA1)
      powerEvents:  [],     // coupures / retours de courant (MA5 POW ON / POW OFF)
      header:       null,
      raw:          text
    };

    const nombre = v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const lines = String(text || "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const parSel = {};
    const entree = n => {
      if (!parSel[n]) parSel[n] = { selection: n, sold: 0, value: null, avgPrice: null };
      return parSel[n];
    };
    let courante = null;

    for (const line of lines) {
      const f   = line.split("*");
      const tag = f[0];

      switch (tag) {

        case "DXS":
          result.header = { sender: f[1], version: f[3] };
          break;

        case "ID1":
          result.machineId    = f[1] !== undefined ? f[1].trim() : null;
          result.machineModel = f[2] !== undefined ? f[2].trim() : null;
          break;

        case "ID5":
          result.machineDate = ((f[1] || "") + " " + (f[2] || "")).trim();
          break;

        case "VA1":
          result.va1 = {
            valueTotal:      nombre(f[1]) / 100,
            countTotal:      nombre(f[2]),
            valueSinceReset: nombre(f[3]) / 100,
            countSinceReset: nombre(f[4])
          };
          break;

        case "PA1":
          courante = entree(nombre(f[1]));
          break;

        case "PA2":
          if (courante) {
            const n = nombre(f[1]);
            // LA1 (plus bas) reste la référence si elle existe
            if (!courante._la) courante.sold = n;
            courante.value = nombre(f[2]) / 100;
          }
          break;

        case "LA1": {
          // LA1*0*<sélection>*0*<ventes cumulées>*<ventes depuis remise à zéro>
          const e = entree(nombre(f[2]));
          e.sold = nombre(f[4]);
          e._la  = true;
          break;
        }

        case "EA1":
          result.events.push({
            code:  f[1] || "",
            date:  f[2] || "",
            time:  f[3] || "",
            level: "error"
          });
          break;

        case "MA5":
          if (f[1] === "POW ON" || f[1] === "POW OFF") {
            result.powerEvents.push({ type: f[1], date: f[2] || "", time: f[3] || "" });
          }
          // les autres MA5 (INDXPR, LIGHT, ERROR...) sont des réglages ou doublons : ignorés
          break;

        default:
          break;
      }
    }

    result.selections = Object.values(parSel)
      .map(e => {
        delete e._la;
        if (e.value !== null && e.sold > 0) e.avgPrice = Math.round((e.value / e.sold) * 100) / 100;
        return e;
      })
      .sort((a, b) => a.selection - b.selection);

    return result;
  },

  // Version courte, prête à être enregistrée (relevé d'audit)
  toAudit(analyse) {
    const va = analyse.va1 || { countTotal: 0, valueTotal: 0 };
    return {
      machine_date: analyse.machineDate || "",
      total_count:  va.countTotal,
      total_value:  Math.round(va.valueTotal * 100) / 100,
      selections:   analyse.selections.map(s => ({
        selection: s.selection,
        sold:      s.sold,
        value:     s.value
      })),
      errors: analyse.events.map(e => ({ code: e.code, date: e.date, time: e.time }))
    };
  },

  // Compare le nouveau relevé au précédent (ancien peut être null)
  compare(ancien, nouveau) {
    if (!ancien) {
      return { baseline: true, deltaCount: null, deltaValue: null, parSelection: [], anomalies: false, identique: false };
    }

    const deltaCount = nouveau.total_count - ancien.total_count;
    const deltaValue = Math.round((nouveau.total_value - ancien.total_value) * 100) / 100;

    const avant = {};
    (ancien.selections || []).forEach(s => { avant[s.selection] = s.sold; });

    const parSelection = [];
    let anomalies = deltaCount < 0 || deltaValue < 0;

    (nouveau.selections || []).forEach(s => {
      const d = s.sold - (avant[s.selection] || 0);
      if (d < 0) anomalies = true;
      if (d !== 0) parSelection.push({ selection: s.selection, delta: d });
    });

    return {
      baseline:   false,
      deltaCount: deltaCount,
      deltaValue: deltaValue,
      parSelection,
      anomalies,
      identique:  !anomalies && deltaCount === 0 && deltaValue === 0 && parSelection.length === 0
    };
  }
};
