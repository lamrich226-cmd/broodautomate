// ============================================================
// BROODAUTOMATE — Parser EVA-DTS (v3.1, calé sur un vrai fichier FAS)
// Lit les relevés envoyés par la machine FAS (clé USB ou câble RS232)
// et ceux du simulateur.
//
// Ce que contient réellement un audit FAS (vérifié sur un vrai fichier) :
//   VA1 : ventes et chiffre d'affaires de la machine.
//         VA101/VA102 = depuis la mise en service (CUMULÉS, jamais remis à zéro)
//         VA103/VA104 = depuis la dernière remise à zéro (« interim »)
//   LA1 : ventes PAR SÉLECTION et par liste de prix :
//         LA104 = depuis la remise à zéro, LA105 = CUMULÉES (référence)
//   PA1/PA2 : valeur vendue par sélection (PA202 cumulée) ; certaines
//         sélections n'y sont pas
//   EA1/EA2 : événements (EA1 = quand ; EA2 = compteurs et état actif,
//         EA205 = 1 actif / 0 terminé ; certains appareils le mettent en EA204)
//   MA5 : lignes propres à FAS : ERROR (code et sous-code du manuel),
//         POW OFF / POW ON (coupures de courant), réglages…
//   G85 : contrôle d'intégrité (CRC-16 du texte de ST jusqu'à la ligne
//         avant G85, fins de ligne CRLF, 4 caractères hexa, poids fort d'abord)
// Les ventes se calculent TOUJOURS par différence entre deux relevés sur
// les compteurs CUMULÉS : on n'additionne jamais les compteurs « interim ».
// Le fichier ne contient NI le stock NI les prix (PA102 = 0 sur FAS).
// ============================================================

window.BA = window.BA || {};

