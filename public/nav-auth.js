/* ============================================================================
 * nav-auth.js — the global signed-in header widget
 *
 * Logged OUT  → renders clean login pill.
 * Logged IN   → renders capsule widget:
 *               Left side: perfect circle Discord avatar
 *               Center: username
 *               Right side: dropdown indicator arrow
 *               Opens downwards into a clean, themed dropdown.
 * ==========================================================================*/
(function () {
  'use strict';

  if (window.__rwNavAuthLoaded) return;
  window.__rwNavAuthLoaded = true;

  var CACHE_KEY = 'spinback_me_cache_v1';
  var CACHE_TTL = 60 * 1000;
  var API = window.SPINBACK_API || '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function avatarUrl(me) {
    if (!me || !me.id) return '';
    if (me.avatar) {
      var animated = String(me.avatar).indexOf('a_') === 0;
      var lowDevice = document.documentElement.getAttribute('data-lowdevice') === '1';
      var ext = (animated && !lowDevice) ? 'gif' : 'png';
      return 'https://cdn.discordapp.com/avatars/' + me.id + '/' + me.avatar + '.' + ext + '?size=64';
    }
    var idx = 0;
    try { idx = Number(BigInt(me.id) % 5n); } catch (e) { idx = 0; }
    return 'https://cdn.discordapp.com/embed/avatars/' + idx + '.png';
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.t) return null;
      if (Date.now() - obj.t > CACHE_TTL) return { stale: true, me: obj.me };
      return { stale: false, me: obj.me };
    } catch (e) { return null; }
  }

  function writeCache(me) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), me: me })); } catch (e) {}
  }

  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  var LINKS = {
    servers:  '/servers.html',
    profile:  '/profile.html',
    settings: '/settings.html',
    admin:    '/admin.html',
    login:    '/login.html'
  };

  var I = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 3v5.7c0 4.4-3.1 8.2-7.5 9.3-4.4-1.1-7.5-4.9-7.5-9.3V6L12 3z"/><path d="M9.5 12.2l1.9 1.9 3.4-3.6"/></svg>',
    server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
    user:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5v-1a5.5 5.5 0 015.5-5.5h4a5.5 5.5 0 015.5 5.5v1"/></svg>',
    gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 14.9a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    chev:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    discord:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.3 5.3A16.9 16.9 0 0015.1 4l-.2.4a12.6 12.6 0 00-5.8 0L8.9 4a16.9 16.9 0 00-4.2 1.3C2 9.3 1.3 13.2 1.6 17a17 17 0 005.2 2.6l.9-1.5a11 11 0 01-1.7-.8l.4-.3a12.1 12.1 0 0011.2 0l.4.3a11 11 0 01-1.7.8l.9 1.5a17 17 0 005.2-2.6c.4-4.4-.6-8.2-2.9-11.7zM8.7 14.7c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm6.6 0c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z"/></svg>'
  };

  function getNav() {
    return document.getElementById('navLinks') ||
           document.querySelector('.nav-links') ||
           document.querySelector('header nav');
  }

  function ensureMount() {
    var existing = document.getElementById('rwAuthMount');
    if (existing && existing.getAttribute('data-rw-built') === '1') return existing;
    if (existing) { existing.setAttribute('data-rw-built', '1'); return existing; }

    var nav = getNav();
    if (!nav) return null;

    var anchors = nav.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var href = (anchors[i].getAttribute('href') || '').toLowerCase();
      var txt  = (anchors[i].textContent || '').trim().toLowerCase();
      if (href.indexOf('login.html') > -1 && (txt === 'login' || txt === 'my servers' || txt === '🔑 login')) {
        anchors[i].parentNode.removeChild(anchors[i]);
      }
    }

    var mount = document.createElement('div');
    mount.id = 'rwAuthMount';
    mount.className = 'rw-auth';
    mount.setAttribute('data-rw-built', '1');

    var cta = null;
    var all = nav.querySelectorAll('a.btn');
    for (var j = 0; j < all.length; j++) {
      if ((all[j].getAttribute('href') || '').indexOf('discord.com/oauth2') > -1) { cta = all[j]; break; }
    }
    if (cta) nav.insertBefore(mount, cta);
    else nav.appendChild(mount);

    return mount;
  }

  function renderLoggedOut(mount) {
    mount.innerHTML =
      '<a href="' + LINKS.login + '" class="rw-auth-login">' +
        '<span class="rw-auth-login-ico">' + I.user + '</span>' +
        '<span>Login</span>' +
      '</a>';
  }

  function renderLoggedIn(mount, me) {
    var name  = me.username || 'Account';
    var isDev = !!me.isDev;

    // Developer Admin Hub is a Spinback addition; it renders as an
    // ordinary row so it does not break the flat list.
    var devLink = isDev
      ? '<a class="rw-account-dev" role="menuitem" href="' + LINKS.admin + '">' +
          'Developer Admin Hub<span class="rw-dev-pip">DEV</span>' +
        '</a>'
      : '';

    mount.innerHTML =
      '<button type="button" class="rw-account-trigger" id="rwAuthChip" ' +
              'aria-haspopup="menu" aria-expanded="false" aria-controls="rwAuthMenu" ' +
              'aria-label="Open account menu">' +
        '<img src="' + esc(avatarUrl(me)) + '" alt="" width="34" height="34" referrerpolicy="no-referrer">' +
        '<span class="rw-account-name">' + esc(name) + '</span>' +
        '<span class="rw-account-chevron" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</span>' +
      '</button>' +

      '<div class="rw-account-menu" id="rwAuthMenu" role="menu" hidden>' +
        '<div class="rw-account-menu-identity">' +
          '<small>Signed in with Discord</small>' +
          '<strong>' + esc(name) + '</strong>' +
        '</div>' +
        devLink +
        '<a role="menuitem" href="' + LINKS.servers  + '">Server Configure</a>' +
        '<a role="menuitem" href="' + LINKS.profile  + '">Profile</a>' +
        '<a role="menuitem" href="' + LINKS.settings + '">Settings</a>' +
        '<button type="button" role="menuitem" id="rwSignOut">Sign Out</button>' +
      '</div>';

    wireMenu(mount);
  }

  function wireMenu(mount) {
    var chip = mount.querySelector('#rwAuthChip');
    var menu = mount.querySelector('#rwAuthMenu');
    if (!chip || !menu) return;

    function open() {
      menu.hidden = false;
      mount.classList.add('open');
      chip.setAttribute('aria-expanded', 'true');
      menu.classList.remove('flip');
      var rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) menu.classList.add('flip');
    }

    function close() {
      menu.hidden = true;
      mount.classList.remove('open');
      chip.setAttribute('aria-expanded', 'false');
    }

    function toggle(e) {
      e.preventDefault();
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    }

    chip.addEventListener('click', toggle);

    document.addEventListener('click', function (e) {
      if (!menu.hidden && !mount.contains(e.target)) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { close(); chip.focus(); }
    });

    var signOut = mount.querySelector('#rwSignOut');
    if (signOut) {
      signOut.addEventListener('click', function (e) {
        e.preventDefault();
        doSignOut();
      });
    }
  }

  function doSignOut() {
    clearCache();
    var done = function () { window.location.href = '/index.html'; };
    try {
      var f = window.rwFetch
        ? window.rwFetch('/auth/logout', { method: 'POST', cache: 'no-store' })
        : fetch(API + '/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' });
      f.then(done, done);
    } catch (e) { done(); }
  }

  function paint(me) {
    var mount = ensureMount();
    if (mount) {
      if (me && me.authenticated) renderLoggedIn(mount, me);
      else renderLoggedOut(mount);
    }
    if (window.hideLoader) window.hideLoader();
  }

  function fetchMe() {
    var p = window.rwFetch
      ? window.rwFetch('/auth/me')
      : fetch(API + '/auth/me', { credentials: 'include' });

    return p.then(function (r) { return r.json(); });
  }

  function boot() {
    var cached = readCache();

    if (cached && cached.me) paint(cached.me);
    else paint(null);

    if (cached && !cached.stale) {
      window.RWAuth.me = cached.me;
      window.RWAuth._resolve(cached.me);
      if (cached.me && cached.me.settings && window.RWTheme) {
        window.RWTheme.hydrateFromServer(cached.me.settings);
      }
      return;
    }

    fetchMe().then(function (me) {
      writeCache(me);
      paint(me);
      window.RWAuth.me = me;
      window.RWAuth._resolve(me);
      if (me && me.settings && window.RWTheme) window.RWTheme.hydrateFromServer(me.settings);
    }).catch(function () {
      if (!cached) paint(null);
      window.RWAuth._resolve(null);
    });
  }

  var _resolveFn;
  var _ready = new Promise(function (res) { _resolveFn = res; });

  window.RWAuth = {
    me: null,
    ready: _ready,
    _resolve: function (v) { _resolveFn(v); },
    signOut: doSignOut,
    clearCache: clearCache,
    avatarUrl: avatarUrl,

    reload: function () {
      clearCache();
      return fetchMe().then(function (me) {
        writeCache(me);
        paint(me);
        window.RWAuth.me = me;
        return me;
      });
    },

    require: function (opts) {
      opts = opts || {};
      return _ready.then(function (me) {
        if (me && me.authenticated) return me;
        return fetchMe().then(function (fresh) {
          writeCache(fresh);
          if (fresh && fresh.authenticated) { paint(fresh); return fresh; }
          if (opts.redirect === false) return null;
          try { sessionStorage.setItem('rw_after_login', location.pathname + location.search); } catch (e) {}
          location.replace(LINKS.login + '?next=' + encodeURIComponent(location.pathname + location.search));
          return null;
        });
      });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();