/* ==========================================================================
   Spinback RCE - the bot card in the bottom right corner

   Reads the site's own read-only status proxy and shows what it says: the
   bot's real Discord picture, whether the bot is online, and whether its Rust
   server is answering over RCON. Nothing here writes anything, and nothing is
   invented: when the proxy cannot be reached the card says so and links to the
   status page. The picture falls back to the icon shipped with the site until
   the bot's own one arrives.
   ========================================================================== */
(function () {
  'use strict';

  var INVITE = 'https://discord.com/oauth2/authorize?client_id=1570023832717361213&permissions=8&integration_type=0&scope=bot+applications.commands';
  var HIDDEN_KEY = 'rw-botcard-hidden';
  var FALLBACK = '/media/spinback-icon.svg';

  function hidden() {
    try { return window.localStorage && window.localStorage.getItem(HIDDEN_KEY) === '1'; } catch (error) { return false; }
  }
  function remember() {
    try { if (window.localStorage) window.localStorage.setItem(HIDDEN_KEY, '1'); } catch (error) { /* private mode */ }
  }

  if (hidden()) return;
  if (document.querySelector('.rw-botcard')) return;

  var card = document.createElement('aside');
  card.className = 'rw-botcard';
  card.id = 'rwBotCard';
  card.setAttribute('aria-label', 'Spinback RCE, the Discord bot');

  var avatar = document.createElement('a');
  avatar.className = 'rw-botcard__avatar';
  avatar.href = INVITE;
  avatar.target = '_blank';
  avatar.rel = 'noopener';
  var img = document.createElement('img');
  img.src = FALLBACK;
  img.alt = 'Spinback RCE';
  img.width = 48;
  img.height = 48;
  img.decoding = 'async';
  avatar.appendChild(img);

  var body = document.createElement('div');
  body.className = 'rw-botcard__body';
  var name = document.createElement('p');
  name.className = 'rw-botcard__name';
  name.textContent = 'Spinback RCE';
  var state = document.createElement('p');
  state.className = 'rw-botcard__state';
  var dot = document.createElement('span');
  dot.className = 'rw-dot';
  var stateText = document.createElement('span');
  stateText.textContent = 'Checking the bot...';
  state.appendChild(dot);
  state.appendChild(stateText);
  var cta = document.createElement('a');
  cta.className = 'rw-botcard__cta';
  cta.href = INVITE;
  cta.target = '_blank';
  cta.rel = 'noopener';
  cta.textContent = 'Add to Discord';

  body.appendChild(name);
  body.appendChild(state);
  body.appendChild(cta);

  var close = document.createElement('button');
  close.className = 'rw-botcard__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Hide this card');
  close.textContent = String.fromCharCode(10005);

  card.appendChild(avatar);
  card.appendChild(body);
  card.appendChild(close);
  document.body.appendChild(card);

  close.addEventListener('click', function () {
    remember();
    card.classList.remove('is-in');
    setTimeout(function () { card.hidden = true; }, 300);
  });

  function say(text, kind) {
    stateText.textContent = text;
    state.className = 'rw-botcard__state' + (kind ? ' is-' + kind : '');
  }

  function show() { if (!card.hidden) card.classList.add('is-in'); }
  if (window.requestAnimationFrame) window.requestAnimationFrame(show); else setTimeout(show, 60);

  function describe(data) {
    if (!data || typeof data !== 'object') return { text: 'Status unavailable right now - see the Status page', kind: 'bad' };
    if (data.avatar) img.src = data.avatar, img.onerror = function () { img.src = FALLBACK; };
    var online = data.online === true || data.gateway === 'online';
    var rcon = data.rcon || null;
    var where = rcon && rcon.serverName ? rcon.serverName : 'your Rust server';
    if (!online) return { text: 'Offline or restarting - see the Status page', kind: 'bad' };
    if (!rcon) return { text: 'Online - RCON status not reported yet', kind: 'ok' };
    if (rcon.connected) return { text: 'Online - RCON connected to ' + where, kind: 'ok' };
    return { text: 'Online - RCON not connected: set it up in Discord', kind: 'bad' };
  }

  var controller = ('AbortController' in window) ? new AbortController() : null;
  var timer = setTimeout(function () { if (controller) controller.abort(); }, 12000);
  fetch('/api/status', Object.assign({ headers: { accept: 'application/json' }, cache: 'no-store' }, controller ? { signal: controller.signal } : {}))
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function (data) { var said = describe(data); say(said.text, said.kind); })
    .catch(function () { say('Status unavailable right now - see the Status page', 'bad'); })
    .then(function () { clearTimeout(timer); });
})();
