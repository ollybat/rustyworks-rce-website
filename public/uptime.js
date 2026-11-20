/* Uptime page: reads the bot's history endpoint and draws it. Nothing is cached or filled in. */
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var when = function (ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); } };
  var hour = function (ts) { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(ts); } };
  var tile = function (label, value) { return '<div class="up-tile"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'; };
  var said = function (n) { return (n == null ? 'not reported' : n); };
  fetch('/api/history', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    var tot = document.getElementById('upTotals'), box = document.getElementById('upBuckets'), meta = document.getElementById('upMeta');
    if (!tot || !box) return;
    if (!d || d.available !== true) { tot.innerHTML = '<p class="cmd-note">The history endpoint answered that it has nothing to show yet.</p>'; if (meta) meta.textContent = ''; return; }
    var t = d.totals || {};
    tot.innerHTML = tile('Uptime', said(t.uptimePct) === 'not reported' ? 'not reported' : t.uptimePct + '%')
      + tile('Checks', said(t.checks))
      + tile('Failures', said(t.failures))
      + tile('Average', said(t.avgMs) === 'not reported' ? 'not reported' : t.avgMs + ' ms')
      + tile('95th percentile', said(t.p95Ms) === 'not reported' ? 'not reported' : t.p95Ms + ' ms')
      + tile('Worst', said(t.maxMs) === 'not reported' ? 'not reported' : t.maxMs + ' ms');
    var buckets = d.buckets || [], most = 0, i;
    for (i = 0; i < buckets.length; i++) most = Math.max(most, buckets[i].checks || 0);
    var html = '';
    for (i = buckets.length - 1; i >= 0; i--) {
      var b = buckets[i], pct = most ? Math.round(((b.checks || 0) / most) * 100) : 0;
      var guilds = (b.guilds == null ? 'not reported' : b.guilds + (b.guilds === 1 ? ' guild' : ' guilds'));
      var times = b.checks ? ((b.avgMs == null ? 'average not reported' : b.avgMs + ' ms average') + (b.maxMs == null ? '' : ', worst ' + b.maxMs + ' ms')) : 'no checks in this hour';
      html += '<div class="up-row"><span>' + esc(hour(b.at)) + '</span><span><span class="up-bar"><i style="width:' + pct + '%"></i></span> <small>' + esc(times) + '</small></span><em>' + esc(guilds) + '</em></div>';
    }
    var lo = null, hi = null, k;
    for (k = 0; k < buckets.length; k++) { var v = buckets[k].avgMs; if (v == null) continue; lo = (lo == null || v < lo) ? v : lo; hi = (hi == null || v > hi) ? v : hi; }
    var chart = '';
    if (lo != null) {
      var Wc = 760, Hc = 150, stepX = Wc / Math.max(1, buckets.length - 1), d = '', started = false;
      for (k = 0; k < buckets.length; k++) {
        var vv = buckets[k].avgMs;
        if (vv == null) { started = false; continue; }
        var x = (k * stepX).toFixed(1), y = (Hc - ((vv - lo) / Math.max(1, hi - lo)) * (Hc - 14) - 7).toFixed(1);
        d += (started ? ' L' : ' M') + x + ' ' + y;
        started = true;
      }
      var pts = 0, k2;
      for (k2 = 0; k2 < buckets.length; k2++) if (buckets[k2].avgMs != null) pts++;
      chart = '<figure class="up-chart"><svg viewBox="0 0 ' + Wc + ' ' + Hc + '" preserveAspectRatio="none" role="img" aria-label="Average response time each hour">'
        + '<path d="' + d + '" fill="none" stroke="#8fd0ff" stroke-width="2.5" stroke-linejoin="round"/>' + (pts === 1 ? '<circle cx="0" cy="0" r="0" fill="none"/>' : '') + '</svg>'
        + '<figcaption class="cmd-note">Average response time each hour: lowest ' + lo + ' ms, highest ' + hi + ' ms. ' + (lo === hi ? 'Only one hour in this window has a measurement, so there is a single point and no line.' : 'Hours nobody measured are left as gaps - the line stops and starts again rather than being drawn through them.') + '</figcaption></figure>';
    }
    box.innerHTML = chart + '<h3 class="cmd-goals__title">Every hour, newest first</h3>' + (html || '<p class="cmd-note">No buckets came back.</p>');
    if (meta) meta.textContent = 'Window: the last ' + (d.hours == null ? 'unknown number of' : d.hours) + ' hours. Monitoring since ' + when(d.monitoringSince) + '. Read at ' + when(d.generatedAt) + '.';
  }).catch(function () {
    var tot = document.getElementById('upTotals');
    if (tot) tot.innerHTML = '<p class="cmd-note">There is no history to read here. The bot's history endpoint answers on the main site; this copy of the pages has no bot behind it.</p>';
    var meta = document.getElementById('upMeta');
    if (meta) meta.textContent = '';
    var box = document.getElementById('upBuckets');
    if (box) box.innerHTML = '';
  });
})();
