// ============================================================
// Broodautomate v5.36.0 — ventes et ruptures de pain d'un relevé du boîtier (fonctions pures : ni base de données, ni réseau)
//
// La fonction « ingest » reçoit chaque relevé du boîtier. Ici on en tire, sans l'appli ouverte :
//  - UNE notification « vente » (ce qui s'est vendu depuis le relevé d'avant) ;
//  - « plus de pain gris » quand TOUTES les sélections d'un pain sont vides, ou « machine vide » quand tout est vide.
//
// Le stock n'est pas dans le relevé de la machine : il est dans les données de l'appli (lots par sélection). On part donc du
// stock noté par l'appli au « relevé compté » (machine.g4.base) et on retire les ventes arrivées depuis (différence des
// compteurs CUMULÉS entre le relevé reçu et ce relevé de départ) — exactement le calcul de l'appli (BA.Reel.applyAudit).
//
// PRUDENCE : au moindre doute on n'envoie RIEN (mieux vaut une alerte en moins qu'une fausse alerte) :
// pas de relevé de départ, intervention en cours, relevé par câble / clé USB depuis, compteurs qui baissent,
// stock qui deviendrait négatif (= l'appli se trompe : c'est l'alerte « stock à vérifier » de l'appli qui prend le relais).
// ============================================================
import "./fenetre.js";
import "./evadts-parser.js";

// deno-lint-ignore no-explicit-any
const EVA: any = (globalThis as any).BA.EvaDts;

export type Audit = { total_count: number; total_value: number; selections: { selection: string; sold: number; value?: number | null }[] };
export type Entree = { id: number; role?: string | null; received_at?: string | null };
export type Etat = { num: number; g4: { base?: string; at?: number } | null; sels: { n: number; type: string | null; qty: number }[]; ouverte: boolean; tmod: number | null; noms?: Record<string, string> | null };
export type Detail = { type: string | null; sels: number[]; n: number };
export type Vente = { n: number; valeur: number | null; detail: Detail[] };
export type Rupture = { type: string | null; sels: number[] };   // type null = machine vide

const NOMS: Record<string, string> = { blanc: "pain blanc", gris: "pain gris", complet: "pain complet", maya: "pain MAYA", sandwich: "sandwich" };
// Nom d'un pain dans une phrase : les 5 pains de base, sinon le NOM écrit dans l'appli pour un pain ajouté (identifiant « c1176… »,
// `noms` vient de ba_stock_machine) — jamais l'identifiant. « Pain gris bio » → « pain gris bio » ; « MAYA » reste « MAYA ».
export function nomType(t: string, noms?: Record<string, string> | null): string {
  if (NOMS[t]) return NOMS[t];
  const n = noms && typeof noms[t] === "string" ? noms[t].trim().slice(0, 40) : "";
  if (n) return /^\p{Lu}\p{Ll}/u.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
  return /^c\d+$/.test(t) ? "pain sans nom" : "pain " + t;
}

// Relevé de compteurs complet et lisible (texte non abîmé), sinon null
export function releveComplet(raw: string): Audit | null {
  try {
    const a = EVA.parse(raw || "");
    if (a.type !== "audit" || (a.g85.present && !a.g85.ok)) return null;
    const au = EVA.toAudit(a);
    return au && Array.isArray(au.selections) && au.selections.length ? au : null;
  } catch (_e) { return null; }
}

// Le relevé contient-il toutes les sélections du relevé de départ, avec des totaux qui n'ont pas baissé ? (comme l'appli)
function couvre(ancien: Audit, audit: Audit): boolean {
  const ont = new Set(audit.selections.map((s) => String(s.selection)));
  return ancien.selections.every((s) => ont.has(String(s.selection))) && Number(audit.total_count) >= Number(ancien.total_count);
}

// Quels relevés faut-il lire pour comparer ? `liste` = relevés de la machine AVANT celui-ci, du plus récent au plus ancien.
// pId : le relevé d'avant (lecture complète du boîtier) pour les ventes ; eId : le relevé de départ du stock (null = pas de rupture, raison dite)
export function reperer(liste: Entree[], etat: Etat | null, autres: boolean, nId: number): { pId: number | null; eId: number | null; raison: string } {
  const p = liste.find((r) => r.role !== "machine");
  const res = { pId: p ? p.id : null, eId: null as number | null, raison: "" };
  if (!etat || !etat.sels.length) { res.raison = "stock de la machine inconnu"; return res; }
  if (etat.ouverte) { res.raison = "intervention en cours sur la machine"; return res; }
  const g = etat.g4 || {};
  if (!/^r\d+$/.test(g.base || "")) { res.raison = "pas de relevé compté par l'appli"; return res; }
  const base = Number((g.base as string).slice(1));
  if (base > nId) { res.raison = "relevé de départ plus récent"; return res; }
  if (autres) { res.raison = "relevé par câble ou clé USB depuis"; return res; }
  let e = base;
  if (etat.tmod != null && etat.tmod > (g.at || 0)) {
    // le stock a été changé par une intervention (inventaire, retrait, remplissage) après le relevé compté : les ventes
    // d'avant la fin de l'intervention y sont déjà → départ = dernier relevé reçu avant la fin de l'intervention
    const c = liste.find((r) => r.id >= base && r.received_at && Date.parse(r.received_at) <= (etat.tmod as number));
    if (!c) { res.raison = "pas de relevé avant la fin de l'intervention"; return res; }
    e = c.id;
  }
  if (e !== nId && !liste.some((r) => r.id === e)) { res.raison = "relevé de départ trop ancien"; return res; }
  res.eId = e;
  return res;
}

