/* ==========================================================================
   Status page
   --------------------------------------------------------------------------
   Two independent measurements, kept apart on purpose:

   - what the bot says about itself (/api/status, proxied by this site);
   - what this site and this browser actually observed, which is what the monitor
     panel and the visit strip are built from.

   Nothing here is estimated or back-filled. If a check failed the page says which
   and when; if a panel has no data it says that, rather than drawing an empty
   chart as though the system were flat and healthy.
   ========================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "/api/status";
  var HISTORY = "/api/history";
  var TIMEOUT_MS = 6000;
  var STRIP_MAX = 40;
  var EVENT_MAX = 40;
  var BRAND = (window.SPINBACK_BRAND && window.SPINBACK_BRAND.name) || "Spinback RCE";
  var SITE = (window.SPINBACK_BRAND && window.SPINBACK_BRAND.site) || "https://spinback-j7ao5f.camelai.app";
  var PAUSE_KEY = "rw-status-paused";
  var NOTIFY_KEY = "rw-status-notify";
  /* How often to check, depending on what the last answer said: a quiet system
     does not need poking every few seconds, a broken one does. */
  var INTERVALS = { ok: 45000, warn: 20000, down: 15000, unknown: 15000 };

  var state = {
    samples: [],
    events: [],
    first: null,
    lastGood: null,
    lastGoodAt: 0,
    lastRaw: "",
    lastReason: "",
    beatSeen: null,
    monitor: null,
    monitorRange: 24,
    monitorAt: 0,
    verdict: "unknown",
    title: "Status",
    paused: false,
    notify: false,
    notifiedPause: false,
    inflight: false,
    nextAt: 0
  };
  var els = {};
  var intervalTimer = null;
  var currentInterval = 30000;

  /* ---- small helpers --------------------------------------------------- */
  function byId(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value; }
  function show(el, visible) { if (el) el.hidden = !visible; }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function clock(at) {
    var d = new Date(at);
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function clockShort(at) {
    var d = new Date(at);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function ago(at) {
    if (typeof at !== "number" || !at) return "";
    var seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 90) return seconds + (seconds === 1 ? " second" : " seconds") + " ago";
    var minutes = Math.round(seconds / 60);
    if (minutes < 90) return minutes + (minutes === 1 ? " minute" : " minutes") + " ago";
    var hours = Math.round(minutes / 60);
    if (hours < 36) return hours + (hours === 1 ? " hour" : " hours") + " ago";
    return Math.round(hours / 24) + " days ago";
  }
  function count(value) {
    return typeof value === "number" && isFinite(value) ? value.toLocaleString("en-GB") : "\u2014";
  }
  function pct(value, digits) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(digits === undefined ? 2 : digits) + "%" : "\u2014";
  }
  function downtime(percent) {
    if (typeof percent !== "number" || !isFinite(percent)) return "";
    var minutes = Math.round((100 - percent) / 100 * 30 * 24 * 60);
    if (minutes < 1) return "under a minute of downtime in the last 30 days";
    if (minutes < 90) return "about " + minutes + " minute" + (minutes === 1 ? "" : "s") + " of downtime in the last 30 days";
    var hours = minutes / 60;
    if (hours < 36) return "about " + (Math.round(hours * 10) / 10) + " hours of downtime in the last 30 days";
    return "about " + (Math.round(hours / 24 * 10) / 10) + " days of downtime in the last 30 days";
  }
  function classify(ms) {
    if (ms === null || ms === undefined) return "fail";
    if (ms < 400) return "ok";
    if (ms < 900) return "mid";
    return "slow";
  }
  function setPill(el, level, label) {
    if (!el) return;
    el.className = level === "ok" ? "pill-in" : level === "warn" ? "pill-warn" : "pill-out";
    el.textContent = label;
  }
  function setDot(el, level) {
    if (!el) return;
    el.className = "dot " + (level === "ok" ? "on" : level === "down" ? "off" : "unknown");
  }
  function rangeLabel() {
    return state.monitor && state.monitor.hours === 168 ? "7 days" : "24 hours";
  }
  function formatCount(n) {
    return typeof n === "number" ? n.toLocaleString("en-GB") : String(n);
  }

  /* ---- counting up, for the numbers that change ------------------------ */
  function animateTo(el, target, suffix, decimals) {
    if (!el) return;
    var previous = el.dataset.value;
    el.dataset.value = String(target);
    var format = function (value) {
      return value.toLocaleString("en-GB", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 }) + (suffix || "");
    };
    /* Nothing reported: show the dash the page starts with, never a blank card. */
    if (typeof target !== "number" || !isFinite(target)) { text(el, "\u2014"); return; }
    var from = parseFloat(String(previous || "").replace(/[^0-9.]/g, ""));
    if (reduceMotion() || !isFinite(from) || from === target) { text(el, format(target)); return; }
    var steps = 16, step = 0;
    if (el.__rwTimer) window.clearInterval(el.__rwTimer);
    el.__rwTimer = window.setInterval(function () {
      step += 1;
      var eased = 1 - Math.pow(1 - step / steps, 3);
      text(el, format(from + (target - from) * eased));
      if (step >= steps) { window.clearInterval(el.__rwTimer); el.__rwTimer = null; }
    }, 34);
  }

  /* ---- the event log: only changes, with the time they were seen ------- */
  function addEvent(kind, what) {
    var at = Date.now();
    var newest = state.events[0];
    if (newest && newest.what === what && at - newest.at < 2000) return;
    state.events.unshift({ at: at, what: what, kind: kind });
    if (state.events.length > EVENT_MAX) state.events.length = EVENT_MAX;
    renderEvents();
  }
  function renderEvents() {
    if (!els.stEvents) return;
    els.stEvents.innerHTML = state.events.map(function (event) {
      return '<li class="is-' + event.kind + '"><time datetime="' + new Date(event.at).toISOString() + '">' + clock(event.at) + '</time>' +
        '<span class="what">' + esc(event.what) + '</span></li>';
    }).join("");
    show(els.stEventsEmpty, state.events.length === 0);
  }

  /* ---- the verdict: one honest sentence about the whole picture -------- */
  function computeVerdict() {
    var reasons = [];
    var level = "ok";
    var failedHere = state.samples.filter(function (sample) { return !sample.ok; }).length;
    var monitor = state.monitor;
    var monitorFailures = monitor && monitor.available && monitor.totals ? Number(monitor.totals.failures || 0) : 0;
    var monitorChecks = monitor && monitor.available && monitor.totals ? Number(monitor.totals.checks || 0) : 0;

    if (!state.lastGood) {
      level = "down";
      reasons.push(state.lastReason ? "This page could not reach the bot (" + state.lastReason + ")." : "The first check has not come back yet.");
    } else {
      var beat = typeof state.lastGood.lastHeartbeat === "number" ? state.lastGood.lastHeartbeat : null;
      if (state.lastGood.online === false) {
        level = "down";
        reasons.push("The bot reported itself offline.");
      }
      if (beat) {
        var beatAge = Date.now() - beat;
        if (beatAge > 60 * 60 * 1000) {
          level = "down";
          reasons.push("Its heartbeat has been silent for " + Math.round(beatAge / 60000) + " minutes.");
        } else if (beatAge > 5 * 60 * 1000) {
          if (level !== "down") level = "warn";
          reasons.push("Its heartbeat is lagging - last seen " + ago(beat) + ".");
        }
      } else {
        if (level !== "down") level = "warn";
        reasons.push("No heartbeat timestamp came back, so freshness cannot be judged.");
      }
      if (failedHere) {
        if (level !== "down") level = "warn";
        reasons.push(failedHere + " of " + state.samples.length + " checks failed while you watched.");
      }
      if (monitorFailures) {
        if (level !== "down") level = "warn";
        reasons.push("The site recorded " + formatCount(monitorFailures) + " failed check" + (monitorFailures === 1 ? "" : "s") + " in the last " + rangeLabel() + ".");
      }
      var good = state.samples.filter(function (sample) { return typeof sample.ms === "number"; }).map(function (sample) { return sample.ms; });
      if (good.length >= 3) {
        var sorted = good.slice().sort(function (a, b) { return a - b; });
        var median = sorted[Math.floor(sorted.length / 2)];
        if (median > 1200) {
          if (level !== "down") level = "warn";
          reasons.push("Answers are slow right now - median " + median + " ms from your browser.");
        }
      }
      if (level === "ok") {
        reasons.push("Every check this visit came back (" + state.samples.length + (state.samples.length === 1 ? " check" : " checks") + ").");
        if (typeof state.lastGood.uptime30d === "number") reasons.push("The bot reports " + pct(state.lastGood.uptime30d) + " uptime across the last 30 days.");
        if (monitorChecks && !monitorFailures) reasons.push("This site's own recorder has seen no failed checks in the last " + rangeLabel() + ".");
      }
    }
    var titles = { ok: "All systems operational", warn: "Working, with something to note", down: "Service problem", unknown: "Status unknown" };
    return { level: level, title: titles[level] || titles.unknown, reasons: reasons };
  }
  function renderVerdict() {
    var verdict = computeVerdict();
    state.verdict = verdict.level;
    state.title = verdict.title;
    if (els.stVerdict) els.stVerdict.className = "st-verdict is-" + (verdict.level === "ok" ? "ok" : verdict.level);
    text(els.stVerdictTitle, verdict.title);
    if (els.stVerdictReasons) {
      els.stVerdictReasons.innerHTML = verdict.reasons.length
        ? "<ul>" + verdict.reasons.map(function (reason) { return "<li>" + esc(reason) + "</li>"; }).join("") + "</ul>"
        : "No checks have run yet.";
    }
    text(els.stVerdictWhen, state.lastGoodAt ? "checked " + clock(state.lastGoodAt) : "not checked yet");
    setDot(els.statusDot, verdict.level);
    setDot(els.stMiniDot, verdict.level);
    text(els.stMiniText, verdict.title);
    if (document.visibilityState === "visible") {
      document.title = (verdict.level === "ok" ? "" : verdict.level === "warn" ? "! " : "x ") + "Status - " + BRAND;
    }
  }

  /* ---- the numbers the bot reports ------------------------------------- */
  function deltaLine(key, current) {
    if (!state.first || !state.first.stats || typeof current !== "number") return "";
    var was = state.first.stats[key];
    if (typeof was !== "number") return "";
    var diff = current - was;
    if (diff === 0) return "no change this visit";
    return (diff > 0 ? "+" : "") + formatCount(diff) + " since you opened this page";
  }
  function deltaClass(el, key, current) {
    if (!el) return;
    el.className = "s";
    if (!state.first || !state.first.stats || typeof current !== "number" || typeof state.first.stats[key] !== "number") return;
    var diff = current - state.first.stats[key];
    if (diff > 0) el.className = "s up";
    else if (diff < 0) el.className = "s down";
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
    var checks = typeof data.samples === "number" ? data.samples : null;
    text(els.stBotFoot, downtime(bot) + (checks ? " - based on " + formatCount(checks) + " checks the bot counted" : ""));
    text(els.stApiFoot, downtime(api));
  }

  /* ---- the visit strip, tallies and chart ------------------------------ */
  function drawStrip() {
    if (!els.stStrip) return;
    els.stStrip.innerHTML = state.samples.slice(-STRIP_MAX).map(function (sample) {
      var ratio = sample.ms === null || sample.ms === undefined ? 1 : Math.min(1, Math.max(0.18, sample.ms / 1400));
      var label = (sample.ms === null ? "no answer" : sample.ms + " ms") + " at " + clock(sample.at);
      return '<span class="st-tick ' + classify(sample.ms) + '" style="height:' + Math.round(ratio * 100) + '%" title="' + esc(label) + '"></span>';
    }).join("");
  }
  function drawTallies() {
    if (!els.stTallies) return;
    if (!state.samples.length) { els.stTallies.innerHTML = ""; return; }
    var tally = { ok: 0, mid: 0, slow: 0, fail: 0 };
    state.samples.forEach(function (sample) { tally[classify(sample.ms)] += 1; });
    var labels = { ok: "fast, under 400 ms", mid: "normal", slow: "slow, over 900 ms", fail: "no answer" };
    els.stTallies.innerHTML = ["ok", "mid", "slow", "fail"].map(function (key) {
      return '<span class="k-' + key + '"><i></i>' + tally[key] + " " + labels[key] + "</span>";
    }).join("");
  }
  function drawStats() {
    if (!els.stSessionStats) return;
    var good = state.samples.filter(function (sample) { return typeof sample.ms === "number"; }).map(function (sample) { return sample.ms; });
    if (!good.length) { els.stSessionStats.innerHTML = ""; return; }
    var sorted = good.slice().sort(function (a, b) { return a - b; });
    var parts = [
      ["checks this visit", String(state.samples.length)],
      ["fastest", sorted[0] + " ms"],
      ["median", sorted[Math.floor(sorted.length / 2)] + " ms"],
      ["p95", sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] + " ms"],
      ["slowest", sorted[sorted.length - 1] + " ms"]
    ];
    var failed = state.samples.length - good.length;
    if (failed) parts.push(["no answer", String(failed)]);
    els.stSessionStats.innerHTML = parts.map(function (pair) {
      return "<span>" + esc(pair[0]) + " <b>" + esc(pair[1]) + "</b></span>";
    }).join("");
  }
  function drawLine(container, points, label) {
    if (!container) return;
    if (!points.length) { container.innerHTML = ""; return; }
    if (points.length === 1) {
      /* One reading is a reading, not a trend. Show the point and say so, rather
         than leaving an empty box that could read as "nothing happened". */
      var single = points[0];
      container.innerHTML =
        '<svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' +
        '<line class="grid" x1="34" y1="16" x2="588" y2="16"></line>' +
        '<line class="grid" x1="34" y1="134" x2="588" y2="134"></line>' +
        '<circle class="pt" cx="300" cy="75" r="5"><title>' + esc(single.title || single.value + " ms") + "</title></circle>" +
        '<text x="34" y="19">' + Math.max(200, Math.ceil(single.value * 1.15 / 100) * 100) + "</text>" +
        '<text x="34" y="137">0 ms</text>' +
        '<text x="588" y="146" text-anchor="end">one reading so far - ' + esc(single.value + " ms") + "</text>" +
        "</svg>";
      return;
    }
    var w = 600, h = 150, padX = 34, padY = 16;
    var values = points.map(function (point) { return point.value; });
    var top = Math.max(200, Math.ceil((Math.max.apply(null, values) * 1.15) / 100) * 100);
    var step = (w - padX - 12) / (points.length - 1);
    var xFor = function (i) { return padX + i * step; };
    var yFor = function (value) { return padY + (1 - value / top) * (h - padY * 2); };
    var coords = points.map(function (point, i) { return xFor(i).toFixed(1) + "," + yFor(point.value).toFixed(1); });
    var area = coords.join(" ") + " " + xFor(points.length - 1).toFixed(1) + "," + (h - padY) + " " + xFor(0).toFixed(1) + "," + (h - padY);
    var dots = points.map(function (point, i) {
      var kind = point.value >= 900 ? "pt-slow" : "pt";
      return '<circle class="' + kind + '" cx="' + xFor(i).toFixed(1) + '" cy="' + yFor(point.value).toFixed(1) + '" r="2.6"><title>' +
        esc(point.title || point.value + " ms") + "</title></circle>";
    }).join("");
    container.innerHTML =
      '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' +
      '<line class="grid" x1="' + padX + '" y1="' + yFor(top) + '" x2="' + (w - 12) + '" y2="' + yFor(top) + '"></line>' +
      '<line class="grid" x1="' + padX + '" y1="' + (h - padY) + '" x2="' + (w - 12) + '" y2="' + (h - padY) + '"></line>' +
      '<polygon class="area" points="' + area + '"></polygon>' +
      '<polyline class="line" points="' + coords.join(" ") + '"></polyline>' + dots +
      '<text x="4" y="' + (yFor(top) + 3) + '">' + top + "</text>" +
      '<text x="4" y="' + (h - padY + 3) + '">0 ms</text>' +
      '<text x="' + (w - 12) + '" y="' + (h - padY + 12) + '" text-anchor="end">newest</text>' +
      "</svg>";
  }
  function drawChart() {
    drawLine(els.stChart, state.samples.filter(function (sample) { return typeof sample.ms === "number"; }).map(function (sample) {
      return { value: sample.ms, title: sample.ms + " ms at " + clock(sample.at) };
    }), "Response time for each check made during this visit");
  }

  /* ---- the monitor: what this site saw while people were looking ------- */
  function loadMonitor(hours) {
    var range = hours || state.monitorRange;
    return fetch(HISTORY + "?hours=" + range, { headers: { accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        state.monitor = data;
        state.monitorRange = range;
        state.monitorAt = Date.now();
        if (els.stRange24) els.stRange24.setAttribute("aria-pressed", range === 24 ? "true" : "false");
        if (els.stRange168) els.stRange168.setAttribute("aria-pressed", range === 168 ? "true" : "false");
        paintMonitor();
        var totals = data.totals || {};
        setPill(els.svcMonPill, data.available ? "ok" : "warn", data.available ? "Recording" : "No storage");
        text(els.svcMonDetail, data.available
          ? "One sample per proxied check, kept for a week - " + formatCount(totals.checks || 0) + " recorded in the last " + rangeLabel() + "."
          : "The recorder has nowhere to write (reason: " + (data.reason || "unknown") + "), so only this visit's measurements exist.");
        if (data.available && !state.monitored) {
          state.monitored = true;
          addEvent("good", "site recorder has " + formatCount(totals.checks || 0) + " checks on file");
        }
      })
      .catch(function (error) {
        setPill(els.svcMonPill, "warn", "Unavailable");
        text(els.svcMonDetail, "The history endpoint did not answer (" + String((error && error.message) || error) + ").");
      });
  }
  function paintMonitor() {
    var data = state.monitor;
    if (!data) return;
    if (!data.available) {
      if (els.stMonStats) els.stMonStats.innerHTML = "";
      if (els.stMonBars) els.stMonBars.innerHTML = "";
      if (els.stMonChart) els.stMonChart.innerHTML = "";
      if (els.stMonIncidents) els.stMonIncidents.innerHTML = "";
      if (els.stMonAxis) els.stMonAxis.innerHTML = "";
      text(els.stMonEmpty, "The recorder is not storing samples, so there is nothing to show here yet.");
      text(els.stMonFoot, "");
      return;
    }
    var totals = data.totals || {};
    var failures = Number(totals.failures || 0);
    if (els.stMonStats) {
      var cards = [
        ["Uptime measured here", totals.uptimePct === null || totals.uptimePct === undefined ? "\u2014" : pct(totals.uptimePct, 2)],
        ["Checks recorded", formatCount(totals.checks || 0)],
        ["Failed checks", failures ? formatCount(failures) : "none"],
        ["Average response", totals.avgMs === null || totals.avgMs === undefined ? "\u2014" : totals.avgMs + " ms"],
        ["95th percentile", totals.p95Ms === null || totals.p95Ms === undefined ? "\u2014" : totals.p95Ms + " ms"],
        ["Slowest seen", totals.maxMs === null || totals.maxMs === undefined ? "\u2014" : totals.maxMs + " ms"]
      ];
      els.stMonStats.innerHTML = cards.map(function (pair) {
        return '<div class="st-hstat"><b>' + esc(pair[1]) + "</b><span>" + esc(pair[0]) + "</span></div>";
      }).join("");
    }
    /* One bar per hour for a day; one per day for a week. */
    var buckets = Array.isArray(data.buckets) ? data.buckets : [];
    var groups = [];
    if (data.hours > 24) {
      for (var i = 0; i < buckets.length; i += 24) {
        groups.push(summarise(buckets.slice(i, i + 24), true));
      }
    } else {
      groups = buckets.map(function (bucket) { return summarise([bucket], false); });
    }
    var peak = Math.max.apply(null, groups.map(function (group) { return group.checks; }).concat([1]));
    if (els.stMonBars) {
      els.stMonBars.innerHTML = groups.map(function (group) {
        var level = group.checks === 0 ? "none" : group.failures === 0 ? "ok" : group.failures < group.checks ? "warn" : "bad";
        var height = group.checks === 0 ? 8 : Math.max(12, Math.round(group.checks / peak * 100));
        var when = new Date(group.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        var label = group.checks === 0
          ? when + ": nobody looked during this " + (data.hours > 24 ? "day" : "hour")
          : when + ": " + group.checks + " check" + (group.checks === 1 ? "" : "s") + ", " + group.failures + " failed" + (group.avgMs === null ? "" : ", " + group.avgMs + " ms average");
        return '<span class="st-hour ' + level + '" style="height:' + height + '%" title="' + esc(label) + '"></span>';
      }).join("");
    }
    if (els.stMonAxis && groups.length) {
      els.stMonAxis.innerHTML = "<span>" + esc(groups[0].label) + "</span><span>now</span>";
    }
    drawLine(els.stMonChart, groups.filter(function (group) { return typeof group.avgMs === "number"; }).map(function (group) {
      return { value: group.avgMs, title: group.label + ": " + group.avgMs + " ms average over " + group.checks + " checks" };
    }), "Average response time per " + (data.hours > 24 ? "day" : "hour") + ", measured by this site");
    if (els.stMonIncidents) {
      var incidents = Array.isArray(data.incidents) ? data.incidents : [];
      els.stMonIncidents.innerHTML = incidents.map(function (incident) {
        var span = incident.to - incident.from >= 60000 ? Math.round((incident.to - incident.from) / 60000) + " min" : "under a minute";
        return '<li><span class="it">' + esc(new Date(incident.from).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) +
          '</span><span class="id">failed checks, ' + esc(clockShort(incident.from)) + " to " + esc(clockShort(incident.to)) + " (" + esc(span) + ")" +
          '</span><span class="ic">' + formatCount(incident.checks) + "</span></li>";
      }).join("");
      text(els.stMonEmpty, incidents.length ? "" : "No failed checks were recorded in this window.");
    }
    text(els.stMonFoot, "Oldest check on file: " + (data.monitoringSince ? clockShort(data.monitoringSince) + " on " + new Date(data.monitoringSince).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "none yet") +
      " - " + formatCount(totals.checks || 0) + " checks in the last " + rangeLabel() + " - refreshed " + ago(state.monitorAt) + ".");
  }
  function summarise(slice, byDay) {
    var checks = slice.reduce(function (total, bucket) { return total + bucket.checks; }, 0);
    var failures = slice.reduce(function (total, bucket) { return total + bucket.failures; }, 0);
    var withData = slice.filter(function (bucket) { return typeof bucket.avgMs === "number"; });
    var avgMs = withData.length ? Math.round(withData.reduce(function (total, bucket) { return total + bucket.avgMs; }, 0) / withData.length) : null;
    var at = slice[0].at;
    return {
      at: at, checks: checks, failures: failures, avgMs: avgMs,
      label: byDay ? new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }) : clockShort(at)
    };
  }

  /* ---- services -------------------------------------------------------- */
  function paintServices(data, ms) {
    setPill(els.svcApiPill, data.online === false ? "down" : "ok", data.online === false ? "Offline" : "Online");
    text(els.svcApiDetail, "Answered in " + ms + " ms - " + (data.version || "version not given") + " - called through this site so your browser is never blocked by cross-origin rules.");
    var beat = typeof data.lastHeartbeat === "number" ? data.lastHeartbeat : null;
    if (beat) {
      var beatAge = Date.now() - beat;
      var level = beatAge < 5 * 60 * 1000 ? "ok" : beatAge < 60 * 60 * 1000 ? "warn" : "down";
      setPill(els.svcBeatPill, level, level === "ok" ? "Fresh" : level === "warn" ? "Lagging" : "Silent");
      text(els.svcBeatDetail, "Last heartbeat " + ago(beat) + " (" + clock(beat) + "). If it stops moving, the bot is in trouble even when the API still answers.");
    } else {
      setPill(els.svcBeatPill, "warn", "Not reported");
      text(els.svcBeatDetail, "The API did not include a heartbeat timestamp in this answer.");
    }
  }
  function checkDashboard() {
    /* The sign-in row was removed from the page; without it there is nothing to fill. */
    if (!els.svcAuthPill && !els.svcAuthDetail) return Promise.resolve();
    return fetch("/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (response) {
        /* Sign-in was retired with the dashboard, so /auth/me no longer exists. */
        if (response.status === 404) return { retired: true };
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data) { setPill(els.svcAuthPill, "warn", "Unknown"); return; }
        if (data.retired) {
          setPill(els.svcAuthPill, "ok", "Not needed");
          text(els.svcAuthDetail, "The site has no sign-in any more: Kit Studio and Colour Studio are open to everyone, and /dashboard opens Kit Studio.");
          return;
        }
        if (data.authenticated) {
          setPill(els.svcAuthPill, "ok", "You are signed in");
          text(els.svcAuthDetail, "Your owner session is active - open /dashboard to use it.");
        } else if (data.configured) {
          setPill(els.svcAuthPill, "ok", "Ready");
          text(els.svcAuthDetail, "Discord sign-in is set up; only the owner of the server the bot runs in is let through.");
        } else {
          setPill(els.svcAuthPill, "warn", "Not switched on");
          text(els.svcAuthDetail, "The owner-only dashboard at /dashboard is waiting on its Worker secrets, so sign-in stays closed for now.");
        }
      })
      .catch(function () { setPill(els.svcAuthPill, "warn", "Unknown"); });
  }

  /* ---- one check ------------------------------------------------------- */
  function paintGood(data, ms, at) {
    var stats = data.stats || {};
    var previous = state.lastGood;
    if (!state.first) state.first = data;
    state.lastGood = data;
    state.lastGoodAt = at;
    state.lastReason = "";
    state.lastRaw = JSON.stringify(data, null, 2);
    text(els.stRaw, state.lastRaw);

    text(els.statusHeadline, data.online === false ? "The bot reports itself offline" : "Answered just now - " + (data.version || "bot online"));
    animateTo(els.statUsers, typeof stats.users === "number" ? stats.users : null);
    animateTo(els.statServers, typeof stats.servers === "number" ? stats.servers : null);
    animateTo(els.statGuilds, typeof stats.guilds === "number" ? stats.guilds : null);
    animateTo(els.statUptime, typeof data.uptime30d === "number" ? data.uptime30d : null, "%", 2);
    animateTo(els.statApiUptime, typeof data.apiUptime30d === "number" ? data.apiUptime30d : null, "%", 2);
    /* Say "live" only for a number the bot really sent. */
    var NOT_SENT = "the bot does not report this yet";
    text(els.subUsers, deltaLine("users", stats.users) || (typeof stats.users === "number" ? "live, from the bot" : NOT_SENT));
    text(els.subServers, deltaLine("servers", stats.servers) || (typeof stats.servers === "number" ? "live, from the bot" : NOT_SENT));
    text(els.subGuilds, deltaLine("guilds", stats.guilds) || (typeof stats.guilds === "number" ? "live, from the bot" : NOT_SENT));
    deltaClass(els.subUsers, "users", stats.users);
    deltaClass(els.subServers, "servers", stats.servers);
    deltaClass(els.subGuilds, "guilds", stats.guilds);
    text(els.subUptime, typeof data.uptime30d === "number" ? "as reported by the bot" : NOT_SENT);
    text(els.subApiUptime, typeof data.apiUptime30d === "number" ? "as reported by the bot" : NOT_SENT);

    if (previous && previous.stats) {
      ["users", "servers", "guilds"].forEach(function (key) {
        var was = previous.stats[key], now = stats[key];
        if (typeof was === "number" && typeof now === "number" && was !== now) {
          addEvent("good", key + " " + formatCount(was) + " to " + formatCount(now) + " (" + (now > was ? "+" : "") + formatCount(now - was) + ")");
        }
      });
      if (previous.online !== data.online) {
        addEvent(data.online === false ? "bad" : "good", data.online === false ? "the bot reported itself offline" : "the bot is reporting itself online again");
      }
      if (previous.version !== data.version) {
        addEvent("good", "version " + (previous.version || "unknown") + " to " + (data.version || "unknown"));
      }
    }
    if (typeof data.lastHeartbeat === "number" && state.beatSeen !== null && state.beatSeen !== data.lastHeartbeat) {
      addEvent("good", "a fresh heartbeat arrived");
    }
    if (typeof data.lastHeartbeat === "number") state.beatSeen = data.lastHeartbeat;

    paintServices(data, ms);
    drawBars(data);
    show(els.stBanner, false);
    els.kpis.forEach(function (card) { card.classList.remove("is-stale"); });
  }
  function paintBad(reason) {
    state.lastReason = reason;
    text(els.statusHeadline, "Cannot reach the bot right now");
    setPill(els.svcApiPill, "down", "Unreachable");
    text(els.svcApiDetail, "The bot did not answer just now - " + reason + ".");
    show(els.stBanner, true);
    els.kpis.forEach(function (card) { card.classList.add("is-stale"); });
    if (state.lastGood) {
      text(els.stBannerTitle, "Showing the last reading, not a live one");
      text(els.stBannerText, "This page could not reach the bot just now (" + reason + "). The figures still on screen are the reading taken at " +
        clock(state.lastGoodAt) + ", " + ago(state.lastGoodAt) + " - nothing has been updated since. Checks carry on automatically.");
    } else {
      text(els.stBannerTitle, "Cannot reach the bot");
      text(els.stBannerText, "The first attempt failed (" + reason + "). Nothing is shown rather than something stale - another check runs in a moment.");
    }
    addEvent("bad", "a check failed (" + reason + ")");
  }
  function refresh(reason) {
    if (state.inflight) return Promise.resolve();
    state.inflight = true;
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
        state.samples.push({ at: Date.now(), ms: Date.now() - started, ok: true });
        paintGood(data, Date.now() - started, Date.now());
      })
      .catch(function (error) {
        state.samples.push({ at: Date.now(), ms: null, ok: false });
        paintBad(String((error && error.message) || error));
      })
      .then(function () {
        if (timer) window.clearTimeout(timer);
        state.inflight = false;
        if (els.stRefresh) els.stRefresh.disabled = false;
        if (state.samples.length > STRIP_MAX * 3) state.samples = state.samples.slice(-STRIP_MAX * 3);
        if (!state.monitor || Date.now() - state.monitorAt > 60000) loadMonitor();
        drawStrip();
        drawStats();
        drawChart();
        drawTallies();
        /* Pick the interval first, then set the countdown from it, so the label
           and the schedule never disagree. */
        scheduleInterval();
        state.nextAt = Date.now() + currentInterval;
        renderVerdict();
        notifyIfNeeded();
      });
  }

  /* ---- auto-refresh that matches the situation ------------------------- */
  function scheduleInterval() {
    var wanted = INTERVALS[state.verdict] || 30000;
    currentInterval = wanted;
    if (intervalTimer) window.clearInterval(intervalTimer);
    intervalTimer = window.setInterval(function () {
      if (!document.hidden && !state.paused) refresh("timer");
    }, currentInterval);
  }
  function setPaused(next) {
    state.paused = next;
    if (els.stPause) {
      els.stPause.setAttribute("aria-pressed", state.paused ? "true" : "false");
      text(els.stPause, state.paused ? "Resume auto-refresh" : "Pause auto-refresh");
    }
    state.nextAt = state.paused ? 0 : Date.now() + currentInterval;
    try { window.localStorage.setItem(PAUSE_KEY, state.paused ? "1" : "0"); } catch (error) {}
    tick();
  }

  /* ---- notifications, only while this tab is open ---------------------- */
  function setNotify(next) {
    state.notify = next;
    if (els.stNotify) {
      els.stNotify.setAttribute("aria-pressed", next ? "true" : "false");
      text(els.stNotify, next ? "Alerts on while this tab is open" : "Notify me if it drops");
    }
    try { window.localStorage.setItem(NOTIFY_KEY, next ? "1" : "0"); } catch (error) {}
  }
  function toggleNotify() {
    if (state.notify) { setNotify(false); addEvent("warn", "alerts switched off"); return; }
    if (!("Notification" in window)) { addEvent("warn", "this browser has no notification support"); return; }
    if (Notification.permission === "granted") { setNotify(true); addEvent("good", "alerts on for this tab"); return; }
    if (Notification.permission === "denied") { addEvent("warn", "notifications are blocked for this site in your browser"); return; }
    Notification.requestPermission().then(function (permission) {
      if (permission === "granted") { setNotify(true); addEvent("good", "alerts on for this tab"); }
      else addEvent("warn", "notification permission was not given");
    });
  }
  function notifyIfNeeded() {
    if (!state.notify || document.visibilityState !== "visible") return;
    if (state.verdict === "ok" || state.verdict === "unknown") { state.notifiedPause = false; return; }
    if (state.notifiedPause) return;
    state.notifiedPause = true;
    try {
      new Notification(BRAND + ": " + (state.verdict === "down" ? "service problem" : "something to note"), {
        body: state.lastReason || (state.verdict === "down" ? "The bot could not be reached." : "A check needs attention on the status page."),
        tag: "rw-status"
      });
    } catch (error) {}
  }

  /* ---- copying and exporting ------------------------------------------- */
  function copy(value, note) {
    var done = function (ok) {
      text(note, ok ? "Copied" : "Select the text and copy it by hand");
      window.setTimeout(function () { text(note, ""); }, 2600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { done(true); }, function () { legacyCopy(value, done); });
    } else {
      legacyCopy(value, done);
    }
  }
  function legacyCopy(value, done) {
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
    if (!state.lastGood) return BRAND + " status: the bot could not be reached at " + clock(Date.now()) + ".";
    var stats = state.lastGood.stats || {};
    var monitor = state.monitor;
    return [
      BRAND + " status - " + (state.lastGood.online === false ? "bot offline" : "bot online") + (state.lastGood.version ? " (" + state.lastGood.version + ")" : ""),
      "Verdict: " + state.title,
      "Checked at " + clock(state.lastGoodAt) + ", " + ago(state.lastGoodAt) + ".",
      "Linked players: " + count(stats.users) + " - Servers connected: " + count(stats.servers) + " - Guilds: " + count(stats.guilds),
      "Bot uptime 30d: " + pct(state.lastGood.uptime30d) + " - API uptime 30d: " + pct(state.lastGood.apiUptime30d),
      typeof state.lastGood.lastHeartbeat === "number" ? "Last heartbeat: " + clock(state.lastGood.lastHeartbeat) + " (" + ago(state.lastGood.lastHeartbeat) + ")" : "",
      monitor && monitor.available ? "Measured by this site over the last " + rangeLabel() + ": " + pct(monitor.totals.uptimePct, 2) + " uptime across " + formatCount(monitor.totals.checks) + " checks." : "",
      "Source: " + SITE + "/status.html"
    ].filter(Boolean).join(String.fromCharCode(10));
  }
  function discordSummary() {
    var stats = state.lastGood ? state.lastGood.stats || {} : {};
    var monitor = state.monitor;
    return [
      "**" + BRAND + " status**",
      "Verdict: " + state.title,
      "Checked: " + (state.lastGoodAt ? clock(state.lastGoodAt) + " (" + ago(state.lastGoodAt) + ")" : "never"),
      "Players: " + count(stats.users) + " | Servers: " + count(stats.servers) + " | Guilds: " + count(stats.guilds),
      "Bot uptime 30d: " + pct(state.lastGood && state.lastGood.uptime30d) + " | API uptime 30d: " + pct(state.lastGood && state.lastGood.apiUptime30d),
      monitor && monitor.available ? "Site measured: " + pct(monitor.totals.uptimePct, 2) + " over " + formatCount(monitor.totals.checks) + " checks in the last " + rangeLabel() : "",
      monitor && monitor.available && monitor.totals.avgMs ? "Response: " + monitor.totals.avgMs + " ms average, " + monitor.totals.p95Ms + " ms p95 (site to API)" : "",
      "<" + SITE + "/status>"
    ].filter(Boolean).join(String.fromCharCode(10));
  }
  function download(name, content, type) {
    try {
      var blob = new Blob([content], { type: type });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      text(els.stExportNote, "Saved " + name);
    } catch (error) {
      text(els.stExportNote, "This browser blocked the download");
    }
    window.setTimeout(function () { text(els.stExportNote, ""); }, 3400);
  }
  function visitLog() {
    return state.samples.map(function (sample) {
      return { at: sample.at, iso: new Date(sample.at).toISOString(), ok: !!sample.ok, responseMs: sample.ms };
    });
  }
  function visitCsv() {
    var rows = ["at,iso,ok,response_ms"];
    visitLog().forEach(function (entry) {
      rows.push([entry.at, entry.iso, entry.ok ? "ok" : "failed", entry.responseMs === null ? "" : entry.responseMs].join(","));
    });
    return rows.join(String.fromCharCode(10)) + String.fromCharCode(10);
  }

  /* ---- the ticking clock ----------------------------------------------- */
  function tick() {
    if (document.hidden) return;
    var seconds = state.nextAt ? Math.max(0, Math.round((state.nextAt - Date.now()) / 1000)) : 0;
    if (els.stNext) {
      if (state.paused) text(els.stNext, "Auto-refresh paused - it runs every " + Math.round(currentInterval / 1000) + "s when active");
      else if (!state.samples.length) text(els.stNext, "Checking now" + String.fromCharCode(8230));
      else text(els.stNext, "Next check in " + seconds + (seconds === 1 ? " second" : " seconds") + " - every " + Math.round(currentInterval / 1000) + "s");
    }
    if (state.lastGood && typeof state.lastGood.lastHeartbeat === "number") {
      text(els.svcBeatDetail, "Last heartbeat " + ago(state.lastGood.lastHeartbeat) + " (" + clock(state.lastGood.lastHeartbeat) + "). If it stops moving, the bot is in trouble even when the API still answers.");
    }
    if (state.lastGoodAt || state.samples.length) {
      var lastAttempt = state.samples.length ? state.samples[state.samples.length - 1].at : 0;
      text(els.stUpdated, (state.lastGood ? "Last successful check " : "Last attempt ") + ago(state.lastGoodAt || lastAttempt) +
        " - " + state.samples.length + (state.samples.length === 1 ? " check" : " checks") + " this visit" +
        (state.monitor && state.monitor.available ? " - " + formatCount(state.monitor.totals.checks || 0) + " recorded by the site in the last " + rangeLabel() : ""));
    }
    if (els.stMiniWhen) {
      text(els.stMiniWhen, state.lastGoodAt ? clock(state.lastGoodAt) + " - " + (state.paused ? "paused" : "next " + seconds + "s") : "");
    }
    if (state.monitor && state.monitor.available && state.monitorAt && els.stMonFoot) {
      text(els.stMonFoot, els.stMonFoot.textContent.replace(/ - refreshed .*$/, " - refreshed " + ago(state.monitorAt) + "."));
    }
  }
  function onScroll() {
    if (els.stMini) els.stMini.hidden = window.scrollY <= 420;
  }

  /* ---- wiring ---------------------------------------------------------- */
  function init() {
    var ids = ["statusDot", "statusHeadline", "stBanner", "stBannerTitle", "stBannerText", "stRefresh", "stPause",
      "stNext", "stCopy", "stNotify", "stRawJump", "stStrip", "stSessionStats", "stSessionNote", "stChart", "stUpdated",
      "stTallies", "stCopyDiscord", "stExportJson", "stExportCsv", "stExportNote", "stEvents", "stEventsEmpty",
      "statUsers", "statServers", "statGuilds", "statUptime", "statApiUptime", "subUsers", "subServers", "subGuilds",
      "subUptime", "subApiUptime", "stBotUptimeText", "stBotFill", "stBotFoot", "stApiUptimeText", "stApiFill", "stApiFoot",
      "stVerdict", "stVerdictTitle", "stVerdictReasons", "stVerdictWhen", "stMonStats", "stMonBars", "stMonAxis",
      "stMonChart", "stMonLegend", "stMonIncidents", "stMonEmpty", "stMonFoot", "stRange24", "stRange168",
      "svcApiPill", "svcApiDetail", "svcMonPill", "svcMonDetail", "svcSitePill", "svcBeatPill", "svcBeatDetail",
      "svcAuthPill", "svcAuthDetail", "stCopyJson", "stCopyNote", "stRaw", "stRawPanel",
      "stMini", "stMiniDot", "stMiniText", "stMiniWhen", "stMiniRefresh"];
    ids.forEach(function (id) { els[id] = byId(id); });
    els.kpis = Array.prototype.slice.call(document.querySelectorAll(".st-kpi"));

    var year = byId("year");
    if (year) year.textContent = String(new Date().getFullYear());

    try { state.paused = window.localStorage.getItem(PAUSE_KEY) === "1"; } catch (error) { state.paused = false; }
    try {
      state.notify = window.localStorage.getItem(NOTIFY_KEY) === "1" && ("Notification" in window) && Notification.permission === "granted";
    } catch (error) { state.notify = false; }
    setPaused(state.paused);
    setNotify(state.notify);

    if (els.stRefresh) els.stRefresh.addEventListener("click", function () { refresh("button"); checkDashboard(); });
    if (els.stMiniRefresh) els.stMiniRefresh.addEventListener("click", function () { refresh("mini"); });
    if (els.stPause) els.stPause.addEventListener("click", function () { setPaused(!state.paused); });
    if (els.stCopy) els.stCopy.addEventListener("click", function () { copy(summary(), els.stCopyNote || els.stExportNote); });
    if (els.stCopyJson) els.stCopyJson.addEventListener("click", function () { copy(state.lastRaw || "No answer yet.", els.stCopyNote); });
    if (els.stCopyDiscord) els.stCopyDiscord.addEventListener("click", function () { copy(discordSummary(), els.stExportNote); });
    if (els.stNotify) els.stNotify.addEventListener("click", toggleNotify);
    if (els.stExportJson) els.stExportJson.addEventListener("click", function () {
      download("spinback-status-visit.json", JSON.stringify({
        page: "/status.html",
        capturedAt: new Date().toISOString(),
        verdict: state.title,
        latestReading: state.lastGood,
        siteMonitor: state.monitor,
        samples: visitLog()
      }, null, 2), "application/json");
    });
    if (els.stExportCsv) els.stExportCsv.addEventListener("click", function () {
      download("spinback-status-visit.csv", visitCsv(), "text/csv");
    });
    if (els.stRawJump) els.stRawJump.addEventListener("click", function () {
      if (els.stRawPanel) els.stRawPanel.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      text(els.stRaw, state.lastRaw || "No answer yet.");
    });
    if (els.stRange24) els.stRange24.addEventListener("click", function () { loadMonitor(24); });
    if (els.stRange168) els.stRange168.addEventListener("click", function () { loadMonitor(168); });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      refresh("visible");
      checkDashboard();
      if (!state.monitor || Date.now() - state.monitorAt > 60000) loadMonitor();
      state.nextAt = Date.now() + currentInterval;
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      var tag = (event.target && event.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      var key = String(event.key || "").toLowerCase();
      if (key === "r") { refresh("key"); checkDashboard(); }
      else if (key === "p") { setPaused(!state.paused); }
      else if (key === "c") { copy(summary(), els.stCopyNote || els.stExportNote); }
      else if (key === "n") { toggleNotify(); }
      else { return; }
      event.preventDefault();
    });

    window.setInterval(tick, 1000);
    refresh("first");
    checkDashboard();
    loadMonitor();
    renderEvents();
    renderVerdict();
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();


