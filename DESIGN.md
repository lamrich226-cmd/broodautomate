# DESIGN.md — Broodautomate (design « v5 » de la version test 4.8.6, appliqué à la v5.11)

## Idée
Un outil de travail sobre, lisible dehors au soleil. La couleur sert à dire l'**état** d'une machine ;
l'interface elle-même reste neutre (crème / ardoise) avec une touche « blé » dans le logo.

## Thèmes
- **Nuit** (bleu ardoise) et **clair** (fond crème, texte presque noir, pour le soleil). De vraies couleurs dans les deux thèmes (plus d'inversion de l'écran).
- Bouton soleil / lune en bas de la barre latérale (opérateur sur téléphone : onglet « Plus »). Le choix est gardé sur l'appareil (`ba_theme`) ; sans choix, le thème suit celui de l'ordinateur ou du téléphone.
- Toutes les couleurs sont des variables en haut de `css/app.css` (section 1) ; les graphiques lisent `--chart-*` (section 14).

## Couleurs d'état (jamais seules : toujours avec un texte ou un point)
| État | Variable | Usage |
|---|---|---|
| OK | `--c-ok` (vert) | machine OK, ventes, hausse |
| Pains à retirer | `--c-remove` (orange) | lots trop vieux |
| Vide / erreur | `--c-empty`, `--c-error` (rouge) | machine vide, alerte technique |
| Porte ouverte | `--c-door` (bleu) | porte, informations |
| Coupure de courant | `--c-power` (violet) | coupures |
| Sélection vide | `--c-low` (jaune) | stock bas |
| Hors ligne | `--c-off` (gris) | pas de données de la machine |

## Typographie et chiffres
Police du système ; titres 1,45 rem en gras ; chiffres clés 1,9 rem en chiffres de largeur fixe ; petites étiquettes en majuscules espacées.

## Composants
- **Menu** : barre latérale réduite aux icônes ; elle s'ouvre au survol (ou au clavier) ; cliquer sur le logo l'épingle ouverte. Sur téléphone : ☰ ouvre la barre en tiroir, et une barre d'onglets en bas (admin : Dashboard, Détails, Produits, Alertes, Menu ; opérateur : À faire, Remplir, Alertes, Plus).
- **Bandeau du haut** : état de la sauvegarde (sur téléphone seulement en cas de souci), câble RS232 (PC), machines en ligne, cloche des notifications.
- **Cartes machine** : barre d'état colorée à gauche, numéro en grand, jauge de remplissage, puces.
- **Boutons** : principal (bleu de nuit / noir en clair), secondaire, danger (rouge) seulement pour ce qui efface.
- **Fenêtres** : apparition douce, fond flouté. **Tableaux** : défilent à l'horizontale sur téléphone (cartes pour l'opérateur).
- **v5.12, page Technique** : onglets en pastilles qui passent à la ligne sur téléphone ; listes « mot : valeur » (`dl.bx-dl`) pour les détails ; les tableaux marqués `tbl-tel` deviennent des cartes sur téléphone (le titre de chaque case vient de `data-label`).

## Mouvement
Très peu, et toujours utile ; tout est coupé si l'appareil demande « réduire les animations ».

## Accessibilité
Cibles tactiles ≥ 44 px sur écran tactile, anneau de focus visible au clavier, l'état n'est jamais porté par la couleur seule.

## v5.24 (essai « design-test ») : vue machine et mode démo
- **Vue machine** (`js/machine-view.js`, section 15 de `css/app.css`) : étages (dizaine du n° de sélection) × tiroirs ; sous CHAQUE pain, ses heures et sa date de livraison ; « à retirer » en orange (avec le texte, jamais la couleur seule). Affichage seulement : les boutons « Retirer » du panneau appellent ceux du tableau des lots.
  Présente dans « Détails machine » (admin et opérateur), sur chaque carte du Dashboard (version réduite) et, repliée, dans « Remplir » de l'opérateur (étapes 1 et 2).
- **Mode démo** (`js/demo.js`, actif seulement avec `?demo` dans l'adresse) : 20 machines inventées, ventes inventées toutes les ~15 s, stockage et appels Supabase remplacés par une mémoire de la page : aucune donnée réelle lue ou écrite.
