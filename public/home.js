/* ==========================================================================
   RustyWorks RCE — homepage behaviour
   --------------------------------------------------------------------------
   The homepage ships markup and styles; everything interactive lives here so
   index.html stays readable and this file can be cached on its own.

   Loaded with defer, so the DOM is ready when it runs, and written so that
   every piece degrades quietly: no API, no video file, no IntersectionObserver
   or no account session still leaves a working page.
   ========================================================================== */
(function () {
  'use strict';

  var byId = function (id) { return document.getElementById(id); };
  var on = function (el, type, fn) { if (el) el.addEventListener(type, fn); };
  var prefersReducedMotion = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* ---------- mobile navigation ---------- */
  (function nav() {
    var toggle = byId('navToggle');
    var links = byId('navLinks');
    if (!toggle || !links) return;

    function setOpen(open) {
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    on(toggle, 'click', function () { setOpen(!links.classList.contains('open')); });
    links.querySelectorAll('a').forEach(function (a) { on(a, 'click', function () { setOpen(false); }); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

    /* Leaving the phone layout while the menu is open would leave it stuck open. */
    var wide = window.matchMedia && window.matchMedia('(min-width: 761px)');
    on(wide, 'change', function (e) { if (e.matches) setOpen(false); });
  })();

  /* ---------- footer year ---------- */
  var year = byId('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- "get the app" button ---------- */
  on(byId('rwInstallBtn'), 'click', function () {
    if (window.RWTheme && window.RWTheme.install) window.RWTheme.install.help();
    else window.open('https://support.google.com/chrome/answer/9658361', '_blank', 'noopener');
  });

  /* ---------- partners panel ---------- */
  (function partners() {
    var panel = byId('partnersPanel');
    if (!panel) return;
    var closeBtn = byId('ppClose');
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.querySelectorAll('[data-open-partners]').forEach(function (a) {
      on(a, 'click', function (e) { e.preventDefault(); open(); });
    });
    on(closeBtn, 'click', close);
    on(panel, 'click', function (e) { if (e.target === panel) close(); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') close(); });
  })();

  /* ---------- scroll reveal ---------- */
  (function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    /* No observer, or a visitor who asked for less motion: show everything. */
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        setTimeout(function () { entry.target.classList.add('in'); }, (i % 6) * 80);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- hero video: loop fade, and a clean fallback ---------- */
  (function heroVideo() {
    var video = byId('rwHeroVideo');
    var fade = byId('rwHeroFade');
    if (!video) return;

    /* Loop it into the background so it blends with the page. */
    video.loop = true;

    /* Missing file, blocked autoplay, unsupported codec: fall back to the CSS
       gradient behind the hero instead of showing an empty black box. */
    function fallback() {
      video.style.display = 'none';
      if (fade) fade.style.opacity = '0';
    }

    on(video, 'error', fallback);
    on(video.querySelector('source'), 'error', fallback);
    if (!video.getAttribute('src') && !video.querySelector('source[src]')) fallback();

    if (prefersReducedMotion()) { video.pause(); fallback(); return; }

    /* Fade to black over the seam at both ends of the clip, measured in video
       time so it keeps working if the clip is replaced with a different length. */
    var FADE_WINDOW = 0.6;
    on(video, 'timeupdate', function () {
      if (!fade || !video.duration || !isFinite(video.duration)) return;
      var remaining = video.duration - video.currentTime;
      if (remaining < FADE_WINDOW) fade.style.opacity = '1';
      else if (video.currentTime < FADE_WINDOW) fade.style.opacity = '0';
    });

    /* Autoplay can still be refused: keep the fallback rather than a frozen frame. */
    var playing = video.play();
    if (playing && playing.catch) playing.catch(function () {});
  })();

  /* ---------- live player / server counts ---------- */
  /* The bot API sends no CORS headers, so a browser fetch straight to it fails.
     The site's own /api/status proxy (worker.js) keeps the request same-origin;
     if the page is ever hosted without that worker we call the API directly.
     Either way, both failing just leaves the numbers already in the markup. */
  (function liveStats() {
    var users = byId('statUsers');
    var servers = byId('statServers');
    if (!users || !servers) return;

    var controller = ('AbortController' in window) ? new AbortController() : null;
    /* The bot API sleeps when idle, so allow for a cold start before giving up. */
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 30000);
    var options = controller ? { signal: controller.signal } : undefined;

    function viaSite() {
      return fetch('/api/status', Object.assign({ headers: { accept: 'application/json' } }, options))
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
    }

    function viaApi() {
      if (!window.RWApi || !window.RWApi.configured()) return Promise.reject(new Error('no API configured'));
      return window.RWApi.get('/api/status', options);
    }

    function apply(data) {
      var stats = data && data.stats;
      if (!stats) return;
      if (stats.users > 0) users.textContent = Number(stats.users).toLocaleString() + '+';
      if (stats.servers > 0) servers.textContent = Number(stats.servers).toLocaleString();
    }

    viaSite().catch(viaApi).then(apply).catch(function () {}).then(function () { clearTimeout(timer); });
  })();

  /* ---------- Colour Studio needs a Discord sign-in ---------- */
  (function colourStudio() {
    if (!window.RWAuth || !window.RWAuth.ready) return;
    window.RWAuth.ready.then(function (me) {
      if (!me || !me.authenticated) return;
      var btn = byId('csBtn');
      if (btn) {
        btn.href = 'dashboard/colortext.html';
        btn.textContent = '🎨 Open Colour Studio';
      }
      var tag = document.querySelector('.colour-studio-section .tag');
      if (tag) {
        tag.textContent = '✅ Unlocked — you are signed in';
        tag.classList.add('u-green');
      }
    });
  })();
})();
