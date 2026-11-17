/* Winter layer - loaded last on every page.
   The site's own seasonal engine (theme.js) reads the calendar and builds the Christmas pieces.
   This file adds what it does not: an ambient sky, a 3D snow globe, cards that lean towards the
   pointer, a scroll progress bar and a back-to-top button. It changes no numbers and no links. */

(function () {
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var el = function (t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

  /* ---------- the ambient sky, behind the page ---------- */
  var sky = el('div'); sky.id = 'wg-sky'; sky.setAttribute('aria-hidden', 'true');
  var aurora = el('i'); aurora.id = 'wg-aurora';
  var stars = el('i'); stars.id = 'wg-stars';
  sky.appendChild(aurora); sky.appendChild(stars);
  document.body.insertBefore(sky, document.body.firstChild);

  /* ---------- a flake beside each section heading ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.sp-section h2, .cmd-goals__title, .sv-section h2, .sp-title'), function (h) {
    if (h.querySelector('.wg-section-flake')) return;
    h.insertBefore(el('span', 'wg-section-flake', '\u2744'), h.firstChild);
  });

  /* ---------- progress bar, a settled header, back to top ---------- */
  var prog = el('div'); prog.id = 'wg-progress'; prog.setAttribute('aria-hidden', 'true');
  document.body.appendChild(prog);
  var head = document.querySelector('header, .sp-header');
  var controls = el('div', 'wg-controls');
  var top = el('button', 'wg-btn', 'Back to top');
  top.id = 'wg-top'; top.type = 'button';
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); });
  controls.appendChild(top);
  document.body.appendChild(controls);
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 40 ? Math.min(100, (y / h) * 100) : 0) + '%';
    if (head) head.classList.toggle('wg-scrolled', y > 10);
    top.classList.toggle('is-on', y > 460);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- cards lean towards the pointer ---------- */
  if (!RM && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('.sp-card, .cmd-card, .sv-tile, .sp-compare'), function (card) {
      var raf = 0, tx = 0, ty = 0;
      function paint() {
        raf = 0;
        card.style.transform = 'perspective(900px) rotateY(' + tx.toFixed(2) + 'deg) rotateX(' + ty.toFixed(2) + 'deg) translateY(-2px)';
      }
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 7;
        ty = (0.5 - (e.clientY - r.top) / r.height) * 7;
        card.classList.add('wg-tilt');
        if (!raf) raf = window.requestAnimationFrame(paint);
      });
      card.addEventListener('pointerleave', function () {
        if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
        card.style.transform = '';
        window.setTimeout(function () { card.classList.remove('wg-tilt'); }, 240);
      });
    });
  }

  /* ---------- the snow globe ---------- */
  if (!RM && window.innerWidth > 900) {
    var host = document.querySelector('.hero, .sp-hero, .rw-video-hero');
    if (host && !host.querySelector('.wg-globe')) {
      var globe = el('div', 'wg-globe'); globe.setAttribute('aria-hidden', 'true');
      var ball = el('div', 'wg-globe__ball');
      var mark = document.createElement('img');
      mark.src = '/media/rustyworks-icon-christmas.svg';
      mark.alt = ''; mark.width = 72; mark.height = 72; mark.loading = 'lazy'; mark.decoding = 'async';
      ball.appendChild(mark);
      var drift = el('div', 'wg-globe__drift');
      for (var i = 0; i < 9; i++) {
        var bit = el('i');
        bit.style.left = (8 + Math.random() * 84) + '%';
        bit.style.animationDuration = (5 + Math.random() * 5).toFixed(1) + 's';
        bit.style.animationDelay = (-Math.random() * 6).toFixed(1) + 's';
        drift.appendChild(bit);
      }
      ball.appendChild(drift);
      globe.appendChild(ball); globe.appendChild(el('div', 'wg-globe__base'));
      host.appendChild(globe);
    }
  }

  /* ---------- a small season chip in the footer ---------- */
  var fine = document.querySelector('.foot-fine, .foot-bottom, .foot-brand');
  if (fine && !document.querySelector('.wg-season')) {
    fine.appendChild(document.createTextNode(' '));
    fine.appendChild(el('span', 'wg-season', '\u2744 Winter'));
  }

  onScroll();
})();

