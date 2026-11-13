/* Status page extras: a check of all three pages measured in this browser, and a plain
   summary of the site's own 24-hour record with a copyable report. Every figure shown is
   read from a real response or measured here with performance.now(). */
(function () {
  var PAGES = [['Main page', '/'], ['Status page', '/status.html'], ['Kit Studio', '/dashboard/kitbuilder.html']];
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function hourLabel(bucket) {
    if (!bucket) return '';
    if (bucket.label) return String(bucket.label);
    if (bucket.hour) return String(bucket.hour);
    if (bucket.at) { try { return new Date(bucket.at).toLocaleTimeString(); } catch (e) { return ''; } }
    if (bucket.from) { try { return new Date(bucket.from).toLocaleTimeString(); } catch (e) { return ''; } }
    return '';
  }

  function build() {
    var host = document.querySelector('#main');
    if (!host || document.querySelector('.spx-panel')) return;
    var panel = el('div', 'spx-panel');
    panel.appendChild(el('h3', null, 'Check every page from your browser'));
    panel.appendChild(el('p', 'spx-sub', 'Three requests, made from this tab and timed with this browser\u2019s clock. Your own connection decides the numbers, which is the honest way to read them.'));
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
    var anchor = document.querySelector('#stMonitorPanel');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else host.insertBefore(panel, host.firstChild);

    function run() {
      again.disabled = true;
      when.textContent = 'Checking\u2026';
      var startedAt = new Date();
      Promise.all(PAGES.map(function (pair) {
        var t0 = performance.now();
        return fetch(pair[1] + (pair[1].indexOf('?') > -1 ? '&' : '?') + 'probe=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.text().then(function (body) { return { ok: r.ok, status: r.status, bytes: body.length }; }); })
          .then(function (info) { return { label: pair[0], ms: Math.round(performance.now() - t0), info: info }; })
          .catch(function () { return { label: pair[0], ms: null, info: { ok: false, status: 0, bytes: 0 } }; });
      })).then(function (results) {
        results.forEach(function (r) {
          var row = rows[r.label];
          row.time.textContent = r.ms == null ? '\u2014' : r.ms + ' ms';
          row.badge.textContent = r.info.ok ? ('200 \u00b7 ' + r.info.bytes + ' B') : (r.info.status ? String(r.info.status) : 'no answer');
          row.badge.className = 'spx-badge ' + (r.info.ok ? 'ok' : 'bad');
        });
        var timed = results.filter(function (r) { return r.ms != null; }).sort(function (a, b) { return b.ms - a.ms; });
        when.textContent = 'Read at ' + startedAt.toLocaleTimeString() + (timed.length ? ' \u00b7 slowest: ' + timed[0].label + ' at ' + timed[0].ms + ' ms' : ' \u00b7 nothing answered');
        again.disabled = false;
      });
    }
    again.addEventListener('click', run);
    run();
  }

  function historySummary() {
    var host = document.querySelector('#main');
    if (!host || document.querySelector('.spx-history')) return;
    var box = el('div', 'spx-panel spx-history');
    box.appendChild(el('h3', null, 'The last 24 hours in one paragraph'));
    var line = el('p', 'spx-sub', 'Reading the site\u2019s own record\u2026');
    box.appendChild(line);
    var foot = el('div', 'spx-foot');
    var copy = el('button', 'spx-btn', 'Copy this report');
    copy.type = 'button';
    var said = el('span', null, '');
    foot.appendChild(copy);
    foot.appendChild(said);
    box.appendChild(foot);
    var first = document.querySelector('.spx-panel');
    if (first && first.parentNode) first.parentNode.insertBefore(box, first.nextSibling);
    else host.appendChild(box);

    var report = '';
    copy.addEventListener('click', function () {
      if (!report) { said.textContent = 'Nothing to copy yet.'; return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(report).then(function () { said.textContent = 'Copied.'; })
          .catch(function () { said.textContent = 'Copying was blocked by the browser.'; });
      } else said.textContent = 'This browser has no clipboard access.';
    });

    fetch('/api/history', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var t = (d && d.totals) || {};
        if (!d || !t.checks) { line.textContent = 'No check window has been recorded yet.'; return; }
        var buckets = (d.buckets || []).filter(function (b) { return b && b.checks; });
        var worst = buckets.slice().sort(function (a, b) { return b.avgMs - a.avgMs; })[0];
        var best = buckets.slice().sort(function (a, b) { return a.avgMs - b.avgMs; })[0];
        var bad = buckets.filter(function (b) { return b.failures; });
        var worstWhere = worst && hourLabel(worst) ? ' at ' + hourLabel(worst) : '';
        var bestWhere = best && hourLabel(best) ? ' at ' + hourLabel(best) : '';
        line.textContent = t.checks + ' checks over ' + (d.hours || 24) + ' hours: ' + t.uptimePct + '% answered, ' +
          t.avgMs + ' ms on average, ' + t.p95Ms + ' ms for the slowest 5%, ' + t.maxMs + ' ms at the very worst. ' +
          (bad.length ? bad.length + ' hour' + (bad.length === 1 ? '' : 's') + ' had a failed check.' : 'No hour had a failed check.') +
          (worst ? ' Slowest hour: ' + worst.avgMs + ' ms' + worstWhere + '; quickest: ' + best.avgMs + ' ms' + bestWhere + '.' : '');
        report = 'Spinback RCE availability report' + '\n' +
          'Window: the last ' + (d.hours || 24) + ' hours, ' + buckets.length + ' recorded hours' + '\n' +
          'Checks: ' + t.checks + '\nUptime: ' + t.uptimePct + '%\nAverage: ' + t.avgMs + ' ms\np95: ' + t.p95Ms + ' ms\nWorst: ' + t.maxMs + ' ms\n' +
          'Failed checks: ' + (t.failures || 0) + '\nHours with a failure: ' + bad.length + '\n' +
          'Monitoring since: ' + (d.monitoringSince ? new Date(d.monitoringSince).toISOString() : 'not recorded') + '\n' +
          'Read from /api/history on ' + location.host + '.';
      })
      .catch(function () { line.textContent = 'Could not read the site\u2019s record just now.'; });
  }

  function start() { build(); historySummary(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
