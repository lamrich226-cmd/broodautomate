# Plan « envoi en UDP » (v5.28 / firmware 1.6) — brouillon, rien n'est publié

But : faire passer les envois du boîtier (signal de vie, événements, relevés) par UDP au lieu de HTTPS, pour passer d'environ 6 Ko
par échange (connexion sécurisée) à quelques dizaines d'octets. Les ordres « lire » restent instantanés (chemin inverse, déjà en place).

## Chemin prévu
boîtier → UDP → udp.os.1nce.com:4445 (Device Integrator, déjà utilisé pour « OUVERT v… ») → Cloud Integrator (webhook HTTPS POST,
gratuit dans 1NCE OS) → fonction Supabase `ingest-udp` (nouvelle) → mêmes tables qu'aujourd'hui.

## Ce que dit la doc 1NCE (vérifié)
- Webhook : HTTPS POST seulement, réponse 2xx en moins de 20 s, pas de certificat auto-signé, 5 essais (150 s, 180 s, 420 s, 1020 s) puis « INTEGRATION_FAILED » (à relancer à la main).
- Les en-têtes personnalisés sont permis (ex. `x-api-key`) : on y met un secret partagé. Variables `:iccid:`, `:imsi:`, `:ip:` utilisables dans l'URL et les en-têtes.
- Corps reçu : `type TELEMETRY_DATA`, `source UDP`, `id`, `received`, `payload { type, value, encoding "base64" si brut }`, `device { iccid, imsi, ip }`.
- 1NCE OS est inclus sans frais dans l'offre ; les limites de taille / de débit ne sont pas écrites dans la doc (à mesurer).

## À construire
1. Fonction `ingest-udp` : vérifie l'en-tête secret, retrouve le boîtier par ICCID (colonne `devices.iccid`, v526), décode le texte, applique la même logique que `ingest`.
2. Format des messages UDP : texte court, ≤ 508 octets par paquet, numéro de séquence + morceaux pour les relevés plus longs (≈ 3 Ko = 7 paquets), accusé de réception par le numéro de séquence (UDP ne confirme rien).
3. Firmware 1.6 : envoyer par UDP (repli HTTPS si l'ICCID ou l'UDP échoue), garder « lire N » tel quel.
4. Sécurité : le secret partagé reste dans Supabase et dans le portail 1NCE (jamais dans le dépôt) ; limiter ce qu'un faux paquet peut faire.
5. Essais sur données inventées, mesure de la consommation réelle (onglet « Consommation 4G »), puis décision.

## Risques à mesurer
- 1NCE compte peut-être 1 Ko par paquet (« précision de 1 Ko ») : l'estimation passerait de ≈ 0,4 à ≈ 2 Mo par mois.
- Délai et pertes UDP, ordre des morceaux, doublons si 1NCE réessaie (5 essais) : la fonction doit être idempotente.
