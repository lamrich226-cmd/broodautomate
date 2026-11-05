# Tests automatiques de Broodautomate

Ces tests ouvrent le vrai site dans un navigateur simulé (Playwright), avec un **faux Supabase**,
un **faux câble RS232** et un **faux Firebase**. Rien n'est envoyé sur Internet, aucune vraie machine n'est touchée.

| Fichier | Ce qu'il vérifie |
|---|---|
| `cles-traduction.js` | chaque texte existe en français, néerlandais et anglais |
| `ingest/logique.test.mts` | lecture des relevés par la fonction « ingest » (pannes, porte, coupures), jeton Google |
| `ingest/flux.test.mts` | « ingest » de bout en bout : notifications, porte restée ouverte, boîtier muet, téléphones |
| `run.js` | tout le logiciel : PC + téléphone, hors ligne, câble, commandes, prévisions, opérateur, cloche… |
| `run4g.mjs` | boîtiers 4G : relevés, « Lire maintenant », clés, fonction « ingest » |

## Lancer les tests (sur un ordinateur avec Node 22 ou plus)

1. Mettre un relevé d'une vraie machine dans `tests/donnees/AUDIT_FASTER_170824020354.dat`
   (ce dossier n'est **jamais** envoyé sur GitHub : il contient des chiffres de vente),
   ou donner son chemin : `BA_AUDIT=/chemin/vers/releve.dat`.
2. Dans le dossier `tests` : `npm install`, puis `npm install --no-save playwright` et `npx playwright install chromium`.
3. `npm run tout` → chaque ligne affiche `OK` ou `ÉCHEC`, et la fin dit « TOUT EST BON ».

Les captures d'écran vont dans `tests/captures/` (pas envoyées sur GitHub).
