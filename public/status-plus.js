/* ============================================================================
   Measured uptime on the status page.

   The recorder stores one sample per check and /api/history summarises them, so
   every number here - uptime, checks, failures, latency, and the bars - is a real
   measurement. If the recorder has nothing to show, this says that instead.
   ========================================================================== */
(function () {
  var main = document.querySelector('main');
  if (!main) return;
  var host = document.createElement('div');
  host.className = 'stp-wrap';
  var sections = main.querySelectorAll('section');
  if (sections.length > 1) main.insertBefore(host, sections[1]);
  else main.appendChild(host);

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function stat(value, label, tone) {
    var box = el('div', 'stp-stat');
    box.appendChild(el('div', 'stp-num ' + (tone || ''), value));
    box.appendChild(el('div', 'stp-label', label));
    return box;
  }

  function since(when) {
    if (!when) return 'unknown';
    var minutes = Math.round((Date.now() - when) / 60000);
    if (minutes < 60) return minutes + ' minute' + (minutes === 1 ? '' : 's');
    var hours = Math.round(minutes / 60);
    if (hours < 48) return hours + ' hour' + (hours === 1 ? '' : 's');
    return Math.round(hours / 24) + ' days';
  }

  function clock(when) {
    return when ? new Date(when).toLocaleTimeString() : 'never';
  }

  var card = el('div', 'stp-card');
  var head = el('div', 'stp-head');
  head.appendChild(el('h2', null, 'Measured by this site'));
  var live = el('span', 'stp-live');
  live.appendChild(el('i'));
  var liveText = el('span', null, 'Reading...');
  live.appendChild(liveText);
  head.appendChild(live);
  card.appendChild(head);
  var body = el('div');
  body.style.display = 'grid';
  body.style.gap = '18px';
  card.appendChild(body);
  host.appendChild(card);

  var timer = null;

  function render(data) {
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!data || data.available === false) {
      body.appendChild(el('p', 'stp-note', 'The recorder has no samples yet, so there is nothing measured to show. This panel fills in as checks complete.'));
      liveText.textContent = 'No samples yet';
      return;
    }
    var totals = data.totals || {};
    var uptime = typeof totals.uptimePct === 'number' ? totals.uptimePct : null;
    var stats = el('div', 'stp-stats');
    stats.appendChild(stat(uptime === null ? 'unknown' : uptime.toFixed(2) + '%', 'Uptime, last ' + (data.hours || 24) + ' hours', uptime === null ? '' : uptime >= 99 ? 'good' : uptime >= 95 ? 'warn' : 'warn'));
    stats.appendChild(stat(String(totals.checks || 0), 'Checks made'));
    stats.appendChild(stat(String(totals.failures || 0), 'Failed checks', (totals.failures || 0) > 0 ? 'warn' : 'good'));
    stats.appendChild(stat(totals.avgMs === null || totals.avgMs === undefined ? '-' : totals.avgMs + ' ms', 'Average answer'));
    stats.appendChild(stat(totals.p95Ms === null || totals.p95Ms === undefined ? '-' : totals.p95Ms + ' ms', 'Slowest 5%'));
    stats.appendChild(stat(totals.maxMs === null || totals.maxMs === undefined ? '-' : totals.maxMs + ' ms', 'Slowest single'));
    body.appendChild(stats);

    var buckets = (data.buckets || []).filter(function (b) { return b && b.at; });
    var withChecks = buckets.filter(function (b) { return (b.checks || 0) > 0; });
    var peak = withChecks.reduce(function (top, b) { return Math.max(top, b.avgMs || 0); }, 1);
    var chart = el('div', 'stp-chart');
    buckets.forEach(function (bucket) {
      var bar = el('div', 'stp-bar');
      bar.title = new Date(bucket.at).toLocaleString() + ' - ' + (bucket.checks || 0) + ' checks, ' + (bucket.failures || 0) + ' failed, ' + (bucket.avgMs === null || bucket.avgMs === undefined ? 'no timing' : bucket.avgMs + ' ms average');
      if (!(bucket.checks > 0)) bar.className += ' none';
      else {
        if (bucket.failures > 0) bar.className += ' odd';
        bar.style.height = Math.max(8, Math.round(((bucket.avgMs || 0) / peak) * 88)) + '%';
      }
      chart.appendChild(bar);
    });
    body.appendChild(chart);
    var axis = el('div', 'stp-axis');
    axis.appendChild(el('span', null, buckets.length ? new Date(buckets[0].at).toLocaleString() : ''));
    axis.appendChild(el('span', null, 'Bar height = average answer time. Amber = a failed check in that hour.'));
    axis.appendChild(el('span', null, buckets.length ? new Date(buckets[buckets.length - 1].at).toLocaleTimeString() : ''));
    body.appendChild(axis);

    var note = el('p', 'stp-note', 'Monitoring for ' + since(data.monitoringSince) + '. Every sample is one check the site made against the bot\u2019s API and what came back; ' + (totals.failures || 0) + ' of ' + (totals.checks || 0) + ' checks did not answer in time.');
    body.appendChild(note);

    var actions = el('div', 'stp-actions');
    var again = el('button', 'btn ghost', 'Read it again');
    again.type = 'button';
    again.addEventListener('click', function () { load(true); });
    actions.appendChild(again);
    var msg = el('span', 'stp-msg');
    actions.appendChild(msg);
    body.appendChild(actions);
    host.dataset.msg = '1';
    host._msg = msg;
    liveText.textContent = 'Read at ' + clock(Date.now()) + ' - refreshes every minute';
  }

  function load(manual) {
    var msg = host._msg;
    if (manual && msg) msg.textContent = 'Reading...';
    fetch('/api/history', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        render(data);
        if (manual && host._msg) host._msg.textContent = 'Read again just now.';
      })
      .catch(function () {
        liveText.textContent = 'Could not read the recorder';
        if (manual && host._msg) host._msg.textContent = 'The recorder did not answer.';
      });
  }

  load(false);
  timer = setInterval(function () { load(false); }, 60000);
  window.addEventListener('beforeunload', function () { if (timer) clearInterval(timer); });
})();
