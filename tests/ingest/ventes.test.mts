// v5.36.0 — Ventes et ruptures de pain d'un relevé : fonctions pures de supabase/functions/ingest/ventes.ts
// node --experimental-strip-types --no-warnings tests/ingest/ventes.test.mts
import path from "node:path";
import { releve } from "./releves.ts";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const V = await import(path.join(ICI, "../../supabase/functions/ingest/ventes.ts"));
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
const A = (sels: Record<number, number>) => V.releveComplet(releve(sels));
// la machine : gris (11, 12), sandwich (21), blanc (31) ; stock noté par l'appli au relevé de départ
const stock = (q: Record<number, number>, plus: any = {}) => ({ num: 12, g4: { base: "r40", at: 1000 }, ouverte: false, tmod: null,
  sels: [{ n: 11, type: "gris", qty: q[11] ?? 0 }, { n: 12, type: "gris", qty: q[12] ?? 0 }, { n: 21, type: "sandwich", qty: q[21] ?? 0 }, { n: 31, type: "blanc", qty: q[31] ?? 0 }], ...plus });
const DEP = { 11: 10, 12: 4, 21: 6, 31: 9 };                 // compteurs cumulés au relevé de départ (r40)

// ---- relevés ----
ok("relevé valide lu", A(DEP) && A(DEP).selections.length === 4 && A(DEP).total_count === 29, A(DEP));
ok("texte quelconque : null (jamais d'erreur)", V.releveComplet("bonjour") === null && V.releveComplet("") === null);
ok("G85 faux : relevé abîmé refusé", V.releveComplet(releve(DEP).replace("SE*20", "G85*0000\r\nSE*20")) === null);

// ---- ventes ----
let r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), stock({ 11: 2, 12: 1, 21: 3, 31: 4 }));
ok("1 vente de pain gris : 1,40 €, sélection 11", r.vente && r.vente.n === 1 && r.vente.valeur === 1.4 && r.vente.detail[0].type === "gris" && r.vente.detail[0].sels[0] === 11, r.vente);
ok("…texte : « Pain gris (sélection 11) — 1,40 € »", JSON.stringify(V.texteVente(r.vente)) === JSON.stringify({ titre: "1 vente", texte: "Pain gris (sélection 11) — 1,40 €" }), V.texteVente(r.vente));
ok("…reste du pain gris (sélection 12) : pas de rupture", r.ruptures.length === 0, r);
r = V.calculer(A({ 11: 12, 12: 5, 21: 8, 31: 9 }), A(DEP), A(DEP), stock({ 11: 5, 12: 5, 21: 5, 31: 5 }));
ok("5 ventes (3 pains gris sur 2 sélections, 2 sandwichs) : regroupées par pain", r.vente.n === 5 && r.vente.detail.length === 2, r.vente);
ok("…texte : « 3 × pain gris, 2 × sandwich — 7,00 € »", JSON.stringify(V.texteVente(r.vente)) === JSON.stringify({ titre: "5 ventes", texte: "3 × pain gris, 2 × sandwich — 7,00 €" }), V.texteVente(r.vente));
r = V.calculer(A(DEP), A(DEP), A(DEP), stock({}));
ok("aucune vente : rien", r.vente === null && r.raison === "aucune vente", r);
r = V.calculer(A({ ...DEP, 11: 9 }), A(DEP), A(DEP), stock({ 11: 5 }));
ok("compteur qui baisse : ni vente ni rupture", r.vente === null && r.ruptures.length === 0, r);
r = V.calculer(A({ 11: 12, 12: 4, 21: 6 }), A(DEP), A(DEP), stock({ 11: 5 }));
ok("relevé qui a perdu une sélection (incomplet) : ni vente ni rupture", r.vente === null && r.raison === "relevé incomplet", r);
r = V.calculer(A({ ...DEP, 11: 11 }), null, null, stock({ 11: 5 }));
ok("pas de relevé d'avant (tout 1er relevé) : rien", r.vente === null, r);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), null);
ok("sans le stock de l'appli : la vente part quand même (« sélection 11 »), sans rupture", r.vente && r.vente.n === 1 && r.vente.detail[0].type === null && /sélection 11/i.test(V.texteVente(r.vente).texte) && r.ruptures.length === 0, r);
r = V.calculer(A({ ...DEP, 11: 11, 77: 3 }), A(DEP), A(DEP), stock({ 11: 5 }));
ok("une sélection NOUVELLE dans le relevé (pas dans celui d'avant) : rien (elle serait comptée vendue en entier)", r.vente === null && r.raison === "sélections différentes", r);
r = V.calculer(A({ ...DEP, 11: 11, 55: 1 }), A({ ...DEP, 55: 0 }), A({ ...DEP, 55: 0 }), stock({ 11: 5 }));
ok("vente d'une sélection que l'appli ne connaît pas : texte « sélection 55 »", r.vente.detail.some((d: any) => d.type === null && d.sels[0] === 55), r.vente);

