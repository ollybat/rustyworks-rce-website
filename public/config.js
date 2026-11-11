/* ==========================================================================
   Runtime configuration — shared by index.html and the status, updates, login
   and admin pages.
   ========================================================================== */

/* Base URL of the bot's HTTP API. Every page reads this one value, so if the
   API ever moves, change it here only. */
window.SPINBACK_API = 'https://api.rustyworksrce.xyz';

/* Trim a trailing slash so page code can append '/api/...' safely. */
window.SPINBACK_API = window.SPINBACK_API.replace(/\/+$/, '');

/* What the product is called, in one place. Pages carry the name in their own
   markup (titles and copy are static, which is what search engines want), but
   anything a script prints - summaries, downloads, exported files - reads it
   here, so a rename only has to be made once. */
window.SPINBACK_BRAND = {
  name: 'Spinback RCE',
  short: 'Spinback',
  tagline: 'The free all-in-one Discord bot for Rust Console Edition servers.',
  site: 'https://spinback-j7ao5f.camelai.app'
};

/* The Kit Studio page calls API() and loads this file before its own script, so the helper
   has to exist here as well as in apiHelper.js. */
window.API = window.API || function () {
  return String(window.SPINBACK_API || '').replace(/\/+$/, '');
};
