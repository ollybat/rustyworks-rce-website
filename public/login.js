/* ==========================================================================
   Login page behaviour: keep the button honest about where the visitor stands.

   * reads ?next= so a link like /login?next=/dashboard returns people there;
   * asks /auth/me with the session this browser holds - a header, not a cookie,
     because this host does not pass cookies through to the browser;
   * signed out - offers Continue with Discord;
   * signed in  - says who it thinks you are and opens the account pages.

   The real decision is not made here. Every part of the site checks the session
   it is given before it answers.
   ========================================================================== */
(function () {
  var state = document.getElementById('loginState');
  var cta = document.getElementById('loginCta');
  var nextLabel = document.getElementById('loginNext');
  if (!cta) return;

  var next = '/servers.html';
  try {
    var asked = new URLSearchParams(location.search).get('next');
    if (asked && asked.charAt(0) === '/' && asked.slice(0, 2) !== '//') next = asked;
  } catch (error) { /* keep the default */ }

  if (nextLabel) {
    nextLabel.textContent = next === '/dashboard' ? 'the dashboard' : next.replace('/', '').replace('.html', '') || 'this site';
  }

  function token() { try { return localStorage.getItem('spinback-session') || ''; } catch (error) { return ''; } }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  var headers = { accept: 'application/json' };
  var held = token();
  if (held) headers['x-spinback-session'] = held;

  fetch('/auth/me', { headers: headers, credentials: 'same-origin' })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      clear(cta);
      if (data && data.authenticated) {
        if (state) state.textContent = 'Signed in as ' + data.user.name + '.';
        var go = el('a', 'btn', 'Continue to ' + (next === '/dashboard' ? 'the dashboard' : 'your account'));
        go.href = next;
        cta.appendChild(go);

        var pages = el('div', 'acct-tabs u-mt-18');
        [['Servers', '/servers.html'], ['Profile', '/profile.html'], ['Settings', '/settings.html']].forEach(function (pair) {
          var link = el('a', null, pair[0]);
          link.href = pair[1];
          pages.appendChild(link);
        });
        if (data.level === 'owner' || data.level === 'staff') {
          var dash = el('a', null, 'Dashboard');
          dash.href = '/dashboard';
          pages.appendChild(dash);
        }
        cta.appendChild(pages);

        var out = el('a', 'btn ghost u-mt-18', 'Sign out');
        out.href = '/auth/logout';
        out.addEventListener('click', function () {
          try { localStorage.removeItem('spinback-session'); } catch (error) { /* nothing stored */ }
        });
        cta.appendChild(out);
        return;
      }

      if (state) state.textContent = 'Not signed in yet.';
      var start = el('a', 'btn', 'Sign in with Discord');
      start.href = '/auth/login?next=' + encodeURIComponent(next);
      cta.appendChild(start);
      if (data && data.configured === false) {
        cta.appendChild(el('p', 'note', 'Sign-in is not set up on this site yet, so Discord cannot be asked.'));
      }
    })
    .catch(function () {
      if (state) state.textContent = 'The website could not reach its own API, so it cannot check your session right now.';
    });
})();
