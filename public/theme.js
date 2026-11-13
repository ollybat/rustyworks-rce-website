/* ============================================================================
 * theme.js — Spinback global appearance engine
 *
 * Load this in <head>, BEFORE the page renders:
 *     <script src="/theme.js"></script>
 *
 * It must run before first paint. If you load it at the bottom of <body> the
 * user watches the dark theme render and then snap to light — the classic
 * "flash of wrong theme". In <head> it sets the attributes on <html> before a
 * single pixel is drawn.
 *
 * Handles:
 *   • Dark / Light theme          -> <html data-theme="dark|light">
 *   • Seasonal themes             -> <html data-season="halloween|thanksgiving|christmas">
 *                                    chosen from the calendar (see SEASON below)
 *   • Low Device Mode             -> <html data-lowdevice="1">
 *   • Reduce Motion               -> <html data-reduce-motion="1">
 *   • Text font (incl. dyslexia-friendly) -> <html data-font="atkinson|lexend|dyslexic|system">
 *   • Text size (small/default/medium/large) -> <html data-fontsize="small|medium|large">
 *
 * Settings live in localStorage so they apply instantly and work logged out.
 * When the user IS logged in, nav-auth.js syncs them to the API
 * (PUT /auth/settings) so preferences follow them to their phone.
 * ==========================================================================*/
