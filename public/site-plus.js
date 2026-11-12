/* ==========================================================================
   site-plus.js - the behaviour side of the premium layer.
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

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

  /* ISO date helpers - the catalogue stores dates as YYYY-MM-DD. */
  function parts(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function longDate(iso) {
    var p = parts(iso);
    return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '';
  }
  function shortDate(iso) {
    var p = parts(iso);
    return p ? MONTHS_SHORT[p.m - 1] + ' ' + p.y : '';
  }
  function monthKey(iso) {
    var p = parts(iso);
    return p ? p.y + '-' + String(p.m).padStart(2, '0') : '';
  }
  function monthLabel(key) {
    var p = String(key || '').split('-');
    return p.length === 2 ? MONTHS[+p[1] - 1] + ' ' + p[0] : '';
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

  /* ------------------------------------------------------------ marquee -- */

  function marquee() {
    qa('[data-sp-marquee]').forEach(function (box) {
      var track = q('.sp-track', box);
      if (!track || track.getAttribute('data-sp-ready')) return;
      track.setAttribute('data-sp-ready', '1');
      track.innerHTML = track.innerHTML + track.innerHTML;
    });
  }

  /* --------------------------------------------------------- to the top -- */

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

  /* -------------------------------------------------- pointer glow / tilt -- */

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

  /* -------------------------------------------------------- detail sheet -- */

  SP.sheet = function (title, body, onOpen) {
    var old = q('.sp-sheet');
    if (old) old.parentNode.removeChild(old);
    var back = make('div', 'sp-sheet');
    back.setAttribute('role', 'dialog');
    back.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:18px;background:rgba(2,7,12,.72);backdrop-filter:blur(4px)';
    var box = make('div', 'sp-sheet-box');
    box.style.cssText = 'max-width:660px;width:100%;max-height:86vh;overflow:auto;padding:24px;border-radius:20px;border:1px solid var(--sp-line-strong,rgba(255,255,255,.2));background:#0a1219;color:#eef6fb;box-shadow:0 26px 70px rgba(0,0,0,.6)';
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
    if (onOpen) onOpen(box);
    return box;
  };

  function rows(pairs) {
    var html = '<div style="display:grid;gap:8px">';
    pairs.forEach(function (row) {
      if (row[1] == null || row[1] === '' || row[1] === false) return;
      html += '<div style="display:flex;gap:12px;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px"><span style="opacity:.65">' + esc(row[0]) + '</span><span style="text-align:right;word-break:break-word">' + (row[2] ? row[1] : esc(row[1])) + '</span></div>';
    });
    return html + '</div>';
  }

  function buttonLink(label, href) {
    var a = make('a', 'btn sm', esc(label));
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.cssText = 'margin:16px 8px 0 0;display:inline-block';
    return a;
  }

  /* ------------------------------------- collection, kept in this browser -- */

  var OWN_KEY = 'spinback-owned-skins-v1';
  function ownedMap() {
    try { return JSON.parse(window.localStorage.getItem(OWN_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function ownedSave(map) {
    try { window.localStorage.setItem(OWN_KEY, JSON.stringify(map)); } catch (e) { /* private mode */ }
  }

  /* ----------------------------------------------------- item catalogue -- */

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
          if (it.short) {
            var copy = make('button', 'btn sm', 'Copy short name');
            copy.type = 'button';
            copy.style.marginTop = '16px';
            copy.addEventListener('click', function () {
              var done = function () { copy.textContent = 'Copied'; };
              if (navigator.clipboard) navigator.clipboard.writeText(String(it.short)).then(done, done);
              else done();
            });
            box.appendChild(copy);
          }
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

  /* ---------------------------------------------------------- skin store -- */

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
    var kinds = q('#spSkinKinds', host);
    var rail = q('#spSkinTimeline', host);
    var meter = q('#spSkinMeter', host);
    var newsHost = q('#spSkinNews', host);
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 6; i++) grid.appendChild(make('div', 'sp-skel'));

    var state = { mode: 'products', cat: 'All', kind: 'All', term: '', order: 'newest', products: [], skins: [], owned: ownedMap(), counts: {}, news: [] };

    function current() { return state.mode === 'products' ? state.products : state.skins; }
    function dateOf(x) { return x && x.released ? x.released : ''; }

    getJSON('/data/skins.json').then(function (data) {
      state.products = (data && Array.isArray(data.products) ? data.products : []).filter(function (p) { return p && p.name; });
      state.skins = (data && Array.isArray(data.skins) ? data.skins : []).filter(function (s) { return s && s.name; });
      state.counts = (data && data.counts) || {};
      state.news = (data && Array.isArray(data.news) ? data.news : []).filter(function (n) { return n && n.title && n.date; });
      if (!state.products.length && !state.skins.length) { emptyWall(data); return; }
      if (!state.products.length) state.mode = 'skins';

      var tabBar = q('#spSkinTabs', host) || host;
      if (tabBar === host) { var wrap = make('div'); host.insertBefore(wrap, host.firstChild); tabBar = wrap; }
      var tabs = [];
      if (state.products.length) tabs.push(['products', 'Store products (' + state.products.length + ')']);
      if (state.skins.length) tabs.push(['skins', 'Every individual skin (' + state.skins.length + ')']);
      var tabButtons = [];
      tabs.forEach(function (pair) {
        var b = make('button', 'sp-chip' + (state.mode === pair[0] ? ' is-on' : ''), esc(pair[1]));
        b.type = 'button';
        b.addEventListener('click', function () {
          state.mode = pair[0]; state.cat = 'All'; state.kind = 'All';
          tabButtons.forEach(function (x) { x.classList.toggle('is-on', x === b); });
          buildKinds(); buildCats(); paint();
        });
        tabBar.appendChild(b);
        tabButtons.push(b);
      });

      if (input) input.addEventListener('input', function () { state.term = input.value.trim().toLowerCase(); paint(); });
      if (sort) sort.addEventListener('change', function () { state.order = sort.value; paint(); });

      function buildKinds() {
        if (!kinds) return;
        kinds.innerHTML = '';
        var list = current();
        var options = [['All', 'Everything'], ['pack', 'Packs'], ['single', 'Single items'], ['dated', 'Has a release date'], ['undated', 'No published date']];
        options.forEach(function (pair) {
          var n = list.filter(function (x) {
            if (pair[0] === 'pack') return x.type === 'pack';
            if (pair[0] === 'single') return x.type !== 'pack';
            if (pair[0] === 'dated') return !!dateOf(x);
            if (pair[0] === 'undated') return !dateOf(x);
            return true;
          }).length;
          var b = make('button', 'sp-chip' + (state.kind === pair[0] ? ' is-on' : ''), esc(pair[1]) + ' <span style="opacity:.6">' + n + '</span>');
          b.type = 'button';
          b.addEventListener('click', function () {
            state.kind = pair[0];
            qa('.sp-chip', kinds).forEach(function (x) { x.classList.toggle('is-on', x === b); });
            paint();
          });
          kinds.appendChild(b);
        });
      }

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

      /* A dated run down the catalogue: newest store release first, and every
         product the store lists without a date named at the end so the gap is
         visible rather than hidden. */
      function paintTimeline() {
        if (!rail) return;
        var dated = state.products.filter(function (p) { return dateOf(p); }).sort(function (a, b) { return dateOf(b).localeCompare(dateOf(a)); });
        var undated = state.products.filter(function (p) { return !dateOf(p); });
        if (!dated.length && !undated.length) { rail.style.display = 'none'; return; }
        rail.innerHTML = '';
        var byMonth = {}, order = [];
        dated.forEach(function (p) {
          var k = monthKey(dateOf(p));
          if (!byMonth[k]) { byMonth[k] = []; order.push(k); }
          byMonth[k].push(p);
        });
        order.forEach(function (k) {
          var group = make('div', 'sp-tl-month');
          group.appendChild(make('div', 'sp-tl-label', esc(monthLabel(k))));
          var items = make('div', 'sp-tl-items');
          byMonth[k].forEach(function (p) {
            var chip = make('button', 'sp-tl-item');
            chip.type = 'button';
            chip.innerHTML = '<b>' + esc(p.name) + '</b><small>' + esc(longDate(dateOf(p))) + (p.type === 'pack' ? ' &middot; ' + (p.contents || []).length + ' items' : '') + '</small>';
            chip.addEventListener('click', function () { openProduct(p); });
            items.appendChild(chip);
          });
          group.appendChild(items);
          rail.appendChild(group);
        });
        if (undated.length) {
          var group2 = make('div', 'sp-tl-month is-unknown');
          group2.appendChild(make('div', 'sp-tl-label', 'No published date'));
          var items2 = make('div', 'sp-tl-items');
          undated.forEach(function (p) {
            var chip = make('button', 'sp-tl-item');
            chip.type = 'button';
            chip.innerHTML = '<b>' + esc(p.name) + '</b><small>the store lists this without a release date</small>';
            chip.addEventListener('click', function () { openProduct(p); });
            items2.appendChild(chip);
          });
          group2.appendChild(items2);
          rail.appendChild(group2);
        }
      }

      function paintNews() {
        if (!newsHost || !state.news.length) return;
        newsHost.innerHTML = '';
        var head = make('p', 'sp-note', 'Official Rust Console Edition posts, dated on double11.com - the release notes behind the store updates.');
        newsHost.appendChild(head);
        var wrap = make('div', 'sp-chips');
        state.news.forEach(function (n) {
          var a = make('a', 'sp-chip', esc(n.title) + ' <span style="opacity:.6">' + esc(shortDate(n.date)) + '</span>');
          a.href = n.url;
          a.target = '_blank';
          a.rel = 'noopener';
          wrap.appendChild(a);
        });
        newsHost.appendChild(wrap);
      }

      function paintMeter() {
        if (!meter) return;
        var total = current().length;
        var mine = current().filter(function (x) { return state.owned[keyOf(x)]; }).length;
        meter.innerHTML = '<b>' + fmt(mine) + '</b> of ' + fmt(total) + ' marked as yours in this browser' +
          (mine ? ' <button type="button" class="btn sm ghost" id="spOwnReset">Clear</button>' : '');
        var reset = q('#spOwnReset', meter);
        if (reset) reset.addEventListener('click', function () { state.owned = {}; ownedSave(state.owned); paint(); paintMeter(); });
      }

      function keyOf(x) { return state.mode + ':' + (x.id || x.name); }
      SP.openSkinByKey = function (key) {
        var all = state.products.concat(state.skins);
        var hit = all.filter(function (x) { return keyOf(x) === key; })[0];
        if (!hit) return false;
        if (hit.packId && hit.name !== hit.pack) openSkin(hit); else openProduct(hit);
        return true;
      };

      function setHash(kind, key) { try { history.replaceState(null, '', '#' + kind + '=' + encodeURIComponent(key)); } catch (e) { /* file:// */ } }

      function openProduct(p) {
        setHash('product', p.id || p.name);
        var body = (p.description ? '<p style="margin:0 0 14px;line-height:1.65;opacity:.9">' + esc(p.description) + '</p>' : '') +
          rows([
            ['Category', p.category],
            ['Type', p.type === 'pack' ? 'pack of ' + (p.contents || []).length + ' items' : 'single skin'],
            ['Released', p.released ? longDate(p.released) : 'not published by the store'],
            ['Date source', p.releasedFrom ? p.releasedFrom + ' listing' : ''],
            ['Catalog id', p.id]
          ]) +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" style="width:100%;border-radius:14px;margin-top:16px">' : '') +
          contentsHtml(p.contents) + galleryHtml(p.gallery);
        var box = SP.sheet(p.name, body);
        if (p.releasedUrl) box.appendChild(buttonLink('Date source', p.releasedUrl));
        if (p.stores && p.stores.playstation) box.appendChild(buttonLink('PlayStation Store', p.stores.playstation));
        if (p.stores && p.stores.xbox) box.appendChild(buttonLink('Xbox Store', p.stores.xbox));
        if (p.link) box.appendChild(buttonLink('Official store page', p.link));
        box.appendChild(ownButton(state.mode + ':' + (p.id || p.name)));
      }

      function openSkin(s) {
        setHash('skin', s.name);
        var body = rows([
          ['Category', s.category],
          ['Comes from', s.pack],
          ['Released', s.released ? longDate(s.released) + (s.releasedVia ? ' with the ' + s.releasedVia : '') : 'not published by the store'],
          ['Catalog id', s.id]
        ]) + (s.image ? '<img src="' + esc(s.image) + '" alt="" style="width:100%;border-radius:14px;margin-top:16px">' : '');
        var box = SP.sheet(s.name, body);
        if (s.packId) {
          var sib = state.skins.filter(function (x) { return x.packId === s.packId && x.name !== s.name; });
          if (sib.length) {
            var listHtml = '<h4 style="margin:18px 0 8px;font-size:.95rem">Elsewhere in ' + esc(s.pack) + '</h4><div style="display:grid;gap:8px">';
            sib.forEach(function (x) {
              listHtml += '<div style="display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px">' +
                (x.image ? '<img src="' + esc(x.image) + '" alt="" loading="lazy" style="width:40px;height:40px;object-fit:cover;border-radius:8px">' : '<span style="width:40px;height:40px;display:grid;place-items:center;border-radius:8px;background:rgba(255,255,255,.06)">\uD83C\uDFA8</span>') +
                '<span>' + esc(x.name) + '</span></div>';
            });
            box.insertAdjacentHTML('beforeend', listHtml + '</div>');
          }
        }
        if (s.link) box.appendChild(buttonLink('Official store page', s.link));
        box.appendChild(ownButton('skins:' + (s.id || s.name)));
      }

      function ownButton(key) {
        var b = make('button', 'btn sm', state.owned[key] ? 'In your collection - remove' : 'Add to my collection');
        b.type = 'button';
        b.style.marginTop = '16px';
        b.addEventListener('click', function () {
          if (state.owned[key]) delete state.owned[key]; else state.owned[key] = 1;
          ownedSave(state.owned);
          b.textContent = state.owned[key] ? 'In your collection - remove' : 'Add to my collection';
          paintMeter();
        });
        return b;
      }

      function paint() {
        var list = current().filter(function (x) {
          if (state.cat !== 'All' && x.category !== state.cat) return false;
          if (state.kind === 'pack' && x.type !== 'pack') return false;
          if (state.kind === 'single' && x.type === 'pack') return false;
          if (state.kind === 'dated' && !dateOf(x)) return false;
          if (state.kind === 'undated' && dateOf(x)) return false;
          if (!state.term) return true;
          var hay = [x.name, x.category, x.item, x.rarity, x.pack, x.description, x.id, x.released].join(' ').toLowerCase();
          return hay.indexOf(state.term) > -1;
        });
        list.sort(function (a, b) {
          if (state.order === 'newest' || state.order === 'oldest') {
            var da = dateOf(a), db = dateOf(b);
            if (!da && !db) return String(a.name).localeCompare(String(b.name));
            if (!da) return 1;
            if (!db) return -1;
            return state.order === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
          }
          if (state.order === 'category') return String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name));
          if (state.order === 'pack') return String(a.pack || a.name).localeCompare(String(b.pack || b.name)) || String(a.name).localeCompare(String(b.name));
          return String(a.name).localeCompare(String(b.name));
        });
        grid.innerHTML = '';
        if (!list.length) {
          grid.appendChild(make('div', 'sp-empty', 'Nothing matched. Clear the search or pick another filter.'));
          if (status) status.textContent = 'No matches';
          paintMeter();
          return;
        }
        list.forEach(function (x) {
          var isProduct = state.mode === 'products' || !!x.type;
          var card = make('div', 'sp-skin');
          card.setAttribute('role', 'button');
          card.tabIndex = 0;
          var badge = dateOf(x) ? '<span class="sp-rarity">' + esc(shortDate(dateOf(x))) + '</span>'
            : (x.type === 'pack' && x.contents && x.contents.length ? '<span class="sp-rarity">' + x.contents.length + ' items</span>' : '');
          var thumb = x.image ? '<img src="' + esc(x.image) + '" alt="' + esc(x.name) + '" loading="lazy">' : '<span class="sp-ph">\uD83C\uDFA8</span>';
          var sub = (x.type === 'pack' ? (x.contents || []).length + ' items' : '') || esc(x.pack || x.category || '');
          card.innerHTML = badge + '<div class="sp-thumb">' + thumb + '</div>' +
            '<div class="sp-meta"><b>' + esc(x.name) + '</b><small>' + sub + '</small></div>';
          var pull = make('button', 'sp-own' + (state.owned[keyOf(x)] ? ' is-on' : ''), state.owned[keyOf(x)] ? '\u2713' : '+');
          pull.type = 'button';
          pull.title = state.owned[keyOf(x)] ? 'In your collection' : 'Add to my collection';
          pull.setAttribute('aria-label', pull.title);
          pull.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (state.owned[keyOf(x)]) delete state.owned[keyOf(x)]; else state.owned[keyOf(x)] = 1;
            ownedSave(state.owned);
            pull.classList.toggle('is-on', !!state.owned[keyOf(x)]);
            pull.textContent = state.owned[keyOf(x)] ? '\u2713' : '+';
            paintMeter();
          });
          card.appendChild(pull);
          var open = function () { if (x.type || state.mode === 'products') openProduct(x); else openSkin(x); };
          card.addEventListener('click', open);
          card.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
          grid.appendChild(card);
        });
        if (status) status.textContent = fmt(list.length) + ' ' + (state.mode === 'products' ? 'store products' : 'individual skins') + ' shown' + (state.order === 'newest' ? ', newest release first' : '');
        paintMeter();
      }

      SP.openByHash = function () {
        var m = String(window.location.hash || '').match(/^#(product|skin)=(.+)$/);
        if (!m) return false;
        return SP.openSkinByKey((m[1] === 'product' ? 'products:' : 'skins:') + decodeURIComponent(m[2]));
      };
      window.addEventListener('hashchange', function () { SP.openByHash(); });

      buildKinds(); buildCats(); paint(); paintTimeline(); paintNews(); paintMeter();
      SP.openByHash();
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
