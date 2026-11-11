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
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
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
  function fmt(n) { try { return Number(n).toLocaleString('en-GB'); } catch (e) { return String(n); } }
  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function iconUrl(short) { return '/media/kitbuilder/' + String(short) + '.png'; }

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
    qa('[data-sp-count]').forEach(function (node) {
      var target = Number(String(node.getAttribute('data-sp-count')).replace(/[^0-9.]/g, '')) || 0;
      var suffix = node.getAttribute('data-sp-suffix') || '';
      var prefix = node.getAttribute('data-sp-prefix') || '';
      var run = function () {
        if (reduce) { node.textContent = prefix + fmt(target) + suffix; return; }
        var from = performance.now();
        var step = function (now) {
          var t = Math.min(1, (now - from) / 1100);
          var eased = 1 - Math.pow(1 - t, 3);
          node.textContent = prefix + fmt(Math.round(target * eased)) + suffix;
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      if (!('IntersectionObserver' in window)) { run(); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) { run(); io.disconnect(); } });
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
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
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

  SP.sheet = function (title, body) {
    var old = q('.sp-sheet');
    if (old) old.parentNode.removeChild(old);
    var back = make('div', 'sp-sheet');
    back.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:18px;background:rgba(2,7,12,.72);backdrop-filter:blur(4px)';
    var box = make('div', 'sp-sheet-box');
    box.style.cssText = 'max-width:640px;width:100%;max-height:86vh;overflow:auto;padding:24px;border-radius:20px;border:1px solid var(--sp-line-strong,rgba(255,255,255,.2));background:#0a1219;color:#eef6fb;box-shadow:0 26px 70px rgba(0,0,0,.6)';
    box.innerHTML = '<h3 style="margin:0 0 12px;font-size:1.3rem">' + esc(title) + '</h3>' + body;
    var close = make('button', '', 'Close');
    close.type = 'button';
    close.className = 'btn sm';
    close.style.marginTop = '18px';
    close.addEventListener('click', function () { back.parentNode.removeChild(back); });
    box.appendChild(close);
    back.appendChild(box);
    back.addEventListener('click', function (ev) { if (ev.target === back) back.parentNode.removeChild(back); });
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape') { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(back);
    return box;
  };

  function rows(pairs) {
    var html = '<div style="display:grid;gap:8px">';
    pairs.forEach(function (row) {
      if (row[1] == null || row[1] === '' || row[1] === false) return;
      html += '<div style="display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px"><span style="opacity:.65">' + esc(row[0]) + '</span><span style="text-align:right;word-break:break-word">' + esc(row[1]) + '</span></div>';
    });
    return html + '</div>';
  }

  function copyButton(label, value) {
    var b = make('button', '', label);
    b.type = 'button';
    b.className = 'btn sm';
    b.style.marginTop = '16px';
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(String(value)).then(done, done);
      else done();
    });
    return b;
  }

  /* ------------------------------------------------------- item catalogue -- */

  SP.items = null;
  var ITEM_PAGE = 60;

  function loadItems() {
    if (SP.items) return Promise.resolve(SP.items);
    return getJSON('/data/items.json').then(function (data) {
      SP.items = data && Array.isArray(data.items) ? data : { items: [], groups: [] };
      return SP.items;
    });
  }

  var ICONS = {
    Weapons: '\uD83D\uDD2B', Ammo: '\uD83E\uDE83', Building: '\uD83E\uDDF1', 'Clothing & armour': '\uD83E\uDDBA',
    Components: '\u2699\uFE0F', 'Decor & fun': '\uD83C\uDF88', Deployables: '\uD83D\uDCE6', 'Doors & locks': '\uD83D\uDEAA',
    Electrical: '\u26A1', Explosives: '\uD83D\uDCA5', 'Food & water': '\uD83E\uDD69', Medical: '\uD83E\uDE79',
    Other: '\uD83D\uDCCC', Resources: '\uD83E\uDEA8', Tools: '\uD83D\uDD28'
  };

  function glyph(it) {
    if (!it) return '\uD83D\uDCE6';
    var g = String(it.group || '');
    if (ICONS[g]) return ICONS[g];
    if (g.indexOf('Door') === 0) return ICONS['Doors & locks'];
    if (g.indexOf('Clothing') === 0) return ICONS['Clothing & armour'];
    if (g.indexOf('Food') === 0) return ICONS['Food & water'];
    if (g.indexOf('Decor') === 0) return ICONS['Decor & fun'];
    return '\uD83D\uDCE6';
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

    var group = 'All', term = '', order = 'name', shown = ITEM_PAGE;

    loadItems().then(function (data) {
      var items = data.items || [];
      var groups = data.groups || [];
      if (status) status.textContent = fmt(items.length) + ' items in the catalogue' + (data.generated ? ' (compiled ' + data.generated + ')' : '') + '.';
      if (chips) {
        chips.innerHTML = '';
        var counts = {};
        items.forEach(function (it) { counts[it.group] = (counts[it.group] || 0) + 1; });
        ['All'].concat(groups).forEach(function (g) {
          var label = g === 'All' ? 'All ' + fmt(items.length) : g + ' ' + fmt(counts[g] || 0);
          var b = make('button', 'sp-chip' + (g === 'All' ? ' is-on' : ''), esc(label));
          b.type = 'button';
          b.addEventListener('click', function () {
            group = g; shown = ITEM_PAGE;
            qa('.sp-chip', chips).forEach(function (x) { x.classList.toggle('is-on', x === b); });
            paint();
          });
          chips.appendChild(b);
        });
      }
      if (input) input.addEventListener('input', function () { term = input.value.trim().toLowerCase(); shown = ITEM_PAGE; paint(); });
      if (sort) sort.addEventListener('change', function () { order = sort.value; paint(); });

      var moreBtn = make('button', 'btn sm ghost');
      moreBtn.type = 'button';
      moreBtn.style.marginTop = '18px';
      moreBtn.style.display = 'none';
      moreBtn.textContent = 'Show all items';
      moreBtn.addEventListener('click', function () { shown = 1e6; paint(); });
      if (status && status.parentNode) status.parentNode.insertBefore(moreBtn, status.nextSibling);

      function card(it) {
        var b = make('button', 'sp-skin');
        b.type = 'button';
        b.innerHTML =
          '<div class="sp-thumb"><span class="sp-ph">' + esc(glyph(it)) + '</span></div>' +
          '<div class="sp-meta"><b>' + esc(it.name) + '</b><small>' + esc(it.group || 'Item') + (it.stack ? ' &middot; stack ' + esc(it.stack) : '') + '</small></div>';
        /* The icon has to be in the document before the browser will fetch it, and the
           category glyph stays behind it until the real art arrives. */
        var thumb = q('.sp-thumb', b);
        var img = new Image();
        img.alt = it.name || '';
        img.src = iconUrl(it.short);
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:10px';
        img.addEventListener('load', function () {
          var ph = q('.sp-ph', thumb);
          if (ph && ph.parentNode) thumb.removeChild(ph);
        });
        img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); });
        thumb.style.position = 'relative';
        thumb.appendChild(img);
        b.addEventListener('click', function () {
          var box = SP.sheet(it.name, rows([
            ['Display name', it.name], ['Short name', it.short], ['Group', it.group],
            ['Stack size', it.stack ? it.stack : 'not documented'],
            ['Item id', it.id != null ? it.id : 'not documented'],
            ['Source', it.src === 'db' ? 'public RUST item database' : it.src === 'core' ? 'added by Spinback - verify on your server' : it.src]
          ]) + '<img src="' + esc(iconUrl(it.short)) + '" alt="" style="width:120px;display:block;margin:16px auto 0">');
          if (it.short) box.appendChild(copyButton('Copy short name', it.short));
        });
        return b;
      }

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
        grid.innerHTML = '';
        if (!list.length) {
          grid.appendChild(make('div', 'sp-empty', 'Nothing matched that search. Try a shorter word, or pick another group.'));
          if (status) status.textContent = 'No matches';
          moreBtn.style.display = 'none';
          return;
        }
        list.slice(0, shown).forEach(function (it) { grid.appendChild(card(it)); });
        if (status) status.textContent = fmt(list.length) + ' item' + (list.length === 1 ? '' : 's') + ' match' + (shown < list.length ? ' - showing the first ' + shown : '');
        moreBtn.style.display = shown < list.length ? '' : 'none';
      }

      paint();
    }).catch(function (err) {
      grid.innerHTML = '';
      grid.appendChild(make('div', 'sp-empty', 'The item catalogue could not be loaded (' + esc(err.message) + '). It lives at /data/items.json.'));
    });
  }

  /* ------------------------------------------------------------ skin store -- */

  function galleryHtml(images) {
    if (!images || !images.length) return '';
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:16px">';
    images.slice(0, 8).forEach(function (u) {
      html += '<img src="' + esc(u) + '" alt="" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)">';
    });
    return html + '</div>';
  }

  function contentsHtml(contents) {
    if (!contents || !contents.length) return '';
    var html = '<h4 style="margin:18px 0 8px;font-size:.95rem">Inside this pack</h4><div style="display:grid;gap:8px">';
    contents.forEach(function (c) {
      html += '<div style="display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px">' +
        (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy" style="width:44px;height:44px;object-fit:cover;border-radius:8px">' : '<span style="width:44px;height:44px;display:grid;place-items:center;border-radius:8px;background:rgba(255,255,255,.06)">\uD83C\uDFA8</span>') +
        '<span>' + esc(c.name) + '</span></div>';
    });
    return html + '</div>';
  }

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

    var state = { mode: 'products', cat: 'All', term: '', order: 'name', products: [], skins: [] };

    getJSON('/data/skins.json').then(function (data) {
      state.products = (data && Array.isArray(data.products) ? data.products : []).filter(function (p) { return p && p.name; });
      state.skins = (data && Array.isArray(data.skins) ? data.skins : []).filter(function (s) { return s && s.name; });
      if (!state.products.length && !state.skins.length) {
        emptyWall(data);
        return;
      }
      if (!state.products.length) state.mode = 'skins';

      var tabBar = make('div', 'sp-chips');
      tabBar.style.marginBottom = '12px';
      var tabWrap = q('#spSkinTabs', host);
      if (tabWrap) tabWrap.appendChild(tabBar); else host.insertBefore(tabBar, host.firstChild);

      var tabs = [];
      if (state.products.length) tabs.push(['products', 'Store products (' + state.products.length + ')']);
      if (state.skins.length) tabs.push(['skins', 'Every individual skin (' + state.skins.length + ')']);
      tabs.forEach(function (pair) {
        var b = make('button', 'sp-chip' + (state.mode === pair[0] ? ' is-on' : ''), esc(pair[1]));
        b.type = 'button';
        b.addEventListener('click', function () {
          state.mode = pair[0];
          state.cat = 'All';
          qa('.sp-chip', tabBar).forEach(function (x) { x.classList.toggle('is-on', x === b); });
          buildCats();
          paint();
        });
        tabBar.appendChild(b);
      });

      if (input) input.addEventListener('input', function () { state.term = input.value.trim().toLowerCase(); paint(); });
      if (sort) sort.addEventListener('change', function () { state.order = sort.value; paint(); });

      buildCats();
      paint();

      function current() { return state.mode === 'products' ? state.products : state.skins; }

      function buildCats() {
        if (!cats) return;
        var list = current();
        var groups = [];
        list.forEach(function (x) { if (x.category && groups.indexOf(x.category) < 0) groups.push(x.category); });
        groups.sort();
        cats.innerHTML = '';
        ['All'].concat(groups).forEach(function (g) {
          var n = g === 'All' ? list.length : list.filter(function (x) { return x.category === g; }).length;
          var b = make('button', 'sp-chip' + (state.cat === g ? ' is-on' : ''), esc(g) + ' <span style="opacity:.6">' + n + '</span>');
          b.type = 'button';
          b.addEventListener('click', function () {
            state.cat = g;
            qa('.sp-chip', cats).forEach(function (x) { x.classList.toggle('is-on', x === b); });
            paint();
          });
          cats.appendChild(b);
        });
      }

      function paint() {
        var list = current().filter(function (x) {
          if (state.cat !== 'All' && x.category !== state.cat) return false;
          if (!state.term) return true;
          var hay = [x.name, x.category, x.item, x.rarity, x.pack, x.description, x.id].join(' ').toLowerCase();
          return hay.indexOf(state.term) > -1;
        });
        list.sort(function (a, b) {
          if (state.order === 'category') return String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name));
          if (state.order === 'pack') return String(a.pack || a.name).localeCompare(String(b.pack || b.name)) || String(a.name).localeCompare(String(b.name));
          return String(a.name).localeCompare(String(b.name));
        });
        grid.innerHTML = '';
        if (!list.length) {
          grid.appendChild(make('div', 'sp-empty', 'Nothing matched. Clear the search or pick another category.'));
          if (status) status.textContent = 'No matches';
          return;
        }
        list.forEach(function (x) {
          var isProduct = state.mode === 'products';
          var card = make('button', 'sp-skin');
          card.type = 'button';
          var badge = isProduct && x.type === 'pack' && x.contents && x.contents.length
            ? '<span class="sp-rarity">' + x.contents.length + ' items</span>'
            : (x.category ? '<span class="sp-rarity">' + esc(String(x.category).split(' ')[0]) + '</span>' : '');
          var thumb = x.image ? '<img src="' + esc(x.image) + '" alt="' + esc(x.name) + '" loading="lazy">' : '<span class="sp-ph">\uD83C\uDFA8</span>';
          var sub = isProduct ? (x.category || '') + (x.type === 'pack' ? ' &middot; pack' : '') : esc(x.pack || '');
          card.innerHTML = badge + '<div class="sp-thumb">' + thumb + '</div>' +
            '<div class="sp-meta"><b>' + esc(x.name) + '</b><small>' + sub + '</small></div>';

          card.addEventListener('click', function () {
            var body;
            if (isProduct) {
              var storeLinks = [];
              if (x.stores && x.stores.playstation) storeLinks.push('PlayStation Store');
              if (x.stores && x.stores.xbox) storeLinks.push('Xbox Store');
              body = (x.description ? '<p style="margin:0 0 14px;line-height:1.65;opacity:.9">' + esc(x.description) + '</p>' : '') +
                rows([['Category', x.category], ['Type', x.type === 'pack' ? 'pack of ' + (x.contents || []).length : 'single skin'], ['Catalog id', x.id], ['Listed on', storeLinks.join(' and ') || 'the Rust Console store']]) +
                (x.image ? '<img src="' + esc(x.image) + '" alt="" style="width:100%;border-radius:14px;margin-top:16px">' : '') +
                contentsHtml(x.contents) + galleryHtml(x.gallery);
            } else {
              body = rows([['Category', x.category], ['In the pack', x.pack], ['Catalog id', x.id], ['Rarity', x.rarity ? x.rarity : 'not published']]) +
                (x.image ? '<img src="' + esc(x.image) + '" alt="" style="width:100%;border-radius:14px;margin-top:16px">' : '');
            }
            var box = SP.sheet(x.name, body);
            if (x.link) {
              var a = make('a', 'btn sm', 'Official store page');
              a.href = x.link; a.target = '_blank'; a.rel = 'noopener';
              a.style.cssText = 'margin-top:16px;display:inline-block';
              box.appendChild(a);
            }
          });
          grid.appendChild(card);
        });
        if (status) status.textContent = fmt(list.length) + ' ' + (state.mode === 'products' ? 'store products' : 'individual skins') + ' shown';
      }
    }).catch(function (err) { emptyWall(null, err); });

    function emptyWall(data, err) {
      grid.innerHTML = '';
      var note = err ? 'The catalogue file could not be read (' + err.message + '). ' : '';
      grid.appendChild(make('div', 'sp-empty', esc(note) + 'No catalogue is published yet. The page reads <b>/data/skins.json</b> and needs only <b>name</b> per entry, plus anything else you want shown.' + (data && data.note ? '<br><br>' + esc(data.note) : '')));
      if (status) status.textContent = 'No skins published yet';
    }
  }

  /* ----------------------------------------------------------------- pass -- */

  SP.boot = function () {
    backdrop(); reveal(); counters(); marquee(); totop(); glow(); tilt(); initItems(); initSkins();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', SP.boot);
  else SP.boot();
})();