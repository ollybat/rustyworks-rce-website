/* ==========================================================================
   Header account widget
   --------------------------------------------------------------------------
   Renders into the <div class="rw-auth" id="rwAuth"> slot in the navigation:
   a "Login" pill for visitors, and a capsule with the Discord avatar, a small
   menu and a level badge (.rw-authlevel — the stylesheet already knows it) for
   the signed-in server owner.

   Everything comes from /auth/me on this origin, which reads the signed session
   cookie. The widget is decoration: the page it links to checks the session
   again on the server, so hiding it would buy nobody anything.

   Without JavaScript, or if the request fails, nothing is drawn and the nav
   simply has one fewer item — every page still works.
   ========================================================================== */
(function () {
  "use strict";

  var DISCORD_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.6a15 15 0 0 1 4.4 2.2 13.9 13.9 0 0 0-11-1.1 14.4 14.4 0 0 0-2.6 1.1A15.4 15.4 0 0 1 8.9 3.6L8.6 3A19.8 19.8 0 0 0 3.7 4.4C.6 9 -.2 13.5.2 17.9a19.9 19.9 0 0 0 6 3l.8-1.3a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1l.8 1.4a19.8 19.8 0 0 0 6-3.1c.5-5-.8-9.4-3.7-13.5ZM8.4 15.3c-1.2 0-2.2-1.1-2.2-2.4S7.2 10.5 8.4 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.2 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  var state = { authenticated: false, configured: false, user: null, guild: null, role: null };
  var slot = null;
  var trigger = null;
  var menu = null;

  function el(html) {
    var box = document.createElement("div");
    box.innerHTML = html;
    return box.firstElementChild;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function loginUrl(next) {
    return "/auth/login" + (next ? "?next=" + encodeURIComponent(next) : "");
  }

  function closeMenu() {
    if (!menu) return;
    menu.hidden = true;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!menu) return;
    menu.hidden = false;
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    /* Near the right edge the menu flips to open leftwards (see style.css). */
    var box = menu.getBoundingClientRect();
    menu.classList.toggle("flip", box.right > window.innerWidth - 8);
  }

  function renderSignedOut() {
    if (!slot) return;
    slot.innerHTML = "";
    var link = el('<a class="rw-auth-login" href="' + loginUrl() + '"><span class="rw-auth-login-ico">' + DISCORD_ICON + '</span><span>Login</span></a>');
    slot.appendChild(link);
  }

  function renderSignedIn() {
    if (!slot) return;
    var user = state.user || {};
    var name = escapeHtml(user.name || user.username || "Account");
    var avatar = user.avatar ? escapeHtml(user.avatar) : "/media/rustyworks-icon.svg";

    slot.innerHTML = "";
    trigger = el('<button type="button" class="rw-account-trigger" aria-expanded="false" aria-haspopup="true"><img src="' + avatar + '" alt=""><span class="rw-account-name">' + name + '</span><span class="rw-account-chevron">' + CHEVRON + '</span></button>');
    slot.appendChild(trigger);

    var levelLabel = state.role === "owner" ? "Server owner" : (state.role === "admin" ? "Administrator" : "Player");
    var levelClass = "rw-authlevel is-" + (state.role || "player");
    menu = el('<div class="rw-account-menu" hidden><div class="rw-account-menu-identity"><small>Signed in with Discord</small><strong>' + name + '</strong></div><span class="' + levelClass + '"><span class="rw-al-dot"></span>' + levelLabel + '</span><a href="/dashboard">Dashboard</a><a href="/">Website</a><button type="button" data-rw-logout>Sign out</button></div>');
    slot.appendChild(menu);

    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      if (menu.hidden) { openMenu(); } else { closeMenu(); }
    });
    menu.addEventListener("click", function (event) {
      var button = event.target.closest("[data-rw-logout]");
      if (button) { window.location.href = "/auth/logout"; }
    });
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
  }

  function render() {
    if (!slot) return;
    if (state.authenticated) renderSignedIn(); else renderSignedOut();
  }

  function load() {
    return fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (data) {
          state.authenticated = !!data.authenticated;
          state.configured = !!data.configured;
          state.user = data.user || null;
          state.guild = data.guild || null;
          state.role = data.role || null;
        }
        render();
        return state;
      })
      .catch(function () {
        /* Offline or blocked: leave the nav as it was. */
        return state;
      });
  }

  /* Public surface — other pages may read it, nothing depends on it. */
  window.RWAuth = {
    ready: null,
    current: function () { return state.authenticated ? state : null; },
    isAuthenticated: function () { return state.authenticated; },
    configured: function () { return state.configured; },
    loginUrl: loginUrl,
    logout: function () { window.location.href = "/auth/logout"; },
    refresh: load,
  };

  function start() {
    slot = document.getElementById("rwAuth") || document.getElementById("rwAuthMount");
    window.RWAuth.ready = load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
