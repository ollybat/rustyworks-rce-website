/* Christmas layer - loaded after the winter layer.
   Adds a garland, a countdown, a shakeable snow globe and a command of the day.
   Every value it shows is either today's date or something already on the page: it invents nothing. */

(function () {
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var el = function (t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
  var isChristmas = (document.documentElement.getAttribute('data-season') || '') === 'christmas';

  /* ---------- the garland, under the header ---------- */
  var head = document.querySelector('header, .sp-header');
  if (head && head.parentNode && !document.getElementById('xg-garland')) {
    var g = el('div'); g.id = 'xg-garland'; g.setAttribute('aria-hidden', 'true');
    var cols = ['#e5484d', '#ffd166', '#6ee7b7', '#8fd0ff', '#f78fb3'];
    var n = Math.max(8, Math.min(40, Math.round(window.innerWidth / 46)));
    for (var i = 0; i < n; i++) {
      var b = el('i');
      b.style.left = ((i + 0.5) * (100 / n)) + '%';
      b.style.setProperty('--xg', cols[i % cols.length]);
      b.style.animationDelay = (-(i % 7) * 0.28).toFixed(2) + 's';
      g.appendChild(b);
    }
    head.parentNode.insertBefore(g, head.nextSibling);
  }

  /* ---------- how many sleeps ---------- */
  if (!document.getElementById('xg-count')) {
    var now = new Date();
    var year = now.getFullYear();
    var xmas = new Date(year, 11, 25);
    if (now > xmas) xmas = new Date(year + 1, 11, 25);
    var days = Math.ceil((xmas - now) / 86400000);
    var box = el('div'); box.id = 'xg-count';
    box.appendChild(el('span', null, '\uD83C\uDF84'));
    var line = el('span');
    if (days === 0) line.textContent = 'Christmas Day is today.';
    else line.appendChild(el('b', null, days === 1 ? 'One sleep' : days + ' sleeps'));
    if (days !== 0) line.appendChild(document.createTextNode(days === 1 ? ' until Christmas Day.' : ' until Christmas Day.'));
    box.appendChild(line);
    box.title = 'Counted from this device\'s own clock on ' + now.toDateString() + '.';
    document.body.appendChild(box);
  }

  /* ---------- shake the globe ---------- */
  var globe = document.querySelector('.wg-globe');
  if (globe && !globe.querySelector('.wg-globe__burst')) {
    var burst = el('div', 'wg-globe__burst');
    globe.insertBefore(burst, globe.firstChild);
    var shake = function () {
      if (RM) return;
      globe.classList.remove('xg-shaken');
      void globe.offsetWidth;
      globe.classList.add('xg-shaken');
      for (var k = 0; k < 14; k++) {
        var bit = el('i');
        var ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 34;
        bit.style.setProperty('--bx', (Math.cos(ang) * dist).toFixed(1) + 'px');
        bit.style.setProperty('--by', (Math.sin(ang) * dist).toFixed(1) + 'px');
        bit.style.animationDelay = (k * 0.02).toFixed(2) + 's';
        burst.appendChild(bit);
        window.setTimeout(function (node) { return function () { if (node.parentNode) node.parentNode.removeChild(node); }; }(bit), 1200);
      }
    };
    globe.setAttribute('role', 'button');
    globe.setAttribute('tabindex', '0');
    globe.setAttribute('aria-label', 'Snow globe - shake it');
    globe.addEventListener('click', shake);
    globe.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shake(); } });
  }

  /* ---------- the chip says the season it is ---------- */
  var chip = document.querySelector('.wg-season');
  if (chip) chip.textContent = '\u2744 ' + (isChristmas ? 'Christmas' : 'Winter');

  /* ---------- today's command, taken from the real list ---------- */
  if (isChristmas && document.querySelector('.sp-hero, .hero')) {
    fetch('data/commands.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var rows = (d && d.commands) || [];
      if (!rows.length || document.querySelector('.xg-today')) return;
      var idx = Math.floor(Date.now() / 86400000) % rows.length;
      var c = rows[idx];
      var host = document.querySelector('.sp-hero .wrap, .hero .wrap') || document.querySelector('.sp-hero, .hero');
      if (!host || /commands/.test(location.pathname)) return;
      var box = el('div', 'xg-today');
      box.appendChild(el('span', 'wg-section-flake', '\uD83C\uDF81'));
      var line = el('span');
      line.appendChild(document.createTextNode('Today\'s command, counted down the list: '));
      var code = el('code', null, '/' + c.name);
      line.appendChild(code);
      line.appendChild(document.createTextNode(c.summary ? ' - ' + c.summary : ''));
      box.appendChild(line);
      box.appendChild(el('span', 'cmd-badge', 'tier: ' + (c.who || 'not stated')));
      var why = el('p', 'cmd-note');
      why.appendChild(document.createTextNode('Not a recommendation and not special today: it is command number ' + (idx + 1) + ' of ' + rows.length + ', chosen by the date. '));
      var a = el('a', null, 'the whole list');
      a.href = 'commands.html';
      why.appendChild(a);
      var wrap = el('div');
      wrap.appendChild(box); wrap.appendChild(why);
      host.appendChild(wrap);
    }).catch(function () {});
  }
})();

