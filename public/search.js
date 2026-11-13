/* ============================================================================
   Site-wide search. One palette for every page, opening on Ctrl/Cmd+K or '/'.

   It searches what the site really has: the pages themselves, the 299-item Kit
   Studio catalogue and every skin and pack in the store, each with its own store
   link. Nothing here is invented - if a search finds nothing, it says so.
   ========================================================================== */
(function () {
  var OPEN_HOTKEY = 'k';
  var index = null;
  var loading = false;
  var results = [];
  var cursor = 0;

  var PAGES = [
    ['Home', '/index.html', 'What Spinback is, and what it does'],
    ['Status', '/status.html', 'Live uptime, checks and how the bot is behaving'],

    ['Kit Studio', '/dashboard/kitbuilder.html', 'Build a kit and read the item catalogue'],
    ['Colour Studio', '/dashboard/colortext.html', 'Rust colour codes and text formatting']
  ];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return Promise.resolve([]);
    loading = true;
    index = PAGES.map(function (row) {
      return { title: row[0], sub: row[2], kind: 'Page', url: row[1], hay: (row[0] + ' ' + row[2]).toLowerCase() };
    });
    var both = [
      fetch('/data/items.json', { cache: 'force-cache' }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('/data/skins.json', { cache: 'force-cache' }).then(function (r) { return r.json(); }).catch(function () { return null; })
    ];
    return Promise.all(both).then(function (parts) {
      /* items.json is an object carrying its own note, with the catalogue under .items. */
      var items = Array.isArray(parts[0]) ? parts[0] : (parts[0] && Array.isArray(parts[0].items) ? parts[0].items : []);
      if (Array.isArray(items)) {
        items.forEach(function (item) {
          if (!item || !item.name) return;
          var sub = [item.short, item.group, item.stack ? 'stack ' + item.stack : ''].filter(Boolean).join(' \u00b7 ');
          index.push({ title: item.name, sub: sub, kind: 'Item', url: '/dashboard/kitbuilder.html', hay: (item.name + ' ' + (item.short || '') + ' ' + (item.group || '')).toLowerCase() });
        });
      }
      var skins = parts[1];
      if (skins) {
        (skins.skins || []).forEach(function (skin) {
          if (!skin || !skin.name) return;
          var sub = [skin.category, skin.released ? 'released ' + skin.released : 'release date not published'].filter(Boolean).join(' \u00b7 ');
          index.push({ title: skin.name, sub: sub, kind: 'Skin', url: skin.link || '/dashboard/kitbuilder.html', hay: (skin.name + ' ' + (skin.category || '') + ' ' + (skin.pack || '')).toLowerCase() });
        });
        (skins.products || []).forEach(function (product) {
          if (!product || !product.name) return;
          var isPack = product.type === 'pack' || (product.contents && product.contents.length);
          var sub = [product.category, product.released ? 'released ' + product.released : 'release date not published'].filter(Boolean).join(' \u00b7 ');
          index.push({ title: product.name, sub: sub, kind: isPack ? 'Pack' : 'Product', url: product.link || '/dashboard/kitbuilder.html', hay: (product.name + ' ' + (product.category || '')).toLowerCase() });
        });
      }
      loading = false;
      return index;
    });
  }

  function find(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      return index.filter(function (row) { return row.kind === 'Page'; }).slice(0, 8);
    }
    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var row = index[i];
      var title = row.title.toLowerCase();
      var score = -1;
      if (title === q) score = 0;
      else if (title.indexOf(q) === 0) score = 1;
      else if (title.indexOf(q) > -1) score = 2;
      else if (row.hay.indexOf(q) > -1) score = 3;
      if (score > -1) scored.push({ row: row, score: score, len: row.title.length });
    }
    scored.sort(function (a, b) { return a.score - b.score || a.len - b.len; });
    return scored.slice(0, 40).map(function (entry) { return entry.row; });
  }

  var veil = el('div', 'qs-veil');
  var panel = el('div', 'qs-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Search this site');
  var top = el('div', 'qs-top');
  var input = el('input');
  input.type = 'search';
  input.placeholder = 'Search pages, items and skins...';
  input.setAttribute('aria-label', 'Search pages, items and skins');
  var esc = el('button', 'qs-esc', 'Esc');
  esc.type = 'button';
  top.appendChild(input);
  top.appendChild(esc);
  var list = el('ul', 'qs-list');
  list.setAttribute('role', 'listbox');
  var foot = el('div', 'qs-foot');
  var count = el('span');
  var hints = el('span');
  hints.appendChild(el('b', null, '\u2191\u2193'));
  hints.appendChild(document.createTextNode(' move \u00b7 '));
  hints.appendChild(el('b', null, 'Enter'));
  hints.appendChild(document.createTextNode(' open \u00b7 '));
  hints.appendChild(el('b', null, 'Esc'));
  hints.appendChild(document.createTextNode(' close'));
  foot.appendChild(count);
  foot.appendChild(hints);
  panel.appendChild(top);
  panel.appendChild(list);
  panel.appendChild(foot);

  function paint() {
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!results.length) {
      var empty = el('li', 'qs-empty');
      empty.appendChild(document.createTextNode(input.value.trim()
        ? 'Nothing here matches \u201c' + input.value.trim() + '\u201d. Items and skins are searched by name, short name and category.'
        : 'Type to search pages, Kit Studio items and store skins.'));
      list.appendChild(empty);
      count.textContent = '';
      return;
    }
    results.forEach(function (row, i) {
      var item = el('li', 'qs-item' + (i === cursor ? ' on' : ''));
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', i === cursor ? 'true' : 'false');
      var head = el('div', 'qs-item-top');
      head.appendChild(el('span', 'qs-title', row.title));
      head.appendChild(el('span', 'qs-kind', row.kind));
      item.appendChild(head);
      if (row.sub) item.appendChild(el('div', 'qs-sub', row.sub));
      item.addEventListener('mousedown', function (event) { event.preventDefault(); go(row); });
      item.addEventListener('mouseenter', function () { cursor = i; highlight(); });
      list.appendChild(item);
    });
    count.textContent = results.length + (results.length === 40 ? '+' : '') + (index ? ' of ' + index.length + ' things on this site' : ' results');
  }

  function highlight() {
    var rows = list.querySelectorAll('.qs-item');
    for (var i = 0; i < rows.length; i++) {
      var on = i === cursor;
      rows[i].className = 'qs-item' + (on ? ' on' : '');
      rows[i].setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function go(row) {
    close();
    if (row.url.charAt(0) === '/') window.location.href = row.url;
    else window.open(row.url, '_blank', 'noopener');
  }

  function run() {
    results = find(input.value);
    cursor = 0;
    paint();
  }

  function open() {
    if (panel.className.indexOf('on') > -1) { input.focus(); return; }
    veil.className = 'qs-veil on';
    panel.className = 'qs-panel on';
    input.value = '';
    results = [];
    cursor = 0;
    paint();
    input.focus();
    load().then(run);
  }

  function close() {
    veil.className = 'qs-veil';
    panel.className = 'qs-panel';
  }

  input.addEventListener('input', run);
  esc.addEventListener('click', close);
  veil.addEventListener('click', close);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); cursor = Math.min(cursor + 1, results.length - 1); highlight(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); cursor = Math.max(cursor - 1, 0); highlight(); }
    else if (event.key === 'Enter' && results[cursor]) { event.preventDefault(); go(results[cursor]); }
    else if (event.key === 'Escape') { close(); }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel.className.indexOf('on') > -1) { close(); return; }
    var typing = event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === OPEN_HOTKEY) { event.preventDefault(); open(); return; }
    if (event.key === '/' && !typing && panel.className.indexOf('on') === -1) { event.preventDefault(); open(); }
  });

  document.body.appendChild(veil);
  document.body.appendChild(panel);

  /* A visible way in, next to the site's own navigation. */
  var links = document.querySelector('.nav-links');
  if (links) {
    var button = el('button', 'qs-btn');
    button.type = 'button';
    button.setAttribute('aria-label', 'Search this site');
    button.appendChild(el('span', null, 'Search'));
    var kbd = el('kbd', null, 'Ctrl K');
    button.appendChild(kbd);
    button.addEventListener('click', open);
    links.insertBefore(button, links.firstChild);
  }

  /* Any button in a page can open the palette by carrying data-open-search. */
  document.addEventListener('click', function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-open-search]') : null;
    if (!trigger) return;
    event.preventDefault();
    open();
  });
})();
