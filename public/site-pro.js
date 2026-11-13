/* Home page extras, all from real data:
   - an uptime chip reading the same 24-hour history the status page reads
   - a search over the real 299-item Kit Studio catalogue, with the short name to copy
   The chip re-inserts itself if the hero section is re-rendered, and every number shown
   comes from /api/history or /data/items.json. Nothing here invents a figure. */
(function () {
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function skipLink() {
    if (document.querySelector('.sp-pro-skip')) return;
    var link = el('a', 'sp-pro-skip', 'Skip to content');
    link.href = '#main';
    document.body.insertBefore(link, document.body.firstChild);
  }

  function read(tell, dot) {
    fetch('/api/history', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var t = (d && d.totals) || {};
        if (!d || d.available === false || !t.checks) {
          tell.textContent = 'No check window has been recorded yet.';
          dot.className = 'sp-pro-dot bad';
          return;
        }
        tell.textContent = t.uptimePct + '% up over ' + (d.hours || 24) + ' hours \u00b7 ' + t.checks + ' checks \u00b7 ' + t.avgMs + ' ms average';
        dot.className = 'sp-pro-dot' + (t.failures ? ' bad' : '');
      })
      .catch(function () {
        tell.textContent = 'Could not read the history just now.';
        dot.className = 'sp-pro-dot bad';
      });
  }

  function addChip() {
    if (document.querySelector('.sp-pro-strip')) return;
    var main = document.querySelector('#main') || document.body;
    var strip = el('div', 'sp-pro-strip');
    var dot = el('span', 'sp-pro-dot');
    var tell = el('span', 'sp-pro-chip', 'Reading the last 24 hours\u2026');
    var link = el('a', null, 'Status page');
    link.href = '/status.html';
    strip.appendChild(dot);
    strip.appendChild(tell);
    strip.appendChild(link);
    var first = main.querySelector('section');
    if (first && first.parentNode === main) main.insertBefore(strip, first.nextSibling);
    else main.insertBefore(strip, main.firstChild || null);
    read(tell, dot);
  }

  function addSearch() {
    if (document.querySelector('.sp-pro-search')) return;
    var host = document.querySelector('#main') || document.body;
    var box = el('div', 'sp-pro-search');
    box.appendChild(el('h3', null, 'Find any item the Kit Studio knows'));
    box.appendChild(el('p', null, 'Type a name, a group or a short name. Copy the short name straight into Kit Studio.'));
    var field = el('div', 'sp-pro-field');
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'e.g. ak, sheet metal, explosive';
    input.setAttribute('aria-label', 'Search Kit Studio items');
    field.appendChild(input);
    box.appendChild(field);
    var list = el('ul', 'sp-pro-results');
    list.setAttribute('role', 'listbox');
    box.appendChild(list);
    var hint = el('div', 'sp-pro-hint', 'Press / anywhere on the page to jump back here.');
    box.appendChild(hint);
    host.appendChild(box);

    var items = null, shown = [], cursor = 0;
    function load() {
      if (items) return Promise.resolve(items);
      return fetch('/data/items.json', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { items = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []); return items; })
        .catch(function () { items = []; return items; });
    }
    function render() {
      var q = input.value.trim().toLowerCase();
      list.textContent = '';
      if (!items) { list.appendChild(el('li', 'sp-pro-empty', 'Loading the catalogue\u2026')); return; }
      if (!q) { list.appendChild(el('li', 'sp-pro-empty', items.length + ' items are in the catalogue \u2014 start typing.')); return; }
      shown = items.filter(function (it) {
        return (it.name || '').toLowerCase().indexOf(q) > -1 ||
          (it.short || '').toLowerCase().indexOf(q) > -1 ||
          (it.group || '').toLowerCase().indexOf(q) > -1;
      }).slice(0, 8);
      if (!shown.length) { list.appendChild(el('li', 'sp-pro-empty', 'Nothing in the catalogue matches "' + input.value.trim() + '".')); return; }
      cursor = 0;
      shown.forEach(function (it, i) {
        var row = el('li');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        row.appendChild(el('b', null, it.name || 'unnamed'));
        if (it.short) row.appendChild(el('code', null, it.short));
        if (it.group) row.appendChild(el('span', null, it.group));
        if (it.stack) row.appendChild(el('span', null, 'stacks to ' + it.stack));
        row.addEventListener('click', function () { use(it); });
        list.appendChild(row);
      });
    }
    function use(it) {
      if (!it) return;
      var short = it.short || it.name || '';
      var done = function (message) { hint.textContent = message; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(short).then(function () {
          done('Copied "' + short + '" \u2014 paste it into Kit Studio and press Enter.');
        }).catch(function () { done('Short name: ' + short); });
      } else done('Short name: ' + short);
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!shown.length) return;
        cursor = (cursor + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        Array.prototype.forEach.call(list.children, function (row, i) {
          row.setAttribute('aria-selected', i === cursor ? 'true' : 'false');
        });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        use(shown[cursor]);
      }
    });
    load().then(render);
  }

  function slashFocus() {
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var input = document.querySelector('.sp-pro-search input');
      if (!input) return;
      event.preventDefault();
      input.focus();
    });
  }

  function start() {
    skipLink();
    addChip();
    addSearch();
    slashFocus();
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      addChip();
      if (tries > 8 || document.querySelector('.sp-pro-strip')) clearInterval(timer);
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