// ---- ruptures de pain ----
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), stock({ 11: 1, 12: 0, 21: 3, 31: 4 }));
ok("dernier pain gris vendu (sélection 12 déjà vide) : « plus de pain gris » (sélections 11 et 12)", r.ruptures.length === 1 && r.ruptures[0].type === "gris" && r.ruptures[0].sels.join() === "11,12", r.ruptures);
ok("…texte : « Les sélections 11, 12 sont toutes vides »", JSON.stringify(V.texteRupture(r.ruptures[0])) === JSON.stringify({ titre: "plus de pain gris", texte: "Les sélections 11, 12 sont toutes vides : la machine n'a plus de pain gris à vendre." }), V.texteRupture(r.ruptures[0]));
r = V.calculer(A({ ...DEP, 21: 7 }), A(DEP), A(DEP), stock({ 11: 1, 12: 1, 21: 1, 31: 4 }));
ok("une seule sélection par pain : « La sélection 21 est vide » + sandwich", r.ruptures.length === 1 && r.ruptures[0].type === "sandwich" && /^La sélection 21 est vide/.test(V.texteRupture(r.ruptures[0]).texte) && V.texteRupture(r.ruptures[0]).titre === "plus de sandwich", r.ruptures);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), stock({ 11: 2, 12: 0, 21: 3, 31: 4 }));
ok("il reste du pain gris (11 : 2 − 1 vente = 1) : pas de rupture", r.ruptures.length === 0, r);
r = V.calculer(A({ ...DEP, 31: 10 }), A(DEP), A(DEP), stock({ 11: 0, 12: 0, 21: 3, 31: 4 }));
ok("pain gris déjà vide AVANT, vente d'un autre pain : pas de nouvelle alerte gris", r.ruptures.length === 0, r.ruptures);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), stock({ 11: 1, 12: 0, 21: 0, 31: 0 }));
ok("tout est vide après la vente : « machine vide » SEULE (pas de « plus de pain gris » en plus)", r.ruptures.length === 1 && r.ruptures[0].type === null && JSON.stringify(V.texteRupture(r.ruptures[0])) === JSON.stringify({ titre: "machine vide", texte: "Toutes les sélections sont vides : la machine ne vend plus rien." }), r.ruptures);
r = V.calculer(A({ ...DEP, 11: 12 }), A({ ...DEP, 11: 11 }), A(DEP), stock({ 11: 2, 12: 0, 21: 3, 31: 4 }));
ok("départ plus ancien que le relevé d'avant : 2 ventes depuis le départ (2 − 2 = 0) → rupture", r.ruptures.length === 1 && r.ruptures[0].type === "gris", r.ruptures);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), stock({ 11: 0, 12: 0, 21: 3, 31: 4 }));
ok("stock négatif (l'appli croyait 0, la machine vend) : PAS de rupture (c'est « stock à vérifier »), la vente part", r.vente && r.ruptures.length === 0 && r.raison === "stock à vérifier", r);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A({ 11: 10, 12: 4, 21: 6 }), stock({ 11: 1, 12: 0, 21: 3, 31: 4 }));
ok("relevé de départ sans une sélection que l'appli connaît : pas de rupture", r.vente && r.ruptures.length === 0 && r.raison === "sélection absente d'un relevé", r);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A({ ...DEP, 11: 12 }), stock({ 11: 1 }));
ok("départ avec un compteur plus HAUT que le relevé reçu : pas de rupture", r.ruptures.length === 0 && r.raison === "compteur en baisse", r);
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A({ ...DEP, 11: 11 }), stock({ 11: 0, 12: 0, 21: 3, 31: 4 }));
ok("départ = relevé reçu (l'appli l'a déjà compté, stock déjà à 0) : rupture", r.ruptures.length === 1 && r.ruptures[0].type === "gris", r);

