/* console.js - drives /dashboard/home.html.
   Every number on the page comes from an endpoint that was asked at that moment;
   if an endpoint fails, the panel says so instead of showing a placeholder that
   could be mistaken for real data. Text always goes in with textContent, so a
   name pasted into the rules table can never become markup. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function when(ms) {
    if (!ms) return 'unknown';
    try { return new Date(ms).toLocaleString(); } catch (e) { return String(ms); }
  }
  function msg(node, text, good) {
    node.textContent = text || '';
    node.className = 'sbc-msg' + (good === true ? ' good' : good === false ? ' bad' : '');
  }

  function api(path, options) {
    var init = options || {};
    init.credentials = 'same-origin';
    init.headers = init.headers || {};
    init.headers.accept = 'application/json';
    if (init.body) init.headers['content-type'] = 'application/json';
    return fetch(path, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var problem = new Error(data && data.error ? data.error : 'http_' + response.status);
          problem.status = response.status;
          problem.data = data;
          throw problem;
        }
        return data;
      });
    });
  }

  function explain(error) {
    if (!error) return 'Something went wrong.';
    if (error.status === 401) return 'Not signed in any more - sign in again with Discord.';
    if (error.status === 403) return 'This account is not staff on the server, so the console will not answer.';
    if (error.status === 503) return 'Sign-in is not configured on this app yet, so the console cannot read anything.';
    return 'Could not load: ' + (error.message || 'unknown error');
  }

  var state = { overview: null, loaded: {}, canEdit: false };

  /* ------------------------------- overview ------------------------------- */
  function renderOverview(data) {
    state.overview = data;
    state.canEdit = data.canEdit === true;
    var bot = data.bot || {};
    var online = bot.online === true || bot.ok === true;
    var pill = $('ov-pill');
    pill.textContent = bot.online === true ? 'bot online' : (bot.online === false ? 'bot offline' : (bot && bot.service ? 'status unreadable' : 'bot not answering'));
    pill.className = 'sbc-pill ' + (bot.online === true ? 'good' : bot.online === false ? 'bad' : 'warn');
    $('ov-sub').textContent = bot && bot.service
      ? 'Read from the bot\u2019s own status endpoint at ' + when(Date.now()) + '. If the bot is unreachable, that is what it says.'
      : 'The bot did not answer its status endpoint, so the fields below show whatever the console could confirm.';

    var who = $('sbc-who');
    clear(who);
    who.appendChild(el('b', null, data.you && data.you.name ? data.you.name : 'signed in'));
    who.appendChild(el('span', null, (data.you && data.you.level ? data.you.level : 'unknown') + ' \u00b7 ' + ((data.you && data.you.roles && data.you.roles.length) ? data.you.roles.join(', ') : 'no special roles')));

    var guild = data.guild || {};
    var grid = $('ov-grid');
    clear(grid);
    var stats = [
      ['Bot', bot.online === true ? 'online' : (bot.online === false ? 'offline' : 'unknown')],
      ['Bot tag', bot.tag || 'not reported'],
      ['Discord server', guild.name || (bot.guildConfigured === false ? 'not configured' : 'not reported')],
      ['Members', guild.memberCount === 0 || guild.memberCount ? String(guild.memberCount) : 'not reported'],
      ['Slash command', bot.command || 'not reported'],
      ['Gateway', bot.gateway || 'not reported'],
    ];
    stats.forEach(function (pair) {
      var box = el('div', 'sbc-stat');
      box.appendChild(el('span', null, pair[0]));
      box.appendChild(el('b', null, pair[1]));
      grid.appendChild(box);
    });

    var skip = /token(?!present)|secret|apikey|password/i;
    var wanted = ['service', 'version', 'since', 'startedAt', 'uptimeSeconds', 'loginAttempts', 'interactions', 'guildConfigured', 'siteUrl', 'host', 'port', 'commandId', 'wsPing', 'lastError'];
    var body = $('ov-table').querySelector('tbody');
    clear(body);
    wanted.forEach(function (key) {
      if (skip.test(key)) return;
      if (bot[key] === undefined || bot[key] === null || bot[key] === '') return;
      var tr = el('tr');
      tr.appendChild(el('td', null, key));
      tr.appendChild(el('td', 'mono', typeof bot[key] === 'object' ? JSON.stringify(bot[key]) : String(bot[key])));
      body.appendChild(tr);
    });
    if (!body.firstChild) {
      var tr2 = el('tr');
      tr2.appendChild(el('td', null, 'Nothing else reported'));
      tr2.appendChild(el('td', 'mono', 'the bot answered, but without these fields'));
      body.appendChild(tr2);
    }
  }

  /* --------------------------------- roles -------------------------------- */
  var RULE_LABEL = { roleIds: 'Role id', roleNames: 'Role name', userIds: 'User id', users: 'Username' };

  function renderRoles() {
    var data = state.overview || {};
    var rules = data.staffRules || {};
    var you = data.you || {};
    var grid = $('roles-you');
    clear(grid);
    [['You', you.name || 'signed in'], ['Your access', you.level || 'unknown'], ['Your roles', (you.roles && you.roles.length) ? you.roles.join(', ') : 'none'], ['Your user id', you.id || 'not reported'], ['Can change rules', state.canEdit ? 'yes (owner)' : 'no (staff only)']].forEach(function (pair) {
      var box = el('div', 'sbc-stat');
      box.appendChild(el('span', null, pair[0]));
      box.appendChild(el('b', null, pair[1]));
      grid.appendChild(box);
    });
    $('roles-pill').textContent = state.canEdit ? 'owner' : 'staff';
    $('roles-pill').className = 'sbc-pill ' + (state.canEdit ? 'good' : 'warn');
    if (!state.canEdit) $('roles-add').disabled = true;
    msg($('roles-addnote'), state.canEdit ? 'Saved rules take effect on the next sign-in or refresh. Entries that came from the app\u2019s settings are shown for reference and cannot be removed here.' : 'Only the server owner can change these rules. Ask the owner if something here is wrong.', state.canEdit ? undefined : false);

    api('/api/owner/staff').then(function (staff) { renderStaffRules(staff); }).catch(function (error) { msg($('roles-msg'), explain(error), false); });
    renderGuildRoles(data.guild);
  }

  function renderStaffRules(staff) {
    var stored = staff.saved || {};
    var env = staff.fromEnv || {};
    var body = $('roles-rules').querySelector('tbody');
    clear(body);
    Object.keys(RULE_LABEL).forEach(function (kind) {
      var savedList = stored[kind] || [];
      var envList = env[kind] || [];
      var builtIn = (kind === 'roleNames' || kind === 'users') ? (staff.builtIn || []) : [];
      if (!savedList.length && !envList.length && !builtIn.length) {
        var empty = el('tr');
        empty.appendChild(el('td', null, RULE_LABEL[kind]));
        empty.appendChild(el('td', 'mono', 'nothing set'));
        empty.appendChild(el('td', null, '\u2014'));
        empty.appendChild(el('td', null, ''));
        body.appendChild(empty);
        return;
      }
      savedList.forEach(function (value) {
        var tr = el('tr');
        tr.appendChild(el('td', null, RULE_LABEL[kind]));
        tr.appendChild(el('td', 'mono', value));
        tr.appendChild(el('td', null, 'saved here'));
        var cell = el('td');
        if (state.canEdit) {
          var remove = el('button', 'sbc-btn sbc-btn-tiny', 'Remove');
          remove.type = 'button';
          remove.addEventListener('click', function () { removeRule(kind, value, remove); });
          cell.appendChild(remove);
        }
        tr.appendChild(cell);
        body.appendChild(tr);
      });
      envList.forEach(function (value) {
        var tr = el('tr');
        tr.appendChild(el('td', null, RULE_LABEL[kind]));
        tr.appendChild(el('td', 'mono', value));
        tr.appendChild(el('td', null, 'from app settings'));
        tr.appendChild(el('td', null, 'change it in the app\u2019s environment'));
        body.appendChild(tr);
      });
      builtIn.forEach(function (value) {
        var tr = el('tr');
        tr.appendChild(el('td', null, RULE_LABEL[kind]));
        tr.appendChild(el('td', 'mono', value));
        tr.appendChild(el('td', null, 'built in'));
        tr.appendChild(el('td', null, 'always allowed'));
        body.appendChild(tr);
      });
    });
  }

  function renderGuildRoles(guild) {
    var body = $('roles-guild').querySelector('tbody');
    clear(body);
    var roles = (guild && guild.roles) || [];
    $('roles-guildnote').textContent = roles.length
      ? 'Read from the bot a moment ago. Adding a role here means anyone holding it can open this dashboard.'
      : 'The bot did not report the server\u2019s roles, so there is nothing to list. Check the bot is online, then reload.';
    roles.forEach(function (role) {
      var tr = el('tr');
      tr.appendChild(el('td', null, role.name || '(unnamed role)'));
      tr.appendChild(el('td', 'mono', role.id));
      var cell = el('td');
      if (state.canEdit) {
        var add = el('button', 'sbc-btn sbc-btn-tiny', 'Allow as staff');
        add.type = 'button';
        add.addEventListener('click', function () { addRule('roleIds', role.id, add); });
        cell.appendChild(add);
      }
      tr.appendChild(cell);
      body.appendChild(tr);
    });
  }

  function addRule(kind, value, button) {
    if (!value) { msg($('roles-msg'), 'Nothing to add.', false); return; }
    button.disabled = true;
    api('/api/owner/staff', { method: 'POST', body: JSON.stringify({ kind: kind, value: value }) })
      .then(function () { msg($('roles-msg'), 'Added ' + RULE_LABEL[kind].toLowerCase() + ' ' + value + '.', true); return api('/api/owner/staff'); })
      .then(function (staff) { renderStaffRules(staff); button.disabled = false; })
      .catch(function (error) { msg($('roles-msg'), explain(error), false); button.disabled = false; });
  }

  function removeRule(kind, value, button) {
    button.disabled = true;
    api('/api/owner/staff', { method: 'DELETE', body: JSON.stringify({ kind: kind, value: value }) })
      .then(function () { msg($('roles-msg'), 'Removed ' + value + '.', true); return api('/api/owner/staff'); })
      .then(function (staff) { renderStaffRules(staff); })
      .catch(function (error) { msg($('roles-msg'), explain(error), false); button.disabled = false; });
  }

  /* --------------------------------- logs --------------------------------- */
  var LOG_LABEL = {
    staff_add: 'Staff rule added',
    staff_remove: 'Staff rule removed',
    staff_change: 'Staff rules changed',
    server_settings: 'Rust server settings',
    probe: 'Status URL checked',
    sign_in: 'Signed in',
    sign_out: 'Signed out',
  };

  function loadLogs() {
    api('/api/owner/logs?limit=40').then(function (data) { renderLogs(data.entries || []); })
      .catch(function (error) { msg($('logs-msg'), explain(error), false); });
  }

  function renderLogs(entries) {
    var body = $('logs-table').querySelector('tbody');
    clear(body);
    $('logs-count').textContent = entries.length + (entries.length === 1 ? ' event' : ' events');
    if (!entries.length) {
      var tr = el('tr');
      var td = el('td', null, 'Nothing logged yet. Signing in, saving the server details and changing the rules all land here.');
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    entries.forEach(function (entry) {
      var tr = el('tr');
      tr.appendChild(el('td', null, when(entry.t)));
      tr.appendChild(el('td', null, LOG_LABEL[entry.kind] || entry.kind || 'event'));
      tr.appendChild(el('td', null, (entry.by && (entry.by.name || entry.by.id)) || 'unknown'));
      tr.appendChild(el('td', null, entry.detail || ''));
      body.appendChild(tr);
    });
  }

  /* ------------------------------ rust server ----------------------------- */
  var FIELDS = ['name', 'platform', 'region', 'rate', 'wipe', 'connect', 'joinUrl', 'statusUrl', 'notes'];

  function loadServer() {
    api('/api/owner/server').then(function (data) { fillServer(data.settings); }).catch(function (error) { msg($('server-msg'), explain(error), false); });
  }

  function fillServer(settings) {
    settings = settings || {};
    FIELDS.forEach(function (key) { var input = $('f-' + key); if (input) input.value = settings[key] || ''; });
    var body = $('server-meta').querySelector('tbody');
    clear(body);
    var rows = [
      ['Last saved', settings.updatedAt ? when(settings.updatedAt) : 'not saved yet'],
      ['Saved by', settings.updatedBy ? (settings.updatedBy.name || settings.updatedBy.id) : 'nobody yet'],
      ['Status URL last checked', settings.probe ? (settings.probe.ok ? 'reachable (' + settings.probe.status + ') at ' + when(settings.probe.at) : 'not reachable at ' + when(settings.probe.at)) : 'never checked'],
    ];
    rows.forEach(function (pair) {
      var tr = el('tr');
      tr.appendChild(el('td', null, pair[0]));
      tr.appendChild(el('td', 'mono', pair[1]));
      body.appendChild(tr);
    });
  }

  function saveServer() {
    var payload = {};
    FIELDS.forEach(function (key) { var input = $('f-' + key); payload[key] = input ? input.value : ''; });
    msg($('server-msg'), 'Saving\u2026');
    api('/api/owner/server', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (data) { fillServer(data.settings); msg($('server-msg'), 'Saved.', true); })
      .catch(function (error) { msg($('server-msg'), explain(error), false); });
  }

  function probeServer() {
    var url = $('f-status').value.trim();
    if (!url) { msg($('server-msg'), 'Put a status URL in the box first.', false); return; }
    msg($('server-msg'), 'Asking that address\u2026');
    api('/api/owner/probe', { method: 'POST', body: JSON.stringify({ url: url }) })
      .then(function (data) {
        var result = data.result || {};
        msg($('server-msg'), result.ok ? 'The address answered ' + result.status + '. That is all this check proves.' : 'No usable answer: ' + (result.reason || 'no response'), result.ok === true);
        return api('/api/owner/server');
      })
      .then(function (data) { if (data) fillServer(data.settings); })
      .catch(function (error) { msg($('server-msg'), explain(error), false); });
  }

  /* ------------------------------ navigation ------------------------------ */
  var LOADERS = { overview: loadOverview, server: loadServer, roles: renderRoles, logs: loadLogs };

  function loadOverview() {
    return api('/api/owner/overview').then(renderOverview).catch(function (error) {
      $('ov-pill').textContent = 'cannot read';
      $('ov-pill').className = 'sbc-pill bad';
      $('ov-sub').textContent = explain(error);
    });
  }

  function show(panel) {
    var known = ['overview', 'server', 'roles', 'logs'];
    if (known.indexOf(panel) === -1) panel = 'overview';
    known.forEach(function (name) {
      var section = $('panel-' + name);
      if (section) section.className = 'sbc-panel' + (name === panel ? '' : ' sbc-hidden');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.sbc-nav a[data-panel]'), function (link) {
      if (link.getAttribute('data-panel') === panel) link.className = 'on'; else link.className = '';
    });
    if (LOADERS[panel]) LOADERS[panel]();
  }

  function boot() {
    var add = $('roles-add');
    if (add) add.addEventListener('click', function () { addRule($('r-kind').value, $('r-value').value.trim(), add); });
    var save = $('server-save');
    if (save) save.addEventListener('click', saveServer);
    var probe = $('server-probe');
    if (probe) probe.addEventListener('click', probeServer);
    var refresh = $('logs-refresh');
    if (refresh) refresh.addEventListener('click', loadLogs);
    window.addEventListener('hashchange', function () { show(location.hash.replace('#', '')); });
    loadOverview().then(function () { show(location.hash.replace('#', '') || 'overview'); });
    loadLogs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
@@SHA wrangler.jsonc 4c1323cc600d3437fbbc1bc758c6b02e5beb6d53 SIZE 326
