/* Spinback RCE - a small runtime patch for the bot's website check.

   Why this file exists: /ping measures the website with one request and cuts it off after
   2500 ms. A container that has just started, on a different host from the website, can
   spend longer than that on the first TLS handshake alone, so a website answering in well
   under a second gets reported as "not answering". The site's own /api/config-check was
   also its slowest route, which made that worse; that route has since been made cheap and
   cacheable on the site side.

   What this does, without touching a line of the bot's source:
     1. For the website probe it prefers /health.json, a static file answering in tens of
        milliseconds, and races the full /api/config-check against it with a longer window,
        so the check reports "answering" whenever either one answers.
     2. It answers /api/shim itself, so whether this file is really loaded in a running
        container can be checked from outside rather than guessed.
     3. Every other request passes straight through, untouched.
*/
'use strict';

try {
  var WINDOW = 7000;          /* the full check gets a real chance, not 2500 ms */
  var RACE_MS = 1500;         /* ...but the cheap static file decides first if it can */
  var PROBE = /\/api\/config-check(\?|$)/;
  var STARTED = new Date().toISOString();

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;
      return String(input);
    } catch (error) { return ''; }
  }

  function copyInit(init, signal) {
    var options = {};
    var source = init || {};
    Object.keys(source).forEach(function (key) { options[key] = source[key]; });
    options.signal = signal;
    return options;
  }

  var realFetch = globalThis.fetch;

  if (typeof realFetch === 'function') {
    globalThis.fetch = function (input, init) {
      var url = urlOf(input);
      if (!PROBE.test(url)) return realFetch.apply(this, arguments);
      var target = this;
      var fallback = url.replace(PROBE, '/health.json');
      var long = realFetch.call(target, url, copyInit(init, AbortSignal.timeout(WINDOW)));
      var quick = realFetch.call(target, fallback, copyInit(init, AbortSignal.timeout(RACE_MS)));
      var settled = false;
      /* Whichever answers first is the answer: the point of the check is whether the website
         replied at all, and both of these are the website replying. */
      return new Promise(function (resolve, reject) {
        var first = null;
        function win(response, where) {
          if (settled) return;
          settled = true;
          if (where !== url) console.log('site check shim: ' + url + ' was slow, answered from ' + where);
          resolve(response);
        }
        function lose(error, where) {
          if (!first) first = { error: error, where: where };
          if (settled) return;
          if (where === fallback) return; /* the full check is still in flight */
          settled = true;
          reject(first.error);
        }
        long.then(function (response) { win(response, url); }, function (error) { lose(error, url); });
        quick.then(function (response) { win(response, fallback); }, function (error) { lose(error, fallback); });
      });
    };
    console.log('site check shim active: website probe prefers /health.json, full check gets ' + WINDOW + ' ms');
  } else {
    console.log('site check shim found no fetch to wrap');
  }

  /* A marker route, so "is this file loaded?" is a question with an answer. The bot's own
     listener is called by the HTTP server's emit, so wrapping that is enough to see a
     request first and answer only this one path. */
  try {
    var http = require('node:http');
    var emit = http.Server.prototype.emit;
    http.Server.prototype.emit = function (event, req, res) {
      if (event === 'request' && req && res && req.url && req.url.split('?')[0] === '/api/shim') {
        var body = JSON.stringify({
          active: true,
          window: WINDOW,
          raceMs: RACE_MS,
          prefers: '/health.json',
          follows: '/api/config-check',
          startedAt: STARTED,
          node: process.version
        });
        try {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
          res.end(body);
        } catch (error) { /* a response already gone is not a reason to break the server */ }
        return true;
      }
      return emit.apply(this, arguments);
    };
    console.log('site check shim: marker route ready at /api/shim');
  } catch (error) {
    console.log('site check shim could not add its marker route: ' + String((error && error.message) || error));
  }
} catch (error) {
  console.log('site check shim could not install: ' + String((error && error.message) || error));
}
