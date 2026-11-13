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
- **Vue machine** (`js/machine-view.js`, section 15 de `css/app.css`) : étages (dizaine du n° de sélection) × tiroirs ; en haut de chaque tiroir le n°, le pain et son prix (le prix passe sous le nom s'il manque de place) ; sous CHAQUE pain, ses heures et sa date de livraison ; « à retirer » en orange (avec le texte, jamais la couleur seule).
  Places libres « Non utilisé » (au moins 6 étages, autant de cases que l'étage le plus rempli, 3 au minimum ; n° proposé d'après les autres étages) : les toucher ouvre l'ajout d'une sélection (pain, capacité, prix).
  Toucher un tiroir : ses livraisons (« Retirer », « Encore bon ») et « Modifier la sélection » (pain, capacité, prix, supprimer). Tout passe par les actions existantes (`addSelection`, `updateSelection`, `removeSelection`, fenêtre « Retirer », `keepLot`), avec les mêmes contrôles et messages que le tableau.
  Présente dans « Détails machine » et « Produits / Stock » (admin et opérateur), et sur chaque carte du Dashboard (version réduite).
- **Remplir en touchant les tiroirs** (`js/operateur.js`, vue « Machine », par défaut ; bouton « Tableau » pour l'ancienne vue, choix gardé sur l'appareil : `ba_wz_vue`) : inventaire (− / +), retrait (nombre retiré, « Encore bon »), chargement (− / +, « Remplir à fond », dates de livraison). Mêmes actions et mêmes valeurs qu'avec le tableau (`applyInventory`, `applyRemoval`, `applyLoad`) ; ce qui est saisi suit d'une vue à l'autre. Sur téléphone, le panneau s'ouvre sous l'étage touché ; sur ordinateur, à droite.
- **Mode démo** (`js/demo.js`, actif seulement avec `?demo` dans l'adresse) : 20 machines inventées, ventes inventées toutes les ~15 s, stockage et appels Supabase remplacés par une mémoire de la page : aucune donnée réelle lue ou écrite.