// ---- reperer : quel relevé sert de départ ? ----
const ent = (id: number, role: string, min: number) => ({ id, role, received_at: new Date(1e12 - min * 60000).toISOString() });
const LISTE = [ent(41, "boitier", 10), ent(40, "boitier", 70), ent(39, "boitier", 130)];
let p = V.reperer(LISTE, stock({ 11: 1 }), false, 42);
ok("cas normal : relevé d'avant = 41, départ du stock = relevé compté 40", p.pId === 41 && p.eId === 40 && p.raison === "", p);
p = V.reperer([ent(41, "machine", 5), ...LISTE.slice(1)], stock({ 11: 1 }), false, 42);
ok("un envoi partiel de la machine n'est jamais le « relevé d'avant » (on prend la lecture du boîtier : 40)", p.pId === 40, p);
p = V.reperer(LISTE, stock({ 11: 1 }, { ouverte: true }), false, 42);
ok("intervention en cours (stock en train de changer) : pas de rupture, mais les ventes (pId) restent", p.eId === null && p.pId === 41 && /intervention/.test(p.raison), p);
p = V.reperer(LISTE, stock({ 11: 1 }, { g4: null }), false, 42);
ok("pas de relevé compté par l'appli : pas de rupture", p.eId === null && /compté/.test(p.raison), p);
p = V.reperer(LISTE, stock({ 11: 1 }, { g4: { base: "r43", at: 1 } }), false, 42);
ok("relevé de départ plus récent que le relevé reçu : pas de rupture", p.eId === null, p);
p = V.reperer(LISTE, stock({ 11: 1 }), true, 42);
ok("relevé par câble / clé USB depuis : pas de rupture", p.eId === null && /câble/.test(p.raison), p);
p = V.reperer(LISTE, stock({ 11: 1 }, { g4: { base: "r12", at: 1 } }), false, 42);
ok("relevé de départ trop ancien (hors des 12 derniers) : pas de rupture", p.eId === null && /ancien/.test(p.raison), p);
p = V.reperer(LISTE, stock({ 11: 1 }, { g4: { base: "r42", at: 1 } }), false, 42);
ok("l'appli a déjà compté CE relevé : départ = lui-même", p.eId === 42, p);
// inventaire / remplissage terminé à tmod, après le relevé compté (at) : départ = dernier relevé reçu AVANT la fin de l'intervention
const tmod = 1e12 - 30 * 60000;                       // il y a 30 min : après le relevé 40 (70 min), avant le 41 (10 min)
p = V.reperer(LISTE, stock({ 11: 1 }, { tmod, g4: { base: "r40", at: 1e12 - 70 * 60000 } }), false, 42);
ok("intervention terminée il y a 30 min : le stock en tient compte, départ = relevé 40 (le dernier reçu avant)", p.eId === 40, p);
const tmod2 = 1e12 - 5 * 60000;                       // il y a 5 min : après le relevé 41
p = V.reperer(LISTE, stock({ 11: 1 }, { tmod: tmod2, g4: { base: "r40", at: 1e12 - 70 * 60000 } }), false, 42);
ok("intervention terminée il y a 5 min : départ = relevé 41 (déjà compté dans le stock)", p.eId === 41, p);
p = V.reperer(LISTE.slice(0, 1), stock({ 11: 1 }, { tmod: 1e12 - 200 * 60000, g4: { base: "r30", at: 1e12 - 400 * 60000 } }), false, 42);
ok("aucun relevé reçu avant la fin de l'intervention : pas de rupture", p.eId === null, p);
p = V.reperer([], stock({ 11: 1 }), false, 42);
ok("aucun relevé avant : rien", p.pId === null && p.eId === null, p);
p = V.reperer(LISTE, null, false, 42);
ok("stock de l'appli illisible (commande SQL pas faite) : pas de rupture, les ventes oui", p.eId === null && p.pId === 41, p);

