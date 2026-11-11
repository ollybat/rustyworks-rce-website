/* ==========================================================================
   Login page behaviour
   --------------------------------------------------------------------------
   One job: keep the button honest about where the visitor stands.

   * reads ?next=  so a link like login.html?next=%2Fdashboard%2Fcolortext.html
     returns people to the tool they were reaching for;
   * asks /auth/me  whether this browser already holds a session;
   * swaps the sign-in button for "Continue as <name>" when it does.

   The real decision is not made here — /dashboard checks the signed cookie on
   the server — so nothing on this page has to be trusted.
   ========================================================================== */
(function () {
  "use strict";

  var DISCORD_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:20px;height:20px"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.6a15 15 0 0 1 4.4 2.2 13.9 13.9 0 0 0-11-1.1 14.4 14.4 0 0 0-2.6 1.1A15.4 15.4 0 0 1 8.9 3.6L8.6 3A19.8 19.8 0 0 0 3.7 4.4C.6 9 -.2 13.5.2 17.9a19.9 19.9 0 0 0 6 3l.8-1.3a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1l.8 1.4a19.8 19.8 0 0 0 6-3.1c.5-5-.8-9.4-3.7-13.5ZM8.4 15.3c-1.2 0-2.2-1.1-2.2-2.4S7.2 10.5 8.4 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.2 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';

  /* Where the visitor was heading, in words. Kept short on purpose. */
  var PLACES = {
    "/dashboard": "your dashboard",
    "/dashboard/colortext.html": "the Colour Studio",
    "/dashboard/kitbuilder.html": "the Kit Studio",
    "/dashboard/configure.html": "the bot configuration",
    "/dashboard/linking.html": "account linking",
  };

  var statusEl, ctaEl, nextEl;
  var next = "/dashboard";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function place(path) {
    if (PLACES[path]) return PLACES[path];
    var file = path.split("?")[0].split("/").pop() || "";
    if (!file || file === "dashboard") return "your dashboard";
    return "the " + file.replace(/\.html$/, "").replace(/[-_]/g, " ");
  }

  function loginHref() {
    return "/auth/login?next=" + encodeURIComponent(next);
  }

  function show(html) { if (ctaEl) ctaEl.innerHTML = html; }
  function say(text) { if (statusEl) statusEl.innerHTML = text; }

  function renderSignedOut(configured) {
    if (!configured) {
      say("Sign-in isn't switched on for this deployment yet.");
      show('<a class="discord-btn" href="https://discord.gg/NFRkb9NYNd" target="_blank" rel="noopener">Ask in the support server</a>');
      return;
    }
    say("You are not signed in. Continuing takes you to Discord, then straight to " + escapeHtml(place(next)) + ".");
    show('<a class="discord-btn" href="' + loginHref() + '">' + DISCORD_ICON + 'Sign in with Discord</a>');
  }

  function renderSignedIn(data) {
    var name = escapeHtml((data.user && (data.user.name || data.user.username)) || "your account");
    var guild = data.guild && data.guild.name ? escapeHtml(data.guild.name) : "";
    say("Signed in as <strong>" + name + "</strong>" + (guild ? " on <strong>" + guild + "</strong>" : "") + ".");
    show(
      '<a class="discord-btn" href="' + escapeHtml(next) + '">Continue to ' + escapeHtml(place(next)) + '</a>' +
      '<a class="btn ghost" style="margin-left:10px" href="/auth/logout?next=%2Flogin.html">Use a different account</a>'
    );
  }

  function init() {
    statusEl = document.getElementById("loginState");
    ctaEl = document.getElementById("loginCta");
    nextEl = document.getElementById("loginNext");

    var params = new URLSearchParams(window.location.search);
    var wanted = params.get("next");
    /* Same rule as the worker: same-site paths only. */
    if (wanted && wanted.charAt(0) === "/" && wanted.slice(0, 2) !== "//") next = wanted;
    if (nextEl) nextEl.innerHTML = escapeHtml(place(next));

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    if (params.get("signedout")) say("You have been signed out.");
    if (params.get("denied")) say("That account is not the owner of this server, so the dashboard stayed closed.");

    fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) { renderSignedOut(true); return; }
        if (data.authenticated) { renderSignedIn(data); } else { renderSignedOut(data.configured !== false); }
      })
      .catch(function () { renderSignedOut(true); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
