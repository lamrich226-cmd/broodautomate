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
- **v5.28, plein écran en 3D** : le plein écran montre la machine en 3D (`scene3d()` dans `js/machine-view.js`, classes `.m3-*` en fin de `css/app.css`), qu'on tourne à 360° (glisser, deux doigts / molette pour zoomer, boutons « Face » et « Tourner seul »). Une boîte en verre (côtés, dessus, dessous, arrière transparents ; seul le cadre argent est visible) : chaque tiroir est un compartiment, ses pains sont rangés l'un DERRIÈRE l'autre (le plus ancien devant), à retirer = contour orange, gardé = bleu, place vide = pointillés. Toucher un tiroir (sans glisser) ouvre la même fenêtre qu'avant. Interrupteur « 2D | 3D 360° » dans le plein écran (`ba_mv_3d`, gardé sur l'appareil) : 2D = l'ancien plein écran plat. État de la rotation : `S.m3 = { rx, ry, z, spin }`.
- **v5.41, la 3D partout** : la même machine 3D existe aussi dans les pages (Détail machine, Produits / Stock, « Remplir » de l'opérateur : inventaire, retrait, remplissage, machine finale) et, pour un seul tiroir (`drawer3d()`), dans la fenêtre d'un tiroir (sélection, modification). Choix « 2D | 3D 360° » en haut de chaque machine ; deux préférences séparées : plein écran `ba_mv_3d` (3D par défaut) et pages `ba_mv_3di` (3D par défaut). Dans une page, la molette fait défiler la page (Ctrl + molette = zoom ; boutons − / +) et un glissement vertical au doigt fait défiler. Couleurs des pains en 3D (CSS `.m3-loaf`) : tous dorés ; frais (< 24 h) vert ; bientôt à retirer (≥ seuil − 12 h) orange ; à retirer rouge ; obligatoire ou gardé une fois hachuré ; nouveau bleu ; compté en plus violet ; compté en moins pointillé rouge. Machine plus grande : marges de `paint()` réduites. Test : `tests/v541.mjs`.
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

## v5.34.6 → v5.35.0 (26/11/2026, publiées) : alertes sur tous les appareils, étape « Placements », conseil de rupture
**Numérotation des sélections** (vue machine, `layout()` dans `js/machine-view.js`) : la dizaine est l'étage, du haut vers le bas ; l'unité est la place dans l'étage, de gauche à droite. La sélection 11 est donc en haut à gauche, 12 à sa droite, 21 sous le 11. Les places libres s'affichent « Non utilisé ». Amor pense que cela correspond à la vraie machine (non vérifié sur place).

**Alertes sur iPhone et ordinateur (v5.34.6 / v5.34.7)**
- Un seul bouton, sans nouvel écran : « Recevoir les alertes sur cet appareil, même appli fermée » dans la cloche (admin) et dans l'onglet « Plus » (opérateur). Sur iPhone il faut un geste (appui) et l'appli installée sur l'écran d'accueil.
- Les comptes opérateur reçoivent les mêmes alertes que l'admin. L'appli opérateur n'a toujours ni cloche ni liste d'alertes : seulement la notification du téléphone.

**Étape facultative « Placements » dans Remplir, appli opérateur (v5.35.0)**
- **Barre des étapes à 4** : Inventaire, Retrait, Placements, Chargement (`.stepper.s4` : 4 colonnes égales, texte centré sous le numéro, police 0,74 rem, retour à la ligne autorisé). L'étape n'apparaît qu'à l'écran : en interne l'étape enregistrée « 3 » reste le chargement, rien n'est renuméroté.
- **Quand l'écran s'affiche** : seulement s'il y a au moins un conseil ; sinon on va droit au chargement. « Retour » depuis le chargement rouvre d'abord les Placements, sans défaire le retrait.
- **Une carte par conseil** (`.plc-card`, fond de carte secondaire, bordure fine) : en grand le n° de départ, une flèche, le n° d'arrivée, puis le type de pain (`.plc-move` : numéros en `.selno-big`, flèche cachée aux lecteurs d'écran) ; dessous la date de livraison du pain et la raison (« la sélection 15 se vend mieux que la 11 »). Aucun chiffre de vente n'est montré à l'opérateur.
- **Deux boutons par carte** (46 px de haut, même largeur) : « Ignorer » (secondaire) et « Fait, j'ai déplacé » (principal). Le pain déplacé **garde sa date** ; la carte disparaît et un message confirme (« 2 pains déplacés : sélection 11 → 15 »). Un grand bouton « Continuer vers le chargement » ferme l'étape ; tout ignorer est permis.
- **Honnêteté du conseil** : tant que l'historique a moins de 7 jours ou 50 ventes, un avertissement dit que le conseil est indicatif et pas vraiment nécessaire pour l'instant ; entre 7 et 21 jours, « à prendre comme une indication ».
- **Textes** : clés `plc_*` (le préfixe `pl_*` est déjà pris par le Planning), dans `js/i18n-v5350.js` (français, néerlandais, anglais).

**Conseil de rupture (v5.35.0)**
- **Encadré d'avertissement** (`.alert.warn.rup-box`, icône 📉 remplacée par l'icône du design) : « Conseil : pain souvent épuisé », une ligne par type de pain (« Pain gris : épuisé 4 jours sur 14, en général vers 11 h »), puis « charge ces sélections au maximum (11, 15 : 6 places libres) » ou, si elles sont pleines, « pense à ajouter une sélection de ce pain ». Toujours un simple conseil.
- **Opérateur** : dans le Chargement, après le rappel « le plus ancien devant », dans le tableau et dans la vue Machine.
- **Admin** : dans le plan de commande, un encadré par machine (« Conseils de rupture : pain épuisé tôt ») avec le bouton « Passer #N « à fond » » (zone tactile de 44 px), juste avant les conseils de l'IA ; le bouton n'apparaît que si la machine n'est pas déjà chargée à fond.
- **Règle** : au moins 3 jours différents sur les 14 derniers où le type est épuisé, en général avant 18 h (réglages `ruptureMinDays` et `ruptureBefore`). Limite : l'appli garde 400 alertes, donc seulement les ruptures encore retrouvées.

