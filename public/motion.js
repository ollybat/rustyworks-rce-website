(function () {
  'use strict';
  /* Additive motion layer: backdrop, headings, reveals and a progress bar.
     It never changes content, and it stands down completely for reduced motion. */
  var root = document.documentElement;
  var prefers = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reduce = prefers || root.getAttribute('data-reduce-motion') === '1';

  /* --- the big animated backdrop (poster first, animation once it is cached) --- */
  var bg = document.querySelector('.sb-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'sb-bg';
    bg.setAttribute('aria-hidden', 'true');
    if (document.body.firstChild) document.body.insertBefore(bg, document.body.firstChild);
    else document.body.appendChild(bg);
  }
  /* The animation is a 1.3 MB WebP. Phones and slow or data-saving links keep the
     poster instead, so the backdrop costs a visitor nothing on a metered plan. */
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var narrow = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
  var frugal = !!(conn && (conn.saveData || /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '')));
  if (!reduce && !narrow && !frugal) {
    var pre = new Image();
    pre.onload = function () { bg.classList.add('sb-bg-live'); };
    pre.src = '/media/spinback-bg.webp';
  }

  /* --- scroll progress --- */
  var bar = document.querySelector('.sb-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'sb-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }

  /* --- a living headline --- */
  if (!reduce) {
    var hero = document.querySelector('.hero h1, .rw-video-hero h1, main h1');
    if (hero && !hero.classList.contains('sb-shine')) hero.classList.add('sb-shine');
  }

  /* --- reveal blocks as they come into view --- */
  var selector = '.card, .panel-box, .cfg-home-card, .u-strip-space, .cta-inner, .hero-cta, section > .wrap > h2, .u-cols > *';
  var targets = [];
  var found = document.querySelectorAll(selector);
  for (var i = 0; i < found.length; i++) {
    var el = found[i];
    if (el.classList.contains('reveal') || el.classList.contains('sb-in')) continue;
    el.classList.add('sb-in');
    el.style.setProperty('--sb-delay', Math.min(i % 6, 5) * 70 + 'ms');
    targets.push(el);
  }
  function showAll() { for (var j = 0; j < targets.length; j++) targets[j].classList.add('is-in'); }
  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (entries[k].isIntersecting) { entries[k].target.classList.add('is-in'); io.unobserve(entries[k].target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    for (var m = 0; m < targets.length; m++) io.observe(targets[m]);
    /* anything already on screen at load shows immediately */
    window.setTimeout(function () {
      for (var n = 0; n < targets.length; n++) {
        var r = targets[n].getBoundingClientRect();
        if (r.top < window.innerHeight) targets[n].classList.add('is-in');
      }
    }, 120);
  }

  /* --- parallax on the backdrop, and the progress width --- */
  var ticking = false;
  function frame() {
    ticking = false;
    var doc = document.documentElement;
    var max = (doc.scrollHeight - window.innerHeight);
    var y = window.pageYOffset || doc.scrollTop || 0;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    if (!reduce && y < window.innerHeight * 1.4) bg.style.transform = 'translate3d(0,' + (y * 0.12) + 'px,0) scale(1.04)';
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();
})();
/* ==== polish layer ==== */
/* ==========================================================================
   polish.js - the behaviour side of polish.css
   --------------------------------------------------------------------------
   Two small things, both additive and both opt-out:
     1. the card under the pointer leans its light towards the cursor;
     2. numbers that a page fills in from a live API count up to their value.
   It never writes text that the page did not already put there, it leaves every
   number alone when motion is reduced, and it does nothing on touch screens.
   Written with string concatenation on purpose: this file travels through a
   transport that mangles backticks.
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var mq = window.matchMedia ? function (q) { return window.matchMedia(q); } : null;
  var fine = mq ? mq('(hover: hover) and (pointer: fine)').matches : false;
  var reduce = mq ? mq('(prefers-reduced-motion: reduce)').matches : false;
  if (root.getAttribute('data-reduce-motion') === '1') reduce = true;

  var CARDS = '.sp-card, .st-card, .sv-tile, .panel-box, .cmd-stat, .botcard, .st-kpi';

  /* --- 1. the light leans towards the pointer ------------------------------ */
  if (fine && !reduce) {
    var frame = 0;
    var at = null;

    var paint = function () {
      frame = 0;
      if (!at) return;
      var lit = document.querySelectorAll(CARDS + '.pl-tilt');
      for (var i = 0; i < lit.length; i++) {
        var box = lit[i].getBoundingClientRect();
        if (at.x < box.left - 30 || at.x > box.right + 30 || at.y < box.top - 30 || at.y > box.bottom + 30) {
          lit[i].classList.remove('pl-tilt');
          continue;
        }
        var px = (at.x - box.left) / (box.width || 1) - 0.5;
        var py = (at.y - box.top) / (box.height || 1) - 0.5;
        lit[i].style.setProperty('--pl-ry', (px * 5).toFixed(2));
        lit[i].style.setProperty('--pl-rx', (-py * 5).toFixed(2));
      }
    };

    var mark = function (card) {
      if (!card) return;
      var box = card.getBoundingClientRect();
      var small = box.width < 120 || box.height < 70;
      if (small) return;
      card.classList.add('pl-tilt');
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    document.addEventListener('pointermove', function (event) {
      var node = event.target;
      var card = node && node.closest ? node.closest(CARDS) : null;
      at = { x: event.clientX, y: event.clientY };
      mark(card);
      if (!frame) frame = window.requestAnimationFrame(paint);
    }, { passive: true });

    document.addEventListener('pointerleave', function () {
      var lit = document.querySelectorAll('.pl-tilt');
      for (var i = 0; i < lit.length; i++) lit[i].classList.remove('pl-tilt');
    });
  }

  /* --- 2. live numbers count up to their value ---------------------------- */
  var NUMERIC = /^[0-9]+$/;
  var runs = new WeakMap();
  var shown = new WeakMap();

  var countUp = function (node, from, to) {
    var previous = runs.get(node);
    if (previous) window.cancelAnimationFrame(previous);
    var span = to - from;
    if (span === 0) { node.textContent = String(to); shown.set(node, to); return; }
    var steps = Math.min(26, Math.max(8, Math.abs(span)));
    var started = 0;
    var step = function (now) {
      if (!started) started = now;
      var done = Math.min(1, (now - started) / (260 + Math.abs(span) * 14));
      var eased = 1 - Math.pow(1 - done, 3);
      var value = Math.round(from + span * eased);
      node.textContent = String(value);
      if (done < 1) {
        runs.set(node, window.requestAnimationFrame(step));
      } else {
        node.textContent = String(to);
        shown.set(node, to);
        runs.delete(node);
      }
    };
    runs.set(node, window.requestAnimationFrame(step));
  };

  var consider = function (node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || el.nodeType !== 1 || !el.firstChild || el.firstChild !== el.lastChild) return;
    var text = (el.textContent || '').trim();
    if (!NUMERIC.test(text)) return;
    var to = parseInt(text, 10);
    var had = shown.has(el);
    var from = had ? shown.get(el) : 0;
    shown.set(el, to);
    if (!reduce && (had || to > 0)) countUp(el, from, to);
  };

  var start = function () {
    if (!document.body) return;
    consider(document.body);
    if (!('MutationObserver' in window)) return;
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === 'characterData') { consider(record.target); continue; }
        for (var j = 0; j < record.addedNodes.length; j++) consider(record.addedNodes[j]);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
