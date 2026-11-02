// ============================================================
// BROODAUTOMATE v5.4 — « 🤖 Copier pour l'IA » (BA.IA)
//
// Un clic copie un résumé complet (stock, ventes par jour de semaine, jours
// fériés, alertes, règles de la tournée) à coller dans une IA gratuite
// (Claude, ChatGPT…). Rien n'est envoyé tout seul : pas de clé, pas de compte
// à brancher, pas de coût. L'IA conseille ; l'admin décide, rien n'est commandé.
// Le texte est toujours en français (langue de l'admin), quelle que soit la
// langue de l'écran.
// ============================================================

window.BA = window.BA || {};

(function () {
  const M = BA.Model;
  const t = (k, v) => BA.I18n.t(k, v);
  const U = () => BA.UI;
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const JOURS_3 = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const ORDRE = [1, 2, 3, 4, 5, 6, 0];                 // lundi d'abord
  const pct = v => Math.round(v) + " %";
  const num1 = v => String(Math.round(v * 10) / 10).replace(".", ",");

  // Texte d'un jour férié / vacances / fête du calendrier
  function nomEntree(e) {
    if (e.name) return e.name;
    if (e.nameKey) { const x = t(e.nameKey); if (x && x !== e.nameKey) return x; }
    return e.kind === "holiday" ? "jour férié" : e.kind === "school" ? "vacances scolaires" : e.kind === "feast" ? "fête" : "événement";
  }
  const KIND = { holiday: "jour férié", school: "vacances scolaires", feast: "fête", event: "événement" };
  const ddmm = k => k.slice(8, 10) + "/" + k.slice(5, 7);

  // Alertes actives d'une machine (titre venant de la machine ou code de l'alerte)
  function alertes(s, m) {
    const list = s.events.filter(e => e.num === m.num && !e.resolved && !e.archived).map(e => {
      const d = e.data || {};
      return String(d.title || e.code).replace(/\s+/g, " ").slice(0, 90);
    });
    return list.filter((x, i) => list.indexOf(x) === i).slice(0, 12);       // sans doublons
  }

  // Le texte complet. o = état de « Commander » (pour joindre le calcul du logiciel s'il existe)
  function build(s, o) {
    const F = U().F, now = s.now, L = [];
    const typeNom = ty => U().prodText(ty);
    const thr = (s.settings && s.settings.thrHours) || 48;
    L.push("# Aide à la commande de pain — Broodautomate");
    L.push("");
    L.push("## Qui je suis et ce que je te demande");
    L.push("Je gère une vingtaine de distributeurs automatiques de pain (FAS Power Lift) en Belgique. Tu es mon assistant d'approvisionnement : tu me conseilles, JE décide, tu ne passes aucune commande.");
    L.push("");
    L.push("## Comment je travaille");
    L.push("- Je commande au boulanger vers 15 h, je récupère le pain vers 19 h, puis je fais la tournée de chargement le lendemain de 8 h à 10 h. Le boulanger livre 7 jours sur 7.");
    L.push("- Les clients achètent surtout le matin : ce que je commande aujourd'hui sert aux ventes du lendemain.");
    L.push("- Le pain le plus ancien est vendu en premier. Après " + thr + " h, un pain devient « à retirer » (un lot encore bon peut être gardé une seule fois). Mon but : zéro pain jeté ou retourné, sans machine vide.");
    L.push("- Les ventes varient selon le jour : lundi fort, mercredi plus calme (écoles fermées à midi), jours fériés, vacances et fêtes.");
    L.push("");
    L.push("## Situation au " + F.dayLong(now) + " " + F.time(now));

    // ---- Flotte ----
    const all = s.machines.map(m => ({ m, x: M.stats(s, m) }));
    const tot = all.reduce((a, o2) => a + o2.x.total, 0), cap = all.reduce((a, o2) => a + o2.x.cap, 0);
    L.push(all.length + " machines · " + tot + " pains en machine sur " + cap + " places (" + (cap ? pct(tot / cap * 100) : "0 %") + ").");

    // Calendrier et profils (ne bloque rien s'il y a un souci)
    let ctx = null;
    try { ctx = BA.Forecast.context(s); } catch (e) { console.warn("Copier pour l'IA : prévisions", e); }
    L.push("");
    L.push("## Machines");
    all.forEach(({ m, x }) => {
      const lieu = [m.street, m.city].filter(Boolean).join(", ") || ("machine " + m.num);
      const lecture = m.lastSeen ? (M.dayKey(m.lastSeen) === M.dayKey(now) ? "aujourd'hui " : F.dt(m.lastSeen).slice(0, 5) + " ") + F.time(m.lastSeen) : "jamais";
      L.push("");
      L.push("### #" + m.num + " — " + lieu);
      L.push("- Stock : " + x.total + "/" + x.cap + " (" + pct(x.pct) + ") · dernière lecture de la machine : " + lecture + (m.online ? "" : " (hors ligne)"));
      // par type de pain
      const par = {};
      m.sels.forEach(sel => { const p = par[sel.type] || (par[sel.type] = { q: 0, c: 0 }); p.q += M.qty(sel); p.c += sel.cap; });
      const types = Object.keys(par).map(ty => typeNom(ty) + " " + par[ty].q + "/" + par[ty].c);
      if (types.length) L.push("- Par type : " + types.join(" · "));
      const bits = [];
      if (x.oldest != null) bits.push("plus ancien lot : " + F.age(now - x.oldest));
      bits.push("à retirer : " + x.toRemove);
      bits.push("sélections vides : " + x.emptySels);
      L.push("- " + bits.join(" · "));
      // ventes
      const today = (s.daily[M.dayKey(now)] || {})[m.num];
      const rate = M.dailyRate(s, m.num);
      L.push("- Ventes : aujourd'hui " + (today ? today.s : 0) + (rate ? " · moyenne des 7 derniers jours : " + num1(rate) + " par jour" : ""));
      const p = ctx && ctx.prof && ctx.prof[m.num];
      if (p && p.avg && p.avg.some(v => v != null)) {
        L.push("- Ventes moyennes par jour de la semaine (" + (ctx.F.weeks || 8) + " semaines) : " + ORDRE.map(i => JOURS_3[i] + " " + (p.avg[i] == null ? "?" : num1(p.avg[i]))).join(", ")
          + (p.short ? " — historique court, peu fiable" : ""));
        if (p.trend != null && Math.abs(p.trend) >= 0.18) L.push("- Tendance : ventes " + (p.trend > 0 ? "en hausse" : "en baisse") + " de " + pct(Math.abs(p.trend) * 100) + " sur 2 semaines");
      }
      const al = alertes(s, m);
      if (al.length) L.push("- Alertes actives : " + al.join(" ; "));
    });

    // ---- Calendrier ----
    if (ctx) {
      const k0 = M.dayKey(now), k1 = BA.Forecast.addDays(k0, 14);
      const ents = ctx.cal.filter(e => e.to >= k0 && e.from <= k1);
      L.push("");
      L.push("## Jours spéciaux dans les 14 prochains jours");
      if (!ents.length) L.push("Aucun.");
      ents.forEach(e => {
        const eff = Number(e.effect) || 0;
        L.push("- " + (e.from === e.to ? ddmm(e.from) : ddmm(e.from) + " au " + ddmm(e.to)) + " : " + nomEntree(e) + " (" + (KIND[e.kind] || "événement") + "), effet sur les ventes " + (eff > 0 ? "+" : "") + eff + " %" + (e.confirmed ? "" : " — à confirmer"));
      });
    }

    // ---- Calcul du logiciel ----
    const plan = o && o.plan;
    L.push("");
    L.push("## Calcul du logiciel");
    if (plan && plan.perType) {
      L.push("Calcul fait par Broodautomate pour le passage du " + F.dt(o.passageAt) + " (marge " + (o.margin || 0) + " %). À vérifier, ce n'est pas une vérité.");
      L.push("Type · capacité · stock actuel · ventes prévues · stock estimé au passage · à retirer · à commander · avec marge");
      plan.perType.forEach(r => L.push("- " + typeNom(r.type) + " · " + r.cap + " · " + r.stock + " · " + (r.forecast || 0) + " · " + r.after + " · " + r.remove + " · " + r.order + " · " + r.orderWithMargin));
    } else {
      L.push("Pas encore calculé (onglet « Commander » → Préparer une commande). Fais ton propre calcul à partir des données ci-dessus.");
    }

    L.push("");
    L.push("## Ce que je te demande");
    L.push("1. Vérifie ces chiffres et dis-moi ce qui te semble faux, bizarre ou manquant (lecture ancienne, machine hors ligne, historique court…).");
    L.push("2. Propose la quantité à commander au boulanger, par type de pain, pour la tournée de demain matin, avec une petite marge de sécurité. Explique en 3 lignes pourquoi.");
    L.push("3. Dis-moi quelles machines risquent d'être vides avant le prochain passage, et lesquelles ont du pain à retirer.");
    L.push("4. Réponds en français, simplement, court. Si une information manque, pose-moi UNE question au lieu de deviner.");
    return L.join("\n");
  }

  // ---------------- Copie ----------------
  async function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* on essaie autrement */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  async function copy(root) {
    const s = BA.Store.get(); if (!s) return;
    const o = BA.Shell && BA.Shell.state && BA.Shell.state.order;
    const text = build(s, o);
    const area = root && root.querySelector("textarea");
    if (area) { area.value = text; const d = root.querySelector("details"); if (d) d.open = true; }
    const ok = await copyText(text);
    U().toast(ok ? "✅ " + t("ia_copied", { n: text.length }) : "⚠️ " + t("ia_manual"), ok ? 6000 : 9000);
  }

  // Carte à mettre dans une page (admin)
  function card() {
    return `<div class="ia-card" data-ia>
      <div class="ia-head">
        <button class="btn" data-ia-copy>🤖 ${U().E(t("ia_btn"))}</button>
        <div class="ia-txt">${U().E(t("ia_note"))}
          <span class="ia-links"><a href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a> · <a href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a></span></div>
      </div>
      <details class="ia-prev"><summary>${U().E(t("ia_preview"))}</summary>
        <textarea class="zone-texte" rows="14" readonly aria-label="${U().E(t("ia_preview"))}"></textarea></details>
    </div>`;
  }

  document.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest("[data-ia-copy]");
    if (b) copy(b.closest("[data-ia]"));
  });

  BA.IA = { build, card, copy };
})();
