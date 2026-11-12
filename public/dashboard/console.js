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

  /* The session is kept here rather than in a cookie: this host does not pass Set-Cookie
     through to the browser, so the token is read out of storage and sent as a header with
     every request the console makes. */
  function sessionToken() {
    try { return localStorage.getItem('spinback-session') || ''; } catch (error) { return ''; }
  }

  function api(path, options) {
    var init = options || {};
    init.credentials = 'same-origin';
    init.headers = init.headers || {};
    init.headers.accept = 'application/json';
    var token = sessionToken();
    if (token) init.headers['x-spinback-session'] = token;
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
    api('/api/owner/server').then(function (data) { fillServer(data); }).catch(function (error) { msg($('server-msg'), explain(error), false); });
  }

  /* Whether Spinback is really in the server these settings describe. Nothing can be set up
     until it is, so the panel says so and leaves the buttons shut. */
  function renderServerGate(inGuild, invite) {
    var gate = $('server-gate');
    if (gate) {
      clear(gate);
      gate.className = 'sbc-gate ' + (inGuild === true ? 'ok' : inGuild === false ? 'bad' : '');
      if (inGuild === true) {
        gate.appendChild(el('span', null, 'Spinback is in this server, so these settings apply to it.'));
      } else if (inGuild === false) {
        gate.appendChild(el('span', null, 'Spinback is not in this server yet. Add it first: settings saved before it is there would save and do nothing.'));
        if (invite) {
          var link = el('a', 'sbc-btn sbc-btn-go', 'Add Spinback to this server');
          link.href = invite;
          link.target = '_blank';
          link.rel = 'noopener';
          gate.appendChild(link);
        }
      } else {
        gate.appendChild(el('span', null, 'The bot did not report which servers it is in, so this cannot be checked right now.'));
      }
    }
    var shut = inGuild === false;
    ['server-save', 'server-probe'].forEach(function (id) {
      var button = $(id);
      if (button) button.disabled = shut;
    });
  }

  function fillServer(data) {
    data = data || {};
    if (data.botInGuild !== undefined) renderServerGate(data.botInGuild, data.invite);
    var settings = data.settings || {};
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
      .then(function (data) { fillServer(data); msg($('server-msg'), 'Saved.', true); })
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
  /* ------------------------------------------------------------ staff roles --- */
  var roleSlots = [];
  function loadStaff() {
    return api('/api/owner/roles').then(renderStaff).catch(function (error) { msg($('staff-msg'), explain(error), false); });
  }
  function renderStaff(data) {
    var host = $('staff-slots');
    if (!host) return;
    clear(host);
    roleSlots = data.slots || [];
    roleSlots.forEach(function (slot) {
      var field = el('div', 'sbc-field');
      var label = el('label', null, slot.label + (slot.required ? ' *' : ''));
      label.setAttribute('for', 'role-' + slot.key);
      var input = el('input');
      input.id = 'role-' + slot.key;
      input.maxLength = 25;
      input.value = slot.roleId || '';
      input.placeholder = 'Discord role id';
      field.appendChild(label);
      field.appendChild(input);
      host.appendChild(field);
    });
    var set = roleSlots.filter(function (slot) { return slot.roleId; }).length;
    var pill = $('staff-pill');
    if (pill) { pill.textContent = set + ' of ' + roleSlots.length + ' set'; pill.className = 'sbc-pill' + (set === roleSlots.length ? ' good' : ''); }
    if ($('staff-note')) $('staff-note').textContent = data.note || '';
    var save = $('staff-save');
    if (save) save.disabled = !data.canEdit;
  }
  function saveStaff() {
    var payload = {};
    roleSlots.forEach(function (slot) {
      var input = $('role-' + slot.key);
      if (input) payload[slot.key] = input.value.trim();
    });
    msg($('staff-msg'), 'Saving\u2026');
    api('/api/owner/roles', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (data) {
        msg($('staff-msg'), (data.missing && data.missing.length) ? 'Saved, but these required roles are still empty: ' + data.missing.join(', ') + '.' : 'Saved.', true);
        return loadStaff();
      })
      .catch(function (error) { msg($('staff-msg'), explain(error), false); });
  }

  /* ---------------------------------------------------------- log channels --- */
  var logSlots = [];
  function loadChannels() {
    return api('/api/owner/logchannels').then(renderChannels).catch(function (error) { msg($('channels-msg'), explain(error), false); });
  }
  function renderChannels(data) {
    var host = $('channels-slots');
    if (!host) return;
    clear(host);
    logSlots = data.slots || [];
    logSlots.forEach(function (slot) {
      var field = el('div', 'sbc-field');
      var label = el('label', null, slot.label);
      label.setAttribute('for', 'chan-' + slot.key);
      var input = el('input');
      input.id = 'chan-' + slot.key;
      input.maxLength = 25;
      input.value = slot.channelId || '';
      input.placeholder = 'channel id, or empty to switch off';
      field.appendChild(label);
      field.appendChild(input);
      host.appendChild(field);
    });
    var pill = $('channels-pill');
    if (pill) { pill.textContent = (data.set || 0) + ' of ' + (data.total || logSlots.length) + ' on'; pill.className = 'sbc-pill' + (data.set ? ' good' : ''); }
    if ($('channels-note')) $('channels-note').textContent = data.note || '';
    var save = $('channels-save');
    if (save) save.disabled = !data.canEdit;
  }
  function saveChannels() {
    var payload = {};
    logSlots.forEach(function (slot) {
      var input = $('chan-' + slot.key);
      if (input) payload[slot.key] = input.value.trim();
    });
    msg($('channels-msg'), 'Saving\u2026');
    api('/api/owner/logchannels', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (data) {
        msg($('channels-msg'), (data.rejected && data.rejected.length) ? 'Saved. These did not look like channel ids: ' + data.rejected.join(', ') + '.' : 'Saved.', true);
        return loadChannels();
      })
      .catch(function (error) { msg($('channels-msg'), explain(error), false); });
  }

  /* ------------------------------------------------------ rust connections --- */
  function loadRcon() {
    return api('/api/owner/servers').then(renderRcon).catch(function (error) { msg($('rcon-msg'), explain(error), false); });
  }
  function renderRcon(data) {
    var list = $('rcon-list');
    if (!list) return;
    clear(list);
    var rows = data.servers || [];
    rows.forEach(function (row) {
      var card = el('div', 'sbc-conn');
      var main = el('div', 'sbc-conn-main');
      main.appendChild(el('div', 'sbc-conn-name', row.name));
      main.appendChild(el('div', 'sbc-conn-host mono', row.host + ':' + row.port + (row.passwordSet ? ' \u00b7 password held' : ' \u00b7 no password')));
      main.appendChild(el('div', 'sbc-conn-sub', row.lastTest
        ? (row.lastTest.ok ? 'Last check answered ' + row.lastTest.command + ' in ' + row.lastTest.ms + ' ms \u00b7 ' + when(row.lastTest.at) : 'Last check did not answer: ' + row.lastTest.reason + ' \u00b7 ' + when(row.lastTest.at))
        : 'Never checked'));
      card.appendChild(main);
      var actions = el('div', 'sbc-conn-actions');
      var test = el('button', 'sbc-btn sbc-btn-go', 'Check it');
      test.type = 'button';
      test.addEventListener('click', function () { testRcon(row.id, test); });
      var remove = el('button', 'sbc-btn', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', function () { removeRcon(row.id); });
      actions.appendChild(test);
      actions.appendChild(remove);
      card.appendChild(actions);
      list.appendChild(card);
    });
    if (!rows.length) list.appendChild(el('p', 'sbc-note', 'Nothing connected yet. Add a server below and the bot will reconnect to it by itself.'));
    if ($('rcon-count')) $('rcon-count').textContent = rows.length + '/' + (data.max || 3) + ' connected';
    if ($('rcon-note')) $('rcon-note').textContent = data.note || '';
    var add = $('rcon-add');
    if (add) add.disabled = !data.canEdit || rows.length >= (data.max || 3);
  }
  function testRcon(id, button) {
    var was = button.textContent;
    button.disabled = true;
    button.textContent = 'Asking\u2026';
    api('/api/owner/rcon-test', { method: 'POST', body: JSON.stringify({ id: id }) })
      .then(function (data) {
        var result = data.result || {};
        var said = result.ok
          ? 'The server answered ' + (result.command || 'the check') + ' in ' + (result.ms || 0) + ' ms. ' + (result.answer ? 'It said: ' + result.answer.slice(0, 300) : 'It sent no text back.')
          : 'No answer: ' + (result.detail || result.reason || 'unknown');
        msg($('rcon-msg'), said, result.ok === true);
        return loadRcon();
      })
      .catch(function (error) { msg($('rcon-msg'), explain(error), false); })
      .then(function () { button.disabled = false; button.textContent = was; });
  }
  function addRcon() {
    var payload = {
      name: ($('rcon-name') || {}).value || '',
      host: ($('rcon-host') || {}).value || '',
      port: Number((($('rcon-port') || {}).value) || 0),
      password: ($('rcon-password') || {}).value || '',
    };
    msg($('rcon-msg'), 'Adding\u2026');
    api('/api/owner/servers', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        ['rcon-name', 'rcon-host', 'rcon-port', 'rcon-password'].forEach(function (id) { var input = $(id); if (input) input.value = ''; });
        msg($('rcon-msg'), 'Added. Nothing is connected until the bot reads these settings - use Check it to see what a server answers.', true);
        return loadRcon();
      })
      .catch(function (error) {
        var said = (error && error.data && error.data.message) ? error.data.message : explain(error);
        msg($('rcon-msg'), said, false);
      });
  }
  function removeRcon(id) {
    msg($('rcon-msg'), 'Removing\u2026');
    api('/api/owner/servers?id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { msg($('rcon-msg'), 'Removed.', true); return loadRcon(); })
      .catch(function (error) { msg($('rcon-msg'), explain(error), false); });
  }

  var LOADERS = { overview: loadOverview, server: loadServer, staff: loadStaff, channels: loadChannels, rcon: loadRcon, roles: renderRoles, logs: loadLogs };

  function loadOverview() {
    return api('/api/owner/overview').then(renderOverview).catch(function (error) {
      $('ov-pill').textContent = 'cannot read';
      $('ov-pill').className = 'sbc-pill bad';
      $('ov-sub').textContent = explain(error);
    });
  }

  function show(panel) {
    var known = ['overview', 'server', 'staff', 'channels', 'rcon', 'roles', 'logs'];
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
    /* Coming back from sign-in: the session is in the address once, is kept here, and is
       removed from the address so it does not sit in history or a link someone shares. */
    try {
      var query = new URLSearchParams(location.search);
      var arrived = query.get('t');
      if (arrived) {
        localStorage.setItem('spinback-session', arrived);
        query.delete('t');
        history.replaceState(null, '', location.pathname + (query.toString() ? '?' + query.toString() : ''));
      }
      var out = document.querySelector('a[href="/auth/logout"]');
      if (out) out.addEventListener('click', function () {
        try { localStorage.removeItem('spinback-session'); } catch (error) { /* nothing to clear */ }
      });
    } catch (error) { /* no storage available: the panels report what they can */ }
    var add = $('roles-add');
    if (add) add.addEventListener('click', function () { addRule($('r-kind').value, $('r-value').value.trim(), add); });
    var save = $('server-save');
    if (save) save.addEventListener('click', saveServer);
    var probe = $('server-probe');
    if (probe) probe.addEventListener('click', probeServer);
    var staffSave = $('staff-save');
    if (staffSave) staffSave.addEventListener('click', saveStaff);
    var channelsSave = $('channels-save');
    if (channelsSave) channelsSave.addEventListener('click', saveChannels);
    var rconAdd = $('rcon-add');
    if (rconAdd) rconAdd.addEventListener('click', addRcon);
    var refresh = $('logs-refresh');
    if (refresh) refresh.addEventListener('click', loadLogs);
    window.addEventListener('hashchange', function () { show(location.hash.replace('#', '')); });
    loadOverview().then(function () { show(location.hash.replace('#', '') || 'overview'); });
    loadLogs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
