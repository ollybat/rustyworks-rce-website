/* Settings page: the theme, motion, seasonal touches and what this browser stores.
   Nothing here talks to a server, and nothing about a Discord server is configured on
   this site. All of it is local preference only. */
(function () {
  'use strict';

  var KEYS = {
    prefs: 'rw_settings_v1',
    theme: 'spinback-theme',
    kits: 'spinback-kits-v1',
    palettes: 'spinback-colour-palettes-v1'
  };

  function $(id) { return document.getElementById(id); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function clock() { try { return new Date().toLocaleTimeString(); } catch (error) { return "just now"; } }

  function toast(message, kind) {
    var box = $('toasts');
    if (!box) return;
    var node = document.createElement('div');
    node.className = 'set-toast' + (kind ? ' is-' + kind : '');
    node.textContent = message;
    box.appendChild(node);
    window.setTimeout(function () {
      node.style.opacity = '0';
      window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, 4000);
  }

  function readPrefs() {
    try { return JSON.parse(window.localStorage.getItem(KEYS.prefs) || '{}') || {}; } catch (error) { return {}; }
  }
  function writePrefs(next) {
    try { window.localStorage.setItem(KEYS.prefs, JSON.stringify(next)); return true; } catch (error) { return false; }
  }
  function applyPrefs(prefs) {
    var root = document.documentElement;
    var theme = prefs.theme === 'light' ? 'light' : 'dark';
    root.setAttribute("data-theme", theme);
    try { window.localStorage.setItem(KEYS.theme, theme); } catch (error) {}
    root.setAttribute('data-reduce-motion', prefs.reduceMotion ? '1' : '0');
  }
  function syncAppearance() {
    var prefs = readPrefs();
    var theme = prefs.theme === 'light' ? 'light' : 'dark';
    var buttons = document.querySelectorAll('#themeSeg button');
    Array.prototype.forEach.call(buttons, function (button) {
      button.setAttribute('aria-checked', button.getAttribute('data-theme-value') === theme ? 'true' : 'false');
    });
    if ($('setReduceMotion')) $('setReduceMotion').checked = prefs.reduceMotion === true;
    if ($('setSeasonal')) $('setSeasonal').checked = prefs.seasonal !== false;
  }
  function savePrefs(patch, note) {
    var next = readPrefs();
    Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
    var stored = writePrefs(next);
    applyPrefs(next);
    syncAppearance();
    refreshCounts();
    if ($('appearanceNote')) {
      $('appearanceNote').textContent = stored
        ? 'Saved in this browser at ' + clock() + '.'
        : 'This browser refused to save it (private browsing), so the choice lasts only for this visit.';
    }
    if (note) toast(note, "good");
  }

  function countStored(key) {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (error) { return 0; }
  }
  function refreshCounts() {
    var kits = countStored(KEYS.kits);
    var palettes = countStored(KEYS.palettes);
    var prefs = Object.keys(readPrefs()).length;
    if ($('kitsCount')) $('kitsCount').textContent = plural(kits, 'kit', 'kits');
    if ($('palettesCount')) $('palettesCount').textContent = plural(palettes, 'palette', 'palettes');
    if ($('prefCount')) $('prefCount').textContent = plural(prefs, 'choice', 'choices');
  }

  function initAppearance() {
    syncAppearance();
    var buttons = document.querySelectorAll('#themeSeg button');
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        savePrefs({ theme: button.getAttribute('data-theme-value') }, 'Theme set to ' + button.textContent.trim().toLowerCase() + '.');
      });
    });
    if ($('setReduceMotion')) $('setReduceMotion').addEventListener('change', function () {
      var on = $('setReduceMotion').checked;
      savePrefs({ reduceMotion: on }, on ? 'Motion reduced.' : 'Motion restored.');
    });
    if ($('setSeasonal')) $('setSeasonal').addEventListener('change', function () {
      var on = $('setSeasonal').checked;
      savePrefs({ seasonal: on }, on ? 'Seasonal touches on.' : 'Seasonal touches off.');
    });
  }

  function initStorage() {
    function wipe(key, label) {
      return function () {
        if (!window.confirm('Clear ' + label + ' from this browser? This cannot be undone.')) return;
        try { window.localStorage.removeItem(key); } catch (error) {}
        refreshCounts();
        if ($('storageNote')) $('storageNote').textContent = 'Cleared ' + label + ' at ' + clock() + '.';
        toast('Cleared ' + label + '.', 'good');
      };
    }
    var kits = $('clearKits');
    var palettes = $('clearPalettes');
    var prefs = $('clearPrefs');
    if (kits) kits.addEventListener('click', wipe(KEYS.kits, 'saved kits'));
    if (palettes) palettes.addEventListener('click', wipe(KEYS.palettes, 'saved palettes'));
    if (prefs) prefs.addEventListener('click', wipe(KEYS.prefs, 'appearance choices'));
    refreshCounts();
  }

  function init() {
    initAppearance();
    initStorage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
