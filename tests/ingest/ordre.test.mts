// Test de la fonction « ordre » (réveil MQTT du boîtier) : paquets MQTT 3.1.1 relus par un décodeur indépendant
// node --experimental-strip-types --no-warnings tests/ingest/ordre.test.mts
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path"; import os from "node:os";
const ICI = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(ICI, "../../supabase/functions/ordre/index.ts"), "utf8");
const a = src.indexOf("// ==== DÉBUT LOGIQUE PURE"), b = src.indexOf("// ==== FIN LOGIQUE PURE");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ba-ordre-")), "pur.ts");
fs.writeFileSync(tmp, src.slice(a, b) + "\nexport { paquetConnect, paquetPublish, lireConnack, empreinte16, longueurRestante, DECONNEXION };\n");
const { paquetConnect, paquetPublish, lireConnack, empreinte16, longueurRestante, DECONNEXION } = await import(tmp);
let ko = 0; const ok = (n: string, c: boolean, x?: unknown) => { console.log((c ? "  OK   " : "  ÉCHEC ") + n + (c ? "" : " → " + JSON.stringify(x))); if (!c) ko++; };

// décodeur indépendant (selon la norme MQTT 3.1.1)
function decode(buf: Uint8Array) {
  let i = 1, mult = 1, len = 0, d;
  do { d = buf[i++]; len += (d & 127) * mult; mult *= 128; } while (d & 128);
  const corps = buf.subarray(i, i + len);
  const s = (o: number) => { const l = (corps[o] << 8) | corps[o + 1]; return [Buffer.from(corps.subarray(o + 2, o + 2 + l)).toString("utf8"), o + 2 + l] as const; };
  return { type: buf[0], len, corps, fin: i + len, s };
}
const c = paquetConnect("ba-ordre-1234abcd", "serveur", "mot de passe é", 30);
const dc = decode(c);
const [proto, o1] = dc.s(0);
const niv = dc.corps[o1], flags = dc.corps[o1 + 1], ka = (dc.corps[o1 + 2] << 8) | dc.corps[o1 + 3];
const [cid, o2] = dc.s(o1 + 4); const [usr, o3] = dc.s(o2); const [pwd, o4] = dc.s(o3);
ok("CONNECT : type, longueur cohérente", dc.type === 0x10 && dc.fin === c.length, dc);
ok("CONNECT : protocole MQTT niveau 4, session propre + identifiant + mot de passe", proto === "MQTT" && niv === 4 && flags === 0xC2, { proto, niv, flags });
ok("CONNECT : keepalive 30 s", ka === 30, ka);
ok("CONNECT : identifiant, utilisateur, mot de passe (accent compris)", cid === "ba-ordre-1234abcd" && usr === "serveur" && pwd === "mot de passe é" && o4 === dc.len, { cid, usr, pwd });
const long = paquetConnect("x", "u", "p".repeat(200), 30), dl = decode(long);
ok("CONNECT long (> 127 octets) : longueur sur 2 octets", long[1] >= 128 && dl.fin === long.length, [long[1], long[2], dl.len]);
const p = paquetPublish("ba/3eb1bd439947eb76", "1"), dp = decode(p);
const [topic, o5] = dp.s(0);
ok("PUBLISH : type 0x30 (qualité 0, pas gardé), canal et message « 1 »", dp.type === 0x30 && topic === "ba/3eb1bd439947eb76" && Buffer.from(dp.corps.subarray(o5)).toString() === "1" && dp.fin === p.length, { topic });
ok("DISCONNECT : E0 00", DECONNEXION[0] === 0xE0 && DECONNEXION[1] === 0);
ok("longueur restante : 0, 127, 128, 16383, 16384", [0, 127, 128, 16383, 16384].map(n => longueurRestante(n).join(",")).join(" | ") === "0 | 127 | 128,1 | 255,127 | 128,128,1");
ok("CONNACK accepté", lireConnack(Uint8Array.from([0x20, 2, 0, 0])).ok);
ok("CONNACK refusé (mot de passe)", !lireConnack(Uint8Array.from([0x20, 2, 0, 4])).ok && /mot de passe/.test(lireConnack(Uint8Array.from([0x20, 2, 0, 4])).texte));
ok("CONNACK absent ou bizarre", !lireConnack(Uint8Array.from([0x30, 2, 0, 0])).ok && !lireConnack(new Uint8Array(0)).ok);
const cle = "0123456789abcdef0123456789abcdef";
const attendu = crypto.createHash("sha256").update(cle).digest("hex").slice(0, 16);
ok("canal : mêmes 16 caractères que SHA-256 (devices.key_hash côté base)", await empreinte16(cle) === attendu && attendu === "3eb1bd439947eb76", attendu);
// serveur MQTT factice sur un vrai port TCP : le paquet traverse un vrai socket, le serveur le relit
import net from "node:net";
const recu: Buffer[] = [];
const srv = net.createServer(s => { s.on("data", d => { recu.push(d); if (d[0] === 0x10) s.write(Buffer.from([0x20, 2, 0, 0])); }); });
await new Promise<void>(r => srv.listen(0, "127.0.0.1", () => r()));
const port = (srv.address() as net.AddressInfo).port;
const rep = await new Promise<Buffer>(r => { const k = net.connect(port, "127.0.0.1", () => { k.write(c); k.on("data", d => { k.write(p); k.write(DECONNEXION); setTimeout(() => { k.end(); r(d); }, 100); }); }); });
const tout = Buffer.concat(recu);
ok("serveur factice : CONNACK reçu puis PUBLISH et DISCONNECT relus", rep.equals(Buffer.from([0x20, 2, 0, 0])) && tout.includes(Buffer.from(p)) && tout[tout.length - 2] === 0xE0, tout.length);
srv.close();
console.log(ko ? ko + " ÉCHEC(S)" : "TOUT EST BON"); process.exit(ko ? 1 : 0);
