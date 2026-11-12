/* ============================================================================
   Account area behaviour: the signed-in bar, Profile and Settings.

   The session lives in localStorage and travels as an x-spinback-session header,
   because this host does not pass cookies through to the browser. Everything here
   shows what the site was actually told - never a placeholder.
   ========================================================================== */
(function () {
  var PAGES = [
    { id: 'servers', label: 'Servers', href: '/servers.html' },
    { id: 'profile', label: 'Profile', href: '/profile.html' },
    { id: 'settings', label: 'Settings', href: '/settings.html' }
  ];
  var OWN_KEY = 'spinback-owned-skins-v1';

  function read(key) { try { return localStorage.getItem(key) || ''; } catch (error) { return ''; } }
  function write(key, value) { try { localStorage.setItem(key, value); return true; } catch (error) { return false; } }
  function drop(key) { try { localStorage.removeItem(key); } catch (error) { /* nothing stored */ } }

  function headers() {
    var out = { accept: 'application/json' };
    var held = read('spinback-session');
    if (held) out['x-spinback-session'] = held;
    return out;
  }

  function me() {
    return fetch('/auth/me', { headers: headers(), credentials: 'same-origin' })
      .then(function (response) { return response.json(); });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function row(key, value) {
    var line = el('div', 'acct-row');
    line.appendChild(el('span', 'acct-row-key', key));
    line.appendChild(el('span', 'acct-row-val', value));
    return line;
  }

  function stat(number, label) {
    var box = el('div', 'acct-stat');
    box.appendChild(el('div', 'acct-stat-num', number));
    box.appendChild(el('div', 'acct-stat-label', label));
    return box;
  }

  function chipped(host, values, emptyNote) {
    if (!values || !values.length) { host.appendChild(el('p', 'acct-sub', emptyNote)); return; }
    var wrap = el('div', 'acct-chips');
    values.forEach(function (v) { wrap.appendChild(el('span', 'acct-chip', v)); });
    host.appendChild(wrap);
  }

  function badge(level) {
    var label = level === 'owner' ? 'Server owner' : level === 'staff' ? 'Staff' : level === 'none' ? 'No staff access' : level;
    var tone = level === 'owner' ? 'owner' : level === 'staff' ? 'staff' : '';
    return el('span', 'acct-badge ' + tone, label);
  }

  function guildIcon(id, icon, cls) {
    var img = el('img', cls || 'acct-guild-icon');
    img.alt = '';
    img.src = icon ? 'https://cdn.discordapp.com/icons/' + id + '/' + icon + '.png?size=64' : '/media/spinback-icon.svg';
    return img;
  }

  function tabs(current, level) {
    var host = document.getElementById('acctTabs');
    if (!host) return;
    var list = PAGES.slice();
    if (level === 'owner' || level === 'staff') list.push({ id: 'console', label: 'Dashboard', href: '/dashboard' });
    list.forEach(function (page) {
      var a = el('a', null, page.label);
      a.href = page.href;
      if (page.id === current) a.setAttribute('aria-current', 'page');
      host.appendChild(a);
    });
  }

  function bar(detail, data) {
    var host = document.getElementById('acctBar');
    if (!host) return;
    clear(host);
    var who = el('div', 'acct-bar-who');
    var avatar = el('img', 'acct-bar-avatar');
    avatar.alt = '';
    avatar.src = (detail && detail.avatarBig) || '/media/spinback-icon.svg';
    who.appendChild(avatar);
    var names = el('div');
    names.appendChild(el('div', 'acct-bar-name', (detail && detail.name) || 'Signed in'));
    names.appendChild(el('div', 'acct-bar-sub', detail && detail.id ? 'Discord id ' + detail.id : ''));
    who.appendChild(names);
    if (data) who.appendChild(badge(data.level));
    host.appendChild(who);

    var actions = el('div', 'acct-bar-actions');
    var out = el('a', 'btn ghost', 'Sign out');
    out.href = '/auth/logout';
    out.addEventListener('click', function () { drop('spinback-session'); });
    actions.appendChild(out);
    host.appendChild(actions);
    host.classList.add('acct-fade');
  }

  function signInCard(target, title) {
    var wrap = el('div', 'acct-card acct-wide acct-fade');
    wrap.appendChild(el('h2', null, title || 'Sign in to see this page'));
    wrap.appendChild(el('p', null, 'This page is about your own Discord account, so it needs to know who you are first. Signing in reads your name, your avatar and the servers you are in - nothing else.'));
    var link = el('a', 'btn', 'Sign in with Discord');
    link.href = '/auth/login?next=' + encodeURIComponent(target);
    wrap.appendChild(link);
    return wrap;
  }

  function skeletons(host, count) {
    clear(host);
    for (var i = 0; i < (count || 3); i++) {
      var card = el('div', 'acct-card');
      card.appendChild(el('div', 'acct-skel'));
      card.appendChild(el('div', 'acct-skel'));
      card.appendChild(el('div', 'acct-skel'));
      host.appendChild(card);
    }
  }

  function renderProfile(host, data) {
    clear(host);
    var who = el('div', 'acct-card acct-wide acct-fade');
    var head = el('div', 'acct-who');
    var avatar = el('img', 'acct-avatar-lg');
    avatar.alt = '';
    avatar.src = data.user.avatarBig || '/media/spinback-icon.svg';
    head.appendChild(avatar);
    var names = el('div');
    names.appendChild(el('h2', 'acct-name', data.user.name));
    names.appendChild(el('p', 'acct-sub', '@' + data.user.username));
    names.appendChild(el('div', 'acct-actions'));
    var line = names.lastChild;
    line.appendChild(badge(data.level));
    var copy = el('button', 'acct-chip', 'Copy my Discord id');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var text = data.user.id;
      var tell = function (said) { copy.textContent = said; setTimeout(function () { copy.textContent = 'Copy my Discord id'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { tell('Copied'); }).catch(function () { tell('Copy failed - select it instead'); });
      } else { tell('Copying is blocked here'); }
    });
    line.appendChild(copy);
    head.appendChild(names);
    who.appendChild(head);

    var stats = el('div', 'acct-stats');
    stats.appendChild(stat(data.level === 'owner' ? 'Owner' : data.level === 'staff' ? 'Staff' : 'None', 'Access here'));
    stats.appendChild(stat(String((data.roleNames || []).length), 'Tracked roles'));
    stats.appendChild(stat(data.guild && data.guild.memberCount ? String(data.guild.memberCount) : '-', 'Members in the server'));
    stats.appendChild(stat(String(data.sessionDays || 7) + ' days', 'Session length'));
    who.appendChild(stats);
    host.appendChild(who);

    var server = el('div', 'acct-card acct-fade');
    server.appendChild(el('h2', null, 'The server this site is set up for'));
    if (data.guild && data.guild.name) {
      var ghead = el('div', 'acct-who');
      ghead.appendChild(guildIcon(data.guild.id, data.guild.icon));
      var gnames = el('div');
      gnames.appendChild(el('div', 'acct-bar-name', data.guild.name));
      gnames.appendChild(el('p', 'acct-sub', data.guild.id));
      ghead.appendChild(gnames);
      server.appendChild(ghead);
      server.appendChild(el('p', null, data.guild.reported === false
        ? 'The bot has not reported this server yet, so its picture and member count are unknown.'
        : 'Reported by the bot. Its icon and member count come straight from Discord.'));
    } else {
      server.appendChild(el('p', null, 'Discord did not report a server for this session.'));
    }
    host.appendChild(server);

    var access = el('div', 'acct-card acct-fade');
    access.appendChild(el('h2', null, 'What Discord said you can do'));
    access.appendChild(el('h3', null, 'Permissions'));
    chipped(access, data.permissionNames, 'None of the permissions this dashboard looks at - you are signed in, but not staff on that server.');
    access.appendChild(el('h3', null, 'Roles the site tracks'));
    chipped(access, data.roleNames, 'No tracked roles. Staff can also be granted by user id and by role name in the dashboard.');
    access.appendChild(el('p', 'acct-note', 'Roles and permissions are read at sign-in time from the server the bot runs in. They refresh the next time you sign in.'));
    host.appendChild(access);

    var about = el('div', 'acct-card acct-fade');
    about.appendChild(el('h2', null, 'What the site asked Discord for'));
    var rows = el('div', 'acct-rows');
    rows.appendChild(row('identify', 'your username, display name and avatar'));
    rows.appendChild(row('guilds', 'the servers you are in, and whether you can manage each one'));
    rows.appendChild(row('guilds.members.read', 'your roles in this one server, used for staff access'));
    rows.appendChild(row('Email, messages, friends', 'never requested - the site cannot read them'));
    about.appendChild(rows);
    var quiet = el('p', 'acct-note', 'Discord sends all of this each time you sign in. The site keeps none of it in a database; your browser holds a signed session until it expires, and that is all.');
    about.appendChild(quiet);
    host.appendChild(about);

    var session = el('div', 'acct-card acct-fade');
    session.appendChild(el('h2', null, 'This session'));
    var srows = el('div', 'acct-rows');
    srows.appendChild(row('Kept in', read('spinback-session') ? 'this browser (local storage)' : 'nowhere - not signed in'));
    srows.appendChild(row('Signed in as', data.user.name));
    srows.appendChild(row('Expires', data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'not reported'));
    session.appendChild(srows);
    var actions = el('div', 'acct-actions');
    var gosettings = el('a', 'btn ghost', 'Manage this in Settings');
    gosettings.href = '/settings.html';
    actions.appendChild(gosettings);
    session.appendChild(actions);
    host.appendChild(session);
  }

  function themeControls(host, msg) {
    var theme = (window.RWTheme && window.RWTheme.get) ? window.RWTheme.get() : null;
    if (!theme) {
      host.appendChild(el('p', 'acct-note', 'The site\u2019s theme system is not loaded on this page, so appearance is not editable here.'));
      return;
    }
    function save(patch, said) {
      window.RWTheme.set(patch);
      msg.className = 'acct-msg good';
      msg.textContent = said;
    }

    host.appendChild(el('h3', null, 'Theme'));
    var themes = el('div', 'acct-choice');
    ['dark', 'light'].forEach(function (choice) {
      var button = el('button', null, choice === 'dark' ? 'Dark' : 'Light');
      button.type = 'button';
      button.setAttribute('aria-pressed', theme.theme === choice ? 'true' : 'false');
      button.addEventListener('click', function () {
        save({ theme: choice }, 'Theme set to ' + choice + '.');
        write('spinback-theme', choice);
        document.documentElement.setAttribute('data-theme', choice);
        var all = themes.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === button ? 'true' : 'false');
      });
      themes.appendChild(button);
    });
    host.appendChild(themes);

    host.appendChild(el('h3', null, 'Seasonal look'));
    var season = (window.RWTheme.season && window.RWTheme.season()) || null;
    if (season && season.name) {
      host.appendChild(el('p', 'acct-sub', 'On the calendar right now: ' + season.name + (season.endsOn ? ', until ' + season.endsOn : '') + '.'));
    } else {
      host.appendChild(el('p', 'acct-sub', 'No seasonal look is on the calendar today. The choice below still applies when one arrives.'));
    }
    var modes = el('div', 'acct-choice');
    [['auto', 'Automatic'], ['optional', 'Only if I ask'], ['off', 'Never']].forEach(function (pair) {
      var button = el('button', null, pair[1]);
      button.type = 'button';
      button.setAttribute('aria-pressed', theme.mode === pair[0] ? 'true' : 'false');
      button.addEventListener('click', function () {
        save({ mode: pair[0] }, 'Seasonal look: ' + pair[1].toLowerCase() + '.');
        var all = modes.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === button ? 'true' : 'false');
      });
      modes.appendChild(button);
    });
    host.appendChild(modes);

    host.appendChild(el('h3', null, 'Text'));
    var fontField = el('div', 'acct-field');
    var fontLabel = el('label', null, 'Font');
    var fontSelect = el('select');
    (window.RWTheme.FONTS || []).forEach(function (font) {
      var option = el('option', null, font.label);
      option.value = font.key;
      if (theme.font === font.key) option.selected = true;
      fontSelect.appendChild(option);
    });
    fontField.appendChild(fontLabel);
    fontField.appendChild(fontSelect);
    var chosen = (window.RWTheme.FONTS || []).filter(function (f) { return f.key === theme.font; })[0];
    fontField.appendChild(el('p', 'acct-sub', chosen && chosen.note ? chosen.note : ''));
    fontSelect.addEventListener('change', function () {
      if (window.RWTheme.loadFonts) window.RWTheme.loadFonts();
      save({ font: fontSelect.value }, 'Font changed.');
    });
    host.appendChild(fontField);

    var sizeField = el('div', 'acct-field');
    sizeField.appendChild(el('label', null, 'Text size'));
    var sizes = el('div', 'acct-choice');
    (window.RWTheme.SIZES || []).forEach(function (size) {
      var button = el('button', null, size.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', theme.fontSize === size.key ? 'true' : 'false');
      button.addEventListener('click', function () {
        save({ fontSize: size.key }, 'Text size: ' + size.label.toLowerCase() + '.');
        var all = sizes.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === button ? 'true' : 'false');
      });
      sizes.appendChild(button);
    });
    sizeField.appendChild(sizes);
    host.appendChild(sizeField);

    host.appendChild(el('h3', null, 'Movement'));
    var motion = el('div', 'acct-choice');
    [[false, 'Full animations'], [true, 'Calm - less movement']].forEach(function (pair) {
      var button = el('button', null, pair[1]);
      button.type = 'button';
      button.setAttribute('aria-pressed', (theme.reduceMotion === true) === pair[0] ? 'true' : 'false');
      button.addEventListener('click', function () {
        save({ reduceMotion: pair[0] }, pair[1] + ' chosen.');
        var all = motion.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === button ? 'true' : 'false');
      });
      motion.appendChild(button);
    });
    host.appendChild(motion);
    host.appendChild(el('p', 'acct-note', 'Calm mode also follows your device setting if you have not chosen here. Everything on this card is kept in this browser.'));
  }

  function ownedCount() {
    try {
      var map = JSON.parse(read(OWN_KEY) || '{}') || {};
      return Object.keys(map).filter(function (key) { return map[key]; }).length;
    } catch (error) { return 0; }
  }

  function renderSettings(host, data) {
    clear(host);
    var appearance = el('div', 'acct-card acct-fade');
    appearance.appendChild(el('h2', null, 'Appearance'));
    var msg = el('p', 'acct-msg');
    themeControls(appearance, msg);
    appearance.appendChild(msg);
    host.appendChild(appearance);

    var device = el('div', 'acct-card acct-fade');
    device.appendChild(el('h2', null, 'This browser'));
    var rows = el('div', 'acct-rows');
    rows.appendChild(row('Signed in as', data && data.user ? data.user.name : 'not signed in'));
    rows.appendChild(row('Session kept in', read('spinback-session') ? 'this browser\u2019s local storage' : 'nowhere - you are not signed in'));
    rows.appendChild(row('Session ends', data && data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'not reported'));
    rows.appendChild(row('Skins marked as owned', String(ownedCount())));
    device.appendChild(rows);
    var actions = el('div', 'acct-actions');
    var out = el('a', 'btn', 'Sign out of this browser');
    out.href = '/auth/logout';
    out.addEventListener('click', function () { drop('spinback-session'); });
    actions.appendChild(out);
    var forget = el('button', 'btn ghost', 'Reset appearance to the defaults');
    forget.type = 'button';
    forget.addEventListener('click', function () {
      if (window.RWTheme && window.RWTheme.reset) window.RWTheme.reset();
      else { drop('rw_settings_v1'); drop('spinback-theme'); }
      msg.className = 'acct-msg good';
      msg.textContent = 'Appearance reset. Reload if anything still looks different.';
    });
    actions.appendChild(forget);
    device.appendChild(actions);
    host.appendChild(device);

    var data_card = el('div', 'acct-card acct-fade');
    data_card.appendChild(el('h2', null, 'What this site keeps on your device'));
    var keeps = el('div', 'acct-rows');
    keeps.appendChild(row('spinback-session', read('spinback-session') ? 'your signed-in session token' : 'empty'));
    keeps.appendChild(row('rw_settings_v1', read('rw_settings_v1') ? 'your appearance choices above' : 'defaults - you have not changed anything'));
    keeps.appendChild(row('spinback-theme', read('spinback-theme') || 'not set'));
    keeps.appendChild(row('spinback-owned-skins-v1', ownedCount() + ' skin' + (ownedCount() === 1 ? '' : 's') + ' marked as owned in the Skin Store'));
    data_card.appendChild(keeps);
    var clears = el('div', 'acct-actions');
    var clearSkins = el('button', 'btn ghost', 'Clear the Skin Store ticks');
    clearSkins.type = 'button';
    clearSkins.addEventListener('click', function () {
      drop(OWN_KEY);
      msg.className = 'acct-msg good';
      msg.textContent = 'Skin Store ticks cleared.';
    });
    clears.appendChild(clearSkins);
    data_card.appendChild(clears);
    data_card.appendChild(el('p', 'acct-note', 'Nothing else is stored. The site has no database of its own for accounts, so there is nothing to delete on the server side - signing out ends the session.'));
    host.appendChild(data_card);
  }

  function start() {
    var page = document.body.getAttribute('data-acct-page') || '';
    var profileHost = document.getElementById('acctProfile');
    var settingsHost = document.getElementById('acctSettings');
    if (profileHost) skeletons(profileHost, 2);
    me().then(function (data) {
      var signedIn = Boolean(data && data.authenticated);
      tabs(page, signedIn ? data.level : 'none');
      if (!signedIn) {
        drop('spinback-session');
        bar(null, null);
        if (profileHost) { clear(profileHost); profileHost.appendChild(signInCard('/profile.html')); }
        if (settingsHost) { clear(settingsHost); settingsHost.appendChild(signInCard('/settings.html', 'Sign in to manage your settings')); }
        return;
      }
      bar(data.user, data);
      if (profileHost) renderProfile(profileHost, data);
      if (settingsHost) renderSettings(settingsHost, data);
    }).catch(function () {
      bar(null, null);
      var said = el('p', 'acct-msg bad', 'The website could not reach its own API, so this page could not load. Nothing is wrong with your account.');
      if (profileHost) { clear(profileHost); profileHost.appendChild(said); }
      if (settingsHost) { clear(settingsHost); settingsHost.appendChild(said.cloneNode(true)); }
    });
  }

  window.sbAccount = { me: me, headers: headers, read: read };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
