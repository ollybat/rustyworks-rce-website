/* ==========================================================================
   Servers page - the list the bot looks after.
   --------------------------------------------------------------------------
   The website is a helper: this page reads, it never writes. It asks the
   site's own read-only proxy for /api/servers first; if the bot does not
   publish that yet it falls back to the public /api/status, which carries the
   bot's own state and its first Rust server. Anything a server did not report
   is printed as "not reported" rather than guessed, and when the bot cannot be
   reached the page says so instead of showing an empty table.
   ========================================================================== */
(function () {
  "use strict";

  var REFRESH_MS = 45000;
  var state = { filter: "all", term: "", servers: [], source: null, at: 0, error: null };

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function lower(value) { return String(value === undefined || value === null ? "" : value).toLowerCase(); }
  function firstOf() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  }
  function num(value) { return typeof value === "number" && isFinite(value) ? value : null; }

  function getJson(path) {
    return fetch(path, { headers: { accept: "application/json" }, cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      if (data && data.connected === false && data.reason === "not_connected") throw new Error("the bot API is not connected");
      return data;
    });
  }

  /* ------------------------------------------------------------- shaping */
  function stateOf(raw) {
    var flag = firstOf(raw.online, raw.connected, raw.up);
    if (typeof flag === "boolean") return flag ? "online" : "offline";
    var word = lower(firstOf(raw.state, raw.status, raw.health));
    if (!word) return "unknown";
    if (word.indexOf("online") > -1 || word.indexOf("ok") > -1 || word.indexOf("up") === 0) return "online";
    if (word.indexOf("offline") > -1 || word.indexOf("down") > -1 || word.indexOf("fail") > -1 || word.indexOf("error") > -1) return "offline";
    if (word.indexOf("unknown") > -1 || word.indexOf("not") > -1 || word.indexOf("pending") > -1 || word.indexOf("never") > -1) return "unknown";
    return "unknown";
  }

  function shape(raw, fallbackName) {
    if (!raw || typeof raw !== "object") return null;
    var host = firstOf(raw.host, raw.ip, raw.address, raw.hostname);
    var port = firstOf(raw.port, raw.rconPort, raw.queryPort);
    var players = num(firstOf(raw.players, raw.playersOnline, raw.onlinePlayers, raw.population));
    var max = num(firstOf(raw.maxPlayers, raw.max, raw.slots, raw.playerLimit));
    return {
      name: String(firstOf(raw.name, raw.label, raw.serverName, raw.title, fallbackName, "Server")),
      guild: firstOf(raw.guild, raw.guildName, raw.discordServer),
      host: host ? String(host) : null,
      port: port ? String(port) : null,
      state: stateOf(raw),
      players: players,
      max: max,
      map: firstOf(raw.map, raw.level, raw.world),
      ms: num(firstOf(raw.ms, raw.latencyMs, raw.ping, raw.roundTripMs)),
      checkedAt: firstOf(raw.checkedAt, raw.lastCheck, raw.lastCheckedAt, raw.at, raw.updatedAt, raw.timestamp),
      reason: firstOf(raw.reason, raw.reasonCode),
      detail: firstOf(raw.detail, raw.message, raw.note),
      raw: raw
    };
  }

  function fromServers(payload) {
    var list = null;
    if (Array.isArray(payload)) list = payload;
    else if (payload && Array.isArray(payload.servers)) list = payload.servers;
    else if (payload && Array.isArray(payload.data)) list = payload.data;
    else if (payload && Array.isArray(payload.list)) list = payload.list;
    if (!list) return [];
    return list.map(function (entry) { return shape(entry); }).filter(Boolean);
  }

  function fromStatus(status) {
    if (!status || typeof status !== "object") return [];
    var out = [];
    if (status.rcon && typeof status.rcon === "object") {
      out.push(shape({
        name: firstOf(status.rcon.serverName, "Rust server"),
        online: status.rcon.connected === true,
        checkedAt: status.rcon.checkedAt,
        reason: status.rcon.reason,
        detail: status.rcon.detail
      }, "Rust server"));
    }
    return out.filter(Boolean);
  }

  /* ------------------------------------------------------------- helpers */
  function ago(when) {
    if (!when) return null;
    var then;
    if (typeof when === "number") then = when < 1e12 ? when * 1000 : when;
    else then = Date.parse(when);
    if (isNaN(then)) return String(when);
    var secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return secs + "s ago";
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + "m ago";
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + "h ago";
    return Math.round(hours / 24) + "d ago";
  }

  function label(kind) {
    if (kind === "online") return "answering";
    if (kind === "offline") return "not answering";
    return "not checked yet";
  }

  function tile(id, value) { var node = $(id); if (node) node.textContent = value; }

  /* ------------------------------------------------------------- drawing */
  function matches(server) {
    if (state.filter !== "all" && server.state !== state.filter) return false;
    if (!state.term) return true;
    var haystack = [server.name, server.guild, server.host, server.port, server.map, label(server.state)].join(" ");
    return lower(haystack).indexOf(state.term) > -1;
  }

  function card(server) {
    var el = mk("article", "sv-card is-" + server.state);

    var head = mk("div", "sv-card__head");
    var title = mk("h3", "sv-card__name", server.name);
    head.appendChild(title);
    head.appendChild(mk("span", "sv-state is-" + server.state, label(server.state)));
    el.appendChild(head);

    var subline = [];
    if (server.guild) subline.push("Discord: " + server.guild);
    if (server.host) subline.push(server.host + (server.port ? ":" + server.port : ""));
    el.appendChild(mk("p", "sv-card__sub", subline.length ? subline.join(" - ") : "Address not reported"));

    var facts = mk("div", "sv-facts");
    function fact(name, value, extraClass) {
      var box = mk("div", "sv-fact" + (extraClass ? " " + extraClass : ""));
      box.appendChild(mk("span", "sv-fact__name", name));
      box.appendChild(mk("span", "sv-fact__value", value));
      facts.appendChild(box);
    }
    fact("Players", server.players === null ? "not reported" : (server.max ? server.players + " / " + server.max : String(server.players)));
    fact("Map", server.map ? String(server.map) : "not reported");
    fact("Last check", ago(server.checkedAt) || "never checked");
    fact("Round trip", server.ms === null ? "not reported" : server.ms + " ms");
    el.appendChild(facts);

    if (server.players !== null && server.max) {
      var bar = mk("div", "sv-bar-block");
      var fill = mk("span", "sv-bar-fill");
      var pct = Math.max(0, Math.min(100, Math.round((server.players / server.max) * 100)));
      fill.style.width = pct + "%";
      var track = mk("span", "sv-bar-track");
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(mk("span", "sv-bar-label", server.players + " of " + server.max + " slots (" + pct + "%)"));
      el.appendChild(bar);
    }

    if (server.detail || server.reason) {
      el.appendChild(mk("p", "sv-card__why", server.detail ? String(server.detail) : "The bot reported: " + server.reason));
    }
    return el;
  }

  function render() {
    var list = $("svList");
    if (!list) return;
    clear(list);
    var shown = state.servers.filter(matches);
    var online = state.servers.filter(function (s) { return s.state === "online"; }).length;
    var offline = state.servers.filter(function (s) { return s.state === "offline"; }).length;
    var unknown = state.servers.filter(function (s) { return s.state === "unknown"; }).length;
    var players = state.servers.reduce(function (n, s) { return n + (s.players === null ? 0 : s.players); }, 0);
    var anyPlayers = state.servers.some(function (s) { return s.players !== null; });

    tile("svStatServers", state.servers.length);
    tile("svStatOnline", online);
    tile("svStatOffline", offline + (unknown ? " (+" + unknown + " not checked)" : ""));
    tile("svStatPlayers", anyPlayers ? players : "not reported");

    if (!shown.length) {
      var empty = mk("p", "sv-empty", state.servers.length
        ? "No server matches that search or filter."
        : "The bot has not reported any server yet. Once a server is set up through /setup server in Discord, it appears here with its state and population.");
      list.appendChild(empty);
    } else {
      shown.forEach(function (server) { list.appendChild(card(server)); });
    }

    var meta = $("svMeta");
    if (meta) {
      var when = state.at ? ago(new Date(state.at).toISOString()) : null;
      var source = state.source === "servers" ? "the bot's server list" : (state.source === "status" ? "the bot's public status" : "no source");
      meta.textContent = "Showing " + shown.length + " of " + state.servers.length + " - read from " + source
        + (when ? " - updated " + when : "") + " - this page never writes to a server";
    }
    var note = $("svNote");
    if (note) {
      if (state.error) {
        note.hidden = false;
        note.textContent = state.error;
      } else {
        note.hidden = true;
      }
    }
  }

  /* ------------------------------------------------------------- loading */
  function uptime(seconds) {
    var mins = Math.floor(seconds / 60);
    if (mins < 60) return mins + "m";
    var hours = Math.floor(mins / 60);
    if (hours < 48) return hours + "h " + (mins % 60) + "m";
    return Math.floor(hours / 24) + "d " + (hours % 24) + "h";
  }

  function drawBot(status) {
    var box = $("svBot");
    if (!box) return;
    if (!status || typeof status !== "object") { box.hidden = true; return; }
    box.hidden = false;
    var online = status.online === true || status.gateway === "online";
    tile("svBotState", online ? "online" : "not answering");
    var guilds = firstOf(status.guilds, status.stats && status.stats.guilds);
    tile("svBotServers", guilds === null ? "not reported" : guilds + (guilds === 1 ? " server" : " servers"));
    var seconds = typeof status.uptimeSeconds === "number" ? status.uptimeSeconds : null;
    tile("svBotUptime", seconds === null ? "not reported" : uptime(seconds));
    var ping = typeof status.latencyMs === "number" ? status.latencyMs : null;
    tile("svBotPing", ping === null ? "not reported" : ping + " ms");
    var seen = firstOf(status.lastHeartbeat, status.heartbeat, status.seenAt);
    tile("svBotSeen", seen ? (ago(seen) || "not reported") : "not reported");
  }

  function finish() { state.at = Date.now(); render(); }

  function load() {
    return getJson("/api/status").then(function (status) {
      state.status = status;
      drawBot(status);
      return getJson("/api/servers").then(function (payload) {
        state.source = "servers";
        state.servers = fromServers(payload);
        state.error = null;
        finish();
      }).catch(function () {
        var list = fromStatus(status);
        state.source = "status";
        state.servers = list;
        var alive = status.online === true || status.gateway === "online";
        state.error = list.length
          ? "The bot is not publishing a full server list yet, so this page is showing the one server its public status carries. Population and the map appear here as soon as the bot reports them per server."
          : (alive
            ? "The bot is online and has no Rust server saved yet. /setup server in Discord is the step that adds one, and every server added there appears here with its state, population and map."
            : "The bot's Discord gateway is not connected right now, so there is no server to report. The row above is what it last said about itself, and this page keeps checking.");
        finish();
      });
    }).catch(function (error) {
      state.status = null;
      state.source = null;
      state.servers = [];
      drawBot(null);
      state.error = "The bot is not answering this page right now (" + (error && error.message ? error.message : error) + "). The status page reads the same source, and the card in the corner retries on its own.";
      finish();
    });
  }

  function wire() {
    var search = $("svSearch");
    if (search) {
      search.addEventListener("input", function () {
        state.term = lower(search.value).trim();
        render();
      });
    }
    var filters = $("svFilters");
    if (filters) {
      filters.addEventListener("click", function (event) {
        var button = event.target && event.target.closest ? event.target.closest("[data-filter]") : null;
        if (!button) return;
        state.filter = button.getAttribute("data-filter") || "all";
        Array.prototype.forEach.call(filters.querySelectorAll("[data-filter]"), function (node) {
          node.classList.toggle("is-on", node === button);
        });
        render();
      });
    }
    var refresh = $("svRefresh");
    if (refresh) {
      refresh.addEventListener("click", function () {
        refresh.disabled = true;
        load().then(function () { refresh.disabled = false; }, function () { refresh.disabled = false; });
      });
    }
  }

  function init() {
    wire();
    load();
    window.setInterval(function () {
      if (document.hidden) return;
      load();
    }, REFRESH_MS);
    window.setInterval(function () { if (state.at && state.servers.length !== undefined) render(); }, 15000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
