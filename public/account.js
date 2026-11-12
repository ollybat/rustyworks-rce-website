/* Shared behaviour for the signed-in pages: Servers, Profile, Settings. */
/* The session is kept in localStorage because this host does not pass cookies through, so */
/* every call to the site carries it as a header. */
(function () {
  var PAGES = [
    { id: 'servers', label: 'Servers', href: '/servers.html' },
    { id: 'profile', label: 'Profile', href: '/profile.html' },
    { id: 'settings', label: 'Settings', href: '/settings.html' }
  ];

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (error) { return ''; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function drop(key) {
    try { localStorage.removeItem(key); } catch (error) { /* nothing stored */ }
  }

  function headers() {
    var held = read('spinback-session');
    var out = { accept: 'application/json' };
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
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function row(label, value) {
    var line = el('div', 'acct-row');
    line.appendChild(el('span', null, label));
    line.appendChild(el('span', null, value));
    return line;
  }

  function signInCard(target) {
    var wrap = el('div', 'acct-card');
    wrap.appendChild(el('h2', null, 'Sign in to see this page'));
    wrap.appendChild(el('p', 'acct-sub', 'This page is about your own Discord account, so it needs to know who you are first.'));
    var link = el('a', 'btn', 'Sign in with Discord');
    link.href = '/auth/login?next=' + encodeURIComponent(target);
    wrap.appendChild(link);
    return wrap;
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

  function badge(level) {
    var label = level === 'owner' ? 'Server owner' : level === 'staff' ? 'Staff' : level === 'none' ? 'No access' : level;
    return el('span', 'acct-badge ' + (level === 'owner' ? 'owner' : level === 'staff' ? 'staff' : ''), label);
  }

  function avatarFor(user) {
    var img = el('img', 'acct-avatar');
    img.alt = '';
    img.src = user.avatar || '/media/spinback-icon.svg';
    return img;
  }

  function renderProfile(host, data) {
    clear(host);
    var card = el('div', 'acct-card');
    var who = el('div', 'acct-who');
    who.appendChild(avatarFor(data.user));
    var names = el('div');
    names.appendChild(el('h2', 'acct-name', data.user.name));
    names.appendChild(el('p', 'acct-sub', '@' + data.user.username));
    who.appendChild(names);
    who.appendChild(badge(data.level));
    card.appendChild(who);
    var rows = el('div', 'acct-rows');
    rows.appendChild(row('Discord user id', data.user.id));
    rows.appendChild(row('Server this site is set up for', (data.guild && data.guild.name) || 'not reported'));
    rows.appendChild(row('Your access here', data.level === 'owner' ? 'Owner: everything in the dashboard' : data.level === 'staff' ? 'Staff: the dashboard panels marked for staff' : 'Signed in, but not staff on that server'));
    rows.appendChild(row('Roles Discord reported', (data.roleNames && data.roleNames.length) ? data.roleNames.join(', ') : 'none of the roles this site tracks'));
    rows.appendChild(row('What the site asked Discord for', 'your name and avatar (identify), and the servers you are in (guilds)'));
    card.appendChild(rows);
    host.appendChild(card);
  }

  function renderSettings(host, data) {
    clear(host);
    var appearance = el('div', 'acct-card');
    appearance.appendChild(el('h2', null, 'Appearance'));
    appearance.appendChild(el('p', 'acct-sub', 'Kept in this browser only. Nothing about it reaches the server.'));
    var themeRow = el('div', 'acct-actions');
    ['dark', 'light'].forEach(function (choice) {
      var button = el('button', 'btn ' + (choice === 'light' ? 'ghost' : ''), choice === 'dark' ? 'Dark' : 'Light');
      button.type = 'button';
      button.addEventListener('click', function () {
        write('spinback-theme', choice);
        document.documentElement.setAttribute('data-theme', choice);
        var said = document.getElementById('settings-theme-msg');
        if (said) said.textContent = 'Saved. Every page here will open in ' + choice + ' from now on.';
      });
      themeRow.appendChild(button);
    });
    appearance.appendChild(themeRow);
    appearance.appendChild(el('p', 'acct-msg', '', 'settings-theme-msg'));
    var themeMsg = appearance.lastChild;
    themeMsg.id = 'settings-theme-msg';
    host.appendChild(appearance);

    var session = el('div', 'acct-card');
    session.appendChild(el('h2', null, 'This browser'));
    var rows = el('div', 'acct-rows');
    rows.appendChild(row('Signed in as', data && data.user ? data.user.name : 'not signed in'));
    rows.appendChild(row('Session kept in', read('spinback-session') ? 'this browser\u2019s local storage' : 'nowhere - you are not signed in'));
    rows.appendChild(row('Theme choice', read('spinback-theme') || 'following the device'));
    session.appendChild(rows);
    var actions = el('div', 'acct-actions');
    var out = el('a', 'btn', 'Sign out of this browser');
    out.href = '/auth/logout';
    out.addEventListener('click', function () { drop('spinback-session'); });
    actions.appendChild(out);
    var forget = el('button', 'btn ghost', 'Forget saved choices on this device');
    forget.type = 'button';
    forget.addEventListener('click', function () {
      drop('spinback-theme');
      var said = document.getElementById('settings-msg');
      if (said) { said.className = 'acct-msg good'; said.textContent = 'Cleared. The theme follows your device again.'; }
    });
    actions.appendChild(forget);
    session.appendChild(actions);
    session.appendChild(el('p', 'acct-msg', '', 'settings-msg'));
    session.lastChild.id = 'settings-msg';
    host.appendChild(session);

    var note = el('div', 'acct-card');
    note.appendChild(el('h2', null, 'What this site keeps'));
    note.appendChild(el('p', 'acct-sub', 'A session token in this browser, your theme choice, and the skins you mark as owned in the Skin Store. Nothing else, and none of it is sent anywhere except as the session you signed in with.'));
    host.appendChild(note);
  }

  function start() {
    var page = document.body.getAttribute('data-acct-page') || '';
    var profileHost = document.getElementById('acctProfile');
    var settingsHost = document.getElementById('acctSettings');
    me().then(function (data) {
      var signedIn = data && data.authenticated;
      tabs(page, signedIn ? data.level : 'none');
      if (!signedIn) {
        drop('spinback-session');
        if (profileHost) { clear(profileHost); profileHost.appendChild(signInCard('/profile.html')); }
        if (settingsHost) { clear(settingsHost); settingsHost.appendChild(signInCard('/settings.html')); }
        return;
      }
      if (profileHost) renderProfile(profileHost, data);
      if (settingsHost) renderSettings(settingsHost, data);
    }).catch(function () {
      var said = el('p', 'acct-msg bad', 'The website could not reach its own API, so this page could not load.');
      if (profileHost) { clear(profileHost); profileHost.appendChild(said); }
      else if (settingsHost) { clear(settingsHost); settingsHost.appendChild(said.cloneNode(true)); }
    });
  }

  window.sbAccount = { me: me, headers: headers, read: read };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