**Vérifié** : `tests/v5350.mjs` (7 parties, données inventées, 375 px, néerlandais et anglais) dans la suite complète : 1 584 contrôles, 0 échec.

## v5.36.0 (27/11/2026, préparée, pas encore publiée) : « Choisir mes notifications », ventes et ruptures de pain
**Choisir mes notifications** (cloche admin : `details.np-prefs` ; appli opérateur, onglet « Plus » : bloc `.np-prefs-op`)
- Une section **repliée par défaut** sous les boutons d'alertes : titre « Choisir mes notifications » (icône réglages, « (1 coupée(s)) » en gris à côté quand quelque chose est coupé, flèche ▾/▴ fixée à droite), puis **5 cases** : Chaque vente 💶, Rupture de pain 🍞, Pannes/coupures/alertes 🔴, Porte ouverte 🚪, Boîtier muet 📵. Le compte opérateur n'a **pas** la case des ventes (4 cases).
- **Cibles tactiles de 44 px** (titre et chaque case), case à cocher de 20 px, libellé qui passe à la ligne sans déborder (testé à 375 px).
- Cocher ou décocher agit **tout de suite** : la liste de la cloche se met à jour, la pastille de non-lues baisse, plus aucun message dans l'appli pour le type coupé. La section reste dépliée et garde la position de défilement et le focus.
- Une phrase dit que le choix ne concerne **que cet appareil**. Si le serveur ne peut pas enregistrer le choix, un message le dit (« choix gardé sur cet appareil, mais pas encore enregistré sur le serveur ») ; le choix local s'applique quand même.
- Pour un compte opérateur, le bloc n'apparaît **qu'une fois les notifications activées** sur l'appareil (sinon les cases ne serviraient à rien).
- Icônes de la liste : 💶 vente, 🍞 stock (rupture) ; texte de la liste vide mis à jour. Textes : clés `notif_prefs*`, `notif_cat_*` dans `js/i18n-v5360.js` (français, néerlandais, anglais).

**Règle de fond** : un appareil qui n'a rien réglé reçoit **tout** (sauf les ventes pour un compte opérateur, jamais). Seules les catégories coupées sont notées (`{"vente": false}`) ; l'appareil fait foi, le serveur reprend le choix d'un appareil qui n'a rien réglé. Les noms de catégories sont les mêmes dans `js/notifs.js` et `supabase/functions/ingest/index.ts` (un test les compare).

**Alertes de vente et de rupture (serveur)** : une notification par relevé avec ventes (« 3 ventes », « 3 × pain gris, 2 × sandwich — 7,00 € ») ; « plus de pain gris » quand toutes les sélections du type sont à 0 après une vente de ce type ; « machine vide » si tout est à 0. Stock calculé côté serveur à partir de l'état enregistré de l'appli ; **dans le doute il se tait**.

**Vérifié** : `tests/v5360.mjs`, `tests/sql/v5360.test.mjs`, `tests/ingest/ventes.test.mts`, `tests/ingest/ventes-flux.test.mts` (données inventées, rien de réel touché).
