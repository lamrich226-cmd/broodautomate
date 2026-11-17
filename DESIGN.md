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
  Présente dans « Détails machine » et « Produits / Stock » (admin et opérateur), et sur le Dashboard (version réduite).
  **Fenêtre pop-up** (v5.25) : un tiroir touché ouvre une fenêtre par-dessus la page (bouton Fermer, Échap, clic à côté) ; rien ne s'élargit et rien ne descend. Les fenêtres « Retirer » et les confirmations s'ouvrent par-dessus (`#modal-root .modal-back` : z-index 70 > 60).
  **Dashboard** (v5.25) : par tiroir, le numéro de sélection et le nombre de pains (`11 · 2/3`, ⚠ s'il y a des pains à retirer, ⏳ gardé, ⛔ obligatoire) — pas de couleur de pain. Bouton « Cartes / Liste » (`ba_dash_layout`) : la liste = une ligne par machine (colonnes comme « Détails » dans l'explorateur Windows) ; sur téléphone, une fiche par machine.
  **Choix « Machine / Classique »** (v5.25, `ba_mv_mode`, gardé sur l'appareil) : le même bouton au Dashboard, dans Détails machine, Produits / Stock et dans Remplir. « Classique » = l'ancien affichage tel qu'il était (sans vue machine). En mode Machine, les tableaux qui répètent la machine (lots, stock) sont repliés sous la machine (`details.mv-fold`).
- **Remplir en touchant les tiroirs** (`js/operateur.js`, vue « Machine », par défaut ; bouton « Classique » pour l'ancienne vue, même choix que partout : `ba_mv_mode`) : inventaire (− / +), retrait (nombre retiré, « Encore bon »), chargement (− / +, « Remplir à fond », dates de livraison). Mêmes actions et mêmes valeurs qu'avec le tableau (`applyInventory`, `applyRemoval`, `applyLoad`) ; ce qui est saisi suit d'une vue à l'autre. Le panneau du tiroir touché s'ouvre en fenêtre pop-up (téléphone comme ordinateur).
- **Mode démo** (`js/demo.js`, actif seulement avec `?demo` dans l'adresse) : 20 machines inventées, ventes inventées toutes les ~15 s, stockage et appels Supabase remplacés par une mémoire de la page : aucune donnée réelle lue ou écrite.
- **v5.26, plein écran** : le bouton ⛶ de « Vue de la machine » (Détails, Produits / Stock, admin et opérateur) agrandit le même bloc par-dessus la page (`.mv-fs`, état `S.mvFull`) et le dessine comme la vraie machine (cadre, vitre, étagères, clavier, panneau avec l'adresse). Échap ou « Quitter le plein écran » en sort ; la fenêtre d'un tiroir s'ouvre par-dessus (z-index 62).
- **v5.27, plein écran depuis le Dashboard** : petit bouton ⛶ dans le coin de chaque carte et de chaque ligne (`.cm-full`, `data-mv-open`) ; le reste de la carte ouvre toujours « Détails ». La machine s'ouvre dans un calque (`#mv-fs-root`, `BA.MachineView.openFull / closeFull`), le Dashboard dessous ne bouge pas ; Échap ou « Quitter » = retour au Dashboard. Sur téléphone (≤ 600 px) la machine fait exactement la taille de l'écran (100 dvh, sans défilement : les étages se partagent la hauteur, n° et prix sur une ligne, légende masquée ; sur très petit écran la date sous les pains est masquée aussi).
- **v5.25, corrections** : la fenêtre d'un tiroir garde sa position quand l'écran se redessine (`BA.MachineView.keepPopScroll`) et ne s'ouvre que sur la page où elle a été ouverte ; les textes de la vue machine s'appellent `vm_*` (les `mv_*` sont ceux de la fenêtre « Déplacer ») ; bandeau `.it-open` dans Détails machine pour un « Remplir » pas terminé (Reprendre / Clore) ; « (clos automatiquement) » dans le tableau des interventions.

## v5.34 (« design test ») : plus pro, plus lisible — couche `css/design-v534.css` + `js/icons.js`
Posée **par-dessus** `css/app.css` : retirer les 2 lignes `design-v534` des deux pages (et `js/icons.js`) remet l'ancien design.
- **Police** : *Atkinson Hyperlegible Next* (hébergée dans `fonts/`, licence OFL, 34 Ko), dessinée pour la lisibilité : on ne confond pas 1 / l / I ni 0 / O
  (numéros de machines, quantités, prix) ; chiffres de largeur fixe pour tout ce qui se compare.
- **Couleurs** : nuit = bleu ardoise plus profond (`#0b1220`, cartes `#111a2c`) ; jour = gris-bleu froid (`#eef1f6`) et cartes blanches (plus de fond crème).
  Bouton principal bleu dans les deux thèmes. Couleurs d'état inchangées (assombries en clair pour un contraste ≥ 4,5:1). Le blé reste seulement dans le logo.
- **Icônes** : `js/icons.js` remplace à l'écran chaque emoji connu par une icône au même trait que le menu (24 × 24, trait 1,8) ;
  les pastilles 🟢🔴🟠 deviennent des points de couleur. Rien ne change dans les textes ni les traductions ; pas d'icône dans les listes déroulantes.
- **Profondeur** : les cartes sont à plat (bordure fine) ; seules les choses qui flottent ont une ombre (fenêtres, barre du bas, menu ouvert).
  Plus de bande de couleur épaisse à gauche des cartes et des messages, plus de halo autour des cartes « porte ouverte » (teinte + bordure à la place).
- **Étiquettes** en phrase (plus en MAJUSCULES) : chiffres clés, en-têtes de tableaux.
- **Dashboard** : « À faire aujourd'hui » en liste calme (la couleur est dans la pastille de l'icône) ; ordre : pains obligatoires, portes, machine vide,
  hors ligne, pains à retirer, alertes, retours, résumé ; sur téléphone les 3 premières lignes, le reste derrière « Voir n autres lignes ».
  Chiffres clés avec une icône ; un chiffre à 0 reste neutre. Barre d'outils : chercher à gauche, l'affichage (Cartes / Liste, Machine / Classique,
  Languette / Bloc / Coin) groupé à droite, en contrôles « segmentés » ; la légende des couleurs en petit dessous (cachée sur téléphone).
- **Téléphone** : le titre de la page n'est plus répété sous le bandeau ; barre du bas pleine, onglet actif en pastille ; champs en 16 px (pas de zoom tout seul).
- **Détails machine** : la dernière case seule prend toute la largeur. **Paramètres** : explications repliées derrière un bouton « i », unité collée à sa case.
- **Opérateur** : bouton « Remplir » partout (plus « Commencer (Remplir) ») ; page « Remplir » en cartes plus compactes (rue et ville sur une ligne).
- **Alertes** : cartes neutres, la gravité dans le point de couleur devant le titre.
- **Mouvement** : seulement en réponse à un geste (appui 0,97, dépliage 200 ms, pastille de l'onglet), courbe `cubic-bezier(.23, 1, .32, 1)` ;
  le point « porte ouverte » clignote exprès ; « réduire les animations » retire les déplacements.
