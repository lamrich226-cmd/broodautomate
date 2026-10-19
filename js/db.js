// ============================================================
// BROODAUTOMATE — Connexion Supabase (multi-machines + connexion)
// Toutes les fonctions prennent l'identifiant de la machine en premier
// paramètre. Elles lèvent une erreur si Supabase refuse la requête.
// ============================================================

window.BA = window.BA || {};

(function () {

  const cfg = (typeof BA_CONFIG !== "undefined" && BA_CONFIG.supabase) || {};

  const CONFIGURE =
    !!cfg.url && !!cfg.key &&
    cfg.url !== "REMPLACER_ICI" && cfg.key !== "REMPLACER_ICI";

  let supa   = null;
  let erreur = "";

  if (CONFIGURE) {
    if (window.supabase && window.supabase.createClient) {
      supa = window.supabase.createClient(cfg.url, cfg.key);
    } else {
      erreur = "Impossible de charger Supabase (vérifie ta connexion internet).";
    }
  }

  const client = () => {
    if (!supa) throw new Error(erreur || "Supabase n'est pas configuré.");
    return supa;
  };

  // Retourne les données, ou lève une erreur lisible
  const verifier = (res) => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };

  BA.DB = {
    email: null,
    _canal: null,

    // true = mode réel (Supabase configuré dans config.js)
    isReady() {
      return CONFIGURE;
    },

    // ---------- Connexion ----------
    async getSession() {
      const { data } = await client().auth.getSession();
      const session = data ? data.session : null;
      this.email = session && session.user ? session.user.email : null;
      return session;
    },

    async signIn(email, motDePasse) {
      const { data, error } = await client().auth.signInWithPassword({
        email: email,
        password: motDePasse
      });
      if (error) throw new Error(error.message);
      this.email = data && data.user ? data.user.email : email;
      return data.session;
    },

    async signOut() {
      await client().auth.signOut();
      this.email = null;
    },

    onSignedOut(callback) {
      if (!supa) return;
      supa.auth.onAuthStateChange((evenement) => {
        if (evenement === "SIGNED_OUT") callback();
      });
    },

    // ---------- Machines ----------
    async getAllMachines() {
      const res = await client().from("machines").select("*").order("created_at", { ascending: true });
      return verifier(res) || [];
    },

    async getMachine(machineId) {
      const res = await client().from("machines").select("*").eq("id", machineId).maybeSingle();
      return verifier(res);
    },

    async addMachine(machine) {
      const res = await client().from("machines").insert({
        id:     machine.id,
        name:   machine.name,
        city:   machine.city,
        serial: machine.serial || null,
        model:  machine.model  || null
      });
      verifier(res);
    },

    async updateMachine(machineId, fields) {
      const res = await client().from("machines").update(fields).eq("id", machineId);
      verifier(res);
    },

    // Supprime la machine ET ses produits, ventes et événements (cascade)
    async deleteMachine(machineId) {
      const res = await client().from("machines").delete().eq("id", machineId);
      verifier(res);
    },

    // ---------- Produits ----------
    async getProducts(machineId) {
      const res = await client().from("products").select("*")
        .eq("machine_id", machineId)
        .order("selection", { ascending: true });
      return verifier(res) || [];
    },

    async addProduct(machineId, produit) {
      const res = await client().from("products").insert({
        machine_id: machineId,
        selection:  produit.selection,
        name:       produit.name,
        price:      produit.price,
        qty:        produit.qty,
        capacity:   produit.capacity
      });
      verifier(res);
    },

    async updateProduct(id, fields) {
      const res = await client().from("products").update(fields).eq("id", id);
      verifier(res);
    },

    async deleteProduct(id) {
      const res = await client().from("products").delete().eq("id", id);
      verifier(res);
    },

    // ---------- Ventes ----------
    async addSale(machineId, vente) {
      const res = await client().from("sales").insert({
        machine_id: machineId,
        selection:  vente.selection,
        name:       vente.name,
        price:      vente.price
      });
      verifier(res);
    },

    // Plusieurs ventes d'un coup (calculées à partir de deux relevés), par paquets de 500
    async addSales(machineId, ventes) {
      const lignes = (ventes || []).map(v => ({
        machine_id: machineId,
        selection:  v.selection,
        name:       v.name,
        price:      v.price
      }));
      for (let i = 0; i < lignes.length; i += 500) {
        verifier(await client().from("sales").insert(lignes.slice(i, i + 500)));
      }
    },

    async getSales(machineId, limite = 50) {
      const res = await client().from("sales").select("*")
        .eq("machine_id", machineId)
        .order("created_at", { ascending: false })
        .limit(limite);
      return verifier(res) || [];
    },

    // Total des ventes et du chiffre d'affaires (lecture par pages de 1000)
    async getCounters(machineId) {
      const PAGE = 1000;
      let total  = 0;
      let valeur = 0;
      let debut  = 0;

      while (true) {
        const res = await client().from("sales").select("price")
          .eq("machine_id", machineId)
          .order("id", { ascending: true })
          .range(debut, debut + PAGE - 1);
        const lignes = verifier(res) || [];

        total += lignes.length;
        lignes.forEach(l => { valeur += Number(l.price || 0); });

        if (lignes.length < PAGE) break;
        debut += PAGE;
      }
      return { totalSales: total, totalValue: valeur };
    },

    // ---------- Événements / alertes ----------
    async addEvent(machineId, niveau, code, message) {
      const res = await client().from("events").insert({
        machine_id: machineId,
        level:      niveau,
        code:       code,
        message:    message
      });
      verifier(res);
    },

    async getEvents(machineId, limite = 40) {
      const res = await client().from("events").select("*")
        .eq("machine_id", machineId)
        .order("created_at", { ascending: false })
        .limit(limite);
      return verifier(res) || [];
    },

    // ---------- Relevés d'audit (fichier USB ou câble) ----------
    async addAudit(machineId, audit) {
      const res = await client().from("audits").insert({
        machine_id:   machineId,
        machine_date: audit.machine_date || null,
        source:       audit.source || "usb",
        total_count:  audit.total_count,
        total_value:  audit.total_value,
        selections:   audit.selections || [],
        errors:       audit.errors || [],
        delta_count:  audit.delta_count == null ? null : audit.delta_count,
        delta_value:  audit.delta_value == null ? null : audit.delta_value
      });
      verifier(res);
    },

    async getAudits(machineId, limite = 10) {
      const res = await client().from("audits").select("*")
        .eq("machine_id", machineId)
        .order("imported_at", { ascending: false })
        .limit(limite);
      return verifier(res) || [];
    },

    async getLastAudit(machineId) {
      const liste = await this.getAudits(machineId, 1);
      return liste[0] || null;
    },

    // ---------- Réinitialisation (ventes + événements d'une machine) ----------
    async resetData(machineId) {
      verifier(await client().from("sales").delete().eq("machine_id", machineId));
      verifier(await client().from("events").delete().eq("machine_id", machineId));
      verifier(await client().from("machines").update({
        status: "unknown", temp_c: null, last_seen: null
      }).eq("id", machineId));
    },

    // ---------- Temps réel ----------
    // Appelle onChange() quand une des 4 tables change (RLS : seulement tes données)
    subscribe(onChange) {
      if (!supa || this._canal) return;

      this._canal = supa.channel("broodautomate-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "sales" },    onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "events" },   onChange)
        .subscribe();

      // Canal à part : si la table « audits » n'existe pas encore, les autres tables continuent de se mettre à jour
      this._canalAudits = supa.channel("broodautomate-audits")
        .on("postgres_changes", { event: "*", schema: "public", table: "audits" }, onChange)
        .subscribe();
    }
  };

})();
