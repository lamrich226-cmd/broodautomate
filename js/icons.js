// ============================================================
// BROODAUTOMATE v5.34 (design-test) — Icônes au même trait partout, à la place des emojis
// Les emojis changent d'un téléphone à l'autre (Samsung, iPhone, PC) et se mélangeaient avec les icônes du menu.
// Ici : un seul jeu d'icônes (24 × 24, trait 1,8, bouts arrondis, comme le menu), et un petit « traducteur »
// qui remplace tout seul, à l'écran, chaque emoji connu par son icône (les textes et les traductions ne changent pas).
// Pas d'icône dans : les listes déroulantes (<option> ne peut pas en contenir), les champs, le code, les graphiques.
// Retour en arrière : retirer ce fichier des deux pages (index.html, operateur.html).
// ============================================================
(function () {
  const BA = window.BA = window.BA || {};
  const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

  const P = {
    alert: '<path d="M12 3.5 21.5 20h-19L12 3.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    trash: '<path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    todo: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/>',
    antenna: '<path d="M12 12v9M8.5 21h7"/><circle cx="12" cy="10" r="1.5"/><path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.6 3.6a9 9 0 0 0 0 12.8M18.4 3.6a9 9 0 0 1 0 12.8"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
    sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
    "trend-up": '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "trend-down": '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 21v-5h-5"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/>',
    bread: '<path d="M4 11.5C4 8 7.6 5.5 12 5.5S20 8 20 11.5c0 1.2-.8 2-1.8 2.2V19a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1v-5.3C4.8 13.5 4 12.7 4 11.5z"/><path d="M9.5 10l1 2M13 9.5l1 2"/>',
    basket: '<path d="M3 10h18l-2 10H5L3 10z"/><path d="M8 10l4-6 4 6M9.5 14v3M14.5 14v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
    save: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    door: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18"/><path d="M15 12.5v.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    bell: '<path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
    "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    euro: '<circle cx="12" cy="12" r="9"/><path d="M15 8.6a4 4 0 1 0 0 6.8M7.5 11h6M7.5 13.5h5"/>',
    signal: '<path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    machine: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M4 8h11M4 13h11M4 18h11M15 2.5v19M17.5 7h.01M17.5 10h.01"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 4v16"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5M9 13v1M15 13v1M9.5 17h5"/><circle cx="12" cy="3.8" r="1.2"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    factory: '<path d="M3 21V10l6 4v-4l6 4V6h6v15H3z"/><path d="M7 17h2M12 17h2M17 17h1"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.6a4.2 4.2 0 0 1-.5 8.4H7z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    skip: '<path d="M5 5l10 7-10 7V5zM19 5v14"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3-.5-3 .5-5.5.5-8z"/>',
    eraser: '<path d="M8 20h12"/><path d="M4.6 15.4 13.6 6.4a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 20H8.8l-4.2-4.2a.3.3 0 0 1 0-.4z"/><path d="M9 11l5 5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12h.01"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9z"/><path d="M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01"/>',
    truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5H18l3.5 3.5V16h-8"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11l2-8H6.5"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><path d="M7.5 7.5h.01"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    pointer: '<path d="M5 3l14 7-6 2-2 6L5 3z"/>',
    "phone-off": '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M3 3l18 18M11 18h2"/>',
    clip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    ruler: '<path d="M3 16 16 3l5 5L8 21l-5-5z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    thumb: '<path d="M7 10v11H4V10h3zM7 10l4-7a2.3 2.3 0 0 1 2.5 2.7L13 9h5.5a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7"/>',
    empty: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6L5.5 5z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>'
  };
  // anciens noms utilisés par le Dashboard (« À faire aujourd'hui »)
  const ALIAS = { i_door: "door", i_plug: "plug", i_alert: "alert", i_empty: "empty", i_old: "hourglass", i_ban: "ban", i_target: "target",
    i_download: "download", i_check: "check", i_machine: "machine", i_table: "table", i_signal: "signal", i_bread: "bread", i_receipt: "receipt", i_euro: "euro" };
  const cache = {};
  function get(name) {
    const k = ALIAS[name] || name;
    if (!P[k]) return "";
    return cache[k] || (cache[k] = svg(P[k]));
  }

  // emoji → [icône, couleur] ; couleur : ok (vert), warn (orange), bad (rouge), low (jaune), off (gris), info (bleu), "" = couleur du texte
  // Les flèches de texte (→, ←, ↳, ▲, ▼…) restent du texte.
  const MAP = {
    "⚠": ["alert", "warn"], "⏳": ["hourglass", ""], "⌛": ["hourglass", ""], "✔": ["check", "ok"], "✓": ["check", "ok"], "✅": ["check-circle", "ok"],
    "⛔": ["ban", "bad"], "✖": ["x", ""], "✕": ["x", ""], "❌": ["x-circle", "bad"], "🗑": ["trash", ""], "➕": ["plus", ""], "➖": ["minus", ""],
    "📋": ["clipboard", ""], "📡": ["antenna", ""], "🧾": ["receipt", ""], "📦": ["package", ""], "📥": ["download", ""], "📤": ["upload", ""],
    "🎉": ["sparkle", "ok"], "🆕": ["sparkle", "info"], "🧠": ["sparkle", ""], "📈": ["trend-up", ""], "📉": ["trend-down", ""], "📊": ["chart", ""],
    "🔄": ["refresh", ""], "🔁": ["refresh", ""], "🔌": ["plug", ""], "🍞": ["bread", ""], "🥖": ["bread", ""], "🧺": ["basket", ""],
    "🔍": ["search", ""], "🔎": ["search", ""], "🔑": ["key", ""], "💾": ["save", ""], "🚪": ["door", ""], "📅": ["calendar", ""], "📆": ["calendar", ""],
    "🔔": ["bell", ""], "⚡": ["zap", ""], "⬆": ["arrow-up", ""], "⬇": ["arrow-down", ""], "↩": ["undo", ""], "↺": ["undo", ""], "⇄": ["swap", ""],
    "🔀": ["swap", ""], "💶": ["euro", ""], "📶": ["signal", ""], "⚙": ["sliders", ""], "🕒": ["clock", ""], "⏰": ["clock", ""], "⏱": ["clock", ""],
    "🧩": ["machine", ""], "🤖": ["bot", ""], "📂": ["folder", ""], "🗂": ["folder", ""], "☰": ["list", ""], "▦": ["grid", ""], "🌍": ["globe", ""],
    "🌐": ["globe", ""], "🏭": ["factory", ""], "☁": ["cloud", ""], "🔧": ["wrench", ""], "🛠": ["wrench", ""], "🌙": ["moon", ""], "☀": ["sun", ""],
    "⛶": ["maximize", ""], "🌡": ["thermo", ""], "📨": ["mail", ""], "💳": ["card", ""], "🧪": ["flask", ""], "🖥": ["monitor", ""], "💻": ["monitor", ""],
    "⏭": ["skip", ""], "✂": ["scissors", ""], "🧮": ["calculator", ""], "🔥": ["flame", "warn"], "🧹": ["eraser", ""], "🎯": ["target", ""],
    "📜": ["file", ""], "🎨": ["palette", ""], "🚐": ["truck", ""], "🛒": ["cart", ""], "🏷": ["tag", ""], "✏": ["pencil", ""], "💡": ["bulb", ""],
    "🎒": ["package", ""], "📍": ["pin", ""], "👆": ["pointer", ""], "📵": ["phone-off", ""], "📎": ["clip", ""], "🔒": ["lock", ""], "📏": ["ruler", ""],
    "🔢": ["hash", ""], "👍": ["thumb", ""],
    // pastilles de couleur → petit point de la couleur d'état
    "🟢": ["dot", "ok"], "🔴": ["dot", "bad"], "🟠": ["dot", "warn"], "🟡": ["dot", "low"], "⚪": ["dot", "off"], "🔵": ["dot", "info"]
  };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
  const RE = new RegExp("(" + KEYS.map(esc).join("|") + ")\\uFE0F?", "gu");
  const RE1 = new RegExp("(?:" + KEYS.map(esc).join("|") + ")", "u");
  const SKIP = "script,style,textarea,input,select,option,code,pre,svg,canvas,title,[data-no-ei]";

  // l'icône se voit ; l'emoji d'origine reste dans le texte, invisible (lecteurs d'écran, copier-coller, recherche dans la page).
  // Il est rangé DANS l'icône (position: relative) : sinon, dans un tableau qui défile, il « s'échappait » et la page débordait à droite.
  function iconNode(ch, full) {
    const [name, tone] = MAP[ch];
    const sp = document.createElement("span");
    if (name === "dot") sp.className = "ei-dot" + (tone ? " ei-" + tone : "");
    else { sp.className = "ei" + (tone ? " ei-" + tone : ""); sp.innerHTML = get(name); }   // le dessin lui-même est aria-hidden
    const keep = document.createElement("span");
    keep.className = "ei-t"; keep.setAttribute("data-no-ei", ""); keep.textContent = full;
    sp.appendChild(keep);
    return sp;
  }
  function textNode(tn) {
    const v = tn.nodeValue;
    if (!v || !RE1.test(v)) return;
    const p = tn.parentElement;
    if (!p || p.closest(SKIP)) return;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(v))) {
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      frag.appendChild(iconNode(m[1], m[0]));
      last = m.index + m[0].length;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(frag, tn);
  }
  function decorate(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && root.closest && root.closest(SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => RE1.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const list = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
    list.forEach(textNode);
  }
  let obs = null;
  function start() {
    if (obs || !document.body || !window.MutationObserver) return;
    decorate(document.body);
    // le traducteur passe juste après chaque changement de l'écran, avant l'affichage : pas d'emoji qui « clignote »
    obs = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === "characterData") textNode(r.target);
        else r.addedNodes.forEach(n => { if (n.isConnected) decorate(n); });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  BA.Icons = { get, has: n => !!P[ALIAS[n] || n], decorate, start, MAP };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
