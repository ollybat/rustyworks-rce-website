/* Christmas card page: everything is drawn in this tab. No upload, no storage, no request. */
(function () {
  var W = 1280, H = 720;
  var cv = document.getElementById('xgCard');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var nameEl = document.getElementById('xgName');
  var msgEl = document.getElementById('xgMsg');
  var fromEl = document.getElementById('xgFrom');
  var snow = [];
  for (var i = 0; i < 150; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, r: 0.7 + Math.random() * 2.2, s: 0.3 + Math.random() * 1.1, d: Math.random() * 0.6 - 0.3, a: 0.25 + Math.random() * 0.6 });

  function wrap(text, maxWidth, font) {
    ctx.font = font;
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function tree(x, baseY, h) {
    ctx.fillStyle = '#2f7d5b';
    for (var k = 0; k < 3; k++) {
      var w = (h * 0.42) * (1 - k * 0.22), top = baseY - h + k * (h * 0.28);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x - w, top + h * 0.42);
      ctx.lineTo(x + w, top + h * 0.42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(x, baseY - h - 4, 5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#5a3b22';
    ctx.fillRect(x - 5, baseY - 6, 10, 18);
  }

  function draw(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060d1a'); g.addColorStop(.55, '#0b1a2c'); g.addColorStop(1, '#08131f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(W * .78, H * .18, 20, W * .78, H * .18, 520);
    glow.addColorStop(0, 'rgba(255,209,102,.22)'); glow.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(W * .78, H * .18, 34, 0, 6.283); ctx.fill();
    for (var i = 0; i < snow.length; i++) {
      var f = snow[i];
      if (t) { f.y += f.s; f.x += f.d; if (f.y > H) { f.y = -6; f.x = Math.random() * W; } }
      ctx.globalAlpha = f.a; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    tree(150, H - 80, 150);
    tree(1130, H - 60, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 26px Georgia, serif';
    ctx.fillText('Merry Christmas from', 80, 120);
    ctx.font = '700 74px Georgia, serif';
    ctx.fillStyle = '#ffd166';
    var title = wrap(nameEl && nameEl.value ? nameEl.value : 'Spinback RCE', W - 240, '700 74px Georgia, serif').slice(0, 2);
    for (var k = 0; k < title.length; k++) ctx.fillText(title[k], 80, 200 + k * 84);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '400 30px Georgia, serif';
    var body = wrap(msgEl && msgEl.value ? msgEl.value : '', W - 260, '400 30px Georgia, serif').slice(0, 5);
    for (var m = 0; m < body.length; m++) ctx.fillText(body[m], 80, 380 + m * 44);
    ctx.fillStyle = 'rgba(232,244,255,.82)';
    ctx.font = '500 24px Georgia, serif';
    var sig = (fromEl && fromEl.value ? fromEl.value : '').slice(0, 60);
    if (sig) ctx.fillText(sig, 80, H - 110);
    ctx.fillStyle = 'rgba(232,244,255,.45)';
    ctx.font = '400 18px system-ui, sans-serif';
    ctx.fillText('drawn in your own browser - nothing was uploaded', 80, H - 44);
  }

  var raf = 0, still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function loop(t) { draw(t); if (!still) raf = window.requestAnimationFrame(loop); }
  if (still) draw(0); else raf = window.requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }
    else if (!still && !raf) raf = window.requestAnimationFrame(loop);
  });
  [nameEl, msgEl, fromEl].forEach(function (n) { if (n) n.addEventListener('input', function () { if (still) draw(0); }); });

  var save = document.getElementById('xgSave');
  if (save) save.addEventListener('click', function () {
    var a = document.createElement('a');
    a.download = 'christmas-card.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  });
  var swap = document.getElementById('xgExample');
  if (swap) swap.addEventListener('click', function () {
    if (nameEl) nameEl.value = 'EU 5x';
    if (msgEl) msgEl.value = 'Thanks for a year of raids, rebuilds and late-night saves. See you on the server over the break.';
    if (fromEl) fromEl.value = '- the whole clan';
    if (still) draw(0);
  });
})();
