// ============================================================
// BROODAUTOMATE — Interface principale v3.0 (Supabase)
// Multi-machines + ajout / suppression de machines et de produits (test local)
// ============================================================

(function () {

  const $ = s => document.querySelector(s);
  const eur   = v => Number(v).toFixed(2) + " €";
  const heure = ts => ts ? new Date(ts).toLocaleString("fr-FR") : "—";

  const badge = s => {
    const couleur = {
      online:  "on",
      offline: "off",
      error:   "err",
      unknown: "warn"
    }[s] || "off";
    const label = {
      online:  "En ligne",
      offline: "Hors ligne",
      error:   "Erreur",
      unknown: "Inconnu"
    }[s] || "Inconnu";
    return `<span class="badge ${couleur}">${label}</span>`;
  };

  // ---------- Liste des machines (mode local : sauvegardée dans le navigateur) ----------
  const CLE_MACHINES = "broodautomate_machines";

  function chargerMachines() {
    try {
      const brut = localStorage.getItem(CLE_MACHINES);
      if (brut) return JSON.parse(brut);
    } catch (e) { /* on repart de la liste de démo */ }
    return BA_CONFIG.machines.map(m => ({ ...m }));
  }

  function sauverMachines() {
    try {
      localStorage.setItem(CLE_MACHINES, JSON.stringify(_listeMachines));
    } catch (e) {
      console.warn("Sauvegarde impossible :", e.message);
    }
  }

  let _listeMachines = chargerMachines();
  let _derniereAnalyse = null;       // dernière trame reçue par le câble (déjà analysée)

  // Protège l'affichage quand on insère du texte venant de la machine
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  let _formProduitOuvert = false;    // formulaire "nouveau produit"

  // ---------- Produits par machine (mode local : sauvegardés dans le navigateur) ----------
  // La machine simulée garde ses produits en mémoire (ils reviennent à l'état de départ au rechargement).
  // Les machines ajoutées par l'utilisateur sont sauvegardées.
  const CLE_STOCK = "broodautomate_produits";

  function chargerStock() {
    try {
      const brut = localStorage.getItem(CLE_STOCK);
      if (brut) return JSON.parse(brut);
    } catch (e) { /* stock vide */ }
    return {};
  }

  let _stockLocal = chargerStock();

  function sauverStock() {
    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(_stockLocal));
    } catch (e) {
      console.warn("Sauvegarde du stock impossible :", e.message);
    }
  }

  function produitsDe(id) {
    if (!id) return [];
    if (id === BA.Simulator._localMachine.id) return BA.Simulator._localProducts;
    if (!_stockLocal[id]) _stockLocal[id] = [];
    return _stockLocal[id];
  }

  function definirProduits(id, liste) {
    if (id === BA.Simulator._localMachine.id) BA.Simulator._localProducts = liste;
    else _stockLocal[id] = liste;
    sauverStock();
  }

  let _dernierId = 0;
  function nouvelId() {
    _dernierId = Math.max(Date.now(), _dernierId + 1);
    return _dernierId;
  }

  // ---------- Relevés d'audit (mode local : sauvegardés dans le navigateur) ----------
  const CLE_AUDITS = "broodautomate_audits";

  function chargerAudits() {
    try {
      const brut = localStorage.getItem(CLE_AUDITS);
      if (brut) return JSON.parse(brut);
    } catch (e) { /* aucun relevé */ }
    return {};
  }

  let _auditsLocal = chargerAudits();

  function sauverAudits() {
    try {
      localStorage.setItem(CLE_AUDITS, JSON.stringify(_auditsLocal));
    } catch (e) {
      console.warn("Sauvegarde des relevés impossible :", e.message);
    }
  }

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
    if (BA.DB.isReady()) {
      const produits = await BA.DB.getProducts(machineId);
      for (const d of parSelection) {
        if (d.delta <= 0) continue;
        const p = produits.find(x => Number(x.selection) === Number(d.selection));
        if (!p) continue;
        await BA.DB.updateProduct(p.id, { qty: Math.max(0, Number(p.qty) - d.delta) });
        modifies++;
      }
    } else {
      const produits = produitsDe(machineId);
      for (const d of parSelection) {
        if (d.delta <= 0) continue;
        const p = produits.find(x => Number(x.selection) === Number(d.selection));
        if (!p) continue;
        p.qty = Math.max(0, Number(p.qty) - d.delta);
        modifies++;
      }
      if (modifies) sauverStock();
    }
    return modifies;
  }

  // ---------- Machine sélectionnée actuellement ----------
  let _machineSelectionnee = _listeMachines[0] ? _listeMachines[0].id : null;

  // ---------- Données en mémoire ----------
  let _machine  = null;
  let _products = [];
  let _sales    = [];
  let _events   = [];
  let _counters = { totalSales: 0, totalValue: 0 };
  let _allMachines = []; // Toutes les machines pour la vue flotte
  let _lastEvaDts  = null;
  let _serialLog   = "";
  let _serialBrut  = "";             // derniers caractères reçus du câble (flux brut)
  let _serialOctets = 0;             // total de caractères reçus depuis la connexion
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
        _listeMachines = machines.map(m => ({ id: m.id, name: m.name, city: m.city }));

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
      // Mode local : seule la machine simulée a des données
      const idSimule   = BA.Simulator._localMachine.id;
      const estSimulee = _machineSelectionnee === idSimule;

      _products = produitsDe(_machineSelectionnee);
      _audits   = auditsLocaux(_machineSelectionnee);
      _lastAudit = _audits[0] || null;

      if (estSimulee) {
        _machine  = BA.Simulator._localMachine;
        _sales    = BA.Simulator._localSales;
        _events   = BA.Simulator._localEvents;
      } else {
        _machine  = { id: _machineSelectionnee, status: "unknown", temp_c: null, last_seen: null };
        _sales    = [];
        _events   = [];
      }

      _allMachines = _listeMachines.map(m => m.id === idSimule
        ? { ...BA.Simulator._localMachine, name: m.name, city: m.city }
        : { id: m.id, name: m.name, city: m.city, status: "unknown", temp_c: null, last_seen: null });

      _counters = {
        totalSales: _sales.length,
        totalValue: _sales.reduce((a, s) => a + Number(s.price), 0)
      };
    }
    render();
  }

  // (le temps réel Supabase est activé au démarrage, après la connexion)

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

  // ============================================================
  // VUES
  // ============================================================

  // ---------- VUE FLOTTE (toutes les machines) ----------
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
          <div class="card">
            <div class="label">Total machines</div>
            <div class="value">${machines.length}</div>
          </div>
          <div class="card">
            <div class="label">En ligne</div>
            <div class="value" style="color:#16a34a">${totalOnline}</div>
          </div>
          <div class="card">
            <div class="label">Hors ligne</div>
            <div class="value" style="color:#475569">${totalOffline}</div>
          </div>
          <div class="card">
            <div class="label">En erreur</div>
            <div class="value" style="color:#dc2626">${totalError}</div>
          </div>
        </div>

        <h2>Toutes les machines</h2>
        <div class="cards">
          ${machines.map(m => {
            const couleurBord = {
              online:  "#16a34a",
              offline: "#475569",
              error:   "#dc2626",
              unknown: "#d97706"
            }[m.status] || "#475569";

            const selectionne = m.id === _machineSelectionnee ? "border: 2px solid #2563eb;" : "";

            return `
              <div class="card"
                onclick="BA.App.selectMachine('${m.id}')"
                style="cursor:pointer;
                       border-top: 5px solid ${couleurBord};
                       ${selectionne}">
                <div class="label">📍 ${m.city || "—"}</div>
                <div class="value" style="font-size:1rem; margin:6px 0">
                  ${m.name || m.id}
                </div>
                <div style="margin:8px 0">
                  ${badge(m.status)}
                </div>
                <div class="note">
                  🌡️ ${m.temp_c ?? "—"} °C<br>
                  🕐 ${heure(m.last_seen)}<br>
                  ID : ${m.id}
                </div>
                <div style="display:flex; gap:8px; margin-top:10px">
                  <button class="btn" style="flex:1">🔍 Voir les détails</button>
                  <button class="btn danger"
                    style="background:#dc2626"
                    title="Supprimer cette machine"
                    onclick="event.stopPropagation(); BA.App.supprimerMachine('${m.id}')">
                    🗑
                  </button>
                </div>
              </div>
            `;
          }).join("")}
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
          Aucun audit importé pour cette machine. Lance l'audit sur clé USB dans le menu de la machine,
          puis importe ici le fichier .dat.
        </p>
        ${bouton}`;
    }

    const a = _lastAudit;
    const depuis = a.delta_count == null
      ? "Relevé initial"
      : `+${a.delta_count} vente(s) (+${eur(a.delta_value)})`;
    const codes = [...new Set((a.errors || []).map(e => e.code).filter(Boolean))];

    return `
      <h2>📥 Relevé d'audit</h2>
      <div class="cards">
        <div class="card">
          <div class="label">Dernier relevé importé</div>
          <div class="value" style="font-size:1rem">${heure(a.imported_at)}</div>
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
        Horloge de la machine dans le fichier : ${esc(a.machine_date || "—")} (peu fiable).
        ${codes.length ? "<br>Codes d'erreur dans son journal : " + esc(codes.join(", ")) + "." : ""}
      </p>
      ${bouton}`;
  }

  // ---------- Ventes par sélection d'après le dernier relevé (onglet Ventes) ----------
  function htmlAuditSelections() {
    if (!_lastAudit) return "";

    const prec    = _audits[1];
    const avant   = {};
    if (prec) (prec.selections || []).forEach(s => { avant[s.selection] = s.sold; });

    const lignes = (_lastAudit.selections || [])
      .filter(s => s.sold > 0)
      .map(s => {
        const prod = _products.find(p => Number(p.selection) === Number(s.selection));
        const d = prec ? s.sold - (avant[s.selection] || 0) : null;
        return `
          <tr>
            <td>${s.selection}</td>
            <td>${prod && prod.name ? prod.name : "—"}</td>
            <td>${s.sold}</td>
            <td>${s.value == null ? "—" : eur(s.value)}</td>
            <td>${d == null ? "—" : "+" + d}</td>
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
        Chiffres cumulés depuis la mise en service de la machine. Le CA n'est pas fourni pour toutes les sélections.
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
    const caAujourdHui   = ventesAujourdHui.reduce((a, s) => a + Number(s.price), 0);
    const alertesStock   = _products.filter(p => p.qty <= BA_CONFIG.lowStockThreshold).length;
    const machineConfig  = _listeMachines.find(m => m.id === _machineSelectionnee) || {};

    $("#view-dashboard").innerHTML = `
      <h2>📊 Détails — ${machineConfig.name || _machineSelectionnee}</h2>
      <p class="note" style="margin-bottom:16px">
        📍 ${machineConfig.city || "—"} — ID : ${_machineSelectionnee}
      </p>

      <div class="cards">
        <div class="card">
          <div class="label">Statut machine</div>
          <div class="value">${badge(_machine.status)}</div>
        </div>
        <div class="card">
          <div class="label">Température</div>
          <div class="value">${_machine.temp_c ?? "—"} °C</div>
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

    // Copier les produits d'une autre machine (mode local)
    const autres = BA.DB.isReady()
      ? _listeMachines.filter(m => m.id !== _machineSelectionnee)
      : _listeMachines.filter(m =>
          m.id !== _machineSelectionnee && produitsDe(m.id).length > 0
        );
    const copier = autres.length ? `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <span class="note">📋 Copier les produits (sans le stock) de :</span>
        <select id="copy-source" style="width:auto; min-width:180px">
          ${autres.map(m => `<option value="${m.id}">${m.name || m.id}</option>`).join("")}
        </select>
        <button class="btn secondary" onclick="BA.App.copierProduits()">Copier</button>
      </div>` : "";

    const formulaire = _formProduitOuvert ? `
      <div class="card" style="margin-bottom:16px">
        <h3>➕ Nouveau produit</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:12px 0">
          <div>
            <div class="label">N° de sélection</div>
            <input id="np-sel" type="number" placeholder="ex : 11">
          </div>
          <div>
            <div class="label">Produit</div>
            <input id="np-name" placeholder="ex : Pain blanc">
          </div>
          <div>
            <div class="label">Prix (€)</div>
            <input id="np-price" type="number" step="0.10" placeholder="ex : 2.50">
          </div>
          <div>
            <div class="label">Stock actuel</div>
            <input id="np-qty" type="number" placeholder="ex : 8">
          </div>
          <div>
            <div class="label">Capacité max</div>
            <input id="np-cap" type="number" placeholder="ex : 10">
          </div>
        </div>
        <button class="btn" onclick="BA.App.ajouterProduit()">💾 Enregistrer</button>
        <button class="btn secondary" onclick="BA.App.fermerFormProduit()">Annuler</button>
      </div>` : "";

    $("#view-products").innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px">
        <h2 style="margin:0">🍞 Produits / Stock — ${machineConfig.name || _machineSelectionnee}</h2>
        <button class="btn" onclick="BA.App.ouvrirFormProduit()">➕ Ajouter un produit</button>
      </div>
      ${copier}
      ${formulaire}
      <table>
        <tr>
          <th>Sél.</th>
          <th>Produit</th>
          <th>Prix</th>
          <th>Stock</th>
          <th>Capacité</th>
          <th>Action</th>
        </tr>
        ${_products.map(p => `
          <tr class="${p.qty === 0 ? "empty" : p.qty <= BA_CONFIG.lowStockThreshold ? "low" : ""}">
            <td>
              <input type="number" value="${p.selection}" style="width:70px"
                onchange="BA.App.editProduct(${p.id}, 'selection', this.value)">
            </td>
            <td>
              <input value="${p.name}"
                onchange="BA.App.editProduct(${p.id}, 'name', this.value)">
            </td>
            <td>
              <input type="number" step="0.10" value="${Number(p.price).toFixed(2)}" style="width:80px"
                onchange="BA.App.editProduct(${p.id}, 'price', this.value)">
            </td>
            <td>
              <input type="number" value="${p.qty}" style="width:70px"
                onchange="BA.App.editProduct(${p.id}, 'qty', this.value)">
            </td>
            <td>
              <input type="number" value="${p.capacity}" style="width:70px"
                onchange="BA.App.editProduct(${p.id}, 'capacity', this.value)">
            </td>
            <td style="white-space:nowrap">
              <button class="btn secondary" onclick="BA.App.refill(${p.id}, ${p.capacity})">
                🔄 Remplir
              </button>
              <button class="btn" style="background:#dc2626" title="Supprimer ce produit"
                onclick="BA.App.supprimerProduit(${p.id})">
                🗑
              </button>
            </td>
          </tr>
        `).join("") || `
          <tr>
            <td colspan="6">Aucun produit pour cette machine. Clique sur « ➕ Ajouter un produit ».</td>
          </tr>
        `}
      </table>
      <p class="note" style="margin-top:10px">
        🟡 Jaune = stock faible (≤ ${BA_CONFIG.lowStockThreshold}) —
        🔴 Rouge = épuisé
      </p>
    `;
  }

  // ---------- VUE VENTES ----------
  function renderSales() {
    const machineConfig = _listeMachines.find(m => m.id === _machineSelectionnee) || {};
    const parSelection  = {};

    _sales.forEach(s => {
      if (!parSelection[s.selection]) {
        parSelection[s.selection] = { name: s.name, n: 0, valeur: 0 };
      }
      parSelection[s.selection].n++;
      parSelection[s.selection].valeur += Number(s.price);
    });

    $("#view-sales").innerHTML = `
      <h2>💶 Ventes — ${machineConfig.name || _machineSelectionnee}</h2>
      <div class="cards">
        <div class="card">
          <div class="label">Nombre total de ventes</div>
          <div class="value">${_counters.totalSales}</div>
        </div>
        <div class="card">
          <div class="label">Chiffre d'affaires total</div>
          <div class="value">${eur(_counters.totalValue)}</div>
        </div>
      </div>

      ${htmlAuditSelections()}

      <h2>Par sélection</h2>
      <table>
        <tr>
          <th>Sél.</th>
          <th>Produit</th>
          <th>Qté vendue</th>
          <th>CA</th>
        </tr>
        ${Object.entries(parSelection).map(([k, v]) => `
          <tr>
            <td>${k}</td>
            <td>${v.name}</td>
            <td>${v.n}</td>
            <td>${eur(v.valeur)}</td>
          </tr>
        `).join("") || `
          <tr>
            <td colspan="4">Aucune vente pour l'instant</td>
          </tr>
        `}
      </table>

      <h2 style="margin-top:20px">Historique complet</h2>
      ${tableVentes(_sales)}
    `;
  }

  // ---------- VUE ALERTES ----------
  function renderAlerts() {
    const stockFaible = _products.filter(p => p.qty <= BA_CONFIG.lowStockThreshold);

    // Alertes globales toutes machines
    const alertesGlobales = _allMachines.filter(m =>
      m.status === "error" || m.status === "offline"
    );

    const machineConfig = _listeMachines.find(m => m.id === _machineSelectionnee) || {};

    $("#view-alerts").innerHTML = `

      <!-- Alertes globales flotte -->
      ${alertesGlobales.length ? `
        <h2>⚠️ Alertes Flotte Globale</h2>
        ${alertesGlobales.map(m => `
          <div class="alert ${m.status === "error" ? "err" : "warn"}">
            ${m.status === "error" ? "🔴 Erreur" : "🟡 Hors ligne"} —
            <b>${m.name || m.id}</b> (${m.city || "—"})
            <button class="btn secondary" style="margin-left:10px; padding:4px 8px"
              onclick="BA.App.selectMachine('${m.id}')">
              Voir
            </button>
          </div>
        `).join("")}
      ` : `
        <div class="alert info">✅ Aucune machine en erreur ou hors ligne</div>
      `}

      <!-- Alertes stock machine sélectionnée -->
      <h2 style="margin-top:24px">
        Stock faible — ${machineConfig.name || _machineSelectionnee}
      </h2>
      ${stockFaible.length
        ? stockFaible.map(p => `
            <div class="alert ${p.qty === 0 ? "err" : "warn"}">
              ${p.qty === 0 ? "⛔ Épuisé" : "⚠️ Stock faible"}
              — Sél. ${p.selection} &nbsp;
              <b>${p.name}</b>
              &nbsp; (${p.qty} / ${p.capacity})
              <button class="btn secondary" style="margin-left:10px; padding:4px 8px"
                onclick="BA.App.refill(${p.id}, ${p.capacity})">
                🔄 Remplir
              </button>
            </div>
          `).join("")
        : `<p class="note">✅ Aucune alerte stock</p>`
      }

      <!-- Journal machine -->
      <h2 style="margin-top:24px">Journal machine</h2>
      ${_events.length
        ? _events.slice(0, 40).map(e => `
            <div class="alert ${e.level === "error" ? "err" : e.level === "warn" ? "warn" : "info"}">
              <small>${heure(e.created_at || e.ts)}</small>
              &nbsp;—&nbsp;
              <b>${e.code}</b> : ${e.message}
            </div>
          `).join("")
        : `<p class="note">Aucun événement</p>`
      }
    `;
  }

  // ---------- VUE CONNEXION RS232 (ajout de machines + outils EVA-DTS) ----------
  function htmlMachineDetectee() {
    const a = _derniereAnalyse;
    if (!a) {
      return `<p class="note">— Aucune trame reçue pour l'instant. Connecte la machine avec le câble ci-dessus. —</p>`;
    }

    const serie = String(a.machineId || "").replace(/[^A-Za-z0-9-]/g, "");
    const total = a.va1 ? `${a.va1.countTotal} vente(s) — ${eur(a.va1.valueTotal)}` : "—";

    return `
      <div class="card">
        <h3>✅ Trame reçue</h3>
        <table>
          <tr><th>N° de série lu</th><td>${esc(a.machineId) || "—"}</td></tr>
          <tr><th>Modèle lu</th><td>${esc(a.machineModel) || "—"}</td></tr>
          <tr><th>Ventes (compteur total)</th><td>${total}</td></tr>
          <tr><th>Sélections</th><td>${a.selections.length}</td></tr>
          <tr><th>Erreurs</th><td>${a.events.length}</td></tr>
        </table>
        <p class="note">⚠️ Compare le numéro lu avec la plaque de la machine avant d'enregistrer. Tu peux le corriger.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin:12px 0">
          <div>
            <div class="label">Numéro de série</div>
            <input id="det-id" value="${serie}">
          </div>
          <div>
            <div class="label">Nom de la machine</div>
            <input id="det-name" placeholder="ex : Boulangerie Dupont">
          </div>
          <div>
            <div class="label">Ville ou lieu</div>
            <input id="det-city" placeholder="ex : Bruxelles">
          </div>
        </div>
        <button class="btn" onclick="BA.App.ajouterMachine('det')">➕ Ajouter cette machine à la flotte</button>
      </div>`;
  }

  function renderSerial() {
    const sp = (_machine && _machine.serial_port) || {};

    $("#view-serial").innerHTML = `
      <h2>🔌 Connexion RS232 — Ajouter une machine</h2>

      <div class="alert ${BA.Serial.supported() ? "info" : "err"}" style="margin-bottom:12px">
        ${BA.Serial.supported()
          ? "✅ Web Serial disponible dans ce navigateur"
          : "❌ Web Serial non disponible — utilise Google Chrome ou Edge"
        }
      </div>

      <div class="alert info" style="margin-bottom:12px">
        ℹ️ Pour lire une machine avec le câble :<br>
        1. Câble USB → RS232 DB9 (~10-15€) et son driver<br>
        2. Branche le câble entre ton PC et la machine<br>
        3. Clique sur Connecter ci-dessous<br>
        4. Quand la trame arrive, la machine détectée s'affiche : tu peux l'ajouter à la flotte
      </div>

      <p class="note" style="margin-bottom:12px">
        ⚠️ La présence du port RS232 sur ta machine n'est pas encore confirmée (à vérifier sur la machine).<br>
        Paramètres FAS (à confirmer) :
        ${sp.baudRate || 9600} baud,
        ${sp.dataBits || 8}N${sp.stopBits || 1},
        DTR haut.
        Câble DB9 : Pin 2 = Tx / Pin 5 = GND / Pin 7 = DTR.
      </p>

      <button class="btn" onclick="BA.App.serialConnect()">
        🔌 Connecter la machine
      </button>
      <button class="btn secondary" onclick="BA.App.serialDisconnect()">
        Déconnecter
      </button>

      <button class="btn secondary" onclick="BA.App.serialRelancer()">
        🔁 Relancer la demande
      </button>

      <h3>Flux brut (tout ce qui arrive du câble)</h3>
      <p class="note">
        Caractères reçus : <span id="serial-count">${_serialOctets}</span>.
        Si le voyant de l'adaptateur clignote et que rien ne s'affiche ici, la machine répond mais pas comme prévu.
      </p>
      <pre id="serial-brut">${esc(_serialBrut) || "— Rien reçu pour l'instant —"}</pre>

      <h3>Trames complètes reçues</h3>
      <pre id="serial-log">${esc(_serialLog) || "— En attente de connexion —"}</pre>

      <h3>Machine détectée</h3>
      <div id="serial-detect">${htmlMachineDetectee()}</div>

      <h2 style="margin-top:28px">✍️ Ajouter une machine manuellement</h2>
      <p class="note" style="margin-bottom:12px">
        Sans câble : pour une machine que tu n'as pas devant toi.
      </p>
      <div class="card">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:12px">
          <div>
            <div class="label">Numéro de série (plaque)</div>
            <input id="man-id" placeholder="ex : 202166085">
          </div>
          <div>
            <div class="label">Nom de la machine</div>
            <input id="man-name" placeholder="ex : Boulangerie Dupont">
          </div>
          <div>
            <div class="label">Ville ou lieu</div>
            <input id="man-city" placeholder="ex : Bruxelles">
          </div>
        </div>
        <button class="btn" onclick="BA.App.ajouterMachine('man')">➕ Ajouter à la flotte</button>
      </div>

      <h2 style="margin-top:28px">🧪 Test EVA-DTS (analyser une trame)</h2>
      <p class="note" style="margin-bottom:12px">
        Génère une trame depuis le simulateur, ou colle une trame reçue d'une vraie machine, puis analyse-la.
      </p>
      <button class="btn" onclick="BA.App.genEva()">📄 Générer une trame (simulateur)</button>
      <button class="btn secondary" onclick="BA.App.parseEva()">🔍 Analyser la trame</button>

      <h3>Trame brute</h3>
      <textarea id="eva-raw" rows="8"
        style="width:100%; background:#0f172a; color:#e2e8f0; border:1px solid #475569; border-radius:6px; padding:8px; font-family:monospace; font-size:.8rem"
        placeholder="— Clique sur Générer, ou colle une trame ici —">${esc(_lastEvaDts || "")}</textarea>

      <h3>Résultat de l'analyse</h3>
      <pre id="eva-parsed">— Clique sur Analyser après avoir généré ou collé une trame —</pre>
    `;
  }

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
            <td>${s.selection}</td>
            <td>${s.name}</td>
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

  function render() {
    const activeBtn  = document.querySelector("nav button.active");
    const activeView = activeBtn ? activeBtn.dataset.view : "fleet";

    // On ne redessine pas l'onglet RS232 ni le formulaire produit pendant la saisie
    // (sinon ce que tu tapes serait effacé à chaque mise à jour du simulateur)
    const formEnCours =
      activeView === "serial" ||
      (activeView === "products" && _formProduitOuvert);
    if (!formEnCours) {
      renderActiveView(activeView);
    }

    // Simulateur dans le footer
    const running = BA.Simulator.running;
    $("#sim-status").className   = "badge " + (running ? "on" : "off");
    $("#sim-status").textContent = "Simulateur : " + (running ? "ON" : "OFF");
    $("#btn-sim-toggle").textContent = running
      ? "⏸ Arrêter simulateur"
      : "▶ Démarrer simulateur";

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
      // On retire les caractères qui pourraient casser l'affichage
      const propre = s => (s || "").replace(/[<>"'`]/g, "").trim();
      const champ  = k => { const el = $("#" + pref + "-" + k); return el ? el.value : ""; };

      const serie = propre(champ("id")).replace(/\s+/g, "");
      const nom   = propre(champ("name"));
      const ville = propre(champ("city"));

      if (!serie || !/^[A-Za-z0-9-]+$/.test(serie)) {
        alert("Entre un numéro de série valide (lettres, chiffres et tirets seulement).");
        return;
      }

      const id = serie.toUpperCase().startsWith("FAS-")
        ? serie.toUpperCase()
        : "FAS-" + serie;

      if (_listeMachines.some(m => m.id === id)) {
        alert("Cette machine existe déjà dans ta flotte.");
        return;
      }

      const machine = {
        id:     id,
        name:   nom   || ("Machine " + serie),
        city:   ville || "À définir",
        serial: serie
      };

      if (BA.DB.isReady()) {
        try {
          await BA.DB.addMachine(machine);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        _listeMachines.push({ id: machine.id, name: machine.name, city: machine.city });
        sauverMachines();
      }

      if (!_machineSelectionnee) _machineSelectionnee = id;
      await loadAll();

      ["id", "name", "city"].forEach(k => {
        const el = $("#" + pref + "-" + k);
        if (el) el.value = "";
      });
      alert("✅ Machine ajoutée à la flotte (" + id + ").");
    },

    supprimerMachine: async (id) => {
      const m = _listeMachines.find(x => x.id === id);
      if (!m) return;

      const detail = BA.DB.isReady()
        ? "Ses produits, ses ventes et son journal seront aussi effacés.\n\n"
        : "";
      if (!confirm(
        "Supprimer « " + m.name + " » (" + id + ") de la flotte ?\n\n" +
        detail + "Cette action est définitive."
      )) return;

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
        if (id !== BA.Simulator._localMachine.id) {
          delete _stockLocal[id];
          sauverStock();
        }
        delete _auditsLocal[id];
        sauverAudits();
      }

      if (_machineSelectionnee === id) {
        _machineSelectionnee = _listeMachines.find(x => x.id !== id)
          ? _listeMachines.find(x => x.id !== id).id
          : null;
      }
      await loadAll();
    },

    // Aller à un onglet (comme un clic sur le bouton du menu)
    allerVue: (vue) => {
      const btn = document.querySelector("nav button[data-view='" + vue + "']");
      if (btn) btn.click();
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
      await loadAll();

      // Naviguer vers le dashboard de la machine sélectionnée
      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.querySelector("[data-view='dashboard']").classList.add("active");
      $("#view-dashboard").classList.add("active");
      renderDashboard();
    },

    editProduct: async (id, champ, valeur) => {
      if (champ === "name") {
        valeur = String(valeur).replace(/[<>"'`]/g, "").trim();
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
      const p = liste.find(x => x.id === id);
      if (!p) return;

      if (champ === "selection" && liste.some(x => x.id !== id && x.selection === valeur)) {
        alert("Ce numéro de sélection existe déjà sur cette machine.");
        render();
        return;
      }

      p[champ] = valeur;
      sauverStock();
      render();
    },

    refill: async (id, capacite) => {
      if (BA.DB.isReady()) {
        try {
          await BA.DB.updateProduct(id, { qty: capacite });
          await BA.DB.addEvent(
            _machineSelectionnee,
            "info",
            "REFILL",
            "Produit rechargé"
          );
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
        await loadAll();
      } else {
        const p = produitsDe(_machineSelectionnee).find(x => x.id === id);
        if (p) { p.qty = capacite; sauverStock(); render(); }
      }
    },

    // ---------- Relevés d'audit ----------
    // Choix d'un fichier d'audit (clé USB) pour la machine sélectionnée
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
        texte = await fichier.text();
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

      await BA.App.traiterAudit(_machineSelectionnee, analyse, "usb");
    },

    // Enregistre un relevé : compare au précédent, demande confirmation, met à jour le stock
    traiterAudit: async (machineId, analyse, source) => {
      try {
        const audit   = BA.EvaDts.toAudit(analyse);
        const ancien  = await lireDernierAudit(machineId);
        const diff    = BA.EvaDts.compare(ancien, audit);
        const machine = _listeMachines.find(m => m.id === machineId) || {};
        const nom     = machine.name || machineId;

        if (diff.identique) {
          alert("Ce relevé est identique au dernier relevé de « " + nom + " » : aucune nouvelle vente.");
          return false;
        }

        let message =
          "Importer ce relevé pour « " + nom + " » (" + machineId + ") ?\n\n" +
          "Compteurs de la machine : " + audit.total_count + " vente(s), " + eur(audit.total_value) + ".\n";

        let appliquer = false;
        if (diff.baseline) {
          message += "\nC'est le premier relevé de cette machine : il sert de point de départ, aucune vente n'est ajoutée.";
        } else if (diff.anomalies) {
          message += "\n⚠️ Les compteurs sont plus BAS que lors du relevé précédent (remise à zéro de la machine, " +
                     "ou fichier d'une autre machine ?). Ce relevé deviendra le nouveau point de départ, sans calcul de ventes.";
        } else {
          appliquer = true;
          message += "\nDepuis le relevé précédent : +" + diff.deltaCount + " vente(s), +" + eur(diff.deltaValue) + ".\n" +
                     "Le stock des produits concernés sera diminué de ces ventes.";
        }

        if (!confirm(message)) return false;

        audit.source      = source;
        audit.delta_count = appliquer ? diff.deltaCount : null;
        audit.delta_value = appliquer ? diff.deltaValue : null;
        await sauverAudit(machineId, audit);

        let majStock = 0;
        if (appliquer) majStock = await appliquerVentesAuStock(machineId, diff.parSelection);

        if (BA.DB.isReady()) {
          await BA.DB.addEvent(
            machineId,
            "info",
            "AUDIT_IMPORT",
            diff.baseline || !appliquer
              ? "Relevé d'audit enregistré (point de départ)"
              : "Relevé d'audit : +" + diff.deltaCount + " vente(s) (+" + eur(diff.deltaValue) + ")"
          );
        }

        await loadAll();

        alert(
          diff.baseline || !appliquer
            ? "✅ Relevé enregistré comme point de départ. Les prochains relevés calculeront les ventes."
            : "✅ Relevé enregistré : +" + diff.deltaCount + " vente(s) (+" + eur(diff.deltaValue) + ").\n" +
              "Stock mis à jour pour " + majStock + " produit(s)."
        );
        return true;
      } catch (err) {
        console.error("Erreur d'import d'audit :", err);
        const aide = /audits/i.test(err.message || "")
          ? "\n\nLa table « audits » n'existe sans doute pas encore dans Supabase : lance d'abord le SQL fourni (SQL Editor)."
          : "";
        alert("Erreur : " + err.message + aide);
        return false;
      }
    },

    // ---------- Gestion des produits d'une machine ----------
    ouvrirFormProduit: () => {
      _formProduitOuvert = true;
      renderProducts();
      setTimeout(() => { const el = $("#np-sel"); if (el) el.focus(); }, 0);
    },

    fermerFormProduit: () => {
      _formProduitOuvert = false;
      renderProducts();
    },

    ajouterProduit: async () => {
      const propre = s => (s || "").replace(/[<>"'`]/g, "").trim();

      const sel  = Number($("#np-sel").value);
      const nom  = propre($("#np-name").value);
      const prixTexte = $("#np-price").value;
      const prix = Number(prixTexte);
      const qty  = Number($("#np-qty").value || 0);
      const cap  = Number($("#np-cap").value);

      if (!Number.isInteger(sel) || sel <= 0) {
        alert("Entre un numéro de sélection (nombre entier, ex : 11).");
        return;
      }
      if (!nom) {
        alert("Entre le nom du produit.");
        return;
      }
      if (prixTexte === "" || !isFinite(prix) || prix < 0) {
        alert("Entre un prix valide (ex : 2.50).");
        return;
      }
      if (!Number.isInteger(cap) || cap <= 0) {
        alert("Entre la capacité max (nombre entier, ex : 10).");
        return;
      }
      if (!Number.isInteger(qty) || qty < 0 || qty > cap) {
        alert("Le stock doit être un nombre entre 0 et la capacité max.");
        return;
      }

      const produit = {
        id:         nouvelId(),
        selection:  sel,
        name:       nom,
        price:      prix,
        qty:        qty,
        capacity:   cap,
        machine_id: _machineSelectionnee
      };

      if (BA.DB.isReady()) {
        if (_products.some(x => x.selection === sel)) {
          alert("Ce numéro de sélection existe déjà sur cette machine.");
          return;
        }
        try {
          await BA.DB.addProduct(_machineSelectionnee, produit);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
          return;
        }
      } else {
        const liste = produitsDe(_machineSelectionnee);
        if (liste.some(x => x.selection === sel)) {
          alert("Ce numéro de sélection existe déjà sur cette machine.");
          return;
        }
        liste.push(produit);
        liste.sort((a, b) => a.selection - b.selection);
        sauverStock();
      }

      _formProduitOuvert = false;
      await loadAll();
    },

    supprimerProduit: async (id) => {
      const liste = produitsDe(_machineSelectionnee);
      const p = BA.DB.isReady() ? _products.find(x => x.id === id) : liste.find(x => x.id === id);
      if (!p) return;

      if (!confirm("Supprimer le produit « " + (p.name || ("sél. " + p.selection)) + " » ?")) return;

      if (BA.DB.isReady()) {
        try {
          await BA.DB.deleteProduct(id);
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
      } else {
        definirProduits(_machineSelectionnee, liste.filter(x => x.id !== id));
      }
      await loadAll();
    },

    copierProduits: async () => {
      const source = $("#copy-source") ? $("#copy-source").value : null;
      if (!source) return;

      if (BA.DB.isReady()) {
        try {
          const dejaLa  = new Set(_products.map(x => x.selection));
          const sources = (await BA.DB.getProducts(source)).filter(sp => !dejaLa.has(sp.selection));
          if (!sources.length) {
            alert("Rien à copier : cette machine n'a pas de produit, ou tous les numéros de sélection existent déjà ici.");
            return;
          }
          for (const sp of sources) {
            await BA.DB.addProduct(_machineSelectionnee, {
              selection: sp.selection,
              name:      sp.name,
              price:     sp.price,
              qty:       0,
              capacity:  sp.capacity
            });
          }
        } catch (err) {
          alert("Erreur Supabase : " + err.message);
        }
        await loadAll();
        return;
      }

      const liste = produitsDe(_machineSelectionnee);
      const aCopier = produitsDe(source).filter(sp =>
        !liste.some(x => x.selection === sp.selection)
      );

      if (!aCopier.length) {
        alert("Rien à copier : tous les numéros de sélection existent déjà sur cette machine.");
        return;
      }

      aCopier.forEach(sp => liste.push({
        id:         nouvelId(),
        selection:  sp.selection,
        name:       sp.name,
        price:      sp.price,
        qty:        0,
        capacity:   sp.capacity,
        machine_id: _machineSelectionnee
      }));
      liste.sort((a, b) => a.selection - b.selection);
      sauverStock();
      await loadAll();
    },

    serialConnect: async () => {
      const sp = (_machine && _machine.serial_port) || {
        baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1, dtr: true
      };
      const majStatut = s => {
        $("#serial-status").textContent = "RS232 : " + s;
        $("#serial-status").className   =
          "badge " + (s === "connecté" ? "on" : s.startsWith("erreur") ? "err" : "off");
      };
      try {
        await BA.Serial.connect(sp, async data => {
          _serialLog = data + "\n\n---\n\n" + _serialLog;
          const el   = $("#serial-log");
          if (el) el.textContent = _serialLog;
          _lastEvaDts = data;

          // Analyse de la trame + affichage de la machine détectée
          _derniereAnalyse = BA.EvaDts.parse(data);
          const zone = $("#serial-detect");
          if (zone) zone.innerHTML = htmlMachineDetectee();
          const brut = $("#eva-raw");
          if (brut) brut.value = data;

          // Mode réel : on met à jour la machine déjà enregistrée qui correspond à la trame
          if (BA.DB.isReady()) {
            const parsed = _derniereAnalyse;
            const serie  = String(parsed.machineId || "").replace(/[^A-Za-z0-9-]/g, "");
            const idMachine = serie
              ? (serie.toUpperCase().startsWith("FAS-") ? serie.toUpperCase() : "FAS-" + serie)
              : null;

            if (idMachine && _listeMachines.some(m => m.id === idMachine)) {
              try {
                // Enregistre le relevé reçu par le câble (avec confirmation)
                await BA.App.traiterAudit(idMachine, parsed, "rs232");

                await BA.DB.updateMachine(
                  idMachine,
                  { status: "online", last_seen: new Date().toISOString() }
                );
                await BA.DB.addEvent(
                  idMachine,
                  "info",
                  "EVADTS_RX",
                  `Audit reçu — ${parsed.selections.length} sél., ${parsed.events.length} erreurs`
                );
              } catch (err) {
                console.error("Erreur d'enregistrement de la trame :", err);
                alert("Erreur Supabase : " + err.message);
              }
            }
          }
        }, majStatut, texte => {
          _serialOctets += texte.length;
          _serialBrut = (_serialBrut + texte).slice(-4000);
          const brut = $("#serial-brut");
          if (brut) brut.textContent = _serialBrut;
          const nb = $("#serial-count");
          if (nb) nb.textContent = _serialOctets;
        });
      } catch (err) {
        majStatut("erreur : " + err.message);
      }
    },

    serialRelancer: async () => {
      if (!BA.Serial.connected) {
        alert("Connecte d'abord la machine (bouton « Connecter la machine »).");
        return;
      }
      await BA.Serial.relancer();
    },

    serialDisconnect: () => {
      const majStatut = s => {
        $("#serial-status").textContent = "RS232 : " + s;
        $("#serial-status").className   =
          "badge " + (s === "connecté" ? "on" : "off");
      };
      BA.Serial.disconnect(majStatut);
    },

    // ============================================================
    // SYNC INTELLIGENTE — Ventes pendant la déconnexion
    // Compare les compteurs EVA-DTS avec la dernière lecture connue
    // ============================================================
    syncOfflineSales: async (parsedEvaDts, idMachine = _machineSelectionnee) => {
      if (!BA.DB.isReady()) return;
      if (!parsedEvaDts.va1) return;

      // Total ventes dans la trame machine
      const totalMachine = parsedEvaDts.va1.countTotal;

      // Total ventes connu dans Supabase
      const compteurs  = await BA.DB.getCounters(idMachine);
      const totalConnu = compteurs.totalSales;

      const difference = totalMachine - totalConnu;

      if (difference <= 0) {
        console.log("✅ Sync : pas de ventes manquées");
        return;
      }

      // Sécurité : on demande avant d'écrire (la 1re lecture d'une machine
      // peut contenir tout son historique)
      if (!confirm(
        "La machine indique " + totalMachine + " vente(s), l'application en connaît " + totalConnu + ".\n\n" +
        "Ajouter " + difference + " vente(s) manquante(s) (au prix moyen) ?"
      )) return;

      console.log(`⚠️ Sync : ${difference} vente(s) manquée(s) pendant déconnexion`);

      // Ajouter les ventes manquées comme "Vente hors-ligne"
      for (let i = 0; i < difference; i++) {
        await BA.DB.addSale(idMachine, {
          selection: 0,
          name:      "Vente hors-ligne (sync automatique)",
          price:     parsedEvaDts.va1.valueTotal / totalMachine
        });
      }

      await BA.DB.addEvent(
        idMachine,
        "warn",
        "SYNC_OFFLINE",
        `${difference} vente(s) récupérée(s) après reconnexion`
      );

      console.log("✅ Sync offline terminée");
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
    if (BA.Simulator.running) {
      await BA.Simulator.stop();
    } else {
      await BA.Simulator.start(() => loadAll());
    }
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
