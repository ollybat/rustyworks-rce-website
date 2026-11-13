/* Settings console.
   Everything on this page talks to this site's own API, which is the same place the Discord
   panels write to. Roles and channels are read from the bot itself, so nothing is typed by
   hand unless a list is genuinely unavailable — and then the page says so. */
(function () {
  'use strict';

  var KEYS = {
    prefs: 'rw_settings_v1',
    theme: 'spinback-theme',
    kits: 'spinback-kits-v1',
    palettes: 'spinback-colour-palettes-v1',
    token: 'spinback-settings-token'
  };

  /* Role slots, in the order the bot checks them. The name hints are only ever used for a
     suggestion the owner confirms; nothing is assigned automatically. */
  var ROLE_SLOTS = [
    { key: 'owner', label: 'Owner', why: 'The top slot. Normally whoever runs the server.', hints: ['owner', 'founder'] },
    { key: 'coOwner', label: 'Co-Owner', why: 'Second in command.', hints: ['co-owner', 'co owner', 'coowner', 'deputy', 'vice'] },
    { key: 'headAdmin', label: 'Head Admin', why: 'Runs the staff team.', hints: ['head admin', 'headadmin', 'senior admin', 'staff manager', 'manager'] },
    { key: 'admin', label: 'Admin', why: 'Full staff rights.', hints: ['admin', 'administrator'] },
    { key: 'moderator', label: 'Moderator', why: 'Day to day moderation.', hints: ['moderator', 'mod', 'trial mod'] },
    { key: 'linked', label: 'Linked players', why: 'Given to anyone whose gamertag has been verified.', hints: ['linked', 'verified', 'member', 'players', 'clan'] }
  ];

  /* The fifteen log types the bot can write to. Keys are the bot's own. */
  var LOG_TYPES = [
    { key: 'server', label: 'Server log', why: 'Start-ups, restarts and the health check.', hints: ['server', 'startup'] },
    { key: 'console', label: 'Console log', why: 'What the bot prints while it runs.', hints: ['console', 'logs', 'botlog'] },
    { key: 'command', label: 'Command log', why: 'Every command used here, and by whom.', hints: ['command', 'commands', 'audit'] },
    { key: 'rcon', label: 'RCON usage', why: 'Every RCON call the bot makes.', hints: ['rcon'] },
    { key: 'linking', label: 'Linking log', why: 'Link requests, approvals and unlinks.', hints: ['link', 'linking', 'verify'] },
    { key: 'killfeed', label: 'Killfeed', why: 'Kills pulled from the Rust server.', hints: ['kill', 'killfeed', 'pvp'] },
    { key: 'eventfeed', label: 'EventFeed', why: 'Events and announcements from the server.', hints: ['event', 'eventfeed'] },
    { key: 'emoteKits', label: 'Emote Kits', why: 'Kits built, given and installed.', hints: ['kit', 'kits', 'emote'] },
    { key: 'admin', label: 'Admin log', why: 'Staff actions: bans, kicks, notes.', hints: ['admin', 'staff'] },
    { key: 'zorp', label: 'Zorp log', why: 'Zorp panel usage.', hints: ['zorp'] },
    { key: 'teleport', label: 'Teleport log', why: 'Teleports the bot performed.', hints: ['teleport', 'tp'] },
    { key: 'clan', label: 'Clan log', why: 'Clan records and changes.', hints: ['clan'] },
    { key: 'catchARide', label: 'Catch-A-Ride', why: 'Catch-A-Ride requests.', hints: ['ride', 'catch', 'car'] },
    { key: 'joinLeave', label: 'Join and leave', why: 'Who joined the Discord and who left.', hints: ['join', 'leave', 'welcome', 'goodbye'] },
    { key: 'errors', label: 'Error log', why: 'Things that went wrong, with the detail.', hints: ['error', 'errors', 'alerts'] }
  ];

  var CHANNEL_KINDS = ['text', 'announcement', 'forum'];

  var state = {
    guild: null,
    guilds: [],
    status: null,
    settings: null,
    token: '',
    draft: null,
    baseline: '',
    scanAt: 0,
    picker: null,
    scanning: false,
    testing: false,
    cancelTests: false,
    diag: null
  };

  /* ------------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function on(node, event, fn) { if (node) node.addEventListener(event, fn); return node; }
  function clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); }
  function say(node, message, kind) {
    if (!node) return;
    node.textContent = message;
    node.className = 'set-state' + (kind ? ' is-' + kind : '');
  }
  function chip(node, message, kind) {
    if (!node) return;
    var span = node.querySelector('span:last-child');
    if (span) span.textContent = message;
    node.className = 'set-chip' + (kind ? ' is-' + kind : '');
  }
  function clock(ts) {
    try { return new Date(ts).toLocaleTimeString(); } catch (error) { return 'just now'; }
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function toast(message, kind) {
    var box = $('toasts');
    if (!box) return;
    var node = mk('div', 'set-toast' + (kind ? ' is-' + kind : ''), message);
    box.appendChild(node);
    window.setTimeout(function () {
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, 4200);
  }

  /* ------------------------------------------------------------------ the API */
  function apiGet(path) {
    return fetch(path, { headers: { accept: 'application/json' } }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = JSON.parse(text); } catch (error) { body = { raw: text.slice(0, 300) }; }
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }
  function apiPost(path, payload) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = JSON.parse(text); } catch (error) { body = { raw: text.slice(0, 300) }; }
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }
  function settingsGet() {
    return fetch('/api/bot/settings', { headers: { 'x-settings-token': state.token, accept: 'application/json' } })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = JSON.parse(text); } catch (error) { body = { raw: text.slice(0, 300) }; }
          return { ok: res.ok, status: res.status, body: body };
        });
      });
  }
  function settingsPost(payload) {
    return fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-settings-token': state.token },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = JSON.parse(text); } catch (error) { body = { raw: text.slice(0, 300) }; }
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }
  function getToken() {
    try { return window.sessionStorage.getItem(KEYS.token) || ''; } catch (error) { return ''; }
  }
  function setToken(value) {
    state.token = value || '';
    try {
      if (value) window.sessionStorage.setItem(KEYS.token, value);
      else window.sessionStorage.removeItem(KEYS.token);
    } catch (error) { /* private mode */ }
  }

  /* -------------------------------------------------------------- preferences */
  function readPrefs() {
    try { return JSON.parse(window.localStorage.getItem(KEYS.prefs) || '{}') || {}; } catch (error) { return {}; }
  }
  function writePrefs(next) {
    try { window.localStorage.setItem(KEYS.prefs, JSON.stringify(next)); return true; } catch (error) { return false; }
  }
  function applyPrefs(prefs) {
    var root = document.documentElement;
    var theme = prefs.theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(KEYS.theme, theme); } catch (error) { /* private mode */ }
    root.setAttribute('data-reduce-motion', prefs.reduceMotion ? '1' : '0');
  }
  function countStored(key) {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (error) { return 0; }
  }
  function refreshCounts() {
    var kits = countStored(KEYS.kits);
    var palettes = countStored(KEYS.palettes);
    var prefs = Object.keys(readPrefs()).length;
    if ($('kitsCount')) $('kitsCount').textContent = plural(kits, 'kit', 'kits');
    if ($('palettesCount')) $('palettesCount').textContent = plural(palettes, 'palette', 'palettes');
    if ($('prefCount')) $('prefCount').textContent = plural(prefs, 'choice', 'choices');
  }
  function syncAppearance() {
    var prefs = readPrefs();
    var theme = prefs.theme === 'light' ? 'light' : 'dark';
    var buttons = document.querySelectorAll('#themeSeg button');
    Array.prototype.forEach.call(buttons, function (button) {
      button.setAttribute('aria-checked', button.getAttribute('data-theme-value') === theme ? 'true' : 'false');
    });
    if ($('setReduceMotion')) $('setReduceMotion').checked = prefs.reduceMotion === true;
    if ($('setSeasonal')) $('setSeasonal').checked = prefs.seasonal !== false;
  }
  function savePrefs(patch, note) {
    var next = readPrefs();
    Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
    var stored = writePrefs(next);
    applyPrefs(next);
    syncAppearance();
    refreshCounts();
    if ($('appearanceNote')) {
      $('appearanceNote').textContent = stored
        ? 'Saved in this browser at ' + clock(Date.now()) + '.'
        : 'This browser refused to save it (private browsing), so the choice lasts only for this visit.';
    }
    if (note) toast(note, 'good');
  }

  function initAppearance() {
    syncAppearance();
    var buttons = document.querySelectorAll('#themeSeg button');
    Array.prototype.forEach.call(buttons, function (button) {
      on(button, 'click', function () {
        savePrefs({ theme: button.getAttribute('data-theme-value') }, 'Theme set to ' + button.textContent.trim().toLowerCase() + '.');
      });
    });
    on($('setReduceMotion'), 'change', function () {
      savePrefs({ reduceMotion: $('setReduceMotion').checked }, $('setReduceMotion').checked ? 'Motion reduced.' : 'Motion restored.');
    });
    on($('setSeasonal'), 'change', function () {
      savePrefs({ seasonal: $('setSeasonal').checked }, $('setSeasonal').checked ? 'Seasonal touches on.' : 'Seasonal touches off.');
    });
  }

  function initStorage() {
    function wipe(key, label) {
      return function () {
        if (!window.confirm('Clear ' + label + ' from this browser? This cannot be undone.')) return;
        try { window.localStorage.removeItem(key); } catch (error) { /* private mode */ }
        refreshCounts();
        if ($('storageNote')) $('storageNote').textContent = 'Cleared ' + label + ' at ' + clock(Date.now()) + '.';
        toast('Cleared ' + label + '.', 'good');
      };
    }
    on($('clearKits'), 'click', wipe(KEYS.kits, 'saved kits'));
    on($('clearPalettes'), 'click', wipe(KEYS.palettes, 'saved palettes'));
    on($('clearPrefs'), 'click', wipe(KEYS.prefs, 'appearance choices'));
    refreshCounts();
  }

  /* ------------------------------------------------------------- picker dialog */
  function pickerItems() { return []; }
  function openPicker(options) {
    var dialog = $('picker');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var items = options.items || [];
    var filtered = items.slice();
    var active = 0;
    var manual = false;
    state.picker = { options: options, items: items };

    $('pickerTitle').textContent = options.title || 'Choose';
    $('pickerHint').textContent = options.hint || '';
    $('pickerSearch').value = '';
    $('pickerManualRow').hidden = true;
    $('pickerClear').hidden = options.allowEmpty === false;
    $('pickerClear').textContent = options.emptyLabel || 'Use nothing here';
    $('pickerManual').hidden = options.allowManual === false;

    function paint() {
      var list = $('pickerList');
      clear(list);
      var term = $('pickerSearch').value.trim().toLowerCase();
      filtered = items.filter(function (item) {
        if (!term) return true;
        return (item.label + ' ' + (item.meta || '') + ' ' + (item.group || '')).toLowerCase().indexOf(term) > -1;
      });
      if (active >= filtered.length) active = Math.max(0, filtered.length - 1);
      if (!filtered.length) {
        list.appendChild(mk('p', 'set-empty', items.length
          ? 'Nothing matches that.'
          : 'The bot has not reported a list for this. You can type an id by hand instead.'));
        return;
      }
      var lastGroup = null;
      filtered.forEach(function (item, index) {
        if (item.group && item.group !== lastGroup) {
          list.appendChild(mk('div', 'set-option__group', item.group));
          lastGroup = item.group;
        }
        var row = mk('button', 'set-option');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === active ? 'true' : 'false');
        if (index === active) row.className += ' is-active';
        if (item.current) row.className += ' is-current';
        var left = mk('div');
        left.appendChild(mk('span', null, item.label));
        if (item.sub) left.appendChild(mk('small', null, item.sub));
        row.appendChild(left);
        if (item.meta) row.appendChild(mk('span', 'set-option__meta', item.meta));
        on(row, 'click', function () { choose(item); });
        on(row, 'mouseenter', function () { active = index; });
        list.appendChild(row);
      });
    }
    function choose(item) {
      if (options.onPick) options.onPick(item ? item.id : null, item || null);
      dialog.close();
    }
    function activeOption() { return filtered[active]; }

    on($('pickerSearch'), 'input', paint);
    on($('pickerSearch'), 'keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(filtered.length - 1, active + 1); paint(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        var option = activeOption();
        if (option) choose(option);
      }
    });
    $('pickerClear').onclick = function () { choose(null); };
    $('pickerManual').onclick = function () {
      manual = true;
      $('pickerManualRow').hidden = false;
      $('pickerManualInput').focus();
    };
    $('pickerManualUse').onclick = function () {
      var value = $('pickerManualInput').value.trim();
      if (!value) { $('pickerManualInput').focus(); return; }
      if (options.onPick) options.onPick(value, { id: value, label: value, manual: true });
      dialog.close();
    };
    dialog.onclose = function () { state.picker = null; };

    paint();
    dialog.showModal();
    window.setTimeout(function () { $('pickerSearch').focus(); }, 20);
  }
  function openRolePicker(slot, current) {
    var roles = liveRoles();
    openPicker({
      title: 'Choose the ' + slot.label + ' role',
      hint: roles.length
        ? 'These are the roles in the server the bot is in, highest first. ' + slot.why
        : 'The bot has not reported its role list right now, so you can type an id instead. ' + slot.why,
      items: roles.map(function (role) {
        return {
          id: role.id,
          label: '@' + role.name,
          sub: role.id === current ? 'currently set' : null,
          meta: 'position ' + role.position,
          current: role.id === current
        };
      }),
      allowManual: true,
      onPick: function (id, item) {
        state.draft.staffRoles[slot.key] = id || '';
        markDirty();
        renderRoles();
        if (id) toast(slot.label + ' set to ' + (item && item.manual ? 'the id you typed' : '@' + item.label.replace(/^@/, '')) + '.', 'good');
        else toast(slot.label + ' cleared.', 'good');
      }
    });
  }
  function openChannelPicker(log, current) {
    var channels = liveChannels();
    var byCategory = {};
    channels.forEach(function (channel) {
      var group = channel.category ? '#' + channel.category : 'No category';
      byCategory[group] = byCategory[group] || [];
      byCategory[group].push(channel);
    });
    var items = [];
    Object.keys(byCategory).forEach(function (group) {
      byCategory[group].forEach(function (channel) {
        items.push({
          id: channel.id,
          label: '#' + channel.name,
          group: group,
          sub: channel.canSend === false ? 'the bot cannot post here' : (channel.kind === 'text' ? null : channel.kind),
          meta: channel.canSend === false ? 'no permission' : (channel.id === current ? 'currently set' : null),
          current: channel.id === current
        });
      });
    });
    openPicker({
      title: 'Choose the ' + log.label.toLowerCase() + ' channel',
      hint: channels.length
        ? 'Text, announcement and forum channels the bot can see, grouped by category. ' + log.why
        : 'This bot build has not reported its channel list, so type an id instead (Discord: Developer Mode, then Copy Channel ID). ' + log.why,
      items: items,
      emptyLabel: 'Switch this log off',
      allowManual: true,
      onPick: function (id, item) {
        state.draft.logChannels[log.key] = id || '';
        markDirty();
        renderLogs();
        if (id) toast(log.label + ' now writes to ' + (item && item.manual ? 'the id you typed' : '#' + item.label.replace(/^#/, '')) + '.', 'good');
        else toast(log.label + ' switched off.', 'good');
      }
    });
  }

  function liveRoles() {
    return (state.guild && Array.isArray(state.guild.roles)) ? state.guild.roles : [];
  }
  function liveChannels() {
    var channels = (state.guild && Array.isArray(state.guild.channels)) ? state.guild.channels : [];
    return channels.filter(function (channel) { return CHANNEL_KINDS.indexOf(channel.kind) > -1; });
  }
  function roleById(id) {
    var roles = liveRoles();
    for (var i = 0; i < roles.length; i++) if (String(roles[i].id) === String(id)) return roles[i];
    return null;
  }
  function channelById(id) {
    var channels = (state.guild && Array.isArray(state.guild.channels)) ? state.guild.channels : [];
    for (var i = 0; i < channels.length; i++) if (String(channels[i].id) === String(id)) return channels[i];
    return null;
  }

  /* ----------------------------------------------------------------- the draft */
  function emptyDraft() {
    return { staffRoles: {}, logChannels: {}, servers: [], kits: { listCommand: '', giveCommand: '', locked: false } };
  }
  function draftFromSettings(body) {
    var draft = emptyDraft();
    var roles = (body && body.staffRoles) || {};
    ROLE_SLOTS.forEach(function (slot) { draft.staffRoles[slot.key] = roles[slot.key] ? String(roles[slot.key]) : ''; });
    var channels = (body && body.logChannels) || {};
    LOG_TYPES.forEach(function (type) { draft.logChannels[type.key] = channels[type.key] ? String(channels[type.key]) : ''; });
    draft.servers = ((body && body.servers) || []).map(function (row) {
      return {
        id: row.id || null,
        name: row.name || 'server',
        host: row.host || '',
        port: row.port === 0 || row.port ? String(row.port) : '',
        hasPassword: row.hasPassword === true,
        password: '',
        remove: false,
        result: null
      };
    });
    var kits = (body && body.kits) || {};
    draft.kits = {
      listCommand: kits.listCommand || '',
      giveCommand: kits.giveCommand || '',
      locked: kits.locked === true
    };
    return draft;
  }
  function collectPayload() {
    var roles = {};
    ROLE_SLOTS.forEach(function (slot) { roles[slot.key] = String(state.draft.staffRoles[slot.key] || '').trim(); });
    var channels = {};
    LOG_TYPES.forEach(function (type) { channels[type.key] = String(state.draft.logChannels[type.key] || '').trim(); });
    var servers = state.draft.servers.map(function (row) {
      return {
        id: row.id || null,
        name: String(row.name || 'server').trim(),
        host: String(row.host || '').trim(),
        port: String(row.port || '').trim(),
        password: row.password || '',
        remove: row.remove === true
      };
    });
    return {
      staffRoles: roles,
      logChannels: channels,
      servers: servers,
      kits: {
        listCommand: String(state.draft.kits.listCommand || '').trim(),
        giveCommand: String(state.draft.kits.giveCommand || '').trim(),
        locked: state.draft.kits.locked === true
      }
    };
  }
  function isDirty() {
    if (state.baseline === '') return false;
    return JSON.stringify(collectPayload()) !== state.baseline;
  }
  function markDirty() {
    var dirty = isDirty();
    var badge = $('dirtyBadge');
    if (badge) {
      badge.hidden = !dirty;
      var span = badge.querySelector('span');
      if (span) span.textContent = dirty ? 'unsaved changes' : 'all saved';
    }
    if ($('saveTop')) $('saveTop').disabled = !dirty || !state.token;
    if ($('discardTop')) $('discardTop').disabled = !dirty;
    renderChecklist();
    renderBar();
  }

  /* ------------------------------------------------------------------- the bar */
  function gateState() {
    /* Before the token is entered there is no draft to judge, and the bar says so rather
       than showing a checklist built from nothing. */
    if (!state.draft) {
      return { locked: true, rolesSaved: 0, servers: 0, reachable: 0, logs: 0, done: 0, total: 2 };
    }
    var rolesSaved = ROLE_SLOTS.filter(function (slot) { return String(state.draft.staffRoles[slot.key] || '').trim(); }).length;
    var live = state.draft.servers.filter(function (row) { return row.remove !== true; });
    var reachable = live.filter(function (row) { return String(row.host || '').trim() && String(row.port || '').trim() && (row.hasPassword || String(row.password || '').trim()); });
    var logs = LOG_TYPES.filter(function (type) { return String(state.draft.logChannels[type.key] || '').trim(); }).length;
    return {
      rolesSaved: rolesSaved,
      servers: live.length,
      reachable: reachable.length,
      logs: logs,
      done: (rolesSaved > 0 ? 1 : 0) + (reachable > 0 ? 1 : 0),
      total: 2
    };
  }
  function renderBar() {
    if ($('guildName')) {
      var guild = state.guild;
      $('guildName').textContent = guild ? guild.name : 'No server reported yet';
      if ($('guildMeta')) {
        $('guildMeta').textContent = guild
          ? plural(guild.memberCount || 0, 'member', 'members') + ' · ' + plural(liveRoles().length, 'role', 'roles') + ' · ' + plural(liveChannels().length, 'text channel', 'text channels')
          : (state.guilds.length ? 'the bot is in ' + plural(state.guilds.length, 'server', 'servers') + ' but has not reported this one' : 'asking this site for the server the bot is set up in');
      }
    }
    if ($('guildIcon') && state.guild && state.guild.id && state.guild.icon) {
      $('guildIcon').src = 'https://cdn.discordapp.com/icons/' + state.guild.id + '/' + state.guild.icon + '.png?size=64';
    }
    var status = state.status || {};
    chip($('chipGateway'), 'gateway: ' + (status.gateway || (status.online ? 'online' : 'unknown')),
      status.gateway === 'online' ? 'ok' : (status.online === false ? 'bad' : 'warn'));
    chip($('chipScan'), 'roles: ' + (liveRoles().length || '—'), liveRoles().length ? 'ok' : 'warn');
    chip($('chipChannels'), liveChannels().length
      ? 'channels: ' + liveChannels().length
      : (liveRoles().length ? 'channels: not reported' : 'channels: —'), liveChannels().length ? 'ok' : 'warn');
    if ($('chipChannels')) {
      $('chipChannels').title = liveChannels().length
        ? 'Channels the bot can see, grouped by category in the picker'
        : (liveRoles().length
          ? 'This bot build reports roles but not channels yet. Redeploy the bot on its host, then rescan; until then a channel id can be typed by hand.'
          : 'The bot has not reported its server yet.');
    }
    chip($('chipToken'), state.token ? 'token: held in this tab' : 'token: not entered', state.token ? 'ok' : 'warn');
    chip($('accessChip'), state.settings ? 'settings readable' : (state.token ? 'token set, not loaded' : 'read-only until unlocked'),
      state.settings ? 'ok' : (state.token ? 'warn' : ''));
    var gate = gateState();
    if ($('progressBar')) $('progressBar').style.width = Math.round((gate.done / gate.total) * 100) + '%';
    if ($('progressText')) {
      $('progressText').textContent = gate.locked
        ? 'setup: unlock to check'
        : 'setup: ' + gate.done + ' of ' + gate.total + (gate.logs ? ' · ' + gate.logs + ' logs' : '');
    }
  }

  function renderChecklist() {
    var box = $('checkItems');
    if (!box || !state.draft) return;
    var gate = gateState();
    clear(box);
    var items = [
      {
        title: 'Staff roles saved',
        done: gate.rolesSaved > 0,
        required: true,
        body: gate.rolesSaved
          ? plural(gate.rolesSaved, 'role slot', 'role slots') + ' set. The owner and anyone with Administrator can also run staff commands.'
          : 'Pick at least one role. Without it the bot refuses every command except /setup, /ping and /help.'
      },
      {
        title: 'A Rust server with a password',
        done: gate.reachable > 0,
        required: true,
        body: gate.reachable
          ? plural(gate.reachable, 'connection', 'connections') + ' ready to be tested. RCON only ever runs from the bot.'
          : (gate.servers
            ? plural(gate.servers, 'server is', 'servers are') + ' saved but none has an address, port and password together yet.'
            : 'Add the address, RCON port and password from server.cfg. Test it here before you save.')
      },
      {
        title: 'Logs writing somewhere',
        done: gate.logs > 0,
        required: false,
        body: gate.logs
          ? plural(gate.logs, 'log type', 'log types') + ' has a channel. Recommended, not required by the gate.'
          : 'Optional, but a log channel makes everything the bot does visible instead of silent.'
      }
    ];
    items.forEach(function (item) {
      var card = mk('div', 'set-check ' + (item.done ? 'is-done' : 'is-todo'));
      var head = mk('h3');
      head.appendChild(mk('span', 'set-tick', item.done ? '✓' : '•'));
      head.appendChild(mk('span', null, item.title));
      if (!item.required) head.appendChild(mk('span', 'set-badge', 'optional'));
      card.appendChild(head);
      card.appendChild(mk('p', null, item.body));
      box.appendChild(card);
    });
  }

  /* ------------------------------------------------------------------- roles */
  function renderRoles() {
    var box = $('roleSlots');
    if (!box || !state.draft) return;
    clear(box);
    ROLE_SLOTS.forEach(function (slot) {
      var id = String(state.draft.staffRoles[slot.key] || '');
      var role = id ? roleById(id) : null;
      var card = mk('div', 'set-slot');
      var top = mk('div', 'set-slot__top');
      top.appendChild(mk('span', 'set-slot__name', slot.label));
      top.appendChild(mk('span', 'set-chip' + (role ? ' is-ok' : (id ? ' is-warn' : '')), role ? 'in this server' : (id ? 'id not found here' : 'not set')));
      card.appendChild(top);
      var pick = mk('button', 'set-slot__pick' + (id ? ' has-value' : ''));
      pick.type = 'button';
      var value = mk('span', 'set-slot__value', id ? (role ? '@' + role.name : id) : 'Choose a role');
      pick.appendChild(value);
      pick.appendChild(mk('span', 'set-slot__id', id ? id : 'click to pick'));
      on(pick, 'click', function () { openRolePicker(slot, id); });
      card.appendChild(pick);
      card.appendChild(mk('p', 'set-slot__why', slot.why + (id && !role && liveRoles().length
        ? ' This id is saved but no role with it exists in the server the bot is in — either it was deleted or the bot is looking at a different server.'
        : '')));
      if (id) {
        var clearBtn = mk('button', 'set-btn is-small', 'Clear');
        clearBtn.type = 'button';
        on(clearBtn, 'click', function () {
          state.draft.staffRoles[slot.key] = '';
          markDirty();
          renderRoles();
          toast(slot.label + ' cleared.', 'good');
        });
        card.appendChild(clearBtn);
      }
      box.appendChild(card);
    });
  }

  function suggestRoles() {
    var roles = liveRoles();
    if (!roles.length) { say($('roleState'), 'The bot has not reported its roles yet, so there is nothing to match against.', 'bad'); return; }
    var taken = {};
    var set = 0, ambiguous = [], none = [];
    ROLE_SLOTS.forEach(function (slot) {
      if (String(state.draft.staffRoles[slot.key] || '').trim()) {
        taken[state.draft.staffRoles[slot.key]] = true;
        return;
      }
      var lower = slot.hints.map(function (hint) { return hint.toLowerCase(); });
      /* A role already promised to another slot is not a candidate here, so a loose name match
         cannot quietly hand the same role to two slots. */
      var candidates = roles.filter(function (role) { return !taken[role.id]; });
      var exact = candidates.filter(function (role) { return lower.indexOf(String(role.name).toLowerCase()) > -1; });
      if (!exact.length) {
        var loose = candidates.filter(function (role) {
          var name = String(role.name).toLowerCase();
          return lower.some(function (hint) { return name.indexOf(hint) > -1; });
        });
        if (loose.length === 1) exact = loose;
        else if (loose.length > 1) { ambiguous.push(slot.label + ' (' + loose.length + ' roles match)'); return; }
        else { none.push(slot.label); return; }
      }
      if (exact.length > 1) { ambiguous.push(slot.label + ' (' + exact.length + ' roles match)'); return; }
      state.draft.staffRoles[slot.key] = exact[0].id;
      taken[exact[0].id] = true;
      set += 1;
    });
    markDirty();
    renderRoles();
    var parts = [];
    if (set) parts.push('matched ' + plural(set, 'slot', 'slots') + ' by name');
    if (none.length) parts.push('no match for ' + none.join(', '));
    if (ambiguous.length) parts.push('left alone: ' + ambiguous.join(', '));
    say($('roleState'), parts.length ? parts.join('; ') + '. Check the names before saving.' : 'Nothing to suggest.', set ? 'good' : '');
    if (set) toast('Suggested ' + plural(set, 'role', 'roles') + ' from names — check them, then save.', 'good');
  }

  function clearRoles() {
    ROLE_SLOTS.forEach(function (slot) { state.draft.staffRoles[slot.key] = ''; });
    markDirty();
    renderRoles();
    say($('roleState'), 'All role slots cleared. The bot will refuse commands until at least one is saved.', '');
  }

  /* -------------------------------------------------------------------- logs */
  function renderLogs() {
    var box = $('logRows');
    if (!box || !state.draft) return;
    clear(box);
    LOG_TYPES.forEach(function (type) {
      var id = String(state.draft.logChannels[type.key] || '');
      var channel = id ? channelById(id) : null;
      var row = mk('div', 'set-log');
      var label = mk('div', 'set-log__label');
      label.appendChild(mk('strong', null, type.label));
      label.appendChild(mk('span', null, type.why));
      row.appendChild(label);
      var pick = mk('button', 'set-slot__pick set-log__pick' + (id ? ' has-value' : ''));
      pick.type = 'button';
      pick.appendChild(mk('span', 'set-slot__value', id ? (channel ? '#' + channel.name : id) : 'Off'));
      pick.appendChild(mk('span', 'set-slot__id', channel && channel.category ? '#' + channel.category : (id ? 'saved id' : 'click to pick')));
      on(pick, 'click', function () { openChannelPicker(type, id); });
      row.appendChild(pick);
      var note = '';
      if (id && !channel && liveChannels().length) note = 'not in this server';
      else if (channel && channel.canSend === false) note = 'bot cannot post here';
      else if (channel) note = 'ready';
      if (note) row.appendChild(mk('span', 'set-chip' + (note === 'ready' ? ' is-ok' : ' is-warn'), note));
      if (id) {
        var off = mk('button', 'set-btn is-small', 'Off');
        off.type = 'button';
        on(off, 'click', function () {
          state.draft.logChannels[type.key] = '';
          markDirty();
          renderLogs();
          toast(type.label + ' switched off.', 'good');
        });
        row.appendChild(off);
      }
      box.appendChild(row);
    });
  }

  function suggestLogs() {
    var channels = liveChannels().filter(function (channel) { return channel.canSend !== false; });
    if (!channels.length) { say($('logState'), 'The bot has not reported any channel it can post in, so there is nothing to match.', 'bad'); return; }
    /* Every counter lives here: a var inside the callback below would be scoped to that
       call and reset for each log type. */
    var span = 0, skipped = 0, ambiguous = [], noMatch = 0;
    LOG_TYPES.forEach(function (type) {
      if (String(state.draft.logChannels[type.key] || '').trim()) { skipped += 1; return; }
      var hints = type.hints.map(function (hint) { return hint.toLowerCase(); });
      var best = null, bestScore = 0, ties = [];
      channels.forEach(function (channel) {
        var name = String(channel.name).toLowerCase();
        var base = 0;
        hints.forEach(function (hint) {
          if (name === hint) base = Math.max(base, 4);
          else if (name === hint + '-log' || name === hint + '-logs' || name === 'log-' + hint || name === hint + 's') base = Math.max(base, 3);
          else if (name.indexOf(hint) > -1) base = Math.max(base, 2);
        });
        /* A channel whose name has nothing to do with this log type is not a candidate at
           all, so it cannot be counted as a rival. */
        if (!base) return;
        var score = base + (channel.kind === 'text' ? 0.5 : 0);
        if (score > bestScore) { bestScore = score; best = channel; ties = [channel]; }
        else if (score === bestScore) ties.push(channel);
      });
      if (best && ties.length === 1) {
        state.draft.logChannels[type.key] = best.id;
        span += 1;
      } else if (ties.length > 1) {
        ambiguous.push(type.label + ' (' + ties.length + ' channels match)');
      } else {
        noMatch += 1;
      }
    });
    /* The rows are redrawn before the summary, so what the sentence claims and what the list
       shows can never disagree. */
    markDirty();
    renderLogs();
    if (span) {
      if ($('logState')) say($('logState'), 'Matched ' + plural(span, 'log type', 'log types') + ' to a channel by name'
        + (skipped ? '; left alone ' + plural(skipped, 'already-set type', 'already-set types') : '')
        + (noMatch ? '; no name match for ' + plural(noMatch, 'type', 'types') : '')
        + (ambiguous.length ? '; unsure about ' + ambiguous.join(', ') : '') + '. Check before saving.', 'good');
      toast('Matched ' + plural(span, 'log', 'logs') + ' by channel name.', 'good');
    } else {
      say($('logState'), ambiguous.length
        ? 'Nothing matched clearly: ' + ambiguous.join(', ') + '. Pick those by hand.'
        : 'No channel name matched any log type. Pick them by hand.', '');
    }
  }
  function clearLogs() {
    LOG_TYPES.forEach(function (type) { state.draft.logChannels[type.key] = ''; });
    markDirty();
    renderLogs();
    say($('logState'), 'Every log type switched off. The bot keeps working; it just reports nothing.', '');
  }

  /* ---------------------------------------------------------------- servers */
  function hostLooksReal(host) {
    var value = String(host || '').trim();
    if (!value) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
      var parts = value.split('.').map(Number);
      return parts.every(function (n) { return n >= 0 && n <= 255; });
    }
    return /^[a-z0-9][a-z0-9.-]*$/i.test(value);
  }
  function portLooksReal(port) {
    var n = Number(String(port || '').trim());
    return Number.isFinite(n) && n >= 1 && n <= 65535;
  }
  function savedServers() {
    /* Before the token is entered there is no draft at all, and a check that asks about
       saved servers has to answer "none known" rather than throwing. */
    if (!state.draft || !Array.isArray(state.draft.servers)) return [];
    return state.draft.servers.filter(function (row) { return row.remove !== true; });
  }
  function renderServers() {
    var box = $('serverCards');
    if (!box || !state.draft) return;
    clear(box);
    if (!state.draft.servers.length) {
      box.appendChild(mk('p', 'set-empty', 'No Rust server saved yet. Add one below — the bot will only run once it has one.'));
      return;
    }
    state.draft.servers.forEach(function (row, index) {
      var card = mk('div', 'set-server');
      if (row.remove) card.style.opacity = '.6';
      var head = mk('header');
      var left = mk('div');
      left.appendChild(mk('strong', null, row.name || 'server'));
      var where = mk('code', null, (row.host || 'no address') + (row.port ? ':' + row.port : ''));
      left.appendChild(document.createTextNode(' '));
      left.appendChild(where);
      head.appendChild(left);
      var chips = mk('div', 'set-bar__chips');
      chips.appendChild(mk('span', 'set-chip' + (row.hasPassword ? ' is-ok' : ' is-warn'), row.hasPassword ? 'password saved' : 'no password saved'));
      if (row.id) chips.appendChild(mk('span', 'set-chip', 'id ' + String(row.id).slice(0, 12)));
      if (hostLooksReal(row.host) && portLooksReal(row.port)) chips.appendChild(mk('span', 'set-chip is-ok', 'address looks valid'));
      else chips.appendChild(mk('span', 'set-chip is-warn', 'address or port needs fixing'));
      if (row.remove) chips.appendChild(mk('span', 'set-chip is-bad', 'will be removed on save'));
      head.appendChild(chips);
      card.appendChild(head);

      var grid = mk('div', 'set-grid');
      [['Name', 'name', 'text'], ['Address', 'host', 'text'], ['RCON port', 'port', 'text'], ['RCON password', 'password', 'password']].forEach(function (spec) {
        var label = mk('label', null, spec[0]);
        var input = document.createElement('input');
        input.type = spec[2];
        input.value = spec[1] === 'password' ? '' : String(row[spec[1]] || '');
        if (spec[1] === 'password') input.placeholder = row.hasPassword ? 'blank keeps the saved one' : 'from server.cfg';
        on(input, 'input', function () {
          if (spec[1] === 'password') row.password = input.value;
          else row[spec[1]] = input.value;
          markDirty();
        });
        label.appendChild(input);
        grid.appendChild(label);
      });
      card.appendChild(grid);

      var actions = mk('div', 'set-actions');
      var test = mk('button', 'set-btn is-small', 'Test connection');
      test.type = 'button';
      on(test, 'click', function () { testServer(row, test, result); });
      actions.appendChild(test);
      var toggle = mk('button', 'set-btn is-small' + (row.remove ? '' : ' is-danger'), row.remove ? 'Keep this server' : 'Remove');
      toggle.type = 'button';
      on(toggle, 'click', function () {
        row.remove = !row.remove;
        markDirty();
        renderServers();
      });
      actions.appendChild(toggle);
      actions.appendChild(mk('span', 'set-state', row.id ? 'tested by id: the password stays on the bot' : 'not saved yet: this test sends the password once, and stores it nowhere'));
      card.appendChild(actions);

      var result = mk('div', 'set-server__result');
      result.hidden = true;
      if (row.result) paintResult(result, row.result);
      card.appendChild(result);
      box.appendChild(card);
    });
  }
  function paintResult(node, answer) {
    node.hidden = false;
    node.className = 'set-server__result ' + (answer && answer.ok ? 'is-ok' : 'is-bad');
    clear(node);
    if (!answer) { node.appendChild(mk('span', null, 'No answer yet.')); return; }
    var headline = answer.ok
      ? 'Answered' + (answer.ms !== undefined ? ' in ' + answer.ms + 'ms' : '') + ' — RCON is working.'
      : 'Failed: ' + (answer.reason || 'unknown') + (answer.ms !== undefined ? ' after ' + answer.ms + 'ms' : '');
    node.appendChild(mk('strong', null, headline));
    if (answer.detail) node.appendChild(mk('p', null, answer.detail));
    if (answer.answer) node.appendChild(mk('p', null, String(answer.answer).slice(0, 400)));
    var extra = {};
    Object.keys(answer).forEach(function (key) {
      if (['ok', 'ms', 'reason', 'detail', 'answer'].indexOf(key) === -1) extra[key] = answer[key];
    });
    if (Object.keys(extra).length) node.appendChild(mk('p', null, 'Also returned: ' + JSON.stringify(extra).slice(0, 300)));
  }
  function testServer(row, button, resultNode) {
    var payload;
    if (row.id) payload = { id: row.id };
    else {
      if (!hostLooksReal(row.host) || !portLooksReal(row.port) || !String(row.password || '').trim()) {
        say($('serverState'), 'A test needs a public address, a port between 1 and 65535, and the RCON password.', 'bad');
        return;
      }
      payload = { host: String(row.host).trim(), port: Number(row.port), password: row.password };
    }
    button.disabled = true;
    var was = button.textContent;
    button.textContent = 'Testing…';
    if (resultNode) { resultNode.hidden = false; resultNode.className = 'set-server__result'; clear(resultNode); resultNode.appendChild(mk('span', null, 'Asking the bot to connect…')); }
    apiPost('/api/rcon/test', payload).then(function (out) {
      button.disabled = false;
      button.textContent = was;
      var answer;
      if (out.status === 404 || out.status === 405) {
        answer = { ok: false, reason: 'no-route', detail: 'This bot build does not expose the RCON test route. Redeploy the bot, or test with /setup run in Discord.' };
      } else if (out.status === 429) {
        answer = { ok: false, reason: 'rate-limited', detail: 'The bot allows six checks a minute. Wait a moment and try again.' };
      } else if (out.body && typeof out.body === 'object' && 'ok' in out.body) {
        answer = out.body;
      } else {
        answer = { ok: false, reason: 'unexpected-answer', detail: 'HTTP ' + out.status + ': ' + JSON.stringify(out.body).slice(0, 200) };
      }
      row.result = answer;
      if (resultNode) paintResult(resultNode, answer);
      toast(answer.ok ? 'RCON answered' + (answer.ms !== undefined ? ' in ' + answer.ms + 'ms' : '') + '.' : 'RCON test failed: ' + (answer.reason || 'unknown') + '.', answer.ok ? 'good' : 'bad');
    }).catch(function (error) {
      button.disabled = false;
      button.textContent = was;
      var answer = { ok: false, reason: 'request-failed', detail: String(error && error.message ? error.message : error) };
      row.result = answer;
      if (resultNode) paintResult(resultNode, answer);
    });
  }
  function testAll() {
    var rows = savedServers().filter(function (row) { return row.id; });
    var button = $('testAll');
    if (state.testing) { state.cancelTests = true; if (button) button.textContent = 'Stopping…'; return; }
    if (!rows.length) { toast('Nothing saved to test yet. Add a server and save it first.', 'bad'); return; }
    state.testing = true;
    state.cancelTests = false;
    if (button) button.textContent = 'Stop testing';
    var index = 0;
    var wait = 0;
    function step() {
      if (state.cancelTests || index >= rows.length) {
        state.testing = false;
        if (button) button.textContent = 'Test every saved server';
        toast(state.cancelTests ? 'Stopped after ' + index + ' of ' + rows.length + '.' : 'Tested ' + plural(index, 'server', 'servers') + '.', 'good');
        return;
      }
      var row = rows[index];
      var at = state.draft.servers.indexOf(row);
      var card = $('serverCards').children[at];
      var resultNode = card ? card.querySelector('.set-server__result') : null;
      say($('serverState'), 'Testing ' + (row.name || row.host) + ' (' + (index + 1) + ' of ' + rows.length + ')…');
      apiPost('/api/rcon/test', { id: row.id }).then(function (out) {
        var answer = (out.body && typeof out.body === 'object') ? out.body : { ok: false, reason: 'http-' + out.status };
        row.result = answer;
        if (resultNode) paintResult(resultNode, answer);
        index += 1;
        /* The bot allows six checks a minute, so the pace is deliberate. */
        window.setTimeout(step, 10500);
      }).catch(function (error) {
        row.result = { ok: false, reason: 'request-failed', detail: String(error && error.message ? error.message : error) };
        if (resultNode) paintResult(resultNode, row.result);
        index += 1;
        window.setTimeout(step, 10500);
      });
    }
    step();
  }

  /* -------------------------------------------------------------------- links */
  function renderLinks() {
    var box = $('linkRoster');
    var pendingBox = $('pendingRoster');
    if (!box) return;
    var links = (state.settings && Array.isArray(state.settings.links)) ? state.settings.links : [];
    var pending = (state.settings && Array.isArray(state.settings.pending)) ? state.settings.pending : [];
    var term = ($('linkSearch') && $('linkSearch').value || '').trim().toLowerCase();
    clear(box);
    if ($('linkBadge')) $('linkBadge').textContent = links.length + ' linked · ' + pending.length + ' waiting';
    if ($('linkState')) $('linkState').textContent = term ? 'filtered' : (links.length ? 'showing all ' + plural(links.length, 'link', 'links') : 'none yet');
    var shown = links.filter(function (link) {
      if (!term) return true;
      return (String(link.gamertag || '') + ' ' + String(link.userId || '')).toLowerCase().indexOf(term) > -1;
    });
    if (!links.length) {
      box.appendChild(mk('p', 'set-empty', 'No links on record. Players ask to link with the panel in Discord (/user linkpanel), and staff approve with /user forcelink.'));
    } else if (!shown.length) {
      box.appendChild(mk('p', 'set-empty', 'No link matches "' + term + '".'));
    } else {
      shown.slice(0, 200).forEach(function (link) {
        var row = mk('div');
        var left = mk('span', null, String(link.gamertag || 'unknown gamertag'));
        if (link.at) {
          var when = '';
          try { when = new Date(link.at).toLocaleDateString(); } catch (error) { when = ''; }
          if (when) left.appendChild(mk('small', null, ' linked ' + when + (link.by ? ' by ' + String(link.by).slice(0, 18) : '')));
        }
        row.appendChild(left);
        row.appendChild(mk('code', null, String(link.userId || '')));
        box.appendChild(row);
      });
      if (shown.length > 200) box.appendChild(mk('p', 'set-empty', 'Showing the first 200 of ' + shown.length + '.'));
    }
    if (pendingBox) {
      clear(pendingBox);
      pending.slice(0, 100).forEach(function (item) {
        var row = mk('div');
        row.appendChild(mk('span', null, String(item.gamertag || 'unknown gamertag')));
        row.appendChild(mk('code', null, String(item.userId || '')));
        pendingBox.appendChild(row);
      });
      if (!pending.length) pendingBox.appendChild(mk('p', 'set-empty', 'Nobody is waiting.'));
      if ($('pendingCard')) $('pendingCard').hidden = false;
    }
  }

  /* -------------------------------------------------------------- diagnostics */
  function diagRow(box, name, kind, value, ms) {
    var row = mk('div', 'set-diag__row is-' + kind);
    row.appendChild(mk('span', 'set-diag__name', name));
    row.appendChild(mk('span', 'set-diag__value', value));
    if (ms !== undefined) row.appendChild(mk('span', 'set-diag__ms', ms + 'ms'));
    box.appendChild(row);
  }
  function runDiagnostics() {
    var box = $('diagOut');
    if (!box) return;
    clear(box);
    if ($('diagState')) $('diagState').textContent = 'running…';
    var report = [];
    var started = Date.now();
    function record(name, kind, value, ms) {
      diagRow(box, name, kind, value, ms);
      report.push(name + ': ' + value);
    }
    function done() {
      state.diag = report.join('\n');
      if ($('diagState')) $('diagState').textContent = 'ran ' + report.length + ' checks in ' + (Date.now() - started) + 'ms';
    }
    var chain = Promise.resolve();

    chain = chain.then(function () {
      var t = Date.now();
      return apiGet('/api/guild').then(function (out) {
        if (out.status === 200 && out.body && out.body.guild) {
          record('This site can reach the bot', 'ok', 'guild "' + out.body.guild.name + '" with ' + ((out.body.guild.roles || []).length) + ' roles and ' + ((out.body.guild.channels || []).length) + ' channels', Date.now() - t);
        } else if (out.status === 200 && out.body && out.body.ready === false) {
          record('This site can reach the bot', 'warn', 'the bot answered but is not ready: ' + (out.body.reason || 'unknown'), Date.now() - t);
        } else if (out.status === 503 && out.body && out.body.reason === 'not_connected') {
          record('This site can reach the bot', 'bad', 'no bot API is connected to this site (BOT_API_ORIGIN)', Date.now() - t);
        } else {
          record('This site can reach the bot', 'bad', 'HTTP ' + out.status + ' ' + JSON.stringify(out.body).slice(0, 120), Date.now() - t);
        }
      });
    });
    chain = chain.then(function () {
      var t = Date.now();
      return apiGet('/api/status').then(function (out) {
        var body = out.body || {};
        record('Bot status', out.status === 200 && body.online !== false ? 'ok' : 'bad',
          'gateway ' + (body.gateway || 'unknown') + ', ' + (body.guilds !== undefined ? body.guilds + ' server(s)' : 'no server count') + ', tag ' + (body.tag || 'unknown'),
          Date.now() - t);
      }).catch(function (error) { record('Bot status', 'bad', 'request failed: ' + error.message, Date.now() - t); });
    });
    chain = chain.then(function () {
      var t = Date.now();
      return apiGet('/api/guilds').then(function (out) {
        var guilds = (out.body && out.body.guilds) || [];
        record('Servers the bot is in', guilds.length ? 'ok' : 'warn',
          guilds.length ? guilds.map(function (g) { return g.name; }).join(', ') : 'none reported: the bot is not in any server', Date.now() - t);
      }).catch(function (error) { record('Servers the bot is in', 'bad', 'request failed: ' + error.message, Date.now() - t); });
    });
    chain = chain.then(function () {
      if (!state.token) { record('Saved settings', 'warn', 'not read: no settings token in this tab'); return null; }
      var t = Date.now();
      return settingsGet().then(function (out) {
        if (out.status === 200 && out.body && out.body.ok) {
          state.settings = out.body;
          record('Saved settings', 'ok',
            'read back: ' + Object.keys(out.body.staffRoles || {}).length + ' role slot(s), '
            + Object.keys(out.body.logChannels || {}).length + ' log channel(s), ' + ((out.body.servers || []).length) + ' server(s), '
            + ((out.body.links || []).length) + ' link(s)', Date.now() - t);
        } else if (out.body && out.body.reason === 'no-token') {
          record('Saved settings', 'bad', 'this website has no BOT_SETTINGS_TOKEN set (HTTP 503)', Date.now() - t);
        } else if (out.body && out.body.reason === 'bad-token') {
          record('Saved settings', 'bad', 'the token in this tab does not match the website’s (HTTP 403)', Date.now() - t);
        } else {
          record('Saved settings', 'bad', 'HTTP ' + out.status + ' ' + JSON.stringify(out.body).slice(0, 120), Date.now() - t);
        }
      }).catch(function (error) { record('Saved settings', 'bad', 'request failed: ' + error.message, Date.now() - t); });
    });
    chain = chain.then(function () {
      var survives = false;
      try {
        window.localStorage.setItem('spinback-diag', '1');
        survives = window.localStorage.getItem('spinback-diag') === '1';
        window.localStorage.removeItem('spinback-diag');
      } catch (error) { survives = false; }
      record('This browser can save preferences', survives ? 'ok' : 'bad',
        survives ? 'local storage works, so theme and storage choices persist' : 'local storage is blocked, so choices last one visit only');
    });
    chain = chain.then(function () {
      var app = document.documentElement.getAttribute('data-theme') || 'unset';
      record('Theme preference', 'ok', 'data-theme is ' + app + ', stored key ' + (function () {
        try { return window.localStorage.getItem(KEYS.theme) || 'not set'; } catch (error) { return 'unreadable'; }
      })());
    });
    chain = chain.then(function () {
      record('Page scripts', (window.RWApi && window.SPINBACK_BRAND) ? 'ok' : 'warn',
        'config: ' + (window.SPINBACK_BRAND ? window.SPINBACK_BRAND.name : 'missing')
        + '; API base ' + (window.SPINBACK_API ? '"' + window.SPINBACK_API + '"' : 'blank (the bot is reached through this site’s proxy)'));
    });
    chain = chain.then(function () {
      if (!('serviceWorker' in navigator)) { record('Offline shell', 'warn', 'this browser has no service worker support'); return null; }
      return navigator.serviceWorker.getRegistrations().then(function (list) {
        record('Offline shell', list.length ? 'ok' : 'warn', list.length ? plural(list.length, 'service worker', 'service workers') + ' registered' : 'no service worker registered');
      }).catch(function () { record('Offline shell', 'warn', 'could not read the service worker list'); });
    });
    chain = chain.then(function () {
      var target = savedServers().filter(function (row) { return row.id; })[0];
      if (!target) {
        record('RCON from the bot', 'warn', state.draft
          ? 'no saved server with an id to test yet — save one first'
          : 'not tested: unlock with the settings token first');
        return null;
      }
      var t = Date.now();
      return apiPost('/api/rcon/test', { id: target.id }).then(function (out) {
        var body = out.body || {};
        if (body.ok) record('RCON from the bot', 'ok', 'the bot reached ' + (target.name || target.host) + ' in ' + body.ms + 'ms', Date.now() - t);
        else record('RCON from the bot', 'bad', (target.name || target.host) + ': ' + (body.reason || 'HTTP ' + out.status) + (body.detail ? ' — ' + body.detail : ''), Date.now() - t);
      }).catch(function (error) { record('RCON from the bot', 'bad', 'request failed: ' + error.message, Date.now() - t); });
    });
    chain = chain.then(function () {
      var dirty = isDirty();
      record('Unsaved changes', dirty ? 'warn' : 'ok', dirty ? 'there are edits not written yet — press Save changes' : 'everything on screen matches what is saved');
      done();
    }).catch(function (error) {
      record('Diagnostics', 'bad', 'the run itself failed: ' + (error && error.message ? error.message : error));
      done();
    });
  }
  function copyReport() {
    var text = state.diag || 'Diagnostics have not been run yet.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Report copied.', 'good'); },
        function () { toast('This browser refused clipboard access. The report is on screen.', 'bad'); });
    } else {
      toast('No clipboard access here. The report is on screen.', 'bad');
    }
  }

  /* --------------------------------------------------------------- save paths */
  function validateBeforeSave(payload) {
    var problems = [];
    var live = liveRoles().length > 0;
    ROLE_SLOTS.forEach(function (slot) {
      var id = payload.staffRoles[slot.key];
      if (id && live && !roleById(id)) problems.push('The ' + slot.label + ' role id is not in this server.');
    });
    LOG_TYPES.forEach(function (type) {
      var id = payload.logChannels[type.key];
      if (!id) return;
      var channel = channelById(id);
      if (liveChannels().length && !channel) problems.push('The ' + type.label + ' channel is not in this server.');
      else if (channel && channel.canSend === false) problems.push('The bot cannot post in the ' + type.label + ' channel.');
    });
    var seen = {};
    payload.servers.forEach(function (row) {
      if (row.remove) return;
      if (!hostLooksReal(row.host)) problems.push('"' + row.host + '" is not an address the bot will connect to.');
      else if (!portLooksReal(row.port)) problems.push('Port ' + row.port + ' cannot exist.');
      var key = row.host + ':' + row.port;
      if (seen[key]) problems.push(key + ' is saved twice.');
      seen[key] = true;
      if (!row.password && !(state.draft.servers.filter(function (s) { return s.id === row.id; })[0] || {}).hasPassword) problems.push('No RCON password has ever been saved for ' + (row.host || 'a server') + '.');
    });
    if (payload.kits.giveCommand && payload.kits.giveCommand.indexOf('{') === -1) problems.push('The give template has no placeholder, so every kit would look the same.');
    return problems;
  }
  function save() {
    if (!state.token) { toast('Unlock with the settings token first — that is what lets this page write.', 'bad'); return; }
    if (!isDirty()) { toast('Nothing to save: the page already matches what is stored.', ''); return; }
    var payload = collectPayload();
    var problems = validateBeforeSave(payload);
    if (problems.length && !window.confirm('Before saving:\n\n- ' + problems.join('\n- ') + '\n\nSave anyway?')) return;
    if ($('saveTop')) $('saveTop').disabled = true;
    toast('Saving…');
    settingsPost(payload).then(function (out) {
      if (out.status === 200 && out.body && out.body.ok) {
        var wrote = Array.isArray(out.body.wrote) ? out.body.wrote : [];
        /* The write is confirmed by reading it back, not by assuming it landed. */
        return settingsGet().then(function (read) {
          if (read.status === 200 && read.body && read.body.ok) {
            applySettings(read.body);
            toast('Saved and read back: ' + wrote.join(', ') + '.', 'good');
          } else {
            state.baseline = JSON.stringify(collectPayload());
            markDirty();
            if ($('saveTop')) $('saveTop').disabled = false;
            toast('Saved (' + wrote.join(', ') + '), but reading it back failed. Reload to see the stored copy.', '');
          }
        });
      }
      if ($('saveTop')) $('saveTop').disabled = false;
      var reason = out.body && out.body.reason;
      if (reason === 'bad-token') toast('The website refused that token. It must match BOT_SETTINGS_TOKEN exactly.', 'bad');
      else if (reason === 'no-token') toast('This website has no BOT_SETTINGS_TOKEN set, so nothing can be written yet.', 'bad');
      else toast('Save failed (HTTP ' + out.status + '). ' + JSON.stringify(out.body).slice(0, 160), 'bad');
    }).catch(function (error) {
      if ($('saveTop')) $('saveTop').disabled = false;
      toast('Could not save: ' + (error && error.message ? error.message : error), 'bad');
    });
  }
  function discard() {
    if (!state.settings) return;
    if (!window.confirm('Throw away the changes on this page and go back to what is saved?')) return;
    applySettings(state.settings);
    toast('Changes discarded.', 'good');
  }
  function applySettings(body) {
    state.settings = body;
    state.draft = draftFromSettings(body);
    state.baseline = JSON.stringify(collectPayload());
    if ($('kitList')) $('kitList').value = state.draft.kits.listCommand;
    if ($('kitGive')) $('kitGive').value = state.draft.kits.giveCommand;
    if ($('kitLocked')) $('kitLocked').checked = state.draft.kits.locked;
    renderRoles();
    renderLogs();
    renderServers();
    renderLinks();
    renderChecklist();
    renderBar();
    markDirty();
  }
  function loadSettings() {
    var field = $('token');
    var value = (field && field.value.trim()) || getToken();
    if (!value) { say($('loadState'), 'Paste the settings token first — or ask whoever set the bot up for it.', 'bad'); return; }
    setToken(value);
    say($('loadState'), 'Asking this site for the saved settings…');
    if ($('loadBtn')) $('loadBtn').disabled = true;
    settingsGet().then(function (out) {
      if ($('loadBtn')) $('loadBtn').disabled = false;
      if (out.status === 200 && out.body && out.body.ok !== false) {
        applySettings(out.body);
        if ($('console')) $('console').hidden = false;
        say($('loadState'), 'Unlocked. This is what the site has stored right now.', 'good');
        toast('Settings unlocked.', 'good');
        return;
      }
      var reason = out.body && out.body.reason;
      if (reason === 'no-token') {
        say($('loadState'), 'This website has no BOT_SETTINGS_TOKEN set yet. Set it on the website and on the bot to the same value, then reload.', 'bad');
      } else if (reason === 'bad-token') {
        say($('loadState'), 'That token does not match the one this website holds.', 'bad');
      } else {
        say($('loadState'), 'Could not load the saved settings (HTTP ' + out.status + ').', 'bad');
      }
      renderBar();
    }).catch(function (error) {
      if ($('loadBtn')) $('loadBtn').disabled = false;
      say($('loadState'), 'Could not reach this site’s API: ' + (error && error.message ? error.message : error), 'bad');
    });
  }

  /* ------------------------------------------------------------------- rescan */
  function rescan(quiet) {
    if (state.scanning) return;
    state.scanning = true;
    if ($('scanBtn')) $('scanBtn').disabled = true;
    if (!quiet) toast('Asking the bot for its server…');
    Promise.all([apiGet('/api/guild'), apiGet('/api/guilds'), apiGet('/api/status')]).then(function (results) {
      state.scanning = false;
      if ($('scanBtn')) $('scanBtn').disabled = false;
      var guild = results[0], guilds = results[1], status = results[2];
      if (guild.status === 200 && guild.body && guild.body.guild) {
        state.guild = guild.body.guild;
        state.scanAt = Date.now();
        if (!quiet) toast('Read ' + plural((state.guild.roles || []).length, 'role', 'roles') + ' and ' + plural((state.guild.channels || []).length, 'channel', 'channels') + ' from ' + state.guild.name + '.', 'good');
      } else {
        state.guild = null;
        var why = guild.body && guild.body.reason ? guild.body.reason : 'HTTP ' + guild.status;
        if (!quiet) toast('The bot did not report its server (' + why + '). Enter ids by hand or try again shortly.', 'bad');
      }
      state.guilds = (guilds.body && guilds.body.guilds) || [];
      state.status = status.body || null;
      renderBar();
      if (state.draft) { renderRoles(); renderLogs(); renderServers(); renderChecklist(); }
    }).catch(function (error) {
      state.scanning = false;
      if ($('scanBtn')) $('scanBtn').disabled = false;
      if (!quiet) toast('Rescan failed: ' + (error && error.message ? error.message : error), 'bad');
    });
  }

  /* -------------------------------------------------------------------- wiring */
  function initConsole() {
    on($('loadBtn'), 'click', loadSettings);
    on($('forgetToken'), 'click', function () {
      setToken('');
      if ($('token')) $('token').value = '';
      say($('loadState'), 'Token forgotten in this tab.', 'good');
      renderBar();
    });
    on($('scanBtn'), 'click', function () { rescan(false); });
    on($('saveTop'), 'click', save);
    on($('discardTop'), 'click', discard);
    on($('suggestRoles'), 'click', suggestRoles);
    on($('clearRoles'), 'click', clearRoles);
    on($('suggestLogs'), 'click', suggestLogs);
    on($('clearLogs'), 'click', clearLogs);
    on($('testAll'), 'click', testAll);
    on($('diagRun'), 'click', runDiagnostics);
    on($('diagCopy'), 'click', copyReport);
    on($('linkSearch'), 'input', renderLinks);
    on($('kitList'), 'input', function () { if (!state.draft) return; state.draft.kits.listCommand = $('kitList').value; markDirty(); });
    on($('kitGive'), 'input', function () { if (!state.draft) return; state.draft.kits.giveCommand = $('kitGive').value; markDirty(); });
    on($('kitLocked'), 'change', function () { if (!state.draft) return; state.draft.kits.locked = $('kitLocked').checked; markDirty(); });
    on($('addServer'), 'click', addServer);
    on($('testNew'), 'click', function () {
      var row = {
        id: null,
        name: ($('newName') && $('newName').value.trim()) || ($('newHost') && $('newHost').value.trim()) || 'new server',
        host: ($('newHost') && $('newHost').value.trim()) || '',
        port: ($('newPort') && $('newPort').value.trim()) || '',
        password: ($('newPass') && $('newPass').value) || '',
        hasPassword: false,
        remove: false,
        result: null
      };
      testServer(row, $('testNew'), null);
    });

    on(window, 'keydown', function (event) {
      var meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      if (event.key === 's' || event.key === 'S') { event.preventDefault(); save(); }
      else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        if (!state.draft) { toast('Unlock first, then the picker can jump to an empty slot.', ''); return; }
        var slot = ROLE_SLOTS.filter(function (s) { return !String(state.draft.staffRoles[s.key] || '').trim(); })[0];
        if (slot) openRolePicker(slot, '');
        else {
          var type = LOG_TYPES.filter(function (t) { return !String(state.draft.logChannels[t.key] || '').trim(); })[0];
          if (type) openChannelPicker(type, '');
          else toast('Every slot is filled.', 'good');
        }
      }
    });
    on(window, 'beforeunload', function (event) {
      if (!isDirty()) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
  }
  function addServer() {
    var name = $('newName'), host = $('newHost'), port = $('newPort'), pass = $('newPass');
    if (!host.value.trim()) { say($('serverState'), 'An address is the one field that cannot be guessed.', 'bad'); host.focus(); return; }
    if (!portLooksReal(port.value)) { say($('serverState'), 'A port between 1 and 65535 is needed. Rust RCON defaults to 28017.', 'bad'); port.focus(); return; }
    var duplicate = savedServers().filter(function (row) {
      return String(row.host).trim().toLowerCase() === host.value.trim().toLowerCase() && String(row.port) === String(port.value).trim();
    })[0];
    if (duplicate) { say($('serverState'), 'That address and port are already in the list.', 'bad'); return; }
    state.draft.servers.push({
      id: null,
      name: name.value.trim() || host.value.trim(),
      host: host.value.trim(),
      port: port.value.trim(),
      password: pass.value,
      hasPassword: !!pass.value,
      remove: false,
      result: null
    });
    name.value = ''; host.value = ''; port.value = ''; pass.value = '';
    markDirty();
    renderServers();
    say($('serverState'), 'Added. It becomes a saved server when you press Save changes.', 'good');
    toast('Server added to the list.', 'good');
  }

  function init() {
    initAppearance();
    initStorage();
    initConsole();
    if ($('token') && getToken()) $('token').value = getToken();
    renderBar();
    rescan(true);
    if (getToken()) loadSettings();
    window.__spinbackSettings = {
      state: state,
      snapshot: function () {
        return JSON.stringify({
          guild: state.guild ? { name: state.guild.name, roles: (state.guild.roles || []).length, channels: (state.guild.channels || []).length } : null,
          guilds: state.guilds.map(function (g) { return g.name; }),
          gateway: state.status ? state.status.gateway : null,
          unlocked: !!state.settings,
          dirty: isDirty(),
          slots: ROLE_SLOTS.filter(function (slot) { return String((state.draft || {}).staffRoles && state.draft.staffRoles[slot.key] || '').trim(); }).length,
          logs: LOG_TYPES.filter(function (type) { return String((state.draft || {}).logChannels && state.draft.logChannels[type.key] || '').trim(); }).length,
          servers: ((state.draft || {}).servers || []).length,
          links: state.settings ? (state.settings.links || []).length : null,
          diag: state.diag ? state.diag.split('\n').length + ' checks recorded' : null
        });
      },
      runDiagnostics: runDiagnostics
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { renderBar(); });
  }
  init();


})();
