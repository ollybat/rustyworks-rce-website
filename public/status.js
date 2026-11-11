/* ==========================================================================
   Status page
   --------------------------------------------------------------------------
   Reads /api/status on this origin (the site's own proxy, so the browser is not
   blocked by cross-origin rules) and writes the answer into the markup that is
   already in status.html. No HTML is invented here beyond the tick strip and the
   response-time chart, which are drawn from measurements this browser made.

   Nothing on this page is estimated. Either the API answered - and every figure
   comes from that answer - or the page says it could not reach the bot and labels
   whatever is left on screen as the last reading, with the time it was taken.
   ========================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "/api/status";
  var REFRESH_MS = 30000;
  var TIMEOUT_MS = 6000;
  var STRIP_MAX = 40;
  var PAUSE_KEY = "rw-status-paused";

  /* ---- state ---------------------------------------------------------- */
  var samples = [];        /* { at, ms, ok } - this visit only, never persisted */
  var first = null;        /* first good payload of this visit, for the deltas */
  var lastGood = null;
  var lastGoodAt = 0;
  var lastRaw = "";
  var paused = false;
  var inflight = false;
  var nextAt = 0;
  var els = {};

  function byId(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value; }
  function show(el, visible) { if (el) el.hidden = !visible; }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function count(value) {
    return typeof value === "number" && isFinite(value) ? value.toLocaleString("en-GB") : "\u2014";
  }
  function pct(value, digits) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(digits === undefined ? 2 : digits) + "%" : "\u2014";
  }
  function clock(at) {
    var d = new Date(at);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
  }
  function ago(ms) {
    if (typeof ms !== "number" || !ms) return "";
    var seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 90) return seconds + (seconds === 1 ? " second" : " seconds") + " ago";
    var minutes = Math.round(seconds / 60);
    if (minutes < 90) return minutes + (minutes === 1 ? " minute" : " minutes") + " ago";
    var hours = Math.round(minutes / 60);
    if (hours < 36) return hours + (hours === 1 ? " hour" : " hours") + " ago";
    return Math.round(hours / 24) + " days ago";
  }
  /* Downtime implied by a percentage over 30 days - arithmetic on their number. */
  function downtime(percent) {
    if (typeof percent !== "number" || !isFinite(percent)) return "";
    var minutes = Math.round((100 - percent) / 100 * 30 * 24 * 60);
    if (minutes < 1) return "under a minute of downtime in the last 30 days";
    if (minutes < 90) return "about " + minutes + " minute" + (minutes === 1 ? "" : "s") + " of downtime in the last 30 days";
    var hours = minutes / 60;
    if (hours < 36) return "about " + (Math.round(hours * 10) / 10) + " hours of downtime in the last 30 days";
    return "about " + (Math.round(hours / 24 * 10) / 10) + " days of downtime in the last 30 days";
  }
  function setPill(el, state, label) {
    if (!el) return;
    el.className = state === "up" ? "pill-in" : state === "warn" ? "pill-pend" : state === "down" ? "pill-out" : "pill-out";
    el.textContent = label;
  }

  /* ---- counting up ---------------------------------------------------- */
  function animateTo(el, target, suffix, decimals) {
    if (!el) return;
    var shown = String(el.dataset.value || "");
    el.dataset.value = String(target);
    if (reduceMotion() || shown === "" || typeof target !== "number" || !isFinite(target)) {
      text(el, typeof target === "number" ? target.toLocaleString("en-GB", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 }) + (suffix || "") : target);
      return;
    }
    var from = parseFloat(shown.replace(/[^0-9.]/g, ""));
    if (!isFinite(from) || from === target) {
      text(el, target.toLocaleString("en-GB", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 }) + (suffix || ""));
      return;
    }
    var steps = 16;
    var step = 0;
    if (el.__rwTimer) window.clearInterval(el.__rwTimer);
    el.__rwTimer = window.setInterval(function () {
      step += 1;
      var eased = 1 - Math.pow(1 - step / steps, 3);
      var value = from + (target - from) * eased;
      text(el, value.toLocaleString("en-GB", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 }) + (suffix || ""));
      if (step >= steps) { window.clearInterval(el.__rwTimer); el.__rwTimer = null; }
    }, 34);
  }

  /* ---- the visit strip and chart -------------------------------------- */
  function tickClass(ms) {
    if (ms === null || ms === undefined) return "fail";
    if (ms < 400) return "ok";
    if (ms < 900) return "mid";
    return "slow";
  }
  function drawStrip() {
    var strip = els.stStrip;
    if (!strip) return;
    strip.innerHTML = "";
    var shown = samples.slice(-STRIP_MAX);
    for (var i = 0; i < shown.length; i++) {
      var sample = shown[i];
      var tick = document.createElement("span");
      tick.className = "st-tick " + tickClass(sample.ms);
      var ratio = sample.ms === null || sample.ms === undefined ? 1 : Math.min(1, Math.max(0.18, sample.ms / 1400));
      tick.style.height = Math.round(ratio * 100) + "%";
      tick.title = (sample.ms === null ? "no answer" : sample.ms + " ms") + " at " + clock(sample.at);
      strip.appendChild(tick);
    }
  }
  function drawStats() {
    var good = [];
    for (var i = 0; i < samples.length; i++) if (typeof samples[i].ms === "number") good.push(samples[i].ms);
    var box = els.stSessionStats;
    if (!box) return;
    if (!good.length) {
      text(els.stSessionNote, "Waiting for the first check\u2026");
      box.innerHTML = "";
      return;
    }
    var sorted = good.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var failed = samples.length - good.length;
    var parts = [
      ["checks this visit", String(samples.length)],
      ["fastest", sorted[0] + " ms"],
      ["median", median + " ms"],
      ["slowest", sorted[sorted.length - 1] + " ms"]
    ];
    if (failed) parts.push(["no answer", String(failed)]);
    box.innerHTML = parts.map(function (pair) { return "<span>" + pair[0] + " <b>" + pair[1] + "</b></span>"; }).join("");
  }
  function drawChart() {
    var box = els.stChart;
    if (!box) return;
    var good = samples.filter(function (s) { return typeof s.ms === "number"; });
    if (good.length < 2) {
      box.innerHTML = "";
      return;
    }
    var w = 600, h = 150, padX = 34, padY = 16;
    var values = good.map(function (s) { return s.ms; });
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    var span = Math.max(120, max - Math.min(min, max - 120));
    var top = Math.ceil((max + span * 0.12) / 100) * 100 || 100;
    var yFor = function (ms) { return padY + (1 - ms / top) * (h - padY * 2); };
    var xFor = function (i) { return padX + (i / (good.length - 1)) * (w - padX - 12); };
    var points = good.map(function (s, i) { return xFor(i).toFixed(1) + "," + yFor(s.ms).toFixed(1); });
    var area = points.join(" ") + " " + xFor(good.length - 1).toFixed(1) + "," + (h - padY) + " " + xFor(0).toFixed(1) + "," + (h - padY);
    var dots = good.map(function (s, i) {
      return '<circle class="' + (s.ms >= 900 ? "pt-slow" : "pt") + '" cx="' + xFor(i).toFixed(1) + '" cy="' + yFor(s.ms).toFixed(1) + '" r="2.6"><title>' + s.ms + " ms at " + clock(s.at) + "</title></circle>";
    }).join("");
    box.innerHTML =
      '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="Response time for each check made during this visit">' +
      '<line class="grid" x1="' + padX + '" y1="' + yFor(top) + '" x2="' + (w - 12) + '" y2="' + yFor(top) + '"></line>' +
      '<line class="grid" x1="' + padX + '" y1="' + (h - padY) + '" x2="' + (w - 12) + '" y2="' + (h - padY) + '"></line>' +
      '<polygon class="area" points="' + area + '"></polygon>' +
      '<polyline class="line" points="' + points.join(" ") + '"></polyline>' +
      dots +
      '<text x="4" y="' + (yFor(top) + 3) + '">' + top + "</text>" +
      '<text x="4" y="' + (h - padY + 3) + '">0 ms</text>' +
      '<text x="' + (w - 12) + '" y="' + (h - padY + 12) + '" text-anchor="end">newest</text>' +
      "</svg>";
  }
  function drawBars(data) {
    var bot = data.uptime30d, api = data.apiUptime30d;
    text(els.stBotUptimeText, pct(bot) + " of the last 30 days");
    text(els.stApiUptimeText, pct(api) + " of the last 30 days");
    if (els.stBotFill) {
      els.stBotFill.style.width = (typeof bot === "number" ? Math.max(0, Math.min(100, bot)) : 0) + "%";
      els.stBotFill.className = "st-fill" + (typeof bot === "number" && bot < 99 ? " low" : "");
    }
    if (els.stApiFill) {
      els.stApiFill.style.width = (typeof api === "number" ? Math.max(0, Math.min(100, api)) : 0) + "%";
      els.stApiFill.className = "st-fill" + (typeof api === "number" && api < 99 ? " low" : "");
    }
    var samples = typeof data.samples === "number" ? data.samples : null;
    text(els.stBotFoot, downtime(bot) + (samples ? " \u00b7 based on " + samples.toLocaleString("en-GB") + " checks the bot counted" : ""));
    text(els.stApiFoot, downtime(api));
  }
  function deltaLine(key, current) {
    if (!first || !first.stats || typeof current !== "number") return "";
    var was = first.stats[key];
    if (typeof was !== "number") return "";
    var diff = current - was;
    if (diff === 0) return "no change this visit";
    return (diff > 0 ? "+" : "") + diff.toLocaleString("en-GB") + " this visit";
  }
  function deltaClass(key, current, el) {
    if (!el) return;
    el.className = "s";
    if (!first || !first.stats || typeof current !== "number" || typeof first.stats[key] !== "number") return;
    var diff = current - first.stats[key];
    if (diff > 0) el.className = "s up";
    else if (diff < 0) el.className = "s down";
  }

  /* ---- rendering ------------------------------------------------------ */
  function paintGood(data, ms, at) {
    var stats = data.stats || {};
    var online = data.online !== false;
    if (!first) first = data;
    lastGood = data;
    lastGoodAt = at;
    lastRaw = JSON.stringify(data, null, 2);
    text(els.stRaw, lastRaw);

    if (els.statusDot) els.statusDot.className = "dot " + (online ? "on" : "off");
    text(els.statusHeadline, online ? "All systems answering \u00b7 " + (data.version || "bot online") : "The bot reports itself offline");

    animateTo(els.statUsers, typeof stats.users === "number" ? stats.users : null);
    animateTo(els.statServers, typeof stats.servers === "number" ? stats.servers : null);
    animateTo(els.statGuilds, typeof stats.guilds === "number" ? stats.guilds : null);
    animateTo(els.statUptime, typeof data.uptime30d === "number" ? data.uptime30d : null, "%", 2);
    animateTo(els.statApiUptime, typeof data.apiUptime30d === "number" ? data.apiUptime30d : null, "%", 2);

    text(els.subUsers, deltaLine("users", stats.users) || "live, from the bot");
    text(els.subServers, deltaLine("servers", stats.servers) || "live, from the bot");
    text(els.subGuilds, deltaLine("guilds", stats.guilds) || "live, from the bot");
    deltaClass("users", stats.users, els.subUsers);
    deltaClass("servers", stats.servers, els.subServers);
    deltaClass("guilds", stats.guilds, els.subGuilds);
    text(els.subUptime, "as reported by the bot");
    text(els.subApiUptime, "as reported by the bot");

    setPill(els.svcApiPill, online ? "up" : "down", online ? "Online" : "Offline");
    text(els.svcApiDetail, "Answered in " + ms + " ms \u00b7 " + (data.version || "version not given") + " \u00b7 called through this site so your browser is never blocked by cross-origin rules.");

    var beat = typeof data.lastHeartbeat === "number" ? data.lastHeartbeat : null;
    if (beat) {
      var beatAge = Date.now() - beat;
      setPill(els.svcBeatPill, beatAge < 5 * 60 * 1000 ? "up" : beatAge < 60 * 60 * 1000 ? "warn" : "down",
        beatAge < 5 * 60 * 1000 ? "Fresh" : beatAge < 60 * 60 * 1000 ? "Lagging" : "Old");
      text(els.svcBeatDetail, "Last heartbeat " + ago(beat) + " (" + clock(beat) + "). If it stops moving, the bot is in trouble even when the API still answers.");
    } else {
      setPill(els.svcBeatPill, "down", "Not reported");
      text(els.svcBeatDetail, "The API did not include a heartbeat timestamp in this answer.");
    }

    drawBars(data);
    text(els.stUpdated, "Checked at " + clock(at) + " \u00b7 answered in " + ms + " ms \u00b7 " + samples.length + (samples.length === 1 ? " check" : " checks") + " this visit");
    for (var i = 0; i < els.kpis.length; i++) els.kpis[i].classList.remove("is-stale");
    show(els.stBanner, false);
  }

  function paintBad(reason) {
    if (els.statusDot) els.statusDot.className = "dot unknown";
    text(els.statusHeadline, "Bot status unknown");
    setPill(els.svcApiPill, "down", "Unreachable");
    text(els.svcApiDetail, "The bot did not answer just now \u2014 " + reason + ".");
    show(els.stBanner, true);
    for (var i = 0; i < els.kpis.length; i++) els.kpis[i].classList.add("is-stale");
    if (lastGood) {
      text(els.stBannerTitle, "Showing the last reading, not a live one");
      text(els.stBannerText, "This page could not reach the bot just now (" + reason + "). The figures still on screen are the reading taken at " +
        clock(lastGoodAt) + ", " + ago(lastGoodAt) + " \u2014 nothing has been updated since. Refreshing carries on automatically.");
    } else {
      text(els.stBannerTitle, "Cannot reach the bot");
      text(els.stBannerText, "The first attempt failed (" + reason + "). Nothing is shown rather than something stale \u2014 another check runs in a moment.");
    }
    text(els.stUpdated, "Last successful check: " + (lastGoodAt ? clock(lastGoodAt) + " (" + ago(lastGoodAt) + ")" : "none yet"));
  }

  /* ---- the check itself ------------------------------------------------ */
  function refresh(reason) {
    if (inflight) return Promise.resolve();
    inflight = true;
    if (els.stRefresh) els.stRefresh.disabled = true;
    var started = Date.now();
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    return fetch(ENDPOINT, { cache: "no-store", headers: { accept: "application/json" }, signal: controller ? controller.signal : undefined })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var ms = Date.now() - started;
        samples.push({ at: Date.now(), ms: ms, ok: true });
        paintGood(data, ms, Date.now());
      })
      .catch(function (error) {
        samples.push({ at: Date.now(), ms: null, ok: false });
        paintBad(String((error && error.message) || error));
      })
      .then(function () {
        if (timer) window.clearTimeout(timer);
        inflight = false;
        if (els.stRefresh) els.stRefresh.disabled = false;
        drawStrip(); drawStats(); drawChart();
        nextAt = Date.now() + REFRESH_MS;
      });
  }

  /* The dashboard row asks this site, not the bot API. */
  function checkDashboard() {
    return fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) { setPill(els.svcAuthPill, "warn", "Unknown"); return; }
        if (data.authenticated) {
          setPill(els.svcAuthPill, "up", "You are signed in");
          text(els.svcAuthDetail, "Your owner session is active \u2014 open /dashboard to use it.");
        } else if (data.configured) {
          setPill(els.svcAuthPill, "up", "Ready");
          text(els.svcAuthDetail, "Discord sign-in is set up; only the owner of the server the bot runs in is let through.");
        } else {
          setPill(els.svcAuthPill, "warn", "Not switched on");
          text(els.svcAuthDetail, "The owner-only dashboard at /dashboard is waiting on its Worker secrets, so sign-in stays closed for now.");
        }
      })
      .catch(function () { setPill(els.svcAuthPill, "warn", "Unknown"); });
  }

  /* ---- ticking clock: next check, fresh "ago" lines -------------------- */
  function tick() {
    if (document.hidden) return;
    var seconds = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    if (els.stNext) {
      if (paused) text(els.stNext, "Auto-refresh paused");
      else if (!samples.length) text(els.stNext, "Checking now\u2026");
      else text(els.stNext, "Next check in " + seconds + (seconds === 1 ? " second" : " seconds"));
    }
    if (lastGood && typeof lastGood.lastHeartbeat === "number") {
      text(els.svcBeatDetail, "Last heartbeat " + ago(lastGood.lastHeartbeat) + " (" + clock(lastGood.lastHeartbeat) + "). If it stops moving, the bot is in trouble even when the API still answers.");
    }
    if (lastGoodAt) {
      var stale = lastGood ? "" : " (could not reach the bot)";
      text(els.stUpdated, "Last successful check " + ago(lastGoodAt) + " \u00b7 " + samples.length + (samples.length === 1 ? " check" : " checks") + " this visit" + stale);
    }
  }

  /* ---- copying --------------------------------------------------------- */
  function copy(value, note) {
    var done = function (ok) {
      text(els.stCopyNote, ok ? "Copied" : "Select the text and copy it by hand");
      window.setTimeout(function () { text(els.stCopyNote, ""); }, 2600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { done(true); }, function () { legacy(value, done); });
    } else {
      legacy(value, done);
    }
  }
  function legacy(value, done) {
    try {
      var box = document.createElement("textarea");
      box.value = value;
      box.setAttribute("readonly", "readonly");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(box);
      done(ok);
    } catch (error) { done(false); }
  }
  function summary() {
    if (!lastGood) return "RustyWorks RCE status: the bot could not be reached at " + clock(Date.now()) + ".";
    var stats = lastGood.stats || {};
    return [
      "RustyWorks RCE status \u2014 " + (lastGood.online === false ? "bot offline" : "bot online") + (lastGood.version ? " (" + lastGood.version + ")" : ""),
      "Checked at " + clock(lastGoodAt) + ", " + ago(lastGoodAt) + ".",
      "Linked players: " + count(stats.users) + " \u00b7 Servers connected: " + count(stats.servers) + " \u00b7 Guilds: " + count(stats.guilds),
      "Bot uptime 30d: " + pct(lastGood.uptime30d) + " \u00b7 API uptime 30d: " + pct(lastGood.apiUptime30d),
      typeof lastGood.lastHeartbeat === "number" ? "Last heartbeat: " + clock(lastGood.lastHeartbeat) + " (" + ago(lastGood.lastHeartbeat) + ")" : "",
      "Source: https://rustyworks-rce-j7ao5f.camelai.app/status.html"
    ].filter(Boolean).join("\n");
  }

  /* ---- wiring ---------------------------------------------------------- */
  function schedule() {
    if (els.stTimer) window.clearInterval(els.stTimer);
    els.stTimer = window.setInterval(function () {
      if (!document.hidden && !paused) refresh("timer");
    }, REFRESH_MS);
  }
  function setPaused(next) {
    paused = next;
    if (els.stPause) {
      els.stPause.setAttribute("aria-pressed", paused ? "true" : "false");
      text(els.stPause, paused ? "Resume auto-refresh" : "Pause auto-refresh");
    }
    if (paused) nextAt = 0;
    else nextAt = Date.now() + REFRESH_MS;
    try { window.localStorage.setItem(PAUSE_KEY, paused ? "1" : "0"); } catch (error) {}
    tick();
  }
  function init() {
    ["statusDot", "statusHeadline", "stBanner", "stBannerTitle", "stBannerText", "stRefresh", "stPause",
      "stNext", "stCopy", "stRawJump", "stStrip", "stSessionStats", "stSessionNote", "stChart", "stUpdated",
      "statUsers", "statServers", "statGuilds", "statUptime", "statApiUptime", "subUsers", "subServers",
      "subGuilds", "subUptime", "subApiUptime", "stBotUptimeText", "stBotFill", "stBotFoot", "stApiUptimeText",
      "stApiFill", "stApiFoot", "svcApiPill", "svcApiDetail", "svcSitePill", "svcBeatPill", "svcBeatDetail",
      "svcAuthPill", "svcAuthDetail", "stCopyJson", "stCopyNote", "stRaw", "stRawPanel"
    ].forEach(function (id) { els[id] = byId(id); });
    els.kpis = Array.prototype.slice.call(document.querySelectorAll(".st-kpi"));

    var year = byId("year");
    if (year) year.textContent = String(new Date().getFullYear());

    try { paused = window.localStorage.getItem(PAUSE_KEY) === "1"; } catch (error) { paused = false; }
    setPaused(paused);

    if (els.stRefresh) els.stRefresh.addEventListener("click", function () { refresh("button"); checkDashboard(); });
    if (els.stPause) els.stPause.addEventListener("click", function () { setPaused(!paused); });
    if (els.stCopy) els.stCopy.addEventListener("click", function () { copy(summary(), "summary"); });
    if (els.stCopyJson) els.stCopyJson.addEventListener("click", function () { copy(lastRaw || "No answer yet.", "json"); });
    if (els.stRawJump) els.stRawJump.addEventListener("click", function () {
      if (els.stRawPanel) els.stRawPanel.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      text(els.stRaw, lastRaw || "No answer yet.");
    });

    /* Coming back to the tab must not show numbers from ten minutes ago. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { refresh("visible"); checkDashboard(); nextAt = Date.now() + REFRESH_MS; }
    });

    window.setInterval(tick, 1000);
    refresh("first");
    checkDashboard();
    schedule();
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
