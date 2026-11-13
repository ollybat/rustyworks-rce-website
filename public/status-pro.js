/* Checks each of the three pages from the visitor's browser and reports what it actually
   saw: status code and elapsed milliseconds, measured here. No number is estimated. */
(function () {
  var PAGES = [
    ['Main page', '/'],
    ['Status page', '/status.html'],
    ['Kit Studio', '/dashboard/kitbuilder.html']
  ];
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function ms(n) { return n == null ? '\u2014' : n + ' ms'; }

  function build() {
    var host = document.querySelector('#main');
    if (!host || document.querySelector('.spx-panel')) return;
    var panel = el('div', 'spx-panel');
    panel.appendChild(el('h3', null, 'Check every page from your browser'));
    panel.appendChild(el('p', 'spx-sub', 'Three requests, made from this tab, measured with the clock in this browser. Your own connection decides the numbers \u2014 that is the honest way to read them.'));
    var grid = el('div', 'spx-grid');
    var rows = {};
    PAGES.forEach(function (pair) {
      var row = el('div', 'spx-row');
      row.appendChild(el('b', null, pair[0]));
      var time = el('span', 'spx-ms', '\u2026');
      var badge = el('span', 'spx-badge', 'waiting');
      row.appendChild(time);
      row.appendChild(badge);
      grid.appendChild(row);
      rows[pair[0]] = { time: time, badge: badge };
    });
    panel.appendChild(grid);
    var foot = el('div', 'spx-foot');
    var again = el('button', 'spx-btn', 'Check them again');
    again.type = 'button';
    var when = el('span', null, '');
    foot.appendChild(again);
    foot.appendChild(when);
    panel.appendChild(foot);
    var anchor = document.querySelector('#stMonitorPanel') || host.firstChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else host.appendChild(panel);

    function run() {
      again.disabled = true;
      when.textContent = 'Checking\u2026';
      var startedAt = new Date();
      var jobs = PAGES.map(function (pair) {
        var t0 = performance.now();
        return fetch(pair[1] + (pair[1].indexOf('?') > -1 ? '&' : '?') + 'probe=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.text().then(function (body) { return { ok: r.ok, status: r.status, bytes: body.length }; }); })
          .then(function (info) { return { label: pair[0], ms: Math.round(performance.now() - t0), info: info }; })
          .catch(function () { return { label: pair[0], ms: null, info: { ok: false, status: 0, bytes: 0 } }; });
      });
      return Promise.all(jobs).then(function (results) {
        results.forEach(function (r) {
          var row = rows[r.label];
          row.time.textContent = ms(r.ms);
          var good = r.info.ok;
          row.badge.textContent = good ? ('200 \u00b7 ' + r.info.bytes + ' B') : (r.info.status ? String(r.info.status) : 'no answer');
          row.badge.className = 'spx-badge ' + (good ? 'ok' : 'bad');
        });
        var slowest = results.filter(function (r) { return r.ms != null; }).sort(function (a, b) { return b.ms - a.ms; })[0];
        when.textContent = 'Read at ' + startedAt.toLocaleTimeString() +
          (slowest ? ' \u00b7 slowest: ' + slowest.label + ' at ' + slowest.ms + ' ms' : ' \u00b7 nothing answered');
        again.disabled = false;
      });
    }
    again.addEventListener('click', run);
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