(function () {
  'use strict';

  if (window.RWTheme) return;

  var STORAGE_KEY = 'rw_settings_v1';

  // ══════════════════════════════════════════════════════════════════════════
  //  SEASONAL THEMES — the calendar. This is the only part you ever edit.
  //
  //  Each season switches itself on at the start of its first day and off at the
  //  end of its last day (the visitor's own date). Dates are 'MM-DD'. A season
  //  that runs over New Year just works, e.g. from: '12-20', to: '01-05'.
  //  If two seasons overlap, the one higher up the list wins.
  //
  //  mode:  'auto'      themes follow the calendar for everyone         (default)
  //         'optional'  same dates, but visitors can switch it off in Settings
  //         'off'       no seasonal themes at all, for everyone, right now
  //
  //  force: ''  follow the calendar. Or put 'halloween' / 'thanksgiving' /
  //         'christmas' to show that season whatever the date is.
  //
  //  To preview a season on your own screen without changing anything for anyone:
  //  open any page with ?season=christmas on the end (and ?season=off or
  //  ?season=auto to stop previewing). It only lasts for that browser tab.
  //
  //  After editing this file, purge /theme.js in Cloudflare (Caching -> Purge
  //  Cache) so everyone gets the change straight away.
  // ══════════════════════════════════════════════════════════════════════════
  var SEASON = {
    mode: 'auto',
    force: '',
    list: [
      { key: 'halloween',    from: '10-01', to: '11-05' },   // 1 Oct  -> 5 Nov
      { key: 'thanksgiving', from: '11-15', to: '11-30' },   // 15 Nov -> 30 Nov
      { key: 'christmas',    from: '12-01', to: '12-31' }    // 1 Dec  -> 31 Dec
    ]
  };

  // How each season looks on the Settings page (colours of the little preview)
  var SEASON_INFO = {
    halloween:    { name: 'Halloween',    icon: '\uD83C\uDF83', preview: { bg: '#09060f', bar: '#100a19', line: '#ff7a1a55', dot: '#ff7a1a', a: '#8dff4a', card: '#160e22', cardLine: '#34224c', t1: '#f2e9f8', t2: '#5a3f7a', btn: 'linear-gradient(135deg,#ff6a00,#ffb454)' } },
    thanksgiving: { name: 'Thanksgiving', icon: '\uD83E\uDD83', preview: { bg: '#110a05', bar: '#1a110a', line: '#f2b13455', dot: '#e8742a', a: '#f2b134', card: '#221609', cardLine: '#44301c', t1: '#f8ecd9', t2: '#7a5a38', btn: 'linear-gradient(135deg,#e8742a,#f2b134)' } },
    christmas:    { name: 'Christmas',    icon: '\uD83C\uDF84', preview: { bg: '#060d16', bar: '#0b1622', line: '#e0383e55', dot: '#e0383e', a: '#5fd68f', card: '#0f1d2c', cardLine: '#223a52', t1: '#f4f8ff', t2: '#4a6b8a', btn: 'linear-gradient(135deg,#e0383e,#ff5a4f)' } }
  };

  var DEFAULTS = {
    theme:         'dark',   // 'dark' | 'light'
    lowDevice:     false,    // kill animations / video / gifs / heavy effects
    reduceMotion:  false,    // animations off, imagery kept
    compactNav:    false,    // tighter header on small screens
    confirmDanger: true,     // extra confirm on destructive dashboard actions
    seasonal:      true,     // only used while SEASON.mode is 'optional'
    font:          'default', // key of FONTS below
    fontSize:      'default'  // 'small' | 'default' | 'medium' | 'large'
  };

  // ── Fonts ────────────────────────────────────────────────────────────────
  // 'default' leaves the site's own fonts (Chakra Petch / Oswald) untouched.
  // The others replace EVERY font on the page. Files live in /fonts/ and are
  // only downloaded when somebody actually picks one.
  var FONTS = [
    { key: 'default',  label: 'Default',               family: "'Chakra Petch', sans-serif", note: 'The standard Spinback look' },
    { key: 'dyslexic', label: 'OpenDyslexic',          family: "'OpenDyslexic', 'Comic Sans MS', sans-serif", note: 'Dyslexia-friendly. Weighted letter bottoms, wider spacing, no capitals' },
    { key: 'atkinson', label: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible', Verdana, sans-serif", note: 'Made for low vision. Every letter looks different' },
    { key: 'lexend',   label: 'Lexend',                family: "'Lexend', Verdana, sans-serif", note: 'Wide, even spacing designed for easier reading' },
    { key: 'system',   label: 'Verdana / Arial',       family: "Verdana, Tahoma, Arial, Helvetica, sans-serif", note: 'Plain system font, no download' }
  ];
  var SIZES = [
    { key: 'small',   label: 'Small',   pct: 87.5 },
    { key: 'default', label: 'Default', pct: 100 },
    { key: 'medium',  label: 'Medium',  pct: 112.5 },
    { key: 'large',   label: 'Large',   pct: 125 }
  ];

  function validFont(k) { for (var i = 0; i < FONTS.length; i++) if (FONTS[i].key === k) return k; return 'default'; }
  function validSize(k) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i].key === k) return k; return 'default'; }

  /* One-time carry-over: the preference used to live under the old brand's key. */
  try {
    var migrated = localStorage.getItem('spinback-theme-migrated');
    if (!migrated) {
      var old = localStorage.getItem('rw-theme');
      if (old && !localStorage.getItem('spinback-theme')) localStorage.setItem('spinback-theme', old);
      localStorage.setItem('spinback-theme-migrated', '1');
    }
  } catch (e) {}

  function read() {
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        for (var key in DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) out[key] = parsed[key];
        }
      }
    } catch (e) { /* private mode / disabled storage — fall back to defaults */ }

    // Respect the OS-level accessibility setting as a starting point, but never
    // override an explicit choice the user already made here.
    try {
      if (!localStorage.getItem(STORAGE_KEY) &&
          window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        out.reduceMotion = true;
      }
    } catch (e) {}

    if (out.theme !== 'light' && out.theme !== 'dark') out.theme = 'dark';
    out.seasonal = out.seasonal !== false;
    out.font = validFont(out.font);
    out.fontSize = validSize(out.fontSize);
    return out;
  }

  function write(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // CSS lives here (not in style.css) so it works on every page that loads
  // theme.js, including dashboard pages with their own stylesheets.
  function buildTextCss() {
    var css = '';
    for (var i = 0; i < SIZES.length; i++) {
      if (SIZES[i].key !== 'default') css += 'html[data-fontsize="' + SIZES[i].key + '"]{font-size:' + SIZES[i].pct + '%}\n';
    }
    for (var j = 0; j < FONTS.length; j++) {
      if (FONTS[j].key !== 'default') css += 'html[data-font="' + FONTS[j].key + '"]{--rw-font:' + FONTS[j].family + '}\n';
    }
    css += 'html[data-font]:not([data-font="default"]) *,' +
           'html[data-font]:not([data-font="default"]) *::before,' +
           'html[data-font]:not([data-font="default"]) *::after{font-family:var(--rw-font)!important}\n';
    // Dyslexia mode: no ALL-CAPS, more air between lines, words and letters
    css += 'html[data-font="dyslexic"] *{text-transform:none!important}\n' +
           'html[data-font="dyslexic"] body{line-height:1.85;word-spacing:.12em;letter-spacing:.02em}\n';
    return css;
  }

  function ensureTextAssets(s) {
    var head = document.head || document.documentElement;
    if (!document.getElementById('rw-text-css')) {
      var st = document.createElement('style');
      st.id = 'rw-text-css';
      st.textContent = buildTextCss();
      head.appendChild(st);
    }
    if (s.font !== 'default') loadFonts();
  }

  function loadFonts() {
    if (document.getElementById('rw-fonts-css')) return;
    var l = document.createElement('link');
    l.id = 'rw-fonts-css';
    l.rel = 'stylesheet';
    l.href = '/fonts/rw-fonts.css';
    (document.head || document.documentElement).appendChild(l);
  }

  // ── Which season (if any) is showing right now? ──────────────────────────
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function inWindow(from, to, md) {
    if (!/^\d\d-\d\d$/.test(from) || !/^\d\d-\d\d$/.test(to)) return false;
    return from <= to ? (md >= from && md <= to) : (md >= from || md <= to);   // second form = runs over New Year
  }
  function previewKey() {
    try {
      var q = /[?&]season=([a-z]+)/.exec(window.location.search);
      if (q) { sessionStorage.setItem('rw_season_preview', q[1]); }
      return sessionStorage.getItem('rw_season_preview') || '';
    } catch (e) { return ''; }
  }
  function seasonState(s) {
    var preview = previewKey();
    var key = '', mode = SEASON.mode, previewing = false;
    if (preview === 'off')                 { return { mode: mode, key: '', active: false, previewing: true }; }
    if (SEASON_INFO[preview])              { key = preview; previewing = true; }
    else if (SEASON_INFO[SEASON.force])    { key = SEASON.force; }
    else if (mode === 'auto' || mode === 'optional') {
      var d = new Date(), md = two(d.getMonth() + 1) + '-' + two(d.getDate());
      for (var i = 0; i < SEASON.list.length; i++) {
        var w = SEASON.list[i];
        if (SEASON_INFO[w.key] && inWindow(w.from, w.to, md)) { key = w.key; break; }
      }
    }
    if (!key) return { mode: mode === 'optional' ? 'optional' : (mode === 'off' ? 'off' : 'auto'), key: '', active: false };
    if (mode === 'off' && !previewing && !SEASON.force) return { mode: 'off', key: '', active: false };
    if (mode === 'optional' && !previewing) return { mode: 'optional', key: key, active: s.seasonal !== false };
    return { mode: mode === 'optional' ? 'optional' : 'auto', key: key, active: true, previewing: previewing };
  }
  function seasonEnd(key) {
    for (var i = 0; i < SEASON.list.length; i++) if (SEASON.list[i].key === key) return SEASON.list[i].to;
    return '';
  }

  function apply(s) {
    var el = document.documentElement;
    var sea = seasonState(s);
    // Every seasonal theme is dark, so the light theme steps aside while one shows.
    el.setAttribute('data-theme', sea.active ? 'dark' : s.theme);
    if (sea.active) el.setAttribute('data-season', sea.key);
    else el.removeAttribute('data-season');

    el.setAttribute('data-font', s.font);
    el.setAttribute('data-fontsize', s.fontSize);
    ensureTextAssets(s);

    if (s.lowDevice) el.setAttribute('data-lowdevice', '1');
    else el.removeAttribute('data-lowdevice');

    if (s.reduceMotion || s.lowDevice) el.setAttribute('data-reduce-motion', '1');
    else el.removeAttribute('data-reduce-motion');

    if (s.compactNav) el.setAttribute('data-compact-nav', '1');
    else el.removeAttribute('data-compact-nav');

    // Tell the browser's own UI (scrollbars, form controls) which mode we're in
    el.style.colorScheme = (!sea.active && s.theme === 'light') ? 'light' : 'dark';

    try { appTheme(sea, s); } catch (e) {}   // app colours, manifest and home-screen icon follow the theme
  }

  var settings = read();
  apply(settings);

  /* ── Seasonal themes: the parts CSS can't draw ───────────────────────────
   * The look itself (colours, headings, cards, lights, graveyard…) is in
   * style.css. This builds the moving parts — a banner at the top, then bats /
   * snow / falling leaves and so on — and takes them away again when the
   * season ends. It skips everything that moves when Low Device Mode or Reduce
   * Motion is on, and does nothing on a page that doesn't load style.css (so
   * nothing can ever appear unstyled).
   * -------------------------------------------------------------------- */
  var fx = { root: null, ribbon: null, timers: [], onMove: null, key: '' };

  var SVG_BAT = '<svg viewBox="0 0 64 32" aria-hidden="true"><path d="M32 7c-1.6 0-2.4 1.8-3.2 3.4C26 8 21.6 6.4 16.6 7.8c2 1.8 2.6 3.6 2.4 6-4-1.2-8.8-.4-12.6 3 5-.2 8.2 1.6 10.2 4.8 3-2.4 6-2.6 9-1.2 1.8.8 2 2.8 3.4 5.2 1.4-2.4 1.6-4.4 3.4-5.2 3-1.4 6-1.2 9 1.2 2-3.2 5.2-5 10.2-4.8-3.8-3.4-8.6-4.2-12.6-3-.2-2.4.4-4.2 2.4-6C42.4 6.4 38 8 35.2 10.4 34.4 8.8 33.6 7 32 7z"/></svg>';
  var SVG_SPIDER = '<svg viewBox="0 0 34 40" aria-hidden="true"><g stroke="#cbbfe6" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M13 20L3 14l-1 8M13 22L4 24l-2 8M14 25L8 33l-1 6M21 20l10-6 1 8M21 22l9 2 2 8M20 25l6 8 1 6"/></g><ellipse cx="17" cy="25" rx="7.5" ry="9" fill="#1d1230" stroke="#a07bff" stroke-width="1.1"/><circle cx="17" cy="14.5" r="5" fill="#1d1230" stroke="#a07bff" stroke-width="1.1"/><circle cx="14.8" cy="13.8" r="1.2" fill="#ff7a1a"/><circle cx="19.2" cy="13.8" r="1.2" fill="#ff7a1a"/><path d="M17 20v10M14 23l3 3 3-3" stroke="#ff7a1a" stroke-width="1.2" fill="none"/></svg>';
  var SVG_GHOST = '<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 3C13 3 6 11 6 22v28c0 2 2 3 3.5 1.6L14 47l4.5 4.6c1 1 2.4 1 3.4 0L24 49.5l2.1 2.1c1 1 2.4 1 3.4 0L34 47l4.5 4.6C40 53 42 52 42 50V22C42 11 35 3 24 3z" fill="#ece4fb"/><ellipse cx="18" cy="22" rx="3.2" ry="4.4" fill="#1d1230"/><ellipse cx="30" cy="22" rx="3.2" ry="4.4" fill="#1d1230"/><ellipse cx="24" cy="32" rx="3" ry="4" fill="#1d1230"/></svg>';
  var SVG_LEAF = '<svg viewBox="0 0 32 34" aria-hidden="true"><path d="M16 2L19 9L26 7L23 14L30 15L24 20L27 27L19 25L16 31L13 25L5 27L8 20L2 15L9 14L6 7L13 9Z"/><path d="M16 28v5" fill="none"/></svg>';
  var SVG_SLEIGH = '<svg viewBox="0 0 250 76" aria-hidden="true"><g fill="#ffe9a8" stroke="#ffd479" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">' +
    '<g id="rd"><ellipse cx="46" cy="40" rx="17" ry="8.5"/><path d="M60 36l8-12 7 3-2 8-9 6z"/><circle cx="73" cy="25" r="5"/><path d="M76 27l9 3-2 4-8-2z"/><path d="M34 46l-12 10M40 48l-6 14M54 48l10 8M60 46l14 6" fill="none"/><path d="M70 21l-4-11 5 4 1-10 3 9 6-6-2 10" fill="none"/></g>' +
    '<use href="#rd" x="-38" y="6"/>' +
    '<path d="M104 43l22-4M104 49l22-6" fill="none"/>' +
    '<path d="M130 42h66q16 0 18-17l-6 0q-2 10-12 10h-58z"/><path d="M126 62q-6-8 4-8h86q10 0 8 8" fill="none" stroke-width="2.2"/><path d="M138 54v-10M170 54v-10M200 54v-10" fill="none"/>' +
    '<ellipse cx="206" cy="29" rx="10" ry="9"/><circle cx="162" cy="30" r="6"/><path d="M148 42q0-14 14-14t14 14z"/></g>' +
    '<path d="M156 25l6-12 7 11z" fill="#e0383e"/><circle cx="162" cy="13" r="2.6" fill="#fff"/><circle cx="85" cy="25" r="2.4" fill="#e0383e"/><circle cx="47" cy="31" r="2.4" fill="#e0383e"/></svg>';
  // Seasonal logo: the same Spinback icon with a Halloween / Thanksgiving / Christmas
  // look. Put these three files next to rustyworks-icon.svg in /media/.
  var LOGO_ORIG = /\/media\/rustyworks-icon\.svg(\?.*)?$/;
  var LOGO_FILE = {
    halloween:    '/media/spinback-icon-halloween.svg',
    thanksgiving: '/media/spinback-icon-thanksgiving.svg',
    christmas:    '/media/spinback-icon-christmas.svg'
  };
  var TEXTS = {
    halloween:    { pre: '\uD83E\uDD87', msg: 'Happy Halloween from Spinback \u2014 spooky season is live', post: '\uD83C\uDF83', font: 'Pirata+One' },
    thanksgiving: { pre: '\uD83C\uDF42', msg: 'Happy Thanksgiving from Spinback \u2014 thankful for every server and player', post: '\uD83E\uDD83', font: 'Alfa+Slab+One' },
    christmas:    { pre: '\uD83C\uDF84', msg: 'Merry Christmas from Spinback \u2014 happy holidays to our whole community', post: '\u2744\uFE0F', font: 'Mountains+of+Christmas:wght@700' }
  };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function after(fn, ms) { var t = setTimeout(fn, ms); fx.timers.push(t); return t; }
  function cssReady() {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--rw-season-css').trim() === '1'; } catch (e) { return false; }
  }
  function add(parent, cls, html, vars) {
    var d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = html;
    for (var k in vars) d.style.setProperty(k, vars[k]);
    parent.appendChild(d);
    return d;
  }
  function removeWhenDone(el) {
    el.addEventListener('animationend', function (e) { if (e.target === el && el.parentNode) el.parentNode.removeChild(el); });
  }
  function seasonFont(key) {
    var id = 'rw-season-font';
    var old = document.getElementById(id);
    if (old && old.getAttribute('data-key') === key) return;
    if (old) old.parentNode.removeChild(old);
    var l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.setAttribute('data-key', key);
    l.href = 'https://fonts.googleapis.com/css2?family=' + TEXTS[key].font + '&display=swap';
    (document.head || document.documentElement).appendChild(l);
  }

  function seasonIdentity(key) {
    // emoji in the tab title, the seasonal tab icon, and the seasonal logo on the page
    try {
      var all = ['\uD83C\uDF83', '\uD83E\uDD83', '\uD83C\uDF84'], t = document.title || '';
      for (var i = 0; i < all.length; i++) if (t.indexOf(all[i] + ' ') === 0) { t = t.slice(all[i].length + 1); break; }
      document.title = key ? SEASON_INFO[key].icon + ' ' + t : t;

      var links = document.querySelectorAll('link[rel~="icon"]');
      for (var j = 0; j < links.length; j++) {
        var l = links[j];
        if (key) {
          if (!l.hasAttribute('data-rw-orig')) l.setAttribute('data-rw-orig', l.getAttribute('href') || '');
          l.setAttribute('type', 'image/svg+xml');
          l.setAttribute('href', LOGO_FILE[key]);
        } else if (l.hasAttribute('data-rw-orig')) { l.setAttribute('href', l.getAttribute('data-rw-orig')); l.removeAttribute('data-rw-orig'); }
      }

      var imgs = document.querySelectorAll('img');
      for (var m = 0; m < imgs.length; m++) {
        var im = imgs[m], cur = im.getAttribute('src') || '', was = im.getAttribute('data-rw-logo');
        if (key) {
          if (was === null && LOGO_ORIG.test(cur)) { im.setAttribute('data-rw-logo', cur); was = cur; }
          if (was !== null && cur !== LOGO_FILE[key]) im.setAttribute('src', LOGO_FILE[key]);
        } else if (was !== null) { im.setAttribute('src', was); im.removeAttribute('data-rw-logo'); }
      }
    } catch (e) {}
  }

  function seasonRibbon(key) {
    if (fx.ribbon && fx.ribbon.parentNode) fx.ribbon.parentNode.removeChild(fx.ribbon);
    fx.ribbon = null;
    if (!key || !document.body) return;
    var dismissed = false;
    try { dismissed = sessionStorage.getItem('rw_ribbon_' + key) === '1'; } catch (e) {}
    if (dismissed) return;
    var tx = TEXTS[key], r = document.createElement('div');
    r.className = 'rw-ribbon';
    r.innerHTML = '<span aria-hidden="true">' + tx.pre + '</span><span>' + tx.msg + '</span><span aria-hidden="true">' + tx.post + '</span>';
    var x = document.createElement('button');
    x.type = 'button'; x.setAttribute('aria-label', 'Hide this banner'); x.textContent = '\u2715';
    x.addEventListener('click', function () {
      try { sessionStorage.setItem('rw_ribbon_' + key, '1'); } catch (e) {}
      if (r.parentNode) r.parentNode.removeChild(r);
      fx.ribbon = null;
    });
    r.appendChild(x);
    document.body.insertBefore(r, document.body.firstChild);
    fx.ribbon = r;
  }

  function teardownMotion() {
    for (var i = 0; i < fx.timers.length; i++) clearTimeout(fx.timers[i]);
    fx.timers = [];
    if (fx.onMove) { window.removeEventListener('mousemove', fx.onMove); fx.onMove = null; }
    if (fx.root && fx.root.parentNode) fx.root.parentNode.removeChild(fx.root);
    fx.root = null;
  }

  // ── mouse sparkle trail, shared by every season (only the colours differ) ──
  function sparkleTrail(cls) {
    try {
      if (!(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
      var last = 0, root = fx.root;
      fx.onMove = function (e) {
        var now = Date.now();
        if (now - last < 70 || !fx.root || root.querySelectorAll('.' + cls).length > 22) return;
        last = now;
        var sp = add(root, cls + (Math.random() < .3 ? ' g' : ''), '', { '--dx': Math.round(rnd(-18, 18)) + 'px', '--dy': Math.round(rnd(10, 34)) + 'px' });
        sp.style.left = e.clientX + 'px'; sp.style.top = e.clientY + 'px';
        removeWhenDone(sp);
      };
      window.addEventListener('mousemove', fx.onMove, { passive: true });
    } catch (e) {}
  }
  function repeat(fn, lo, hi) { var run = function () { fn(); after(run, rnd(lo, hi)); }; return run; }
  function vh() { return window.innerHeight || 700; }

  // ── Halloween: bats, embers, a spider, a ghost, a soft flash of lightning ──
  function buildHalloween(root, narrow) {
    var n = narrow ? 8 : 16;
    for (var i = 0; i < n; i++) {
      add(root, 'hw-ember' + (i % 4 === 3 ? ' g' : ''), '', {
        '--x': rnd(2, 98).toFixed(1) + '%', '--sz': Math.round(rnd(3, 8)) + 'px',
        '--dur': rnd(11, 22).toFixed(1) + 's', '--del': (-rnd(0, 20)).toFixed(1) + 's', '--dx': Math.round(rnd(-90, 90)) + 'px'
      });
    }
    if (!narrow) {
      var box = add(root, 'hw-spiderbox', '', { '--x': (Math.random() < .5 ? rnd(4, 16) : rnd(80, 92)).toFixed(1) + '%' });
      add(box, 'hw-spider', SVG_SPIDER, {});
    }
    var bat = repeat(function () {
      if (document.hidden || root.querySelectorAll('.hw-bat').length >= 3) return;
      var rtl = Math.random() < .5;
      removeWhenDone(add(root, 'hw-bat' + (rtl ? ' rtl' : ''), SVG_BAT, {
        '--y': Math.round(rnd(90, vh() * .62)) + 'px', '--s': Math.round(rnd(30, 54)) + 'px',
        '--d': rnd(9, 16).toFixed(1) + 's', '--dy': Math.round(rnd(-90, 90)) + 'px' }));
    }, 4500, 10000);
    var ghost = repeat(function () {
      if (document.hidden) return;
      removeWhenDone(add(root, 'hw-ghost', SVG_GHOST, { '--y': Math.round(rnd(140, vh() * .6)) + 'px' }));
    }, 50000, 95000);
    var bolt = repeat(function () {
      if (document.hidden) return;
      removeWhenDone(add(root, 'hw-flash', '', {}));
    }, 45000, 100000);
    after(bat, 1400); after(bolt, rnd(14000, 30000)); after(ghost, rnd(22000, 40000));
    sparkleTrail('hw-spark');
  }

  // ── Christmas: snow, Santa's sleigh, shooting stars ──
  function buildChristmas(root, narrow) {
    var n = narrow ? 22 : 46;
    for (var i = 0; i < n; i++) {
      var big = Math.random() < .25;
      add(root, 'xm-flake' + (big ? ' b' : ''), '', {
        '--x': rnd(0, 100).toFixed(1) + '%', '--sz': Math.round(big ? rnd(7, 11) : rnd(3, 6)) + 'px',
        '--o': (big ? rnd(.35, .55) : rnd(.55, .95)).toFixed(2), '--dur': rnd(12, 24).toFixed(1) + 's',
        '--del': (-rnd(0, 24)).toFixed(1) + 's', '--dx': Math.round(rnd(-40, 40)) + 'px'
      });
    }
    var sleigh = repeat(function () {
      if (document.hidden || root.querySelector('.xm-sleigh')) return;
      var s = add(root, 'xm-sleigh', SVG_SLEIGH, { '--y': Math.round(rnd(90, vh() * .3)) + 'px', '--d': rnd(16, 22).toFixed(1) + 's', '--dy': Math.round(rnd(-40, 40)) + 'px' });
      removeWhenDone(s);
    }, 55000, 100000);
    var star = repeat(function () {
      if (document.hidden) return;
      removeWhenDone(add(root, 'xm-star', '', { '--x': rnd(5, 70).toFixed(0) + '%', '--y': Math.round(rnd(80, vh() * .35)) + 'px' }));
    }, 25000, 60000);
    after(sleigh, rnd(9000, 16000)); after(star, rnd(6000, 14000));
    sparkleTrail('xm-spark');
  }

  // ── Thanksgiving: falling leaves and the occasional turkey ──
  function buildThanksgiving(root, narrow) {
    var cols = ['#e8742a', '#f2b134', '#c4472f', '#a1303a', '#d98a2b', '#8aa04a'], n = narrow ? 10 : 20;
    for (var i = 0; i < n; i++) {
      var w = add(root, 'tg-leaf', '<div>' + SVG_LEAF + '</div>', {
        '--x': rnd(0, 100).toFixed(1) + '%', '--sz': Math.round(rnd(16, 30)) + 'px', '--c': cols[i % cols.length],
        '--dur': rnd(14, 26).toFixed(1) + 's', '--del': (-rnd(0, 26)).toFixed(1) + 's', '--dx': Math.round(rnd(-120, 120)) + 'px',
        '--sw': rnd(2.4, 4.6).toFixed(1) + 's', '--sp': rnd(4, 9).toFixed(1) + 's'
      });
    }
    var turkey = repeat(function () {
      if (document.hidden || root.querySelector('.tg-turkey')) return;
      removeWhenDone(add(root, 'tg-turkey', '<span>\uD83E\uDD83</span>', { '--d': rnd(26, 36).toFixed(0) + 's' }));
    }, 45000, 90000);
    after(turkey, rnd(10000, 20000));
    sparkleTrail('tg-spark');
  }

  var BUILDERS = { halloween: buildHalloween, christmas: buildChristmas, thanksgiving: buildThanksgiving };

  function buildMotion(key) {
    teardownMotion();
    if (settings.lowDevice || settings.reduceMotion || !document.body) return;
    var root = document.createElement('div');
    root.id = 'rw-fx';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
    fx.root = root;
    BUILDERS[key](root, (window.innerWidth || 1200) < 760);
  }

  function syncSeason() {
    if (!document.body) return;
    var key = document.documentElement.getAttribute('data-season') || '';
    var on = !!key && !!SEASON_INFO[key] && cssReady();
    if (!on) { seasonIdentity(''); seasonRibbon(''); teardownMotion(); fx.key = ''; return; }
    seasonIdentity(key);
    seasonFont(key);
    if (fx.key !== key || !fx.ribbon) seasonRibbon(key);
    buildMotion(key);
    fx.key = key;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncSeason);
  else syncSeason();
  // If the stylesheet had not finished loading when the page was ready, try again once everything has.
  window.addEventListener('load', function () {
    if ((document.documentElement.getAttribute('data-season') || '') !== fx.key) syncSeason();
  });

  /* ── Low Device Mode: the parts CSS can't do ─────────────────────────────
   * CSS kills the animations, blurs and decorative backgrounds. These three
   * need JS because they're about the media elements themselves:
   *   1. <video> keeps downloading and decoding even when display:none —
   *      pause it and drop its source so the device stops doing the work.
   *   2. Animated GIFs keep animating regardless of CSS.
   *   3. <img loading="lazy"> is applied to everything so offscreen imagery
   *      never downloads at all.
   * Functional imagery (Discord avatars, Rust item icons) is deliberately
   * KEPT — hiding those would break the pages rather than lighten them.
   * -------------------------------------------------------------------- */
  function stripHeavyMedia() {
    if (!settings.lowDevice) return;

    try {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        try {
          v.pause();
          v.removeAttribute('autoplay');
          v.removeAttribute('loop');
          v.preload = 'none';
          while (v.firstChild) v.removeChild(v.firstChild);  // drop <source> tags
          v.removeAttribute('src');
          // load() with no source left aborts resource selection, which is what
          // actually stops the download and the decode loop.
          v.load();
        } catch (e) {}
        v.style.display = 'none';
      }

      var imgs = document.querySelectorAll('img');
      for (var j = 0; j < imgs.length; j++) {
        var img = imgs[j];
        var src = (img.getAttribute('src') || '').toLowerCase();
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        // Animated formats only — a still avatar costs nothing.
        if (src.indexOf('.gif') > -1 || src.indexOf('.webm') > -1 || src.indexOf('.apng') > -1) {
          img.setAttribute('data-rw-hidden-gif', '1');
          img.style.display = 'none';
        }
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stripHeavyMedia);
  } else {
    stripHeavyMedia();
  }

  /* ── Install as an app (PWA) ──────────────────────────────────────────────
   * Every page already loads this file, so this is where the app "wiring" lives:
   *   • links /manifest.json, the app colours and the iPhone home-screen icon
   *   • registers /sw.js (needs https, or localhost)
   *   • shows a small, dismissible "Install app" button when the phone/browser can
   *     install it (Chrome/Edge/Android), or the "Share > Add to Home Screen" hint on
   *     iPhone/iPad Safari. It never shows inside the installed app itself, and once
   *     dismissed it stays away for 30 days.
   * Pages can also use  RWTheme.install.prompt()  from their own button.
   * ------------------------------------------------------------------------ */
  var APP = { evt: null, pill: null, timer: null };
  var APP_DISMISS_KEY = 'rw_install_dismissed', APP_DISMISS_DAYS = 30, APP_SHOW_AFTER_MS = 8000;

  function appInstalled() {
    try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
    catch (e) { return false; }
  }
  function appIOS() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function appIOSSafari() { return appIOS() && !/crios|fxios|edgios|opios/i.test(navigator.userAgent || ''); }
  function appMeta(name, content) {
    if (document.querySelector('meta[name="' + name + '"]')) return;
    var m = document.createElement('meta'); m.name = name; m.content = content;
    (document.head || document.documentElement).appendChild(m);
  }
  // Makes the installed app follow the same theme as the website: status-bar / title-bar
  // colour (dark, light, or the running season), and the season's app name, splash colour and
  // icon via /manifest-<season>.json. Phones refresh an installed app's icon on their own
  // schedule (usually within a day or two), and some ask before changing it.
  function appTheme(sea, s) {
    var head = document.head || document.documentElement;
    var key = (sea && sea.active && SEASON_INFO[sea.key]) ? sea.key : '';
    var bg = key ? SEASON_INFO[key].preview.bg : (s.theme === 'light' ? '#fdf8f3' : '#0d0b09');
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; head.appendChild(m); }
    m.setAttribute('content', bg);
    var l = document.querySelector('link[rel="manifest"]');
    if (!l) { l = document.createElement('link'); l.rel = 'manifest'; head.appendChild(l); }
    l.setAttribute('href', key ? '/manifest-' + key + '.json' : '/manifest.webmanifest');
    var a = document.querySelector('link[rel="apple-touch-icon"]');
    if (!a) { a = document.createElement('link'); a.rel = 'apple-touch-icon'; head.appendChild(a); }
    /* One home-screen icon for every season: iOS reads this file when the app is added, so
       pointing it at a season that has no picture would only break the install. */
    a.setAttribute('href', '/media/apple-touch-icon.png');
  }
  function appHead() {
    try {
      appTheme(seasonState(settings), settings);
      appMeta('mobile-web-app-capable', 'yes');
      appMeta('apple-mobile-web-app-capable', 'yes');
      appMeta('apple-mobile-web-app-title', 'Spinback');
      appMeta('apple-mobile-web-app-status-bar-style', 'black');
      if (appInstalled()) document.documentElement.setAttribute('data-app', '1');
    } catch (e) {}
  }
  function appRegister() {
    try {
      if (!('serviceWorker' in navigator)) return;
      var ok = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      if (!ok) return;
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    } catch (e) {}
  }
  function appDismissed() {
    try { var t = parseInt(localStorage.getItem(APP_DISMISS_KEY) || '0', 10); return t && (Date.now() - t) < APP_DISMISS_DAYS * 864e5; }
    catch (e) { return false; }
  }
  function appHidePill(remember) {
    if (APP.pill && APP.pill.parentNode) APP.pill.parentNode.removeChild(APP.pill);
    APP.pill = null;
    if (remember) { try { localStorage.setItem(APP_DISMISS_KEY, String(Date.now())); } catch (e) {} }
  }
  function appCanInstall() { return !appInstalled() && (!!APP.evt || appIOSSafari()); }
  function appPrompt() {
    if (appInstalled()) return Promise.resolve('installed');
    if (APP.evt) {
      var e = APP.evt; APP.evt = null;
      try {
        e.prompt();
        return e.userChoice.then(function (c) { appHidePill(c && c.outcome !== 'accepted'); return c ? c.outcome : 'dismissed'; });
      } catch (err) { return Promise.resolve('unavailable'); }
    }
    appHelp();
    return Promise.resolve('help');
  }
  // "How do I install this?" dialog: for the footer button and for browsers that never show
  // the install pop-up (iPhone, Firefox, private windows, or after it was dismissed).
  function appPlatform() {
    var ua = navigator.userAgent || '';
    var os = appIOS() ? 'ios' : (/android/i.test(ua) ? 'android' : (/macintosh|mac os x/i.test(ua) ? 'mac' : 'desktop'));
    var br = /firefox|fxios/i.test(ua) ? 'firefox' : (/edg|edga|edgios/i.test(ua) ? 'edge' : (/samsungbrowser/i.test(ua) ? 'samsung'
      : (/chrome|crios/i.test(ua) ? 'chrome' : (/safari/i.test(ua) ? 'safari' : 'other'))));
    return { os: os, br: br };
  }
  function appHelpSteps() {
    var p = appPlatform(), steps, note = '';
    if (p.os === 'ios') {
      steps = ['Tap the <b>Share</b> button (the square with an arrow pointing up).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. Spinback now opens from your home screen.'];
      if (p.br !== 'safari') note = 'No Add to Home Screen option? Open this page in <b>Safari</b> and try again.';
    } else if (p.os === 'android') {
      if (p.br === 'firefox') steps = ['Tap the <b>⋮</b> menu.', 'Tap <b>Install</b>.', 'Tap <b>Add</b>.'];
      else if (p.br === 'samsung') steps = ['Tap the <b>☰</b> menu.', 'Tap <b>Add page to</b>, then <b>Home screen</b>.', 'Tap <b>Add</b>.'];
      else steps = ['Tap the <b>⋮</b> menu at the top right.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).', 'Tap <b>Install</b>.'];
    } else if (p.br === 'firefox') {
      steps = ['Firefox on a computer cannot install web apps.', 'Open <b>rustyworksrce.xyz</b> in <b>Chrome</b> or <b>Edge</b> to install it.'];
    } else if (p.br === 'safari' && p.os === 'mac') {
      steps = ['In the menu bar choose <b>File</b>, then <b>Add to Dock</b>.', 'Click <b>Add</b>.'];
    } else if (p.br === 'edge') {
      steps = ['Click the <b>install</b> icon at the right end of the address bar, or open the <b>…</b> menu, then <b>Apps</b>.', 'Choose <b>Install this site as an app</b>.', 'Click <b>Install</b>.'];
    } else {
      steps = ['Click the <b>install</b> icon (a screen with a down arrow) at the right end of the address bar, or open the <b>⋮</b> menu, then <b>Cast, save and share</b>.', 'Choose <b>Install page as app</b> (or <b>Install Spinback</b>).', 'Click <b>Install</b>.'];
    }
    return { steps: steps, note: note };
  }
  function appDialog(title, bodyHtml) {
    if (!document.body) return;
    var old = document.getElementById('rw-app-help'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var ov = document.createElement('div');
    ov.id = 'rw-app-help'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title);
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,3,1,.78);backdrop-filter:blur(4px)';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:420px;max-height:88vh;overflow:auto;padding:26px 22px 22px;border-radius:14px;' +
      'background:var(--panel,#1c1712);color:var(--text,#ece4da);border:1px solid var(--rust,#cf6a2e);box-shadow:0 20px 60px rgba(0,0,0,.6);' +
      'font:500 15px/1.5 var(--rw-font,"Chakra Petch",system-ui,sans-serif)';
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '✕';
    x.style.cssText = 'position:absolute;top:10px;right:12px;border:0;background:none;color:inherit;opacity:.7;font-size:18px;cursor:pointer;padding:4px 6px';
    var h = document.createElement('div'); h.textContent = title;
    h.style.cssText = 'font:700 20px var(--rw-font,Oswald,system-ui,sans-serif);margin:0 28px 12px 0';
    var b = document.createElement('div'); b.innerHTML = bodyHtml;
    box.appendChild(x); box.appendChild(h); box.appendChild(b); ov.appendChild(box); document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    x.focus();
  }
  function appHelp() {
    if (appInstalled()) { appDialog('Already installed', '<p style="margin:0">Spinback is already installed on this device. Open it from your home screen or app list.</p>'); return; }
    if (APP.evt) { appPrompt(); return; }
    var h = appHelpSteps(), html = '<ol style="margin:0 0 12px;padding-left:20px">';
    for (var i = 0; i < h.steps.length; i++) html += '<li style="margin:0 0 8px">' + h.steps[i] + '</li>';
    html += '</ol>';
    if (h.note) html += '<p style="margin:0 0 10px;opacity:.85">' + h.note + '</p>';
    html += '<p style="margin:0;opacity:.7;font-size:13px">Not seeing it? Make sure you are not in a private or incognito window.</p>';
    appDialog('Get the Spinback app', html);
  }

  function appShowPill(forceHint) {
    if (APP.pill || appInstalled() || !document.body) return;
    var ios = !APP.evt && appIOSSafari();
    if (!ios && !APP.evt) return;
    if (!forceHint && appDismissed()) return;
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Install the Spinback app');
    box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-width:360px;z-index:9000;display:flex;align-items:center;gap:12px;' +
      'padding:12px 14px;border-radius:14px;background:var(--panel,#1c1712);color:var(--text,#ece4da);border:1px solid var(--rust,#cf6a2e);' +
      'box-shadow:0 12px 34px rgba(0,0,0,.5);font:500 14px/1.35 var(--rw-font,"Chakra Petch",system-ui,sans-serif)';
    var img = document.createElement('img');
    img.src = '/media/spinback-app-192.png'; img.alt = ''; img.width = 40; img.height = 40;
    img.style.cssText = 'flex:none;border-radius:10px';
    var txt = document.createElement('div'); txt.style.cssText = 'flex:1;min-width:0';
    txt.innerHTML = ios
      ? '<b>Get the Spinback app</b><br><span style="opacity:.8">Tap the Share button, then “Add to Home Screen”.</span>'
      : '<b>Get the Spinback app</b><br><span style="opacity:.8">Open us from your home screen.</span>';
    box.appendChild(img); box.appendChild(txt);
    if (!ios) {
      var go = document.createElement('button'); go.type = 'button'; go.textContent = 'Install';
      go.style.cssText = 'flex:none;border:0;border-radius:9px;padding:9px 16px;font:600 14px var(--rw-font,"Chakra Petch",system-ui,sans-serif);cursor:pointer;background:linear-gradient(135deg,var(--rust,#cf6a2e),var(--rust-2,#e8843f));color:#1a0f06';
      go.addEventListener('click', function () { appPrompt(); });
      box.appendChild(go);
    }
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Hide this'); x.textContent = '✕';
    x.style.cssText = 'flex:none;border:0;background:none;color:inherit;opacity:.65;font-size:16px;cursor:pointer;padding:4px 2px';
    x.addEventListener('click', function () { appHidePill(true); });
    box.appendChild(x);
    document.body.appendChild(box);
    APP.pill = box;
  }

  appHead();
  window.addEventListener('beforeinstallprompt', function (e) {
    /* The event is kept for our own Install button below. Nothing is prevented, so Chrome's
       own install bar is left free to appear and its console warning about a banner that was
       blocked and never shown cannot happen. */
    APP.evt = e;
    if (!APP.timer) APP.timer = setTimeout(function () { appShowPill(false); }, APP_SHOW_AFTER_MS);
  });
  window.addEventListener('appinstalled', function () { APP.evt = null; appHidePill(false); document.documentElement.setAttribute('data-app', '1'); });
  window.addEventListener('load', function () {
    appRegister();
    if (appIOSSafari() && !appInstalled() && !appDismissed() && !APP.timer) APP.timer = setTimeout(function () { appShowPill(false); }, APP_SHOW_AFTER_MS);
  });

  // ── Public API ────────────────────────────────────────────────────────────
  window.RWTheme = {
    DEFAULTS: DEFAULTS,
    STORAGE_KEY: STORAGE_KEY,
    FONTS: FONTS,
    SIZES: SIZES,
    loadFonts: loadFonts,

    /** What the Settings page needs to know about the seasonal theme right now. */
    season: function () {
      var st = seasonState(settings), info = SEASON_INFO[st.key] || null;
      return {
        mode: st.mode,                 // 'auto' | 'optional' | 'off'
        active: !!st.active,           // is it showing on this device right now
        available: !!st.key,           // is there a season on the calendar today
        key: st.key,
        name: info ? info.name : '',
        icon: info ? info.icon : '',
        preview: info ? info.preview : null,
        endsOn: st.key ? seasonEnd(st.key) : '',     // 'MM-DD' of the last day
        previewing: !!st.previewing
      };
    },

    get: function () {
      var copy = {};
      for (var k in settings) copy[k] = settings[k];
      return copy;
    },

    /** Merge a partial update, apply it, persist it, and sync to the API. */
    set: function (patch, opts) {
      opts = opts || {};
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) settings[k] = patch[k];
      }
      settings.font = validFont(settings.font);
      settings.fontSize = validSize(settings.fontSize);
      apply(settings);
      write(settings);
      stripHeavyMedia();
      syncSeason();

      // Push to the server so the choice follows the user across devices.
      // Silently ignored when logged out — that's the expected case.
      if (opts.sync !== false && window.rwFetch) {
        try {
          window.rwFetch('/auth/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: settings })
          }).catch(function () {});
        } catch (e) {}
      }

      try {
        window.dispatchEvent(new CustomEvent('rw-settings-changed', { detail: settings }));
      } catch (e) {}

      return this.get();
    },

    /** Apply settings that came down from the API without re-uploading them. */
    hydrateFromServer: function (serverSettings) {
      if (!serverSettings || typeof serverSettings !== 'object') return;
      var localRaw = null;
      try { localRaw = localStorage.getItem(STORAGE_KEY); } catch (e) {}

      // A device that has never set anything locally adopts the server copy.
      // A device with its own saved choice keeps it — the person changed it on
      // THIS device most recently, so it wins.
      if (localRaw) return;

      for (var k in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(serverSettings, k)) settings[k] = serverSettings[k];
      }
      settings.font = validFont(settings.font);
      settings.fontSize = validSize(settings.fontSize);
      apply(settings);
      write(settings);
      stripHeavyMedia();
      syncSeason();
    },

    toggleTheme: function () {
      return this.set({ theme: settings.theme === 'light' ? 'dark' : 'light' });
    },

    refresh: stripHeavyMedia,

    /** Install-as-app helpers: RWTheme.install.help() (button), .prompt(), .available(), .installed() */
    install: { available: appCanInstall, prompt: appPrompt, help: appHelp, installed: appInstalled, ios: appIOSSafari }
  };
})();