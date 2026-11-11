/* ==========================================================================
   Status page
   --------------------------------------------------------------------------
   Reads /api/status on this origin (the site proxy) and writes the answer into
   the cards already in status.html — no HTML is built here, only text and a few
   class swaps, which keeps the page honest: the markup cannot drift from the code.

   Nothing is invented. If the bot cannot be reached, the counters go back to an
   em dash and the service row says so, rather than freezing last week's numbers.
   ========================================================================== */
(function () {
  "use strict";

  var REFRESH_MS = 30000;
  var ENDPOINT = "/api/status";
  var timer = null;
  var els = {};

  function byId(id) { return document.getElementById(id); }

  function text(el, value) { if (el) el.textContent = value; }

  function setPill(el, up, label) {
    if (!el) return;
    el.className = up ? "pill-in" : "pill-out";
    el.textContent = label;
  }

  function count(value) {
    return typeof value === "number" ? value.toLocaleString() : "—";
  }

  /* Short version label: the API reports "RustyWorks RCE V0.1.5". */
  function versionLabel(raw) {
    if (!raw) return "—";
    var match = String(raw).match(/v?\d+(\.\d+)*/i);
    return match ? match[0] : String(raw);
  }

  function ago(ms) {
    if (typeof ms !== "number" || !ms) return "";
    var seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 90) return seconds + " second" + (seconds === 1 ? "" : "s") + " ago";
    var minutes = Math.round(seconds / 60);
    if (minutes < 90) return minutes + " minute" + (minutes === 1 ? "" : "s") + " ago";
    var hours = Math.round(minutes / 60);
    if (hours < 36) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";
    return Math.round(hours / 24) + " days ago";
  }

  function stamp() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, "0");
    var mm = String(now.getMinutes()).padStart(2, "0");
    var ss = String(now.getSeconds()).padStart(2, "0");
    return "Checked at " + hh + ":" + mm + ":" + ss;
  }

  function showOffline(reason, latencyMs) {
    setPill(els.svcApiPill, false, "Unreachable");
    text(els.svcApiDetail, "The bot did not answer just now — " + reason + ".");
    if (els.statusDot) els.statusDot.className = "dot unknown";
    text(els.statusHeadline, "Bot status unknown");
    ["statUsers", "statServers", "statGuilds", "statUptime", "statVersion"].forEach(function (key) {
      text(els[key], "—");
    });
    text(els.statusUpdated, stamp() + (typeof latencyMs === "number" ? " · answered in " + latencyMs + " ms" : ""));
  }

  function showOnline(data, latencyMs) {
    var stats = data.stats || {};
    var online = data.online !== false;

    if (els.statusDot) els.statusDot.className = "dot " + (online ? "on" : "off");
    if (online) {
      text(els.statusHeadline, "Bot online — " + (data.version || "running"));
    } else {
      text(els.statusHeadline, "Bot reported itself offline");
    }

    text(els.statUsers, count(stats.users));
    text(els.statServers, count(stats.servers));
    text(els.statGuilds, count(stats.guilds));
    text(els.statUptime, typeof data.uptime30d === "number" ? data.uptime30d + "%" : "—");
    text(els.statVersion, versionLabel(data.version));

    setPill(els.svcApiPill, online, online ? "Online" : "Offline");
    var detail = "Answered in " + latencyMs + " ms";
    var heartbeat = ago(data.lastHeartbeat);
    text(els.svcApiDetail, detail + (heartbeat ? " · last heartbeat " + heartbeat : "") + ".");
    text(els.statusUpdated, stamp());
  }

  function refresh() {
    var started = Date.now();
    return fetch(ENDPOINT, { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        showOnline(data, Date.now() - started);
      })
      .catch(function (error) {
        showOffline(String(error && error.message ? error.message : error), Date.now() - started);
      });
  }

  /* The dashboard row asks the site itself, not the bot API. */
  function checkDashboard() {
    fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) { setPill(els.svcAuthPill, false, "Unknown"); return; }
        if (data.authenticated) {
          setPill(els.svcAuthPill, true, "You are signed in");
          text(els.svcAuthDetail, "Your session is active — open /dashboard to use it.");
        } else if (data.configured) {
          setPill(els.svcAuthPill, true, "Live");
          text(els.svcAuthDetail, "Sign-in is ready; only the server owner is let through.");
        } else {
          setPill(els.svcAuthPill, false, "Not configured");
          text(els.svcAuthDetail, "Waiting on the three Worker secrets, so the dashboard is closed for now.");
        }
      })
      .catch(function () { setPill(els.svcAuthPill, false, "Unknown"); });
  }

  function schedule() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(function () {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  function init() {
    ["statusDot", "statusHeadline", "statusUpdated", "statUsers", "statServers", "statGuilds",
      "statUptime", "statVersion", "svcApiPill", "svcApiDetail", "svcAuthPill", "svcAuthDetail"
    ].forEach(function (id) { els[id] = byId(id); });

    var year = byId("year");
    if (year) year.textContent = String(new Date().getFullYear());

    var button = byId("statusRefresh");
    if (button) button.addEventListener("click", function () { refresh(); checkDashboard(); });

    /* Coming back to the tab should not show numbers from ten minutes ago. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { refresh(); checkDashboard(); }
    });

    refresh();
    checkDashboard();
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
