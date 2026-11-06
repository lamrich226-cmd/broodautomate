// ============================================================
// BROODAUTOMATE v5.14 — BA.EvaTrad : traduit un relevé EVA-DTS LIGNE PAR LIGNE, en français simple.
// Sert à la page Technique → Journal → « Voir » : à gauche le texte reçu tel quel, à droite ce que ça veut dire.
// Ne change rien aux données : c'est seulement une explication (les champs dont le sens n'est pas sûr sont dits « non utilisé »).
// ============================================================

window.BA = window.BA || {};

(function () {
  const eur = c => (Number(c) / 100).toFixed(2).replace(".", ",") + " €";
  const n = v => { const x = Number(String(v == null ? "" : v).trim()); return Number.isFinite(x) && String(v).trim() !== "" ? x : null; };
  const date = d => /^\d{6}$/.test(d || "") ? d.slice(4, 6) + "/" + d.slice(2, 4) + "/20" + d.slice(0, 2) : (d || "—");
  const heure = h => /^\d{4}/.test(h || "") ? h.slice(0, 2) + ":" + h.slice(2, 4) : (h || "—");
  const quand = (d, h) => date(d) + " à " + heure(h);
  const decr = c => (BA.Alertes && BA.Alertes.decrire ? BA.Alertes.decrire(c) : null);
  const fas = (c, s) => (BA.Alertes && BA.Alertes.fas ? BA.Alertes.fas(c, s) : null);

  const FIXES = {
    DXS: f => "Début de l'envoi. Machine " + (f[1] || "?") + " · version " + (f[3] || "?") + ".",
    ST: () => "Début du bloc de données (le relevé complet).",
    ID4: f => "Réglages d'affichage : " + (f[1] || "?") + " décimales (centimes) · code devise " + (f[2] || "?") + ".",
    ID5: f => "Date et heure de l'horloge de la machine : " + quand(f[1], f[2]) + " (heure d'été comprise : en hiver elle a 1 h d'avance si elle n'est pas remise à l'heure).",
    VA1: f => "VENTES TOTALES depuis la mise en service : " + eur(f[1]) + " pour " + (n(f[2]) ?? "?") + " ventes. Depuis la dernière remise à zéro : " + eur(f[3]) + " pour " + (n(f[4]) ?? "?") + " ventes.",
    VA2: () => "Ventes d'essai (test) : aucune.",
    VA3: () => "Ventes gratuites : aucune.",
    BA1: () => "Lecteur de billets : pas de données.",
    CA1: () => "Monnayeur (pièces) : pas de données d'identité.",
    DA2: f => "PAIEMENTS PAR CARTE depuis la mise en service : " + eur(f[1]) + " pour " + (n(f[2]) ?? "?") + " ventes. Depuis la dernière remise à zéro : " + eur(f[3]) + " pour " + (n(f[4]) ?? "?") + " ventes. (Espèces = total − carte.)",
    DA4: () => "Sans espèces : remboursements / recharges (zéro).",
    G85: f => "Contrôle d'intégrité du relevé (code " + (f[1] || "?") + ") : sert à vérifier que rien n'a été abîmé pendant l'envoi.",
    SE: f => "Fin du bloc : " + (f[1] || "?") + " lignes dans le bloc.",
    DXE: () => "Fin de l'envoi."
  };

  function ligne(raw) {
    const f = String(raw).trim().split("*"), s = f[0];
    try {
      if (!raw.trim()) return "";
      if (s === "ID1") return "Identité : n° de la machine " + (f[1] || "?") + " · modèle" + (f[2] ? " « " + f[2].trim() + " »" : "") + " · logiciel " + (f[3] || "?") + ".";
      if (s === "DA1") return "Lecteur de carte : n° " + (f[1] || "?").trim() + " · modèle " + (f[2] || "?").trim() + ".";
      if (s === "CA2") return "Espèces (pièces/billets) : compteurs de caisse (détail technique, pas utilisé par l'appli).";
      if (/^CA\d+$/.test(s)) return "Espèces (pièces/billets) : " + (s === "CA11" || s === "CA12" || s === "CA13" ? "compteur pour les pièces de " + (f[1] || "?") + " centimes" : s === "CA17" ? "tube à monnaie n° " + (f[1] || "?") + " (pièce de " + (f[2] || "?") + " centimes)" : "compteur de caisse") + " (pas utilisé par l'appli).";
      if (s === "TA2") return "Jetons : compteurs (zéro).";
      if (s === "MA1") return "Message de la machine : rien.";
      if (s === "PA1") return "SÉLECTION " + (f[1] || "?") + " : prix actuel " + eur(f[2]) + " · code produit " + (f[3] || "?") + ".";
      if (s === "PA2") return "…ventes de cette sélection depuis la mise en service : " + (n(f[1]) ?? "?") + " ventes pour " + eur(f[2]) + " · depuis la dernière remise à zéro : " + (n(f[3]) ?? "?") + " ventes.";
      if (s === "LA1") return "Sélection " + (f[2] || "?") + " : prix " + eur(f[3]) + " · " + (n(f[4]) ?? "?") + " ventes depuis la remise à zéro · " + (n(f[5]) ?? "?") + " au total.";
      if (s === "EA1") {
        const c = (f[1] || "").trim(), d = decr(c);
        return "ÉVÉNEMENT « " + c + " »" + (d && d.titre ? " = " + d.titre : "") + " · le " + quand(f[2], f[3]) + " (heure de la machine).";
      }
      if (s === "EA2") {
        const c = (f[1] || "").trim(), d = decr(c), act = (f[5] || f[4] || "").trim();
        return "…état de « " + c + " »" + (d && d.titre ? " (" + d.titre + ")" : "") + " : " + (act === "1" ? "ENCORE ACTIF" : act === "0" ? "terminé / revenu à la normale" : "état non précisé") + ".";
      }
      if (s === "EA3") return "Compteurs de lecture : relevé numéro " + (n(f[1]) ?? "?") + " (le " + quand(f[2], f[3]) + ") · lectures totales " + (n(f[9]) ?? "?") + ".";
      if (s === "EA7") return "Coupures de courant : " + (n(f[1]) ?? "?") + " depuis la remise à zéro, " + (n(f[2]) ?? "?") + " au total.";
      if (s === "MA5") {
        const k = (f[1] || "").trim().toUpperCase();
        if (k === "ERROR") { const d = fas(f[4], f[5]); return "ERREUR de la machine n° " + (f[4] || "?") + (f[5] ? "/" + f[5] : "") + (d && d.titre ? " = " + d.titre : "") + " · le " + quand(f[2], f[3]) + "."; }
        if (k === "POW ON") return "Journal : la machine a été ALLUMÉE le " + quand(f[2], f[3]) + ".";
        if (k === "POW OFF") return "Journal : la machine a été ÉTEINTE (coupure) le " + quand(f[2], f[3]) + ".";
        if (k === "TEMPER") { const v = Number(f[4]); return "Journal : température " + (Number.isFinite(v) ? (v / 10).toFixed(1).replace(".", ",") + " °C" : "?") + " le " + quand(f[2], f[3]) + "."; }
        return "Journal de la machine : « " + k + " » (réglage, pas utilisé par l'appli).";
      }
      if (FIXES[s]) return FIXES[s](f);
    } catch (e) { /* on tombe sur le texte ci-dessous */ }
    return "Ligne « " + s + " » : pas utilisée par l'appli.";
  }

  BA.EvaTrad = {
    ligne,
    lignes: raw => String(raw || "").split(/\r?\n/).filter(l => l.trim()).map(l => ({ raw: l, txt: ligne(l) }))
  };
})();
