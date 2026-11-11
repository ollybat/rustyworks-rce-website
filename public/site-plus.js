/* ==========================================================================
   site-plus.js — the behaviour side of the premium layer.
   --------------------------------------------------------------------------
   Every page links this file last, so nothing here can disturb the operator's
   original scripts. Each piece checks for its own markup first and quietly does
   nothing when the page does not use it.

   Written with string concatenation rather than template literals on purpose:
   this file is shipped through a transport that mangles backticks.
   ========================================================================== */

(function () {
  'use strict';

  var SP = (window.SP = window.SP || {});
  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { reduce = false; }

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function make(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { 
    try { return Number(n).toLocaleString('en-GB'); } catch (e) { return String(n); }
  }
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ------------------------------------------------------- the backdrop -- */

  function backdrop() {
    if (q('.sp-aurora') || reduce) return;
    var wrap = make('div', 'sp-aurora');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden';
    wrap.appendChild(make('div', 'sb-blob'));
    wrap.appendChild(make('div', 'sb-blob'));
    wrap.appendChild(make('div', 'sb-blob'));
    wrap.appendChild(make('div', 'sb-grid'));
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  /* ---------------------------------------------------------- revealing -- */

  function reveal() {
    var items = qa('[data-sp-reveal]');
    if (!items.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* --------------------------------------------------------- number runs -- */

  function counters() {
    var nodes = qa('[data-sp-count]');
    if (!nodes.length) return;
    nodes.forEach(function (node) {
      var target = Number(String(node.getAttribute('data-sp-count')).replace(/[^0-9.]/g, '')) || 0;
      var suffix = node.getAttribute('data-sp-suffix') || '';
      var prefix = node.getAttribute('data-sp-prefix') || '';
      if (reduce) { node.textContent = prefix + fmt(target) + suffix; return; }
      var started = false;
      var step = function () {
        if (started) return;
        started = true;
        var from = performance.now();
        var run = function (now) {
          var t = Math.min(1, (now - from) / 1100);
          var eased = 1 - Math.pow(1 - t, 3);
          node.textContent = prefix + fmt(Math.round(target * eased)) + suffix;
          if (t < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
      };
      if (!('IntersectionObserver' in window)) { step(); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { step(); io.disconnect(); }
        });
      }, { threshold: 0.4 });
      io.observe(node);
    });
  }

  /* -------------------------------------------------------------- marquee -- */

  function marquee() {
    qa('[data-sp-marquee]').forEach(function (box) {
      var track = q('.sp-track', box);
      if (!track || track.getAttribute('data-sp-ready')) return;
      track.setAttribute('data-sp-ready', '1');
      track.innerHTML = track.innerHTML + track.innerHTML;
    });
  }

  /* ------------------------------------------------------------ to the top -- */

  function totop() {
    if (q('.sp-totop')) return;
    var btn = make('button', 'sp-totop', '&#8593;');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Back to top');
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    document.body.appendChild(btn);
    var onScroll = function () {
      if (window.scrollY > 620) btn.classList.add('is-on');
      else btn.classList.remove('is-on');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* -------------------------------------------------- pointer-follow glow -- */

  function glow() {
    if (reduce) return;
    qa('.sp-card').forEach(function (card) {
      card.addEventListener('pointermove', function (ev) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }

  /* ------------------------------------------------------------ skew on move -- */

  function tilt() {
    if (reduce) return;
    qa('.sp-tilt').forEach(function (node) {
      node.addEventListener('pointermove', function (ev) {
        var r = node.getBoundingClientRect();
        var dx = (ev.clientX - r.left) / r.width - 0.5;
        var dy = (ev.clientY - r.top) / r.height - 0.5;
        node.style.transform = 'perspective(900px) rotateY(' + (dx * 6).toFixed(2) + 'deg) rotateX(' + (-dy * 6).toFixed(2) + 'deg) translateY(-4px)';
      });
      node.addEventListener('pointerleave', function () { node.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------ detail sheet -- */

  function sheet(title, body) {
    var old = q('.sp-sheet');
    if (old) old.remove();
    var back = make('div', 'sp-sheet');
    back.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;background:rgba(2,7,12,.72);backdrop-filter:blur(4px)';
    var box = make('div', 'sp-sheet-box');
    box.style.cssText = 'max-width:520px;width:100%;max-height:84vh;overflow:auto;padding:26px;border-radius:20px;border:1px solid var(--sp-line-strong,rgba(255,255,255,.2));background:#0a1219;color:#eef6fb;box-shadow:0 26px 70px rgba(0,0,0,.6)';
    box.innerHTML = '<h3 style="margin:0 0 12px;font-size:1.25rem">' + esc(title) + '</h3>' + body;
    var close = make('button', '', 'Close');
    close.type = 'button';
    close.className = 'btn sm';
    close.style.marginTop = '18px';
    close.addEventListener('click', function () { back.remove(); });
    box.appendChild(close);
    back.appendChild(box);
    back.addEventListener('click', function (ev) { if (ev.target === back) back.remove(); });
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape') { back.remove(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(back);
  }

  SP.sheet = sheet;

  /* ------------------------------------------------------- item catalogue -- */

  SP.items = null;

  function loadItems() {
    if (SP.items) return Promise.resolve(SP.items);
    return getJSON('/data/items.json').then(function (data) {
      SP.items = data && Array.isArray(data.items) ? data : { items: [], groups: [] };
      return SP.items;
    });
  }

  function initItems() {
    var host = q('[data-sp-items]');
    if (!host) return;
    var grid = q('#spItemGrid', host);
    var status = q('#spItemStatus', host);
    var input = q('#spItemSearch', host);
    var chips = q('#spItemGroups', host);
    var sort = q('#spItemSort', host);
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 8; i++) grid.appendChild(make('div', 'sp-skel'));

    var group = 'All';
    var term = '';
    var order = 'name';

    loadItems().then(function (data) {
      var items = data.items || [];
      var groups = data.groups || [];
      if (status) status.textContent = fmt(items.length) + ' items in the catalogue' + (data.generated ? ' (compiled ' + data.generated + ')' : '') + '.';
      if (chips) {
        chips.innerHTML = '';
        ['All'].concat(groups).forEach(function (g) {
          var b = make('button', 'sp-chip' + (g === 'All' ? ' is-on' : ''), esc(g));
          b.type = 'button';
          b.addEventListener('click', function () {
            group = g;
            qa('.sp-chip', chips).forEach(function (x) { x.classList.toggle('is-on', x === b); });
            paint();
          });
          chips.appendChild(b);
        });
      }
      if (input) input.addEventListener('input', function () { term = input.value.trim().toLowerCase(); paint(); });
      if (sort) sort.addEventListener('change', function () { order = sort.value; paint(); });

      function paint() {
        var list = items.filter(function (it) {
          if (group !== 'All' && it.group !== group) return false;
          if (!term) return true;
          return (String(it.name) + ' ' + String(it.short) + ' ' + String(it.group)).toLowerCase().indexOf(term) > -1;
        });
        list.sort(function (a, b) {
          if (order === 'stack') return (b.stack || 0) - (a.stack || 0);
          if (order === 'group') return String(a.group).localeCompare(String(b.group)) || String(a.name).localeCompare(String(b.name));
          return String(a.name).localeCompare(String(b.name));
        });
        var shown = list.slice(0, 120);
        grid.innerHTML = '';
        if (!list.length) {
          grid.appendChild(make('div', 'sp-empty', 'Nothing matched that search. Try a shorter word, or pick another group.'));
          if (status) status.textContent = 'No matches';
          return;
        }
        shown.forEach(function (it) {
          var card = make('button', 'sp-skin');
          card.type = 'button';
          card.innerHTML =
            '<div class="sp-thumb"><span class="sp-ph">' + esc(icon(it)) + '</span></div>' +
            '<div class="sp-meta"><b>' + esc(it.name) + '</b><small>' + esc(it.group || 'Item') + (it.stack ? ' &middot; stack ' + esc(it.stack) : '') + '</small></div>';
          card.addEventListener('click', function () {
            var rows = [
              ['Display name', it.name],
              ['Short name', it.short],
              ['Group', it.group],
              ['Stack size', it.stack ? it.stack : 'not documented'],
              ['Item id', it.id != null ? it.id : 'not documented'],
              ['Source', it.src === 'db' ? 'public RUST item database' : it.src === 'core' ? 'added by Spinback - verify on your server' : it.src]
            ];
            var html = '<div style="display:grid;gap:8px">';
            rows.forEach(function (row) {
              if (row[1] == null || row[1] === '') return;
              html += '<div style="display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px"><span style="opacity:.65">' + esc(row[0]) + '</span><span style="text-align:right;word-break:break-all">' + esc(row[1]) + '</span></div>';
            });
            html += '</div>';
            if (it.short) {
              html += '<button class="btn sm" id="spCopyShort" style="margin-top:16px" type="button">Copy short name</button>';
            }
            sheet(it.name, html);
            var copy = q('#spCopyShort');
            if (copy) copy.addEventListener('click', function () {
              var done = function () { copy.textContent = 'Copied'; };
              if (navigator.clipboard) navigator.clipboard.writeText(String(it.short)).then(done, done);
              else done();
            });
          });
          grid.appendChild(card);
        });
        if (status) status.textContent = fmt(list.length) + ' item' + (list.length === 1 ? '' : 's') + ' match' + (shown.length < list.length ? ' - showing the first ' + shown.length : '');
      }

      paint();
    }).catch(function (err) {
      grid.innerHTML = '';
      grid.appendChild(make('div', 'sp-empty', 'The item catalogue could not be loaded (' + esc(err.message) + '). It lives at /data/items.json.'));
    });
  }

  var ICONS = {
    Weapons: '\uD83D\uDD2B', Ammo: '\uD83E\uDE83', 'Building': '\uD83E\uDDF1', 'Clothing & armour': '\uD83E\uDDBA',
    Components: '\u2699\uFE0F', 'Decor & fun': '\uD83C\uDF88', Deployables: '\uD83D\uDCE6', Doors: '\uD83D\uDEAA',
    Electrical: '\u26A1', Explosives: '\uD83D\uDCA5', 'Food & water': '\uD83E\uDD69', Medical: '\uD83E\uDE79',
    Other: '\uD83D\uDCCC', Resources: '\uD83E\uDEA8', Tools: '\uD83D\uDD28'
  };

  function icon(it) {
    if (!it) return '\uD83D\uDCE6';
    var g = String(it.group || '');
    if (ICONS[g]) return ICONS[g];
    if (g.indexOf('Door') === 0) return ICONS.Doors;
    if (g.indexOf('Clothing') === 0) return ICONS['Clothing & armour'];
    if (g.indexOf('Food') === 0) return ICONS['Food & water'];
    if (g.indexOf('Decor') === 0) return ICONS['Decor & fun'];
    return '\uD83D\uDCE6';
  }

  /* ------------------------------------------------------------ skin store -- */

  function initSkins() {
    var host = q('[data-sp-skins]');
    if (!host) return;
    var grid = q('#spSkinGrid', host);
    var status = q('#spSkinStatus', host);
    var cats = q('#spSkinCats', host);
    var input = q('#spSkinSearch', host);
    var sort = q('#spSkinSort', host);
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 6; i++) grid.appendChild(make('div', 'sp-skel'));

    var state = { all: [], cat: 'All', term: '', order: 'name' };

    getJSON('/data/skins.json').then(function (data) {
      state.all = (data && Array.isArray(data.skins) ? data.skins : []).filter(function (s) { return s && s.name; });
      if (!state.all.length) {
        showEmpty(data);
        return;
      }
      var groups = [];
      state.all.forEach(function (s) { if (s.category && groups.indexOf(s.category) < 0) groups.push(s.category); });
      if (cats) {
        cats.innerHTML = '';
        ['All'].concat(groups).forEach(function (g) {
          var b = make('button', 'sp-chip' + (g === 'All' ? ' is-on' : ''), esc(g));
          b.type = 'button';
          b.addEventListener('click', function () {
            state.cat = g;
            qa('.sp-chip', cats).forEach(function (x) { x.classList.toggle('is-on', x === b); });
            paint();
          });
          cats.appendChild(b);
        });
      }
      if (input) input.addEventListener('input', function () { state.term = input.value.trim().toLowerCase(); paint(); });
      if (sort) sort.addEventListener('change', function () { state.order = sort.value; paint(); });
      paint();
      if (status) status.textContent = fmt(state.all.length) + ' skins in the catalogue.';
    }).catch(function (err) {
      showEmpty(null, err);
    });

    function showEmpty(data, err) {
      grid.innerHTML = '';
      var note = '';
      if (err) note = 'The catalogue file could not be read (' + err.message + '). ';
      grid.appendChild(make('div', 'sp-empty',
        esc(note) + 'The catalogue itself is not published yet, so there are no skins to show here. ' +
        'The page is finished and waiting for data: it reads <b>/data/skins.json</b>, and each entry needs ' +
        '<b>name</b>, <b>category</b>, and optionally <b>item</b>, <b>rarity</b>, <b>image</b> and <b>released</b>. ' +
        'Point that file at your own skin database and this grid fills itself, with search, filters and previews already wired up.' +
        (data && data.note ? '<br><br>' + esc(data.note) : '')));
      if (status) status.textContent = '0 skins published yet';
    }

    function paint() {
      var list = state.all.filter(function (s) {
        if (state.cat !== 'All' && s.category !== state.cat) return false;
        if (!state.term) return true;
        return (String(s.name) + ' ' + String(s.item) + ' ' + String(s.category) + ' ' + String(s.rarity)).toLowerCase().indexOf(state.term) > -1;
      });
      list.sort(function (a, b) {
        if (state.order === 'released') return String(b.released || '').localeCompare(String(a.released || ''));
        if (state.order === 'rarity') return String(a.rarity || '').localeCompare(String(b.rarity || '')) || String(a.name).localeCompare(String(b.name));
        return String(a.name).localeCompare(String(b.name));
      });
      grid.innerHTML = '';
      if (!list.length) {
        grid.appendChild(make('div', 'sp-empty', 'No skins matched. Clear the search or choose another category.'));
        return;
      }
      list.forEach(function (s) {
        var card = make('button', 'sp-skin');
        card.type = 'button';
        var thumb = s.image ? '<img src="' + esc(s.image) + '" alt="' + esc(s.name) + '" loading="lazy">' : '<span class="sp-ph">\uD83C\uDFA8</span>';
        card.innerHTML =
          (s.rarity ? '<span class="sp-rarity">' + esc(s.rarity) + '</span>' : '') +
          '<div class="sp-thumb">' + thumb + '</div>' +
          '<div class="sp-meta"><b>' + esc(s.name) + '</b><small>' + esc(s.item || s.category || '') + (s.released ? ' &middot; ' + esc(s.released) : '') + '</small></div>';
        card.addEventListener('click', function () {
          var html = '<div style="display:grid;gap:8px">';
          [['Category', s.category], ['Item', s.item], ['Rarity', s.rarity], ['Released', s.released], ['Catalog id', s.id]].forEach(function (row) {
            if (row[1] == null || row[1] === '') return;
            html += '<div style="display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px"><span style="opacity:.65">' + esc(row[0]) + '</span><span style="text-align:right">' + esc(row[1]) + '</span></div>';
          });
          html += '</div>';
          if (s.image) html += '<img src="' + esc(s.image) + '" alt="' + esc(s.name) + '" style="width:100%;border-radius:14px;margin-top:14px">';
          sheet(s.name, html);
        });
        grid.appendChild(card);
      });
    }
  }

  /* ----------------------------------------------------------------- pass -- */

  SP.boot = function () {
    backdrop();
    reveal();
    counters();
    marquee();
    totop();
    glow();
    tilt();
    initItems();
    initSkins();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', SP.boot);
  else SP.boot();
})();