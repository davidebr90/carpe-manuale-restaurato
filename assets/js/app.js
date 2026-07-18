/* MAN2026 v3 — App shell. Vanilla JS, file:// safe. */
(function () {
  'use strict';

  const THEME_KEY = 'man2026.theme';
  const SIDEBAR_KEY = 'man2026.sidebar';
  const SECTIONS_KEY = 'man2026.sections';
  const root = document.documentElement;

  // --- TEMA GLOBALE PERSISTENTE ----------------------------------
  // Strategia triple-store: cookie + localStorage + sessionStorage.
  // Cookie funziona anche tra pagine file:// in alcuni browser; localStorage
  // è condiviso per origin (origin "null" su file:// in molti browser);
  // sessionStorage copre i casi in cui localStorage è bloccato (privato).
  // Le tre fonti vengono lette in cascata; la prima valida vince.
  // ----------------------------------------------------------------
  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\\/+^]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function writeCookie(name, value) {
    try {
      // 1 anno di durata, path=/, SameSite=Lax — funziona via http(s); su file:// nei browser principali è ignorato ma non genera errore.
      var d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    } catch (e) {}
  }
  function readTheme() {
    // Priorità: cookie → localStorage → sessionStorage
    var t = readCookie(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (t === 'light' || t === 'dark') return t;
    try { t = sessionStorage.getItem(THEME_KEY); } catch (e) {}
    if (t === 'light' || t === 'dark') return t;
    return null;
  }
  function writeTheme(t) {
    writeCookie(THEME_KEY, t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    try { sessionStorage.setItem(THEME_KEY, t); } catch (e) {}
  }

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    writeTheme(t);
  }
  function initTheme() {
    var t = readTheme();
    if (!t) {
      // Prima visita: usa la preferenza di sistema operativo
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', t);
    // Non scriviamo qui: scriviamo solo quando è una scelta esplicita o
    // quando la preferenza di sistema viene applicata per la prima volta.
    // Però ri-allineiamo gli store (idempotente) per propagare ovunque.
    writeTheme(t);
  }
  initTheme();

  // Sincronizza eventuali altre tab/pagine aperte: se localStorage cambia
  // (toggle in un'altra pagina), aggiorna anche questa istantaneamente.
  window.addEventListener('storage', function (e) {
    if (e && e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
      root.setAttribute('data-theme', e.newValue);
    }
  });
  // Espone API globale (utile per pagine speciali / E1 tool / ecc.)
  window.MAN2026_THEME = {
    get: readTheme,
    set: applyTheme,
    KEY: THEME_KEY
  };

  function getDepth() {
    const m = document.querySelector('meta[name="man2026-depth"]');
    return m ? parseInt(m.content, 10) : 0;
  }
  function rel(p) {
    const d = getDepth();
    return d === 0 ? p : '../'.repeat(d) + p;
  }
  window.MAN2026_REL = rel;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    const app = document.querySelector('.app');
    if (!app) return;

    let sidebarPref = null;
    try { sidebarPref = localStorage.getItem(SIDEBAR_KEY); } catch (e) {}
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (sidebarPref === 'open' || (sidebarPref == null && isDesktop)) {
      app.classList.add('sidebar-default-open');
    }

    const menuBtn = document.getElementById('menu-btn');
    const backdrop = document.querySelector('.sidebar-backdrop');

    function toggleSidebar() {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        app.classList.toggle('sidebar-default-open');
        try { localStorage.setItem(SIDEBAR_KEY,
          app.classList.contains('sidebar-default-open') ? 'open' : 'closed'); } catch (e) {}
      } else {
        app.classList.toggle('sidebar-open');
      }
    }

    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', function () {
      app.classList.remove('sidebar-open');
    });

    document.querySelectorAll('.sidebar a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (!window.matchMedia('(min-width: 1024px)').matches) {
          app.classList.remove('sidebar-open');
        }
      });
    });

    let sectionsState = {};
    try { sectionsState = JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}'); } catch (e) {}
    // Default: tutte le sezioni collassate (tranne quella che contiene la pagina attiva)
    document.querySelectorAll('.sidebar-section').forEach(function (sec) {
      const id = sec.dataset.section;
      if (!id) return; // la sezione "Home" non ha id -> no collapse
      // Se l'utente ha uno stato salvato, rispettalo; altrimenti: collassa
      if (sectionsState[id] === 'expanded') {
        sec.classList.remove('collapsed');
      } else {
        sec.classList.add('collapsed');
      }
      const h = sec.querySelector('.sidebar-section-header');
      if (h) h.addEventListener('click', function () {
        sec.classList.toggle('collapsed');
        sectionsState[id] = sec.classList.contains('collapsed') ? 'collapsed' : 'expanded';
        try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(sectionsState)); } catch (e) {}
      });
    });

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      const cur = root.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // ---------- Active link (match sul path assoluto, non solo filename) ----------
    // Confrontiamo i path URL risolti per determinare quale link corrisponde a questa pagina.
    const herePath = (function () {
      try { return new URL(location.href).pathname.toLowerCase(); }
      catch (e) { return location.pathname.toLowerCase(); }
    })();
    document.querySelectorAll('.sidebar a.nav-link').forEach(function (a) {
      // Clean flag set by server-rendered is-active
      a.classList.remove('is-active');
      const h = a.getAttribute('href');
      if (!h) return;
      try {
        const u = new URL(h, location.href);
        const uPath = u.pathname.toLowerCase();
        if (uPath === herePath) a.classList.add('is-active');
      } catch (e) {
        // fallback: match esatto sul filename solo se herePath termina così
        const name = h.split('?')[0].split('#')[0].split('/').pop().toLowerCase();
        if (name && herePath.endsWith('/' + name)) a.classList.add('is-active');
      }
    });
    // Espande automaticamente la sezione attiva (e collassa le altre se non è stata
    // toccata manualmente)
    const activeLink = document.querySelector('.sidebar a.nav-link.is-active');
    if (activeLink) {
      const sec = activeLink.closest('.sidebar-section');
      if (sec) sec.classList.remove('collapsed');
      // Se è dentro un sidebar-macro (es. GdM), marcalo come "in-section"
      // per tenerlo sempre aperto e fermare l'animazione "onde".
      const macro = activeLink.closest('.sidebar-macro');
      if (macro) macro.classList.add('is-active-section');
    }

    // Mobile/touch: tap sull'header del macro apre/chiude (no hover)
    document.querySelectorAll('.sidebar-macro[data-macro="gdm"], .sidebar-macro[data-macro="carpe"], .sidebar-macro[data-macro="home"]').forEach(function (macro) {
      const header = macro.querySelector('.sidebar-macro-header');
      if (!header) return;
      header.addEventListener('click', function () {
        if (macro.classList.contains('is-active-section')) return; // sempre aperto
        macro.classList.toggle('is-tap-open');
      });
    });

    // ----------------------------------------------------------------
    // ANIMAZIONI VIVE: tecnica "smooth wave" CodePen-style.
    // Un <svg> con un <path> riusato 4 volte tramite <use>, ognuno
    // sfasato e animato a velocità diverse. Il movimento è dato da
    // @keyframes move-forever che fa traslare la x da -90 a +85 in un
    // ciclo perfetto (la curva ripete a 90px). 100% CSS3 + SVG, nessun
    // background-image, nessun conflitto con le regole base.
    // ----------------------------------------------------------------
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK  = 'http://www.w3.org/1999/xlink';

    function buildWaveSvg(uid, pathColor) {
      // Crea SVG inline DOM (NON innerHTML, perché xlink:href deve passare)
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'macro-wave-svg');
      svg.setAttribute('viewBox', '0 24 150 28');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');

      // Definizione del path (riusato 4 volte)
      const defs = document.createElementNS(SVG_NS, 'defs');
      const wavePath = document.createElementNS(SVG_NS, 'path');
      wavePath.setAttribute('id', uid);
      // Onda sinusoidale "pulita" che ripete ogni 90 unità
      wavePath.setAttribute('d',
        'M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z'
      );
      defs.appendChild(wavePath);
      svg.appendChild(defs);

      // 4 strati con velocità e opacità progressive
      const layers = [
        { delay: '-2s',  dur: '7s',  opacity: 0.7,  fill: pathColor.l1, y: 0 },
        { delay: '-3s',  dur: '10s', opacity: 0.5,  fill: pathColor.l2, y: 3 },
        { delay: '-4s',  dur: '13s', opacity: 0.3,  fill: pathColor.l3, y: 5 },
        { delay: '-5s',  dur: '20s', opacity: 1.0,  fill: pathColor.l4, y: 7 }
      ];
      layers.forEach(function (l, i) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'macro-wave-parallax macro-wave-parallax--' + (i + 1));
        // animateTransform: traslazione orizzontale infinita
        const animTr = document.createElementNS(SVG_NS, 'animateTransform');
        animTr.setAttribute('attributeName', 'transform');
        animTr.setAttribute('attributeType', 'XML');
        animTr.setAttribute('type', 'translate');
        animTr.setAttribute('values', '-90 ' + l.y + '; 85 ' + l.y);
        animTr.setAttribute('dur', l.dur);
        animTr.setAttribute('begin', l.delay);
        animTr.setAttribute('repeatCount', 'indefinite');
        animTr.setAttribute('calcMode', 'linear');
        g.appendChild(animTr);
        const useEl = document.createElementNS(SVG_NS, 'use');
        useEl.setAttributeNS(XLINK, 'xlink:href', '#' + uid);
        useEl.setAttribute('href', '#' + uid);
        useEl.setAttribute('fill', l.fill);
        useEl.setAttribute('fill-opacity', l.opacity);
        g.appendChild(useEl);
        svg.appendChild(g);
      });
      return svg;
    }

    document.querySelectorAll('.sidebar-macro[data-macro="gdm"]').forEach(function (macro, idx) {
      // Pulizia eventuale anim vecchia
      const old = macro.querySelector('.gdm-wave-anim, .macro-wave-wrap');
      if (old) old.remove();
      const wrap = document.createElement('span');
      wrap.className = 'macro-wave-wrap macro-wave-wrap--gdm';
      wrap.setAttribute('aria-hidden', 'true');
      const svg = buildWaveSvg('gdm-wave-' + idx, {
        l1: '#2a5285', l2: '#7eaadc', l3: '#b8541e', l4: '#1f3a64'
      });
      wrap.appendChild(svg);
      macro.insertBefore(wrap, macro.firstChild);
    });

    document.querySelectorAll('.sidebar-macro[data-macro="carpe"]').forEach(function (macro, idx) {
      const old = macro.querySelector('.carpe-sand-anim, .macro-wave-wrap');
      if (old) old.remove();
      const wrap = document.createElement('span');
      wrap.className = 'macro-wave-wrap macro-wave-wrap--carpe';
      wrap.setAttribute('aria-hidden', 'true');
      // Per Carpe usiamo le stesse onde ma in palette oro/sabbia
      const svg = buildWaveSvg('carpe-wave-' + idx, {
        l1: '#eecb74', l2: '#b8541e', l3: '#5a3a18', l4: '#c9923c'
      });
      wrap.appendChild(svg);
      macro.insertBefore(wrap, macro.firstChild);
    });

    // === HOME: cielo con nuvole grigie che scorrono ===
    function buildCloudsSvg(uid) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'macro-clouds-svg');
      svg.setAttribute('viewBox', '0 0 200 80');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      // Definizione di una nuvoletta riusabile (CAPOVOLTA: cumuli verso l'alto,
      // base piatta in basso che "poggia" sul cielo come fossero nuvole pendenti
      // dal soffitto del macro). Coordinate Y crescenti vanno verso il basso.
      const defs = document.createElementNS(SVG_NS, 'defs');
      const cloud = document.createElementNS(SVG_NS, 'path');
      cloud.setAttribute('id', uid);
      // 5 archi che salgono (cumuli sopra la base): linea base in basso, bumps verso y bassi
      // Y minore = più in alto. Partiamo da y=18 (base), bumps a y=2/8/12 (sopra).
      cloud.setAttribute('d',
        'M0 18 Q6 6 16 10 Q22 -2 34 4 Q44 -4 52 8 Q62 4 66 14 Q72 10 76 18 Z'
      );
      defs.appendChild(cloud);
      svg.appendChild(defs);

      // 4 nuvole con velocità, dimensioni, opacità diverse
      const layers = [
        { delay: '-1s', dur: '22s', y: 8,  scale: 1.0, opacity: 0.55, fill: '#9aa5b4' },
        { delay: '-7s', dur: '28s', y: 22, scale: 1.4, opacity: 0.40, fill: '#8d97a5' },
        { delay: '-3s', dur: '34s', y: 38, scale: 0.8, opacity: 0.65, fill: '#b0bac8' },
        { delay: '-12s', dur: '40s', y: 5, scale: 1.7, opacity: 0.30, fill: '#7d8694' }
      ];
      layers.forEach(function (l, i) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'macro-cloud-parallax macro-cloud-parallax--' + (i + 1));
        const animTr = document.createElementNS(SVG_NS, 'animateTransform');
        animTr.setAttribute('attributeName', 'transform');
        animTr.setAttribute('attributeType', 'XML');
        animTr.setAttribute('type', 'translate');
        // Da -80 (nascosta a sx) a +220 (uscita a dx) — più ampio della viewport per loop fluido
        animTr.setAttribute('values', '-80 ' + l.y + '; 220 ' + l.y);
        animTr.setAttribute('dur', l.dur);
        animTr.setAttribute('begin', l.delay);
        animTr.setAttribute('repeatCount', 'indefinite');
        animTr.setAttribute('calcMode', 'linear');
        g.appendChild(animTr);
        const useEl = document.createElementNS(SVG_NS, 'use');
        useEl.setAttributeNS(XLINK, 'xlink:href', '#' + uid);
        useEl.setAttribute('href', '#' + uid);
        useEl.setAttribute('fill', l.fill);
        useEl.setAttribute('fill-opacity', l.opacity);
        useEl.setAttribute('transform', 'scale(' + l.scale + ')');
        g.appendChild(useEl);
        svg.appendChild(g);
      });
      return svg;
    }

    document.querySelectorAll('.sidebar-macro[data-macro="home"]').forEach(function (macro, idx) {
      const old = macro.querySelector('.macro-wave-wrap, .macro-clouds-wrap');
      if (old) old.remove();
      const wrap = document.createElement('span');
      wrap.className = 'macro-wave-wrap macro-clouds-wrap';
      wrap.setAttribute('aria-hidden', 'true');
      const svg = buildCloudsSvg('home-cloud-' + idx);
      wrap.appendChild(svg);
      macro.insertBefore(wrap, macro.firstChild);
    });

    const toTop = document.getElementById('to-top');
    if (toTop) {
      // Spostiamo il bottone come ultimo figlio diretto di <body>, in modo da
      // evitare che venga "catturato" da regole CSS legacy (es. <footer> o un
      // wrapper con position:relative) che ne alterino il fixed-positioning.
      try {
        if (toTop.parentNode !== document.body || toTop !== document.body.lastElementChild) {
          document.body.appendChild(toTop);
        }
      } catch (e) {}

      // Pulisci eventuali inline style residui (vecchi script o estensioni del browser).
      function purgeInlineStyles() {
        if (toTop.hasAttribute('style')) toTop.removeAttribute('style');
        const innerSvg = toTop.querySelector('svg');
        if (innerSvg && innerSvg.hasAttribute('style')) innerSvg.removeAttribute('style');
      }
      purgeInlineStyles();

      // Alcune estensioni del browser (e librerie legacy) re-iniettano lo style
      // dopo ogni ri-render. Usiamo un MutationObserver permanente per ripulire
      // l'attributo "style" ogni volta che cambia.
      try {
        const obs = new MutationObserver(function (mutations) {
          for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'style') {
              if (toTop.hasAttribute('style')) toTop.removeAttribute('style');
            }
          }
        });
        obs.observe(toTop, { attributes: true, attributeFilter: ['style'] });
        // Ripeti la pulizia anche dopo i tipici momenti di re-injection.
        [50, 200, 500, 1000, 2000, 4000].forEach(function (ms) {
          setTimeout(purgeInlineStyles, ms);
        });
      } catch (e) {}

      window.addEventListener('scroll', function () {
        if (window.scrollY > 400) toTop.classList.add('is-visible');
        else toTop.classList.remove('is-visible');
      });
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    initSearch();
    initSearchHighlight();
    // Le seguenti funzioni in passato iniettavano inline style sulle icone — ora
    // abbandonate in favore del CSS (a specificità massima). Mantenute come no-op
    // per evitare ReferenceError se un asset esterno le richiama.
    if (typeof initIconSizing === 'function') initIconSizing();
    if (typeof initResponsiveTables === 'function') initResponsiveTables();
    if (typeof initTableScrollArrows === 'function') initTableScrollArrows();

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const inp = document.getElementById('search-input');
        if (inp) { inp.focus(); inp.select(); }
      } else if (e.key === '/' && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
        const inp = document.getElementById('search-input');
        if (inp && document.activeElement !== inp) {
          e.preventDefault(); inp.focus();
        }
      } else if (e.key === 'Escape') {
        const r = document.getElementById('search-results');
        if (r) r.classList.remove('is-open');
        const inp = document.getElementById('search-input');
        if (inp && document.activeElement === inp) inp.blur();
      }
    });
  });

  /* ============================================================
     SEARCH
     ============================================================ */
  function initSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    let activeIdx = -1;
    let lastResults = [];

    function getIndex() { return window.MAN2026_INDEX || []; }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function highlight(text, q) {
      const safe = escapeHtml(text);
      if (!q) return safe;
      const parsed = parseQuery(q);
      const terms = [];
      for (const ph of parsed.phrases) terms.push(ph);
      for (const tk of parsed.tokens) terms.push(tk);
      if (!terms.length) return safe;
      const escaped = terms.map(function (t) {
        return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      try {
        const re = new RegExp('(' + escaped.join('|') + ')', 'gi');
        return safe.replace(re, '<mark>$1</mark>');
      } catch (e) { return safe; }
    }

    /**
     * Parser query con supporto frasi esatte fra virgolette.
     * Input: 'foo "bar baz" qux'
     * Output: { phrases: ['bar baz'], tokens: ['foo', 'qux'] }
     */
    function parseQuery(q) {
      const phrases = [];
      const tokens = [];
      // Estrae segmenti "tra virgolette" (supporta " e " e '' intelligenti)
      const re = /"([^"]+)"|'([^']+)'|[“]([^”]+)[”]/g;
      let rest = q;
      let m;
      const normalized = q
        .replace(/[“”]/g, '"')   // curly double quotes
        .replace(/[‘’]/g, "'");  // curly single quotes
      rest = normalized;
      while ((m = /"([^"]+)"|'([^']+)'/g.exec(rest)) !== null) {
        const phrase = (m[1] || m[2] || '').trim().toLowerCase();
        if (phrase) phrases.push(phrase);
        rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
      }
      const rem = rest.toLowerCase().split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
      for (const t of rem) tokens.push(t);
      return { phrases: phrases, tokens: tokens, raw: q };
    }

    function search(q) {
      const idx = getIndex();
      if (!q || !idx.length) return [];
      const parsed = parseQuery(q);
      if (!parsed.phrases.length && !parsed.tokens.length) return [];
      const scored = [];
      for (let i = 0; i < idx.length; i++) {
        const it = idx[i];
        const title = (it.title || '').toLowerCase();
        const section = (it.section || '').toLowerCase();
        const body = (it.body || '').toLowerCase();
        const hay = title + ' \n ' + section + ' \n ' + body;
        let score = 0;
        let allMatch = true;
        // Frasi esatte: devono comparire come substring contigue
        for (const ph of parsed.phrases) {
          if (hay.indexOf(ph) < 0) { allMatch = false; break; }
          if (title.indexOf(ph) >= 0) score += 20;
          if (section.indexOf(ph) >= 0) score += 8;
          score += 5;
        }
        if (!allMatch) continue;
        // Token singoli
        for (const tk of parsed.tokens) {
          if (hay.indexOf(tk) < 0) { allMatch = false; break; }
          if (title.indexOf(tk) >= 0) score += 10;
          if (title.indexOf(tk) === 0) score += 5;
          if (section.indexOf(tk) >= 0) score += 4;
          score += 1;
        }
        if (!allMatch) continue;
        // Snippet: prefer frase se c'è, altrimenti primo token
        const bodyOrig = it.body || '';
        const lower = bodyOrig.toLowerCase();
        let focus = (parsed.phrases[0] || parsed.tokens[0] || '');
        const pos = lower.indexOf(focus);
        let snippet = '';
        if (pos >= 0) {
          const start = Math.max(0, pos - 60);
          const end = Math.min(bodyOrig.length, pos + focus.length + 100);
          snippet = (start > 0 ? '... ' : '') + bodyOrig.substring(start, end) + (end < bodyOrig.length ? ' ...' : '');
        } else {
          snippet = bodyOrig.substring(0, 200);
        }
        scored.push({ it: it, snippet: snippet, score: score, query: parsed });
      }
      scored.sort(function (a, b) { return b.score - a.score; });
      return scored.slice(0, 25);
    }

    // Expose the parser for initSearchHighlight
    window.MAN2026_PARSE_QUERY = parseQuery;

    function render(items, q) {
      if (!q) { results.classList.remove('is-open'); results.innerHTML = ''; return; }
      const idx = getIndex();
      if (!idx.length) {
        results.innerHTML = '<div class="search-empty">Indice non disponibile</div>';
        results.classList.add('is-open');
        return;
      }
      if (!items.length) {
        results.innerHTML = '<div class="search-empty">Nessun risultato per "<strong>' + escapeHtml(q) + '</strong>"</div>';
        results.classList.add('is-open');
        return;
      }
      const qEnc = encodeURIComponent(q);
      const html = items.map(function (entry, i) {
        const it = entry.it;
        return '<a class="search-result" href="' + rel(it.url) + '?q=' + qEnc + '" data-idx="' + i + '">' +
          '<div class="search-result-meta">' + escapeHtml(it.section || '-') + '</div>' +
          '<div class="search-result-title">' + highlight(it.title, q) + '</div>' +
          (entry.snippet ? '<div class="search-result-snippet">' + highlight(entry.snippet, q) + '</div>' : '') +
          '</a>';
      }).join('');
      results.innerHTML = html;
      results.classList.add('is-open');
    }

    input.addEventListener('input', function () {
      const q = input.value.trim();
      lastResults = search(q);
      activeIdx = -1;
      render(lastResults, q);
    });

    input.addEventListener('keydown', function (e) {
      const items = results.querySelectorAll('.search-result');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(items.length - 1, activeIdx + 1);
        updateActive(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(0, activeIdx - 1);
        updateActive(items);
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0 && items[activeIdx]) {
          e.preventDefault();
          window.location.href = items[activeIdx].href;
        } else if (lastResults.length) {
          e.preventDefault();
          const q = input.value.trim();
          window.location.href = rel(lastResults[0].it.url) + '?q=' + encodeURIComponent(q);
        }
      }
    });

    function updateActive(items) {
      items.forEach(function (el, i) {
        if (i === activeIdx) {
          el.classList.add('is-active');
          el.scrollIntoView({ block: 'nearest' });
        } else el.classList.remove('is-active');
      });
    }

    document.addEventListener('click', function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        results.classList.remove('is-open');
      }
    });
    input.addEventListener('focus', function () {
      if (input.value.trim()) results.classList.add('is-open');
    });
  }

  /* ============================================================
     SEARCH HIGHLIGHT IN PAGE (?q=...)
     ============================================================ */
  function initSearchHighlight() {
    let q = '';
    try {
      const params = new URLSearchParams(location.search);
      q = (params.get('q') || '').trim();
    } catch (e) { return; }
    if (!q) return;

    // Trova il container content (può essere .content o .mht-content)
    const containers = document.querySelectorAll('main .content, main .mht-content');
    if (!containers.length) return;

    // Se disponibile, usa il parser con supporto frasi esatte
    const parser = window.MAN2026_PARSE_QUERY;
    let terms = [];
    if (parser) {
      const p = parser(q);
      terms = p.phrases.concat(p.tokens);
    } else {
      terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    }
    if (!terms.length) return;

    let totalMatches = 0;
    const matches = [];

    function highlightTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          const p = node.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.nodeName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
          if (p.closest('.sidebar') || p.closest('.topbar') || p.closest('.search-banner')) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      // Build regex - metti le frasi (più lunghe) PRIMA
      const sortedTerms = terms.slice().sort(function (a, b) { return b.length - a.length; });
      const escTokens = sortedTerms.map(function (t) {
        return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      const re = new RegExp('(' + escTokens.join('|') + ')', 'gi');

      nodes.forEach(function (node) {
        const text = node.nodeValue;
        if (!re.test(text)) { re.lastIndex = 0; return; }
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m.index > last) {
            frag.appendChild(document.createTextNode(text.substring(last, m.index)));
          }
          const mark = document.createElement('mark');
          mark.className = 'search-highlight';
          mark.textContent = m[0];
          frag.appendChild(mark);
          matches.push(mark);
          totalMatches++;
          last = m.index + m[0].length;
        }
        if (last < text.length) {
          frag.appendChild(document.createTextNode(text.substring(last)));
        }
        node.parentNode.replaceChild(frag, node);
      });
    }

    containers.forEach(highlightTextNodes);

    if (!totalMatches) return;

    // Banner controllo
    const main = document.querySelector('main .content') || document.querySelector('main .mht-content');
    if (!main) return;

    let cur = 0;
    function setCurrent(i) {
      if (!matches.length) return;
      matches.forEach(function (el, idx) {
        if (idx === i) el.classList.add('is-current');
        else el.classList.remove('is-current');
      });
      const el = matches[i];
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    function goNext() { cur = (cur + 1) % matches.length; setCurrent(cur); updateBanner(); }
    function goPrev() { cur = (cur - 1 + matches.length) % matches.length; setCurrent(cur); updateBanner(); }

    const banner = document.createElement('div');
    banner.className = 'search-banner';
    banner.innerHTML =
      '<div class="sb-info">Risultati per <strong>"' + escapeHtml2(q) + '"</strong>: <span id="sb-count">' + totalMatches + '</span> occorrenze · <span id="sb-current">1</span>/<span id="sb-total">' + totalMatches + '</span></div>' +
      '<button type="button" class="sb-btn" data-act="prev" aria-label="Occorrenza precedente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
      '<button type="button" class="sb-btn" data-act="next" aria-label="Occorrenza successiva"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
      '<button type="button" class="sb-close" data-act="close" aria-label="Rimuovi evidenziazione">&times;</button>';
    main.insertBefore(banner, main.firstChild);
    function updateBanner() {
      const c = banner.querySelector('#sb-current');
      if (c) c.textContent = (cur + 1);
    }

    banner.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.getAttribute('data-act');
      if (a === 'next') goNext();
      else if (a === 'prev') goPrev();
      else if (a === 'close') {
        // Rimuovi banner e marks
        banner.remove();
        matches.forEach(function (m) {
          const t = document.createTextNode(m.textContent);
          if (m.parentNode) m.parentNode.replaceChild(t, m);
        });
        // Rimuovi ?q dall'URL
        try {
          const u = new URL(location.href);
          u.searchParams.delete('q');
          history.replaceState(null, '', u.toString());
        } catch (e) {}
      }
    });

    // Vai al primo match
    setTimeout(function () { setCurrent(0); }, 100);
  }

  function escapeHtml2(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initResponsiveTables() {
    const containers = document.querySelectorAll('main .content, main .mht-content');
    if (!containers.length) return;

    containers.forEach(function (container) {
      container.querySelectorAll('table').forEach(function (table) {
        if (table.classList.contains('manual-table')) return;

        table.classList.add('manual-table');
        const hasSemanticHeader = !!table.querySelector('thead, th');
        const hasNestedTable = !!table.querySelector('table');
        const maxCells = Array.prototype.reduce.call(table.rows || [], function (max, row) {
          return Math.max(max, row.cells ? row.cells.length : 0);
        }, 0);
        const isNested = !!table.parentElement.closest('td, th');
        const isDataLike = hasSemanticHeader && !hasNestedTable && maxCells > 1;

        table.classList.add(isDataLike ? 'data-table' : 'legacy-table');
        if (isNested) table.classList.add('nested-table');

        if (isDataLike) {
          const headers = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
            return (th.textContent || '').trim();
          });
          if (headers.length) {
            Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (row) {
              Array.prototype.forEach.call(row.cells || [], function (cell, index) {
                if (headers[index]) cell.setAttribute('data-label', headers[index]);
              });
            });
          }
        }

        table.removeAttribute('width');
        table.querySelectorAll('[width]').forEach(function (el) {
          if (el.tagName && el.tagName.toLowerCase() !== 'img') el.removeAttribute('width');
        });

        if (isNested && !isDataLike) {
          table.style.display = 'block';
          table.style.width = '100%';
          Array.prototype.forEach.call(table.rows || [], function (row) {
            row.style.display = 'block';
            row.style.width = '100%';
            Array.prototype.forEach.call(row.cells || [], function (cell) {
              cell.style.display = 'block';
              cell.style.width = '100%';
              cell.style.maxWidth = '100%';
            });
          });
        }

        if (!isNested && !table.closest('.table-scroll')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'table-scroll';
          table.parentNode.insertBefore(wrapper, table);
          wrapper.appendChild(table);
        }
      });
    });

    setTimeout(function () {
      document.querySelectorAll('main table.data-table').forEach(unstackDataTable);
    }, 0);
  }

  function unstackDataTable(table) {
    if (!table) return;
    table.classList.remove('is-stacked-data-table');
    table.style.setProperty('display', 'table', 'important');
    table.style.setProperty('width', 'max-content', 'important');
    table.style.setProperty('min-width', '100%', 'important');
    table.style.setProperty('table-layout', 'auto', 'important');
    table.style.setProperty('border-collapse', 'separate', 'important');
    table.style.setProperty('border-spacing', '0', 'important');

    const wrapper = table.closest('.table-scroll');
    if (wrapper) {
      wrapper.style.setProperty('overflow-x', 'auto', 'important');
      wrapper.style.setProperty('overflow-y', 'hidden', 'important');
      wrapper.style.setProperty('max-width', '100%', 'important');
    }

    const thead = table.querySelector('thead');
    if (thead) {
      thead.style.setProperty('display', 'table-header-group', 'important');
      thead.style.setProperty('position', 'static', 'important');
      thead.style.setProperty('width', 'auto', 'important');
      thead.style.setProperty('height', 'auto', 'important');
      thead.style.removeProperty('overflow');
      thead.style.removeProperty('clip');
    }

    Array.prototype.forEach.call(table.tBodies || [], function (tbody) {
      tbody.style.setProperty('display', 'table-row-group', 'important');
      tbody.style.setProperty('width', 'auto', 'important');
    });

    Array.prototype.forEach.call(table.rows || [], function (row) {
      row.style.setProperty('display', 'table-row', 'important');
      row.style.setProperty('width', 'auto', 'important');
      row.style.setProperty('margin', '0', 'important');
      row.style.setProperty('padding', '0', 'important');
      row.style.setProperty('border', '0', 'important');
      row.style.removeProperty('border-radius');
      row.style.removeProperty('background');

      Array.prototype.forEach.call(row.cells || [], function (cell) {
        const label = cell.querySelector(':scope > .table-cell-label');
        if (label) label.remove();

        const valueEl = cell.querySelector(':scope > .table-cell-value');
        if (valueEl) {
          while (valueEl.firstChild) cell.insertBefore(valueEl.firstChild, valueEl);
          valueEl.remove();
        }

        cell.style.setProperty('display', 'table-cell', 'important');
        cell.style.removeProperty('grid-template-columns');
        cell.style.removeProperty('gap');
        cell.style.setProperty('width', 'auto', 'important');
        // FIX 27/04: niente min-width/max-width forzati, le celle si adattano al contenuto
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        cell.style.setProperty('padding', '10px 14px', 'important');
        cell.style.setProperty('border', '0', 'important');
        cell.style.setProperty('border-bottom', '1px solid var(--c-border)', 'important');
        cell.style.setProperty('border-left', first ? '0' : '1px solid var(--c-border)', 'important');
        cell.style.setProperty('text-align', 'left', 'important');
        cell.style.setProperty('vertical-align', 'top', 'important');
        cell.style.setProperty('white-space', 'normal', 'important');
        cell.style.setProperty('overflow-wrap', 'break-word', 'important');
        cell.style.setProperty('word-break', 'normal', 'important');

        cell.querySelectorAll('code').forEach(function (code) {
          code.style.setProperty('white-space', 'nowrap', 'important');
          code.style.setProperty('word-break', 'normal', 'important');
          code.style.setProperty('overflow-wrap', 'normal', 'important');
        });
      });
    });
  }

  /* ============================================================
     TABLE-SCROLL ARROWS
     Inietta due bottoni-freccia (sx/dx) ai bordi di ogni .table-scroll
     che è davvero scrollabile orizzontalmente. Le frecce si nascondono
     quando si raggiunge il bordo, e scrollano la tabella di una "page"
     (≈80% della larghezza visibile) al click. Touch-friendly.
     ============================================================ */
  function initTableScrollArrows() {
    var SVG_LEFT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    var SVG_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

    function setup(wrap) {
      if (!wrap || wrap.dataset.tsArrows === '1') return;
      wrap.dataset.tsArrows = '1';

      // Wrapper esterno NON-scrollabile che ospita i bottoni in posizione fissa
      // rispetto al viewport della tabella. Senza questo step le frecce
      // scrollerebbero insieme al contenuto orizzontalmente.
      var outer = document.createElement('div');
      outer.className = 'ts-outer';
      if (wrap.parentNode) wrap.parentNode.insertBefore(outer, wrap);
      outer.appendChild(wrap);

      // Crea bottoni nel wrapper esterno
      var left  = document.createElement('button');
      var right = document.createElement('button');
      left.type = 'button';
      right.type = 'button';
      left.className  = 'ts-arrow ts-arrow-left';
      right.className = 'ts-arrow ts-arrow-right';
      left.setAttribute('aria-label', 'Scorri a sinistra');
      right.setAttribute('aria-label', 'Scorri a destra');
      left.tabIndex = 0;
      right.tabIndex = 0;
      left.innerHTML  = '<span class="ts-arrow-icon">' + SVG_LEFT  + '</span>';
      right.innerHTML = '<span class="ts-arrow-icon">' + SVG_RIGHT + '</span>';
      outer.appendChild(left);
      outer.appendChild(right);

      // Hint sotto il wrapper esterno
      var hint = document.createElement('div');
      hint.className = 'ts-hint';
      hint.textContent = '← scorri orizzontalmente →';
      outer.parentNode.insertBefore(hint, outer.nextSibling);

      function update() {
        var maxScroll = wrap.scrollWidth - wrap.clientWidth;
        var canScroll = maxScroll > 4;
        wrap.classList.toggle('is-scrollable', canScroll);
        outer.classList.toggle('is-scrollable', canScroll);
        if (!canScroll) {
          left.classList.remove('is-shown');
          right.classList.remove('is-shown');
          return;
        }
        var x = wrap.scrollLeft;
        if (x > 4)              left.classList.add('is-shown');  else left.classList.remove('is-shown');
        if (x < maxScroll - 4)  right.classList.add('is-shown'); else right.classList.remove('is-shown');
      }

      function pageScroll(dir) {
        var page = Math.max(120, wrap.clientWidth * 0.8);
        wrap.scrollBy({ left: dir * page, behavior: 'smooth' });
      }
      left.addEventListener('click',  function () { pageScroll(-1); });
      right.addEventListener('click', function () { pageScroll(+1); });

      wrap.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);

      // Re-check quando le immagini interne caricano (cambiano la scrollWidth)
      Array.prototype.forEach.call(wrap.querySelectorAll('img'), function (img) {
        if (!img.complete) img.addEventListener('load', update);
      });

      // Stato iniziale (con piccolo delay per layout completo)
      update();
      setTimeout(update, 80);
      setTimeout(update, 350);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.table-scroll'), setup);
  }

  function initIconSizing() {
    const groups = [
      { selector: '.credits-icon, .callout-icon, .legal-notice-icon', box: 22, svg: 22 },
      { selector: '.card-icon', box: 38, svg: 22 },
      { selector: '.nav-link-icon, .item-icon, .item-arrow', box: 16, svg: 16 },
      { selector: '.icon-btn', box: 36, svg: 18 },
      { selector: '.search-icon', box: 16, svg: 16 },
      { selector: '.btn', box: null, svg: 16 },
      { selector: '.to-top', box: 44, svg: 20 }
    ];

    groups.forEach(function (group) {
      document.querySelectorAll(group.selector).forEach(function (box) {
        if (group.box) {
          box.style.setProperty('width', group.box + 'px', 'important');
          box.style.setProperty('height', group.box + 'px', 'important');
          box.style.setProperty('min-width', group.box + 'px', 'important');
          box.style.setProperty('min-height', group.box + 'px', 'important');
          box.style.setProperty('max-width', group.box + 'px', 'important');
          box.style.setProperty('max-height', group.box + 'px', 'important');
        }
        box.style.setProperty('flex-shrink', '0', 'important');
        box.style.setProperty('overflow', 'hidden', 'important');
        box.querySelectorAll('svg').forEach(function (svg) {
          svg.style.setProperty('width', group.svg + 'px', 'important');
          svg.style.setProperty('height', group.svg + 'px', 'important');
          svg.style.setProperty('min-width', group.svg + 'px', 'important');
          svg.style.setProperty('min-height', group.svg + 'px', 'important');
          svg.style.setProperty('max-width', group.svg + 'px', 'important');
          svg.style.setProperty('max-height', group.svg + 'px', 'important');
          svg.style.setProperty('display', 'block', 'important');
          svg.style.setProperty('flex-shrink', '0', 'important');
        });
      });
    });

    document.querySelectorAll('.credits-card .credits-header').forEach(function (header) {
      header.style.setProperty('display', 'grid', 'important');
      header.style.setProperty('grid-template-columns', '22px minmax(0, 1fr)', 'important');
      header.style.setProperty('align-items', 'center', 'important');
      header.style.setProperty('column-gap', '10px', 'important');
    });

    document.querySelectorAll('.credits-card .credits-title').forEach(function (title) {
      title.style.setProperty('margin', '0', 'important');
      title.style.setProperty('min-width', '0', 'important');
      title.style.setProperty('grid-column', '2', 'important');
      title.style.setProperty('grid-row', '1', 'important');
    });
  }
})();

/* Prompt copy button */
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.prompt-copy-btn');
  if (!btn) return;
  var targetId = btn.getAttribute('data-copy-target');
  var target = document.getElementById(targetId);
  if (!target) return;
  var text = target.innerText || target.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      var originalHtml = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '✓ Copiato!';
      setTimeout(function () {
        btn.innerHTML = originalHtml;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(function () {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      btn.classList.add('copied');
      btn.innerHTML = '✓ Copiato!';
      setTimeout(function () { btn.classList.remove('copied'); btn.innerHTML = btn.dataset.originalHtml || 'Copia'; }, 2000);
    });
  }
});
