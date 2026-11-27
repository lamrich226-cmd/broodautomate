// Test de la logique pure de la fonction « ingest » (lecture des relevés, résumé, jeton Google)
// node --experimental-strip-types --no-warnings tests/ingest/logique.test.mts [relevé.dat]
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/ingest/index.ts"), "utf8");
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ba-pur-")), "pur.ts");
fs.writeFileSync(tmp, src.slice(a, b) + "\nexport { lireReleve, resume, jwtGoogle, libelle, b64url, categorie, voulue };\n");
const { lireReleve, resume, jwtGoogle, libelle, categorie, voulue } = await import(tmp);
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };
// v5.25 : le vrai relevé (données privées, pas dans le dépôt) est facultatif : sans lui, ses 3 vérifications sont sautées
const vrai = process.argv[2] || process.env.BA_AUDIT || path.join(ICI, "../donnees/AUDIT_FASTER_170824020354.dat");
if (fs.existsSync(vrai)) {
  const r1 = lireReleve(fs.readFileSync(vrai, "latin1"));
  ok("vrai relevé : 3 pannes (ECF_38, E45, EOA)", r1.evs.length === 3 && r1.evs.every(e => e.type === "panne"), r1.evs);
  ok("vrai relevé : textes en français", /carte/i.test(r1.evs[0].titre) && /ascenseur/i.test(r1.evs[1].titre), r1.evs.map(e => e.titre));
  ok("vrai relevé : porte OUVERTE (dernier EGS 02:01 daté, jamais refermée ; EA2 EGS actif = 1)", r1.porte === true, r1.porte);
} else console.log("  (vrai relevé absent : 3 vérifications sautées)");
// v5.25 : la même panne écrite deux fois (EA1 en code EVA-DTS + MA5 en erreur FAS) = UNE seule notification
const r5 = lireReleve("DXS\nEA1*ECF_38*261201*0800***+120\nMA5*ERROR*261201*0800*16*38\nDXE");
ok("ECF_38 + MA5 16/38 au même moment = une seule panne", r5.evs.filter(e => e.type === "panne").length === 1, r5.evs);
const r6 = lireReleve("DXS\nMA5*ERROR*261201*0800*10*38\nEA1*EOA*261201*0800***+120\nDXE");
ok("MA5 10/38 écrit AVANT EOA au même moment = une seule panne", r6.evs.filter(e => e.type === "panne").length === 1, r6.evs);
const r7 = lireReleve("DXS\nEA1*E45*261201*0800***+120\nMA5*ERROR*261201*0800*16*38\nDXE");
ok("deux pannes DIFFÉRENTES au même moment (E45 et 16/38) = deux notifications", r7.evs.filter(e => e.type === "panne").length === 2, r7.evs);
const tel = "DXS*FAS000000001*VA*V1/6*1\nEA1*EGS*251105*0412***+120\nEA2*EGS****1\nDXE*1*1";
const r2 = lireReleve(tel);
ok("porte ouverte : état ouvert, pas de notification immédiate", r2.porte === true && r2.evs.length === 0, r2);
ok("porte fermée", lireReleve("DXS\nEA1*EGT*251105*0420\nEA2*EGS****0\nDXE").porte === false);
const r3 = lireReleve("DXS\nMA5*ERROR*251105*0430*45*54\nEA1*E45*251105*0430***+120\nEA1*ELB_3*251105*0431\nEA7*4*1\nEA1*EGS*251105*0500\nDXE");
ok("MA5 + E45 au même moment = une seule panne", r3.evs.filter(e => e.type === "panne").length === 1, r3.evs);
ok("produit épuisé n° 3 notifié", r3.evs.some(e => /épuisé/i.test(e.titre) && /3/.test(e.titre)), r3.evs.map(e => e.titre));
ok("coupure de courant notifiée", r3.evs.some(e => e.type === "coupure"), r3.evs);
ok("MA5 seul : texte de l'erreur FAS", /ascenseur/i.test(lireReleve("DXS\nMA5*ERROR*251105*0430*45*54\nDXE").evs[0].titre));
ok("code inconnu : texte de secours", libelle("ZZZ")[0].includes("ZZZ"));
ok("information (gravité i) pas notifiée", lireReleve("DXS\nEA1*EGS*1*1\nDXE").evs.length === 0);
const s = resume([{ titre: "A", texte: "a" }, { titre: "B", texte: "b" }, { titre: "C", texte: "c" }, { titre: "D", texte: "d" }]);
ok("résumé de 4 alertes", s.titre.includes("4") && s.texte.endsWith("…"), s);
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const jwt = await jwtGoogle({ client_email: "x@y.iam.gserviceaccount.com", private_key: privateKey }, 1700000000);
const [h, c, sig] = jwt.split(".");
const v = crypto.verify("RSA-SHA256", Buffer.from(h + "." + c), publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
ok("jeton Google signé RS256 et vérifiable", v && JSON.parse(Buffer.from(c, "base64url").toString()).scope.includes("firebase.messaging"));
// v5.36.0 : chaque appareil choisit ses notifications
ok("catégories : pannes, coupure et alertes = « alertes » ; porte ; muet et info = « boitier » ; stock ; vente", ["panne", "alerte", "coupure"].every(x => categorie(x) === "alertes") && categorie("porte") === "porte" && categorie("muet") === "boitier" && categorie("info") === "boitier" && categorie("stock") === "stock" && categorie("vente") === "vente");
ok("type inconnu : rangé dans « alertes » (jamais perdu)", categorie("nouveau-type") === "alertes");
ok("sans réglage : tout est voulu (admin)", ["panne", "porte", "muet", "stock", "vente"].every(x => voulue({ token: "t" }, x) && voulue({ token: "t", prefs: {} }, x) && voulue({ token: "t", prefs: null }, x)));
ok("{vente:false} coupe les ventes seulement", !voulue({ token: "t", prefs: { vente: false } }, "vente") && voulue({ token: "t", prefs: { vente: false } }, "stock") && voulue({ token: "t", prefs: { vente: false } }, "panne"));
ok("{alertes:false} coupe pannes, coupures et alertes, pas la porte", !voulue({ token: "t", prefs: { alertes: false } }, "panne") && !voulue({ token: "t", prefs: { alertes: false } }, "coupure") && voulue({ token: "t", prefs: { alertes: false } }, "porte"));
ok("une valeur autre que false (true, 0, texte) ne coupe rien", voulue({ token: "t", prefs: { vente: true } }, "vente") && voulue({ token: "t", prefs: { vente: 0 } }, "vente") && voulue({ token: "t", prefs: { vente: "non" } }, "vente"));
ok("réglages absurdes (tableau, texte) : tout est voulu", voulue({ token: "t", prefs: [1] as any }, "vente") && voulue({ token: "t", prefs: "x" as any }, "vente"));
ok("les comptes opérateur ne reçoivent JAMAIS les ventes, même avec prefs {vente:true}", !voulue({ token: "t", operateur: true }, "vente") && !voulue({ token: "t", operateur: true, prefs: { vente: true } }, "vente") && voulue({ token: "t", operateur: true }, "stock") && voulue({ token: "t", operateur: true }, "panne"));
// le lecteur de relevés copié dans la fonction est IDENTIQUE à celui de l'appli (une seule vérité)
ok("supabase/functions/ingest/evadts-parser.js = js/evadts-parser.js (copie identique)", fs.readFileSync(path.join(ICI, "../../supabase/functions/ingest/evadts-parser.js"), "utf8") === fs.readFileSync(path.join(ICI, "../../js/evadts-parser.js"), "utf8"));
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
