// Outil d'audit chargé DANS la page (essais v537) : cherche les textes cassés, les débordements,
// les clés de traduction manquantes, les erreurs JavaScript, et clique sur tout ce qui se clique.
// Rien de ce fichier n'est utilisé par l'appli elle-même.
(function () {
  const A = window.__A = { errs: [], misses: [], logs: [], xss: 0, nav: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- erreurs ----------
  window.addEventListener("error", e => A.errs.push((e.message || "erreur") + (e.filename ? " @" + e.filename.replace(/^.*\//, "") + ":" + e.lineno : "")));
  window.addEventListener("unhandledrejection", e => A.errs.push("promesse rejetée : " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { A.logs.push(a.map(x => x && x.stack ? x.stack.split("\n").slice(0, 3).join(" | ") : String(x)).join(" ")); ce(...a); };
  window.confirm = m => { A.nav.push("confirm: " + m); return true; };
  window.alert = m => { A.nav.push("alert: " + m); };
  window.prompt = m => { A.nav.push("prompt: " + m); return ""; };
  window.open = u => { A.nav.push("open: " + u); return null; };

  // ---------- traductions : toute clé demandée qui n'existe pas ----------
  const I = BA.I18n, D = I.dicts, t0 = I.t;
  I.t = function (k, v) {
    if (typeof k !== "string" || D.fr[k] == null) A.misses.push({ k: String(k), lang: I.lang, view: BA.Shell && BA.Shell.state.view });
    else if (D[I.lang] && D[I.lang][k] == null) A.misses.push({ k, lang: I.lang, view: BA.Shell && BA.Shell.state.view, repli: "fr" });
    return t0.call(I, k, v);
  };

  // ---------- textes cassés ----------
  const BAD = [/\bundefined\b/, /\bNaN\b/, /\[object \w+\]/, /Invalid Date/, /\bInfinity\b/, /\{[a-zA-Z]\w*\}/, /\[\w+:[^\]|]*\|[^\]]*\]/];
  const FR = /\b(les|des|pour|avec|dans|une|aucun|aucune|tiroir|tiroirs|vendus?|semaine|jours|heures|Supprimer|Annuler|Enregistrer|Fermer|Retour|Suivant|Valider|Aujourd'hui|Remplir|commande|livraison)\b/;
  A.roots = () => ["#app-header", "#app-main .view.active", "#modal-root", "#app-tabbar", "#mv-fs-root"].map(s => document.querySelector(s)).filter(Boolean);
  A.scan = (opts) => {
    opts = opts || {};
    const out = { bad: [], fr: [], over: 0, wide: [], modalOver: 0 };
    const seen = new Set();
    for (const r of A.roots()) {
      const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement; if (!p || !p.getClientRects().length) continue;
        if (p.closest("script,style,code,pre,textarea,.raw,.tq-raw,.mono")) continue;
        const s = n.nodeValue; if (!s || !s.trim()) continue;
        for (const re of BAD) { const m = re.exec(s); if (m && !(opts.allowNull && /null/.test(m[0]))) { const c = m[0] + " ← " + s.trim().slice(0, 90); if (!seen.has(c)) { seen.add(c); out.bad.push(c); } } }
        if (opts.lang && opts.lang !== "fr") { const m = FR.exec(s); if (m && !p.closest("[data-machine-name],.addr,.mv-addr")) { const c = m[0] + " ← " + s.trim().slice(0, 70); if (!seen.has(c)) { seen.add(c); out.fr.push(c); } } }
      }
      r.querySelectorAll("[title],[aria-label],[placeholder],[value]").forEach(e => {
        for (const a of ["title", "aria-label", "placeholder"]) { const v = e.getAttribute(a); if (v && BAD.some(re => re.test(v))) { const c = a + "=" + v.slice(0, 80); if (!seen.has(c)) { seen.add(c); out.bad.push(c); } } }
        if (e.tagName === "INPUT" && /NaN|undefined|Infinity/.test(e.value)) out.bad.push("valeur de case = " + e.value);
      });
    }
    const de = document.documentElement;
    out.over = de.scrollWidth - de.clientWidth;
    const W = window.innerWidth;
    const clipped = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox !== "visible") return true; } return false; };
    for (const r of A.roots()) r.querySelectorAll("*").forEach(e => {
      const b = e.getBoundingClientRect();
      if (b.width > 0 && b.right > W + 2 && !clipped(e) && getComputedStyle(e).position !== "fixed") {
        const id = e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
        if (out.wide.length < 6 && !out.wide.some(x => x.startsWith(id))) out.wide.push(id + " → " + Math.round(b.right - W) + "px « " + (e.textContent || "").trim().slice(0, 30) + " »");
      }
    });
    const mb = document.querySelector("#modal-root .modal"); if (mb) out.modalOver = mb.scrollWidth - mb.clientWidth;
    return out;
  };

  // ---------- éléments cliquables ----------
  const SEL = "button, a[href], summary, select, input[type=checkbox], input[type=radio], [role=button], [data-machine], [data-mv-sel], [tabindex='0']";
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  // signature stable d'un élément : balise, id et attributs data (chiffres remplacés par #) ; le texte seulement s'il n'y a rien d'autre
  const sigOf = e => {
    const ks = Object.keys(e.dataset || {}).sort();
    const data = ks.map(k => k + "=" + String(e.dataset[k]).replace(/\d+/g, "#").slice(0, 16)).join(",");
    const txt = (ks.length || e.id) ? "" : (e.getAttribute("aria-label") || e.textContent || "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 28);
    return e.tagName.toLowerCase() + (e.id ? "#" + e.id.replace(/\d+/g, "#") : "") + "[" + data + "]" + txt;
  };
  const SKIP = el => el.id === "btn-logout" || el.id === "more-logout" || el.id === "more-lang" || el.closest("#app-nav,#app-side,#app-tabbar") ||
    (el.tagName === "A" && !/^(#|blob:|data:|javascript:)/.test(el.getAttribute("href") || "") && !el.hasAttribute("download"));
  A.list = (scope) => {
    if (scope === "modal" && !document.querySelector("#modal-root .modal, #mv-fs-root")) scope = "page";
    const roots = scope === "modal" ? [document.querySelector("#modal-root"), document.querySelector("#mv-fs-root")].filter(Boolean) : A.roots();
    const per = {}, out = [];
    for (const r of roots) r.querySelectorAll(SEL).forEach(e => {
      if (!visible(e) || e.disabled || SKIP(e)) return;
      const s = sigOf(e); per[s] = (per[s] || 0) + 1;
      if (per[s] <= 2) out.push({ sig: s, occ: per[s] - 1 });
    });
    return out;
  };
  A.find = (sig, occ, scope) => {
    if (scope === "modal" && !document.querySelector("#modal-root .modal, #mv-fs-root")) scope = "page";
    const roots = scope === "modal" ? [document.querySelector("#modal-root"), document.querySelector("#mv-fs-root")].filter(Boolean) : A.roots();
    let k = 0;
    for (const r of roots) for (const e of r.querySelectorAll(SEL)) { if (!visible(e) || e.disabled || SKIP(e)) continue; if (sigOf(e) === sig) { if (k === occ) return e; k++; } }
    return null;
  };
  A.act = e => {
    if (e.tagName === "SELECT") {
      const opts = [...e.options].filter(o => !o.disabled);
      const next = opts.find(o => o.value !== e.value) || opts[0]; if (!next) return "liste vide";
      e.value = next.value; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
      return "choix " + next.value;
    }
    e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); e.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    e.click(); return "clic";
  };
  // valeurs bizarres dans les cases (vide, négatif, texte, énorme, décimal, HTML)
  const WEIRD = ["", "-5", "abc", "999999", "2.5", "<img src=x onerror=__A.xss++>"];
  A.fill = (scope, k) => {
    const root = scope === "modal" ? (document.querySelector("#modal-root .modal") ? document.querySelector("#modal-root") : document.querySelector("#mv-fs-root") || document.querySelector("#modal-root")) : document.querySelector("#app-main .view.active");
    if (!root) return 0; let n = 0;
    root.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), textarea").forEach(i => {
      if (!visible(i) || i.disabled || i.readOnly) return;
      let v = WEIRD[(k + n) % WEIRD.length];
      if (i.type === "date") v = ["", "2026-02-30", "1999-01-01", "2099-12-31"][(k + n) % 4];
      if (i.type === "datetime-local") v = ["", "2026-13-01T25:00", "2020-01-01T00:00"][(k + n) % 3];
      if (i.type === "time") v = ["", "25:99", "00:00"][(k + n) % 3];
      try { i.value = v; } catch (e) { /* type refusé */ }
      i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    });
    return n;
  };
  A.closeAll = async () => {
    for (let i = 0; i < 3; i++) {
      if (!document.querySelector("#modal-root .modal-back, #mv-fs-root, .mv-pop")) break;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(60);
    }
    const mr = document.getElementById("modal-root"); if (mr && mr.innerHTML) mr.innerHTML = "";
    if (document.getElementById("mv-fs-root") && BA.MachineView.closeFull) BA.MachineView.closeFull();
    document.querySelectorAll("#app-main .mv-wrap.mv-fs [data-mv-full='0']").forEach(q => q.click());
    document.body.classList.remove("mv-fs-on", "side-open");
  };
  A.prefs = null;     // { layout: "cards"|"list", mode: "machine"|"classic", ss: "tab"|"bloc"|"coin" } remis avant chaque clic
  A.setPrefs = () => {
    const p = A.prefs; if (!p) return;
    try { localStorage.setItem("ba_dash_layout", p.layout); localStorage.setItem("ba_sel_style", p.ss || "bloc"); } catch (e) { /* rien */ }
    if (BA.MachineView.mode() !== p.mode) BA.MachineView.setMode(p.mode);
  };
  A.lang = null;     // langue de l'essai : remise si un clic l'a changée (liste « Langue » de la page Plus)
  A.go = async (v) => {
    await A.closeAll(); A.setPrefs(); const S = BA.Shell.state; S.fillQ = ""; S.todoQ = "";
    if (A.lang && BA.I18n.lang !== A.lang) { BA.I18n.set(A.lang, BA.Shell.ctx.role); BA.Shell.build(); }
    BA.Shell.go(v); await sleep(120);
  };

  // ---------- état des données : rien d'impossible ----------
  A.inv = () => {
    const s = BA.Store.get(), p = [];
    const walk = (o, path, depth) => {
      if (depth > 9 || o == null) return;
      if (typeof o === "number" && !isFinite(o)) { p.push("nombre impossible " + path + " = " + o); return; }
      if (typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path + "[" + i + "]", depth + 1)); return; }
      for (const k of Object.keys(o)) walk(o[k], path + "." + k, depth + 1);
    };
    walk(s, "s", 0);
    const ids = new Map();
    (s.machines || []).forEach(m => {
      const ns = new Set();
      (m.sels || []).forEach(sel => {
        if (ns.has(sel.n)) p.push("#" + m.num + " sélection en double " + sel.n); ns.add(sel.n);
        if (!(Number.isInteger(sel.cap) && sel.cap >= 1)) p.push("#" + m.num + "/" + sel.n + " capacité " + sel.cap);
        let q = 0;
        (sel.lots || []).forEach(l => {
          if (!(Number.isInteger(l.qty) && l.qty > 0)) p.push("#" + m.num + "/" + sel.n + " lot " + l.id + " quantité " + l.qty);
          if (!isFinite(l.date)) p.push("#" + m.num + "/" + sel.n + " lot " + l.id + " date " + l.date);
          q += l.qty || 0;
          if (ids.has(l.id)) p.push("lot " + l.id + " en double (#" + m.num + "/" + sel.n + " et " + ids.get(l.id) + ")"); ids.set(l.id, "#" + m.num + "/" + sel.n);
        });
        if (q > sel.cap) p.push("#" + m.num + "/" + sel.n + " " + q + " pains pour " + sel.cap + " places");
        if (typeof sel.price === "number" && sel.price < 0) p.push("#" + m.num + "/" + sel.n + " prix négatif");
      });
    });
    Object.entries(s.daily || {}).forEach(([k, d]) => Object.entries(d || {}).forEach(([n, r]) => {
      ["s", "r", "l", "x", "c"].forEach(f => { if (r && typeof r[f] === "number" && r[f] < -0.001) p.push("chiffres du " + k + " #" + n + " : " + f + " = " + r[f]); });
    }));
    (s.interventions || []).forEach(it => {
      if (!["open", "done", "partial", "cancelled", "canceled"].includes(it.status)) p.push("intervention " + it.id + " statut " + it.status);
    });
    const evIds = new Set(); (s.events || []).forEach(e => { if (evIds.has(e.id)) p.push("alerte en double " + e.id); evIds.add(e.id); });
    return p;
  };
  A.take = () => { const r = { errs: A.errs.splice(0), logs: A.logs.splice(0), xss: A.xss }; A.xss = 0; return r; };
})();
(function () {
  const A = window.__A, sleep = ms => new Promise(r => setTimeout(r, ms));
  // ---------- données de plus : alertes de chaque sorte, remplissages finis / en cours, déplacements, calendrier ----------
  A.enrich = () => {
    const Ac = BA.Actions, M = BA.Model, S = BA.Store;
    const nums = S.get().machines.map(m => m.num);
    Ac.setDoor(nums[0], true); Ac.simulatePower(nums[1]); Ac.simulateTemp(nums[2]); Ac.simulateFas(nums[3]);
    S.update(s => {
      const codes = Object.keys(M.EVENTS);
      codes.forEach((c, i) => { const n = nums[i % nums.length]; const sel = M.machine(s, n).sels[0];
        const e = M.addEvent(s, n, c, { sel: sel.n, type: sel.type, temp: 21.5, msg: "essai " + c, total: 1234, a: 10, b: 5, lost: 2, gained: 1, qty: 2, lotDate: s.now - 50 * M.H, keptAt: s.now - 20 * M.H, off: "10:00", on: "10:05", code: "EA1A", until: s.now + 600000, key: "audit" + c });
        if (i % 3 === 0) { e.resolved = true; e.resolvedAt = s.now; } if (i % 5 === 0) e.archived = true; if (i % 7 === 0) { e.deleted = s.now - 86400000; e.archived = true; } });
    });
    // pains : garder une fois, séparer, retirer, déplacer, demande de déplacement
    const s = S.get(); const withLots = s.machines.filter(m => m.sels.some(z => z.lots.length));
    const m1 = withLots[0], sel1 = m1.sels.find(z => z.lots.length);
    Ac.keepLot(m1.num, sel1.n, sel1.lots[0].id);
    const m2 = withLots[1], sel2 = m2.sels.find(z => z.lots.some(l => l.qty >= 2));
    if (sel2) { Ac.splitLot(m2.num, sel2.n, sel2.lots.find(l => l.qty >= 2).id, 1, Date.now() - 30 * 3600000); }
    const m3 = withLots[2], sel3 = m3.sels.find(z => z.lots.length);
    Ac.removeBread(m3.num, sel3.n, [{ lotId: sel3.lots[0].id, qty: 1 }], "old", "essai audit");
    const m4 = S.get().machines.find(m => { return m.sels.some(z => z.lots.length && m.sels.some(y => y !== z && y.type === z.type && M.qty(y) < y.cap)); });
    if (m4) { const a = m4.sels.find(z => z.lots.length && m4.sels.some(y => y !== z && y.type === z.type && M.qty(y) < y.cap)); const b = m4.sels.find(y => y !== a && y.type === a.type && M.qty(y) < y.cap);
      Ac.requestMove(m4.num, a.n, b.n, a.lots[0].id, 1); }
    // remplissages : un fini, un annulé après l'inventaire, un ouvert à l'étape 2
    const fin = nums[5], part = nums[6], open = nums[7];
    let id = Ac.startIntervention(fin); const mf = M.machine(S.get(), fin);
    Ac.applyInventory(id, Object.fromEntries(mf.sels.map(z => [z.n, Math.max(0, M.qty(z) - 1)])), false);
    Ac.applyRemoval(id, [], "none");
    Ac.applyLoad(id, Object.fromEntries(M.machine(S.get(), fin).sels.map(z => [z.n, z.cap])), Date.now() - 2 * 3600000);
    id = Ac.startIntervention(part); Ac.applyInventory(id, {}, true); Ac.cancelIntervention(id);
    id = Ac.startIntervention(open); Ac.applyInventory(id, {}, true);
    Ac.calendarAdd({ name: "Essai audit", kind: (BA.Forecast.KINDS || ["event"])[0], from: M.dayKey(Date.now() + 3 * 86400000), to: M.dayKey(Date.now() + 4 * 86400000), effect: 20, scope: "all" });
    try { Ac.addYearHolidays(new Date().getFullYear()); } catch (e) { A.errs.push("addYearHolidays : " + e.message); }
    return { events: S.get().events.length, its: S.get().interventions.length, moves: (S.get().moves || []).length };
  };

  // ---------- le « singe » : clique sur tout, dans une page ----------
  A.monkey = async (v, o) => {
    const out = [], seenKey = new Set(); A.stats = { clics: 0, fenetres: 0, clics2: 0 };
    A.prefs = o.prefs || null; A.lang = o.lang || null;
    const note = (where, kind, detail) => { const k = kind + "|" + JSON.stringify(detail).slice(0, 200); if (seenKey.has(k)) return; seenKey.add(k); out.push({ where, kind, detail }); };
    const check = where => {
      const r = A.take();
      if (r.errs.length) note(where, "erreur JS", r.errs.slice(0, 4));
      if (r.logs.length) note(where, "console.error", r.logs.slice(0, 4));
      if (r.xss) note(where, "HTML injecté exécuté (XSS)", r.xss);
      const sc = A.scan({ lang: o.lang, allowNull: v === "technique" || v === "rs232" });
      if (sc.bad.length) note(where, "texte cassé", sc.bad.slice(0, 6));
      if (sc.over > 2) note(where, "la page déborde à droite", sc.over + " px");
      if (sc.modalOver > 2) note(where, "la fenêtre déborde", sc.modalOver + " px");
      if (sc.wide.length) note(where, "élément plus large que l'écran", sc.wide);
      if (sc.fr.length) note(where, "texte français dans une autre langue", sc.fr.slice(0, 6));
      const inv = A.inv(); if (inv.length) note(where, "données impossibles", inv.slice(0, 8));
    };
    await A.go(v); await sleep(300); check(v + " (ouverture)");
    const L1 = A.list("page").filter(x => !(o.skip || []).includes(x.sig)).slice(0, o.max || 60);
    const hasInputs = !!document.querySelector("#app-main .view.active input:not([type=checkbox]):not([type=radio]), #app-main .view.active textarea");
    for (const [i, it] of L1.entries()) {
      for (const pass of hasInputs ? [0, 1] : [0]) {
        await A.go(v); await sleep(120);
        if (pass) A.fill("page", i);
        const e = A.find(it.sig, it.occ, "page"); if (!e) continue;
        if (pass && !/^(BUTTON|A)$/.test(e.tagName)) continue;
        const where = v + " › " + it.sig + (pass ? " (cases bizarres)" : "");
        try { sessionStorage.setItem("__last", JSON.stringify({ v, sig: it.sig })); } catch (x) { /* rien */ }
        try { A.act(e); A.stats.clics++; } catch (x) { note(where, "erreur au clic", x.message); continue; }
        await sleep(220); check(where);
        if (o.depth2 && document.querySelector("#modal-root .modal, #mv-fs-root, #app-main .mv-wrap.mv-fs")) {
          A.stats.fenetres++;
          const L2 = A.list("modal").filter(x => !(o.skip || []).includes(x.sig)).slice(0, o.max2 || 12);
          for (const [j, it2] of L2.entries()) {
            await A.go(v); await sleep(100);
            if (pass) A.fill("page", i);
            const e1 = A.find(it.sig, it.occ, "page"); if (!e1) break;
            try { A.act(e1); } catch (x) { break; }
            await sleep(200);
            A.fill("modal", j);
            const e2 = A.find(it2.sig, it2.occ, "modal"); if (!e2) continue;
            const w2 = where + " › " + it2.sig;
            try { sessionStorage.setItem("__last", JSON.stringify({ v, sig: it2.sig })); } catch (x) { /* rien */ }
            try { A.act(e2); A.stats.clics2++; } catch (x) { note(w2, "erreur au clic", x.message); continue; }
            await sleep(220); check(w2);
          }
        }
      }
    }
    await A.closeAll();
    try { sessionStorage.removeItem("__last"); } catch (x) { /* rien */ }
    return out;
  };
})();
