/* Settings page: browser preferences, storage readout, and the owner console.
   No dependencies. Everything that talks to a server talks to this site's own API,
   which is the same API the Discord panels write to. */
(function () {
  'use strict';

  var PREFS_KEY = 'rw_settings_v1';
  var THEME_KEY = 'spinback-theme';
  var KITS_KEY = 'spinback-kits-v1';
  var PALETTE_KEY = 'spinback-colour-palettes-v1';
  var TOKEN_KEY = 'spinback-settings-token';

  var ROLES = [['owner', 'Owner'], ['coOwner', 'Co-Owner'], ['headAdmin', 'Head Admin'], ['admin', 'Admin'], ['moderator', 'Moderator'], ['linked', 'Linked']];
  var LOGS = [['server', 'Server log'], ['console', 'Console log'], ['command', 'Command log'], ['rcon', 'RCON usage'], ['linking', 'Linking log'],
    ['killfeed', 'Killfeed'], ['eventfeed', 'EventFeed'], ['emoteKits', 'Emote Kits'], ['admin', 'Admin log'], ['zorp', 'Zorp log'],
    ['teleport', 'Teleport log'], ['clan', 'Clan log'], ['catchARide', 'Catch-A-Ride'], ['joinLeave', 'Join and leave'], ['errors', 'Error log']];

  function byId(id) { return document.getElementById(id); }
  function readPrefs() {
    try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (error) { return {}; }
  }
  function writePrefs(next) {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (error) { /* private mode */ }
  }
  function applyPrefs(prefs) {
    var root = document.documentElement;
    var theme = prefs.theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (error) {}
    root.setAttribute('data-reduce-motion', prefs.reduceMotion ? '1' : '0');
  }
  function countStored(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (error) { return 0; }
  }

  /* ---------------------------------------------------------------- appearance */
  function initAppearance() {
    var prefs = readPrefs();
    var themeSel = byId('setTheme');
    var motion = byId('setReduceMotion');
    var seasonal = byId('setSeasonal');
    if (!themeSel || !motion || !seasonal) return;
    themeSel.value = prefs.theme === 'light' ? 'light' : 'dark';
    motion.checked = prefs.reduceMotion === true;
    seasonal.checked = prefs.seasonal !== false;
    function save() {
      var next = readPrefs();
      next.theme = themeSel.value === 'light' ? 'light' : 'dark';
      next.reduceMotion = motion.checked;
      next.seasonal = seasonal.checked;
      writePrefs(next);
      applyPrefs(next);
      refreshCounts();
      var note = byId('appearanceNote');
      if (note) note.textContent = 'Saved in this browser at ' + new Date().toLocaleTimeString() + '.';
    }
    themeSel.addEventListener('change', save);
    motion.addEventListener('change', save);
    seasonal.addEventListener('change', save);
  }

  function refreshCounts() {
    var kits = countStored(KITS_KEY);
    var palettes = countStored(PALETTE_KEY);
    var prefs = Object.keys(readPrefs()).length;
    var kitEl = byId('kitsCount');
    var palEl = byId('palettesCount');
    var prefEl = byId('prefCount');
    if (kitEl) kitEl.textContent = kits + (kits === 1 ? ' kit' : ' kits');
    if (palEl) palEl.textContent = palettes + (palettes === 1 ? ' palette' : ' palettes');
    if (prefEl) prefEl.textContent = prefs + (prefs === 1 ? ' choice' : ' choices');
  }

  function initStorage() {
    function clear(key, label) {
      return function () {
        if (!window.confirm('Clear ' + label + ' from this browser? This cannot be undone.')) return;
        try { window.localStorage.removeItem(key); } catch (error) {}
        refreshCounts();
        var note = byId('storageNote');
        if (note) note.textContent = 'Cleared ' + label + ' in this browser at ' + new Date().toLocaleTimeString() + '.';
      };
    }
    var kitsBtn = byId('clearKits');
    var palBtn = byId('clearPalettes');
    var prefsBtn = byId('clearPrefs');
    if (kitsBtn) kitsBtn.addEventListener('click', clear(KITS_KEY, 'saved kits'));
    if (palBtn) palBtn.addEventListener('click', clear(PALETTE_KEY, 'saved palettes'));
    if (prefsBtn) prefsBtn.addEventListener('click', clear(PREFS_KEY, 'appearance choices'));
    refreshCounts();
  }

  /* ------------------------------------------------------------- owner console */
  var state = { settings: null, roles: [], servers: [], adding: null };

  function token() {
    try { return window.sessionStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
  }
  function setToken(value) {
    try {
      if (value) window.sessionStorage.setItem(TOKEN_KEY, value);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {}
  }
  function say(el, message, kind) {
    if (!el) return;
    el.textContent = message;
    el.className = 'set-state' + (kind ? ' is-' + kind : '');
  }

  function loadSettings() {
    var tokenEl = byId('token');
    var stateEl = byId('loadState');
    var value = (tokenEl && tokenEl.value.trim()) || token();
    if (!value) { say(stateEl, 'Paste the settings token first.', 'bad'); return; }
    setToken(value);
    say(stateEl, 'Asking this site for the saved settings…');
    fetch('/api/bot/settings', { headers: { 'x-settings-token': value, accept: 'application/json' } })
      .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (out) {
        if (out.status === 200 && out.body && out.body.ok !== false) {
          state.settings = out.body;
          render(out.body);
          say(stateEl, 'Loaded what the site has saved right now.', 'good');
          var panel = byId('console');
          if (panel) panel.hidden = false;
          return;
        }
        var reason = out.body && out.body.reason;
        if (reason === 'no-token') {
          say(stateEl, 'This website has no BOT_SETTINGS_TOKEN set yet. Set it on the website and on the bot to the same value, then reload.', 'bad');
          return;
        }
        if (reason === 'bad-token') { say(stateEl, 'That token does not match the one this website has.', 'bad'); return; }
        say(stateEl, 'Could not load settings (HTTP ' + out.status + ').', 'bad');
      })
      .catch(function (error) { say(stateEl, 'Could not reach this site\'s API: ' + error.message, 'bad'); });
    /* Role names come from the bot when it is reporting, so an id can be checked by eye. */
    fetch('/api/guild', { headers: { accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (guild) {
        if (guild && Array.isArray(guild.roles)) {
          state.roles = guild.roles;
          renderRoleHints();
        }
      })
      .catch(function () { /* the console still works with ids alone */ });
  }

  function roleById(id) {
    for (var i = 0; i < state.roles.length; i++) if (String(state.roles[i].id) === String(id)) return state.roles[i].name;
    return null;
  }
  function renderRoleHints() {
    ROLES.forEach(function (pair) {
      var hint = byId('hint_' + pair[0]);
      var field = byId('role_' + pair[0]);
      if (!hint || !field) return;
      var name = field.value ? roleById(field.value.trim()) : null;
      hint.textContent = field.value ? (name ? 'this server: ' + name : 'no role with that id in the server the bot is in') : 'not set';
    });
  }

  function render(data) {
    var roles = data.staffRoles || {};
    var roleBox = byId('roleFields');
    if (roleBox) {
      roleBox.innerHTML = '';
      ROLES.forEach(function (pair) {
        var label = document.createElement('label');
        label.textContent = pair[1];
        var input = document.createElement('input');
        input.type = 'text';
        input.id = 'role_' + pair[0];
        input.value = roles[pair[0]] ? String(roles[pair[0]]) : '';
        input.placeholder = 'role id';
        var hint = document.createElement('span');
        hint.className = 'set-rolehint';
        hint.id = 'hint_' + pair[0];
        label.appendChild(input);
        label.appendChild(hint);
        roleBox.appendChild(label);
        input.addEventListener('input', renderRoleHints);
      });
      renderRoleHints();
    }
    var channels = data.logChannels || {};
    var logBox = byId('logFields');
    if (logBox) {
      logBox.innerHTML = '';
      LOGS.forEach(function (pair) {
        var label = document.createElement('label');
        label.textContent = pair[1];
        var input = document.createElement('input');
        input.type = 'text';
        input.id = 'log_' + pair[0];
        input.value = channels[pair[0]] ? String(channels[pair[0]]) : '';
        input.placeholder = 'channel id, or blank for off';
        label.appendChild(input);
        logBox.appendChild(label);
      });
    }
    state.servers = (data.servers || []).map(function (row) {
      return { id: row.id, name: row.name || 'server', host: row.host || '', port: row.port || '', hasPassword: row.hasPassword !== false && !!row.password, remove: false };
    });
    renderServers();
    var kits = data.kits || {};
    if (byId('kitList')) byId('kitList').value = kits.listCommand || '';
    if (byId('kitGive')) byId('kitGive').value = kits.giveCommand || '';
    if (byId('kitLocked')) byId('kitLocked').checked = kits.locked === true;
    var links = Array.isArray(data.links) ? data.links : [];
    var pending = Array.isArray(data.pending) ? data.pending : [];
    var badge = byId('linkBadge');
    if (badge) badge.textContent = links.length + ' linked, ' + pending.length + ' waiting';
    var roster = byId('linkRoster');
    if (roster) {
      roster.innerHTML = '';
      if (!links.length) {
        var none = document.createElement('div');
        none.textContent = 'No links on record yet.';
        roster.appendChild(none);
      } else {
        links.slice(0, 60).forEach(function (link) {
          var item = document.createElement('div');
          item.textContent = link.gamertag + '  —  Discord ' + link.userId;
          roster.appendChild(item);
        });
      }
    }
  }

  function renderServers() {
    var box = byId('serverList');
    if (!box) return;
    box.innerHTML = '';
    if (!state.servers.length) {
      var none = document.createElement('p');
      none.className = 'set-note';
      none.textContent = 'No Rust server saved yet. Add one below, then test it from Discord with /setup refresh.';
      box.appendChild(none);
      return;
    }
    state.servers.forEach(function (server, index) {
      var wrap = document.createElement('div');
      wrap.className = 'set-server';
      var head = document.createElement('header');
      var title = document.createElement('strong');
      title.textContent = server.name;
      var where = document.createElement('code');
      where.textContent = server.host + (server.port ? ':' + server.port : '');
      var right = document.createElement('span');
      right.className = 'set-badge';
      right.textContent = server.hasPassword ? 'password saved' : 'no password saved';
      head.appendChild(title);
      head.appendChild(where);
      head.appendChild(right);
      wrap.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'set-grid';
      [['Name', 'name', 'text', server.name], ['Address', 'host', 'text', server.host], ['RCON port', 'port', 'text', String(server.port || '')], ['RCON password', 'password', 'password', '']].forEach(function (spec) {
        var label = document.createElement('label');
        label.textContent = spec[0];
        var input = document.createElement('input');
        input.type = spec[2];
        input.value = spec[3];
        input.placeholder = spec[1] === 'password' ? 'blank keeps the saved one' : '';
        input.addEventListener('input', function () { state.servers[index][spec[1]] = input.value; });
        label.appendChild(input);
        grid.appendChild(label);
      });
      wrap.appendChild(grid);
      var inline = document.createElement('label');
      inline.className = 'set-inline';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'set-switch';
      check.checked = server.remove === true;
      check.addEventListener('change', function () { state.servers[index].remove = check.checked; });
      var text = document.createElement('span');
      text.textContent = 'Remove this server on save';
      inline.appendChild(check);
      inline.appendChild(text);
      wrap.appendChild(inline);
      box.appendChild(wrap);
    });
  }

  function addServer() {
    var name = byId('newName');
    var host = byId('newHost');
    var port = byId('newPort');
    var pass = byId('newPass');
    var stateEl = byId('serverState');
    if (!host || !host.value.trim()) { say(stateEl, 'An address is the one field that is required.', 'bad'); return; }
    state.servers.push({ id: null, name: (name.value.trim() || host.value.trim()), host: host.value.trim(), port: port.value.trim(), password: pass.value, hasPassword: !!pass.value, remove: false });
    renderServers();
    name.value = ''; host.value = ''; port.value = ''; pass.value = '';
    say(stateEl, 'Added to the list. Press Save everything below to write it.', 'good');
  }

  function collect() {
    var roles = {};
    ROLES.forEach(function (pair) {
      var field = byId('role_' + pair[0]);
      if (field) roles[pair[0]] = field.value.trim();
    });
    var channels = {};
    LOGS.forEach(function (pair) {
      var field = byId('log_' + pair[0]);
      if (field) channels[pair[0]] = field.value.trim();
    });
    var servers = state.servers.map(function (server) {
      return { id: server.id, name: server.name, host: server.host, port: server.port, password: server.password || '', remove: server.remove === true };
    });
    return {
      staffRoles: roles,
      logChannels: channels,
      servers: servers,
      kits: {
        listCommand: (byId('kitList') && byId('kitList').value.trim()) || '',
        giveCommand: (byId('kitGive') && byId('kitGive').value.trim()) || '',
        locked: !!(byId('kitLocked') && byId('kitLocked').checked),
      },
    };
  }

  function save() {
    var value = token();
    var stateEl = byId('saveState');
    if (!value) { say(stateEl, 'Load the settings first: the token is what lets this page write.', 'bad'); return; }
    var btn = byId('saveBtn');
    if (btn) btn.disabled = true;
    say(stateEl, 'Saving…');
    fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-settings-token': value },
      body: JSON.stringify(collect()),
    })
      .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (out) {
        if (btn) btn.disabled = false;
        if (out.status === 200 && out.body && out.body.ok) {
          var wrote = Array.isArray(out.body.wrote) ? out.body.wrote : [];
          say(stateEl, wrote.length ? 'Saved: ' + wrote.join(', ') + '.' : 'Saved, but the site reported no sections changed.', 'good');
          /* Servers come back with the ids the site issued, so saving twice edits the same
             rows instead of adding them again. */
          if (Array.isArray(out.body.servers)) {
            state.servers = out.body.servers.map(function (row) {
              return { id: row.id, name: row.name || 'server', host: row.host || '', port: row.port || '', hasPassword: row.hasPassword === true, remove: false };
            });
            renderServers();
            say(stateEl, (wrote.length ? 'Saved: ' + wrote.join(', ') + '.' : 'Saved.') + ' ' + state.servers.length + ' server(s) on record.', 'good');
          }
          return;
        }
        var reason = out.body && out.body.reason;
        say(stateEl, reason === 'bad-token' ? 'That token was refused by the website.' : 'Save failed (HTTP ' + out.status + ').', 'bad');
      })
      .catch(function (error) { if (btn) btn.disabled = false; say(stateEl, 'Could not save: ' + error.message, 'bad'); });
  }

  function initConsole() {
    if (byId('loadBtn')) byId('loadBtn').addEventListener('click', loadSettings);
    if (byId('saveBtn')) byId('saveBtn').addEventListener('click', save);
    if (byId('addServer')) byId('addServer').addEventListener('click', addServer);
    if (byId('forgetToken')) byId('forgetToken').addEventListener('click', function () {
      setToken('');
      var field = byId('token');
      if (field) field.value = '';
      say(byId('loadState'), 'Token forgotten in this tab.', 'good');
    });
    var field = byId('token');
    if (field && token()) field.value = token();
  }

  function init() {
    initAppearance();
    initStorage();
    initConsole();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