// Ventes et ruptures. n = relevé reçu, p = relevé d'avant, e = relevé de départ du stock (n lui-même si c'est lui)
export function calculer(n: Audit, p: Audit | null, e: Audit | null, etat: Etat | null): { vente: Vente | null; ruptures: Rupture[]; raison: string } {
  const aucun = (raison: string) => ({ vente: null as Vente | null, ruptures: [] as Rupture[], raison });
  if (!p) return aucun("pas de relevé d'avant");
  if (!couvre(p, n)) return aucun("relevé incomplet");
  // une sélection nouvelle (absente du relevé d'avant) serait comptée comme VENDUE en entier : mieux vaut ne rien dire
  const avant = new Set(p.selections.map((x) => String(x.selection)));
  if (n.selections.some((x) => !avant.has(String(x.selection)))) return aucun("sélections différentes");
  const diff = EVA.compare(p, n);
  if (diff.baseline || diff.anomalies) return aucun("compteurs en baisse");
  if (!(diff.deltaCount > 0)) return aucun("aucune vente");
  const typeDe = (sel: string | number): string | null => {
    const s = etat ? etat.sels.find((x) => String(x.n) === String(sel)) : null;
    return s && s.type ? s.type : null;
  };
  // ---- ventes : regroupées par pain (ou par sélection si le pain n'est pas connu) ----
  const par = new Map<string, Detail>();
  const vendues = new Set<string>();
  for (const d of diff.parSelection as { selection: string; delta: number }[]) {
    if (!(d.delta > 0)) continue;
    vendues.add(String(d.selection));
    const t = typeDe(d.selection), cle = t ? "t" + t : "s" + d.selection;
    const x = par.get(cle) || { type: t, sels: [], n: 0 };
    x.n += d.delta; x.sels.push(Number(d.selection)); par.set(cle, x);
  }
  const detail = [...par.values()];
  const reste = diff.deltaCount - detail.reduce((a, x) => a + x.n, 0);
  if (reste > 0) detail.push({ type: null, sels: [], n: reste });       // ventes sans sélection reconnue
  const vente: Vente = { n: diff.deltaCount, valeur: diff.deltaValue > 0 ? diff.deltaValue : null, detail };
  // ---- ruptures ----
  if (!e || !etat) return { vente, ruptures: [], raison: "stock non calculé" };
  const cumN = new Map(n.selections.map((s) => [String(s.selection), Number(s.sold || 0)]));
  const cumE = new Map(e.selections.map((s) => [String(s.selection), Number(s.sold || 0)]));
  const apres = new Map<number, number>();
  for (const s of etat.sels) {
    const a = cumN.get(String(s.n)), b = cumE.get(String(s.n));
    if ((a === undefined) !== (b === undefined)) return { vente, ruptures: [], raison: "sélection absente d'un relevé" };
    const v = a === undefined ? 0 : a - (b as number);
    if (v < 0) return { vente, ruptures: [], raison: "compteur en baisse" };
    const stock = Number(s.qty) - v;
    if (stock < 0) return { vente, ruptures: [], raison: "stock à vérifier" };     // l'appli se trompe : pas de fausse alerte
    apres.set(s.n, stock);
  }
  const vide = (s: { n: number }) => apres.get(s.n) === 0;
  const aVendu = (s: { n: number }) => vendues.has(String(s.n));
  if (etat.sels.every(vide)) {
    return { vente, ruptures: etat.sels.some(aVendu) ? [{ type: null, sels: etat.sels.map((s) => s.n) }] : [], raison: "" };
  }
  const ruptures: Rupture[] = [];
  for (const type of [...new Set(etat.sels.map((s) => s.type).filter((t): t is string => !!t))]) {
    const sels = etat.sels.filter((s) => s.type === type);
    if (sels.every(vide) && sels.some(aVendu)) ruptures.push({ type, sels: sels.map((s) => s.n).sort((a, b) => a - b) });
  }
  return { vente, ruptures, raison: "" };
}

// ---- Textes des notifications (sans le nom de la machine : « ingest » l'ajoute devant le titre) ----
const euros = (v: number) => v.toFixed(2).replace(".", ",") + " €";
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function texteVente(v: Vente, noms?: Record<string, string> | null): { titre: string; texte: string } {
  const titre = v.n === 1 ? "1 vente" : v.n + " ventes";
  const lib = (d: Detail) => d.type ? nomType(d.type, noms) : d.sels.length ? "sélection " + d.sels.join(", ") : "autre";
  const texte = v.n === 1 && v.detail.length === 1
    ? (v.detail[0].type ? majuscule(nomType(v.detail[0].type, noms)) + " (sélection " + v.detail[0].sels.join(", ") + ")" : majuscule(lib(v.detail[0])))
    : v.detail.map((d) => d.n + " × " + lib(d)).join(", ");
  return { titre, texte: texte + (v.valeur != null ? " — " + euros(v.valeur) : "") };
}
export function texteRupture(r: Rupture, noms?: Record<string, string> | null): { titre: string; texte: string } {
  if (r.type == null) return { titre: "machine vide", texte: "Toutes les sélections sont vides : la machine ne vend plus rien." };
  const un = r.sels.length === 1, nom = nomType(r.type, noms);
  return { titre: "plus de " + nom,
    texte: (un ? "La sélection " + r.sels[0] + " est vide" : "Les sélections " + r.sels.join(", ") + " sont toutes vides") + " : la machine n'a plus de " + nom + " à vendre." };
}
