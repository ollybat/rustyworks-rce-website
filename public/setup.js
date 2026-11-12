/* Setup assistant on the servers page. It answers one question honestly - is Spinback in
   your server - because nothing can be set up until it is. The answer comes from the bot
   itself, never from a guess. */
(function () {
  var box = document.getElementById('sb-setup');
  if (!box) return;

  function token() {
    try { return localStorage.getItem('spinback-session') || ''; } catch (error) { return ''; }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function card(title, lines) {
    var wrap = el('div', 'sb-setup-card');
    wrap.appendChild(el('h3', null, title));
    (lines || []).forEach(function (line) { wrap.appendChild(el('p', null, line)); });
    return wrap;
  }

  function inviteButton(label, url) {
    var a = el('a', 'btn', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function serverRow(server, reload) {
    var row = el('div', 'sb-server');
    var main = el('div', 'sb-server-main');
    main.appendChild(el('span', 'sb-server-name', server.name || server.id));
    var present = server.botPresent;
    var label = present === true ? 'Spinback is in this server' : present === false ? 'Spinback is not in this server yet' : 'Could not ask the bot';
    var tone = present === true ? 'sb-presence-yes' : present === false ? 'sb-presence-no' : '';
    main.appendChild(el('span', 'sb-presence ' + tone, label));
    row.appendChild(main);

    var actions = el('div', 'sb-server-actions');
    if (present === false) {
      actions.appendChild(inviteButton('Add Spinback to this server', server.invite));
      var again = el('button', 'btn ghost', 'I have added it - check again');
      again.type = 'button';
      again.addEventListener('click', function () { reload(); });
      actions.appendChild(again);
    } else if (present === true) {
      var dash = el('a', 'btn', 'Open the dashboard');
      dash.href = '/dashboard';
      actions.appendChild(dash);
      actions.appendChild(el('span', 'sb-setup-msg', 'Ask the server owner if that door is shut to you.'));
    }
    row.appendChild(actions);
    return row;
  }

  function render(data) {
    clear(box);
    if (!data || !data.signedIn) {
      var need = card('Sign in to set up a server', [
        'Setting a server up means saying which server it is, so the website has to know it is really you.',
        'Signing in only reads your Discord name and the list of servers you are in.'
      ]);
      var signIn = el('a', 'btn', 'Sign in with Discord');
      signIn.href = '/auth/login?next=' + encodeURIComponent('/rustservers.html');
      need.appendChild(signIn);
      box.appendChild(need);
      return;
    }

    if (data.botReporting === false) {
      box.appendChild(card('The bot is not answering', [
        'Spinback has not told the website which servers it is in, so this cannot be checked yet.',
        'That usually means the bot is restarting. Wait a moment and refresh the page.'
      ]));
      return;
    }

    var list = data.manageable || [];
    if (!list.length) {
      var none = card('No server on this account can take a bot', [
        'Discord only lets a server owner, or somebody with Manage Server, add a bot. None of the servers you are in give you that.',
        'Ask the owner of your server to do this step, or to give you Manage Server.'
      ]);
      none.appendChild(inviteButton('Pick a server in Discord instead', data.invite));
      box.appendChild(none);
      return;
    }

    var head = card('Set up your server', [
      'Spinback has to be in your server before anything can be set up there. This is what the bot reports right now.'
    ]);
    head.appendChild(el('span', 'sb-setup-who', 'Signed in as ' + ((data.you && data.you.name) || 'you')));
    box.appendChild(head);
    list.forEach(function (server) { box.appendChild(serverRow(server, load)); });
    if (data.botGuildCount !== null && data.botGuildCount !== undefined) {
      box.appendChild(el('p', 'sb-setup-who', 'Spinback is currently in ' + data.botGuildCount + (data.botGuildCount === 1 ? ' server.' : ' servers.')));
    }
  }

  function load() {
    clear(box);
    box.appendChild(el('p', 'sb-setup-loading', 'Asking Spinback which servers it is in...'));
    var headers = { accept: 'application/json' };
    var held = token();
    if (held) headers['x-spinback-session'] = held;
    fetch('/api/setup-status', { headers: headers, credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(render)
      .catch(function () {
        clear(box);
        box.appendChild(el('p', 'sb-setup-msg bad', 'The page could not reach the website API, so nothing could be checked.'));
      });
  }

  load();
})();
