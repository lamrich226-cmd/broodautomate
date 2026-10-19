// ============================================================
// BROODAUTOMATE — Interface principale v3.1 (Supabase ou mode local)
//
// Nouveautés 3.1 :
//  • « Ma Flotte » : renommer une machine (nom et lieu) à tout moment ;
//  • RS232 : on choisit la machine branchée sur le câble (toutes les
//    machines s'annoncent FAS000000001 : commande 91 jamais remplie) ;
//    écoute permanente de ce que la machine envoie (télémétrie) + lecture
//    « liste 2 » (rien n'est remis à zéro) à la demande ou toutes les N min ;
//    traitement automatique, sans fenêtre : 1er relevé = point de départ,
//    ensuite ventes = différence des compteurs CUMULÉS -> lignes de vente
//    et stock diminué ; compteurs en baisse = nouveau point de départ ;
//  • « Alertes » : erreurs du dernier relevé (titre + explication + état),
//    erreurs FAS avec la solution du manuel, coupures de courant, catalogue
//    complet (FAS 01-98 + EVA-DTS annexe C) avec recherche ;
//  • import USB conservé, avec contrôle d'intégrité G85.
// ============================================================

(function () {

  const $ = s => document.querySelector(s);
  const eur   = v => Number(v || 0).toFixed(2) + " €";
  const heure = ts => ts ? new Date(ts).toLocaleString("fr-FR") : "—";

  // Protège l'affichage quand on insère du texte venant de la machine ou de l'utilisateur
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  // Argument de fonction sûr dans un attribut onclick="…"
  const arg = s => esc(JSON.stringify(String(s ?? "")));
  // Retire les caractères qui pourraient casser l'affichage
  const propre = s => String(s || "").replace(/[<>"'`]/g, "").trim();

  const badge = s => {
    const couleur = { online: "on", offline: "off", error: "err", unknown: "warn" }[s] || "off";
    const label   = { online: "En ligne", offline: "Hors ligne", error: "Erreur", unknown: "Inconnu" }[s] || "Inconnu";
    return `<span class="badge ${couleur}">${label}</span>`;
  };

  // ---------- Stockage dans le navigateur (mode local et réglages du câble) ----------
  function lireLocal(cle, defaut) {
    try {
      const brut = localStorage.getItem(cle);
      if (brut) return JSON.parse(brut);
    } catch (e) { /* valeur par défaut */ }
    return defaut;
  }
  function ecrireLocal(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch (e) {
      console.warn("Sauvegarde impossible (" + cle + ") :", e.message);
    }
  }

  const CLE_MACHINES   = "broodautomate_machines";
  const CLE_STOCK      = "broodautomate_produits";
  const CLE_AUDITS     = "broodautomate_audits";
  const CLE_VENTES     = "broodautomate_ventes";       // v3.1 : ventes des machines réelles en mode local
  const CLE_EVENEMENTS = "broodautomate_evenements";   // v3.1 : journal des machines réelles en mode local
  const CLE_RS232      = "broodautomate_rs232";        // v3.1 : réglages du câble de CE PC

  function chargerMachines() {
    const liste = lireLocal(CLE_MACHINES, null);
    return Array.isArray(liste) ? liste : BA_CONFIG.machines.map(m => ({ ...m }));
  }
  function sauverMachines() { ecrireLocal(CLE_MACHINES, _listeMachines); }

  let _listeMachines   = chargerMachines();
  let _stockLocal      = lireLocal(CLE_STOCK, {});
  let _auditsLocal     = lireLocal(CLE_AUDITS, {});
  let _ventesLocales   = lireLocal(CLE_VENTES, {});
  let _evenementsLocaux = lireLocal(CLE_EVENEMENTS, {});

  const sauverStock      = () => ecrireLocal(CLE_STOCK, _stockLocal);
  const sauverAudits     = () => ecrireLocal(CLE_AUDITS, _auditsLocal);
  const sauverVentes     = () => ecrireLocal(CLE_VENTES, _ventesLocales);
  const sauverEvenements = () => ecrireLocal(CLE_EVENEMENTS, _evenementsLocaux);

  const estSimulee = id => id === BA.Simulator._localMachine.id;

  // N° de plaque d'une machine (champ « serial », sinon tiré de l'identifiant)
  const plaque = m => (m && (m.serial || String(m.id || "").replace(/^FAS-/i, ""))) || "—";

  let _formProduitOuvert = false;    // formulaire « nouveau produit »
  let _renommage = null;             // machine en cours de renommage (Ma Flotte)
  let _rechercheAlerte = "";         // recherche dans le catalogue des alertes

  // ---------- Produits par machine (mode local) ----------
  function produitsDe(id) {
    if (!id) return [];
    if (estSimulee(id)) return BA.Simulator._localProducts;
    if (!_stockLocal[id]) _stockLocal[id] = [];
    return _stockLocal[id];
  }

  function definirProduits(id, liste) {
    if (estSimulee(id)) BA.Simulator._localProducts = liste;
    else _stockLocal[id] = liste;
    sauverStock();
  }

  async function produitsMachine(id) {
    return BA.DB.isReady() ? await BA.DB.getProducts(id) : produitsDe(id);
  }

  let _dernierId = 0;
  function nouvelId() {
    _dernierId = Math.max(Date.now(), _dernierId + 1);
    return _dernierId;
  }

  // ---------- Ventes et journal (mode local : machines réelles) ----------
  const ventesDe = id => estSimulee(id) ? BA.Simulator._localSales : (_ventesLocales[id] || []);
  const evenementsDe = id => estSimulee(id) ? BA.Simulator._localEvents : (_evenementsLocaux[id] || []);

  async function ajouterEvenement(machineId, niveau, code, message) {
    if (BA.DB.isReady()) {
      await BA.DB.addEvent(machineId, niveau, code, message);
      return;
    }
    const e = { id: nouvelId(), machine_id: machineId, level: niveau, code, message, created_at: new Date().toISOString() };
    if (estSimulee(machineId)) {
      BA.Simulator._localEvents.unshift(e);
      if (BA.Simulator._localEvents.length > 100) BA.Simulator._localEvents.length = 100;
      return;
    }
    const liste = _evenementsLocaux[machineId] = _evenementsLocaux[machineId] || [];
    liste.unshift(e);
    if (liste.length > 300) liste.length = 300;
    sauverEvenements();
  }

  async function ajouterVentes(machineId, ventes) {
    if (!ventes.length) return;
    if (BA.DB.isReady()) {
      await BA.DB.addSales(machineId, ventes);
      return;
    }
    const maintenant = new Date().toISOString();
    const lignes = ventes.map(v => ({ id: nouvelId(), machine_id: machineId, selection: v.selection,
                                      name: v.name, price: v.price, created_at: maintenant }));
    if (estSimulee(machineId)) {
      BA.Simulator._localSales.unshift(...lignes.reverse());
      return;
    }
    const liste = _ventesLocales[machineId] = _ventesLocales[machineId] || [];
    liste.unshift(...lignes.reverse());
    if (liste.length > 5000) liste.length = 5000;
    sauverVentes();
  }

  // Statut / dernière communication d'une machine
  async function majMachine(machineId, champs) {
    if (BA.DB.isReady()) {
      await BA.DB.updateMachine(machineId, champs);
      return;
    }
    if (estSimulee(machineId)) Object.assign(BA.Simulator._localMachine, champs);
    const m = _listeMachines.find(x => x.id === machineId);
    if (m) {
      Object.assign(m, champs);
      sauverMachines();
    }
  }

  const infoMachine = id => _allMachines.find(m => m.id === id) || _listeMachines.find(m => m.id === id) || {};
  const nomMachine = id => infoMachine(id).name || id;
  const statutMachine = id => infoMachine(id).status || "unknown";

  // ---------- Relevés d'audit (mode local : sauvegardés dans le navigateur) ----------
  function auditsLocaux(id) {
    return (id && _auditsLocal[id]) ? _auditsLocal[id] : [];
  }

  async function lireDernierAudit(machineId) {
    if (BA.DB.isReady()) return await BA.DB.getLastAudit(machineId);
    return auditsLocaux(machineId)[0] || null;
  }

  async function sauverAudit(machineId, audit) {
    if (BA.DB.isReady()) {
      await BA.DB.addAudit(machineId, audit);
      return;
    }
    const liste = auditsLocaux(machineId).slice();
    liste.unshift({ ...audit, imported_at: new Date().toISOString() });
    if (liste.length > 50) liste.length = 50;
    _auditsLocal[machineId] = liste;
    sauverAudits();
  }

  // Diminue le stock des produits dont le numéro de sélection a vendu depuis le dernier relevé
  async function appliquerVentesAuStock(machineId, parSelection) {
    let modifies = 0;
    const meme = (a, b) => String(a).trim() === String(b).trim() || (Number(a) === Number(b) && String(a).trim() !== "");
    if (BA.DB.isReady()) {
      const produits = await BA.DB.getProducts(machineId);
      for (const d of parSelection) {
        if (d.delta <= 0) continue;
        const p = produits.find(x => meme(x.selection, d.selection));
        if (!p) continue;
        await BA.DB.updateProduct(p.id, { qty: Math.max(0, Number(p.qty) - d.delta) });
        modifies++;
      }
    } else {
      const produits = produitsDe(machineId);
      for (const d of parSelection) {
        if (d.delta <= 0) continue;
        const p = produits.find(x => meme(x.selection, d.selection));
        if (!p) continue;
        p.qty = Math.max(0, Number(p.qty) - d.delta);
        modifies++;
      }
      if (modifies) sauverStock();
    }
    return modifies;
  }

  // Lignes de vente déduites de la différence entre deux relevés.
  // Prix : valeur vendue par la machine pour la sélection (PA202) si elle existe,
  // sinon le prix de la fiche produit, sinon le prix moyen du relevé.
  // L'heure est celle de la lecture (la machine ne donne pas l'heure de chaque vente).
  async function construireVentes(machineId, diff) {
    const produits = await produitsMachine(machineId);
    const moyen = diff.deltaCount > 0 && diff.deltaValue > 0 ? diff.deltaValue / diff.deltaCount : 0;
    const ventes = [];
    const repartir = (n, totalEuros) => {
      const total = Math.round(totalEuros * 100), base = Math.floor(total / n);
      let reste = total - base * n;
      const prix = [];
      for (let i = 0; i < n; i++) { prix.push((base + (reste > 0 ? 1 : 0)) / 100); if (reste > 0) reste--; }
      return prix;
    };
    for (const d of diff.parSelection) {
      if (d.delta <= 0) continue;
      const p = produits.find(x => String(x.selection) === String(d.selection) || Number(x.selection) === Number(d.selection));
      let prix;
      if (d.deltaValue != null && d.deltaValue > 0) prix = repartir(d.delta, d.deltaValue);
      else if (p && p.price != null && p.price !== "") prix = new Array(d.delta).fill(Number(p.price));
      else prix = repartir(d.delta, moyen * d.delta);
      const nom = p && p.name ? p.name : "Sélection " + d.selection;
      const sel = Number.isFinite(Number(d.selection)) ? Number(d.selection) : d.selection;
      prix.forEach(pr => ventes.push({ selection: sel, name: nom, price: pr }));
    }
    if (diff.ecartSelections > 0) {
      repartir(diff.ecartSelections, moyen * diff.ecartSelections)
        .forEach(pr => ventes.push({ selection: 0, name: "Vente sans sélection identifiée", price: pr }));
    }
    return ventes;
  }

  // ---------- Machine sélectionnée actuellement ----------
  let _machineSelectionnee = _listeMachines[0] ? _listeMachines[0].id : null;

  // ---------- Données en mémoire ----------
  let _machine  = null;
  let _products = [];
  let _sales    = [];
  let _events   = [];
  let _counters = { totalSales: 0, totalValue: 0 };
  let _allMachines = [];             // toutes les machines (vue flotte)
  let _lastEvaDts  = null;
  let _audits = [];                  // relevés d'audit de la machine sélectionnée (le plus récent en premier)
  let _lastAudit = null;
  let _erreurDonnees = "";           // dernière erreur de chargement Supabase

  // Rafraîchissement groupé quand Supabase signale un changement
  let _timerRefresh = null;
  function rafraichir() {
    clearTimeout(_timerRefresh);
    _timerRefresh = setTimeout(() => loadAll(), 300);
  }

  // ---------- Chargement des données ----------
  async function loadAll() {
    if (BA.DB.isReady()) {
      try {
        const machines = await BA.DB.getAllMachines();
        _allMachines   = machines;
        _listeMachines = machines.map(m => ({ id: m.id, name: m.name, city: m.city, serial: m.serial }));

        if (!_listeMachines.some(m => m.id === _machineSelectionnee)) {
          _machineSelectionnee = _listeMachines[0] ? _listeMachines[0].id : null;
        }

        if (_machineSelectionnee) {
          const results = await Promise.all([
            BA.DB.getMachine(_machineSelectionnee),
            BA.DB.getProducts(_machineSelectionnee),
            BA.DB.getSales(_machineSelectionnee, 50),
            BA.DB.getEvents(_machineSelectionnee, 40),
            BA.DB.getCounters(_machineSelectionnee),
            BA.DB.getAudits(_machineSelectionnee, 10).catch(err => {
              console.warn("Relevés d'audit indisponibles (table « audits » créée ?) :", err.message);
              return [];
            })
          ]);
          _machine  = results[0];
          _products = results[1];
          _sales    = results[2];
          _events   = results[3];
          _counters = results[4];
          _audits   = results[5] || [];
          _lastAudit = _audits[0] || null;
        } else {
          _machine  = null;
          _products = [];
          _sales    = [];
          _events   = [];
          _counters = { totalSales: 0, totalValue: 0 };
          _audits   = [];
          _lastAudit = null;
        }
        _erreurDonnees = "";
      } catch (err) {
        console.error("Erreur de chargement Supabase :", err);
        _erreurDonnees = err.message || String(err);
      }
    } else {
      // Mode local : machine simulée + machines réelles gardées dans ce navigateur
      const id = _machineSelectionnee;
      const conf = _listeMachines.find(m => m.id === id) || {};

      _products  = produitsDe(id);
      _audits    = auditsLocaux(id);
      _lastAudit = _audits[0] || null;
      _sales     = ventesDe(id);
      _events    = evenementsDe(id);
      _machine   = !id ? null : estSimulee(id)
        ? BA.Simulator._localMachine
        : { id, status: conf.status || "unknown", temp_c: null, last_seen: conf.last_seen || null, serial: conf.serial };

      _allMachines = _listeMachines.map(m => estSimulee(m.id)
        ? { ...BA.Simulator._localMachine, name: m.name, city: m.city, serial: m.serial || BA.Simulator._localMachine.serial }
        : { id: m.id, name: m.name, city: m.city, serial: m.serial, status: m.status || "unknown", temp_c: null, last_seen: m.last_seen || null });

      _counters = {
        totalSales: _sales.length,
        totalValue: _sales.reduce((a, s) => a + Number(s.price || 0), 0)
      };
    }
    render();
  }

  // ---------- Navigation ----------
  document.querySelectorAll("nav button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      $("#view-" + btn.dataset.view).classList.add("active");
      renderActiveView(btn.dataset.view);
    };
  });

  function allerVue(vue) {
    const btn = document.querySelector("nav button[data-view='" + vue + "']");
    if (btn) btn.click();
  }

  // ============================================================
  // VUES
  // ============================================================

  // ---------- VUE FLOTTE (toutes les machines) ----------
  function carteMachine(m) {
    const couleurBord = { online: "#16a34a", offline: "#475569", error: "#dc2626", unknown: "#d97706" }[m.status] || "#475569";
    const selectionne = m.id === _machineSelectionnee ? "border: 2px solid #2563eb;" : "";
    const cable = BA.Serial.connected && _rs.machineId === m.id
      ? ` <span class="badge on" title="Le câble RS232 de ce PC est branché sur cette machine">🔌 câble</span>` : "";

    if (_renommage === m.id) {
      return `
        <div class="card" style="border-top: 5px solid ${couleurBord}; ${selectionne}">
          <div class="label">✏️ Renommer la machine</div>
          <div class="label" style="margin-top:10px">Nom</div>
          <input id="ren-nom" maxlength="60" value="${esc(m.name || "")}"
            onkeydown="BA.App.toucheRenommage(event, ${arg(m.id)})">
          <div class="label" style="margin-top:8px">Ville ou lieu</div>
          <input id="ren-ville" maxlength="60" value="${esc(m.city || "")}"
            onkeydown="BA.App.toucheRenommage(event, ${arg(m.id)})">
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
            <button class="btn" onclick="BA.App.enregistrerNom(${arg(m.id)})">💾 Enregistrer</button>
            <button class="btn secondary" onclick="BA.App.annulerRenommage()">Annuler</button>
          </div>
          <p class="note">L'identifiant (${esc(m.id)}) et le n° de plaque ne changent pas : ventes, stock et relevés restent attachés à la machine.</p>
        </div>`;
    }

    return `
      <div class="card carte-machine" onclick="BA.App.selectMachine(${arg(m.id)})"
        style="cursor:pointer; border-top: 5px solid ${couleurBord}; ${selectionne}">
        <div class="label">📍 ${esc(m.city || "—")}</div>
        <div class="value" style="font-size:1rem; margin:6px 0">${esc(m.name || m.id)}</div>
        <div style="margin:8px 0">${badge(m.status)}${cable}</div>
        <div class="note">
          🌡️ ${m.temp_c ?? "—"} °C<br>
          🕐 Dernière communication : ${heure(m.last_seen)}<br>
          Plaque : ${esc(plaque(m))} — ID : ${esc(m.id)}
        </div>
        <div class="carte-actions">
          <button class="btn" style="flex:1">🔍 Détails</button>
          <button class="btn secondary" title="Renommer cette machine"
            onclick="event.stopPropagation(); BA.App.renommer(${arg(m.id)})">✏️ Renommer</button>
          <button class="btn danger" style="background:#dc2626" title="Supprimer cette machine"
            onclick="event.stopPropagation(); BA.App.supprimerMachine(${arg(m.id)})">🗑</button>
        </div>
      </div>`;
  }

  function renderFleet() {
    const machines = _allMachines;

    const totalOnline  = machines.filter(m => m.status === "online").length;
    const totalOffline = machines.filter(m => m.status === "offline" || m.status === "unknown").length;
    const totalError   = machines.filter(m => m.status === "error").length;

    const supabaseInfo = _erreurDonnees
      ? `<div class="alert err" style="margin-bottom:16px">❌ Erreur Supabase : ${esc(_erreurDonnees)}</div>`
      : BA.DB.isReady()
        ? `<div class="alert info" style="margin-bottom:16px">⚡ Mode réel — données en ligne (Supabase)</div>`
        : `<div class="alert warn" style="margin-bottom:16px">⚠️ Mode local — les machines ajoutées sont gardées dans ce navigateur uniquement</div>`;

    const contenu = machines.length === 0
      ? `
        <div class="alert info">
          Aucune machine pour l'instant. Les machines s'ajoutent depuis l'onglet « Connexion RS232 ».
        </div>
        <button class="btn" onclick="BA.App.allerVue('serial')">🔌 Aller à Connexion RS232</button>
      `
      : `
        <div class="cards" style="margin-bottom:24px">
          <div class="card"><div class="label">Total machines</div><div class="value">${machines.length}</div></div>
          <div class="card"><div class="label">En ligne</div><div class="value" style="color:#16a34a">${totalOnline}</div></div>
          <div class="card"><div class="label">Hors ligne</div><div class="value" style="color:#475569">${totalOffline}</div></div>
          <div class="card"><div class="label">En erreur</div><div class="value" style="color:#dc2626">${totalError}</div></div>
        </div>

        <h2>Toutes les machines</h2>
        <div class="cards">
          ${machines.map(carteMachine).join("")}
        </div>
      `;

    $("#view-fleet").innerHTML = `
      <h2>🌍 Ma Flotte — Vue globale</h2>
      ${supabaseInfo}
      ${contenu}
    `;
  }

  // ---------- Bloc « relevé d'audit » (tableau de bord) ----------
  function htmlAudit() {
    const bouton = `
      <input type="file" id="audit-file" style="display:none" onchange="BA.App.importerAudit(this)">
      <button class="btn" onclick="document.getElementById('audit-file').click()">
        📥 Importer un audit (fichier de la clé USB)
      </button>`;

    if (!_lastAudit) {
      return `
        <h2>📥 Relevé d'audit</h2>
        <p class="note" style="margin-bottom:12px">
          Aucun relevé pour cette machine. Lance l'audit sur clé USB dans le menu de la machine
          (commande 80) puis importe ici le fichier .dat, ou lis la machine par le câble (onglet « Connexion RS232 »).
        </p>
        ${bouton}`;
    }

    const a = _lastAudit;
    const depuis = a.delta_count == null
      ? "Relevé de départ"
      : `+${a.delta_count} vente(s) (+${eur(a.delta_value)})`;
    const parties = String(a.machine_date || "").split(" ");
    const horloge = BA.EvaDts.formatDate(parties[0], parties[1]) || a.machine_date || "—";

    return `
      <h2>📥 Relevé d'audit</h2>
      <div class="cards">
        <div class="card">
          <div class="label">Dernier relevé enregistré</div>
          <div class="value" style="font-size:1rem">${heure(a.imported_at)}</div>
          <div class="note">${a.source === "usb" ? "clé USB" : a.source === "rs232" ? "câble RS232" : esc(a.source || "")}</div>
        </div>
        <div class="card">
          <div class="label">Ventes cumulées (machine)</div>
          <div class="value">${a.total_count}</div>
        </div>
        <div class="card">
          <div class="label">CA cumulé (machine)</div>
          <div class="value">${eur(a.total_value)}</div>
        </div>
        <div class="card">
          <div class="label">Depuis le relevé précédent</div>
          <div class="value" style="font-size:1rem">${depuis}</div>
        </div>
      </div>
      <p class="note" style="margin-bottom:12px">
        Horloge de la machine dans le relevé : ${esc(horloge)} (peu fiable si l'horloge n'est pas réglée, commande 02).
        Le détail des erreurs est dans l'onglet « Alertes ».
      </p>
      ${bouton}`;
  }

  // ---------- Ventes par sélection d'après le dernier relevé (onglet Ventes) ----------
  function htmlAuditSelections() {
    if (!_lastAudit) return "";

    const prec  = _audits[1];
    const avant = {};
    if (prec) (prec.selections || []).forEach(s => { avant[String(s.selection)] = s.sold; });

    const lignes = (_lastAudit.selections || [])
      .filter(s => s.sold > 0)
      .map(s => {
        const prod = _products.find(p => String(p.selection) === String(s.selection) || Number(p.selection) === Number(s.selection));
        const d = prec ? s.sold - (avant[String(s.selection)] || 0) : null;
        return `
          <tr>
            <td>${esc(s.selection)}</td>
            <td>${prod && prod.name ? esc(prod.name) : "—"}</td>
            <td>${s.sold}</td>
            <td>${s.value == null ? "—" : eur(s.value)}</td>
            <td>${d == null ? "—" : (d >= 0 ? "+" : "") + d}</td>
          </tr>`;
      }).join("");

    return `
      <h2>📥 Par sélection — relevé du ${heure(_lastAudit.imported_at)}</h2>
      <table>
        <tr>
          <th>Sél.</th>
          <th>Produit</th>
          <th>Ventes cumulées</th>
          <th>CA cumulé</th>
          <th>Depuis le relevé précédent</th>
        </tr>
        ${lignes || "<tr><td colspan='5'>Aucune vente dans le relevé</td></tr>"}
      </table>
      <p class="note" style="margin-top:8px; margin-bottom:24px">
        Chiffres cumulés depuis la mise en service de la machine (compteurs LA105 et PA202). Le CA n'est pas fourni pour toutes les sélections.
      </p>`;
  }

  // ---------- VUE DASHBOARD (détails machine sélectionnée) ----------
  function renderDashboard() {
    if (!_machine) {
      $("#view-dashboard").innerHTML = `
        <p class="note">Aucune machine sélectionnée. Va dans « Ma Flotte » et clique sur une machine.</p>`;
      return;
    }

    const aujourd_hui = new Date().toDateString();
    const ventesAujourdHui = _sales.filter(s =>
      new Date(s.created_at || s.ts).toDateString() === aujourd_hui
    );
    const caAujourdHui   = ventesAujourdHui.reduce((a, s) => a + Number(s.price || 0), 0);
    const alertesStock   = _products.filter(p => p.qty <= BA_CONFIG.lowStockThreshold).length;
    const machineConfig  = _listeMachines.find(m => m.id === _machineSelectionnee) || {};
    const cable = BA.Serial.connected && _rs.machineId === _machineSelectionnee;

    $("#view-dashboard").innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
        <h2 style="margin:0">📊 Détails — ${esc(machineConfig.name || _machineSelectionnee)}</h2>
        <button class="btn secondary" onclick="BA.App.renommer(${arg(_machineSelectionnee)})">✏️ Renommer</button>
      </div>
      <p class="note" style="margin-bottom:16px">
        📍 ${esc(machineConfig.city || "—")} — plaque ${esc(plaque(Object.assign({ id: _machineSelectionnee }, machineConfig)))} — ID : ${esc(_machineSelectionnee)}
        ${cable ? " — 🔌 câble RS232 branché sur ce PC" : ""}
      </p>

      <div class="cards">
        <div class="card">
          <div class="label">Statut machine</div>
          <div class="value">${badge(_machine.status)}</div>
          <div class="note">Dernière communication : ${heure(_machine.last_seen)}</div>
        </div>
        <div class="card">
          <div class="label">Température</div>
          <div class="value">${_machine.temp_c ?? "—"} °C</div>
          <div class="note">${estSimulee(_machineSelectionnee) ? "simulée" : "non transmise par l'audit (commande 99)"}</div>
        </div>
        <div class="card">
          <div class="label">Ventes aujourd'hui</div>
          <div class="value">${ventesAujourdHui.length}</div>
        </div>
        <div class="card">
          <div class="label">CA aujourd'hui</div>
          <div class="value">${eur(caAujourdHui)}</div>
        </div>
        <div class="card">
          <div class="label">CA total</div>
          <div class="value">${eur(_counters.totalValue)}</div>
        </div>
        <div class="card">
          <div class="label">Alertes stock</div>
          <div class="value">${alertesStock}</div>
        </div>
      </div>

      ${htmlAudit()}

      <h2>Dernières ventes</h2>
      ${tableVentes(_sales.slice(0, 8))}
    `;
  }

  // ---------- VUE PRODUITS / STOCK ----------
  function renderProducts() {
    if (!_machineSelectionnee) {
      $("#view-products").innerHTML = `
        <p class="note">Aucune machine sélectionnée. Va dans « Ma Flotte » et clique sur une machine.</p>`;
      return;
    }

    const machineConfig = _listeMachines.find(m => m.id === _machineSelectionnee) || {};

    // Copier les produits d'une autre machine
    const autres = BA.DB.isReady()
      ? _listeMachines.filter(m => m.id !== _machineSelectionnee)
      : _listeMachines.filter(m => m.id !== _machineSelectionnee && produitsDe(m.id).length > 0);
    const copier = autres.length ? `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <span class="note">📋 Copier les produits (sans le stock) de :</span>
        <select id="copy-source" style="width:auto; min-width:180px">
          ${autres.map(m => `<option value="${esc(m.id)}">${esc(m.name || m.id)}</option>`).join("")}
        </select>
        <button class="btn secondary" onclick="BA.App.copierProduits()">Copier</button>
      </div>` : "";

    const formulaire = _formProduitOuvert ? `
      <div class="card" style="margin-bottom:16px">
        <h3>➕ Nouveau produit</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:12px 0">
          <div><div class="label">N° de sélection</div><input id="np-sel" type="number" placeholder="ex : 11"></div>
          <div><div class="label">Produit</div><input id="np-name" placeholder="ex : Pain blanc"></div>
          <div><div class="label">Prix (€)</div><input id="np-price" type="number" step="0.10" placeholder="ex : 2.50"></div>
          <div><div class="label">Stock actuel</div><input id="np-qty" type="number" placeholder="ex : 8"></div>
          <div><div class="label">Capacité max</div><input id="np-cap" type="number" placeholder="ex : 10"></div>
        </div>
        <button class="btn" onclick="BA.App.ajouterProduit()">💾 Enregistrer</button>
        <button class="btn secondary" onclick="BA.App.fermerFormProduit()">Annuler</button>
      </div>` : "";

    $("#view-products").innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px">
        <h2 style="margin:0">🍞 Produits / Stock — ${esc(machineConfig.name || _machineSelectionnee)}</h2>
        <button class="btn" onclick="BA.App.ouvrirFormProduit()">➕ Ajouter un produit</button>
      </div>
      ${copier}
      ${formulaire}
      <table>
        <tr>
          <th>Sél.</th><th>Produit</th><th>Prix</th><th>Stock</th><th>Capacité</th><th>Action</th>
        </tr>
        ${_products.map(p => `
          <tr class="${p.qty === 0 ? "empty" : p.qty <= BA_CONFIG.lowStockThreshold ? "low" : ""}">
            <td><input type="number" value="${esc(p.selection)}" style="width:70px"
                  onchange="BA.App.editProduct(${arg(p.id)}, 'selection', this.value)"></td>
            <td><input value="${esc(p.name)}"
                  onchange="BA.App.editProduct(${arg(p.id)}, 'name', this.value)"></td>
            <td><input type="number" step="0.10" value="${Number(p.price).toFixed(2)}" style="width:80px"
                  onchange="BA.App.editProduct(${arg(p.id)}, 'price', this.value)"></td>
            <td><input type="number" value="${esc(p.qty)}" style="width:70px"
                  onchange="BA.App.editProduct(${arg(p.id)}, 'qty', this.value)"></td>
            <td><input type="number" value="${esc(p.capacity)}" style="width:70px"
                  onchange="BA.App.editProduct(${arg(p.id)}, 'capacity', this.value)"></td>
            <td style="white-space:nowrap">
              <button class="btn secondary" onclick="BA.App.refill(${arg(p.id)}, ${Number(p.capacity) || 0})">🔄 Remplir</button>
              <button class="btn" style="background:#dc2626" title="Supprimer ce produit"
                onclick="BA.App.supprimerProduit(${arg(p.id)})">🗑</button>
            </td>
          </tr>
        `).join("") || `
          <tr><td colspan="6">Aucun produit pour cette machine. Clique sur « ➕ Ajouter un produit ».</td></tr>
        `}
      </table>
      <p class="note" style="margin-top:10px">
        🟡 Jaune = stock faible (≤ ${BA_CONFIG.lowStockThreshold}) — 🔴 Rouge = épuisé.
        Le stock diminue tout seul à chaque relevé qui montre des ventes ; « Remplir » après une recharge.
      </p>
    `;
  }

  // ---------- VUE VENTES ----------
  function renderSales() {
    const machineConfig = _listeMachines.find(m => m.id === _machineSelectionnee) || {};
    const parSelection  = {};

    _sales.forEach(s => {
      if (!parSelection[s.selection]) parSelection[s.selection] = { name: s.name, n: 0, valeur: 0 };
      parSelection[s.selection].n++;
      parSelection[s.selection].valeur += Number(s.price || 0);
    });

    $("#view-sales").innerHTML = `
      <h2>💶 Ventes — ${esc(machineConfig.name || _machineSelectionnee)}</h2>
      <div class="cards">
        <div class="card"><div class="label">Nombre total de ventes</div><div class="value">${_counters.totalSales}</div></div>
        <div class="card"><div class="label">Chiffre d'affaires total</div><div class="value">${eur(_counters.totalValue)}</div></div>
      </div>
      <p class="note" style="margin-bottom:16px">
        Ventes calculées à chaque relevé (câble ou clé USB) par différence avec le relevé précédent.
        L'heure affichée est celle du relevé : la machine ne donne pas l'heure de chaque vente.
      </p>

      ${htmlAuditSelections()}

      <h2>Par sélection${BA.DB.isReady() ? " (50 dernières ventes)" : ""}</h2>
      <table>
        <tr><th>Sél.</th><th>Produit</th><th>Qté vendue</th><th>CA</th></tr>
        ${Object.entries(parSelection).map(([k, v]) => `
          <tr><td>${esc(k)}</td><td>${esc(v.name)}</td><td>${v.n}</td><td>${eur(v.valeur)}</td></tr>
        `).join("") || `<tr><td colspan="4">Aucune vente pour l'instant</td></tr>`}
      </table>

      <h2 style="margin-top:20px">Historique</h2>
      ${tableVentes(_sales)}
    `;
  }

  // ---------- VUE ALERTES ----------
  const ORDRE_GRAVITE = { p: 0, s: 1, i: 2 };

  function erreursDuReleve(audit) {
    const r = { eva: [], fas: [], pow: [] };
    ((audit && audit.errors) || []).forEach(e => {
      const t = e.type || "eva";
      if (r[t]) r[t].push(e);
    });
    return r;
  }

  function carteEvenement(e) {
    const d = BA.Alertes.decrire(e.code);
    const g = BA.Alertes.gravite(d.gravite);
    const quand = BA.EvaDts.formatDate(e.date, e.time);
    const etat = e.active === true ? "<b>encore active</b>" : e.active === false ? "terminée" : "";
    const ligne = [quand, "code " + esc(e.code) + (e.count > 1 ? " ×" + e.count : ""), etat].filter(Boolean).join(" — ");
    return `
      <div class="alert ${g.classe}${e.active === false ? " fini" : ""}">
        ${g.icone} <b>${esc(d.titre)}</b> (${esc(d.expl)})
        <div class="sous">${ligne}</div>
        ${d.solution && d.solution.length ? `<div class="sous">👉 À faire : ${esc(d.solution.join(" "))}</div>` : ""}
        ${d.observe ? `<div class="sous petit">ℹ️ ${esc(d.observe)}</div>` : ""}
        ${d.note ? `<div class="sous petit">ℹ️ ${esc(d.note)}</div>` : ""}
      </div>`;
  }

  function carteFas(e) {
    const d = BA.Alertes.fas(e.code, e.sous);
    const quand = BA.EvaDts.formatDate(e.date, e.time);
    const ligne = [quand, "code FAS " + esc(e.code) + (e.sous ? "/" + esc(e.sous) : "") + (e.count > 1 ? " ×" + e.count : "")].filter(Boolean).join(" — ");
    return `
      <div class="alert err">
        🔴 <b>${esc(d.titre)}</b> (${esc(d.expl)})
        <div class="sous">${ligne}</div>
        ${d.solution.length ? `<div class="sous">👉 À faire : ${esc(d.solution.join(" "))}</div>` : ""}
        ${d.note ? `<div class="sous petit">ℹ️ ${esc(d.note)}</div>` : ""}
      </div>`;
  }

  function htmlErreursMachine(nom) {
    if (!_lastAudit) {
      return `
        <h2 style="margin-top:24px">🛠️ Erreurs machine — ${esc(nom)}</h2>
        <p class="note">Pas encore de relevé complet pour cette machine : importe un audit USB (onglet « Détails Machine »)
        ou lis la machine par le câble (onglet « Connexion RS232 »). Les événements envoyés par la machine arrivent aussi dans le journal ci-dessous.</p>`;
    }
    const a = _lastAudit;
    const err = erreursDuReleve(a);
    const parties = String(a.machine_date || "").split(" ");
    const horloge = BA.EvaDts.formatDate(parties[0], parties[1]) || a.machine_date || "—";
    const nbEva = err.eva.reduce((s, e) => s + Math.max(1, Number(e.count) || 1), 0);
    const nbActifs = err.eva.filter(e => e.active === true).reduce((s, e) => s + Math.max(1, Number(e.count) || 1), 0);
    const nbFas = err.fas.reduce((s, e) => s + Math.max(1, Number(e.count) || 1), 0);

    const eva = err.eva.slice().sort((x, y) => {
      const dx = BA.Alertes.decrire(x.code), dy = BA.Alertes.decrire(y.code);
      return (y.active === true) - (x.active === true) ||
             ORDRE_GRAVITE[dx.gravite] - ORDRE_GRAVITE[dy.gravite] ||
             BA.EvaDts.cleDate(y.date, y.time).localeCompare(BA.EvaDts.cleDate(x.date, x.time));
    });

    const coupures = err.pow.map(p => {
      const [d1, h1] = String(p.off || "").split(" ");
      const [d2, h2] = String(p.on || "").split(" ");
      return `<tr><td>${esc(BA.EvaDts.formatDate(d1, h1) || "—")}</td><td>${esc(BA.EvaDts.formatDate(d2, h2) || "—")}</td></tr>`;
    }).join("");

    return `
      <h2 style="margin-top:24px">🛠️ Erreurs machine — ${esc(nom)}</h2>
      <p class="note" style="margin-bottom:10px">
        Relevé du ${heure(a.imported_at)} (${a.source === "usb" ? "clé USB" : "câble RS232"}) — ${nbEva} événement(s) EVA-DTS,
        dont ${nbActifs} encore actif(s) ; ${nbFas} erreur(s) FAS. Horloge de la machine : ${esc(horloge)} (peu fiable si elle n'est pas réglée, commande 02).
        Une erreur peut rester « active » dans le relevé après la réparation : regarde sa date.
      </p>

      <h3>Événements (codes EVA-DTS envoyés par la machine)</h3>
      ${eva.length ? eva.map(carteEvenement).join("") : `<p class="note">Aucun événement dans ce relevé.</p>`}

      <h3>Erreurs Power Lift (journal FAS, avec la solution du manuel)</h3>
      ${err.fas.length ? err.fas.map(carteFas).join("") : `<p class="note">Aucune erreur FAS (MA5*ERROR) dans ce relevé.</p>`}

      <h3>🔌 Coupures de courant</h3>
      ${coupures ? `
        <table><tr><th>Courant coupé</th><th>Courant revenu</th></tr>${coupures}</table>
        <p class="note" style="margin-top:6px">Les 10 dernières coupures (commande 99, option 2). Dates fiables seulement si l'horloge de la machine est réglée (commande 02).</p>`
        : `<p class="note">Aucune coupure de courant dans ce relevé.</p>`}
    `;
  }

  function htmlCatalogue(recherche) {
    const r = BA.Alertes.chercher(recherche);
    const ouvert = recherche ? " open" : "";
    const ligne = d => {
      const g = BA.Alertes.gravite(d.gravite);
      return `<div class="code-ligne"><code>${esc(d.code)}</code> ${g.icone} <b>${esc(d.titre)}</b> — ${esc(d.expl)}</div>`;
    };
    let html = "";
    if (r.fas.length) {
      html += `
        <details${ouvert}>
          <summary><b>Erreurs Power Lift (FAS) — journal de la machine (commande 99)</b> — ${r.fas.length} code(s)</summary>
          ${r.fas.map(f => `
            <div class="code-ligne">
              <code>${esc(f.code)}</code> 🔴 <b>${esc(f.titre)}</b> — ${esc(f.expl)}${f.sous ? ` <span class="petit">(sous-code : ${esc(f.sous)})</span>` : ""}
              ${f.solution.length ? `<div class="sous">👉 ${esc(f.solution.join(" "))}</div>` : ""}
              ${f.observes.length ? `<div class="sous petit">Code EVA-DTS observé dans un relevé : ${esc(f.observes.join(", "))} (non écrit dans le manuel)</div>` : ""}
              ${f.note ? `<div class="sous petit">ℹ️ ${esc(f.note)}</div>` : ""}
            </div>`).join("")}
          <p class="note">Sous-codes : 33 = cellules photoélectriques, 38 = spirales maître, 39 = spirales esclave, 54 = ascenseur ; pour 01, 02, 05, 09 et 91 le sous-code est le n° de sélection.</p>
        </details>`;
    }
    r.groupes.forEach(g => {
      html += `
        <details${ouvert}>
          <summary><b>${esc(g.nom)} (${esc(g.prefixe)}…)</b> — ${g.codes.length} code(s)</summary>
          ${g.codes.map(ligne).join("")}
        </details>`;
    });
    return html || `<p class="note">Aucun code ne correspond à « ${esc(recherche)} ».</p>`;
  }

  function renderAlerts() {
    const stockFaible = _products.filter(p => p.qty <= BA_CONFIG.lowStockThreshold);
    const alertesGlobales = _allMachines.filter(m => m.status === "error" || m.status === "offline");
    const machineConfig = _listeMachines.find(m => m.id === _machineSelectionnee) || {};
    const nom = machineConfig.name || _machineSelectionnee || "—";
    const n = BA.Alertes.nombreCodes();

    $("#view-alerts").innerHTML = `
      ${alertesGlobales.length ? `
        <h2>⚠️ Alertes Flotte Globale</h2>
        ${alertesGlobales.map(m => `
          <div class="alert ${m.status === "error" ? "err" : "warn"}">
            ${m.status === "error" ? "🔴 Erreur" : "🟡 Hors ligne"} — <b>${esc(m.name || m.id)}</b> (${esc(m.city || "—")})
            — dernière communication : ${heure(m.last_seen)}
            <button class="btn secondary petit" onclick="BA.App.selectMachine(${arg(m.id)})">Voir</button>
            ${m.status === "error" ? `<button class="btn petit" onclick="BA.App.marquerTraite(${arg(m.id)})" title="Repasse la machine en « En ligne »">✔ Problème traité</button>` : ""}
          </div>
        `).join("")}
      ` : `<div class="alert info">✅ Aucune machine en erreur ou hors ligne</div>`}

      ${_machineSelectionnee ? htmlErreursMachine(nom) : ""}

      <h2 style="margin-top:24px">Stock faible — ${esc(nom)}</h2>
      ${stockFaible.length
        ? stockFaible.map(p => `
            <div class="alert ${p.qty === 0 ? "err" : "warn"}">
              ${p.qty === 0 ? "⛔ Épuisé" : "⚠️ Stock faible"} — Sél. ${esc(p.selection)} &nbsp;
              <b>${esc(p.name)}</b> &nbsp; (${esc(p.qty)} / ${esc(p.capacity)})
              <button class="btn secondary petit" onclick="BA.App.refill(${arg(p.id)}, ${Number(p.capacity) || 0})">🔄 Remplir</button>
            </div>
          `).join("")
        : `<p class="note">✅ Aucune alerte stock</p>`
      }

      <h2 style="margin-top:24px">Journal machine</h2>
      ${_events.length
        ? _events.slice(0, 40).map(e => `
            <div class="alert ${e.level === "error" ? "err" : e.level === "warn" ? "warn" : "info"}">
              <small>${heure(e.created_at || e.ts)}</small> &nbsp;—&nbsp; <b>${esc(e.code)}</b> : ${esc(e.message)}
            </div>
          `).join("")
        : `<p class="note">Aucun événement</p>`
      }

      <h2 style="margin-top:24px">📖 Toutes les alertes possibles</h2>
      <p class="note" style="margin-bottom:8px">
        🔴 panne &nbsp; 🟠 à surveiller &nbsp; 🔵 information. Sources : manuel POWER LIFT (tableau des erreurs, ${n.fas} codes FAS de 01 à 98, avec la solution du manuel)
        et norme EVA-DTS 6.1.2, annexe C (${n.eva} codes, sans solution). La Power Lift n'envoie pas forcément tous les codes EVA-DTS.
      </p>
      <input id="recherche-alerte" placeholder="🔎 Chercher un code ou un mot (ex : E45, spirale, porte, monnaie)"
        value="${esc(_rechercheAlerte)}" oninput="BA.App.chercherAlerte(this.value)" style="margin-bottom:10px">
      <div id="catalogue-resultats">${htmlCatalogue(_rechercheAlerte)}</div>
    `;
  }

  // ---------- VUE CONNEXION RS232 ----------
  const RS_DEFAUT = {
    machineId:       null,
    vitesse:         (BA_CONFIG.rs232 && BA_CONFIG.rs232.vitesse) || 9600,
    liste:           2,
    lectureAuto:     false,
    intervalleMin:   (BA_CONFIG.rs232 && BA_CONFIG.rs232.intervalleMin) || 15,
    reconnexionAuto: false
  };
  let _rs = Object.assign({}, RS_DEFAUT, lireLocal(CLE_RS232, {}));
  if (_rs.liste !== 1) _rs.liste = 2;
  const sauverRs = () => ecrireLocal(CLE_RS232, _rs);

  let _rsJournal   = [];          // { t, texte, niveau }
  let _rsBrut      = [];          // lignes hexadécimales
  let _rsOctets    = 0;
  let _rsEtat      = "Déconnecté";
  let _rsRapports  = [];          // derniers relevés reçus (résumés)
  let _rsProchaine = null;        // heure de la prochaine lecture automatique
  let _rsDernierEchec = false;
  let _rapportEnAttente = null;   // relevé reçu sans machine choisie
  let _derniereAnalyse = null;
  const _vus = {};                // événements poussés déjà enregistrés (par machine)

  const machineCable = () => (_rs.machineId && _listeMachines.some(m => m.id === _rs.machineId)) ? _rs.machineId : null;
  const hhmmss = d => d.toLocaleTimeString("fr-FR") + "." + String(d.getMilliseconds()).padStart(3, "0");

  function journalRs(texte, niveau) {
    _rsJournal.unshift({ t: new Date(), texte, niveau: niveau || "info" });
    if (_rsJournal.length > 400) _rsJournal.length = 400;
    const el = $("#rs-journal");
    if (el) el.innerHTML = htmlJournalRs();
  }

  function htmlJournalRs() {
    return _rsJournal.length
      ? _rsJournal.slice(0, 200).map(l => `<div class="j-${esc(l.niveau)}">${hhmmss(l.t)}  ${esc(l.texte)}</div>`).join("")
      : "— Rien pour l'instant —";
  }

  function brutRs(sens, octets) {
    _rsOctets += sens === "RX" ? octets.length : 0;
    _rsBrut.unshift(hhmmss(new Date()) + " " + (sens === "RX" ? "← machine" : "→ PC     ") + "  " + BA.DDCMP.hex(octets.slice(0, 64)) + (octets.length > 64 ? " … (" + octets.length + " octets)" : ""));
    if (_rsBrut.length > 300) _rsBrut.length = 300;
    const el = $("#serial-brut");
    if (el) el.textContent = _rsBrut.join("\n");
    const nb = $("#serial-count");
    if (nb) nb.textContent = _rsOctets;
  }

  function majStatutRs(s) {
    const b = $("#serial-status");
    if (b) {
      b.textContent = "RS232 : " + s;
      b.className = "badge " + (s === "connecté" ? "on" : String(s).startsWith("erreur") ? "err" : "off");
    }
    if (s !== "connecté") {
      _rsProchaine = null;
      const id = machineCable();
      if (id && statutMachine(id) === "online") majMachine(id, { status: "offline" }).then(() => loadAll()).catch(() => {});
    }
    majSerialDynamique();
  }

  function htmlChoixMachine() {
    return `
      <select id="rs-machine" onchange="BA.App.choisirMachineCable(this.value)">
        <option value="">— Choisir la machine branchée —</option>
        ${_listeMachines.map(m => `<option value="${esc(m.id)}" ${m.id === _rs.machineId ? "selected" : ""}>${esc(m.name || m.id)} — plaque ${esc(plaque(m))}</option>`).join("")}
      </select>`;
  }

  function htmlRapportsRs() {
    if (!_rsRapports.length) return `<p class="note">— Aucun relevé reçu depuis l'ouverture de la page —</p>`;
    return `
      <table>
        <tr><th>Reçu à</th><th>Origine</th><th>Contenu</th><th>Contrôle</th><th>Résultat</th></tr>
        ${_rsRapports.map(r => `
          <tr>
            <td>${heure(r.recuA)}</td>
            <td>${r.role === "esclave" ? "envoi de la machine" : "lecture liste " + esc(r.liste)}</td>
            <td>${r.type === "audit" ? "compteurs + événements" : r.type === "evenements" ? "événements" : "vide"}</td>
            <td>${r.g85 && r.g85.present ? (r.g85.ok ? "✅ G85" : "❌ G85 faux") : "—"}</td>
            <td>${esc(r.info || "")}</td>
          </tr>`).join("")}
      </table>`;
  }

  function htmlMachineDetectee() {
    const a = _derniereAnalyse;
    if (!a) {
      return `<p class="note">— Aucune donnée reçue pour l'instant. Connecte le câble, puis « Lire maintenant », ou attends un envoi de la machine. —</p>`;
    }
    const total = a.va1 ? `${a.va1.countTotal} vente(s) — ${eur(a.va1.valueTotal)}` : "— (envoi d'événements seulement)";
    const numeroGenerique = !a.machineId || /^FAS0*1$/i.test(a.machineId) || /^FAS$/i.test(a.machineId);
    const proposition = numeroGenerique ? "" : String(a.machineId || "").replace(/^FAS-?/i, "").replace(/[^A-Za-z0-9-]/g, "");
    const parties = String(a.machineDate || "").split(" ");

    const attente = _rapportEnAttente ? `
      <div class="alert warn" style="margin-top:12px">
        ⏳ Ce relevé n'est enregistré nulle part : choisis à quelle machine il appartient.
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; align-items:center">
          <select id="det-rattacher" style="width:auto; min-width:220px">
            ${_listeMachines.map(m => `<option value="${esc(m.id)}">${esc(m.name || m.id)} — plaque ${esc(plaque(m))}</option>`).join("")}
          </select>
          <button class="btn" onclick="BA.App.rattacherRapport()">📎 Rattacher à cette machine</button>
        </div>
      </div>` : "";

    return `
      <div class="card">
        <h3>${a.type === "audit" ? "✅ Relevé reçu" : "✅ Événement(s) reçu(s)"}</h3>
        <table>
          <tr><th>N° lu dans les données</th><td>${esc(a.machineId) || "—"}${numeroGenerique ? " <span class='note'>(n° générique : commande 91 jamais remplie)</span>" : ""}</td></tr>
          <tr><th>Modèle / logiciel</th><td>${esc(a.machineModel) || "—"} ${a.logiciel ? "/ " + esc(a.logiciel) : ""}</td></tr>
          <tr><th>Horloge de la machine</th><td>${esc(BA.EvaDts.formatDate(parties[0], parties[1]) || "—")}</td></tr>
          <tr><th>Ventes (compteur total)</th><td>${total}</td></tr>
          <tr><th>Sélections</th><td>${a.selections.length}</td></tr>
          <tr><th>Événements / erreurs FAS / coupures</th><td>${a.events.length} / ${a.fasErrors.length} / ${a.powerCuts.length}</td></tr>
          <tr><th>Contrôle G85</th><td>${a.g85.present ? (a.g85.ok ? "✅ correct" : "❌ faux (texte abîmé)") : "absent"}</td></tr>
        </table>
        ${attente}
        <details style="margin-top:12px">
          <summary>➕ Ce relevé vient d'une machine qui n'est pas encore dans la flotte</summary>
          <p class="note">Entre le n° de la <b>plaque</b> de la machine (le n° lu dans les données n'est pas fiable).</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin:12px 0">
            <div><div class="label">N° de plaque</div><input id="det-id" value="${esc(proposition)}" placeholder="ex : 202164170"></div>
            <div><div class="label">Nom de la machine</div><input id="det-name" placeholder="ex : Boulangerie Dupont"></div>
            <div><div class="label">Ville ou lieu</div><input id="det-city" placeholder="ex : Bruxelles"></div>
          </div>
          <button class="btn" onclick="BA.App.ajouterMachine('det')">➕ Ajouter cette machine à la flotte</button>
        </details>
      </div>`;
  }

  function majProchaine() {
    const el = $("#rs-prochaine");
    if (!el) return;
    el.textContent = _rsProchaine
      ? "Prochaine lecture automatique : " + new Date(_rsProchaine).toLocaleTimeString("fr-FR")
      : (_rs.lectureAuto ? "Lecture automatique activée : elle démarre quand le câble est connecté." : "Lecture automatique désactivée.");
  }

  // Met à jour les parties vivantes de l'onglet RS232 sans effacer ce qui est en train d'être tapé
  function majSerialDynamique() {
    const occupe = el => el && document.activeElement && el.contains(document.activeElement);
    const zm = $("#rs-choix-machine");
    if (zm && !occupe(zm)) zm.innerHTML = htmlChoixMachine();
    const zr = $("#rs-rapports");
    if (zr) zr.innerHTML = htmlRapportsRs();
    const zd = $("#serial-detect");
    if (zd && !occupe(zd)) zd.innerHTML = htmlMachineDetectee();
    const ze = $("#rs-etat");
    if (ze) ze.textContent = (BA.Serial.connected ? "🟢 " : "⚪ ") + _rsEtat;
    const bc = $("#btn-rs-connecter");
    if (bc) bc.disabled = BA.Serial.connected;
    majProchaine();
  }

  function renderSerial() {
    const vitesses = [2400, 4800, 9600, 19200, 38400, 57600, 115200];

    $("#view-serial").innerHTML = `
      <h2>🔌 Connexion RS232 — câble entre ce PC et une machine</h2>

      <div class="alert ${BA.Serial.supported() ? "info" : "err"}" style="margin-bottom:12px">
        ${BA.Serial.supported()
          ? "✅ Web Serial disponible dans ce navigateur"
          : "❌ Web Serial non disponible — utilise Google Chrome ou Microsoft Edge (sur ordinateur)"}
      </div>

      <div class="card" style="margin-bottom:12px">
        <h3>1. Machine branchée sur ce câble</h3>
        <div id="rs-choix-machine">${htmlChoixMachine()}</div>
        <p class="note">Toutes les machines s'annoncent « FAS000000001 » (commande 91 jamais remplie) :
        c'est ce choix qui dit à quelle machine appartiennent les données reçues par le câble.</p>
      </div>

      <div class="card" style="margin-bottom:12px">
        <h3>2. Câble et réglages</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin:10px 0">
          <div>
            <div class="label">Vitesse (la même que dans la commande 90)</div>
            <select id="rs-vitesse" onchange="BA.App.reglerRs('vitesse', this.value)">
              ${vitesses.map(v => `<option value="${v}" ${Number(_rs.vitesse) === v ? "selected" : ""}>${v} bauds</option>`).join("")}
            </select>
          </div>
          <div>
            <div class="label">Format / adresse</div>
            <div class="note" style="margin:6px 0">8 bits, sans parité, 1 bit d'arrêt — adresse 1 (point à point)</div>
          </div>
        </div>
        <label class="case"><input type="checkbox" ${_rs.reconnexionAuto ? "checked" : ""}
          onchange="BA.App.reglerRs('reconnexionAuto', this.checked)">
          Reconnexion automatique (à l'ouverture de la page et quand l'adaptateur USB est rebranché)</label>
        <p class="note">
          Câble : DB9 <b>droit</b> femelle-femelle, fils 2-2, 3-3, 5-5 (pas de câble croisé « null-modem »).
          Sur la machine (broches) : 2 = émission machine, 3 = réception machine, 5 = masse ; la broche 7 ne sert qu'à l'imprimante.<br>
          Sur la machine, commande 90 : EVA-DTS DDCMP → OUTPUT RS232 → adresse 1 → même vitesse qu'ici.
          Laisser « Erase interim data » et « Immediate erasing » à 0.
        </p>
        <button class="btn" id="btn-rs-connecter" onclick="BA.App.serialConnect()" ${BA.Serial.connected ? "disabled" : ""}>🔌 Connecter</button>
        <button class="btn secondary" onclick="BA.App.serialDisconnect()">Déconnecter</button>
        <p style="margin-top:8px">État : <b id="rs-etat">${(BA.Serial.connected ? "🟢 " : "⚪ ") + esc(_rsEtat)}</b></p>
      </div>

      <div class="card" style="margin-bottom:12px">
        <h3>3. Lecture des compteurs</h3>
        <label class="case"><input type="radio" name="rs-liste" ${_rs.liste === 2 ? "checked" : ""}
          onchange="BA.App.reglerRs('liste', 2)"> Liste 2 — lecture de contrôle : la machine ne remet rien à zéro (conseillé)</label>
        <label class="case"><input type="radio" name="rs-liste" ${_rs.liste === 1 ? "checked" : ""}
          onchange="BA.App.reglerRs('liste', 1)"> Liste 1 — audit standard (à essayer seulement si la liste 2 est refusée)</label>
        <div style="margin:10px 0">
          <button class="btn" onclick="BA.App.serialLire()">📥 Lire maintenant</button>
        </div>
        <label class="case"><input type="checkbox" ${_rs.lectureAuto ? "checked" : ""}
          onchange="BA.App.reglerRs('lectureAuto', this.checked)">
          Lecture automatique toutes les
          <input type="number" min="2" max="1440" value="${Number(_rs.intervalleMin)}" style="width:70px; display:inline-block"
            onchange="BA.App.reglerRs('intervalleMin', this.value)"> minutes</label>
        <p class="note" id="rs-prochaine"></p>
        <p class="note">
          À activer seulement après une lecture réussie sur place. Une lecture complète dure environ 6 à 7 secondes à 9600 bauds
          (≈ 4 300 caractères) : lire toutes les 6 secondes est impossible. Entre deux lectures, Broodautomate écoute en permanence
          ce que la machine envoie d'elle-même (télémétrie, commande 90 = 1).
        </p>
      </div>

      <h3>Derniers relevés reçus</h3>
      <div id="rs-rapports">${htmlRapportsRs()}</div>

      <h3 style="margin-top:16px">Dernières données reçues</h3>
      <div id="serial-detect">${htmlMachineDetectee()}</div>

      <h3 style="margin-top:16px">Journal de la liaison</h3>
      <pre id="rs-journal" class="journal">${htmlJournalRs()}</pre>

      <details style="margin-top:10px">
        <summary>Flux brut (hexadécimal) — octets reçus : <span id="serial-count">${_rsOctets}</span></summary>
        <pre id="serial-brut">${esc(_rsBrut.join("\n")) || "— Rien reçu pour l'instant —"}</pre>
      </details>

      <p class="note" style="margin-top:10px">
        🔒 Sécurité : ce PC n'envoie à la machine que START, STACK, ACK, NACK, « Who Are You » (codes de sécurité 0000),
        « Read Data » (liste 1 ou 2), FINISH, et les réponses 88 E0 / 88 E3. Aucune commande d'écriture ni d'effacement :
        toute autre trame est bloquée avant l'envoi.
      </p>

      <h2 style="margin-top:28px">✍️ Ajouter une machine manuellement</h2>
      <p class="note" style="margin-bottom:12px">Sans câble : pour une machine que tu n'as pas devant toi.</p>
      <div class="card">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:12px">
          <div><div class="label">N° de plaque</div><input id="man-id" placeholder="ex : 202166085"></div>
          <div><div class="label">Nom de la machine</div><input id="man-name" placeholder="ex : Boulangerie Dupont"></div>
          <div><div class="label">Ville ou lieu</div><input id="man-city" placeholder="ex : Bruxelles"></div>
        </div>
        <button class="btn" onclick="BA.App.ajouterMachine('man')">➕ Ajouter à la flotte</button>
      </div>

      <h2 style="margin-top:28px">🧪 Test EVA-DTS (analyser une trame)</h2>
      <p class="note" style="margin-bottom:12px">
        Génère une trame depuis le simulateur, ou colle une trame reçue d'une vraie machine, puis analyse-la (rien n'est enregistré).
      </p>
      <button class="btn" onclick="BA.App.genEva()">📄 Générer une trame (simulateur)</button>
      <button class="btn secondary" onclick="BA.App.parseEva()">🔍 Analyser la trame</button>

      <h3>Trame brute</h3>
      <textarea id="eva-raw" rows="8" class="zone-texte"
        placeholder="— Clique sur Générer, ou colle une trame ici —">${esc(_lastEvaDts || "")}</textarea>

      <h3>Résultat de l'analyse</h3>
      <pre id="eva-parsed">— Clique sur Analyser après avoir généré ou collé une trame —</pre>
    `;
    majProchaine();
  }

  // ============================================================
  // TRAITEMENT D'UN RELEVÉ (câble ou clé USB)
  // ============================================================
  const niveauEvenement = (d, e) => d.gravite === "p" ? (e.active === false ? "warn" : "error") : d.gravite === "s" ? "warn" : "info";

  function messageEvenement(d, e) {
    const quand = BA.EvaDts.formatDate(e.date, e.time);
    return d.titre + " (" + d.expl + ")" +
      (quand ? " — horloge machine : " + quand : "") +
      (e.active === true ? " — encore active" : e.active === false ? " — terminée" : "") +
      ((e.nouveaux || e.count) > 1 ? " — " + (e.nouveaux || e.count) + " fois" : "");
  }

  function messageFas(d, e) {
    const quand = BA.EvaDts.formatDate(e.date, e.time);
    return d.titre + " (" + d.expl + ")" + (quand ? " — horloge machine : " + quand : "") +
      (d.solution.length ? " — À faire : " + d.solution.join(" ") : "");
  }

  // options : { source: "usb" | "rs232", interactif: bool }
  async function traiterRapport(machineId, analyse, options) {
    const o = options || {};
    const source = o.source || "rs232";
    const interactif = !!o.interactif;
    const parCable = source !== "usb";
    const maintenant = new Date().toISOString();
    const nom = nomMachine(machineId);
    const statutActuel = statutMachine(machineId);
    const statutApres = panne => panne ? "error" : (statutActuel === "error" ? "error" : "online");

    // ----- Envoi de la machine sans compteurs : événements seulement -----
    if (analyse.type !== "audit") {
      const vus = _vus[machineId] = _vus[machineId] || new Set();
      let nouveaux = 0, panne = false;
      for (const e of analyse.events) {
        const cle = "eva|" + e.code + "|" + e.date + "|" + e.time + "|" + e.active + "|" + e.count;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const d = BA.Alertes.decrire(e.code);
        await ajouterEvenement(machineId, niveauEvenement(d, e), e.code, messageEvenement(d, e));
        nouveaux++;
        if (d.gravite === "p" && e.active !== false) panne = true;
      }
      for (const e of analyse.fasErrors) {
        const cle = "fas|" + e.code + "/" + e.sous + "|" + e.date + "|" + e.time;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const d = BA.Alertes.fas(e.code, e.sous);
        await ajouterEvenement(machineId, "error", "FAS_" + e.code + (e.sous ? "/" + e.sous : ""), messageFas(d, e));
        nouveaux++;
        panne = true;
      }
      if (parCable) await majMachine(machineId, { last_seen: maintenant, status: statutApres(panne) });
      else if (panne) await majMachine(machineId, { status: "error" });
      return { message: analyse.type === "vide" ? "envoi sans données" : (nouveaux ? nouveaux + " événement(s) enregistré(s)" : "événement(s) déjà connu(s)"),
               evenements: nouveaux };
    }

    // ----- Relevé complet (compteurs) -----
    const audit  = BA.EvaDts.toAudit(analyse);
    const ancien = await lireDernierAudit(machineId);
    const diff   = BA.EvaDts.compare(ancien, audit);
    const nv     = BA.EvaDts.nouveautes(ancien ? ancien.errors : null, audit.errors);
    const nouveauxEvts = diff.baseline ? 0 : nv.eva.length + nv.fas.length + nv.pow.length + nv.activations.length;
    const appliquer = !diff.baseline && !diff.anomalies && !diff.identique;

    if (interactif) {
      if (diff.identique && !nouveauxEvts) {
        alert("Ce relevé est identique au dernier relevé de « " + nom + " » : aucune nouvelle vente.");
        return { message: "identique", annule: true };
      }
      if (!diff.identique) {
        let msg = "Importer ce relevé pour « " + nom + " » (" + machineId + ") ?\n\n" +
                  "Compteurs de la machine : " + audit.total_count + " vente(s), " + eur(audit.total_value) + ".\n";
        if (diff.baseline) msg += "\nC'est le premier relevé de cette machine : il sert de point de départ, aucune vente n'est ajoutée.";
        else if (diff.anomalies) msg += "\n⚠️ Les compteurs sont plus BAS que lors du relevé précédent (" + ancien.total_count + " → " + audit.total_count + ").\n" +
                                        "• Fichier plus ancien que le dernier relevé → clique sur ANNULER (sinon des ventes seraient comptées deux fois).\n" +
                                        "• Compteurs de la machine vraiment remis à zéro → OK : ce relevé devient le nouveau point de départ (aucune vente calculée, stock inchangé).";
        else msg += "\nDepuis le relevé précédent : +" + diff.deltaCount + " vente(s), +" + eur(diff.deltaValue) + ".\n" +
                    "Ces ventes seront ajoutées et le stock des produits concernés sera diminué.";
        if (!confirm(msg)) return { message: "annulé", annule: true };
      }
    }

    // Rien de neuf : pas de nouvel enregistrement (lecture automatique toutes les N minutes)
    if (diff.identique && !nouveauxEvts) {
      if (parCable) await majMachine(machineId, { last_seen: maintenant, status: statutApres(false) });
      return { message: "aucun changement depuis le relevé précédent", identique: true };
    }

    audit.source      = parCable ? "rs232" : "usb";
    audit.delta_count = appliquer ? diff.deltaCount : null;
    audit.delta_value = appliquer ? diff.deltaValue : null;
    await sauverAudit(machineId, audit);

    let nbVentes = 0, majStock = 0;
    if (appliquer) {
      const ventes = await construireVentes(machineId, diff);
      await ajouterVentes(machineId, ventes);
      nbVentes = ventes.length;
      majStock = await appliquerVentesAuStock(machineId, diff.parSelection);
    }

    const origine = parCable ? "câble" : "clé USB";
    if (diff.baseline) {
      await ajouterEvenement(machineId, "info", "AUDIT_DEPART",
        "Premier relevé (" + origine + ") : point de départ, " + audit.total_count + " ventes au compteur de la machine. " +
        "Historique de la machine : " + analyse.events.length + " événement(s), " + analyse.fasErrors.length + " erreur(s) FAS, " +
        analyse.powerCuts.length + " coupure(s) (voir « Erreurs machine »).");
    } else if (diff.anomalies) {
      await ajouterEvenement(machineId, "warn", "COMPTEURS_EN_BAISSE",
        "Relevé (" + origine + ") : compteurs plus bas qu'au relevé précédent (" + ancien.total_count + " → " + audit.total_count +
        "). Nouveau point de départ, stock non modifié.");
    } else if (appliquer) {
      await ajouterEvenement(machineId, "info", "VENTES",
        "Relevé (" + origine + ") : +" + diff.deltaCount + " vente(s), +" + eur(diff.deltaValue) +
        (diff.ecartSelections ? " (dont " + diff.ecartSelections + " sans sélection identifiée)" : "") + ".");
    }

    let panne = false;
    if (!diff.baseline) {
      for (const e of nv.eva.concat(nv.activations)) {
        const d = BA.Alertes.decrire(e.code);
        await ajouterEvenement(machineId, niveauEvenement(d, e), e.code, messageEvenement(d, e));
        if (d.gravite === "p" && e.active !== false) panne = true;
      }
      for (const e of nv.fas) {
        const d = BA.Alertes.fas(e.code, e.sous);
        await ajouterEvenement(machineId, "error", "FAS_" + e.code + (e.sous ? "/" + e.sous : ""), messageFas(d, e));
        panne = true;
      }
      for (const p of nv.pow) {
        const [d1, h1] = String(p.off || "").split(" ");
        const [d2, h2] = String(p.on || "").split(" ");
        await ajouterEvenement(machineId, "warn", "COUPURE",
          "Coupure de courant : de " + (BA.EvaDts.formatDate(d1, h1) || "?") + " à " + (BA.EvaDts.formatDate(d2, h2) || "?") + " (horloge machine).");
      }
    }
    if (parCable) await majMachine(machineId, { last_seen: maintenant, status: statutApres(panne) });
    else if (panne) await majMachine(machineId, { status: "error" });

    let message;
    if (diff.baseline) message = "premier relevé enregistré (point de départ)";
    else if (diff.anomalies) message = "compteurs en baisse : nouveau point de départ, stock inchangé";
    else if (appliquer) message = "+" + diff.deltaCount + " vente(s) (+" + eur(diff.deltaValue) + "), stock mis à jour pour " + majStock + " produit(s)";
    else message = "aucune nouvelle vente";
    if (nouveauxEvts) message += " ; " + nouveauxEvts + " nouvel(s) événement(s)";

    if (interactif) {
      alert(diff.baseline
        ? "✅ Relevé enregistré comme point de départ. Les prochains relevés calculeront les ventes."
        : "✅ Relevé enregistré : " + message + ".");
    }
    return { message, ventes: nbVentes, baseline: diff.baseline, anomalie: diff.anomalies };
  }

  // Un relevé complet vient d'arriver par le câble
  async function recevoirRapportCable(r) {
    const analyse = BA.EvaDts.parse(r.texte);
    _derniereAnalyse = analyse;
    _lastEvaDts = r.texte;
    const resume = { recuA: new Date().toISOString(), role: r.role, liste: r.liste, type: analyse.type, g85: analyse.g85, info: "" };
    _rsRapports.unshift(resume);
    if (_rsRapports.length > 10) _rsRapports.length = 10;
    const zone = $("#eva-raw");
    if (zone && document.activeElement !== zone) zone.value = r.texte;

    const id = machineCable();
    if (!id) {
      _rapportEnAttente = { analyse, texte: r.texte, recuA: resume.recuA };
      resume.info = "en attente : choisis la machine";
      journalRs("Relevé reçu, mais aucune machine n'est choisie pour ce câble : il est gardé en attente (étape 1).", "warn");
      majSerialDynamique();
      return;
    }
    if (analyse.g85.present && !analyse.g85.ok) {
      resume.info = "rejeté : contrôle G85 faux";
      journalRs("✖ Relevé rejeté : contrôle G85 faux (texte abîmé). Rien n'est enregistré.", "err");
      await ajouterEvenement(id, "warn", "RELEVE_ABIME", "Relevé reçu par le câble rejeté : contrôle d'intégrité G85 faux.");
      majSerialDynamique();
      await loadAll();
      return;
    }
    const res = await traiterRapport(id, analyse, { source: "rs232", interactif: false });
    resume.info = res.message;
    _rsDernierEchec = false;
    journalRs("✔ « " + nomMachine(id) + " » : " + res.message + ".", "ok");
    majSerialDynamique();
    await loadAll();
  }

  function rappelsSerie() {
    return {
      journal: (t, n) => journalRs(t, n),
      brut:    (sens, o) => brutRs(sens, o),
      rapport: r => { recevoirRapportCable(r).catch(err => journalRs("Erreur d'enregistrement du relevé : " + err.message, "err")); },
      etat:    t => { _rsEtat = t; const el = $("#rs-etat"); if (el) el.textContent = (BA.Serial.connected ? "🟢 " : "⚪ ") + t; },
      statut:  s => majStatutRs(s)
    };
  }

  function planifierLecture() {
    _rsProchaine = (_rs.lectureAuto && BA.Serial.connected)
      ? Date.now() + Math.max(2, Number(_rs.intervalleMin) || 15) * 60000 : null;
    majProchaine();
  }

  async function lancerLecture(origine) {
    if (!BA.Serial.connected) {
      if (origine === "bouton") alert("Connecte d'abord le câble (bouton « Connecter »).");
      return;
    }
    if (BA.Serial.occupe()) {
      journalRs("Une session est déjà en cours : nouvelle lecture ignorée.", "warn");
      return;
    }
    if (origine === "auto" && !machineCable()) return;
    journalRs("Lecture " + (origine === "auto" ? "automatique" : "demandée") + " : liste " + _rs.liste + ".", "info");
    const r = await BA.Serial.lire(_rs.liste);
    if (r.ok) { _rsDernierEchec = false; return; }
    journalRs("Lecture impossible : " + r.erreur, "err");
    const id = machineCable();
    if (id && !_rsDernierEchec && !r.cede && BA.Serial.connected) {
      _rsDernierEchec = true;
      await ajouterEvenement(id, "warn", "RS232_ECHEC", "Lecture par câble impossible : " + r.erreur);
      if (/ne répond pas/.test(r.erreur) && statutMachine(id) !== "error") await majMachine(id, { status: "offline" });
      await loadAll();
    }
  }

  // Lecture automatique : vérifiée toutes les 20 s (les minuteries des onglets cachés sont ralenties)
  setInterval(() => {
    if (_rsProchaine && Date.now() >= _rsProchaine) {
      planifierLecture();
      lancerLecture("auto");
    }
  }, 20000);

  // ============================================================
  // HELPERS
  // ============================================================
  function tableVentes(liste) {
    if (!liste || !liste.length) {
      return `
        <table>
          <tr><th>Date</th><th>Sél.</th><th>Produit</th><th>Prix</th></tr>
          <tr><td colspan="4">Aucune vente pour l'instant</td></tr>
        </table>`;
    }
    return `
      <table>
        <tr><th>Date</th><th>Sél.</th><th>Produit</th><th>Prix</th></tr>
        ${liste.map(s => `
          <tr>
            <td>${heure(s.created_at || s.ts)}</td>
            <td>${esc(s.selection)}</td>
            <td>${esc(s.name)}</td>
            <td>${eur(s.price)}</td>
          </tr>
        `).join("")}
      </table>`;
  }

  function renderActiveView(view) {
    switch (view) {
      case "fleet":     renderFleet();     break;
      case "dashboard": renderDashboard(); break;
      case "products":  renderProducts();  break;
      case "sales":     renderSales();     break;
      case "alerts":    renderAlerts();    break;
      case "serial":    renderSerial();    break;
    }
  }

  // Un champ de la vue est en cours de saisie ?
  function saisieEnCours(vue) {
    const el = document.activeElement;
    if (!el || ["INPUT", "TEXTAREA", "SELECT"].indexOf(el.tagName) < 0) return false;
    const section = $("#view-" + vue);
    return !!(section && section.contains(el));
  }

  function render() {
    const activeBtn  = document.querySelector("nav button.active");
    const activeView = activeBtn ? activeBtn.dataset.view : "fleet";

    // On ne redessine pas une vue pendant une saisie (sinon ce que tu tapes serait effacé
    // à chaque mise à jour du simulateur ou de Supabase) ; l'onglet RS232 se met à jour par morceaux
    const bloque =
      activeView === "serial" ||
      (activeView === "products" && _formProduitOuvert) ||
      (activeView === "fleet" && _renommage) ||
      saisieEnCours(activeView);
    if (!bloque) renderActiveView(activeView);
    if (activeView === "serial") majSerialDynamique();

    // Simulateur dans le footer
    const running = BA.Simulator.running;
    $("#sim-status").className   = "badge " + (running ? "on" : "off");
    $("#sim-status").textContent = "Simulateur : " + (running ? "ON" : "OFF");
    $("#btn-sim-toggle").textContent = running ? "⏸ Arrêter simulateur" : "▶ Démarrer simulateur";

    $("#version").textContent =
      `${BA_CONFIG.app.name} v${BA_CONFIG.app.version}` +
      (BA.DB.isReady() ? " — ☁️ Supabase" : " — 💾 Mode local");
  }

  // ============================================================
  // ACTIONS PUBLIQUES
  // ============================================================

  window.BA = window.BA || {};
  BA.App = {

    // ---------- Gestion de la flotte ----------
    // pref = "det" (machine détectée par le câble) ou "man" (saisie manuelle)
    ajouterMachine: async (pref) => {
      const champ = k => { const el = $("#" + pref + "-" + k); return el ? el.value : ""; };

      const serie = propre(champ("id")).replace(/\s+/g, "").replace(/^FAS-/i, "");
      const nom   = propre(champ("name")).slice(0, 60);
      const ville = propre(champ("city")).slice(0, 60);

      if (!serie || !/^[A-Za-z0-9-]+$/.test(serie)) {
        alert("Entre le n° de plaque de la machine (lettres, chiffres et tirets seulement).");
        return;
      }
      if (/^FAS0*1$/i.test(serie)) {
        alert("« " + serie + " » est le n° générique envoyé par toutes les machines : entre le n° de la PLAQUE.");
        return;
      }

      const id = "FAS-" + serie;
      if (_listeMachines.some(m => m.id.toUpperCase() === id.toUpperCase())) {
        alert("Cette machine existe déjà dans ta flotte (" + id + ").");
        return;
      }

      const machine = { id, name: nom || ("Machine " + serie), city: ville || "À définir", serial: serie };

      if (BA.DB.isReady()) {
        try {
          await BA.DB.addMachine(machine);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        _listeMachines.push({ id: machine.id, name: machine.name, city: machine.city, serial: machine.serial, status: "unknown", last_seen: null });
        sauverMachines();
      }

      if (!_machineSelectionnee) _machineSelectionnee = id;

      // Machine ajoutée depuis un relevé reçu par le câble : elle devient la machine du câble
      const depuisCable = pref === "det" && _rapportEnAttente;
      if (pref === "det" && !machineCable()) { _rs.machineId = id; sauverRs(); }
      await loadAll();

      ["id", "name", "city"].forEach(k => {
        const el = $("#" + pref + "-" + k);
        if (el) el.value = "";
      });
      if (depuisCable) {
        _rs.machineId = id; sauverRs();
        await BA.App.rattacherRapport(id);
      } else {
        alert("✅ Machine ajoutée à la flotte (" + id + ").");
      }
      majSerialDynamique();
    },

    supprimerMachine: async (id) => {
      const m = _listeMachines.find(x => x.id === id);
      if (!m) return;

      const detail = BA.DB.isReady() ? "Ses produits, ses ventes et son journal seront aussi effacés.\n\n" : "";
      if (!confirm("Supprimer « " + m.name + " » (" + id + ") de la flotte ?\n\n" + detail + "Cette action est définitive.")) return;

      if (BA.DB.isReady()) {
        try {
          await BA.DB.deleteMachine(id);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        _listeMachines = _listeMachines.filter(x => x.id !== id);
        sauverMachines();
        if (!estSimulee(id)) {
          delete _stockLocal[id];      sauverStock();
          delete _ventesLocales[id];   sauverVentes();
          delete _evenementsLocaux[id]; sauverEvenements();
        }
        delete _auditsLocal[id];
        sauverAudits();
      }
      if (_rs.machineId === id) { _rs.machineId = null; sauverRs(); }
      if (_renommage === id) _renommage = null;

      if (_machineSelectionnee === id) {
        const autre = _listeMachines.find(x => x.id !== id);
        _machineSelectionnee = autre ? autre.id : null;
      }
      await loadAll();
    },

    // ---------- Renommer une machine (à tout moment) ----------
    renommer: (id) => {
      if (!_listeMachines.some(m => m.id === id)) return;
      _renommage = id;
      const btn = document.querySelector("nav button[data-view='fleet']");
      if (btn && !btn.classList.contains("active")) btn.click();
      else renderFleet();
      // Curseur placé tout de suite (pas plus tard : on ne doit pas sélectionner ce qui est déjà tapé)
      const el = $("#ren-nom");
      if (el) { el.focus(); el.select(); }
    },

    annulerRenommage: () => {
      _renommage = null;
      renderFleet();
    },

    toucheRenommage: (ev, id) => {
      if (ev.key === "Enter") { ev.preventDefault(); BA.App.enregistrerNom(id); }
      else if (ev.key === "Escape") { ev.preventDefault(); BA.App.annulerRenommage(); }
    },

    enregistrerNom: async (id) => {
      const champNom = $("#ren-nom"), champVille = $("#ren-ville");
      const nom   = propre(champNom ? champNom.value : "").slice(0, 60);
      const ville = propre(champVille ? champVille.value : "").slice(0, 60) || "À définir";
      if (!nom) {
        alert("Le nom de la machine ne peut pas être vide.");
        if (champNom) champNom.focus();
        return;
      }
      if (BA.DB.isReady()) {
        try {
          await BA.DB.updateMachine(id, { name: nom, city: ville });
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        const m = _listeMachines.find(x => x.id === id);
        if (!m) { _renommage = null; renderFleet(); return; }
        m.name = nom;
        m.city = ville;
        sauverMachines();
      }
      _renommage = null;
      // (Entrée dans le champ : le curseur y est encore, on le retire pour que la flotte se redessine)
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      await loadAll();
      const vue = document.querySelector("nav button.active");
      if (vue && vue.dataset.view === "fleet") renderFleet();
      majSerialDynamique();
    },

    // Repasse une machine en « En ligne » quand le problème est réglé
    marquerTraite: async (id) => {
      try {
        await majMachine(id, { status: "online" });
        await ajouterEvenement(id, "info", "TRAITE", "Problème marqué comme traité.");
      } catch (err) {
        alert("Erreur : " + err.message);
      }
      await loadAll();
    },

    // Aller à un onglet (comme un clic sur le bouton du menu)
    allerVue,

    // ---------- Catalogue des alertes ----------
    chercherAlerte: (texte) => {
      _rechercheAlerte = String(texte || "");
      const zone = $("#catalogue-resultats");
      if (zone) zone.innerHTML = htmlCatalogue(_rechercheAlerte);
    },

    // ---------- Outils EVA-DTS ----------
    genEva: () => {
      const texte = BA.Simulator.generateEvaDts(
        BA.Simulator._localMachine,
        BA.Simulator._localProducts,
        BA.Simulator._localSales,
        BA.Simulator._localEvents
      );
      _lastEvaDts = texte;
      const el = $("#eva-raw");
      if (el) el.value = texte;
    },

    parseEva: () => {
      const el     = $("#eva-raw");
      const sortie = $("#eva-parsed");
      const texte  = el ? el.value.trim() : "";

      if (!texte) {
        if (sortie) sortie.textContent = "— Génère ou colle une trame d'abord —";
        return;
      }
      _lastEvaDts = texte;
      const resultat = BA.EvaDts.parse(texte);
      delete resultat.raw;
      if (sortie) sortie.textContent = JSON.stringify(resultat, null, 2);
    },

    // ---------- Sélection d'une machine ----------
    selectMachine: async (machineId) => {
      _machineSelectionnee = machineId;
      _formProduitOuvert = false;
      _renommage = null;
      await loadAll();

      // Naviguer vers le tableau de bord de la machine sélectionnée
      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.querySelector("[data-view='dashboard']").classList.add("active");
      $("#view-dashboard").classList.add("active");
      renderDashboard();
    },

    editProduct: async (id, champ, valeur) => {
      if (champ === "name") {
        valeur = propre(valeur);
      } else {
        valeur = Number(valeur);
        if (!isFinite(valeur) || valeur < 0) {
          alert("Entre un nombre positif.");
          render();
          return;
        }
      }

      if (BA.DB.isReady()) {
        try {
          await BA.DB.updateProduct(id, { [champ]: valeur });
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
        await loadAll();
        return;
      }

      const liste = produitsDe(_machineSelectionnee);
      const p = liste.find(x => String(x.id) === String(id));
      if (!p) return;

      if (champ === "selection" && liste.some(x => x !== p && Number(x.selection) === valeur)) {
        alert("Ce numéro de sélection existe déjà sur cette machine.");
        render();
        return;
      }

      p[champ] = valeur;
      sauverStock();
      renderActiveView(document.querySelector("nav button.active").dataset.view);
    },

    refill: async (id, capacite) => {
      if (BA.DB.isReady()) {
        try {
          await BA.DB.updateProduct(id, { qty: capacite });
          await BA.DB.addEvent(_machineSelectionnee, "info", "REFILL", "Produit rechargé");
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
        await loadAll();
      } else {
        const p = produitsDe(_machineSelectionnee).find(x => String(x.id) === String(id));
        if (p) { p.qty = capacite; sauverStock(); await loadAll(); }
      }
    },

    // ---------- Relevés d'audit ----------
    // Fichier d'audit de la clé USB pour la machine sélectionnée
    importerAudit: async (input) => {
      const fichier = input.files && input.files[0];
      input.value = "";
      if (!fichier) return;

      if (!_machineSelectionnee) {
        alert("Choisis d'abord une machine (onglet Ma Flotte).");
        return;
      }

      let texte = "";
      try {
        // Lecture octet par octet (Latin-1) : indispensable pour vérifier le G85
        const octets = new Uint8Array(await fichier.arrayBuffer());
        for (let i = 0; i < octets.length; i += 8192) {
          texte += String.fromCharCode.apply(null, octets.subarray(i, i + 8192));
        }
      } catch (err) {
        alert("Impossible de lire le fichier : " + err.message);
        return;
      }

      if (!/^\s*DXS\*/.test(texte) || !/DXE\*/.test(texte)) {
        alert("Ce fichier ne ressemble pas à un audit EVA-DTS (il doit commencer par DXS et finir par DXE).");
        return;
      }

      const analyse = BA.EvaDts.parse(texte);
      if (!analyse.va1) {
        alert("Fichier d'audit incomplet : les compteurs de ventes (VA1) sont introuvables.");
        return;
      }
      if (analyse.g85.present && !analyse.g85.ok &&
          !confirm("⚠️ Le contrôle d'intégrité du fichier (G85) ne correspond pas : le fichier a peut-être été abîmé ou modifié.\n\nImporter quand même ?")) {
        return;
      }

      try {
        await traiterRapport(_machineSelectionnee, analyse, { source: "usb", interactif: true });
      } catch (err) {
        console.error("Erreur d'import d'audit :", err);
        const aide = /audits/i.test(err.message || "")
          ? "\n\nLa table « audits » n'existe sans doute pas encore dans Supabase : lance d'abord le SQL fourni (SQL Editor)."
          : "";
        alert("Erreur : " + err.message + aide);
      }
      await loadAll();
    },

    // Compatibilité v3.0
    traiterAudit: async (machineId, analyse, source) =>
      traiterRapport(machineId, analyse, { source: source || "usb", interactif: source === "usb" }),

    // ---------- Gestion des produits d'une machine ----------
    ouvrirFormProduit: () => {
      _formProduitOuvert = true;
      renderProducts();
      const el = $("#np-sel");
      if (el) el.focus();
    },

    fermerFormProduit: () => {
      _formProduitOuvert = false;
      renderProducts();
    },

    ajouterProduit: async () => {
      const sel  = Number($("#np-sel").value);
      const nom  = propre($("#np-name").value);
      const prixTexte = $("#np-price").value;
      const prix = Number(prixTexte);
      const qty  = Number($("#np-qty").value || 0);
      const cap  = Number($("#np-cap").value);

      if (!Number.isInteger(sel) || sel <= 0) { alert("Entre un numéro de sélection (nombre entier, ex : 11)."); return; }
      if (!nom) { alert("Entre le nom du produit."); return; }
      if (prixTexte === "" || !isFinite(prix) || prix < 0) { alert("Entre un prix valide (ex : 2.50)."); return; }
      if (!Number.isInteger(cap) || cap <= 0) { alert("Entre la capacité max (nombre entier, ex : 10)."); return; }
      if (!Number.isInteger(qty) || qty < 0 || qty > cap) { alert("Le stock doit être un nombre entre 0 et la capacité max."); return; }

      const produit = { id: nouvelId(), selection: sel, name: nom, price: prix, qty, capacity: cap, machine_id: _machineSelectionnee };

      if (BA.DB.isReady()) {
        if (_products.some(x => Number(x.selection) === sel)) { alert("Ce numéro de sélection existe déjà sur cette machine."); return; }
        try {
          await BA.DB.addProduct(_machineSelectionnee, produit);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        const liste = produitsDe(_machineSelectionnee);
        if (liste.some(x => Number(x.selection) === sel)) { alert("Ce numéro de sélection existe déjà sur cette machine."); return; }
        liste.push(produit);
        liste.sort((a, b) => a.selection - b.selection);
        sauverStock();
      }

      _formProduitOuvert = false;
      await loadAll();
    },

    supprimerProduit: async (id) => {
      const liste = produitsDe(_machineSelectionnee);
      const p = BA.DB.isReady() ? _products.find(x => String(x.id) === String(id)) : liste.find(x => String(x.id) === String(id));
      if (!p) return;

      if (!confirm("Supprimer le produit « " + (p.name || ("sél. " + p.selection)) + " » ?")) return;

      if (BA.DB.isReady()) {
        try {
          await BA.DB.deleteProduct(p.id);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
      } else {
        definirProduits(_machineSelectionnee, liste.filter(x => x !== p));
      }
      await loadAll();
    },

    copierProduits: async () => {
      const source = $("#copy-source") ? $("#copy-source").value : null;
      if (!source) return;

      if (BA.DB.isReady()) {
        try {
          const dejaLa  = new Set(_products.map(x => Number(x.selection)));
          const sources = (await BA.DB.getProducts(source)).filter(sp => !dejaLa.has(Number(sp.selection)));
          if (!sources.length) {
            alert("Rien à copier : cette machine n'a pas de produit, ou tous les numéros de sélection existent déjà ici.");
            return;
          }
          for (const sp of sources) {
            await BA.DB.addProduct(_machineSelectionnee, { selection: sp.selection, name: sp.name, price: sp.price, qty: 0, capacity: sp.capacity });
          }
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
        await loadAll();
        return;
      }

      const liste = produitsDe(_machineSelectionnee);
      const aCopier = produitsDe(source).filter(sp => !liste.some(x => Number(x.selection) === Number(sp.selection)));
      if (!aCopier.length) {
        alert("Rien à copier : tous les numéros de sélection existent déjà sur cette machine.");
        return;
      }
      aCopier.forEach(sp => liste.push({
        id: nouvelId(), selection: sp.selection, name: sp.name, price: sp.price, qty: 0, capacity: sp.capacity, machine_id: _machineSelectionnee
      }));
      liste.sort((a, b) => a.selection - b.selection);
      sauverStock();
      await loadAll();
    },

    // ---------- Câble RS232 ----------
    choisirMachineCable: (id) => {
      _rs.machineId = id || null;
      sauverRs();
      if (id) journalRs("Machine du câble : « " + nomMachine(id) + " » (plaque " + plaque(infoMachine(id)) + ").", "info");
      if (id && estSimulee(id) && !BA.DB.isReady()) {
        journalRs("⚠ C'est la machine du simulateur : en mode local, ses ventes et son stock ne sont pas gardés après un rechargement de la page.", "warn");
      }
      render();
    },

    reglerRs: (champ, valeur) => {
      if (champ === "vitesse") {
        _rs.vitesse = Number(valeur) || 9600;
        if (BA.Serial.connected) journalRs("Nouvelle vitesse : elle s'appliquera à la prochaine connexion (Déconnecter puis Connecter).", "warn");
      } else if (champ === "liste") {
        if (Number(valeur) === 1 && _rs.liste !== 1 && !confirm(
          "Liste 1 = audit standard.\n\n" +
          "D'après la norme, après cette lecture la machine prépare la remise à zéro de ses compteurs « intermédiaires ». " +
          "Sur la FAS, cela ne se fait que si « Erase interim data » = 1 (à laisser à 0).\n" +
          "Broodautomate calcule les ventes sur les compteurs CUMULÉS, qui ne sont jamais remis à zéro.\n\n" +
          "À utiliser seulement si la machine refuse la liste 2. Continuer ?")) {
          renderSerial();
          return;
        }
        _rs.liste = Number(valeur) === 1 ? 1 : 2;
      } else if (champ === "lectureAuto") {
        _rs.lectureAuto = !!valeur;
        planifierLecture();
      } else if (champ === "intervalleMin") {
        _rs.intervalleMin = Math.min(1440, Math.max(2, Math.round(Number(valeur) || 15)));
        planifierLecture();
      } else if (champ === "reconnexionAuto") {
        _rs.reconnexionAuto = !!valeur;
      }
      sauverRs();
      majProchaine();
    },

    serialConnect: async (portExistant) => {
      if (!BA.Serial.supported()) {
        alert("Web Serial non disponible — utilise Google Chrome ou Microsoft Edge sur un ordinateur.");
        return;
      }
      try {
        await BA.Serial.connect({
          baudRate: _rs.vitesse,
          signaux: !(BA_CONFIG.rs232 && BA_CONFIG.rs232.signaux === false),
          ddcmp: { identifiantPc: (BA_CONFIG.rs232 && BA_CONFIG.rs232.identifiantPc) || "00000001" }
        }, rappelsSerie(), portExistant && portExistant.open ? portExistant : undefined);
        journalRs("Port ouvert à " + _rs.vitesse + " bauds (8N1). Écoute de la machine.", "ok");
        if (!machineCable()) journalRs("⚠ Choisis la machine branchée sur ce câble (étape 1) : sinon les relevés reçus ne sont pas enregistrés.", "warn");
        planifierLecture();
        majSerialDynamique();
        render();
      } catch (err) {
        if (err && err.name === "NotFoundError") journalRs("Aucun port choisi.", "warn");
        else journalRs("Connexion impossible : " + (err && err.message || err), "err");
        majStatutRs("erreur : " + (err && err.message || err));
      }
    },

    serialLire: () => lancerLecture("bouton"),

    // Compatibilité v3.0 (« Relancer la demande »)
    serialRelancer: () => lancerLecture("bouton"),

    serialDisconnect: async () => {
      await BA.Serial.disconnect();
      journalRs("Port fermé.", "info");
      majSerialDynamique();
      render();
    },

    // Rattache le relevé en attente (reçu sans machine choisie) à une machine
    rattacherRapport: async (idImpose) => {
      const sel = $("#det-rattacher");
      const id = idImpose || (sel ? sel.value : null);
      if (!id || !_rapportEnAttente) return;
      const enAttente = _rapportEnAttente;
      _rapportEnAttente = null;
      if (!machineCable()) { _rs.machineId = id; sauverRs(); }
      if (enAttente.analyse.g85.present && !enAttente.analyse.g85.ok) {
        journalRs("✖ Relevé en attente rejeté : contrôle G85 faux.", "err");
        majSerialDynamique();
        return;
      }
      try {
        const res = await traiterRapport(id, enAttente.analyse, { source: "rs232", interactif: false });
        journalRs("✔ Relevé en attente rattaché à « " + nomMachine(id) + " » : " + res.message + ".", "ok");
        if (_rsRapports[0] && _rsRapports[0].recuA === enAttente.recuA) _rsRapports[0].info = res.message;
      } catch (err) {
        journalRs("Erreur d'enregistrement : " + err.message, "err");
      }
      majSerialDynamique();
      await loadAll();
    },

    // ---------- Connexion à Supabase ----------
    seConnecter: async () => {
      const emailEl = $("#login-email");
      const mdpEl   = $("#login-pass");
      const email   = emailEl ? emailEl.value.trim() : "";
      const mdp     = mdpEl ? mdpEl.value : "";

      if (!email || !mdp) {
        afficherConnexion("Entre ton e-mail et ton mot de passe.", email);
        return;
      }

      try {
        await BA.DB.signIn(email, mdp);
      } catch (err) {
        const texte = /invalid login/i.test(err.message)
          ? "E-mail ou mot de passe incorrect."
          : "Connexion impossible : " + err.message;
        afficherConnexion(texte, email);
        return;
      }

      const ecran = document.getElementById("ecran-connexion");
      if (ecran) ecran.remove();
      await demarrerApp();
    },

    seDeconnecter: async () => {
      try { await BA.DB.signOut(); } catch (e) { /* on recharge quand même */ }
      location.reload();
    }
  };

  // ---------- Boutons footer ----------
  $("#btn-sim-toggle").onclick = async () => {
    if (BA.Simulator.running) await BA.Simulator.stop();
    else await BA.Simulator.start(() => loadAll());
    render();
  };

  $("#btn-reset").onclick = async () => {
    if (!confirm("Effacer toutes les ventes et événements de la machine simulée ?")) return;
    if (BA.DB.isReady()) {
      await BA.DB.resetData(_machineSelectionnee);
    } else {
      BA.Simulator._localSales  = [];
      BA.Simulator._localEvents = [];
      BA.Simulator._localMachine.status    = "unknown";
      BA.Simulator._localMachine.temp_c    = null;
      BA.Simulator._localMachine.last_seen = null;
    }
    await loadAll();
  };

  // ============================================================
  // DÉMARRAGE (connexion en mode réel)
  // ============================================================
  function afficherConnexion(message, email) {
    let ecran = document.getElementById("ecran-connexion");
    if (!ecran) {
      ecran = document.createElement("div");
      ecran.id = "ecran-connexion";
      ecran.style.cssText =
        "position:fixed; inset:0; background:#0f172a; z-index:1000; " +
        "display:flex; align-items:center; justify-content:center; padding:16px";
      document.body.appendChild(ecran);
    }

    ecran.innerHTML = `
      <div class="card" style="width:100%; max-width:380px">
        <h2 style="margin-bottom:6px">🥖 Broodautomate</h2>
        <p class="note" style="margin-bottom:14px">Connexion à ton compte</p>
        ${message ? `<div class="alert err">${esc(message)}</div>` : ""}
        <div class="label">E-mail</div>
        <input id="login-email" type="email" autocomplete="username"
          value="${esc(email || "")}" style="margin-bottom:10px">
        <div class="label">Mot de passe</div>
        <input id="login-pass" type="password" autocomplete="current-password"
          style="margin-bottom:14px">
        <button class="btn" style="width:100%; justify-content:center"
          onclick="BA.App.seConnecter()">Se connecter</button>
      </div>`;

    ecran.querySelectorAll("input").forEach(champ => {
      champ.addEventListener("keydown", e => {
        if (e.key === "Enter") BA.App.seConnecter();
      });
    });
  }

  // Mode réel : pas de simulateur, bouton de déconnexion
  function installerModeReel() {
    ["#btn-sim-toggle", "#btn-reset", "#sim-status"].forEach(sel => {
      const el = $(sel);
      if (el) el.style.display = "none";
    });

    const barre = $("#status-bar");
    if (barre && !$("#btn-logout")) {
      const b = document.createElement("button");
      b.id          = "btn-logout";
      b.className   = "btn secondary";
      b.style.margin = "0";
      b.textContent = "🚪 Déconnexion";
      b.title       = BA.DB.email || "";
      b.onclick     = () => BA.App.seDeconnecter();
      barre.appendChild(b);
    }
  }

  // Reconnexion automatique du câble (ports déjà autorisés dans ce navigateur)
  async function initialiserRs232() {
    if (!BA.Serial.supported()) return;
    if (navigator.serial.addEventListener) {
      navigator.serial.addEventListener("connect", e => {
        if (_rs.reconnexionAuto && !BA.Serial.connected) {
          journalRs("Adaptateur USB rebranché : reconnexion automatique.", "info");
          BA.App.serialConnect(e.target);
        }
      });
    }
    if (!_rs.reconnexionAuto) return;
    const ports = await BA.Serial.portsAutorises();
    if (ports.length === 1) {
      journalRs("Reconnexion automatique au port déjà autorisé.", "info");
      await BA.App.serialConnect(ports[0]);
    } else if (ports.length > 1) {
      journalRs("Plusieurs ports autorisés : clique sur « Connecter » pour choisir.", "warn");
    }
  }

  let _appDemarree = false;
  async function demarrerApp() {
    if (_appDemarree) return;
    _appDemarree = true;

    if (BA.DB.isReady()) {
      installerModeReel();
      BA.DB.subscribe(rafraichir);
      BA.DB.onSignedOut(() => location.reload());
    }
    await loadAll();
    initialiserRs232().catch(err => journalRs("Reconnexion automatique impossible : " + err.message, "warn"));
  }

  (async function demarrer() {
    if (BA.DB.isReady()) {
      let session = null;
      try {
        session = await BA.DB.getSession();
      } catch (err) {
        afficherConnexion(err.message);
        return;
      }
      if (!session) {
        afficherConnexion();
        return;
      }
    }
    await demarrerApp();
  })();

})();
