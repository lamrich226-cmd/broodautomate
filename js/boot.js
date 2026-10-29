// ============================================================
// BROODAUTOMATE v5 — Démarrage (BA.Boot)
// 1. Connexion au compte (Supabase), comme en v3.2.
// 2. Chargement des données partagées (BA.Store.init) ; au tout premier
//    démarrage, reprise des machines / produits / ventes de la v3.
//    Si la table « ba_state » n'existe pas encore : écran avec le
//    script à coller une fois dans Supabase.
// 3. L'appli (admin ou opérateur) démarre : BA.Shell.init.
// ============================================================

window.BA = window.BA || {};

(function () {
  const t = (k, v) => BA.I18n.t(k, v);
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Script à coller une seule fois dans Supabase (SQL Editor)
  const SQL = `-- Broodautomate v5 : données partagées (admin + appli opérateur)
-- Supabase → SQL Editor → New query → coller → Run (une seule fois).
-- Les tables de la v3 (machines, products, sales, events, audits) ne changent pas.
create table if not exists public.ba_state (
  id          text primary key,
  version     bigint not null default 1,
  data        jsonb  not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.ba_state enable row level security;
drop policy if exists "ba_state_authenticated" on public.ba_state;
create policy "ba_state_authenticated" on public.ba_state
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.ba_state to authenticated;
grant all on public.ba_state to service_role;
do $$ begin
  alter publication supabase_realtime add table public.ba_state;
exception when duplicate_object then null;
end $$;
`;

  function screen(html) {
    let el = document.getElementById("boot");
    if (!el) { el = document.createElement("div"); el.id = "boot"; document.body.appendChild(el); }
    el.innerHTML = `<div class="boot-box">${html}</div>`;
    return el;
  }
  function close() { const el = document.getElementById("boot"); if (el) el.remove(); }
  const langSelect = ctx => `<select id="boot-lang" class="auto-w" aria-label="Langue / Taal / Language">${["fr", "nl", "en"].map(l =>
    `<option value="${l}" ${BA.I18n.lang === l ? "selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select>`;
  function bindLang(ctx, again) {
    const s = document.getElementById("boot-lang");
    if (s) s.onchange = () => { BA.I18n.set(s.value, ctx.role); document.documentElement.lang = BA.I18n.lang; again(); };
  }

  const Boot = {
    SQL,
    async start(ctx) {
      BA.I18n.load(ctx.role);
      document.documentElement.lang = BA.I18n.lang;
      if (BA.DB && BA.DB.isReady()) {
        let session = null;
        try { session = await BA.DB.getSession(); }
        catch (e) { this.login(ctx, t("login_err_other", { e: e.message })); return; }
        if (!session) { this.login(ctx); return; }
        BA.DB.onSignedOut(() => location.reload());
      }
      await this.load(ctx);
    },

    async load(ctx) {
      screen(`<div class="card"><h2>🥖 Broodautomate</h2><p class="note">⏳ ${E(t("loading"))}</p></div>`);
      try {
        await BA.Store.init();
      } catch (e) {
        if (e && e.setup) { this.setup(ctx); return; }
        this.error(ctx, e);
        return;
      }
      close();
      BA.Shell.init(ctx);
      if (ctx.afterInit) { try { ctx.afterInit(); } catch (e) { console.error(e); } }
      if (BA.Store.status().lost && BA.UI) BA.UI.toast(t("sync_lost"), 20000);
    },

    login(ctx, message, email) {
      screen(`<div class="card boot-login">
        <div class="boot-top"><h2>🥖 ${E(t("login_title"))}</h2>${langSelect(ctx)}</div>
        <p class="note">${E(t("login_sub"))} — ${E(t(ctx.role === "admin" ? "role_admin" : "role_op"))}</p>
        ${message ? `<div class="alert err">${E(message)}</div>` : ""}
        <label class="field-col">${E(t("login_email"))}<input id="login-email" type="email" autocomplete="username" value="${E(email || "")}"></label>
        <label class="field-col">${E(t("login_pass"))}<input id="login-pass" type="password" autocomplete="current-password"></label>
        <button class="btn big" id="login-go">${E(t("login_btn"))}</button>
      </div>`);
      bindLang(ctx, () => this.login(ctx, message, (document.getElementById("login-email") || {}).value));
      const go = async () => {
        const em = document.getElementById("login-email").value.trim(), pw = document.getElementById("login-pass").value;
        if (!em || !pw) { this.login(ctx, t("login_err_empty"), em); return; }
        try { await BA.DB.signIn(em, pw); }
        catch (e) { this.login(ctx, /invalid login/i.test(e.message) ? t("login_err_bad") : t("login_err_other", { e: e.message }), em); return; }
        BA.DB.onSignedOut(() => location.reload());
        await this.load(ctx);
      };
      document.getElementById("login-go").onclick = go;
      document.querySelectorAll("#boot input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") go(); }));
      const f = document.getElementById(email ? "login-pass" : "login-email"); if (f) f.focus();
    },

    setup(ctx) {
      screen(`<div class="card boot-setup">
        <div class="boot-top"><h2>🛠 ${E(t("setup_title"))}</h2>${langSelect(ctx)}</div>
        <p>${E(t("setup_text"))}</p>
        <p class="note">${E(t("setup_steps"))}</p>
        <textarea id="setup-sql" class="zone-texte" rows="14" readonly>${E(SQL)}</textarea>
        <div class="carte-actions wrap-actions">
          <button class="btn" id="setup-copy">${E(t("setup_copy"))}</button>
          <button class="btn secondary" id="setup-retry">${E(t("setup_retry"))}</button>
        </div>
        <p class="note">${E(t("setup_v3"))} <a href="v3/index.html">v3/index.html</a></p>
      </div>`);
      bindLang(ctx, () => this.setup(ctx));
      document.getElementById("setup-copy").onclick = async () => {
        const ta = document.getElementById("setup-sql");
        try { await navigator.clipboard.writeText(SQL); } catch (e) { ta.select(); try { document.execCommand("copy"); } catch (e2) { /* rien */ } }
        document.getElementById("setup-copy").textContent = "✅ " + t("setup_copied");
      };
      document.getElementById("setup-retry").onclick = () => this.load(ctx);
    },

    error(ctx, e) {
      screen(`<div class="card">
        <div class="boot-top"><h2>🥖 Broodautomate</h2>${langSelect(ctx)}</div>
        <div class="alert err">${E(t("load_error", { e: e && e.message || e }))}</div>
        <div class="carte-actions"><button class="btn" id="boot-retry">🔄 ${E(t("retry"))}</button></div>
        <p class="note">${E(t("setup_v3"))} <a href="v3/index.html">v3/index.html</a></p>
      </div>`);
      bindLang(ctx, () => this.error(ctx, e));
      document.getElementById("boot-retry").onclick = () => this.load(ctx);
    }
  };

  BA.Boot = Boot;
})();
