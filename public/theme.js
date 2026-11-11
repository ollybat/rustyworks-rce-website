/* ==========================================================================
   Theme, device mode and "add to home screen"
   --------------------------------------------------------------------------
   Small, dependency-free helpers shared by every page:

   * data-reduce-motion="1" — set from the visitor's motion preference; the
     stylesheet uses it to drop the seasonal animations and transitions.
   * data-lowdevice="1" — set on low-powered hardware; the stylesheet drops
     backdrop blur, shadows and filters.
   * data-app — set when the site is already running as an installed app.
   * RWTheme.install.help() — drives the browser install prompt, or explains
     the exact steps when the browser has no prompt.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var deferredPrompt = null;

  /* ---------- motion preference ---------- */
  var motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function applyMotion() {
    if (!motionQuery) return;
    if (motionQuery.matches) root.setAttribute('data-reduce-motion', '1');
    else root.removeAttribute('data-reduce-motion');
  }
  applyMotion();
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', applyMotion);

  /* ---------- low device mode ---------- */
  /* Cheap heuristic: a couple of slow cores, or very little memory reported.
     Erring on the side of "lean" only costs a few blur effects. */
  (function lowDevice() {
    var cores = navigator.hardwareConcurrency || 4;
    var memory = navigator.deviceMemory || 4;
    var slowNetwork = navigator.connection && /(^|-)2g$/.test(navigator.connection.effectiveType || '');
    if (cores <= 2 || memory <= 2 || slowNetwork) root.setAttribute('data-lowdevice', '1');
  })();

  /* ---------- running as an installed app ---------- */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  if (isStandalone()) root.setAttribute('data-app', '');

  /* ---------- install prompt ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  function steps() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'Tap the Share button, then choose "Add to Home Screen".';
    if (/Android/i.test(ua)) return 'Open the browser menu (⋮), then choose "Install app" or "Add to Home screen".';
    return 'Open your browser menu, then choose "Install app" or "Add to Home screen".';
  }

  window.RWTheme = {
    isStandalone: isStandalone,
    install: {
      /* Returns a promise resolving to true when the browser prompt was used. */
      help: function () {
        if (deferredPrompt) {
          var prompt = deferredPrompt;
          deferredPrompt = null;
          return prompt.prompt().then(function () { return true; });
        }
        if (isStandalone()) window.alert('RustyWorks is already running as an app.');
        else window.alert('Install RustyWorks on this device:\n\n' + steps());
        return Promise.resolve(false);
      }
    }
  };
})();