BA.EvaDts = {

  // CRC-16 EVA-DTS / DDCMP : polynôme réfléchi 0xA001, valeur initiale 0
  crc16(octets) {
    let c = 0;
    for (let i = 0; i < octets.length; i++) {
      c ^= octets[i] & 0xFF;
      for (let k = 0; k < 8; k++) c = (c & 1) ? ((c >>> 1) ^ 0xA001) : (c >>> 1);
    }
    return c & 0xFFFF;
  },

  // Texte -> octets (Latin-1, comme le transport DDCMP)
  octetsTexte(texte) {
    const s = String(texte || "");
    const o = new Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xFF;
    return o;
  },

  // Fins de ligne normalisées en CRLF (le fichier USB FAS est en LF seul)
  enCrlf(texte) {
    // (les espaces en fin de ligne font partie du calcul du G85 : on n'y touche pas)
    return String(texte || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").join("\r\n");
  },

  // Calcule le G85 attendu pour un texte (de ST… jusqu'à la ligne avant G85)
  calculerG85(texte) {
    const lignes = this.enCrlf(texte).split("\r\n");
    const iSt  = lignes.findIndex(l => /^ST\*/.test(l));
    let iG85 = lignes.findIndex((l, i) => i > iSt && /^G85\*/.test(l));
    if (iSt < 0) return null;
    if (iG85 < 0) iG85 = lignes.length;
    const zone = lignes.slice(iSt, iG85).map(l => l + "\r\n").join("");
    const c = this.crc16(this.octetsTexte(zone));
    return c.toString(16).toUpperCase().padStart(4, "0");
  },

  // Vérifie le segment G85 (absent = on ne peut pas vérifier)
  verifierG85(texte) {
    const m = /(?:^|\n)G85\*([0-9A-Fa-f]{1,4})/.exec(String(texte || "").replace(/\r/g, "\n"));
    if (!m) return { present: false, ok: null, annonce: null, calcule: null };
    const annonce = m[1].toUpperCase().padStart(4, "0");
    const calcule = this.calculerG85(texte);
    if (!calcule) return { present: true, ok: false, annonce, calcule: null };
    const inverse = calcule.slice(2) + calcule.slice(0, 2);   // anciens appareils : poids faible d'abord
    return {
      present: true,
      ok: annonce === calcule || annonce === inverse,
      ordreInverse: annonce !== calcule && annonce === inverse,
      annonce, calcule
    };
  },

  // « 220325 » + « 1404 » -> « 25/03/2022 14:04 » (horloge de la machine)
  formatDate(date, heure) {
    const d = String(date || "").trim(), h = String(heure || "").trim();
    let txt = "";
    if (/^\d{6}$/.test(d)) txt = d.slice(4, 6) + "/" + d.slice(2, 4) + "/20" + d.slice(0, 2);
    else if (/^\d{8}$/.test(d)) txt = d.slice(6, 8) + "/" + d.slice(4, 6) + "/" + d.slice(0, 4);
    else if (d) txt = d;
    if (/^\d{4,6}$/.test(h)) txt += (txt ? " " : "") + h.slice(0, 2) + ":" + h.slice(2, 4);
    return txt;
  },

  // Clé de tri « AAAAMMJJhhmm » (vide = très ancien)
  cleDate(date, heure) {
    const d = String(date || "").trim(), h = String(heure || "").trim();
    const jour = /^\d{6}$/.test(d) ? "20" + d : (/^\d{8}$/.test(d) ? d : "");
    if (!jour) return "";
    return jour + (/^\d{4,6}$/.test(h) ? h.slice(0, 4) : "0000");
  },

  parse(text) {
    const result = {
      machineId:    null,
      machineModel: null,
      logiciel:     null,   // ID103 (version du programme selon FAS : « 0091 »)
      emplacement:  null,   // ID104 (commande 91 : jamais rempli sur ces machines)
      actif:        null,   // ID106 (n° d'actif)
      machineDate:  null,   // date/heure lue dans le fichier (horloge machine, peu fiable)
      header:       null,
      va1:          null,
      selections:   [],
      events:       [],     // EA1 / EA2 regroupés (même code + même date + même heure)
      fasErrors:    [],     // MA5*ERROR (codes du manuel FAS)
      powerEvents:  [],     // MA5 POW OFF / POW ON dans l'ordre du fichier
      powerCuts:    [],     // paires coupure -> retour, la plus récente d'abord
      ea3:          null,
      ea7:          null,
      g85:          null,
      se:           null,
      type:         "vide", // "audit" (compteurs VA1) | "evenements" | "vide"
      complet:      false,  // DXS et DXE présents
      avertissements: [],
      raw:          text
    };

    // Nombre, ou null si le champ est vide / illisible (≠ 0)
    const num = v => {
      if (v === undefined || v === null) return null;
      const t = String(v).trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const champ = v => (v === undefined || v === null) ? null : String(v).trim();

    const lignes = String(text || "")
      .split(/\r\n|\n|\r/)
      .map(l => l.replace(/[\x00-\x1F\x7F]/g, "").replace(/�/g, "").trim())
      .filter(Boolean);

    const parSel = {};
    const entree = cle => {
      if (!parSel[cle]) parSel[cle] = {
        selection: cle, sold: null, soldSinceReset: null, value: null, valueSinceReset: null,
        price: null, productCode: null, avgPrice: null, _la: false, _laSansCumul: false
      };
      return parSel[cle];
    };
    let courante = null;
    const ea1 = [];          // occurrences EA1
    const ea2 = {};          // état par code
    let aDxs = false, aDxe = false, iSt = -1, iSe = -1, seAnnonce = null;

    lignes.forEach((line, idx) => {
      const f   = line.split("*");
      const tag = f[0];

      switch (tag) {
        case "DXS":
          aDxs = true;
          result.header = { sender: champ(f[1]), set: champ(f[2]), version: champ(f[3]), transmission: champ(f[4]) };
          if (!result.machineId && f[1]) result.machineId = f[1].trim();
          break;

        case "DXE":
          aDxe = true;
          break;

        case "ST":
          if (iSt < 0) iSt = idx;
          break;

        case "SE":
          if (iSe < 0) { iSe = idx; seAnnonce = num(f[1]); }
          break;

        case "ID1":
          if (champ(f[1])) result.machineId = champ(f[1]);
          result.machineModel = champ(f[2]);
          result.logiciel     = champ(f[3]);
          result.emplacement  = champ(f[4]) || null;
          result.actif        = champ(f[6]) || null;
          break;

        case "ID5":
          result.machineDate = ((f[1] || "").trim() + " " + (f[2] || "").trim()).trim() || null;
          break;

        case "VA1":
          result.va1 = {
            valueTotal:      (num(f[1]) || 0) / 100,
            countTotal:      num(f[2]) || 0,
            valueSinceReset: (num(f[3]) || 0) / 100,
            countSinceReset: num(f[4]) || 0
          };
          break;

        case "PA1": {
          const cle = champ(f[1]);
          courante = cle ? entree(cle) : null;
          if (courante) {
            const prix = num(f[2]);
            if (prix !== null && prix > 0) courante.price = prix / 100;
            courante.productCode = champ(f[3]) || null;
          }
          break;
        }

        case "PA2":
          if (courante) {
            const n = num(f[1]), v = num(f[2]), nr = num(f[3]), vr = num(f[4]);
            courante._pa201 = n;
            courante._pa203 = nr;
            if (v !== null)  courante.value = v / 100;
            if (vr !== null) courante.valueSinceReset = vr / 100;
          }
          break;

        case "LA1": {
          // LA1*liste*produit*prix*ventes depuis remise à zéro (LA104)*ventes cumulées (LA105)
          const cle = champ(f[2]);
          if (!cle) break;
          const e = entree(cle);
          const depuisReset = num(f[4]);
          let cumul = num(f[5]);
          if (cumul === null) { cumul = depuisReset; e._laSansCumul = true; }
          e.sold = (e._la ? e.sold : 0) + (cumul || 0);
          e.soldSinceReset = (e._la ? (e.soldSinceReset || 0) : 0) + (depuisReset || 0);
          e._la = true;
          break;
        }

        case "EA1":
          ea1.push({
            code: champ(f[1]) || "",
            date: champ(f[2]) || "",
            time: champ(f[3]) || "",
            duree: num(f[4])
          });
          break;

        case "EA2": {
          const code = champ(f[1]) || "";
          // EA205 = actif (norme p.47-50) ; tolère EA204 (exemples p.286)
          let actif = champ(f[5]);
          if ((actif === null || actif === "") && /^[01]$/.test(champ(f[4]) || "")) actif = champ(f[4]);
          ea2[code] = {
            depuisReset: num(f[2]),
            total:       num(f[3]),
            actif:       actif === "1" ? true : (actif === "0" ? false : null)
          };
          break;
        }

        case "EA3":
          result.ea3 = { lectures: num(f[1]), date: champ(f[2]), time: champ(f[3]),
                         lecturesTotal: num(f[9]), remisesAZero: num(f[10]) };
          break;

        case "EA7":
          result.ea7 = { depuisReset: num(f[1]), total: num(f[2]) };
          break;

        case "MA5": {
          const etiquette = (f[1] || "").trim().toUpperCase();
          if (etiquette === "ERROR") {
            result.fasErrors.push({ date: champ(f[2]) || "", time: champ(f[3]) || "",
                                    code: champ(f[4]) || "", sous: champ(f[5]) || "" });
          } else if (etiquette === "POW ON" || etiquette === "POW OFF") {
            result.powerEvents.push({ type: etiquette === "POW ON" ? "ON" : "OFF",
                                      date: champ(f[2]) || "", time: champ(f[3]) || "" });
          }
          // les autres MA5 (INDXPR, LIGHT, CMECMDB…) sont des réglages : ignorés
          break;
        }

        default:
          break;
      }
    });

    // ---------- Sélections ----------
    result.selections = Object.values(parSel).map(e => {
      if (!e._la) {
        // Pas de LA1 pour cette sélection : PA201 (cumul) si présent
        e.sold = e._pa201 !== undefined && e._pa201 !== null ? e._pa201 : 0;
        e.soldSinceReset = e._pa203 !== undefined ? e._pa203 : null;
      }
      if (e._laSansCumul) result.avertissements.push("Sélection " + e.selection + " : LA105 absent, LA104 utilisé.");
      if (e.value !== null && e.sold > 0) e.avgPrice = Math.round((e.value / e.sold) * 100) / 100;
      delete e._la; delete e._laSansCumul; delete e._pa201; delete e._pa203;
      return e;
    }).sort((a, b) => {
      const na = Number(a.selection), nb = Number(b.selection);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.selection).localeCompare(String(b.selection));
    });

    // ---------- Événements EA1 / EA2 (regroupés) ----------
    const groupes = {};
    const ordre = [];
    ea1.forEach(o => {
      const cle = o.code + "|" + o.date + "|" + o.time;
      if (!groupes[cle]) { groupes[cle] = { code: o.code, date: o.date, time: o.time, duree: o.duree, count: 0 }; ordre.push(cle); }
      groupes[cle].count++;
    });
    const avecEa1 = new Set(ea1.map(o => o.code));
    result.events = ordre.map(cle => {
      const g = groupes[cle], s = ea2[g.code];
      return Object.assign(g, {
        active: s ? s.actif : null,
        depuisReset: s ? s.depuisReset : null,
        total: s ? s.total : null
      });
    });
    // Codes présents seulement dans EA2 (état sans date)
    Object.keys(ea2).forEach(code => {
      if (avecEa1.has(code)) return;
      const s = ea2[code];
      result.events.push({ code, date: "", time: "", duree: null, count: 0,
                           active: s.actif, depuisReset: s.depuisReset, total: s.total });
    });

    // ---------- Erreurs FAS (MA5*ERROR), regroupées ----------
    const gf = {}, of = [];
    result.fasErrors.forEach(e => {
      const cle = e.code + "/" + e.sous + "|" + e.date + "|" + e.time;
      if (!gf[cle]) { gf[cle] = Object.assign({ count: 0 }, e); of.push(cle); }
      gf[cle].count++;
    });
    result.fasErrors = of.map(c => gf[c]);

    // ---------- Coupures de courant : POW OFF suivi de POW ON ----------
    const paires = [];
    let enCours = null;
    result.powerEvents.forEach(p => {
      if (p.type === "OFF") {
        if (enCours) paires.push({ off: enCours, on: null });
        enCours = { date: p.date, time: p.time };
      } else {
        paires.push({ off: enCours, on: { date: p.date, time: p.time } });
        enCours = null;
      }
    });
    if (enCours) paires.push({ off: enCours, on: null });
    const cleP = p => p.off ? this.cleDate(p.off.date, p.off.time) : (p.on ? this.cleDate(p.on.date, p.on.time) : "");
    result.powerCuts = paires.sort((a, b) => cleP(b).localeCompare(cleP(a)));

    // ---------- Contrôles ----------
    result.complet = aDxs && aDxe;
    result.g85 = this.verifierG85(text);
    if (iSt >= 0 && iSe >= iSt) {
      const compte = iSe - iSt + 1;
      result.se = { annonce: seAnnonce, compte, ok: seAnnonce === null ? null : seAnnonce === compte };
    }
    if (!result.complet) result.avertissements.push("Relevé incomplet : DXS ou DXE manquant.");
    if (result.g85.present && !result.g85.ok) result.avertissements.push("Contrôle G85 faux : le texte a peut-être été abîmé.");
    if (result.se && result.se.ok === false) result.avertissements.push("Le nombre de lignes (SE) ne correspond pas.");

    result.type = result.va1 ? "audit"
      : (result.events.length || result.fasErrors.length || result.powerEvents.length) ? "evenements"
      : "vide";

    return result;
  },

  // Version courte, prête à être enregistrée (relevé d'audit)
  // errors : tableau typé (compatible avec les relevés v3.0 qui n'avaient que {code, date, time})
  toAudit(analyse) {
    const va = analyse.va1 || { countTotal: 0, valueTotal: 0 };
    const errors = [];
    (analyse.events || []).forEach(e => errors.push({
      type: "eva", code: e.code, date: e.date, time: e.time, active: e.active, count: e.count
    }));
    (analyse.fasErrors || []).forEach(e => errors.push({
      type: "fas", code: e.code, sous: e.sous, date: e.date, time: e.time, count: e.count
    }));
    (analyse.powerCuts || []).forEach(p => errors.push({
      type: "pow",
      off: p.off ? (p.off.date + " " + p.off.time).trim() : "",
      on:  p.on  ? (p.on.date  + " " + p.on.time).trim()  : ""
    }));
    return {
      machine_date: analyse.machineDate || "",
      total_count:  va.countTotal,
      total_value:  Math.round(va.valueTotal * 100) / 100,
      selections:   (analyse.selections || []).map(s => ({
        selection: s.selection,
        sold:      s.sold,
        value:     s.value
      })),
      errors
    };
  },

  // Compare le nouveau relevé au précédent (ancien peut être null).
  // Toujours sur les compteurs CUMULÉS (VA101/VA102 et LA105).
  compare(ancien, nouveau) {
    if (!ancien) {
      return { baseline: true, deltaCount: null, deltaValue: null, parSelection: [],
               anomalies: false, identique: false, ecartSelections: 0 };
    }

    const deltaCount = Number(nouveau.total_count) - Number(ancien.total_count);
    const deltaValue = Math.round((Number(nouveau.total_value) - Number(ancien.total_value)) * 100) / 100;

    const avant = {};
    (ancien.selections || []).forEach(s => { avant[String(s.selection)] = s; });

    const parSelection = [];
    let anomalies = deltaCount < 0 || deltaValue < 0;
    let somme = 0;

    (nouveau.selections || []).forEach(s => {
      const a = avant[String(s.selection)];
      const d = Number(s.sold || 0) - Number(a ? a.sold || 0 : 0);
      if (d < 0) anomalies = true;
      if (d !== 0) {
        const dv = (s.value != null && a && a.value != null)
          ? Math.round((Number(s.value) - Number(a.value)) * 100) / 100 : null;
        parSelection.push({ selection: s.selection, delta: d, deltaValue: dv });
        somme += d;
      }
    });

    return {
      baseline:   false,
      deltaCount,
      deltaValue,
      parSelection,
      anomalies,
      ecartSelections: anomalies ? 0 : deltaCount - somme,   // ventes sans sélection identifiée
      identique:  !anomalies && deltaCount === 0 && deltaValue === 0 && parSelection.length === 0
    };
  },

  // Ce qui est nouveau dans un relevé par rapport au précédent (pour le journal)
  // ancienErrors / nouveauErrors : tableaux « errors » de toAudit (ou null)
  nouveautes(ancienErrors, nouveauErrors) {
    const typer = e => e.type || "eva";
    const compter = (liste, type, cle) => {
      const m = {};
      (liste || []).filter(e => typer(e) === type).forEach(e => {
        const k = cle(e);
        m[k] = (m[k] || 0) + Math.max(1, Number(e.count) || 1);
      });
      return m;
    };
    const cleEva = e => e.code + "|" + (e.date || "") + "|" + (e.time || "");
    const cleFas = e => e.code + "/" + (e.sous || "") + "|" + (e.date || "") + "|" + (e.time || "");
    const clePow = e => (e.off || "") + "|" + (e.on || "");

    const res = { eva: [], fas: [], pow: [], activations: [] };
    const avantEva = compter(ancienErrors, "eva", cleEva);
    const avantFas = compter(ancienErrors, "fas", cleFas);
    const avantPow = compter(ancienErrors, "pow", clePow);
    const etatAvant = {};
    (ancienErrors || []).filter(e => typer(e) === "eva").forEach(e => { etatAvant[e.code] = e.active; });

    (nouveauErrors || []).forEach(e => {
      const t = typer(e);
      if (t === "eva") {
        const k = cleEva(e), n = Math.max(1, Number(e.count) || 1);
        const deja = avantEva[k] || 0;
        if (n > deja) res.eva.push(Object.assign({}, e, { nouveaux: n - deja }));
        else if (e.active === true && etatAvant[e.code] === false) res.activations.push(e);
        avantEva[k] = Math.max(0, deja - n);
      } else if (t === "fas") {
        const k = cleFas(e), n = Math.max(1, Number(e.count) || 1);
        const deja = avantFas[k] || 0;
        if (n > deja) res.fas.push(Object.assign({}, e, { nouveaux: n - deja }));
        avantFas[k] = Math.max(0, deja - n);
      } else if (t === "pow") {
        const k = clePow(e);
        if (!avantPow[k]) res.pow.push(e);
        else avantPow[k]--;
      }
    });
    return res;
  }
};
