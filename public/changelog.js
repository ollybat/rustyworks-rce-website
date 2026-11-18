/* Changelog page: reads the commit list we baked next to the page. */
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var box = document.getElementById('chList');
  if (!box) return;
  fetch('data/changelog.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    var rows = d.commits || [];
    if (!rows.length) { box.innerHTML = '<p class="cmd-note">No commits came back.</p>'; return; }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      html += '<div class="ch-row"><time>' + esc(c.at) + '</time><div><p class="ch-msg">' + esc(c.msg) + '</p>'
        + '<p class="cmd-note">' + esc(c.who) + ' - <a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.sha) + '</a></p></div></div>';
    }
    box.innerHTML = html;
    var m = document.getElementById('chMeta');
    if (m) m.textContent = 'Rebuilt ' + esc(d.rebuiltAt) + ' from ' + esc(d.repo) + '.';
  }).catch(function (e) { box.innerHTML = '<p class="cmd-note">The list could not be read (' + esc(e) + ').</p>'; });
})();
