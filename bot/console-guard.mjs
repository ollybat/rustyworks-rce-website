/* ==========================================================================
   Spinback RCE - the guard between a Discord command and a live RCON console.
   --------------------------------------------------------------------------
   A console line reaches a running Rust server: it can save a config, kick a
   player, or end the session. This module is the only place that decides
   whether a line is allowed to leave, and it is deliberately small enough to
   read in one sitting. It imports nothing and does no I/O.

   Used by /server console. See bot/IN-GAME-CONSOLE.md for the command shape.

     checkLine(line)                 refuse or accept one line, with a reason
     redact(text, secrets)           take credentials out of anything going out
     capOutput(text, max)            truncate a huge RCON reply, honestly
     describeAllowlist()             the sentence the panel shows

   Run the built-in checks with:  node console-guard.mjs --selftest
   ========================================================================== */

/* Allow, not deny: a new console command in the game must not become reachable
   just because nobody remembered to block it. */
export const ALLOWLIST = ['say', 'server.info', 'server.save', 'players', 'banlist', 'server.writecfg'];

/* Refused before the allowlist is even consulted: losing the session, or the
   server, is never what an admin meant to type here. */
export const REFUSED = ['quit', 'exit', 'restart', 'server.stop', 'stop', 'server.shutdown', 'shutdown', 'ownerid'];

export const MAX_LINE = 240;
export const MAX_OUTPUT = 3000;

export function checkLine(line, options) {
  const opts = options || {};
  const maxLine = Number(opts.maxLine) || MAX_LINE;
  if (typeof line !== 'string') return { ok: false, reason: 'the command has to be text' };
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, reason: 'nothing to send' };
  if (/[\r\n]/.test(trimmed)) {
    return { ok: false, reason: 'one line per command: a pasted block must not become several commands' };
  }
  if (trimmed.length > maxLine) {
    return { ok: false, reason: 'longer than ' + maxLine + ' characters (' + trimmed.length + ')' };
  }
  const head = trimmed.split(/\s+/)[0].toLowerCase();
  if (REFUSED.indexOf(head) > -1) {
    return { ok: false, reason: head + ' would end the session or the server, so it is refused here on purpose - use /setup for that' };
  }
  if (ALLOWLIST.indexOf(head) === -1) {
    return { ok: false, reason: head + ' is not on the allowlist. Allowed: ' + ALLOWLIST.join(', ') };
  }
  return { ok: true, line: trimmed };
}

/* Secrets first, then the shapes a password tends to appear in. Anything
   shorter than 6 characters is left alone: replacing the word "the" everywhere
   would be worse than useless. */
export function redact(text, secrets) {
  let out = String(text === undefined || text === null ? '' : text);
  const list = (secrets || []).filter(function (s) { return typeof s === 'string' && s.trim().length >= 6; });
  list.forEach(function (secret) {
    out = out.split(secret).join('<removed>');
  });
  out = out.replace(/(password|passwd|rconpassword|token|secret)\s*[:=]\s*(\S+)/gi, '$1 <removed>');
  out = out.replace(/bearer\s+[A-Za-z0-9._\-]+/gi, 'bearer <removed>');
  return out;
}

export function capOutput(text, max) {
  const limit = Number(max) || MAX_OUTPUT;
  const full = String(text === undefined || text === null ? '' : text);
  if (full.length <= limit) return { text: full, truncated: false, dropped: 0 };
  const dropped = full.length - limit;
  return {
    text: full.slice(0, limit) + '\n[... ' + dropped + ' more characters cut: read the full reply from the server console]',
    truncated: true,
    dropped: dropped,
  };
}

export function describeAllowlist() {
  return 'Allowed console lines: ' + ALLOWLIST.join(', ') + '. Refused outright: ' + REFUSED.join(', ')
    + '. One line per command, ' + MAX_LINE + ' characters at most, replies cut at ' + MAX_OUTPUT + ' characters.';
}

/* --selftest exists so the rules can be checked on the service in one command,
   without a test framework and without touching a live server. */
function selftest() {
  const cases = [
    ['say hello', true], ['server.info', true], ['server.save', true], ['players', true],
    ['banlist', true], ['server.writecfg', true], ['SAY hello', true], ['  players  ', true],
    ['quit', false], ['exit', false], ['restart', false], ['server.stop', false], ['ownerid 1', false],
    ['', false], ['   ', false], ['say hi\nquit', false], ['say hi\r\nsay bye', false],
    ['x'.repeat(500), false], ['fly true', false], ['', false],
  ];
  let failed = 0;
  cases.forEach(function (pair) {
    const got = checkLine(pair[0]).ok;
    if (got !== pair[1]) { failed += 1; console.log('checkLine FAIL for ' + JSON.stringify(pair[0]) + ' - wanted ' + pair[1]); }
  });
  const long = checkLine('say ' + 'a'.repeat(300));
  if (long.ok) { failed += 1; console.log('checkLine FAIL: a 304 character line was accepted'); }
  const masked = redact('password:hunter2 rcon ok', ['hunter2']);
  if (masked.indexOf('hunter2') > -1 || masked.indexOf('<removed>') === -1) { failed += 1; console.log('redact FAIL: ' + masked); }
  if (redact('Bearer abc.def.ghi').indexOf('abc.def.ghi') > -1) { failed += 1; console.log('redact FAIL: bearer token kept'); }
  if (redact('the quick brown fox', []).indexOf('the') === -1) { failed += 1; console.log('redact FAIL: short words must survive'); }
  const small = capOutput('line one', 100);
  if (small.truncated || small.dropped !== 0) { failed += 1; console.log('capOutput FAIL: short output was marked truncated'); }
  const big = capOutput('a'.repeat(4000), 100);
  if (!big.truncated || big.dropped !== 3900 || big.text.indexOf('3900 more characters cut') === -1) {
    failed += 1; console.log('capOutput FAIL: ' + JSON.stringify({ t: big.truncated, d: big.dropped }));
  }
  console.log(failed ? failed + ' check(s) failed' : 'console-guard: all ' + (cases.length + 6) + ' checks passed');
  console.log(describeAllowlist());
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && process.argv[1].indexOf('console-guard') > -1 && process.argv.indexOf('--selftest') > -1) selftest();
