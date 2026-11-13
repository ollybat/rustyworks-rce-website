(function () {
  'use strict';
  /* Kit Studio storage that needs no account: the studio's own save/load/manage calls are
     answered from this browser's localStorage instead of the operator's server, which cannot
     be reached from our domain. Same request and response shapes the page already expects. */
  if (window.__spinbackKitStore) return;
  window.__spinbackKitStore = true;
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var KITS = 'spinback-kits-v1';
  var GEN = 'spinback-generated-v1';

  function reply(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json' } });
  }
  function read() {
    try { var raw = localStorage.getItem(KITS); var list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; }
    catch (e) { return []; }
  }
  function write(list) { try { localStorage.setItem(KITS, JSON.stringify(list)); } catch (e) {} }
  function bump(key) {
    try { localStorage.setItem(key, String((parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1)); } catch (e) {}
  }
  function count(key) {
    try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function nextId(list) {
    var max = 0;
    list.forEach(function (k) { if (k && k.id > max) max = k.id; });
    return max + 1;
  }

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    /* The page builds its URLs from SPINBACK_API. While that is blank - which it is until
       your own API exists - they arrive as same-origin paths such as /auth/me, so both shapes
       have to reach the handlers below. Anything that is not this site's own address is
       passed straight through to the network. */
    var sameSite = (url.indexOf('/') === 0 && url.indexOf('//') !== 0) || url.indexOf(window.location.origin) === 0;
    if (!sameSite) { return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('offline')); }
    try {
      if (url.indexOf('/auth/me') !== -1) {
        return Promise.resolve(reply({ authenticated: true, user: { id: 'local', username: 'This browser', discriminator: '0000', avatar: null } }));
      }
      var m = url.match(new RegExp('/api/kitbuilder/(kits|stats|generate)(?:/([0-9]+))?'));
      if (m) {
        var what = m[1];
        var id = m[2] ? parseInt(m[2], 10) : null;
        var list = read();
        if (what === 'kits' && method === 'GET') return Promise.resolve(reply({ ok: true, kits: list }));
        if (what === 'kits' && method === 'POST') {
          var body = {};
          try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
          var name = String(body.kit_name || 'MY_KIT');
          var entry = { id: nextId(list), kit_name: name, created_at: Math.floor(Date.now() / 1000), data: body.kit_data || { wear: [], main: [], belt: [] } };
          var at = -1;
          list.forEach(function (k, i) { if (k && k.kit_name === name) at = i; });
          if (at >= 0) { entry.id = list[at].id; list[at] = entry; } else { list.push(entry); }
          write(list);
          return Promise.resolve(reply({ ok: true, kit: entry }));
        }
        if (what === 'kits' && method === 'DELETE') {
          write(list.filter(function (k) { return k.id !== id; }));
          return Promise.resolve(reply({ ok: true }));
        }
        /* The counters at the top of the page are this browser's own: kits generated here
           and kits saved here. The bot has no counter endpoint, so nothing is fetched. */
        if (what === 'generate' && method === 'POST') { bump(GEN); return Promise.resolve(reply({ ok: true, generated: count(GEN) })); }
        if (what === 'stats') {
          return Promise.resolve(reply({ generated: count(GEN), saved: list.length, localKits: list.length }));
        }
      }
    } catch (e) {}
    return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('offline'));
  };

  /* the page's own hint says you must log in; kits here live in this browser instead */
  function relabel() {
    var nodes = document.querySelectorAll('p, span, small, div');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children.length === 0 && n.textContent && n.textContent.indexOf('to save and load your kits') !== -1) {
        n.textContent = 'Kits are saved in this browser: no account needed.';
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relabel); else relabel();
})();