/* --------------------------------------------------------------------------
   The state the site is actually in: no API of its own is connected yet.

   The status page must not look broken, and it must not borrow another bot's
   numbers, so this one check turns the honest 503 into a plain sentence with
   the single thing that fixes it. It removes itself the moment an API answers.
   -------------------------------------------------------------------------- */
(function () {
  "use strict";
  fetch("/api/status", { headers: { accept: "application/json" } }).then(function (response) {
    if (response.status !== 503) return null;
    return response.json().catch(function () { return null; });
  }).then(function (data) {
    if (!data || data.reason !== "not_connected") return;
    if (document.getElementById("sb-api-notice")) return;
    var main = document.querySelector("main") || document.body;
    var box = document.createElement("div");
    box.id = "sb-api-notice";
    box.setAttribute("role", "status");
    box.style.cssText = "margin:18px 0;padding:16px 18px;border:1px solid rgba(127,209,247,.45);border-radius:14px;" +
      "background:rgba(127,209,247,.09);font-size:15px;line-height:1.55";
    box.innerHTML = "<strong>No bot API is connected yet.</strong> " +
      "Every measurement below belongs to this website and this browser, so the page still works. " +
      "The panels that describe the bot stay empty until you point the site at your own API - " +
      "set the address in <code>config.js</code> and the <code>BOT_API_ORIGIN</code> value on the app, " +
      "and everything here fills in by itself.";
    main.insertBefore(box, main.firstChild);
  }).catch(function () {});
})();
