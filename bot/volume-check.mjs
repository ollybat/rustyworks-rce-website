/* ==========================================================================
   Spinback RCE - prove the volume, before trusting it with settings.
   --------------------------------------------------------------------------
   Run it on the service, not on a laptop:

     node volume-check.mjs

   It writes only its own probe file (volume-probe.json). It never touches
   settings.json, and it never prints a password, a token or a connection
   string - only whether each one is set. Exit code 0 means the directory is
   mounted and writable; 1 means it is not, and each line says which step fixes
   it. Run it again after a redeploy: if the first-seen time is still there, the
   volume really is keeping data.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import * as store from './store-file.mjs';

const PROBE = 'volume-probe.json';
let failures = 0;
function fail(what, fix) {
  failures += 1;
  console.log('  FAIL  ' + what);
  if (fix) console.log('        fix: ' + fix);
}
function ok(what) { console.log('  ok    ' + what); }

async function main() {
  const d = store.describe();
  console.log('Spinback RCE volume check');
  console.log('  path            ' + d.dir);
  console.log('  chosen by       ' + d.source);
  console.log('  settings file   ' + d.file);
  console.log('  exists          ' + (d.exists ? 'yes' : 'no'));
  console.log('  writable by me  ' + (d.writable ? 'yes' : 'no'));
  console.log('  separate device ' + (d.mounted ? 'yes - this is a real mount' : 'no - this is the container filesystem'));

  if (!d.exists) fail('the directory does not exist yet', 'attach the volume with mount path /app/data, then redeploy');
  if (!d.writable) fail('the directory is not writable by this process', 'Railway mounts volumes as root: set RAILWAY_RUN_UID=0 as a variable on this service, then redeploy');
  if (!d.mounted) fail('it does not look like a mounted volume', 'a folder inside the image is wiped on every deploy: mount a volume at /app/data');
  if (d.exists && d.writable && d.mounted) ok('a mounted, writable directory is in use');

  if (fs.statfsSync) {
    try {
      const s = fs.statfsSync(d.dir);
      const freeMb = Math.round((Number(s.bsize) * Number(s.bavail)) / 1048576);
      const totalMb = Math.round((Number(s.bsize) * Number(s.blocks)) / 1048576);
      console.log('  free space      ' + freeMb + ' MB free of ' + totalMb + ' MB');
      if (freeMb < 8) fail('less than 8 MB free', 'enlarge the volume: settings and history are small, but a full disk fails every save');
    } catch (error) { console.log('  free space      not reported for this path'); }
  } else {
    console.log('  free space      not reported by this Node version');
  }

  const probe = path.join(d.dir, PROBE);
  let firstSeen = null;
  if (fs.existsSync(probe)) {
    try { firstSeen = JSON.parse(fs.readFileSync(probe, 'utf8')).firstSeen || null; } catch (error) { firstSeen = null; }
  }
  try {
    fs.writeFileSync(probe, JSON.stringify({
      firstSeen: firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      note: 'Written by volume-check.mjs. Safe to delete. Never contains settings.',
    }, null, 2) + '\n', { mode: 0o600 });
    const back = JSON.parse(fs.readFileSync(probe, 'utf8'));
    if (back && back.lastSeen) ok('wrote and read back ' + PROBE + ' in ' + d.dir);
    else fail('the probe file did not read back', 'the filesystem is not behaving; try a different mount path');
    if (firstSeen) ok('a probe from an earlier run is still here - first seen ' + firstSeen + ': data is surviving restarts');
    else console.log('        note: first run. Redeploy and run this again: the first-seen time above will prove the volume kept the file.');
  } catch (error) {
    fail('could not write ' + PROBE + ': ' + String((error && error.message) || error), 'check the mount path and RAILWAY_RUN_UID');
  }

  console.log('  website token   ' + (String(process.env.BOT_SETTINGS_TOKEN || '').trim() ? 'set' : 'not set'));
  console.log('  database        ' + (String(process.env.DATABASE_URL || '').trim() ? 'DATABASE_URL is set' : 'DATABASE_URL is not set'));
  console.log('');
  if (failures) {
    console.log(failures + ' problem(s). Until they are fixed, anything the bot saves lives only in memory and is lost on the next deploy.');
    process.exitCode = 1;
  } else {
    console.log('This directory persists. Now wire store-file.mjs into persistSettings() and loadSettings() so the bot uses it - see bot/VOLUME.md.');
  }
}

main().catch(function (error) {
  console.log('volume check stopped: ' + String((error && error.message) || error));
  process.exitCode = 1;
});
