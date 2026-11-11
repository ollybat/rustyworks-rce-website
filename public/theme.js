/* ==========================================================================
   Theme, device mode and "add to home screen"
   --------------------------------------------------------------------------
   Small, dependency-free helpers shared by every page:

   * data-reduce-motion="1" — set from the visitor's motion preference; the
     stylesheet uses it to drop the seasonal animations and transitions.
   * data-lowdevice="1" — set on low-powered hardware; the stylesheet drops
     backdrop blur, shadows and filters.
   * data-app — set when the site is already running as an installed app.
   * RWTheme.install.help() — drives the browser install prompt, or explains
     the exact steps when the browser has no prompt.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var deferredPrompt = null;

  /* ---------- motion preference ---------- */
  var motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function applyMotion() {
    if (!motionQuery) return;
    if (motionQuery.matches) root.setAttribute('data-reduce-motion', '1');
    else root.removeAttribute('data-reduce-motion');
  }
  applyMotion();
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', applyMotion);

  /* ---------- low device mode ---------- */
  /* Cheap heuristic: a couple of slow cores, or very little memory reported.
     Erring on the side of "lean" only costs a few blur effects. */
  (function lowDevice() {
    var cores = navigator.hardwareConcurrency || 4;
    var memory = navigator.deviceMemory || 4;
    var slowNetwork = navigator.connection && /(^|-)2g$/.test(navigator.connection.effectiveType || '');
    if (cores <= 2 || memory <= 2 || slowNetwork) root.setAttribute('data-lowdevice', '1');
  })();

  /* ---------- running as an installed app ---------- */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  if (isStandalone()) root.setAttribute('data-app', '');

  /* ---------- seasonal themes ---------- */
  /* The stylesheet keys the whole seasonal look off <html data-season="…"> and
     draws its moving parts inside #rw-fx; this decides which season is on and
     fills that layer.

     Christmas ships an icon variant, so it can switch the logo. Halloween and
     Thanksgiving are fully styled in the CSS but they swap the logo for
     media/rustyworks-icon-<season>.svg — add those two files to the list below
     and they light up as well. */
  /* from/to are [month, day]; a window that crosses new year wraps around. */
  var SEASONS = [
    { name: 'christmas', from: [11, 1], to: [1, 6], icon: '/media/rustyworks-icon-christmas.svg' }
  ];

  function inSeason(now, season) {
    var month = now.getMonth() + 1, day = now.getDate();
    var here = month * 100 + day, first = season.from[0] * 100 + season.from[1], last = season.to[0] * 100 + season.to[1];
    /* A season that runs over new year (December into January) wraps around. */
    return first <= last ? (here >= first && here <= last) : (here >= first || here <= last);
  }

  /* ?season=christmas previews a season, ?season=off turns them off. */
  function requestedSeason() {
    var asked = /[?&]season=([a-z]+)/i.exec(window.location.search);
    return asked ? asked[1].toLowerCase() : null;
  }

  function currentSeason() {
    var asked = requestedSeason();
    if (asked === 'off' || asked === 'none') return null;
    if (asked) return SEASONS.filter(function (s) { return s.name === asked; })[0] || null;
    var now = new Date();
    return SEASONS.filter(function (s) { return inSeason(now, s); })[0] || null;
  }

  var season = currentSeason();

  function applySeason() {
    if (!season) return;
    root.setAttribute('data-season', season.name);

    /* Swap the logo for the seasonal icon; the stylesheet sizes it a little
       larger so the hat is not clipped. */
    if (season.icon) {
      document.querySelectorAll('img[src$="/media/rustyworks-icon.svg"]').forEach(function (img) { img.src = season.icon; });
    }

    /* Keep the browser/status-bar colour in step with the seasonal palette. */
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (bg && meta) meta.setAttribute('content', bg);
  }

  /* The moving pieces: the stylesheet animates .xm-flake / .xm-star / .xm-spark
     etc. by reading custom properties, so the layer only supplies elements and
     random values. Skipped entirely when the visitor asked for less motion or
     the device was flagged as low-powered. */
  function buildSeasonFx() {
    var layer = document.getElementById('rw-fx');
    if (!layer || !season) return;
    /* Nothing moving for someone who asked for less motion; a light dusting
       rather than a blizzard on hardware that was flagged as low-powered. */
    if (root.hasAttribute('data-reduce-motion')) return;

    var rnd = function (min, max) { return (min + Math.random() * (max - min)).toFixed(2); };
    var full = season.name === 'christmas' ? 26 : 18;
    var count = root.hasAttribute('data-lowdevice') ? Math.round(full / 3) : full;

    for (var i = 0; i < count; i++) {
      var flake = document.createElement('span');
      flake.className = 'xm-flake' + (i % 3 === 0 ? ' b' : '');
      flake.style.setProperty('--x', rnd(0, 100) + 'vw');
      flake.style.setProperty('--sz', rnd(3, 9) + 'px');
      flake.style.setProperty('--o', rnd(0.35, 0.9));
      flake.style.setProperty('--dur', rnd(9, 22) + 's');
      flake.style.setProperty('--del', rnd(0, 14) + 's');
      flake.style.setProperty('--dx', (Math.random() < 0.5 ? '-' : '') + rnd(10, 60) + 'px');
      layer.appendChild(flake);
    }
  }

  /* <html> exists right now, but the logo and the overlay layer live in the
     body, so those wait for the DOM. */
  applySeason();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applySeason(); buildSeasonFx(); });
  } else {
    applySeason();
    buildSeasonFx();
  }

  /* ---------- light / dark ---------- */
  /* The stylesheet ships a complete light palette under html[data-theme="light"].
     Which one a visitor gets: their own saved choice, otherwise the system
     setting. Every page's <head> applies the same choice before first paint, so
     nobody sees a flash of the wrong palette. */
  var THEME_KEY = 'rw-theme';
  var systemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');

  function storedTheme() {
    try {
      var saved = window.localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch (e) {
      return null; /* private mode, or storage turned off */
    }
  }

  /* RustyWorks is designed dark, so that is what a first-time visitor gets and
     what the owner sees. To follow the operating system instead, swap the
     fallback below for: (systemLight && systemLight.matches ? 'light' : 'dark').
     Either way the switch in the navigation wins, and it is remembered. */
  function currentTheme() {
    return storedTheme() || 'dark';
  }

  function applyTheme(name) {
    /* Dark is the stylesheet's default, so it is the absence of the attribute. */
    if (name === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    /* Keep the browser / status-bar colour in step with the palette we just set. */
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);

    var button = document.getElementById('rwThemeToggle');
    if (button) {
      var next = name === 'light' ? 'dark' : 'light';
      button.setAttribute('aria-pressed', name === 'light' ? 'true' : 'false');
      button.setAttribute('aria-label', 'Switch to the ' + next + ' theme');
      button.setAttribute('title', 'Switch to the ' + next + ' theme');
    }
  }

  function setTheme(name) {
    try { window.localStorage.setItem(THEME_KEY, name); } catch (e) {}
    applyTheme(name);
  }

  applyTheme(currentTheme());

  /* The switch sits in the navigation. It is an option, not a requirement, so a
     page without that slot simply goes without it. */
  function buildThemeToggle() {
    if (document.getElementById('rwThemeToggle')) return;
    var slot = document.getElementById('navLinks');
    if (!slot) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'rwThemeToggle';
    button.className = 'rw-theme-toggle';
    button.innerHTML =
      '<svg class="rw-tg-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/></svg>' +
      '<svg class="rw-tg-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4Z"/></svg>';

    button.addEventListener('click', function () {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light');
    });

    /* Just before the account widget, so the two sit together on the right. */
    var account = document.getElementById('rwAuth');
    if (account && account.parentNode === slot) slot.insertBefore(button, account);
    else slot.appendChild(button);

    applyTheme(currentTheme());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildThemeToggle);
  else buildThemeToggle();

  /* ---------- install prompt ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  function steps() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'Tap the Share button, then choose "Add to Home Screen".';
    if (/Android/i.test(ua)) return 'Open the browser menu (⋮), then choose "Install app" or "Add to Home screen".';
    return 'Open your browser menu, then choose "Install app" or "Add to Home screen".';
  }

  window.RWTheme = {
    isStandalone: isStandalone,
    theme: currentTheme,
    setTheme: setTheme,
    toggleTheme: function () { setTheme(currentTheme() === 'light' ? 'dark' : 'light'); },
    season: season ? season.name : null,
    hasFxLayer: !!document.getElementById('rw-fx'),
    install: {
      /* Returns a promise resolving to true when the browser prompt was used. */
      help: function () {
        if (deferredPrompt) {
          var prompt = deferredPrompt;
          deferredPrompt = null;
          return prompt.prompt().then(function () { return true; });
        }
        if (isStandalone()) window.alert('RustyWorks is already running as an app.');
        else window.alert('Install RustyWorks on this device:\n\n' + steps());
        return Promise.resolve(false);
      }
    }
  };
})();
