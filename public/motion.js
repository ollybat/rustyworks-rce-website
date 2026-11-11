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
  if (!reduce) {
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