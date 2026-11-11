// ============================================================
// BROODAUTOMATE v5.20 — « 🤖 Claude / ChatGPT » (BA.IA)
//
// Sous « Préparer une commande » : deux boutons, Claude et ChatGPT. Un clic copie un
// résumé complet (stock, 8 semaines de ventes, commandes passées, calcul du logiciel,
// jours fériés, alertes, règles de la tournée) ET ouvre le site : il reste à coller (Ctrl+V).
// Rien n'est envoyé tout seul : pas de clé, pas de compte à brancher, pas de coût.
// L'IA conseille ; l'admin décide, rien n'est commandé. Pas d'adresse de rue dans le texte.
// Le texte est toujours en français (langue de l'admin), quelle que soit la langue de l'écran.
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

  // ---- Historique par semaine (v5.20) ----
  // Les W semaines complètes avant aujourd'hui, de la plus ancienne à la plus récente : [{ from, days: [7 clés de jour] }]
  function semaines(s, W) {
    const FC = BA.Forecast, k0 = M.dayKey(s.now), out = [];
    for (let w = W; w >= 1; w--) {
      const from = FC.addDays(k0, -7 * w), days = [];
      for (let d = 0; d < 7; d++) days.push(FC.addDays(from, d));
      out.push({ from, days });
    }
    return out;
  }
  // Une machine : ventes de chaque semaine + total des pains retirés (null si aucune vente connue)
  function histMachine(s, num, sem) {
    let any = false, retires = 0;
    const ventes = sem.map(w => w.days.reduce((a, k) => {
      const r = (s.daily[k] || {})[num];
      if (!r) return a;
      any = true; retires += Math.max(0, r.x || 0);
      return a + (r.s || 0);
    }, 0));
    return any ? { ventes, retires: Math.round(retires) } : null;
  }
  // Toute la flotte : ventes, pains chargés, pains retirés, ventes par type de pain
  function histFlotte(s, sem) {
    return sem.map(w => {
      const o = { from: w.from, ventes: 0, charges: 0, retires: 0, types: {} };
      w.days.forEach(k => {
        const d = s.daily[k] || {};
        Object.keys(d).forEach(num => {
          const r = d[num]; if (!r) return;
          o.ventes += r.s || 0; o.charges += r.l || 0; o.retires += Math.max(0, r.x || 0);
          Object.keys(r.y || {}).forEach(ty => { o.types[ty] = (o.types[ty] || 0) + r.y[ty]; });
        });
      });
      o.ventes = Math.round(o.ventes); o.charges = Math.round(o.charges); o.retires = Math.round(o.retires);
      return o;
    });
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
      const lieu = m.city || ("machine " + m.num);          // v5.20 : la ville seulement, jamais l'adresse (l'IA n'en a pas besoin)
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
      // v5.20 : ventes semaine par semaine (de la plus ancienne à la plus récente) et pains retirés
      const hw = histMachine(s, m.num, semaines(s, (ctx && ctx.F.weeks) || 8));
      if (hw) L.push("- Ventes par semaine (de la plus ancienne à la plus récente) : " + hw.ventes.join(" · ") + " — pains retirés sur la période : " + hw.retires
        + (p && p.nDays != null && p.nDays < ((ctx && ctx.F.weeks) || 8) * 7 ? " — seulement " + p.nDays + " jours de ventes connus (historique court)" : ""));
      if (p && p.src === "manual") {
        // peu d'historique : l'admin a réglé les jours à la main (en % d'une journée normale)
        const man = (s.profileManual || {})[m.num] || [];
        const bits2 = ORDRE.map(i => (BA.Forecast.manualState(ctx, m.num, i).set && man[i] != null) ? JOURS_3[i] + " " + Math.round(man[i]) + " %" : null).filter(Boolean);
        if (bits2.length) L.push("- Réglé à la main (pas assez d'historique), en % d'une journée normale : " + bits2.join(", ") + (p.base ? " · journée normale ≈ " + num1(p.base) + " pains" : ""));
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

    // ---- Historique de la flotte, semaine par semaine (v5.20) ----
    const sem = semaines(s, (ctx && ctx.F.weeks) || 8);
    const flotte = histFlotte(s, sem);
    L.push("");
    L.push("## Les " + sem.length + " dernières semaines, toutes machines ensemble");
    if (!flotte.some(w => w.ventes || w.charges || w.retires)) L.push("Pas encore d'historique de ventes dans le logiciel.");
    else {
      L.push("Semaines de 7 jours (la date est le premier jour ; la dernière semaine finit hier) · ventes · pains chargés · pains retirés");
      flotte.forEach(w => L.push("- " + ddmm(w.from) + " : " + w.ventes + " · " + w.charges + " · " + w.retires));
      const types = {};
      flotte.forEach(w => Object.keys(w.types).forEach(ty => { types[ty] = true; }));
      Object.keys(types).forEach(ty => L.push("- Ventes de " + typeNom(ty) + " par semaine : " + flotte.map(w => w.types[ty] || 0).join(" · ")));
    }

    // ---- Mes dernières commandes (v5.20) ----
    L.push("");
    L.push("## Mes dernières commandes au boulanger");
    const cmds = (s.orders || []).slice(0, 8);
    if (!cmds.length) L.push("Aucune commande enregistrée dans le logiciel pour l'instant.");
    cmds.forEach(od => L.push("- " + F.dt(od.t) + (od.passageAt ? " · passage " + F.dt(od.passageAt) : "") + " · marge " + (od.marginPct || 0) + " % · "
      + ((od.perType || []).map(r => typeNom(r.type) + " " + r.qty).join(", ") || "rien")));

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
    L.push("Le « Calcul du logiciel » est ma référence : ne le refais pas de zéro, CRITIQUE-le à partir de l'historique et de mes dernières commandes.");
    L.push("1. Es-tu d'accord avec le calcul du logiciel ? Si non, dis pourquoi, chiffres à l'appui.");
    L.push("2. Donne-moi un tableau : type de pain · quantité conseillée à commander · différence avec le logiciel. Garde une petite marge de sécurité. Explique en 3 lignes pourquoi.");
    L.push("3. Compare mes dernières commandes avec les ventes et les pains retirés des semaines passées : est-ce que je commande trop, juste assez ou pas assez ?");
    L.push("4. Dis-moi quelles machines risquent d'être vides avant le prochain passage, et lesquelles ont du pain à retirer.");
    L.push("5. Signale ce qui te semble faux, bizarre ou manquant (lecture ancienne, machine hors ligne, historique court, jours réglés à la main).");
    L.push("6. Réponds en français, simplement, court, et vérifie tes additions. Si une information manque, pose-moi UNE question au lieu de deviner.");
    return L.join("\n");
  }

  // ---------------- Copie ----------------
  // v5.20 : la copie « tout de suite » (execCommand) passe d'abord : quand on clique sur Claude / ChatGPT, le nouvel onglet
  // prend la main, et l'ancienne méthode (navigator.clipboard) est alors refusée. Elle reste le plan B.
  async function copyText(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return true;
    } catch (e) { /* plan B */ }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* abandon */ }
    return false;
  }

  // site = "claude" | "chatgpt" (ouvre le site, le lien s'ouvre tout seul) ; sinon : copie seulement
  async function copy(root, site) {
    const s = BA.Store.get(); if (!s) return;
    const o = BA.Shell && BA.Shell.state && BA.Shell.state.order;
    const text = build(s, o);
    const area = root && root.querySelector("textarea");
    if (area) area.value = text;
    if (!site) { const d = root && root.querySelector("details"); if (d) d.open = true; }
    const ok = await copyText(text);
    const nom = site === "chatgpt" ? "ChatGPT" : "Claude";
    if (site) U().toast(ok ? "✅ " + t("ia_opened", { site: nom, n: text.length }) : "⚠️ " + t("ia_opened_manual", { site: nom }), ok ? 9000 : 12000);
    else U().toast(ok ? "✅ " + t("ia_copied", { n: text.length }) : "⚠️ " + t("ia_manual"), ok ? 6000 : 9000);
    if (!ok && area) { const d = root.querySelector("details"); if (d) d.open = true; }
  }

  // Carte à mettre dans une page (admin). opts.plan : la commande est préparée (sinon on le rappelle en une ligne)
  function card(opts) {
    const E = U().E, plan = !opts || opts.plan !== false;
    return `<div class="ia-card" data-ia>
      <div class="ia-txt"><b>🤖 ${E(t("ia_title"))}</b> ${E(t("ia_note2"))}</div>
      ${plan ? "" : `<p class="petit ia-hint">${E(t("ia_noplan"))}</p>`}
      <div class="ia-actions">
        <a class="btn" data-ia-open="claude" href="https://claude.ai/new" target="_blank" rel="noopener">Claude</a>
        <a class="btn" data-ia-open="chatgpt" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a>
        <button class="btn secondary" data-ia-copy>📋 ${E(t("ia_btn"))}</button>
      </div>
      <p class="petit">${E(t("ia_how"))}</p>
      <details class="ia-prev"><summary>${E(t("ia_preview"))}</summary>
        <textarea class="zone-texte" rows="14" readonly aria-label="${E(t("ia_preview"))}"></textarea></details>
    </div>`;
  }

  document.addEventListener("click", e => {
    const tg = e.target && e.target.closest ? e.target : null; if (!tg) return;
    const a = tg.closest("[data-ia-open]");
    if (a) { copy(a.closest("[data-ia]"), a.dataset.iaOpen); return; }       // le lien s'ouvre ensuite tout seul (pas de preventDefault)
    const b = tg.closest("[data-ia-copy]");
    if (b) copy(b.closest("[data-ia]"));
  });

  BA.IA = { build, card, copy };
})();
