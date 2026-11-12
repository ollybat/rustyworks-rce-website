/* Setup assistant on the account pages. It answers one question honestly - is Spinback in
   your server - because nothing can be set up until it is. The answer comes from the bot
   itself, never from a guess. */
(function () {
  var box = document.getElementById('sb-setup');
  if (!box) return;
  var filterText = '';

  function token() { try { return localStorage.getItem('spinback-session') || ''; } catch (error) { return ''; } }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function iconFor(server) {
    var img = el('img', 'sb-icon');
    img.alt = '';
    img.src = server.icon ? 'https://cdn.discordapp.com/icons/' + server.id + '/' + server.icon + '.png?size=64' : '/media/spinback-icon.svg';
    return img;
  }

  function card(title, lines) {
    var wrap = el('div', 'sb-card sb-fade');
    wrap.appendChild(el('h3', null, title));
    (lines || []).forEach(function (line) { wrap.appendChild(el('p', null, line)); });
    return wrap;
  }

  function steps(title, items) {
    var wrap = el('div', 'sb-card sb-fade');
    wrap.appendChild(el('h3', null, title));
    var list = el('div', 'sb-steps');
    items.forEach(function (item) {
      var line = el('div', 'sb-step');
      line.appendChild(el('span', 'sb-step-num'));
      line.appendChild(el('span', null, item));
      list.appendChild(line);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function inviteButton(label, url) {
    var a = el('a', 'btn', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function summary(list) {
    var here = list.filter(function (s) { return s.botPresent === true; }).length;
    var waiting = list.filter(function (s) { return s.botPresent === false; }).length;
    var unknown = list.filter(function (s) { return s.botPresent === null || s.botPresent === undefined; }).length;
    var wrap = el('div', 'sb-summary');
    [[String(list.length), list.length === 1 ? 'Server you manage' : 'Servers you manage'],
     [String(here), 'With Spinback in'],
     [String(waiting), 'Waiting for the bot'],
     [String(unknown), 'Could not be checked']].forEach(function (pair) {
      var item = el('div', 'sb-summary-item');
      item.appendChild(el('div', 'sb-summary-num', pair[0]));
      item.appendChild(el('div', 'sb-summary-label', pair[1]));
      wrap.appendChild(item);
    });
    return wrap;
  }

  function serverRow(server, reload) {
    var row = el('div', 'sb-server sb-fade');
    var left = el('div', 'sb-server-left');
    left.appendChild(iconFor(server));
    var main = el('div', 'sb-server-main');
    main.appendChild(el('span', 'sb-server-name', server.name || server.id));
    if (server.name) main.appendChild(el('span', 'sb-server-meta', server.id));
    var present = server.botPresent;
    var label = present === true ? 'Spinback is in this server' : present === false ? 'Spinback is not in this server yet' : 'Could not ask the bot about this one';
    var tone = present === true ? 'sb-presence-yes' : present === false ? 'sb-presence-no' : '';
    main.appendChild(el('span', 'sb-presence ' + tone, label));
    left.appendChild(main);
    row.appendChild(left);

    var actions = el('div', 'sb-server-actions');
    if (present === false) {
      actions.appendChild(inviteButton('Add to this server', server.invite));
      var again = el('button', 'btn ghost', 'Check again');
      again.type = 'button';
      again.addEventListener('click', function () { reload(); });
      actions.appendChild(again);
    } else if (present === true) {
      var dash = el('a', 'btn', 'Open the dashboard');
      dash.href = '/dashboard';
      actions.appendChild(dash);
    }
    row.appendChild(actions);
    return row;
  }

  function listFor(list, reload) {
    var host = el('div');
    host.style.display = 'grid';
    host.style.gap = '10px';
    var shown = list.filter(function (server) {
      if (!filterText) return true;
      return ((server.name || '') + ' ' + server.id).toLowerCase().indexOf(filterText.toLowerCase()) > -1;
    });
    if (!shown.length) {
      host.appendChild(el('p', 'sb-setup-msg', 'No server here matches \u201c' + filterText + '\u201d.'));
      return host;
    }
    shown.forEach(function (server) { host.appendChild(serverRow(server, reload)); });
    return host;
  }

  function render(data, reload) {
    clear(box);
    if (!data || !data.signedIn) {
      var need = card('Sign in to see your servers', [
        'Signing in is how the site knows which servers are yours. It reads your name, your avatar and the servers you are in - nothing else.',
        'There is no Discord command to remember: once you are signed in, this page does the rest.'
      ]);
      var signIn = el('a', 'btn', 'Sign in with Discord');
      signIn.href = '/auth/login?next=' + encodeURIComponent('/servers.html');
      need.appendChild(signIn);
      box.appendChild(need);
      box.appendChild(steps('How setup works', [
        'Sign in with Discord here.',
        'Add Spinback to the server you want to set up.',
        'The bot appears in your list, and the owner opens the dashboard to fill in the details.'
      ]));
      return;
    }

    if (data.botReporting === false) {
      box.appendChild(card('The bot is not answering', [
        'Spinback has not told the website which servers it is in, so nothing can be checked yet.',
        'That usually means the bot is restarting. Give it a moment and check again - the site will not guess.'
      ]));
      var retry = el('button', 'btn ghost', 'Check again');
      retry.type = 'button';
      retry.addEventListener('click', function () { reload(); });
      box.lastChild.appendChild(retry);
      return;
    }

    var list = data.manageable || [];
    if (!list.length) {
      var none = card('No server on this account can take a bot', [
        'Discord only lets a server owner, or somebody with Manage Server, add a bot. None of the servers you are in give you that.',
        'Ask the owner of your server to do this step, or to give you Manage Server.'
      ]);
      none.appendChild(inviteButton('Choose a server in Discord', data.invite));
      box.appendChild(none);
      return;
    }

    var head = el('div', 'sb-card sb-fade');
    head.appendChild(el('h3', null, 'Servers you can manage'));
    head.appendChild(el('p', null, 'Signed in as ' + ((data.you && data.you.name) || 'you') + '. Spinback is in ' + (data.botGuildCount === null || data.botGuildCount === undefined ? 'an unknown number of' : data.botGuildCount) + ' server' + (data.botGuildCount === 1 ? '' : 's') + ' right now. Nothing can be set up in a server the bot is not in, so this list is the first step.'));
    head.appendChild(summary(list));
    if (list.length > 4) {
      var search = el('div', 'sb-search');
      var input = el('input');
      input.type = 'search';
      input.placeholder = 'Find a server by name or id';
      input.setAttribute('aria-label', 'Find a server');
      input.addEventListener('input', function () {
        filterText = input.value.trim();
        var old = box.querySelector('.sb-list');
        if (old) box.replaceChild(listFor(list, reload), old);
      });
      search.appendChild(input);
      head.appendChild(search);
    }
    var refresh = el('button', 'btn ghost', 'Refresh this list');
    refresh.type = 'button';
    refresh.addEventListener('click', function () { reload(); });
    head.appendChild(refresh);
    box.appendChild(head);

    var listHost = listFor(list, reload);
    listHost.className = 'sb-list';
    box.appendChild(listHost);
  }

  function load() {
    clear(box);
    for (var i = 0; i < 3; i++) box.appendChild(el('div', 'sb-skel'));
    var headers = { accept: 'application/json' };
    var held = token();
    if (held) headers['x-spinback-session'] = held;
    fetch('/api/setup-status', { headers: headers, credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) { render(data, load); })
      .catch(function () {
        clear(box);
        box.appendChild(el('p', 'sb-setup-msg bad', 'The page could not reach the website API, so nothing could be checked. Nothing is wrong with your account.'));
      });
  }

  load();
})();