// ---- pains ajoutés dans l'appli (identifiant « c… ») : toujours leur NOM, jamais l'identifiant ----
const NOMS = { c900001: "Pistolets", c900002: "MAYA spécial", c900003: "  Pain gris bio  " };
ok("nom d'un pain ajouté : « pistolets » (minuscule au début, dans la phrase)", V.nomType("c900001", NOMS) === "pistolets", V.nomType("c900001", NOMS));
ok("nom en capitales gardé tel quel : « MAYA spécial »", V.nomType("c900002", NOMS) === "MAYA spécial", V.nomType("c900002", NOMS));
ok("espaces autour du nom enlevés : « pain gris bio »", V.nomType("c900003", NOMS) === "pain gris bio", V.nomType("c900003", NOMS));
ok("pain ajouté sans nom connu : « pain sans nom » (jamais l'identifiant)", V.nomType("c900009", NOMS) === "pain sans nom" && V.nomType("c900009") === "pain sans nom");
ok("pains de base : noms habituels, même avec des noms ajoutés", V.nomType("gris", NOMS) === "pain gris" && V.nomType("sandwich", NOMS) === "sandwich");
const perso = (q: Record<number, number>) => ({ num: 12, g4: { base: "r40", at: 1000 }, ouverte: false, tmod: null, noms: NOMS,
  sels: [{ n: 11, type: "c900001", qty: q[11] ?? 0 }, { n: 12, type: "c900001", qty: q[12] ?? 0 }, { n: 21, type: "sandwich", qty: q[21] ?? 0 }, { n: 31, type: "blanc", qty: q[31] ?? 0 }] });
r = V.calculer(A({ ...DEP, 11: 11 }), A(DEP), A(DEP), perso({ 11: 1, 12: 0, 21: 3, 31: 4 }));
ok("dernier pistolet vendu : rupture du pain ajouté (sélections 11 et 12)", r.ruptures.length === 1 && r.ruptures[0].type === "c900001" && r.ruptures[0].sels.join() === "11,12", r);
const tr = V.texteRupture(r.ruptures[0], NOMS), tv = V.texteVente(r.vente, NOMS);
ok("…titre « plus de pistolets », texte « …n'a plus de pistolets à vendre »", tr.titre === "plus de pistolets" && /n'a plus de pistolets à vendre/.test(tr.texte), tr);
ok("…vente : « Pistolets (sélection 11) — 1,40 € »", tv.texte === "Pistolets (sélection 11) — 1,40 €", tv);
ok("…l'identifiant n'apparaît nulle part", !/c9000/.test(JSON.stringify([tr, tv])));
r = V.calculer(A({ ...DEP, 11: 12, 21: 8 }), A(DEP), A(DEP), perso({ 11: 5, 12: 2, 21: 3, 31: 4 }));
ok("plusieurs pains : « 2 × pistolets, 2 × sandwich »", /^2 × pistolets, 2 × sandwich/.test(V.texteVente(r.vente, NOMS).texte), V.texteVente(r.vente, NOMS));

console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
